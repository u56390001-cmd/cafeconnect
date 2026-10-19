"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Empty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col items-center justify-center gap-2 p-8 text-center", className)}
    {...props}
  />
));
Empty.displayName = "Empty";

const EmptyMedia = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, variant = "icon", ...props }, ref) => {
  const baseStyles =
    "mb-2 h-12 w-12 flex shrink-0 items-center justify-center rounded-full bg-accent";
  const mediaStyles = {
    icon: "text-accent-foreground",
    text: "text-muted-foreground",
  };

  return (
    <div
      ref={ref}
      className={cn(baseStyles, mediaStyles[variant], className)}
      {...props}
    />
  );
});
EmptyMedia.displayName = "EmptyMedia";

const EmptyTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-semibold tracking-tight", className)}
    {...props}
  />
));
EmptyTitle.displayName = "EmptyTitle";

const EmptyDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-muted-foreground", className)} {...props} />
));
EmptyDescription.displayName = "EmptyDescription";

const EmptyContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col items-center justify-center gap-2", className)}
    {...props}
  />
));
EmptyContent.displayName = "EmptyContent";

export { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent };
