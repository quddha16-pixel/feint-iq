export type Discipline = "boxing" | "kickboxing";
export type Ruleset = "k1" | "low-kick" | "full-contact" | "custom";
export const disciplines: Discipline[] = ["boxing", "kickboxing"];
export const rulesetLabels: Record<Ruleset, string> = {
  k1: "K-1 style",
  "low-kick": "Low-kick rules",
  "full-contact": "Full-contact rules",
  custom: "Other / custom",
};
export const analysisTypes = {
  complete: "Complete fight analysis",
  technical: "Technical breakdown",
  offensive: "Offensive analysis",
  defensive: "Defensive analysis",
} as const;
export const metricDefinitions = {
  offense: [
    "Offensive effectiveness",
    "Effective setups, shot selection, and observable outcomes.",
  ],
  defense: [
    "Defensive responsibility",
    "Guard recovery, exchange safety, and defensive reactions.",
  ],
  footwork: ["Footwork", "Stable entries, exits, pivots, and angle creation."],
  distance: [
    "Distance management",
    "Control of engagement distance and safe exits.",
  ],
  timing: ["Timing", "Entries and reactions relative to observable openings."],
  accuracy: [
    "Accuracy",
    "Only assessed with verified attempts and outcomes; never estimated from impressions.",
  ],
  combinations: [
    "Combination development",
    "Purposeful sequences, transitions, and exit discipline.",
  ],
  counters: [
    "Counterpunching",
    "Observable reactions and counterpunch opportunities.",
  ],
  ring: ["Ring awareness", "Positioning, escape routes, and ring control."],
  head: [
    "Head movement",
    "Slips, rolls, pulls, and head position after punching.",
  ],
  selection: [
    "Punch selection",
    "Jab usage, lead-hand control, and appropriate punch choice.",
  ],
  pace: [
    "Pace management",
    "Sustainable output and observable changes in activity.",
  ],
  punching: [
    "Punching technique",
    "Mechanics, lead-hand control, and punching recovery.",
  ],
  kicking: [
    "Kicking technique",
    "Kick mechanics, setup, target selection, and recovery.",
  ],
  kickDefense: [
    "Kick defense",
    "Positioning and legal defensive responses to kicks.",
  ],
  checking: [
    "Checking ability",
    "Timely checks and recovery against legal low kicks.",
  ],
  knees: ["Knee techniques", "Legal knee setups, mechanics, and recovery."],
  counterattacking: [
    "Counterattacking",
    "Punch and kick counters linked to observed openings.",
  ],
  balance: [
    "Balance and recovery",
    "Stance stability during and after striking exchanges.",
  ],
  range: [
    "Range management",
    "Transitions between punching, kicking, and legal knee range.",
  ],
  iq: [
    "Fight IQ",
    "Observable tactical adjustments; no unsupported claims about intent or psychology.",
  ],
} as const;
export type MetricId = keyof typeof metricDefinitions;
export const boxingMetrics: MetricId[] = [
  "offense",
  "defense",
  "footwork",
  "distance",
  "timing",
  "accuracy",
  "combinations",
  "counters",
  "ring",
  "head",
  "selection",
  "pace",
];
export const kickboxingMetrics: MetricId[] = [
  "offense",
  "defense",
  "footwork",
  "distance",
  "punching",
  "kicking",
  "kickDefense",
  "checking",
  "knees",
  "combinations",
  "counterattacking",
  "balance",
  "range",
  "iq",
];
export function metricsFor(discipline: Discipline, ruleset?: Ruleset) {
  return (discipline === "boxing" ? boxingMetrics : kickboxingMetrics).map(
    (id) => ({
      id,
      label: metricDefinitions[id][0],
      description: metricDefinitions[id][1],
      applicable: !(
        discipline === "kickboxing" &&
        ((id === "knees" && ruleset !== "k1") ||
          (id === "checking" &&
            (ruleset === "full-contact" || ruleset === "custom")))
      ),
    }),
  );
}
// Versioned display scale, not a scoring algorithm. Scores must come from an evidence-based provider.
export const gradeScale = [
  { min: 97, grade: "A+" },
  { min: 93, grade: "A" },
  { min: 90, grade: "A−" },
  { min: 87, grade: "B+" },
  { min: 83, grade: "B" },
  { min: 80, grade: "B−" },
  { min: 77, grade: "C+" },
  { min: 73, grade: "C" },
  { min: 70, grade: "C−" },
  { min: 67, grade: "D+" },
  { min: 60, grade: "D" },
  { min: 0, grade: "F" },
];
export function gradeFor(score: number | null) {
  return score === null || !Number.isFinite(score) || score < 0 || score > 100
    ? "Not assessed"
    : gradeScale.find((g) => score >= g.min)!.grade;
}
