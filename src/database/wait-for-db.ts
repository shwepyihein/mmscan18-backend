import { Client } from 'pg';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Block until PostgreSQL accepts connections (Docker / Railway cold start).
 * Set SKIP_DB_WAIT=true to skip (e.g. some tests). Requires DATABASE_URL.
 */
export async function waitForDatabase(options?: {
  maxAttempts?: number;
  delayMs?: number;
}): Promise<void> {
  if (process.env.SKIP_DB_WAIT === 'true') {
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    console.warn('[DB] DATABASE_URL is empty; skipping wait-for-db');
    return;
  }

  const maxAttempts = options?.maxAttempts ?? 40;
  const delayMs = options?.delayMs ?? 2500;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = new Client({
      connectionString: url,
      connectionTimeoutMillis: 15000,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      if (attempt > 1) {
        console.log(`[DB] PostgreSQL ready after ${attempt} attempt(s)`);
      }
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[DB] Waiting for PostgreSQL… (${attempt}/${maxAttempts}) ${msg}`,
      );
      if (attempt === maxAttempts) {
        throw new Error(
          `[DB] Could not reach PostgreSQL after ${maxAttempts} attempts: ${msg}`,
        );
      }
      await sleep(delayMs);
    } finally {
      await client.end().catch(() => {
        /* ignore */
      });
    }
  }
}
