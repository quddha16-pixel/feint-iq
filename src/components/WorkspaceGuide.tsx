import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function WorkspaceGuide({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  const dismiss = () => {
    onClose();
    requestAnimationFrame(() => opener.current?.focus());
  };
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="panel guide"
      aria-labelledby="guide-title"
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const buttons =
          dialog.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
      <button
        className="icon-button close-guide"
        onClick={dismiss}
        aria-label="Close guide"
      >
        <X />
      </button>
      <p className="eyebrow">IDENTIFIER Q / WORKSPACE GUIDE</p>
      <h2 id="guide-title">Start with your footage.</h2>
      <ol>
        <li>Choose Boxing or Kickboxing in the header.</li>
        <li>Open Analysis center for local session review, or its existing pilot setup for small clips.</li>
        <li>Identify your fighter and choose your technical focus.</li>
        <li>
          Review the setup. Automated analysis is unavailable until an engine is
          connected.
        </li>
      </ol>
      <p>
        Authentic structured reports can be imported in History. Your library is
        local to this browser. Profile, camp plan, opponents and Development are available from the camp navigation.
      </p>
      <button className="button" onClick={dismiss}>
        Got it
      </button>
    </dialog>
  );
}
