"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

type KnowledgeCategory = "faq" | "policy" | "businessInfo" | "document";

interface KnowledgeItem {
  documentId: string;
  title: string;
  category: KnowledgeCategory;
  language: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeListResponse {
  success: boolean;
  data: { items: KnowledgeItem[] };
}

export default function KnowledgePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<KnowledgeCategory>("businessInfo");
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    if (user?.tenantId) {
      loadItems();
    }
  }, [user]);

  const loadItems = async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/knowledge?tenantId=${user.tenantId}&userId=${user.uid}&role=${user.role || "owner"}`
      );
      if (!res.ok) return;
      const payload = (await res.json()) as KnowledgeListResponse;
      setItems(payload.data?.items ?? []);
    } catch {
      setError("Failed to load knowledge base");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.tenantId) return;
    if (!title.trim() || !content.trim()) {
      setError("Title and content are required");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: user.tenantId,
          userId: user.uid,
          role: user.role || "owner",
          title,
          category,
          content,
          language,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to save item");
      }

      setTitle("");
      setContent("");
      await loadItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { value: "faq", label: "FAQ" },
    { value: "policy", label: "Policy" },
    { value: "businessInfo", label: "Business Info" },
    { value: "document", label: "Document" },
  ];

  if (!user?.tenantId) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-gray-600">
            Business information, FAQs, policies, and packages
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Item Form */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Add Business Information
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="e.g. Business Hours"
                  required
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as KnowledgeCategory)
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                >
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                  className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter business details, FAQ answer, or policy text..."
                  required
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Language
                </label>
                <input
                  type="text"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="en"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save to Knowledge Base"}
              </button>
            </form>
          </div>
        </div>

        {/* Items List */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Knowledge Items ({items.length})
            </h2>
            {loading ? (
              <div className="h-32 flex items-center justify-center text-gray-500">
                Loading...
              </div>
            ) : items.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-gray-400">
                No items yet
              </div>
            ) : (
              <ul className="space-y-3">
                {items.map((item, idx) => (
                  <li key={idx} className="p-3 rounded-md border border-gray-100 bg-gray-50">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {item.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.category} • {item.language}
                    </p>
                    <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      {item.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Example Content Section */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-md p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          Example Entries
        </h3>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li>Business Hours: Mon-Sat 10:00 AM - 10:00 PM</li>
          <li>Delivery Fee: PKR 100 within 5km radius</li>
          <li>Popular Items: Chicken Biryani, Beef Karahi, Fresh Naan</li>
          <li>Cancellation Policy: Free cancellation up to 2 hours before order</li>
        </ul>
      </div>
    </div>
  );
}
