"use client";
import React from "react";
import { Icon } from "@/components/icons";
import { Badge, Card, Empty, Money, Progress, StatusChip } from "@/components/ui";
import { Page } from "@/lib/api";
import { canFinance, canOrder, useAuth } from "@/lib/auth";
import { fa, ago, jdate, num, short } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { Link } from "@/lib/nav";
import type { Order } from "@/lib/types";
import { useReorder } from "./Orders";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: orders } = useApi<Page<Order>>("/orders/", { page_size: 5 });
  const { data: ann } = useApi<any[]>("/announcements/");
  const { data: fin } = useApi<any>(canFinance(user) ? "/finance/summary/" : null);
  const { data: rw } = useApi<any>(user?.role === "distributor" ? "/rewards/me/" : null);
  const { reorder, busy } = useReorder();
  const last = orders?.results[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? "صبح بخیر" : hour < 17 ? "روز بخیر" : "عصر بخیر";
  const quick = [
    canOrder(user) && { to: user?.role === "lab" ? "/lab" : "/catalog", icon: "plus", t: "سفارش جدید", d: "از کاتالوگ با قیمت شما" },
    canFinance(user) && { to: "/finance/pay", icon: "shield", t: "پرداخت آنلاین", d: "تسویه یا پیش‌پرداخت" },
    { to: "/marketing", icon: "folder", t: "کیت بازاریابی", d: "پوستر، بنر و ویدیو" },
    { to: "/support/tickets/new", icon: "message", t: "پیام به پشتیبانی", d: "پاسخ از کارشناس فروش" },
  ].filter(Boolean) as { to: string; icon: string; t: string; d: string }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted">{hello}،</p>
          <h1 className="text-2xl font-bold text-navy-700">{user?.first_name} {user?.last_name}</h1>
          <p className="text-sm text-ink-soft mt-1">{user?.customer?.business_name} · {user?.customer?.city_name}{user?.customer?.sales_rep_name ? ` · کارشناس شما: ${user.customer.sales_rep_name}` : ""}</p>
        </div>
        {last && canOrder(user) && (
          <button disabled={busy} onClick={() => reorder(last.id)} className="card px-4 py-3 flex items-center gap-3 hover:border-navy-300 text-right">
            <span className="w-10 h-10 rounded-xl bg-navy-600 text-cream-50 grid place-items-center"><Icon name="repeat" /></span>
            <span><span className="block text-sm font-semibold text-navy-700">تکرار سفارش قبلی</span><span className="block text-xs text-ink-muted num">{num(last.items_count)} قلم · {num(last.total_cartons)} کارتن · {jdate(last.created_at)}</span></span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {quick.map((q) => (
          <Link key={q.to} to={q.to} className="card p-4 flex items-center gap-3 hover:border-navy-300 transition-colors">
            <span className="w-10 h-10 rounded-xl bg-cream-200 text-navy-600 grid place-items-center shrink-0"><Icon name={q.icon} /></span>
            <span className="min-w-0"><span className="block text-sm font-semibold">{q.t}</span><span className="block text-xs text-ink-muted truncate">{q.d}</span></span>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card title="آخرین سفارش‌ها" className="lg:col-span-2" actions={<Link to="/orders" className="text-xs text-navy-500">همه‌ی سفارش‌ها</Link>} pad={false}>
          {!orders?.results.length ? <Empty icon="truck" title="هنوز سفارشی ثبت نکرده‌اید" /> : (
            <ul>
              {orders.results.map((o) => (
                <li key={o.id}>
                  <Link to={`/orders/detail?id=${o.id}`} className="flex items-center gap-4 px-5 py-3 border-t border-cream-200 hover:bg-cream-100">
                    <div className="flex-1 min-w-0"><div className="text-sm font-medium num">سفارش {fa(o.number)}</div><div className="text-xs text-ink-muted num">{jdate(o.created_at)} · {num(o.total_cartons)} کارتن</div></div>
                    <Money v={o.total} className="text-sm hidden sm:block" />
                    <StatusChip status={o.status} label={o.status_display} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          {fin && (
            <Card title="وضعیت اعتبار" actions={<Link to="/finance" className="text-xs text-navy-500">گردش حساب</Link>}>
              <div className="text-xs text-ink-muted">اعتبار باقی‌مانده</div>
              <div className="text-2xl font-bold text-navy-700 num">{short(Math.max(0, fin.available_credit))} <span className="text-sm font-normal">ریال</span></div>
              {fin.credit_limit > 0 && <Progress className="mt-3" value={(Math.max(0, fin.available_credit) / fin.credit_limit) * 100} color={fin.available_credit / fin.credit_limit < 0.2 ? "bg-bad" : "bg-navy-500"} />}
              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                <div><div className="text-ink-muted">سقف اعتبار</div><div className="font-semibold num">{short(fin.credit_limit)}</div></div>
                <div><div className="text-ink-muted">مانده بدهی</div><div className="font-semibold num">{short(fin.balance)}</div></div>
              </div>
              {fin.overdue > 0 && <div className="mt-3 text-xs rounded-lg bg-bad-soft text-bad p-2">بدهی سررسیدگذشته: <b className="num">{short(fin.overdue)}</b> ریال</div>}
            </Card>
          )}
          {rw && (
            <Card title={`هدف ${rw.current.month_name}`} actions={<Link to="/rewards" className="text-xs text-navy-500">جزئیات</Link>}>
              <div className="flex justify-between text-sm mb-2"><span className="num">{num(rw.current.percent)}٪ از هدف</span>{rw.current.current_tier && <Badge color="gold">{rw.current.current_tier.title}</Badge>}</div>
              <Progress value={rw.current.percent} color="bg-gold" />
              <div className="text-xs text-ink-muted mt-2 num">{short(rw.current.sold)} از {short(rw.current.target)} ریال</div>
            </Card>
          )}
        </div>
      </div>

      <Card title="اطلاعیه‌های شرکت">
        {!ann?.length ? <p className="text-sm text-ink-muted">اطلاعیه‌ی تازه‌ای نیست.</p> : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {ann.slice(0, 6).map((a) => (
              <article key={a.id} className="rounded-xl bg-cream-100 border border-cream-300 p-4">
                <div className="flex items-center gap-2 mb-1">{a.pinned && <Icon name="megaphone" className="w-4 h-4 text-gold" />}<h3 className="font-semibold text-sm">{a.title}</h3></div>
                <p className="text-xs text-ink-soft leading-6">{a.body}</p>
                <div className="text-[11px] text-ink-muted mt-2">{ago(a.created_at)}</div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
