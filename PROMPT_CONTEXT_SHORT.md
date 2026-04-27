# Prompt Context (Short)

Use this for fast prompts.

## Stack
- NestJS + TypeScript + TypeORM + PostgreSQL
- JWT auth + roles (`ADMIN`, `USER`)
- S3 keys in DB, full URL in API responses where needed

## Core Modules
- `public`: catalog + chapter read APIs
- `wallet`: coins, purchase requests, unlock logic
- `manhwa`: manhwa CRUD + chapter lock controls
- `chapter`: translation/review/publish workflow

## Current Critical Behaviors
- Locked chapter read (`GET /public/manhwa/:manhwaId/chapters/:chapterNo`)
  - no user -> `403 Locked`
  - user not unlocked -> `403 Locked`
  - user unlocked -> returns data
- Public chapter list returns only `isLocked` (no `isUnlocked`)
- Chapter lock APIs (combined):
  - `PUT /manhwa/:id/chapters/lock` with `{ isLocked }`
  - `PUT /manhwa/:id/chapters/:chapterId/lock` with `{ isLocked }`
- Chapter default `coinPrice = 5` (existing zero values already backfilled)

## Wallet Highlights
- Purchase request: `POST /wallet/purchase-request` (multipart invoice + package/price fields)
- Admin request list: `GET /wallet/admin/requests?status=...`
- Unlock status: `GET /wallet/chapters/:chapterId/unlock-status`

## Short Prompt Template
```md
You are editing a NestJS backend.

Rules:
- Keep existing controller/service/module structure.
- Keep validation + Swagger docs updated.
- Keep lock/unlock and wallet semantics unchanged unless explicitly requested.
- Build + lint must pass.

Task:
<your task>

Files:
- <file A>
- <file B>
```

