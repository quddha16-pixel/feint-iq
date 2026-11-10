import { useState } from "react";
import { Notice, SectionTitle } from "./ui";
export interface EngineState {
  connected: boolean;
  available: boolean;
  message: string;
}
export function EngineConnection({
  engine,
  onConnect,
  onDisconnect,
  disabled = false,
}: {
  engine: EngineState;
  onConnect: (url: string, token: string) => Promise<void>;
  onDisconnect: () => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="panel">
      <SectionTitle title="Analysis backend" label="PRIVATE PILOT CONNECTION" />
      <Notice>
        {engine.connected
          ? engine.message
          : "Local workspace available. A separately hosted analysis backend is required for live processing."}
      </Notice>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || disabled) return;
          setBusy(true);
          setError("");
          try {
            await onConnect(url, token);
            setToken("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Connection failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Backend URL
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-analysis-backend.example"
            required
            disabled={disabled || busy}
          />
        </label>
        <label>
          Pilot session access token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
            minLength={32}
            disabled={disabled || busy}
          />
        </label>
        <p className="subtle-note">
          Enter a backend session token, never a Gemini API key. The token stays
          in memory until disconnect or reload; it is not saved in browser
          storage or the Pages bundle.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="inline-actions">
          <button className="button" disabled={busy || disabled}>
            {busy ? "Checking backend…" : "Connect backend"}
          </button>
          {engine.connected && (
            <button
              className="button secondary"
              type="button"
              disabled={disabled}
              onClick={() => {
                onDisconnect();
                setToken("");
                setError("");
              }}
            >
              Disconnect
            </button>
          )}
        </div>
      </form>
      <p className="subtle-note">
        The pilot supports boxing clips from 10 seconds to 5 minutes, up to 25
        MiB, and requires an identity confirmation frame. On explicit
        submission, your clip goes to the backend and sampled frames go to its
        configured provider. Keep this tab open and your phone unlocked until
        analysis finishes. No account is created. Provider access and
        real-footage quality still need validation.
      </p>
    </section>
  );
}
