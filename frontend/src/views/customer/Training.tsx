"use client";
import React, { useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, Empty, Img, Loading, PageHeader, Progress, cx, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { Link, useNav } from "@/lib/nav";

export default function Training() {
  const { data, loading } = useApi<any[]>("/courses/");
  return (
    <>
      <PageHeader title="آموزش" subtitle="ویدیوهای معرفی محصولات جدید و نکات فروش، همراه با آزمون کوتاه" />
      {loading ? <Loading /> : !data?.length ? <div className="card"><Empty icon="book" title="دوره‌ای منتشر نشده" /></div> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.map((c) => {
            const pct = c.lessons_count ? (c.completed_count / c.lessons_count) * 100 : 0;
            return (
              <Link key={c.id} to={`/training/course?id=${c.id}`} className="card overflow-hidden hover:border-navy-300 flex flex-col">
                <Img src={c.cover} alt={c.title} className="w-full aspect-[1.9]" />
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <h3 className="font-semibold">{c.title}</h3>
                  <p className="text-xs text-ink-muted leading-6 flex-1">{c.summary}</p>
                  <div className="flex items-center gap-2 text-xs text-ink-muted"><Icon name="play" className="w-3.5 h-3.5" />{num(c.lessons_count)} درس{c.questions_count ? <> · آزمون {num(c.questions_count)} سؤالی</> : null}</div>
                  <Progress value={pct} className="h-1.5" color={pct === 100 ? "bg-ok" : "bg-navy-500"} />
                  <div className="flex justify-between text-[11px] text-ink-muted"><span className="num">{num(c.completed_count)} از {num(c.lessons_count)} درس</span>{c.best_score != null && <Badge color={c.best_score === c.questions_count ? "ok" : "gold"}>بهترین نمره {num(c.best_score)}/{num(c.questions_count)}</Badge>}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export function Course() {
  const { params } = useNav();
  const id = params.id;
  const { data: course } = useApi<any>(`/courses/${id}/`);
  const { data: lessons, reload } = useApi<any[]>(`/courses/${id}/lessons/`);
  const { data: quiz } = useApi<any[]>(`/courses/${id}/quiz/`);
  const [active, setActive] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<any>(null);
  const { run, busy } = useAction();
  if (!course || !lessons) return <Loading />;
  const l = lessons[active];
  return (
    <>
      <PageHeader title={course.title} subtitle={course.summary} back={<Link to="/training" className="text-xs text-navy-500 flex items-center gap-1 mb-2"><Icon name="right" className="w-3.5 h-3.5" />دوره‌ها</Link>} />
      <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {l && (
            <Card>
              {(l.video || l.video_url) && <video key={l.id} controls preload="metadata" className="w-full rounded-xl bg-navy-900 aspect-video" src={l.video || l.video_url} />}
              <h2 className="font-semibold text-lg mt-4">{l.title}</h2>
              <p className="text-sm text-ink-soft leading-7 mt-2 whitespace-pre-line">{l.body}</p>
              <div className="flex gap-2 mt-4">
                <Button variant={l.completed ? "secondary" : "primary"} icon="check" loading={busy} onClick={async () => {
                  await run(() => api.post(`/courses/${id}/lessons/${l.id}/complete/`));
                  reload();
                  if (active < lessons.length - 1) setActive(active + 1);
                }}>{l.completed ? "دیده شد" : "دیدم، درس بعدی"}</Button>
              </div>
            </Card>
          )}
          {!!quiz?.length && (
            <Card title="آزمون کوتاه">
              <div className="space-y-5">
                {quiz.map((q, qi) => {
                  const r = result?.result.find((x: any) => x.question === q.id);
                  return (
                    <fieldset key={q.id}>
                      <legend className="text-sm font-medium mb-2">{num(qi + 1)}. {q.text}</legend>
                      <div className="grid gap-1.5">
                        {q.choices.map((ch: string, ci: number) => (
                          <label key={ci} className={cx("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer",
                            r ? (ci === r.correct_index ? "border-ok bg-ok-soft" : answers[q.id] === ci ? "border-bad bg-bad-soft" : "border-cream-300") : answers[q.id] === ci ? "border-navy-500 bg-navy-50" : "border-cream-300 bg-white")}>
                            <input type="radio" name={`q${q.id}`} disabled={!!result} checked={answers[q.id] === ci} onChange={() => setAnswers({ ...answers, [q.id]: ci })} />{ch}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
                {result ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge color={result.score === result.total ? "ok" : "gold"} className="text-sm py-1">نمره‌ی شما: {num(result.score)} از {num(result.total)}</Badge>
                    <Button variant="secondary" size="sm" onClick={() => { setResult(null); setAnswers({}); }}>تلاش دوباره</Button>
                  </div>
                ) : (
                  <Button disabled={Object.keys(answers).length < quiz.length} loading={busy} onClick={async () => setResult(await run(() => api.post(`/courses/${id}/submit_quiz/`, { answers })))}>ثبت پاسخ‌ها</Button>
                )}
              </div>
            </Card>
          )}
        </div>
        <Card title="درس‌ها" pad={false}>
          <ol>{lessons.map((x, i) => (
            <li key={x.id}><button onClick={() => setActive(i)} className={cx("w-full text-right flex items-center gap-3 px-5 py-3 border-t border-cream-200 text-sm", i === active ? "bg-navy-50 text-navy-700" : "hover:bg-cream-100")}>
              <span className={cx("w-6 h-6 rounded-full grid place-items-center text-xs shrink-0", x.completed ? "bg-ok text-white" : "bg-cream-300")}>{x.completed ? <Icon name="check" className="w-3.5 h-3.5" /> : num(i + 1)}</span>{x.title}
            </button></li>
          ))}</ol>
        </Card>
      </div>
    </>
  );
}
