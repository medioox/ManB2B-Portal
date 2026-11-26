"use client";
import React from "react";
import { Icon } from "@/components/icons";
import { Badge, Card, Loading, PageHeader, Progress, cx } from "@/components/ui";
import { num, short } from "@/lib/format";
import { useApi } from "@/lib/hooks";

export default function Rewards() {
  const { data } = useApi<any>("/rewards/me/");
  if (!data) return <Loading />;
  const c = data.current;
  const max = Math.max(130, ...data.tiers.map((t: any) => t.min_percent + 10));
  return (
    <div className="space-y-6">
      <PageHeader title="پیشرفت من و جوایز" subtitle={`هدف فروش ماه ${c.month_name} ${num(c.year).replace(/٬/g, "")}`} />
      <Card>
        <div className="grid md:grid-cols-[1fr_260px] gap-6 items-center">
          <div>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="text-4xl font-black text-navy-700 num">{num(c.percent)}٪</div>
              <div className="text-sm text-ink-muted pb-1 num">{short(c.sold)} از {short(c.target)} ریال</div>
            </div>
            <div className="relative mt-6 mb-8">
              <Progress value={(c.percent / max) * 100} color="bg-gradient-to-l from-gold to-navy-500" className="h-4" />
              {data.tiers.map((t: any) => (
                <div key={t.id} className="absolute -top-1 flex flex-col items-center" style={{ right: `calc(${(t.min_percent / max) * 100}% - 12px)` }}>
                  <span className={cx("w-6 h-6 rounded-full border-2 border-cream-50 grid place-items-center", c.percent >= t.min_percent ? "bg-gold text-white" : "bg-cream-400 text-ink-muted")}><Icon name="award" className="w-3.5 h-3.5" /></span>
                  <span className="text-[10px] text-ink-muted mt-1 whitespace-nowrap num">{t.title} {num(t.min_percent)}٪</span>
                </div>
              ))}
            </div>
            {c.next_tier ? (
              <p className="text-sm text-ink-soft">برای رسیدن به سطح <b>{c.next_tier.title}</b> فقط <b className="num">{short(c.remaining_to_next)}</b> ریال فروش دیگر لازم است.</p>
            ) : <p className="text-sm text-ok font-medium">به بالاترین سطح پاداش این ماه رسیده‌اید!</p>}
          </div>
          <div className="rounded-2xl bg-navy-600 text-cream-50 p-5">
            <div className="text-xs text-navy-100">پاداش تا این لحظه</div>
            <div className="text-2xl font-bold num mt-1">{short(c.reward_amount)} <span className="text-sm font-normal">ریال</span></div>
            {c.current_tier ? <div className="mt-3 text-xs text-navy-100">سطح فعلی: <span className="text-gold font-semibold">{c.current_tier.title}</span> · {c.current_tier.description}</div> : <div className="mt-3 text-xs text-navy-100">هنوز به اولین سطح نرسیده‌اید.</div>}
          </div>
        </div>
      </Card>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="پاداش پلکانی">
          <ul className="space-y-2">{data.tiers.map((t: any) => (
            <li key={t.id} className={cx("flex items-center gap-3 rounded-xl p-3", c.percent >= t.min_percent ? "bg-gold-soft" : "bg-cream-100")}>
              <Icon name="award" className={cx("w-5 h-5", c.percent >= t.min_percent ? "text-gold" : "text-ink-muted")} />
              <div className="flex-1"><div className="text-sm font-medium">{t.title} — از {num(t.min_percent)}٪ هدف</div><div className="text-xs text-ink-muted">{t.description}</div></div>
              <Badge color="navy">{num(t.reward_percent)}٪ فروش</Badge>
            </li>
          ))}</ul>
        </Card>
        <Card title="رتبه‌بندی نماینده‌ها در این ماه">
          <ol className="space-y-1">{data.leaderboard.map((r: any) => (
            <li key={r.rank} className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm", r.is_me && "bg-navy-50 ring-1 ring-navy-200")}>
              <span className={cx("w-7 h-7 rounded-full grid place-items-center text-xs num", r.rank <= 3 ? "bg-gold text-white" : "bg-cream-300")}>{num(r.rank)}</span>
              <span className="flex-1">{r.name} <span className="text-xs text-ink-muted">· {r.city}</span>{r.is_me && <Badge color="navy" className="mr-2">شما</Badge>}</span>
              <span className="num text-xs">{short(r.sold)}</span>
            </li>
          ))}</ol>
        </Card>
      </div>
      <Card title="شش ماه اخیر">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{data.history.map((h: any) => (
          <div key={`${h.year}-${h.month}`} className="rounded-xl bg-cream-100 p-3">
            <div className="text-xs text-ink-muted">{h.month_name}</div>
            <div className="font-bold num">{num(h.percent)}٪</div>
            <Progress value={h.percent} className="h-1.5 mt-2" color={h.percent >= 100 ? "bg-ok" : "bg-navy-400"} />
            {h.current_tier && <div className="text-[11px] text-gold mt-1">{h.current_tier.title}</div>}
          </div>
        ))}</div>
      </Card>
    </div>
  );
}
