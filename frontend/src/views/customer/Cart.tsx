"use client";
import React, { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Card, Empty, Field, Img, KV, Loading, Money, PageHeader, Progress, Qty, Textarea, useToast } from "@/components/ui";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { fa, num } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { Link, useNav } from "@/lib/nav";

export default function Cart() {
  const { cart, setQty, reload } = useCart();
  const nav = useNav();
  const toast = useToast();
  const { data: tiers } = useApi<any[]>("/volume-discounts/");
  const [address, setAddress] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [idem] = useState(newIdempotencyKey);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (cart && address === null) setAddress(cart.default_address); }, [cart, address]);
  if (!cart) return <Loading />;
  if (!cart.items.length)
    return (<><PageHeader title="سبد خرید" /><div className="card"><Empty icon="cart" title="سبد خرید خالی است" text="از کاتالوگ محصولات را به تعداد کارتن اضافه کنید یا سفارش قبلی را تکرار کنید."
      action={<div className="flex gap-2"><Link to="/catalog" className="btn-primary">رفتن به کاتالوگ</Link><Link to="/orders" className="btn-secondary">سفارش‌های قبلی</Link></div>} /></div></>);

  const next = (tiers ?? []).filter((t) => t.min_cartons > cart.total_cartons).sort((a, b) => a.min_cartons - b.min_cartons)[0];
  const change = async (p: number, n: number) => { try { await setQty(p, n); } catch (e) { toast((e as ApiError).message, "bad"); } };
  const submit = async () => {
    setBusy(true);
    try {
      const order = await api.post("/checkout/", { delivery_address: address, customer_note: note }, { "Idempotency-Key": idem });
      toast(`سفارش ${fa(order.number)} ثبت شد`);
      await reload();
      nav.replace("/orders/detail", { id: String(order.id), new: "1" });
    } catch (e) { toast((e as ApiError).message, "bad"); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="سبد خرید و تکمیل سفارش" subtitle={`${num(cart.items.length)} قلم · ${num(cart.total_cartons)} کارتن`}
        actions={<Button variant="ghost" icon="trash" onClick={async () => { await api.del("/cart/"); reload(); }}>خالی کردن سبد</Button>} />
      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          {cart.errors.length > 0 && (
            <div className="rounded-2xl bg-bad-soft text-bad p-4 text-sm space-y-1">{cart.errors.map((e) => <div key={e} className="flex gap-2"><Icon name="alert" className="w-4 h-4 mt-0.5 shrink-0" />{e}</div>)}</div>
          )}
          <Card pad={false}>
            <ul>
              {cart.items.map((i) => (
                <li key={i.product} className="flex gap-4 p-4 border-b border-cream-200 last:border-0 flex-wrap sm:flex-nowrap">
                  <Img src={i.image} alt={i.name} className="w-20 h-20 rounded-xl shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{i.name}</div>
                    <div className="text-xs text-ink-muted mt-0.5"><span dir="ltr">{i.sku}</span> · کارتن {num(i.units_per_carton)} عددی · حداقل {num(i.min_order_cartons)}</div>
                    <div className="text-xs text-ink-muted mt-1 num">هر کارتن {num(i.unit_price)} ریال</div>
                  </div>
                  <div className="flex sm:flex-col items-end gap-2 justify-between w-full sm:w-auto">
                    <Qty value={i.cartons} min={0} onChange={(v) => change(i.product, v)} />
                    <div className="font-bold text-navy-700"><Money v={i.line_total} /></div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          {next && (
            <div className="card p-4">
              <div className="flex justify-between text-sm mb-2"><span>با <b className="num">{num(next.min_cartons - cart.total_cartons)}</b> کارتن دیگر، <b className="num">{num(next.percent)}٪</b> تخفیف می‌گیرید.</span></div>
              <Progress value={(cart.total_cartons / next.min_cartons) * 100} color="bg-gold" />
            </div>
          )}
          <Card title="تحویل و توضیحات">
            <div className="space-y-4">
              <Field label="آدرس تحویل"><Textarea id="address" value={address ?? ""} onChange={(e) => setAddress(e.target.value)} /></Field>
              <Field label="توضیحات سفارش (اختیاری)"><Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً ساعت تحویل، نیاز به بارنامه‌ی جدا، …" /></Field>
            </div>
          </Card>
        </div>
        <div className="lg:sticky lg:top-24 space-y-4">
          <Card title="خلاصه‌ی سفارش">
            <KV k="جمع کالاها" v={<Money v={cart.subtotal} />} />
            <KV k={`تخفیف حجمی ${num(cart.discount_percent)}٪`} v={<span className="text-ok"><Money v={cart.discount_amount} /></span>} />
            <div className="flex justify-between items-center pt-3 mt-1 border-t border-cream-300">
              <span className="font-semibold">مبلغ قابل پرداخت</span>
              <span className="text-xl font-bold text-navy-700"><Money v={cart.total} /></span>
            </div>
            {cart.credit.credit_limit > 0 && (
              <div className={`mt-4 rounded-xl p-3 text-xs ${cart.credit_ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
                اعتبار باقی‌مانده: <b className="num">{num(Math.max(0, cart.credit.available_credit))}</b> ریال
                {!cart.credit_ok && <div className="mt-1">مبلغ سفارش از اعتبار شما بیشتر است. ابتدا بخشی از بدهی را <Link to="/finance/pay" className="underline font-medium">پرداخت</Link> کنید.</div>}
              </div>
            )}
            <Button className="w-full mt-4 h-12" loading={busy} disabled={!!cart.errors.length || !cart.credit_ok} onClick={submit} icon="check">ثبت نهایی سفارش</Button>
            <p className="text-[11px] text-ink-muted mt-2 text-center">پس از ثبت، پیش‌فاکتور PDF در صفحه‌ی سفارش آماده است.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
