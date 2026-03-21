# Manhwa Translation Platform Backend

## Project Overview
This is a community-driven manhwa translation platform backend built with NestJS. It features contributor gamification, automated crawling of source materials, chapter management, and a public API for reading.

### Core Technologies
- **Framework:** [NestJS](https://nestjs.com/) (Node.js)
- **Language:** TypeScript
- **Database:** PostgreSQL with [TypeORM](https://typeorm.io/)
- **Task Queue:** Redis with [Bull](https://github.com/OptimalBits/bull) (for crawling background jobs)
- **Crawling:** [Puppeteer](https://pptr.dev/) and [Cheerio](https://cheerio.js.org/)
- **Storage:** AWS S3 (for hosting chapter images)
- **Authentication:** JWT with Passport (Roles: `ADMIN`, `CONTRIBUTOR`, `EDITOR`, `TRANSLATOR`)
- **Deployment:** Dockerized, optimized for [Railway](https://railway.app)

### Domain & Architecture
The project follows a modular NestJS architecture, with features grouped by domain:
- **`crawler` / `chapter-crawler`**: Logic for fetching manhwa and chapter data from external sources.
- **`manhwa` / `chapter`**: Core entities for managing the library.
- **`wallet`**: Coin selling system, manual payment requests, and chapter unlocks.
- **`users` / `contributor` / `leaderboard`**: Gamification and user management.
- **`points` / `events`**: Community engagement and rewards.
- **`public`**: API for the reader frontend (supports locked chapters).
- **`s3`**: Integration for image uploads and CDN serving.

## Building and Running

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (optional for local Redis/Postgres)
- Access to AWS S3 and a Redis instance (local or remote)

### Local Setup
1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Environment Configuration:**
   Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` (PostgreSQL)
   - `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`
   - `JWT_SECRET`
   - AWS S3 credentials and bucket info.
3. **Database Initialization:**
   Start the app once to synchronize the schema:
   ```bash
   npm run start:dev
   ```
   Then seed the admin user:
   ```bash
   npm run seed:admin # Default: admin@manhwa.com / admin123
   ```

### Commands
- **Development:** `npm run start:dev` (with hot-reload)
- **Production:** `npm run build` && `npm run start:prod`
- **Testing:**
  - Unit tests: `npm run test`
  - E2E tests: `npm run test:e2e`
- **Linting & Formatting:** `npm run lint` / `npm run format`

## Development Conventions

### Code Style
- **NestJS Idioms:** Follow standard NestJS patterns (Modules, Controllers, Services, DTOs, Entities).
- **Validation:** Use `class-validator` and `class-transformer` in DTOs. All endpoints should have validated inputs.
- **Error Handling:** Use NestJS built-in `HttpException` classes.
- **Documentation:** Annotate controllers and DTOs with `@nestjs/swagger` decorators to maintain the API documentation at `/api`.

### Domain Logic (Payment & Status)
- **Chapter Status Flow:** `CRAWLED` -> `ASSIGNED` -> `SUBMITTED` -> `APPROVED` (or `CHANGES_REQUESTED`).
- **Payment Eligibility:** Only `APPROVED` chapters are eligible for payment/invoicing.
- **Coin System:**
  - Users have a `coinBalance`.
  - Chapters can be `isLocked` with a `coinPrice`.
  - Users request coins via `WalletController` (`PENDING` requests).
  - Admin manually approves requests to credit `coinBalance`.
  - Users spend coins to unlock chapters; unlocks are persistent.
- **Gamification:** Contributor levels (`BRONZE` to `DIAMOND`) are calculated based on the number of translated chapters.
- **Telegram Integration:** Users can be linked via `telegramId` for Mini App support.

### Testing
- New features should include unit tests in the same directory (e.g., `*.service.spec.ts`).
- Integration/E2E tests reside in the `test/` directory.

### Infrastructure
- **TypeORM Synchronize:** Enabled in non-production environments.
- **Migrations:** SQL migrations are stored in the `migrations/` directory when manual schema changes are needed.
- **Docker:** Use `docker-compose.yml` for local testing of the production-like environment.
