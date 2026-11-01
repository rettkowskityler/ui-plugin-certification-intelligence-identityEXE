import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ApiLogService,
  CampaignSummaryCard,
  CertificationIntelligenceService,
  CertificationLineItem,
  EscalationPreviewItem,
  MicroCampaignLaunchSpec,
  ReviewerWarRoomRow,
  SailpointPluginService,
  ThemeService,
} from '@core';
import { TooltipModule } from 'primeng/tooltip';

export type WorkspaceTab =
  | 'WAR_ROOM'
  | 'RUBBER_STAMP'
  | 'REVOCATION_ASSURANCE'
  | 'API_TELEMETRY';

@Component({
  selector: 'app-cert-command-center',
  standalone: true,
  imports: [CommonModule, FormsModule, TooltipModule],
  templateUrl: './cert-command-center.component.html',
  styleUrl: './cert-command-center.component.scss',
})
export class CertCommandCenterComponent implements OnInit {
  protected readonly certSvc = inject(CertificationIntelligenceService);
  protected readonly apiLog = inject(ApiLogService);
  protected readonly plugin = inject(SailpointPluginService);
  protected readonly themeService = inject(ThemeService);

  protected readonly activeTab = signal<WorkspaceTab>('WAR_ROOM');

  // Search & Filter states
  protected readonly warRoomSearch = signal<string>('');
  protected readonly warRoomStatusFilter = signal<
    'ALL' | 'STALLED' | 'IN_PROGRESS' | 'COMPLETED'
  >('ALL');

  protected readonly rubberStampSearch = signal<string>('');
  protected readonly rubberStampFilter = signal<
    'ALL' | 'CRITICAL_RUBBER_STAMP' | 'PRIVILEGED_ONLY' | 'HIGH_ASSURANCE'
  >('ALL');
  protected readonly selectedRubberStampCertId = signal<string | null>(null);

  protected readonly revocationSearch = signal<string>('');
  protected readonly revocationStateFilter = signal<
    'ALL' | 'ZOMBIE_REGRANTED' | 'STUCK_PROVISIONING' | 'PENDING_SIGN_OFF' | 'VERIFIED_REMOVED'
  >('ALL');

  // Action Modals & Banners
  protected readonly showEscalationModal = signal<boolean>(false);
  protected readonly escalationReason = signal<string>(
    'Executive SLA Audit Escalation: Reviewer below 25% completion threshold; delegating open certification items to Skip-Level Manager.'
  );
  protected readonly escalationCandidateList = signal<EscalationPreviewItem[]>([]);

  protected readonly showMicroCampaignModal = signal<boolean>(false);
  protected readonly microCampaignName = signal<string>(
    'Q4 Second-Level Privileged Rubber-Stamp Audit'
  );
  protected readonly microCampaignDescription = signal<string>(
    'Targeted second-level verification campaign for privileged access items bulk-approved without review comments during Q4 certifications.'
  );
  protected readonly microCampaignReviewerId = signal<string>(
    '1bd2386cae9546e29f75adb5145022e3'
  );
  protected readonly microCampaignReviewerName = signal<string>(
    'samantha.holstine (Security & Governance Owner)'
  );
  protected readonly microCampaignDeadlineDays = signal<number>(7);

  protected readonly actionBanner = signal<{
    type: 'success' | 'info' | 'warn';
    title: string;
    message: string;
    timestamp: string;
  } | null>(null);

  protected readonly inspectedJsonItem = signal<{
    title: string;
    subtitle: string;
    payload: unknown;
  } | null>(null);

