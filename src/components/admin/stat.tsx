import type { ReactNode } from "react";

type Tone = "default" | "accent" | "amber" | "danger" | "muted";

type StatProps = {
  value: number | string;
  label: string;
  tone?: Tone;
  icon?: ReactNode;
};

export function Stat({ value, label, tone = "default", icon }: StatProps) {
  const classes = ["ops-stat"];
  if (tone !== "default") classes.push(`ops-stat--${tone}`);
  return (
    <b className={classes.join(" ")}>
      {icon && <span aria-hidden="true">{icon}</span>}
      <span className="ops-stat-value">{value}</span>
      <small>{label}</small>
    </b>
  );
}
