"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Separator = React.forwardRef<
  HTMLHRElement,
  React.HTMLAttributes<HTMLHRElement>
>(({ className, ...props }, ref) => (
  <hr
    ref={ref}
    className={cn(
      "mx-auto border-border h-[1px] w-full bg-border",
      className
    )}
    {...props}
  />
));
Separator.displayName = "Separator";

export { Separator };
