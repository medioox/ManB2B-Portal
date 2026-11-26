/**
 * In-browser mock of the Django API for the static demo. It mirrors the backend rules closely
 * (pricing per group, tiered discount, credit check, order status flow, scoping per role)
 * and works on a snapshot exported with `manage.py export_demo` (same serializer shapes).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { tokens } from "@/lib/api";

type R = { status: number; data: any };
const ok = (data: any, status = 200): R => ({ status, data });
const err = (status: number, detail: string, errors?: any): R => ({ status, data: { detail, errors: errors ?? {} } });

let D: any;
let nextId = 100000;
const nid = () => ++nextId;
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const STAFF = ["admin", "sales_manager", "sales_rep", "staff"];
const CUSTOMER = ["distributor", "store", "organization", "lab"];
const OTP: Record<string, string> = {};
const carts: Record<number, Record<number, number>> = {};
const done: Record<string, Set<number>> = {};
const STATUS_LABEL: Record<string, string> = { submitted: "ثبت شده", confirmed: "تأیید شده", preparing: "در حال آماده‌سازی", shipped: "ارسال شده", delivered: "تحویل شده", canceled: "لغو شده" };
const FLOW = ["submitted", "confirmed", "preparing", "shipped", "delivered"];
const NEXT: Record<string, string[]> = { submitted: ["confirmed", "canceled"], confirmed: ["preparing", "canceled"], preparing: ["shipped", "canceled"], shipped: ["delivered"], delivered: [], canceled: [] };
const JM = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

/* ---------------------------------------------------------------- helpers */
function shiftDates(obj: any, ms: number): any {
  if (Array.isArray(obj)) return obj.map((x) => shiftDates(x, ms));
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) obj[k] = shiftDates(obj[k], ms);
    return obj;
  }
  if (typeof obj === "string" && /^\d{4}-\d{2}-\d{2}/.test(obj) && obj.length <= 40) {
    const isDate = obj.length === 10;
    const t = new Date(isDate ? obj + "T12:00:00Z" : obj).getTime();
    if (isNaN(t)) return obj;
    const s = new Date(t + ms).toISOString();
    return isDate ? s.slice(0, 10) : s;
  }
  return obj;
}

const jparts = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-US-u-ca-persian", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Tehran" })
    .formatToParts(new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso));
  const g = (t: string) => parseInt(p.find((x) => x.type === t)!.value.replace(/[^\d]/g, ""), 10);
  return { y: g("year"), m: g("month"), d: g("day") };
};

function page(list: any[], q: URLSearchParams, size = 20) {
  const ps = Math.min(200, parseInt(q.get("page_size") || String(size), 10));
  const p = Math.max(1, parseInt(q.get("page") || "1", 10));
  return { count: list.length, next: p * ps < list.length ? "next" : null, previous: p > 1 ? "prev" : null, results: list.slice((p - 1) * ps, p * ps) };
}
const has = (s: any, q: string) => !q || String(s ?? "").toLowerCase().includes(q.toLowerCase());
const userById = (id: number) => D.users.find((u: any) => u.id === id);
const custById = (id: number) => D.customers.find((c: any) => c.id === id);
const prodById = (id: number) => D.products.find((p: any) => p.id === id);
const fullName = (u: any) => (u ? `${u.first_name} ${u.last_name}`.trim() || u.phone : null);
const money = (n: number) => new Intl.NumberFormat("fa-IR").format(n);

function serializeUser(u: any) {
  const customer = u.customer_id ? custById(u.customer_id) : null;
  return { ...u, password: undefined, full_name: fullName(u), customer: customer ? { ...customer } : null };
}

function notify(userId: number | null | undefined, title: string, body = "", link = "") {
  if (!userId) return;
  D.notifications.unshift({ id: nid(), user: userId, title, body, link, is_read: false, created_at: nowIso() });
}
function notifyCustomer(cid: number, title: string, body = "", link = "") {
  D.users.filter((u: any) => u.customer_id === cid).forEach((u: any) => notify(u.id, title, body, link));
}
function notifyStaff(cust: any, title: string, body = "", link = "") {
  D.users.filter((u: any) => u.role === "sales_manager").forEach((u: any) => notify(u.id, title, body, link));
  if (cust?.sales_rep) notify(cust.sales_rep, title, body, link);
}

/* ---------------------------------------------------------------- scoping */
function visibleCustomers(u: any): any[] {
  if (STAFF.includes(u.role) && u.scope === "all") return D.customers;
  if (STAFF.includes(u.role)) {
    const provNames = D.provinces.filter((p: any) => u.region_ids.includes(p.id)).map((p: any) => p.name);
    return D.customers.filter((c: any) => c.sales_rep === u.id || provNames.includes(c.province_name));
  }
  return D.customers.filter((c: any) => c.id === u.customer_id);
}
function scoped(list: any[], u: any): any[] {
  if (STAFF.includes(u.role) && u.scope === "all") return list;
  const ids = new Set(visibleCustomers(u).map((c) => c.id));
  return list.filter((x) => ids.has(x.customer));
}

/* ---------------------------------------------------------------- pricing */
function priceOf(p: any, groupId: number | null) {
  if (groupId != null && p.prices[String(groupId)] != null) return Number(p.prices[String(groupId)]);
  return Number(p.base_price);
}
function discountPct(cartons: number, groupId: number | null) {
  const c = D.discounts.filter((d: any) => d.min_cartons <= cartons && (d.group === null || d.group === groupId));
  return c.length ? Math.max(...c.map((d: any) => Number(d.percent))) : 0;
}
function visibleProducts(u: any) {
  return D.products.filter((p: any) => p.is_active && (u.role !== "lab" || p.product_line === "lab") && (!p.audiences.length || p.audiences.includes(u.role)));
}
function quote(cust: any, lines: [any, number][]) {
  const errors: string[] = [];
  let subtotal = 0, cartons = 0;
  const items = lines.map(([p, n]) => {
    if (!p.is_active || !p.is_available) errors.push(`«${p.name}» در حال حاضر موجود نیست.`);
    if (n < p.min_order_cartons) errors.push(`حداقل سفارش «${p.name}» ${p.min_order_cartons} کارتن است.`);
    const price = priceOf(p, cust.price_group);
    subtotal += price * n; cartons += n;
    return { p, n, price, line: price * n };
  });
  const pct = discountPct(cartons, cust.price_group);
  const discount = Math.round((subtotal * pct) / 100);
  return { items, errors, total_cartons: cartons, subtotal, discount_percent: pct, discount_amount: discount, total: subtotal - discount };
}

/* ---------------------------------------------------------------- finance */
function balanceOf(cid: number) {
  return D.ledger.filter((e: any) => e.customer === cid).reduce((s: number, e: any) => s + Number(e.debit) - Number(e.credit), 0);
}
function creditSummary(cust: any) {
  const balance = balanceOf(cust.id);
  const open = D.orders.filter((o: any) => o.customer === cust.id && ["submitted", "confirmed", "preparing"].includes(o.status) && !o.accounting_ref).reduce((s: number, o: any) => s + Number(o.total), 0);
  const pendingCheques = D.cheques.filter((c: any) => c.customer === cust.id && c.status === "pending").reduce((s: number, c: any) => s + Number(c.amount), 0);
  return { credit_limit: Number(cust.credit_limit), balance, open_orders: open, pending_cheques: pendingCheques, available_credit: Number(cust.credit_limit) - balance - open, block_on_credit: cust.block_on_credit };
}
function overdueOf(cid: number, balance: number) {
  const t = today();
  const pastDue = D.ledger.filter((e: any) => e.customer === cid && e.due_date && e.due_date < t).reduce((s: number, e: any) => s + Number(e.debit), 0);
  const paid = D.ledger.filter((e: any) => e.customer === cid).reduce((s: number, e: any) => s + Number(e.credit), 0);
  return Math.min(Math.max(0, pastDue - paid), Math.max(0, balance));
}
function addLedger(cid: number, kind: string, kind_display: string, debit: number, credit: number, description: string, reference = "") {
  D.ledger.unshift({ id: nid(), customer: cid, customer_name: custById(cid)?.business_name, kind, kind_display, debit, credit, description, reference, date: today(), due_date: null });
}

/* ---------------------------------------------------------------- orders */
function orderList(o: any) {
  const { items, status_logs, notes, flow, ...rest } = o;
  return { ...rest, items_count: items.length };
}
function orderDetail(o: any, staff: boolean) {
  const out = { ...o, items_count: o.items.length, items: o.items.map((i: any) => ({ ...i, image: prodById(i.product)?.image ?? null })) };
  if (!staff) { delete out.notes; delete out.customer_phone; }
  return out;
}
function changeStatus(o: any, s: string, by: any, note = "") {
  if (!NEXT[o.status]?.includes(s)) return err(400, `تغییر وضعیت از «${STATUS_LABEL[o.status]}» به «${STATUS_LABEL[s] ?? s}» مجاز نیست.`);
  o.status = s; o.status_display = STATUS_LABEL[s];
  o.status_logs.push({ status: s, status_display: STATUS_LABEL[s], note, created_at: nowIso(), changed_by_name: fullName(by) });
  if (s === "confirmed") { o.accounting_ref = `ACC-${o.number}`; o.accounting_synced_at = nowIso(); D.synclogs.unshift({ id: nid(), kind: "order", kind_display: "ارسال سفارش", success: true, message: `سفارش ${o.number} ← ${o.accounting_ref}`, items: 1, created_at: nowIso() }); }
  notifyCustomer(o.customer, `سفارش ${o.number}: ${STATUS_LABEL[s]}`, note || "پیامک اطلاع‌رسانی برای شما ارسال شد.", `/orders/detail?id=${o.id}`);
  return ok(o);
}

