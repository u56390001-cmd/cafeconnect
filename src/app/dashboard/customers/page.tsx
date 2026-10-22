"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, Users } from "lucide-react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";
import { PageHeader } from "@/components/dashboard/page-header";

interface MemoryView {
  key: string;
  value: string;
  type: string;
  source: string;
}

interface CustomerView {
  customerId: string;
  preferredName: string | null;
  preferredLanguage: string | null;
  preferredFulfilment: string | null;
  consentStatus: string;
  memoryEnabled: boolean;
  orderCount: number;
  lastSeenAt: string | null;
  lastOrderAt: string | null;
  memories: MemoryView[];
}

export default function CustomersPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [customers, setCustomers] = useState<CustomerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/customers?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.data?.customers ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    customerId: string,
    action: "disable_memory" | "enable_memory" | "delete_memory",
    key?: string
  ) {
    if (!tenantId) return;
    setBusyId(customerId);
    try {
      const res = await authFetch("/api/customers", {
        method: "PATCH",
        body: JSON.stringify({ tenantId, customerId, action, key }),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!tenantId) return <NoTenantNotice />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Customers"
        description="Returning customers the AI remembers for this business. Memory is tenant-scoped and can be disabled or deleted at any time."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Known customers ({customers.length})</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading customers...</p>
          ) : customers.length === 0 ? (
            <Empty>
              <p>No customers remembered yet.</p>
              <p className="text-xs text-muted-foreground">
                A customer profile is created the first time someone chats
                through the widget or WhatsApp.
              </p>
            </Empty>
          ) : (
            <ul className="divide-y">
              {customers.map((customer) => (
                <li key={customer.customerId} className="py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {customer.preferredName ?? "Guest"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {customer.customerId} ·{" "}
                        {customer.preferredLanguage ?? "no saved language"} ·{" "}
                        {customer.preferredFulfilment ?? "no saved fulfilment"} ·{" "}
                        {customer.orderCount} orders
                      </p>
                      {customer.lastSeenAt && (
                        <p className="text-xs text-muted-foreground">
                          Last seen {new Date(customer.lastSeenAt).toLocaleString()}
                        </p>
                      )}
                      {customer.memories.length > 0 && (
                        <ul className="pt-2 space-y-1">
                          {customer.memories.map((memory) => (
                            <li
                              key={memory.key}
                              className="flex items-center gap-2 text-xs"
                            >
                              <Badge variant="secondary">{memory.key}</Badge>
                              <span className="text-muted-foreground">
                                {memory.value}
                              </span>
                              <button
                                aria-label={`Delete ${memory.key}`}
                                onClick={() =>
                                  void act(
                                    customer.customerId,
                                    "delete_memory",
                                    memory.key
                                  )
                                }
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={customer.memoryEnabled ? "default" : "outline"}
                      >
                        {customer.memoryEnabled ? "memory on" : "memory off"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === customer.customerId}
                        onClick={() =>
                          void act(
                            customer.customerId,
                            customer.memoryEnabled
                              ? "disable_memory"
                              : "enable_memory"
                          )
                        }
                      >
                        {customer.memoryEnabled ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

