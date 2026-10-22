"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NativeSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  className?: string;
}

/**
 * Styled native `<select>` for compact filter/choice controls where the
 * Radix Select (with open lists and check indicators) is unnecessary.
 * The wrapper handles the chevron and sizing; width utilities passed via
 * `className` apply to the wrapper, not the select itself.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <span className={cn("relative block w-full", className)}>
        <select
          ref={ref}
          className={cn(
            "h-10 w-full cursor-pointer appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-sm text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </span>
    );
  }
);
NativeSelect.displayName = "NativeSelect";
