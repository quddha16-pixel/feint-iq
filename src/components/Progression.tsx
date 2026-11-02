import {
  compareReports,
  type CompletedAnalysisReport,
} from "../domain/contracts";
import { metricsFor } from "../domain/metrics";
import { SectionTitle } from "./ui";
/** Only show a series for comparable, genuinely saved reports; no seeded chart data. */
export function Progression({
  reports,
}: {
  reports: CompletedAnalysisReport[];
}) {
  const latest = [...reports]
    .filter((r) => r.assessment.score !== null)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  if (!latest) return null;
  const series = reports
    .filter(
      (r) =>
        r.assessment.score !== null &&
        compareReports(latest, r).compatible &&
        !compareReports(latest, r).methodologyChanged,
    )
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  if (series.length < 2) return null;
  const shown = series.slice(-8);
  return (
    <section className="panel progression">
      <SectionTitle title="Performance over time" label="YOUR SAVED EVIDENCE" />
      <p>
        {latest.configuration.fighter.name} · {latest.configuration.discipline}{" "}
        · {latest.methodology.version}
      </p>
      <div
        className="trend-chart"
        role="img"
        aria-label={`Assessment scores in chronological order: ${shown.map((r) => `${new Date(r.completedAt).toLocaleDateString()}: ${r.assessment.score}`).join("; ")}`}
      >
        <svg
          viewBox="0 0 600 150"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M20 15H580 M20 75H580 M20 135H580"
            stroke="#2a3543"
            strokeDasharray="4 5"
          />
          <polyline
            points={shown
              .map(
                (r, i) =>
                  `${20 + (i * 560) / (shown.length - 1)},${135 - r.assessment.score! * 1.2}`,
              )
              .join(" ")}
            fill="none"
            stroke="#75baff"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {shown.map((r, i) => (
            <circle
              key={r.id}
              cx={20 + (i * 560) / (shown.length - 1)}
              cy={135 - r.assessment.score! * 1.2}
              r="3"
              fill="#9bceff"
            />
          ))}
        </svg>
      </div>
      <div className="trend-records">
        {shown.map((r) => (
          <a key={r.id} href={`#/report/${encodeURIComponent(r.id)}`}>
            <strong>{r.assessment.score}/100</strong>
            <span>{new Date(r.completedAt).toLocaleDateString()}</span>
          </a>
        ))}
      </div>
      <p className="subtle-note">
        Showing up to eight compatible assessments across{" "}
        {metricsFor(latest.configuration.discipline).length} dimensions.
        Footage, opponent, and conditions can differ. A rising score alone does
        not establish improvement.
      </p>
    </section>
  );
}
