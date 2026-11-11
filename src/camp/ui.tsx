import { useState, type FormEvent, type ReactNode } from "react";
import { Notice } from "../components/ui";
export type Field = {
  key: string;
  label: string;
  type?: "textarea" | "date" | "number";
  required?: boolean;
  options?: [string, string][];
};
export function RecordForm({
  initial,
  fields,
  submit,
  label = "Save record",
}: {
  initial: Record<string, string>;
  fields: Field[];
  submit: (values: Record<string, string>) => boolean | void;
  label?: string;
}) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(false);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(submit(values) !== false);
  };
  return (
    <form className="camp-form" onSubmit={onSubmit}>
      {fields.map((f) => (
        <label className={f.type === "textarea" ? "wide" : ""} key={f.key}>
          {f.label}
          {f.options ? (
            <select
              aria-label={f.label}
              value={values[f.key] ?? ""}
              onChange={(e) => {
                setValues({ ...values, [f.key]: e.target.value });
                setSaved(false);
              }}
            >
              {f.options.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              aria-label={f.label}
              rows={3}
              maxLength={4000}
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) => {
                setValues({ ...values, [f.key]: e.target.value });
                setSaved(false);
              }}
            />
          ) : (
            <input
              aria-label={f.label}
              type={f.type ?? "text"}
              maxLength={160}
              min={f.type === "number" ? 0 : undefined}
              step={f.type === "number" ? "any" : undefined}
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) => {
                setValues({ ...values, [f.key]: e.target.value });
                setSaved(false);
              }}
            />
          )}
        </label>
      ))}
      <div className="wide inline-actions">
        <button className="button" type="submit">
          {label}
        </button>
        {saved && <span role="status">Saved on this device.</span>}
      </div>
    </form>
  );
}
export function CampEmpty({ children }: { children: ReactNode }) {
  return <p className="camp-empty">{children}</p>;
}
export function Capability({ children }: { children: ReactNode }) {
  return <Notice>{children}</Notice>;
}
export const disciplines: [string, string][] = [
  ["boxing", "Boxing"],
  ["kickboxing", "Kickboxing"],
];
export const lines = (value: string) =>
  value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
