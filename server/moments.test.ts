import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  motionDifference,
  selectMoments,
  evaluateMomentSelection,
  type MotionSample,
} from "./moments";
import { prepareVideo, run } from "./media";
import { makeReport } from "../tests/fixture";
import { validateMomentInput } from "./moment-schema";
describe("lightweight image-change proposals, never recognized punches", () => {
  it("suppresses static/uniform lighting changes and flags abrupt scene changes", () => {
    const a = new Uint8Array(100).fill(20),
      b = new Uint8Array(a).fill(40);
    expect(motionDifference(a, a).score).toBe(0);
    expect(motionDifference(a, b).score).toBe(0);
    b.fill(200, 10, 20);
    expect(motionDifference(a, b).score).toBeGreaterThan(0.025);
    expect(motionDifference(a, new Uint8Array(100).fill(255)).cut).toBe(true);
  });
  it("caps, separates and orders peaks, excludes cuts and falls back without inventing events", () => {
    const samples: MotionSample[] = Array.from({ length: 180 }, (_, i) => ({
      time: i / 6,
      score: 0,
      cut: false,
    }));
    for (const t of [3, 3.2, 9, 15, 21, 27])
      samples[Math.round(t * 6)].score = 0.1;
    samples[9 * 6].cut = true;
    const selected = selectMoments(samples, 30, { maxMoments: 3 });
    expect(selected).toHaveLength(3);
    expect(selected.map((m) => m.anchor)).toEqual([3, 15, 21]);
    expect(
      selected.every((m) => m.end - m.start <= 3 && m.selection === "motion"),
    ).toBe(true);
    const fallback = selectMoments(
      samples.map((s) => ({ ...s, score: 0, cut: false })),
      30,
    );
    expect(fallback.map((m) => m.anchor)).toEqual([7.5, 15, 22.5]);
    expect(fallback.every((m) => m.candidateType === "coverage-sample")).toBe(
      true,
    );
    expect(() => selectMoments(samples, 30, { maxMoments: 7 })).toThrow();
  });
  it("counts missed annotations as well as false positives; plausible candidates do not establish recall", () => {
    expect(
      evaluateMomentSelection(
        [
          { start: 2, end: 4 },
          { start: 5, end: 7 },
        ],
        [3, 10],
      ),
    ).toEqual({
      annotated: 2,
      covered: 1,
      missed: 1,
      candidates: 2,
      falsePositives: 1,
      coverageRecall: 0.5,
      candidatePrecision: 0.5,
    });
    const signal: MotionSample[] = Array.from({ length: 72 }, (_, i) => ({
      time: i / 6,
      score: i === 18 || i === 42 ? 0.1 : 0,
      cut: false,
    }));
    expect(
      evaluateMomentSelection(selectMoments(signal, 12), [3, 10]),
    ).toMatchObject({ missed: 1, falsePositives: 1, coverageRecall: 0.5 });
    expect(evaluateMomentSelection([], [])).toMatchObject({
      coverageRecall: null,
      candidatePrecision: null,
    });
  });
  it.each(["black", "motion", "vfr"])(
    "decodes %s codec footage into bounded chronological before/after sequences with actual source timestamps",
    async (kind) => {
      const directory = await mkdtemp(join(tmpdir(), "iq-moment-test-"));
      try {
        const path = join(directory, "test.webm");
        await run("ffmpeg", [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          kind === "black"
            ? "color=black:s=320x240:r=15:d=12"
            : "testsrc2=s=320x240:r=15:d=12",
          ...(kind === "vfr"
            ? [
                "-vf",
                "select='eq(mod(n,3),0)+between(t,3,6)'",
                "-fps_mode",
                "vfr",
              ]
            : []),
          "-c:v",
          "libvpx",
          "-threads",
          "1",
          "-an",
          "-y",
          path,
        ]);
        const decoded = JSON.parse(
          await run("ffprobe", [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_frames",
            "-show_entries",
            "frame=best_effort_timestamp_time",
            "-of",
            "json",
            path,
          ]),
        );
        const sourceTimes = decoded.frames.map(
          (f: { best_effort_timestamp_time: string }) =>
            Number(f.best_effort_timestamp_time),
        );
        const config = {
          ...makeReport().configuration,
          momentReview: true,
          fighter: {
            ...makeReport().configuration.fighter,
            confirmationFrames: [{ time: 1, x: 0.4, y: 0.5 }],
          },
        };
        const result = await prepareVideo(path, directory, config, undefined, {
          threshold: 0.005,
        });
        validateMomentInput(result);
        expect(result.scan!.fallbackUsed).toBe(kind === "black");
        expect(result.moments!.length).toBeGreaterThanOrEqual(2);
        const frames = result.frames.filter((f) => !f.identityReference);
        expect(frames.length).toBeLessThanOrEqual(120);
        for (const m of result.moments!) {
          const sequence = frames.filter((f) => f.momentId === m.id);
          expect(sequence.length).toBeGreaterThan(6);
          expect(
            sequence.every((f, i) => !i || f.time > sequence[i - 1].time),
          ).toBe(true);
          expect(sequence.some((f) => f.time < m.anchor)).toBe(true);
          expect(sequence.some((f) => f.time > m.anchor)).toBe(true);
          for (const f of sequence)
            expect(
              sourceTimes.some((t: number) => Math.abs(t - f.time) < 0.00001),
            ).toBe(true);
        }
        expect(result.frames.at(-1)!.identityReference).toEqual({
          x: 0.4,
          y: 0.5,
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    20000,
  );
});
