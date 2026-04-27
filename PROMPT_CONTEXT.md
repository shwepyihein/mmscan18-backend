# Prompt Context for This Backend

Use this file as a base prompt when asking an AI to work on this repo.

## Project Snapshot

- Stack: `NestJS` + `TypeScript` + `TypeORM` + `PostgreSQL`.
- Storage: `S3` keys in DB, full URL generated in responses.
- Auth: JWT with role guards (`ADMIN`, `USER`).
- API docs via Swagger decorators.

## Key Domains

- `public`: Reader-facing endpoints (catalog, chapter reading, chapter lists).
- `wallet`: Coin requests, admin approvals, chapter unlock, purchase invoices.
- `manhwa`: Catalog CRUD + chapter lock/unlock controls.
- `chapter`: Translation workflow, cleaning, review/publish lifecycle.

## Important Current Behaviors

### Public chapter access

- Endpoint: `GET /public/manhwa/:manhwaId/chapters/:chapterNo`
- If chapter is locked:
  - no user -> returns `403 Locked`
  - user without unlock -> returns `403 Locked`
  - user with unlock -> returns chapter data

### Public chapter list lock state

- `isUnlocked` key is removed from public list payloads.
- Only `isLocked` is returned, and it is resolved per-user:
  - unlocked chapters appear as `isLocked: false`
  - locked and not unlocked appear as `isLocked: true`

### Coins and unlocks

- `wallet.unlockChapter(userId, chapterId)` deducts coins and creates unlock record.
- Insufficient balance throws `BadRequestException('Insufficient coin balance')`.
- Chapter unlock status API:
  - `GET /wallet/chapters/:chapterId/unlock-status`

### Coin purchase flow

- User submits purchase request with invoice:
  - `POST /wallet/purchase-request` (multipart)
  - fields: `invoice`, `coinPackageId`, `currency`, `priceAmount`
- Admin manages requests:
  - list pending/all
  - approve/reject
  - edit pending package snapshot
- `proofImageUrl` response is full URL; DB keeps key.

### Chapter locking admin controls

- Combined APIs:
  - `PUT /manhwa/:id/chapters/lock` body `{ "isLocked": true|false }`
  - `PUT /manhwa/:id/chapters/:chapterId/lock` body `{ "isLocked": true|false }`

### Coin defaults

- New chapters default `coinPrice` to `5`.
- Existing rows with `coinPrice=0` were backfilled to `5`.

## File Map (high-value files)

- `src/public/public.controller.ts`
- `src/public/public.service.ts`
- `src/wallet/wallet.controller.ts`
- `src/wallet/wallet.service.ts`
- `src/manhwa/manhwa.controller.ts`
- `src/manhwa/manhwa.service.ts`
- `src/chapter/chapter.controller.ts`
- `src/chapter/chapter.service.ts`

## Prompt Template (copy/edit)

```md
You are modifying a NestJS backend.

Constraints:
- Keep existing module/service/controller structure.
- Validate DTOs with class-validator.
- Use Swagger decorators for new/changed endpoints.
- Keep DB stored S3 values as keys; convert to full URL in responses where applicable.
- Preserve current lock/unlock and wallet semantics.
- Avoid destructive behavior changes unless explicitly requested.

Task:
<YOUR TASK HERE>

Relevant files:
- <file 1>
- <file 2>

Acceptance:
- `npm run build` passes
- eslint passes for touched files
- mention endpoints changed
```

## Notes for Better AI Results

- Always include exact endpoint path(s) and expected request/response shape.
- Say whether behavior should be "strict guard only" vs "auto side effects" (important for chapter lock flow).
- If changing lock logic, specify if it should affect:
  - chapter read endpoint
  - chapter list endpoint
  - both

