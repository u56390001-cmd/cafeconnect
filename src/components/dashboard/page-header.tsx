"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Shared page header for every dashboard page: one title, one supporting
 * line, optional page-level actions on the right.
 *
 * Actions wrap below the title on small screens so nothing is clipped.
 */
export function PageHeader({ title, description, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn("flex flex-wrap items-start justify-between gap-3", className)}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon
          ? (
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground"
              >
                <Icon className="size-5" />
              </span>
            )
          : null}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
            {title}
          </h1>
          {description
            ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
              )
            : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
