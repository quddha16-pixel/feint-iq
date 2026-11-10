import { z } from "zod";
import { jobSchema, reportSchema, type AnalysisJob } from "./contracts";
export const REQUEST_PROTOCOL = "request-stream-v1" as const;
export const REQUEST_TIMEOUT_MS = 540000;
export const MAX_STREAM_BYTES = 5 * 1024 * 1024;
export const analysisEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("job"), job: jobSchema }),
  z.object({ type: z.literal("result"), job: jobSchema, report: reportSchema }),
  z.object({
    type: z.literal("error"),
    job: jobSchema,
    message: z.string().min(1).max(10000),
  }),
  z.object({ type: z.literal("heartbeat") }),
]);
export type AnalysisEvent = z.infer<typeof analysisEventSchema>;
export const stageLabels: Record<NonNullable<AnalysisJob["stage"]>, string> = {
  decoding: "Decoding footage",
  analyzing: "Reviewing sampled frames",
  validating: "Validating the report",
  cleaning: "Removing temporary footage",
  completed: "Report ready",
};