/* ---------------------------------------------------------------- reports */
const COUNTED = ["submitted", "confirmed", "preparing", "shipped", "delivered"];
function dashboard(u: any, q: URLSearchParams) {
  const from = q.get("from") || new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
  const to = q.get("to") || today();
  const gran = q.get("granularity") || "month";
  const filt = (o: any) => {
    const c = custById(o.customer);
    if (q.get("province") && !D.provinces.find((p: any) => String(p.id) === q.get("province") && p.name === c.province_name)) return false;
    if (q.get("sales_rep") && String(o.sales_rep) !== q.get("sales_rep")) return false;
    if (q.get("customer_type") && c.type !== q.get("customer_type")) return false;
    return true;
  };
  const all = scoped(D.orders, u).filter((o: any) => COUNTED.includes(o.status) && filt(o));
  const inRange = all.filter((o: any) => o.created_at.slice(0, 10) >= from && o.created_at.slice(0, 10) <= to);
  const span = (new Date(to).getTime() - new Date(from).getTime()) / 864e5 + 1;
  const pFrom = new Date(new Date(from).getTime() - span * 864e5).toISOString().slice(0, 10);
  const prev = all.filter((o: any) => o.created_at.slice(0, 10) >= pFrom && o.created_at.slice(0, 10) < from);
  const sum = (l: any[], f = "total") => l.reduce((s, o) => s + Number(o[f]), 0);
  const total = sum(inRange), prevTotal = sum(prev);
  const series: Record<string, any> = {};
  [...inRange].sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((o) => {
    const j = jparts(o.created_at);
    let key: string, label: string;
    if (gran === "day") { key = o.created_at.slice(0, 10); label = `${String(j.m).padStart(2, "0")}/${String(j.d).padStart(2, "0")}`; }
    else if (gran === "week") { const d = new Date(o.created_at); const sat = new Date(d.getTime() - ((d.getUTCDay() + 1) % 7) * 864e5); const js = jparts(sat.toISOString()); key = sat.toISOString().slice(0, 10); label = `${String(js.m).padStart(2, "0")}/${String(js.d).padStart(2, "0")}`; }
    else { key = `${j.y}-${j.m}`; label = `${JM[j.m - 1]} ${String(j.y % 100).padStart(2, "0")}`; }
    series[key] ??= { key, label, total: 0, orders: 0 };
    series[key].total += Number(o.total); series[key].orders++;
  });
  const group = (keyFn: (o: any) => any, nameFn: (o: any) => string) => {
    const m: Record<string, any> = {};
    inRange.forEach((o) => { const k = keyFn(o); if (k == null) return; m[k] ??= { id: k, name: nameFn(o), total: 0, orders: 0 }; m[k].total += Number(o.total); m[k].orders++; });
    return Object.values(m).sort((a: any, b: any) => b.total - a.total);
  };
  const byProduct: Record<string, any> = {};
  inRange.forEach((o) => o.items.forEach((i: any) => { byProduct[i.product] ??= { product_id: i.product, name: i.product_name, total: 0, cartons: 0 }; byProduct[i.product].total += Number(i.line_total); byProduct[i.product].cartons += i.cartons; }));
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString();
  const inactive = visibleCustomers(u).filter((c) => c.status === "approved" && c.type === "distributor").map((c) => {
    const last = D.orders.filter((o: any) => o.customer === c.id).map((o: any) => o.created_at).sort().pop() ?? null;
    return { id: c.id, business_name: c.business_name, phone: c.phone, last_order: last, city_name: c.city_name };
  }).filter((r) => !r.last_order || r.last_order < cutoff);
  const recRows = visibleCustomers(u).map((c) => { const b = balanceOf(c.id); return { customer_id: c.id, name: c.business_name, phone: c.phone, balance: b, overdue: overdueOf(c.id, b), oldest_due: D.ledger.filter((e: any) => e.customer === c.id && e.due_date && e.due_date < today() && Number(e.debit) > 0).map((e: any) => e.due_date).sort()[0] ?? null }; })
    .filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance);
  return {
    range: { start: from, end: to },
    kpis: {
      sales: total, orders: inRange.length, cartons: sum(inRange, "total_cartons"), active_customers: new Set(inRange.map((o) => o.customer)).size,
      avg_order: inRange.length ? Math.round(total / inRange.length) : 0, growth: prevTotal ? Math.round(((total - prevTotal) * 1000) / prevTotal) / 10 : null,
      pending_approvals: visibleCustomers(u).filter((c) => c.status === "pending").length,
      open_orders: scoped(D.orders, u).filter((o: any) => o.status === "submitted").length,
    },
    series: Object.values(series),
    by_city: group((o) => o.city, (o) => o.city_name).slice(0, 15),
    by_customer: group((o) => o.customer, (o) => o.customer_name).slice(0, 15),
    by_rep: group((o) => o.sales_rep, (o) => o.sales_rep_name),
    by_product: Object.values(byProduct).sort((a: any, b: any) => b.total - a.total).slice(0, 15),
    inactive,
    receivables: { rows: recRows, total_overdue: recRows.reduce((s, r) => s + r.overdue, 0) },
  };
}

function jRange(y: number, m: number) {
  // find gregorian dates whose jalali (y,m) matches: scan around
  const out: string[] = [];
  const start = new Date(Date.UTC(y + 621, m + 1, 1) - 70 * 864e5);
  for (let i = 0; i < 140; i++) {
    const d = new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10);
    const j = jparts(d);
    if (j.y === y && j.m === m) out.push(d);
  }
  return [out[0], out[out.length - 1]];
}
function progressFor(cust: any, y: number, m: number) {
  const [a, b] = jRange(y, m);
  const sold = D.orders.filter((o: any) => o.customer === cust.id && COUNTED.includes(o.status) && o.created_at.slice(0, 10) >= a && o.created_at.slice(0, 10) <= b).reduce((s: number, o: any) => s + Number(o.total), 0);
  const t = D.targets.find((x: any) => x.customer === cust.id && x.year === y && x.month === m);
  const amount = t ? Number(t.target_amount) : 0;
  const pct = amount ? Math.round((sold * 1000) / amount) / 10 : 0;
  const tiers = [...D.tiers].sort((p: any, q: any) => p.min_percent - q.min_percent);
  const reached = tiers.filter((x: any) => pct >= x.min_percent);
  const nxt = tiers.find((x: any) => pct < x.min_percent);
  const cur = reached[reached.length - 1] ?? null;
  return { year: y, month: m, month_name: JM[m - 1], target: amount, sold, percent: pct, current_tier: cur, next_tier: nxt ?? null,
    remaining_to_next: nxt && amount ? Math.max(0, Math.round((amount * nxt.min_percent) / 100 - sold)) : null,
    reward_amount: cur ? Math.round((sold * Number(cur.reward_percent)) / 100) : 0 };
}

/* ---------------------------------------------------------------- body helpers */
function bodyObj(body: any): any {
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const o: any = {};
    body.forEach((v, k) => {
      const val = v instanceof File ? v : v;
      if (o[k] !== undefined) o[k] = [].concat(o[k], val as any); else o[k] = val;
    });
    return o;
  }
  return body ?? {};
}
const fileUrl = (f: any) => (f instanceof File ? URL.createObjectURL(f) : null);
const arr = (v: any) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/* ================================================================ router */
type Ctx = { u: any; q: URLSearchParams; b: any; m: RegExpMatchArray };
type Handler = (c: Ctx) => R;
const routes: [string, RegExp, Handler, boolean?][] = [];
const on = (method: string, pattern: string, h: Handler, pub = false) =>
  routes.push([method, new RegExp("^" + pattern.replace(/:id/g, "(\\d+)") + "/?$"), h, pub]);

