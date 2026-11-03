import { describe, expect, it } from "vitest";
import { makeReport } from "../../tests/fixture";
import { readAnalysisStream } from "./analysisStream";
import { MAX_STREAM_BYTES } from "../domain/transport";
function response(text: string, fragment = false) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        if (fragment)
          for (let i = 0; i < bytes.length; i += 7)
            controller.enqueue(bytes.slice(i, i + 7));
        else controller.enqueue(bytes);
        controller.close();
      },
    }),
    { headers: { "content-type": "application/x-ndjson" } },
  );
}
const report = makeReport();
const job = {
  id: report.id,
  configuration: report.configuration,
  video: report.video,
  status: "completed",
  reportId: report.id,
};
const terminal = { type: "result", job, report };
describe("request-bound report transport", () => {
  it("parses fragmented UTF-8, heartbeat and real stage updates before the inline result", async () => {
    const unicode = {
      ...report,
      assessment: { ...report.assessment, summary: "Technical review — 技術" },
    };
    const stages: string[] = [];
    const body = [
      { type: "job", job: { ...job, status: "processing", stage: "decoding" } },
      { type: "heartbeat" },
      { ...terminal, report: unicode },
    ]
      .map((e) => JSON.stringify(e) + "\n")
      .join("");
    const result = await readAnalysisStream(response(body, true), (j) =>
      stages.push(j.stage!),
    );
    expect(stages).toEqual(["decoding"]);
    expect(result.report.assessment.summary).toContain("技術");
  });
  it("rejects a truncated stream and never treats an open connection as a completed report", async () => {
    for (const body of [
      "",
      JSON.stringify({ type: "job", job: { ...job, status: "processing" } }) +
        "\n",
      '{"type":"result",',
    ])
      await expect(readAnalysisStream(response(body))).rejects.toThrow(
        "before a complete report",
      );
  });
  it("rejects malformed, excessive and mismatched responses", async () => {
    await expect(readAnalysisStream(response("no JSON\n"))).rejects.toThrow(
      "malformed",
    );
    const excessive = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(MAX_STREAM_BYTES + 1));
          c.close();
        },
      }),
      { headers: { "content-type": "application/x-ndjson" } },
    );
    await expect(readAnalysisStream(excessive)).rejects.toThrow("size limit");
    await expect(
      readAnalysisStream(
        response(
          JSON.stringify({ ...terminal, job: { ...job, id: "wrong" } }) + "\n",
        ),
      ),
    ).rejects.toThrow("does not match");
  });
  it("preserves genuine failure messages and rejects legacy detached-job responses", async () => {
    await expect(
      readAnalysisStream(
        response(
          JSON.stringify({
            type: "error",
            job: { ...job, status: "failed", error: "Provider HTTP 403" },
            message: "Provider HTTP 403",
          }) + "\n",
        ),
      ),
    ).rejects.toThrow("Provider HTTP 403");
    await expect(
      readAnalysisStream(new Response(JSON.stringify(job))),
    ).rejects.toThrow("request-bound");
  });
});
