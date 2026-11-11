import { describe, expect, it } from "vitest";
import {
  campSchema,
  daysUntil,
  emptyCamp,
  suggestGoal,
  type Finding,
  type Session,
} from "./model";
import { CAMP_KEY, loadCamp, parseBackup, saveCamp } from "./storage";
const session: Session = {
  id: "round-1",
  title: "Synthetic source round",
  date: "2026-11-10",
  kind: "sparring",
  discipline: "boxing",
  opponentId: "",
  round: "1",
  duration: 180,
  footage: "synthetic.webm",
  reportId: "",
  notes: "",
  identification: "Test-only reference",
  identityConfirmed: true,
};
const finding: Finding = {
  id: "finding-1",
  subject: "vince",
  kind: "hypothesis",
  category: "distance",
  observation: "Synthetic observation",
  evidence: {
    sessionId: "round-1",
    time: 20,
    end: 25,
    context: "Synthetic test evidence, not footage analysis",
  },
  diagnosis: "Test-only diagnosis",
  consequence: "Test-only consequence",
  correction: "Test-only correction",
  drill: "Test drill: 2 rounds at reduced speed",
  priority: "high",
  followups: [],
};
describe("camp evidence and persistence", () => {
  it("opens in recovery mode when the browser denies access to storage itself", () => {
    const previous = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("Storage access denied");
      },
    });
    try {
      expect(loadCamp().blocked).toBe(true);
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", previous);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
  it("starts without invented fighter attributes, dates, sessions, or findings", () => {
    const data = emptyCamp();
    expect(data.profile.name).toBe("Vince");
    expect(data.profile.stance).toBe("");
    expect(data.camp.fightDate).toBe("");
    expect(data.sessions).toEqual([]);
    expect(daysUntil("")).toBeNull();
    expect(daysUntil("2026-11-12", new Date(2026, 10, 10, 23, 55))).toBe(2);
    expect(
      campSchema.safeParse({
        ...data,
        camp: { ...data.camp, startDate: "2026-02-30" },
      }).success,
    ).toBe(false);
  });
  it("requires the entire coaching chain and real source references, with timestamps in bounds", () => {
    const data = { ...emptyCamp(), sessions: [session], findings: [finding] };
    expect(campSchema.parse(data).findings[0].kind).toBe("hypothesis");
    for (const bad of [
      { ...finding, drill: "" },
      { ...finding, diagnosis: "" },
      { ...finding, evidence: { ...finding.evidence, sessionId: "missing" } },
      { ...finding, evidence: { ...finding.evidence, time: 200, end: null } },
      { ...finding, evidence: { ...finding.evidence, end: 1 } },
    ])
      expect(campSchema.safeParse({ ...data, findings: [bad] }).success).toBe(
        false,
      );
    expect(
      campSchema.safeParse({
        ...data,
        sessions: [{ ...session, kind: "opponent" }],
      }).success,
    ).toBe(false);
    expect(
      campSchema.safeParse({ ...data, findings: [finding, finding] }).success,
    ).toBe(false);
  });
  it("copies only documented training guidance into an unapproved draft", () => {
    const goal = suggestGoal(finding, "2026-11-09");
    expect(goal.status).toBe("draft");
    expect(goal.drill).toBe(finding.drill);
    expect(goal.findingId).toBe(finding.id);
    expect(goal.title).toBe(finding.correction);
  });
  it("round-trips backups atomically and never modifies legacy reports", () => {
    const records = new Map([
      ["identifier-q.reports.v1", "legacy-report-data"],
    ]);
    const storage = {
      getItem: (k: string) => records.get(k) ?? null,
      setItem: (k: string, v: string) => {
        records.set(k, v);
      },
    };
    const data = { ...emptyCamp(), sessions: [session], findings: [finding] };
    saveCamp(data, storage);
    expect(loadCamp(storage).value).toEqual(data);
    expect(records.get("identifier-q.reports.v1")).toBe("legacy-report-data");
    expect(
      parseBackup(
        JSON.stringify({
          format: "identifier-q-camp",
          version: 1,
          workspace: data,
        }),
      ),
    ).toEqual(data);
    expect(() => parseBackup('{"format":')).toThrow();
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: "identifier-q-camp",
          version: 2,
          workspace: data,
        }),
      ),
    ).toThrow();
    records.set(CAMP_KEY, "corrupted original");
    expect(loadCamp(storage).blocked).toBe(true);
    expect(records.get(CAMP_KEY)).toBe("corrupted original");
    const newer = JSON.stringify({
      ...data,
      profile: { ...data.profile, notes: "Saved in another tab" },
    });
    records.set(CAMP_KEY, newer);
    expect(() => saveCamp(data, storage, JSON.stringify(data))).toThrow(
      "another tab",
    );
    expect(records.get(CAMP_KEY)).toBe(newer);
    expect(() =>
      saveCamp(data, {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).toThrow("quota");
  });
});
