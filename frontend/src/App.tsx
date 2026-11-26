"use client";
import React, { useEffect } from "react";
import { Shell } from "@/components/Shell";
import { Empty, Loading, ToastProvider } from "@/components/ui";
import { AuthProvider, can, canFinance, canOrder, homeFor, useAuth } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { Link, useNav } from "@/lib/nav";
import { ROUTES } from "./routes";

function Router() {
  const { path, replace } = useNav();
  const { user, loading } = useAuth();
  const route = ROUTES[path.replace(/\/+$/, "") || "/"];

  let redirect: string | null = null;
  if (!loading) {
    if (path === "/" || path === "") redirect = user ? homeFor(user) : "/login";
    else if (route?.roles && !user) redirect = "/login";
    else if (route?.approved && user && user.customer && user.customer.status !== "approved") redirect = "/pending";
  }
  useEffect(() => { if (redirect) replace(redirect); }, [redirect]); // eslint-disable-line

  if (loading || redirect) return <div className="min-h-screen grid place-items-center"><Loading /></div>;
  if (!route) return <NotFound />;
  const View = route.view;
  if (route.bare) return <View />;
  const allowed = !!user && (!route.roles || route.roles.includes(user.role)) &&
    (route.perm !== "finance" || canFinance(user)) && (route.perm !== "order" || canOrder(user)) && (route.perm !== "owner" || user.is_customer_owner) && (!route.staff || can(user, ...route.staff));
  return (
    <Shell>
      {allowed ? <View key={path} /> : <div className="card"><Empty icon="shield" title="به این بخش دسترسی ندارید" text="اگر فکر می‌کنید باید دسترسی داشته باشید، با مدیر حساب یا مدیر فروش تماس بگیرید." /></div>}
    </Shell>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <Empty icon="search" title="صفحه پیدا نشد" action={<Link to="/" className="btn-primary">بازگشت به خانه</Link>} />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <Router />
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
