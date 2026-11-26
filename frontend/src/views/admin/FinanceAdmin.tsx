"use client";
import React, { useState } from "react";
import { Badge, Button, Card, Empty, Input, Loading, Money, PageHeader, Pagination, Progress, StatusChip, Table, Tabs, useAction } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { isManager, useAuth } from "@/lib/auth";
import { fa, jdate, short, toEnDigits } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { Link } from "@/lib/nav";
import type { Customer } from "@/lib/types";

export default function FinanceAdmin() {
  const [tab, setTab] = useState<"cheques" | "credit" | "payments">("cheques");
  return (
    <>
      <PageHeader title="مالی، چک و کنترل اعتبار" subtitle="وصول چک‌ها، سقف اعتبار مشتری‌ها و جلوگیری از سفارش وقتی اعتبار تمام شده" />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: "cheques", label: "چک‌ها" }, { value: "credit", label: "سقف اعتبار مشتری‌ها" }]} /></div>
      {tab === "cheques" ? <ChequeQueue /> : <CreditControl />}
    </>
  );
}

function ChequeQueue() {
  const { user } = useAuth();
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<Page<any>>("/finance/cheques/", { status, page });
  const { run } = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const set = async (id: number, s: string, label: string) => { if (await run(() => api.post(`/finance/cheques/${id}/set_status/`, { status: s }), label)) reload(); };
  return (
    <>
      <div className="mb-3"><Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: "pending", label: "در جریان" }, { value: "cleared", label: "وصول شده" }, { value: "bounced", label: "برگشتی" }, { value: "", label: "همه" }]} /></div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : !data?.results.length ? <Empty icon="card" title="چکی در این وضعیت نیست" /> : (
          <div className="px-5 pt-2"><Table>
            <thead><tr><th className="th">مشتری</th><th className="th">شماره / بانک</th><th className="th">مبلغ</th><th className="th">سررسید</th><th className="th">وضعیت</th><th className="th">تصویر</th><th className="th"></th></tr></thead>
            <tbody>{data.results.map((c) => (
              <tr key={c.id}>
                <td className="td"><Link to={`/admin/customers/review?id=${c.customer}`} className="text-navy-600">{c.customer_name}</Link></td>
                <td className="td num">{fa(c.number)} · {c.bank}</td><td className="td"><Money v={c.amount} /></td>
                <td className="td num">{jdate(c.due_date)}{c.status === "pending" && c.due_date < today && <Badge color="bad" className="mr-1">سررسید گذشته</Badge>}</td>
                <td className="td"><StatusChip status={c.status} label={c.status_display} /></td>
                <td className="td">{c.image ? <a href={c.image} target="_blank" rel="noreferrer" className="text-navy-500 text-xs">مشاهده</a> : "—"}</td>
                <td className="td text-left whitespace-nowrap">{isManager(user) && c.status === "pending" && <>
                  <Button size="sm" variant="secondary" onClick={() => set(c.id, "cleared", "چک وصول شد و در حساب مشتری ثبت شد")}>وصول شد</Button>
                  <Button size="sm" variant="ghost" onClick={() => set(c.id, "bounced", "چک برگشتی ثبت شد")}>برگشت خورد</Button></>}
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

function CreditRow({ c, onSaved, manager }: { c: Customer; onSaved: () => void; manager: boolean }) {
  const { data: s } = useApi<any>("/finance/summary/", { customer: c.id });
  const [limit, setLimit] = useState(String(c.credit_limit));
  const [block, setBlock] = useState(c.block_on_credit);
  const { run, busy } = useAction();
  const dirty = limit !== String(c.credit_limit) || block !== c.block_on_credit;
  const pct = s && c.credit_limit > 0 ? (Math.max(0, s.available_credit) / c.credit_limit) * 100 : null;
  return (
    <tr>
      <td className="td"><Link to={`/admin/customers/review?id=${c.id}`} className="text-navy-600 font-medium">{c.business_name}</Link><div className="text-xs text-ink-muted">{c.type_display} · {c.city_name}</div></td>
      <td className="td num">{s ? short(s.balance) : "…"}</td>
      <td className="td">{s ? <><div className="num text-sm">{short(Math.max(0, s.available_credit))}</div>{pct != null && <Progress value={pct} className="h-1.5 w-24 mt-1" color={pct < 20 ? "bg-bad" : "bg-ok"} />}</> : "…"}</td>
      <td className="td num">{s?.overdue ? <span className="text-bad">{short(s.overdue)}</span> : "—"}</td>
      <td className="td"><Input aria-label="سقف اعتبار" disabled={!manager} dir="ltr" className="h-9 w-40 num" value={limit} onChange={(e) => setLimit(e.target.value)} /></td>
      <td className="td"><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" disabled={!manager} checked={block} onChange={(e) => setBlock(e.target.checked)} />مسدود کردن</label></td>
      <td className="td">{manager && <Button size="sm" disabled={!dirty} loading={busy} onClick={async () => { if (await run(() => api.patch(`/customers/${c.id}/`, { credit_limit: toEnDigits(limit).replace(/\D/g, "") || 0, block_on_credit: block }), "سقف اعتبار ذخیره شد")) onSaved(); }}>ذخیره</Button>}</td>
    </tr>
  );
}

function CreditControl() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, reload } = useApi<Page<Customer>>("/customers/", { status: "approved", search: q, page, page_size: 15 });
  return (
    <Card pad={false} actions={<Input aria-label="جست‌وجو" className="w-56 h-9" placeholder="جست‌وجوی مشتری" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />} title="اعتبار مشتری‌ها">
      {!data ? <Loading /> : (
        <div className="px-5"><Table>
          <thead><tr><th className="th">مشتری</th><th className="th">مانده بدهی</th><th className="th">اعتبار باقی‌مانده</th><th className="th">معوق</th><th className="th">سقف اعتبار (ریال)</th><th className="th">اعتبار تمام شد</th><th className="th"></th></tr></thead>
          <tbody>{data.results.map((c) => <CreditRow key={c.id} c={c} onSaved={reload} manager={isManager(user)} />)}</tbody>
        </Table></div>
      )}
      <div className="px-5 pb-4">{data && <Pagination page={page} count={data.count} pageSize={15} onChange={setPage} />}</div>
    </Card>
  );
}
