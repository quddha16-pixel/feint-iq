import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Play, FileVideo } from "lucide-react";
import {
  reportSchema,
  type CompletedAnalysisReport,
} from "../domain/contracts";
import { rulesetLabels } from "../domain/metrics";
import { formatTime, safeSeek, validateVideoFile } from "../domain/video";
import { downloadJSON } from "../services/storage";
import { EmptyState, Notice, PageHeading } from "./ui";
import {
  PerformanceOverview,
  TechnicalBreakdown,
  DevelopmentPlan,
} from "./report/ReportSections";
export function Report({
  report,
}: {
  report: CompletedAnalysisReport | undefined;
}) {
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [active, setActive] = useState("");
  const [tab, setTab] = useState("overview");
  const player = useRef<HTMLVideoElement>(null);
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );
  useEffect(() => {
    if (active)
      document
        .getElementById(`observation-${active}`)
        ?.scrollIntoView({ behavior: "auto", block: "nearest" });
  }, [active, tab]);
  // Validate again at the rendering boundary, including reports delivered by a future service.
  const parsed = reportSchema.safeParse(report);
  if (!parsed.success)
    return (
      <>
        <PageHeading
          eyebrow="PERFORMANCE REPORT"
          title={
            report
              ? "Report could not be validated."
              : "Your performance, in perspective."
          }
        >
          Completed reports connect technical observations to the footage that
          supports them.
        </PageHeading>
        <section className="panel">
          <EmptyState
            title={report ? "Invalid report data" : "No assessment selected"}
            action={
              <a className="button secondary" href="#/history">
                Open analysis history
              </a>
            }
          >
            {report
              ? "This report contains invalid or inconsistent data and cannot be rendered safely."
              : "Open a saved report from your library. No footage has been analyzed by this application yet."}
          </EmptyState>
        </section>
      </>
    );
  const r = parsed.data;
  const seek = (time: number, id: string) => {
    const problem = safeSeek(player.current, time);
    if (problem) setError(problem);
    else {
      setError("");
      setActive(id);
      document
        .getElementById(`observation-${id}`)
        ?.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  };
  const openFinding = (id: string) => {
    setTab("technical");
    setActive(id);
  };
  return (
    <>
      <a className="quiet-link back-link" href="#/history">
        <ArrowLeft size={16} /> Back to library
      </a>
      <PageHeading
        eyebrow="PERFORMANCE REPORT"
        title={r.configuration.fighter.name}
        action={
          <button
            className="button secondary"
            onClick={() => downloadJSON(r, `identifier-q-${r.id}.json`)}
          >
            <Download size={17} /> Export report
          </button>
        }
      >
        {r.configuration.discipline.toUpperCase()} ·{" "}
        {r.configuration.ruleset
          ? `${rulesetLabels[r.configuration.ruleset]} · `
          : ""}
        {new Date(r.completedAt).toLocaleDateString()} · {r.configuration.type}{" "}
        analysis
      </PageHeading>
      <div className="report-layout">
        <aside className="report-video panel">
          <div className="section-title">
            <h2>Footage & evidence</h2>
            <FileVideo size={18} />
          </div>
          {source ? (
            <video
              ref={player}
              src={source}
              controls
              playsInline
              aria-label="Report footage"
              onLoadedMetadata={(e) => {
                if (Math.abs(e.currentTarget.duration - r.video.duration) > 1) {
                  setError(
                    "The selected video duration differs from this report. Reattach the original footage.",
                  );
                  setSource("");
                }
              }}
              onError={() => {
                setError(
                  "This browser cannot decode the selected footage. Try a compatible export.",
                );
                setSource("");
              }}
            />
          ) : (
            <div className="video-placeholder">
              <FileVideo size={30} />
              <h3>Reattach original footage</h3>
              <p>{r.video.name}</p>
              <small>The video is not stored in this browser library.</small>
            </div>
          )}
          <label className="button secondary file-label">
            Choose original video
            <input
              type="file"
              accept=".mp4,.mov,.webm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const problem = validateVideoFile(f, 2048);
                if (problem) {
                  setError(problem);
                  return;
                }
                if (f.name !== r.video.name || f.size !== r.video.size) {
                  setError(
                    "Filename and file size do not match this report. Choose the original video.",
                  );
                  return;
                }
                setError("");
                setSource(URL.createObjectURL(f));
                e.target.value = "";
              }}
            />
          </label>
          <p className="subtle-note">
            Name, size, and duration are checked. These are compatibility
            checks, not a cryptographic identity guarantee.
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="timeline">
            <h3>Verified event timeline</h3>
            {r.evidence.some((e) => e.verifiedTime !== null) ? (
              [...r.evidence]
                .filter((e) => e.verifiedTime !== null)
                .sort((a, b) => a.verifiedTime! - b.verifiedTime!)
                .map((e) => (
                  <button
                    className="timeline-event"
                    key={e.id}
                    onClick={() => {
                      setTab("technical");
                      seek(
                        e.verifiedTime!,
                        r.observations.find((o) => o.evidenceIds.includes(e.id))
                          ?.id ?? "",
                      );
                    }}
                  >
                    <span>{formatTime(e.verifiedTime!)}</span>
                    <span>{e.description}</span>
                    <Play size={13} />
                  </button>
                ))
            ) : (
              <p className="muted">
                No verified timestamped events were supplied.
              </p>
            )}
          </div>
          <div className="report-provenance">
            <small>ENGINE</small>
            <p>{r.engineVersion}</p>
            <small>SCORING METHODOLOGY</small>
            <p>{r.methodology.version}</p>
            <details>
              <summary>Methodology & conditions</summary>
              <p>{r.methodology.description}</p>
              <p>{r.conditions}</p>
            </details>
          </div>
        </aside>
        <div className="report-content">
          <div
            className="report-tabs"
            role="tablist"
            aria-label="Report sections"
          >
            {[
              ["overview", "Overview"],
              ["technical", "Technical breakdown"],
              ["development", "Improvement"],
            ].map(([id, label]) => (
              <button
                role="tab"
                id={`tab-${id}`}
                aria-controls={`panel-${id}`}
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                key={id}
                onClick={() => setTab(id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const tabs = ["overview", "technical", "development"];
                    const next =
                      tabs[
                        (tabs.indexOf(tab) + (e.key === "ArrowRight" ? 1 : 2)) %
                          3
                      ];
                    setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "overview" && (
              <PerformanceOverview report={r} onFinding={openFinding} />
            )}
            {tab === "technical" && (
              <TechnicalBreakdown report={r} active={active} seek={seek} />
            )}
            {tab === "development" && (
              <DevelopmentPlan report={r} onFinding={openFinding} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
