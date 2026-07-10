import { describe, expect, it } from "bun:test";
import { createTestApp, readJson, type JobRow, type TestApp } from "./test-utils";

type JobResponse = { duplicate: boolean; id: number };
type SettingsResponse = { screenOutThreshold: number };
type SettingsPatchResponse = {
  screenOutThreshold: number;
  moved: { toScreenedOut: number; toInbox: number };
};

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

async function patchJson(app: TestApp, path: string, body: unknown) {
  return app.request(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/settings", () => {
  it("defaults screenOutThreshold to 3.0", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/settings");
    expect(res.status).toBe(200);
    expect(await readJson<SettingsResponse>(res)).toEqual({ screenOutThreshold: 3.0 });
  });
});

describe("PATCH /api/settings", () => {
  it("raising the threshold moves a boundary-scored inbox job to screened_out", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload()),
    );
    await postJson(app, `/api/jobs/${created.id}/score`, { score: 3.2 });

    const res = await patchJson(app, "/api/settings", { screenOutThreshold: 3.5 });
    expect(res.status).toBe(200);
    const body = await readJson<SettingsPatchResponse>(res);
    expect(body.screenOutThreshold).toBe(3.5);
    expect(body.moved).toEqual({ toScreenedOut: 1, toInbox: 0 });

    const jobsRes = await app.request("/api/jobs");
    const jobsBody = await readJson<{ jobs: JobRow[] }>(jobsRes);
    expect(jobsBody.jobs.find((j) => j.id === created.id)?.status).toBe("screened_out");
  });

  it("lowering the threshold moves the job back to inbox", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload()),
    );
    await postJson(app, `/api/jobs/${created.id}/score`, { score: 3.2 });
    await patchJson(app, "/api/settings", { screenOutThreshold: 3.5 });

    const res = await patchJson(app, "/api/settings", { screenOutThreshold: 3.0 });
    expect(res.status).toBe(200);
    const body = await readJson<SettingsPatchResponse>(res);
    expect(body.screenOutThreshold).toBe(3.0);
    expect(body.moved).toEqual({ toScreenedOut: 0, toInbox: 1 });

    const jobsRes = await app.request("/api/jobs");
    const jobsBody = await readJson<{ jobs: JobRow[] }>(jobsRes);
    expect(jobsBody.jobs.find((j) => j.id === created.id)?.status).toBe("inbox");
  });

  it("rejects an out-of-range threshold with 400", async () => {
    const { app } = createTestApp();
    const res = await patchJson(app, "/api/settings", { screenOutThreshold: 6 });
    expect(res.status).toBe(400);
  });
});