/* ---- auth ---- */
on("POST", "/auth/otp/request", ({ b }) => {
  const phone = String(b.phone || "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "").replace(/^98/, "0");
  if (!/^09\d{9}$/.test(phone)) return err(400, "شماره موبایل معتبر نیست.", { phone: ["شماره موبایل معتبر نیست."] });
  OTP[phone] = String(100000 + Math.floor(Math.random() * 900000));
  return ok({ ok: true, phone, ttl: 120, registered: D.users.some((u: any) => u.phone === phone), debug_code: OTP[phone] });
}, true);
on("POST", "/auth/otp/verify", ({ b }) => {
  if (!OTP[b.phone] || OTP[b.phone] !== String(b.code)) return err(400, "کد وارد شده اشتباه یا منقضی است.", { code: ["کد وارد شده اشتباه یا منقضی است."] });
  delete OTP[b.phone];
  const u = D.users.find((x: any) => x.phone === b.phone);
  if (!u) return ok({ registered: false, registration_token: "reg:" + b.phone });
  return ok({ registered: true, access: "demo:" + u.id, refresh: "demo:" + u.id, user: serializeUser(u) });
}, true);
on("POST", "/auth/login", ({ b }) => {
  const u = D.users.find((x: any) => x.username === b.username && x.password && x.password === b.password);
  if (!u) return err(400, "نام کاربری یا رمز عبور اشتباه است.", { password: ["نام کاربری یا رمز عبور اشتباه است."] });
  return ok({ access: "demo:" + u.id, refresh: "demo:" + u.id, user: serializeUser(u) });
}, true);
on("POST", "/auth/register", ({ b }) => {
  const phone = String(b.registration_token || "").replace("reg:", "");
  if (!phone) return err(400, "مهلت ثبت‌نام تمام شده.");
  const city = D.provinces.flatMap((p: any) => p.cities.map((c: any) => ({ ...c, province_name: p.name }))).find((c: any) => String(c.id) === String(b.city));
  if (!city) return err(400, "شهر را انتخاب کنید.", { city: ["این فیلد الزامی است."] });
  const files = arr(b.documents), kinds = arr(b.document_kinds);
  const kl: Record<string, string> = { license: "جواز کسب", national_card: "کارت ملی", economic: "گواهی کد اقتصادی", other: "سایر" };
  const types: Record<string, string> = { distributor: "نماینده / پخش‌کننده", store: "فروشگاه", organization: "مشتری سازمانی", lab: "آزمایشگاه" };
  const c = { id: nid(), type: b.type, type_display: types[b.type], business_name: b.business_name, owner_name: `${b.first_name} ${b.last_name}`, phone, economic_code: b.economic_code || "", national_id: "", license_number: b.license_number || "",
    city: city.id, city_name: city.name, province_name: city.province_name, address: b.address, postal_code: b.postal_code || "", status: "pending", status_display: "در انتظار تأیید", rejection_reason: "",
    price_group: null, price_group_name: null, sales_rep: null, sales_rep_name: null, credit_limit: 0, block_on_credit: true, accounting_code: "", approved_at: null, created_at: nowIso(),
    documents: files.map((f: any, i: number) => ({ id: nid(), kind: kinds[i] || "other", kind_display: kl[kinds[i]] || "سایر", file: fileUrl(f), title: f.name, created_at: nowIso() })) };
  D.customers.unshift(c);
  const u = { id: nid(), username: phone, phone, first_name: b.first_name, last_name: b.last_name, role: b.type, role_display: types[b.type], is_customer_owner: true, can_order: true, can_view_finance: true, job_title: "", customer_id: c.id, region_ids: [], is_active: true };
  D.users.push(u);
  D.users.filter((x: any) => x.role === "sales_manager" || x.role === "admin").forEach((m: any) => notify(m.id, "درخواست عضویت جدید", `${c.business_name} - ${c.city_name}`, `/admin/customers/review?id=${c.id}`));
  return ok({ access: "demo:" + u.id, refresh: "demo:" + u.id, user: serializeUser(u) }, 201);
}, true);
on("GET", "/auth/me", ({ u }) => ok(serializeUser(u)));
on("POST", "/auth/me/documents", ({ u, b }) => {
  const c = custById(u.customer_id);
  const kl: Record<string, string> = { license: "جواز کسب", national_card: "کارت ملی", economic: "گواهی کد اقتصادی", other: "سایر" };
  c.documents.push({ id: nid(), kind: b.kind, kind_display: kl[b.kind] || "سایر", file: fileUrl(b.file), title: b.file?.name, created_at: nowIso() });
  if (c.status === "rejected") { c.status = "pending"; c.status_display = "در انتظار تأیید"; }
  return ok({}, 201);
});
on("GET", "/provinces", () => ok(D.provinces), true);

/* ---- notifications / announcements ---- */
on("GET", "/notifications", ({ u, q }) => { const l = D.notifications.filter((n: any) => n.user === u.id); return ok({ ...page(l, q), unread: l.filter((n: any) => !n.is_read).length }); });
on("POST", "/notifications/read_all", ({ u }) => { D.notifications.forEach((n: any) => n.user === u.id && (n.is_read = true)); return ok({ ok: true }); });
on("POST", "/notifications/:id/read", ({ m }) => { const n = D.notifications.find((x: any) => x.id === +m[1]); if (n) n.is_read = true; return ok({ ok: true }); });
on("GET", "/announcements", ({ u }) => ok(D.announcements.filter((a: any) => !CUSTOMER.includes(u.role) || (a.is_active && (!a.audiences.length || a.audiences.includes(u.role)))).sort((a: any, b: any) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at))));
on("POST", "/announcements", ({ b }) => { const a = { id: nid(), ...b, created_at: nowIso() }; D.announcements.unshift(a); return ok(a, 201); });
on("PATCH", "/announcements/:id", ({ m, b }) => { const a = D.announcements.find((x: any) => x.id === +m[1]); Object.assign(a, b); return ok(a); });
on("DELETE", "/announcements/:id", ({ m }) => { D.announcements = D.announcements.filter((x: any) => x.id !== +m[1]); return ok(null, 204); });

/* ---- customers ---- */
on("GET", "/customers/stats", ({ u }) => { const s: any = {}; visibleCustomers(u).forEach((c) => (s[c.status] = (s[c.status] || 0) + 1)); return ok(s); });
on("GET", "/customers", ({ u, q }) => ok(page(visibleCustomers(u).filter((c) => (!q.get("status") || c.status === q.get("status")) && (!q.get("type") || c.type === q.get("type")) && (has(c.business_name, q.get("search") || "") || has(c.phone, q.get("search") || "") || has(c.owner_name, q.get("search") || ""))), q)));
on("GET", "/customers/:id", ({ u, m }) => { const c = visibleCustomers(u).find((x) => x.id === +m[1]); return c ? ok(c) : err(404, "یافت نشد."); });
const applyCustomer = (c: any, b: any) => {
  if (b.price_group !== undefined) { c.price_group = b.price_group ? +b.price_group : null; c.price_group_name = D.price_groups.find((g: any) => g.id === c.price_group)?.name ?? null; }
  if (b.sales_rep !== undefined) { c.sales_rep = b.sales_rep ? +b.sales_rep : null; c.sales_rep_name = fullName(userById(c.sales_rep)); }
  if (b.credit_limit !== undefined) c.credit_limit = Number(b.credit_limit) || 0;
  if (b.block_on_credit !== undefined) c.block_on_credit = !!b.block_on_credit;
};
on("PATCH", "/customers/:id", ({ u, m, b }) => { if (u.role === "sales_rep") return err(403, "کارشناس فروش اجازه‌ی ویرایش مشتری را ندارد."); const c = custById(+m[1]); applyCustomer(c, b); return ok(c); });
on("POST", "/customers/:id/approve", ({ m, b }) => { const c = custById(+m[1]); applyCustomer(c, b); c.status = "approved"; c.status_display = "تأیید شده"; c.approved_at = nowIso(); c.rejection_reason = ""; notifyCustomer(c.id, "حساب شما تأیید شد", "اکنون می‌توانید قیمت‌ها را ببینید و سفارش ثبت کنید.", "/dashboard"); if (c.sales_rep) notify(c.sales_rep, "مشتری جدید به شما سپرده شد", c.business_name, `/admin/customers/review?id=${c.id}`); return ok(c); });
on("POST", "/customers/:id/reject", ({ m, b }) => { if (!b.reason) return err(400, "دلیل رد را بنویسید."); const c = custById(+m[1]); c.status = "rejected"; c.status_display = "رد شده"; c.rejection_reason = b.reason; notifyCustomer(c.id, "درخواست عضویت شما رد شد", b.reason, "/pending"); return ok(c); });
on("POST", "/customers/:id/suspend", ({ m }) => { const c = custById(+m[1]); c.status = "suspended"; c.status_display = "تعلیق"; return ok(c); });

/* ---- sub-users & staff ---- */
on("GET", "/sub-users", ({ u }) => u.is_customer_owner ? ok(D.users.filter((x: any) => x.customer_id === u.customer_id && !x.is_customer_owner)) : err(403, "فقط مدیر حساب مشتری می‌تواند زیرکاربر تعریف کند."));
on("POST", "/sub-users", ({ u, b }) => { if (D.users.some((x: any) => x.phone === b.phone)) return err(400, "این شماره قبلاً در سامانه ثبت شده است.", { phone: ["این شماره قبلاً در سامانه ثبت شده است."] }); const n = { id: nid(), username: b.phone, ...b, role: u.role, role_display: u.role_display, customer_id: u.customer_id, is_customer_owner: false, region_ids: [], is_active: true }; D.users.push(n); return ok(n, 201); });
on("PATCH", "/sub-users/:id", ({ m, b }) => { const x = userById(+m[1]); Object.assign(x, b); return ok(x); });
on("DELETE", "/sub-users/:id", ({ m }) => { userById(+m[1]).is_active = false; return ok(null, 204); });
on("GET", "/staff", ({ q }) => ok(D.users.filter((x: any) => STAFF.includes(x.role) && x.is_active && (!q.get("assignable") || (x.role !== "admin" && x.scope === "region")))
  .map((x: any) => ({ id: x.id, first_name: x.first_name, last_name: x.last_name, role: x.role, position_name: x.position_name ?? x.role_display }))));
