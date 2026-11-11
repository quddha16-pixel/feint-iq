import { useEffect, useState } from "react";
import type { Camp, Session } from "./model";
import { RecordForm, CampEmpty, disciplines } from "./ui";
import { Notice, PageHeading } from "../components/ui";
import { validateVideoFile } from "../domain/video";
import type { CompletedAnalysisReport } from "../domain/contracts";
export function AnalysisCenter({
  data,
  commit,
  reports,
}: {
  data: Camp;
  commit: (d: Camp) => boolean;
  reports: CompletedAnalysisReport[];
}) {
  const [mode, setMode] = useState<"sparring" | "fight">("sparring");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [selected, select] = useState("");
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  const current = data.sessions.find((s) => s.id === selected);
  const blank = {
    title: "",
    date: "",
    kind: mode,
    discipline: data.profile.discipline,
    opponentId: "",
    round: "",
    footage: file?.name ?? "",
    reportId: "",
    notes: "",
    duration: "",
    identification: "",
    identityConfirmed: "no",
  };
  const save = (v: Record<string, string>) => {
    const record: Session = {
      ...blank,
      ...v,
      id: current?.id ?? crypto.randomUUID(),
      kind: v.kind as Session["kind"],
      discipline: v.discipline as Session["discipline"],
      identityConfirmed: v.identityConfirmed === "yes",
      duration: v.duration
        ? Number(v.duration)
        : current
          ? current.duration
          : duration,
    };
    const ok = commit({
      ...data,
      sessions: current
        ? data.sessions.map((s) => (s.id === current.id ? record : s))
        : [...data.sessions, record],
    });
    if (ok) select(record.id);
    return ok;
  };
  return (
    <>
      <PageHeading eyebrow="VIDEO ANALYSIS CENTER" title="Study the round.">
        Review footage, identify the fighter, and turn visible sequences into
        specific coaching actions.
      </PageHeading>
      <div className="mode-grid">
        {(["sparring", "fight"] as const).map((m) => (
          <button
            key={m}
            className={`mode-card ${mode === m ? "selected" : ""}`}
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              select("");
            }}
          >
            <span className="eyebrow">
              {m === "sparring"
                ? "01 / STATIONARY CAMERA"
                : "02 / RECORDED BOUT"}
            </span>
            <strong>
              {m === "sparring" ? "Sparring analysis" : "Fight analysis"}
            </strong>
            <span>
              {m === "sparring"
                ? "3–5 minute rounds · manual review"
                : "Round-by-round coach review"}
            </span>
          </button>
        ))}
      </div>
      <Notice>
        {mode === "sparring"
          ? "Local preview accepts files up to 1 GiB. Secure resumable 1 GB uploads are not implemented. The existing live pilot remains boxing-only, 10–300 seconds and 25 MiB."
          : "Cross-angle identity tracking and replay detection are experimental targets, not working capabilities. Confirm Vince manually after every cut and exclude replays from evidence. Compare rounds through separately labelled session records."}
      </Notice>
      <div className="inline-actions analysis-actions">
        <a className="button secondary" href="#/new">
          Open existing 25 MiB pilot
        </a>
        <a className="quiet-link" href="#/history">
          Report library ↗
        </a>
        <a className="quiet-link" href="#/development">
          Document a coaching finding ↗
        </a>
      </div>
      <div className="camp-grid">
        <section className="panel">
          <h2>Local footage review</h2>
          <p className="muted">
            Select MOV, MP4 or WebM. Nothing uploads. iPhone HEVC playback
            depends on browser support.
          </p>
          <label>
            Choose camp footage
            <input
              type="file"
              accept=".mp4,.mov,.webm"
              onChange={(e) => {
                const next = e.target.files?.[0];
                if (!next) return;
                const issue = validateVideoFile(next, 1024);
                setError(issue ?? "");
                if (!issue) {
                  setFile(next);
                  setDuration(null);
                  select("");
                }
                e.target.value = "";
              }}
            />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          {url ? (
            <>
              <video
                className="camp-video"
                controls
                playsInline
                preload="metadata"
                src={url}
                aria-label="Camp footage preview"
                onLoadedMetadata={(e) => {
                  const n = e.currentTarget.duration;
                  if (Number.isFinite(n) && n > 0) setDuration(n);
                  else
                    setError(
                      "No usable duration. Export H.264 MP4 for local review.",
                    );
                }}
                onError={() =>
                  setError(
                    "This browser cannot decode the footage. Try H.264 MP4. No footage was uploaded.",
                  )
                }
              />
              <p>
                {file?.name} ·{" "}
                {duration === null
                  ? "Checking codec and duration"
                  : `${duration.toFixed(1)} seconds · local only`}
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  setFile(null);
                  setDuration(null);
                  setError("");
                }}
              >
                Remove camp footage
              </button>
            </>
          ) : (
            <CampEmpty>
              No footage selected. Video files are never saved into browser
              storage; reattach them after reload.
            </CampEmpty>
          )}
        </section>
        <section className="panel">
          <h2>{current ? "Edit session record" : "Record a session"}</h2>
          <RecordForm
            key={`${selected}:${file?.name}:${mode}`}
            initial={
              current
                ? {
                    ...current,
                    duration: String(current.duration ?? ""),
                    identityConfirmed: current.identityConfirmed ? "yes" : "no",
                  }
                : blank
            }
            label="Save session record"
            fields={[
              { key: "title", label: "Session title", required: true },
              {
                key: "date",
                label: "Session date",
                type: "date",
                required: true,
              },
              {
                key: "kind",
                label: "Session type",
                options: [
                  ["sparring", "Sparring"],
                  ["fight", "Fight"],
                  ["training", "Training / scheduled sparring"],
                  ["opponent", "Opponent footage"],
                ],
              },
              {
                key: "discipline",
                label: "Session discipline",
                options: disciplines,
              },
              { key: "round", label: "Round / schedule details" },
              {
                key: "duration",
                label: "Session duration (seconds, when known)",
                type: "number",
              },
              {
                key: "opponentId",
                label: "Session opponent",
                options: [
                  ["", "Not set"],
                  ...data.opponents.map((o): [string, string] => [
                    o.id,
                    o.name,
                  ]),
                ],
              },
              {
                key: "footage",
                label: "Original footage filename or source reference",
              },
              {
                key: "identification",
                label: "Fighter identification and camera-cut notes",
                type: "textarea",
              },
              {
                key: "identityConfirmed",
                label: "Manual identity confirmation",
                options: [
                  ["no", "Not confirmed"],
                  ["yes", "Coach confirmed fighter in reviewed footage"],
                ],
              },
              {
                key: "reportId",
                label: "Attach existing analysis report",
                options: [
                  ["", "No report"],
                  ...reports.map((r): [string, string] => [
                    r.id,
                    `${r.configuration.fighter.name} / ${r.video.name}`,
                  ]),
                ],
              },
              {
                key: "notes",
                label: "Session observations / coach notes",
                type: "textarea",
              },
            ]}
            submit={save}
          />
        </section>
      </div>
      <section className="panel">
        <div className="section-title">
          <h2>Session history</h2>
          <button className="text-button" onClick={() => select("")}>
            New session
          </button>
        </div>
        {!data.sessions.length && (
          <CampEmpty>
            No sessions documented. Fight dates, results, and performance remain
            unknown until entered.
          </CampEmpty>
        )}
        {[...data.sessions]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((s) => (
            <button
              className="session-row"
              key={s.id}
              onClick={() => {
                select(s.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <span>
                <strong>{s.title}</strong>
                <small>
                  {s.date} · {s.kind} · {s.round || "Round not specified"}
                </small>
              </span>
              <span className="tag">
                {s.identityConfirmed
                  ? "Coach confirmed"
                  : "Identity unconfirmed"}
              </span>
            </button>
          ))}
      </section>
    </>
  );
}
