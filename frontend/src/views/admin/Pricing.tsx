"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, ConfirmButton, Empty, Field, Input, Loading, PageHeader, Select, Table, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { num, toEnDigits } from "@/lib/format";
import { useApi } from "@/lib/hooks";

export default function Pricing() {
  const { data: groups, reload } = useApi<any[]>("/price-groups/");
  const [gid, setGid] = useState<number | null>(null);
  const { run, busy } = useAction();
  const [ng, setNg] = useState({ name: "", description: "" });
  useEffect(() => { if (groups?.length && gid === null) setGid(groups[0].id); }, [groups, gid]);
  return (
    <div className="space-y-6">
      <PageHeader title="قیمت‌گذاری" subtitle="قیمت جدا برای هر گروه مشتری و تخفیف پلکانی حجمی. خانه‌ی خالی یعنی قیمت پایه." />
      <div className="grid lg:grid-cols-[280px_1fr] gap-6 items-start">
        <div className="space-y-4">
          <Card title="گروه‌های قیمت" pad={false}>
            <ul>{groups?.map((g) => (
              <li key={g.id}><button onClick={() => setGid(g.id)} className={`w-full text-right px-5 py-3 border-t border-cream-200 ${gid === g.id ? "bg-navy-50" : "hover:bg-cream-100"}`}>
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{g.name}</span>{g.is_default && <Badge color="gold">پیش‌فرض</Badge>}</div>
                <div className="text-xs text-ink-muted num">{num(g.customers_count)} مشتری · {g.description}</div>
              </button></li>
            ))}</ul>
            <form className="p-4 border-t border-cream-300 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/price-groups/", ng), "گروه ساخته شد")) { setNg({ name: "", description: "" }); reload(); } }}>
              <Input aria-label="نام گروه" className="h-9" placeholder="نام گروه جدید" value={ng.name} onChange={(e) => setNg({ ...ng, name: e.target.value })} required />
              <Input aria-label="توضیح" className="h-9" placeholder="توضیح" value={ng.description} onChange={(e) => setNg({ ...ng, description: e.target.value })} />
              <Button size="sm" className="w-full" loading={busy}>افزودن گروه</Button>
            </form>
          </Card>
          <Discounts groups={groups ?? []} />
        </div>
        {gid ? <PriceList gid={gid} name={groups?.find((g) => g.id === gid)?.name} /> : <Loading />}
      </div>
    </div>
  );
}

