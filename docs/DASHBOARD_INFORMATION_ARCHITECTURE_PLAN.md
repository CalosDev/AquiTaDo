# Dashboard Information Architecture Plan

This document captures the safe redesign direction for AquiTa dashboard screens.
It is intentionally documentary. It does not authorize runtime, API, auth,
permission, route, or styling changes by itself.

## Scope

Covered views:

| Role | Route | Main file | Current baseline |
| --- | --- | --- | --- |
| Customer | `/app/customer` | `apps/web/src/pages/CustomerDashboard.tsx` | Desktop and mobile visual baseline exist. |
| Business owner | `/dashboard` | `apps/web/src/pages/DashboardBusiness.tsx` | Desktop and mobile visual baseline exist. |
| Admin | `/admin` | `apps/web/src/pages/AdminDashboard.tsx` | Desktop visual baseline exists; mobile baseline is still missing. |

Out of scope for this document:

- Changing UI, copy, behavior, routes, auth, permissions, `searchParams`, API clients, backend, contracts, Prisma, Redis, PWA, tracking, or seed data.
- Redesigning `AdminDashboard` before its data contracts and visual coverage are stronger.
- Collapsing or removing features before a dedicated behavior review.

## Product Principle

Dashboards should stop feeling like broad information dumps. Each role needs a
clear answer to one question:

| Role | Primary question |
| --- | --- |
| Customer | What should I revisit, compare, or contact next? |
| Business owner | What needs attention in my business today? |
| Admin | What operational risk needs review or action now? |

The visual system should support four product jobs:

- Discover.
- Compare.
- Trust.
- Contact or act.

If a dashboard block does not help the active role do one of those jobs, it
should be lower priority, moved behind a workspace, or documented as secondary.

## Current Cross-Cutting Problems

| Problem | Evidence | Risk |
| --- | --- | --- |
| Too much visible at once | Owner and customer baselines show long pages with many cards before the user has a single next action. | Users scan, but do not know what matters first. |
| Cards compete with each other | Hero, metrics, status cards, workspace summary, lists, and activity panels all use similar weight. | The screen feels like colored modules instead of a product workflow. |
| Role-specific jobs are mixed | Customer mixes favorites/lists with bookings/check-ins/inbox. Owner mixes claim, verification, metrics, selected business, and workspaces. | Users cannot build a mental model of the dashboard. |
| Navigation and content duplicate context | Side navigation, top intro, workspace strip, and summary blocks repeat similar context. | Valuable first viewport space is spent restating structure. |
| Admin is high-risk | `AdminDashboard` contains tabs, URL state, many response shapes, permissions, tables, and destructive/admin actions. | UI changes can mask contract or authorization regressions. |

## Target IA Model

Every dashboard should be structured as:

1. Current context.
2. Primary next action.
3. Critical status only.
4. Main work area.
5. Secondary history/details.

This is an IA target, not an implementation mandate. Each role needs its own
phase, baseline, QA, and documentation before code changes.

## Business Owner Dashboard

Primary product job:

- Help an owner operate one selected business and resolve the most important
  readiness, claim, verification, customer, or growth task.

Current fragile areas:

- `DashboardBusiness.tsx` controls `workspace` via `searchParams`.
- It depends on organization context and active organization state.
- It loads owned businesses, analytics, claim requests, verification status,
  and documents.
- Lazy workspaces include verification, operations, growth, billing, and
  organization.
- First viewport shows overview, metrics, claim/readiness, documents, business
  selector, workspace summary, tabs, and next-step cards.

Recommended IA order:

| Priority | Block | Purpose |
| --- | --- | --- |
| 1 | Active business and next action | Make the selected business and one recommended task unmistakable. |
| 2 | Readiness status | Show claim, verification, and profile completeness as compact blockers. |
| 3 | Workspace navigation | Keep tabs, but make them feel like task areas, not competing sections. |
| 4 | Metrics | Keep metrics secondary unless they indicate action. |
| 5 | Recent activity/history | Move below the decision area unless it is urgent. |

First safe redesign candidate:

- Owner overview first viewport only.
- Preserve `searchParams`, workspace behavior, organization context, API calls,
  handlers, copy, and routes.
- Only adjust local wrappers/spacing/visual hierarchy after baseline comparison.

Do not touch yet:

- `useSearchParams`, `readWorkspace`, `handleWorkspaceChange`.
- Lazy workspaces.
- Verification upload/submit handlers.
- Organization context.
- API calls and response handling.
- Business selector behavior.

Recommended QA for first owner UI slice:

```powershell
pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/DashboardBusiness.test.tsx
node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop|mobile) baseline"
```

If there is no focused unit test available for the touched slice, keep visual QA
as the primary gate and add a characterization test in a separate phase.

