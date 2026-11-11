import { useEffect, useState } from "react";
import { App } from "./App";
export function AccessBoundary() {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const [access, setAccess] = useState<"checking" | "allowed" | "blocked">(
    local ? "allowed" : "checking",
  );
  useEffect(() => {
    if (local) return;
    const abort = new AbortController();
    let active = true;
    const timer = setTimeout(() => abort.abort(), 10000);
    void fetch("/api/session", {
      credentials: "same-origin",
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (r) => {
        if (!r.ok || (await r.json()).authenticated !== true) throw new Error();
        if (active) setAccess("allowed");
      })
      .catch(() => {
        if (active) setAccess("blocked");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [local]);
  // This UI check is only an additional guard. The identity gateway protects
  // HTML, assets and APIs; client code can never make public hosting private.
  return access === "allowed" ? (
    <App privateHost={!local} />
  ) : (
    <main className="gateway-locked">
      <p className="eyebrow">FEINT ENGINEERING / IDENTIFIER Q</p>
      <h1>
        {access === "checking"
          ? "Checking camp access…"
          : "Private hosting required"}
      </h1>
      <p>
        This camp workspace requires an authorized private host. Public GitHub
        Pages cannot protect its frontend or camp data. No camp records were
        loaded.
      </p>
    </main>
  );
}
