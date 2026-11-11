import type { ReactNode } from "react";
import { ArrowUpRight, AlertCircle, Crosshair } from "lucide-react";
export function Brand() {
  return (
    <a className="brand" href="#/" aria-label="Identifier Q dashboard">
      <span className="brand-mark">iQ</span>
      <span>
        <small>FEINT ENGINEERING</small>
        <strong>
          IDENTIFIER <b>Q</b>
        </strong>
      </span>
    </a>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">
          <span />
          {eyebrow}
        </p>
        <h1>{title}</h1>
        {children && <p className="lede">{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Crosshair size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
  onDismiss,
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
  onDismiss?: () => void;
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <AlertCircle size={18} />
      <div>{children}</div>
      {onDismiss && (
        <button
          className="text-button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      )}
    </div>
  );
}
export function SectionTitle({
  title,
  label,
  action,
}: {
  title: string;
  label?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {label && <p className="eyebrow">{label}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
export function ActionLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <a className={`button ${secondary ? "secondary" : ""}`} href={href}>
      {children}
      <ArrowUpRight size={17} />
    </a>
  );
}
export function Tag({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return <span className={`tag ${accent ? "accent" : ""}`}>{children}</span>;
}
