import { ArrowUpRight, CalendarDays, Crosshair, Target } from "lucide-react";
import type { CompletedAnalysisReport } from "../domain/contracts";
import type { Camp } from "./model";
import { daysUntil } from "./model";
import { CampEmpty, lines } from "./ui";
export function Overview({
  data,
  reports,
}: {
  data: Camp;
  reports: CompletedAnalysisReport[];
}) {
  const until = daysUntil(data.camp.fightDate);
  const opponent = data.opponents.find((o) => o.id === data.camp.opponentId);
  const priorities = data.findings.filter(
    (f) =>
      f.subject === "vince" &&
      f.priority === "high" &&
      f.followups.at(-1)?.status !== "resolved",
  );
  const sparring = [...data.sessions]
    .filter((s) => s.kind === "sparring")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const report = reports.find((r) => r.id === sparring?.reportId);
  const improvements = data.findings.filter(
    (f) =>
      f.subject === "vince" &&
      ["improving", "resolved"].includes(f.followups.at(-1)?.status ?? ""),
  );
  return (
    <>
      <div className="camp-intro">
        <span className="eyebrow">FEINT ENGINEERING / COACH + VINCE</span>
        <span className="tag">COACHING WORKSPACE</span>
      </div>
      <section className="camp-hero">
        <div>
          <p className="eyebrow">VINCE — FIGHT CAMP OVERVIEW</p>
          <h1>Vince’s fight camp.</h1>
          <p>
            Review the evidence, keep technical priorities visible, and prepare
            the next session.
          </p>
          <div className="inline-actions">
            <a className="button" href="#/analysis">
              Open analysis center <ArrowUpRight size={17} />
            </a>
            <a className="button secondary" href="#/plan">
              Plan the week
            </a>
          </div>
        </div>
        <div className="camp-fight-card">
          <span className="eyebrow">NEXT FIGHT</span>
          <strong>
            {opponent ? `Vince vs ${opponent.name}` : "Opponent not set"}
          </strong>
          <span>{data.camp.fightDate || "Fight date not set"}</span>
          <div className="camp-countdown">
            {until === null ? "—" : Math.abs(until)}
            <small>
              {until === null
                ? "DAYS TO FIGHT · AWAITING DATE"
                : until < 0
                  ? "DAYS SINCE FIGHT"
                  : until === 0
                    ? "FIGHT DAY"
                    : "DAYS TO FIGHT"}
            </small>
          </div>
          <a className="quiet-link" href="#/plan">
            Update camp details <ArrowUpRight size={15} />
          </a>
        </div>
      </section>
      <div className="camp-stats">
        {[
          [
            CalendarDays,
            "CAMP STATUS",
            data.camp.status === "not-set"
              ? "Not set"
              : data.camp.status.replaceAll("-", " "),
            data.camp.name || "Set the camp and dates",
          ],
          [
            Target,
            "DOCUMENTED SESSIONS",
            String(data.sessions.filter((s) => s.kind !== "opponent").length),
            "Coach-entered session records",
          ],
          [
            Crosshair,
            "OPEN HIGH PRIORITIES",
            String(priorities.length),
            "Evidence-linked coaching findings",
          ],
        ].map(([Icon, label, value, detail]) => {
          const Glyph = Icon as typeof Target;
          return (
            <div className="camp-stat" key={String(label)}>
              <Glyph size={20} />
              <span className="eyebrow">{String(label)}</span>
              <strong>{String(value)}</strong>
              <small>{String(detail)}</small>
            </div>
          );
        })}
      </div>
      <div className="camp-grid">
        <section className="panel">
          <div className="section-title">
            <h2>Training priorities</h2>
            <a className="quiet-link" href="#/development">
              Review evidence ↗
            </a>
          </div>
          {priorities.length ? (
            priorities.slice(0, 3).map((f, i) => (
              <div className="priority-line" key={f.id}>
                <span>0{i + 1}</span>
                <div>
                  <strong>{f.correction}</strong>
                  <small>
                    {f.kind === "hypothesis"
                      ? "Hypothesis · coach review required"
                      : "Coach-entered observation"}{" "}
                    · {f.category}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <CampEmpty>
              No high-priority findings documented. Add a timestamped
              observation after reviewing footage.
            </CampEmpty>
          )}
          {lines(data.profile.priorities).map((p) => (
            <p className="coach-line" key={p}>
              {p}
              <small>Coach’s profile priority</small>
            </p>
          ))}
        </section>
        <section className="panel">
          <p className="eyebrow">LATEST SPARRING REVIEW</p>
          <h2>{sparring?.title || "A round worth studying."}</h2>
          {sparring ? (
            <>
              <p>
                {sparring.date || "Date not recorded"} ·{" "}
                {sparring.round || "Round not recorded"}
              </p>
              <p>{sparring.notes || "No coach notes added."}</p>
              {report ? (
                <a
                  className="quiet-link"
                  href={`#/report/${encodeURIComponent(report.id)}`}
                >
                  Read attached analysis ↗
                </a>
              ) : (
                <p className="muted">No analysis report attached.</p>
              )}
            </>
          ) : (
            <CampEmpty>
              No sparring session recorded. Your first review will appear here.
            </CampEmpty>
          )}
          <a className="quiet-link" href="#/analysis">
            Record a session ↗
          </a>
        </section>
        <section className="panel">
          <p className="eyebrow">TECHNICAL PROFILE</p>
          <h2>What’s working</h2>
          {data.profile.strengths ? (
            <p className="preserve-lines">{data.profile.strengths}</p>
          ) : (
            <CampEmpty>
              No strengths documented. The coach can add verified strengths to
              Vince’s profile.
            </CampEmpty>
          )}
          <a className="quiet-link" href="#/profile">
            Open Vince’s profile ↗
          </a>
        </section>
        <section className="panel">
          <p className="eyebrow">PATTERNS OVER TIME</p>
          <h2>Recurring weaknesses</h2>
          {data.findings
            .filter(
              (f) =>
                f.subject === "vince" &&
                f.followups.at(-1)?.status === "recurring",
            )
            .map((f) => (
              <p key={f.id}>{f.observation}</p>
            ))}
          {!data.findings.some(
            (f) =>
              f.subject === "vince" &&
              f.followups.at(-1)?.status === "recurring",
          ) && (
            <CampEmpty>
              No recurring pattern established. Link follow-up evidence from
              another session before drawing a trend.
            </CampEmpty>
          )}
        </section>
        <section className="panel">
          <p className="eyebrow">COACH’S CORNER</p>
          <h2>Notes for the camp</h2>
          <p className="preserve-lines">
            {data.camp.notes ||
              data.profile.notes ||
              "No notes yet. Capture the focus for Vince’s next session."}
          </p>
          <a className="quiet-link" href="#/plan">
            Edit coach notes ↗
          </a>
        </section>
        <section className="panel">
          <p className="eyebrow">DEVELOPMENT LOG</p>
          <h2>Recent improvements</h2>
          {improvements.length ? (
            improvements.slice(-3).map((f) => (
              <p key={f.id}>
                {f.followups.at(-1)?.note}
                <small className="block">
                  Coach assessment · evidence attached
                </small>
              </p>
            ))
          ) : (
            <CampEmpty>
              No improvements confirmed yet. Follow-up reviews will build this
              record without invented scores.
            </CampEmpty>
          )}
        </section>
      </div>
    </>
  );
}
