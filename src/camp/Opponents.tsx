import { useState } from "react";
import type { Camp } from "./model";
import { RecordForm, CampEmpty } from "./ui";
import { PageHeading } from "../components/ui";
const blank = {
  name: "",
  stance: "",
  tendencies: "",
  offense: "",
  vulnerabilities: "",
  combinations: "",
  strategy: "",
  notes: "",
};
export function Opponents({
  data,
  commit,
}: {
  data: Camp;
  commit: (d: Camp) => boolean;
}) {
  const [selected, select] = useState("");
  const current = data.opponents.find((o) => o.id === selected);
  return (
    <>
      <PageHeading eyebrow="MATCHUP INTELLIGENCE" title="Opponent scouting">
        Build a documented picture of the matchup. Notes are coach assessments;
        evidence-linked findings live in Development.
      </PageHeading>
      <div className="inline-actions opponent-tabs">
        <button className="button secondary" onClick={() => select("")}>
          New opponent
        </button>
        {data.opponents.map((o) => (
          <button
            className={`button ${selected === o.id ? "" : "secondary"}`}
            key={o.id}
            onClick={() => select(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
      <div className="camp-grid">
        <section className="panel">
          <h2>
            {current ? `Edit ${current.name}` : "Create opponent profile"}
          </h2>
          <RecordForm
            key={selected}
            initial={current ?? blank}
            label="Save opponent"
            fields={[
              { key: "name", label: "Opponent name", required: true },
              { key: "stance", label: "Opponent stance" },
              ...[
                ["tendencies", "Technical tendencies"],
                ["offense", "Offensive patterns"],
                ["vulnerabilities", "Defensive vulnerabilities"],
                ["combinations", "Recurring combinations"],
                ["strategy", "Matchup strategy"],
                ["notes", "Source notes and uncertainty"],
              ].map(([key, label]) => ({
                key,
                label,
                type: "textarea" as const,
              })),
            ]}
            submit={(v) => {
              const next = {
                ...blank,
                ...v,
                id: current?.id ?? crypto.randomUUID(),
              };
              const saved = commit({
                ...data,
                opponents: current
                  ? data.opponents.map((o) => (o.id === current.id ? next : o))
                  : [...data.opponents, next],
              });
              if (saved) select(next.id);
              return saved;
            }}
          />
        </section>
        <section className="panel">
          <p className="eyebrow">SOURCE MATERIAL</p>
          <h2>Footage & evidence</h2>
          {current ? (
            <>
              {data.sessions
                .filter((s) => s.opponentId === current.id)
                .map((s) => (
                  <div className="camp-list-row" key={s.id}>
                    <strong>{s.title}</strong>
                    <small>
                      {s.date || "Date unknown"} ·{" "}
                      {s.footage || "No footage reference"}
                    </small>
                  </div>
                ))}
              {!data.sessions.some((s) => s.opponentId === current.id) && (
                <CampEmpty>
                  No footage or sessions linked to this opponent.
                </CampEmpty>
              )}
              <a className="quiet-link" href="#/analysis">
                Record opponent footage ↗
              </a>
            </>
          ) : (
            <CampEmpty>
              Save or select an opponent to see linked source records. No
              automated scouting has run.
            </CampEmpty>
          )}
          <p className="subtle-note">
            Notes do not become verified AI findings. Every coaching finding
            requires a source session, timestamp, diagnosis, consequence,
            correction and drill.
          </p>
        </section>
      </div>
    </>
  );
}
