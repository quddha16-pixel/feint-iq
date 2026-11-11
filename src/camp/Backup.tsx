import { useState } from "react";
import type { Camp } from "./model";
import { CAMP_KEY, parseBackup } from "./storage";
import {
  downloadJSON,
  DRAFT_KEY,
  REPORTS_KEY,
  PREFERENCE_KEY,
} from "../services/storage";
import { Notice } from "../components/ui";
export function CampBackup({
  data,
  commit,
}: {
  data: Camp;
  commit: (d: Camp, recovery?: boolean) => boolean;
}) {
  const [candidate, setCandidate] = useState<Camp | null>(null);
  const [error, setError] = useState("");
  const rawBackup = () => {
    try {
      downloadJSON(
        {
          format: "identifier-q-raw-recovery",
          exportedAt: new Date().toISOString(),
          raw: Object.fromEntries(
            [CAMP_KEY, DRAFT_KEY, REPORTS_KEY, PREFERENCE_KEY].map((key) => [
              key,
              localStorage.getItem(key),
            ]),
          ),
        },
        "identifier-q-raw-recovery.json",
      );
      return true;
    } catch {
      setError(
        "Browser storage could not be read. Recovery was stopped; no data was overwritten.",
      );
      return false;
    }
  };
  return (
    <section className="panel">
      <p className="eyebrow">RECOVERY BEFORE REPLACEMENT</p>
      <h2>Camp backup & restore</h2>
      <p>
        Camp data stays in this browser profile. It is not encrypted or
        synchronized. Use only a trusted device. Videos and provider secrets are
        never included.
      </p>
      <div className="inline-actions">
        <button
          className="button secondary"
          onClick={() =>
            downloadJSON(
              { format: "identifier-q-camp", version: 1, workspace: data },
              "identifier-q-camp.json",
            )
          }
        >
          Export camp backup
        </button>
        <button className="button secondary" onClick={rawBackup}>
          Export raw recovery backup
        </button>
      </div>
      <label className="backup-input">
        Restore camp backup
        <input
          aria-label="Restore camp backup"
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError("");
            setCandidate(null);
            try {
              if (file.size > 5 * 1024 * 1024)
                throw new Error("Backup exceeds 5 MiB.");
              setCandidate(parseBackup(await file.text()));
            } catch {
              setError(
                "Invalid camp backup. Nothing was changed. Use an exported identifier-q-camp version 1 backup under 5 MiB.",
              );
            }
          }}
        />
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      {candidate && (
        <Notice>
          <p>
            Replace this browser’s camp workspace with{" "}
            {candidate.sessions.length} sessions and {candidate.findings.length}{" "}
            findings? A raw recovery backup will download first. Existing
            analysis reports and preferences are preserved. Keep that downloaded
            file for recovery.
          </p>
          <div className="inline-actions">
            <button
              className="button"
              onClick={() => {
                if (rawBackup() && commit(candidate, true)) setCandidate(null);
              }}
            >
              Download recovery and replace camp
            </button>
            <button
              className="button secondary"
              onClick={() => setCandidate(null)}
            >
              Cancel restore
            </button>
          </div>
        </Notice>
      )}
      <p className="subtle-note">
        Raw recovery files preserve original storage strings and need manual
        recovery; they are not accepted by the camp restore control. No
        automatic migrations or deletion occur.
      </p>
    </section>
  );
}
