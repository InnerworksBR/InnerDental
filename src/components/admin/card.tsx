import type { CSSProperties, ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  elevation?: "flat" | "raised" | "elevated";
  padding?: "compact" | "default" | "spacious";
  interactive?: boolean;
  as?: keyof React.JSX.IntrinsicElements;
  style?: CSSProperties;
};

export function Card({ children, className = "", elevation = "raised", padding = "default", interactive = false, as: Tag = "section", style }: CardProps) {
  const classes = ["ops-card"];
  if (elevation === "flat") classes.push("ops-card--flat");
  if (elevation === "elevated") classes.push("ops-card--elevated");
  if (padding === "compact") classes.push("ops-card--compact");
  if (padding === "spacious") classes.push("ops-card--spacious");
  if (interactive) classes.push("ops-card--interactive");
  if (className) classes.push(className);
  const mergedStyle: CSSProperties = { ...(style ?? {}) };
  return <Tag className={classes.join(" ")} style={mergedStyle}>{children}</Tag>;
}
