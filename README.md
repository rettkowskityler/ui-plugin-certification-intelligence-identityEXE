# IdentityEXE Certification Intelligence & Audit Assurance Center (`certification-intelligence-identityexe`)

An executive **Certification Intelligence & Closed-Loop Audit Assurance UI Plugin** for **SailPoint Identity Security Cloud (ISC)**.

While native SailPoint ISC certifications excel at generating access review campaigns and recording reviewer decisions, CISOs, IAM Directors, and External Auditors consistently struggle to answer three fundamental governance questions:
1. **Did our reviewers actually review the access, or did they "rubber-stamp" it in 8 seconds?**
2. **When a campaign is 72 hours from its SOX/SOC2 deadline, how do we escalate 15 stalled managers to their skip-level VP in one click instead of manually reassigning certifications one by one?**
3. **After a reviewer clicks "Revoke" and signs off, did the access actually disappear on the target system, or did a dynamic Role criterion silently re-grant it ("Zombie Access")?**

This UI Plugin brings all three capabilities directly inside the SailPoint ISC Admin Portal using `@sailpoint/ui-plugin-sdk` and `/v1` APIs.

---

## Core Modules

### 1. The "Rubber-Stamp" Detector & Reviewer Trust Score Analyzer
- Inspects every active and completed certification (`GET /certifications/v1` + `GET /certifications/v1/{id}/access-review-items`).
- Computes a **Reviewer Trust Score (0–100)** by analyzing:
  - **Bulk Approval Ratio**: 100% approval rates across high-volume reviews.
  - **Audit Comment Coverage**: Zero comments across privileged or high-risk entitlements.
  - **Privileged Rubber-Stamping**: Unconditional approval of privileged/admin entitlements, access profiles, and roles.
- **1-Click Remediation Actions**:
  - **Launch Surgical 2nd-Level Micro-Campaign**: Automatically dispatches a targeted `SEARCH` campaign (`POST /campaigns/v1`) scoped strictly to the identities and access items rubber-stamped by that reviewer, with `mandatoryCommentRequirement: 'ALL_DECISIONS'` enforced.
  - **Direct Line-Item Override**: Inspect any reviewer's line items in-app and immediately override rubber-stamped approvals to `REVOKE` (`POST /certifications/v1/{id}/decide`).

### 2. Multi-Campaign War Room & 1-Click Skip-Level Manager Escalation Matrix
- Consolidates all active and staged campaigns (`GET /campaigns/v1?detail=FULL`) into an executive war room.
- Identifies **Stalled Reviewers** with low or 0% completion progress.
- Dynamically resolves each stalled reviewer's **Skip-Level Manager (Manager's Manager)** via `POST /search/v1` against the `identities` index.
- **1-Click Bulk Skip-Level Escalation**: Select one or all stalled reviewers and execute `POST /certifications/v1/{id}/reassign` to route all undecided access review items directly to their skip-level manager with a standardized audit trail comment.

### 3. Post-Campaign "Revocation Assurance" & Zombie-Access Tracker
- Extracts all `REVOKE` decisions across certifications and cross-references them against live identity access assignments (`POST /search/v1` nested `@access` queries).
- Categorizes every revocation into three closed-loop assurance buckets:
  1. **Zombie Access (Still Present via Role/Source)**: The reviewer revoked the item, yet the identity still holds the access in ISC (often because a birthright or dynamic Role criterion re-evaluate and re-provisioned it).
  2. **Pending Provisioning / Deprovisioning Queue**: The revocation was submitted, and thecertification phase is still finalizing or waiting on a downstream connector/work item.
  3. **Verified Removed**: Confirmed absent from the identity's live `@access` inventory.
- **1-Click Surgical Force-Revoke**: Dispatches an immediate `REVOKE_ACCESS` request via `POST /access-requests/v1` or re-triggers certification revocation (`POST /certifications/v1/{id}/decide`) to close the loop.

---

## Build & Upload Workflow

```powershell
# Build the Angular 21 UI Plugin bundle
npm run build

# Upload the compiled plugin bundle to your SailPoint ISC tenant
$env:SAIL_EXPERIMENTAL_UI_PLUGINS = "1"
sail ui-plugins upload --env <your-tenant-env>
```
