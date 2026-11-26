"use client";
import React, { useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, Empty, Field, Img, Input, KV, Loading, Modal, PageHeader, Pagination, Select, StatusChip, Table, Tabs, Textarea, cx, useAction } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { isStaff, useAuth } from "@/lib/auth";
import { fa, jdate, jtime, num } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { Link, useNav } from "@/lib/nav";
import type { Order } from "@/lib/types";

const REASONS = [{ v: "broken", l: "شکسته" }, { v: "shortage", l: "کسری" }, { v: "defective", l: "معیوب" }, { v: "expired", l: "تاریخ گذشته" }, { v: "other", l: "سایر" }];
const RSTATUS = [{ value: "", label: "همه" }, { value: "submitted", label: "ثبت شده" }, { value: "reviewing", label: "در حال بررسی" }, { value: "approved", label: "تأیید شده" }, { value: "rejected", label: "رد شده" }, { value: "resolved", label: "رسیدگی شده" }];

/* ------------------------------ returns ------------------------------ */
export function Returns() {
  const { user } = useAuth();
  const staff = isStaff(user);
  const { params } = useNav();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<Page<any>>("/returns/", { status, page });
  const [open, setOpen] = useState<any>(null);
  React.useEffect(() => { if (params.id && data) { const r = data.results.find((x) => String(x.id) === params.id); if (r) setOpen(r); } }, [params.id, data]);
  return (
    <>
      <PageHeader title="مرجوعی و شکایت" subtitle={staff ? "درخواست‌های مرجوعی مشتری‌های حوزه‌ی شما" : "کالای شکسته، کسری یا معیوب را با عکس گزارش کنید"}
        actions={!staff && <Link to="/support/returns/new" className="btn-primary"><Icon name="plus" className="w-4 h-4" />ثبت درخواست</Link>} />
      <div className="mb-4"><Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={RSTATUS} /></div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : !data?.results.length ? <Empty icon="rotate" title="درخواستی ثبت نشده" /> : (
          <div className="px-5 pt-2"><Table>
            <thead><tr><th className="th">تاریخ</th>{staff && <th className="th">مشتری</th>}<th className="th">سفارش</th><th className="th">دلیل</th><th className="th">وضعیت</th><th className="th"></th></tr></thead>
            <tbody>{data.results.map((r) => (
              <tr key={r.id} className="hover:bg-cream-100">
                <td className="td num">{jdate(r.created_at)}</td>{staff && <td className="td">{r.customer_name}</td>}
                <td className="td num">{fa(r.order_number)}</td><td className="td">{r.reason_display}</td>
                <td className="td"><StatusChip status={r.status} label={r.status_display} /></td>
                <td className="td text-left"><Button variant="ghost" size="sm" onClick={() => setOpen(r)}>جزئیات</Button></td>
              </tr>
            ))}</tbody>
          </Table></div>
        )}
        <div className="px-5 pb-4">{data && <Pagination page={page} count={data.count} onChange={setPage} />}</div>
      </Card>
      <ReturnModal r={open} onClose={() => setOpen(null)} staff={staff} onChanged={() => { setOpen(null); reload(); }} />
    </>
  );
}