const posOut = (p: any) => ({ ...p, users_count: D.users.filter((u: any) => u.position === p.id).length, scope_display: p.scope === "all" ? "همه‌ی مشتری‌ها و سفارش‌ها" : "فقط استان‌ها و مشتری‌های خودش" });
function applyPosition(u: any, pos: any) {
  u.position = pos.id; u.position_name = pos.name; u.role = pos.base_role; u.role_display = pos.name;
  u.permissions = pos.base_role === "admin" ? D.sections.map((x: any) => x.key) : [...pos.permissions]; u.scope = pos.base_role === "admin" ? "all" : pos.scope;
}
on("GET", "/positions/sections", () => ok(D.sections));
on("GET", "/positions", () => ok(D.positions.map(posOut)));
on("POST", "/positions", ({ b }) => {
  if (!b.name) return err(400, "نام سمت الزامی است.");
  if (D.positions.some((p: any) => p.name === b.name)) return err(400, "سمتی با این نام وجود دارد.");
  const p = { id: nid(), name: b.name, description: b.description || "", permissions: b.permissions || [], scope: b.scope || "region", base_role: "staff", is_system: false };
  D.positions.push(p); return ok(posOut(p), 201);
});
on("PATCH", "/positions/:id", ({ m, b }) => {
  const p = D.positions.find((x: any) => x.id === +m[1]);
  if (p.base_role === "admin") return err(400, "سمت «ادمین کل» همیشه دسترسی کامل دارد و قابل ویرایش نیست.");
  Object.assign(p, { name: b.name ?? p.name, description: b.description ?? p.description, permissions: b.permissions ?? p.permissions, scope: b.scope ?? p.scope });
  D.users.filter((u: any) => u.position === p.id).forEach((u: any) => applyPosition(u, p));
  return ok(posOut(p));
});
on("DELETE", "/positions/:id", ({ m }) => {
  const p = D.positions.find((x: any) => x.id === +m[1]);
  if (p.is_system) return err(400, "سمت‌های پیش‌فرض قابل حذف نیستند.");
  if (D.users.some((u: any) => u.position === p.id)) return err(400, "این سمت کاربر دارد؛ ابتدا سمت کاربرانش را تغییر دهید.");
  D.positions = D.positions.filter((x: any) => x.id !== p.id); return ok(null, 204);
});
const userAdminOut = (x: any) => ({ ...x, password: undefined, regions: x.region_ids, kind: CUSTOMER.includes(x.role) ? "customer" : "staff",
  business_name: x.customer_id ? custById(x.customer_id)?.business_name : null, customer: x.customer_id, customers_count: D.customers.filter((c: any) => c.sales_rep === x.id).length });
on("GET", "/users", ({ q }) => {
  const s = q.get("search") || "";
  const l = D.users.filter((x: any) => (q.get("kind") !== "staff" || STAFF.includes(x.role)) && (q.get("kind") !== "customer" || CUSTOMER.includes(x.role))
    && (!q.get("position") || String(x.position) === q.get("position"))
    && (has(x.first_name, s) || has(x.last_name, s) || has(x.phone, s) || has(x.username, s) || has(x.customer_id ? custById(x.customer_id)?.business_name : "", s)))
    .sort((a: any, b: any) => String(b.date_joined || "").localeCompare(String(a.date_joined || "")));
  const pg = page(l, q); return ok({ ...pg, results: pg.results.map(userAdminOut) });
});
on("POST", "/users", ({ b }) => {
  const phone = b.phone ? String(b.phone).replace(/\D/g, "") : null;
  if (phone && D.users.some((x: any) => x.phone === phone)) return err(400, "این شماره قبلاً در سامانه ثبت شده است.", { phone: ["این شماره قبلاً در سامانه ثبت شده است."] });
  const username = b.username || phone;
  if (!username) return err(400, "نام کاربری یا موبایل لازم است.", { username: ["نام کاربری یا موبایل لازم است."] });
  if (D.users.some((x: any) => x.username === username)) return err(400, "این نام کاربری قبلاً استفاده شده است.", { username: ["این نام کاربری قبلاً استفاده شده است."] });
  const u: any = { id: nid(), username, phone, first_name: b.first_name || "", last_name: b.last_name || "", job_title: b.job_title || "", is_active: true,
    is_customer_owner: false, can_order: false, can_view_finance: false, customer_id: null, region_ids: b.regions || [], password: b.password || null, last_login: null, date_joined: nowIso(), permissions: [], scope: null, position: null, position_name: null };
  if (b.customer_type) {
    const pr = b.customer_profile || {};
    if (!phone) return err(400, "مشتری با موبایل وارد می‌شود؛ شماره را وارد کنید.", { phone: ["شماره را وارد کنید."] });
    if (!pr.business_name || !pr.city || !pr.address) return err(400, "نام کسب‌وکار، شهر و آدرس الزامی است.");
    const city = D.provinces.flatMap((p: any) => p.cities.map((c: any) => ({ ...c, pn: p.name }))).find((c: any) => String(c.id) === String(pr.city));
    const types: any = { distributor: "نماینده / پخش‌کننده", store: "فروشگاه", organization: "مشتری سازمانی", lab: "آزمایشگاه" };
    const rep = pr.sales_rep ? userById(+pr.sales_rep) : null;
    const c = { id: nid(), type: b.customer_type, type_display: types[b.customer_type], business_name: pr.business_name, owner_name: `${u.first_name} ${u.last_name}`.trim(), phone,
      economic_code: pr.economic_code || "", national_id: "", license_number: "", city: city.id, city_name: city.name, province_name: city.pn, address: pr.address, postal_code: "",
      status: "approved", status_display: "تأیید شده", rejection_reason: "", price_group: pr.price_group ? +pr.price_group : null,
      price_group_name: D.price_groups.find((g: any) => g.id === +pr.price_group)?.name ?? null, sales_rep: rep?.id ?? null, sales_rep_name: fullName(rep),
      credit_limit: Number(pr.credit_limit) || 0, block_on_credit: true, accounting_code: "", approved_at: nowIso(), created_at: nowIso(), documents: [] };
    D.customers.unshift(c);
    Object.assign(u, { role: b.customer_type, role_display: types[b.customer_type], customer_id: c.id, is_customer_owner: true, can_order: true, can_view_finance: true, password: null });
  } else {
    const pos = D.positions.find((p: any) => p.id === +b.position);
    if (!pos) return err(400, "سمت کاربر را انتخاب کنید.", { position: ["سمت کاربر را انتخاب کنید."] });
    applyPosition(u, pos);
  }
  D.users.push(u);
  return ok(userAdminOut(u), 201);
});
on("PATCH", "/users/:id", ({ u: me, m, b }) => {
  const x = userById(+m[1]);
  if (x.id === me.id && b.is_active === false) return err(400, "نمی‌توانید حساب خودتان را غیرفعال کنید.");
  ["first_name", "last_name", "job_title", "is_active", "username"].forEach((k) => b[k] !== undefined && (x[k] = b[k]));
  if (b.phone !== undefined) x.phone = b.phone;
  if (b.password) x.password = b.password;
  if (b.regions) x.region_ids = b.regions;
  if (b.position) applyPosition(x, D.positions.find((p: any) => p.id === +b.position));
  return ok(userAdminOut(x));
});

/* ---- network ---- */
on("GET", "/coverage", () => {
  const rows = D.provinces.flatMap((p: any) => p.cities.map((c: any) => {
    const cs = D.customers.filter((x: any) => x.city === c.id && x.status === "approved");
    return { id: c.id, name: c.name, province: p.name, lat: c.lat, lng: c.lng, population: c.population, distributors: cs.filter((x: any) => x.type === "distributor").length,
      stores: cs.filter((x: any) => x.type === "store").length, organizations: cs.filter((x: any) => x.type === "organization").length,
      applications: D.applications.filter((a: any) => a.city === c.id && a.status !== "rejected").length };
  }));
  const covered = rows.filter((r: any) => r.distributors).length;
  return ok({ cities: rows, covered, uncovered: rows.length - covered });
});
on("GET", "/agency-applications/stats", () => { const s: any = {}; D.applications.forEach((a: any) => (s[a.status] = (s[a.status] || 0) + 1)); return ok(s); });
on("GET", "/agency-applications", ({ q }) => ok(page(D.applications.filter((a: any) => !q.get("status") || a.status === q.get("status")), q)));
on("POST", "/agency-applications", ({ b }) => {
  const city = D.provinces.flatMap((p: any) => p.cities.map((c: any) => ({ ...c, pn: p.name }))).find((c: any) => String(c.id) === String(b.city));
  const a = { id: nid(), ...b, city: city?.id, city_name: city?.name, province_name: city?.pn, status: "new", status_display: "جدید", admin_note: "", created_at: nowIso() };
  D.applications.unshift(a);
  D.users.filter((x: any) => x.role === "sales_manager").forEach((x: any) => notify(x.id, "درخواست نمایندگی جدید", `${a.full_name} - ${a.city_name}`, "/admin/network"));
  return ok(a, 201);
}, true);
on("PATCH", "/agency-applications/:id", ({ m, b }) => { const a = D.applications.find((x: any) => x.id === +m[1]); const L: any = { new: "جدید", reviewing: "در حال بررسی", accepted: "پذیرفته", rejected: "رد شده" }; Object.assign(a, b, { status_display: L[b.status] ?? a.status_display }); return ok(a); });

