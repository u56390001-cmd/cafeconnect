/**
 * Money helpers (Pakistan-first).
 *
 * Amounts are stored as integer minor units (paisa). One shared formatter is
 * used by the storefront, the cart, the dashboard, the AI replies and the
 * receipts so the customer never sees two different numbers.
 */

export const DEFAULT_CURRENCY = "PKR";

const CURRENCY_LABELS: Record<string, string> = {
  PKR: "Rs",
  INR: "Rs",
  AED: "AED",
  SAR: "SAR",
  USD: "$",
  GBP: "£",
  EUR: "€",
};

export function currencyLabel(currency: string = DEFAULT_CURRENCY): string {
  return CURRENCY_LABELS[currency?.toUpperCase()] ?? currency?.toUpperCase() ?? "Rs";
}

/**
 * Formats minor units as a customer-facing amount.
 * Whole rupees stay whole ("Rs 1,250"); fractions are kept, not rounded away.
 */
export function formatMoney(
  amountMinor: number,
  currency: string = DEFAULT_CURRENCY
): string {
  const safe = Number.isFinite(amountMinor) ? amountMinor : 0;
  const major = safe / 100;
  const hasFraction = Math.abs(safe % 100) !== 0;
  const number = hasFraction
    ? major.toLocaleString("en-PK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : Math.round(major).toLocaleString("en-PK");
  return `${currencyLabel(currency)} ${number}`;
}

/** Compact label for tight spaces (cart bar, chips): "Rs 1,250". */
export function formatMoneyShort(
  amountMinor: number,
  currency: string = DEFAULT_CURRENCY
): string {
  return formatMoney(amountMinor, currency);
}

export function minorToMajor(amountMinor: number): number {
  return amountMinor / 100;
}

export function majorToMinor(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}
