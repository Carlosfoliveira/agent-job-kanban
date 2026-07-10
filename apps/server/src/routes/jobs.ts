import { and, eq, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { DbClient } from "../db/client";
import { emails, jobs } from "../db/schema";

export const JOB_STATUSES = [
  "inbox",
  "applied",
  "action_needed",
  "waiting",
  "interview",
  "offer",
  "rejected",
] as const;

const jobStatusSchema = z.enum(JOB_STATUSES);

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

const patchJobSchema = z
  .object({
    status: jobStatusSchema.optional(),
    sortOrder: z.number().optional(),
  })
  .refine((data) => data.status !== undefined || data.sortOrder !== undefined, {
    message: "At least one of status or sortOrder must be provided",
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

export function createJobsRouter(db: DbClient) {
  const router = new Hono();

  // GET /api/jobs — all jobs with emailCount / unseenCount aggregates.
  router.get("/", async (c) => {
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

    return c.json({ jobs: rows });
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
      return c.json({ duplicate: true, job: existing });
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

      return c.json({ duplicate: false, job }, 201);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const raced = await findJobByLinkedinId(db, data.linkedinJobId);
        if (raced) {
          return c.json({ duplicate: true, job: raced });
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

    const { status, sortOrder } = parsed.data;
    const updates: Partial<typeof jobs.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (status !== undefined) updates.status = status;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

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
