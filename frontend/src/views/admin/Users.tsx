"use client";
import React, { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, ConfirmButton, Empty, Field, Input, Loading, Modal, PageHeader, Pagination, Select, StatusChip, Table, Tabs, Textarea, cx, useAction } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { ago, fa, num, toEnDigits } from "@/lib/format";
import { useProvinces } from "@/lib/geo";
import { useApi, useDebounced } from "@/lib/hooks";
import { Link } from "@/lib/nav";

type Position = { id: number; name: string; description: string; permissions: string[]; scope: "all" | "region"; scope_display: string; base_role: string; is_system: boolean; users_count: number };
type Section = { key: string; label: string };

const CUSTOMER_TYPES = [
  { v: "distributor", l: "نماینده / پخش‌کننده", icon: "truck" }, { v: "store", l: "فروشگاه", icon: "store" },
  { v: "organization", l: "مشتری سازمانی", icon: "building" }, { v: "lab", l: "آزمایشگاه", icon: "flask" },
];

/** Groups the section checklist so the matrix reads like the panel's own menu. */
const SECTION_GROUPS: { title: string; keys: string[] }[] = [
  { title: "گزارش", keys: ["dashboard"] },
  { title: "فروش", keys: ["customers", "customers_manage", "orders", "orders_manage", "targets", "network"] },
  { title: "مالی", keys: ["finance", "finance_manage", "integrations"] },
  { title: "کالا و محتوا", keys: ["products", "pricing", "marketing", "training", "announcements"] },
  { title: "پشتیبانی و سیستم", keys: ["support", "users"] },
];

export default function Users() {
  const [tab, setTab] = useState<"users" | "positions">("users");
  const { data: positions, reload: reloadPositions } = useApi<Position[]>("/positions/");
  const { data: sections } = useApi<Section[]>("/positions/sections/");
  return (
    <>
      <PageHeader title="کاربران و سمت‌ها"
        subtitle="برای هر سمت مشخص کنید چه بخش‌هایی از پنل را ببیند؛ هر کاربر با سمتی که می‌گیرد، پنل مخصوص همان کار را دارد." />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: "users", label: "کاربران" }, { value: "positions", label: "سمت‌ها", count: positions?.length }]} /></div>
      {tab === "users"
        ? <UsersTab positions={positions ?? []} />
        : <PositionsTab positions={positions} sections={sections ?? []} reload={reloadPositions} />}
    </>
  );
}

