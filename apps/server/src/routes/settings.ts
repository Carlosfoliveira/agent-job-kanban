import { and, eq, gte, isNotNull, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { DbClient } from "../db/client";
import { jobs, settings } from "../db/schema";

const SCREEN_OUT_THRESHOLD_KEY = "screen_out_threshold";
const DEFAULT_SCREEN_OUT_THRESHOLD = 3.0;

const patchSettingsSchema = z.object({
  screenOutThreshold: z.number().min(1).max(5),
});

async function readScreenOutThreshold(db: DbClient): Promise<number> {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, SCREEN_OUT_THRESHOLD_KEY))
    .get();
  return row?.value !== undefined && row.value !== null
    ? Number(row.value)
    : DEFAULT_SCREEN_OUT_THRESHOLD;
}

export function createSettingsRouter(db: DbClient) {
  const router = new Hono();

  // GET /api/settings — current screen-out threshold.
  router.get("/", async (c) => {
    const screenOutThreshold = await readScreenOutThreshold(db);
    return c.json({ screenOutThreshold });
  });

  // PATCH /api/settings — update the screen-out threshold and reconcile
  // existing scored jobs against the new value.
  router.patch("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = patchSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { screenOutThreshold } = parsed.data;
    const now = new Date().toISOString();

    const moved = await db.transaction(async (tx) => {
      await tx
        .insert(settings)
        .values({ key: SCREEN_OUT_THRESHOLD_KEY, value: String(screenOutThreshold) })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: String(screenOutThreshold) },
        });

      const toScreenedOut = await tx
        .update(jobs)
        .set({ status: "screened_out", updatedAt: now })
        .where(
          and(
            eq(jobs.status, "inbox"),
            isNotNull(jobs.score),
            lt(jobs.score, screenOutThreshold),
          ),
        )
        .returning();

      const toInbox = await tx
        .update(jobs)
        .set({ status: "inbox", updatedAt: now })
        .where(
          and(
            eq(jobs.status, "screened_out"),
            isNotNull(jobs.score),
            gte(jobs.score, screenOutThreshold),
          ),
        )
        .returning();

      return {
        toScreenedOut: toScreenedOut.length,
        toInbox: toInbox.length,
      };
    });

    return c.json({ screenOutThreshold, moved });
  });

  return router;
}
