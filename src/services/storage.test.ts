import { afterEach, describe, expect, it, vi } from "vitest";
import {
  preferencesSchema,
  readStored,
  writeStored,
  saveReports,
  REPORTS_KEY,
  readReports,
} from "./storage";
import { makeReport } from "../../tests/fixture";
const store = new Map<string, string>();
function memoryStorage() {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
}
afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});
describe("browser storage resilience", () => {
  it("retrieves genuine saved metadata and validates it again", () => {
    memoryStorage();
    expect(saveReports([makeReport()])).toBeUndefined();
    expect(readReports().value[0].id).toBe("test-report");
  });
  it("preserves corrupt data rather than silently deleting it", () => {
    memoryStorage();
    store.set(REPORTS_KEY, "{bad json");
    expect(readReports().error).toMatch("unreadable");
    expect(store.get(REPORTS_KEY)).toBe("{bad json");
  });
  it("reports quota and access failures to the caller", () => {
    vi.stubGlobal("localStorage", {
      setItem() {
        throw new Error("QuotaExceededError");
      },
      getItem() {
        throw new Error("SecurityError");
      },
    });
    expect(writeStored("test", {})).toMatch("full or blocked");
    expect(readReports().error).toMatch("inaccessible");
  });
  it("defaults first-time discipline to boxing", () => {
    memoryStorage();
    const result = readStored("prefs", preferencesSchema, {
      discipline: "boxing" as const,
      maxFileMB: 500,
    });
    expect(result.value.discipline).toBe("boxing");
  });
});
