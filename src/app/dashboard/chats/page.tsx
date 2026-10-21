"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";

interface Conversation {
  conversationId: string;
  channel: string;
  customerReference: string | null;
  status: string;
  messageCount: number;
  lastMessageAt: string;
}

interface Message {
  messageId: string;
  direction: string;
  senderType: string;
  content: string;
  createdAt: string;
}

const statusVariant: Record<string, string> = {
  open: "bg-success/10 text-success border-success/30",
  waitingForHuman: "bg-warning/10 text-warning border-warning/30",
  resolved: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground",
};

function ChatsPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/conversations?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.data?.conversations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadThread = useCallback(
    async (conversationId: string) => {
      if (!tenantId) return;
      setLoadingThread(true);
      try {
        const res = await authFetch(
          `/api/conversations?tenantId=${tenantId}&conversationId=${conversationId}`
        );
        if (res.ok) {
          const data = await res.json();
          setMessages(data.data?.messages ?? []);
        }
      } finally {
        setLoadingThread(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    if (selected) void loadThread(selected);
  }, [selected, loadThread]);

  async function setStatus(conversationId: string, status: string) {
    if (!tenantId) return;
    const res = await authFetch("/api/conversations", {
      method: "PATCH",
      body: JSON.stringify({ tenantId, conversationId, status }),
    });
    if (res.ok) {
      await load();
      setConversations((cs) =>
        cs.map((c) => (c.conversationId === conversationId ? { ...c, status } : c))
      );
    }
  }

  if (!tenantId) return <NoTenantNotice />

  const selectedConversation = conversations.find((c) => c.conversationId === selected);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      <Card className="self-start">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Conversations
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading conversations...</p>
          ) : conversations.length === 0 ? (
            <Empty>
              <p>No conversations yet.</p>
              <p className="text-xs text-muted-foreground">
                Once your website widget receives messages, they appear here.
              </p>
            </Empty>
          ) : (
            <ul className="divide-y">
              {conversations.map((c) => (
                <li key={c.conversationId}>
                  <button
                    onClick={() => setSelected(c.conversationId)}
                    className={`flex w-full flex-wrap items-center gap-2 py-3 text-left hover:bg-accent/40 rounded-md px-2 ${selected === c.conversationId ? "bg-accent/60" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {c.customerReference?.replace(/^web:/, "Guest ") ?? "Guest"} Â·{" "}
                        <span className="text-muted-foreground">{c.channel === "web" ? "Website" : c.channel}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.messageCount} messages Â·{" "}
                        {new Date(c.lastMessageAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className={statusVariant[c.status]}>
                      {c.status === "waitingForHuman" ? "Needs Human" : c.status}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="h-[70vh] overflow-y-auto">
        <CardHeader className="sticky top-0 z-10 bg-card">
          <CardTitle className="text-base">Thread</CardTitle>
          {selectedConversation && (
            <div className="flex flex-wrap gap-2">
              {selectedConversation.status !== "waitingForHuman" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStatus(selectedConversation.conversationId, "waitingForHuman")}
                >
                  Handoff
                </Button>
              )}
              {selectedConversation.status !== "resolved" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStatus(selectedConversation.conversationId, "resolved")}
                >
                  Resolve
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void loadThread(selectedConversation.conversationId)}>
                Reload
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!selected ? (
            <Empty>
              <p>Select a conversation to view the thread.</p>
            </Empty>
          ) : loadingThread ? (
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          ) : (
            <div className="space-y-2.5">
              {messages.map((m) => (
                <div
                  key={m.messageId}
                  className={m.direction === "outbound" ? "ml-auto max-w-[85%]" : "mr-auto max-w-[85%]"}
                >
                  <div
                    className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.direction === "outbound"
                        ? "bg-primary text-primary-foreground"
                        : m.senderType === "system"
                          ? "bg-muted text-muted-foreground"
                          : "bg-secondary"
                    }`}
                  >
                    {m.content}
                  </div>
                  <p className="px-1 pt-0.5 text-[10px] text-muted-foreground">
                    {m.senderType} Â· {new Date(m.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Page() {
  return <ChatsPage />;
}


