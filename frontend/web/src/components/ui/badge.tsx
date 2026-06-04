import { clsx } from "clsx";

type BadgeProps = {
  children: React.ReactNode;
  tone?: "success" | "danger" | "info" | "muted";
};

export function Badge({ children, tone = "muted" }: BadgeProps) {
  return <span className={clsx("badge", `badge-${tone}`)}>{children}</span>;
}
