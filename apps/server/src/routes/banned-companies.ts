import { and, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { DbClient } from "../db/client";
import { bannedCompanies, jobs } from "../db/schema";

const banCompanySchema = z.object({
  company: z.string().min(1),
});

export function createBannedCompaniesRouter(db: DbClient) {
  const router = new Hono();

  // GET /api/banned-companies — all bans.
  router.get("/", async (c) => {
    const companies = await db.select().from(bannedCompanies);
    return c.json({ companies });
  });

  // POST /api/banned-companies — ban a company: insert the ban (idempotent
  // — the name column is COLLATE NOCASE UNIQUE, so a repeat ban is a no-op)
  // and archive every non-archived job of that company, in one transaction.
  router.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = banCompanySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { company } = parsed.data;
    const now = new Date().toISOString();

    // The callback must stay synchronous: bun-sqlite transactions COMMIT as
    // soon as the callback returns, so an async callback (which returns a
    // pending promise at its first await) would run both statements outside
    // the transaction. `.all()` executes each statement synchronously.
    const { isNew, archived } = db.transaction((tx) => {
      // Explicit lower() lookup so case-insensitive idempotency holds even
      // on a table built without the COLLATE NOCASE constraint (e.g. via
      // drizzle-kit from schema.ts); onConflictDoNothing stays as backstop.
      const existing = tx
        .select({ id: bannedCompanies.id })
        .from(bannedCompanies)
        .where(eq(sql`lower(${bannedCompanies.name})`, company.toLowerCase()))
        .get();

      const [inserted] = existing
        ? [undefined]
        : tx
            .insert(bannedCompanies)
            .values({ name: company, createdAt: now })
            .onConflictDoNothing()
            .returning()
            .all();

      const archivedRows = tx
        .update(jobs)
        .set({ status: "archived", updatedAt: now })
        .where(
          and(
            eq(sql`lower(${jobs.company})`, company.toLowerCase()),
            ne(jobs.status, "archived"),
          ),
        )
        .returning()
        .all();

      return { isNew: Boolean(inserted), archived: archivedRows.length };
    });

    return c.json({ banned: true, archived }, isNew ? 201 : 200);
  });

  // DELETE /api/banned-companies/:id — unban. Does not unarchive cards.
  router.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: "Invalid banned company id" }, 400);
    }

    const [deleted] = await db
      .delete(bannedCompanies)
      .where(eq(bannedCompanies.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: "Banned company not found" }, 404);
    }

    return c.json({ deleted: true });
  });

  return router;
}
