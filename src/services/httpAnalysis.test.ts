import { describe, expect, it, vi } from "vitest";
import { connectAnalysisService } from "./httpAnalysis";
import { makeReport } from "../../tests/fixture";
const health = {
  schemaVersion: 1,
  available: true,
  provider: "test",
  model: "test-only",
  tracking: false,
  qualitativeOnly: true,
  limits: { maxBytes: 100 * 1024 * 1024, minSeconds: 10, maxSeconds: 300 },
  message: "Synthetic contract-test response.",
};
const token = "synthetic-test-session-token-never-real";
describe("HTTP analysis contract", () => {
  it("requires HTTPS outside loopback and keeps the token out of URLs", async () => {
    await expect(
      connectAnalysisService("http://remote.example", token),
    ).rejects.toThrow("HTTPS");
    await expect(
      connectAnalysisService("https://user:secret@example.test", token),
    ).rejects.toThrow("without credentials");
    const request = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(health)),
    );
    await connectAnalysisService(
      "https://api.example.test",
      token,
      request as typeof fetch,
    );
    expect(request.mock.calls[0][0]).not.toContain(token);
  });
  it("validates health and reports and rejects invalid backend responses", async () => {
    await expect(
      connectAnalysisService(
        "http://localhost:8787",
        token,
        async () => new Response("{}"),
      ),
    ).rejects.toThrow();
    const request = vi.fn(
      async (url: string | URL | Request) =>
        new Response(
          JSON.stringify(String(url).endsWith("/health") ? health : {}),
        ),
    );
    const { service } = await connectAnalysisService(
      "http://localhost:8787",
      token,
      request as typeof fetch,
    );
    await expect(service.report("bad")).rejects.toThrow();
  });
  it("sends the original file and immutable fighter metadata, with reusable idempotency keys", async () => {
    const report = makeReport();
    report.configuration.fighter.subjectId = crypto.randomUUID();
    report.configuration.fighter.confirmationFrames = [
      { time: 1, x: 0.4, y: 0.5 },
    ];
    const calls: RequestInit[] = [];
    const request = async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/health"))
        return new Response(JSON.stringify(health));
      calls.push(init!);
      return new Response(
        JSON.stringify({
          id: "job",
          configuration: report.configuration,
          video: report.video,
          status: "queued",
        }),
      );
    };
    const { service } = await connectAnalysisService(
      "http://localhost:8787",
      token,
      request as typeof fetch,
    );
    const input = {
      file: new File(["test"], report.video.name, { type: "video/webm" }),
      video: report.video,
      configuration: report.configuration,
    };
    await service.submit(input);
    await service.submit(input);
    expect(calls[0].headers).toMatchObject({
      authorization: `Bearer ${token}`,
    });
    expect(calls[0].headers).toEqual(calls[1].headers);
    const metadata = JSON.parse(
      String((calls[0].body as FormData).get("metadata")),
    );
    expect(metadata.configuration.fighter.confirmationFrames).toEqual([
      { time: 1, x: 0.4, y: 0.5 },
    ]);
  });
  it("handles non-JSON and network failures as actionable errors", async () => {
    await expect(
      connectAnalysisService("http://localhost:8787", token, async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("backend request failed");
    await expect(
      connectAnalysisService(
        "http://localhost:8787",
        token,
        async () => new Response("denied", { status: 401 }),
      ),
    ).rejects.toThrow("HTTP 401");
  });
});
