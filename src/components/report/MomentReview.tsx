import { useState } from "react";
import type { CompletedAnalysisReport } from "../../domain/contracts";
import type { MomentReview as Review } from "../../domain/moments";
import type { MomentFeedback } from "../../services/momentFeedback";
import { Notice } from "../ui";
const stamp = (time: number) =>
  `${Math.floor(time / 60)}:${(time % 60).toFixed(2).padStart(5, "0")}`;
export function MomentReview({
  report,
  play,
  canPlay,
  save,
}: {
  report: CompletedAnalysisReport;
  play: (start: number, end: number) => void;
  canPlay: boolean;
  save: (edit: MomentFeedback) => string | undefined;
}) {
  const [message, setMessage] = useState("");
  const [missedTime, setMissedTime] = useState("");
  const [missedNote, setMissedNote] = useState("");
  const data = report.momentAnalysis!;
  const commit = (edit: MomentFeedback) => {
    const error = save(edit);
    setMessage(
      error ??
        "Coach review saved in this browser. Export the report to keep a backup.",
    );
    return !error;
  };
  const review = (id: string, patch: Partial<Review>) => {
    const previous = data.moments.find((m) => m.candidate.id === id)?.review;
    commit({
      type: "review",
      momentId: id,
      review: {
        note: "",
        ...previous,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    });
  };
  return (
    <section className="moment-review" aria-label="Moment review">
      <h2>Moment review · v0.1</h2>
      <p>
        Search suggestions, not verified exchanges. Image changes can miss quiet
        actions and select camera movement. AI interpretations need coach
        review.
      </p>
      <p>
        {data.moments.length} selected intervals ·{" "}
        {data.scan.fallbackUsed
          ? "Fallback coverage samples: no suitable motion peaks found"
          : "Motion-burst candidates"}
        . Reattach the original footage to play intervals and inspect
        source-frame timestamps.
      </p>
      {message && <Notice>{message}</Notice>}
      {data.moments.map(({ candidate: m, assessment: a, review: r }) => (
        <article
          className="panel moment-card"
          key={m.id}
          aria-label={`Review ${m.id}`}
        >
          <h3>
            {stamp(m.start)}–{stamp(m.end)} ·{" "}
            {m.selection === "motion"
              ? "Motion-burst candidate"
              : "Coverage sample"}
          </h3>
          <p>
            Candidate timestamp: {stamp(m.anchor)}. No punch or contact is
            detected by this label.
          </p>
          <button
            className="button secondary"
            disabled={!canPlay}
            onClick={() => play(m.start, m.end)}
          >
            Play selected moment
          </button>
          <details>
            <summary>Chronological source frames</summary>
            <div className="moment-frames">
              {m.frameIds.map((id) => {
                const e = report.evidence.find((e) => e.id === id)!;
                return (
                  <button
                    className="button secondary"
                    key={id}
                    disabled={!canPlay}
                    onClick={() =>
                      play(
                        e.verifiedTime!,
                        Math.min(m.end, e.verifiedTime! + 0.25),
                      )
                    }
                  >
                    {stamp(e.verifiedTime!)} · {id}
                  </button>
                );
              })}
            </div>
          </details>
          <dl className="moment-details">
            <dt>Fighter identity</dt>
            <dd>
              {a.identityConfirmed
                ? "Model-associated within this sequence; coach verification pending"
                : "Unconfirmed; no personalized correction"}
              . {a.identityExplanation}
            </dd>
            <dt>AI observation</dt>
            <dd>
              {a.classification === "hypothesis"
                ? "Possible interpretation"
                : "Model-described visible observation; coach verification pending"}
              : {a.visibleAction}
            </dd>
            <dt>Punch interpretation</dt>
            <dd>
              {a.punchOutcome.replaceAll("-", " ")} — contact is not
              independently confirmed.
            </dd>
            <dt>Defensive vulnerability</dt>
            <dd>
              {a.identityConfirmed
                ? a.defensiveVulnerability
                : "Not attributed to Vince: identity is unconfirmed."}
            </dd>
            <dt>Countering hypothesis</dt>
            <dd>
              {a.identityConfirmed
                ? a.counterOpportunity
                : "Not attributed to Vince: identity is unconfirmed."}
            </dd>
            <dt>Defensive correction</dt>
            <dd>
              {a.correction ??
                "Insufficient evidence for a personalized correction."}
            </dd>
            <dt>Recommended drill</dt>
            <dd>{a.drill ?? "No supported drill proposed."}</dd>
            <dt>Uncertainty and limitations</dt>
            <dd>{a.uncertainty}</dd>
          </dl>
          <fieldset>
            <legend>Finding evaluation</legend>
            <div className="moment-actions">
              {(["correct", "incorrect", "uncertain"] as const).map((value) => (
                <button
                  className="button secondary"
                  aria-pressed={r?.finding === value}
                  key={value}
                  onClick={() => review(m.id, { finding: value })}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Was this interval worth reviewing?</legend>
            <div className="moment-actions">
              {(["useful", "not-useful", "uncertain"] as const).map((value) => (
                <button
                  className="button secondary"
                  aria-pressed={r?.selection === value}
                  key={value}
                  onClick={() => review(m.id, { selection: value })}
                >
                  {value === "not-useful"
                    ? "Not useful"
                    : value === "uncertain"
                      ? "Unsure"
                      : "Useful"}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            Coach correction or note
            <textarea
              key={`${m.id}-${r?.updatedAt ?? "new"}`}
              defaultValue={r?.note ?? ""}
              maxLength={1600}
              onBlur={(e) => {
                if (e.target.value !== (r?.note ?? ""))
                  review(m.id, { note: e.target.value });
              }}
            />
          </label>
        </article>
      ))}
      <section className="panel">
        <h3>Audit missed moments</h3>
        <p>
          Watch the whole recording, including unselected sections. Plausible
          selected moments do not establish detection recall. Record missed
          moments separately from incorrect AI findings.
        </p>
        <label>
          <input
            type="checkbox"
            checked={data.reviewedWholeClip}
            onChange={(e) =>
              commit({ type: "coverage", reviewed: e.target.checked })
            }
          />{" "}
          Coach reviewed the whole recording for missed moments
        </label>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              missedTime.trim() &&
              commit({
                type: "missed",
                time: Number(missedTime),
                note: missedNote,
              })
            ) {
              setMissedTime("");
              setMissedNote("");
            }
          }}
        >
          <label>
            Missed moment timestamp (seconds)
            <input
              type="number"
              step="0.01"
              min="0"
              max={report.video.duration - 0.01}
              required
              value={missedTime}
              onChange={(e) => setMissedTime(e.target.value)}
            />
          </label>
          <label>
            What was missed?
            <textarea
              required
              maxLength={1600}
              value={missedNote}
              onChange={(e) => setMissedNote(e.target.value)}
            />
          </label>
          <button className="button secondary" type="submit">
            Record missed moment
          </button>
        </form>
        <ul>
          {data.missed.map((m, i) => (
            <li key={m.time}>
              {stamp(m.time)} — {m.note}{" "}
              <small>
                {data.moments.some(
                  ({ candidate: c }) => m.time >= c.start && m.time <= c.end,
                )
                  ? "Inside a selected interval: review possible AI omission."
                  : "Outside selected intervals: search coverage miss."}
              </small>{" "}
              <button
                className="button secondary"
                onClick={() => commit({ type: "remove-missed", index: i })}
              >
                Remove missed moment at {stamp(m.time)}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
