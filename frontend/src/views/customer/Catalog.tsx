"use client";
import React, { useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Empty, ErrorBox, Img, Input, Loading, Modal, Money, PageHeader, Pagination, Qty, cx, useToast } from "@/components/ui";
import { ApiError, Page } from "@/lib/api";
import { canOrder, useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { num } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { Link } from "@/lib/nav";
import type { Product } from "@/lib/types";

export function AddToCart({ p, compact }: { p: Product; compact?: boolean }) {
  const { qtyOf, setQty } = useCart();
  const toast = useToast();
  const inCart = qtyOf(p.id);
  const [q, setQ] = useState(inCart || p.min_order_cartons);
  const [busy, setBusy] = useState(false);
  if (!p.is_available) return <Badge color="bad">ناموجود</Badge>;
  const save = async (n: number) => {
    setBusy(true);
    try {
      await setQty(p.id, n);
      toast(n ? `${num(n)} کارتن «${p.name}» در سبد` : "از سبد حذف شد");
    } catch (e) { toast((e as ApiError).message, "bad"); } finally { setBusy(false); }
  };
  return (
    <div className={cx("flex items-center gap-2", compact && "flex-wrap")}>
      <Qty value={q} min={0} onChange={(v) => setQ(v)} />
      <Button size={compact ? "sm" : undefined} className={compact ? "h-10" : ""} loading={busy} icon={inCart ? "check" : "cart"}
        variant={inCart && inCart === q ? "secondary" : "primary"} onClick={() => save(q)}>
        {inCart ? (inCart === q ? "در سبد" : "به‌روزرسانی") : "افزودن"}
      </Button>
    </div>
  );
}

export function ProductCard({ p, onOpen }: { p: Product; onOpen: () => void }) {
  const { user } = useAuth();
  return (
    <article className="card overflow-hidden flex flex-col">
      <button onClick={onOpen} className="block relative">
        <Img src={p.image} alt={p.name} className="w-full aspect-square" />
        {!p.is_available && <span className="absolute inset-0 bg-cream-50/70 grid place-items-center"><Badge color="bad">ناموجود</Badge></span>}
      </button>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="text-[11px] text-ink-muted">{p.category_name} · <span dir="ltr">{p.sku}</span></div>
        <button onClick={onOpen} className="text-right font-semibold text-sm leading-6 text-ink hover:text-navy-500">{p.name}</button>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <Badge>کارتن {num(p.units_per_carton)} عددی</Badge>
          <Badge>حداقل {num(p.min_order_cartons)} کارتن</Badge>
        </div>
        <div className="mt-auto pt-2">
          <div className="text-base font-bold text-navy-700"><Money v={p.carton_price} /> <span className="text-xs font-normal text-ink-muted">/ کارتن</span></div>
          <div className="text-[11px] text-ink-muted num">هر عدد {num(p.unit_price)} ریال</div>
        </div>
        {canOrder(user) && <div className="pt-2"><AddToCart p={p} compact /></div>}
      </div>
    </article>
  );
}

export function ProductModal({ p, onClose }: { p: Product | null; onClose: () => void }) {
  const { user } = useAuth();
  if (!p) return null;
  return (
    <Modal open={!!p} onClose={onClose} title={p.name} wide>
      <div className="grid md:grid-cols-2 gap-6">
        <Img src={p.image} alt={p.name} className="w-full aspect-square rounded-2xl" />
        <div className="flex flex-col gap-4">
          <div className="text-xs text-ink-muted">{p.category_name} · کد کالا <span dir="ltr" className="font-medium">{p.sku}</span></div>
          <p className="text-sm leading-7 text-ink-soft">{p.description}</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-cream-200 p-3"><div className="text-[11px] text-ink-muted">تعداد در کارتن</div><div className="font-bold num">{num(p.units_per_carton)} عدد</div></div>
            <div className="rounded-xl bg-cream-200 p-3"><div className="text-[11px] text-ink-muted">حداقل سفارش</div><div className="font-bold num">{num(p.min_order_cartons)} کارتن</div></div>
          </div>
          <div className="rounded-2xl border border-navy-100 bg-navy-50 p-4">
            <div className="text-xs text-navy-500">قیمت اختصاصی شما</div>
            <div className="text-2xl font-bold text-navy-700 mt-1"><Money v={p.carton_price} /></div>
            <div className="text-xs text-ink-muted num">هر کارتن · معادل {num(p.unit_price)} ریال برای هر عدد</div>
          </div>
          {(p.tech_doc || p.brochure) && (
            <div className="flex gap-2 flex-wrap">
              {p.tech_doc && <a className="btn-secondary btn-sm" href={p.tech_doc} target="_blank" rel="noreferrer"><Icon name="file" className="w-4 h-4" />مستندات فنی</a>}
              {p.brochure && <a className="btn-secondary btn-sm" href={p.brochure} target="_blank" rel="noreferrer"><Icon name="image" className="w-4 h-4" />بروشور</a>}
            </div>
          )}
          {canOrder(user) && <AddToCart p={p} />}
        </div>
      </div>
    </Modal>
  );
}

export default function Catalog({ line }: { line?: "lab" }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<number | "">("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Product | null>(null);
  const q = useDebounced(search);
  const { data: cats } = useApi<any[]>("/categories/");
  const { data, error, loading, reload } = useApi<Page<Product>>("/products/", { search: q, category: cat, page, page_size: 24, product_line: line });
  const { data: tiers } = useApi<any[]>("/volume-discounts/");
  const visibleCats = (cats ?? []).filter((c) => c.products_count > 0);
  return (
    <>
      <PageHeader title={line === "lab" ? "کیت‌های آزمایشگاهی" : "کاتالوگ محصولات"} subtitle="قیمت‌ها بر اساس گروه قیمت حساب شما و برای هر کارتن است."
        actions={<Link to="/cart" className="btn-secondary"><Icon name="cart" className="w-4 h-4" />سبد خرید</Link>} />
      {!!tiers?.length && (
        <div className="mb-5 rounded-2xl bg-navy-600 text-cream-50 px-5 py-3 flex items-center gap-3 flex-wrap text-sm">
          <Icon name="tag" className="w-5 h-5 text-gold" />
          <span className="font-medium">تخفیف پلکانی حجمی:</span>
          {tiers.map((t) => <span key={t.id} className="chip bg-navy-500 text-cream-50 num">بالای {num(t.min_cartons)} کارتن، {num(t.percent)}٪</span>)}
        </div>
      )}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="relative md:w-80">
          <Icon name="search" className="w-4 h-4 absolute right-3 top-3 text-ink-muted" />
          <Input id="search" className="pr-9" placeholder="جست‌وجوی نام یا کد کالا" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => { setCat(""); setPage(1); }} className={cx("chip h-10 px-4 text-sm", cat === "" ? "bg-navy-600 text-cream-50" : "bg-cream-50 border border-cream-400 text-ink-soft")}>همه</button>
          {visibleCats.map((c) => (
            <button key={c.id} onClick={() => { setCat(c.id); setPage(1); }} className={cx("chip h-10 px-4 text-sm", cat === c.id ? "bg-navy-600 text-cream-50" : "bg-cream-50 border border-cream-400 text-ink-soft")}>
              {c.name} <span className="num opacity-60">{num(c.products_count)}</span>
            </button>
          ))}
        </div>
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.results.length ? (
        <div className="card"><Empty icon="search" title="محصولی پیدا نشد" text="عبارت جست‌وجو یا دسته را تغییر دهید." /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.results.map((p) => <ProductCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}
          </div>
          <Pagination page={page} count={data.count} pageSize={24} onChange={setPage} />
        </>
      )}
      <ProductModal p={open} onClose={() => setOpen(null)} />
    </>
  );
}
