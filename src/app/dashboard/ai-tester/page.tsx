"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, MessageSquare, Sparkles } from "lucide-react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";
import { PageHeader } from "@/components/dashboard/page-header";

const SUGGESTIONS = [
  "What is on the menu and what does it cost?",
  "Kya koi offer chal raha hai?",
  "Kitni der me delivery hoti hai aur charges kitne hain?",
  "What are your opening hours?",
  "I want to order 2 Chicken Biryani for delivery",
];

export default function AiTesterPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [widgetId, setWidgetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(
        `/api/settings/widget?tenantId=${encodeURIComponent(tenantId)}`
      );
      if (!res.ok) {
        setError("Could not load the chat widget configuration.");
        return;
      }
      const payload = await res.json();
      setWidgetId(payload.data?.publicWidgetId ?? null);
    } catch {
      setError("Could not load the chat widget configuration.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tenantId) return <NoTenantNotice />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Sparkles}
        title="AI Agent Tester"
        description="Test the AI agent exactly like a customer sees it in the chat widget. Replies are grounded in your menu, offers, business profile and knowledge base."
        actions={
          widgetId ? (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/widget?key=${widgetId}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink data-icon="inline-start" />
                Open standalone widget
              </a>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
              Live chat
            </CardTitle>
            <CardDescription>
              Messages here are stored in Conversations (web channel).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[640px] w-full" />
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : widgetId ? (
              <ChatWidget
                publicWidgetId={widgetId}
                embedded
                suggestions={SUGGESTIONS}
                subtitle="AI agent · test mode"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No chat widget yet. Open Settings → Widget &amp; store to create
                one.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">What the agent knows</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                The agent only answers from these sources. If something is
                missing, it says it will check with the business.
              </p>
              <ul className="space-y-1.5">
                <Item href="/dashboard/menu" label="Menu items and prices" />
                <Item href="/dashboard/offers" label="Active offers" />
                <Item href="/dashboard/knowledge" label="Knowledge base (FAQ, policies)" />
                <Item href="/dashboard/settings" label="Business profile, hours, delivery info" />
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Try these</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <p key={s} className="rounded-md bg-muted px-2.5 py-1.5 text-xs">
                  {s}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Item({ href, label }: { href: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <Link href={href} className="text-primary hover:underline">
        {label}
      </Link>
      <Badge variant="outline" className="text-[10px]">
        edit
      </Badge>
    </li>
  );
}
