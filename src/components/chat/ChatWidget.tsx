"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  MessageCircle,
  Minus,
  RefreshCw,
  Send,
  ShoppingBag,
  Store,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ProductCarousel } from "@/components/chat/blocks/ProductCard";
import {
  CartSummaryCard,
  HandoffCard,
  NoticeCard,
  OrderConfirmationCard,
  QuickReplies,
} from "@/components/chat/blocks/Blocks";
import { ItemConfigurator, type WidgetSelection } from "@/components/chat/ItemConfigurator";
import {
  CartPanel,
  type WidgetCartState,
} from "@/components/chat/CartPanel";
import type {
  WidgetBlock,
  WidgetCartSummary,
  WidgetProduct,
} from "@/lib/widget/ui-contract";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: WidgetBlock[];
  at?: number;
  failed?: boolean;
}

export interface WidgetTheme {
  primaryColor: string;
  accentColor: string;
  themeMode: "light" | "dark" | "auto";
  radius: "soft" | "sharp" | "round";
  density: "compact" | "comfortable";
  fontPreset: "system" | "serif" | "rounded";
  logoUrl: string;
  launcherPosition: "bottom-right" | "bottom-left";
  launcherLabel: string;
}

export interface WidgetFeatures {
  showImages: boolean;
  showProducts: boolean;
  showCart: boolean;
  showStorefrontLink: boolean;
}

interface ChatWidgetProps {
  publicWidgetId: string;
  businessName?: string;
  greeting?: string;
  title?: string;
  subtitle?: string;
  suggestions?: string[];
  className?: string;
  /** Renders a compact, bordered panel instead of a full-height chat. */
  embedded?: boolean;
  /** Closes the widget when the host page asked for it. */
  onClose?: () => void;
}

const ACCESSIBLE_WIDGET_KEY = /^[A-Za-z0-9_-]+$/;
const CONVERSATION_ID = /^w_[A-Za-z0-9_-]{16,64}$/;

const DEFAULT_THEME: WidgetTheme = {
  primaryColor: "#ea580c",
  accentColor: "#f59e0b",
  themeMode: "light",
  radius: "soft",
  density: "comfortable",
  fontPreset: "system",
  logoUrl: "",
  launcherPosition: "bottom-right",
  launcherLabel: "Order with us",
};

const DEFAULT_FEATURES: WidgetFeatures = {
  showImages: true,
  showProducts: true,
  showCart: true,
  showStorefrontLink: true,
};

const RADIUS: Record<WidgetTheme["radius"], string> = {
  soft: "0.75rem",
  sharp: "0.25rem",
  round: "1.5rem",
};

const FONT_STACK: Record<WidgetTheme["fontPreset"], string> = {
  system:
    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  rounded:
    "ui-rounded, 'SF Pro Rounded', 'Segoe UI', system-ui, sans-serif",
};

