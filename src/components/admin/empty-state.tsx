import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <section className="ops-empty-state">
      {icon && <span aria-hidden="true">{icon}</span>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="ops-empty-state-action">{action}</div>}
    </section>
  );
}
