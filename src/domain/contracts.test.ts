import { describe, expect, it } from "vitest";
import { compareReports, configSchema, reportSchema } from "./contracts";
import { gradeFor, metricsFor } from "./metrics";
import { safeSeek, validateVideoFile } from "./video";
import { makeReport } from "../../tests/fixture";
import { analysisService } from "../services/analysis";
import { importReports } from "../services/storage";
describe("evidence integrity", () => {
  it("accepts a complete structured test report", () => {
    expect(reportSchema.safeParse(makeReport()).success).toBe(true);
  });
  it("rejects fabricated verified times on estimates and out-of-bounds video positions", () => {
    const r = makeReport();
    r.evidence[0].kind = "estimated";
    expect(reportSchema.safeParse(r).success).toBe(false);
    r.evidence[0].kind = "observed";
    r.evidence[0].verifiedTime = 999;
    expect(reportSchema.safeParse(r).success).toBe(false);
  });
  it("rejects broken evidence, metric, and recommendation references", () => {
    const r = makeReport();
    r.observations[0].evidenceIds = ["missing"];
    expect(reportSchema.safeParse(r).success).toBe(false);
    const s = makeReport();
    s.recommendations[0].observationIds = ["missing"];
    expect(reportSchema.safeParse(s).success).toBe(false);
  });
  it("rejects scores without sufficient evidence and invalid metric domains", () => {
    const r = makeReport();
    r.metrics[0].observationIds = [];
    expect(reportSchema.safeParse(r).success).toBe(false);
    const s = makeReport();
    s.metrics[0].id = "kicking";
    expect(reportSchema.safeParse(s).success).toBe(false);
  });
  it("rejects duplicate IDs, unknown schema versions, non-finite scores and malformed reports", () => {
    const r = makeReport();
    r.observations.push(r.observations[0]);
    expect(reportSchema.safeParse(r).success).toBe(false);
    expect(
      reportSchema.safeParse({ ...makeReport(), schemaVersion: 2 }).success,
    ).toBe(false);
    const s = makeReport();
    s.metrics[0].score = NaN;
    expect(reportSchema.safeParse(s).success).toBe(false);
    expect(reportSchema.safeParse({}).success).toBe(false);
  });
  it("renders unavailable metric scores as explicit nulls in the contract", () => {
    const r = makeReport();
    expect(r.metrics[1].score).toBeNull();
    r.metrics[1].score = 10;
    expect(reportSchema.safeParse(r).success).toBe(false);
  });
  it("rejects conclusions based exclusively on unverified material", () => {
    const r = makeReport();
    r.evidence[0].kind = "unverified";
    r.evidence[0].verifiedTime = null;
    r.observations[0].kind = "inferred";
    expect(reportSchema.safeParse(r).success).toBe(false);
  });
});
describe("discipline and scoring", () => {
  it("uses distinct technical dimensions and ruleset applicability", () => {
    expect(metricsFor("boxing")).toHaveLength(12);
    expect(metricsFor("boxing").some((m) => m.id === "kicking")).toBe(false);
    expect(metricsFor("kickboxing", "k1")).toHaveLength(14);
    expect(
      metricsFor("kickboxing", "low-kick").find((m) => m.id === "knees")
        ?.applicable,
    ).toBe(false);
    expect(
      metricsFor("kickboxing", "full-contact").find((m) => m.id === "checking")
        ?.applicable,
    ).toBe(false);
  });
  it("validates manual identification and discipline-specific settings", () => {
    const c = makeReport().configuration;
    expect(
      configSchema.safeParse({
        ...c,
        fighter: { ...c.fighter, method: "manual", notes: "" },
      }).success,
    ).toBe(false);
    expect(configSchema.safeParse({ ...c, ruleset: "k1" }).success).toBe(false);
    expect(
      configSchema.safeParse({ ...c, discipline: "kickboxing" }).success,
    ).toBe(false);
  });
  it("uses a centralized deterministic letter scale", () => {
    expect(gradeFor(97)).toBe("A+");
    expect(gradeFor(60)).toBe("D");
    expect(gradeFor(59)).toBe("F");
    expect(gradeFor(null)).toBe("Not assessed");
    expect(gradeFor(101)).toBe("Not assessed");
  });
});
describe("comparison and persistence", () => {
  it("compares compatible reports without altering saved discipline", () => {
    const a = makeReport(),
      b = makeReport("second", 80);
    const c = compareReports(a, b);
    expect(c.compatible).toBe(true);
    expect(c.overallDelta).toBe(10);
    expect(c.metrics[0].delta).toBe(10);
    expect(a.configuration.discipline).toBe("boxing");
  });
  it("withholds numerical deltas across methodologies and rejects incompatible fighters", () => {
    const a = makeReport(),
      b = makeReport("second");
    b.methodology.version = "test-v2";
    expect(compareReports(a, b).overallDelta).toBeNull();
    b.configuration.fighter.name = "Other";
    expect(compareReports(a, b).compatible).toBe(false);
  });
  it("does not overwrite an existing report on import", () => {
    const r = makeReport();
    expect(() => importReports(r, [r])).toThrow("already exists");
    expect(importReports(makeReport("new"), [r])).toHaveLength(2);
  });
});
describe("video and service boundary", () => {
  it("checks supported formats, empty files, mime and limits", () => {
    expect(
      validateVideoFile({ name: "a.mp4", size: 100, type: "video/mp4" }, 500),
    ).toBeUndefined();
    expect(
      validateVideoFile({ name: "a.exe", size: 100, type: "" }, 500),
    ).toMatch("MP4");
    expect(
      validateVideoFile({ name: "a.mov", size: 0, type: "" }, 500),
    ).toMatch("empty");
    expect(
      validateVideoFile({ name: "a.webm", size: 100, type: "text/html" }, 500),
    ).toMatch("type");
    expect(
      validateVideoFile(
        { name: "a.mp4", size: 501 * 1024 * 1024, type: "" },
        500,
      ),
    ).toMatch("exceeds");
  });
  it("guards seeking before metadata and beyond duration", () => {
    expect(safeSeek(null, 1)).toMatch("Load");
    const video = {
      readyState: 1,
      duration: 10,
      currentTime: 0,
    } as HTMLVideoElement;
    expect(safeSeek(video, 11)).toMatch("outside");
    expect(safeSeek(video, 3)).toBeUndefined();
    expect(video.currentTime).toBe(3);
  });
  it("explicitly rejects unavailable backend operations", async () => {
    expect(analysisService.capabilities.available).toBe(false);
    await expect(analysisService.status("job")).rejects.toThrow(
      "not connected",
    );
    await expect(analysisService.get("report")).rejects.toThrow(
      "not connected",
    );
  });
});
it("withholds scores derived exclusively from estimated evidence", () => {
  const r = makeReport();
  r.evidence[0].kind = "estimated";
  r.evidence[0].verifiedTime = null;
  r.observations[0].kind = "inferred";
  expect(reportSchema.safeParse(r).success).toBe(false);
});
it("preserves legacy reports while validating additional identity confirmations", () => {
  const report = makeReport();
  expect(reportSchema.safeParse(report).success).toBe(true);
  report.configuration.fighter.subjectId = crypto.randomUUID();
  report.configuration.fighter.confirmationFrames = [
    { time: 1, x: 0.3, y: 0.6 },
    { time: 3, x: 0.8, y: 0.4 },
  ];
  expect(reportSchema.safeParse(report).success).toBe(true);
  report.configuration.fighter.confirmationFrames[1].time = 999;
  expect(reportSchema.safeParse(report).success).toBe(false);
});
describe("Shades Of evidence-backed style references", () => {
  it("supports one to three references linked to real report findings", () => {
    const r = makeReport();
    r.styleComparisons = [
      {
        referenceId: "dmitry-bivol",
        explanation:
          "Synthetic test comparison linked to this test observation.",
        observationIds: ["obs"],
      },
    ];
    expect(reportSchema.safeParse(r).success).toBe(true);
    r.styleComparisons.push(
      {
        referenceId: "muhammad-ali",
        explanation: "A second synthetic test reference.",
        observationIds: ["obs"],
      },
      {
        referenceId: "oleksandr-usyk",
        explanation: "A third synthetic reference.",
        observationIds: ["obs"],
      },
    );
    expect(reportSchema.safeParse(r).success).toBe(true);
  });
  it("rejects unsupported references, duplicates, wrong disciplines, missing findings, and excessive comparisons", () => {
    const r = makeReport();
    r.styleComparisons = [
      {
        referenceId: "dmitry-bivol",
        explanation: "Test-only reference.",
        observationIds: ["missing"],
      },
    ];
    expect(reportSchema.safeParse(r).success).toBe(false);
    r.styleComparisons[0].observationIds = ["obs"];
    r.styleComparisons.push(r.styleComparisons[0]);
    expect(reportSchema.safeParse(r).success).toBe(false);
    r.styleComparisons = [
      {
        referenceId: "ernesto-hoost",
        explanation: "Wrong discipline.",
        observationIds: ["obs"],
      },
    ];
    expect(reportSchema.safeParse(r).success).toBe(false);
    expect(
      reportSchema.safeParse({
        ...r,
        styleComparisons: [
          {
            referenceId: "invented-fighter",
            explanation: "Unsupported",
            observationIds: ["obs"],
          },
        ],
      }).success,
    ).toBe(false);
    r.styleComparisons = Array(4).fill({
      referenceId: "dmitry-bivol",
      explanation: "Too many.",
      observationIds: ["obs"],
    });
    expect(reportSchema.safeParse(r).success).toBe(false);
  });
  it("retains a truthful empty state for old or insufficient reports", () => {
    expect(reportSchema.parse(makeReport()).styleComparisons).toBeUndefined();
  });
});