function ReturnModal({ r, onClose, staff, onChanged }: { r: any; onClose: () => void; staff: boolean; onChanged: () => void }) {
  const [status, setStatus] = useState("");
  const [resolution, setResolution] = useState("");
  const { run, busy } = useAction();
  React.useEffect(() => { if (r) { setStatus(r.status); setResolution(r.resolution || ""); } }, [r]);
  if (!r) return null;
  return (
    <Modal open onClose={onClose} title={`مرجوعی سفارش ${r.order_number}`}>
      <KV k="مشتری" v={r.customer_name} /><KV k="دلیل" v={r.reason_display} /><KV k="تاریخ" v={jtime(r.created_at)} />
      <KV k="وضعیت" v={<StatusChip status={r.status} label={r.status_display} />} />
      {r.description && <p className="text-sm text-ink-soft mt-3 leading-7">{r.description}</p>}
      {!!r.images?.length && <div className="grid grid-cols-3 gap-2 mt-3">{r.images.map((i: any) => <a key={i.id} href={i.image} target="_blank" rel="noreferrer"><Img src={i.image} alt="" className="aspect-square rounded-lg w-full" /></a>)}</div>}
      {r.resolution && !staff && <div className="mt-3 rounded-xl bg-navy-50 p-3 text-sm">پاسخ شرکت: {r.resolution}</div>}
      {staff && (
        <div className="mt-5 space-y-3 border-t border-cream-300 pt-4">
          <Field label="وضعیت رسیدگی"><Select id="rt_st" value={status} onChange={(e) => setStatus(e.target.value)}>{RSTATUS.slice(1).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
          <Field label="پاسخ به مشتری"><Textarea id="rt_res" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="مثلاً ۳ کارتن در بار بعدی جایگزین می‌شود." /></Field>
          <Button loading={busy} onClick={async () => { if (await run(() => api.post(`/returns/${r.id}/set_status/`, { status, resolution }), "ثبت شد و به مشتری پیامک شد")) onChanged(); }}>ذخیره و اطلاع به مشتری</Button>
        </div>
      )}
    </Modal>
  );
}

export function NewReturn() {
  const { params, replace } = useNav();
  const { data: orders } = useApi<Page<Order>>("/orders/", { status__in: "shipped,delivered", page_size: 50 });
  const [order, setOrder] = useState(params.order || "");
  const { data: detail } = useApi<Order>(order ? `/orders/${order}/` : null);
  const [reason, setReason] = useState("broken");
  const [desc, setDesc] = useState("");
  const [items, setItems] = useState<Record<number, number>>({});
  const [images, setImages] = useState<File[]>([]);
  const { run, busy } = useAction();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("order", order); fd.append("reason", reason); fd.append("description", desc);
    fd.append("items", JSON.stringify(Object.entries(items).filter(([, n]) => n > 0).map(([id, n]) => ({ order_item_id: +id, cartons: n }))));
    images.forEach((i) => fd.append("images", i));
    if (await run(() => api.post("/returns/", fd), "درخواست مرجوعی ثبت شد")) replace("/support/returns");
  };
  return (
    <>
      <PageHeader title="ثبت مرجوعی یا شکایت" back={<Link to="/support/returns" className="text-xs text-navy-500 flex items-center gap-1 mb-2"><Icon name="right" className="w-3.5 h-3.5" />مرجوعی‌ها</Link>} />
      <form onSubmit={submit} className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <Card>
          <div className="space-y-4">
            <Field label="سفارش"><Select id="rn_order" required value={order} onChange={(e) => { setOrder(e.target.value); setItems({}); }}>
              <option value="">انتخاب سفارش ارسال‌شده</option>{orders?.results.map((o) => <option key={o.id} value={o.id}>{o.number} · {jdate(o.created_at)}</option>)}
            </Select></Field>
            <div><span className="label">دلیل</span><div className="flex flex-wrap gap-2">{REASONS.map((r) => (
              <button type="button" key={r.v} onClick={() => setReason(r.v)} className={cx("chip h-9 px-4 text-sm", reason === r.v ? "bg-navy-600 text-cream-50" : "bg-white border border-cream-400")}>{r.l}</button>
            ))}</div></div>
            {detail?.items && (
              <div><span className="label">تعداد کارتن آسیب‌دیده از هر قلم</span>
                <ul className="space-y-2">{detail.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 text-sm"><span className="flex-1">{i.product_name} <span className="text-xs text-ink-muted num">(از {num(i.cartons)})</span></span>
                    <Input type="number" min={0} max={i.cartons} className="w-24 h-9" value={items[i.id] ?? 0} onChange={(e) => setItems({ ...items, [i.id]: Math.min(i.cartons, +e.target.value) })} aria-label={`تعداد ${i.product_name}`} /></li>
                ))}</ul>
              </div>
            )}
            <Field label="توضیحات"><Textarea id="rn_desc" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          </div>
        </Card>
        <Card title="عکس‌ها">
          <label className="flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-cream-500 text-sm text-ink-soft cursor-pointer hover:border-navy-300">
            <Icon name="image" /> افزودن عکس (حداکثر ۶)
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setImages([...images, ...Array.from(e.target.files || [])].slice(0, 6))} />
          </label>
          {!!images.length && <div className="grid grid-cols-3 gap-2 mt-3">{images.map((f, i) => <div key={i} className="relative"><Img src={URL.createObjectURL(f)} alt="" className="aspect-square rounded-lg w-full" /><button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} className="absolute top-1 left-1 w-6 h-6 rounded-full bg-white grid place-items-center" aria-label="حذف"><Icon name="x" className="w-3 h-3" /></button></div>)}</div>}
          <Button className="w-full mt-4" loading={busy} disabled={!order}>ثبت درخواست</Button>
        </Card>
      </form>
    </>
  );
}

/* ------------------------------ tickets ------------------------------ */
const TSTATUS = [{ value: "", label: "همه" }, { value: "open", label: "باز" }, { value: "waiting", label: "در انتظار پاسخ" }, { value: "answered", label: "پاسخ داده شده" }, { value: "closed", label: "بسته" }];

