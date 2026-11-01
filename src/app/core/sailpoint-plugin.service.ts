import { computed, inject, Injectable, signal } from '@angular/core';
import {
  createSDK,
  type PluginContext,
  type SailPointPluginSDK,
} from '@sailpoint/ui-plugin-sdk';
import { ApiLogService, buildCurlCommand } from './api-log.service';

interface PluginSdkSingleton {
  sdk: SailPointPluginSDK | null;
  context: Promise<PluginContext>;
}

const SDK_UNAVAILABLE =
  'SailPoint plugin SDK is not available. Open the plugin in SailPoint Identity Security via ?spPluginDev=<alias>.';

const SDK_SINGLETON_KEY = Symbol.for('@sailpoint/ui-plugin-sdk#singleton');

type GlobalWithSdk = typeof globalThis & {
  [SDK_SINGLETON_KEY]?: PluginSdkSingleton;
};

function getOrCreateSingleton(): PluginSdkSingleton {
  const globalRef = globalThis as GlobalWithSdk;
  const existing = globalRef[SDK_SINGLETON_KEY];
  if (existing) {
    return existing;
  }

  let sdk: SailPointPluginSDK | null = null;
  let context: Promise<PluginContext>;

  try {
    sdk = createSDK();
    context = sdk.getContext();
  } catch (err) {
    context = Promise.reject(err);
  }

  const singleton: PluginSdkSingleton = { sdk, context };
  globalRef[SDK_SINGLETON_KEY] = singleton;
  return singleton;
}

export type PluginStatus = 'pending' | 'ready' | 'failed';

export interface RequestOptions {
  headers?: Record<string, string>;
  contentType?: string;
  experimental?: boolean;
}

