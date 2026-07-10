import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import path from "node:path";
import * as schema from "./schema";

// Resolved relative to this file (apps/server/src/db/client.ts) so the
// default works regardless of where the repo is cloned or the cwd the
// process is started from: apps/server/src/db -> repo root/data/app.db.
const DEFAULT_DB_PATH = path.resolve(
  import.meta.dir,
  "../../../../data/app.db",
);

// Raw DDL kept in sync with ./schema.ts. Executed on boot so a fresh
// database file (or an in-memory database used in tests) always has the
// tables it needs, without requiring a separate migration step.
const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    linkedin_job_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    workplace_type TEXT,
    description TEXT,
    url TEXT,
    posted_at TEXT,
    status TEXT NOT NULL DEFAULT 'inbox',
    sort_order REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (current_timestamp),
    updated_at TEXT DEFAULT (current_timestamp)
  );
`;

const CREATE_EMAILS_TABLE = `
  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER REFERENCES jobs(id),
    gmail_message_id TEXT NOT NULL UNIQUE,
    gmail_thread_id TEXT,
    subject TEXT,
    sender TEXT,
    snippet TEXT,
    received_at TEXT,
    seen INTEGER NOT NULL DEFAULT 0,
    classification TEXT
  );
`;

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Creates a drizzle client over bun:sqlite and ensures the schema exists.
 *
 * @param dbPath File path for the sqlite database, or ":memory:" for an
 *   ephemeral in-memory database (used by tests). Defaults to env DB_PATH,
 *   falling back to data/app.db at the repo root.
 */
export function createDb(
  dbPath: string = process.env.DB_PATH ?? DEFAULT_DB_PATH,
): DbClient {
  const sqlite = new Database(dbPath, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(CREATE_JOBS_TABLE);
  sqlite.exec(CREATE_EMAILS_TABLE);

  return drizzle(sqlite, { schema });
}
