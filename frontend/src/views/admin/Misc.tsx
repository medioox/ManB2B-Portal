"use client";
import React, { useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, ConfirmButton, Empty, Field, Input, Loading, Modal, PageHeader, Select, StatusChip, Table, Textarea, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { ago, fa, jtime, num } from "@/lib/format";
import { useProvinces } from "@/lib/geo";
import { useApi } from "@/lib/hooks";
import { ROLE_LABEL } from "@/lib/types";

const AUD = [{ v: "distributor", l: "نماینده" }, { v: "store", l: "فروشگاه" }, { v: "organization", l: "سازمانی" }, { v: "lab", l: "آزمایشگاه" }];
function AudiencePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex gap-3 flex-wrap">{AUD.map((a) => (
      <label key={a.v} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={value.includes(a.v)} onChange={(e) => onChange(e.target.checked ? [...value, a.v] : value.filter((x) => x !== a.v))} />{a.l}</label>
    ))}<span className="text-xs text-ink-muted">(هیچ‌کدام = همه)</span></div>
  );
}

/* ---------------- announcements ---------------- */
export function Announcements() {
  const { data, reload } = useApi<any[]>("/announcements/");
  const [f, setF] = useState<any>({ title: "", body: "", audiences: [], pinned: false, is_active: true });
  const { run, busy } = useAction();
  return (
    <>
      <PageHeader title="اطلاعیه‌ها" subtitle="روی داشبورد مشتری‌ها نمایش داده می‌شود" />
      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <Card pad={false}>
          {!data ? <Loading /> : !data.length ? <Empty icon="megaphone" title="اطلاعیه‌ای نیست" /> : (
            <ul>{data.map((a) => (
              <li key={a.id} className="px-5 py-4 border-t border-cream-200 flex gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap"><b className="text-sm">{a.title}</b>{a.pinned && <Badge color="gold">سنجاق</Badge>}{!a.is_active && <Badge>غیرفعال</Badge>}{a.audiences.map((x: string) => <Badge key={x} color="navy">{ROLE_LABEL[x as keyof typeof ROLE_LABEL]}</Badge>)}</div>
                  <p className="text-xs text-ink-soft mt-1 leading-6">{a.body}</p><div className="text-[11px] text-ink-muted">{ago(a.created_at)}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="ghost" onClick={async () => { await run(() => api.patch(`/announcements/${a.id}/`, { is_active: !a.is_active })); reload(); }}>{a.is_active ? "غیرفعال" : "فعال"}</Button>
                  <ConfirmButton size="sm" variant="ghost" icon="trash" confirmText="حذف؟" onConfirm={async () => { await run(() => api.del(`/announcements/${a.id}/`)); reload(); }}>حذف</ConfirmButton>
                </div>
              </li>
            ))}</ul>
          )}
        </Card>
        <Card title="اطلاعیه‌ی جدید">
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/announcements/", f), "اطلاعیه منتشر شد")) { setF({ title: "", body: "", audiences: [], pinned: false, is_active: true }); reload(); } }}>
            <Field label="عنوان"><Input id="an_t" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="متن"><Textarea id="an_b" required rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
            <Field label="مخاطب"><AudiencePicker value={f.audiences} onChange={(v) => setF({ ...f, audiences: v })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />سنجاق بالای داشبورد</label>
            <Button loading={busy} className="w-full">انتشار</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

/* ---------------- training admin ---------------- */
export function TrainingAdmin() {
  const { user } = useAuth();
  const manager = can(user, "training");
  const { data: courses, reload } = useApi<any[]>("/courses/");
  const [sel, setSel] = useState<any>(null);
  const [nc, setNc] = useState<any>({ title: "", summary: "", audiences: [] });
  const { run, busy } = useAction();
  return (
    <>
      <PageHeader title="آموزش" subtitle="دوره‌های معرفی محصول برای فروشنده‌ها و آزمون کوتاه"
        actions={manager && <Button icon="plus" onClick={() => setSel({ new: true })}>دوره‌ی جدید</Button>} />
      {!courses ? <Loading /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{courses.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{c.title}</h3>{!c.is_published && <Badge>پیش‌نویس</Badge>}</div>
            <p className="text-xs text-ink-muted mt-1 leading-6">{c.summary}</p>
            <div className="flex gap-2 text-xs text-ink-muted mt-2 num">{num(c.lessons_count)} درس · {num(c.questions_count)} سؤال</div>
            <div className="flex gap-1 flex-wrap mt-2">{(c.audiences.length ? c.audiences : ["همه"]).map((a: string) => <Badge key={a} color="navy">{ROLE_LABEL[a as keyof typeof ROLE_LABEL] || a}</Badge>)}</div>
            {manager && <Button size="sm" variant="secondary" className="mt-3" onClick={() => setSel(c)}>مدیریت درس‌ها و آزمون</Button>}
          </Card>
        ))}</div>
      )}
      <Modal open={!!sel?.new} onClose={() => setSel(null)} title="دوره‌ی جدید">
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/courses/", nc), "دوره ساخته شد")) { setSel(null); reload(); } }}>
          <Field label="عنوان"><Input id="co_t" required value={nc.title} onChange={(e) => setNc({ ...nc, title: e.target.value })} /></Field>
          <Field label="خلاصه"><Textarea id="co_s" value={nc.summary} onChange={(e) => setNc({ ...nc, summary: e.target.value })} /></Field>
          <Field label="مخاطب"><AudiencePicker value={nc.audiences} onChange={(v) => setNc({ ...nc, audiences: v })} /></Field>
          <Button loading={busy} className="w-full">ساخت دوره</Button>
        </form>
      </Modal>
      {sel && !sel.new && <CourseEditor c={sel} onClose={() => { setSel(null); reload(); }} />}
    </>
  );
}

