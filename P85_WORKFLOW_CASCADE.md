# TRAMITA P-8.5 — Workflow Cascade Builder + Approval SLA

## Current workflow findings

- `submitForReview` previously accepted only `reviewerId` and `approverId` and always inserted two hardcoded `approval_flows` rows: step 1 `Revisão Técnica` with `required_role = reviewer` and step 2 `Aprovação` with `required_role = approver`.
- The previous submit flow set the document status to `in_review`, deleted only pending approval rows for the document, inserted the fixed two-step cascade, wrote `audit_trail.action = submitted_for_review`, and notified the reviewer or all users with the reviewer role.
- Approval behavior was coupled to `step === 1` and `step === 2`: approving step 1 moved the document to `pending_approval`, while approving step 2 published the document. This made any richer multi-step sequence impossible.
- Rejection returned the document to `draft`, marked remaining pending steps as `skipped`, wrote `audit_trail.action = rejected`, and notified the document author.
- The approval queue already queried real Supabase `approval_flows`, not local mock workflow state. It showed pending rows for the current org and, for non-admin/non-manager users, filtered to `required_role = current role` and either assigned to the user or unassigned.
- Admins/managers could see a sidebar badge but no queue items when queue filtering also required document status to match the old two-step status mapping (`step 1 => in_review`, `step 2 => pending_approval`). A dynamic cascade can have more than two pending rows and step numbers no longer map reliably to document status.

## Supabase fields now used

- `approval_flows.step`
- `approval_flows.step_label`
- `approval_flows.required_role`
- `approval_flows.assignee_id`
- `approval_flows.status`
- `approval_flows.comment`
- `approval_flows.decided_by`
- `approval_flows.decided_at`
- `approval_flows.due_days`
- `approval_flows.due_at`
- `approval_flows.started_at`
- `approval_flows.completed_at`
- `approval_flows.escalation_user_id`
- `approval_flows.metadata`
- `documents.status`
- `documents.published_at`
- `audit_trail.action`
- `notifications.document_id`, `notifications.user_id`, `notifications.type`, `notifications.title`, `notifications.body`

## Supabase fields still lightly used or reserved

- `approval_flows.escalation_notified_at` remains reserved for the scheduled escalation/notification worker.
- `approval_template_steps.is_required` and approval template storage are not yet surfaced in the document detail builder; this P-8.5 implementation builds an ad-hoc cascade per document.
- `approval_templates.mode`, `approval_templates.default_due_days`, and template metadata remain available for a future reusable workflow-template UI.

## Implementation summary

- `useApprovalFlow.submitForReview` now accepts `steps?: WorkflowStepInput[]` while preserving backward compatibility with `reviewerId` and `approverId`.
- Workflow steps are sorted and renumbered, validated for label and role, and inserted with SLA fields (`due_days`, `due_at`, `started_at`) plus optional escalation user.
- The first pending step starts immediately (`started_at = now`) and receives assignment/role notifications.
- Approval no longer depends on hardcoded step numbers. It completes the current step, starts the next pending step, updates the document status based on the next step role, and publishes only when no pending steps remain.
- Rejection completes the current step, returns the document to `draft`, skips remaining pending steps, writes audit history, and notifies the author.
- The document detail page now provides a configurable “Configurar Fluxo de Aprovação” dialog for draft documents with add/remove/reorder, label, role, assignee, due-days, and escalation controls.
- The document detail timeline now shows step number, label, required role, assignee, status, SLA due date, overdue badge, decided-by/date, comments, and action buttons where the current user can act.
- The approval queue now displays dynamic pending workflow items without the old hardcoded status/step mismatch, including assignee, role, due date, overdue/days-until-due, and document status.
- Dashboard metrics now include total pending approval steps and overdue approval steps in addition to existing document status counts.

## Permissions and remaining risk

- Admins and managers can configure/send workflows for any document in their org.
- Authors can configure/send workflows only for their own draft documents.
- Reviewers/approvers can act on steps assigned to them or unassigned steps matching their role.
- Admins/managers can see and act on all pending workflow items in the queue.
- Viewers cannot submit or approve.
- Final approval by the document author is blocked for non-admin/non-manager users when the current step requires `approver`.
- Remaining risk: if a custom final step uses a non-`approver` role, author self-approval is not blocked by role semantics alone; template policy rules should make final approval roles explicit in a future phase.

## Files changed

- `src/hooks/useApprovalFlow.ts`
- `src/hooks/useApprovalQueue.ts`
- `src/hooks/useDocument.ts`
- `src/hooks/useDashboard.ts`
- `src/routes/authenticated/documents.$documentId.tsx`
- `src/routes/authenticated/fluxo-de-aprovacao.tsx`
- `src/routes/authenticated/dashboard.tsx`
- `P85_WORKFLOW_CASCADE.md`

## Manual test instructions

1. Create a draft document.
2. Open document detail.
3. Configure workflow with 3 steps.
4. Assign at least one step to current user or leave required_role matching current role.
5. Submit for review.
6. Confirm `approval_flows` rows are created with `due_at` and `due_days`.
7. Confirm approval queue shows the pending item.
8. Approve or reject a step.
9. Confirm document status changes to the next workflow state (`in_review`, `pending_approval`, `published`, or `draft` on rejection).
10. Confirm `audit_trail` receives workflow entries.

## Verification run

- `bun run build` passed.
- `grep -rn "approval_flows\|submitForReview\|due_at\|due_days\|started_at\|completed_at" src/ --include="*.ts" --include="*.tsx"` confirmed the workflow cascade/SLA references are in the expected hooks and routes.
