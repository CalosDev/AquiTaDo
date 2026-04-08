# Dominican Product Guardrails (Professional Mode)

Last updated: 2026-03-03

This document defines the non-negotiable product rules to keep AquiTa.do:

- Dominican-first (market, language, compliance, geography).
- Professional (clear communication, reliable data, production-grade behavior).

## 1) Market Scope

- Primary market: Dominican Republic.
- Language: Spanish (clear and professional).
- Currency: DOP / RD$ only in UX, billing, analytics and reports.
- Geography: provinces/cities from RD data model only.

## 2) Communication Standards

- Keep a professional and direct tone for all user-facing copy.
- Local terms are allowed only when they increase comprehension (example: colmado).
- Avoid slang overload.
- Never fabricate data (prices, availability, ratings, schedules).
- If data is missing, return a transparent message and next action.

## 3) Recommendation and Messaging Rules

Discovery, contact prompts and product guidance must:

- Stay in Dominican context.
- Prefer concise answers with actionable next step.
- Avoid unsupported claims about businesses, availability or reputation.
- Keep output useful for conversion (contact, compare, reserve when aplique).

## 4) Compliance and Business Data

- Organization and billing flows should support local legal artifacts:
  - RNC capture and validation path.
  - e-CF readiness in invoicing models.
- Fiscal and sales exports must remain DOP-compatible.
- Keep audit logs for role/tenant-sensitive actions.

## 5) UX Guardrails by Role

- USER: discovery, booking, reviews, messaging only.
- BUSINESS_OWNER: tenant operations (business profile, promotions, CRM, bookings, billing).
- ADMIN: platform governance only (verification, moderation, global controls).

No role should expose mixed navigation or actions from another role.

## 6) Definition of Done (Dominican + Professional)

A feature is done only if:

1. Works with RD geography and DOP.
2. Uses professional Spanish copy.
3. Does not leak cross-role or cross-tenant capabilities.
4. Has clear error and empty states.
5. Includes smoke test coverage for critical path.
