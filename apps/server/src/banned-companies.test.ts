import { describe, expect, it } from "bun:test";
import { createTestApp, readJson, type JobRow, type TestApp } from "./test-utils";

type JobResponse = { duplicate?: boolean; id?: number; banned?: boolean };
type BanResponse = { banned: boolean; archived: number };
type BannedCompanyRow = { id: number; name: string; createdAt: string | null };
type BannedListResponse = { companies: BannedCompanyRow[] };

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

describe("POST /api/banned-companies", () => {
  it("archives existing non-archived cards and leaves already-archived ones", async () => {
    const { app } = createTestApp();
    const inbox = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload({ linkedinJobId: "j1", status: "applied" })),
    );
    const alreadyArchived = await readJson<JobResponse>(
      await postJson(
        app,
        "/api/jobs",
        jobPayload({ linkedinJobId: "j2", status: "archived" }),
      ),
    );
    const otherCompany = await readJson<JobResponse>(
      await postJson(
        app,
        "/api/jobs",
        jobPayload({ linkedinJobId: "j3", company: "Other Inc" }),
      ),
    );

    const res = await postJson(app, "/api/banned-companies", { company: "Acme Corp" });
    expect(res.status).toBe(201);
    const body = await readJson<BanResponse>(res);
    expect(body).toEqual({ banned: true, archived: 1 });

    const list = await readJson<{ jobs: JobRow[] }>(await app.request("/api/jobs"));
    expect(list.jobs.find((j) => j.id === inbox.id)?.status).toBe("archived");
    expect(list.jobs.find((j) => j.id === alreadyArchived.id)?.status).toBe("archived");
    expect(list.jobs.find((j) => j.id === otherCompany.id)?.status).toBe("inbox");
  });

  it("is idempotent and case-insensitive", async () => {
    const { app } = createTestApp();
    await postJson(app, "/api/jobs", jobPayload({ linkedinJobId: "j1" }));

    const first = await postJson(app, "/api/banned-companies", { company: "Acme Corp" });
    expect(first.status).toBe(201);
    expect(await readJson<BanResponse>(first)).toEqual({ banned: true, archived: 1 });

    const second = await postJson(app, "/api/banned-companies", { company: "ACME CORP" });
    expect(second.status).toBe(200);
    expect(await readJson<BanResponse>(second)).toEqual({ banned: true, archived: 0 });

    const list = await readJson<BannedListResponse>(
      await app.request("/api/banned-companies"),
    );
    expect(list.companies).toHaveLength(1);
  });
});

describe("POST /api/jobs banned-company backstop", () => {
  it("returns banned:true for any casing and inserts nothing", async () => {
    const { app } = createTestApp();
    await postJson(app, "/api/banned-companies", { company: "Acme Corp" });

    const res = await postJson(
      app,
      "/api/jobs",
      jobPayload({ linkedinJobId: "j1", company: "aCmE cOrP" }),
    );
    expect(res.status).toBe(200);
    expect(await readJson<JobResponse>(res)).toEqual({ banned: true });

    const list = await readJson<{ jobs: JobRow[] }>(await app.request("/api/jobs"));
    expect(list.jobs).toHaveLength(0);
  });
});

describe("DELETE /api/banned-companies/:id", () => {
  it("unbans and re-allows insertion, but does not unarchive existing cards", async () => {
    const { app } = createTestApp();
    const created = await readJson<JobResponse>(
      await postJson(app, "/api/jobs", jobPayload({ linkedinJobId: "j1" })),
    );
    await postJson(app, "/api/banned-companies", { company: "Acme Corp" });

    const listAfterBan = await readJson<BannedListResponse>(
      await app.request("/api/banned-companies"),
    );
    const banId = listAfterBan.companies.find((c) => c.name === "Acme Corp")?.id;
    expect(banId).toBeDefined();

    const del = await app.request(`/api/banned-companies/${banId}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(await readJson<{ deleted: boolean }>(del)).toEqual({ deleted: true });

    const jobsList = await readJson<{ jobs: JobRow[] }>(await app.request("/api/jobs"));
    expect(jobsList.jobs.find((j) => j.id === created.id)?.status).toBe("archived");

    const res = await postJson(
      app,
      "/api/jobs",
      jobPayload({ linkedinJobId: "j2", company: "Acme Corp" }),
    );
    expect(res.status).toBe(201);
    expect((await readJson<JobResponse>(res)).banned).toBeUndefined();
  });

  it("404s for an unknown id", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/banned-companies/999", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/banned-companies", () => {
  it("lists bans", async () => {
    const { app } = createTestApp();
    await postJson(app, "/api/banned-companies", { company: "Acme Corp" });
    await postJson(app, "/api/banned-companies", { company: "Other Inc" });

    const res = await app.request("/api/banned-companies");
    expect(res.status).toBe(200);
    const body = await readJson<BannedListResponse>(res);
    expect(body.companies.map((c) => c.name).sort()).toEqual(["Acme Corp", "Other Inc"]);
  });
});
