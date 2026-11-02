import { useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crosshair,
  FileVideo,
  LockKeyhole,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type {
  AnalysisConfiguration,
  AnalysisStatus,
  FighterIdentification,
} from "../domain/contracts";
import {
  analysisTypes,
  metricsFor,
  rulesetLabels,
  type Ruleset,
} from "../domain/metrics";
import { formatTime } from "../domain/video";
import type { SavedDraft } from "../services/storage";
import { VideoPicker } from "./VideoPicker";
import type { LocalVideo } from "../domain/video";
import { Notice, PageHeading, Tag } from "./ui";
const steps = [
  { label: "Upload footage", icon: FileVideo },
  { label: "Identify fighter", icon: Crosshair },
  { label: "Configure analysis", icon: SlidersHorizontal },
  { label: "Review & generate", icon: Sparkles },
];
const methods = [
  ["red", "Red corner", "Corner assignment, not clothing color."],
  ["blue", "Blue corner", "Corner assignment, not clothing color."],
  ["left", "Initially on the left", "Position at the start of this footage."],
  ["right", "Initially on the right", "Position at the start of this footage."],
  ["manual", "Manual identification", "Mark a frame or describe your fighter."],
] as const;
interface Props {
  draft: SavedDraft;
  update: (patch: Partial<SavedDraft>) => void;
  video: LocalVideo | null;
  maxMB: number;
  videoError: string;
  onSelect: (f: File) => void;
  onReady: (d: number) => void;
  onVideoError: (s: string) => void;
  onRemove: () => void;
  frame?: FighterIdentification["frame"];
  onFrame: (f: FighterIdentification["frame"]) => void;
  status: AnalysisStatus;
  error: string;
  onSubmit: () => void;
  validateStep: (step: number) => string | undefined;
  onError: (s: string) => void;
}
export function Workflow(p: Props) {
  const { draft: d, update, video } = p;
  const player = useRef<HTMLVideoElement>(null);
  const next = () => {
    const error = p.validateStep(d.step);
    if (error) {
      p.onError(error);
      return;
    }
    p.onError("");
    update({ step: Math.min(4, d.step + 1) });
  };
  const config = {
    discipline: d.discipline,
    type: d.type,
    fighter: {
      name: d.fighterName,
      method: d.method,
      notes: d.notes,
      frame: p.frame,
    },
    ruleset: d.discipline === "kickboxing" ? d.ruleset : undefined,
    rulesetNotes: d.rulesetNotes,
  } as AnalysisConfiguration;
  return (
    <>
      <PageHeading
        eyebrow="THE ANALYSIS WORKSPACE"
        title="A closer look. A clearer path."
      >
        Set your perspective in four steps. Your setup stays with you as you
        move.
      </PageHeading>
      <ol className="stepper" aria-label="Analysis progress">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className={`${d.step === i + 1 ? "active" : ""} ${d.step > i + 1 ? "done" : ""}`}
          >
            <button
              disabled={i + 1 > d.step}
              onClick={() => {
                p.onError("");
                update({ step: i + 1 });
              }}
              aria-current={d.step === i + 1 ? "step" : undefined}
            >
              <span>
                {d.step > i + 1 ? (
                  <Check size={18} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <div>
                <small>STEP {i + 1}</small>
                <strong>{s.label}</strong>
              </div>
            </button>
          </li>
        ))}
      </ol>
      <div className="workflow-layout">
        <section className="panel workflow-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">STEP 0{d.step} / 04</p>
              <h2>{steps[d.step - 1].label}</h2>
            </div>
            <Tag accent>{d.discipline.toUpperCase()}</Tag>
          </div>
          {p.error && (
            <Notice tone={p.status === "unavailable" ? "info" : "error"}>
              {p.error}
            </Notice>
          )}
          {d.step === 1 && (
            <VideoPicker
              video={video}
              maxMB={p.maxMB}
              error={p.videoError}
              onSelect={p.onSelect}
              onReady={p.onReady}
              onError={p.onVideoError}
              onRemove={p.onRemove}
            />
          )}
          {d.step === 2 && (
            <div className="form-stack">
              <label>
                Fighter name or identifier
                <input
                  value={d.fighterName}
                  maxLength={120}
                  onChange={(e) => update({ fighterName: e.target.value })}
                  placeholder="e.g. Alex / athlete 01"
                  autoComplete="off"
                />
              </label>
              <fieldset>
                <legend>Who are we evaluating?</legend>
                <div className="selection-grid">
                  {methods.map(([value, label, description]) => (
                    <label
                      key={value}
                      className={`selection-card ${d.method === value ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="fighter"
                        value={value}
                        checked={d.method === value}
                        onChange={() => {
                          update({ method: value });
                          p.onFrame(undefined);
                        }}
                      />
                      <div>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Notice>
                Corner and screen position are identification hints, not
                verified tracking. Fighters change sides; automatic identity
                tracking is not connected.
              </Notice>
              {d.method === "manual" && video?.ready && (
                <div>
                  <h3>Mark a representative frame</h3>
                  <p className="muted">
                    Pause the footage, then tap or click your fighter. A
                    normalized point and video time are saved as a reference;
                    this does not track the fighter.
                  </p>
                  <div className="frame-picker">
                    <video
                      ref={player}
                      controls
                      playsInline
                      src={video.url}
                      aria-label="Fighter identification video"
                    />
                    <button
                      className="frame-overlay"
                      aria-label="Mark fighter in paused video"
                      onClick={(e) => {
                        const v = player.current;
                        if (!v || v.readyState < 2) return;
                        p.onError("");
                        v.pause();
                        const box = v.getBoundingClientRect();
                        p.onFrame({
                          time: v.currentTime,
                          x: (e.clientX - box.left) / box.width,
                          y: (e.clientY - box.top) / box.height,
                        });
                      }}
                    >
                      {p.frame && (
                        <span
                          className="frame-point"
                          style={{
                            left: `${p.frame.x * 100}%`,
                            top: `calc(${p.frame.y * 100}% + ${52 * p.frame.y}px)`,
                          }}
                        >
                          +
                        </span>
                      )}
                    </button>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => {
                      const v = player.current;
                      if (v && v.readyState >= 2) {
                        v.pause();
                        p.onFrame({ time: v.currentTime, x: 0.5, y: 0.5 });
                      }
                    }}
                  >
                    Use current frame center
                  </button>
                  {p.frame && (
                    <p className="success-text">
                      Reference selected at {formatTime(p.frame.time)}. Point
                      saved; identity unverified.
                    </p>
                  )}
                </div>
              )}
              <label>
                Identification notes{" "}
                <span className="muted">
                  {d.method === "manual"
                    ? "(required if no frame selected)"
                    : "(optional)"}
                </span>
                <textarea
                  maxLength={2000}
                  rows={3}
                  value={d.notes}
                  onChange={(e) => update({ notes: e.target.value })}
                  placeholder="Glove color, shorts, equipment, or other visible identifying details…"
                />
              </label>
            </div>
          )}
          {d.step === 3 && (
            <div className="form-stack">
              <fieldset>
                <legend>Discipline</legend>
                <div className="segmented inline">
                  {(["boxing", "kickboxing"] as const).map((x) => (
                    <button
                      key={x}
                      aria-pressed={d.discipline === x}
                      onClick={() =>
                        update({
                          discipline: x,
                          ruleset: "k1",
                          rulesetNotes: "",
                        })
                      }
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </fieldset>
              {d.discipline === "kickboxing" && (
                <>
                  <label>
                    Competitive ruleset
                    <select
                      value={d.ruleset}
                      onChange={(e) =>
                        update({
                          ruleset: e.target.value as Ruleset,
                          rulesetNotes: "",
                        })
                      }
                    >
                      {Object.entries(rulesetLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {d.ruleset === "custom"
                      ? "Describe permitted techniques and restrictions"
                      : "Ruleset clarification (optional)"}
                    <textarea
                      rows={2}
                      value={d.rulesetNotes}
                      maxLength={2000}
                      onChange={(e) => update({ rulesetNotes: e.target.value })}
                      placeholder="Specify local variations, knee or clinch restrictions, and legal targets."
                    />
                  </label>
                  <p className="subtle-note">
                    Knees are enabled only for K-1 style. Checks are not
                    assessed under full-contact or unspecified custom rules. A
                    future engine must verify the exact competition rules before
                    scoring.
                  </p>
                </>
              )}
              <fieldset>
                <legend>Analysis focus</legend>
                <div className="selection-grid">
                  {Object.entries(analysisTypes).map(([value, label]) => (
                    <label
                      className={`selection-card ${d.type === value ? "selected" : ""}`}
                      key={value}
                    >
                      <input
                        type="radio"
                        name="type"
                        value={value}
                        checked={d.type === value}
                        onChange={() =>
                          update({ type: value as SavedDraft["type"] })
                        }
                      />
                      <strong>{label}</strong>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <h3>Your technical dimensions</h3>
                <div className="metric-chips">
                  {metricsFor(d.discipline, d.ruleset).map((m) => (
                    <span
                      className={!m.applicable ? "not-applicable" : ""}
                      key={m.id}
                      title={m.description}
                    >
                      {m.label}
                      {!m.applicable ? " · N/A" : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          {d.step === 4 && (
            <div className="form-stack">
              <div className="review-summary">
                <h3>Ready for a new perspective.</h3>
                <dl>
                  <div>
                    <dt>Footage</dt>
                    <dd>{video?.asset.name ?? "No footage selected"}</dd>
                  </div>
                  <div>
                    <dt>Fighter</dt>
                    <dd>
                      {d.fighterName || "Not identified"}
                      {d.method &&
                        ` · ${methods.find((m) => m[0] === d.method)?.[1]}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Discipline</dt>
                    <dd className="capitalize">
                      {d.discipline}
                      {d.discipline === "kickboxing"
                        ? ` · ${rulesetLabels[d.ruleset]}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Focus</dt>
                    <dd>{analysisTypes[config.type]}</dd>
                  </div>
                  <div>
                    <dt>Identity tracking</dt>
                    <dd>Not verified</dd>
                  </div>
                  <div>
                    <dt>File status</dt>
                    <dd>
                      {video?.ready
                        ? "Local preview ready · Not uploaded"
                        : "Select footage again"}
                    </dd>
                  </div>
                </dl>
              </div>
              <Notice>
                The analysis engine requires integration. You can validate this
                setup, but no video will be uploaded and no assessment will be
                generated.
              </Notice>
              <button
                className="button full"
                disabled={["uploading", "queued", "processing"].includes(
                  p.status,
                )}
                onClick={p.onSubmit}
              >
                <Sparkles size={18} />{" "}
                {["uploading", "queued", "processing"].includes(p.status)
                  ? "Submitting…"
                  : "Generate performance analysis"}
              </button>
              <p className="subtle-note">
                No provider keys or paid services are configured. Your setup is
                preserved if submission is unavailable.
              </p>
            </div>
          )}
          <div className="workflow-actions">
            <button
              className="button secondary"
              disabled={d.step === 1}
              onClick={() => {
                p.onError("");
                update({ step: d.step - 1 });
              }}
            >
              <ArrowLeft size={16} /> Back
            </button>
            {d.step < 4 && (
              <button className="button" onClick={next}>
                Continue <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>
        <aside className="workflow-aside">
          <div className="panel">
            <Crosshair className="blue" size={25} />
            <h3>
              Clarity starts
              <br />
              with good footage.
            </h3>
            <ul className="tips-list">
              <li>Keep both fighters visible.</li>
              <li>Use stable, well-lit footage.</li>
              <li>Include the full exchange, with entries and exits.</li>
              <li>Identify your fighter with specific, visible details.</li>
            </ul>
          </div>
          <div className="aside-note">
            <LockKeyhole size={18} />
            <div>
              <strong>Your local workspace</strong>
              <p>
                Configuration is saved in this browser. Footage stays in memory
                for this session. There is no account or cloud storage yet.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
