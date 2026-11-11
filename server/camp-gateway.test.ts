import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { createCampGateway, verifyIap } from "./camp-gateway";
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
describe("private camp access boundary", () => {
  it("fails closed without exactly two identities and an audience", async () => {
    for (const [audience, authorizedEmails] of [
      ["", ["coach@example.test", "vince@example.test"]],
      ["audience", []],
      ["audience", ["coach@example.test", "coach@example.test"]],
    ] as [string, string[]][])
      await expect(
        createCampGateway({ root: "/tmp", audience, authorizedEmails }),
      ).rejects.toThrow("exactly two");
  });
  it("protects HTML, assets, and every API before reading files; spoofed email headers do not authorize", async () => {
    const root = await mkdtemp(join(tmpdir(), "iq-private-test-"));
    dirs.push(root);
    await writeFile(join(root, "index.html"), "private test frontend");
    const verify = vi.fn(async (token: string) => {
      if (token === "valid")
        return { email: "coach@example.test", sub: "test-coach-id" };
      if (token === "outsider")
        return { email: "other@example.test", sub: "test-outsider-id" };
      throw new Error("invalid signature");
    });
    const app = await createCampGateway({
      root,
      audience: "expected-audience",
      authorizedEmails: ["coach@example.test", "vince@example.test"],
      verify,
    });
    try {
      for (const url of [
        "/",
        "/assets/app.js",
        "/api/session",
        "/api/reports",
        "/api/videos/test",
      ]) {
        const response = await app.inject({
          url,
          headers: { "x-goog-authenticated-user-email": "coach@example.test" },
        });
        expect(response.statusCode).toBe(401);
        expect(response.body).not.toContain("private test frontend");
      }
      expect(
        (
          await app.inject({
            url: "/",
            headers: { "x-goog-iap-jwt-assertion": "outsider" },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            url: "/",
            headers: { "x-goog-iap-jwt-assertion": "invalid" },
          })
        ).statusCode,
      ).toBe(401);
      const headers = { "x-goog-iap-jwt-assertion": "valid" };
      const response = await app.inject({ url: "/", headers });
      expect(response.body).toBe("private test frontend");
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(verify).toHaveBeenCalledWith("valid", "expected-audience");
      expect(
        (await app.inject({ url: "/api/session", headers })).json()
          .authenticated,
      ).toBe(true);
      expect(
        (await app.inject({ method: "POST", url: "/api/analyses", headers }))
          .statusCode,
      ).toBe(501);
      expect((await app.inject({ url: "/.env", headers })).statusCode).toBe(
        404,
      );
      expect(
        (await app.inject({ url: "/assets/source.map", headers })).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
  it("verifies the signature, audience, issuer and expiry of IAP assertions", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    vi.spyOn(OAuth2Client.prototype, "getIapPublicKeysAsync").mockResolvedValue(
      {
        pubkeys: {
          "test-key": publicKey
            .export({ format: "pem", type: "spki" })
            .toString(),
        },
      },
    );
    const now = Math.floor(Date.now() / 1000);
    const jwt = (claims = {}) => {
      const parts = [
        { alg: "ES256", kid: "test-key" },
        {
          iss: "https://cloud.google.com/iap",
          aud: "audience",
          email: "coach@example.test",
          sub: "signed-user",
          iat: now,
          exp: now + 600,
          ...claims,
        },
      ].map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"));
      const content = parts.join(".");
      return (
        content +
        "." +
        sign("sha256", Buffer.from(content), {
          key: privateKey,
          dsaEncoding: "ieee-p1363",
        }).toString("base64url")
      );
    };
    expect((await verifyIap(jwt(), "audience")).email).toBe(
      "coach@example.test",
    );
    await expect(verifyIap(jwt(), "other-audience")).rejects.toThrow();
    await expect(
      verifyIap(jwt({ iss: "https://untrusted.test" }), "audience"),
    ).rejects.toThrow();
    await expect(
      verifyIap(jwt({ iat: now - 4000, exp: now - 3600 }), "audience"),
    ).rejects.toThrow();
    const token = jwt();
    await expect(
      verifyIap(
        token.slice(0, token.lastIndexOf(".") + 1) +
          Buffer.alloc(64).toString("base64url"),
        "audience",
      ),
    ).rejects.toThrow();
  });
});
