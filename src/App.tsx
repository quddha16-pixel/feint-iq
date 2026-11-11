import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CircleHelp,
  LayoutDashboard,
  Plus,
  Settings2,
  UserRound,
  CalendarDays,
  Crosshair,
  Users,
} from "lucide-react";
import type { Discipline } from "./domain/metrics";
import { useWorkspace } from "./state/useWorkspace";
import { WorkspaceGuide } from "./components/WorkspaceGuide";
import { Overview } from "./camp/Overview";
import { Profile } from "./camp/Profile";
import { Opponents } from "./camp/Opponents";
import { Plan } from "./camp/Plan";
import { Development } from "./camp/Development";
import { AnalysisCenter } from "./camp/AnalysisCenter";
import { CampBackup } from "./camp/Backup";
import { useCamp } from "./camp/useCamp";
import { Workflow } from "./components/Workflow";
import { Report } from "./components/Report";
import { History } from "./components/History";

import { Settings } from "./components/Settings";
import { Brand, Notice } from "./components/ui";
const nav = [
  { path: "/", label: "Camp overview", icon: LayoutDashboard },
  { path: "/analysis", label: "Analysis center", icon: Plus },
  { path: "/profile", label: "Vince’s profile", icon: UserRound },
  { path: "/opponents", label: "Opponents", icon: Users },
  { path: "/plan", label: "Camp plan", icon: CalendarDays },
  { path: "/development", label: "Development", icon: Crosshair },
  { path: "/history", label: "Report library", icon: Activity },
  { path: "/settings", label: "Settings", icon: Settings2 },
];
function route() {
  return location.hash.replace(/^#/, "") || "/";
}
export function App({ privateHost = false }: { privateHost?: boolean }) {
  const camp = useCamp();
  const [path, setPath] = useState(route);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const handle = () => {
      setPath(route());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  const {
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
  } = useWorkspace();
  const current = nav.find((n) =>
    n.path === "/" ? path === "/" : path.startsWith(n.path),
  );
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">PRIVATE FIGHT CAMP</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <a
              key={n.path}
              href={`#${n.path}`}
              className={current?.path === n.path ? "active" : ""}
              aria-current={current?.path === n.path ? "page" : undefined}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.path === "/new" && (
                <span className="nav-plus" aria-hidden="true">
                  +
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="engine-card">
            <span className="status-amber" />
            <span>
              Analysis engine
              <strong>
                {engine.available
                  ? "Backend connected"
                  : engine.connected
                    ? "Provider unavailable"
                    : "Integration required"}
              </strong>
            </span>
            <a href="#/settings" aria-label="View engine integration status">
              <ArrowUpRight size={16} />
            </a>
          </div>
          <button className="help-button" onClick={() => setHelp(true)}>
            <CircleHelp size={18} /> Workspace guide <ArrowUpRight size={15} />
          </button>
          <div className="sidebar-signature">
            FEINT ENGINEERING<span>COACHING. EVIDENCE. DEVELOPMENT.</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="app-header">
          <div className="header-context">
            <span className="mobile-brand">
              iQ<span> / </span>
            </span>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {current?.label ??
                (path === "/new"
                  ? "Video analysis setup"
                  : path.startsWith("/report")
                    ? "Analysis report"
                    : "Workspace")}
            </strong>
          </div>
          <div className="header-controls">
            <div
              className="segmented"
              role="group"
              aria-label="Preferred discipline"
            >
              {(["boxing", "kickboxing"] as Discipline[]).map((d) => (
                <button
                  key={d}
                  disabled={submitting.current}
                  aria-pressed={preferences.discipline === d}
                  onClick={() =>
                    savePreferences({ ...preferences, discipline: d })
                  }
                >
                  {d}
                </button>
              ))}
            </div>
            <a
              href="#/settings"
              className="avatar"
              aria-label="Local profile and settings"
            >
              <UserRound size={19} />
            </a>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {["uploading", "queued", "processing"].includes(status) && (
            <Notice>
              Analysis {status}. {processingDetail && `${processingDetail}. `}{" "}
              {status === "uploading"
                ? "Sending your footage to the connected backend."
                : "Progress is indeterminate; no percentage is estimated."}{" "}
              <button className="text-button" onClick={cancelAnalysis}>
                Cancel analysis
              </button>
            </Notice>
          )}
          {message && (
            <Notice onDismiss={() => setMessage("")}>{message}</Notice>
          )}
          <div className="local-boundary">
            <span className="live-dot" />{" "}
            {privateHost
              ? "Private host verified · device-only records · shared storage not enabled"
              : "Local development · device-only records · private hosting not enabled"}
          </div>
          {camp.error && <Notice tone="error">{camp.error}</Notice>}
          {camp.message && (
            <Notice onDismiss={() => camp.setMessage("")}>
              {camp.message}
            </Notice>
          )}
          {path === "/" ? (
            <Overview data={camp.data} reports={reports} />
          ) : path === "/analysis" ? (
            <AnalysisCenter
              data={camp.data}
              commit={camp.commit}
              reports={reports}
            />
          ) : path === "/profile" ? (
            <Profile data={camp.data} commit={camp.commit} />
          ) : path === "/opponents" ? (
            <Opponents data={camp.data} commit={camp.commit} />
          ) : path === "/plan" ? (
            <Plan data={camp.data} commit={camp.commit} />
          ) : path === "/development" ? (
            <Development data={camp.data} commit={camp.commit} />
          ) : path === "/new" ? (
            <Workflow
              draft={draft}
              update={updateDraft}
              video={video}
              maxMB={preferences.maxFileMB}
              videoError={videoError}
              onSelect={selectVideo}
              onReady={onReady}
              onVideoError={setVideoError}
              onRemove={removeVideo}
              frame={frame}
              frames={frames}
              onRemoveFrame={removeFrame}
              engineAvailable={engine.available}
              momentDetection={engine.momentDetection}
              onCancel={cancelAnalysis}
              onFrame={setFrame}
              status={status}
              error={error}
              onSubmit={submit}
              validateStep={validateStep}
              onError={setError}
            />
          ) : path === "/history" ? (
            <History
              reports={reports}
              onImport={importData}
              onDelete={deleteReport}
            />
          ) : path === "/report" || path.startsWith("/report/") ? (
            <Report
              key={path}
              report={reports.find(
                (r) => `/report/${encodeURIComponent(r.id)}` === path,
              )}
              onMomentFeedback={saveMomentFeedback}
            />
          ) : path === "/about" ? (
            <section className="panel">
              <h1>Feint Engineering · Identifier Q</h1>
              <p>
                A coaching workspace for Vince and his coach. Review actual
                evidence, document uncertainty, and keep coaching decisions
                human.
              </p>
              <a className="quiet-link" href="#/">
                Return to camp overview ↗
              </a>
            </section>
          ) : path === "/settings" ? (
            <>
              <CampBackup data={camp.data} commit={camp.commit} />
              <section className="panel">
                <h2>Hosting & capability status</h2>
                <p>
                  This local workspace is not an authenticated production
                  service. Public GitHub Pages is unsuitable for private camp
                  data. The prepared identity gateway must protect all
                  application assets and endpoints before remote use.
                </p>
                <p>
                  OpenAI, Anthropic, xAI and Gemini comparisons, secure 1 GB
                  uploads, cloud retention and shared storage remain pending. No
                  premium provider has been activated by this rebuild.
                </p>
                <label>
                  Planned cloud footage retention
                  <select
                    value={camp.data.camp.retentionDays}
                    onChange={(e) =>
                      camp.commit({
                        ...camp.data,
                        camp: {
                          ...camp.data.camp,
                          retentionDays: e.target.value as "7" | "30" | "90",
                        },
                      })
                    }
                  >
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                  </select>
                </label>
                <p className="subtle-note">
                  Planning preference only. No server deletion policy or cloud
                  footage storage is enabled. Local videos remain session-only.
                </p>
              </section>
              <Settings
                preferences={preferences}
                onSave={savePreferences}
                onClear={clearWorkspace}
                onExport={exportWorkspace}
                engine={engine}
                onConnect={connectEngine}
                onDisconnect={disconnectEngine}
                busy={submitting.current}
              />
            </>
          ) : (
            <section className="panel not-found">
              <h1>Page not found.</h1>
              <p>This workspace link does not exist.</p>
              <a className="button" href="#/">
                Return to dashboard
              </a>
            </section>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav
          .filter((n) =>
            ["/", "/analysis", "/opponents", "/plan", "/settings"].includes(
              n.path,
            ),
          )
          .map((n) => (
            <a
              key={n.path}
              className={current?.path === n.path ? "active" : ""}
              href={`#${n.path}`}
              aria-current={current?.path === n.path ? "page" : undefined}
            >
              <n.icon size={20} />
              <span>
                {n.path === "/history"
                  ? "History"
                  : n.path === "/new"
                    ? "Use identifierQ"
                    : n.label}
              </span>
            </a>
          ))}
      </nav>
      {help && <WorkspaceGuide onClose={() => setHelp(false)} />}
    </div>
  );
}
