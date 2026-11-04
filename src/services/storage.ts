import { z } from "zod";
import {
  reportSchema,
  type CompletedAnalysisReport,
} from "../domain/contracts";
export const REPORTS_KEY = "identifier-q.reports.v1";
export const DRAFT_KEY = "identifier-q.draft.v1";
export const PREFERENCE_KEY = "identifier-q.preferences.v1";
export const preferencesSchema = z.object({
  discipline: z.enum(["boxing", "kickboxing"]).default("boxing"),
  maxFileMB: z.number().int().min(10).max(2048).default(500),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const draftSchema = z.object({
  schemaVersion: z.literal(1),
  step: z.number().int().min(1).max(4),
  fighterName: z.string().max(120),
  method: z.enum(["", "red", "blue", "left", "right", "manual"]),
  notes: z.string().max(2000),
  discipline: z.enum(["boxing", "kickboxing"]),
  type: z.enum(["complete", "technical", "offensive", "defensive"]),
  ruleset: z.enum(["k1", "low-kick", "full-contact", "custom"]),
  rulesetNotes: z.string().max(2000),
});
export type SavedDraft = z.infer<typeof draftSchema>;
export const emptyDraft = (
  discipline: Preferences["discipline"],
): SavedDraft => ({
  schemaVersion: 1,
  step: 1,
  fighterName: "",
  method: "",
  notes: "",
  discipline,
  type: "complete",
  ruleset: "k1",
  rulesetNotes: "",
});
export function readStored<T>(
  key: string,
  schema: z.ZodType<T, unknown>,
  fallback: T,
): { value: T; error?: string } {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return { value: fallback };
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return {
        value: fallback,
        error:
          "Saved browser data is invalid. It was not loaded or overwritten. Export or clear it in Settings.",
      };
    return { value: parsed.data };
  } catch {
    return {
      value: fallback,
      error:
        "Browser storage is inaccessible or contains unreadable data. Export or clear saved data in Settings; unsaved changes remain in this session.",
    };
  }
}
export function writeStored(key: string, value: unknown): string | undefined {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return "Could not save to this browser. Storage may be full or blocked. Keep this tab open and export important reports.";
  }
}
export function readReports() {
  return readStored(REPORTS_KEY, z.array(reportSchema).max(100), []);
}
export function saveReports(reports: CompletedAnalysisReport[]) {
  const checked = z.array(reportSchema).max(100).safeParse(reports);
  return checked.success
    ? writeStored(REPORTS_KEY, checked.data)
    : "Reports failed validation and were not saved.";
}
export function importReports(
  input: unknown,
  existing: CompletedAnalysisReport[],
) {
  const incoming = z
    .array(reportSchema)
    .min(1)
    .max(100)
    .parse(Array.isArray(input) ? input : [input]);
  // Never overwrite a saved report silently, even when an import reuses its ID.
  const ids = new Set(existing.map((r) => r.id));
  if (
    incoming.some((r) => ids.has(r.id)) ||
    new Set(incoming.map((r) => r.id)).size !== incoming.length
  )
    throw new Error(
      "A report with this ID already exists. No reports were imported.",
    );
  const all = [...existing, ...incoming];
  if (all.length > 100)
    throw new Error(
      "This browser library is limited to 100 reports. Export and remove older reports first.",
    );
  return all;
}
export function downloadJSON(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