export function Tickets() {
  const { user } = useAuth();
  const staff = isStaff(user);
  const { params, push } = useNav();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<Page<any>>("/tickets/", { status, page });
  const base = staff ? "/admin/tickets" : "/support/tickets/detail";
  if (staff && params.id) return <TicketDetail id={params.id} onBack={() => { push("/admin/tickets"); reload(); }} />;
  return (
    <>
      <PageHeader title={staff ? "تیکت‌های مشتری‌ها" : "پشتیبانی"} subtitle={staff ? undefined : "سؤال، درخواست یا مشکل را برای کارشناس فروش یا پشتیبانی بنویسید"}
        actions={!staff && <Link to="/support/tickets/new" className="btn-primary"><Icon name="plus" className="w-4 h-4" />تیکت جدید</Link>} />
      <div className="mb-4"><Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={TSTATUS} /></div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : !data?.results.length ? <Empty icon="message" title="تیکتی وجود ندارد" /> : (
          <ul>{data.results.map((t) => (
            <li key={t.id}><Link to={`${base}?id=${t.id}`} className="flex items-center gap-4 px-5 py-4 border-b border-cream-200 hover:bg-cream-100">
              <span className="w-10 h-10 rounded-xl bg-cream-200 text-navy-600 grid place-items-center shrink-0"><Icon name="message" /></span>
              <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{t.subject}</div><div className="text-xs text-ink-muted">{staff ? `${t.customer_name} · ` : ""}{t.department_display} · آخرین فعالیت {jdate(t.updated_at)}</div></div>
              <StatusChip status={t.status} label={t.status_display} />
            </Link></li>
          ))}</ul>
        )}
        <div className="px-5 pb-4">{data && <Pagination page={page} count={data.count} onChange={setPage} />}</div>
      </Card>
    </>
  );
}

export function NewTicket() {
  const { params, replace } = useNav();
  const [f, setF] = useState({ subject: "", department: "sales", first_message: "", order: params.order || "" });
  const { run, busy } = useAction();
  const { data: orders } = useApi<Page<Order>>("/orders/", { page_size: 30 });
  return (
    <>
      <PageHeader title="تیکت جدید" back={<Link to="/support/tickets" className="text-xs text-navy-500 flex items-center gap-1 mb-2"><Icon name="right" className="w-3.5 h-3.5" />تیکت‌ها</Link>} />
      <Card className="max-w-2xl">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const t = await run(() => api.post("/tickets/", { ...f, order: f.order || null }), "تیکت ارسال شد");
          if (t) replace("/support/tickets/detail", { id: String(t.id) });
        }}>
          <Field label="موضوع"><Input id="tk_sub" required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="ارسال به"><Select id="tk_dep" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}><option value="sales">کارشناس فروش من</option><option value="support">پشتیبانی</option><option value="finance">مالی</option></Select></Field>
            <Field label="سفارش مرتبط (اختیاری)"><Select id="tk_ord" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })}><option value="">—</option>{orders?.results.map((o) => <option key={o.id} value={o.id}>{o.number}</option>)}</Select></Field>
          </div>
          <Field label="پیام"><Textarea id="tk_msg" required rows={5} value={f.first_message} onChange={(e) => setF({ ...f, first_message: e.target.value })} /></Field>
          <Button loading={busy}>ارسال</Button>
        </form>
      </Card>
    </>
  );
}

export function TicketDetail({ id: idProp, onBack }: { id?: string; onBack?: () => void }) {
  const { params } = useNav();
  const { user } = useAuth();
  const id = idProp || params.id;
  const { data: t, reload } = useApi<any>(`/tickets/${id}/`);
  const [text, setText] = useState("");
  const { run, busy } = useAction();
  if (!t) return <Loading />;
  return (
    <>
      <PageHeader title={t.subject} subtitle={`${t.customer_name} · ${t.department_display}${t.order_number ? ` · سفارش ${t.order_number}` : ""}`}
        back={onBack ? <button onClick={onBack} className="text-xs text-navy-500 flex items-center gap-1 mb-2"><Icon name="right" className="w-3.5 h-3.5" />تیکت‌ها</button> : <Link to="/support/tickets" className="text-xs text-navy-500 flex items-center gap-1 mb-2"><Icon name="right" className="w-3.5 h-3.5" />تیکت‌ها</Link>}
        actions={<><StatusChip status={t.status} label={t.status_display} />{t.status !== "closed" && <Button variant="ghost" size="sm" onClick={async () => { await run(() => api.post(`/tickets/${id}/close/`), "تیکت بسته شد"); reload(); }}>بستن تیکت</Button>}</>} />
      <Card className="max-w-3xl">
        <div className="space-y-3">
          {t.messages.map((m: any) => {
            const mine = isStaff(user) ? m.is_staff_reply : !m.is_staff_reply;
            return (
              <div key={m.id} className={cx("flex", mine ? "justify-start" : "justify-end")}>
                <div className={cx("max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7", mine ? "bg-navy-600 text-cream-50 rounded-tr-sm" : "bg-cream-200 text-ink rounded-tl-sm")}>
                  <div className={cx("text-[11px] mb-1", mine ? "text-navy-100" : "text-ink-muted")}>{m.author_name}{m.is_staff_reply && <Badge color="gold" className="mr-1">شرکت مَن</Badge>} · {jtime(m.created_at)}</div>
                  <div className="whitespace-pre-line">{m.text}</div>
                </div>
              </div>
            );
          })}
        </div>
        {t.status !== "closed" && (
          <form className="flex gap-2 mt-5 pt-4 border-t border-cream-300 items-end" onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api.post(`/tickets/${id}/reply/`, { text }))) { setText(""); reload(); }
          }}>
            <Textarea id="tk_reply" className="flex-1" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="پیام خود را بنویسید…" />
            <Button loading={busy} disabled={!text.trim()} icon="left">ارسال</Button>
          </form>
        )}
      </Card>
    </>
  );
}
