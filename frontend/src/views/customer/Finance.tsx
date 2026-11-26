"use client";
import React, { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Money, PageHeader, Pagination, Progress, Stat, StatusChip, Table, Tabs, useAction } from "@/components/ui";
import { api, ApiError, newIdempotencyKey, Page } from "@/lib/api";
import { fa, isoDaysAgo, jdate, num, short, toEnDigits } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { Link, splitHref, useNav } from "@/lib/nav";

export function CreditCards({ s }: { s: any }) {
  const pct = s.credit_limit > 0 ? (Math.max(0, s.available_credit) / s.credit_limit) * 100 : 0;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat icon="shield" label="سقف اعتبار" value={<Money v={s.credit_limit} />} />
      <Stat icon="wallet" label="اعتبار باقی‌مانده" value={<Money v={Math.max(0, s.available_credit)} />} tone={pct < 20 ? "bad" : "ok"}
        hint={s.credit_limit > 0 ? <Progress value={pct} className="mt-1 w-32" color={pct < 20 ? "bg-bad" : "bg-ok"} /> : "بدون سقف"} />
      <Stat icon="receipt" label="مانده بدهی" value={<Money v={s.balance} />} tone="warn" hint={s.open_orders ? `+ ${short(s.open_orders)} سفارش باز` : undefined} />
      <Stat icon="alert" label="سررسیدگذشته" value={<Money v={s.overdue} />} tone={s.overdue > 0 ? "bad" : "gray"} />
    </div>
  );
}

export function LedgerTable({ customer }: { customer?: number }) {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  const { data, loading } = useApi<Page<any>>("/finance/ledger/", { page, kind, customer });
  return (
    <Card title="گردش حساب" pad={false} actions={
      <select className="input h-9 w-40 text-xs" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} aria-label="نوع تراکنش">
        <option value="">همه‌ی تراکنش‌ها</option><option value="invoice">فاکتور فروش</option><option value="payment">پرداخت</option><option value="cheque">وصول چک</option><option value="bounced">چک برگشتی</option><option value="return">مرجوعی</option>
      </select>}>
      {loading && !data ? <Loading /> : !data?.results.length ? <Empty icon="receipt" title="تراکنشی ثبت نشده" /> : (
        <div className="px-5"><Table>
          <thead><tr><th className="th">تاریخ</th><th className="th">شرح</th><th className="th">بدهکار</th><th className="th">بستانکار</th><th className="th">مانده</th><th className="th">سررسید</th></tr></thead>
          <tbody>{data.results.map((e) => (
            <tr key={e.id}>
              <td className="td num">{jdate(e.date)}</td>
              <td className="td"><div className="text-sm">{e.kind_display}</div><div className="text-xs text-ink-muted num">{e.description}</div></td>
              <td className="td num text-bad">{e.debit ? num(e.debit) : "—"}</td>
              <td className="td num text-ok">{e.credit ? num(e.credit) : "—"}</td>
              <td className="td num font-medium">{e.balance_after != null ? num(e.balance_after) : "—"}</td>
              <td className="td num text-xs">{e.due_date ? jdate(e.due_date) : "—"}</td>
            </tr>
          ))}</tbody>
        </Table></div>
      )}
      <div className="px-5 pb-4">{data && <Pagination page={page} count={data.count} onChange={setPage} />}</div>
    </Card>
  );
}