/* ---- catalog ---- */
on("GET", "/categories", ({ u }) => { const vis = CUSTOMER.includes(u.role) ? visibleProducts(u) : D.products.filter((p: any) => p.is_active); return ok(D.categories.map((c: any) => ({ ...c, products_count: vis.filter((p: any) => p.category === c.id).length }))); });
on("POST", "/categories", ({ b }) => { const c = { id: nid(), order: 99, parent: null, ...b }; D.categories.push(c); return ok(c, 201); });
on("DELETE", "/categories/:id", ({ m }) => { if (D.products.some((p: any) => p.category === +m[1])) return err(400, "این دسته محصول دارد و قابل حذف نیست."); D.categories = D.categories.filter((c: any) => c.id !== +m[1]); return ok(null, 204); });
on("GET", "/products", ({ u, q }) => {
  const s = q.get("search") || "";
  if (CUSTOMER.includes(u.role)) {
    const c = custById(u.customer_id);
    if (c.status !== "approved") return err(403, "پس از تأیید حساب، کاتالوگ و قیمت‌ها نمایش داده می‌شود.");
    const list = visibleProducts(u).filter((p: any) => (has(p.name, s) || has(p.sku, s)) && (!q.get("category") || String(p.category) === q.get("category")) && (!q.get("product_line") || p.product_line === q.get("product_line")))
      .map((p: any) => { const price = priceOf(p, c.price_group); const { prices, base_price, stock_cartons, audiences, accounting_code, ...rest } = p; return { ...rest, carton_price: price, unit_price: Math.round(price / p.units_per_carton) }; });
    return ok(page(list, q, 24));
  }
  const list = D.products.filter((p: any) => (q.get("include_inactive") === "1" || p.is_active) && (has(p.name, s) || has(p.sku, s)) && (!q.get("category") || String(p.category) === q.get("category")) && (!q.get("is_available") || String(p.is_available) === q.get("is_available")));
  return ok(page(list, q));
});
const applyProduct = (p: any, b: any) => {
  ["name", "sku", "description", "product_line", "kit_type", "accounting_code"].forEach((k) => b[k] !== undefined && (p[k] = b[k]));
  ["units_per_carton", "min_order_cartons", "base_price", "stock_cartons", "category"].forEach((k) => b[k] !== undefined && (p[k] = Number(b[k])));
  ["is_available", "is_active"].forEach((k) => b[k] !== undefined && (p[k] = b[k] === true || b[k] === "true"));
  if (b.audiences !== undefined) p.audiences = b.audiences;
  if (b.image instanceof File) p.image = fileUrl(b.image);
  p.category_name = D.categories.find((c: any) => c.id === p.category)?.name;
};
on("POST", "/products", ({ b }) => { const p: any = { id: nid(), prices: {}, image: null, tech_doc: null, brochure: null, audiences: [], stock_cartons: 0, created_at: nowIso() }; applyProduct(p, b); D.products.push(p); return ok(p, 201); });
on("PATCH", "/products/:id", ({ m, b }) => { const p = prodById(+m[1]); applyProduct(p, b); return ok(p); });
on("GET", "/price-groups", () => ok(D.price_groups.map((g: any) => ({ ...g, customers_count: D.customers.filter((c: any) => c.price_group === g.id).length }))));
on("POST", "/price-groups", ({ b }) => { const g = { id: nid(), is_default: false, ...b }; D.price_groups.push(g); return ok(g, 201); });
const priceList = (gid: number) => D.products.filter((p: any) => p.is_active).map((p: any) => ({ product: p.id, name: p.name, sku: p.sku, category_name: p.category_name, base_price: Number(p.base_price), carton_price: p.prices[String(gid)] ?? null }));
on("GET", "/price-groups/:id/prices", ({ m }) => ok(priceList(+m[1])));
on("POST", "/price-groups/:id/prices", ({ m, b }) => { (b.items || []).forEach((r: any) => { const p = prodById(r.product); if (r.carton_price == null || r.carton_price === "") delete p.prices[m[1]]; else p.prices[m[1]] = Number(r.carton_price); }); return ok(priceList(+m[1])); });
on("GET", "/volume-discounts", ({ u }) => { const g = u.customer_id ? custById(u.customer_id).price_group : undefined; return ok(D.discounts.filter((d: any) => !CUSTOMER.includes(u.role) || d.group === null || d.group === g)); });
on("POST", "/volume-discounts", ({ b }) => { const d = { id: nid(), group: b.group ? +b.group : null, group_name: D.price_groups.find((g: any) => g.id === +b.group)?.name ?? "همه‌ی گروه‌ها", min_cartons: +b.min_cartons, percent: +b.percent }; D.discounts.push(d); D.discounts.sort((a: any, c: any) => a.min_cartons - c.min_cartons); return ok(d, 201); });
on("DELETE", "/volume-discounts/:id", ({ m }) => { D.discounts = D.discounts.filter((d: any) => d.id !== +m[1]); return ok(null, 204); });

/* ---- cart & checkout ---- */
function cartPayload(u: any) {
  const c = custById(u.customer_id);
  const cart = (carts[u.id] ??= {});
  const lines: [any, number][] = Object.entries(cart).map(([pid, n]) => [prodById(+pid), n]);
  const qq = quote(c, lines);
  const credit = creditSummary(c);
  return {
    items: qq.items.map((i) => ({ product: i.p.id, name: i.p.name, sku: i.p.sku, image: i.p.image, units_per_carton: i.p.units_per_carton, min_order_cartons: i.p.min_order_cartons, is_available: i.p.is_available, cartons: i.n, unit_price: i.price, line_total: i.line })),
    errors: qq.errors, total_cartons: qq.total_cartons, subtotal: qq.subtotal, discount_percent: qq.discount_percent, discount_amount: qq.discount_amount, total: qq.total,
    credit, default_address: c.address, credit_ok: !c.block_on_credit || !Number(c.credit_limit) || qq.total <= credit.available_credit,
  };
}
on("GET", "/cart", ({ u }) => ok(cartPayload(u)));
on("POST", "/cart", ({ u, b }) => { const cart = (carts[u.id] ??= {}); const n = parseInt(b.cartons, 10) || 0; if (n <= 0) delete cart[b.product]; else cart[b.product] = n; return ok(cartPayload(u)); });
on("DELETE", "/cart", ({ u }) => { carts[u.id] = {}; return ok(cartPayload(u)); });
on("POST", "/checkout", ({ u, b }) => {
  const c = custById(u.customer_id);
  const cart = (carts[u.id] ??= {});
  const lines: [any, number][] = Object.entries(cart).map(([pid, n]) => [prodById(+pid), n]);
  if (!lines.length) return err(400, "سبد خرید خالی است.");
  const qq = quote(c, lines);
  if (qq.errors.length) return err(400, qq.errors[0], { items: qq.errors });
  const cr = creditSummary(c);
  if (c.block_on_credit && Number(c.credit_limit) > 0 && qq.total > cr.available_credit) return err(400, `اعتبار شما کافی نیست. اعتبار باقی‌مانده: ${money(Math.max(0, cr.available_credit))} ریال`, { credit: ["اعتبار کافی نیست"] });
  const num = String(Number(D.orders.reduce((mx: number, o: any) => Math.max(mx, Number(o.number)), 0)) + 1);
  const o = { id: nid(), number: num, status: "submitted", status_display: "ثبت شده", customer: c.id, customer_name: c.business_name, city: c.city, city_name: c.city_name, sales_rep: c.sales_rep, sales_rep_name: c.sales_rep_name,
    total_cartons: qq.total_cartons, total: qq.total, created_at: nowIso(), is_lab_order: u.role === "lab", delivery_address: b.delivery_address || c.address, customer_note: b.customer_note || "",
    subtotal: qq.subtotal, discount_percent: qq.discount_percent, discount_amount: qq.discount_amount,
    items: qq.items.map((i) => ({ id: nid(), product: i.p.id, product_name: i.p.name, sku: i.p.sku, units_per_carton: i.p.units_per_carton, cartons: i.n, unit_price: i.price, line_total: i.line })),
    status_logs: [{ status: "submitted", status_display: "ثبت شده", note: "", created_at: nowIso(), changed_by_name: fullName(u) }], flow: FLOW.map((v) => ({ value: v, label: STATUS_LABEL[v] })),
    accounting_ref: "", notes: [], customer_phone: c.phone, accounting_synced_at: null };
  D.orders.unshift(o);
  carts[u.id] = {};
  notifyStaff(c, `سفارش جدید ${o.number}`, `${c.business_name} - ${money(o.total)} ریال`, `/admin/orders/detail?id=${o.id}`);
  notifyCustomer(c.id, `سفارش ${o.number} ثبت شد`, "پس از بررسی، وضعیت از طریق پیامک اطلاع داده می‌شود.", `/orders/detail?id=${o.id}`);
  return ok(orderDetail(o, false), 201);
});

