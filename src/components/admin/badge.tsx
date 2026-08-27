import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "amber" | "danger" | "muted";

type BadgeProps = {
  tone?: Tone;
  children: ReactNode;
};

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return <em className={`ops-badge ops-badge--${tone}`}>{children}</em>;
}
