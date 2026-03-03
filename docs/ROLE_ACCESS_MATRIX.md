# Role Access Matrix

Last updated: 2026-03-02

This matrix defines strict separation between global roles in AquiTa.do:

- `USER`: B2C customer.
- `BUSINESS_OWNER`: tenant operator for one or more organizations.
- `ADMIN`: platform operator (global governance).

## Global Principles

- Least privilege by default.
- Tenant actions require organization membership (`x-organization-id` + org membership).
- Admin operations are platform-level and must not bypass tenant ownership flows.

## Unique Responsibilities

### USER

- Discover businesses (`/businesses`, search, filters, nearby).
- View business details and reviews.
- Create reviews.
- Create bookings as customer.
- Open and follow customer conversations with businesses.
- Manage personal profile and customer dashboard.

Must not:
- Create businesses.
- Access business dashboard.
- Create/manage organizations.
- Access admin dashboard.

### BUSINESS_OWNER

- Create businesses for owned/managed organization context.
- Manage own business catalog, images, promotions, bookings, inbox, CRM, billing.
- Manage organization members/invites by org role (`OWNER`/`MANAGER` constraints).
- Manage subscription only when org role is `OWNER`.

Must not:
- Access admin-only modules (categories moderation, global reports, observability metrics).
- Operate organizations where not a member.

### ADMIN

- Global platform governance:
  - Verify/review businesses and KYC.
  - Moderate flagged reviews.
  - Manage categories/features governance endpoints.
  - Read global analytics and observability metrics.

Must not:
- Use tenant operation endpoints as organization owner/manager by bypass.
- Create/update/delete businesses through tenant owner flows.
- Manage org members/subscriptions without membership context.

## API Separation Summary

- `POST /api/businesses` -> `BUSINESS_OWNER` only.
- `PUT/DELETE /api/businesses/:id` -> org-scoped (`OWNER|MANAGER`) + policy checks.
- `POST /api/organizations` -> `BUSINESS_OWNER` only.
- `PATCH /api/organizations/:id/subscription` -> org role `OWNER` only.
- `GET /api/observability/metrics` -> `ADMIN` only.

## Frontend Separation Summary

- `/app/customer` -> `USER`.
- `/dashboard`, `/register-business`, `/organization` -> `BUSINESS_OWNER`.
- `/admin` -> `ADMIN`.
- Navbar/CTA visibility uses role capability mapping (`auth/capabilities.ts`).

## Guardrail Checklist

- No admin bypass in organization context guard.
- No admin bypass in org role guard.
- No admin bypass in organization service actor resolution.
- Role mismatch redirects to role home (`ProtectedRoute`).
- Owner-only tenant UI hidden for non-owners/managers.