## Customer Dashboard

Primary product job:

- Help a user return to saved businesses, compare options, and resume recent
  activity without turning the page into an operations center.

Current fragile areas:

- `CustomerDashboard.tsx` mixes favorites and lists with
  `CustomerActivityWorkspace`.
- `CustomerActivityWorkspace` loads bookings, check-ins, conversations, and a
  selected thread.
- Mobile baseline is very long and pushes inbox/reply behavior far below the
  first viewport.
- Favorites/lists are decision tools; reservations/check-ins/inbox are activity
  history. They should not have equal first-screen weight.

Recommended IA order:

| Priority | Block | Purpose |
| --- | --- | --- |
| 1 | Continue discovery | Lead with favorites/lists and a clear path back to `/businesses`. |
| 2 | Saved comparison | Make lists easier to scan than operational history. |
| 3 | Recent activity summary | Summarize bookings/check-ins/inbox before deep panels. |
| 4 | Inbox/reply | Keep available, but not visually equal to saved discovery. |
| 5 | Long history | Move below core decision content. |

First safe redesign candidate:

- Customer top section plus saved businesses/list layout.
- Do not change remove/delete/list handlers.
- Do not change `CustomerActivityWorkspace` in the first UI slice.

Do not touch yet:

- Favorite removal behavior.
- List deletion and item removal.
- Conversation selection and reply flow.
- Booking/payment actions.
- API endpoints and React Query keys.

Recommended QA for first customer UI slice:

```powershell
node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop|mobile) baseline"
```

## Admin Dashboard

Primary product job:

- Help an admin identify operational risk and act on the right queue without
  breaking permissions, contracts, or destructive workflows.

Current fragile areas:

- `AdminDashboard.tsx` uses `searchParams` for tabs.
- It loads many shapes: admin businesses, categories, provinces, pending
  verification, market reports, moderation queue, insights, observability, claim
  requests, ownership history, suggestions, duplicates, and catalog data.
- It contains admin-only actions for publish/unpublish, ownership changes,
  claim review, duplicate resolution, catalog creation, verification review,
  document review, and moderation resolution.
- Only desktop visual baseline is currently known here.

Recommended IA order:

| Priority | Block | Purpose |
| --- | --- | --- |
| 1 | Queue needing action | Put review queues and risk states before broad catalog metrics. |
| 2 | Clear tab model | Keep tabs stable and tied to URL until separately audited. |
| 3 | Table/action safety | Preserve destructive action affordances and confirmation logic. |
| 4 | Observability | Keep system state separate from catalog moderation. |
| 5 | Broad metrics | Use metrics as context, not as the main task. |

Do not redesign yet:

- Admin table layout.
- Admin actions.
- Permission assumptions.
- `searchParams` tab behavior.
- Verification/moderation workflows.
- Observability workspace.

Required before admin redesign:

1. Add mobile visual baseline for `/admin` if responsive changes are expected.
2. Add or verify response-shape checks for the next high-risk admin endpoints.
3. Design a narrow IA slice for one tab, not the whole console.

## Safe Phase Order

| Phase | Goal | Scope |
| --- | --- | --- |
| 15.6 | Design owner first-viewport UI slice | No code. Choose exact blocks and QA. |
| 15.7 | Implement owner overview visual-only slice | `DashboardBusiness.tsx` local layout/classes only. |
| 15.8 | QA and document owner slice | Typecheck/test/visual as applicable. |
| 15.9 | Design customer saved-discovery slice | No code. Keep activity workspace untouched. |
| 15.10 | Implement customer visual-only slice | `CustomerDashboard.tsx` local layout/classes only. |
| 15.11 | Add admin mobile baseline | Test-only, no product changes. |
| 15.12+ | Admin IA design | No code until baseline/contracts are stronger. |

## Visual System Direction

Use these constraints for future dashboard redesign:

- One primary CTA per first viewport.
- One active context indicator per role.
- Metrics should answer "does this need action?" rather than fill space.
- Cards should not nest heavy cards inside heavy cards.
- Keep dashboard cards tighter than marketing sections.
- Use role-specific grouping, not generic "everything in cards".
- Mobile should show priority before breadth.
- Desktop should use space for comparison, not for more competing modules.

## Validation Rules

For each future dashboard UI slice:

- One role.
- One route.
- One section.
- One type of visual change.
- Existing behavior preserved.
- Visual baseline run before updating snapshots.
- Documentation updated before commit.

Manual checks:

- Desktop first viewport answers the role's primary question.
- Mobile first viewport shows the same priority, not just the same content
  stacked vertically.
- Tabs, links, handlers, auth redirects, and API calls still behave as before.

