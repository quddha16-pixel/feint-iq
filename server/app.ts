import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { timingSafeEqual } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configSchema,
  videoSchema,
  type AnalysisJob,
  type CompletedAnalysisReport,
} from "../src/domain/contracts";
import { REQUEST_PROTOCOL, type AnalysisEvent } from "../src/domain/transport";
import { PILOT_LIMITS } from "../src/domain/engine";
import { validateVideoFile } from "../src/domain/video";
import { prepareVideo, type PreparedVideo } from "./media";
import type { VideoAnalysisProvider } from "./provider";
import { buildReport } from "./report";
import type { ProviderUsage } from "./provider-usage";
import { momentOptionsSchema, type MomentOptions } from "./moments";
interface Options {
  accessToken: string;
  origin: string;
  provider?: VideoAnalysisProvider;
  prepare?: typeof prepareVideo;
  ttlMs?: number;
  timeoutMs?: number;
  maxUploadBytes?: number;
  onProviderUsage?: (usage: ProviderUsage, jobId: string) => void;
  momentOptions?: MomentOptions;
}
interface StoredJob {
  job: AnalysisJob;
  created: number;
  abort: AbortController;
  report?: CompletedAnalysisReport;
  usage?: ProviderUsage;
}
export async function createBackend(options: Options) {
  const momentOptions = momentOptionsSchema.parse(options.momentOptions ?? {});
  if (options.accessToken.length < 32)
    throw new Error(
      "ANALYSIS_ACCESS_TOKEN must contain at least 32 characters and stay server-side except for the authorized pilot user’s session access.",
    );
  if (new URL(options.origin).origin !== options.origin)
    throw new Error("FRONTEND_ORIGIN must be an exact origin without a path.");
  const maxUploadBytes = options.maxUploadBytes ?? PILOT_LIMITS.maxBytes;
  if (
    !Number.isSafeInteger(maxUploadBytes) ||
    maxUploadBytes < 1 ||
    maxUploadBytes > PILOT_LIMITS.maxBytes
  )
    throw new Error("Invalid server upload limit.");
  const uploadLimitMB = maxUploadBytes / 1024 / 1024;
  const app = Fastify({
    logger: false,
    bodyLimit: maxUploadBytes + 128 * 1024,
    requestTimeout: 120000,
  });
  await app.register(cors, {
    origin: options.origin,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "idempotency-key"],
    credentials: false,
    maxAge: 600,
  });
  await app.register(rateLimit, { max: 60, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: maxUploadBytes,
      fields: 2,
      fieldSize: 32768,
      parts: 3,
    },
  });
  const jobs = new Map<string, StoredJob>();
  const idempotency = new Map<string, { id: string; fingerprint: string }>();
  let active = false;
  const running = new Set<Promise<void>>();
  const expired = () => {
    for (const [id, entry] of jobs)
      if (
        Date.now() - entry.created > (options.ttlMs ?? 15 * 60 * 1000) &&
        !["processing", "queued"].includes(entry.job.status)
      ) {
        jobs.delete(id);
        for (const [key, value] of idempotency)
          if (value.id === id) idempotency.delete(key);
      }
  };
  let closing = false;
  app.addHook("preClose", async () => {
    closing = true;
    for (const entry of jobs.values()) entry.abort.abort();
  });
  app.addHook("onClose", async () => {
    await Promise.allSettled([...running]);
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff");
    if (req.method === "OPTIONS") return;
    // Platform probes receive no provider, configuration, credential or job metadata.
    if (req.method === "GET" && req.routeOptions.url === "/livez") return;
    if (req.headers.origin && req.headers.origin !== options.origin)
      return reply.code(403).send({ message: "Origin is not allowed." });
    const provided = Buffer.from(
      req.headers.authorization?.replace(/^Bearer /, "") ?? "",
    );
    const expected = Buffer.from(options.accessToken);
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    )
      return reply
        .code(401)
        .send({ message: "An authorized pilot session token is required." });
  });
  app.setErrorHandler((error, _, reply) => {
    const status =
      error instanceof Error &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    reply.code(status).send({
      message:
        status === 413
          ? `Footage exceeds the ${uploadLimitMB} MB server limit.`
          : status < 500
            ? "Invalid request. Check the file, metadata, and clip limits."
            : "The analysis request could not be completed. No assessment was saved.",
    });
  });
  app.get("/livez", { config: { rateLimit: false } }, async () => ({
    status: "ok",
  }));
  app.get("/health", async () => ({
    schemaVersion: 1,
    protocol: REQUEST_PROTOCOL,
    available: !!options.provider,
    provider: options.provider?.name ?? "Not configured",
    model: options.provider?.model ?? "Not configured",
    tracking: false,
    qualitativeOnly: true,
    momentDetection: options.provider?.supportsMoments === true,
    limits: {
      maxBytes: maxUploadBytes,
      minSeconds: PILOT_LIMITS.minSeconds,
      maxSeconds: PILOT_LIMITS.maxSeconds,
    },
    message: options.provider
      ? `Backend connected; provider configured but live accuracy and access require a real-footage validation. Upload limit: ${uploadLimitMB} MiB.`
      : `Backend is reachable, but provider credentials are not configured. No footage will be accepted for analysis. Upload limit: ${uploadLimitMB} MiB.`,
  }));
  app.post("/analyses", async (req, reply) => {
    if (!options.provider)
      return reply.code(503).send({
        message:
          "The provider is not configured. No analysis was run and no source file was retained.",
      });
    expired();
    if (active)
      return reply.code(429).send({
        message:
          "The pilot worker is busy. Retry when the current job finishes.",
      });
    if (jobs.size >= 20)
      return reply.code(429).send({
        message:
          "The pilot session limit is reached. Delete older server results or wait for expiry.",
      });
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || !/^[\da-f-]{36}$/i.test(key))
      return reply
        .code(400)
        .send({ message: "A UUID idempotency key is required." });
    // Reserve the single worker while reading the request to bound upload memory as well as provider usage.
    active = true;
    let directory: string | undefined;
    try {
      let metadata: unknown,
        file: Buffer | undefined,
        filename = "",
        mime = "";
      for await (const part of req.parts()) {
        if (part.type === "file") {
          if (part.fieldname !== "video")
            throw new Error("Unexpected file field.");
          filename = part.filename;
          mime = part.mimetype;
          file = await part.toBuffer();
        } else if (part.fieldname === "metadata") {
          if (part.valueTruncated) throw new Error("Metadata too large.");
          metadata = JSON.parse(String(part.value));
        } else throw new Error("Unexpected form field.");
      }
      if (!file)
        return reply.code(400).send({ message: "Select a video file." });
      const payload = metadata as { configuration?: unknown; video?: unknown };
      const c = configSchema.safeParse(payload?.configuration),
        v = videoSchema.safeParse(payload?.video);
      if (!c.success || !v.success)
        return reply
          .code(400)
          .send({ message: "Invalid video or fighter configuration." });
      if (c.data.discipline !== "boxing")
        return reply.code(422).send({
          message:
            "The live pilot currently supports boxing only. Kickboxing setup and saved reports remain available.",
        });
      if (c.data.momentReview && !options.provider.supportsMoments)
        return reply
          .code(422)
          .send({
            message:
              "Moment review requires the configured OpenAI adapter. The legacy provider path remains available.",
          });
      if (
        !c.data.fighter.subjectId ||
        !(c.data.fighter.confirmationFrames?.length || c.data.fighter.frame)
      )
        return reply.code(422).send({
          message:
            "Add a stable subject identifier and at least one identity confirmation frame.",
        });
      const invalid = validateVideoFile(
        { name: filename, size: file.length, type: mime },
        uploadLimitMB,
      );
      if (
        invalid ||
        v.data.size !== file.length ||
        v.data.name !== filename ||
        v.data.duration < 10 ||
        v.data.duration > 300
      )
        return reply.code(422).send({
          message:
            invalid ??
            "The clip must be 10 seconds to 5 minutes, with matching file metadata.",
        });
      const fingerprint = JSON.stringify({
        configuration: c.data,
        video: v.data,
      });
      const prior = idempotency.get(key);
      if (prior) {
        const entry = jobs.get(prior.id);
        if (prior.fingerprint !== fingerprint)
          return reply.code(409).send({
            message: "This submission key was already used for another setup.",
          });
        return reply.header("content-type", "application/x-ndjson").send(
          JSON.stringify(
            entry!.report
              ? { type: "result", job: entry!.job, report: entry!.report }
              : {
                  type: "error",
                  job: entry!.job,
                  message:
                    entry!.job.error ??
                    "This submission did not complete. Retry explicitly with a new key.",
                },
          ) + "\n",
        );
      }
      directory = await mkdtemp(join(tmpdir(), "identifier-q-"));
      const path = join(directory, "source-video");
      await writeFile(path, file, { mode: 0o600 });
      file = undefined;
      const id = key,
        abort = new AbortController();
      const entry: StoredJob = {
        created: Date.now(),
        abort,
        job: { id, configuration: c.data, video: v.data, status: "queued" },
      };
      jobs.set(id, entry);
      idempotency.set(key, { id, fingerprint });
      const retainedDirectory = directory;
      directory = undefined;
      // The response remains open until processing AND cleanup finish. No detached worker.
      reply.hijack();
      for (const [name, value] of Object.entries(reply.getHeaders()))
        if (value !== undefined) reply.raw.setHeader(name, value);
      reply.raw.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-accel-buffering": "no",
      });
      reply.raw.flushHeaders();
      const send = (event: AnalysisEvent) => {
        if (!reply.raw.destroyed && !reply.raw.writableEnded)
          reply.raw.write(JSON.stringify(event) + "\n");
      };
      const update = (stage: NonNullable<AnalysisJob["stage"]>) => {
        entry.job.status = "processing";
        entry.job.stage = stage;
        send({ type: "job", job: { ...entry.job } });
      };
      const disconnect = () => {
        if (!reply.raw.writableEnded) {
          entry.job.status = "canceled";
          entry.job.error =
            "The client disconnected. No incomplete report was saved; provider usage may already have occurred.";
          abort.abort();
        }
      };
      reply.raw.on("close", disconnect);
      const heartbeat = setInterval(() => send({ type: "heartbeat" }), 10000);
      heartbeat.unref();
      let timedOut = false;
      const task = (async () => {
        let completedReport: CompletedAnalysisReport | undefined;
        const timeout = setTimeout(() => {
          timedOut = true;
          abort.abort();
        }, options.timeoutMs ?? 240000);
        try {
          update("decoding");
          const prepared: PreparedVideo = await (
            options.prepare ?? prepareVideo
          )(path, retainedDirectory, c.data, abort.signal, momentOptions);
          if (Math.abs(prepared.duration - v.data.duration) > 1)
            throw new Error(
              "Decoded duration differs from selected footage metadata. Choose the original video again.",
            );
          if (abort.signal.aborted) throw new Error("Request canceled.");
          update("analyzing");
          const result = await options.provider!.analyze(
            prepared,
            c.data,
            abort.signal,
            (usage) => {
              entry.usage = usage;
              options.onProviderUsage?.(usage, id);
            },
          );
          if (abort.signal.aborted) throw new Error("Request canceled.");
          update("validating");
          completedReport = buildReport(
            id,
            c.data,
            v.data,
            prepared,
            result,
            `${options.provider!.name}/${options.provider!.model}`,
            new Date(entry.created).toISOString(),
          );
        } catch (error) {
          if (entry.job.status !== "canceled") {
            entry.job.status = "failed";
            entry.job.error = timedOut
              ? "Analysis timed out. No partial report was saved."
              : closing
                ? "The server is restarting. No complete result was returned; check usage before retrying."
                : error instanceof Error
                  ? error.message
                  : "Analysis failed. No report was saved.";
          }
        } finally {
          clearTimeout(timeout);
          if (!abort.signal.aborted && entry.job.status === "processing") {
            entry.job.stage = "cleaning";
            send({ type: "job", job: { ...entry.job } });
          }
          try {
            await rm(retainedDirectory, { recursive: true, force: true });
          } catch {
            completedReport = undefined;
            entry.job.status = "failed";
            entry.job.error =
              "Temporary footage cleanup failed. The backend needs attention.";
          }
          active = false;
          if (
            completedReport &&
            !abort.signal.aborted &&
            entry.job.status !== "failed"
          ) {
            entry.report = completedReport;
            entry.job.reportId = id;
            entry.job.status = "completed";
            entry.job.stage = "completed";
          }
        }
      })();
      running.add(task);
      try {
        await task;
        if (entry.report)
          send({ type: "result", job: entry.job, report: entry.report });
        else
          send({
            type: "error",
            job: entry.job,
            message:
              entry.job.error ??
              "Analysis canceled. No complete result was saved.",
          });
      } finally {
        running.delete(task);
        clearInterval(heartbeat);
        reply.raw.off("close", disconnect);
        if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
      }
      return reply;
    } catch (error) {
      if (error instanceof Error && "statusCode" in error) throw error;
      return reply.code(400).send({
        message:
          "The upload could not be read. Check the video and configuration.",
      });
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
      if (
        ![...jobs.values()].some((e) =>
          ["queued", "processing"].includes(e.job.status),
        )
      )
        active = false;
    }
  });
  app.get<{ Params: { id: string } }>(
    "/analyses/:id/usage",
    async (req, reply) => {
      expired();
      const usage = jobs.get(req.params.id)?.usage;
      return (
        usage ??
        reply.code(404).send({
          message:
            "No usage receipt is available on this instance. Missing usage does not establish that an attempt was free.",
        })
      );
    },
  );
  app.get("/analyses", async () => {
    expired();
    return [...jobs.values()].flatMap((e) => (e.report ? [e.report] : []));
  });
  app.get<{ Params: { id: string } }>(
    "/analyses/:id/status",
    async (req, reply) => {
      expired();
      const entry = jobs.get(req.params.id);
      return entry
        ? entry.job
        : reply.code(404).send({
            message:
              "This job is missing or expired. Server jobs are temporary; keep exported browser reports.",
          });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/analyses/:id/report",
    async (req, reply) => {
      expired();
      const entry = jobs.get(req.params.id);
      return (
        entry?.report ??
        reply
          .code(entry ? 409 : 404)
          .send({ message: "A completed report is not available." })
      );
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/analyses/:id",
    async (req, reply) => {
      expired();
      const entry = jobs.get(req.params.id);
      if (!entry) return reply.code(404).send({ message: "Job not found." });
      entry.abort.abort();
      if (["queued", "processing"].includes(entry.job.status))
        entry.job.status = "canceled";
      else {
        jobs.delete(req.params.id);
        for (const [k, v] of idempotency)
          if (v.id === req.params.id) idempotency.delete(k);
      }
      return { status: entry.job.status };
    },
  );
  return app;
}
