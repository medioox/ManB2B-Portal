"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { fa, num, rial } from "@/lib/format";
import { Icon } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ---------- toast ---------- */
type Toast = { id: number; text: string; kind: "ok" | "bad" | "info" };
const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx("pointer-events-auto rounded-xl px-4 py-3 text-sm shadow-lg max-w-md flex items-center gap-2",
            t.kind === "ok" && "bg-navy-700 text-cream-50", t.kind === "bad" && "bg-bad text-white", t.kind === "info" && "bg-cream-50 text-ink border border-cream-400")}>
            <Icon name={t.kind === "bad" ? "alert" : "check"} className="w-4 h-4 shrink-0" />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Wrap an async action: shows errors as toast, success text optional. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okText?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (okText) toast(okText);
      return r;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "خطای غیرمنتظره", "bad");
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { busy, run };
}

/* ---------- primitives ---------- */
export function Button({ variant = "primary", size, loading, icon, children, className, ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm"; loading?: boolean; icon?: string }) {
  return (
    <button {...p} disabled={p.disabled || loading} className={cx(`btn-${variant}`, size === "sm" && "btn-sm", className)}>
      {loading ? <Spinner className="w-4 h-4" /> : icon ? <Icon name={icon} className="w-4 h-4" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-label="در حال بارگذاری">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ text = "در حال بارگذاری…" }: { text?: string }) {
  return <div className="flex items-center justify-center gap-3 py-16 text-ink-muted"><Spinner />{text}</div>;
}

export function ErrorBox({ error, onRetry }: { error: ApiError | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="card p-6 flex flex-col items-center gap-3 text-center">
      <Icon name="alert" className="w-8 h-8 text-bad" />
      <p className="text-sm text-ink-soft">{error.message}</p>
      {onRetry && <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>تلاش دوباره</Button>}
    </div>
  );
}

export function Empty({ icon = "box", title, text, action }: { icon?: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-14 px-6">
      <div className="w-14 h-14 rounded-2xl bg-cream-200 text-navy-500 grid place-items-center mb-1"><Icon name={icon} className="w-7 h-7" /></div>
      <h3 className="font-semibold text-ink">{title}</h3>
      {text && <p className="text-sm text-ink-muted max-w-sm">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }:
  { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("card min-w-0", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 flex-wrap">
          {title && <h2 className="font-semibold text-navy-700 text-[15px]">{title}</h2>}
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </header>
      )}
      <div className={cx(pad && "px-5 pb-5", !title && !actions && pad && "pt-5")}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
      <div className="min-w-0">
        {back}
        <h1 className="text-xl md:text-2xl font-bold text-navy-700">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {error ? <p className="text-xs text-bad mt-1">{error}</p> : hint ? <p className="text-xs text-ink-muted mt-1">{hint}</p> : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...p }, ref) { return <input ref={ref} {...p} className={cx("input", className)} />; });

export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx("input pr-3 pl-8", className)}>{children}</select>;
}

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...p} className={cx("input", className)} />;
}

const tone: Record<string, string> = {
  navy: "bg-navy-50 text-navy-600", ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad",
  gold: "bg-gold-soft text-gold", gray: "bg-cream-200 text-ink-soft",
};
export function Badge({ children, color = "gray", className }: { children: React.ReactNode; color?: keyof typeof tone | string; className?: string }) {
  return <span className={cx("chip", tone[color] || tone.gray, className)}>{children}</span>;
}

const STATUS_COLOR: Record<string, string> = {
  submitted: "gold", confirmed: "navy", preparing: "warn", shipped: "navy", delivered: "ok", canceled: "bad",
  pending: "warn", approved: "ok", rejected: "bad", suspended: "gray", cleared: "ok", bounced: "bad", paid: "ok",
  failed: "bad", initiated: "warn", open: "gold", answered: "ok", waiting: "warn", closed: "gray", reviewing: "navy",
  resolved: "ok", new: "gold", accepted: "ok",
};
export function StatusChip({ status, label }: { status: string; label: string }) {
  return <Badge color={STATUS_COLOR[status] || "gray"}><span className="w-1.5 h-1.5 rounded-full bg-current" />{label}</Badge>;
}

