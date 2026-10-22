"use client";

import { Package, PackagePlus } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";

export default function PackagesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={PackagePlus}
        title="Packages"
        description="Plan tiers and pricing for your business."
      />

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
