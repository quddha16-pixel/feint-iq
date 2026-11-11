import {
  reportSchema,
  type CompletedAnalysisReport,
} from "../domain/contracts";
import { momentReviewSchema, type MomentReview } from "../domain/moments";
export type MomentFeedback =
  | { type: "review"; momentId: string; review: MomentReview }
  | { type: "missed"; time: number; note: string }
  | { type: "remove-missed"; index: number }
  | { type: "coverage"; reviewed: boolean };
export function applyMomentFeedback(
  report: CompletedAnalysisReport,
  edit: MomentFeedback,
) {
  const next = structuredClone(report);
  const data = next.momentAnalysis;
  if (!data) throw new Error("This report has no moment review.");
  if (edit.type === "review") {
    const item = data.moments.find((m) => m.candidate.id === edit.momentId);
    if (!item) throw new Error("Unknown moment. No data was changed.");
    item.review = momentReviewSchema.parse(edit.review);
  } else if (edit.type === "missed") {
    if (data.missed.some((m) => Math.abs(m.time - edit.time) < 0.01))
      throw new Error("That timestamp is already recorded.");
    data.missed.push({ time: edit.time, note: edit.note });
    data.missed.sort((a, b) => a.time - b.time);
  } else if (edit.type === "remove-missed") {
    if (
      !Number.isInteger(edit.index) ||
      edit.index < 0 ||
      edit.index >= data.missed.length
    )
      throw new Error("Unknown missed moment.");
    data.missed.splice(edit.index, 1);
  } else data.reviewedWholeClip = edit.reviewed;
  return reportSchema.parse(next);
}
