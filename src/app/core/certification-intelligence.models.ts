export type CampaignStatusType =
  | 'ACTIVE'
  | 'STAGED'
  | 'COMPLETED'
  | 'PENDING'
  | 'ACTIVATING'
  | 'COMPLETING'
  | 'CANCELING'
  | 'ARCHIVED'
  | 'ERROR';

export type CampaignType =
  | 'SEARCH'
  | 'MANAGER'
  | 'SOURCE_OWNER'
  | 'ROLE_COMPOSITION'
  | 'MACHINE_ACCOUNT';

export type TrustRiskLevel = 'CRITICAL_RUBBER_STAMP' | 'MODERATE_RISK' | 'HIGH_ASSURANCE' | 'PENDING_REVIEW';

export type RevocationVerificationState =
  | 'VERIFIED_REMOVED'
  | 'ZOMBIE_REGRANTED'
  | 'STUCK_PROVISIONING'
  | 'PENDING_SIGN_OFF';

export interface CampaignSummaryCard {
  id: string;
  name: string;
  description: string;
  type: CampaignType | string;
  status: CampaignStatusType | string;
  created: string;
  deadline: string;
  daysRemaining: number;
  isOverdue: boolean;
  totalCertifications: number;
  completedCertifications: number;
  completionPct: number;
  totalDecisions: number;
  decisionsMade: number;
  approvedCount: number;
  revokedCount: number;
  openCount: number;
  privilegedItemsCount: number;
  trustScore: number;
  rubberStampCount: number;
  velocityForecast: 'ON_TRACK' | 'AT_RISK' | 'SLA_BREACH' | 'COMPLETED' | 'STAGED';
}

export interface ReviewerWarRoomRow {
  certificationId: string;
  certificationName: string;
  campaignId: string;
  campaignName: string;
  campaignType: string;
  campaignStatus: string;
  phase: 'STAGED' | 'ACTIVE' | 'SIGNED' | string;
  completed: boolean;
  reviewerId: string;
  reviewerName: string;
  reviewerEmail: string;
  reviewerDepartment: string;
  reviewerJobTitle: string;
  reviewerLifecycleState: string;
  skipLevelManagerId: string | null;
  skipLevelManagerName: string;
  skipLevelManagerEmail: string;
  identitiesTotal: number;
  identitiesCompleted: number;
  decisionsTotal: number;
  decisionsMade: number;
  openItemsCount: number;
  approvedCount: number;
  revokedCount: number;
  privilegedCount: number;
  privilegedApprovedNoCommentCount: number;
  commentedCount: number;
  bulkDecisionCount: number;
  completionPct: number;
  due: string;
  signed: string | null;
  created: string;
  modified: string;
  daysRemaining: number;
  // Telemetry & Trust Score Metrics
  estimatedReviewDurationSec: number;
  decisionsPerMinute: number;
  approvalRatePct: number;
  bulkRatioPct: number;
  commentCoveragePct: number;
  trustScore: number;
  trustLevel: TrustRiskLevel;
  trustFlags: string[];
  selected?: boolean;
  reviewItems: CertificationLineItem[];
}

export interface CertificationLineItem {
  itemId: string;
  certificationId: string;
  campaignId: string;
  campaignName: string;
  reviewerId: string;
  reviewerName: string;
  targetIdentityId: string;
  targetIdentityName: string;
  targetDepartment: string;
  accessType: 'ENTITLEMENT' | 'ACCESS_PROFILE' | 'ROLE' | string;
  accessId: string;
  accessName: string;
  accessDescription: string;
  sourceName: string;
  sourceId: string;
  privileged: boolean;
  revocable: boolean;
  completed: boolean;
  decision: 'APPROVE' | 'REVOKE' | 'OPEN' | string;
  bulk: boolean;
  comments: string;
  newAccess: boolean;
  isRubberStamped: boolean;
  // Post-Campaign / Closed-Loop Revocation Assurance
  revocationState?: RevocationVerificationState;
  stillPresentOnIdentity?: boolean;
  grantingRoleOrSource?: string;
  remediationAdvice?: string;
  lastCheckedTimestamp?: string;
  selected?: boolean;
}

export interface EscalationPreviewItem {
  certificationId: string;
  campaignName: string;
  fromReviewerId: string;
  fromReviewerName: string;
  toSkipManagerId: string;
  toSkipManagerName: string;
  openItemsToReassign: number;
  itemIds: string[];
  reason: string;
}

export interface MicroCampaignLaunchSpec {
  name: string;
  description: string;
  reviewerId: string;
  reviewerName: string;
  deadlineDays: number;
  targetIdentityIds: string[];
  accessConstraints: Array<{
    type: 'ENTITLEMENT' | 'ACCESS_PROFILE' | 'ROLE';
    id: string;
    name: string;
  }>;
  flaggedItemsCount: number;
}
