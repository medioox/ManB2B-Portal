"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokens } from "./api";
import type { User } from "./types";
import { CUSTOMER, STAFF } from "./types";

type AuthState = {
  user: User | null;
  loading: boolean;
  reload: () => Promise<User | null>;
  signIn: (access: string, refresh: string, user?: User) => Promise<User | null>;
  signOut: () => void;
};

const Ctx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tokens.access) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const u = await api.get<User>("/auth/me/");
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const out = () => setUser(null);
    window.addEventListener("man:logout", out);
    return () => window.removeEventListener("man:logout", out);
  }, [reload]);

  const signIn = async (access: string, refresh: string, u?: User) => {
    tokens.set(access, refresh);
    if (u) {
      setUser(u);
      return u;
    }
    return reload();
  };
  const signOut = () => {
    tokens.clear();
    setUser(null);
  };
  return <Ctx.Provider value={{ user, loading, reload, signIn, signOut }}>{children}</Ctx.Provider>;
}

export const isStaff = (u?: User | null) => !!u && STAFF.includes(u.role);
export const isCustomer = (u?: User | null) => !!u && CUSTOMER.includes(u.role);
/** Staff section permission (from the user's position). */
export const can = (u: User | null | undefined, ...keys: string[]) => !!u && keys.some((k) => (u.permissions ?? []).includes(k));
export const seesAll = (u?: User | null) => !!u && u.scope === "all";
export const canFinance = (u?: User | null) => !!u && (u.is_customer_owner || u.can_view_finance);
export const canOrder = (u?: User | null) => !!u && (u.is_customer_owner || u.can_order);

/** Where a user should land after login. */
export function homeFor(u: User): string {
  if (isStaff(u)) return staffHome(u);
  if (u.customer?.status !== "approved") return "/pending";
  return "/dashboard";
}

const STAFF_HOME: [string, string][] = [
  ["dashboard", "/admin"], ["orders", "/admin/orders"], ["customers", "/admin/customers"], ["finance", "/admin/finance"],
  ["products", "/admin/products"], ["pricing", "/admin/pricing"], ["support", "/admin/tickets"], ["marketing", "/admin/marketing"],
  ["training", "/admin/training"], ["targets", "/admin/targets"], ["network", "/admin/network"], ["announcements", "/admin/announcements"],
  ["integrations", "/admin/integrations"], ["users", "/admin/users"],
];
export function staffHome(u: User): string {
  return STAFF_HOME.find(([k]) => can(u, k))?.[1] ?? "/admin/marketing";
}
