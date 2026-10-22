"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";
import { PageHeader } from "@/components/dashboard/page-header";

interface Conversation {
  conversationId: string;
  channel: string;
  customerReference: string | null;
  status: string;
  aiEnabled: boolean;
  handoff: {
    reason?: string;
    summary?: string;
    priority?: string;
    createdAt?: string;
  } | null;
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

interface TurnMetric {
  requestId: string;
  promptVersion: string;
  channel: string;
  languageMode: string;
  model: string | null;
  attempts: number;
  toolCalls: Array<{ name: string; ok: boolean; ms: number }>;
  fallbackUsed: boolean;
  stages: {
    historyAndContextMs?: number;
    promptAssemblyMs?: number;
    modelMs?: number;
    totalMs?: number;
  };
  createdAt: string;
}

interface ConversationState {
  activeIntent: string | null;
  missingOrderDetails: string[];
  cartRevision: number;
  lastOrderNumber: string | null;
  lastVerifiedQuote: string | null;
  compactSummary: string;
  stateVersion: number;
  lastPromptVersion: string | null;
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
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyNotice, setReplyNotice] = useState("");
  const [turnMetrics, setTurnMetrics] = useState<TurnMetric[]>([]);
  const [state, setState] = useState<ConversationState | null>(null);

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
          setTurnMetrics(data.data?.turnMetrics ?? []);
          setState(data.data?.state ?? null);
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

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !selected || !reply.trim()) return;
    setSending(true);
    setReplyNotice("");
    try {
      const res = await authFetch("/api/conversations/messages", {
        method: "POST",
        body: JSON.stringify({
          tenantId,
          conversationId: selected,
          content: reply.trim(),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setReplyNotice(
          payload?.error?.message ?? "Could not send the reply to the customer."
        );
        return;
      }
      setReply("");
      setReplyNotice(
        payload?.data?.delivered
          ? "Reply sent to the customer."
          : "Reply saved. The assistant stays disabled for this chat until you re-enable it."
      );
      await load();
      await loadThread(selected);
    } finally {
      setSending(false);
    }
  }

  async function setAiEnabled(conversationId: string, aiEnabled: boolean) {
    if (!tenantId) return;
    try {
      const res = await authFetch("/api/conversations", {
        method: "PATCH",
        body: JSON.stringify({ tenantId, conversationId, aiEnabled }),
      });
      if (res.ok) {
        await load();
        setReplyNotice(aiEnabled ? "Assistant re-enabled." : "Assistant paused.");
      } else {
        const payload = await res.json().catch(() => null);
        setReplyNotice(
          payload?.error?.message ?? "That change could not be saved. Please try again."
        );
      }
    } catch {
      setReplyNotice("That change could not be saved. Please try again.");
    }
  }

  if (!tenantId) return <NoTenantNotice />

  const selectedConversation = conversations.find((c) => c.conversationId === selected);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={MessageSquare}
        title="Conversations"
        description="Website and WhatsApp chats. Send a reply to take over the conversation from the AI."
      />
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
            <p className="text-sm text-muted-foreground">Loading conversations…</p>
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

      <Card className="flex h-[70vh] flex-col">
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
              {selectedConversation.aiEnabled === false && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAiEnabled(selectedConversation.conversationId, true)}
                >
                  Re-enable AI
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void loadThread(selectedConversation.conversationId)}>
                Reload
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          {!selected ? (
            <Empty>
              <p>Select a conversation to view the thread.</p>
            </Empty>
          ) : loadingThread ? (
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          ) : (
            <div className="space-y-2.5">
              {state && (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
                  <p className="font-semibold">Conversation state</p>
                  <p className="text-muted-foreground">
                    Intent: {state.activeIntent ?? "general"} · Cart revision:{" "}
                    {state.cartRevision} · Prompt:{" "}
                    {state.lastPromptVersion ?? "—"}
                  </p>
                  {state.missingOrderDetails.length > 0 && (
                    <p className="text-muted-foreground">
                      Still needed for an order:{" "}
                      {state.missingOrderDetails.join(", ")}
                    </p>
                  )}
                  {state.lastOrderNumber && (
                    <p className="text-muted-foreground">
                      Last order: {state.lastOrderNumber}
                      {state.lastVerifiedQuote
                        ? ` · ${state.lastVerifiedQuote}`
                        : ""}
                    </p>
                  )}
                </div>
              )}
              {selectedConversation?.handoff && (
                <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
                  <p className="font-semibold">
                    Handoff ({selectedConversation.handoff.priority ?? "normal"})
                  </p>
                  <p className="text-muted-foreground">
                    {selectedConversation.handoff.reason}
                  </p>
                  {selectedConversation.handoff.summary && (
                    <p className="pt-1 text-muted-foreground">
                      {selectedConversation.handoff.summary}
                    </p>
                  )}
                </div>
              )}
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
                    {m.senderType} · {new Date(m.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}
          {turnMetrics.length > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
              <p className="font-semibold">AI turn metrics (latest)</p>
              {turnMetrics.slice(0, 5).map((m) => (
                <p key={m.requestId} className="text-muted-foreground">
                  {m.model ?? "no model"} · {m.languageMode} · total{" "}
                  {m.stages.totalMs ?? 0}ms (model {m.stages.modelMs ?? 0}ms) ·
                  attempts {m.attempts}
                  {m.toolCalls.length > 0
                    ? ` · tools: ${m.toolCalls
                        .map((t) => `${t.name}${t.ok ? "✓" : "✗"}`)
                        .join(", ")}`
                    : ""}
                  {m.fallbackUsed ? " · fallback used" : ""}
                </p>
              ))}
            </div>
          )}
        </CardContent>
        {selected && (
          <div className="space-y-2 border-t border-border p-3">
            <form onSubmit={sendReply} className="flex gap-2">
              <Input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply to the customer (sent on the same channel)…"
                className="flex-1"
                disabled={sending}
                aria-label="Reply to the customer"
              />
              <Button type="submit" size="sm" disabled={sending || !reply.trim()}>
                <Send data-icon="inline-start" />
                {sending ? "Sending…" : "Send"}
              </Button>
            </form>
            {replyNotice && (
              <p className="text-xs text-muted-foreground">{replyNotice}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Sending a reply keeps the assistant paused for this chat. Use
              &quot;Re-enable AI&quot; to hand it back to the assistant.
            </p>
          </div>
        )}
      </Card>
      </div>
    </div>
  );
}

export default function Page() {
  return <ChatsPage />;
}


