import { createApp } from "./app";
import { createDb } from "./db/client";
import type { emails, jobs } from "./db/schema";

// Builds a fresh app backed by an isolated in-memory sqlite database, for
// use in tests. Each call gets its own database so tests don't leak state.
export function createTestApp() {
  const db = createDb(":memory:");
  const app = createApp(db);
  return { app, db };
}

export type TestApp = ReturnType<typeof createTestApp>["app"];

export type JobRow = typeof jobs.$inferSelect;
export type EmailRow = typeof emails.$inferSelect;

export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
