import { useRef, useState } from "react";
import { campSchema, type Camp } from "./model";
import { loadCamp, saveCamp } from "./storage";
export function useCamp() {
  const [initial] = useState(loadCamp);
  const revision = useRef(initial.revision);
  const [data, setData] = useState(initial.value);
  const [error, setError] = useState(initial.error);
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(initial.blocked);
  const commit = (next: Camp, recovery = false) => {
    if (blocked && !recovery) {
      setError(initial.error);
      return false;
    }
    try {
      const value = campSchema.parse(next);
      saveCamp(value, localStorage, recovery ? undefined : revision.current);
      revision.current = JSON.stringify(value);
      setData(value);
      setBlocked(false);
      setError("");
      setMessage("Camp workspace saved on this device.");
      return true;
    } catch (e) {
      setError(
        e instanceof Error && "issues" in e
          ? "The record is incomplete or references missing evidence. Check the required fields, dates and timestamps."
          : e instanceof Error && e.message.startsWith("Camp data changed")
            ? e.message
            : "Could not save camp data. Storage may be full or unavailable; export a backup before closing this tab.",
      );
      return false;
    }
  };
  return { data, commit, error, message, setMessage, blocked };
}
