import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/cn";

export const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-olive-100 text-olive-700 border border-olive-200",
        primary: "bg-olive-600 text-cream",
        secondary: "bg-khaki-100 text-khaki-700 border border-khaki-200",
        destructive: "bg-red-100 text-red-700 border border-red-200",
        outline: "border border-olive-300 text-olive-700",
        success: "bg-green-100 text-green-700 border border-green-200",
        warning: "bg-yellow-100 text-yellow-800 border border-yellow-200",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
