import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { migrateDb } from "./db/client";

// Frozen snapshot of the tables as they existed before score/scoreBreakdown/
// techTags/dismissed/settings shipped. Used to verify migrateDb() brings an
// old database file forward without dropping data.
const LEGACY_JOBS_TABLE = `
  CREATE TABLE jobs (
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

const LEGACY_EMAILS_TABLE = `
  CREATE TABLE emails (
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

function columnNames(sqlite: Database, table: string): Set<string> {
  const rows = sqlite.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  return new Set(rows.map((r) => r.name));
}

describe("migrateDb", () => {
  it("adds the new columns to a legacy-schema database", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(LEGACY_JOBS_TABLE);
    sqlite.exec(LEGACY_EMAILS_TABLE);

    // sanity: legacy schema really is missing the new columns
    expect(columnNames(sqlite, "jobs").has("score")).toBe(false);
    expect(columnNames(sqlite, "emails").has("dismissed")).toBe(false);

    migrateDb(sqlite);

    const jobColumns = columnNames(sqlite, "jobs");
    expect(jobColumns.has("score")).toBe(true);
    expect(jobColumns.has("score_breakdown")).toBe(true);
    expect(jobColumns.has("tech_tags")).toBe(true);

    const emailColumns = columnNames(sqlite, "emails");
    expect(emailColumns.has("dismissed")).toBe(true);
  });

  it("is idempotent when run twice", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(LEGACY_JOBS_TABLE);
    sqlite.exec(LEGACY_EMAILS_TABLE);

    migrateDb(sqlite);
    expect(() => migrateDb(sqlite)).not.toThrow();
  });

  it("roundtrips inserts through the migrated columns", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(LEGACY_JOBS_TABLE);
    sqlite.exec(LEGACY_EMAILS_TABLE);
    migrateDb(sqlite);

    sqlite
      .query(
        `INSERT INTO jobs (linkedin_job_id, title, company, score, score_breakdown, tech_tags)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("job-1", "Engineer", "Acme", 4.5, '{"culture":5}', '["typescript"]');

    const job = sqlite
      .query<
        { score: number; score_breakdown: string; tech_tags: string },
        []
      >("SELECT score, score_breakdown, tech_tags FROM jobs WHERE linkedin_job_id = 'job-1'")
      .get();

    expect(job?.score).toBe(4.5);
    expect(job?.score_breakdown).toBe('{"culture":5}');
    expect(job?.tech_tags).toBe('["typescript"]');

    sqlite
      .query(
        `INSERT INTO emails (gmail_message_id, dismissed) VALUES (?, ?)`,
      )
      .run("gm-1", 1);

    const email = sqlite
      .query<{ dismissed: number }, []>(
        "SELECT dismissed FROM emails WHERE gmail_message_id = 'gm-1'",
      )
      .get();
    expect(email?.dismissed).toBe(1);
  });
});
