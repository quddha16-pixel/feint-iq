import { describe, expect, it } from "vitest";
import { runtimeConfig } from "./config";
describe("Cloud Run runtime settings", () => {
  it("uses the injected port and binds all interfaces in Cloud Run", () => {
    expect(
      runtimeConfig({
        K_SERVICE: "identifier-q-api",
        PORT: "9090",
        MAX_UPLOAD_MB: "25",
      }),
    ).toEqual({
      host: "0.0.0.0",
      port: 9090,
      maxUploadBytes: 25 * 1024 * 1024,
    });
  });
  it("defaults Cloud Run uploads below the platform HTTP/1 limit", () => {
    expect(
      runtimeConfig({ K_SERVICE: "api", PORT: "8080" }).maxUploadBytes,
    ).toBe(25 * 1024 * 1024);
    expect(() =>
      runtimeConfig({ K_SERVICE: "api", MAX_UPLOAD_MB: "100" }),
    ).toThrow("HTTP/1");
  });
  it("retains loopback defaults for direct local startup", () => {
    expect(runtimeConfig({})).toEqual({
      host: "127.0.0.1",
      port: 8787,
      maxUploadBytes: 100 * 1024 * 1024,
    });
  });
  it("rejects unusable ports, limits and Cloud Run loopback binding", () => {
    for (const env of [
      { PORT: "0" },
      { PORT: "65536" },
      { PORT: "no" },
      { MAX_UPLOAD_MB: "0" },
      { MAX_UPLOAD_MB: "101" },
      { MAX_UPLOAD_MB: "1.5" },
      { K_SERVICE: "api", HOST: "127.0.0.1" },
    ])
      expect(() => runtimeConfig(env)).toThrow();
  });
});
