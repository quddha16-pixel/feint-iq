import { analysisEventSchema, MAX_STREAM_BYTES } from "../domain/transport";
import type { AnalysisJob, CompletedAnalysisReport } from "../domain/contracts";
export class AnalysisJobFailure extends Error {
  constructor(
    public job: AnalysisJob,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisJobFailure";
  }
}
/** Completion travels in this response, never through an instance-local follow-up GET. */
export async function readAnalysisStream(
  response: Response,
  onJob?: (job: AnalysisJob) => void,
): Promise<{ job: AnalysisJob; report: CompletedAnalysisReport }> {
  if (
    !response.headers.get("content-type")?.includes("application/x-ndjson") ||
    !response.body
  )
    throw new Error(
      "The backend did not return the request-bound analysis protocol. Update the backend before retrying.",
    );
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    bytes = 0;
  let jobId: string | undefined;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        bytes += value.byteLength;
        if (bytes > MAX_STREAM_BYTES)
          throw new Error("Analysis response exceeded its size limit.");
        buffer += decoder.decode(value, { stream: true });
      }
      if (done) {
        buffer += decoder.decode();
        // EOF also terminates the final record. Still require valid JSON and a
        // validated terminal result; a stage/heartbeat alone is not success.
        if (buffer.trim()) buffer += "\n";
      }
      let index: number;
      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          throw new Error(
            "The analysis response contains malformed or incomplete JSON. No incomplete report was saved; check provider usage before explicitly retrying.",
          );
        }
        const event = analysisEventSchema.parse(parsed);
        if (event.type === "heartbeat") continue;
        if (jobId && event.job.id !== jobId)
          throw new Error(
            "The backend changed job identity during processing.",
          );
        jobId = event.job.id;
        if (event.type === "error")
          throw new AnalysisJobFailure(event.job, event.message);
        if (event.type === "job") {
          if (!["queued", "processing", "uploading"].includes(event.job.status))
            throw new Error("Invalid intermediate analysis status.");
          onJob?.(event.job);
          continue;
        }
        if (
          event.job.status !== "completed" ||
          event.job.reportId !== event.report.id ||
          event.report.id !== event.job.id ||
          event.report.video.id !== event.job.video.id ||
          JSON.stringify(event.report.configuration) !==
            JSON.stringify(event.job.configuration)
        )
          throw new Error(
            "The completed report does not match its submitted job.",
          );
        return { job: event.job, report: event.report };
      }
      if (done)
        throw new Error(
          "The analysis connection ended before a complete report arrived. No partial report was saved. Do not blindly retry: provider usage may already have occurred.",
        );
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