function PriceList({ gid, name }: { gid: number; name?: string }) {
  const { data, loading, setData } = useApi<any[]>(`/price-groups/${gid}/prices/`);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [pct, setPct] = useState("");
  const [filter, setFilter] = useState("");
  const { run, busy } = useAction();
  useEffect(() => setDraft({}), [gid]);
  const rows = useMemo(() => (data ?? []).filter((r) => !filter || r.name.includes(filter) || r.sku.toLowerCase().includes(filter.toLowerCase())), [data, filter]);
  const dirty = Object.keys(draft).length;
  const val = (r: any) => (draft[r.product] !== undefined ? draft[r.product] : r.carton_price != null ? String(r.carton_price) : "");
  return (
    <Card title={`لیست قیمت: ${name ?? ""}`} actions={<>
      <Input aria-label="فیلتر" className="w-44 h-9" placeholder="فیلتر کالا" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="flex items-center gap-1"><Input aria-label="درصد" className="w-20 h-9" placeholder="٪ پایه" value={pct} onChange={(e) => setPct(e.target.value)} />
        <Button variant="secondary" size="sm" className="h-9" disabled={!pct} onClick={() => { const p = +toEnDigits(pct); const d: Record<number, string> = { ...draft }; rows.forEach((r) => (d[r.product] = String(Math.round((r.base_price * (100 - p)) / 100 / 1000) * 1000))); setDraft(d); }}>اعمال تخفیف از پایه</Button></div>
      <Button size="sm" className="h-9" disabled={!dirty} loading={busy} onClick={async () => {
        const items = Object.entries(draft).map(([product, v]) => ({ product: +product, carton_price: v === "" ? null : toEnDigits(v).replace(/\D/g, "") }));
        const r = await run(() => api.post(`/price-groups/${gid}/prices/`, { items }), `${num(items.length)} قیمت ذخیره شد`);
        if (r) { setData(r); setDraft({}); }
      }}>ذخیره {dirty ? `(${num(dirty)})` : ""}</Button>
    </>} pad={false}>
      {loading && !data ? <Loading /> : !rows.length ? <Empty icon="tag" title="محصولی نیست" /> : (
        <div className="px-5"><Table>
          <thead><tr><th className="th">کالا</th><th className="th">دسته</th><th className="th">قیمت پایه</th><th className="th">قیمت این گروه (ریال/کارتن)</th><th className="th">اختلاف</th></tr></thead>
          <tbody>{rows.map((r) => {
            const v = val(r);
            const n = v === "" ? null : +toEnDigits(v).replace(/\D/g, "");
            const diff = n != null && r.base_price ? ((n - r.base_price) / r.base_price) * 100 : null;
            return (
              <tr key={r.product} className={draft[r.product] !== undefined ? "bg-gold-soft/40" : ""}>
                <td className="td"><div className="text-sm">{r.name}</div><div className="text-xs text-ink-muted" dir="ltr">{r.sku}</div></td>
                <td className="td text-xs">{r.category_name}</td><td className="td num">{num(r.base_price)}</td>
                <td className="td"><Input aria-label={`قیمت ${r.name}`} dir="ltr" className="h-9 w-40 num" placeholder="قیمت پایه" value={v} onChange={(e) => setDraft({ ...draft, [r.product]: e.target.value })} /></td>
                <td className="td num text-xs">{diff == null ? "—" : <span className={diff < 0 ? "text-ok" : "text-bad"}>{num(diff, 1)}٪</span>}</td>
              </tr>
            );
          })}</tbody>
        </Table></div>
      )}
    </Card>
  );
}

function Discounts({ groups }: { groups: any[] }) {
  const { data, reload } = useApi<any[]>("/volume-discounts/");
  const [f, setF] = useState({ group: "", min_cartons: "", percent: "" });
  const { run, busy } = useAction();
  return (
    <Card title="تخفیف پلکانی حجمی">
      <ul className="space-y-2 mb-4">{data?.map((d) => (
        <li key={d.id} className="flex items-center gap-2 text-sm rounded-xl bg-cream-100 px-3 py-2">
          <span className="flex-1"><span className="num">≥ {num(d.min_cartons)} کارتن → {num(d.percent)}٪</span><div className="text-[11px] text-ink-muted">{d.group_name}</div></span>
          <ConfirmButton variant="ghost" size="sm" icon="trash" confirmText="حذف؟" onConfirm={async () => { await run(() => api.del(`/volume-discounts/${d.id}/`)); reload(); }}>{""}</ConfirmButton>
        </li>
      ))}</ul>
      <form className="grid grid-cols-2 gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/volume-discounts/", { group: f.group || null, min_cartons: toEnDigits(f.min_cartons), percent: toEnDigits(f.percent) }), "پله‌ی تخفیف اضافه شد")) { setF({ group: "", min_cartons: "", percent: "" }); reload(); } }}>
        <Field label="از تعداد کارتن"><Input id="vd_min" required dir="ltr" className="h-9" value={f.min_cartons} onChange={(e) => setF({ ...f, min_cartons: e.target.value })} /></Field>
        <Field label="درصد تخفیف"><Input id="vd_pct" required dir="ltr" className="h-9" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} /></Field>
        <Select aria-label="گروه" className="h-9 text-sm col-span-2" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}><option value="">همه‌ی گروه‌ها</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
        <Button size="sm" className="col-span-2" loading={busy}>افزودن پله</Button>
      </form>
    </Card>
  );
}
