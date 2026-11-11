import { z } from "zod";
import { referenceIds, referenceFor } from "./styles";
import { analysisTypes, metricsFor, type Discipline } from "./metrics";
import { momentReportSchema } from "./moments";
const text = z.string().trim().min(1).max(10000);
const id = z.string().min(1).max(200);
const timestamp = z.number().finite().nonnegative();
export const identityFrameSchema = z.object({
  time: timestamp,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  note: z.string().max(300).optional(),
});
export const fighterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  method: z.enum(["red", "blue", "left", "right", "manual"]),
  notes: z.string().max(2000),
  frame: identityFrameSchema.optional(),
  confirmationFrames: z.array(identityFrameSchema).max(5).optional(),
  subjectId: z.string().uuid().optional(),
  tracking: z
    .object({
      identityIndependentOfPosition: z.literal(true),
      status: z.literal("unverified"),
      challenges: z
        .array(z.enum(["camera-movement", "occlusion", "position-change"]))
        .max(3),
    })
    .optional(),
});
export const configSchema = z
  .object({
    discipline: z.enum(["boxing", "kickboxing"]),
    type: z.enum(["complete", "technical", "offensive", "defensive"]),
    momentReview: z.boolean().optional(),
    ruleset: z.enum(["k1", "low-kick", "full-contact", "custom"]).optional(),
    rulesetNotes: z.string().max(2000),
    fighter: fighterSchema,
  })
  .superRefine((c, ctx) => {
    if (c.discipline === "kickboxing" && !c.ruleset)
      ctx.addIssue({ code: "custom", message: "Select a kickboxing ruleset." });
    if (c.discipline === "boxing" && c.ruleset)
      ctx.addIssue({
        code: "custom",
        message: "Boxing cannot use a kickboxing ruleset.",
      });
    if (c.ruleset === "custom" && !c.rulesetNotes.trim())
      ctx.addIssue({
        code: "custom",
        message: "Describe the custom rules and permitted techniques.",
      });
    if (
      c.fighter.method === "manual" &&
      !c.fighter.frame &&
      !c.fighter.confirmationFrames?.length &&
      !c.fighter.notes.trim()
    )
      ctx.addIssue({
        code: "custom",
        message: "Add identification notes or select a frame reference.",
      });
  });
export type FighterIdentification = z.infer<typeof fighterSchema>;
export type AnalysisConfiguration = z.infer<typeof configSchema>;
export const videoSchema = z.object({
  id,
  name: z.string().min(1).max(500),
  size: z.number().int().positive(),
  mime: z.string().max(100),
  duration: z.number().finite().positive(),
  storageId: z.string().max(1000).optional(),
});
export type VideoAsset = z.infer<typeof videoSchema>;
export const evidenceSchema = z
  .object({
    id,
    videoId: id,
    kind: z.enum(["observed", "estimated", "inferred", "unverified"]),
    description: text,
    verifiedTime: timestamp.nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    source: z.enum(["sampled-frame", "verified-event"]).optional(),
    frameId: z.string().max(200).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.verifiedTime !== null && e.kind !== "observed")
      ctx.addIssue({
        code: "custom",
        message:
          "Only directly observed evidence may have a verified timestamp.",
      });
  });
