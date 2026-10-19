"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Field = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "vertical" | "horizontal";
    disabled?: boolean;
    invalid?: boolean;
  }
>(({ className, orientation = "vertical", disabled, invalid, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "space-y-2",
      disabled && "opacity-50 pointer-events-none",
      orientation === "horizontal" &&
        "grid w-full grid-cols-4 items-center gap-4",
      className
    )}
    data-orientation={orientation}
    data-disabled={disabled}
    data-invalid={invalid}
    {...props}
  />
));
Field.displayName = "Field";

const FieldLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm font-medium text-foreground peer data-[disabled=true]:opacity-50",
      className
    )}
    {...props}
  />
));
FieldLabel.displayName = "FieldLabel";

const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "text-sm text-muted-foreground peer data-[disabled=true]:opacity-50",
      className
    )}
    {...props}
  />
));
FieldDescription.displayName = "FieldDescription";

const FieldError = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "text-sm text-destructive peer data-[disabled=true]:opacity-50",
      className
    )}
    {...props}
  />
));
FieldError.displayName = "FieldError";

const FieldGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-4", className)} {...props} />
));
FieldGroup.displayName = "FieldGroup";

export { Field, FieldLabel, FieldDescription, FieldError, FieldGroup };
