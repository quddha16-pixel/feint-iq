import { useCallback, useEffect, useRef, useState } from "react";
import {
  configSchema,
  type AnalysisStatus,
  type FighterIdentification,
} from "../domain/contracts";
import { validateVideoFile, type LocalVideo } from "../domain/video";
import { analysisService } from "../services/analysis";
import {
  DRAFT_KEY,
  PREFERENCE_KEY,
  REPORTS_KEY,
  downloadJSON,
  draftSchema,
  emptyDraft,
  importReports,
  preferencesSchema,
  readReports,
  readStored,
  saveReports,
  writeStored,
  type Preferences,
  type SavedDraft,
} from "../services/storage";

export function useWorkspace() {
  const [initial] = useState(() => {
    const preferences = readStored<Preferences>(
      PREFERENCE_KEY,
      preferencesSchema,
      { discipline: "boxing", maxFileMB: 500 },
    );
    const draft = readStored(
      DRAFT_KEY,
      draftSchema,
      emptyDraft(preferences.value.discipline),
    );
    const reports = readReports();
    return { preferences, draft, reports };
  });
  const [preferences, setPreferences] = useState(initial.preferences.value);
  const [draft, setDraft] = useState(initial.draft.value);
  const [reports, setReports] = useState(initial.reports.value);
  const [video, setVideo] = useState<LocalVideo | null>(null);
  const [videoError, setVideoError] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<AnalysisStatus>("not-started");
  const [frame, setFrame] = useState<FighterIdentification["frame"]>();
  const [message, setMessage] = useState(
    [initial.preferences.error, initial.draft.error, initial.reports.error]
      .filter(Boolean)
      .join(" "),
  );
  const submitting = useRef(false);
  // Corrupt records are preserved until explicitly cleared/exported, never overwritten by a default.
  const blocked = useRef(
    new Set(
      [
        initial.preferences.error ? PREFERENCE_KEY : "",
        initial.draft.error ? DRAFT_KEY : "",
        initial.reports.error ? REPORTS_KEY : "",
      ].filter(Boolean),
    ),
  );
  const videoUrl = video?.url;
  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );
  useEffect(() => {
    if (!video || video.ready || videoError) return;
    const timer = setTimeout(
      () =>
        setVideoError(
          "Video metadata did not load. Try a shorter H.264 MP4 export or replace the file.",
        ),
      15000,
    );
    return () => clearTimeout(timer);
  }, [video, videoError]);
  const persist = useCallback((key: string, value: unknown) => {
    if (blocked.current.has(key)) {
      setMessage(
        "Saved data is invalid and was preserved. Export or clear the workspace in Settings before saving new data.",
      );
      return;
    }
    const problem = writeStored(key, value);
    if (problem) setMessage(problem);
  }, []);
  const updateDraft = (patch: Partial<SavedDraft>) => {
    if (submitting.current) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    persist(DRAFT_KEY, next);
    setError("");
    setStatus("not-started");
    if (patch.discipline && patch.discipline !== preferences.discipline) {
      const p = { ...preferences, discipline: patch.discipline };
      setPreferences(p);
      persist(PREFERENCE_KEY, p);
      setMessage(
        "Discipline updated for your unsubmitted setup. Ruleset settings were reset; saved reports are unchanged.",
      );
    }
  };
  const savePreferences = (next: Preferences) => {
    if (submitting.current) return;
    setPreferences(next);
    persist(PREFERENCE_KEY, next);
    if (next.discipline !== draft.discipline) {
      const d = {
        ...draft,
        discipline: next.discipline,
        ruleset: "k1" as const,
        rulesetNotes: "",
      };
      setDraft(d);
      persist(DRAFT_KEY, d);
      setError("");
      setStatus("not-started");
      setMessage(
        "Discipline updated. Unsubmitted ruleset settings were reset. Saved reports keep their original discipline.",
      );
    }
    if (video && video.file.size > next.maxFileMB * 1024 * 1024)
      setVideoError(
        `The selected footage exceeds your updated ${next.maxFileMB} MB limit. Replace it or increase the limit.`,
      );
    else if (video?.ready) setVideoError("");
  };
  const selectVideo = (file: File) => {
    const problem = validateVideoFile(file, preferences.maxFileMB);
    if (problem) {
      setError("");
      setVideoError(problem);
      return;
    }
    setVideoError("");
    setError("");
    setStatus("not-started");
    setFrame(undefined);
    const d = { ...draft, step: 1, method: "" as const, notes: "" };
    setDraft(d);
    persist(DRAFT_KEY, d);
    setVideo({
      file,
      url: URL.createObjectURL(file),
      asset: {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        mime: file.type,
        duration: 0,
      },
      ready: false,
    });
  };
  const removeVideo = () => {
    setVideo(null);
    setVideoError("");
    setFrame(undefined);
    setError("");
    setStatus("not-started");
    const d = { ...draft, step: 1, method: "" as const, notes: "" };
    setDraft(d);
    persist(DRAFT_KEY, d);
  };
  const onReady = (duration: number) => {
    setVideo((v) =>
      v ? { ...v, asset: { ...v.asset, duration }, ready: true } : null,
    );
    setVideoError("");
  };
  const configuration = () =>
    configSchema.safeParse({
      discipline: draft.discipline,
      type: draft.type,
      ruleset: draft.discipline === "kickboxing" ? draft.ruleset : undefined,
      rulesetNotes: draft.rulesetNotes,
      fighter: {
        name: draft.fighterName,
        method: draft.method,
        notes: draft.notes,
        frame,
      },
    });
  const validateStep = (step: number) => {
    if (!video?.ready || videoError)
      return "Select a browser-compatible video and wait for its preview to load before continuing.";
    if (validateVideoFile(video.file, preferences.maxFileMB))
      return validateVideoFile(video.file, preferences.maxFileMB);
    if (step >= 2) {
      if (!draft.fighterName.trim())
        return "Enter a fighter name or identifier.";
      if (!draft.method) return "Choose a fighter-identification method.";
      if (draft.method === "manual" && !frame && !draft.notes.trim())
        return "Mark a representative frame or describe your fighter in the identification notes.";
    }
    if (step >= 3) {
      const c = configuration();
      if (!c.success) return c.error.issues[0].message;
    }
    return undefined;
  };
  const submit = async () => {
    if (submitting.current) return;
    const problem = validateStep(4);
    if (problem) {
      setError(problem);
      return;
    }
    const c = configuration();
    if (!c.success || !video) return;
    submitting.current = true;
    setStatus("ready");
    setError("");
    try {
      await analysisService.submit({
        file: video.file,
        video: { ...video.asset },
        configuration: structuredClone(c.data),
      });
      setError(
        "The connected service returned an unsupported result. Integration must handle job monitoring before it is enabled.",
      );
      setStatus("failed");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Submission failed. Your setup has been preserved.",
      );
      setStatus(
        analysisService.capabilities.available ? "failed" : "unavailable",
      );
    } finally {
      submitting.current = false;
    }
  };
  const importData = (data: unknown) => {
    try {
      if (blocked.current.has(REPORTS_KEY))
        throw new Error(
          "Export and clear the invalid saved library before importing.",
        );
      const next = importReports(data, reports);
      const problem = saveReports(next);
      if (problem) throw new Error(problem);
      setReports(next);
      setMessage(
        "Validated report data imported and saved in this browser. Source accuracy has not been independently verified.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? `Import failed: ${e.message.slice(0, 400)}`
          : "Import failed. No data was saved.",
      );
    }
  };
  const deleteReport = (id: string) => {
    const next = reports.filter((r) => r.id !== id);
    const problem = saveReports(next);
    if (problem) setMessage(problem);
    else setReports(next);
  };
  const exportWorkspace = () => {
    try {
      downloadJSON(
        {
          schemaVersion: 1,
          reports: localStorage.getItem(REPORTS_KEY),
          draft: localStorage.getItem(DRAFT_KEY),
          preferences: localStorage.getItem(PREFERENCE_KEY),
        },
        "identifier-q-workspace-backup.json",
      );
    } catch {
      setMessage(
        "Storage is blocked. Use report export from the current library instead.",
      );
    }
  };
  const clearWorkspace = () => {
    try {
      for (const key of [REPORTS_KEY, DRAFT_KEY, PREFERENCE_KEY])
        localStorage.removeItem(key);
      blocked.current.clear();
      setReports([]);
      setPreferences({ discipline: "boxing", maxFileMB: 500 });
      setDraft(emptyDraft("boxing"));
      setVideo(null);
      setFrame(undefined);
      setError("");
      setVideoError("");
      setStatus("not-started");
      setMessage("Local workspace cleared.");
    } catch {
      setMessage(
        "Browser storage could not be cleared. Check your browser’s site-data settings.",
      );
    }
  };
  return {
    preferences,
    draft,
    reports,
    video,
    videoError,
    error,
    status,
    frame,
    message,
    submitting,
    updateDraft,
    savePreferences,
    selectVideo,
    onReady,
    setVideoError,
    removeVideo,
    setFrame,
    submit,
    validateStep,
    setError,
    importData,
    deleteReport,
    exportWorkspace,
    clearWorkspace,
    setMessage,
  };
}
