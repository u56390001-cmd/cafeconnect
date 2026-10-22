import { formatMoney } from "@/lib/domain/money";

/**
 * Printable tickets for the restaurant counter.
 *
 * The same helper is used by the POS and the order hub so a printed bill is
 * always identical, no matter where it was triggered from. The browser print
 * dialog is used - no extra dependency and no server-side rendering of HTML.
 */

export interface PrintableLine {
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  basePriceMinor?: number;
  options?: Array<{ groupName: string; optionNames: string[] }>;
  note?: string;
}

export interface PrintableOrder {
  orderNumber: string;
  businessName?: string;
  createdAt?: string | Date;
  fulfilmentType?: string;
  address?: string | null;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  items: PrintableLine[];
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  currency: string;
  appliedOffer?: string | null;
  paymentStatus?: string;
  paymentMethod?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(minor: number, currency: string): string {
  return formatMoney(minor, currency);
}

function lineOptionText(line: PrintableLine): string {
  if (!line.options || line.options.length === 0) return "";
  return line.options
    .map((option) => `${option.groupName}: ${option.optionNames.join(", ")}`)
    .join(" · ");
}

function ticketHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    color: #111827;
    background: #ffffff;
  }
  h1 { font-size: 15px; margin: 0 0 8px; }
  .muted { color: #6b7280; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .total { font-weight: 700; font-size: 14px; }
  ul { list-style: none; margin: 8px 0; padding: 0; }
  li { border-bottom: 1px dashed #e5e7eb; padding: 6px 0; }
  .note { color: #6b7280; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function openPrintWindow(title: string, html: string): boolean {
  if (typeof window === "undefined") return false;
  const popup = window.open("", "_blank", "width=420,height=680");
  if (!popup) return false;
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  // Give the browser a moment to lay the ticket out before printing.
  setTimeout(() => popup.print(), 150);
  return true;
}

/** Kitchen ticket: items, options and notes - no prices. */
export function printKot(order: PrintableOrder): boolean {
  const rows = order.items
    .map((line) => {
      const options = lineOptionText(line);
      return `<li>
        <div class="row"><span>${line.quantity} x ${escapeHtml(line.name)}</span></div>
        ${options ? `<div class="note">${escapeHtml(options)}</div>` : ""}
        ${line.note ? `<div class="note">Note: ${escapeHtml(line.note)}</div>` : ""}
      </li>`;
    })
    .join("");

  const body = `<h1>${escapeHtml(order.businessName ?? "Kitchen")} — KOT</h1>
    <div class="row"><span>Order</span><span>${escapeHtml(order.orderNumber)}</span></div>
    <div class="row"><span>Placed</span><span>${escapeHtml(
      new Date(order.createdAt ?? Date.now()).toLocaleString()
    )}</span></div>
    <div class="row"><span>Type</span><span>${
      order.fulfilmentType === "pickup" ? "Counter / Pickup" : "Delivery"
    }</span></div>
    ${order.address ? `<div class="row"><span>Address</span><span>${escapeHtml(order.address)}</span></div>` : ""}
    ${order.customerName ? `<div class="row"><span>Customer</span><span>${escapeHtml(order.customerName)}</span></div>` : ""}
    <ul>${rows}</ul>
    ${order.notes ? `<div class="note">Order note: ${escapeHtml(order.notes)}</div>` : ""}`;

  return openPrintWindow(`KOT ${order.orderNumber}`, ticketHtml(`KOT ${order.orderNumber}`, body));
}

/** Customer bill: items with options, charges, discount and total. */
export function printBill(order: PrintableOrder): boolean {
  const rows = order.items
    .map((line) => {
      const options = lineOptionText(line);
      const breakdown =
        line.basePriceMinor !== undefined && line.unitPriceMinor !== line.basePriceMinor
          ? `<div class="note">${money(line.basePriceMinor, order.currency)} + ${
              line.quantity
            } × ${money(line.unitPriceMinor - (line.basePriceMinor ?? 0), order.currency)}</div>`
          : "";
      return `<li>
        <div class="row"><span>${line.quantity} x ${escapeHtml(line.name)}</span><span>${money(
          line.lineTotalMinor,
          order.currency
        )}</span></div>
        ${options ? `<div class="note">${escapeHtml(options)}</div>` : ""}
        ${breakdown}
        ${line.note ? `<div class="note">Note: ${escapeHtml(line.note)}</div>` : ""}
      </li>`;
    })
    .join("");

  const body = `<h1>${escapeHtml(order.businessName ?? "Bill")}</h1>
    <div class="row"><span>Order</span><span>${escapeHtml(order.orderNumber)}</span></div>
    <div class="row"><span>Placed</span><span>${escapeHtml(
      new Date(order.createdAt ?? Date.now()).toLocaleString()
    )}</span></div>
    ${order.customerName ? `<div class="row"><span>Customer</span><span>${escapeHtml(order.customerName)}</span></div>` : ""}
    ${order.customerPhone ? `<div class="row"><span>Phone</span><span>${escapeHtml(order.customerPhone)}</span></div>` : ""}
    <div class="row"><span>Type</span><span>${
      order.fulfilmentType === "pickup" ? "Counter / Pickup" : "Delivery"
    }</span></div>
    ${order.address ? `<div class="row"><span>Address</span><span>${escapeHtml(order.address)}</span></div>` : ""}
    <ul>${rows}</ul>
    <div class="row"><span>Subtotal</span><span>${money(order.subtotalMinor, order.currency)}</span></div>
    ${
      order.discountMinor > 0
        ? `<div class="row"><span>Discount${order.appliedOffer ? ` (${escapeHtml(order.appliedOffer)})` : ""}</span><span>-${money(
            order.discountMinor,
            order.currency
          )}</span></div>`
        : ""
    }
    ${
      order.deliveryFeeMinor > 0
        ? `<div class="row"><span>Delivery</span><span>${money(order.deliveryFeeMinor, order.currency)}</span></div>`
        : ""
    }
    <div class="row total"><span>Total</span><span>${money(order.totalMinor, order.currency)}</span></div>
    <div class="row"><span>Payment</span><span>${escapeHtml(
      order.paymentMethod ?? order.paymentStatus ?? "unpaid"
    )}</span></div>
    ${order.notes ? `<div class="note">Note: ${escapeHtml(order.notes)}</div>` : ""}
    <p class="muted">Thank you.</p>`;

  return openPrintWindow(
    `Bill ${order.orderNumber}`,
    ticketHtml(`Bill ${order.orderNumber}`, body)
  );
}
