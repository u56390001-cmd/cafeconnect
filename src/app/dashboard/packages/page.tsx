"use client";

import { Package } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";

export default function PackagesPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Packages</h1>
        <p className="text-muted-foreground">
          Plan tiers and pricing for your business.
        </p>
      </header>

      <Empty className="rounded-lg border border-dashed border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Package className="size-6" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No packages yet</EmptyTitle>
          <EmptyDescription>
            Create your first plan tier to set pricing and features for this
            tenant.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button disabled>Create package</Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
