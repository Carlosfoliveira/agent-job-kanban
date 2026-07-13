import { and, eq, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { DbClient } from "../db/client";
import { bannedCompanies, emails, jobs, settings } from "../db/schema";

export const JOB_STATUSES = [
  "screened_out",
  "inbox",
  "applied",
  "action_needed",
  "waiting",
  "interview",
  "offer",
  "rejected",
  "archived",
] as const;

const jobStatusSchema = z.enum(JOB_STATUSES);

// The archived column grows without bound; sending every archived row makes
// the board render hundreds of dead cards. Only the most recently archived
// ones ship by default — ?archived=all opts into the full set.
export const ARCHIVED_DEFAULT_LIMIT = 10;

const createJobSchema = z.object({
  linkedinJobId: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().nullable().optional(),
  workplaceType: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  postedAt: z.string().nullable().optional(),
  status: jobStatusSchema.optional(),
  sortOrder: z.number().optional(),
});

const scoreBreakdownSchema = z.record(z.string(), z.unknown());

const patchJobSchema = z
  .object({
    status: jobStatusSchema.optional(),
    sortOrder: z.number().optional(),
    score: z.number().min(1).max(5).nullable().optional(),
    scoreBreakdown: scoreBreakdownSchema.nullable().optional(),
    techTags: z.array(z.string()).max(20).nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .refine(
    (data) =>
      data.status !== undefined ||
      data.sortOrder !== undefined ||
      data.score !== undefined ||
      data.scoreBreakdown !== undefined ||
      data.techTags !== undefined ||
      data.description !== undefined,
    {
      message:
        "At least one of status, sortOrder, score, scoreBreakdown, techTags, or description must be provided",
    },
  );

const scoreJobSchema = z.object({
  score: z.number().min(1).max(5),
  scoreBreakdown: scoreBreakdownSchema.optional(),
  techTags: z.array(z.string()).max(20).optional(),
});

const existsQuerySchema = z.object({
  linkedinJobId: z.string().min(1),
});

const searchQuerySchema = z.object({
  company: z.string().optional(),
  title: z.string().optional(),
});

const attachEmailSchema = z.object({
  gmailMessageId: z.string().min(1),
  gmailThreadId: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  sender: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  receivedAt: z.string().nullable().optional(),
  seen: z.boolean().optional(),
  classification: z
    .enum(["confirmation", "action_request", "interview", "rejection", "offer", "other"])
    .nullable()
    .optional(),
});

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (("code" in err &&
      typeof (err as { code?: unknown }).code === "string" &&
      (err as { code: string }).code.includes("SQLITE_CONSTRAINT")) ||
      err.message.includes("UNIQUE constraint failed"))
  );
}

async function findJobByLinkedinId(db: DbClient, linkedinJobId: string) {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.linkedinJobId, linkedinJobId))
    .get();
}

async function isCompanyBanned(db: DbClient, company: string): Promise<boolean> {
  const banned = await db
    .select()
    .from(bannedCompanies)
    .where(eq(sql`lower(${bannedCompanies.name})`, company.toLowerCase()))
    .get();
  return Boolean(banned);
}

