"use client";

import { useEffect, useState } from "react";
import { ChatWidget } from "@/components/chat/ChatWidget";

const ACCESSIBLE_WIDGET_KEY = /^[A-Za-z0-9_-]+$/;

export default function WidgetPage() {
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("key") ?? "";
    setKey(ACCESSIBLE_WIDGET_KEY.test(value) ? value : "");
  }, []);

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

  return <ChatWidget publicWidgetId={key} />;
}
