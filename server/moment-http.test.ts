import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createBackend } from "./app";
import { OpenAIProvider } from "./openai-provider";
import {
  readAnalysisStream,
  AnalysisJobFailure,
} from "../src/services/analysisStream";
import { makeReport } from "../tests/fixture";
import { preparedMoments, momentResponse } from "../tests/moment-fixture";
import { openAIResponse } from "../tests/openai-fixture";
const token = "synthetic-moment-http-pilot-token-not-real";
function form() {
  const r = makeReport();
  const f = new FormData();
  f.append(
    "metadata",
    JSON.stringify({
      configuration: {
        ...r.configuration,
        momentReview: true,
        fighter: {
          ...r.configuration.fighter,
          subjectId: "11111111-1111-4111-8111-111111111111",
          confirmationFrames: [{ time: 1, x: 0.4, y: 0.5 }],
        },
      },
      video: { ...r.video, size: 4, duration: 12 },
    }),
  );
  f.append("video", new Blob(["test"], { type: "video/webm" }), r.video.name);
  return f;
}
describe("moment mode preserves request-stream-v1 and authentication", () => {
  it.each(["success", "invalid"])(
    "streams %s, records usage and replays without another model call",
    async (mode) => {
      const request = vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify(
              openAIResponse(
                mode === "success" ? momentResponse() : { bad: true },
              ),
            ),
          ),
      );
      const prepare = vi.fn(async () => preparedMoments);
      const app = await createBackend({
        origin: "http://localhost:5173",
        accessToken: token,
        provider: new OpenAIProvider("synthetic-moment-http-key", { request }),
        prepare,
      });
      await app.listen({ host: "127.0.0.1", port: 0 });
      try {
        const base = app.listeningOrigin;
        expect(
          (await fetch(base + "/analyses", { method: "POST", body: form() }))
            .status,
        ).toBe(401);
        expect(request).not.toHaveBeenCalled();
        expect(prepare).not.toHaveBeenCalled();
        const id = randomUUID();
        const begin = () =>
          fetch(base + "/analyses", {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "idempotency-key": id,
            },
            body: form(),
          });
        const response = await begin();
        expect(response.headers.get("content-type")).toContain("ndjson");
        const stages: string[] = [];
        const result = await readAnalysisStream(response, (j) =>
          stages.push(j.stage!),
        ).catch((e: unknown) => e);
        if (mode === "success") {
          expect(stages).toEqual([
            "decoding",
            "analyzing",
            "validating",
            "cleaning",
          ]);
          const success = result as Awaited<
            ReturnType<typeof readAnalysisStream>
          >;
          expect(success.report.momentAnalysis!.moments).toHaveLength(2);
          expect((await readAnalysisStream(await begin())).report).toEqual(
            success.report,
          );
        } else expect(result).toBeInstanceOf(AnalysisJobFailure);
        const usage = await (
          await fetch(`${base}/analyses/${id}/usage`, {
            headers: { authorization: `Bearer ${token}` },
          })
        ).json();
        expect(usage.tokens.total).toBe(13000);
        expect(request).toHaveBeenCalledTimes(1);
        expect((await fetch(`${base}/analyses/${id}/usage`)).status).toBe(401);
      } finally {
        await app.close();
      }
    },
  );
  it("refuses moment mode on the manually selected legacy provider", async () => {
    const analyze = vi.fn();
    const app = await createBackend({
      origin: "http://localhost:5173",
      accessToken: token,
      provider: { name: "Gemini", model: "synthetic", analyze },
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    try {
      expect(
        (
          await fetch(app.listeningOrigin + "/analyses", {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "idempotency-key": randomUUID(),
            },
            body: form(),
          })
        ).status,
      ).toBe(422);
      expect(analyze).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
