"use client";
import React, { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Field, Input, Tabs, useToast } from "@/components/ui";
import { api, ApiError, isDemo } from "@/lib/api";
import { homeFor, useAuth } from "@/lib/auth";
import { fa, toEnDigits } from "@/lib/format";
import { Link, useNav } from "@/lib/nav";

export function AuthFrame({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="hidden lg:flex flex-col justify-between bg-navy-600 text-cream-100 p-12 relative overflow-hidden">
        <div className="absolute -left-24 -bottom-24 w-[420px] h-[420px] rounded-full border-[48px] border-navy-500/40" />
        <div className="absolute left-40 top-24 w-40 h-40 rounded-full bg-gold/20" />
        <div className="flex items-center gap-3 relative">
          <div className="w-12 h-12 rounded-2xl bg-cream text-navy-700 grid place-items-center font-black text-2xl">مَن</div>
          <div><div className="font-bold text-lg">پرتال فروش عمده‌ی مَن</div><div className="text-sm text-navy-100">ویژه‌ی نمایندگان، فروشگاه‌ها، سازمان‌ها و آزمایشگاه‌ها</div></div>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-relaxed">سفارش کارتنی با قیمت اختصاصی شما، بدون تماس و پیگیری تلفنی.</h2>
          <ul className="mt-8 space-y-3 text-navy-100 text-sm">
            {["قیمت و تخفیف پلکانی مخصوص گروه شما", "پیگیری لحظه‌ای سفارش تا تحویل، با پیامک", "حساب مالی، چک‌ها و فاکتورها در یک جا", "کیت بازاریابی و آموزش محصولات جدید"].map((t) => (
              <li key={t} className="flex gap-2 items-center"><Icon name="check" className="w-4 h-4 text-gold" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="text-xs text-navy-200 relative">پشتیبانی: ۰۲۱-۹۱۰۰۰۰۰۰ · شنبه تا پنجشنبه ۸ تا ۱۷</div>
      </div>
      <div className="flex items-center justify-center p-5 sm:p-10">
        <div className={wide ? "w-full max-w-xl" : "w-full max-w-sm"}>
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-xl bg-navy-600 text-cream-50 grid place-items-center font-black text-lg">مَن</div>
            <div className="font-bold text-navy-700">پرتال فروش عمده‌ی مَن</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

const DEMO_USERS = [
  { phone: "09121111111", label: "نماینده (پخش البرز شیراز)" },
  { phone: "09122222222", label: "فروشگاه (سوپرمارکت ستاره)" },
  { phone: "09123333333", label: "سازمانی (هتل پارسیان)" },
  { phone: "09124444444", label: "آزمایشگاه پاستور" },
  { phone: "09125555555", label: "زیرکاربر حسابدار شیراز" },
  { phone: "09126666666", label: "متقاضی در انتظار تأیید" },
];
const DEMO_STAFF = [
  { u: "admin", p: "admin1234", label: "ادمین کل" },
  { u: "manager", p: "demo1234", label: "مدیر فروش" },
  { u: "rep.south", p: "demo1234", label: "کارشناس فروش جنوب" },
];

export default function Login() {
  const nav = useNav();
  const { signIn, user } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<"otp" | "staff">("otp");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [timer, setTimer] = useState(0);
  const [hint, setHint] = useState<string>();

  useEffect(() => { if (user) nav.replace(homeFor(user)); }, [user]); // eslint-disable-line
  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const requestCode = async (p = phone) => {
    setBusy(true); setErr(undefined);
    try {
      const r = await api.post("/auth/otp/request/", { phone: toEnDigits(p) });
      setPhone(r.phone); setStep("code"); setTimer(r.ttl);
      setHint(r.debug_code ? `کد آزمایشی: ${fa(r.debug_code)}` : undefined);
      if (r.debug_code && isDemo()) setCode(r.debug_code);
    } catch (e) { setErr((e as ApiError).field("phone") || (e as ApiError).message); }
    finally { setBusy(false); }
  };
  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setErr(undefined);
    try {
      const r = await api.post("/auth/otp/verify/", { phone, code: toEnDigits(code) });
      if (!r.registered) {
        try { sessionStorage.setItem("man.reg", JSON.stringify({ token: r.registration_token, phone })); } catch { /* */ }
        (globalThis as any).__MAN_REG__ = { token: r.registration_token, phone };
        nav.push("/register");
        return;
      }
      const u = await signIn(r.access, r.refresh, r.user);
      toast(`خوش آمدید ${u?.first_name ?? ""}`);
      nav.replace(homeFor(u!));
    } catch (e) { setErr((e as ApiError).field("code") || (e as ApiError).message); }
    finally { setBusy(false); }
  };
  const staffLogin = async (e?: React.FormEvent, u = username, p = password) => {
    e?.preventDefault();
    setBusy(true); setErr(undefined);
    try {
      const r = await api.post("/auth/login/", { username: u, password: p });
      const usr = await signIn(r.access, r.refresh, r.user);
      nav.replace(homeFor(usr!));
    } catch (e) { setErr((e as ApiError).field("password") || (e as ApiError).message); }
    finally { setBusy(false); }
  };

  return (
    <AuthFrame>
      <h1 className="text-2xl font-bold text-navy-700">ورود به پرتال</h1>
      <p className="text-sm text-ink-muted mt-1 mb-6">مشتری‌ها با شماره موبایل و کارکنان شرکت با نام کاربری وارد می‌شوند.</p>
      <Tabs value={mode} onChange={(v) => { setMode(v); setErr(undefined); }} items={[{ value: "otp", label: "مشتری (کد پیامکی)" }, { value: "staff", label: "کارکنان شرکت" }]} />
      <div className="mt-6">
        {mode === "otp" && step === "phone" && (
          <form onSubmit={(e) => { e.preventDefault(); requestCode(); }} className="space-y-4">
            <Field label="شماره موبایل" error={err}>
              <Input id="phone" inputMode="tel" dir="ltr" className="text-left tracking-wider" placeholder="09xx xxx xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
            </Field>
            <Button className="w-full" loading={busy} disabled={phone.length < 10}>دریافت کد تأیید</Button>
            <p className="text-xs text-ink-muted text-center">اگر حساب ندارید، با همین شماره ثبت‌نام می‌کنید.</p>
          </form>
        )}
        {mode === "otp" && step === "code" && (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-ink-soft">کد ۶ رقمی ارسال‌شده به <span dir="ltr" className="num font-medium">{fa(phone)}</span> را وارد کنید.
              <button type="button" className="text-navy-500 mr-2 text-xs" onClick={() => { setStep("phone"); setCode(""); }}>تغییر شماره</button></p>
            <Field label="کد تأیید" error={err} hint={hint}>
              <Input id="code" inputMode="numeric" dir="ltr" className="text-center tracking-[0.5em] text-lg" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="one-time-code" />
            </Field>
            <Button className="w-full" loading={busy} disabled={code.length < 6}>ورود</Button>
            <div className="text-center text-xs text-ink-muted">
              {timer > 0 ? <>ارسال دوباره تا {fa(timer)} ثانیه</> : <button type="button" className="text-navy-500" onClick={() => requestCode()}>ارسال دوباره‌ی کد</button>}
            </div>
          </form>
        )}
        {mode === "staff" && (
          <form onSubmit={staffLogin} className="space-y-4">
            <Field label="نام کاربری"><Input id="username" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></Field>
            <Field label="رمز عبور" error={err}><Input id="password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Button className="w-full" loading={busy}>ورود</Button>
          </form>
        )}
      </div>
      {isDemo() && (
        <div className="mt-8 rounded-2xl border border-dashed border-gold bg-gold-soft/50 p-4">
          <div className="text-xs font-semibold text-gold mb-2">ورود سریع نسخه‌ی دمو</div>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_USERS.map((d) => (
              <button key={d.phone} className="chip bg-cream-50 border border-cream-400 text-ink-soft hover:border-navy-300" onClick={() => { setMode("otp"); setPhone(d.phone); requestCode(d.phone); }}>{d.label}</button>
            ))}
            {DEMO_STAFF.map((d) => (
              <button key={d.u} className="chip bg-navy-50 border border-navy-100 text-navy-600 hover:border-navy-300" onClick={() => staffLogin(undefined, d.u, d.p)}>{d.label}</button>
            ))}
          </div>
          <p className="text-[11px] text-ink-muted mt-2">برای ثبت‌نام تازه هر شماره‌ی دیگری وارد کنید؛ کد پیامکی خودکار پر می‌شود.</p>
        </div>
      )}
      <div className="mt-6 text-center text-xs text-ink-muted">
        می‌خواهید نماینده‌ی مَن شوید؟ <Link to="/agency" className="text-navy-500 font-medium">فرم درخواست نمایندگی</Link>
      </div>
    </AuthFrame>
  );
}
