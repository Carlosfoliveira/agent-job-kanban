import { describe, expect, it } from "bun:test";
import { createTestApp, readJson, type EmailRow, type JobRow, type TestApp } from "./test-utils";

type JobResponse = { duplicate: boolean; job: JobRow };
type EmailResponse = { duplicate: boolean; email: EmailRow };
type EmailsListResponse = { emails: EmailRow[] };

function jobPayload(overrides: Record<string, unknown> = {}) {
  return {
    linkedinJobId: "job-1",
    title: "Software Engineer",
    company: "Acme Corp",
    ...overrides,
  };
}

async function postJson(app: TestApp, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createJob(app: TestApp): Promise<JobRow> {
  const res = await postJson(app, "/api/jobs", jobPayload());
  const body = await readJson<JobResponse>(res);
  return body.job;
}

describe("POST /api/jobs/:id/emails", () => {
  it("attaches an email to a job", async () => {
    const { app } = createTestApp();
    const job = await createJob(app);

    const res = await postJson(app, `/api/jobs/${job.id}/emails`, {
      gmailMessageId: "gm-1",
      subject: "Application received",
    });

    expect(res.status).toBe(201);
    const body = await readJson<EmailResponse>(res);
    expect(body.duplicate).toBe(false);
    expect(body.email.jobId).toBe(job.id);
  });

  it("is idempotent on gmail_message_id", async () => {
    const { app } = createTestApp();
    const job = await createJob(app);

    const first = await postJson(app, `/api/jobs/${job.id}/emails`, {
      gmailMessageId: "gm-1",
      subject: "Application received",
    });
    const firstBody = await readJson<EmailResponse>(first);

    const second = await postJson(app, `/api/jobs/${job.id}/emails`, {
      gmailMessageId: "gm-1",
      subject: "Different subject",
    });

    expect(second.status).toBe(200);
    const secondBody = await readJson<EmailResponse>(second);
    expect(secondBody.duplicate).toBe(true);
    expect(secondBody.email.id).toBe(firstBody.email.id);
    expect(secondBody.email.subject).toBe("Application received");
  });

  it("404s when the job does not exist", async () => {
    const { app } = createTestApp();
    const res = await postJson(app, "/api/jobs/999/emails", {
      gmailMessageId: "gm-1",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/emails", () => {
  it("inserts an unmatched email with job_id null", async () => {
    const { app } = createTestApp();
    const res = await postJson(app, "/api/emails", {
      gmailMessageId: "gm-unmatched",
      subject: "Mystery email",
    });

    expect(res.status).toBe(201);
    const body = await readJson<EmailResponse>(res);
    expect(body.duplicate).toBe(false);
    expect(body.email.jobId).toBeNull();
  });

  it("is idempotent on gmail_message_id", async () => {
    const { app } = createTestApp();
    await postJson(app, "/api/emails", { gmailMessageId: "gm-unmatched" });
    const res = await postJson(app, "/api/emails", { gmailMessageId: "gm-unmatched" });

    expect(res.status).toBe(200);
    const body = await readJson<EmailResponse>(res);
    expect(body.duplicate).toBe(true);
  });
});

describe("GET /api/emails/unmatched", () => {
  it("returns only emails with job_id null", async () => {
    const { app } = createTestApp();
    const job = await createJob(app);
    await postJson(app, `/api/jobs/${job.id}/emails`, { gmailMessageId: "matched-1" });
    await postJson(app, "/api/emails", { gmailMessageId: "unmatched-1" });
    await postJson(app, "/api/emails", { gmailMessageId: "unmatched-2" });

    const res = await app.request("/api/emails/unmatched");
    const body = await readJson<EmailsListResponse>(res);

    expect(body.emails).toHaveLength(2);
    expect(body.emails.every((e) => e.jobId === null)).toBe(true);
  });
});

describe("PATCH /api/emails/:id", () => {
  it("sets seen", async () => {
    const { app } = createTestApp();
    const created = await readJson<EmailResponse>(
      await postJson(app, "/api/emails", { gmailMessageId: "gm-1" }),
    );

    const res = await app.request(`/api/emails/${created.email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seen: true }),
    });

    expect(res.status).toBe(200);
    const body = await readJson<{ email: EmailRow }>(res);
    expect(body.email.seen).toBe(1);
  });

  it("sets jobId to match an unmatched email to a job", async () => {
    const { app } = createTestApp();
    const job = await createJob(app);
    const created = await readJson<EmailResponse>(
      await postJson(app, "/api/emails", { gmailMessageId: "gm-1" }),
    );

    const res = await app.request(`/api/emails/${created.email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id }),
    });

    const body = await readJson<{ email: EmailRow }>(res);
    expect(body.email.jobId).toBe(job.id);
  });

  it("dismissing an email excludes it from /unmatched", async () => {
    const { app } = createTestApp();
    const created = await readJson<EmailResponse>(
      await postJson(app, "/api/emails", { gmailMessageId: "gm-dismiss" }),
    );

    const res = await app.request(`/api/emails/${created.email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed: true }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<{ email: EmailRow }>(res);
    expect(body.email.dismissed).toBe(1);

    const unmatchedRes = await app.request("/api/emails/unmatched");
    const unmatchedBody = await readJson<EmailsListResponse>(unmatchedRes);
    expect(unmatchedBody.emails.find((e) => e.id === created.email.id)).toBeUndefined();
  });
});

describe("POST /api/jobs/:id/emails/seen", () => {
  it("marks all of a job's emails seen", async () => {
    const { app } = createTestApp();
    const job = await createJob(app);
    await postJson(app, `/api/jobs/${job.id}/emails`, {
      gmailMessageId: "gm-1",
      seen: false,
    });
    await postJson(app, `/api/jobs/${job.id}/emails`, {
      gmailMessageId: "gm-2",
      seen: false,
    });

    const res = await app.request(`/api/jobs/${job.id}/emails/seen`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await readJson<EmailsListResponse>(res);
    expect(body.emails).toHaveLength(2);
    expect(body.emails.every((e) => e.seen === 1)).toBe(true);
  });
});