/* ---- orders ---- */
function filterOrders(u: any, q: URLSearchParams) {
  const s = q.get("search") || "";
  const st = q.get("status"), sin = q.get("status__in")?.split(",");
  const prov = q.get("city__province") ? D.provinces.find((p: any) => String(p.id) === q.get("city__province"))?.name : null;
  return scoped(D.orders, u).filter((o: any) => (!st || o.status === st) && (!sin || sin.includes(o.status)) && (!q.get("city") || String(o.city) === q.get("city"))
    && (!prov || custById(o.customer)?.province_name === prov) && (!q.get("sales_rep") || String(o.sales_rep) === q.get("sales_rep"))
    && (!q.get("customer") || String(o.customer) === q.get("customer")) && (has(o.number, s) || has(o.customer_name, s)))
    .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
}
on("GET", "/orders/stats", ({ u, q }) => { const s: any = {}; const qq = new URLSearchParams(q); qq.delete("status"); filterOrders(u, qq).forEach((o: any) => (s[o.status] = (s[o.status] || 0) + 1)); return ok(s); });
on("GET", "/orders", ({ u, q }) => {
  if (CUSTOMER.includes(u.role) && custById(u.customer_id).status !== "approved") return err(403, "حساب شما هنوز تأیید نشده است.");
  const p = page(filterOrders(u, q), q); return ok({ ...p, results: p.results.map(orderList) });
});
const findOrder = (u: any, id: number): any => scoped(D.orders, u).find((o: any) => o.id === id);
on("GET", "/orders/:id", ({ u, m }) => { const o = findOrder(u, +m[1]); return o ? ok(orderDetail(o, !CUSTOMER.includes(u.role))) : err(404, "یافت نشد."); });
on("POST", "/orders/:id/reorder", ({ u, m }) => {
  const o = findOrder(u, +m[1]); const cart = (carts[u.id] ??= {}); const vis = visibleProducts(u); const skipped: string[] = [];
  o.items.forEach((i: any) => { const p = vis.find((x: any) => x.id === i.product && x.is_available); if (p) cart[p.id] = i.cartons; else skipped.push(i.product_name); });
  return ok({ skipped, cart: cartPayload(u) });
});
on("POST", "/orders/:id/cancel", ({ u, m, b }) => { const o = findOrder(u, +m[1]); if (CUSTOMER.includes(u.role) && o.status !== "submitted") return err(400, "فقط سفارش‌های بررسی‌نشده را می‌توانید لغو کنید."); const r = changeStatus(o, "canceled", u, b.note || ""); return r.status === 200 ? ok(orderDetail(o, false)) : r; });
on("POST", "/orders/:id/set_status", ({ u, m, b }) => { if (CUSTOMER.includes(u.role)) return err(403, "اجازه‌ی این کار را ندارید."); const o = findOrder(u, +m[1]); const r = changeStatus(o, b.status, u, b.note || ""); return r.status === 200 ? ok(orderDetail(o, true)) : r; });
on("POST", "/orders/:id/edit_items", ({ u, m, b }) => {
  const o = findOrder(u, +m[1]);
  if (!["submitted", "confirmed"].includes(o.status)) return err(400, "فقط سفارش‌های ثبت‌شده یا تأییدشده قابل ویرایش هستند.");
  const lines: [any, number][] = (b.items || []).filter((i: any) => +i.cartons > 0).map((i: any) => [prodById(+i.product), +i.cartons]);
  if (!lines.length) return err(400, "سفارش نمی‌تواند خالی باشد؛ برای حذف، آن را لغو کنید.");
  const qq = quote(custById(o.customer), lines);
  if (qq.errors.length) return err(400, qq.errors[0]);
  o.items = qq.items.map((i) => ({ id: nid(), product: i.p.id, product_name: i.p.name, sku: i.p.sku, units_per_carton: i.p.units_per_carton, cartons: i.n, unit_price: i.price, line_total: i.line }));
  Object.assign(o, { total_cartons: qq.total_cartons, subtotal: qq.subtotal, discount_percent: qq.discount_percent, discount_amount: qq.discount_amount, total: qq.total });
  o.status_logs.push({ status: o.status, status_display: o.status_display, note: "اقلام سفارش ویرایش شد", created_at: nowIso(), changed_by_name: fullName(u) });
  return ok(orderDetail(o, true));
});
on("POST", "/orders/:id/add_note", ({ u, m, b }) => { const o = findOrder(u, +m[1]); const n = { id: nid(), text: b.text, author_name: fullName(u), created_at: nowIso() }; o.notes.unshift(n); return ok(n, 201); });
on("GET", "/product-picker", () => ok(D.products.filter((p: any) => p.is_active).map((p: any) => ({ id: p.id, name: p.name, sku: p.sku, min_order_cartons: p.min_order_cartons }))));

/* ---- marketing ---- */
on("GET", "/campaigns", () => ok(D.campaigns.map((c: any) => ({ ...c, assets_count: D.assets.filter((a: any) => a.campaign === c.id).length }))));
on("POST", "/campaigns", ({ b }) => { const c = { id: nid(), cover: null, starts_on: null, ends_on: null, created_at: nowIso(), ...b }; D.campaigns.unshift(c); return ok(c, 201); });
on("GET", "/marketing-assets", ({ q }) => ok(page(D.assets.filter((a: any) => (!q.get("kind") || a.kind === q.get("kind")) && (!q.get("campaign") || String(a.campaign) === q.get("campaign"))), q, 24)));
on("POST", "/marketing-assets", ({ b }) => {
  const L: any = { poster: "پوستر", banner: "بنر", photo: "عکس محصول", video: "ویدیو" };
  const camp = D.campaigns.find((c: any) => String(c.id) === String(b.campaign));
  const url = fileUrl(b.file);
  const a = { id: nid(), campaign: camp?.id ?? null, campaign_title: camp?.title ?? null, title: b.title, kind: b.kind, kind_display: L[b.kind], file: url, thumbnail: b.file?.type?.startsWith("image/") ? url : null, size_bytes: b.file?.size ?? 0, downloads: 0, created_at: nowIso() };
  D.assets.unshift(a); return ok(a, 201);
});
on("DELETE", "/marketing-assets/:id", ({ m }) => { D.assets = D.assets.filter((a: any) => a.id !== +m[1]); return ok(null, 204); });

