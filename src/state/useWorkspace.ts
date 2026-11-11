import { AnalysisJobFailure } from "../services/analysisStream";
import { stageLabels } from "../domain/transport";
import {
  applyMomentFeedback,
  type MomentFeedback,
} from "../services/momentFeedback";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  configSchema,
  type AnalysisStatus,
  type FighterIdentification,
} from "../domain/contracts";
import { validateVideoFile, type LocalVideo } from "../domain/video";
import {
  analysisService,
  connectAnalysisService,
  type AnalysisService,
} from "../services/analysis";
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
  const [service, setService] = useState<AnalysisService>(analysisService);
  const [engine, setEngine] = useState<{
    connected: boolean;
    available: boolean;
    message: string;
    momentDetection?: boolean;
  }>({ connected: false, available: false, message: "Integration required" });
  const connectEngine = async (url: string, token: string) => {
    const result = await connectAnalysisService(url, token);
    setService(() => result.service);
    setEngine({
      connected: true,
      available: result.health.available,
      message: result.health.message,
      momentDetection: result.health.momentDetection === true,
    });
  };
  const disconnectEngine = () => {
    if (submitting.current) return;
    setService(analysisService);
    setEngine({
      connected: false,
      available: false,
      message: "Integration required",
    });
  };
  const pending = useRef<AbortController | null>(null);
  const currentJob = useRef<string | null>(null);
  const requestSequence = useRef(0);
  const subjectId = useRef(crypto.randomUUID());

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
  const [reports, setReportsState] = useState(initial.reports.value);
  const reportsRef = useRef(reports);
  const setReports = (next: typeof reports) => {
    reportsRef.current = next;
    setReportsState(next);
  };
  const [video, setVideo] = useState<LocalVideo | null>(null);
  const [videoError, setVideoError] = useState("");
  const [error, setError] = useState("");
  const [processingDetail, setProcessingDetail] = useState("");
  const [status, setStatus] = useState<AnalysisStatus>("not-started");
  const [frames, setFrames] = useState<
    NonNullable<FighterIdentification["confirmationFrames"]>
  >([]);
  const frame = frames.at(-1);
  const setFrame = (f: FighterIdentification["frame"]) => {
    if (submitting.current) return;
    if (!f) {
      setFrames([]);
      return;
    }
    setFrames((previous) => {
      const distinct = previous.filter((p) => Math.abs(p.time - f.time) > 0.15);
      return [...distinct, f].slice(-5);
    });
  };
  const removeFrame = (index: number) => {
    if (!submitting.current)
      setFrames((previous) => previous.filter((_, i) => i !== index));
  };
  useEffect(
    () => () => {
      pending.current?.abort();
    },
    [],
  );

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
    subjectId.current = crypto.randomUUID();
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
    const valid = duration >= 10 && duration <= 300;
    setVideo((v) =>
      v ? { ...v, asset: { ...v.asset, duration }, ready: valid } : null,
    );
    setVideoError(
      valid ? "" : "Choose footage from 10 seconds to 5 minutes long.",
    );
  };
  const configuration = () =>
    configSchema.safeParse({
      discipline: draft.discipline,
      type: draft.type,
      ruleset: draft.discipline === "kickboxing" ? draft.ruleset : undefined,
      rulesetNotes: draft.rulesetNotes,
      ...(engine.momentDetection &&
      draft.discipline === "boxing" &&
      draft.momentReview !== false
        ? { momentReview: true }
        : {}),
      fighter: {
        name: draft.fighterName,
        method: draft.method,
        notes: draft.notes,
        frame,
        confirmationFrames: frames,
        subjectId: subjectId.current,
        tracking: {
          identityIndependentOfPosition: true,
          status: "unverified",
          challenges: ["camera-movement", "occlusion", "position-change"],
        },
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
    requestSequence.current++;
    setStatus("ready");
    setError("");
    const abort = new AbortController();
    pending.current = abort;
    const snapshot = structuredClone(c.data);
    const submittedVideo = { ...video.asset };
    try {
      const job = await service.submit(
        { file: video.file, video: submittedVideo, configuration: snapshot },
        abort.signal,
        () => setStatus("uploading"),
        (update) => {
          if (abort.signal.aborted) return;
          currentJob.current = update.id;
          setStatus(update.status);
          setProcessingDetail(
            update.stage
              ? stageLabels[update.stage]
              : "Processing your request",
          );
        },
      );
      if (abort.signal.aborted)
        throw new DOMException("Analysis canceled.", "AbortError");
      currentJob.current = job.id;
      setStatus(job.status);
      if (job.status === "canceled") {
        setError("Analysis canceled. No incomplete report was saved.");
        return;
      }
      if (job.status !== "completed")
        throw new Error(
          job.error ?? "Analysis failed. Your setup is preserved.",
        );
      const report = await service.report(job.reportId ?? job.id, abort.signal);
      if (
        JSON.stringify(report.configuration) !== JSON.stringify(snapshot) ||
        report.video.id !== submittedVideo.id
      )
        throw new Error(
          "The report does not match the submitted fighter and footage. It was not saved.",
        );
      const currentReports = reportsRef.current;
      const next = currentReports.some((r) => r.id === report.id)
        ? currentReports
        : importReports(report, currentReports);
      if (blocked.current.has(REPORTS_KEY))
        throw new Error(
          "Export and clear the invalid saved library before saving the completed result.",
        );
      const problem = saveReports(next);
      if (problem) {
        setReports(next);
        setMessage(
          problem +
            " The completed report is available in this session; export it now.",
        );
      } else setReports(next);
      setStatus("completed");
      location.hash = `/report/${encodeURIComponent(report.id)}`;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Submission failed. Your setup is preserved.",
      );
      setStatus(
        abort.signal.aborted ||
          (e instanceof AnalysisJobFailure && e.job.status === "canceled")
          ? "canceled"
          : service.capabilities.available
            ? "failed"
            : "unavailable",
      );
    } finally {
      submitting.current = false;
      pending.current = null;
      currentJob.current = null;
      setProcessingDetail("");
    }
  };
  const cancelAnalysis = async () => {
    const cancelSequence = requestSequence.current;
    pending.current?.abort();
    setStatus("canceled");
    setError(
      "Analysis canceled locally. Provider work already started may still incur usage.",
    );
    const id = currentJob.current;
    if (id)
      try {
        await service.cancel(id);
      } catch {
        if (requestSequence.current !== cancelSequence) return;
        setError(
          "The local request was canceled, but remote cancellation could not be confirmed. No incomplete report was saved; check usage before retrying.",
        );
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
  const saveMomentFeedback = (
    id: string,
    edit: MomentFeedback,
  ): string | undefined => {
    try {
      if (blocked.current.has(REPORTS_KEY))
        throw new Error(
          "Invalid saved library was preserved. Export it before recovery.",
        );
      const stored = readReports();
      if (
        stored.error ||
        JSON.stringify(stored.value) !== JSON.stringify(reportsRef.current)
      )
        throw new Error(
          "The report library changed or is not saved. Export current data and reload before reviewing.",
        );
      if (!reportsRef.current.some((r) => r.id === id))
        throw new Error("Report is missing.");
      const next = reportsRef.current.map((r) =>
        r.id === id ? applyMomentFeedback(r, edit) : r,
      );
      const problem = saveReports(next);
      if (problem) throw new Error(problem);
      setReports(next);
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "Coach review could not be saved.";
    }
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
      if (submitting.current) {
        setMessage(
          "Cancel the current analysis before clearing the workspace.",
        );
        return;
      }
      disconnectEngine();
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
    processingDetail,
    frame,
    frames,
    removeFrame,
    engine,
    connectEngine,
    disconnectEngine,
    cancelAnalysis,
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
    saveMomentFeedback,
    exportWorkspace,
    clearWorkspace,
    setMessage,
  };
}
