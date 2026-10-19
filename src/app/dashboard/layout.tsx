import { auth } from "@/lib/firebase/config";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

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

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: "🏠" },
    { name: "Knowledge Base", href: "/dashboard/knowledge", icon: "📚" },
    { name: "Packages", href: "/dashboard/packages", icon: "📦" },
    { name: "Settings", href: "/dashboard/settings", icon: "⚙️" },
    { name: "Chat Logs", href: "/dashboard/chats", icon: "💬" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-blue-600">CafeConnect</span>
              <span className="text-sm font-medium text-gray-500">
                {user?.tenantId ? `Tenant: ${user.tenantId}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user?.email}</span>
              <button
                onClick={() => {
                  signOut();
                  router.push("/auth/signup");
                }}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <aside className="hidden md:block w-64">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors hover:bg-gray-100 hover:text-blue-600"
              >
                <span>{item.icon}</span>
                {item.name}
              </a>
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
