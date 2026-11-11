import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import type { SelectedMoment } from "../src/domain/moments";
export const momentOptionsSchema = z.object({
  maxMoments: z.number().int().min(1).max(6).default(4),
  threshold: z.number().min(0.005).max(0.2).default(0.025),
});
export type MomentOptions = z.input<typeof momentOptionsSchema>;
export interface MotionSample {
  time: number;
  score: number;
  cut: boolean;
}
// Uniform luminance changes are removed. This is an image-change cue, NOT an action classifier.
export function motionDifference(previous: Uint8Array, current: Uint8Array) {
  const histogram = new Uint32Array(511);
  for (let i = 0; i < current.length; i++)
    histogram[current[i] - previous[i] + 255]++;
  let median = 0,
    accumulated = 0;
  for (let i = 0; i < histogram.length; i++) {
    accumulated += histogram[i];
    if (accumulated >= current.length / 2) {
      median = i - 255;
      break;
    }
  }
  let total = 0,
    active = 0,
    raw = 0;
  for (let i = 0; i < current.length; i++) {
    const delta = Math.abs(current[i] - previous[i] - median);
    total += delta;
    raw += Math.abs(current[i] - previous[i]);
    if (delta > 30) active++;
  }
  const score = total / current.length / 255;
  return {
    score,
    cut:
      raw / current.length / 255 > 0.6 ||
      score > 0.3 ||
      active / current.length > 0.65,
  };
}
export function selectMoments(
  samples: MotionSample[],
  duration: number,
  input: MomentOptions = {},
) {
  const options = momentOptionsSchema.parse(input);
  const cuts = samples.filter((s) => s.cut).map((s) => s.time);
  const safe = (t: number) => !cuts.some((c) => c >= t - 1.5 && c <= t + 1.5);
  const ranked = samples
    .filter(
      (s) =>
        s.time >= 0.5 &&
        s.time <= duration - 0.5 &&
        s.score >= options.threshold &&
        !s.cut &&
        safe(s.time),
    )
    .sort((a, b) => b.score - a.score || a.time - b.time);
  const peaks: number[] = [];
  for (const s of ranked) {
    if (peaks.every((t) => Math.abs(t - s.time) > 3.2)) peaks.push(s.time);
    if (peaks.length >= options.maxMoments) break;
  }
  const fallback = peaks.length === 0;
  if (fallback) {
    const count = Math.min(3, options.maxMoments);
    for (let i = 1; i <= count; i++) {
      const target = (duration * i) / (count + 1);
      const available = samples.filter(
        (s) =>
          s.time >= 1.5 &&
          s.time <= duration - 1.5 &&
          safe(s.time) &&
          peaks.every((t) => Math.abs(t - s.time) > 3.2),
      );
      available.sort(
        (a, b) => Math.abs(a.time - target) - Math.abs(b.time - target),
      );
      if (available.length) peaks.push(available[0].time);
    }
  }
  if (!peaks.length)
    throw new Error(
      "No usable review interval was found. Use a clearer, continuous boxing clip.",
    );
  return peaks
    .sort((a, b) => a - b)
    .map(
      (anchor, i) =>
        ({
          id: `moment-${i + 1}`,
          start: Math.max(0, anchor - 1.5),
          end: Math.min(duration, anchor + 1.5),
          anchor,
          selection: fallback ? "fallback" : "motion",
          candidateType: fallback ? "coverage-sample" : "motion-burst",
          frameIds: [],
        }) as SelectedMoment,
    );
}
export async function scanMotion(path: string, signal?: AbortSignal) {
  const started = performance.now();
  return new Promise<{ samples: MotionSample[]; elapsedMs: number }>(
    (resolve, reject) => {
      const child = spawn(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "info",
          "-protocol_whitelist",
          "file,pipe",
          "-format_whitelist",
          "mov,matroska,webm",
          "-i",
          path,
          "-an",
          "-vf",
          "select='isnan(prev_selected_t)+gte(t-prev_selected_t,0.166666)',scale=160:90,format=gray,showinfo",
          "-fps_mode",
          "vfr",
          "-threads",
          "1",
          "-f",
          "rawvideo",
          "pipe:1",
        ],
        { signal, stdio: ["ignore", "pipe", "pipe"] },
      );
      const timer = setTimeout(() => child.kill("SIGKILL"), 45000);
      let pending = Buffer.alloc(0),
        previous: Buffer | undefined,
        log = "",
        overflow = false;
      const scores: { score: number; cut: boolean }[] = [];
      child.stdout.on("data", (data: Buffer) => {
        pending = Buffer.concat([pending, data]);
        while (pending.length >= 14400) {
          const frame = Buffer.from(pending.subarray(0, 14400));
          pending = pending.subarray(14400);
          scores.push(
            previous
              ? motionDifference(previous, frame)
              : { score: 0, cut: false },
          );
          previous = frame;
          if (scores.length > 1900) {
            overflow = true;
            child.kill("SIGKILL");
            break;
          }
        }
      });
      child.stderr.on("data", (data) => {
        log += data.toString();
        if (log.length > 2_000_000) {
          overflow = true;
          child.kill("SIGKILL");
        }
      });
      child.on("error", () => {
        clearTimeout(timer);
        reject(new Error("Moment scan canceled or unavailable."));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const times = [
          ...log.matchAll(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([\d.e+-]+)/g),
        ].map((m) => Number(m[1]));
        if (
          code !== 0 ||
          overflow ||
          pending.length ||
          times.length !== scores.length ||
          times.length < 2 ||
          times.some(
            (t, i) =>
              !Number.isFinite(t) || t < 0 || (i > 0 && t <= times[i - 1]),
          )
        )
          return reject(
            new Error(
              "Moment scan could not read a complete timestamped sequence.",
            ),
          );
        resolve({
          samples: scores.map((s, i) => ({ ...s, time: times[i] })),
          elapsedMs: performance.now() - started,
        });
      });
    },
  );
}
/** Evaluation of candidate search coverage, not punch/contact recognition. Annotate the whole clip first. */
export function evaluateMomentSelection(
  candidates: { start: number; end: number }[],
  annotatedTimes: number[],
) {
  const covered = annotatedTimes.filter((t) =>
    candidates.some((c) => t >= c.start && t <= c.end),
  ).length;
  const useful = candidates.filter((c) =>
    annotatedTimes.some((t) => t >= c.start && t <= c.end),
  ).length;
  return {
    annotated: annotatedTimes.length,
    covered,
    missed: annotatedTimes.length - covered,
    candidates: candidates.length,
    falsePositives: candidates.length - useful,
    coverageRecall: annotatedTimes.length
      ? covered / annotatedTimes.length
      : null,
    candidatePrecision: candidates.length ? useful / candidates.length : null,
  };
}
