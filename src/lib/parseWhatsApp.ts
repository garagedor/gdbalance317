/**
 * Best-effort parser for WhatsApp closing texts a tech might paste in.
 * Returns ONLY likely values — the technician must confirm/edit before save.
 * The backend is still the source of truth for any computed field.
 */
import type { JobInput, PaymentType, TipType } from "@/lib/finance";

export interface ParsedSuggestion extends Partial<JobInput> {
  job_date?: string;
  customer_name?: string | null;
  address?: string | null;
  notes?: string | null;
  source_text?: string | null;
}

const moneyRe = /\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/;

function num(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.match(moneyRe);
  if (!m) return undefined;
  const v = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(v) ? v : undefined;
}

export function parseWhatsApp(raw: string): ParsedSuggestion {
  const text = raw.trim();
  if (!text) return { source_text: raw };

  const out: ParsedSuggestion = { source_text: raw, notes: null };
  const lower = text.toLowerCase();

  // Total
  const totalMatch = lower.match(/(?:total|job)[^\n$0-9]*\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  out.total_job = num(totalMatch?.[0]);

  // Tip
  const tipMatch = lower.match(/tip[^\n$0-9]*\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  if (tipMatch) {
    out.tip_amount = num(tipMatch[0]);
    if (/cash\s*tip|tip[^a-z]*cash/.test(lower)) out.tip_type = "Cash" as TipType;
    else if (/card\s*tip|tip[^a-z]*card/.test(lower)) out.tip_type = "Card" as TipType;
  }

  // Parts
  const myParts = lower.match(/(?:my\s*parts|tech\s*parts|parts\s*\(me\))[^\n$0-9]*\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  if (myParts) out.my_parts = num(myParts[0]);

  const compParts = lower.match(/(?:company\s*parts|warehouse\s*parts|parts\s*\(co\))[^\n$0-9]*\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  if (compParts) out.company_parts = num(compParts[0]);

  // Tech cash
  const techCash = lower.match(/(?:tech\s*cash|cash\s*to\s*tech|i\s*kept)[^\n$0-9]*\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  if (techCash) out.tech_cash = num(techCash[0]);

  // Payment type heuristic
  if (/\b(card|credit|cc)\b/.test(lower) && /\bcash\b/.test(lower)) {
    out.payment_type = "Split" as PaymentType;
  } else if (/\b(card|credit|cc)\b/.test(lower)) {
    out.payment_type = "Card" as PaymentType;
  } else if (/\bcash\b/.test(lower)) {
    out.payment_type = "Cash" as PaymentType;
  }

  // Customer (first line if it looks like a name)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines[0] && lines[0].length < 60 && !/[\d$]/.test(lines[0])) {
    out.customer_name = lines[0];
  }

  // Address: a line that contains digits + a street keyword
  const addrLine = lines.find((l) => /\d/.test(l) && /(st|street|ave|road|rd|blvd|drive|dr|lane|ln|ct|way)/i.test(l));
  if (addrLine) out.address = addrLine;

  return out;
}
