import type { Camp } from "./model";
import { suggestGoal } from "./model";
import { RecordForm, CampEmpty } from "./ui";
import { PageHeading } from "../components/ui";
export function Plan({
  data,
  commit,
}: {
  data: Camp;
  commit: (d: Camp) => boolean;
}) {
  const opponentOptions: [string, string][] = [
    ["", "Not set"],
    ...data.opponents.map((o): [string, string] => [o.id, o.name]),
  ];
  return (
    <>
      <PageHeading eyebrow="PURPOSE IN EVERY SESSION" title="Fight camp plan">
        Coach-led objectives, sparring schedules, and opponent preparation.
        Drafts need your review.
      </PageHeading>
      <section className="panel">
        <h2>Camp details</h2>
        <RecordForm
          initial={data.camp}
          label="Save camp details"
          fields={[
            { key: "name", label: "Camp name" },
            {
              key: "status",
              label: "Camp status",
              options: [
                ["not-set", "Not set"],
                ["preparation", "Preparation"],
                ["in-camp", "In camp"],
                ["fight-week", "Fight week"],
                ["recovery", "Recovery"],
              ],
            },
            { key: "startDate", label: "Camp start date", type: "date" },
            { key: "fightDate", label: "Fight date", type: "date" },
            {
              key: "opponentId",
              label: "Next opponent",
              options: opponentOptions,
            },
            { key: "notes", label: "Coach’s camp notes", type: "textarea" },
          ]}
          submit={(v) => commit({ ...data, camp: { ...data.camp, ...v } })}
        />
      </section>
      <div className="camp-grid">
        <section className="panel">
          <h2>Add weekly objective</h2>
          <RecordForm
            initial={{
              week: "",
              title: "",
              focus: "",
              drill: "",
              opponentId: "",
              notes: "",
            }}
            label="Add training objective"
            fields={[
              {
                key: "week",
                label: "Week beginning",
                type: "date",
                required: true,
              },
              { key: "title", label: "Objective title", required: true },
              {
                key: "focus",
                label: "Technical development goal",
                type: "textarea",
                required: true,
              },
              {
                key: "drill",
                label: "Training application / drill",
                type: "textarea",
                required: true,
              },
              {
                key: "opponentId",
                label: "Opponent-specific preparation",
                options: opponentOptions,
              },
              {
                key: "notes",
                label: "Session schedule and coach notes",
                type: "textarea",
              },
            ]}
            submit={(v) =>
              commit({
                ...data,
                goals: [
                  ...data.goals,
                  {
                    id: crypto.randomUUID(),
                    week: v.week,
                    title: v.title,
                    focus: v.focus,
                    drill: v.drill,
                    opponentId: v.opponentId,
                    notes: v.notes,
                    findingId: "",
                    status: "planned",
                  },
                ],
              })
            }
          />
        </section>
        <section className="panel">
          <h2>From evidence to practice</h2>
          <p>
            Create a draft by copying a documented correction and drill. This is
            a transparent planning aid, not AI generation.
          </p>
          {data.findings
            .filter((f) => f.subject === "vince")
            .map((f) => (
              <div className="camp-list-row" key={f.id}>
                <strong>{f.correction}</strong>
                <p>{f.drill}</p>
                <button
                  className="button secondary"
                  onClick={() =>
                    commit({
                      ...data,
                      goals: [...data.goals, suggestGoal(f, "")],
                    })
                  }
                >
                  Draft objective from priority
                </button>
              </div>
            ))}
          {!data.findings.some((f) => f.subject === "vince") && (
            <CampEmpty>
              Document a coaching finding in Development to draft an
              evidence-linked objective.
            </CampEmpty>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>Weekly objectives & sparring schedule</h2>
        {!data.goals.length && (
          <CampEmpty>
            No objectives planned. Start with one technical priority and a
            concrete drill.
          </CampEmpty>
        )}
        {data.goals.map((g) => (
          <details className="objective-card" key={g.id}>
            <summary>
              <span className="tag">{g.status}</span> {g.title}{" "}
              <small>{g.week || "Week not assigned"}</small>
            </summary>
            <RecordForm
              initial={g}
              label="Update objective"
              fields={[
                {
                  key: "week",
                  label: "Objective week",
                  type: "date",
                  required: true,
                },
                { key: "title", label: "Training objective", required: true },
                {
                  key: "focus",
                  label: "Technical focus",
                  type: "textarea",
                  required: true,
                },
                {
                  key: "drill",
                  label: "Specific drill",
                  type: "textarea",
                  required: true,
                },
                {
                  key: "status",
                  label: "Objective status",
                  options: [
                    ["draft", "Draft — needs coach review"],
                    ["planned", "Approved / planned"],
                    ["completed", "Completed by coach"],
                  ],
                },
                {
                  key: "notes",
                  label: "Schedule / outcome notes",
                  type: "textarea",
                },
              ]}
              submit={(v) =>
                commit({
                  ...data,
                  goals: data.goals.map((old) =>
                    old.id === g.id ? { ...old, ...v } : old,
                  ),
                })
              }
            />
          </details>
        ))}
      </section>
    </>
  );
}
