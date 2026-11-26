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
export const isManager = (u?: User | null) => !!u && (u.role === "admin" || u.role === "sales_manager");
export const canFinance = (u?: User | null) => !!u && (u.is_customer_owner || u.can_view_finance);
export const canOrder = (u?: User | null) => !!u && (u.is_customer_owner || u.can_order);

/** Where a user should land after login. */
export function homeFor(u: User): string {
  if (isStaff(u)) return "/admin";
  if (u.customer?.status !== "approved") return "/pending";
  return "/dashboard";
}