export default function Finance() {
  const { data: s, error, loading } = useApi<any>("/finance/summary/");
  const { run, busy } = useAction();
  const [from, setFrom] = useState(isoDaysAgo(90));
  if (error) return <ErrorBox error={error} />;
  if (loading || !s) return <Loading />;
  return (
    <div className="space-y-6">
      <PageHeader title="وضعیت حساب" subtitle="ارقام هر ساعت از نرم‌افزار حسابداری به‌روزرسانی می‌شود."
        actions={<>
          <select className="input h-10 w-40 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="بازه‌ی صورت‌حساب">
            <option value={isoDaysAgo(30)}>صورت‌حساب ۳۰ روزه</option><option value={isoDaysAgo(90)}>صورت‌حساب ۳ ماهه</option><option value={isoDaysAgo(180)}>صورت‌حساب ۶ ماهه</option>
          </select>
          <Button variant="secondary" icon="download" loading={busy} onClick={() => run(() => api.download("/finance/ledger/statement/", "statement.pdf", { from }))}>دانلود صورت‌حساب</Button>
          <Link to="/finance/pay" className="btn-primary"><Icon name="shield" className="w-4 h-4" />پرداخت آنلاین</Link>
        </>} />
      <CreditCards s={s} />
      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <LedgerTable />
        <Card title="چک‌های در جریان" actions={<Link to="/finance/cheques" className="text-xs text-navy-500">همه</Link>}>
          {!s.upcoming_cheques.length ? <p className="text-sm text-ink-muted">چک در جریانی ندارید.</p> : (
            <ul className="space-y-2">{s.upcoming_cheques.map((c: any) => (
              <li key={c.id} className="flex justify-between items-center text-sm rounded-xl bg-cream-100 p-3">
                <div><div className="num">{c.bank} · {c.number}</div><div className="text-xs text-ink-muted">سررسید {jdate(c.due_date)}</div></div>
                <span className="num font-medium">{short(c.amount)}</span>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export function Cheques() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, loading, reload } = useApi<Page<any>>("/finance/cheques/", { status, page });
  const { run, busy } = useAction();
  const [f, setF] = useState({ number: "", bank: "", amount: "", due_date: "" });
  const [img, setImg] = useState<File | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, toEnDigits(v)));
    if (img) fd.append("image", img);
    const r = await run(() => api.post("/finance/cheques/", fd), "چک ثبت شد و پس از وصول به حساب شما منظور می‌شود");
    if (r) { setOpen(false); setF({ number: "", bank: "", amount: "", due_date: "" }); setImg(null); reload(); }
  };
  return (
    <>
      <PageHeader title="چک‌ها" subtitle="چک‌هایی که به شرکت داده‌اید و وضعیت وصول آن‌ها" actions={<Button icon="plus" onClick={() => setOpen(true)}>ثبت چک جدید</Button>} />
      <div className="mb-4"><Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: "", label: "همه" }, { value: "pending", label: "در جریان" }, { value: "cleared", label: "وصول شده" }, { value: "bounced", label: "برگشتی" }]} /></div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : !data?.results.length ? <Empty icon="card" title="چکی ثبت نشده" /> : (
          <div className="px-5 pt-2"><Table>
            <thead><tr><th className="th">شماره چک</th><th className="th">بانک</th><th className="th">مبلغ</th><th className="th">سررسید</th><th className="th">وضعیت</th><th className="th">تصویر</th></tr></thead>
            <tbody>{data.results.map((c) => (
              <tr key={c.id}>
                <td className="td num">{fa(c.number)}</td><td className="td">{c.bank}</td><td className="td"><Money v={c.amount} /></td>
                <td className="td num">{jdate(c.due_date)}</td><td className="td"><StatusChip status={c.status} label={c.status_display} /></td>
                <td className="td">{c.image ? <a href={c.image} target="_blank" rel="noreferrer" className="text-navy-500 text-xs">مشاهده</a> : "—"}</td>
              </tr>
            ))}</tbody>
          </Table></div>
        )}
        <div className="px-5 pb-4">{data && <Pagination page={page} count={data.count} onChange={setPage} />}</div>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="ثبت چک">
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <Field label="شماره چک"><Input id="ch_no" required dir="ltr" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
          <Field label="بانک"><Input id="ch_bank" required value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} placeholder="ملت" /></Field>
          <Field label="مبلغ (ریال)"><Input id="ch_amount" required dir="ltr" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="تاریخ سررسید"><Input id="ch_due" required type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          <Field label="تصویر چک" className="col-span-2"><input type="file" accept="image/*" onChange={(e) => setImg(e.target.files?.[0] || null)} className="text-sm" /></Field>
          <div className="col-span-2"><Button loading={busy} className="w-full">ثبت چک</Button></div>
        </form>
      </Modal>
    </>
  );
}

export function Invoices() {
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading } = useApi<Page<any>>("/finance/invoices/", { kind, page });
  const { run } = useAction();
  return (
    <>
      <PageHeader title="آرشیو فاکتورها" subtitle="فاکتور رسمی هر ارسال و صورت‌حساب‌های دوره‌ای" />
      <div className="mb-4"><Tabs value={kind} onChange={(v) => { setKind(v); setPage(1); }} items={[{ value: "", label: "همه" }, { value: "official", label: "فاکتور رسمی" }, { value: "statement", label: "صورت‌حساب دوره‌ای" }]} /></div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : !data?.results.length ? <Empty icon="receipt" title="فاکتوری صادر نشده" /> : (
          <div className="px-5 pt-2"><Table>
            <thead><tr><th className="th">شماره</th><th className="th">نوع</th><th className="th">سفارش</th><th className="th">تاریخ</th><th className="th">مبلغ</th><th className="th"></th></tr></thead>
            <tbody>{data.results.map((i) => (
              <tr key={i.id}>
                <td className="td num font-medium">{fa(i.number)}</td><td className="td">{i.kind_display}</td>
                <td className="td num">{i.order_number ? <Link to={`/orders/detail?id=${i.order}`} className="text-navy-500">{i.order_number}</Link> : i.period_start ? `${jdate(i.period_start)} تا ${jdate(i.period_end)}` : "—"}</td>
                <td className="td num">{jdate(i.issued_on)}</td><td className="td">{i.amount ? <Money v={i.amount} /> : "—"}</td>
                <td className="td text-left">
                  <Button variant="ghost" size="sm" icon="download" onClick={() => run(() => i.kind === "statement"
                    ? api.download("/finance/ledger/statement/", `statement-${i.number}.pdf`, { from: i.period_start, to: i.period_end })
                    : api.download(`/finance/invoices/${i.id}/download/`, `invoice-${i.number}.pdf`))}>دانلود</Button>
                </td>
              </tr>
            ))}</tbody>
          </Table></div>
        )}
        <div className="px-5 pb-4">{data && <Pagination page={page} count={data.count} onChange={setPage} />}</div>
      </Card>
    </>
  );
}

