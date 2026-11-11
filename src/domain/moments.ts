import { z } from "zod";
const time = z.number().finite().nonnegative();
const text = z.string().trim().min(1).max(1600);
export const momentSchema = z
  .object({
    id: z.string().regex(/^moment-[1-6]$/),
    start: time,
    end: time,
    anchor: time,
    selection: z.enum(["motion", "fallback"]),
    candidateType: z.enum(["motion-burst", "coverage-sample"]),
    frameIds: z.array(z.string().min(1).max(100)).min(3).max(24),
  })
  .superRefine((m, ctx) => {
    if (
      m.start >= m.end ||
      m.end - m.start > 5 ||
      m.anchor < m.start ||
      m.anchor > m.end ||
      (m.selection === "motion") !== (m.candidateType === "motion-burst") ||
      new Set(m.frameIds).size !== m.frameIds.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid moment interval or frames.",
      });
  });
export const momentAssessmentSchema = z
  .object({
    momentId: z.string().min(1).max(100),
    identityConfirmed: z.boolean(),
    identityExplanation: text,
    classification: z.enum(["observation", "hypothesis"]),
    visibleAction: text,
    punchOutcome: z.enum([
      "possible-landed",
      "possible-missed",
      "possible-blocked",
      "unclear",
      "not-visible",
    ]),
    defensiveVulnerability: text,
    counterOpportunity: text,
    correction: text.nullable(),
    drill: text.nullable(),
    frameIds: z.array(z.string().min(1).max(100)).min(2).max(8),
    uncertainty: text,
  })
  .strict()
  .superRefine((a, ctx) => {
    if (
      (!a.identityConfirmed && (a.correction !== null || a.drill !== null)) ||
      (a.correction === null) !== (a.drill === null) ||
      new Set(a.frameIds).size !== a.frameIds.length
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Ambiguous identity cannot support personalized coaching; evidence must be distinct.",
      });
  });
export const momentAnalysisSchema = z.object({
  version: z.literal("moments-v0.1"),
  scan: z.object({
    fps: z.literal(6),
    frames: z.number().int().min(2).max(1900),
    elapsedMs: time,
    threshold: z.number().min(0).max(1),
    maxMoments: z.number().int().min(1).max(6),
    fallbackUsed: z.boolean(),
  }),
});
// Keep assessments and coach evaluations independent of model input.
export const momentReviewSchema = z.object({
  finding: z.enum(["correct", "incorrect", "uncertain"]).optional(),
  selection: z.enum(["useful", "not-useful", "uncertain"]).optional(),
  note: z.string().max(1600),
  updatedAt: z.string().datetime(),
});
export const momentReportSchema = z.object({
  version: z.literal("moments-v0.1"),
  scan: momentAnalysisSchema.shape.scan,
  moments: z
    .array(
      z.object({
        candidate: momentSchema,
        assessment: momentAssessmentSchema,
        review: momentReviewSchema.optional(),
      }),
    )
    .min(1)
    .max(6),
  missed: z
    .array(z.object({ time, note: text }))
    .max(50)
    .default([]),
  reviewedWholeClip: z.boolean().default(false),
});
export type SelectedMoment = z.infer<typeof momentSchema>;
export type MomentAssessment = z.infer<typeof momentAssessmentSchema>;
export type MomentReport = z.infer<typeof momentReportSchema>;
export type MomentReview = z.infer<typeof momentReviewSchema>;
