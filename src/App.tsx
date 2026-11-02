import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CircleHelp,
  FileBarChart2,
  LayoutDashboard,
  Plus,
  Settings2,
  UserRound,
} from "lucide-react";
import type { Discipline } from "./domain/metrics";
import { useWorkspace } from "./state/useWorkspace";
import { WorkspaceGuide } from "./components/WorkspaceGuide";
import { Dashboard } from "./components/Dashboard";
import { Workflow } from "./components/Workflow";
import { Report } from "./components/Report";
import { History } from "./components/History";
import { Settings } from "./components/Settings";
import { Brand, Notice } from "./components/ui";
const nav = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/new", label: "New analysis", icon: Plus },
  { path: "/history", label: "Analysis history", icon: Activity },
  { path: "/report", label: "Analysis report", icon: FileBarChart2 },
  { path: "/settings", label: "Settings", icon: Settings2 },
];
function route() {
  return location.hash.replace(/^#/, "") || "/";
}
export function App() {
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
        <div className="workspace-label">PERFORMANCE WORKSPACE</div>
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
              {n.path === "/new" && <span className="nav-plus">+</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="engine-card">
            <span className="status-amber" />
            <span>
              Analysis engine<strong>Integration required</strong>
            </span>
            <a href="#/settings" aria-label="View engine integration status">
              <ArrowUpRight size={16} />
            </a>
          </div>
          <button className="help-button" onClick={() => setHelp(true)}>
            <CircleHelp size={18} /> Workspace guide <ArrowUpRight size={15} />
          </button>
          <div className="sidebar-signature">
            FEINT ENGINEERING<span>PRECISION. PERSPECTIVE. PROGRESS.</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="app-header">
          <div className="header-context">
            <span className="mobile-brand">
              IQ<span> / </span>
            </span>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{current?.label ?? "Page not found"}</strong>
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
          {message && (
            <Notice onDismiss={() => setMessage("")}>{message}</Notice>
          )}
          {path === "/" ? (
            <Dashboard
              discipline={preferences.discipline}
              reports={reports}
              hasDraft={!!draft.fighterName}
            />
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
            />
          ) : path === "/settings" ? (
            <Settings
              preferences={preferences}
              onSave={savePreferences}
              onClear={clearWorkspace}
              onExport={exportWorkspace}
            />
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
          .filter((n) => n.path !== "/report")
          .map((n) => (
            <a
              key={n.path}
              className={current?.path === n.path ? "active" : ""}
              href={`#${n.path}`}
              aria-current={current?.path === n.path ? "page" : undefined}
            >
              <n.icon size={20} />
              <span>{n.path === "/history" ? "History" : n.label}</span>
            </a>
          ))}
      </nav>
      {help && <WorkspaceGuide onClose={() => setHelp(false)} />}
    </div>
  );
}
