"use client";
import React, { useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, ConfirmButton, Empty, Field, Img, Input, Loading, Modal, PageHeader, Pagination, Select, Table, Tabs, Textarea, useAction } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { num, toEnDigits } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Product } from "@/lib/types";

const AUD = [{ v: "distributor", l: "نماینده" }, { v: "store", l: "فروشگاه" }, { v: "organization", l: "سازمانی" }, { v: "lab", l: "آزمایشگاه" }];

export default function AdminProducts() {
  const [tab, setTab] = useState<"products" | "categories">("products");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [avail, setAvail] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data: cats, reload: reloadCats } = useApi<any[]>("/categories/");
  const { data, loading, reload } = useApi<Page<Product>>("/products/", { search: q, category: cat, is_available: avail, page, include_inactive: 1 });
  const [edit, setEdit] = useState<any | null>(null);
  const { run } = useAction();
  return (
    <>
      <PageHeader title="مدیریت محصولات" subtitle="موجودی و قیمت پایه هر ۱۵ دقیقه از حسابداری همگام می‌شود؛ تغییر دستی تا همگام‌سازی بعد معتبر است."
        actions={tab === "products" && <Button icon="plus" onClick={() => setEdit({ name: "", sku: "", category: cats?.[0]?.id ?? "", units_per_carton: 12, min_order_cartons: 1, base_price: 0, is_available: true, is_active: true, product_line: "consumer", audiences: [], description: "" })}>محصول جدید</Button>} />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: "products", label: "محصولات" }, { value: "categories", label: "دسته‌ها" }]} /></div>
      {tab === "categories" ? <Categories cats={cats ?? []} reload={reloadCats} /> : (
        <>
          <div className="card p-3 flex flex-wrap gap-2 mb-4">
            <Input aria-label="جست‌وجو" className="w-56 h-9" placeholder="نام یا کد کالا" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            <Select aria-label="دسته" className="w-44 h-9 text-sm" value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }}><option value="">همه‌ی دسته‌ها</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Select aria-label="موجودی" className="w-36 h-9 text-sm" value={avail} onChange={(e) => { setAvail(e.target.value); setPage(1); }}><option value="">همه</option><option value="true">موجود</option><option value="false">ناموجود</option></Select>
          </div>
          <Card pad={false}>
            {loading && !data ? <Loading /> : !data?.results.length ? <Empty icon="box" title="محصولی پیدا نشد" /> : (
              <div className="px-5 pt-2"><Table>
                <thead><tr><th className="th">محصول</th><th className="th">کد کالا</th><th className="th">دسته</th><th className="th">کارتن</th><th className="th">حداقل</th><th className="th">قیمت پایه</th><th className="th">موجودی انبار</th><th className="th">وضعیت</th><th className="th"></th></tr></thead>
                <tbody>{data.results.map((p) => (
                  <tr key={p.id} className="hover:bg-cream-100">
                    <td className="td"><div className="flex items-center gap-3"><Img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg" /><span className="font-medium">{p.name}</span></div></td>
                    <td className="td text-xs" dir="ltr">{p.sku}</td><td className="td text-xs">{p.category_name}</td>
                    <td className="td num">{num(p.units_per_carton)}</td><td className="td num">{num(p.min_order_cartons)}</td>
                    <td className="td num">{num(p.base_price)}</td><td className="td num">{num(p.stock_cartons)}</td>
                    <td className="td"><div className="flex gap-1">{!p.is_active ? <Badge>بایگانی</Badge> : p.is_available ? <Badge color="ok">موجود</Badge> : <Badge color="bad">ناموجود</Badge>}{!!p.audiences?.length && <Badge color="navy">ویژه</Badge>}</div></td>
                    <td className="td text-left whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={async () => { await run(() => api.patch(`/products/${p.id}/`, { is_available: !p.is_available }), p.is_available ? "ناموجود شد" : "موجود شد"); reload(); }}>{p.is_available ? "ناموجود کن" : "موجود کن"}</Button>
                      <Button variant="ghost" size="sm" icon="edit" onClick={() => setEdit({ ...p })}>ویرایش</Button>
                    </td>
                  </tr>
                ))}</tbody>
              </Table></div>
            )}
            <div className="px-5 pb-4">{data && <Pagination page={page} count={data.count} onChange={setPage} />}</div>
          </Card>
        </>
      )}
      <ProductForm p={edit} cats={cats ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
    </>
  );
}

