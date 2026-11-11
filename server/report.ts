import {
  reportSchema,
  type AnalysisConfiguration,
  type CompletedAnalysisReport,
  type VideoAsset,
} from "../src/domain/contracts";
import { metricsFor } from "../src/domain/metrics";
import type { PreparedVideo } from "./media";
import { providerResultSchema, type ProviderResult } from "./provider";
export function buildReport(
  id: string,
  configuration: AnalysisConfiguration,
  video: VideoAsset,
  prepared: PreparedVideo,
  input: ProviderResult,
  engineVersion: string,
  createdAt: string,
): CompletedAnalysisReport {
  const result = providerResultSchema.parse(input);
  if (!result.identityConfirmed && !prepared.moments)
    throw new Error(
      "The model could not confirm the selected fighter across the sampled frames. Add clearer identity references or choose clearer footage.",
    );
  const sequence = prepared.frames.filter((f) => !f.identityReference);
  const byId = new Map(sequence.map((f) => [f.id, f]));
  for (const observation of result.observations)
    if (observation.frameIds.some((frame) => !byId.has(frame)))
      throw new Error(
        "The provider cited an unknown source frame. Findings were rejected.",
      );
  for (const comparison of result.styleComparisons ?? [])
    if (
      comparison.observationIndexes.some((index) => !result.observations[index])
    )
      throw new Error(
        "The provider style comparison cited a missing observation.",
      );
  if (
    prepared.moments &&
    (!prepared.scan ||
      result.momentAssessments?.length !== prepared.moments.length)
  )
    throw new Error("Missing moment assessments. No partial report was saved.");
  const used = [
    ...new Set(
      prepared.moments
        ? prepared.moments.flatMap((m) => m.frameIds)
        : result.observations.flatMap((o) => o.frameIds),
    ),
  ];
  const observations = result.observations.map((o, i) => ({
    id: `observation-${i + 1}`,
    category: o.category,
    kind: "inferred" as const,
    finding: o.finding,
    explanation: o.explanation,
    evidenceIds: [...new Set(o.frameIds)],
    confidence: null,
    metricId: o.metricId,
    ...(o.correctiveAction ? { correctiveAction: o.correctiveAction } : {}),
  }));
  const recommendations = result.observations.flatMap((o, i) =>
    o.correctiveAction
      ? [
          {
            id: `recommendation-${i + 1}`,
            title: o.correctiveAction,
            priority:
              o.coaching?.priority === "high"
                ? ("primary" as const)
                : ("secondary" as const),
            observationIds: [`observation-${i + 1}`],
            metricIds: [o.metricId],
            drills: o.coaching ? [o.coaching.drill] : [],
            trainingFocus: [o.finding],
            tacticalAdjustments: o.coaching ? [o.correctiveAction] : [],
            shortTermGoals: [],
            longTermGoals: [],
          },
        ]
      : [],
  );
  return reportSchema.parse({
    schemaVersion: 1,
    id,
    configuration,
    video: { ...video, duration: prepared.duration },
    createdAt,
    completedAt: new Date().toISOString(),
    engineVersion,
    methodology: {
      version: prepared.moments ? "moments-v0.1" : "qualitative-frames-v1",
      description: prepared.moments
        ? "Lightweight low-resolution 6 FPS image-change scan, then up to six 3-second intervals extracted at up to 6 FPS using actual decoder timestamps. Motion cues do not recognize punches or contact. Coverage samples are used if no suitable motion peaks are found. This is selected-moment coaching, not comprehensive round analysis. Fast/quiet actions can be missed; camera motion and overlap can mislead. No continuous identity tracking, counts, scores or calibrated confidence. Frame timestamps locate images, not verified striking events."
        : "Qualitative model interpretations of actual decoder-timestamped source frames sampled at at most 2 FPS with up to 120 evenly spaced frames across the full clip. No continuous identity tracking, exact event timing, punch counts, accuracy, scores, or calibrated confidence. Frame timestamps locate source images, not verified strike events.",
    },
    conditions: `${sequence.length} source frames; ${prepared.frames.length - sequence.length} user identity references. ${result.identityExplanation}`,
    assessment: {
      score: null,
      summary: result.summary,
      strengths: result.observations
        .flatMap((o, i) =>
          o.polarity === "strength" ? [`observation-${i + 1}`] : [],
        )
        .slice(0, 3),
      weaknesses: result.observations
        .flatMap((o, i) =>
          o.polarity === "weakness" ? [`observation-${i + 1}`] : [],
        )
        .slice(0, 3),
      priorities: recommendations.slice(0, 3).map((r) => r.id),
    },
    metrics: metricsFor(configuration.discipline).map((m) => ({
      id: m.id,
      applicability: "insufficient-evidence",
      score: null,
      explanation:
        "Qualitative findings may be available; a validated numerical scoring methodology is not implemented.",
      observationIds: observations
        .filter((o) => o.metricId === m.id)
        .map((o) => o.id),
      confidence: null,
    })),
    evidence: used.map((id) => {
      const frame = byId.get(id)!;
      return {
        id,
        videoId: video.id,
        kind: "observed",
        description: `Source image ${id}, decoded from the uploaded clip. See the linked model interpretation; this is not an independently verified striking event.`,
        verifiedTime: frame.time,
        confidence: null,
        source: "sampled-frame",
        frameId: id,
      };
    }),
    observations,
    recommendations,
    ...(prepared.moments
      ? {
          momentAnalysis: {
            version: "moments-v0.1",
            scan: prepared.scan,
            moments: prepared.moments.map((candidate, i) => ({
              candidate,
              assessment: result.momentAssessments![i],
            })),
            missed: [],
            reviewedWholeClip: false,
          },
        }
      : {}),
    styleComparisons: result.styleComparisons?.map((c) => ({
      referenceId: c.referenceId,
      explanation: c.explanation,
      observationIds: [
        ...new Set(c.observationIndexes.map((i) => `observation-${i + 1}`)),
      ],
    })),
  });
}
