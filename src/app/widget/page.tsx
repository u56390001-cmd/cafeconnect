"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const ACCESSIBLE_WIDGET_KEY = /^[A-Za-z0-9_-]+$/;

function WidgetChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("");
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const searchParams =
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const key = searchParams?.get("key") ?? "";

  useEffect(() => {
    if (!key || !ACCESSIBLE_WIDGET_KEY.test(key)) {
      setError("Invalid widget key");
      return;
    }
    fetch(`/api/widget/resolve?key=${encodeURIComponent(key)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Widget not found");
        return res.json();
      })
      .then((data) => {
        const greet = data.data?.greeting || "Hi! How can I help you?";
        setGreeting(greet);
        setMessages([{ role: "assistant", content: greet }]);
      })
      .catch(() => setError("Widget not available"));
  }, [key]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || !key) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/widget/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicWidgetId: key,
          message: text,
          conversationId: conversationId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setConversationId(data.data?.conversationId ?? null);
      setMessages((m) => [...m, { role: "assistant", content: data.data?.reply ?? "" }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-4 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <div
        className="flex items-center gap-2 px-4 py-3 text-primary-foreground"
        style={{ backgroundColor: "hsl(var(--primary))" }}
      >
        <div
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/20 text-lg"
        >
          🍽️
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">Chat with us</p>
          <p className="text-xs opacity-80">Usually replies instantly</p>
        </div>
      </div>

      <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "mr-auto max-w-[85%] rounded-lg rounded-bl-sm bg-secondary px-3 py-2 text-sm text-secondary-foreground whitespace-pre-wrap"
            }
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="mr-auto w-20 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
            typing...
          </div>
        )}
      </div>

      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <label htmlFor="widgetInput" className="sr-only">
          Message
        </label>
        <Input
          id="widgetInput"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

export default function WidgetPage() {
  return <WidgetChat />;
}