function ProductForm({ p, cats, onClose, onSaved }: { p: any; cats: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>(p);
  const [img, setImg] = useState<File | null>(null);
  const { run, busy } = useAction();
  React.useEffect(() => { setF(p); setImg(null); }, [p]);
  if (!p || !f) return null;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: any = { audiences: f.audiences || [], is_available: !!f.is_available, is_active: !!f.is_active };
    ["name", "sku", "category", "description", "product_line", "kit_type", "accounting_code"].forEach((k) => f[k] != null && (body[k] = f[k]));
    ["units_per_carton", "min_order_cartons", "base_price", "stock_cartons"].forEach((k) => f[k] != null && (body[k] = toEnDigits(String(f[k]))));
    const r = await run(async () => {
      const saved = f.id ? await api.patch(`/products/${f.id}/`, body) : await api.post("/products/", body);
      if (img) {
        const fd = new FormData();
        fd.append("image", img);
        await api.patch(`/products/${saved.id}/`, fd);
      }
      return saved;
    }, "محصول ذخیره شد");
    if (r) onSaved();
  };
  return (
    <Modal open onClose={onClose} title={f.id ? "ویرایش محصول" : "محصول جدید"} wide>
      <form onSubmit={save} className="grid md:grid-cols-[200px_1fr] gap-6">
        <div>
          <Img src={img ? URL.createObjectURL(img) : f.image} alt="" className="w-full aspect-square rounded-xl" />
          <label className="btn-secondary btn-sm w-full mt-2 cursor-pointer"><Icon name="upload" className="w-4 h-4" />تصویر محصول<input type="file" accept="image/*" className="hidden" onChange={(e) => setImg(e.target.files?.[0] || null)} /></label>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="نام محصول" className="sm:col-span-2"><Input id="pf_name" required value={f.name} onChange={set("name")} /></Field>
          <Field label="کد کالا"><Input id="pf_sku" required dir="ltr" value={f.sku} onChange={set("sku")} /></Field>
          <Field label="دسته"><Select id="pf_cat" value={f.category} onChange={set("category")}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="تعداد در کارتن"><Input id="pf_upc" type="number" min={1} value={f.units_per_carton} onChange={set("units_per_carton")} /></Field>
          <Field label="حداقل سفارش (کارتن)"><Input id="pf_min" type="number" min={1} value={f.min_order_cartons} onChange={set("min_order_cartons")} /></Field>
          <Field label="قیمت پایه‌ی کارتن (ریال)"><Input id="pf_price" dir="ltr" value={f.base_price} onChange={set("base_price")} /></Field>
          <Field label="خط محصول"><Select id="pf_line" value={f.product_line} onChange={set("product_line")}><option value="consumer">محصولات مصرفی</option><option value="lab">کیت آزمایشگاهی</option></Select></Field>
          <Field label="فقط برای این مشتری‌ها (خالی = همه)" className="sm:col-span-2">
            <div className="flex gap-3 flex-wrap">{AUD.map((a) => (
              <label key={a.v} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={(f.audiences || []).includes(a.v)} onChange={(e) => setF({ ...f, audiences: e.target.checked ? [...(f.audiences || []), a.v] : f.audiences.filter((x: string) => x !== a.v) })} />{a.l}</label>
            ))}</div>
          </Field>
          <Field label="توضیحات" className="sm:col-span-2"><Textarea id="pf_desc" value={f.description} onChange={set("description")} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.is_available} onChange={set("is_available")} />موجود</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.is_active} onChange={set("is_active")} />نمایش در کاتالوگ</label>
          <div className="sm:col-span-2 flex gap-2"><Button loading={busy}>ذخیره</Button><Button type="button" variant="ghost" onClick={onClose}>انصراف</Button></div>
        </div>
      </form>
    </Modal>
  );
}

function Categories({ cats, reload }: { cats: any[]; reload: () => void }) {
  const [f, setF] = useState({ name: "", slug: "", product_line: "consumer" });
  const { run, busy } = useAction();
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
      <Card pad={false}><div className="px-5 pt-2"><Table>
        <thead><tr><th className="th">نام دسته</th><th className="th">شناسه</th><th className="th">خط</th><th className="th">تعداد محصول</th><th className="th"></th></tr></thead>
        <tbody>{cats.map((c) => (
          <tr key={c.id}><td className="td">{c.name}</td><td className="td text-xs" dir="ltr">{c.slug}</td><td className="td">{c.product_line === "lab" ? "آزمایشگاهی" : "مصرفی"}</td><td className="td num">{num(c.products_count)}</td>
            <td className="td text-left"><ConfirmButton variant="ghost" size="sm" icon="trash" confirmText="حذف شود؟" onConfirm={async () => { await run(() => api.del(`/categories/${c.id}/`), "دسته حذف شد"); reload(); }}>حذف</ConfirmButton></td></tr>
        ))}</tbody>
      </Table></div></Card>
      <Card title="دسته‌ی جدید">
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/categories/", f), "دسته ساخته شد")) { setF({ name: "", slug: "", product_line: "consumer" }); reload(); } }}>
          <Field label="نام"><Input id="ct_name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="شناسه‌ی انگلیسی"><Input id="ct_slug" required dir="ltr" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></Field>
          <Field label="خط محصول"><Select id="ct_line" value={f.product_line} onChange={(e) => setF({ ...f, product_line: e.target.value })}><option value="consumer">مصرفی</option><option value="lab">آزمایشگاهی</option></Select></Field>
          <Button loading={busy} className="w-full">افزودن</Button>
        </form>
      </Card>
    </div>
  );
}
