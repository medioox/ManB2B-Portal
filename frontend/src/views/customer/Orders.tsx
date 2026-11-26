"use client";
import React, { useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Card, ConfirmButton, Empty, ErrorBox, Img, KV, Loading, Money, PageHeader, Pagination, StatusChip, Table, Tabs, cx, useAction, useToast } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { canOrder, useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { fa, jdate, jtime, num } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { Link, useNav } from "@/lib/nav";
import type { Order } from "@/lib/types";

export function useReorder() {
  const { run, busy } = useAction();
  const { setCart } = useCart();
  const nav = useNav();
  const toast = useToast();
  const reorder = async (id: number) => {
    const r = await run(() => api.post(`/orders/${id}/reorder/`), "اقلام سفارش به سبد اضافه شد");
    if (r) {
      setCart(r.cart);
      if (r.skipped?.length) toast(`ناموجود و حذف‌شده: ${r.skipped.join("، ")}`, "info");
      nav.push("/cart");
    }
  };
  return { reorder, busy };
}

export default function Orders() {
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<Page<Order>>("/orders/", { status: tab, page });
  const { reorder, busy } = useReorder();
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="سفارش‌های من" actions={canOrder(user) && <Link to="/catalog" className="btn-primary"><Icon name="plus" className="w-4 h-4" />سفارش جدید</Link>} />
      <div className="mb-4"><Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[
        { value: "", label: "همه" }, { value: "submitted", label: "ثبت شده" }, { value: "confirmed", label: "تأیید شده" },
        { value: "preparing", label: "آماده‌سازی" }, { value: "shipped", label: "ارسال شده" }, { value: "delivered", label: "تحویل شده" }, { value: "canceled", label: "لغو شده" },
      ]} /></div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.results.length ? (
        <div className="card"><Empty icon="truck" title="سفارشی در این وضعیت ندارید" /></div>
      ) : (
        <Card pad={false}>
          <div className="px-5 pt-2"><Table>
            <thead><tr><th className="th">شماره</th><th className="th">تاریخ</th><th className="th">اقلام</th><th className="th">کارتن</th><th className="th">مبلغ</th><th className="th">وضعیت</th><th className="th"></th></tr></thead>
            <tbody>
              {data.results.map((o) => (
                <tr key={o.id} className="hover:bg-cream-100">
                  <td className="td"><Link to={`/orders/detail?id=${o.id}`} className="font-medium text-navy-600 num">{fa(o.number)}</Link></td>
                  <td className="td num">{jdate(o.created_at)}</td>
                  <td className="td num">{num(o.items_count)}</td>
                  <td className="td num">{num(o.total_cartons)}</td>
                  <td className="td"><Money v={o.total} /></td>
                  <td className="td"><StatusChip status={o.status} label={o.status_display} /></td>
                  <td className="td text-left whitespace-nowrap">
                    {canOrder(user) && <Button variant="ghost" size="sm" icon="repeat" disabled={busy} onClick={() => reorder(o.id)}>تکرار</Button>}
                    <Link to={`/orders/detail?id=${o.id}`} className="btn-ghost btn-sm">جزئیات</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table></div>
          <div className="px-5 pb-4"><Pagination page={page} count={data.count} onChange={setPage} /></div>
        </Card>
      )}
    </>
  );
}

export function OrderTimeline({ o }: { o: Order }) {
  const flow = o.flow ?? [];
  const reached = new Map((o.status_logs ?? []).map((l) => [l.status, l]));
  const idx = flow.findIndex((s) => s.value === o.status);
  if (o.status === "canceled") {
    const l = reached.get("canceled");
    return <div className="rounded-xl bg-bad-soft text-bad p-4 text-sm">این سفارش لغو شده است{l ? ` (${jtime(l.created_at)})` : ""}.{l?.note ? ` ${l.note}` : ""}</div>;
  }
  return (
    <ol className="grid grid-cols-5 gap-1">
      {flow.map((s, i) => {
        const done = i <= idx;
        const log = reached.get(s.value);
        return (
          <li key={s.value} className="flex flex-col items-center text-center gap-2 relative">
            {i > 0 && <span className={cx("absolute top-4 left-1/2 w-full h-0.5 -z-0", i <= idx ? "bg-navy-500" : "bg-cream-400")} />}
            <span className={cx("relative z-10 w-8 h-8 rounded-full grid place-items-center border-2", done ? "bg-navy-600 border-navy-600 text-cream-50" : "bg-cream-50 border-cream-400 text-ink-muted", i === idx && "ring-4 ring-navy-100")}>
              {done ? <Icon name="check" className="w-4 h-4" /> : <span className="text-xs num">{num(i + 1)}</span>}
            </span>
            <span className={cx("text-[11px] sm:text-xs font-medium", done ? "text-navy-700" : "text-ink-muted")}>{s.label}</span>
            <span className="text-[10px] text-ink-muted num hidden sm:block">{log ? jtime(log.created_at) : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderDetail() {
  const { params, push } = useNav();
  const { user } = useAuth();
  const { data: o, error, loading, reload } = useApi<Order>(`/orders/${params.id}/`);
  const { reorder, busy } = useReorder();
  const { run } = useAction();
  if (error) return <ErrorBox error={error} />;
  if (loading || !o) return <Loading />;
  return (
    <>
      <PageHeader title={`سفارش ${fa(o.number)}`} subtitle={`ثبت ${jtime(o.created_at)}`}
        back={<Link to="/orders" className="text-xs text-navy-500 flex items-center gap-1 mb-2"><Icon name="right" className="w-3.5 h-3.5" />سفارش‌ها</Link>}
        actions={<>
          <Button variant="secondary" icon="download" onClick={() => run(() => api.download(`/orders/${o.id}/proforma/`, `proforma-${o.number}.pdf`))}>پیش‌فاکتور PDF</Button>
          {canOrder(user) && <Button variant="secondary" icon="repeat" loading={busy} onClick={() => reorder(o.id)}>تکرار این سفارش</Button>}
          {o.status === "submitted" && <ConfirmButton variant="ghost" icon="x" confirmText="سفارش لغو شود؟" onConfirm={async () => { await run(() => api.post(`/orders/${o.id}/cancel/`), "سفارش لغو شد"); reload(); }}>لغو</ConfirmButton>}
        </>} />
      {params.new && <div className="mb-5 rounded-2xl bg-ok-soft text-ok p-4 text-sm flex gap-2 items-center"><Icon name="check" />سفارش ثبت شد. پس از تأیید کارشناس فروش، پیامک اطلاع‌رسانی دریافت می‌کنید.</div>}
      <Card className="mb-6"><div className="py-2 overflow-x-auto"><div className="min-w-[480px]"><OrderTimeline o={o} /></div></div></Card>
      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <Card title="اقلام سفارش" pad={false}>
          <ul>
            {o.items?.map((i) => (
              <li key={i.id} className="flex gap-3 items-center px-5 py-3 border-t border-cream-200">
                <Img src={i.image} alt={i.product_name} className="w-12 h-12 rounded-lg shrink-0" />
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{i.product_name}</div><div className="text-xs text-ink-muted num">{num(i.cartons)} کارتن × {num(i.unit_price)}</div></div>
                <Money v={i.line_total} className="text-sm font-medium" />
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card title="جمع سفارش">
            <KV k="جمع کالاها" v={<Money v={o.subtotal} />} />
            <KV k={`تخفیف ${num(o.discount_percent)}٪`} v={<Money v={o.discount_amount} />} />
            <KV k="قابل پرداخت" v={<b className="text-navy-700"><Money v={o.total} /></b>} />
          </Card>
          <Card title="تحویل">
            <p className="text-sm text-ink-soft leading-7">{o.city_name}، {o.delivery_address}</p>
            {o.customer_note && <p className="text-xs text-ink-muted mt-2">توضیحات: {o.customer_note}</p>}
            {o.sales_rep_name && <p className="text-xs text-ink-muted mt-2">کارشناس فروش: {o.sales_rep_name}</p>}
          </Card>
          <div className="flex gap-2 flex-wrap">
            <Link to={`/support/tickets/new?order=${o.id}`} className="btn-secondary btn-sm"><Icon name="message" className="w-4 h-4" />سؤال درباره‌ی سفارش</Link>
            {["shipped", "delivered"].includes(o.status) && <Link to={`/support/returns/new?order=${o.id}`} className="btn-secondary btn-sm"><Icon name="rotate" className="w-4 h-4" />ثبت مرجوعی</Link>}
            {o.total > 0 && <Button variant="ghost" size="sm" icon="shield" onClick={() => push("/finance/pay", { order: String(o.id), amount: String(o.total) })}>پیش‌پرداخت آنلاین</Button>}
          </div>
        </div>
      </div>
    </>
  );
}
