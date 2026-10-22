/**
 * Order fulfilment state machine.
 *
 * The client may only ask for a transition; the server decides whether it is
 * legal. Payment status is deliberately separate from fulfilment status.
 */

export const ORDER_STATUSES = [
  "received",
  "confirmed",
  "preparing",
  "ready",
  "dispatched",
  "completed",
  "declined",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FULFILMENT_TYPES = ["delivery", "pickup"] as const;
export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

export const TERMINAL_STATUSES: OrderStatus[] = [
  "completed",
  "declined",
  "cancelled",
];

/**
 * Legal transitions per fulfilment mode.
 * - delivery: ready -> dispatched -> completed
 * - pickup:   ready -> completed
 */
const TRANSITIONS: Record<FulfilmentType, Record<OrderStatus, OrderStatus[]>> = {
  delivery: {
    received: ["confirmed", "declined", "cancelled"],
    confirmed: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["dispatched", "completed", "cancelled"],
    dispatched: ["completed"],
    completed: [],
    declined: [],
    cancelled: [],
  },
  pickup: {
    received: ["confirmed", "declined", "cancelled"],
    confirmed: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["completed", "cancelled"],
    dispatched: [],
    completed: [],
    declined: [],
    cancelled: [],
  },
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    typeof value === "string" &&
    (PAYMENT_STATUSES as readonly string[]).includes(value)
  );
}

export function isFulfilmentType(value: unknown): value is FulfilmentType {
  return (
    typeof value === "string" &&
    (FULFILMENT_TYPES as readonly string[]).includes(value)
  );
}

/** The statuses a staff member may move the order to right now. */
export function allowedTransitions(
  current: OrderStatus,
  fulfilmentType: FulfilmentType
): OrderStatus[] {
  if (TERMINAL_STATUSES.includes(current)) return [];
  return TRANSITIONS[fulfilmentType][current] ?? [];
}

export function canTransition(
  current: OrderStatus,
  next: OrderStatus,
  fulfilmentType: FulfilmentType
): boolean {
  return allowedTransitions(current, fulfilmentType).includes(next);
}

export interface TransitionResult {
  ok: boolean;
  error?: string;
  allowed: OrderStatus[];
}

export function checkTransition(
  current: OrderStatus,
  next: OrderStatus,
  fulfilmentType: FulfilmentType
): TransitionResult {
  const allowed = allowedTransitions(current, fulfilmentType);
  if (allowed.includes(next)) {
    return { ok: true, allowed };
  }
  return {
    ok: false,
    allowed,
    error:
      current === next
        ? `Order is already ${current}`
        : `Cannot move an order from ${current} to ${next}`,
  };
}