export type VerifiedEvidenceReference = z.infer<typeof evidenceSchema>;
export const observationSchema = z.object({
  id,
  category: z.enum(["offense", "defense", "movement", "fight-iq"]),
  kind: z.enum(["observed", "inferred"]),
  finding: text,
  explanation: text,
  evidenceIds: z.array(id).min(1),
  confidence: z.number().min(0).max(1).nullable(),
  metricId: id,
  correctiveAction: z.string().max(5000).optional(),
});
export type TechnicalObservation = z.infer<typeof observationSchema>;
export const metricSchema = z.object({
  id,
  applicability: z.enum([
    "assessed",
    "insufficient-evidence",
    "not-applicable",
  ]),
  score: z.number().finite().min(0).max(100).nullable(),
  explanation: text,
  observationIds: z.array(id),
  confidence: z.number().min(0).max(1).nullable(),
});
export type PerformanceMetric = z.infer<typeof metricSchema>;
export const drillSchema = z.object({
  name: text,
  objective: text,
  instructions: z.array(text).min(1),
  dosage: text,
  mistakes: z.array(text),
  cues: z.array(text),
});
export type CorrectiveDrill = z.infer<typeof drillSchema>;
export const recommendationSchema = z.object({
  id,
  title: text,
  priority: z.enum(["primary", "secondary"]),
  observationIds: z.array(id).min(1),
  metricIds: z.array(id).min(1),
  drills: z.array(drillSchema),
  trainingFocus: z.array(text),
  tacticalAdjustments: z.array(text),
  shortTermGoals: z.array(text),
  longTermGoals: z.array(text),
});
export type DevelopmentRecommendation = z.infer<typeof recommendationSchema>;
export const assessmentSchema = z.object({
  score: z.number().finite().min(0).max(100).nullable(),
  summary: text,
  strengths: z.array(id).max(3),
  weaknesses: z.array(id).max(3),
  priorities: z.array(id).max(3),
});
export type OverallAssessment = z.infer<typeof assessmentSchema>;
export const styleComparisonSchema = z.object({
  referenceId: z.enum(referenceIds),
  explanation: text,
  observationIds: z.array(id).min(1).max(6),
});
export type StyleComparison = z.infer<typeof styleComparisonSchema>;
const reportBase = z.object({
  schemaVersion: z.literal(1),
  id,
  configuration: configSchema,
  video: videoSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  engineVersion: text,
  methodology: z.object({ version: text, description: text }),
  conditions: text,
  assessment: assessmentSchema,
  metrics: z.array(metricSchema),
  evidence: z.array(evidenceSchema),
  observations: z.array(observationSchema),
  recommendations: z.array(recommendationSchema),
  styleComparisons: z.array(styleComparisonSchema).max(3).optional(),
  momentAnalysis: momentReportSchema.optional(),
});
export const reportSchema = reportBase.superRefine((r, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  for (const [name, items] of [
    ["metrics", r.metrics],
    ["evidence", r.evidence],
    ["observations", r.observations],
    ["recommendations", r.recommendations],
  ] as const)
    if (new Set(items.map((i) => i.id)).size !== items.length)
      fail(`Duplicate ${name} IDs.`);
  if (Date.parse(r.completedAt) < Date.parse(r.createdAt))
    fail("Completion predates submission.");
  if (
    r.configuration.fighter.frame &&
    r.configuration.fighter.frame.time > r.video.duration
  )
    fail("Fighter reference exceeds video duration.");
  if (
    r.configuration.fighter.confirmationFrames?.some(
      (f) => f.time > r.video.duration,
    )
  )
    fail("Identity confirmation frame exceeds video duration.");
  const definitions = metricsFor(
    r.configuration.discipline,
    r.configuration.ruleset,
  );
  if (r.metrics.length !== definitions.length)
    fail(
      "Report must include every discipline metric with an explicit assessment state.",
    );
  const observations = new Set(r.observations.map((o) => o.id)),
    evidence = new Set(r.evidence.map((e) => e.id)),
    metricIds = new Set(definitions.map((m) => m.id));
  if (r.momentAnalysis) {
    const moments = r.momentAnalysis.moments;
    if (new Set(moments.map((m) => m.candidate.id)).size !== moments.length)
      fail("Duplicate moment IDs.");
    if (
      moments.length > r.momentAnalysis.scan.maxMoments ||
      moments.some(
        (m, i) =>
          (m.candidate.selection === "fallback") !==
            r.momentAnalysis!.scan.fallbackUsed ||
          (i > 0 && m.candidate.start <= moments[i - 1].candidate.end),
      )
    )
      fail("Moment coverage order is invalid.");
    for (const { candidate: m, assessment: a } of moments) {
      if (
        m.end > r.video.duration ||
        m.id !== a.momentId ||
        a.frameIds.some((id) => !m.frameIds.includes(id)) ||
        m.frameIds.some(
          (id) =>
            !r.evidence.some(
              (e) =>
                e.id === id &&
                e.verifiedTime !== null &&
                e.verifiedTime >= m.start &&
                e.verifiedTime <= m.end,
            ),
        )
      )
        fail("Moment evidence must belong to this source interval.");
      const sequence = m.frameIds.map((id) =>
        r.evidence.find((e) => e.id === id),
      );
      if (
        sequence.some(
          (e, i) =>
            !e ||
            e.source !== "sampled-frame" ||
            e.frameId !== e.id ||
            (i > 0 &&
              e.verifiedTime! <= (sequence[i - 1]?.verifiedTime ?? Infinity)),
        ) ||
        !sequence.some((e) => e && e.verifiedTime! < m.anchor) ||
        !sequence.some((e) => e && e.verifiedTime! > m.anchor)
      )
        fail("Moment frames must preserve before/after source chronology.");
    }
    if (r.momentAnalysis.missed.some((m) => m.time >= r.video.duration))
      fail("Missed moment is outside the clip.");
  }
  for (const e of r.evidence)
    if (
      e.videoId !== r.video.id ||
      (e.verifiedTime !== null && e.verifiedTime > r.video.duration)
    )
      fail("Evidence must reference this video within its duration.");
  for (const o of r.observations) {
    if (
      !metricIds.has(o.metricId as (typeof definitions)[number]["id"]) ||
      o.evidenceIds.some((e) => !evidence.has(e))
    )
      fail("Observation contains an invalid evidence or metric reference.");
    if (
      o.kind === "observed" &&
      !o.evidenceIds.some(
        (id) => r.evidence.find((e) => e.id === id)?.kind === "observed",
      )
    )
      fail("Direct observations need observed evidence.");
  }
  for (const m of r.metrics) {
    const def = definitions.find((d) => d.id === m.id);
    if (!def || (!def.applicable && m.applicability !== "not-applicable"))
      fail("Metric does not match discipline or ruleset.");
    if (m.applicability !== "assessed" && m.score !== null)
      fail("Unassessed metrics cannot have scores.");
    if (
      m.applicability === "assessed" &&
      (m.score === null || !m.observationIds.length)
    )
      fail("Scores require supporting observations.");
    if (
      m.applicability === "assessed" &&
      !m.observationIds.some((oid) =>
        r.observations
          .find((o) => o.id === oid)
          ?.evidenceIds.some(
            (eid) => r.evidence.find((e) => e.id === eid)?.kind === "observed",
          ),
      )
    )
      fail(
        "Scored metrics need directly observed supporting evidence, not estimates alone.",
      );
    if (
      m.observationIds.some(
        (o) =>
          !observations.has(o) ||
          r.observations.find((x) => x.id === o)?.metricId !== m.id,
      )
    )
      fail("Metric observations must link to that metric.");
  }
  for (const rec of r.recommendations)
    if (
      rec.observationIds.some((o) => !observations.has(o)) ||
      rec.metricIds.some(
        (m) => !metricIds.has(m as (typeof definitions)[number]["id"]),
      )
    )
      fail("Recommendation contains an invalid finding reference.");
  for (const oid of [...r.assessment.strengths, ...r.assessment.weaknesses])
    if (!observations.has(oid))
      fail("Assessment must reference actual observations.");
  if (
    new Set(r.styleComparisons?.map((s) => s.referenceId)).size !==
    (r.styleComparisons?.length ?? 0)
  )
    fail("Style comparisons must use distinct fighter references.");
  for (const comparison of r.styleComparisons ?? []) {
    if (
      referenceFor(comparison.referenceId)?.discipline !==
      r.configuration.discipline
    )
      fail("The style reference must match the report discipline.");
    if (comparison.observationIds.some((id) => !observations.has(id)))
      fail("Style comparisons must link to actual report observations.");
    if (
      !comparison.observationIds.some((id) =>
        r.observations
          .find((o) => o.id === id)
          ?.evidenceIds.some(
            (eid) => r.evidence.find((e) => e.id === eid)?.kind === "observed",
          ),
      )
    )
      fail("Style comparisons need directly observed source evidence.");
  }
  for (const rid of r.assessment.priorities)
    if (!r.recommendations.some((x) => x.id === rid))
      fail("Assessment priorities must reference recommendations.");
  if (
    r.assessment.score !== null &&
    !r.metrics.some((m) => m.applicability === "assessed")
  )
    fail("Overall score requires assessed metrics.");
  if (
    r.observations.some((o) =>
      o.evidenceIds.every(
        (id) => r.evidence.find((e) => e.id === id)?.kind === "unverified",
      ),
    )
  )
    fail("Conclusions cannot rely exclusively on unverified information.");
});
export type CompletedAnalysisReport = z.infer<typeof reportSchema>;
export const statusSchema = z.enum([
  "not-started",
  "ready",
  "uploading",
  "queued",
  "processing",
  "completed",
  "failed",
  "canceled",
  "unavailable",
]);
export type AnalysisStatus = z.infer<typeof statusSchema>;
export const jobSchema = z
  .object({
    id,
    configuration: configSchema,
    video: videoSchema,
    status: statusSchema,
    progress: z.number().min(0).max(100).optional(),
    stage: z
      .enum(["decoding", "analyzing", "validating", "cleaning", "completed"])
      .optional(),
    error: z.string().max(10000).optional(),
    reportId: id.optional(),
  })
  .superRefine((job, ctx) => {
    if (job.status === "completed" && !job.reportId)
      ctx.addIssue({
        code: "custom",
        message: "Completed jobs require a report reference.",
      });
  });