function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}${random}`;
}

export function ChatWidget({
  publicWidgetId,
  businessName,
  greeting,
  title = "Chat with us",
  subtitle,
  suggestions,
  className,
  embedded = false,
  onClose,
}: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [resolvedGreeting, setResolvedGreeting] = useState(greeting ?? "");
  const [error, setError] = useState("");
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const [theme, setTheme] = useState<WidgetTheme>(DEFAULT_THEME);
  const [features, setFeatures] = useState<WidgetFeatures>(DEFAULT_FEATURES);
  const [starterPrompts, setStarterPrompts] = useState<string[]>([]);
  const [businessNameState, setBusinessNameState] = useState(businessName ?? null);
  const [cart, setCart] = useState<WidgetCartState | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [configuring, setConfiguring] = useState<WidgetProduct | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingIndexRef = useRef<number | null>(null);
  const visitorIdRef = useRef<string | null>(null);

  const key = publicWidgetId?.trim() ?? "";

  /**
   * Stable first-party visitor id and a high-entropy conversation id. The
   * conversation id scopes the server cart, so the customer keeps one cart
   * across the widget and the assistant. It is never derived from the IP and
   * never a third-party cookie.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = "cc_visitor_id";
    let visitorId = window.localStorage.getItem(storageKey);
    if (!visitorId) {
      visitorId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      try {
        window.localStorage.setItem(storageKey, visitorId);
      } catch {
        // storage may be unavailable (private mode) - the chat still works
      }
    }
    visitorIdRef.current = visitorId;

    // The conversation id scopes the server cart, so the widget UI and the
    // assistant always work on the same cart. It is high entropy, stored
    // first-party and never derived from the IP address.
    const conversationKey = "cc_widget_conversation";
    let conversation = window.localStorage.getItem(conversationKey);
    if (!conversation || !CONVERSATION_ID.test(conversation)) {
      const random =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "")
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      conversation = `w_${random}`;
      try {
        window.localStorage.setItem(conversationKey, conversation);
      } catch {
        // keep working for this visit
      }
    }
    setConversationId(conversation);
  }, []);

  useEffect(() => {
    if (!key || !ACCESSIBLE_WIDGET_KEY.test(key)) {
      setError("Invalid widget key");
      return;
    }
    let cancelled = false;
    fetch(`/api/widget/resolve?key=${encodeURIComponent(key)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Widget not found");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const greet =
          greeting || data.data?.greeting || "Hi! How can I help you today?";
        setResolvedGreeting(greet);
        if (!businessName) {
          setBusinessNameState(data.data?.businessName ?? null);
        }
        if (data.data?.theme) {
          setTheme({ ...DEFAULT_THEME, ...data.data.theme });
        }
        if (data.data?.features) {
          setFeatures({ ...DEFAULT_FEATURES, ...data.data.features });
        }
        if (Array.isArray(data.data?.starterPrompts)) {
          setStarterPrompts(data.data.starterPrompts);
        }
        setMessages([
          { id: newId("m"), role: "assistant", content: greet, at: Date.now() },
        ]);
      })
      .catch(() => !cancelled && setError("Widget not available"));
    return () => {
      cancelled = true;
    };
  }, [key, greeting, businessName]);

  // Load the cart for this visitor (if the assistant already built one).
  useEffect(() => {
    if (!key || !conversationId) return;
    let cancelled = false;
    fetch(
      `/api/widget/cart?key=${encodeURIComponent(key)}&conversationId=${encodeURIComponent(conversationId)}`
    )
      .then(async (res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.data) return;
        setCart({ ...(payload.data as WidgetCartSummary), currency: "PKR" });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key, conversationId]);

  useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy, cart]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy || !key) return;

      setInput("");
      setError("");
      setMessages((m) => [
        ...m,
        { id: newId("m"), role: "user", content, at: Date.now() },
      ]);
      setBusy(true);
      setLastFailed(null);

      let streamed = "";
      streamingIndexRef.current = null;
      try {
        const res = await fetch("/api/widget/message/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicWidgetId: key,
            message: content,
            conversationId: conversationId ?? undefined,
            visitorId: visitorIdRef.current ?? undefined,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error("The assistant could not respond right now.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const payload = JSON.parse(line.slice(5).trim()) as {
              type: string;
              text?: string;
              conversationId?: string;
              message?: string;
              blocks?: WidgetBlock[];
            };

            if (payload.type === "delta" && payload.text) {
              streamed += payload.text;
              if (streamingIndexRef.current === null) {
                setMessages((m) => {
                  const next = [
                    ...m,
                    {
                      id: newId("m"),
                      role: "assistant" as const,
                      content: payload.text!,
                      at: Date.now(),
                    },
                  ];
                  streamingIndexRef.current = next.length - 1;
                  return next;
                });
              } else {
                const index = streamingIndexRef.current;
                setMessages((m) =>
                  m.map((msg, i) =>
                    i === index
                      ? { ...msg, content: msg.content + payload.text }
                      : msg
                  )
                );
              }
            } else if (payload.type === "blocks" && payload.blocks) {
              const index = streamingIndexRef.current;
              if (index !== null) {
                setMessages((m) =>
                  m.map((msg, i) =>
                    i === index ? { ...msg, blocks: payload.blocks } : msg
                  )
                );
              }
            } else if (payload.type === "done" && payload.conversationId) {
              setConversationId(payload.conversationId);
            } else if (payload.type === "error") {
              throw new Error(payload.message ?? "Something went wrong.");
            }
          }
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Something went wrong. Please retry.";
        setError(message);
        setLastFailed(content);
        setMessages((m) => [
          ...m,
          {
            id: newId("m"),
            role: "assistant",
            content: message,
            at: Date.now(),
            failed: true,
          },
        ]);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, key, conversationId]
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function reset() {
    setMessages(
      resolvedGreeting
        ? [{ id: newId("m"), role: "assistant", content: resolvedGreeting, at: Date.now() }]
        : []
    );
    setConversationId(null);
    setError("");
    setLastFailed(null);
  }

  // --- cart actions -------------------------------------------------------

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (conversationId && CONVERSATION_ID.test(conversationId)) {
      return conversationId;
    }
    return null;
  }, [conversationId]);

  const pushCart = useCallback(
    async (
      operation: "add" | "remove" | "set" | "clear" | "checkout",
      payload: Record<string, unknown> = {}
    ) => {
      if (!key) return null;
      const conversation = await ensureConversation();
      if (!conversation) {
        // No conversation yet: the assistant creates one on the first message.
        // The cart is rebuilt from the assistant's own cart after that.
        return null;
      }
      const res = await fetch("/api/widget/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          conversationId: conversation,
          visitorId: visitorIdRef.current ?? undefined,
          operation,
          ...payload,
        }),
      });
      const parsed = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          parsed?.error?.message ?? "We could not update your cart."
        );
      }
      return parsed?.data ?? null;
    },
    [key, ensureConversation]
  );

  const addProduct = useCallback(
    async (
      product: WidgetProduct,
      selections: WidgetSelection[] = [],
      quantity = 1
    ) => {
      try {
        const data = await pushCart("add", {
          items: [
            { itemId: product.itemId, quantity, selections },
          ],
        });
        if (data) {
          setCart({ ...(data as WidgetCartSummary), currency: product.currency });
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "We could not update your cart."
        );
      }
    },
    [pushCart]
  );

  const changeLineQuantity = useCallback(
    async (index: number, quantity: number) => {
      const line = cart?.lines?.[index];
      if (!line) return;
      const selections = (cart?.lines as Array<{ selections?: unknown }>)[index]
        ?.selections;
      try {
        const data = await pushCart("set", {
          items: [
            {
              itemId: line.itemId,
              quantity: Math.max(0, Math.min(20, quantity)),
              selections: selections ?? [],
            },
          ],
        });
        if (data) setCart({ ...(data as WidgetCartSummary), currency: "PKR" });
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "We could not update your cart."
        );
      }
    },
    [cart, pushCart]
  );

  const removeLine = useCallback(
    async (index: number) => {
      const line = cart?.lines?.[index];
      if (!line) return;
      try {
        const data = await pushCart("set", {
          items: [{ itemId: line.itemId, quantity: 0, selections: [] }],
        });
        if (data) setCart({ ...(data as WidgetCartSummary), currency: "PKR" });
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "We could not update your cart."
        );
      }
    },
    [cart, pushCart]
  );

  const checkout = useCallback(
    async (details: {
      customerName: string;
      customerPhone: string;
      fulfilmentType: "delivery" | "pickup";
      address: string;
      notes: string;
    }) => {
      setSubmitting(true);
      setCheckoutError(null);
      try {
        const data = await pushCart("checkout", details);
        if (data?.order) {
          const order = data.order as {
            orderNumber: string;
            totalLabel: string;
            fulfilmentType: string;
            address: string | null;
            trackUrl: string;
          };
          setMessages((m) => [
            ...m,
            {
              id: newId("m"),
              role: "assistant",
              content: "Your order is confirmed. The restaurant will call you to double-check.",
              at: Date.now(),
              blocks: [
                {
                  type: "order_confirmation",
                  order: {
                    orderId: "",
                    orderNumber: order.orderNumber,
                    totalLabel: order.totalLabel,
                    subtotalLabel: "",
                    discountLabel: "",
                    deliveryFeeLabel: "",
                    fulfilmentType: order.fulfilmentType,
                    address: order.address,
                    itemCount: cart?.itemCount ?? 0,
                    lines: cart?.lines ?? [],
                    trackUrl: order.trackUrl,
                    status: "received",
                  },
                },
              ],
            },
          ]);
          setCart(null);
          setCartOpen(false);
        }
      } catch (err: unknown) {
        setCheckoutError(
          err instanceof Error ? err.message : "We could not place the order."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [pushCart, cart]
  );

  const promptChips = useMemo(() => {
    if (suggestions && suggestions.length > 0) return suggestions;
    return starterPrompts;
  }, [suggestions, starterPrompts]);

  const cartCount = cart?.itemCount ?? 0;

  if (error && messages.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-6 text-sm text-muted-foreground",
          className
        )}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-background",
        embedded
          ? "h-full rounded-xl border border-border"
          : "h-screen",
        className
      )}
      style={
        {
          "--cc-brand": theme.primaryColor,
          "--cc-accent": theme.accentColor,
          "--cc-radius": RADIUS[theme.radius],
          "--cc-font": FONT_STACK[theme.fontPreset],
          fontFamily: "var(--cc-font)",
        } as React.CSSProperties
      }
    >
      <div
        className="flex items-center gap-2.5 border-b border-border px-3 py-2.5"
        style={{ background: "var(--cc-brand)", color: "#fff" }}
      >
        {theme.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={theme.logoUrl}
            alt=""
            className="size-8 shrink-0 rounded-full bg-white/20 object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20"
          >
            <Store className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
            {businessNameState ?? title}
          </p>
          {subtitle ? (
            <p className="truncate text-[11px] opacity-85">{subtitle}</p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-white hover:bg-white/15"
          onClick={reset}
          aria-label="Start a new conversation"
        >
          <RefreshCw />
        </Button>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-white hover:bg-white/15"
            onClick={onClose}
            aria-label="Close chat"
          >
            <X />
          </Button>
        ) : null}
      </div>

      <div
        ref={scroller}
        className="flex-1 overflow-y-auto bg-muted/30 px-3 py-3"
        aria-live="polite"
        aria-label="Conversation"
      >
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div key={m.id} className="flex flex-col gap-2">
              <div
                className={cn(
                  "flex items-end gap-2",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {m.role === "assistant" && (
                  <span
                    aria-hidden="true"
                    className="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                  >
                    <Bot className="size-3.5" />
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                    m.role === "user"
                      ? "rounded-br-sm text-white"
                      : cn(
                          "rounded-bl-sm border border-border bg-background",
                          m.failed &&
                            "border-destructive/40 bg-destructive/5 text-destructive"
                        )
                  )}
                  style={m.role === "user" ? { background: "var(--cc-brand)" } : undefined}
                >
                  {m.content}
                </div>
                {m.role === "user" && (
                  <span
                    aria-hidden="true"
                    className="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                  >
                    <User className="size-3.5" />
                  </span>
                )}
              </div>

              {m.blocks?.map((block, blockIndex) => (
                <div key={`${m.id}-b${blockIndex}`} className="pl-8">
                  {block.type === "product_carousel" ||
                  block.type === "product_list" ? (
                    features.showProducts ? (
                      <ProductCarousel
                        products={block.products}
                        layout={
                          block.type === "product_list" ? "list" : "carousel"
                        }
                        showImages={features.showImages}
                        onAdd={(product) => void addProduct(product)}
                        onConfigure={(product) => setConfiguring(product)}
                      />
                    ) : null
                  ) : null}
                  {block.type === "cart_summary" ? (
                    <CartSummaryCard
                      cart={block.cart}
                      onViewCart={
                        features.showCart ? () => setCartOpen(true) : undefined
                      }
                    />
                  ) : null}
                  {block.type === "order_confirmation" ? (
                    <OrderConfirmationCard
                      order={block.order}
                      currency={cart?.currency ?? "PKR"}
                    />
                  ) : null}
                  {block.type === "notice" ? (
                    <NoticeCard tone={block.tone} text={block.text} />
                  ) : null}
                  {block.type === "handoff" ? (
                    <HandoffCard text={block.text} />
                  ) : null}
                </div>
              ))}
            </div>
          ))}

          {busy ? (
            <div className="flex items-end gap-2">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
              >
                <Bot className="size-3.5" />
              </span>
              <div className="rounded-2xl rounded-bl-sm border border-border bg-background px-3.5 py-2.5">
                <span className="inline-flex gap-1" aria-label="Assistant is typing">
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:0ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:120ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:240ms]" />
                </span>
              </div>
            </div>
          ) : null}

          {messages.length <= 1 && promptChips.length > 0 && !busy ? (
            <div className="flex flex-col gap-1.5">
              <p className="pl-8 text-[11px] text-muted-foreground">
                Try one of these
              </p>
              <div className="pl-8">
                <QuickReplies
                  items={promptChips.map((label) => ({ id: label, label }))}
                  onSelect={(label) => void send(label)}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {features.showCart && cartCount > 0 ? (
        <div className="border-t-2 border-dashed border-border bg-background px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs">
              <ShoppingBag className="size-3.5" aria-hidden="true" />
              <span className="font-medium">
                {cartCount} item{cartCount === 1 ? "" : "s"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-semibold tabular-nums">
                {cart?.totalLabel ?? ""}
              </span>
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => setCartOpen(true)}
            >
              View cart
            </Button>
          </div>
        </div>
      ) : null}

      {lastFailed ? (
        <div className="flex items-center justify-between gap-2 border-t border-border bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <span>Message could not be delivered.</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-destructive"
            onClick={() => void send(lastFailed)}
          >
            <RefreshCw data-icon="inline-start" />
            Retry
          </Button>
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-border bg-background px-3 py-2"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <label htmlFor={`chat-input-${key}`} className="sr-only">
          Message
        </label>
        <Input
          id={`chat-input-${key}`}
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={busy}
          autoComplete="off"
          className="h-11"
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 shrink-0"
          style={{ background: "var(--cc-brand)" }}
          disabled={busy || !input.trim()}
        >
          <Send />
          <span className="sr-only">Send</span>
        </Button>
      </form>

      {features.showStorefrontLink && businessNameState ? (
        <div className="border-t border-border bg-muted/40 px-3 py-1.5 text-center">
          <Badge variant="outline" className="text-[10px] font-normal">
            <MessageCircle data-icon="inline-start" />
            Powered by CafeConnect AI agent
          </Badge>
        </div>
      ) : null}

      <ItemConfigurator
        open={configuring !== null}
        onOpenChange={(open) => {
          if (!open) setConfiguring(null);
        }}
        product={configuring}
        onAdd={(product, selections, quantity) => {
          void addProduct(product, selections, quantity);
          setConfiguring(null);
        }}
      />

      <CartPanel
        open={cartOpen}
        onOpenChange={setCartOpen}
        cart={cart}
        onQuantityChange={(index, quantity) =>
          void changeLineQuantity(index, quantity)
        }
        onRemove={(index) => void removeLine(index)}
        onCheckout={checkout}
        submitting={submitting}
        error={checkoutError}
        pickupAvailable
        minimumOrderMinor={0}
        minimumOrderLabel={cart?.minimumOrderLabel ?? null}
      />
    </div>
  );
}
