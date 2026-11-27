/** Entry of the single-file demo: the real app + an in-browser mock of the Django API. */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { fa, jdate, num } from "@/lib/format";
import { HistoryNavProvider } from "@/lib/nav";
import { handle, initMock, orderForProforma } from "./mock";

function overlay(html: string) {
  const el = document.createElement("div");
  el.className = "fixed inset-0 z-[90] bg-navy-900/50 flex items-center justify-center p-4";
  el.innerHTML = `<div class="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto shadow-xl">${html}
    <div class="p-4 border-t border-cream-300 flex justify-end"><button class="btn-primary" data-close>بستن</button></div></div>`;
  el.addEventListener("click", (e) => { if (e.target === el || (e.target as HTMLElement).hasAttribute("data-close")) el.remove(); });
  document.body.appendChild(el);
}

function proformaHtml(o: any) {
  const rows = o.items.map((i: any, n: number) => `<tr><td class="td">${num(n + 1)}</td><td class="td">${i.product_name}</td><td class="td" dir="ltr">${i.sku}</td><td class="td num">${num(i.cartons)}</td><td class="td num">${num(i.unit_price)}</td><td class="td num">${num(i.line_total)}</td></tr>`).join("");
  return `<div class="p-6">
    <div class="flex justify-between items-center bg-cream-200 rounded-xl px-5 py-4 mb-4"><b class="text-lg text-navy-700">پرتال فروش عمده‌ی مَن</b><b class="text-navy-700">پیش‌فاکتور</b></div>
    <div class="grid grid-cols-2 gap-2 text-sm mb-4"><div>شماره: <b>${fa(o.number)}</b></div><div>تاریخ: <b>${jdate(o.created_at)}</b></div>
    <div>خریدار: <b>${o.customer_name}</b></div><div>تحویل: ${o.city_name}، ${o.delivery_address}</div></div>
    <table class="w-full text-sm"><thead class="bg-navy-600 text-cream-50"><tr><th class="p-2">ردیف</th><th class="p-2 text-right">شرح کالا</th><th class="p-2">کد</th><th class="p-2">کارتن</th><th class="p-2">قیمت کارتن</th><th class="p-2">مبلغ (ریال)</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="mt-4 mr-auto max-w-xs text-sm space-y-1"><div class="flex justify-between"><span>جمع کل</span><b class="num">${num(o.subtotal)}</b></div>
    <div class="flex justify-between"><span>تخفیف حجمی ${num(o.discount_percent)}٪</span><b class="num">${num(o.discount_amount)}</b></div>
    <div class="flex justify-between border-t pt-1"><span>قابل پرداخت</span><b class="num text-navy-700">${num(o.total)} ریال</b></div></div>
    <p class="text-xs text-ink-muted mt-6">در نسخه‌ی اصلی این سند به‌صورت فایل PDF فارسی دانلود می‌شود. (پیش‌نمایش نسخه‌ی دمو)</p></div>`;
}

(globalThis as any).__MAN_DEMO__ = {
  handle,
  download(path: string, name: string) {
    const o = orderForProforma(path);
    if (o) return overlay(proformaHtml(o));
    const what = name.endsWith(".xlsx") ? "فایل اکسل گزارش (۷ برگه: فروش زمانی، شهرها، محصولات، نماینده‌ها، کارشناسان، غیرفعال‌ها، مطالبات)" : "فایل PDF فارسی (فاکتور / صورت‌حساب دوره‌ای)";
    overlay(`<div class="p-8 text-center space-y-3"><div class="text-lg font-bold text-navy-700">دانلود در نسخه‌ی دمو غیرفعال است</div>
      <p class="text-sm text-ink-soft">در نسخه‌ی اصلی این دکمه ${what} را دانلود می‌کند.</p><p class="text-xs text-ink-muted" dir="ltr">${name}</p></div>`);
  },
};

function DemoBadge() {
  return (
    <div className="fixed bottom-3 left-3 z-[60] chip bg-gold text-white shadow-lg pointer-events-none">نسخه‌ی دمو · داده‌ها نمونه هستند</div>
  );
}

async function boot() {
  const root = createRoot(document.getElementById("app")!);
  try {
    await initMock(process.env.DEMO_ROUTER === "history" ? "/data.json" : "data.json");
  } catch {
    document.getElementById("app")!.innerHTML = '<p style="padding:2rem">بارگذاری داده‌ی دمو ناموفق بود.</p>';
    return;
  }
  root.render(
    <HistoryNavProvider mode={process.env.DEMO_ROUTER === "history" ? "history" : "memory"}>
      <App />
      <DemoBadge />
    </HistoryNavProvider>,
  );
}
boot();
