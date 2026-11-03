import { Crosshair, ScanLine, ShieldCheck } from "lucide-react";
import { ActionLink, PageHeading } from "./ui";
export function About() {
  return (
    <>
      <PageHeading
        eyebrow="FEINT LABS / ABOUT"
        title="A clearer view of combat performance."
      >
        Feint Labs is the parent innovation company behind Identifier Q.
      </PageHeading>
      <section className="panel about-intro">
        <p className="eyebrow">FOUNDED WITH PURPOSE</p>
        <h2>
          Technical understanding.
          <br />
          Practical improvement.
        </h2>
        <p>
          Feint Labs was founded by Quentin Warminsky, an undefeated combat
          sports coach with a vision to revolutionize combat sports through
          AI-powered technical analysis.
        </p>
        <p className="muted">
          Identifier Q brings that vision into a focused workspace for boxing
          and kickboxing. Its purpose is to help athletes and coaches connect
          observable technique with useful development priorities.
        </p>
        <ActionLink href="#/new">Use identifierQ</ActionLink>
      </section>
      <div className="about-principles">
        {[
          {
            icon: Crosshair,
            title: "Keep the athlete in focus",
            text: "Fighter identity must remain distinct from corner, clothing, or screen position. Reference frames support identification; they do not create automatic tracking.",
          },
          {
            icon: ScanLine,
            title: "Make the evidence visible",
            text: "Findings should link to their source footage. Sampled-frame locations are distinguished from exact event timing, and unavailable measurements remain unassessed.",
          },
          {
            icon: ShieldCheck,
            title: "Be precise about capability",
            text: "The interface, backend connection, and model validation are separate milestones. No scores or assessments are simulated.",
          },
        ].map((p) => (
          <section className="panel" key={p.title}>
            <p.icon className="blue" size={25} />
            <h3>{p.title}</h3>
            <p>{p.text}</p>
          </section>
        ))}
      </div>
    </>
  );
}
