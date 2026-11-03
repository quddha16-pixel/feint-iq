import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PILOT_LIMITS } from "../src/domain/engine";
import type { AnalysisConfiguration } from "../src/domain/contracts";
export interface SampledFrame {
  id: string;
  time: number;
  mime: "image/jpeg";
  data: string;
  identityReference?: { x: number; y: number; note?: string };
}
export interface PreparedVideo {
  duration: number;
  frames: SampledFrame[];
}
export async function run(
  command: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 45000);
    child.stdout.on("data", (d) => {
      out += d.toString();
      if (out.length > 2_000_000) child.kill("SIGKILL");
    });
    child.stderr.on("data", (d) => {
      err = (err + d.toString()).slice(-5000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else
        reject(
          new Error(
            `Media decoding failed (${command}, exit ${code}). Use a valid, decodable MP4, MOV, or WebM clip. ${err.includes("Invalid data") ? "Invalid media data." : ""}`,
          ),
        );
    });
  });
}
export async function prepareVideo(
  path: string,
  directory: string,
  configuration: AnalysisConfiguration,
  signal?: AbortSignal,
): Promise<PreparedVideo> {
  const metadata = JSON.parse(
    await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "mov,matroska,webm",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        path,
      ],
      signal,
    ),
  );
  const stream = metadata.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  const duration = Number(metadata.format?.duration);
  if (
    !stream ||
    !Number.isFinite(duration) ||
    duration < PILOT_LIMITS.minSeconds ||
    duration > PILOT_LIMITS.maxSeconds
  )
    throw new Error(
      "The live pilot accepts a 10–300-second video with a decodable video track.",
    );
  if (Number(stream.width) * Number(stream.height) > 3840 * 2160)
    throw new Error("Use footage at 4K resolution or below.");
  const references = configuration.fighter.confirmationFrames?.length
    ? configuration.fighter.confirmationFrames
    : configuration.fighter.frame
      ? [configuration.fighter.frame]
      : [];
  if (!references.length)
    throw new Error(
      "Add at least one fighter confirmation frame for the live pilot. Corner or initial position alone is not enough.",
    );
  if (references.some((f) => f.time >= duration))
    throw new Error("Identity frame references must be inside this clip.");
  // select preserves decoder presentation timestamps; showinfo supplies actual PTS, not model guesses.
  const frames: SampledFrame[] = [];
  const interval = Math.max(1 / PILOT_LIMITS.fps, duration / 120);
  const count = Math.min(120, Math.ceil(duration / interval));
  // One decode process for the sequence. showinfo's stderr PTS is captured separately below.
  await extractSequence(path, directory, count, interval, frames, signal);
  for (let i = 0; i < references.length; i++) {
    const reference = references[i];
    const output = join(directory, `identity-${i}.jpg`);
    // Accurate decode seek; an identity hint is not promoted to an observation timestamp.
    await run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "mov,matroska,webm",
        "-i",
        path,
        "-ss",
        String(reference.time),
        "-frames:v",
        "1",
        "-vf",
        "scale=640:640:force_original_aspect_ratio=decrease",
        "-q:v",
        "4",
        "-threads",
        "1",
        "-y",
        output,
      ],
      signal,
    );
    frames.push({
      id: `identity-${i}`,
      time: reference.time,
      mime: "image/jpeg",
      data: (await readFile(output)).toString("base64"),
      identityReference: {
        x: reference.x,
        y: reference.y,
        note: reference.note,
      },
    });
  }
  return { duration, frames };
}
async function extractSequence(
  path: string,
  directory: string,
  count: number,
  interval: number,
  frames: SampledFrame[],
  signal?: AbortSignal,
) {
  const output = join(directory, "frame-%03d.jpg");
  const pts = await new Promise<number[]>((resolve, reject) => {
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
        `select='isnan(prev_selected_t)+gte(t-prev_selected_t,${interval})',scale=640:640:force_original_aspect_ratio=decrease,showinfo`,
        "-fps_mode",
        "vfr",
        "-frames:v",
        String(count),
        "-q:v",
        "4",
        "-threads",
        "1",
        "-y",
        output,
      ],
      { signal, stdio: ["ignore", "ignore", "pipe"] },
    );
    let log = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 45000);
    child.stderr.on("data", (d) => {
      log += d.toString();
      if (log.length > 2_000_000) child.kill("SIGKILL");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(
          new Error(
            "Video decoding failed. Try exporting a shorter H.264 MP4 clip.",
          ),
        );
      const times = [
        ...log.matchAll(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([\d.e+-]+)/g),
      ].map((m) => Number(m[1]));
      resolve(times.slice(0, count));
    });
  });
  if (pts.length < 2)
    throw new Error("Too few decodable frames to assess this clip.");
  for (let i = 0; i < pts.length; i++)
    frames.push({
      id: `frame-${i + 1}`,
      time: pts[i],
      mime: "image/jpeg",
      data: (
        await readFile(
          join(directory, `frame-${String(i + 1).padStart(3, "0")}.jpg`),
        )
      ).toString("base64"),
    });
}
