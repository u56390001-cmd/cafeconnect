"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  ShoppingBasket,
  Sparkles,
  Store,
  Tag,
  Users,
  Utensils,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "POS", href: "/dashboard/pos", icon: ShoppingBasket },
  { name: "Menu", href: "/dashboard/menu", icon: Utensils },
  { name: "Offers", href: "/dashboard/offers", icon: Tag },
  { name: "Orders", href: "/dashboard/orders", icon: ClipboardList },
  { name: "Bookings", href: "/dashboard/bookings", icon: CalendarDays },
  { name: "Conversations", href: "/dashboard/chats", icon: MessageSquare },
  { name: "AI Tester", href: "/dashboard/ai-tester", icon: Sparkles },
  { name: "Customers", href: "/dashboard/customers", icon: Users },
  { name: "Knowledge Base", href: "/dashboard/knowledge", icon: BookOpen },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activePath = mounted ? pathname : "";

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
                  <Link href={item.href}>
                    <Icon data-icon="inline-start" />
                    {item.name}
                  </Link>
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