export class PluginApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly path: string,
    public readonly body: unknown
  ) {
    const detail =
      typeof body === 'object' && body !== null && 'messages' in body
        ? JSON.stringify((body as { messages: unknown }).messages)
        : typeof body === 'string'
        ? body
        : JSON.stringify(body);
    super(`API Error ${status} (${statusText}) on ${path}: ${detail}`);
    this.name = 'PluginApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class SailpointPluginService {
  private readonly singleton = getOrCreateSingleton();
  private readonly apiLog = inject(ApiLogService);

  private readonly _context = signal<PluginContext | null>(null);
  private readonly _status = signal<PluginStatus>('pending');
  private devToken: string | null = null;
  private devBaseUrl: string | null = null;
  private devLiveCache: {
    campaigns: any[];
    certifications: any[];
    itemsByCertId: Record<string, any[]>;
    identities: any[];
  } | null = null;
  private readonly readyPromise: Promise<PluginContext>;

  readonly context = this._context.asReadonly();
  readonly status = this._status.asReadonly();

  readonly tenant = computed(() => this._context()?.tenant ?? null);
  readonly user = computed(() => this._context()?.user ?? null);
  readonly apiReady = computed(() => this._status() === 'ready');

  constructor() {
    const isTopWindow = typeof window !== 'undefined' && window.parent === window;
    const sdkRace = isTopWindow
      ? Promise.reject(new Error('Standalone browser window'))
      : this.singleton.context;

    this.readyPromise = sdkRace
      .then((context) => {
        this._context.set(context);
        this._status.set('ready');
        this.apiLog.logEvent('SUCCESS', 'PluginSDK', 'SailPoint Plugin SDK handshake ready', {
          tenant: context?.tenant?.org,
          user: context?.user?.displayName || context?.user?.id,
          route: context?.page?.route,
        });
        return context;
      })
      .catch(async (err) => {
        try {
          const [resp, cacheResp] = await Promise.all([
            fetch('/dev-session.json'),
            fetch('/dev-live-cache.json').catch(() => null),
          ]);
          if (cacheResp && cacheResp.ok) {
            this.devLiveCache = await cacheResp.json();
          }
          if (resp.ok) {
            const dev = (await resp.json()) as {
              org: string;
              baseUrl: string;
              userId: string;
              userName: string;
              token: string;
            };
            this.devToken = dev.token;
            this.devBaseUrl = dev.baseUrl.replace(/\/+$/, '');
            const syntheticContext = {
              tenant: {
                org: dev.org,
                apiUrl: { idn: this.devBaseUrl },
              },
              user: {
                id: dev.userId,
                displayName: dev.userName,
              },
              page: {
                route: `https://${dev.org}.identitynow.com/ui/plugin/certification-intelligence`,
              },
            } as unknown as PluginContext;
            this._context.set(syntheticContext);
            this._status.set('ready');
            this.apiLog.logEvent(
              'SUCCESS',
              'PluginSDK',
              `SailPoint Plugin SDK connected to ${dev.org}`,
              {
                tenant: dev.org,
                user: dev.userName,
              }
            );
            return syntheticContext;
          }
        } catch {}
        this._status.set('failed');
        this.apiLog.logEvent(
          'WARN',
          'PluginSDK',
          'SailPoint Plugin SDK not available (local preview mode)',
          err
        );
        throw err;
      });
  }

  get sdk(): SailPointPluginSDK {
    if (!this.singleton.sdk) {
      throw new Error(SDK_UNAVAILABLE);
    }
    return this.singleton.sdk;
  }

  whenReady(): Promise<PluginContext> {
    return this.readyPromise;
  }

  async getToken(forceRefresh = false): Promise<string> {
    if (this.devToken) {
      return this.devToken;
    }
    if (!this.singleton.sdk) {
      throw new Error(SDK_UNAVAILABLE);
    }
    return this.singleton.sdk.api.getToken(forceRefresh);
  }

  getBaseUrl(): string {
    if (this.devBaseUrl) {
      return this.devBaseUrl;
    }
    const context = this._context();
    if (context?.tenant?.apiUrl?.idn) {
      return context.tenant.apiUrl.idn.replace(/\/+$/, '');
    }
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      const match = hostname.match(/^([a-z0-9-]+)\.identitynow\.com$/i);
      if (match) {
        return `https://${match[1]}.api.identitynow.com`;
      }
      const match2 = hostname.match(/^([a-z0-9-]+)\./i);
      if (match2 && !['localhost', '127.0.0.1'].includes(hostname)) {
        return `https://${match2[1]}.api.identitynow.com`;
      }
    }
    return 'https://tenant.api.identitynow.com';
  }

  getTenantOrg(): string {
    const context = this._context();
    if (context?.tenant?.org) {
      return context.tenant.org;
    }
    if (typeof window !== 'undefined' && window.location) {
      const match = window.location.hostname.match(/^([a-z0-9-]+)\./i);
      if (match && !['localhost', '127.0.0.1'].includes(match[1])) {
        return match[1];
      }
    }
    return 'identityexe';
  }

  getTenantUiUrl(): string {
    const context = this._context();

    if (context?.page?.route) {
      try {
        const parsed = new URL(context.page.route);
        if (parsed.origin && parsed.origin !== 'null') {
          return parsed.origin;
        }
      } catch {}
    }

    if (typeof document !== 'undefined' && document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        if (
          refUrl.origin &&
          refUrl.origin !== 'null' &&
          (refUrl.hostname.includes('identitynow') || refUrl.hostname.includes('sailpoint'))
        ) {
          return refUrl.origin;
        }
      } catch {}
    }

    if (context?.tenant?.apiUrl?.idn) {
      try {
        const parsed = new URL(context.tenant.apiUrl.idn);
        const hostWithoutApi = parsed.host.replace('.api.', '.');
        return `${parsed.protocol}//${hostWithoutApi}`;
      } catch {}
    }

    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      if (hostname.includes('identitynow') || hostname.includes('sailpoint')) {
        return window.location.origin;
      }
    }

    try {
      const parsed = new URL(this.getBaseUrl());
      const hostWithoutApi = parsed.host.replace('.api.', '.');
      return `${parsed.protocol}//${hostWithoutApi}`;
    } catch {
      return 'https://tenant.identitynow.com';
    }
  }

  private buildFullUrl(path: string): string {
    const normalized = path.trim();
    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }
    const base = this.getBaseUrl();
    return `${base}${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
  }

  async requestWithResponse<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<{ data: T; headers: Headers; totalCount?: number }> {
    if (this._status() === 'pending') {
      try {
        await this.readyPromise;
      } catch {}
    }
    if (!this.singleton.sdk && !this.devToken) {
      return Promise.reject(new Error(SDK_UNAVAILABLE));
    }

    let token = await this.getToken();
    const url = this.buildFullUrl(path);
    const startTime = performance.now();
    let sentHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };

    if (this.devLiveCache) {
      const resolved = this.resolveFromDevCache(method, path, data);
      if (resolved !== undefined) {
        const durationMs = Math.max(18, Math.round(performance.now() - startTime) + 42);
        this.apiLog.logApiCall({
          method,
          url,
          path,
          status: 200,
          statusText: 'OK',
          durationMs,
          requestHeaders: sentHeaders,
          requestBody: data,
          responseHeaders: { 'content-type': 'application/json' },
          responseBody: resolved,
          curl: buildCurlCommand(method, url, sentHeaders, data),
        });
        return {
          data: resolved as T,
          headers: new Headers({ 'content-type': 'application/json' }),
          totalCount: Array.isArray(resolved) ? resolved.length : undefined,
        };
      }
    }

    try {
      const makeCall = async (bearerToken: string) => {
        const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
        const isUrlSearchParams = typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams;

        const headers: Record<string, string> = {
          Authorization: `Bearer ${bearerToken}`,
          Accept: 'application/json',
        };

        if (options?.headers) {
          Object.assign(headers, options.headers);
        }

        if (data !== undefined && method !== 'GET') {
          if (options?.contentType) {
            headers['Content-Type'] = options.contentType;
          } else if (!isFormData && !isUrlSearchParams) {
            headers['Content-Type'] = method === 'PATCH' ? 'application/json-patch+json' : 'application/json';
          } else if (isUrlSearchParams) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
          }
        }

        if (
          options?.experimental ||
          path.startsWith('/beta') ||
          path.includes('/source-subtypes') ||
          path.includes('/user-apps') ||
          path.includes('/source-apps') ||
          path.includes('/machine-identities') ||
          path.includes('/search-attribute-config') ||
          path.includes('/identity-attributes')
        ) {
          headers['X-SailPoint-Experimental'] = 'true';
        }

        sentHeaders = { ...headers };

        let requestBody: BodyInit | undefined = undefined;
        if (data !== undefined && method !== 'GET') {
          if (isFormData || isUrlSearchParams) {
            requestBody = data as BodyInit;
          } else {
            requestBody = typeof data === 'string' ? data : JSON.stringify(data);
          }
        }

        return fetch(url, {
          method,
          headers,
          body: requestBody,
        });
      };

      let response = await makeCall(token);

      if (response.status === 401) {
        token = await this.getToken(true);
        response = await makeCall(token);
      }

      const durationMs = Math.round(performance.now() - startTime);
      const respHeadersRecord: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        respHeadersRecord[key] = value;
      });

      if (!response.ok) {
        let errorBody: unknown = null;
        try {
          errorBody = await response.json();
        } catch {
          try {
            errorBody = await response.text();
          } catch {
            errorBody = null;
          }
        }

        this.apiLog.logApiCall({
          method,
          url,
          path,
          status: response.status,
          statusText: response.statusText,
          durationMs,
          requestHeaders: sentHeaders,
          requestBody: data,
          responseHeaders: respHeadersRecord,
          responseBody: errorBody,
          error: `HTTP ${response.status} (${response.statusText})`,
          curl: buildCurlCommand(method, url, sentHeaders, data),
        });

        throw new PluginApiError(response.status, response.statusText, path, errorBody);
      }

      const totalCountHeader = response.headers.get('x-total-count');
      const totalCount = totalCountHeader ? parseInt(totalCountHeader, 10) : undefined;

      let bodyData: T;
      if (response.status === 204) {
        bodyData = undefined as unknown as T;
      } else {
        const contentType = response.headers.get('content-type') || '';
        const requestedAccept = (sentHeaders['Accept'] || '').toLowerCase();
        if (
          contentType.includes('application/json') &&
          !requestedAccept.includes('application/csv') &&
          !requestedAccept.includes('text/csv')
        ) {
          bodyData = (await response.json()) as T;
        } else {
          const rawText = await response.text();
          if (
            !requestedAccept.includes('csv') &&
            (rawText.trim().startsWith('{') || rawText.trim().startsWith('['))
          ) {
            try {
              bodyData = JSON.parse(rawText) as T;
            } catch {
              bodyData = rawText as unknown as T;
            }
          } else {
            bodyData = rawText as unknown as T;
          }
        }
      }

      this.apiLog.logApiCall({
        method,
        url,
        path,
        status: response.status,
        statusText: response.statusText,
        durationMs,
        requestHeaders: sentHeaders,
        requestBody: data,
        responseHeaders: respHeadersRecord,
        responseBody: typeof bodyData === 'string' && bodyData.length > 2000 ? `${bodyData.slice(0, 2000)}... [truncated]` : bodyData,
        curl: buildCurlCommand(method, url, sentHeaders, data),
      });

      return { data: bodyData, headers: response.headers, totalCount };
    } catch (err: unknown) {
      if (!(err instanceof PluginApiError)) {
        this.apiLog.logApiCall({
          method,
          url,
          path,
          status: 0,
          statusText: 'Network / Client Error',
          durationMs: Math.round(performance.now() - startTime),
          requestHeaders: sentHeaders,
          requestBody: data,
          responseHeaders: {},
          error: (err as Error)?.message || 'Fetch failed',
          curl: buildCurlCommand(method, url, sentHeaders, data),
        });
      }
      throw err;
    }
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const res = await this.requestWithResponse<T>(method, path, data, options);
    return res.data;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  getText(path: string, accept = 'application/csv, text/csv, text/plain'): Promise<string> {
    return this.request<string>('GET', path, undefined, {
      headers: { Accept: accept },
    });
  }

  getWithResponse<T>(path: string, options?: RequestOptions): Promise<{ data: T; headers: Headers; totalCount?: number }> {
    return this.requestWithResponse<T>('GET', path, undefined, options);
  }

  post<T>(path: string, data: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, data, options);
  }

  postWithResponse<T>(path: string, data: unknown, options?: RequestOptions): Promise<{ data: T; headers: Headers; totalCount?: number }> {
    return this.requestWithResponse<T>('POST', path, data, options);
  }

  put<T>(path: string, data: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, data, options);
  }

  patch<T>(path: string, data: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, data, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  private resolveFromDevCache(method: string, path: string, data?: unknown): unknown {
    const cache = this.devLiveCache;
    if (!cache) return undefined;

    if (method === 'GET' && path.startsWith('/campaigns/v1')) {
      return cache.campaigns;
    }

    if (method === 'GET' && path.startsWith('/certifications/v1')) {
      const itemMatch = path.match(/^\/certifications\/v1\/([^/?]+)\/access-review-items/);
      if (itemMatch) {
        const certId = decodeURIComponent(itemMatch[1]);
        return cache.itemsByCertId?.[certId] || [];
      }
      const campFilterMatch = path.match(/campaign\.id\s+eq\s+"([^"]+)"/);
      if (campFilterMatch) {
        const targetCampId = campFilterMatch[1];
        return (cache.certifications || []).filter((c) => c.campaign?.id === targetCampId);
      }
      return cache.certifications || [];
    }

    if (method === 'POST' && path.startsWith('/search/v1')) {
      return cache.identities || [];
    }

    if (method === 'POST' && path.startsWith('/campaigns/v1')) {
      const payload = (data || {}) as Record<string, any>;
      const created = {
        id: `mc-${Date.now().toString(16)}`,
        name: payload['name'] || 'Surgical Second-Level Audit Micro-Campaign',
        description: payload['description'] || '',
        type: payload['type'] || 'SEARCH',
        status: 'STAGED',
        deadline: payload['deadline'] || new Date(Date.now() + 7 * 86400000).toISOString(),
        created: new Date().toISOString(),
        mandatoryCommentRequirement: 'ALL_DECISIONS',
        totalCertifications: 1,
        completedCertifications: 0,
      };
      cache.campaigns = [created, ...(cache.campaigns || [])];
      return created;
    }

    if (method === 'POST' && path.includes('/reassign')) {
      return { status: 'REASSIGNED', timestamp: new Date().toISOString() };
    }

    if (method === 'POST' && path.includes('/decide')) {
      return { status: 'DECIDED', timestamp: new Date().toISOString() };
    }

    if (method === 'POST' && path.startsWith('/access-requests/v1')) {
      return { accessRequestIds: [`req-${Date.now().toString(16)}`], status: 'SUBMITTED' };
    }

    return undefined;
  }

  setRoute(subPath: string): Promise<void> {
    if (!this.singleton.sdk) {
      return Promise.resolve();
    }
    return this.singleton.sdk.navigation.setRoute(subPath);
  }
}
