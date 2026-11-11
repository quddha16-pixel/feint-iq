import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createBackend } from "./app";
import { OpenAIProvider } from "./openai-provider";
import {
  readAnalysisStream,
  AnalysisJobFailure,
} from "../src/services/analysisStream";
import { makeReport } from "../tests/fixture";
import {
  coachingOpenAI,
  openAIResponse,
  preparedOpenAI,
} from "../tests/openai-fixture";
const token = "synthetic-pilot-access-token-never-real";
const key = "synthetic-openai-provider-key-never-real";
const apps: Awaited<ReturnType<typeof createBackend>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
async function start(request: typeof fetch) {
  const audit = vi.fn();
  const app = await createBackend({
    accessToken: token,
    origin: "http://localhost:5173",
    provider: new OpenAIProvider(key, { request }),
    prepare: async () => preparedOpenAI,
    onProviderUsage: audit,
  });
  apps.push(app);
  await app.listen({ host: "127.0.0.1", port: 0 });
  return { base: app.listeningOrigin, audit };
}
function form() {
  const report = makeReport();
  const data = {
    configuration: {
      ...report.configuration,
      fighter: {
        ...report.configuration.fighter,
        subjectId: "11111111-1111-4111-8111-111111111111",
        confirmationFrames: [{ time: 1, x: 0.4, y: 0.5 }],
      },
    },
    video: { ...report.video, size: 4 },
  };
  const result = new FormData();
  result.append("metadata", JSON.stringify(data));
  result.append(
    "video",
    new Blob(["test"], { type: "video/webm" }),
    data.video.name,
  );
  return result;
}
const headers = { authorization: `Bearer ${token}` };
function begin(base: string, id = randomUUID()) {
  return fetch(base + "/analyses", {
    method: "POST",
    headers: { ...headers, "idempotency-key": id },
    body: form(),
  });
}
describe("OpenAI through the authenticated short-clip NDJSON pipeline", () => {
  it("authenticates uploads/usage before provider submission and preserves protocol/limits", async () => {
    const request = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(openAIResponse())),
    );
    const { base } = await start(request);
    for (const path of ["/health", "/analyses", "/analyses/unknown/usage"])
      expect((await fetch(base + path)).status).toBe(401);
    expect(
      (await fetch(base + "/analyses", { method: "POST", body: form() }))
        .status,
    ).toBe(401);
    expect(
      (
        await fetch(base + "/health", {
          headers: { ...headers, origin: "https://untrusted.example" },
        })
      ).status,
    ).toBe(403);
    const health = await (await fetch(base + "/health", { headers })).json();
    expect(health).toMatchObject({
      provider: "OpenAI",
      protocol: "request-stream-v1",
      limits: { maxBytes: 25 * 1024 * 1024, minSeconds: 10, maxSeconds: 300 },
    });
    expect(JSON.stringify(health)).not.toContain(key);
    expect(request).not.toHaveBeenCalled();
  });
  it("streams stages before completion, returns inline evidence/drills, records usage and replays without a second call", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = vi.fn<typeof fetch>(async () => {
      await pending;
      return new Response(JSON.stringify(openAIResponse()), {
        headers: { "x-request-id": "req_test_inline" },
      });
    });
    const { base, audit } = await start(request);
    const id = randomUUID();
    const response = await begin(base, id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    const stages: string[] = [];
    const result = readAnalysisStream(response, (job) =>
      stages.push(job.stage!),
    );
    await vi.waitFor(() => expect(stages).toContain("analyzing"));
    release();
    const complete = await result;
    expect(stages).toEqual(["decoding", "analyzing", "validating", "cleaning"]);
    expect(complete.report.id).toBe(id);
    expect(complete.report.evidence[0].verifiedTime).toBe(6);
    expect(complete.report.recommendations[0].drills[0].dosage).toBe(
      "Two technical rounds",
    );
    const usage = await (
      await fetch(`${base}/analyses/${id}/usage`, { headers })
    ).json();
    expect(usage).toMatchObject({
      status: "completed",
      tokens: { total: 13000 },
      requestId: "req_test_inline",
    });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(usage, id);
    expect(JSON.stringify(usage)).not.toContain(key);
    expect((await readAnalysisStream(await begin(base, id))).report).toEqual(
      complete.report,
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(["provider-auth-error", "invalid-coaching", "incomplete"])(
    "returns terminal errors under HTTP 200 and never saves a partial report: %s",
    async (mode) => {
      const request = vi.fn<typeof fetch>(async () =>
        mode === "provider-auth-error"
          ? new Response(JSON.stringify({ message: key }), { status: 401 })
          : new Response(
              JSON.stringify(
                mode === "incomplete"
                  ? openAIResponse(coachingOpenAI, { status: "incomplete" })
                  : openAIResponse({ invalid: true }),
              ),
            ),
      );
      const { base, audit } = await start(request);
      const id = randomUUID();
      const response = await begin(base, id);
      expect(response.status).toBe(200);
      const error = await readAnalysisStream(response).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AnalysisJobFailure);
      expect((error as Error).message).not.toContain(key);
      expect(
        (await fetch(`${base}/analyses/${id}/report`, { headers })).status,
      ).toBe(409);
      const usage = await (
        await fetch(`${base}/analyses/${id}/usage`, { headers })
      ).json();
      expect(usage.status).not.toBe("completed");
      if (mode !== "provider-auth-error")
        expect(usage.tokens.total).toBe(13000);
      else expect(usage.estimatedCostUsd).toBeNull();
      expect(audit).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("propagates client disconnection to the provider without retrying", async () => {
    const request = vi.fn<typeof fetch>(
      async (_url, init) =>
        new Promise((_, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("synthetic abort")),
            { once: true },
          );
        }),
    );
    const { base, audit } = await start(request);
    const response = await begin(base);
    const reader = response.body!.getReader();
    await reader.read();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await reader.cancel();
    await vi.waitFor(() => expect(audit).toHaveBeenCalledTimes(1));
    expect(audit.mock.calls[0][0].status).toBe("canceled");
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