/* ---- finance ---- */
const custParam = (u: any, q: URLSearchParams) => (CUSTOMER.includes(u.role) ? custById(u.customer_id) : visibleCustomers(u).find((c) => String(c.id) === q.get("customer")));
const financeDenied = (u: any) => CUSTOMER.includes(u.role) && !(u.is_customer_owner || u.can_view_finance);
on("GET", "/finance/summary", ({ u, q }) => {
  if (financeDenied(u)) return err(403, "شما به بخش مالی دسترسی ندارید.");
  const c = custParam(u, q); if (!c) return err(400, "مشتری را مشخص کنید.");
  const s: any = creditSummary(c);
  s.overdue = overdueOf(c.id, s.balance);
  s.upcoming_cheques = D.cheques.filter((x: any) => x.customer === c.id && x.status === "pending").sort((a: any, b: any) => a.due_date.localeCompare(b.due_date)).slice(0, 5);
  s.recent_payments = D.payments.filter((p: any) => p.customer === c.id).slice(0, 5);
  return ok(s);
});
on("GET", "/finance/ledger", ({ u, q }) => {
  if (financeDenied(u)) return err(403, "شما به بخش مالی دسترسی ندارید.");
  const cid = CUSTOMER.includes(u.role) ? u.customer_id : q.get("customer") ? +q.get("customer")! : null;
  let list = scoped(D.ledger, u).filter((e: any) => (!cid || e.customer === cid));
  if (cid) {
    let bal = 0;
    [...list].sort((a: any, b: any) => a.date.localeCompare(b.date) || a.id - b.id).forEach((e: any) => { bal += Number(e.debit) - Number(e.credit); e.balance_after = bal; });
  }
  list = list.filter((e: any) => !q.get("kind") || e.kind === q.get("kind")).sort((a: any, b: any) => b.date.localeCompare(a.date) || b.id - a.id);
  return ok(page(list, q));
});
on("GET", "/finance/cheques", ({ u, q }) => ok(page(scoped(D.cheques, u).filter((c: any) => (!q.get("status") || c.status === q.get("status")) && (!q.get("customer") || String(c.customer) === q.get("customer"))).sort((a: any, b: any) => a.due_date.localeCompare(b.due_date)), q)));
on("POST", "/finance/cheques", ({ u, b }) => {
  const c = CUSTOMER.includes(u.role) ? custById(u.customer_id) : custById(+b.customer);
  if (!(Number(b.amount) > 0)) return err(400, "مبلغ باید بیشتر از صفر باشد.");
  const ch = { id: nid(), customer: c.id, customer_name: c.business_name, number: b.number, bank: b.bank, amount: Number(b.amount), due_date: b.due_date, image: fileUrl(b.image), status: "pending", status_display: "در جریان", note: "", created_at: nowIso() };
  D.cheques.push(ch); return ok(ch, 201);
});
on("POST", "/finance/cheques/:id/set_status", ({ m, b }) => {
  const ch = D.cheques.find((x: any) => x.id === +m[1]);
  if (b.status === "cleared") addLedger(ch.customer, "cheque", "وصول چک", 0, ch.amount, `چک ${ch.number} - ${ch.bank}`, ch.number);
  if (b.status === "bounced" && ch.status === "cleared") addLedger(ch.customer, "bounced", "چک برگشتی", ch.amount, 0, `برگشت چک ${ch.number}`, ch.number);
  ch.status = b.status; ch.status_display = { pending: "در جریان", cleared: "وصول شده", bounced: "برگشتی" }[b.status as "pending"];
  notifyCustomer(ch.customer, `چک ${ch.number}: ${ch.status_display}`, "", "/finance/cheques");
  return ok(ch);
});
on("GET", "/finance/invoices", ({ u, q }) => ok(page(scoped(D.invoices, u).filter((i: any) => !q.get("kind") || i.kind === q.get("kind")).sort((a: any, b: any) => b.issued_on.localeCompare(a.issued_on)), q)));
on("GET", "/finance/payments", ({ u, q }) => ok(page(scoped(D.payments, u).sort((a: any, b: any) => b.created_at.localeCompare(a.created_at)), q)));
on("POST", "/finance/payments/start", ({ u, b }) => {
  const amount = parseInt(b.amount, 10) || 0;
  if (amount < 10000) return err(400, "حداقل مبلغ پرداخت ۱۰٬۰۰۰ ریال است.", { amount: ["حداقل مبلغ پرداخت ۱۰٬۰۰۰ ریال است."] });
  const order = b.order ? D.orders.find((o: any) => String(o.id) === String(b.order)) : null;
  const authority = "MOCK" + Math.random().toString(16).slice(2, 10).toUpperCase();
  D.payments.unshift({ id: nid(), customer: u.customer_id, purpose: order ? "prepayment" : "settlement", purpose_display: order ? "پیش‌پرداخت سفارش" : "تسویه حساب", amount, order: order?.id ?? null, order_number: order?.number ?? null, gateway: "mock", ref_id: "", status: "initiated", status_display: "در انتظار پرداخت", created_at: nowIso(), authority });
  return ok({ redirect_url: `/pay/mock?authority=${authority}&amount=${amount}`, authority }, 201);
});
on("POST", "/finance/payments/verify", ({ b }) => {
  const p = D.payments.find((x: any) => x.authority === b.authority);
  if (p && p.status === "initiated") {
    const okk = b.Status === "OK";
    p.status = okk ? "paid" : "failed"; p.status_display = okk ? "پرداخت شده" : "ناموفق";
    if (okk) { p.ref_id = "MREF" + Math.floor(Math.random() * 1e6); addLedger(p.customer, "payment", "پرداخت", 0, p.amount, "پرداخت اینترنتی" + (p.order_number ? ` سفارش ${p.order_number}` : ""), p.ref_id); }
  }
  return ok(p);
});

/* ---- reports & rewards ---- */
on("GET", "/reports/dashboard", ({ u, q }) => ok(dashboard(u, q)));
on("GET", "/rewards/me", ({ u }) => {
  const c = custById(u.customer_id); const t = jparts(today()); const hist = [];
  let y = t.y, mm = t.m;
  for (let i = 0; i < 6; i++) { hist.push(progressFor(c, y, mm)); if (mm === 1) { y--; mm = 12; } else mm--; }
  const [a, bb] = jRange(t.y, t.m);
  const lb = D.customers.filter((x: any) => x.type === "distributor" && x.status === "approved").map((x: any) => ({ id: x.id, name: x.business_name, city: x.city_name, sold: D.orders.filter((o: any) => o.customer === x.id && COUNTED.includes(o.status) && o.created_at.slice(0, 10) >= a && o.created_at.slice(0, 10) <= bb).reduce((s: number, o: any) => s + Number(o.total), 0) }))
    .filter((x: any) => x.sold > 0).sort((p: any, q2: any) => q2.sold - p.sold).map((x: any, i: number) => ({ rank: i + 1, ...x, is_me: x.id === c.id })).filter((x: any) => x.rank <= 10 || x.is_me);
  return ok({ current: hist[0], history: hist.slice(1), tiers: [...D.tiers].sort((p: any, q2: any) => p.min_percent - q2.min_percent), leaderboard: lb });
});
on("GET", "/rewards/overview", ({ u, q }) => {
  const t = jparts(today()); const y = +(q.get("year") || t.y), mm = +(q.get("month") || t.m);
  const rows = visibleCustomers(u).filter((c) => c.type === "distributor" && c.status === "approved").map((c) => ({ customer: c.id, name: c.business_name, city: c.city_name, ...progressFor(c, y, mm) })).sort((a, b) => b.percent - a.percent);
  return ok({ year: y, month: mm, rows });
});
on("GET", "/targets", ({ q }) => ok(page(D.targets.filter((t: any) => (!q.get("year") || String(t.year) === q.get("year")) && (!q.get("month") || String(t.month) === q.get("month"))), q, 200)));
on("POST", "/targets", ({ b }) => { const t = { id: nid(), ...b, target_amount: Number(b.target_amount) }; D.targets.push(t); return ok(t, 201); });
on("PATCH", "/targets/:id", ({ m, b }) => { const t = D.targets.find((x: any) => x.id === +m[1]); t.target_amount = Number(b.target_amount); return ok(t); });
on("GET", "/reward-tiers", () => ok([...D.tiers].sort((a: any, b: any) => a.min_percent - b.min_percent)));
on("POST", "/reward-tiers", ({ b }) => { const t = { id: nid(), ...b, min_percent: +b.min_percent, reward_percent: +b.reward_percent }; D.tiers.push(t); return ok(t, 201); });

/* ---- training ---- */
const courseOut = (c: any, u: any) => { const ls = D.lessons.filter((l: any) => l.course === c.id); const at = D.attempts.filter((a: any) => a.course === c.id && a.user === u.id); const dn = done[u.id] ?? new Set();
  return { ...c, lessons_count: ls.length, questions_count: D.questions.filter((q: any) => q.course === c.id).length, completed_count: ls.filter((l: any) => dn.has(l.id)).length, best_score: at.length ? Math.max(...at.map((a: any) => a.score)) : null }; };
on("GET", "/courses", ({ u }) => ok(D.courses.filter((c: any) => !CUSTOMER.includes(u.role) || (c.is_published && (!c.audiences.length || c.audiences.includes(u.role)))).map((c: any) => courseOut(c, u))));
on("POST", "/courses", ({ u, b }) => { const c = { id: nid(), cover: null, is_published: true, created_at: nowIso(), ...b }; D.courses.unshift(c); return ok(courseOut(c, u), 201); });
on("GET", "/courses/:id", ({ u, m }) => ok(courseOut(D.courses.find((c: any) => c.id === +m[1]), u)));
on("GET", "/courses/:id/lessons", ({ u, m }) => { const dn = done[u.id] ?? new Set(); return ok(D.lessons.filter((l: any) => l.course === +m[1]).sort((a: any, b: any) => a.order - b.order).map((l: any) => ({ ...l, video_url: "", completed: dn.has(l.id) }))); });
on("POST", "/courses/:id/lessons/(\\d+)/complete", ({ u, m }) => { (done[u.id] ??= new Set()).add(+m[2]); return ok({ ok: true }); });
on("GET", "/courses/:id/quiz", ({ u, m }) => ok(D.questions.filter((q: any) => q.course === +m[1]).map((q: any) => (CUSTOMER.includes(u.role) ? { id: q.id, text: q.text, choices: q.choices, order: q.order } : q))));
on("POST", "/courses/:id/submit_quiz", ({ u, m, b }) => {
  const qs = D.questions.filter((q: any) => q.course === +m[1]);
  const result = qs.map((q: any) => { const g = b.answers?.[String(q.id)]; return { question: q.id, given: g, correct_index: q.correct_index, ok: g != null && +g === q.correct_index }; });
  const score = result.filter((r: any) => r.ok).length;
  D.attempts.push({ course: +m[1], user: u.id, score });
  return ok({ score, total: qs.length, result });
});
on("POST", "/lessons", ({ b }) => { const l = { id: nid(), video: null, ...b }; D.lessons.push(l); return ok(l, 201); });
on("DELETE", "/lessons/:id", ({ m }) => { D.lessons = D.lessons.filter((l: any) => l.id !== +m[1]); return ok(null, 204); });
on("POST", "/quiz-questions", ({ b }) => { const q = { id: nid(), ...b }; D.questions.push(q); return ok(q, 201); });
on("DELETE", "/quiz-questions/:id", ({ m }) => { D.questions = D.questions.filter((q: any) => q.id !== +m[1]); return ok(null, 204); });

