"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Pencil, Trash2 } from "lucide-react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";

type KnowledgeCategory = "faq" | "policy" | "businessInfo" | "document";

interface KnowledgeItem {
  documentId: string;
  title: string;
  category: KnowledgeCategory;
  language: string;
  status: string;
  version: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES: Array<{ value: KnowledgeCategory; label: string }> = [
  { value: "businessInfo", label: "Business Info" },
  { value: "faq", label: "FAQ" },
  { value: "policy", label: "Policy" },
  { value: "document", label: "Document" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ur", label: "Urdu" },
  { value: "ur-Latn", label: "Roman Urdu" },
];

export default function KnowledgePage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    category: "businessInfo" as KnowledgeCategory,
    language: "en",
    content: "",
    status: "published",
  });

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/knowledge?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.data?.items ?? []);
      }
    } catch {
      setError("Failed to load knowledge base");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    if (!form.title.trim() || !form.content.trim()) {
      setError("Title and content are required");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await authFetch("/api/knowledge", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          tenantId,
          documentId: editingId,
          title: form.title,
          category: form.category,
          language: form.language,
          content: form.content,
          status: form.status,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error?.message ?? "Failed to save entry");
        return;
      }
      setMessage(
        editingId ? "Entry updated." : "Entry added to the knowledge base."
      );
      setForm({
        title: "",
        category: "businessInfo",
        language: "en",
        content: "",
        status: "published",
      });
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: KnowledgeItem) {
    setEditingId(item.documentId);
    setForm({
      title: item.title,
      category: item.category,
      language: item.language ?? "en",
      content: item.content ?? "",
      status: item.status ?? "published",
    });
  }

  async function archive(item: KnowledgeItem) {
    if (!tenantId) return;
    const res = await authFetch(
      `/api/knowledge?tenantId=${tenantId}&documentId=${item.documentId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setMessage("Entry archived. The assistant will stop using it.");
      await load();
    }
  }

  async function togglePublish(item: KnowledgeItem) {
    if (!tenantId) return;
    const next = item.status === "published" ? "draft" : "published";
    const res = await authFetch("/api/knowledge", {
      method: "PATCH",
      body: JSON.stringify({
        tenantId,
        documentId: item.documentId,
        status: next,
      }),
    });
    if (res.ok) {
      setMessage(
        next === "published"
          ? "Entry published - the assistant can use it now."
          : "Entry moved to draft."
      );
      await load();
    }
  }

  if (!tenantId) return <NoTenantNotice />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BookOpen className="size-5 text-primary" aria-hidden="true" />
          Knowledge Base
        </h1>
        <p className="text-sm text-muted-foreground">
          Business facts the AI agent is allowed to use. Only published entries
          reach the assistant.
        </p>
      </header>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          {message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editingId ? "Edit entry" : "Add entry"}
          </CardTitle>
          <CardDescription>
            Keep entries short and factual: hours, delivery area, payment
            methods, policies, FAQs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="kbTitle">Title</Label>
                <Input
                  id="kbTitle"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Opening Hours"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kbCategory">Category</Label>
                <select
                  id="kbCategory"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as KnowledgeCategory })
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kbLanguage">Language</Label>
                <select
                  id="kbLanguage"
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kbStatus">Status</Label>
                <select
                  id="kbStatus"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kbContent">Content</Label>
              <Textarea
                id="kbContent"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={4}
                placeholder="Open daily 12pm to 12am. Delivery within 6 km, PKR 100 fee."
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Add entry"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setForm({
                      title: "",
                      category: "businessInfo",
                      language: "en",
                      content: "",
                      status: "published",
                    });
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Entries ({items.length})</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading knowledge base...</p>
          ) : items.length === 0 ? (
            <Empty>
              <p>No knowledge entries yet.</p>
              <p className="text-xs text-muted-foreground">
                Add your hours, delivery area and policies so the assistant
                answers from verified facts.
              </p>
            </Empty>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.documentId} className="flex flex-wrap gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {item.content}
                    </p>
                    <p className="pt-1 text-[10px] text-muted-foreground">
                      {item.category} · {item.language} · v{item.version}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        item.status === "published" ? "default" : "outline"
                      }
                    >
                      {item.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void togglePublish(item)}
                    >
                      {item.status === "published" ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(item)}
                    >
                      <Pencil data-icon="inline-start" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void archive(item)}
                    >
                      <Trash2 data-icon="inline-start" />
                      Archive
                    </Button>
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
