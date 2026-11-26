"use client";
import React, { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, Empty, ErrorBox, Field, Img, Input, KV, Loading, Modal, PageHeader, Pagination, Select, StatusChip, Table, Tabs, Textarea, useAction } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { isManager, useAuth } from "@/lib/auth";
import { ago, fa, jdate, num, toEnDigits } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { Link, useNav } from "@/lib/nav";
import type { Customer } from "@/lib/types";
import { CreditCards, LedgerTable } from "../customer/Finance";

export default function Customers() {
  const [status, setStatus] = useState("pending");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data: stats } = useApi<Record<string, number>>("/customers/stats/");
  const { data, loading, error, reload } = useApi<Page<Customer>>("/customers/", { status, type, search: q, page });
  return (
    <>
      <PageHeader title="مشتری‌ها" subtitle="صف درخواست‌های عضویت، تأیید مدارک و مدیریت مشتری‌های فعال" />
      <div className="flex flex-col md:flex-row gap-3 mb-4 md:items-center">
        <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[
          { value: "pending", label: "در انتظار تأیید", count: stats?.pending ?? 0 }, { value: "approved", label: "فعال", count: stats?.approved ?? 0 },
          { value: "rejected", label: "رد شده", count: stats?.rejected ?? 0 }, { value: "", label: "همه" },
        ]} />
        <div className="flex gap-2 md:mr-auto">
          <Select aria-label="نوع" className="w-40 h-9 text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">همه‌ی انواع</option><option value="distributor">نماینده</option><option value="store">فروشگاه</option><option value="organization">سازمانی</option><option value="lab">آزمایشگاه</option></Select>
          <Input aria-label="جست‌وجو" className="w-56 h-9" placeholder="نام، موبایل، کد اقتصادی" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : (
        <Card pad={false}>
          {loading && !data ? <Loading /> : !data?.results.length ? <Empty icon="users" title={status === "pending" ? "درخواست تأیید نشده‌ای نیست" : "مشتری‌ای پیدا نشد"} /> : (
            <div className="px-5 pt-2"><Table>
              <thead><tr><th className="th">کسب‌وکار</th><th className="th">نوع</th><th className="th">شهر</th><th className="th">گروه قیمت</th><th className="th">کارشناس</th><th className="th">ثبت</th><th className="th">وضعیت</th><th className="th"></th></tr></thead>
              <tbody>{data.results.map((c) => (
                <tr key={c.id} className="hover:bg-cream-100">
                  <td className="td"><div className="font-medium">{c.business_name}</div><div className="text-xs text-ink-muted">{c.owner_name} · <span dir="ltr">{fa(c.phone)}</span></div></td>
                  <td className="td">{c.type_display}</td><td className="td">{c.city_name}</td>
                  <td className="td">{c.price_group_name || "—"}</td><td className="td">{c.sales_rep_name || "—"}</td>
                  <td className="td text-xs">{ago(c.created_at)}</td>
                  <td className="td"><StatusChip status={c.status} label={c.status_display} /></td>
                  <td className="td text-left"><Link to={`/admin/customers/review?id=${c.id}`} className={c.status === "pending" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>{c.status === "pending" ? "بررسی مدارک" : "مشاهده"}</Link></td>
                </tr>
              ))}</tbody>
            </Table></div>
          )}
          <div className="px-5 pb-4">{data && <Pagination page={page} count={data.count} onChange={setPage} />}</div>
        </Card>
      )}
    </>
  );
}