export function Money({ v, className }: { v: number | string | null | undefined; className?: string }) {
  return <span className={cx("num", className)}>{num(v)}<span className="text-[0.75em] text-ink-muted mr-1">ریال</span></span>;
}

export function Modal({ open, onClose, title, children, wide, footer }:
  { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy-900/40" onClick={onClose} />
      <div className={cx("relative bg-cream-50 w-full rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-cream-300">
          <h3 className="font-semibold text-navy-700">{title}</h3>
          <button onClick={onClose} className="btn-ghost btn-sm" aria-label="بستن"><Icon name="x" className="w-4 h-4" /></button>
        </header>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-cream-300 flex gap-2 justify-end flex-wrap">{footer}</footer>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" role="tablist">
      {items.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx("h-9 px-3.5 rounded-xl text-sm whitespace-nowrap transition-colors flex items-center gap-1.5",
            value === t.value ? "bg-navy-600 text-cream-50" : "text-ink-soft hover:bg-cream-200")}>
          {t.label}
          {t.count !== undefined && <span className={cx("num text-xs rounded-full px-1.5", value === t.value ? "bg-navy-500" : "bg-cream-300")}>{num(t.count)}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, count, pageSize = 20, onChange }: { page: number; count: number; pageSize?: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-4 text-sm text-ink-muted">
      <span>{num(count)} مورد · صفحه {num(page)} از {num(pages)}</span>
      <div className="flex gap-1">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} icon="right">قبلی</Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>بعدی<Icon name="left" className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone: t = "navy" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: string; tone?: string }) {
  return (
    <div className="card p-4 flex items-start gap-3 min-w-0">
      {icon && <div className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", tone[t])}><Icon name={icon} /></div>}
      <div className="min-w-0">
        <div className="text-xs text-ink-muted">{label}</div>
        <div className="text-lg font-bold text-ink num mt-0.5 truncate">{value}</div>
        {hint && <div className="text-xs text-ink-muted mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

export function Progress({ value, className, color = "bg-navy-500" }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cx("h-2.5 rounded-full bg-cream-300 overflow-hidden", className)} role="progressbar" aria-valuenow={Math.round(value)}>
      <div className={cx("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto -mx-5 px-5"><table className="w-full min-w-[640px]">{children}</table></div>;
}

export function ConfirmButton({ children, confirmText = "مطمئن هستید؟", onConfirm, ...p }:
  Omit<React.ComponentProps<typeof Button>, "onClick"> & { confirmText?: string; onConfirm: () => void }) {
  const [ask, setAsk] = useState(false);
  if (ask)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        {confirmText}
        <Button size="sm" variant="danger" onClick={() => { setAsk(false); onConfirm(); }}>بله</Button>
        <Button size="sm" variant="secondary" onClick={() => setAsk(false)}>خیر</Button>
      </span>
    );
  return <Button {...p} onClick={() => setAsk(true)}>{children}</Button>;
}

export function Qty({ value, onChange, min = 0, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-cream-400 bg-white h-10 overflow-hidden">
      <button type="button" className="w-9 h-full grid place-items-center text-navy-600 hover:bg-cream-200" onClick={() => onChange(value + step)} aria-label="افزایش"><Icon name="plus" className="w-4 h-4" /></button>
      <input value={fa(value)} inputMode="numeric" aria-label="تعداد کارتن"
        onChange={(e) => { const n = parseInt(e.target.value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "") || "0"); onChange(n); }}
        className="w-12 text-center text-sm num outline-none bg-transparent" />
      <button type="button" className="w-9 h-full grid place-items-center text-navy-600 hover:bg-cream-200 disabled:opacity-30" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label="کاهش"><Icon name="minus" className="w-4 h-4" /></button>
    </div>
  );
}

export function Img({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  if (!src) return <div className={cx("bg-cream-200 grid place-items-center text-cream-500", className)}><Icon name="image" className="w-1/3 h-1/3" /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={cx("object-cover bg-cream-200", className)} />;
}

export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-cream-200 last:border-0 text-sm">
      <span className="text-ink-muted shrink-0">{k}</span>
      <span className="text-ink text-left min-w-0 break-words">{v}</span>
    </div>
  );
}

export { rial };
