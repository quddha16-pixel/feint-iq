import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { OAuth2Client } from "google-auth-library";
export type CampIdentity = { email: string; sub: string };
const iapClient = new OAuth2Client();
let keyCache:
  | {
      keys: Awaited<
        ReturnType<OAuth2Client["getIapPublicKeysAsync"]>
      >["pubkeys"];
      expires: number;
    }
  | undefined;
let keyRequest: ReturnType<OAuth2Client["getIapPublicKeysAsync"]> | undefined;
type GatewayOptions = {
  root: string;
  audience: string;
  authorizedEmails: string[];
  verify?: (assertion: string, audience: string) => Promise<CampIdentity>;
};
export async function verifyIap(
  assertion: string,
  audience: string,
): Promise<CampIdentity> {
  // Cache public verification keys briefly and share in-flight retrieval. Every
  // assertion is still cryptographically verified; authenticated sessions are not cached.
  if (!keyCache || keyCache.expires <= Date.now()) {
    keyRequest ??= iapClient.getIapPublicKeysAsync();
    try {
      const response = await keyRequest;
      const age = Number(
        response.res?.headers
          .get("cache-control")
          ?.match(/max-age=(\d+)/)?.[1] ?? 300,
      );
      keyCache = {
        keys: response.pubkeys,
        expires: Date.now() + Math.min(age, 300) * 1000,
      };
    } finally {
      keyRequest = undefined;
    }
  }
  const ticket = await iapClient.verifySignedJwtWithCertsAsync(
    assertion,
    keyCache.keys,
    audience,
    ["https://cloud.google.com/iap"],
  );
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub)
    throw new Error("Invalid identity claims.");
  return { email: payload.email.toLowerCase(), sub: payload.sub };
}
/** Candidate private host, never the existing pilot backend. No cloud configuration is changed. */
export async function createCampGateway(options: GatewayOptions) {
  const allowed = options.authorizedEmails.map((s) => s.trim().toLowerCase());
  if (
    !options.audience ||
    allowed.length !== 2 ||
    new Set(allowed).size !== 2 ||
    allowed.some((s) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
  )
    throw new Error(
      "Configure an IAP audience and exactly two distinct authorized emails before starting the private host.",
    );
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  const root = resolve(options.root);
  const verify = options.verify ?? verifyIap;
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "no-referrer")
      .header(
        "content-security-policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    const assertion = req.headers["x-goog-iap-jwt-assertion"];
    if (typeof assertion !== "string" || assertion.length > 16384)
      return reply
        .code(401)
        .send({ message: "Authorized camp identity required." });
    try {
      const identity = await verify(assertion, options.audience);
      if (!allowed.includes(identity.email.toLowerCase()))
        return reply
          .code(403)
          .send({ message: "This identity is not authorized for the camp." });
      // Raw email/sub headers are never trusted. Only the signed IAP assertion is used.
    } catch {
      return reply
        .code(401)
        .send({ message: "Camp identity could not be verified." });
    }
  });
  app.get("/api/session", async () => ({
    authenticated: true,
    storage: "device-only",
    sharedStorage: false,
  }));
  // Future camp/report/video APIs must be mounted behind the same hook. None are
  // exposed yet: a catch-all error must not turn into a public/static fallback.
  app.all("/api/*", async (_, reply) =>
    reply.code(501).send({
      message: "Shared camp storage and analysis are not enabled on this host.",
    }),
  );
  const serve = async (path: string, reply: import("fastify").FastifyReply) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return reply.code(400).send();
    }
    const local =
      decoded === "/" || decoded === "/feint-iq/"
        ? "index.html"
        : decoded.replace(/^\/feint-iq\//, "/").replace(/^\//, "");
    const target = resolve(root, local);
    if (
      !target.startsWith(root + sep) ||
      local.split(/[\\/]/).some((p) => p.startsWith("."))
    )
      return reply.code(404).send();
    const mime = target.endsWith(".html")
      ? "text/html; charset=utf-8"
      : target.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : target.endsWith(".css")
          ? "text/css; charset=utf-8"
          : undefined;
    // Only build artifacts are served; never expose source, maps, config or uploaded files.
    if (!mime) return reply.code(404).send();
    try {
      return reply.type(mime).send(await readFile(target));
    } catch {
      return reply.code(404).send();
    }
  };
  app.get("/", async (_, reply) => serve("/", reply));
  app.get("/*", async (req, reply) => serve(req.url.split("?")[0], reply));
  return app;
}
