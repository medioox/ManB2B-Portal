"use client";
import React, { useMemo, useState } from "react";
import { Badge, Button, Card, Empty, Loading, Modal, PageHeader, Pagination, Select, StatusChip, Table, Tabs, Textarea, cx, useAction } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { fa, jdate, num } from "@/lib/format";
import { useApi } from "@/lib/hooks";

// Simplified Iran border (lng, lat) — enough for an at-a-glance coverage map.
const IRAN: [number, number][] = [[44.0,39.4],[44.8,39.7],[47.9,39.1],[48.4,38.4],[49.0,38.4],[49.0,37.6],[50.2,37.4],[51.2,36.8],[53.9,36.9],[54.7,37.4],[56.0,37.9],[57.3,38.2],[59.2,37.5],[60.4,36.6],[61.2,36.6],[61.2,35.6],[60.5,34.2],[60.9,33.6],[60.5,33.1],[60.9,32.2],[60.9,31.5],[61.8,31.0],[61.7,30.0],[60.9,29.9],[61.4,29.1],[61.9,28.5],[62.8,28.0],[62.8,27.3],[63.3,27.1],[63.1,26.6],[61.8,26.2],[61.6,25.2],[59.6,25.4],[58.5,25.6],[57.4,25.7],[56.9,26.9],[56.4,27.2],[55.7,26.9],[54.7,26.5],[53.5,26.8],[52.5,27.6],[51.5,27.9],[50.9,28.8],[50.1,30.1],[49.6,30.0],[48.9,30.3],[48.6,29.9],[47.9,31.0],[47.7,31.0],[47.8,31.7],[47.4,32.4],[46.1,33.0],[45.4,33.9],[45.6,34.6],[45.1,35.0],[46.1,35.7],[45.4,36.0],[44.8,37.2],[44.2,37.9],[44.4,38.3],[44.0,39.4]];
const W = 640, H = 560;
const px = (lng: number) => ((lng - 43.5) / 20.3) * W;
const py = (lat: number) => H - ((lat - 24.8) / 15.2) * H;

