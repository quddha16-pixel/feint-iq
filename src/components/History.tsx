import { useState } from "react";
import {
  ArrowRight,
  Download,
  Upload,
  Trash2,
  ArrowDownUp,
} from "lucide-react";
import {
  compareReports,
  type CompletedAnalysisReport,
} from "../domain/contracts";
import { gradeFor, metricDefinitions, type MetricId } from "../domain/metrics";
import { downloadJSON } from "../services/storage";
import { ActionLink, EmptyState, Notice, PageHeading, Tag } from "./ui";
export function History({
  reports,
  onImport,
  onDelete,
}: {
  reports: CompletedAnalysisReport[];
  onImport: (data: unknown) => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState("");
  const visible = reports
    .filter((r) => filter === "all" || r.configuration.discipline === filter)
    .sort((a, b) =>
      sort === "newest"
        ? b.completedAt.localeCompare(a.completedAt)
        : a.completedAt.localeCompare(b.completedAt),
    );
  const chosen = selected
    .map((id) => reports.find((r) => r.id === id))
    .filter((x): x is CompletedAnalysisReport => !!x)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const comparison =
    chosen.length === 2 ? compareReports(chosen[0], chosen[1]) : null;
  return (
    <>
      <PageHeading
        eyebrow="YOUR PERFORMANCE LIBRARY"
        title="Build a body of evidence."
        action={<ActionLink href="#/new">New analysis</ActionLink>}
      >
        Your saved assessments, technical patterns, and progress over time.
      </PageHeading>
      <Notice>
        Reports are saved only in this browser, without account isolation or
        cloud backup. Import authentic, schema-v1 reports from a trusted
        analysis source; imported findings are not independently verified by
        Identifier Q.
      </Notice>
      <div className="library-toolbar">
        <label>
          Discipline
          <select
            aria-label="Filter by discipline"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All disciplines</option>
            <option value="boxing">Boxing</option>
            <option value="kickboxing">Kickboxing</option>
          </select>
        </label>
        <label>
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <div className="toolbar-actions">
          <label className="button secondary file-label">
            <Upload size={16} /> Import report
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Import report JSON"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) {
                  setError("Report imports must be smaller than 5 MB.");
                  return;
                }
                try {
                  const data = JSON.parse(await f.text());
                  onImport(data);
                  setError("");
                } catch {
                  setError(
                    "The report file could not be read. Choose a valid JSON report.",
                  );
                }
              }}
            />
          </label>
          <button
            className="button secondary"
            disabled={!reports.length}
            onClick={() => downloadJSON(reports, "identifier-q-library.json")}
          >
            <Download size={16} /> Export library
          </button>
        </div>
      </div>
      {error && (
        <Notice tone="error" onDismiss={() => setError("")}>
          {error}
        </Notice>
      )}
      <section className="panel history-panel">
        <div className="section-title">
          <h2>
            {visible.length} saved assessment{visible.length !== 1 ? "s" : ""}
          </h2>
          <span className="muted tiny">SELECT TWO TO COMPARE</span>
        </div>
        {!visible.length ? (
          <EmptyState
            title={
              reports.length
                ? "No matching assessments"
                : "A clean slate. A clear direction."
            }
            action={
              <ActionLink href="#/new" secondary>
                Set up an analysis
              </ActionLink>
            }
          >
            {reports.length
              ? "Choose a different discipline to see your saved reports."
              : "Your first completed report will start your performance history. Nothing here is simulated."}
          </EmptyState>
        ) : (
          <div className="report-list">
            {visible.map((r) => (
              <article className="history-row" key={r.id}>
                <label className="compare-checkbox">
                  <input
                    type="checkbox"
                    aria-label={`Compare ${r.configuration.fighter.name} ${r.id}`}
                    checked={selected.includes(r.id)}
                    disabled={!selected.includes(r.id) && selected.length === 2}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, r.id]
                          : selected.filter((id) => id !== r.id),
                      )
                    }
                  />
                </label>
                <a
                  className="history-report-link"
                  href={`#/report/${encodeURIComponent(r.id)}`}
                >
                  <div>
                    <h3>{r.configuration.fighter.name}</h3>
                    <small>
                      {new Date(r.completedAt).toLocaleDateString()} ·{" "}
                      {r.configuration.type}
                    </small>
                  </div>
                  <Tag>{r.configuration.discipline}</Tag>
                  <span className="history-score">
                    <strong>{gradeFor(r.assessment.score)}</strong>
                    <small>
                      {r.assessment.score === null
                        ? "Not assessed"
                        : `${r.assessment.score}/100`}
                    </small>
                  </span>
                  <ArrowRight size={17} />
                </a>
                <button
                  className="icon-button"
                  aria-label={`Delete report ${r.id}`}
                  onClick={() => setDeleting(r.id)}
                >
                  <Trash2 size={17} />
                </button>
                {deleting === r.id && (
                  <div className="delete-confirm">
                    <p>
                      Delete this browser’s copy? Export it first if you need a
                      backup.
                    </p>
                    <button
                      className="button danger"
                      onClick={() => {
                        onDelete(r.id);
                        setSelected(selected.filter((id) => id !== r.id));
                        setDeleting("");
                      }}
                    >
                      Delete report
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setDeleting("")}
                    >
                      Keep report
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {comparison && (
        <section className="panel comparison">
          <div className="section-title">
            <div>
              <p className="eyebrow">SIDE BY SIDE</p>
              <h2>
                <ArrowDownUp size={21} /> Performance comparison
              </h2>
            </div>
            <button className="text-button" onClick={() => setSelected([])}>
              Clear selection
            </button>
          </div>
          {!comparison.compatible ? (
            <Notice tone="error">{comparison.reason}</Notice>
          ) : (
            <>
              <p className="muted">
                {chosen[0].configuration.fighter.name} ·{" "}
                {new Date(chosen[0].completedAt).toLocaleDateString()} →{" "}
                {new Date(chosen[1].completedAt).toLocaleDateString()}
              </p>
              <Notice>
                {comparison.methodologyChanged
                  ? "Scoring methodologies differ. Numerical changes are withheld because scores are not directly comparable."
                  : "Score changes describe these assessments only. Opponent, footage conditions, rules, and analysis quality affect comparability; a higher score does not prove improvement."}
              </Notice>
              <div className="comparison-overall">
                <span>Overall score change</span>
                <strong>
                  {comparison.overallDelta === null
                    ? "Not comparable"
                    : `${comparison.overallDelta > 0 ? "+" : ""}${comparison.overallDelta}`}
                </strong>
              </div>
              <div className="comparison-table">
                <table>
                  <thead>
                    <tr>
                      <th>Technical dimension</th>
                      <th>Earlier</th>
                      <th>Later</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.metrics.map((m) => (
                      <tr key={m.id}>
                        <th>{m.label}</th>
                        <td>{m.before ?? "—"}</td>
                        <td>{m.after ?? "—"}</td>
                        <td>
                          {m.delta === null
                            ? "—"
                            : `${m.delta > 0 ? "+" : ""}${m.delta}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>Repeated weakness dimensions</h3>
              <p>
                {comparison.repeatedWeaknesses.length
                  ? comparison.repeatedWeaknesses
                      .map((id) => metricDefinitions[id as MetricId]?.[0] ?? id)
                      .join(", ")
                  : "No shared weakness dimensions in these reports."}
              </p>
              <div className="two-col">
                <div>
                  <h3>Earlier training priorities</h3>
                  <ul>
                    {comparison.priorities.before.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Later training priorities</h3>
                  <ul>
                    {comparison.priorities.after.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