/* ---- support ---- */
on("GET", "/returns", ({ u, q }) => ok(page(scoped(D.returns, u).filter((r: any) => !q.get("status") || r.status === q.get("status")), q)));
on("POST", "/returns", ({ u, b }) => {
  const o = D.orders.find((x: any) => String(x.id) === String(b.order) && x.customer === u.customer_id);
  if (!o) return err(400, "سفارش را انتخاب کنید.");
  if (!["shipped", "delivered"].includes(o.status)) return err(400, "فقط برای سفارش‌های ارسال یا تحویل‌شده می‌توان مرجوعی ثبت کرد.");
  const RL: any = { broken: "شکسته", shortage: "کسری", defective: "معیوب", expired: "تاریخ گذشته", other: "سایر" };
  const r = { id: nid(), order: o.id, order_number: o.number, customer: o.customer, customer_name: o.customer_name, reason: b.reason, reason_display: RL[b.reason], description: b.description || "", items: JSON.parse(b.items || "[]"),
    status: "submitted", status_display: "ثبت شده", resolution: "", images: arr(b.images).map((f: any) => ({ id: nid(), image: fileUrl(f) })), created_at: nowIso(), updated_at: nowIso() };
  D.returns.unshift(r);
  notifyStaff(custById(o.customer), `درخواست مرجوعی برای سفارش ${o.number}`, r.reason_display, `/admin/returns?id=${r.id}`);
  return ok(r, 201);
});
on("POST", "/returns/:id/set_status", ({ m, b }) => {
  const r = D.returns.find((x: any) => x.id === +m[1]);
  const L: any = { submitted: "ثبت شده", reviewing: "در حال بررسی", approved: "تأیید شده", rejected: "رد شده", resolved: "رسیدگی شده" };
  Object.assign(r, { status: b.status, status_display: L[b.status], resolution: b.resolution ?? r.resolution, updated_at: nowIso() });
  notifyCustomer(r.customer, `مرجوعی سفارش ${r.order_number}: ${r.status_display}`, r.resolution, "/support/returns");
  return ok(r);
});
on("GET", "/tickets", ({ u, q }) => ok(page(scoped(D.tickets, u).filter((t: any) => !q.get("status") || t.status === q.get("status")).sort((a: any, b: any) => b.updated_at.localeCompare(a.updated_at)), q)));
on("GET", "/tickets/:id", ({ u, m }) => { const t = scoped(D.tickets, u).find((x: any) => x.id === +m[1]); return t ? ok(t) : err(404, "یافت نشد."); });
const TS: any = { open: "باز", answered: "پاسخ داده شده", waiting: "در انتظار پاسخ", closed: "بسته" };
on("POST", "/tickets", ({ u, b }) => {
  const c = custById(u.customer_id); const DL: any = { sales: "کارشناس فروش", support: "پشتیبانی", finance: "مالی" };
  const o = b.order ? D.orders.find((x: any) => String(x.id) === String(b.order)) : null;
  const t = { id: nid(), subject: b.subject, department: b.department, department_display: DL[b.department], status: "open", status_display: TS.open, customer: c.id, customer_name: c.business_name, order: o?.id ?? null, order_number: o?.number ?? null,
    messages: [{ id: nid(), text: b.first_message, attachment: null, is_staff_reply: false, author_name: fullName(u), created_at: nowIso() }], created_at: nowIso(), updated_at: nowIso() };
  D.tickets.unshift(t);
  notifyStaff(c, `تیکت جدید: ${t.subject}`, c.business_name, `/admin/tickets?id=${t.id}`);
  return ok(t, 201);
});
on("POST", "/tickets/:id/reply", ({ u, m, b }) => {
  const t = D.tickets.find((x: any) => x.id === +m[1]); const staff = !CUSTOMER.includes(u.role);
  const msg = { id: nid(), text: b.text, attachment: null, is_staff_reply: staff, author_name: fullName(u), created_at: nowIso() };
  t.messages.push(msg); t.status = staff ? "answered" : "waiting"; t.status_display = TS[t.status]; t.updated_at = nowIso();
  if (staff) notifyCustomer(t.customer, `پاسخ تیکت: ${t.subject}`, b.text.slice(0, 120), `/support/tickets/detail?id=${t.id}`);
  else notifyStaff(custById(t.customer), `پیام جدید در تیکت: ${t.subject}`, b.text.slice(0, 120), `/admin/tickets?id=${t.id}`);
  return ok(msg, 201);
});
on("POST", "/tickets/:id/close", ({ m }) => { const t = D.tickets.find((x: any) => x.id === +m[1]); t.status = "closed"; t.status_display = TS.closed; return ok(t); });

/* ---- integrations ---- */
on("GET", "/integrations/logs", () => ok(D.synclogs.slice(0, 50)));
on("POST", "/integrations/run", ({ b }) => {
  D.synclogs.unshift(b.kind === "products"
    ? { id: nid(), kind: "products", kind_display: "محصولات و موجودی", success: true, message: `${D.products.length} کالا به‌روزرسانی شد`, items: D.products.length, created_at: nowIso() }
    : { id: nid(), kind: "invoices", kind_display: "فاکتورها و مانده", success: true, message: "0 فاکتور جدید", items: 0, created_at: nowIso() });
  return ok({ queued: true });
});

/** Section permission required from staff users (mirrors the Django permission classes). */
const GATES: [string, RegExp, string[]][] = [
  ["*", /^\/(positions|users)/, ["users"]],
  ["POST", /^\/customers\/\d+\/(approve|reject|suspend)/, ["customers_manage"]],
  ["PATCH", /^\/customers\//, ["customers_manage"]],
  ["GET", /^\/customers/, ["customers", "customers_manage", "finance"]],
  ["*", /^\/reports/, ["dashboard"]],
  ["*", /^\/(coverage|agency-applications)/, ["network"]],
  ["*", /^\/(rewards\/overview|targets)/, ["targets"]],
  ["*", /^\/integrations/, ["integrations"]],
  ["POST", /^\/orders\/\d+\/(set_status|edit_items)/, ["orders_manage"]],
  ["*", /^\/orders/, ["orders", "orders_manage"]],
  ["POST", /^\/finance\/cheques\/\d+\/set_status/, ["finance_manage"]],
  ["*", /^\/finance/, ["finance", "finance_manage", "customers_manage"]],
  ["*", /^\/price-groups/, ["pricing"]],
  ["POST", /^\/volume-discounts/, ["pricing"]],
  ["DELETE", /^\/volume-discounts/, ["pricing"]],
  ["POST", /^\/(products|categories)/, ["products"]],
  ["PATCH", /^\/(products|categories)/, ["products"]],
  ["*", /^\/(returns|tickets)/, ["support"]],
  ["POST", /^\/(announcements)/, ["announcements"]],
  ["POST", /^\/(marketing-assets|campaigns)/, ["marketing"]],
  ["POST", /^\/(courses|lessons|quiz-questions)/, ["training"]],
];

/* ================================================================ entry */
export async function initMock(url: string) {
  const res = await fetch(url);
  D = await res.json();
  shiftDates(D, Date.now() - new Date(D.exported_at).getTime());
  D.attempts = [];
  D.notifications ??= [];
  nextId = 1_000_000;
  // a few starter notifications so the bell isn't empty
  const mgr = D.users.find((u: any) => u.username === "manager");
  const pend = D.customers.filter((c: any) => c.status === "pending");
  pend.forEach((c: any) => notify(mgr?.id, "درخواست عضویت جدید", `${c.business_name} - ${c.city_name}`, `/admin/customers/review?id=${c.id}`));
  const shiraz = D.users.find((u: any) => u.phone === "09121111111");
  const lastShip = D.orders.find((o: any) => o.customer === shiraz?.customer_id && o.status === "shipped");
  if (lastShip) notify(shiraz.id, `سفارش ${lastShip.number}: ارسال شده`, "بار امروز از انبار مرکزی خارج شد.", `/orders/detail?id=${lastShip.id}`);
  notify(shiraz?.id, "یادآوری سررسید چک", "یکی از چک‌های شما ۳ روز دیگر سررسید می‌شود.", "/finance/cheques");
}

export async function handle(method: string, fullPath: string, body?: unknown): Promise<R> {
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 180)); // feel like a network
  const [path, qs] = fullPath.split("?");
  const q = new URLSearchParams(qs || "");
  const token = tokens.access;
  const u = token?.startsWith("demo:") ? userById(+token.slice(5)) : null;
  const b = bodyObj(body);
  for (const [mth, re, h, pub] of routes) {
    if (mth !== method) continue;
    const m = path.match(re);
    if (!m) continue;
    if (!pub && !u) return err(401, "ابتدا وارد شوید.");
    if (u && STAFF.includes(u.role) && u.role !== "admin") {
      const need = GATES.find(([mm, re2]) => (mm === "*" || mm === method) && re2.test(path));
      if (need && !need[2].some((k) => u.permissions.includes(k))) return err(403, "سمت شما به این بخش دسترسی ندارد.");
    }
    try {
      return h({ u, q, b, m });
    } catch (e) {
      console.error("demo mock error", method, path, e);
      return err(500, "خطای داخلی نسخه‌ی دمو");
    }
  }
  return err(404, `مسیر ${path} در نسخه‌ی دمو پیاده نشده است.`);
}

export function orderForProforma(path: string) {
  const m = path.match(/\/orders\/(\d+)\/proforma/);
  return m ? D.orders.find((o: any) => o.id === +m[1]) : null;
}