function CoverageMap({ cities, sel, onSel }: { cities: any[]; sel: any; onSel: (c: any) => void }) {
  const path = useMemo(() => "M" + IRAN.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join("L") + "Z", []);
  return (
    <div dir="ltr" className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="نقشه‌ی پوشش نمایندگی">
        <path d={path} fill="#FBF6EC" stroke="#C9B894" strokeWidth={1.5} />
        {cities.filter((c) => c.lat).map((c) => {
          const r = 5 + Math.min(12, Math.sqrt((c.population || 100000) / 100000) * 2.2);
          const covered = c.distributors > 0;
          const fill = covered ? "#1F3A5F" : c.applications ? "#B8862F" : "#FFFFFF";
          const stroke = covered ? "#1F3A5F" : c.applications ? "#B8862F" : "#B4443A";
          return (
            <g key={c.id} className="cursor-pointer" onClick={() => onSel(c)}>
              <circle cx={px(c.lng)} cy={py(c.lat)} r={r} fill={fill} fillOpacity={covered ? 0.85 : 0.9} stroke={stroke} strokeWidth={sel?.id === c.id ? 3.5 : 1.8} />
              <text x={px(c.lng)} y={py(c.lat) - r - 4} textAnchor="middle" fontSize={11} fill="#1C2733" fontFamily="Vazirmatn">{c.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Network() {
  const [tab, setTab] = useState<"map" | "apps">("map");
  const { data: stats } = useApi<Record<string, number>>("/agency-applications/stats/");
  return (
    <>
      <PageHeader title="شبکه‌ی فروش و نمایندگی" subtitle="شهرهای دارای نماینده و بدون نماینده، و درخواست‌های نمایندگی از سایت و پرتال" />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: "map", label: "نقشه‌ی پوشش" }, { value: "apps", label: "درخواست‌های نمایندگی", count: (stats?.new ?? 0) + (stats?.reviewing ?? 0) }]} /></div>
      {tab === "map" ? <Coverage /> : <Applications />}
    </>
  );
}

function Coverage() {
  const { data } = useApi<any>("/coverage/");
  const [sel, setSel] = useState<any>(null);
  const [filter, setFilter] = useState<"all" | "covered" | "uncovered">("uncovered");
  if (!data) return <Loading />;
  const rows = data.cities.filter((c: any) => filter === "all" || (filter === "covered" ? c.distributors > 0 : c.distributors === 0));
  return (
    <div className="grid xl:grid-cols-[1fr_420px] gap-6 items-start">
      <Card>
        <div className="flex gap-4 flex-wrap text-xs mb-2">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-navy-600" />دارای نماینده ({num(data.covered)})</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gold" />بدون نماینده، با درخواست</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-bad" />بدون نماینده ({num(data.uncovered)})</span>
        </div>
        <CoverageMap cities={data.cities} sel={sel} onSel={setSel} />
        {sel && (
          <div className="mt-3 rounded-xl bg-cream-100 p-4 text-sm flex flex-wrap gap-4 items-center">
            <b className="text-navy-700">{sel.name} <span className="text-xs text-ink-muted font-normal">{sel.province}</span></b>
            <span>نماینده: <b className="num">{num(sel.distributors)}</b></span><span>فروشگاه: <b className="num">{num(sel.stores)}</b></span><span>سازمانی: <b className="num">{num(sel.organizations)}</b></span><span>درخواست نمایندگی: <b className="num">{num(sel.applications)}</b></span>
          </div>
        )}
      </Card>
      <Card title="شهرها" pad={false} actions={<Select aria-label="فیلتر" className="h-9 w-36 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as any)}><option value="uncovered">بدون نماینده</option><option value="covered">دارای نماینده</option><option value="all">همه</option></Select>}>
        <div className="max-h-[560px] overflow-y-auto">
          <ul>{rows.map((c: any) => (
            <li key={c.id}><button onClick={() => setSel(c)} className={cx("w-full flex items-center gap-3 px-5 py-2.5 border-t border-cream-200 text-sm text-right", sel?.id === c.id ? "bg-navy-50" : "hover:bg-cream-100")}>
              <span className="flex-1">{c.name} <span className="text-xs text-ink-muted">· {c.province}</span></span>
              {c.distributors > 0 ? <Badge color="navy">{num(c.distributors)} نماینده</Badge> : c.applications ? <Badge color="gold">{num(c.applications)} درخواست</Badge> : <Badge color="bad">بدون پوشش</Badge>}
            </button></li>
          ))}</ul>
        </div>
      </Card>
    </div>
  );
}

function Applications() {
  const [status, setStatus] = useState("new");
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<Page<any>>("/agency-applications/", { status, page });
  const [open, setOpen] = useState<any>(null);
  const [note, setNote] = useState("");
  const { run, busy } = useAction();
  const save = async (s: string) => { if (await run(() => api.patch(`/agency-applications/${open.id}/`, { status: s, admin_note: note }), "ذخیره شد")) { setOpen(null); reload(); } };
  return (
    <>
      <div className="mb-3"><Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: "new", label: "جدید" }, { value: "reviewing", label: "در حال بررسی" }, { value: "accepted", label: "پذیرفته" }, { value: "rejected", label: "رد شده" }, { value: "", label: "همه" }]} /></div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : !data?.results.length ? <Empty icon="map" title="درخواستی نیست" /> : (
          <div className="px-5 pt-2"><Table>
            <thead><tr><th className="th">متقاضی</th><th className="th">شهر</th><th className="th">امکانات</th><th className="th">منبع</th><th className="th">تاریخ</th><th className="th">وضعیت</th><th className="th"></th></tr></thead>
            <tbody>{data.results.map((a) => (
              <tr key={a.id}>
                <td className="td"><div className="font-medium">{a.full_name}</div><div className="text-xs text-ink-muted">{a.business_name} · <span dir="ltr">{fa(a.phone)}</span></div></td>
                <td className="td">{a.city_name}<div className="text-xs text-ink-muted">{a.province_name}</div></td>
                <td className="td text-xs">{a.has_warehouse ? "انبار دارد" : "بدون انبار"} · {num(a.vehicles)} خودرو</td>
                <td className="td"><Badge>{a.source === "website" ? "سایت" : "پرتال"}</Badge></td>
                <td className="td num">{jdate(a.created_at)}</td>
                <td className="td"><StatusChip status={a.status} label={a.status_display} /></td>
                <td className="td text-left"><Button size="sm" variant="ghost" onClick={() => { setOpen(a); setNote(a.admin_note || ""); }}>بررسی</Button></td>
              </tr>
            ))}</tbody>
          </Table></div>
        )}
        <div className="px-5 pb-4">{data && <Pagination page={page} count={data.count} onChange={setPage} />}</div>
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title={`درخواست ${open?.full_name ?? ""}`}
        footer={<><Button loading={busy} onClick={() => save("accepted")}>پذیرش</Button><Button variant="secondary" loading={busy} onClick={() => save("reviewing")}>در حال بررسی</Button><Button variant="ghost" loading={busy} onClick={() => save("rejected")}>رد</Button></>}>
        {open && <div className="space-y-3 text-sm"><p className="leading-7 text-ink-soft">{open.experience || "توضیحی ثبت نشده."}</p>
          <Textarea id="ap_note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت داخلی (نتیجه‌ی تماس، بازدید…)" /></div>}
      </Modal>
    </>
  );
}
