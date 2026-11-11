import { useState } from "react";
import type { Camp } from "./model";
import { CampEmpty } from "./ui";
import { formatTime } from "../domain/video";
export function CompareSessions({ data }: { data: Camp }) {
  const [earlier, setEarlier] = useState("");
  const [later, setLater] = useState("");
  const sessions = data.sessions.filter((s) => s.kind !== "opponent");
  const first = sessions.find((s) => s.id === earlier);
  const second = sessions.find((s) => s.id === later);
  const comparable =
    first &&
    second &&
    first.id !== second.id &&
    first.discipline === second.discipline;
  return (
    <section className="panel">
      <h2>Compare sessions / rounds</h2>
      <p className="muted">
        Compare documented evidence side by side. Differences in notes are not
        automatically improvements; conditions and footage coverage may differ.
      </p>
      <div className="camp-form">
        {(
          [
            [earlier, setEarlier, "Earlier session / round"],
            [later, setLater, "Later session / round"],
          ] as const
        ).map(([value, set, label]) => (
          <label key={label}>
            {label}
            <select
              aria-label={label}
              value={value}
              onChange={(e) => set(e.target.value)}
            >
              <option value="">Choose a session</option>
              {sessions.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.date} / {s.title} / {s.round || s.kind}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {comparable ? (
        <div className="camp-grid">
          {[first, second].map((session) => (
            <div className="comparison-round" key={session.id}>
              <p className="eyebrow">
                {session.date} · {session.discipline}
              </p>
              <h3>{session.title}</h3>
              <p>{session.notes || "No session notes."}</p>
              {data.findings
                .filter(
                  (f) =>
                    f.subject === "vince" &&
                    (f.evidence.sessionId === session.id ||
                      f.followups.some(
                        (follow) => follow.evidence.sessionId === session.id,
                      )),
                )
                .map((f) => (
                  <div className="camp-list-row" key={f.id}>
                    <span className="tag">{f.kind}</span>
                    <p>{f.observation}</p>
                    {f.evidence.sessionId === session.id && (
                      <small>
                        {formatTime(f.evidence.time)} · {f.evidence.context}
                      </small>
                    )}
                    {f.followups
                      .filter(
                        (follow) => follow.evidence.sessionId === session.id,
                      )
                      .map((follow) => (
                        <p key={follow.id}>
                          {formatTime(follow.evidence.time)} · {follow.note}
                          <small className="block">
                            Coach assessment: {follow.status}
                          </small>
                        </p>
                      ))}
                  </div>
                ))}
              {!data.findings.some(
                (f) =>
                  f.subject === "vince" &&
                  (f.evidence.sessionId === session.id ||
                    f.followups.some(
                      (follow) => follow.evidence.sessionId === session.id,
                    )),
              ) && (
                <CampEmpty>
                  No timestamped findings linked to this session.
                </CampEmpty>
              )}
            </div>
          ))}
        </div>
      ) : (
        <CampEmpty>
          Choose two different sessions from the same discipline. Opponent-only
          footage is excluded from Vince’s development comparison.
        </CampEmpty>
      )}
    </section>
  );
}
