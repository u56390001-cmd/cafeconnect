/**
 * Phone normalisation (Pakistan-first, forgiving but validated).
 *
 * Customers type "03xx xxxxxxx" or "+92 3xx xxxxxxx". Both are accepted and
 * stored in one canonical form (E.164 digits only) so order lookup by phone
 * works. International numbers are kept as-is - we never silently rewrite a
 * foreign number to a Pakistani one.
 */

export const PK_COUNTRY_CODE = "92";
export const PK_MOBILE_PREFIX = "3";
/** Pakistani landline area codes (restaurants are often reached on these). */
const PK_LANDLINE_CODES = [
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
];

export interface PhoneResult {
  ok: boolean;
  /** Digits only, E.164 without a plus (e.g. 923001234567). */
  normalized: string;
  /** Display form for the customer, e.g. "0300-1234567" or "+92 300 1234567". */
  display: string;
  error?: string;
}

export const PHONE_HINT = "03xx xxxxxxx ya +92 3xx xxxxxxx";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizePhone(input: string): PhoneResult {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return { ok: false, normalized: "", display: "", error: "Phone number is required" };
  }

  const digits = digitsOnly(raw);
  if (digits.length < 8 || digits.length > 15) {
    return {
      ok: false,
      normalized: "",
      display: raw,
      error: "Enter a valid phone number (03xx xxxxxxx ya +92 3xx xxxxxxx)",
    };
  }

  // Local Pakistani mobile: 03xxxxxxxxx (11 digits with the 0).
  if (/^0\d{10}$/.test(digits)) {
    const national = digits.slice(1);
    if (!national.startsWith(PK_MOBILE_PREFIX)) {
      return {
        ok: false,
        normalized: "",
        display: raw,
        error: "Enter a valid Pakistani mobile number (03xx xxxxxxx)",
      };
    }
    return {
      ok: true,
      normalized: `${PK_COUNTRY_CODE}${national}`,
      display: `0${national.slice(0, 3)}-${national.slice(3)}`,
    };
  }

  // Pakistani landline (021, 022, ... 029): keep it, but store it in E.164.
  if (/^0\d{9}$/.test(digits)) {
    const areaCode = digits.slice(1, 3);
    if (PK_LANDLINE_CODES.includes(areaCode)) {
      return {
        ok: true,
        normalized: `${PK_COUNTRY_CODE}${digits.slice(1)}`,
        display: `0${digits.slice(1, 3)}-${digits.slice(3)}`,
      };
    }
    return {
      ok: false,
      normalized: "",
      display: raw,
      error: "Enter a valid phone number (03xx xxxxxxx ya +92 3xx xxxxxxx)",
    };
  }

  // Pakistani number without the leading zero: 923001234567 / 923001234567.
  if (/^92\d{10}$/.test(digits)) {
    const national = digits.slice(2);
    if (!national.startsWith(PK_MOBILE_PREFIX)) {
      return {
        ok: false,
        normalized: "",
        display: raw,
        error: "Enter a valid Pakistani mobile number (03xx xxxxxxx)",
      };
    }
    return {
      ok: true,
      normalized: digits,
      display: `+${PK_COUNTRY_CODE} ${national.slice(0, 3)} ${national.slice(3)}`,
    };
  }

  // International numbers are accepted and kept unchanged.
  if (digits.length >= 10 && digits.length <= 15) {
    return {
      ok: true,
      normalized: digits,
      display: `+${digits}`,
    };
  }

  return {
    ok: false,
    normalized: "",
    display: raw,
    error: "Enter a valid phone number (03xx xxxxxxx ya +92 3xx xxxxxxx)",
  };
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input).ok;
}

/** Normalises for storage, falling back to the raw digits when invalid. */
export function phoneForStorage(input: string): string {
  const result = normalizePhone(input);
  if (result.ok) return result.normalized;
  return digitsOnly(input);
}
