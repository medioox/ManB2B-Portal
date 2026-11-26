"use client";
import React, { useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { toEnDigits } from "@/lib/format";
import { useProvinces } from "@/lib/geo";
import { Link } from "@/lib/nav";
import { AuthFrame } from "./Login";

/** Public "become a distributor" form. The company website can post to the same endpoint (source=website). */
export default function Agency() {
  const { data: provinces } = useProvinces();
  const toast = useToast();
  const [f, setF] = useState<any>({ full_name: "", phone: "", business_name: "", province: "", city: "", experience: "", has_warehouse: false, vehicles: 0 });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const cities = provinces?.find((p) => String(p.id) === String(f.province))?.cities ?? [];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/agency-applications/", { ...f, phone: toEnDigits(f.phone), source: "portal" });
      setDone(true);
    } catch (err) { toast((err as ApiError).message, "bad"); } finally { setBusy(false); }
  };
  if (done) return (
    <AuthFrame>
      <div className="w-14 h-14 rounded-2xl bg-ok-soft text-ok grid place-items-center mb-4"><Icon name="check" className="w-7 h-7" /></div>
      <h1 className="text-2xl font-bold text-navy-700">درخواست شما ثبت شد</h1>
      <p className="text-sm text-ink-muted mt-2">واحد توسعه‌ی شبکه‌ی فروش ظرف یک هفته با شما تماس می‌گیرد.</p>
      <Link to="/login" className="btn-secondary mt-6">بازگشت به صفحه‌ی ورود</Link>
    </AuthFrame>
  );
  return (
    <AuthFrame wide>
      <h1 className="text-2xl font-bold text-navy-700">درخواست نمایندگی مَن</h1>
      <p className="text-sm text-ink-muted mt-1 mb-6">شهرهایی که هنوز نماینده ندارند در اولویت بررسی هستند.</p>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label="نام و نام خانوادگی"><Input id="ag_name" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="موبایل"><Input id="ag_phone" required dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="نام شرکت یا فروشگاه" className="sm:col-span-2"><Input id="ag_biz" value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} /></Field>
        <Field label="استان"><Select id="ag_prov" value={f.province} onChange={(e) => setF({ ...f, province: e.target.value, city: "" })}><option value="">انتخاب کنید</option>{provinces?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="شهر"><Select id="ag_city" required value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}><option value="">انتخاب کنید</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="تعداد خودروی پخش"><Input id="ag_veh" type="number" min={0} value={f.vehicles} onChange={(e) => setF({ ...f, vehicles: +e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={f.has_warehouse} onChange={(e) => setF({ ...f, has_warehouse: e.target.checked })} /> انبار اختصاصی دارم</label>
        <Field label="سابقه‌ی کاری" className="sm:col-span-2"><Textarea id="ag_exp" value={f.experience} onChange={(e) => setF({ ...f, experience: e.target.value })} placeholder="برندهایی که پخش می‌کنید، محدوده‌ی پوشش و…" /></Field>
        <div className="sm:col-span-2 flex gap-2"><Button loading={busy}>ثبت درخواست</Button><Link to="/login" className="btn-ghost">انصراف</Link></div>
      </form>
    </AuthFrame>
  );
}
