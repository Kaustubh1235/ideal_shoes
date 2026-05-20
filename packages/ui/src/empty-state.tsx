import * as React from "react";
import { cn } from "./lib/cn";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-olive-200 bg-cream p-10 text-center",
        className,
      )}
      {...rest}
    >
      {icon && <div className="text-olive-600">{icon}</div>}
      <h3 className="font-display text-lg uppercase tracking-wide">{title}</h3>
      {description && <p className="max-w-md text-sm text-ink/60">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
