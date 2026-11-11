import type { Camp } from "./model";
import { RecordForm, disciplines } from "./ui";
import { PageHeading } from "../components/ui";
export function Profile({
  data,
  commit,
}: {
  data: Camp;
  commit: (d: Camp) => boolean;
}) {
  return (
    <>
      <PageHeading eyebrow="THE ATHLETE" title="Vince’s technical profile">
        Coach-maintained details. Unknown attributes stay blank; nothing here is
        inferred automatically.
      </PageHeading>
      <section className="panel">
        <RecordForm
          initial={data.profile}
          label="Save fighter profile"
          fields={[
            { key: "name", label: "Fighter name", required: true },
            {
              key: "discipline",
              label: "Fighting discipline",
              options: disciplines,
            },
            { key: "stance", label: "Stance" },
            { key: "weightClass", label: "Weight class" },
            { key: "height", label: "Height, when known" },
            { key: "reach", label: "Reach, when known" },
            ...[
              ["strengths", "Technical strengths"],
              ["priorities", "Development priorities"],
              ["combinations", "Preferred combinations"],
              ["defense", "Defensive habits"],
              ["notes", "Coach observations"],
              ["fightHistory", "Fight history"],
            ].map(([key, label]) => ({
              key,
              label,
              type: "textarea" as const,
            })),
          ]}
          submit={(v) =>
            commit({ ...data, profile: { ...data.profile, ...v } })
          }
        />
      </section>
      <section className="panel">
        <h2>Sparring & session history</h2>
        <p>
          {data.sessions.filter((s) => s.kind === "sparring").length} sparring
          records documented. Session records and evidence are maintained in the
          analysis center.
        </p>
        <a className="quiet-link" href="#/analysis">
          Open session history ↗
        </a>
      </section>
    </>
  );
}
