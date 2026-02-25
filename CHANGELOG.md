# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Organization management API: members, invites, subscription, usage, and audit logs.
- SaaS plan model (`FREE`, `GROWTH`, `SCALE`) with enforced limits by organization.
- Frontend organization center with plan controls, usage visibility, and audit activity feed.

### Changed
- Business and upload flows now enforce active organization context and tenant scope.
- Dashboard and navbar now reflect active organization context in multi-tenant mode.

## [1.0.0] - 2026-02-25

### Added
- Initial monorepo setup with pnpm workspaces, shared packages, CI pipeline, and lint/test/build automation.
- Backend API with NestJS, JWT auth/roles, business directory flows, uploads, reviews, categories, and locations.
- Frontend app with React 19, Vite 7, React Router 7, and Tailwind CSS 4.
- Health and readiness endpoints (`/api/health`, `/api/health/ready`) and deployment smoke test script.

### Changed
- Migrated Prisma to v7 with adapter-based connection (`@prisma/adapter-pg`) and `prisma.config.ts`.
- Strengthened API security with Helmet, global throttling, stricter auth throttles, and safer CORS handling.
- Upgraded key dependencies and TypeScript type packages to current stable versions.

### Fixed
- Addressed dependency audit findings via secure overrides and updates.
- Improved error handling and authorization behavior across API and web flows.
- Added CI post-build DB migration + smoke validation against PostgreSQL service.

[1.0.0]: https://github.com/CalosDev/AquiTaDo/releases/tag/v1.0.0
