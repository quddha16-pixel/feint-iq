// Synthetic data for automated tests ONLY. Never bundled with or displayed by the application.
import type { CompletedAnalysisReport } from "../src/domain/contracts";
import { metricsFor } from "../src/domain/metrics";
export function makeReport(
  id = "test-report",
  score = 70,
): CompletedAnalysisReport {
  return {
    schemaVersion: 1,
    id,
    configuration: {
      discipline: "boxing",
      type: "complete",
      rulesetNotes: "",
      fighter: {
        name: "Synthetic test athlete",
        method: "red",
        notes: "Test-only data",
      },
    },
    video: {
      id: "test-video",
      name: "test-footage.webm",
      size: 100,
      duration: 3,
      mime: "video/webm",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt:
      id === "test-report"
        ? "2026-01-01T00:01:00.000Z"
        : "2026-02-01T00:01:00.000Z",
    engineVersion: "SYNTHETIC TEST ONLY",
    methodology: {
      version: "test-v1",
      description: "Synthetic test fixture. No genuine footage assessment.",
    },
    conditions: "Test-only synthetic content.",
    assessment: {
      score,
      summary: "Synthetic assessment for automated rendering tests only.",
      strengths: ["obs"],
      weaknesses: ["obs"],
      priorities: ["rec"],
    },
    metrics: metricsFor("boxing").map((m) => ({
      id: m.id,
      applicability: m.id === "offense" ? "assessed" : "insufficient-evidence",
      score: m.id === "offense" ? score : null,
      explanation: "Test-only metric explanation.",
      observationIds: m.id === "offense" ? ["obs"] : [],
      confidence: null,
    })),
    evidence: [
      {
        id: "ev",
        videoId: "test-video",
        kind: "observed",
        description: "Synthetic test event.",
        verifiedTime: 1,
        confidence: null,
      },
    ],
    observations: [
      {
        id: "obs",
        category: "offense",
        kind: "observed",
        finding: "Test observation",
        explanation: "A synthetic observation for test assertions.",
        evidenceIds: ["ev"],
        confidence: null,
        metricId: "offense",
        correctiveAction: "Test coaching action",
      },
    ],
    recommendations: [
      {
        id: "rec",
        title: "Test development priority",
        priority: "primary",
        observationIds: ["obs"],
        metricIds: ["offense"],
        drills: [
          {
            name: "Test drill",
            objective: "Test objective",
            instructions: ["Test execution"],
            dosage: "1 test round",
            mistakes: ["Test mistake"],
            cues: ["Test cue"],
          },
        ],
        trainingFocus: ["Test focus"],
        tacticalAdjustments: ["Test adjustment"],
        shortTermGoals: ["Test goal"],
        longTermGoals: ["Test progression"],
      },
    ],
  };
}
