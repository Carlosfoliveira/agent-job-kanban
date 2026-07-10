import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { DbClient } from "../db/client";
import { emails } from "../db/schema";

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (("code" in err &&
      typeof (err as { code?: unknown }).code === "string" &&
      (err as { code: string }).code.includes("SQLITE_CONSTRAINT")) ||
      err.message.includes("UNIQUE constraint failed"))
  );
}

const classificationSchema = z
  .enum(["confirmation", "action_request", "interview", "rejection", "offer", "other"])
  .nullable()
  .optional();

const createEmailSchema = z.object({
  jobId: z.number().int().nullable().optional(),
  gmailMessageId: z.string().min(1),
  gmailThreadId: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  sender: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  receivedAt: z.string().nullable().optional(),
  seen: z.boolean().optional(),
  classification: classificationSchema,
});

const patchEmailSchema = z
  .object({
    jobId: z.number().int().nullable().optional(),
    seen: z.boolean().optional(),
    dismissed: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.jobId !== undefined || data.seen !== undefined || data.dismissed !== undefined,
    {
      message: "At least one of jobId, seen, or dismissed must be provided",
    },
  );

async function findEmailByGmailMessageId(db: DbClient, gmailMessageId: string) {
  return db
    .select()
    .from(emails)
    .where(eq(emails.gmailMessageId, gmailMessageId))
    .get();
}

export function createEmailsRouter(db: DbClient) {
  const router = new Hono();

  // GET /api/emails/unmatched — emails with no job_id, excluding dismissed.
  router.get("/unmatched", async (c) => {
    const rows = await db
      .select()
      .from(emails)
      .where(and(isNull(emails.jobId), eq(emails.dismissed, 0)));
    return c.json({ emails: rows });
  });

  // POST /api/emails — insert an unmatched email (job_id null), idempotent
  // on gmail_message_id.
  router.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createEmailSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const data = parsed.data;

    const existing = await findEmailByGmailMessageId(db, data.gmailMessageId);
    if (existing) {
      return c.json({ duplicate: true, email: existing });
    }

    try {
      const [email] = await db
        .insert(emails)
        .values({
          jobId: data.jobId ?? null,
          gmailMessageId: data.gmailMessageId,
          gmailThreadId: data.gmailThreadId ?? null,
          subject: data.subject ?? null,
          sender: data.sender ?? null,
          snippet: data.snippet ?? null,
          receivedAt: data.receivedAt ?? null,
          seen: data.seen ? 1 : 0,
          classification: data.classification ?? null,
        })
        .returning();

      return c.json({ duplicate: false, email }, 201);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const raced = await findEmailByGmailMessageId(db, data.gmailMessageId);
        if (raced) {
          return c.json({ duplicate: true, email: raced });
        }
      }
      throw err;
    }
  });

  // PATCH /api/emails/:id — set job_id and/or seen.
  router.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: "Invalid email id" }, 400);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = patchEmailSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { jobId, seen, dismissed } = parsed.data;
    const updates: Partial<typeof emails.$inferInsert> = {};
    if (jobId !== undefined) updates.jobId = jobId;
    if (seen !== undefined) updates.seen = seen ? 1 : 0;
    if (dismissed !== undefined) updates.dismissed = dismissed ? 1 : 0;

    const [email] = await db
      .update(emails)
      .set(updates)
      .where(eq(emails.id, id))
      .returning();

    if (!email) {
      return c.json({ error: "Email not found" }, 404);
    }

    return c.json({ email });
  });

  return router;
}