export function Pay() {
  const nav = useNav();
  const { params } = nav;
  const { data: s } = useApi<any>("/finance/summary/");
  const { data: history, reload } = useApi<Page<any>>("/finance/payments/");
  const [amount, setAmount] = useState(params.amount || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [idem] = useState(newIdempotencyKey);
  const { run } = useAction();
  useEffect(() => {
    // returning from gateway: verify
    if (params.authority && params.Status) {
      run(() => api.post("/finance/payments/verify/", { authority: params.authority, Status: params.Status }))
        .then((p: any) => { if (p) setErr(p.status === "paid" ? undefined : "پرداخت ناموفق بود."); reload(); });
    }
  }, [params.authority]); // eslint-disable-line
  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(undefined);
    try {
      const r = await api.post("/finance/payments/start/", { amount: toEnDigits(amount).replace(/\D/g, ""), order: params.order, callback_url: `${location.origin}/finance/pay` }, { "Idempotency-Key": idem });
      if (r.redirect_url.includes("/pay/mock")) {
        const [pth, q] = splitHref(r.redirect_url.replace(/^https?:\/\/[^/]+/, ""));
        nav.push(pth, q);
      } else window.location.href = r.redirect_url;
    } catch (e2) { setErr((e2 as ApiError).field("amount") || (e2 as ApiError).message); setBusy(false); }
  };
  const presets = s ? [s.overdue, s.balance].filter((x: number) => x > 0) : [];
  return (
    <>
      <PageHeader title="پرداخت آنلاین" subtitle={params.order ? "پیش‌پرداخت سفارش" : "تسویه‌ی بدهی از طریق درگاه بانکی (شاپرک)"} />
      <div className="grid lg:grid-cols-[420px_1fr] gap-6 items-start">
        <Card>
          <form onSubmit={start} className="space-y-4">
            <Field label="مبلغ (ریال)" error={err}>
              <Input id="pay_amount" dir="ltr" inputMode="numeric" className="text-lg text-left num" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            {amount && <div className="text-xs text-ink-muted num">{num(toEnDigits(amount).replace(/\D/g, ""))} ریال</div>}
            <div className="flex gap-2 flex-wrap">
              {presets.map((p: number, i: number) => <button type="button" key={i} className="chip bg-cream-200 text-ink-soft h-8 px-3" onClick={() => setAmount(String(p))}>{i === 0 && s.overdue > 0 ? "بدهی سررسیدگذشته" : "کل مانده"}: {short(p)}</button>)}
            </div>
            <Button className="w-full h-12" loading={busy} icon="shield">انتقال به درگاه بانک</Button>
            <p className="text-[11px] text-ink-muted text-center">پس از پرداخت موفق، مبلغ بلافاصله در گردش حساب شما ثبت می‌شود.</p>
          </form>
        </Card>
        <Card title="پرداخت‌های اخیر" pad={false}>
          {!history?.results.length ? <Empty icon="wallet" title="پرداختی ثبت نشده" /> : (
            <div className="px-5"><Table>
              <thead><tr><th className="th">تاریخ</th><th className="th">نوع</th><th className="th">مبلغ</th><th className="th">کد پیگیری</th><th className="th">وضعیت</th></tr></thead>
              <tbody>{history.results.map((p) => (
                <tr key={p.id}><td className="td num">{jdate(p.created_at)}</td><td className="td">{p.purpose_display}{p.order_number ? ` ${p.order_number}` : ""}</td><td className="td"><Money v={p.amount} /></td><td className="td num text-xs" dir="ltr">{p.ref_id || "—"}</td><td className="td"><StatusChip status={p.status} label={p.status_display} /></td></tr>
              ))}</tbody>
            </Table></div>
          )}
        </Card>
      </div>
    </>
  );
}

/** Stand-in for the bank page when PAYMENT_GATEWAY=mock (dev / demo). */
export function MockGateway() {
  const { params, replace } = useNav();
  return (
    <div className="min-h-screen grid place-items-center p-6 bg-navy-700">
      <div className="card w-full max-w-sm p-6 text-center space-y-4">
        <div className="text-xs text-ink-muted">درگاه پرداخت آزمایشی</div>
        <div className="text-2xl font-bold text-navy-700 num">{num(params.amount)} <span className="text-sm">ریال</span></div>
        <p className="text-sm text-ink-soft">در محیط واقعی این صفحه درگاه بانک (زرین‌پال / شاپرک) است.</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => replace("/finance/pay", { authority: params.authority, Status: "OK" })}>پرداخت موفق</Button>
          <Button variant="danger" className="flex-1" onClick={() => replace("/finance/pay", { authority: params.authority, Status: "NOK" })}>انصراف</Button>
        </div>
      </div>
    </div>
  );
}
