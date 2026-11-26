"use client";
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { can, canFinance, canOrder, isStaff, staffHome, useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { ago, num } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { Link, useNav } from "@/lib/nav";
import type { User } from "@/lib/types";
import { Icon } from "./icons";
import { cx } from "./ui";

type Item = { to: string; label: string; icon: string; show?: (u: User) => boolean; badge?: number };
type Group = { title?: string; items: Item[] };

function menuFor(u: User, counts: Record<string, number>): Group[] {
  if (isStaff(u)) {
    const c = (...k: string[]) => can(u, ...k);
    const groups: Group[] = [
      { items: [{ to: "/admin", label: "داشبورد مدیریتی", icon: "chart", show: () => c("dashboard") }] },
      { title: "فروش", items: [
        { to: "/admin/customers", label: "مشتری‌ها و تأیید", icon: "users", badge: counts.pending, show: () => c("customers", "customers_manage") },
        { to: "/admin/orders", label: "صف سفارش‌ها", icon: "truck", badge: counts.orders, show: () => c("orders", "orders_manage") },
        { to: "/admin/finance", label: "مالی، چک و اعتبار", icon: "wallet", show: () => c("finance", "finance_manage") },
        { to: "/admin/targets", label: "اهداف و پاداش", icon: "award", show: () => c("targets") },
        { to: "/admin/network", label: "شبکه‌ی فروش", icon: "map", show: () => c("network") },
      ] },
      { title: "کالا و محتوا", items: [
        { to: "/admin/products", label: "محصولات", icon: "box", show: () => c("products") },
        { to: "/admin/pricing", label: "قیمت‌گذاری", icon: "tag", show: () => c("pricing") },
        { to: "/admin/marketing", label: "کیت بازاریابی", icon: "folder" },
        { to: "/admin/training", label: "آموزش", icon: "book" },
        { to: "/admin/announcements", label: "اطلاعیه‌ها", icon: "megaphone", show: () => c("announcements") },
      ] },
      { title: "پشتیبانی", items: [
        { to: "/admin/returns", label: "مرجوعی و شکایت", icon: "rotate", show: () => c("support") },
        { to: "/admin/tickets", label: "تیکت‌ها", icon: "message", show: () => c("support") },
      ] },
      { title: "سیستم", items: [
        { to: "/admin/integrations", label: "اتصال حسابداری", icon: "sync", show: () => c("integrations") },
        { to: "/admin/users", label: "کاربران و سمت‌ها", icon: "shield", show: () => c("users") },
      ] },
    ];
    return groups.map((g) => ({ ...g, items: g.items.filter((i) => !i.show || i.show(u)) })).filter((g) => g.items.length);
  }
  const lab = u.role === "lab";
  return [
    { items: [
      { to: "/dashboard", label: "داشبورد", icon: "home" },
      { to: lab ? "/lab" : "/catalog", label: lab ? "پرتال آزمایشگاهی" : "کاتالوگ محصولات", icon: lab ? "flask" : "box" },
      ...(canOrder(u) ? [{ to: "/cart", label: "سبد خرید", icon: "cart", badge: counts.cart }] : []),
      { to: "/orders", label: "سفارش‌های من", icon: "truck" },
    ] },
    ...(canFinance(u) ? [{ title: "حساب‌وکتاب", items: [
      { to: "/finance", label: "وضعیت حساب", icon: "wallet" },
      { to: "/finance/cheques", label: "چک‌ها", icon: "card" },
      { to: "/finance/invoices", label: "فاکتورها", icon: "receipt" },
      { to: "/finance/pay", label: "پرداخت آنلاین", icon: "shield" },
    ] }] : []),
    { title: "همراه شما", items: [
      ...(u.role === "distributor" ? [{ to: "/rewards", label: "پیشرفت من و جوایز", icon: "award" }] : []),
      { to: "/marketing", label: "کیت بازاریابی", icon: "folder" },
      { to: "/training", label: "آموزش", icon: "book" },
      { to: "/support/returns", label: "مرجوعی و شکایت", icon: "rotate" },
      { to: "/support/tickets", label: "پشتیبانی", icon: "message" },
      ...(u.is_customer_owner ? [{ to: "/team", label: "کاربران شرکت", icon: "users" }] : []),
    ] },
  ];
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-navy-600 text-cream-50 grid place-items-center font-black text-lg leading-none">مَن</div>
      <div className="leading-tight">
        <div className="font-bold text-navy-700">پرتال مَن</div>
        <div className="text-[11px] text-ink-muted">فروش عمده و نمایندگان</div>
      </div>
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi<any>("/notifications/", { page_size: 8 });
  const nav = useNav();
  useEffect(() => {
    const t = setInterval(reload, 60000);
    return () => clearInterval(t);
  }, [reload]);
  const unread = data?.unread ?? 0;
  return (
    <div className="relative">
      <button className="btn-ghost w-10 px-0 relative" onClick={() => setOpen(!open)} aria-label="اعلان‌ها">
        <Icon name="bell" />
        {unread > 0 && <span className="absolute top-1 left-1 min-w-4 h-4 px-1 rounded-full bg-bad text-white text-[10px] grid place-items-center num">{num(unread)}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] card z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-cream-300">
              <span className="font-semibold text-sm text-navy-700">اعلان‌ها</span>
              {unread > 0 && <button className="text-xs text-navy-500" onClick={async () => { await api.post("/notifications/read_all/"); reload(); }}>همه خوانده شد</button>}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {(data?.results ?? []).length === 0 && <p className="text-sm text-ink-muted p-6 text-center">اعلان تازه‌ای ندارید.</p>}
              {(data?.results ?? []).map((n: any) => (
                <button key={n.id} className={cx("w-full text-right px-4 py-3 border-b border-cream-200 hover:bg-cream-100 block", !n.is_read && "bg-navy-50/60")}
                  onClick={async () => {
                    setOpen(false);
                    await api.post(`/notifications/${n.id}/read/`);
                    reload();
                    if (n.link) { const [p, q] = n.link.split("?"); nav.push(p, Object.fromEntries(new URLSearchParams(q || ""))); }
                  }}>
                  <div className="text-sm font-medium text-ink">{n.title}</div>
                  {n.body && <div className="text-xs text-ink-muted mt-0.5 line-clamp-2">{n.body}</div>}
                  <div className="text-[11px] text-ink-muted mt-1">{ago(n.created_at)}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { cart } = useCart();
  const nav = useNav();
  const [drawer, setDrawer] = useState(false);
  const staff = isStaff(user);
  const { data: cstats } = useApi<Record<string, number>>(staff && can(user, "customers", "customers_manage") ? "/customers/stats/" : null);
  const { data: ostats } = useApi<Record<string, number>>(staff && can(user, "orders", "orders_manage") ? "/orders/stats/" : null);
  useEffect(() => setDrawer(false), [nav.path]);
  if (!user) return null;
  const groups = menuFor(user, { pending: cstats?.pending ?? 0, orders: ostats?.submitted ?? 0, cart: cart?.items.length ?? 0 });
  const active = (to: string) => nav.path === to || (to !== "/admin" && to !== "/finance" && nav.path.startsWith(to + "/"));

  const sidebar = (
    <nav className="flex flex-col gap-5 p-4">
      {groups.map((g, i) => (
        <div key={i}>
          {g.title && <div className="text-[11px] font-medium tracking-wide text-ink-muted px-3 mb-1.5">{g.title}</div>}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => (
              <li key={it.to}>
                <Link to={it.to} className={cx("flex items-center gap-3 rounded-xl px-3 h-10 text-sm transition-colors",
                  active(it.to) ? "bg-navy-600 text-cream-50" : "text-ink-soft hover:bg-cream-200")}>
                  <Icon name={it.icon} className="w-[18px] h-[18px] shrink-0" />
                  <span className="flex-1 truncate">{it.label}</span>
                  {!!it.badge && <span className={cx("num text-[11px] rounded-full px-1.5 min-w-5 text-center", active(it.to) ? "bg-gold text-white" : "bg-gold-soft text-gold")}>{num(it.badge)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-cream-100 border-l border-cream-300 sticky top-0 h-screen">
        <div className="px-5 h-16 flex items-center border-b border-cream-300"><Link to={staff ? staffHome(user) : "/dashboard"}><Logo /></Link></div>
        <div className="flex-1 overflow-y-auto">{sidebar}</div>
      </aside>
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-navy-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-cream-100 overflow-y-auto">
            <div className="px-5 h-16 flex items-center border-b border-cream-300"><Logo /></div>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-cream/90 backdrop-blur border-b border-cream-300 flex items-center gap-2 px-4 md:px-6">
          <button className="btn-ghost w-10 px-0 lg:hidden" onClick={() => setDrawer(true)} aria-label="منو"><Icon name="menu" /></button>
          <div className="lg:hidden"><Logo /></div>
          <div className="flex-1" />
          {!staff && canOrder(user) && (
            <Link to="/cart" className="btn-ghost relative w-10 px-0" title="سبد خرید">
              <Icon name="cart" />
              {!!cart?.items.length && <span className="absolute top-1 left-1 min-w-4 h-4 px-1 rounded-full bg-navy-600 text-white text-[10px] grid place-items-center num">{num(cart.items.length)}</span>}
            </Link>
          )}
          <Notifications />
          <div className="hidden sm:flex flex-col items-end leading-tight mr-2 border-r border-cream-300 pr-3">
            <span className="text-sm font-medium text-ink">{user.full_name || user.phone}</span>
            <span className="text-[11px] text-ink-muted">{user.customer?.business_name ? `${user.customer.business_name} · ` : ""}{user.role_display}{!user.is_customer_owner && user.customer ? ` · ${user.job_title || "زیرکاربر"}` : ""}</span>
          </div>
          <button className="btn-ghost w-10 px-0" onClick={() => { signOut(); nav.replace("/login"); }} aria-label="خروج" title="خروج"><Icon name="logout" /></button>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
