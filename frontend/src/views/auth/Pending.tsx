"use client";
import React, { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { homeFor, useAuth } from "@/lib/auth";
import { jdate } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { AuthFrame } from "./Login";

export default function Pending() {
  const { user, reload, signOut } = useAuth();
  const nav = useNav();
  const { busy, run } = useAction();
  const [kind, setKind] = useState("license");
  useEffect(() => { if (user && user.customer?.status === "approved") nav.replace(homeFor(user)); }, [user]); // eslint-disable-line
  if (!user?.customer) return null;
  const c = user.customer;
  const rejected = c.status === "rejected";
  const steps = [
    { t: "ثبت درخواست", d: jdate(c.created_at), done: true },
    { t: "بررسی مدارک توسط مدیر فروش", d: rejected ? "نیاز به اصلاح" : "معمولاً تا ۲ روز کاری", done: false, active: !rejected },
    { t: "تعیین گروه قیمت و کارشناس فروش", d: "", done: false },
    { t: "فعال شدن حساب و اطلاع پیامکی", d: "", done: false },
  ];
  return (
    <AuthFrame>
      <div className={`w-14 h-14 rounded-2xl grid place-items-center mb-4 ${rejected ? "bg-bad-soft text-bad" : "bg-gold-soft text-gold"}`}><Icon name={rejected ? "alert" : "clock"} className="w-7 h-7" /></div>
      <h1 className="text-2xl font-bold text-navy-700">{rejected ? "درخواست نیاز به اصلاح دارد" : "در انتظار تأیید"}</h1>
      <p className="text-sm text-ink-muted mt-1">{c.business_name} · {c.type_display} · {c.city_name}</p>
      {rejected && <div className="mt-4 rounded-xl bg-bad-soft text-bad text-sm p-3">{c.rejection_reason}</div>}
      <ol className="mt-6 space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className={`w-6 h-6 rounded-full grid place-items-center text-xs shrink-0 ${s.done ? "bg-ok text-white" : s.active ? "bg-gold text-white" : "bg-cream-300 text-ink-muted"}`}>{s.done ? <Icon name="check" className="w-3.5 h-3.5" /> : i + 1}</span>
            <div><div className="text-sm font-medium">{s.t}</div>{s.d && <div className="text-xs text-ink-muted">{s.d}</div>}</div>
          </li>
        ))}
      </ol>
      <div className="mt-6">
        <div className="label">مدارک ارسال‌شده</div>
        <div className="flex flex-wrap gap-1.5">{c.documents.map((d) => <Badge key={d.id} color="navy">{d.kind_display}</Badge>)}{!c.documents.length && <span className="text-xs text-ink-muted">مدرکی ارسال نشده است.</span>}</div>
        <div className="flex gap-2 mt-3">
          <select className="input h-9 text-xs w-36" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="نوع مدرک">
            <option value="license">جواز کسب</option><option value="national_card">کارت ملی</option><option value="economic">کد اقتصادی</option><option value="other">سایر</option>
          </select>
          <label className="btn-secondary btn-sm h-9 cursor-pointer flex-1">
            <Icon name="upload" className="w-4 h-4" />{busy ? "در حال ارسال…" : "بارگذاری مدرک"}
            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData(); fd.append("file", file); fd.append("kind", kind);
              await run(() => api.post("/auth/me/documents/", fd), rejected ? "مدرک ارسال شد و درخواست دوباره بررسی می‌شود" : "مدرک ارسال شد");
              reload();
            }} />
          </label>
        </div>
      </div>
      <div className="flex gap-2 mt-8">
        <Button variant="secondary" icon="refresh" onClick={reload}>بررسی وضعیت</Button>
        <Button variant="ghost" icon="logout" onClick={() => { signOut(); nav.replace("/login"); }}>خروج</Button>
      </div>
    </AuthFrame>
  );
}
