/** Shared types + labels for the order board components. */

export interface OrderItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  options?: Array<{
    groupName: string;
    optionNames: string[];
  }>;
}

export interface Order {
  orderId: string;
  orderNumber: string;
  channel: string;
  status: string;
  paymentStatus: string;
  /** Statuses the server will accept for this order right now. */
  allowedNext?: string[];
  items: OrderItem[];
  totalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  currency: string;
  appliedOffer: string | null;
  customer: { name?: string; phone?: string };
  fulfilment: { type?: string; address?: string | null };
  notes?: string;
  createdAt: string;
}

export interface CartView {
  cartId: string;
  channel: string;
  status: string;
  items: Array<{ name: string; quantity: number }>;
  cartRevision: number;
  totalLabel: string | null;
  customer: { name?: string | null; phone?: string | null } | null;
  updatedAt: string;
}

export const CHANNEL_LABEL: Record<string, string> = {
  web: "Website",
  whatsapp_qr: "WhatsApp",
  whatsapp_meta: "WhatsApp (Meta)",
  storefront: "Store",
};

export const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  dispatched: "Dispatched",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};
