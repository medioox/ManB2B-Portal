"use client";
import React, { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Card, Empty, Field, Input, KV, Loading, Money, PageHeader, Pagination, Select, StatusChip, Table, Tabs, Textarea, useAction } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { isManager, useAuth } from "@/lib/auth";
import { ago, fa, jtime, num } from "@/lib/format";
import { useProvinces } from "@/lib/geo";
import { useApi, useDebounced } from "@/lib/hooks";
import { Link, useNav } from "@/lib/nav";
import type { Order, OrderStatus } from "@/lib/types";
import { OrderTimeline } from "../customer/Orders";

const NEXT: Partial<Record<OrderStatus, { s: OrderStatus; l: string }>> = {
  submitted: { s: "confirmed", l: "تأیید" }, confirmed: { s: "preparing", l: "شروع آماده‌سازی" },
  preparing: { s: "shipped", l: "ثبت ارسال" }, shipped: { s: "delivered", l: "تحویل شد" },
};

export default function AdminOrders() {
  const { params } = useNav();
  const { user } = useAuth();
  const [status, setStatus] = useState("submitted");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [rep, setRep] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data: provinces } = useProvinces();
  const { data: reps } = useApi<any[]>(isManager(user) ? "/staff/" : null, { role: "sales_rep" });
  const filters = { status: params.customer ? "" : status, city, city__province: province, sales_rep: rep, search: q, customer: params.customer };
  const { data, loading, reload } = useApi<Page<Order>>("/orders/", { ...filters, page });
  const { data: stats, reload: reloadStats } = useApi<Record<string, number>>("/orders/stats/", { city, city__province: province, sales_rep: rep, customer: params.customer });
  const { run } = useAction();
  const cities = provinces?.find((p) => String(p.id) === province)?.cities ?? [];
  const advance = async (o: Order) => {
    const n = NEXT[o.status];
    if (n && (await run(() => api.post(`/orders/${o.id}/set_status/`, { status: n.s }), `سفارش ${o.number}: ${n.l}`))) { reload(); reloadStats(); }
  };
  return (
    <>
      <PageHeader title="صف سفارش‌ها" subtitle={params.customer ? "سفارش‌های یک مشتری" : "تغییر وضعیت، ویرایش و یادداشت داخلی؛ هر تغییر وضعیت به مشتری پیامک می‌شود"} />
      <div className="mb-3"><Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[
        { value: "submitted", label: "جدید", count: stats?.submitted ?? 0 }, { value: "confirmed", label: "تأیید شده", count: stats?.confirmed ?? 0 },
        { value: "preparing", label: "آماده‌سازی", count: stats?.preparing ?? 0 }, { value: "shipped", label: "ارسال شده", count: stats?.shipped ?? 0 },
        { value: "delivered", label: "تحویل شده" }, { value: "canceled", label: "لغو شده" }, { value: "", label: "همه" },
      ]} /></div>
      <div className="card p-3 flex flex-wrap gap-2 mb-4">
        <Input aria-label="جست‌وجو" className="w-56 h-9" placeholder="شماره سفارش، مشتری، موبایل" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select aria-label="استان" className="w-36 h-9 text-sm" value={province} onChange={(e) => { setProvince(e.target.value); setCity(""); setPage(1); }}><option value="">همه‌ی استان‌ها</option>{provinces?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select aria-label="شهر" className="w-36 h-9 text-sm" value={city} disabled={!province} onChange={(e) => { setCity(e.target.value); setPage(1); }}><option value="">همه‌ی شهرها</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        {reps && <Select aria-label="کارشناس" className="w-40 h-9 text-sm" value={rep} onChange={(e) => { setRep(e.target.value); setPage(1); }}><option value="">همه‌ی کارشناسان</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.first_name} {r.last_name}</option>)}</Select>}
      </div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : !data?.results.length ? <Empty icon="truck" title="سفارشی در این صف نیست" /> : (
          <div className="px-5 pt-2"><Table>
            <thead><tr><th className="th">شماره</th><th className="th">مشتری</th><th className="th">شهر</th><th className="th">کارشناس</th><th className="th">کارتن</th><th className="th">مبلغ</th><th className="th">زمان</th><th className="th">وضعیت</th><th className="th"></th></tr></thead>
            <tbody>{data.results.map((o) => (
              <tr key={o.id} className="hover:bg-cream-100">
                <td className="td"><Link to={`/admin/orders/detail?id=${o.id}`} className="font-medium text-navy-600 num">{fa(o.number)}</Link>{o.is_lab_order && <span className="chip bg-navy-50 text-navy-500 mr-1">آزمایشگاه</span>}</td>
                <td className="td">{o.customer_name}</td><td className="td">{o.city_name}</td><td className="td text-xs">{o.sales_rep_name || "—"}</td>
                <td className="td num">{num(o.total_cartons)}</td><td className="td"><Money v={o.total} /></td><td className="td text-xs">{ago(o.created_at)}</td>
                <td className="td"><StatusChip status={o.status} label={o.status_display} /></td>
                <td className="td text-left whitespace-nowrap">{NEXT[o.status] && <Button size="sm" variant="secondary" onClick={() => advance(o)}>{NEXT[o.status]!.l}</Button>}</td>
              </tr>
            ))}</tbody>
          </Table></div>
        )}
        <div className="px-5 pb-4">{data && <Pagination page={page} count={data.count} onChange={setPage} />}</div>
      </Card>
    </>
  );
}

