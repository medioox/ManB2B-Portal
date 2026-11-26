"use client";
import React, { useEffect, useState } from "react";
import App from "@/App";
import { HistoryNavProvider } from "@/lib/nav";
import { registerPWA } from "@/lib/pwa";

export default function ClientApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); registerPWA(); }, []);
  if (!mounted) return null; // auth lives in localStorage: render on the client only
  return <HistoryNavProvider><App /></HistoryNavProvider>;
}
