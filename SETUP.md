# Local Development Setup

## Prerequisites

- **Node.js** 20+ (check with `node --version`)

## Initial Setup

### 1. Install Node.js Dependencies

```bash
npm install
```

## Environment Variables

Copy `.env.example` to `.env` (if it exists) or create `.env` with:

```env
# Database
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=your-secret-key

# AWS S3
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET=your-bucket

# Redis (local)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password

# CDN
CDN_URL=https://your-cdn.cloudfront.net

# Application
PORT=8000
NODE_ENV=development
```

## Running the Application

### Development Mode (with hot reload)

```bash
npm run start:dev
```

### Production Mode

```bash
npm run build
npm run start:prod
```

### Run with Docker locally

Same image as Railway; useful to test the full stack locally without installing Node directly on your host.

**Prerequisites:** Docker (and Docker Compose). Create a `.env` in the project root with `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and any AWS/other vars your app needs.

**Build and run:**

```bash
# Build the image and start the container (first build can take 10–20 min)
npm run docker:up
```

Or step by step:

```bash
docker compose build    # or: npm run docker:build
docker compose up       # or: npm run docker:run
```

The app will be at **http://localhost:8000**. To stop: `Ctrl+C` or `docker compose down`.

**Note:** Database and Redis must be reachable from the host (e.g. local Postgres/Redis or tunneled URLs in `.env`). The container does not start Postgres/Redis for you.

## Troubleshooting

### Permission Errors

If you get permission errors while running setup commands:

- Run the command with a user that has write access to the project directory
- Ensure `node_modules` and lockfile paths are writable

## Deploying to Railway

The app is set up to deploy on [Railway](https://railway.app) using the **Dockerfile** (Railway will detect and build from it).

### What the Docker image does

- **Base:** `node:20-bookworm-slim`.
- **Build:** Runs `npm ci`, copies source, and `npm run build`.
- **Run:** Starts with `node dist/main.js`.

### Required environment variables (Railway)

Set these in your Railway project (Variables tab):

- `DATABASE_URL` – PostgreSQL connection string
- Optional: `SKIP_DB_WAIT=true` – skip the startup “wait for PostgreSQL” loop (e.g. local tests)
- `REDIS_URL` – Redis connection string (e.g. Railway Redis plugin)
- `JWT_SECRET`
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`
- Optional: `CDN_URL`, `PORT` (Railway often sets `PORT` for you)

### Deploy steps

1. Connect your repo to Railway.
2. Add a PostgreSQL and (if needed) Redis plugin; copy `DATABASE_URL` and `REDIS_URL` into Variables.
3. Set the other env vars above.
4. Deploy; Railway will build from the `Dockerfile` automatically.

---

## Project Structure

```
.
├── src/
│   └── ...
├── Dockerfile               # Railway / Docker build
├── .dockerignore
└── package.json
```