export function createJobsRouter(db: DbClient) {
  const router = new Hono();

  // GET /api/jobs — all jobs with emailCount / unseenCount aggregates.
  // Archived jobs are capped at the ARCHIVED_DEFAULT_LIMIT most recently
  // updated unless ?archived=all is passed; archivedTotal always reports
  // the real count.
  router.get("/", async (c) => {
    const allArchived = c.req.query("archived") === "all";
    const rows = await db
      .select({
        id: jobs.id,
        linkedinJobId: jobs.linkedinJobId,
        title: jobs.title,
        company: jobs.company,
        location: jobs.location,
        workplaceType: jobs.workplaceType,
        description: jobs.description,
        url: jobs.url,
        postedAt: jobs.postedAt,
        status: jobs.status,
        sortOrder: jobs.sortOrder,
        score: jobs.score,
        scoreBreakdown: jobs.scoreBreakdown,
        techTags: jobs.techTags,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        emailCount: sql<number>`count(${emails.id})`.mapWith(Number),
        unseenCount: sql<number>`count(case when ${emails.seen} = 0 then 1 end)`.mapWith(
          Number,
        ),
      })
      .from(jobs)
      .leftJoin(emails, eq(emails.jobId, jobs.id))
      .groupBy(jobs.id)
      .orderBy(jobs.sortOrder, jobs.id);

    const archived = rows.filter((row) => row.status === "archived");
    let visible = rows;
    if (!allArchived && archived.length > ARCHIVED_DEFAULT_LIMIT) {
      const keep = new Set(
        [...archived]
          .sort(
            (a, b) =>
              (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
              b.id - a.id,
          )
          .slice(0, ARCHIVED_DEFAULT_LIMIT)
          .map((row) => row.id),
      );
      visible = rows.filter(
        (row) => row.status !== "archived" || keep.has(row.id),
      );
    }

    return c.json({ jobs: visible, archivedTotal: archived.length });
  });

  // GET /api/jobs/exists?linkedinJobId=X
  router.get("/exists", async (c) => {
    const parsed = existsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const existing = await findJobByLinkedinId(db, parsed.data.linkedinJobId);
    return c.json({ exists: Boolean(existing) });
  });

  // GET /api/jobs/search?company=&title=
  router.get("/search", async (c) => {
    const parsed = searchQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { company, title } = parsed.data;
    const conditions = [];
    if (company) {
      conditions.push(like(sql`lower(${jobs.company})`, `%${company.toLowerCase()}%`));
    }
    if (title) {
      conditions.push(like(sql`lower(${jobs.title})`, `%${title.toLowerCase()}%`));
    }

    const query = db.select().from(jobs);
    const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query);

    return c.json({ jobs: rows });
  });

  // POST /api/jobs — create, idempotent on linkedin_job_id.
  router.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createJobSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const data = parsed.data;

    const existing = await findJobByLinkedinId(db, data.linkedinJobId);
    if (existing) {
      // Reply with just the outcome + id; the scraper doesn't need the row
      // (esp. the multi-KB description) echoed back, and it wastes tokens.
      return c.json({ duplicate: true, id: existing.id });
    }

    if (await isCompanyBanned(db, data.company)) {
      return c.json({ banned: true });
    }

    const now = new Date().toISOString();

    try {
      const [job] = await db
        .insert(jobs)
        .values({
          linkedinJobId: data.linkedinJobId,
          title: data.title,
          company: data.company,
          location: data.location ?? null,
          workplaceType: data.workplaceType ?? null,
          description: data.description ?? null,
          url: data.url ?? null,
          postedAt: data.postedAt ?? null,
          status: data.status ?? "inbox",
          sortOrder: data.sortOrder ?? 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return c.json({ duplicate: false, id: job.id }, 201);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const raced = await findJobByLinkedinId(db, data.linkedinJobId);
        if (raced) {
          return c.json({ duplicate: true, id: raced.id });
        }
      }
      throw err;
    }
  });

  // PATCH /api/jobs/:id — update status and/or sortOrder.
  router.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: "Invalid job id" }, 400);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = patchJobSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { status, sortOrder, score, scoreBreakdown, techTags, description } = parsed.data;
    const updates: Partial<typeof jobs.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (status !== undefined) updates.status = status;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (score !== undefined) updates.score = score;
    if (scoreBreakdown !== undefined) updates.scoreBreakdown = scoreBreakdown;
    if (techTags !== undefined) updates.techTags = techTags;
    if (description !== undefined) updates.description = description;

    const [job] = await db
      .update(jobs)
      .set(updates)
      .where(eq(jobs.id, id))
      .returning();

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json({ job });
  });

  // POST /api/jobs/:id/score — set a job's score (and optional breakdown /
  // tech tags) in one atomic update. If the job is in "inbox" and the new
  // score is below the configured screen_out_threshold, it's moved to
  // "screened_out"; otherwise its status is left untouched.
  router.post("/:id/score", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: "Invalid job id" }, 400);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = scoreJobSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { score, scoreBreakdown, techTags } = parsed.data;

    const thresholdSetting = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "screen_out_threshold"))
      .get();
    const threshold = Number(thresholdSetting?.value ?? "3.0");

    const now = new Date().toISOString();

    const [job] = await db
      .update(jobs)
      .set({
        score,
        scoreBreakdown: scoreBreakdown ?? null,
        techTags: techTags ?? null,
        updatedAt: now,
        status: sql`CASE WHEN ${jobs.status} = 'inbox' AND ${score} < ${threshold} THEN 'screened_out' ELSE ${jobs.status} END`,
      })
      .where(eq(jobs.id, id))
      .returning();

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json({ job });
  });

  // DELETE /api/jobs/:id — remove a job. Attached emails are tombstoned
  // (job_id cleared, dismissed set) rather than deleted, so the gmail
  // agent's idempotency (keyed on gmail_message_id) keeps working.
  router.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: "Invalid job id" }, 400);
    }

    const job = await db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(emails)
        .set({ jobId: null, dismissed: 1 })
        .where(eq(emails.jobId, id));
      await tx.delete(jobs).where(eq(jobs.id, id));
    });

    return c.json({ deleted: true });
  });

  // POST /api/jobs/:id/emails — attach an email to a job, idempotent on
  // gmail_message_id.
  router.post("/:id/emails", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: "Invalid job id" }, 400);
    }

    const job = await db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = attachEmailSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const data = parsed.data;

    const existing = await db
      .select()
      .from(emails)
      .where(eq(emails.gmailMessageId, data.gmailMessageId))
      .get();
    if (existing) {
      return c.json({ duplicate: true, email: existing });
    }

    try {
      const [email] = await db
        .insert(emails)
        .values({
          jobId: id,
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
        const raced = await db
          .select()
          .from(emails)
          .where(eq(emails.gmailMessageId, data.gmailMessageId))
          .get();
        if (raced) {
          return c.json({ duplicate: true, email: raced });
        }
      }
      throw err;
    }
  });

  // POST /api/jobs/:id/emails/seen — mark all of a job's emails seen.
  router.post("/:id/emails/seen", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: "Invalid job id" }, 400);
    }

    const job = await db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    const updated = await db
      .update(emails)
      .set({ seen: 1 })
      .where(eq(emails.jobId, id))
      .returning();

    return c.json({ emails: updated });
  });

  return router;
}
