# Architecture Review & Refactor Plan

**Date:** 2026-02-06  
**Reviewer:** Senior Staff Engineer  
**Status:** Production Code Review

---

## Architecture Summary

1. **Tech Stack:** Next.js 15 (App Router), TypeScript (strict mode disabled), React 19, Firebase (auth/storage), Webflow CMS integration, OpenAI API, JSONL file storage
2. **Structure:** Monolithic API route (`ai-chat/route.ts` ~2739 lines), mixed service organization (`lib/` + inline logic), component-heavy frontend with minimal separation of concerns
3. **Data Layer:** JSONL files for articles/prompts, Firebase Firestore for drafts, Webflow CMS for published content, file-based configs (`data/` directory)
4. **API Architecture:** 30+ API routes with inconsistent patterns, direct `process.env` access scattered, no centralized API client or response types
5. **Error Handling:** Basic error handler exists but inconsistently used, console.log/error everywhere, no structured logging or error tracking
6. **Type Safety:** TypeScript strict mode disabled, `any` types common, API responses untyped, interface definitions scattered across files
7. **Testing:** Test files exist (`test/`) but not integrated into CI, no test scripts in package.json, ESLint rules mostly disabled
8. **Environment Management:** Multiple env resolution patterns, no validation, defaults scattered, some using Zod (`src/utils/env.ts`), others direct access
9. **Code Quality:** ESLint rules disabled (`no-console: off`, `no-unused-vars: off`), no pre-commit hooks, no formatting standards (Prettier), large files (>2000 lines)
10. **Observability:** Console-based logging only, no structured logging, no error tracking service, performance monitoring exists but minimal

---

## Refactor Plan (Biggest Wins First)

### 1. **Centralized Environment Configuration** ⭐
- **Effort:** Medium | **Risk:** Low
- **Impact:** High - Foundation for all other improvements
- **Actions:**
  - Create `lib/config/env.ts` with Zod validation
  - Consolidate all env access through single source
  - Add runtime validation with clear error messages
  - Document required vs optional vars
- **Files:** `lib/config/env.ts`, update all `process.env` usages

### 2. **Structured Logging Service** ⭐
- **Effort:** Medium | **Risk:** Low
- **Impact:** High - Critical for production debugging
- **Actions:**
  - Create `lib/logger.ts` with log levels (debug/info/warn/error)
  - Replace all `console.log/error` with logger
  - Add request IDs, context, structured data
  - Support dev (console) vs prod (JSON) formats
- **Files:** `lib/logger.ts`, update ~50+ console.log calls

### 3. **Centralized API Error Handling & Types** ⭐
- **Effort:** Medium | **Risk:** Low
- **Impact:** High - Consistency, type safety, better UX
- **Actions:**
  - Create `lib/api/types.ts` for request/response types
  - Enhance `lib/api/error-handler.ts` with standardized error responses
  - Add API response wrapper types
  - Create error boundary utilities
- **Files:** `lib/api/types.ts`, `lib/api/error-handler.ts`, update API routes

### 4. **Split Monolithic API Route**
- **Effort:** Large | **Risk:** Medium
- **Impact:** High - Maintainability, testability
- **Actions:**
  - Extract research logic → `lib/services/research-service.ts`
  - Extract generation logic → `lib/services/generation-service.ts`
  - Extract quality check → `lib/services/quality-service.ts`
  - Keep route.ts as thin orchestrator
- **Files:** Split `app/api/ai-chat/route.ts` (2739 lines → ~200 lines + services)

### 5. **API Client Layer**
- **Effort:** Medium | **Risk:** Low
- **Impact:** Medium - Type safety, retry logic, consistency
- **Actions:**
  - Create `lib/api/client.ts` with typed fetch wrapper
  - Add retry logic, timeout handling
  - Generate types from API routes (or manual)
  - Replace direct fetch calls in components
- **Files:** `lib/api/client.ts`, update components

### 6. **Enable TypeScript Strict Mode**
- **Effort:** Large | **Risk:** Medium
- **Impact:** High - Catch bugs early, better DX
- **Actions:**
  - Enable `strict: true` in tsconfig.json
  - Fix type errors incrementally (start with lib/, then app/)
  - Add `@typescript-eslint/strict` rules
  - Remove `any` types systematically
- **Files:** `tsconfig.json`, fix ~100+ type errors

### 7. **Testing Infrastructure**
- **Effort:** Medium | **Risk:** Low
- **Impact:** Medium - Confidence in changes
- **Actions:**
  - Add Vitest/Jest config
  - Create test utilities (`test/utils.ts`)
  - Add CI test step
  - Write smoke tests for critical paths (API routes, services)
- **Files:** `vitest.config.ts`, `test/utils.ts`, update package.json

### 8. **Pre-commit Hooks & Formatting**
- **Effort:** Small | **Risk:** Low
- **Impact:** Medium - Code consistency, catch issues early
- **Actions:**
  - Add Husky + lint-staged
  - Add Prettier config
  - Run ESLint + type-check on commit
  - Format on save (VS Code settings)
- **Files:** `.husky/pre-commit`, `.prettierrc`, `.vscode/settings.json`

### 9. **Component Organization**
- **Effort:** Medium | **Risk:** Low
- **Impact:** Medium - Better DX, reusability
- **Actions:**
  - Create `components/ui/` for shared UI (Button, Card, etc.)
  - Create `components/features/` for feature-specific components
  - Extract hooks to `hooks/` directory
  - Document component patterns
- **Files:** Reorganize `components/` directory

### 10. **Documentation & Conventions**
- **Effort:** Small | **Risk:** Low
- **Impact:** Medium - Onboarding, consistency
- **Actions:**
  - Update README with setup, architecture, conventions
  - Add CONTRIBUTING.md with code style guide
  - Document API endpoints (OpenAPI/Swagger or markdown)
  - Add JSDoc to public APIs
- **Files:** `README.md`, `CONTRIBUTING.md`, `docs/api.md`

---

## Implementation Priority

**Phase 1 (Foundation - This PR):**
- ✅ Centralized Environment Configuration
- ✅ Structured Logging Service
- ✅ Centralized API Error Handling & Types

**Phase 2 (Next PR):**
- Split Monolithic API Route
- API Client Layer
- Enable TypeScript Strict Mode (incremental)

**Phase 3 (Future):**
- Testing Infrastructure
- Pre-commit Hooks & Formatting
- Component Organization
- Documentation & Conventions

---

## Metrics & Success Criteria

- **Code Quality:** ESLint errors < 10, TypeScript errors < 5
- **Maintainability:** No files > 500 lines, consistent patterns
- **Type Safety:** 0 `any` types in lib/, < 5% in app/
- **Observability:** All errors logged with context, structured format
- **DX:** Setup time < 5 min, clear error messages