function CourseEditor({ c, onClose }: { c: any; onClose: () => void }) {
  const { data: lessons, reload: rl } = useApi<any[]>(`/courses/${c.id}/lessons/`);
  const { data: qs, reload: rq } = useApi<any[]>(`/courses/${c.id}/quiz/`);
  const [l, setL] = useState({ title: "", body: "", video_url: "" });
  const [q, setQ] = useState({ text: "", choices: "", correct_index: 0 });
  const { run, busy } = useAction();
  return (
    <Modal open onClose={onClose} title={c.title} wide>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold text-sm mb-2">درس‌ها</h4>
          <ol className="space-y-1 mb-3">{lessons?.map((x, i) => <li key={x.id} className="text-sm flex justify-between rounded-lg bg-cream-100 px-3 py-2"><span>{num(i + 1)}. {x.title}</span><button className="text-bad text-xs" onClick={async () => { await run(() => api.del(`/lessons/${x.id}/`)); rl(); }}>حذف</button></li>)}</ol>
          <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/lessons/", { ...l, course: c.id, order: lessons?.length ?? 0 }), "درس اضافه شد")) { setL({ title: "", body: "", video_url: "" }); rl(); } }}>
            <Input aria-label="عنوان درس" className="h-9" placeholder="عنوان درس" required value={l.title} onChange={(e) => setL({ ...l, title: e.target.value })} />
            <Input aria-label="لینک ویدیو" className="h-9" dir="ltr" placeholder="https://…/video.mp4" value={l.video_url} onChange={(e) => setL({ ...l, video_url: e.target.value })} />
            <Textarea aria-label="متن درس" rows={2} placeholder="متن درس" value={l.body} onChange={(e) => setL({ ...l, body: e.target.value })} />
            <Button size="sm" loading={busy}>افزودن درس</Button>
          </form>
        </div>
        <div>
          <h4 className="font-semibold text-sm mb-2">آزمون</h4>
          <ol className="space-y-1 mb-3">{qs?.map((x, i) => <li key={x.id} className="text-sm rounded-lg bg-cream-100 px-3 py-2"><div className="flex justify-between"><span>{num(i + 1)}. {x.text}</span><button className="text-bad text-xs" onClick={async () => { await run(() => api.del(`/quiz-questions/${x.id}/`)); rq(); }}>حذف</button></div><div className="text-xs text-ok">پاسخ: {x.choices[x.correct_index]}</div></li>)}</ol>
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            const choices = q.choices.split("\n").map((s) => s.trim()).filter(Boolean);
            if (await run(() => api.post("/quiz-questions/", { course: c.id, text: q.text, choices, correct_index: q.correct_index, order: qs?.length ?? 0 }), "سؤال اضافه شد")) { setQ({ text: "", choices: "", correct_index: 0 }); rq(); }
          }}>
            <Input aria-label="سؤال" className="h-9" placeholder="متن سؤال" required value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} />
            <Textarea aria-label="گزینه‌ها" rows={3} placeholder="هر گزینه در یک خط" required value={q.choices} onChange={(e) => setQ({ ...q, choices: e.target.value })} />
            <Select aria-label="گزینه‌ی درست" className="h-9 text-sm" value={q.correct_index} onChange={(e) => setQ({ ...q, correct_index: +e.target.value })}>{q.choices.split("\n").filter((s) => s.trim()).map((s, i) => <option key={i} value={i}>درست: {s}</option>)}</Select>
            <Button size="sm" loading={busy}>افزودن سؤال</Button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- integrations ---------------- */
