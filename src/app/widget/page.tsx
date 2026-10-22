"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { ChatWidget } from "@/components/chat/ChatWidget";

const ACCESSIBLE_WIDGET_KEY = /^[A-Za-z0-9_-]+$/;

/**
 * Widget host page.
 *
 * When it is loaded inside the embed loader's iframe it renders only the
 * conversation panel (the host page owns the launcher). Loaded directly it
 * renders its own launcher, so the widget also works as a full page.
 */
export default function WidgetPage() {
  const [key, setKey] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState(false);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("key") ?? "";
    const isEmbedded = params.get("embed") === "1";
    setEmbedded(isEmbedded);
    setKey(ACCESSIBLE_WIDGET_KEY.test(value) ? value : "");
    if (!isEmbedded) {
      setOpen(window.location.hash === "#chat");
    }
  }, []);

  const close = useCallback(() => {
    if (embedded) {
      // Ask the host page (the embed loader) to close the widget.
      try {
        window.parent.postMessage(
          { type: "cafeconnect:close" },
          window.location.origin
        );
      } catch {
        // cross-origin parent - nothing to do
      }
    }
    setOpen(false);
  }, [embedded]);

  useEffect(() => {
    if (!embedded) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "cafeconnect:visibility" && event.data.visible) {
        setOpen(true);
      }
    };
    window.addEventListener("message", onMessage);
    try {
      window.parent.postMessage(
        { type: "cafeconnect:ready" },
        window.location.origin
      );
    } catch {
      // ignore
    }
    return () => window.removeEventListener("message", onMessage);
  }, [embedded]);

  if (key === null) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!key) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
        This chat link is invalid. Please open the link provided by the business.
      </div>
    );
  }

  if (!embedded) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen max-w-md flex-col p-3">
          {open ? (
            <ChatWidget
              publicWidgetId={key}
              embedded
              onClose={() => setOpen(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg"
            >
              <MessageCircle className="size-5" aria-hidden="true" />
              Chat with us
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      {open ? (
        <ChatWidget
          publicWidgetId={key}
          embedded
          onClose={close}
          className="h-full rounded-none border-0"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Open chat
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
