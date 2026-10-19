"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Settings,
  Store,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Knowledge Base", href: "/dashboard/knowledge", icon: BookOpen },
  { name: "Packages", href: "/dashboard/packages", icon: Package },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
  { name: "Chat Logs", href: "/dashboard/chats", icon: MessageSquare },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activePath, setActivePath] = useState<string>("");

  useEffect(() => {
    setMounted(true);
    setActivePath(window.location.pathname);
  }, []);

  useEffect(() => {
    const handlePopState = () => setActivePath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen flex-col gap-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) {
    router.push("/signup");
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    router.push("/signup");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold text-foreground">
              CafeConnect
            </span>
            {user.tenantId && (
              <Separator orientation="vertical" className="mx-2 h-6" />
            )}
            {user.tenantId && (
              <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                {user.tenantId}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row lg:px-8">
        <aside className="w-full shrink-0 md:w-56">
          <nav aria-label="Dashboard" className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePath === item.href;
              return (
                <Button
                  key={item.name}
                  asChild
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 px-3",
                    isActive && "font-medium"
                  )}
                >
                  <a href={item.href}>
                    <Icon data-icon="inline-start" />
                    {item.name}
                  </a>
                </Button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
