import {
  ArrowRight,
  Crosshair,
  FileVideo,
  ScanLine,
  ShieldCheck,
  Target,
  Timer,
  TrendingUp,
} from "lucide-react";
import type { CompletedAnalysisReport } from "../domain/contracts";
import { gradeFor, metricsFor, type Discipline } from "../domain/metrics";
import { Progression } from "./Progression";
import { ActionLink, EmptyState, SectionTitle, Tag } from "./ui";
export function Dashboard({
  discipline,
  reports,
  hasDraft,
}: {
  discipline: Discipline;
  reports: CompletedAnalysisReport[];
  hasDraft: boolean;
}) {
  const recent = [...reports]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, 3);
  return (
    <>
      <div className="dashboard-intro">
        <p className="eyebrow">
          <span />
          THE PERFORMANCE WORKSPACE
        </p>
        <span className="muted tiny">PRECISION IN EVERY EXCHANGE</span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span className="live-dot" /> IDENTIFIER Q /{" "}
            {discipline.toUpperCase()}
          </div>
          <h1>
            Every movement
            <br />
            tells a <em>story.</em>
          </h1>
          <p>
            Upload your footage. Identify your fighter. Discover the strengths,
            weaknesses, and opportunities hidden inside your performance.
          </p>
          <div className="hero-actions">
            <ActionLink href="#/new">Start new analysis</ActionLink>
            <a className="quiet-link" href="#/history">
              View previous analyses <ArrowRight size={16} />
            </a>
          </div>
          <div className="hero-note">
            <ShieldCheck size={15} /> Evidence first. Improvement by design.
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-grid" />
          <div className="ring ring-one" />
          <div className="ring ring-two" />
          <svg className="fighter-art" viewBox="0 0 380 410" fill="none">
            <path
              d="M197 67C181 63 172 76 170 91C168 107 178 123 192 125C211 128 222 108 218 89C215 76 208 69 197 67Z"
              fill="#34465B"
              stroke="#6B8DB2"
            />
            <path
              d="M175 124L150 145L127 206L150 227L174 185L182 227L165 268L147 346L171 350L198 284L207 249L230 288L252 348L278 343L257 273L231 218L226 169L244 150L231 130L205 153L191 144Z"
              fill="#223448"
              stroke="#6B8DB2"
              strokeWidth="2"
            />
            <path
              d="M174 166L194 181L230 159L253 135L239 115L211 142L186 146Z"
              fill="#34465B"
              stroke="#88A5C4"
              strokeWidth="2"
            />
            <path
              d="M139 160L154 141L167 122L157 101L138 108L123 139L112 168L126 192L143 183Z"
              fill="#34465B"
              stroke="#88A5C4"
              strokeWidth="2"
            />
            <path
              d="M239 115L240 100L254 94L269 105L269 120L254 136Z"
              fill="#3B9DFF"
            />
            <path
              d="M141 108L138 94L147 82L161 83L173 96L166 113L157 120Z"
              fill="#3B9DFF"
            />
            <path
              d="M151 352L134 364L137 371L178 371L178 353M255 349L252 367L293 367L290 357L277 346"
              fill="#111C29"
              stroke="#6B8DB2"
            />
            <path
              d="M192 122L194 143M177 198L226 198M166 265L196 277M234 263L255 275"
              stroke="#5C7897"
            />
            <g stroke="#3B9DFF" strokeWidth="1.5">
              <path d="M104 72V53H123M269 53H288V72M104 344V363H123M269 363H288V344" />
              <path d="M89 201H307" strokeDasharray="3 7" opacity=".5" />
            </g>
            <g fill="#3B9DFF">
              <circle cx="194" cy="88" r="3" />
              <circle cx="184" cy="154" r="3" />
              <circle cx="221" cy="201" r="3" />
              <circle cx="198" cy="275" r="3" />
            </g>
          </svg>
          <div className="visual-label label-top">
            <span className="crosshair-mini">+</span> MOVEMENT. DECODED.
          </div>
          <div className="visual-label label-bottom">
            DESIGNED FOR THE DETAILS<span>FE / IQ—01</span>
          </div>
          <div className="visual-caption">
            ILLUSTRATION · NOT ANALYZED FOOTAGE
          </div>
        </div>
      </section>
      <div className="status-grid">
        <div className="status-card">
          <span className="stat-icon">
            <Crosshair />
          </span>
          <div>
            <span className="muted tiny">ACTIVE DISCIPLINE</span>
            <strong className="capitalize">{discipline}</strong>
            <small>{metricsFor(discipline).length} technical dimensions</small>
          </div>
          <Tag accent>SELECTED</Tag>
        </div>
        <div className="status-card">
          <span className="stat-icon">
            <FileVideo />
          </span>
          <div>
            <span className="muted tiny">COMPLETED ASSESSMENTS</span>
            <strong>{reports.length.toString().padStart(2, "0")}</strong>
            <small>
              {reports.length
                ? "Saved on this browser"
                : "Your first perspective starts here"}
            </small>
          </div>
        </div>
        <div className="status-card">
          <span className="stat-icon">
            <ScanLine />
          </span>
          <div>
            <span className="muted tiny">ANALYSIS ENGINE</span>
            <strong className="engine-status">Integration required</strong>
            <small>Local setup & video review available</small>
          </div>
          <span className="status-amber" />
        </div>
      </div>
      <div className="dashboard-columns">
        <section className="panel recent-panel">
          <SectionTitle
            title="Your analysis library"
            label="THE WORK IN PROGRESS"
            action={
              <a href="#/history" className="quiet-link">
                View all <ArrowRight size={16} />
              </a>
            }
          />
          {!recent.length ? (
            <EmptyState
              title="Your next level starts with a closer look."
              action={
                <ActionLink href="#/new" secondary>
                  {hasDraft
                    ? "Continue your setup"
                    : "Set up your first analysis"}
                </ActionLink>
              }
            >
              Your completed assessments will appear here. Start with a clear
              clip of your boxing or kickboxing footage.
            </EmptyState>
          ) : (
            <div className="report-list">
              {recent.map((r) => (
                <a
                  className="report-row"
                  href={`#/report/${encodeURIComponent(r.id)}`}
                  key={r.id}
                >
                  <span className="report-glyph">
                    <FileVideo />
                  </span>
                  <div>
                    <strong>{r.configuration.fighter.name}</strong>
                    <small>
                      {r.configuration.discipline} ·{" "}
                      {new Date(r.completedAt).toLocaleDateString()}
                    </small>
                  </div>
                  <span className="grade-small">
                    {gradeFor(r.assessment.score)}
                  </span>
                  <ArrowRight size={18} />
                </a>
              ))}
            </div>
          )}
        </section>
        <section className="panel approach-panel">
          <p className="eyebrow">FROM FOOTAGE TO FOCUS</p>
          <h2>
            A sharper way <br />
            to see your game.
          </h2>
          <ol className="approach-list">
            <li>
              <span>01</span>
              <div>
                <h3>Bring the footage</h3>
                <p>A full bout or a focused training clip.</p>
              </div>
              <FileVideo size={18} />
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Define your perspective</h3>
                <p>Your fighter. Your discipline. Your focus.</p>
              </div>
              <Target size={18} />
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Turn evidence into action</h3>
                <p>Linked observations and a clear path forward.</p>
              </div>
              <TrendingUp size={18} />
            </li>
          </ol>
          <div className="subtle-note">
            <Timer size={16} /> Automated assessments require a connected
            analysis engine.
          </div>
        </section>
      </div>
      <Progression reports={reports} />
      <footer className="dashboard-footer">
        <span>
          FEINT ENGINEERING <b>/</b> IDENTIFIER Q
        </span>
        <span>Understand the fight. Engineer the improvement.</span>
      </footer>
    </>
  );
}
