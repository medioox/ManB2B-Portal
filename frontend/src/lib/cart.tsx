"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { canOrder, isCustomer, useAuth } from "./auth";

export type CartData = {
  items: { product: number; name: string; sku: string; image: string | null; units_per_carton: number; min_order_cartons: number;
    is_available: boolean; cartons: number; unit_price: number; line_total: number }[];
  errors: string[]; total_cartons: number; subtotal: number; discount_percent: number; discount_amount: number; total: number;
  credit: { credit_limit: number; balance: number; open_orders: number; available_credit: number; block_on_credit: boolean };
  default_address: string; credit_ok: boolean;
};

type Ctx = { cart: CartData | null; setQty: (product: number, cartons: number) => Promise<void>; reload: () => Promise<void>; qtyOf: (p: number) => number; setCart: (c: CartData) => void };
const CartCtx = createContext<Ctx>(null as any);
export const useCart = () => useContext(CartCtx);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<CartData | null>(null);
  const enabled = isCustomer(user) && user?.customer?.status === "approved" && canOrder(user);
  const reload = useCallback(async () => {
    if (!enabled) return setCart(null);
    try { setCart(await api.get<CartData>("/cart/")); } catch { /* ignore */ }
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  const setQty = async (product: number, cartons: number) => {
    setCart(await api.post<CartData>("/cart/", { product, cartons }));
  };
  const qtyOf = (p: number) => cart?.items.find((i) => i.product === p)?.cartons ?? 0;
  return <CartCtx.Provider value={{ cart, setQty, reload, qtyOf, setCart }}>{children}</CartCtx.Provider>;
}
