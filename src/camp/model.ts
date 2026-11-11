import { z } from "zod";

const text = z.string().trim().max(4000);
const required = text.min(1, "This field is required.");
const date = z
  .string()
  .refine(
    (s) =>
      !s ||
      (/^\d{4}-\d{2}-\d{2}$/.test(s) &&
        Number.isFinite(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s),
    "Use a valid date.",
  );
const id = z.string().min(1).max(120);
export const profileSchema = z.object({
  name: required.max(120),
  stance: text,
  weightClass: text,
  height: text,
  reach: text,
  discipline: z.enum(["boxing", "kickboxing"]),
  strengths: text,
  priorities: text,
  combinations: text,
  defense: text,
  notes: text,
  fightHistory: text,
});
export const opponentSchema = z.object({
  id,
  name: required.max(120),
  stance: text,
  tendencies: text,
  offense: text,
  vulnerabilities: text,
  combinations: text,
  strategy: text,
  notes: text,
});
export const sessionSchema = z.object({
  id,
  date,
  title: required.max(160),
  kind: z.enum(["sparring", "fight", "training", "opponent"]),
  discipline: z.enum(["boxing", "kickboxing"]),
  opponentId: z.string().max(120),
  round: text.max(100),
  duration: z.number().finite().positive().max(14400).nullable(),
  footage: text.max(300),
  reportId: text.max(120),
  notes: text,
  identification: text,
  identityConfirmed: z.boolean(),
});
const evidenceSchema = z
  .object({
    sessionId: id,
    time: z.number().finite().min(0).max(14400),
    end: z.number().finite().min(0).max(14400).nullable(),
    context: required,
  })
  .refine(
    (e) => e.end === null || e.end >= e.time,
    "Sequence end must follow its start.",
  );
export const findingSchema = z.object({
  id,
  subject: z.enum(["vince", "opponent"]),
  kind: z.enum(["observation", "hypothesis"]),
  observation: required,
  evidence: evidenceSchema,
  diagnosis: required,
  consequence: required,
  correction: required,
  drill: required,
  priority: z.enum(["high", "medium", "low"]),
  category: z.enum([
    "distance",
    "timing",
    "feints",
    "defense",
    "balance",
    "combinations",
    "footwork",
    "tactics",
  ]),
  followups: z
    .array(
      z.object({
        id,
        status: z.enum(["recurring", "improving", "resolved"]),
        evidence: evidenceSchema,
        note: required,
      }),
    )
    .max(100),
});
export const goalSchema = z.object({
  id,
  week: date,
  title: required.max(160),
  focus: required,
  drill: required,
  findingId: z.string().max(120),
  opponentId: z.string().max(120),
  status: z.enum(["draft", "planned", "completed"]),
  notes: text,
});
export const campSchema = z
  .object({
    schemaVersion: z.literal(1),
    profile: profileSchema,
    camp: z.object({
      name: text.max(160),
      status: z.enum([
        "not-set",
        "preparation",
        "in-camp",
        "fight-week",
        "recovery",
      ]),
      startDate: date,
      fightDate: date,
      opponentId: z.string().max(120),
      notes: text,
      retentionDays: z.enum(["7", "30", "90"]),
    }),
    opponents: z.array(opponentSchema).max(100),
    sessions: z.array(sessionSchema).max(500),
    findings: z.array(findingSchema).max(500),
    goals: z.array(goalSchema).max(500),
  })
  .superRefine((data, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    for (const rows of [
      data.opponents,
      data.sessions,
      data.findings,
      data.goals,
    ])
      if (new Set(rows.map((r) => r.id)).size !== rows.length)
        issue("Duplicate record IDs are not allowed.");
    const opponents = new Set(data.opponents.map((r) => r.id));
    const sessions = new Map(data.sessions.map((r) => [r.id, r]));
    const findings = new Set(data.findings.map((r) => r.id));
    const opponent = (value: string) => {
      if (value && !opponents.has(value))
        issue("Opponent reference is missing.");
    };
    opponent(data.camp.opponentId);
    if (
      data.camp.startDate &&
      data.camp.fightDate &&
      data.camp.fightDate < data.camp.startDate
    )
      issue("Fight date must not precede camp start.");
    data.sessions.forEach((s) => opponent(s.opponentId));
    for (const finding of data.findings) {
      for (const evidence of [
        finding.evidence,
        ...finding.followups.map((f) => f.evidence),
      ]) {
        const session = sessions.get(evidence.sessionId);
        if (!session) issue("Evidence must reference a saved session.");
        if (
          session?.duration &&
          Math.max(evidence.time, evidence.end ?? 0) > session.duration
        )
          issue("Evidence is outside the session duration.");
        if (finding.subject === "opponent" && !session?.opponentId)
          issue("Opponent evidence needs an opponent-linked session.");
        if (finding.subject === "vince" && session?.kind === "opponent")
          issue("Opponent-only footage cannot substantiate a Vince finding.");
      }
      if (
        new Set(finding.followups.map((f) => f.id)).size !==
        finding.followups.length
      )
        issue("Duplicate follow-up IDs.");
    }
    data.goals.forEach((g) => {
      opponent(g.opponentId);
      if (g.findingId && !findings.has(g.findingId))
        issue("Training objective references a missing finding.");
    });
  });
export type Camp = z.infer<typeof campSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Finding = z.infer<typeof findingSchema>;
export const emptyCamp = (): Camp => ({
  schemaVersion: 1,
  profile: {
    name: "Vince",
    stance: "",
    weightClass: "",
    height: "",
    reach: "",
    discipline: "boxing",
    strengths: "",
    priorities: "",
    combinations: "",
    defense: "",
    notes: "",
    fightHistory: "",
  },
  camp: {
    name: "",
    status: "not-set",
    startDate: "",
    fightDate: "",
    opponentId: "",
    notes: "",
    retentionDays: "30",
  },
  opponents: [],
  sessions: [],
  findings: [],
  goals: [],
});
export function daysUntil(fightDate: string, now = new Date()) {
  if (!fightDate) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.parse(fightDate + "T00:00:00Z") - today) / 86400000);
}
export function suggestGoal(finding: Finding, week: string) {
  // Deliberately copies the coach's documented correction and drill. No model call.
  return {
    id: crypto.randomUUID(),
    week,
    title: finding.correction.slice(0, 160),
    focus: finding.observation,
    drill: finding.drill,
    findingId: finding.id,
    opponentId: "",
    status: "draft" as const,
    notes: "Draft from a documented priority; coach approval required.",
  };
}