/* ================================================================= users */
function UsersTab({ positions }: { positions: Position[] }) {
  const [kind, setKind] = useState<"staff" | "customer">("staff");
  const [position, setPosition] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, loading, reload } = useApi<Page<any>>("/users/", { kind, position, search: q, page });
  const { data: provinces } = useProvinces();
  const [edit, setEdit] = useState<any>(null);
  return (
    <>
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <Tabs value={kind} onChange={(v) => { setKind(v); setPage(1); setPosition(""); }} items={[{ value: "staff", label: "کارکنان شرکت" }, { value: "customer", label: "حساب‌های مشتری" }]} />
        {kind === "staff" && (
          <Select aria-label="سمت" className="w-44 h-9 text-sm" value={position} onChange={(e) => { setPosition(e.target.value); setPage(1); }}>
            <option value="">همه‌ی سمت‌ها</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        <Input aria-label="جست‌وجو" className="w-56 h-9" placeholder="نام، موبایل، نام کاربری" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Button className="mr-auto" icon="plus" onClick={() => setEdit({ mode: "new" })}>کاربر جدید</Button>
      </div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : !data?.results.length ? <Empty icon="users" title="کاربری پیدا نشد" /> : (
          <div className="px-5 pt-2"><Table>
            <thead><tr><th className="th">نام</th><th className="th">{kind === "staff" ? "سمت" : "نوع / کسب‌وکار"}</th><th className="th">ورود با</th>
              {kind === "staff" && <th className="th">محدوده</th>}<th className="th">آخرین ورود</th><th className="th">وضعیت</th><th className="th"></th></tr></thead>
            <tbody>{data.results.map((u) => {
              const pos = positions.find((p) => p.id === u.position);
              return (
                <tr key={u.id} className="hover:bg-cream-100">
                  <td className="td"><div className="font-medium">{u.first_name} {u.last_name}</div>{u.job_title && <div className="text-xs text-ink-muted">{u.job_title}</div>}</td>
                  <td className="td">{kind === "staff"
                    ? <Badge color={u.role === "admin" ? "bad" : pos?.is_system ? "navy" : "gold"}>{u.role_display}</Badge>
                    : <><Badge color="navy">{u.role_display}</Badge><div className="text-xs text-ink-muted mt-1">{u.business_name}</div></>}</td>
                  <td className="td text-xs"><span dir="ltr">{u.phone ? fa(u.phone) : ""}</span>{u.phone && kind === "staff" && u.username !== u.phone ? " · " : ""}{kind === "staff" && u.username !== u.phone && <span dir="ltr">{u.username}</span>}</td>
                  {kind === "staff" && <td className="td text-xs">{pos?.scope === "all" || u.role === "admin" ? "همه‌ی مشتری‌ها" :
                    (u.regions.map((r: number) => provinces?.find((p) => p.id === r)?.name).filter(Boolean).join("، ") || "فقط مشتری‌های سپرده‌شده")}</td>}
                  <td className="td text-xs">{u.last_login ? ago(u.last_login) : "هنوز وارد نشده"}</td>
                  <td className="td"><StatusChip status={u.is_active ? "approved" : "suspended"} label={u.is_active ? "فعال" : "غیرفعال"} /></td>
                  <td className="td text-left whitespace-nowrap">
                    {kind === "customer" && u.customer && <Link to={`/admin/customers/review?id=${u.customer}`} className="btn-ghost btn-sm">پرونده</Link>}
                    <Button size="sm" variant="ghost" icon="edit" onClick={() => setEdit({ mode: "edit", ...u, password: "" })}>ویرایش</Button>
                  </td>
                </tr>
              );
            })}</tbody>
          </Table></div>
        )}
        <div className="px-5 pb-4">{data && <Pagination page={page} count={data.count} onChange={setPage} />}</div>
      </Card>
      {edit && <UserForm init={edit} positions={positions} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function UserForm({ init, positions, onClose, onSaved }: { init: any; positions: Position[]; onClose: () => void; onSaved: () => void }) {
  const isNew = init.mode === "new";
  const isCustomerAccount = !isNew && init.kind === "customer";
  const { data: provinces } = useProvinces();
  const { data: groups } = useApi<any[]>("/price-groups/");
  const { data: reps } = useApi<any[]>("/staff/", { assignable: 1 });
  const [f, setF] = useState<any>({
    first_name: init.first_name ?? "", last_name: init.last_name ?? "", phone: init.phone ?? "", username: isNew ? "" : init.username,
    job_title: init.job_title ?? "", password: "", position: init.position ?? "", regions: init.regions ?? [], is_active: init.is_active ?? true,
  });
  // new user: choose what they are — a company position or a customer type
  const [target, setTarget] = useState<string>(isNew ? "" : init.position ? `p:${init.position}` : "");
  const [prof, setProf] = useState<any>({ business_name: "", province: "", city: "", address: "", economic_code: "", price_group: "", sales_rep: "", credit_limit: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pos = target.startsWith("p:") ? positions.find((p) => `p:${p.id}` === target) : undefined;
  const ctype = target.startsWith("c:") ? target.slice(2) : null;
  const cities = provinces?.find((p) => String(p.id) === String(prof.province))?.cities ?? [];
  useEffect(() => { if (groups && !prof.price_group) setProf((x: any) => ({ ...x, price_group: groups.find((g) => g.is_default)?.id ?? "" })); }, [groups]); // eslint-disable-line

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const body: any = { first_name: f.first_name, last_name: f.last_name, phone: toEnDigits(f.phone) || null, job_title: f.job_title, is_active: f.is_active };
    if (pos) Object.assign(body, { position: pos.id, regions: pos.scope === "region" ? f.regions : [], username: f.username || undefined });
    if (f.password) body.password = f.password;
    if (isNew && ctype) body.customer_type = ctype, body.customer_profile = { ...prof, credit_limit: toEnDigits(String(prof.credit_limit || 0)).replace(/\D/g, "") || 0 };
    setBusy(true);
    try {
      await (isNew ? api.post("/users/", body) : api.patch(`/users/${init.id}/`, body));
      onSaved();
    } catch (err) {
      const ae = err as ApiError;
      const m: Record<string, string> = {};
      Object.keys(ae.data?.errors || {}).forEach((k) => (m[k] = ae.field(k) || ""));
      setErrors({ ...m, _: ae.message });
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={isNew ? "کاربر جدید" : `ویرایش ${init.first_name} ${init.last_name}`} wide>
      <form onSubmit={save} className="space-y-5">
        {!isCustomerAccount && (
          <div>
            <span className="label">{isNew ? "این کاربر چه کاری انجام می‌دهد؟" : "سمت"}</span>
            <div className="grid sm:grid-cols-3 gap-2">
              {positions.map((p) => (
                <button type="button" key={p.id} onClick={() => setTarget(`p:${p.id}`)}
                  className={cx("text-right rounded-xl border p-3 transition-colors", target === `p:${p.id}` ? "border-navy-500 bg-navy-50" : "border-cream-400 bg-white hover:border-navy-200")}>
                  <span className="flex items-center gap-1.5 text-sm font-medium"><Icon name={p.base_role === "admin" ? "shield" : "users"} className="w-4 h-4 text-navy-500" />{p.name}</span>
                  <span className="block text-[11px] text-ink-muted mt-0.5 line-clamp-2">{p.description || `${num(p.permissions.length)} بخش · ${p.scope_display}`}</span>
                </button>
              ))}
              {isNew && CUSTOMER_TYPES.map((c) => (
                <button type="button" key={c.v} onClick={() => setTarget(`c:${c.v}`)}
                  className={cx("text-right rounded-xl border p-3 transition-colors", target === `c:${c.v}` ? "border-gold bg-gold-soft" : "border-dashed border-cream-500 bg-white hover:border-gold")}>
                  <span className="flex items-center gap-1.5 text-sm font-medium"><Icon name={c.icon} className="w-4 h-4 text-gold" />{c.l}</span>
                  <span className="block text-[11px] text-ink-muted mt-0.5">حساب مشتری، بدون نیاز به تأیید</span>
                </button>
              ))}
            </div>
            {errors.position && <p className="text-xs text-bad mt-1">{errors.position}</p>}
          </div>
        )}
        {pos && (
          <div className="rounded-xl bg-cream-100 p-3 text-xs text-ink-soft">
            <b>پنل این کاربر:</b> {pos.permissions.length ? <PermList keys={pos.permissions} /> : "فقط کیت بازاریابی و آموزش (هیچ بخش مدیریتی انتخاب نشده)"}
            <div className="mt-1">محدوده‌ی داده: {pos.scope_display}</div>
          </div>
        )}
        {(target || !isNew) && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="نام" error={errors.first_name}><Input id="uf_fn" required value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
            <Field label="نام خانوادگی"><Input id="uf_ln" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
            <Field label="موبایل" error={errors.phone} hint="با این شماره و کد پیامکی وارد می‌شود"><Input id="uf_ph" dir="ltr" required={!!ctype} value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            {!ctype && !isCustomerAccount && <Field label="عنوان شغلی (اختیاری)"><Input id="uf_job" value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} placeholder="مثلاً سرپرست انبار تهران" /></Field>}
            {!ctype && !isCustomerAccount && <>
              <Field label="نام کاربری (اختیاری)" error={errors.username} hint="خالی بماند، موبایل نام کاربری می‌شود"><Input id="uf_un" dir="ltr" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
              <Field label={isNew ? "رمز عبور (اختیاری)" : "رمز جدید (اختیاری)"} hint="بدون رمز، فقط با کد پیامکی وارد می‌شود"><Input id="uf_pw" type="password" dir="ltr" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            </>}
            {pos?.scope === "region" && (
              <Field label="استان‌های تحت پوشش" className="sm:col-span-2" hint="مشتری‌هایی که مستقیم به این کاربر سپرده شوند هم دیده می‌شوند">
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">{provinces?.map((p) => (
                  <label key={p.id} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.regions.includes(p.id)} onChange={(e) => setF({ ...f, regions: e.target.checked ? [...f.regions, p.id] : f.regions.filter((x: number) => x !== p.id) })} />{p.name}</label>
                ))}</div>
              </Field>
            )}
            {ctype && <>
              <Field label="نام کسب‌وکار" error={errors.business_name} className="sm:col-span-2"><Input id="uf_bn" required value={prof.business_name} onChange={(e) => setProf({ ...prof, business_name: e.target.value })} /></Field>
              <Field label="استان"><Select id="uf_prov" value={prof.province} onChange={(e) => setProf({ ...prof, province: e.target.value, city: "" })}><option value="">انتخاب کنید</option>{provinces?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field label="شهر" error={errors.city}><Select id="uf_city" required value={prof.city} onChange={(e) => setProf({ ...prof, city: e.target.value })}><option value="">انتخاب کنید</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="آدرس" error={errors.address} className="sm:col-span-2"><Textarea id="uf_addr" required value={prof.address} onChange={(e) => setProf({ ...prof, address: e.target.value })} /></Field>
              <Field label="کد اقتصادی"><Input id="uf_ec" dir="ltr" value={prof.economic_code} onChange={(e) => setProf({ ...prof, economic_code: e.target.value })} /></Field>
              <Field label="گروه قیمت"><Select id="uf_pg" value={prof.price_group} onChange={(e) => setProf({ ...prof, price_group: e.target.value })}>{groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
              <Field label="کارشناس فروش"><Select id="uf_rep" value={prof.sales_rep} onChange={(e) => setProf({ ...prof, sales_rep: e.target.value })}><option value="">بدون کارشناس</option>{reps?.map((r) => <option key={r.id} value={r.id}>{r.first_name} {r.last_name} · {r.position_name}</option>)}</Select></Field>
              <Field label="سقف اعتبار (ریال)"><Input id="uf_cl" dir="ltr" value={prof.credit_limit} onChange={(e) => setProf({ ...prof, credit_limit: e.target.value })} placeholder="0" /></Field>
            </>}
            {!isNew && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />حساب فعال است</label>}
          </div>
        )}
        {errors._ && <p className="text-sm text-bad">{errors._}</p>}
        <div className="flex gap-2"><Button loading={busy} disabled={isNew && !target}>{isNew ? "ساخت کاربر" : "ذخیره"}</Button><Button type="button" variant="ghost" onClick={onClose}>انصراف</Button></div>
      </form>
    </Modal>
  );
}

function PermList({ keys }: { keys: string[] }) {
  const { data: sections } = useApi<Section[]>("/positions/sections/");
  return <>{keys.map((k) => sections?.find((s) => s.key === k)?.label ?? k).join("، ")}</>;
}

/* ============================================================= positions */
function PositionsTab({ positions, sections, reload }: { positions: Position[] | null; sections: Section[]; reload: () => void }) {
  const [edit, setEdit] = useState<any>(null);
  const { run } = useAction();
  if (!positions) return <Loading />;
  return (
    <>
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <p className="text-sm text-ink-muted">مثلاً «انباردار» فقط صف سفارش‌ها را ببیند و وضعیت را به «ارسال شده» تغییر دهد؛ «حسابدار» فقط بخش مالی را.</p>
        <Button icon="plus" onClick={() => setEdit({ name: "", description: "", permissions: [], scope: "all" })}>سمت جدید</Button>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {positions.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-navy-700">{p.name}</h3>
                <p className="text-xs text-ink-muted mt-0.5">{p.description}</p>
              </div>
              {p.is_system ? <Badge color="navy">پیش‌فرض</Badge> : <Badge color="gold">سفارشی</Badge>}
            </div>
            <div className="flex flex-wrap gap-1 mt-3">
              {p.permissions.map((k) => <span key={k} className="chip bg-cream-200 text-ink-soft">{sections.find((s) => s.key === k)?.label ?? k}</span>)}
              {!p.permissions.length && <span className="text-xs text-ink-muted">بدون بخش مدیریتی</span>}
            </div>
            <div className="flex items-center justify-between mt-4 text-xs text-ink-muted">
              <span>{p.scope_display} · {num(p.users_count)} کاربر</span>
              <span className="flex gap-1">
                {p.base_role !== "admin" && <Button size="sm" variant="ghost" icon="edit" onClick={() => setEdit(p)}>ویرایش</Button>}
                {!p.is_system && !p.users_count && <ConfirmButton size="sm" variant="ghost" icon="trash" confirmText="حذف شود؟" onConfirm={async () => { if (await run(() => api.del(`/positions/${p.id}/`), "سمت حذف شد")) reload(); }}>حذف</ConfirmButton>}
              </span>
            </div>
          </Card>
        ))}
      </div>
      {edit && <PositionForm init={edit} sections={sections} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function PositionForm({ init, sections, onClose, onSaved }: { init: any; sections: Section[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ name: init.name, description: init.description, permissions: [...init.permissions], scope: init.scope });
  const { run, busy } = useAction();
  const toggle = (k: string) => setF({ ...f, permissions: f.permissions.includes(k) ? f.permissions.filter((x: string) => x !== k) : [...f.permissions, k] });
  const label = (k: string) => sections.find((s) => s.key === k)?.label ?? k;
  return (
    <Modal open onClose={onClose} title={init.id ? `ویرایش سمت «${init.name}»` : "سمت جدید"} wide>
      <form className="space-y-5" onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => (init.id ? api.patch(`/positions/${init.id}/`, f) : api.post("/positions/", f)), "سمت ذخیره شد")) onSaved();
      }}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="نام سمت"><Input id="pf_n" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلاً انباردار" /></Field>
          <Field label="توضیح کوتاه"><Input id="pf_d" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="کار این سمت چیست؟" /></Field>
        </div>
        <div>
          <span className="label">این سمت در پنل چه بخش‌هایی را ببیند؟</span>
          <div className="grid sm:grid-cols-2 gap-3">
            {SECTION_GROUPS.map((g) => (
              <fieldset key={g.title} className="rounded-xl border border-cream-300 p-3">
                <legend className="text-xs font-semibold text-navy-600 px-1">{g.title}</legend>
                <div className="space-y-1.5">{g.keys.map((k) => (
                  <label key={k} className="flex items-start gap-2 text-sm cursor-pointer"><input type="checkbox" className="mt-1" checked={f.permissions.includes(k)} onChange={() => toggle(k)} />{label(k)}</label>
                ))}</div>
              </fieldset>
            ))}
          </div>
          <p className="text-xs text-ink-muted mt-2">کیت بازاریابی و آموزش برای همه‌ی کارکنان قابل مشاهده است؛ تیک آن‌ها یعنی اجازه‌ی بارگذاری و ساخت.</p>
        </div>
        <div>
          <span className="label">محدوده‌ی داده</span>
          <div className="grid sm:grid-cols-2 gap-2">
            {[{ v: "all", l: "همه‌ی مشتری‌ها و سفارش‌ها", d: "مثل مدیر فروش، انباردار یا حسابدار" }, { v: "region", l: "فقط استان‌ها و مشتری‌های خودش", d: "مثل کارشناس فروش؛ استان‌ها هنگام ساخت کاربر انتخاب می‌شوند" }].map((o) => (
              <button type="button" key={o.v} onClick={() => setF({ ...f, scope: o.v })} className={cx("text-right rounded-xl border p-3", f.scope === o.v ? "border-navy-500 bg-navy-50" : "border-cream-400 bg-white")}>
                <span className="block text-sm font-medium">{o.l}</span><span className="block text-[11px] text-ink-muted">{o.d}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2"><Button loading={busy}>ذخیره‌ی سمت</Button><Button type="button" variant="ghost" onClick={onClose}>انصراف</Button></div>
      </form>
    </Modal>
  );
}
