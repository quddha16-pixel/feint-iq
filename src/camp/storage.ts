import { z } from "zod";
import { campSchema, emptyCamp, type Camp } from "./model";
export const CAMP_KEY = "identifier-q.camp.v1";
export const backupSchema = z.object({
  format: z.literal("identifier-q-camp"),
  version: z.literal(1),
  workspace: campSchema,
});
export function loadCamp(storage?: Pick<Storage, "getItem">) {
  let raw: string | null = null;
  try {
    raw = (storage ?? localStorage).getItem(CAMP_KEY);
    if (raw === null)
      return { value: emptyCamp(), blocked: false, error: "", revision: raw };
    return {
      value: campSchema.parse(JSON.parse(raw)),
      blocked: false,
      error: "",
      revision: raw,
    };
  } catch {
    return {
      value: emptyCamp(),
      blocked: true,
      error:
        "Camp data could not be read. The original data was preserved. Export a raw backup in Settings before recovery; saving is blocked.",
      revision: raw,
    };
  }
}
export function saveCamp(
  data: Camp,
  storage: Pick<Storage, "setItem" | "getItem"> = localStorage,
  expected?: string | null,
) {
  const value = campSchema.parse(data);
  if (expected !== undefined && storage.getItem(CAMP_KEY) !== expected)
    throw new Error(
      "Camp data changed in another tab. Export your current records and reload before saving; the newer data was preserved.",
    );
  // No legacy keys are migrated, cleared, or overwritten.
  storage.setItem(CAMP_KEY, JSON.stringify(value));
  return value;
}
export function parseBackup(text: string) {
  if (new TextEncoder().encode(text).byteLength > 5 * 1024 * 1024)
    throw new Error("Camp backups must be under 5 MiB.");
  return backupSchema.parse(JSON.parse(text)).workspace;
}
