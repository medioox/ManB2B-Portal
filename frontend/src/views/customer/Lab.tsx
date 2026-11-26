"use client";
import React from "react";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ui";
import Catalog from "./Catalog";

export default function Lab() {
  return (
    <>
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {[
          { icon: "flask", t: "کیت‌های بیوشیمی", d: "گلوکز، کلسترول، تری‌گلیسرید، اوره، کراتینین" },
          { icon: "shield", t: "هماتولوژی", d: "دایلوئنت، لایز و کنترل سه‌سطحی برای سل‌کانترها" },
          { icon: "file", t: "مستندات فنی", d: "دستورالعمل (IFU) و بروشور در صفحه‌ی هر کیت" },
        ].map((x) => (
          <Card key={x.t}><div className="flex gap-3"><div className="w-10 h-10 rounded-xl bg-navy-50 text-navy-600 grid place-items-center"><Icon name={x.icon} /></div><div><div className="font-semibold text-sm">{x.t}</div><div className="text-xs text-ink-muted mt-1">{x.d}</div></div></div></Card>
        ))}
      </div>
      <Catalog line="lab" />
    </>
  );
}
