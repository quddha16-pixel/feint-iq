import type { Camp, Finding } from "./model";
import { RecordForm, CampEmpty, type Field } from "./ui";
import { PageHeading } from "../components/ui";
import { formatTime } from "../domain/video";
import { CompareSessions } from "./CompareSessions";
const fields: Field[] = [
  {
    key: "subject",
    label: "Finding subject",
    options: [
      ["vince", "Vince"],
      ["opponent", "Opponent"],
    ],
  },
  {
    key: "kind",
    label: "Evidence classification",
    options: [
      ["observation", "Visible observation — coach reviewed"],
      ["hypothesis", "Hypothesis — unverified interpretation"],
    ],
  },
  {
    key: "category",
    label: "Technical principle",
    options: [
      "distance",
      "timing",
      "feints",
      "defense",
      "balance",
      "combinations",
      "footwork",
      "tactics",
    ].map((s) => [s, s]),
  },
  {
    key: "priority",
    label: "Coaching priority",
    options: [
      ["high", "High"],
      ["medium", "Medium"],
      ["low", "Low"],
    ],
  },
  {
    key: "time",
    label: "Evidence start (seconds)",
    type: "number",
    required: true,
  },
  { key: "end", label: "Evidence end (seconds, optional)", type: "number" },
  ...[
    ["context", "Evidence sequence / what is visible"],
    ["observation", "Observation — what visibly happened"],
    ["diagnosis", "Diagnosis — why it matters"],
    ["consequence", "Consequence — vulnerability or opportunity"],
    ["correction", "Correction — what should change"],
    ["drill", "Training application — specific drill and dosage"],
  ].map(([key, label]) => ({
    key,
    label,
    required: true,
    type: "textarea" as const,
  })),
];
const empty = {
  subject: "vince",
  kind: "observation",
  category: "distance",
  priority: "high",
  sessionId: "",
  time: "",
  end: "",
  context: "",
  observation: "",
  diagnosis: "",
  consequence: "",
  correction: "",
  drill: "",
};
function formValues(f: Finding) {
  const evidence = f.evidence;
  const values = Object.fromEntries(
    Object.entries(f).filter(([, value]) => typeof value === "string"),
  );
  return {
    ...empty,
    ...values,
    ...evidence,
    time: String(evidence.time),
    end: evidence.end === null ? "" : String(evidence.end),
  };
}
export function Development({
  data,
  commit,
}: {
  data: Camp;
  commit: (d: Camp) => boolean;
}) {
  const sessionField: Field = {
    key: "sessionId",
    label: "Source session",
    options: [
      ["", "Select a documented source"],
      ...data.sessions.map((s): [string, string] => [
        s.id,
        `${s.date} / ${s.title} / ${s.round || s.kind}`,
      ]),
    ],
  };
  const saveFinding = (v: Record<string, string>, current?: Finding) => {
    const finding = {
      ...empty,
      ...v,
      id: current?.id ?? crypto.randomUUID(),
      evidence: {
        sessionId: v.sessionId,
        time: v.time === "" ? NaN : Number(v.time),
        end: v.end === "" ? null : Number(v.end),
        context: v.context,
      },
      followups: current?.followups ?? [],
    } as Finding;
    return commit({
      ...data,
      findings: current
        ? data.findings.map((f) => (f.id === current.id ? finding : f))
        : [...data.findings, finding],
    });
  };
  return (
    <>
      <PageHeading
        eyebrow="LONGITUDINAL DEVELOPMENT"
        title="Evidence. Diagnosis. Action."
      >
        Track recurring problems and documented improvements across sessions.
        Every conclusion stays linked to its source.
      </PageHeading>
      <div className="camp-stat-strip">
        <span>
          {data.findings.filter((f) => f.subject === "vince").length} Vince
          findings
        </span>
        <span>
          {data.findings.filter((f) => f.subject === "opponent").length}{" "}
          opponent findings
        </span>
        <span>No inferred performance percentages</span>
      </div>
      <CompareSessions data={data} />
      <section className="panel">
        <h2>Document a coaching finding</h2>
        <p className="muted">
          Coach-entered evidence, not AI output. Separate visible events from
          tactical hypotheses. Record uncertainty and replay exclusions in the
          sequence notes. Reattach the original footage in the analysis center
          to verify timestamps.
        </p>
        {!data.sessions.length ? (
          <CampEmpty>
            Record a source session in the analysis center before documenting a
            finding.
          </CampEmpty>
        ) : (
          <RecordForm
            initial={empty}
            fields={[sessionField, ...fields]}
            label="Save coaching finding"
            submit={(v) => saveFinding(v)}
          />
        )}
      </section>
      <section className="panel">
        <h2>Technical development log</h2>
        {!data.findings.length && (
          <CampEmpty>
            No technical conclusions yet. Review actual footage and document a
            complete evidence chain.
          </CampEmpty>
        )}
        {data.findings.map((f) => {
          const source = data.sessions.find(
            (s) => s.id === f.evidence.sessionId,
          );
          const latest = f.followups.at(-1);
          return (
            <article className="finding-card" key={f.id}>
              <div className="finding-top">
                <span
                  className={`tag ${f.kind === "hypothesis" ? "" : "accent"}`}
                >
                  {f.kind === "hypothesis"
                    ? "HYPOTHESIS · UNVERIFIED"
                    : "COACH OBSERVATION"}
                </span>
                <span className="tag">
                  {f.subject} · {f.priority} priority
                </span>
              </div>
              <h3>{f.observation}</h3>
              <p className="evidence-link">
                {source?.title} · {source?.round || "Round not set"} ·{" "}
                {formatTime(f.evidence.time)}
                {f.evidence.end === null
                  ? ""
                  : `–${formatTime(f.evidence.end)}`}
              </p>
              <p className="muted">{f.evidence.context}</p>
              <dl className="finding-chain">
                {[
                  ["Diagnosis", f.diagnosis],
                  ["Consequence", f.consequence],
                  ["Correction", f.correction],
                  ["Training application", f.drill],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <details>
                <summary>Edit finding</summary>
                <RecordForm
                  initial={formValues(f)}
                  fields={[sessionField, ...fields]}
                  label="Update coaching finding"
                  submit={(v) => saveFinding(v, f)}
                />
              </details>
              <div className="followup-heading">
                <h4>Follow-up evidence</h4>
                <span className="tag">
                  {latest?.status ?? "Not reviewed again"}
                </span>
              </div>
              {f.followups.map((follow) => (
                <p className="followup-note" key={follow.id}>
                  <strong>{follow.status}</strong> ·{" "}
                  {
                    data.sessions.find(
                      (s) => s.id === follow.evidence.sessionId,
                    )?.title
                  }{" "}
                  · {formatTime(follow.evidence.time)}
                  <br />
                  {follow.note}
                  <small className="block">{follow.evidence.context}</small>
                </p>
              ))}
              <details>
                <summary>Add follow-up review</summary>
                <RecordForm
                  initial={{
                    sessionId: "",
                    time: "",
                    context: "",
                    status: "recurring",
                    note: "",
                  }}
                  label="Save follow-up evidence"
                  fields={[
                    sessionField,
                    {
                      key: "time",
                      label: "Follow-up timestamp (seconds)",
                      type: "number",
                      required: true,
                    },
                    {
                      key: "status",
                      label: "Coach’s development assessment",
                      options: [
                        ["recurring", "Recurring problem"],
                        ["improving", "Documented improvement"],
                        ["resolved", "Resolved in reviewed evidence"],
                      ],
                    },
                    {
                      key: "context",
                      label: "Visible follow-up sequence",
                      type: "textarea",
                      required: true,
                    },
                    {
                      key: "note",
                      label: "What changed or persisted",
                      type: "textarea",
                      required: true,
                    },
                  ]}
                  submit={(v) =>
                    commit({
                      ...data,
                      findings: data.findings.map((old) =>
                        old.id === f.id
                          ? {
                              ...old,
                              followups: [
                                ...old.followups,
                                {
                                  id: crypto.randomUUID(),
                                  status: v.status as
                                    "recurring" | "improving" | "resolved",
                                  evidence: {
                                    sessionId: v.sessionId,
                                    time: Number(v.time),
                                    end: null,
                                    context: v.context,
                                  },
                                  note: v.note,
                                },
                              ],
                            }
                          : old,
                      ),
                    })
                  }
                />
              </details>
            </article>
          );
        })}
      </section>
    </>
  );
}
