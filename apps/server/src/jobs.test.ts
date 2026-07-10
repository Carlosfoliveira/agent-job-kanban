import { describe, expect, it } from "bun:test";
import { createTestApp, readJson, type JobRow, type TestApp } from "./test-utils";

type JobResponse = { duplicate: boolean; id: number };
type JobsListResponse = {
  jobs: (JobRow & { emailCount: number; unseenCount: number })[];
};
type ExistsResponse = { exists: boolean };

function jobPayload(overrides: Record<string, unknown> = {}) {
  return {
    linkedinJobId: "job-1",
    title: "Software Engineer",
    company: "Acme Corp",
    location: "Remote",
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

describe("POST /api/jobs", () => {
  it("inserts a new job and returns 201 with just the outcome and id", async () => {
    const { app } = createTestApp();
    const res = await postJson(app, "/api/jobs", jobPayload());

    expect(res.status).toBe(201);
    const data = await readJson<JobResponse>(res);
    expect(data.duplicate).toBe(false);
    expect(data.id).toBeGreaterThan(0);
    // The response carries no echoed row — just success + id.
    expect(Object.keys(data).sort()).toEqual(["duplicate", "id"]);
  });

  it("does not echo the job body or description on insert", async () => {
    const { app } = createTestApp();
    const res = await postJson(
      app,
      "/api/jobs",
      jobPayload({ description: "x".repeat(5000) }),
    );

    const data = await readJson<Record<string, unknown>>(res);
    expect(data.job).toBeUndefined();
    expect(data.description).toBeUndefined();

    // The full description is still stored and returned by GET /api/jobs.
    const list = await readJson<JobsListResponse>(await app.request("/api/jobs"));
    const stored = list.jobs.find((j) => j.id === (data.id as number));
    expect(stored?.description).toBe("x".repeat(5000));
  });

  it("returns duplicate:true with the existing id on repeat insert", async () => {
    const { app } = createTestApp();
    const first = await postJson(app, "/api/jobs", jobPayload());
    const firstBody = await readJson<JobResponse>(first);

    const second = await postJson(
      app,
      "/api/jobs",
      jobPayload({ title: "Different Title" }),
    );

    expect(second.status).toBe(200);
    const secondBody = await readJson<JobResponse>(second);
    expect(secondBody.duplicate).toBe(true);
    expect(secondBody.id).toBe(firstBody.id);

    // The original row is untouched, not overwritten with the new payload.
    const list = await readJson<JobsListResponse>(await app.request("/api/jobs"));
    const stored = list.jobs.find((j) => j.id === firstBody.id);
    expect(stored?.title).toBe("Software Engineer");
  });

  it("rejects invalid payloads with 400", async () => {
    const { app } = createTestApp();
    const res = await postJson(app, "/api/jobs", { title: "Missing fields" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/jobs/exists", () => {
  it("returns false when the job does not exist", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/jobs/exists?linkedinJobId=nope");
    expect(res.status).toBe(200);
    expect(await readJson<ExistsResponse>(res)).toEqual({ exists: false });
  });

  it("returns true once the job has been created", async () => {
    const { app } = createTestApp();
    await postJson(app, "/api/jobs", jobPayload());

    const res = await app.request("/api/jobs/exists?linkedinJobId=job-1");
    expect(await readJson<ExistsResponse>(res)).toEqual({ exists: true });
  });
});

describe("PATCH /api/jobs/:id", () => {
  it("updates status and bumps updated_at", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload()),
    );

    const res = await app.request(`/api/jobs/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });

    expect(res.status).toBe(200);
    const body = await readJson<{ job: JobRow }>(res);
    expect(body.job.status).toBe("applied");
    expect(typeof body.job.updatedAt).toBe("string");
    expect(Number.isNaN(new Date(body.job.updatedAt ?? "").getTime())).toBe(false);
  });

  it("updates sortOrder", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload()),
    );

    const res = await app.request(`/api/jobs/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sortOrder: 42.5 }),
    });

    const body = await readJson<{ job: JobRow }>(res);
    expect(body.job.sortOrder).toBe(42.5);
  });

  it("updates description", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload()),
    );

    const res = await app.request(`/api/jobs/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Full re-scraped description text" }),
    });

    expect(res.status).toBe(200);
    const body = await readJson<{ job: JobRow }>(res);
    expect(body.job.description).toBe("Full re-scraped description text");
  });

  it("404s for an unknown job", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/jobs/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/jobs/search", () => {
  it("matches company case-insensitively on partial input", async () => {
    const { app } = createTestApp();
    await postJson(app, "/api/jobs", jobPayload({ linkedinJobId: "j1", company: "Acme Corp" }));
    await postJson(
      app,
      "/api/jobs",
      jobPayload({ linkedinJobId: "j2", company: "Other Inc", title: "PM" }),
    );

    const res = await app.request("/api/jobs/search?company=acme");
    expect(res.status).toBe(200);
    const body = await readJson<{ jobs: JobRow[] }>(res);
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]?.company).toBe("Acme Corp");
  });

  it("matches title case-insensitively on partial input", async () => {
    const { app } = createTestApp();
    await postJson(
      app,
      "/api/jobs",
      jobPayload({ linkedinJobId: "j1", title: "Senior Backend Engineer" }),
    );

    const res = await app.request("/api/jobs/search?title=BACKEND");
    const body = await readJson<{ jobs: JobRow[] }>(res);
    expect(body.jobs).toHaveLength(1);
  });
});

describe("POST /api/jobs/:id/score", () => {
  it("moves an inbox job below threshold to screened_out", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload()),
    );

    const res = await postJson(app, `/api/jobs/${created.id}/score`, {
      score: 2.5,
      scoreBreakdown: { culture: 2, tech: 3 },
      techTags: ["typescript", "react"],
    });

    expect(res.status).toBe(200);
    const body = await readJson<{ job: JobRow }>(res);
    expect(body.job.status).toBe("screened_out");
    expect(body.job.score).toBe(2.5);
    expect(body.job.scoreBreakdown).toEqual({ culture: 2, tech: 3 });
    expect(body.job.techTags).toEqual(["typescript", "react"]);
  });

  it("keeps an inbox job at the threshold boundary in inbox", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload()),
    );

    const res = await postJson(app, `/api/jobs/${created.id}/score`, {
      score: 3.0,
    });

    expect(res.status).toBe(200);
    const body = await readJson<{ job: JobRow }>(res);
    expect(body.job.status).toBe("inbox");
    expect(body.job.score).toBe(3.0);
  });

  it("saves the score without moving a non-inbox job", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload()),
    );
    await app.request(`/api/jobs/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });

    const res = await postJson(app, `/api/jobs/${created.id}/score`, {
      score: 2.5,
    });

    expect(res.status).toBe(200);
    const body = await readJson<{ job: JobRow }>(res);
    expect(body.job.status).toBe("applied");
    expect(body.job.score).toBe(2.5);
  });

  it("rejects an out-of-range score with 400", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload()),
    );

    const res = await postJson(app, `/api/jobs/${created.id}/score`, {
      score: 6,
    });

    expect(res.status).toBe(400);
  });

  it("404s for an unknown job", async () => {
    const { app } = createTestApp();
    const res = await postJson(app, "/api/jobs/999/score", { score: 4 });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/jobs/:id", () => {
  it("deletes the job and tombstones attached emails", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload()),
    );
    const jobId = created.id;

    await postJson(app, `/api/jobs/${jobId}/emails`, { gmailMessageId: "gm-1" });
    await postJson(app, `/api/jobs/${jobId}/emails`, { gmailMessageId: "gm-2" });

    const res = await app.request(`/api/jobs/${jobId}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await readJson<{ deleted: boolean }>(res)).toEqual({ deleted: true });

    const listRes = await app.request("/api/jobs");
    const list = await readJson<JobsListResponse>(listRes);
    expect(list.jobs.find((j) => j.id === jobId)).toBeUndefined();

    const unmatchedRes = await app.request("/api/emails/unmatched");
    const unmatched = await readJson<{
      emails: { gmailMessageId: string; jobId: number | null; dismissed: number }[];
    }>(unmatchedRes);
    expect(unmatched.emails.find((e) => e.gmailMessageId === "gm-1")).toBeUndefined();
    expect(unmatched.emails.find((e) => e.gmailMessageId === "gm-2")).toBeUndefined();

    // Re-posting the same gmailMessageId is still idempotent against the
    // surviving (tombstoned) email row, not treated as brand new.
    const repost = await postJson(app, "/api/emails", { gmailMessageId: "gm-1" });
    const repostBody = await readJson<{ duplicate: boolean }>(repost);
    expect(repostBody.duplicate).toBe(true);
  });

  it("404s for an unknown job", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/jobs/999", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/jobs email aggregates", () => {
  it("includes emailCount and unseenCount per job", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload()),
    );
    const jobId = created.id;

    await postJson(app, `/api/jobs/${jobId}/emails`, {
      gmailMessageId: "m1",
      subject: "Application received",
      seen: true,
    });
    await postJson(app, `/api/jobs/${jobId}/emails`, {
      gmailMessageId: "m2",
      subject: "Interview request",
      seen: false,
    });

    const res = await app.request("/api/jobs");
    const body = await readJson<JobsListResponse>(res);
    const job = body.jobs.find((j) => j.id === jobId);
    expect(job?.emailCount).toBe(2);
    expect(job?.unseenCount).toBe(1);
  });

  it("reports zero counts for a job with no emails", async () => {
    const { app } = createTestApp();
    await postJson(app, "/api/jobs", jobPayload());

    const res = await app.request("/api/jobs");
    const body = await readJson<JobsListResponse>(res);
    expect(body.jobs[0]?.emailCount).toBe(0);
    expect(body.jobs[0]?.unseenCount).toBe(0);
  });
});
