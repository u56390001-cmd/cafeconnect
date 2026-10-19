"use client";

import { MessageSquare } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";

export default function ChatsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Chat Logs</h1>
        <p className="text-muted-foreground">
          Conversations from the website widget and WhatsApp channels.
        </p>
      </header>

      <Empty className="rounded-lg border border-dashed border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquare className="size-6" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No conversations yet</EmptyTitle>
          <EmptyDescription>
            Messages from both channels appear here once your AI agent is
            connected.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button disabled>Start a test chat</Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
