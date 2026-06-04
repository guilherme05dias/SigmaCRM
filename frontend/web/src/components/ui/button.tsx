import Link from "next/link";
import { clsx } from "clsx";

type ButtonLinkProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
};

export function ButtonLink({ href, children, variant = "secondary" }: ButtonLinkProps) {
  return (
    <Link className={clsx("button", variant === "primary" ? "button-primary" : "button-secondary")} href={href}>
      {children}
    </Link>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ children, className, variant = "secondary", type = "button", ...props }: ButtonProps) {
  return (
    <button
      className={clsx("button", variant === "primary" ? "button-primary" : "button-secondary", className)}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
