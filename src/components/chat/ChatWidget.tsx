"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, RefreshCw, Send, Store, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at?: number;
  failed?: boolean;
}

interface ChatWidgetProps {
  publicWidgetId: string;
  businessName?: string;
  greeting?: string;
  title?: string;
  subtitle?: string;
  suggestions?: string[];
  className?: string;
  /** Renders a compact, bordered panel instead of a full-height chat. */
  embedded?: boolean;
}

const ACCESSIBLE_WIDGET_KEY = /^[A-Za-z0-9_-]+$/;

export function ChatWidget({
  publicWidgetId,
  businessName,
  greeting,
  title = "Chat with us",
  subtitle = "AI agent · usually replies instantly",
  suggestions = [],
  className,
  embedded = false,
}: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [resolvedGreeting, setResolvedGreeting] = useState(greeting ?? "");
  const [error, setError] = useState("");
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingIndexRef = useRef<number | null>(null);
  const visitorIdRef = useRef<string | null>(null);

  /**
   * Stable first-party visitor id (Phase 3). The durable customer identity is
   * this random id - never the IP address.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = "cc_visitor_id";
    let visitorId = window.localStorage.getItem(storageKey);
    if (!visitorId) {
      visitorId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      try {
        window.localStorage.setItem(storageKey, visitorId);
      } catch {
        // storage may be unavailable (private mode) - the chat still works
      }
    }
    visitorIdRef.current = visitorId;
  }, []);

  const key = publicWidgetId?.trim() ?? "";

  useEffect(() => {
    if (!key || !ACCESSIBLE_WIDGET_KEY.test(key)) {
      setError("Invalid widget key");
      return;
    }
    let cancelled = false;
    fetch(`/api/widget/resolve?key=${encodeURIComponent(key)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Widget not found");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const greet =
          greeting || data.data?.greeting || "Hi! How can I help you today?";
        setResolvedGreeting(greet);
        setBusinessNameIfEmpty(data.data?.businessName);
        setMessages([{ role: "assistant", content: greet, at: Date.now() }]);
      })
      .catch(() => !cancelled && setError("Widget not available"));
    return () => {
      cancelled = true;
    };
  }, [key, greeting]);

  function setBusinessNameIfEmpty(name?: string) {
    if (!name) return;
    setBusinessNameIfEmptyState((current) => current ?? name);
  }
  const [businessNameState, setBusinessNameIfEmptyState] = useState(
    businessName ?? null
  );

  useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy || !key) return;

      setInput("");
      setError("");
      setMessages((m) => [
        ...m,
        { role: "user", content, at: Date.now() },
      ]);
      setBusy(true);
      setLastFailed(null);

      // Stream the reply so it starts appearing within the first second.
      let streamed = "";
      streamingIndexRef.current = null;
      try {
        const res = await fetch("/api/widget/message/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicWidgetId: key,
            message: content,
            conversationId: conversationId ?? undefined,
            visitorId: visitorIdRef.current ?? undefined,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error("The assistant could not respond right now.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const payload = JSON.parse(line.slice(5).trim()) as {
              type: string;
              text?: string;
              conversationId?: string;
              message?: string;
            };

            if (payload.type === "delta" && payload.text) {
              streamed += payload.text;
              if (streamingIndexRef.current === null) {
                setMessages((m) => {
                  const next = [
                    ...m,
                    { role: "assistant" as const, content: payload.text!, at: Date.now() },
                  ];
                  streamingIndexRef.current = next.length - 1;
                  return next;
                });
              } else {
                const index = streamingIndexRef.current;
                setMessages((m) =>
                  m.map((msg, i) =>
                    i === index ? { ...msg, content: msg.content + payload.text } : msg
                  )
                );
              }
            } else if (payload.type === "done" && payload.conversationId) {
              setConversationId(payload.conversationId);
            } else if (payload.type === "error") {
              throw new Error(payload.message ?? "Something went wrong.");
            }
          }
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Something went wrong. Please retry.";
        setError(message);
        setLastFailed(content);
        setMessages((m) => [
          ...m,
          { role: "assistant", content: message, at: Date.now(), failed: true },
        ]);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, key, conversationId]
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function reset() {
    setMessages(
      resolvedGreeting
        ? [{ role: "assistant", content: resolvedGreeting, at: Date.now() }]
        : []
    );
    setConversationId(null);
    setError("");
    setLastFailed(null);
  }

  if (error && messages.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-6 text-sm text-muted-foreground",
          className
        )}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-background",
        embedded
          ? "h-[640px] rounded-xl border border-border"
          : "h-screen",
        className
      )}
    >
      <div className="flex items-center gap-3 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
        <div
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20"
        >
          <Store className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
            {businessNameState ?? title}
          </p>
          <p className="truncate text-xs opacity-85">{subtitle}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="text-primary-foreground hover:bg-primary-foreground/15"
          aria-label="Start a new conversation"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <div
        ref={scroller}
        className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-3 py-4"
        aria-live="polite"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex items-end gap-2",
              m.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {m.role === "assistant" && (
              <span
                aria-hidden="true"
                className="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
              >
                <Bot className="size-3.5" />
              </span>
            )}
            <div
              className={cn(
                "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                m.role === "user"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : cn(
                      "rounded-bl-sm border border-border bg-background",
                      m.failed && "border-destructive/40 bg-destructive/5 text-destructive"
                    )
              )}
            >
              {m.content}
            </div>
            {m.role === "user" && (
              <span
                aria-hidden="true"
                className="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <User className="size-3.5" />
              </span>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-end gap-2">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
            >
              <Bot className="size-3.5" />
            </span>
            <div className="rounded-2xl rounded-bl-sm border border-border bg-background px-3.5 py-2 text-sm text-muted-foreground">
              <span className="inline-flex gap-1" aria-label="Assistant is typing">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:0ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:120ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:240ms]" />
              </span>
            </div>
          </div>
        )}

        {messages.length <= 1 && suggestions.length > 0 && !busy && (
          <div className="flex flex-wrap gap-2 pt-1">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {lastFailed && (
        <div className="flex items-center justify-between gap-2 border-t border-border bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <span>Message could not be delivered.</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-destructive"
            onClick={() => void send(lastFailed)}
          >
            <RefreshCw data-icon="inline-start" />
            Retry
          </Button>
        </div>
      )}

      <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-border p-3">
        <label htmlFor={`chat-input-${key}`} className="sr-only">
          Message
        </label>
        <Input
          id={`chat-input-${key}`}
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={busy}
          autoComplete="off"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()}>
          <Send className="size-4" />
          <span className="sr-only">Send</span>
        </Button>
      </form>

      {businessNameState && embedded && (
        <div className="border-t border-border bg-muted/40 px-3 py-1.5 text-center">
          <Badge variant="outline" className="text-[10px] font-normal">
            Powered by CafeConnect AI agent
          </Badge>
        </div>
      )}
    </div>
  );
}
