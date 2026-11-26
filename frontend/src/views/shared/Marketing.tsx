"use client";
import React, { useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, ConfirmButton, Empty, Field, Img, Input, Loading, Modal, PageHeader, Pagination, Select, Tabs, Textarea, cx, useAction } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { num } from "@/lib/format";
import { useApi } from "@/lib/hooks";

const KINDS = [{ value: "", label: "همه" }, { value: "poster", label: "پوستر" }, { value: "banner", label: "بنر" }, { value: "photo", label: "عکس محصول" }, { value: "video", label: "ویدیو" }];
const size = (b: number) => (b > 1e6 ? `${num(b / 1e6, 1)} مگابایت` : `${num(Math.max(1, b / 1e3))} کیلوبایت`);

export default function Marketing() {
  const { user } = useAuth();
  const manager = can(user, "marketing");
  const [kind, setKind] = useState("");
  const [campaign, setCampaign] = useState<number | "">("");
  const [page, setPage] = useState(1);
  const { data: camps, reload: reloadC } = useApi<any[]>("/campaigns/");
  const { data, loading, reload } = useApi<Page<any>>("/marketing-assets/", { kind, campaign, page, page_size: 24 });
  const [upload, setUpload] = useState(false);
  const [newCamp, setNewCamp] = useState(false);
  const { run, busy } = useAction();
  const [f, setF] = useState<any>({ title: "", kind: "poster", campaign: "" });
  const [file, setFile] = useState<File | null>(null);
  const [cf, setCf] = useState({ title: "", description: "" });

  return (
    <>
      <PageHeader title="کیت بازاریابی" subtitle="پوستر، بنر، عکس محصول و ویدیو برای ویترین و شبکه‌های اجتماعی؛ دسته‌بندی‌شده بر اساس کمپین"
        actions={manager && <><Button variant="secondary" icon="plus" onClick={() => setNewCamp(true)}>کمپین جدید</Button><Button icon="upload" onClick={() => setUpload(true)}>بارگذاری فایل</Button></>} />
      <div className="flex gap-3 overflow-x-auto pb-2 mb-4">
        <button onClick={() => { setCampaign(""); setPage(1); }} className={cx("card shrink-0 w-44 p-3 text-right", campaign === "" && "ring-2 ring-navy-500")}>
          <div className="h-16 rounded-lg bg-navy-600 text-cream-50 grid place-items-center mb-2"><Icon name="folder" /></div>
          <div className="text-sm font-medium">همه‌ی کمپین‌ها</div>
        </button>
        {camps?.map((c) => (
          <button key={c.id} onClick={() => { setCampaign(c.id); setPage(1); }} className={cx("card shrink-0 w-44 p-3 text-right", campaign === c.id && "ring-2 ring-navy-500")}>
            <Img src={c.cover} alt={c.title} className="h-16 w-full rounded-lg mb-2" />
            <div className="text-sm font-medium truncate">{c.title}</div>
            <div className="text-[11px] text-ink-muted num">{num(c.assets_count)} فایل</div>
          </button>
        ))}
      </div>
      <div className="mb-4"><Tabs value={kind} onChange={(v) => { setKind(v); setPage(1); }} items={KINDS} /></div>
      {loading && !data ? <Loading /> : !data?.results.length ? <div className="card"><Empty icon="folder" title="فایلی در این دسته نیست" /></div> : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.results.map((a) => (
            <article key={a.id} className="card overflow-hidden flex flex-col">
              <div className="relative">
                <Img src={a.thumbnail || (a.kind !== "video" ? a.file : null)} alt={a.title} className="w-full aspect-[1.6]" />
                {a.kind === "video" && <span className="absolute inset-0 grid place-items-center"><span className="w-12 h-12 rounded-full bg-navy-700/80 text-white grid place-items-center"><Icon name="play" /></span></span>}
                <Badge color="navy" className="absolute top-2 right-2">{a.kind_display}</Badge>
              </div>
              <div className="p-3 flex-1 flex flex-col gap-1">
                <div className="text-sm font-medium">{a.title}</div>
                <div className="text-[11px] text-ink-muted">{a.campaign_title || "بدون کمپین"} · {size(a.size_bytes)} · {num(a.downloads)} دانلود</div>
                <div className="flex gap-2 mt-auto pt-2">
                  <a href={a.file} target="_blank" rel="noreferrer" download className="btn-secondary btn-sm flex-1"><Icon name="download" className="w-4 h-4" />دریافت</a>
                  {manager && <ConfirmButton variant="ghost" size="sm" icon="trash" confirmText="حذف؟" onConfirm={async () => { await run(() => api.del(`/marketing-assets/${a.id}/`), "حذف شد"); reload(); }}>{""}</ConfirmButton>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {data && <Pagination page={page} count={data.count} pageSize={24} onChange={setPage} />}
      <Modal open={upload} onClose={() => setUpload(false)} title="بارگذاری فایل بازاریابی">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          const fd = new FormData();
          fd.append("title", f.title); fd.append("kind", f.kind); if (f.campaign) fd.append("campaign", f.campaign); fd.append("file", file);
          if (await run(() => api.post("/marketing-assets/", fd), "فایل بارگذاری شد")) { setUpload(false); setFile(null); reload(); reloadC(); }
        }}>
          <Field label="عنوان"><Input id="as_title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="نوع"><Select id="as_kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.slice(1).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
            <Field label="کمپین"><Select id="as_camp" value={f.campaign} onChange={(e) => setF({ ...f, campaign: e.target.value })}><option value="">بدون کمپین</option>{camps?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
          </div>
          <Field label="فایل"><input type="file" required onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" /></Field>
          <Button loading={busy} className="w-full">بارگذاری</Button>
        </form>
      </Modal>
      <Modal open={newCamp} onClose={() => setNewCamp(false)} title="کمپین جدید">
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/campaigns/", cf), "کمپین ساخته شد")) { setNewCamp(false); reloadC(); } }}>
          <Field label="عنوان"><Input id="cp_title" required value={cf.title} onChange={(e) => setCf({ ...cf, title: e.target.value })} /></Field>
          <Field label="توضیحات"><Textarea id="cp_desc" value={cf.description} onChange={(e) => setCf({ ...cf, description: e.target.value })} /></Field>
          <Button loading={busy} className="w-full">ساخت کمپین</Button>
        </form>
      </Modal>
    </>
  );
}
