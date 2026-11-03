import { ShadesOf } from "./ShadesOf";
import { Play } from "lucide-react";
import type {
  CompletedAnalysisReport,
  TechnicalObservation,
} from "../../domain/contracts";
import {
  gradeFor,
  metricDefinitions,
  metricsFor,
  type MetricId,
} from "../../domain/metrics";
import { formatTime } from "../../domain/video";
import { EmptyState, SectionTitle, Tag } from "../ui";
const confidence = (n: number | null) =>
  n === null ? "Confidence unavailable" : `${Math.round(n * 100)}% confidence`;
type FindingProps = {
  report: CompletedAnalysisReport;
  onFinding: (id: string) => void;
};
const getFinding = (r: CompletedAnalysisReport, id: string) =>
  r.observations.find((o) => o.id === id)?.finding ?? "Not assessed";
export function PerformanceOverview({ report: r, onFinding }: FindingProps) {
  const finding = (id: string) => getFinding(r, id);
  return (
    <>
      <section className="panel assessment-panel">
        <div className="grade-block">
          <span className="eyebrow">OVERALL ASSESSMENT</span>
          <strong>
            {r.assessment.score === null ? "—" : gradeFor(r.assessment.score)}
          </strong>
          <span>
            {r.assessment.score === null
              ? "Not assessed"
              : `${r.assessment.score} / 100`}
          </span>
        </div>
        <div>
          <h2>Performance overview</h2>
          <p>{r.assessment.summary}</p>
        </div>
      </section>
      <div className="assessment-grid">
        {[
          ["Primary strengths", r.assessment.strengths],
          ["Technical weaknesses", r.assessment.weaknesses],
          ["Highest priorities", r.assessment.priorities],
        ].map(([title, ids]) => (
          <section className="panel" key={title as string}>
            <h3>{title}</h3>
            {(ids as string[]).length ? (
              <ol>
                {(ids as string[]).map((id) => (
                  <li key={id}>
                    {title === "Highest priorities"
                      ? r.recommendations.find((x) => x.id === id)?.title
                      : finding(id)}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Not assessed.</p>
            )}
          </section>
        ))}
      </div>
      <ShadesOf report={r} onFinding={onFinding} />
      <section className="panel">
        <SectionTitle
          title="Technical scorecard"
          label="EVIDENCE BEFORE NUMBERS"
        />
        <div className="scorecard">
          {metricsFor(r.configuration.discipline, r.configuration.ruleset).map(
            (def) => {
              const m = r.metrics.find((m) => m.id === def.id)!;
              return (
                <details className="metric-detail" key={def.id}>
                  <summary>
                    <span>{def.label}</span>
                    <span>
                      {m.applicability === "not-applicable"
                        ? "Not applicable"
                        : m.score === null
                          ? "Not assessed"
                          : `${m.score} / 100`}
                    </span>
                    <div className="score-track">
                      <span style={{ width: `${m.score ?? 0}%` }} />
                    </div>
                  </summary>
                  <p>{def.description}</p>
                  <p>{m.explanation}</p>
                  <small>{confidence(m.confidence)}</small>
                  {m.observationIds.map((id) => (
                    <button
                      className="text-button block"
                      key={id}
                      onClick={() => {
                        onFinding(id);
                      }}
                    >
                      View evidence: {finding(id)}
                    </button>
                  ))}
                </details>
              );
            },
          )}
        </div>
      </section>
    </>
  );
}
export function TechnicalBreakdown({
  report: r,
  active,
  seek,
}: {
  report: CompletedAnalysisReport;
  active: string;
  seek: (time: number, id: string) => void;
}) {
  const observationCard = (o: TechnicalObservation) => (
    <article
      className={`observation ${active === o.id ? "focused" : ""}`}
      id={`observation-${o.id}`}
      key={o.id}
    >
      <div className="observation-meta">
        <Tag>{o.category.replace("-", " ").toUpperCase()}</Tag>
        <span>
          {o.kind === "observed" ? "Direct observation" : "Interpretation"} ·{" "}
          {confidence(o.confidence)}
        </span>
      </div>
      <h3>{o.finding}</h3>
      <p>{o.explanation}</p>
      <small>
        Metric: {metricDefinitions[o.metricId as MetricId]?.[0] ?? o.metricId}
      </small>
      <div className="evidence-list">
        {o.evidenceIds.map((id) => {
          const e = r.evidence.find((e) => e.id === id)!;
          return (
            <div key={id}>
              <span className="muted tiny">
                {e.kind.toUpperCase()} EVIDENCE · {confidence(e.confidence)}
              </span>
              <p>{e.description}</p>
              {e.verifiedTime !== null ? (
                <button
                  className="time-link"
                  onClick={() => seek(e.verifiedTime!, o.id)}
                >
                  <Play size={13} /> {formatTime(e.verifiedTime)}{" "}
                  <span>
                    {e.source === "sampled-frame"
                      ? "Verified source-frame time"
                      : "Verified timestamp"}
                  </span>
                </button>
              ) : (
                <small>No verified timestamp</small>
              )}
            </div>
          );
        })}
      </div>
      {o.correctiveAction && (
        <p className="correction">
          <strong>Coaching action</strong> {o.correctiveAction}
        </p>
      )}
    </article>
  );
  return (
    <section className="panel">
      <SectionTitle
        title="Technical breakdown"
        label="OBSERVE. UNDERSTAND. REFINE."
      />
      {r.observations.length ? (
        (["offense", "defense", "movement", "fight-iq"] as const).map(
          (category) => (
            <section className="technical-group" key={category}>
              <h2 className="capitalize">{category.replace("-", " ")}</h2>
              {r.observations.filter((o) => o.category === category).length ? (
                r.observations
                  .filter((o) => o.category === category)
                  .map(observationCard)
              ) : (
                <p className="muted">
                  No supported findings supplied for this category.
                </p>
              )}
            </section>
          ),
        )
      ) : (
        <EmptyState title="No supported observations">
          The source report did not provide technical findings.
        </EmptyState>
      )}
    </section>
  );
}
export function DevelopmentPlan({ report: r, onFinding }: FindingProps) {
  const finding = (id: string) => getFinding(r, id);
  return (
    <section className="panel">
      <SectionTitle
        title="Engineer your improvement"
        label="FROM FINDING TO FOCUS"
      />
      {!r.recommendations.length ? (
        <EmptyState title="Evidence comes first">
          A personalized training plan requires authentic assessment findings.
          None were supplied in this report.
        </EmptyState>
      ) : (
        r.recommendations.map((rec) => (
          <article className="recommendation" key={rec.id}>
            <Tag accent={rec.priority === "primary"}>
              {rec.priority.toUpperCase()} PRIORITY
            </Tag>
            <h2>{rec.title}</h2>
            <div className="linked-findings">
              <small>BASED ON THESE FINDINGS</small>
              {rec.observationIds.map((id) => (
                <button
                  className="text-button block"
                  key={id}
                  onClick={() => {
                    onFinding(id);
                  }}
                >
                  {finding(id)} →
                </button>
              ))}
            </div>
            {rec.drills.map((drill, i) => (
              <details className="drill" key={i}>
                <summary>
                  {drill.name}
                  <span>{drill.dosage}</span>
                </summary>
                <p>{drill.objective}</p>
                <ol>
                  {drill.instructions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                <h4>Coaching cues</h4>
                <ul>
                  {drill.cues.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
                <h4>Common mistakes</h4>
                <ul>
                  {drill.mistakes.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
            ))}
            {[
              ["Training focus", rec.trainingFocus],
              ["Tactical adjustments", rec.tacticalAdjustments],
              ["Short-term goals", rec.shortTermGoals],
              ["Long-term goals", rec.longTermGoals],
            ].map(([title, list]) => (
              <div key={title as string}>
                <h3>{title}</h3>
                <ul>
                  {(list as string[]).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </article>
        ))
      )}
    </section>
  );
}
