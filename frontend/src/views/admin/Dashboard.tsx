"use client";
import React, { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, Empty, Loading, PageHeader, Select, Stat, Table, Tabs, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { isManager, useAuth } from "@/lib/auth";
import { fa, isoDaysAgo, jdate, num, short } from "@/lib/format";
import { useProvinces } from "@/lib/geo";
import { useApi } from "@/lib/hooks";
import { Link } from "@/lib/nav";

const NAVY = "#2A4C77";
const GOLD = "#B8862F";
const AXIS = { fontSize: 11, fill: "#7A7263", fontFamily: "Vazirmatn" };

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs">
      <div className="font-medium mb-1">{fa(label)}</div>
      {payload.map((p: any) => <div key={p.dataKey} className="num">{p.dataKey === "orders" ? `${num(p.value)} سفارش` : `${num(p.value)} ریال`}</div>)}
    </div>
  );
}

function HBar({ data, dataKey = "total", nameKey = "name", color = NAVY }: { data: any[]; dataKey?: string; nameKey?: string; color?: string }) {
  if (!data.length) return <Empty icon="chart" title="داده‌ای در این بازه نیست" />;
  return (
    <div style={{ height: Math.max(180, data.length * 30) }} dir="ltr">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#E9DFC9" />
          <XAxis type="number" tick={AXIS} tickFormatter={(v) => short(v)} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={nameKey} orientation="right" width={130} tick={{ ...AXIS, fill: "#1C2733" }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTip />} cursor={{ fill: "#F1E8D6" }} />
          <Bar dataKey={dataKey} fill={color} radius={[6, 0, 0, 6]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState("180");
  const [gran, setGran] = useState("month");
  const [province, setProvince] = useState("");
  const [ctype, setCtype] = useState("");
  const [rep, setRep] = useState("");
  const { data: provinces } = useProvinces();
  const { data: reps } = useApi<any[]>(isManager(user) ? "/staff/" : null, { role: "sales_rep" });
  const params = { from: isoDaysAgo(+period), granularity: gran, province, customer_type: ctype, sales_rep: rep };
  const { data, loading } = useApi<any>("/reports/dashboard/", params);
  const [tab, setTab] = useState<"city" | "product" | "customer" | "rep">("city");
  const { run, busy } = useAction();
  return (
    <div className="space-y-6">
      <PageHeader title="داشبورد مدیران" subtitle={user?.role === "sales_rep" ? "فروش مشتری‌ها و منطقه‌ی شما" : "فروش کل شبکه به تفکیک زمان، شهر، محصول و نماینده"}
        actions={<Button variant="secondary" icon="download" loading={busy} onClick={() => run(() => api.download("/reports/export/", "man-report.xlsx", params), "فایل اکسل آماده شد")}>خروجی اکسل</Button>} />
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <Select aria-label="بازه" className="w-36 h-9 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="30">۳۰ روز اخیر</option><option value="90">۳ ماه اخیر</option><option value="180">۶ ماه اخیر</option><option value="365">یک سال اخیر</option>
        </Select>
        <Select aria-label="تفکیک" className="w-32 h-9 text-sm" value={gran} onChange={(e) => setGran(e.target.value)}><option value="day">روزانه</option><option value="week">هفتگی</option><option value="month">ماهانه</option></Select>
        <Select aria-label="استان" className="w-36 h-9 text-sm" value={province} onChange={(e) => setProvince(e.target.value)}><option value="">همه‌ی استان‌ها</option>{provinces?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select aria-label="نوع مشتری" className="w-40 h-9 text-sm" value={ctype} onChange={(e) => setCtype(e.target.value)}><option value="">همه‌ی مشتری‌ها</option><option value="distributor">نماینده‌ها</option><option value="store">فروشگاه‌ها</option><option value="organization">سازمانی</option><option value="lab">آزمایشگاه‌ها</option></Select>
        {reps && <Select aria-label="کارشناس" className="w-40 h-9 text-sm" value={rep} onChange={(e) => setRep(e.target.value)}><option value="">همه‌ی کارشناسان</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.first_name} {r.last_name}</option>)}</Select>}
        {loading && <span className="text-xs text-ink-muted mr-auto">در حال به‌روزرسانی…</span>}
      </div>
      {!data ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Stat icon="chart" label="فروش دوره" value={`${short(data.kpis.sales)} ریال`}
              hint={data.kpis.growth != null && <span className={data.kpis.growth >= 0 ? "text-ok" : "text-bad"}>{data.kpis.growth >= 0 ? "▲" : "▼"} {num(Math.abs(data.kpis.growth), 1)}٪ نسبت به دوره‌ی قبل</span>} />
            <Stat icon="truck" label="تعداد سفارش" value={num(data.kpis.orders)} hint={`میانگین ${short(data.kpis.avg_order)} ریال`} tone="gold" />
            <Stat icon="box" label="کارتن فروخته‌شده" value={num(data.kpis.cartons)} hint={`${num(data.kpis.active_customers)} مشتری فعال`} tone="ok" />
            <Stat icon="alert" label="مطالبات معوق" value={`${short(data.receivables.total_overdue)} ریال`} tone="bad"
              hint={<span><Link to="/admin/customers" className="text-navy-500">{num(data.kpis.pending_approvals)} درخواست عضویت</Link> · <Link to="/admin/orders" className="text-navy-500">{num(data.kpis.open_orders)} سفارش جدید</Link></span>} />
          </div>
          <Card title="روند فروش">
            <div className="h-72" dir="ltr">
              <ResponsiveContainer>
                <AreaChart data={data.series} margin={{ left: 8, right: 8, top: 10 }}>
                  <defs><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NAVY} stopOpacity={0.35} /><stop offset="100%" stopColor={NAVY} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="#E9DFC9" />
                  <XAxis dataKey="label" tick={AXIS} tickFormatter={(v) => fa(v)} axisLine={false} tickLine={false} reversed />
                  <YAxis orientation="right" tick={AXIS} tickFormatter={(v) => short(v)} axisLine={false} tickLine={false} width={70} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="total" stroke={NAVY} strokeWidth={2.5} fill="url(#gs)" dot={{ r: 3, fill: NAVY }} activeDot={{ r: 5, fill: GOLD }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="تفکیک فروش" actions={<Tabs value={tab} onChange={setTab} items={[{ value: "city", label: "شهر" }, { value: "product", label: "محصول" }, { value: "customer", label: "نماینده / مشتری" }, { value: "rep", label: "کارشناس فروش" }]} />}>
            {tab === "city" && <HBar data={data.by_city} />}
            {tab === "product" && <HBar data={data.by_product} color={GOLD} />}
            {tab === "customer" && <HBar data={data.by_customer} />}
            {tab === "rep" && <HBar data={data.by_rep} color={GOLD} />}
          </Card>
          <div className="grid xl:grid-cols-2 gap-6">
            <Card title="نماینده‌های غیرفعال" actions={<Badge color="warn">بدون سفارش در ۳۰ روز اخیر</Badge>} pad={false}>
              {!data.inactive.length ? <Empty icon="check" title="همه‌ی نماینده‌ها فعال هستند" /> : (
                <div className="px-5"><Table><thead><tr><th className="th">نماینده</th><th className="th">شهر</th><th className="th">آخرین سفارش</th><th className="th">تماس</th></tr></thead>
                  <tbody>{data.inactive.map((r: any) => (
                    <tr key={r.id}><td className="td"><Link to={`/admin/customers/review?id=${r.id}`} className="text-navy-600">{r.business_name}</Link></td><td className="td">{r.city_name}</td><td className="td num">{r.last_order ? jdate(r.last_order) : "هرگز"}</td><td className="td num" dir="ltr">{r.phone}</td></tr>
                  ))}</tbody></Table></div>
              )}
            </Card>
            <Card title="مطالبات معوق" actions={<Link to="/admin/finance" className="text-xs text-navy-500">مدیریت اعتبار</Link>} pad={false}>
              {!data.receivables.rows.length ? <Empty icon="check" title="مطالبه‌ی معوقی نیست" /> : (
                <div className="px-5"><Table><thead><tr><th className="th">مشتری</th><th className="th">مانده</th><th className="th">معوق</th><th className="th">قدیمی‌ترین سررسید</th></tr></thead>
                  <tbody>{data.receivables.rows.filter((r: any) => r.overdue > 0).slice(0, 10).map((r: any) => (
                    <tr key={r.customer_id}><td className="td"><Link to={`/admin/customers/review?id=${r.customer_id}`} className="text-navy-600">{r.name}</Link></td><td className="td num">{short(r.balance)}</td><td className="td num text-bad font-medium">{short(r.overdue)}</td><td className="td num">{jdate(r.oldest_due)}</td></tr>
                  ))}</tbody></Table></div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
