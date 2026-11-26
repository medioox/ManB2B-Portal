"use client";
import React, { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fa } from "@/lib/format";
import { useProvinces } from "@/lib/geo";
import { useNav } from "@/lib/nav";
import { AuthFrame } from "./Login";

const TYPES = [
  { v: "distributor", l: "نماینده / پخش‌کننده", d: "پخش عمده در شهر یا استان", icon: "truck" },
  { v: "store", l: "فروشگاه", d: "سوپرمارکت و هایپرمارکت", icon: "store" },
  { v: "organization", l: "مشتری سازمانی", d: "هتل، خشکشویی، بیمارستان…", icon: "building" },
  { v: "lab", l: "آزمایشگاه", d: "کیت‌های بیوشیمی و هماتولوژی", icon: "flask" },
];
const DOC_KINDS = [{ v: "license", l: "جواز کسب" }, { v: "national_card", l: "کارت ملی" }, { v: "economic", l: "گواهی کد اقتصادی" }, { v: "other", l: "سایر" }];

export default function Register() {
  const nav = useNav();
  const toast = useToast();
  const { signIn } = useAuth();
  const reg = useMemo(() => {
    const g = (globalThis as any).__MAN_REG__;
    if (g) return g;
    try { return JSON.parse(sessionStorage.getItem("man.reg") || "null"); } catch { return null; }
  }, []);
  const { data: provinces } = useProvinces();
  const [f, setF] = useState<any>({ type: "distributor", first_name: "", last_name: "", business_name: "", economic_code: "", national_id: "", license_number: "", province: "", city: "", address: "", postal_code: "" });
  const [docs, setDocs] = useState<{ file: File; kind: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const cities = provinces?.find((p) => String(p.id) === String(f.province))?.cities ?? [];

  if (!reg) {
    return <AuthFrame><p className="text-sm text-ink-soft">برای ثبت‌نام ابتدا شماره‌ی موبایل خود را تأیید کنید.</p><Button className="mt-4" onClick={() => nav.replace("/login")}>رفتن به صفحه‌ی ورود</Button></AuthFrame>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const req: Record<string, string> = {};
    ["first_name", "last_name", "business_name", "city", "address"].forEach((k) => { if (!String(f[k]).trim()) req[k] = "این فیلد الزامی است."; });
    if (f.type !== "lab" && docs.length === 0) req.documents = "حداقل تصویر جواز کسب را بارگذاری کنید.";
    setErrors(req);
    if (Object.keys(req).length) return;
    const fd = new FormData();
    fd.append("registration_token", reg.token);
    Object.entries(f).forEach(([k, v]) => k !== "province" && fd.append(k, String(v)));
    docs.forEach((d) => { fd.append("documents", d.file); fd.append("document_kinds", d.kind); });
    setBusy(true);
    try {
      const r = await api.post("/auth/register/", fd);
      try { sessionStorage.removeItem("man.reg"); } catch { /* */ }
      (globalThis as any).__MAN_REG__ = null;
      await signIn(r.access, r.refresh, r.user);
      toast("درخواست شما ثبت شد");
      nav.replace("/pending");
    } catch (err) {
      const e2 = err as ApiError;
      const map: Record<string, string> = {};
      Object.keys(e2.data?.errors || {}).forEach((k) => (map[k] = e2.field(k) || ""));
      setErrors(map);
      toast(e2.message, "bad");
    } finally { setBusy(false); }
  };

  return (
    <AuthFrame wide>
      <h1 className="text-2xl font-bold text-navy-700">ثبت‌نام کسب‌وکار</h1>
      <p className="text-sm text-ink-muted mt-1 mb-6">شماره‌ی <span className="num" dir="ltr">{fa(reg.phone)}</span> تأیید شد. اطلاعات کسب‌وکار را کامل کنید؛ پس از بررسی مدارک، حساب شما فعال می‌شود.</p>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <span className="label">نوع مشتری</span>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <button type="button" key={t.v} onClick={() => setF({ ...f, type: t.v })}
                className={`text-right rounded-xl border p-3 flex gap-3 items-start transition-colors ${f.type === t.v ? "border-navy-500 bg-navy-50" : "border-cream-400 bg-white hover:border-navy-200"}`}>
                <Icon name={t.icon} className={`w-5 h-5 mt-0.5 ${f.type === t.v ? "text-navy-600" : "text-ink-muted"}`} />
                <span><span className="block text-sm font-medium">{t.l}</span><span className="block text-[11px] text-ink-muted">{t.d}</span></span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="نام" error={errors.first_name}><Input id="first_name" value={f.first_name} onChange={set("first_name")} /></Field>
          <Field label="نام خانوادگی" error={errors.last_name}><Input id="last_name" value={f.last_name} onChange={set("last_name")} /></Field>
          <Field label="نام کسب‌وکار" error={errors.business_name} className="sm:col-span-2"><Input id="business_name" value={f.business_name} onChange={set("business_name")} placeholder="مثلاً پخش البرز شیراز" /></Field>
          <Field label="کد اقتصادی" error={errors.economic_code}><Input id="economic_code" dir="ltr" value={f.economic_code} onChange={set("economic_code")} /></Field>
          <Field label="شماره جواز کسب" error={errors.license_number}><Input id="license_number" dir="ltr" value={f.license_number} onChange={set("license_number")} /></Field>
          <Field label="استان"><Select id="province" value={f.province} onChange={(e) => setF({ ...f, province: e.target.value, city: "" })}><option value="">انتخاب کنید</option>{provinces?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="شهر" error={errors.city}><Select id="city" value={f.city} onChange={set("city")} disabled={!f.province}><option value="">انتخاب کنید</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="آدرس کامل" error={errors.address} className="sm:col-span-2"><Textarea id="address" value={f.address} onChange={set("address")} /></Field>
          <Field label="کد پستی"><Input id="postal_code" dir="ltr" value={f.postal_code} onChange={set("postal_code")} /></Field>
        </div>
        <div>
          <span className="label">مدارک (تصویر یا PDF، هر فایل حداکثر ۸ مگابایت)</span>
          <div className="space-y-2">
            {docs.map((d, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl bg-white border border-cream-400 p-2">
                <Icon name="file" className="w-4 h-4 text-navy-500" />
                <span className="text-sm truncate flex-1">{d.file.name}</span>
                <Select className="w-40 h-8 text-xs" value={d.kind} onChange={(e) => setDocs(docs.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>{DOC_KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</Select>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setDocs(docs.filter((_, j) => j !== i))} aria-label="حذف"><Icon name="trash" className="w-4 h-4" /></button>
              </div>
            ))}
            <label className="flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-dashed border-cream-500 text-sm text-ink-soft cursor-pointer hover:border-navy-300">
              <Icon name="upload" className="w-4 h-4" /> افزودن مدرک
              <input type="file" className="hidden" accept="image/*,application/pdf" multiple onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setDocs([...docs, ...files.map((file, i) => ({ file, kind: docs.length + i === 0 ? "license" : "other" }))]);
                e.target.value = "";
              }} />
            </label>
            {errors.documents && <p className="text-xs text-bad">{errors.documents}</p>}
          </div>
        </div>
        <Button className="w-full" loading={busy}>ارسال درخواست عضویت</Button>
      </form>
    </AuthFrame>
  );
}