  // Filtered War Room Reviewer rows
  protected readonly displayedWarRoomReviewers = computed(() => {
    const list = this.certSvc.filteredReviewerRows();
    const q = this.warRoomSearch().trim().toLowerCase();
    const st = this.warRoomStatusFilter();

    return list.filter((row) => {
      if (st === 'STALLED' && !(row.completionPct < 25 && row.openItemsCount > 0)) {
        return false;
      }
      if (st === 'IN_PROGRESS' && !(row.completionPct >= 25 && row.completionPct < 100)) {
        return false;
      }
      if (st === 'COMPLETED' && row.completionPct < 100) {
        return false;
      }

      if (q) {
        const hay =
          `${row.reviewerName} ${row.reviewerDepartment} ${row.campaignName} ${row.skipLevelManagerName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  // Filtered Rubber-Stamp Reviewer Cards
  protected readonly displayedRubberStampReviewers = computed(() => {
    const rows = this.certSvc.filteredReviewerRows().filter((r) => r.decisionsMade > 0);
    const f = this.rubberStampFilter();
    const q = this.rubberStampSearch().trim().toLowerCase();

    return rows
      .filter((r) => {
        if (f === 'CRITICAL_RUBBER_STAMP' && r.trustLevel !== 'CRITICAL_RUBBER_STAMP') {
          return false;
        }
        if (f === 'HIGH_ASSURANCE' && r.trustLevel !== 'HIGH_ASSURANCE') {
          return false;
        }
        if (f === 'PRIVILEGED_ONLY' && r.privilegedApprovedNoCommentCount === 0) {
          return false;
        }
        if (q) {
          const hay = `${r.reviewerName} ${r.campaignName} ${r.reviewerDepartment}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.trustScore - b.trustScore);
  });

  // Filtered Rubber-Stamp Line-Items
  protected readonly displayedRubberStampItems = computed(() => {
    const items = this.certSvc
      .filteredLineItems()
      .filter((i) => i.decision === 'APPROVE');
    const selectedCert = this.selectedRubberStampCertId();
    const f = this.rubberStampFilter();
    const q = this.rubberStampSearch().trim().toLowerCase();

    return items.filter((item) => {
      if (selectedCert && item.certificationId !== selectedCert) {
        return false;
      }
      if (f === 'CRITICAL_RUBBER_STAMP' && !item.isRubberStamped) {
        return false;
      }
      if (f === 'PRIVILEGED_ONLY' && !(item.privileged && !item.comments)) {
        return false;
      }
      if (q) {
        const hay =
          `${item.reviewerName} ${item.targetIdentityName} ${item.accessName} ${item.sourceName} ${item.campaignName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  // Filtered Revocation Assurance Line-Items
  protected readonly displayedRevocationItems = computed(() => {
    const revoked = this.certSvc
      .filteredLineItems()
      .filter((i) => i.decision === 'REVOKE');
    const st = this.revocationStateFilter();
    const q = this.revocationSearch().trim().toLowerCase();

    return revoked.filter((item) => {
      if (st !== 'ALL' && item.revocationState !== st) {
        return false;
      }
      if (q) {
        const hay =
          `${item.targetIdentityName} ${item.accessName} ${item.sourceName} ${item.reviewerName} ${item.grantingRoleOrSource}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  protected readonly rubberStampedPrivilegedItemsList = computed(() =>
    this.certSvc
      .filteredLineItems()
      .filter((i) => i.isRubberStamped && i.privileged)
  );

  ngOnInit(): void {
    this.certSvc.loadFullCertificationIntelligence();
  }

  protected switchTab(tab: WorkspaceTab): void {
    this.activeTab.set(tab);
  }

  protected toggleCampaignFilter(campaignId: string): void {
    this.certSvc.selectedCampaignIds.update((curr) => {
      if (curr.includes(campaignId)) {
        return curr.filter((id) => id !== campaignId);
      }
      return [...curr, campaignId];
    });
  }

  protected clearCampaignFilter(): void {
    this.certSvc.selectedCampaignIds.set([]);
  }

  protected isCampaignSelected(campaignId: string): boolean {
    const selected = this.certSvc.selectedCampaignIds();
    return selected.length === 0 || selected.includes(campaignId);
  }

  // Open Skip-Level Escalation Modal for single reviewer or all stalled reviewers
  protected openSkipLevelEscalationModal(singleRow?: ReviewerWarRoomRow): void {
    const targetRows = singleRow
      ? [singleRow]
      : this.displayedWarRoomReviewers().filter(
          (r) => r.phase === 'ACTIVE' && r.completionPct < 25 && r.openItemsCount > 0
        );

    const candidates: EscalationPreviewItem[] = [];
    for (const row of targetRows) {
      const openItemIds = row.reviewItems
        .filter((i) => i.decision === 'OPEN')
        .map((i) => i.itemId);
      if (openItemIds.length === 0 || !row.skipLevelManagerId) continue;

      candidates.push({
        certificationId: row.certificationId,
        campaignName: row.campaignName,
        fromReviewerId: row.reviewerId,
        fromReviewerName: row.reviewerName,
        toSkipManagerId: row.skipLevelManagerId,
        toSkipManagerName: row.skipLevelManagerName,
        openItemsToReassign: openItemIds.length,
        itemIds: openItemIds,
        reason: this.escalationReason(),
      });
    }

    this.escalationCandidateList.set(candidates);
    this.showEscalationModal.set(true);
  }

  protected async confirmSkipLevelEscalation(): Promise<void> {
    const candidates = this.escalationCandidateList().map((c) => ({
      ...c,
      reason: this.escalationReason(),
    }));
    if (candidates.length === 0) return;

    try {
      const res = await this.certSvc.executeSkipLevelEscalation(candidates);
      this.showEscalationModal.set(false);
      this.actionBanner.set({
        type: 'success',
        title: `Skip-Level Escalation Dispatched (${res.succeeded} Reviewer Queue(s))`,
        message: `Reassigned ${res.totalItemsReassigned} undecided certification item(s) via POST /certifications/v1/{id}/reassign. ${res.details.join(' · ')}`,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: any) {
      this.actionBanner.set({
        type: 'warn',
        title: 'Escalation Dispatch Notice',
        message: err?.message || 'Could not complete reassignment.',
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }

  // Open Surgical Micro-Campaign Modal for Rubber-Stamped Privileged Items
  protected openSurgicalMicroCampaignModal(reviewerRow?: ReviewerWarRoomRow): void {
    if (reviewerRow) {
      this.selectedRubberStampCertId.set(reviewerRow.certificationId);
      this.microCampaignName.set(
        `Second-Level Audit: ${reviewerRow.reviewerName} Privileged Approvals`
      );
      this.microCampaignDescription.set(
        `Surgical re-certification of ${reviewerRow.privilegedApprovedNoCommentCount} privileged access items bulk-approved in ${reviewerRow.estimatedReviewDurationSec}s with 0 comments by ${reviewerRow.reviewerName}.`
      );
    } else {
      this.microCampaignName.set('Q4 Second-Level Privileged Rubber-Stamp Audit');
      this.microCampaignDescription.set(
        'Surgical second-level verification campaign targeting all privileged access items bulk-approved without review comments across active Q4 campaigns.'
      );
    }
    this.showMicroCampaignModal.set(true);
  }

  protected async confirmLaunchMicroCampaign(): Promise<void> {
    const flagged = this.displayedRubberStampItems().filter((i) => i.privileged);
    const itemsToScope =
      flagged.length > 0 ? flagged : this.rubberStampedPrivilegedItemsList();

    const spec: MicroCampaignLaunchSpec = {
      name: this.microCampaignName(),
      description: this.microCampaignDescription(),
      reviewerId: this.microCampaignReviewerId(),
      reviewerName: this.microCampaignReviewerName().split(' ')[0],
      deadlineDays: this.microCampaignDeadlineDays(),
      targetIdentityIds: itemsToScope.map((i) => i.targetIdentityId),
      accessConstraints: itemsToScope.map((i) => ({
        type: (i.accessType as 'ENTITLEMENT' | 'ACCESS_PROFILE' | 'ROLE') || 'ENTITLEMENT',
        id: i.accessId,
        name: i.accessName,
      })),
      flaggedItemsCount: itemsToScope.length,
    };

    try {
      const res = await this.certSvc.launchSurgicalMicroCampaign(spec);
      this.showMicroCampaignModal.set(false);
      this.actionBanner.set({
        type: 'success',
        title: `Surgical Re-Certification Campaign Staged (${res.status})`,
        message: `Created Search Campaign "${res.name}" (ID: ${res.campaignId}) via POST /campaigns/v1 scoping ${spec.flaggedItemsCount} rubber-stamped privileged item(s) with Mandatory Comment Enforcement (ALL_DECISIONS).`,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: any) {
      this.actionBanner.set({
        type: 'warn',
        title: 'Micro-Campaign Launch Notice',
        message: err?.message || 'Error creating micro-campaign.',
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }

  // Trigger Immediate Surgical Revocation or Override Rubber-Stamped Item
  protected async triggerSurgicalRevoke(item: CertificationLineItem): Promise<void> {
    try {
      const res = await this.certSvc.enforceSurgicalRevocation(item);
      this.actionBanner.set({
        type: 'success',
        title: 'Closed-Loop Surgical Revocation Executed',
        message: res.message,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: any) {
      this.actionBanner.set({
        type: 'warn',
        title: 'Revocation Dispatch Notice',
        message: err?.message || 'Could not dispatch surgical revocation.',
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }

  protected exportAssuranceAuditPackCsv(): void {
    const items = this.certSvc.filteredLineItems();
    const headers = [
      'Campaign Name',
      'Reviewer',
      'Target Identity',
      'Department',
      'Access Type',
      'Access Name',
      'Source',
      'Privileged',
      'Decision',
      'Bulk Approved',
      'Rubber Stamped Flag',
      'Reviewer Comment',
      'Revocation Verification State',
      'Live Presence Status',
    ];

    const rows = items.map((i) => [
      `"${(i.campaignName || '').replace(/"/g, '""')}"`,
      `"${(i.reviewerName || '').replace(/"/g, '""')}"`,
      `"${(i.targetIdentityName || '').replace(/"/g, '""')}"`,
      `"${(i.targetDepartment || '').replace(/"/g, '""')}"`,
      `"${i.accessType}"`,
      `"${(i.accessName || '').replace(/"/g, '""')}"`,
      `"${(i.sourceName || '').replace(/"/g, '""')}"`,
      `"${i.privileged ? 'YES' : 'NO'}"`,
      `"${i.decision}"`,
      `"${i.bulk ? 'YES' : 'NO'}"`,
      `"${i.isRubberStamped ? 'FLAGGED_RUBBER_STAMP' : 'CLEAN'}"`,
      `"${(i.comments || '').replace(/"/g, '""')}"`,
      `"${i.revocationState || 'N/A'}"`,
      `"${(i.grantingRoleOrSource || '').replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ISC_Certification_Assurance_Audit_Pack_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  protected inspectObject(title: string, subtitle: string, payload: unknown): void {
    this.inspectedJsonItem.set({ title, subtitle, payload });
  }

  protected copyText(text: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  }

  protected formatJson(val: unknown): string {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
}
