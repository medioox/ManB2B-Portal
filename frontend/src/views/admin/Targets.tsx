"use client";
import React, { useState } from "react";
import { Badge, Button, Card, Empty, Field, Input, Loading, PageHeader, Progress, Table, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { isManager, useAuth } from "@/lib/auth";
import { num, short, toEnDigits } from "@/lib/format";
import { useApi } from "@/lib/hooks";

const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

export default function Targets() {
  const { user } = useAuth();
  const manager = isManager(user);
  const { data: first } = useApi<any>("/rewards/overview/");
  const [ym, setYm] = useState<{ y: number; m: number } | null>(null);
  const cur = ym ?? (first ? { y: first.year, m: first.month } : null);
  const { data, reload } = useApi<any>(cur ? "/rewards/overview/" : null, cur ? { year: cur.y, month: cur.m } : undefined);
  const { data: tiers, reload: reloadTiers } = useApi<any[]>("/reward-tiers/");
  const { run, busy } = useAction();
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [nt, setNt] = useState({ min_percent: "", title: "", reward_percent: "", description: "" });
  if (!data || !cur) return <Loading />;
  const shift = (d: number) => { let m = cur.m + d, y = cur.y; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } setYm({ y, m }); setEdits({}); };
  const saveTargets = async () => {
    const ok = await run(async () => {
      const existing = await api.get<any>("/targets/", { year: cur.y, month: cur.m, page_size: 200 });
      for (const [cid, v] of Object.entries(edits)) {
        const amount = toEnDigits(v).replace(/\D/g, "");
        const t = existing.results.find((x: any) => x.customer === +cid);
        if (t) await api.patch(`/targets/${t.id}/`, { target_amount: amount });
        else await api.post("/targets/", { customer: +cid, year: cur.y, month: cur.m, target_amount: amount });
      }
      return true;
    }, "اهداف ذخیره شد");
    if (ok) { setEdits({}); reload(); }
  };
  return (
    <div className="space-y-6">
      <PageHeader title="اهداف فروش و پاداش" subtitle="هدف ماهانه‌ی هر نماینده، پیشرفت و سطح پاداش"
        actions={<div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={() => shift(-1)}>ماه قبل</Button><span className="font-semibold text-navy-700 w-28 text-center">{MONTHS[cur.m - 1]} {num(cur.y).replace(/٬/g, "")}</span><Button variant="secondary" size="sm" onClick={() => shift(1)}>ماه بعد</Button></div>} />
      <div className="grid xl:grid-cols-[1fr_340px] gap-6 items-start">
        <Card title="پیشرفت نماینده‌ها" pad={false} actions={manager && Object.keys(edits).length > 0 && <Button size="sm" loading={busy} onClick={saveTargets}>ذخیره‌ی اهداف ({num(Object.keys(edits).length)})</Button>}>
          {!data.rows.length ? <Empty icon="award" title="نماینده‌ی فعالی نیست" /> : (
            <div className="px-5"><Table>
              <thead><tr><th className="th">نماینده</th><th className="th">فروش</th><th className="th">هدف (ریال)</th><th className="th">پیشرفت</th><th className="th">سطح</th><th className="th">پاداش</th></tr></thead>
              <tbody>{data.rows.map((r: any) => (
                <tr key={r.customer}>
                  <td className="td"><div className="font-medium">{r.name}</div><div className="text-xs text-ink-muted">{r.city}</div></td>
                  <td className="td num">{short(r.sold)}</td>
                  <td className="td">{manager ? <Input aria-label="هدف" dir="ltr" className="h-9 w-36 num" value={edits[r.customer] ?? String(r.target || "")} placeholder="تعیین نشده" onChange={(e) => setEdits({ ...edits, [r.customer]: e.target.value })} /> : <span className="num">{short(r.target)}</span>}</td>
                  <td className="td w-40"><div className="text-xs num mb-1">{num(r.percent)}٪</div><Progress value={r.percent} className="h-1.5" color={r.percent >= 100 ? "bg-ok" : r.percent >= 70 ? "bg-gold" : "bg-navy-400"} /></td>
                  <td className="td">{r.current_tier ? <Badge color="gold">{r.current_tier.title}</Badge> : "—"}</td>
                  <td className="td num">{r.reward_amount ? short(r.reward_amount) : "—"}</td>
                </tr>
              ))}</tbody>
            </Table></div>
          )}
        </Card>
        <Card title="پله‌های پاداش">
          <ul className="space-y-2 mb-4">{tiers?.map((t) => (
            <li key={t.id} className="rounded-xl bg-cream-100 px-3 py-2 text-sm flex justify-between gap-2"><span><b>{t.title}</b> · از {num(t.min_percent)}٪<div className="text-xs text-ink-muted">{t.description}</div></span><Badge color="navy">{num(t.reward_percent)}٪</Badge></li>
          ))}</ul>
          {manager && (
            <form className="grid grid-cols-2 gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/reward-tiers/", { ...nt, min_percent: toEnDigits(nt.min_percent), reward_percent: toEnDigits(nt.reward_percent) }), "پله اضافه شد")) { setNt({ min_percent: "", title: "", reward_percent: "", description: "" }); reloadTiers(); } }}>
              <Field label="عنوان"><Input id="rt_t" className="h-9" required value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} /></Field>
              <Field label="از ٪ هدف"><Input id="rt_m" className="h-9" required dir="ltr" value={nt.min_percent} onChange={(e) => setNt({ ...nt, min_percent: e.target.value })} /></Field>
              <Field label="٪ پاداش از فروش"><Input id="rt_r" className="h-9" required dir="ltr" value={nt.reward_percent} onChange={(e) => setNt({ ...nt, reward_percent: e.target.value })} /></Field>
              <Field label="توضیح"><Input id="rt_d" className="h-9" value={nt.description} onChange={(e) => setNt({ ...nt, description: e.target.value })} /></Field>
              <Button size="sm" className="col-span-2" loading={busy}>افزودن پله</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
