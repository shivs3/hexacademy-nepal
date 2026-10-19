import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NEPAL_TZ = "Asia/Kathmandu";

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: NEPAL_TZ, ...opts }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: NEPAL_TZ,
  }).format(new Date(iso));
}

/** Money is transferred as integer paisa (minor units) to avoid floating point. */
export function formatMoney(minor: number, currency = "NPR"): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const grouped = new Intl.NumberFormat("en-IN").format(Math.floor(abs / 100));
  const paisa = abs % 100;
  const symbol = currency === "NPR" ? "Rs." : currency;
  return `${sign}${symbol} ${grouped}${paisa ? `.${String(paisa).padStart(2, "0")}` : ""}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `datetime-local` input value (browser time zone) for a Date. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
