import { formatMoney } from "@/lib/utils";

/**
 * "2500.00" -> 250000 paisa. Parsed digit by digit so prices never pass
 * through floating point. Returns null for anything that is not a plain
 * non-negative decimal with at most two fraction digits.
 */
export function decimalToMinor(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return Number.parseInt(match[1], 10) * 100 + Number.parseInt((match[2] ?? "0").padEnd(2, "0"), 10);
}

export function formatPrice(value: string, currency = "NPR"): string {
  const minor = decimalToMinor(value);
  return minor === null ? value : formatMoney(minor, currency);
}

export function formatMinutes(total: number): string {
  if (total <= 0) return "";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function lessonPath(courseSlug: string, lessonId: number): string {
  return `/learn/${encodeURIComponent(courseSlug)}/${lessonId}`;
}