export interface AnalysisJob {
  id: string;
  configuration: AnalysisConfiguration;
  video: VideoAsset;
  status: AnalysisStatus;
  progress?: number;
  stage?: "decoding" | "analyzing" | "validating" | "cleaning" | "completed";
  error?: string;
  reportId?: string;
}
export interface AnalysisSubmission {
  video: VideoAsset;
  file: File;
  configuration: AnalysisConfiguration;
}
export interface HistoricalComparison {
  compatible: boolean;
  reason?: string;
  methodologyChanged: boolean;
  overallDelta: number | null;
  metrics: {
    id: string;
    label: string;
    before: number | null;
    after: number | null;
    delta: number | null;
  }[];
  repeatedWeaknesses: string[];
  priorities: { before: string[]; after: string[] };
}
export function compareReports(
  a: CompletedAnalysisReport,
  b: CompletedAnalysisReport,
): HistoricalComparison {
  const reason =
    a.configuration.fighter.name.trim().toLowerCase() !==
    b.configuration.fighter.name.trim().toLowerCase()
      ? "Choose two reports for the same fighter."
      : a.configuration.discipline !== b.configuration.discipline
        ? "Choose reports from the same discipline."
        : a.configuration.ruleset !== b.configuration.ruleset ||
            a.configuration.rulesetNotes !== b.configuration.rulesetNotes
          ? "Rulesets must match for comparison."
          : a.configuration.type !== b.configuration.type
            ? "Analysis types must match for comparison."
            : undefined;
  const methodologyChanged = a.methodology.version !== b.methodology.version;
  const allow = !reason && !methodologyChanged;
  const metrics = metricsFor(
    a.configuration.discipline,
    a.configuration.ruleset,
  ).map((m) => {
    const before = a.metrics.find((x) => x.id === m.id)?.score ?? null,
      after = b.metrics.find((x) => x.id === m.id)?.score ?? null;
    return {
      id: m.id,
      label: m.label,
      before,
      after,
      delta: allow && before !== null && after !== null ? after - before : null,
    };
  });
  const weak = (r: CompletedAnalysisReport) =>
    r.assessment.weaknesses.map(
      (id) => r.observations.find((o) => o.id === id)!.metricId,
    );
  return {
    compatible: !reason,
    reason,
    methodologyChanged,
    overallDelta:
      allow && a.assessment.score !== null && b.assessment.score !== null
        ? b.assessment.score - a.assessment.score
        : null,
    metrics,
    repeatedWeaknesses: weak(a).filter((x) => weak(b).includes(x)),
    priorities: {
      before: a.recommendations
        .filter((r) => r.priority === "primary")
        .map((r) => r.title),
      after: b.recommendations
        .filter((r) => r.priority === "primary")
        .map((r) => r.title),
    },
  };
}
export function defaultConfiguration(
  discipline: Discipline,
): Partial<AnalysisConfiguration> {
  return {
    discipline,
    type: "complete",
    ruleset: discipline === "kickboxing" ? "k1" : undefined,
    rulesetNotes: "",
  };
}
export function configurationLabel(c: AnalysisConfiguration) {
  return analysisTypes[c.type];
}
