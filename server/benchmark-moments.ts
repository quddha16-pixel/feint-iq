import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { reportSchema } from "../src/domain/contracts";
import { evaluateMomentSelection } from "./moments";
// Offline only. No provider calls or cloud operations.
async function json(path: string | undefined) {
  if (!path || (await stat(path)).size > 5 * 1024 * 1024)
    throw new Error("Provide two JSON files, each under 5 MiB.");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
try {
  const report = reportSchema.parse(await json(process.argv[2]));
  const annotations = z
    .object({
      videoId: z.string(),
      wholeClipReviewed: z.literal(true),
      moments: z
        .array(
          z.object({
            time: z.number().finite().nonnegative(),
            note: z.string().trim().min(1).max(1600),
          }),
        )
        .max(1000),
    })
    .strict()
    .parse(await json(process.argv[3]));
  if (
    !report.momentAnalysis ||
    annotations.videoId !== report.video.id ||
    annotations.moments.some((m) => m.time >= report.video.duration) ||
    new Set(annotations.moments.map((m) => m.time)).size !==
      annotations.moments.length
  )
    throw new Error(
      "Annotations must match this moment report, contain unique timestamps inside the video, and cover the whole clip.",
    );
  console.log(
    JSON.stringify(
      {
        methodology:
          "Coach-annotated point coverage within selected intervals; not punch/contact accuracy",
        ...evaluateMomentSelection(
          report.momentAnalysis.moments.map((m) => m.candidate),
          annotations.moments.map((m) => m.time),
        ),
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "Evaluation failed: use a valid moment report and matching whole-clip annotations. No provider request was made.",
  );
  process.exitCode = 1;
}
