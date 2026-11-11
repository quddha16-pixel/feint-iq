import type { PreparedVideo } from "../server/media";
import type { MomentAssessment } from "../src/domain/moments";
import { preparedOpenAI } from "./openai-fixture";
export const preparedMoments: PreparedVideo = {
  duration: 12,
  frames: [1, 1.2, 1.4, 7, 7.2, 7.4].map((time, i) => ({
    id: `frame-${i + 1}`,
    time,
    mime: "image/jpeg",
    data: "c3ludGhldGlj",
    momentId: i < 3 ? "moment-1" : "moment-2",
  })),
  scan: {
    fps: 6,
    frames: 72,
    elapsedMs: 10,
    threshold: 0.025,
    maxMoments: 4,
    fallbackUsed: false,
  },
  moments: [
    {
      id: "moment-1",
      start: 0.5,
      end: 2,
      anchor: 1.2,
      selection: "motion",
      candidateType: "motion-burst",
      frameIds: ["frame-1", "frame-2", "frame-3"],
    },
    {
      id: "moment-2",
      start: 6.5,
      end: 8,
      anchor: 7.2,
      selection: "motion",
      candidateType: "motion-burst",
      frameIds: ["frame-4", "frame-5", "frame-6"],
    },
  ],
};
preparedMoments.frames.push(preparedOpenAI.frames.at(-1)!);
export function momentAssessment(
  momentId: string,
  frameIds: string[],
): MomentAssessment {
  return {
    momentId,
    frameIds,
    identityConfirmed: true,
    identityExplanation: "Synthetic identity assertion only.",
    classification: "hypothesis",
    visibleAction: "Synthetic visible guard example; no boxing was assessed.",
    punchOutcome: "unclear",
    defensiveVulnerability: "Synthetic possible late recovery.",
    counterOpportunity:
      "No supported counter opportunity in this synthetic example.",
    correction: "Synthetic guard recovery cue",
    drill:
      "Synthetic drill: two slow technical rounds, recover guard after each movement.",
    uncertainty: "Synthetic response; not evidence of actual boxing accuracy.",
  };
}
export const momentResponse = () => ({
  summary: "Synthetic selected-moment test, not whole-round intelligence.",
  moments: preparedMoments.moments!.map((m) =>
    momentAssessment(m.id, [m.frameIds[0], m.frameIds[2]]),
  ),
});
