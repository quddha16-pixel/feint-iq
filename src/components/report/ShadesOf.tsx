import type { CompletedAnalysisReport } from "../../domain/contracts";
import { referenceFor } from "../../domain/styles";
import { SectionTitle } from "../ui";
export function ShadesOf({
  report,
  onFinding,
}: {
  report: CompletedAnalysisReport;
  onFinding: (id: string) => void;
}) {
  const comparisons = report.styleComparisons ?? [];
  return (
    <section className="panel shades-of">
      <SectionTitle title="Shades Of" label="STYLISTIC REFERENCES" />
      <p className="muted">
        Technical patterns that echo another fighter’s approach. These are
        qualitative comparisons, not measures of equal skill or ability.
      </p>
      {comparisons.length ? (
        <div className="style-comparisons">
          {comparisons.map((comparison, i) => {
            const reference = referenceFor(comparison.referenceId)!;
            return (
              <article className="style-comparison" key={reference.id}>
                <span className="eyebrow">STYLE REFERENCE 0{i + 1}</span>
                <h3>{reference.name}</h3>
                <p>{comparison.explanation}</p>
                <div className="style-evidence">
                  <small>BASED ON YOUR FINDINGS</small>
                  {comparison.observationIds.map((id) => (
                    <button
                      className="text-button block"
                      key={id}
                      onClick={() => onFinding(id)}
                    >
                      {report.observations.find((o) => o.id === id)!.finding} →
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="style-empty">
          <h3>More evidence before a comparison.</h3>
          <p>
            This report does not contain supported stylistic references. When
            enough footage and findings are available, up to three comparisons
            can appear here.
          </p>
        </div>
      )}
    </section>
  );
}
