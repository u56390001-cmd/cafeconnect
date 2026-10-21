import { tenantCollection } from "@/lib/tenancy/resolver";

/**
 * Booking domain logic (Phase 6).
 *
 * Shared by the dashboard route and the AI tool, so both apply exactly the same
 * validation rules.
 */

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";
export type BookingType = "table" | "reservation" | "event";

export const BOOKING_TYPES: BookingType[] = ["table", "reservation", "event"];

export class BookingError extends Error {
  readonly code:
    | "INVALID_CUSTOMER_NAME"
    | "INVALID_PHONE"
    | "INVALID_DATE"
    | "INVALID_TIME"
    | "INVALID_PARTY_SIZE"
    | "INVALID_TYPE"
    | "BOOKING_IN_PAST";
  readonly details: Record<string, unknown>;

  constructor(
    code: BookingError["code"],
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "BookingError";
    this.code = code;
    this.details = details;
  }
}

export interface CreateBookingInput {
  tenantId: string;
  customerName: string;
  phone: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm (24h) */
  time: string;
  partySize: number;
  notes?: string;
  type?: BookingType;
  createdBy?: string;
  /** Allow bookings in the past (admin corrections). */
  allowPast?: boolean;
}

export async function createBooking(
  input: CreateBookingInput
): Promise<{ bookingId: string; status: BookingStatus }> {
  const name = String(input.customerName ?? "").trim();
  if (!name || name.length > 100) {
    throw new BookingError("INVALID_CUSTOMER_NAME", "Invalid customer name");
  }
  const phone = String(input.phone ?? "").trim();
  if (!/^[+\d][\d\s-]{6,15}$/.test(phone)) {
    throw new BookingError("INVALID_PHONE", "Invalid phone number");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))) {
    throw new BookingError("INVALID_DATE", "Invalid date");
  }
  if (!/^\d{2}:\d{2}$/.test(String(input.time))) {
    throw new BookingError("INVALID_TIME", "Invalid time");
  }
  const partySize = Number(input.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) {
    throw new BookingError("INVALID_PARTY_SIZE", "Invalid party size");
  }
  const type = input.type ?? "table";
  if (!BOOKING_TYPES.includes(type)) {
    throw new BookingError("INVALID_TYPE", "Invalid booking type");
  }
  if (!input.allowPast) {
    const bookedAt = new Date(`${input.date}T${input.time}:00`);
    if (Number.isNaN(bookedAt.getTime())) {
      throw new BookingError("INVALID_DATE", "Invalid date");
    }
    if (bookedAt.getTime() < Date.now() - 60 * 60 * 1000) {
      throw new BookingError("BOOKING_IN_PAST", "That date and time are in the past");
    }
  }

  const docRef = tenantCollection(input.tenantId, "bookings").doc();
  await docRef.set({
    bookingId: docRef.id,
    tenantId: input.tenantId,
    type,
    customerName: name,
    phone,
    date: input.date,
    time: input.time,
    partySize,
    notes: typeof input.notes === "string" ? input.notes.slice(0, 500) : "",
    status: "pending" as BookingStatus,
    branchId: null,
    createdBy: input.createdBy ?? "ai_agent",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { bookingId: docRef.id, status: "pending" };
}
