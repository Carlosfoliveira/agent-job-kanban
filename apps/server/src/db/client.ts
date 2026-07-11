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
//
// when adding a column, also add it to MIGRATIONS
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
    score REAL,
    score_breakdown TEXT,
    tech_tags TEXT,
    created_at TEXT DEFAULT (current_timestamp),
    updated_at TEXT DEFAULT (current_timestamp)
  );
`;

// when adding a column, also add it to MIGRATIONS
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
    classification TEXT,
    dismissed INTEGER NOT NULL DEFAULT 0
  );
`;

// when adding a column, also add it to MIGRATIONS
const CREATE_SETTINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

// when adding a column, also add it to MIGRATIONS
const CREATE_BANNED_COMPANIES_TABLE = `
  CREATE TABLE IF NOT EXISTS banned_companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT DEFAULT (current_timestamp)
  );
`;

const DEFAULT_SCREEN_OUT_THRESHOLD = "3.0";

// Columns added after the initial CREATE TABLE strings above shipped. Kept
// here so existing database files (which already ran the old CREATE TABLE
// and thus never see the new columns from it) get migrated forward too.
// Idempotent by construction: each entry is only applied if the column is
// missing from PRAGMA table_info.
const MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  { table: "jobs", column: "score", ddl: "ALTER TABLE jobs ADD COLUMN score REAL" },
  {
    table: "jobs",
    column: "score_breakdown",
    ddl: "ALTER TABLE jobs ADD COLUMN score_breakdown TEXT",
  },
  { table: "jobs", column: "tech_tags", ddl: "ALTER TABLE jobs ADD COLUMN tech_tags TEXT" },
  {
    table: "emails",
    column: "dismissed",
    ddl: "ALTER TABLE emails ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0",
  },
];

/**
 * Adds any columns present in the current schema but missing from an
 * existing database file (e.g. one created before those columns existed).
 * Safe to call every boot: each ALTER TABLE only runs if the column is
 * absent from PRAGMA table_info for its table.
 */
export function migrateDb(sqlite: Database): void {
  const existingColumns = new Map<string, Set<string>>();

  for (const { table } of MIGRATIONS) {
    if (existingColumns.has(table)) continue;
    const columns = sqlite
      .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => row.name);
    existingColumns.set(table, new Set(columns));
  }

  for (const migration of MIGRATIONS) {
    const columns = existingColumns.get(migration.table);
    if (columns && !columns.has(migration.column)) {
      sqlite.exec(migration.ddl);
      columns.add(migration.column);
    }
  }
}

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
  sqlite.exec(CREATE_SETTINGS_TABLE);
  sqlite.exec(CREATE_BANNED_COMPANIES_TABLE);
  migrateDb(sqlite);
  sqlite
    .query("INSERT OR IGNORE INTO settings (key, value) VALUES ('screen_out_threshold', ?)")
    .run(DEFAULT_SCREEN_OUT_THRESHOLD);

  return drizzle(sqlite, { schema });
}
