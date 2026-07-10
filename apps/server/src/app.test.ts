import { describe, expect, it } from "bun:test";
import { createTestApp } from "./test-utils";

describe("GET /api/health", () => {
  it("returns ok: true", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
