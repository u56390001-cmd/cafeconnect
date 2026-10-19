import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: "🏠" },
  { name: "Knowledge Base", href: "/dashboard/knowledge", icon: "📚" },
  { name: "Packages", href: "/dashboard/packages", icon: "📦" },
  { name: "Settings", href: "/dashboard/settings", icon: "⚙️" },
  { name: "Chat Logs", href: "/dashboard/chats", icon: "💬" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading) {
    return null;
  }

  if (!user) {
    router.push("/auth/signup");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-primary">CafeConnect</span>
              <span className="text-sm font-medium text-muted-foreground ml-2">
                {user?.tenantId ? `Tenant: ${user.tenantId}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden sm:block text-sm text-muted-foreground">
                {user?.email}
              </span>
              <button
                onClick={() => {
                  signOut();
                  router.push("/auth/signup");
                }}
                className="text-sm text-destructive hover:text-destructive/90"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <aside className="hidden md:flex w-64 flex-col gap-1">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Button
                key={item.name}
                asChild
                variant="ghost"
                className="w-full justify-start text-left gap-3 px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                <a href={item.href}>{item.icon} {item.name}</a>
              </Button>
            ))}
          </nav>
        </aside>

        <div className="md:ml-64">
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
