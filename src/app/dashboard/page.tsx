"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  ClipboardList,
  MessageSquare,
  ShoppingCart,
  Utensils,
} from "lucide-react";

interface OverviewData {
  businessName: string;
  currency: string;
  publishedItems: number;
  activeOrders: number;
  ordersToday: number;
  revenuePaidTodayMinor: number;
  openConversations: number;
  upcomingBookings: number;
}

export default function DashboardHomePage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    authFetch(`/api/overview?tenantId=${tenantId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((payload) => setData(payload.data))
      .catch(() => setError(true));
  }, [tenantId]);

  const stats = [
    { label: "Menu items live", value: data?.publishedItems, href: "/dashboard/menu", icon: Utensils },
    { label: "Orders today", value: data?.ordersToday, href: "/dashboard/orders", icon: ShoppingCart },
    { label: "Active orders", value: data?.activeOrders, href: "/dashboard/orders", icon: ClipboardList },
    { label: "Open conversations", value: data?.openConversations, href: "/dashboard/chats", icon: MessageSquare },
    { label: "Upcoming bookings", value: data?.upcomingBookings, href: "/dashboard/bookings", icon: BookOpen },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">
          {data?.businessName || "Welcome"}
          {user?.displayName ? ` · ${user.displayName}` : ""}
        </h1>
        <p className="text-muted-foreground">
          Live overview of your menu, orders, conversations, and bookings.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="group">
            <Card>
              <CardHeader className="pb-2">
                <stat.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {data ? (
                  <p className="text-2xl font-bold">{stat.value}</p>
                ) : error ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <Skeleton className="h-8 w-16" />
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {data && data.revenuePaidTodayMinor > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paid revenue today
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold text-success">
              {data.currency} {Math.round(data.revenuePaidTodayMinor / 100)}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Storefront</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your public store link is generated automatically. Find it under
              Settings → Widget &amp; store.
            </p>
            <Badge variant="secondary" className="mt-2">
              tenant {tenantId ? "ready" : "not assigned"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Link href="/dashboard/menu" className="text-primary hover:underline">
              Add menu items
            </Link>
            <Link href="/dashboard/offers" className="text-primary hover:underline">
              Create an offer
            </Link>
            <Link href="/dashboard/knowledge" className="text-primary hover:underline">
              Update knowledge base
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