export function CustomerReview() {
  const { params, push } = useNav();
  const { user } = useAuth();
  const manager = isManager(user);
  const { data: c, reload, error } = useApi<Customer>(`/customers/${params.id}/`);
  const { data: groups } = useApi<any[]>(manager ? "/price-groups/" : null);
  const { data: reps } = useApi<any[]>(manager ? "/staff/" : null, { role: "sales_rep" });
  const { data: fin } = useApi<any>(c?.status === "approved" ? "/finance/summary/" : null, { customer: params.id });
  const { run, busy } = useAction();
  const [f, setF] = useState<any>({});
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => { if (c) setF({ price_group: c.price_group ?? groups?.find((g) => g.is_default)?.id ?? "", sales_rep: c.sales_rep ?? "", credit_limit: String(c.credit_limit ?? 0), block_on_credit: c.block_on_credit }); }, [c, groups]);
  if (error) return <ErrorBox error={error} />;
  if (!c) return <Loading />;
  const payload = { price_group: f.price_group || null, sales_rep: f.sales_rep || null, credit_limit: toEnDigits(String(f.credit_limit)).replace(/\D/g, "") || 0, block_on_credit: f.block_on_credit };
  return (
    <div className="space-y-6">
      <PageHeader title={c.business_name} subtitle={<span className="flex items-center gap-2 flex-wrap">{c.type_display} · {c.province_name}، {c.city_name} <StatusChip status={c.status} label={c.status_display} /></span>}
        back={<Link to="/admin/customers" className="text-xs text-navy-500 flex items-center gap-1 mb-2"><Icon name="right" className="w-3.5 h-3.5" />مشتری‌ها</Link>}
        actions={c.status === "approved" && <><Link to={`/admin/orders?customer=${c.id}`} className="btn-secondary"><Icon name="truck" className="w-4 h-4" />سفارش‌ها</Link>
          {manager && <Button variant="ghost" icon="x" onClick={async () => { await run(() => api.post(`/customers/${c.id}/suspend/`), "حساب تعلیق شد"); reload(); }}>تعلیق</Button>}</>} />
      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <Card title="اطلاعات کسب‌وکار">
            <div className="grid md:grid-cols-2 gap-x-8">
              <KV k="مالک / مسئول" v={c.owner_name} /><KV k="موبایل" v={<span dir="ltr">{fa(c.phone)}</span>} />
              <KV k="کد اقتصادی" v={fa(c.economic_code) || "—"} /><KV k="شناسه ملی" v={fa(c.national_id) || "—"} />
              <KV k="شماره جواز" v={fa(c.license_number) || "—"} /><KV k="کد پستی" v={fa(c.postal_code) || "—"} />
              <KV k="تاریخ ثبت‌نام" v={jdate(c.created_at)} /><KV k="کد حسابداری" v={c.accounting_code || "—"} />
            </div>
            <p className="text-sm text-ink-soft mt-3">آدرس: {c.address}</p>
            {c.rejection_reason && <div className="mt-3 rounded-xl bg-bad-soft text-bad text-sm p-3">دلیل رد: {c.rejection_reason}</div>}
          </Card>
          <Card title={`مدارک (${num(c.documents.length)})`}>
            {!c.documents.length ? <p className="text-sm text-ink-muted">مدرکی بارگذاری نشده است.</p> : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{c.documents.map((d) => (
                <button key={d.id} onClick={() => setPreview(d.file)} className="text-right rounded-xl border border-cream-300 overflow-hidden hover:border-navy-300">
                  {/\.(png|jpe?g|webp|gif)$/i.test(d.file) ? <Img src={d.file} alt={d.kind_display} className="w-full aspect-[1.4]" /> : <div className="aspect-[1.4] grid place-items-center bg-cream-200"><Icon name="file" className="w-8 h-8 text-navy-400" /></div>}
                  <div className="p-2 text-xs"><div className="font-medium">{d.kind_display}</div><div className="text-ink-muted">{jdate(d.created_at)}</div></div>
                </button>
              ))}</div>
            )}
          </Card>
          {fin && <><CreditCards s={fin} /><LedgerTable customer={c.id} /></>}
        </div>
        {manager ? (
          <Card title={c.status === "pending" ? "تأیید و تنظیم حساب" : "تنظیمات حساب"} className="lg:sticky lg:top-24">
            <div className="space-y-4">
              <Field label="گروه قیمت"><Select id="cr_pg" value={f.price_group} onChange={(e) => setF({ ...f, price_group: e.target.value })}><option value="">انتخاب کنید</option>{groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
              <Field label="کارشناس فروش"><Select id="cr_rep" value={f.sales_rep} onChange={(e) => setF({ ...f, sales_rep: e.target.value })}><option value="">بدون کارشناس</option>{reps?.map((r) => <option key={r.id} value={r.id}>{r.first_name} {r.last_name}</option>)}</Select></Field>
              <Field label="سقف اعتبار (ریال)" hint={+toEnDigits(String(f.credit_limit || 0)) ? `${num(toEnDigits(String(f.credit_limit)))} ریال` : "صفر یعنی بدون محدودیت اعتباری"}>
                <Input id="cr_cl" dir="ltr" inputMode="numeric" value={f.credit_limit ?? ""} onChange={(e) => setF({ ...f, credit_limit: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.block_on_credit} onChange={(e) => setF({ ...f, block_on_credit: e.target.checked })} />جلوگیری از سفارش وقتی اعتبار تمام شده</label>
              {c.status === "pending" || c.status === "rejected" || c.status === "suspended" ? (
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1" icon="check" loading={busy} disabled={!f.price_group} onClick={async () => { if (await run(() => api.post(`/customers/${c.id}/approve/`, payload), "مشتری تأیید شد و پیامک ارسال شد")) reload(); }}>{c.status === "suspended" ? "فعال‌سازی دوباره" : "تأیید مشتری"}</Button>
                  {c.status === "pending" && <Button variant="secondary" icon="x" onClick={() => setReject(true)}>رد</Button>}
                </div>
              ) : (
                <Button className="w-full" loading={busy} onClick={async () => { if (await run(() => api.patch(`/customers/${c.id}/`, payload), "تغییرات ذخیره شد")) reload(); }}>ذخیره‌ی تغییرات</Button>
              )}
            </div>
          </Card>
        ) : (
          <Card title="تنظیمات حساب"><KV k="گروه قیمت" v={c.price_group_name || "—"} /><KV k="کارشناس" v={c.sales_rep_name || "—"} /><KV k="سقف اعتبار" v={num(c.credit_limit)} /><p className="text-xs text-ink-muted mt-3">تغییر این موارد با مدیر فروش است.</p></Card>
        )}
      </div>
      <Modal open={reject} onClose={() => setReject(false)} title="رد درخواست عضویت"
        footer={<Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={async () => { if (await run(() => api.post(`/customers/${c.id}/reject/`, { reason }), "درخواست رد شد و به متقاضی پیامک شد")) { setReject(false); push("/admin/customers"); } }}>رد و اطلاع به متقاضی</Button>}>
        <Field label="دلیل رد (برای متقاضی پیامک می‌شود)"><Textarea id="rj_reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً تصویر جواز کسب ناخوانا است؛ لطفاً دوباره بارگذاری کنید." /></Field>
        <div className="flex gap-1.5 flex-wrap mt-3">{["تصویر جواز کسب ناخوانا است.", "جواز کسب منقضی شده است.", "در این شهر نماینده‌ی فعال داریم."].map((t) => <button key={t} className="chip bg-cream-200 h-7" onClick={() => setReason(t)}>{t}</button>)}</div>
      </Modal>
      <Modal open={!!preview} onClose={() => setPreview(null)} title="مشاهده‌ی مدرک" wide>
        {preview && (/\.(png|jpe?g|webp|gif)$/i.test(preview) ? <Img src={preview} alt="مدرک" className="w-full rounded-xl object-contain" /> : <a href={preview} target="_blank" rel="noreferrer" className="btn-secondary">باز کردن فایل</a>)}
      </Modal>
    </div>
  );
}