export function AdminOrderDetail() {
  const { params } = useNav();
  const { data: o, reload } = useApi<Order>(`/orders/${params.id}/`);
  const { data: picker } = useApi<any[]>("/product-picker/");
  const { run, busy } = useAction();
  const [note, setNote] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [editing, setEditing] = useState<{ product: number; cartons: number }[] | null>(null);
  const [addP, setAddP] = useState("");
  useEffect(() => { setEditing(null); }, [params.id]);
  if (!o) return <Loading />;
  const n = NEXT[o.status];
  const setStatus = async (s: OrderStatus) => { if (await run(() => api.post(`/orders/${o.id}/set_status/`, { status: s, note: statusNote }), "وضعیت به‌روزرسانی و به مشتری پیامک شد")) { setStatusNote(""); reload(); } };
  const editable = o.status === "submitted" || o.status === "confirmed";
  return (
    <div className="space-y-6">
      <PageHeader title={`سفارش ${fa(o.number)}`} subtitle={`${o.customer_name} · ${o.city_name} · ${jtime(o.created_at)}`}
        back={<Link to="/admin/orders" className="text-xs text-navy-500 flex items-center gap-1 mb-2"><Icon name="right" className="w-3.5 h-3.5" />صف سفارش‌ها</Link>}
        actions={<Button variant="secondary" icon="download" onClick={() => run(() => api.download(`/orders/${o.id}/proforma/`, `proforma-${o.number}.pdf`))}>پیش‌فاکتور</Button>} />
      <Card><div className="overflow-x-auto py-2"><div className="min-w-[480px]"><OrderTimeline o={o} /></div></div></Card>
      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <Card title="اقلام" actions={editable && !editing && <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditing(o.items!.map((i) => ({ product: i.product, cartons: i.cartons })))}>ویرایش اقلام</Button>} pad={false}>
            {!editing ? (
              <div className="px-5"><Table>
                <thead><tr><th className="th">کالا</th><th className="th">کارتن</th><th className="th">قیمت کارتن</th><th className="th">مبلغ</th></tr></thead>
                <tbody>{o.items!.map((i) => <tr key={i.id}><td className="td"><div>{i.product_name}</div><div className="text-xs text-ink-muted" dir="ltr">{i.sku}</div></td><td className="td num">{num(i.cartons)}</td><td className="td num">{num(i.unit_price)}</td><td className="td"><Money v={i.line_total} /></td></tr>)}</tbody>
              </Table>
              <div className="py-4 space-y-1 text-sm max-w-xs mr-auto">
                <KV k="جمع" v={<Money v={o.subtotal} />} /><KV k={`تخفیف ${num(o.discount_percent)}٪`} v={<Money v={o.discount_amount} />} /><KV k="قابل پرداخت" v={<b><Money v={o.total} /></b>} />
              </div></div>
            ) : (
              <div className="px-5 pb-5 space-y-2">
                {editing.map((e, idx) => {
                  const p = picker?.find((x) => x.id === e.product);
                  return (
                    <div key={e.product} className="flex items-center gap-3 text-sm">
                      <span className="flex-1">{p?.name ?? e.product}</span>
                      <Input type="number" min={0} className="w-24 h-9" value={e.cartons} aria-label="کارتن" onChange={(ev) => setEditing(editing.map((x, j) => (j === idx ? { ...x, cartons: +ev.target.value } : x)))} />
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-2">
                  <Select aria-label="افزودن کالا" className="h-9 text-sm" value={addP} onChange={(e) => setAddP(e.target.value)}><option value="">افزودن کالا…</option>{picker?.filter((p) => !editing.some((e) => e.product === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
                  <Button size="sm" variant="secondary" className="h-9" disabled={!addP} onClick={() => { const p = picker!.find((x) => x.id === +addP); setEditing([...editing, { product: +addP, cartons: p.min_order_cartons }]); setAddP(""); }}>افزودن</Button>
                </div>
                <div className="flex gap-2 pt-3">
                  <Button loading={busy} onClick={async () => { if (await run(() => api.post(`/orders/${o.id}/edit_items/`, { items: editing }), "اقلام ویرایش شد و مبلغ دوباره محاسبه شد")) { setEditing(null); reload(); } }}>ذخیره و محاسبه‌ی دوباره</Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>انصراف</Button>
                </div>
              </div>
            )}
          </Card>
          <Card title="یادداشت‌های داخلی" actions={<span className="text-[11px] text-ink-muted">فقط کارکنان می‌بینند</span>}>
            <form className="flex gap-2 mb-4" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post(`/orders/${o.id}/add_note/`, { text: note }))) { setNote(""); reload(); } }}>
              <Input aria-label="یادداشت" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً با مشتری برای زمان تخلیه هماهنگ شد" />
              <Button disabled={!note.trim()} loading={busy}>ثبت</Button>
            </form>
            {!o.notes?.length ? <p className="text-sm text-ink-muted">یادداشتی ثبت نشده.</p> : (
              <ul className="space-y-2">{o.notes.map((n) => <li key={n.id} className="rounded-xl bg-gold-soft/60 p-3 text-sm"><div>{n.text}</div><div className="text-[11px] text-ink-muted mt-1">{n.author_name} · {ago(n.created_at)}</div></li>)}</ul>
            )}
          </Card>
        </div>
        <div className="space-y-6 lg:sticky lg:top-24">
          <Card title="تغییر وضعیت">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">وضعیت فعلی: <StatusChip status={o.status} label={o.status_display} /></div>
              {(n || o.status !== "delivered") && o.status !== "canceled" && <Field label="توضیح برای مشتری (اختیاری)"><Textarea id="st_note" rows={2} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="مثلاً شماره بارنامه: ۱۲۳۴۵" /></Field>}
              <div className="flex gap-2 flex-wrap">
                {n && <Button loading={busy} icon="check" onClick={() => setStatus(n.s)}>{n.l}</Button>}
                {!["shipped", "delivered", "canceled"].includes(o.status) && <Button variant="secondary" loading={busy} icon="x" onClick={() => setStatus("canceled")}>لغو سفارش</Button>}
              </div>
              {o.accounting_ref ? <p className="text-xs text-ok">ثبت در حسابداری: {o.accounting_ref}</p> : o.status !== "submitted" && <p className="text-xs text-warn">در صف ارسال به حسابداری</p>}
            </div>
          </Card>
          <Card title="مشتری">
            <KV k="نام" v={<Link to={`/admin/customers/review?id=${o.customer}`} className="text-navy-600">{o.customer_name}</Link>} />
            <KV k="تلفن" v={<span dir="ltr">{fa(o.customer_phone)}</span>} />
            <KV k="کارشناس" v={o.sales_rep_name || "—"} />
            <p className="text-sm text-ink-soft mt-3 leading-7">{o.city_name}، {o.delivery_address}</p>
            {o.customer_note && <p className="text-xs rounded-lg bg-cream-200 p-2 mt-2">توضیح مشتری: {o.customer_note}</p>}
          </Card>
          <Card title="تاریخچه">
            <ul className="space-y-2">{o.status_logs?.map((l, i) => <li key={i} className="text-xs flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-navy-400 mt-1.5 shrink-0" /><span><b>{l.status_display}</b> · {jtime(l.created_at)}{l.changed_by_name ? ` · ${l.changed_by_name}` : ""}{l.note ? <div className="text-ink-muted">{l.note}</div> : null}</span></li>)}</ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
