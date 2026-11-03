import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { EngineConnection, type EngineState } from "./EngineConnection";
import type { Preferences } from "../services/storage";
import { Notice, PageHeading, SectionTitle } from "./ui";
export function Settings({
  preferences,
  onSave,
  onClear,
  onExport,
  engine,
  onConnect,
  onDisconnect,
  busy,
}: {
  preferences: Preferences;
  engine: EngineState;
  onConnect: (url: string, token: string) => Promise<void>;
  onDisconnect: () => void;
  busy: boolean;
  onSave: (p: Preferences) => void;
  onClear: () => void;
  onExport: () => void;
}) {
  const [limit, setLimit] = useState(String(preferences.maxFileMB));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE PREFERENCES"
        title="Built around your process."
      >
        Manage this browser’s workspace, footage limits, and local data.
      </PageHeading>
      <div className="settings-grid">
        <section className="panel">
          <SectionTitle title="Analysis preferences" label="YOUR DEFAULTS" />
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(limit);
              if (!Number.isInteger(n) || n < 10 || n > 2048) {
                setError(
                  "Choose a whole-number file limit from 10 to 2048 MB.",
                );
                return;
              }
              setError("");
              onSave({ ...preferences, maxFileMB: n });
              setSaved(true);
            }}
          >
            <label>
              Preferred discipline
              <select
                value={preferences.discipline}
                onChange={(e) =>
                  onSave({
                    ...preferences,
                    discipline: e.target.value as Preferences["discipline"],
                  })
                }
              >
                <option value="boxing">Boxing</option>
                <option value="kickboxing">Kickboxing</option>
              </select>
            </label>
            <p className="subtle-note">
              Changing the preference updates your unsubmitted setup and resets
              kickboxing rules. Existing reports always retain their original
              discipline.
            </p>
            <label>
              Maximum local footage size (MB)
              <input
                type="number"
                min="10"
                max="2048"
                value={limit}
                onChange={(e) => {
                  setLimit(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <p className="subtle-note">
              Default: 500 MB. Large files can exceed device memory. The pilot
              backend enforces a separate 100 MB upload limit.
            </p>
            {error && <Notice tone="error">{error}</Notice>}
            {saved && (
              <Notice tone="success">
                Preferences updated for this session. Browser save failures
                appear above.
              </Notice>
            )}
            <button className="button" type="submit">
              Save preferences
            </button>
          </form>
        </section>
        <EngineConnection
          engine={engine}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          disabled={busy}
        />
        <section className="panel">
          <SectionTitle
            title="Your data, on this device"
            label="STORAGE & RETENTION"
          />
          <div className="form-stack">
            <p>
              Report JSON, analysis setup, and preferences are stored in
              localStorage. Video files are held in memory only. The frame
              reference is session-only and must be confirmed after reload.
            </p>
            <p className="muted">
              Anyone using this browser profile can access this library.
              Clearing site data removes saved records. There is no cloud
              backup, authenticated ownership, or additional application-level
              encryption.
            </p>
            <button className="button secondary" onClick={onExport}>
              <Download size={17} /> Export raw workspace backup
            </button>
            <button
              className="button secondary danger-text"
              onClick={() => setConfirm(true)}
            >
              Clear this browser’s workspace
            </button>
            {confirm && (
              <Notice>
                <p>
                  Delete local reports, preferences, and the unfinished setup?
                  Export a backup first. This cannot be undone.
                </p>
                <div className="inline-actions">
                  <button
                    className="button danger"
                    onClick={() => {
                      onClear();
                      setConfirm(false);
                    }}
                  >
                    Delete local data
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setConfirm(false)}
                  >
                    Keep data
                  </button>
                </div>
              </Notice>
            )}
          </div>
        </section>
        <section className="panel">
          <a className="quiet-link" href="#/about">
            About Feint Labs →
          </a>
          <ShieldCheck className="blue" size={26} />
          <h2>Evidence is the standard.</h2>
          <p>
            Identifier Q never substitutes generated numbers for an assessment.
            Scores, event timings, findings, and drills require a real analysis
            source.
          </p>
          <p className="muted">
            The report reader validates structure and references. It cannot
            independently verify an imported source’s factual claims.
          </p>
          <a className="quiet-link" href="#/new">
            Prepare your first analysis →
          </a>
        </section>
      </div>
    </>
  );
}
