// Synthetic browser-test server only. Never imported by the application or deployed.
// Keep these tests independent of the legacy server on main: the live backend
// already implements request-stream-v1 and is deliberately outside this PR.
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configSchema,
  videoSchema,
  type AnalysisJob,
} from "../src/domain/contracts";
import { PILOT_LIMITS } from "../src/domain/engine";
import { REQUEST_PROTOCOL, type AnalysisEvent } from "../src/domain/transport";
import { prepareVideo } from "../server/media";
import { buildReport } from "../server/report";
import type { VideoAnalysisProvider } from "../server/provider";

export async function createStreamingTestBackend(options: {
  accessToken: string;
  origin: string;
  provider: VideoAnalysisProvider;
}) {
  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: options.origin,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "idempotency-key"],
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: PILOT_LIMITS.maxBytes, fields: 1, parts: 2 },
  });
  app.addHook("onRequest", async (req, reply) => {
    if (req.method === "OPTIONS") return;
    if (req.headers.authorization !== `Bearer ${options.accessToken}`)
      return reply
        .code(401)
        .send({ message: "Synthetic test token required." });
    if (req.headers.origin && req.headers.origin !== options.origin)
      return reply.code(403).send({ message: "Test origin rejected." });
  });
  app.get("/health", async () => ({
    schemaVersion: 1,
    protocol: REQUEST_PROTOCOL,
    available: true,
    provider: options.provider.name,
    model: options.provider.model,
    tracking: false,
    qualitativeOnly: true,
    limits: {
      maxBytes: PILOT_LIMITS.maxBytes,
      minSeconds: PILOT_LIMITS.minSeconds,
      maxSeconds: PILOT_LIMITS.maxSeconds,
    },
    message:
      "Synthetic test provider configured but live accuracy is not evaluated.",
  }));
  // No status/report GET endpoints: completion must come from this POST.
  app.delete("/analyses/:id", async () => ({ status: "canceled" }));
  app.post("/analyses", async (req, reply) => {
    let metadata: { configuration?: unknown; video?: unknown } = {};
    let file: Buffer | undefined;
    for await (const part of req.parts()) {
      if (part.type === "file") file = await part.toBuffer();
      else metadata = JSON.parse(String(part.value));
    }
    const configuration = configSchema.parse(metadata.configuration);
    const video = videoSchema.parse(metadata.video);
    if (!file || file.length !== video.size)
      return reply.code(400).send({ message: "Invalid synthetic upload." });
    const id = String(req.headers["idempotency-key"]);
    const job: AnalysisJob = { id, configuration, video, status: "processing" };
    const directory = await mkdtemp(join(tmpdir(), "identifier-q-browser-"));
    const path = join(directory, "source-video");
    const abort = new AbortController();
    reply.hijack();
    for (const [name, value] of Object.entries(reply.getHeaders()))
      if (value !== undefined) reply.raw.setHeader(name, value);
    reply.raw.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
    });
    const send = (event: AnalysisEvent) => {
      if (!reply.raw.destroyed) reply.raw.write(JSON.stringify(event) + "\n");
    };
    const stage = (value: AnalysisJob["stage"]) => {
      job.stage = value;
      send({ type: "job", job });
    };
    const disconnect = () => {
      if (!reply.raw.writableEnded) abort.abort();
    };
    reply.raw.on("close", disconnect);
    try {
      await writeFile(path, file);
      stage("decoding");
      const prepared = await prepareVideo(
        path,
        directory,
        configuration,
        abort.signal,
      );
      stage("analyzing");
      const result = await options.provider.analyze(
        prepared,
        configuration,
        abort.signal,
      );
      stage("validating");
      const report = buildReport(
        id,
        configuration,
        video,
        prepared,
        result,
        "SYNTHETIC BROWSER TEST ONLY",
        new Date().toISOString(),
      );
      stage("cleaning");
      await rm(directory, { recursive: true, force: true });
      send({
        type: "result",
        job: { ...job, status: "completed", stage: "completed", reportId: id },
        report,
      });
    } catch (error) {
      send({
        type: "error",
        job: { ...job, status: "failed" },
        message:
          error instanceof Error ? error.message : "Synthetic test failure",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
      reply.raw.off("close", disconnect);
      reply.raw.end();
    }
    return reply;
  });
  return app;
}
