/**
 * Channel capability registry.
 *
 * The web widget can render cards, carousels and configurators. WhatsApp can
 * only render what the provider, the account and the current messaging
 * policy allow. This registry records what each channel may use, so the
 * presentation layer can always pick the richest *supported* option and fall
 * back to readable text instead of failing.
 */

export type ChannelCapability =
  | "text"
  | "image"
  | "replyButtons"
  | "listMessages"
  | "catalogProducts"
  | "messageTemplates"
  | "deliveryStatus";

export type ChannelName = "web" | "whatsapp_meta" | "whatsapp_qr";

const CAPABILITIES: Record<ChannelName, ChannelCapability[]> = {
  web: [
    "text",
    "image",
    "replyButtons",
    "listMessages",
    "catalogProducts",
    "messageTemplates",
    "deliveryStatus",
  ],
  // Meta Cloud API supports interactive messages, but only for accounts that
  // are approved for them. Until an account is verified, text is the only
  // capability we rely on, so ordering never depends on rich messages.
  whatsapp_meta: ["text"],
  // The QR provider is a session-based trial adapter with no verified
  // interactive message support.
  whatsapp_qr: ["text"],
};

export function supports(
  channel: ChannelName,
  capability: ChannelCapability
): boolean {
  return (CAPABILITIES[channel] ?? CAPABILITIES.web).includes(capability);
}

export function capabilitiesFor(channel: ChannelName): ChannelCapability[] {
  return [...(CAPABILITIES[channel] ?? CAPABILITIES.web)];
}

export interface ProductListLine {
  name: string;
  priceLabel: string;
}

/**
 * Text fallback for a product list on channels without interactive messages:
 * a short numbered list the customer can answer with a number or the name.
 */
export function formatProductListText(
  lines: ProductListLine[],
  options: { currency: string; intro?: string } = { currency: "PKR" }
): string {
  if (lines.length === 0) return "";
  const intro =
    options.intro ??
    (lines.length <= 4
      ? "Ye items available hain:"
      : "Ye kuch popular items hain:");
  const body = lines
    .map((line, index) => `${index + 1}. ${line.name} — ${line.priceLabel}`)
    .join("\n");
  return `${intro}\n${body}\n\nReply with the number or the item name.`;
}
