import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  variant?: "default" | "column";
};

export function SectionHeader({ eyebrow, title, meta, actions, variant = "default" }: SectionHeaderProps) {
  const className = variant === "column" ? "ops-column-title" : "ops-section-heading";
  return (
    <header className={className}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {meta && <span aria-hidden="true">{meta}</span>}
      {actions && <div className="ops-section-actions">{actions}</div>}
    </header>
  );
}
