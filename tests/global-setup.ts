import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
export default function setup() {
  mkdirSync("/tmp/identifier-q-tests", { recursive: true });
  const result = spawnSync(
    "ffmpeg",
    [
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=320x240:r=10",
      "-t",
      "12",
      "-c:v",
      "libvpx",
      "-an",
      "-y",
      "/tmp/identifier-q-tests/test-footage.webm",
      "-loglevel",
      "error",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(
      `Browser tests require ffmpeg with libvpx to generate a synthetic codec fixture: ${result.error?.message ?? result.stderr}`,
    );
  for (const seconds of [8, 301]) {
    const result = spawnSync(
      "ffmpeg",
      [
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=32x32:r=2",
        "-t",
        String(seconds),
        "-c:v",
        "libvpx",
        "-threads",
        "1",
        "-an",
        "-y",
        `/tmp/identifier-q-tests/duration-${seconds}.webm`,
        "-loglevel",
        "error",
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0)
      throw new Error(
        "Could not generate duration-boundary codec test footage.",
      );
  }
}
