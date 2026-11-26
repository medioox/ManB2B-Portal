const faDigits = "۰۱۲۳۴۵۶۷۸۹";

export function fa(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\d/g, (d) => faDigits[+d]);
}

export function num(v: number | string | null | undefined, digits = 0): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: digits }).format(isFinite(n) ? n : 0);
}

export function rial(v: number | string | null | undefined): string {
  return `${num(v)} ریال`;
}

/** Compact amount for KPIs/charts: ۱٫۲ میلیارد */
export function short(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  const a = Math.abs(n);
  if (a >= 1e9) return `${num(n / 1e9, 1)} میلیارد`;
  if (a >= 1e6) return `${num(n / 1e6, 0)} میلیون`;
  return num(n);
}

const dfmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit" });
const dlong = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric" });
const dtime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

function toDate(v: string | Date) {
  if (v instanceof Date) return v;
  return new Date(v.length === 10 ? v + "T12:00:00" : v);
}
export const jdate = (v?: string | Date | null) => (v ? dfmt.format(toDate(v)) : "—");
export const jlong = (v?: string | Date | null) => (v ? dlong.format(toDate(v)) : "—");
export const jtime = (v?: string | Date | null) => (v ? dtime.format(toDate(v)) : "—");

export function ago(v?: string | null): string {
  if (!v) return "—";
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return "همین الان";
  if (s < 3600) return `${fa(Math.floor(s / 60))} دقیقه پیش`;
  if (s < 86400) return `${fa(Math.floor(s / 3600))} ساعت پیش`;
  if (s < 86400 * 30) return `${fa(Math.floor(s / 86400))} روز پیش`;
  return jdate(v);
}

export function toEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(faDigits.indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

export function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}