export function Integrations() {
  const { user } = useAuth();
  const { data, reload } = useApi<any[]>("/integrations/logs/");
  const { run, busy } = useAction();
  return (
    <>
      <PageHeader title="اتصال به نرم‌افزار حسابداری" subtitle="همگام‌سازی خودکار: کالا، موجودی و قیمت هر ۱۵ دقیقه؛ فاکتور و مانده هر ساعت؛ سفارش بلافاصله پس از تأیید"
        actions={can(user, "integrations") && <>
          <Button variant="secondary" icon="sync" loading={busy} onClick={async () => { await run(() => api.post("/integrations/run/", { kind: "products" }), "همگام‌سازی کالاها در صف قرار گرفت"); setTimeout(reload, 1500); }}>همگام‌سازی کالا و موجودی</Button>
          <Button variant="secondary" icon="receipt" loading={busy} onClick={async () => { await run(() => api.post("/integrations/run/", { kind: "invoices" }), "دریافت فاکتورها در صف قرار گرفت"); setTimeout(reload, 1500); }}>دریافت فاکتورها</Button>
        </>} />
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {[{ i: "box", t: "کالا، موجودی و قیمت پایه", d: "از حسابداری ← پرتال" }, { i: "truck", t: "سفارش‌های تأییدشده", d: "از پرتال ← حسابداری (با تلاش مجدد خودکار)" }, { i: "receipt", t: "فاکتور رسمی و مانده حساب", d: "از حسابداری ← پرتال" }].map((x) => (
          <Card key={x.t}><div className="flex gap-3"><span className="w-10 h-10 rounded-xl bg-navy-50 text-navy-600 grid place-items-center"><Icon name={x.i} /></span><div><div className="text-sm font-semibold">{x.t}</div><div className="text-xs text-ink-muted">{x.d}</div></div></div></Card>
        ))}
      </div>
      <Card title="گزارش همگام‌سازی" pad={false}>
        {!data ? <Loading /> : !data.length ? <Empty icon="sync" title="هنوز همگام‌سازی انجام نشده" /> : (
          <div className="px-5"><Table>
            <thead><tr><th className="th">زمان</th><th className="th">نوع</th><th className="th">نتیجه</th><th className="th">شرح</th></tr></thead>
            <tbody>{data.map((l) => <tr key={l.id}><td className="td text-xs">{jtime(l.created_at)}</td><td className="td">{l.kind_display}</td><td className="td"><StatusChip status={l.success ? "approved" : "rejected"} label={l.success ? "موفق" : "خطا"} /></td><td className="td text-xs num">{l.message}</td></tr>)}</tbody>
          </Table></div>
        )}
      </Card>
    </>
  );
}

