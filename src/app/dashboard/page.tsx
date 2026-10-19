"use client";

import { BookOpen, KeyRound, MessageSquare, Store } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const quickLinks = [
  {
    title: "Knowledge Base",
    description: "Add business info, FAQs, policies, and hours.",
    href: "/dashboard/knowledge",
    icon: BookOpen,
  },
  {
    title: "Settings",
    description: "Configure Gemini and WhatsApp credentials.",
    href: "/dashboard/settings",
    icon: KeyRound,
  },
  {
    title: "Chat Logs",
    description: "Review conversations from web and WhatsApp.",
    href: "/dashboard/chats",
    icon: MessageSquare,
  },
];

export default function DashboardHomePage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome{user?.displayName ? `, ${user.displayName}` : ""}
        </h1>
        <p className="text-muted-foreground">
          Set up your business knowledge and channels so the AI assistant can
          answer customers accurately.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenant</CardTitle>
            <CardDescription>Active workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Store className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="font-mono text-sm truncate">
                {user?.tenantId ?? "Not assigned"}
              </span>
            </div>
            <Badge variant="secondary" className="mt-3">
              {user?.role ?? "member"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Channels</CardTitle>
            <CardDescription>Enabled modules</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="outline">Website widget</Badge>
            <Badge variant="outline">WhatsApp</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Engine</CardTitle>
            <CardDescription>Shared Gemini service</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">Configure in Settings</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {quickLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  href={item.href}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Open {item.title}
                </a>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
