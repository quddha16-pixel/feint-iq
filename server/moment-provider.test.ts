import { describe, it, expect, vi } from "vitest";
import { OpenAIProvider } from "./openai-provider";
import { buildReport } from "./report";
import { makeReport } from "../tests/fixture";
import { openAIResponse } from "../tests/openai-fixture";
import { preparedMoments, momentResponse } from "../tests/moment-fixture";
import { applyMomentFeedback } from "../src/services/momentFeedback";
const key = "synthetic-moment-provider-key-not-real";
const config = { ...makeReport().configuration, momentReview: true };
const signal = () => new AbortController().signal;
async function analyze(value: unknown = momentResponse()) {
  const request = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(openAIResponse(value))),
  );
  const result = await new OpenAIProvider(key, { request }).analyze(
    preparedMoments,
    config,
    signal(),
  );
  return {
    request,
    result,
    report: buildReport(
      "synthetic-moment-report",
      config,
      makeReport().video,
      preparedMoments,
      result,
      "OpenAI/test",
      new Date().toISOString(),
    ),
  };
}
describe("selected moment coaching through the existing OpenAI adapter", () => {
  it("uses one structured vision call, chronological evidence and basic defensive prompts", async () => {
    const { request, result, report } = await analyze();
    expect(request).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body.instructions).toContain("does NOT detect punches");
    expect(body.instructions).toContain("guard recovery");
    expect(body.text.format.name).toBe("boxing_moments_v01");
    expect(
      body.input[0].content.filter(
        (c: { type: string }) => c.type === "input_image",
      ),
    ).toHaveLength(7);
    expect(result.momentAssessments).toHaveLength(2);
    expect(report.momentAnalysis!.moments).toHaveLength(2);
    expect(report.evidence).toHaveLength(6);
    expect(report.assessment.score).toBeNull();
    expect(report.methodology.version).toBe("moments-v0.1");
    const reviewed = applyMomentFeedback(report, {
      type: "review",
      momentId: "moment-1",
      review: {
        finding: "incorrect",
        selection: "useful",
        note: "Synthetic correction",
        updatedAt: new Date().toISOString(),
      },
    });
    expect(report.momentAnalysis!.moments[0].review).toBeUndefined();
    expect(reviewed.momentAnalysis!.moments[0].assessment).toEqual(
      report.momentAnalysis!.moments[0].assessment,
    );
    const missed = applyMomentFeedback(reviewed, {
      type: "missed",
      time: 10,
      note: "Synthetic missed interval",
    });
    expect(missed.momentAnalysis!.missed).toHaveLength(1);
    expect(() =>
      applyMomentFeedback(missed, {
        type: "missed",
        time: 14,
        note: "outside",
      }),
    ).toThrow();
    expect(() =>
      applyMomentFeedback(missed, {
        type: "review",
        momentId: "unknown",
        review: reviewed.momentAnalysis!.moments[0].review!,
      }),
    ).toThrow();
  });
  it("rejects missing/duplicate moments, cross-window/identity evidence and confident contact labels", async () => {
    for (const mutate of [
      (v: ReturnType<typeof momentResponse>) => v.moments.pop(),
      (v: ReturnType<typeof momentResponse>) => {
        v.moments[1] = v.moments[0];
      },
      (v: ReturnType<typeof momentResponse>) => {
        v.moments[0].frameIds = ["frame-1", "frame-4"];
      },
      (v: ReturnType<typeof momentResponse>) => {
        v.moments[0].frameIds = ["frame-1", "identity-1"];
      },
      (v: ReturnType<typeof momentResponse>) => {
        v.moments[0].identityConfirmed = false;
      },
      (v: ReturnType<typeof momentResponse>) => {
        Object.assign(v.moments[0], { punchOutcome: "confirmed-landed" });
      },
    ]) {
      const value = momentResponse();
      mutate(value);
      await expect(analyze(value)).rejects.toThrow("invalid moment");
    }
  });
  it("retains unclear identity without personalized findings, and refuses damaged input before submission", async () => {
    const value = momentResponse();
    for (const m of value.moments) {
      m.identityConfirmed = false;
      m.correction = null;
      m.drill = null;
    }
    const { report } = await analyze(value);
    expect(report.observations).toEqual([]);
    expect(
      report.momentAnalysis!.moments.every(
        (m) => !m.assessment.identityConfirmed,
      ),
    ).toBe(true);
    const request = vi.fn<typeof fetch>();
    const bad = structuredClone(preparedMoments);
    bad.moments![0].frameIds.reverse();
    await expect(
      new OpenAIProvider(key, { request }).analyze(bad, config, signal()),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects provider failures/incomplete JSON without leaking raw responses or retrying", async () => {
    for (const response of [
      new Response(key, { status: 503 }),
      new Response('{"status":'),
      new Response(
        JSON.stringify(
          openAIResponse(momentResponse(), { status: "incomplete" }),
        ),
      ),
    ]) {
      const request = vi.fn<typeof fetch>(async () => response);
      const error = await new OpenAIProvider(key, { request })
        .analyze(preparedMoments, config, signal())
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(key);
      expect(request).toHaveBeenCalledTimes(1);
    }
  });
});
