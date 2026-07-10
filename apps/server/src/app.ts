import { Hono } from "hono";
import { cors } from "hono/cors";
import type { DbClient } from "./db/client";
import { createEmailsRouter } from "./routes/emails";
import { createJobsRouter } from "./routes/jobs";
import { createSettingsRouter } from "./routes/settings";

// Factory so tests can inject an in-memory db instead of the real one.
export function createApp(db: DbClient) {
  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      origin: "http://localhost:5173",
    }),
  );

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.route("/api/jobs", createJobsRouter(db));
  app.route("/api/emails", createEmailsRouter(db));
  app.route("/api/settings", createSettingsRouter(db));

  return app;
}

export type App = ReturnType<typeof createApp>;
