"use client";
import React from "react";
import type { Role } from "@/lib/types";
import { CUSTOMER, STAFF } from "@/lib/types";
import Login from "@/views/auth/Login";
import Register from "@/views/auth/Register";
import Pending from "@/views/auth/Pending";
import Agency from "@/views/auth/Agency";
import Dashboard from "@/views/customer/Dashboard";
import Catalog from "@/views/customer/Catalog";
import Lab from "@/views/customer/Lab";
import Cart from "@/views/customer/Cart";
import Orders, { OrderDetail } from "@/views/customer/Orders";
import Finance, { Cheques, Invoices, MockGateway, Pay } from "@/views/customer/Finance";
import Team from "@/views/customer/Team";
import Rewards from "@/views/customer/Rewards";
import Training, { Course } from "@/views/customer/Training";
import Marketing from "@/views/shared/Marketing";
import { NewReturn, NewTicket, Returns, TicketDetail, Tickets } from "@/views/shared/Support";
import AdminDashboard from "@/views/admin/Dashboard";
import Customers, { CustomerReview } from "@/views/admin/Customers";
import AdminOrders, { AdminOrderDetail } from "@/views/admin/Orders";
import AdminProducts from "@/views/admin/Products";
import Pricing from "@/views/admin/Pricing";
import FinanceAdmin from "@/views/admin/FinanceAdmin";
import Targets from "@/views/admin/Targets";
import Network from "@/views/admin/Network";
import { Announcements, Integrations, TrainingAdmin } from "@/views/admin/Misc";
import Users from "@/views/admin/Users";

export type RouteDef = {
  view: React.ComponentType;
  /** undefined = public page (no login) */
  roles?: Role[];
  /** render without the app shell */
  bare?: boolean;
  /** approved customer required */
  approved?: boolean;
  /** extra permission check for sub-users */
  perm?: "finance" | "order" | "owner";
  /** staff: any of these position permissions */
  staff?: string[];
};

const C = CUSTOMER;
const S = STAFF;
const ALL = [...S, ...C];

export const ROUTES: Record<string, RouteDef> = {
  "/login": { view: Login, bare: true },
  "/register": { view: Register, bare: true },
  "/agency": { view: Agency, bare: true },
  "/pending": { view: Pending, roles: C, bare: true },
  "/pay/mock": { view: MockGateway, roles: C, bare: true },

  "/dashboard": { view: Dashboard, roles: C, approved: true },
  "/catalog": { view: Catalog, roles: C, approved: true },
  "/lab": { view: Lab, roles: ["lab"], approved: true },
  "/cart": { view: Cart, roles: C, approved: true, perm: "order" },
  "/orders": { view: Orders, roles: C, approved: true },
  "/orders/detail": { view: OrderDetail, roles: C, approved: true },
  "/finance": { view: Finance, roles: C, approved: true, perm: "finance" },
  "/finance/cheques": { view: Cheques, roles: C, approved: true, perm: "finance" },
  "/finance/invoices": { view: Invoices, roles: C, approved: true, perm: "finance" },
  "/finance/pay": { view: Pay, roles: C, approved: true, perm: "finance" },
  "/team": { view: Team, roles: C, approved: true, perm: "owner" },
  "/rewards": { view: Rewards, roles: ["distributor"], approved: true },
  "/marketing": { view: Marketing, roles: C, approved: true },
  "/training": { view: Training, roles: C, approved: true },
  "/training/course": { view: Course, roles: ALL, approved: true },
  "/support/returns": { view: Returns, roles: C, approved: true },
  "/support/returns/new": { view: NewReturn, roles: C, approved: true },
  "/support/tickets": { view: Tickets, roles: C, approved: true },
  "/support/tickets/new": { view: NewTicket, roles: C, approved: true },
  "/support/tickets/detail": { view: TicketDetail, roles: C, approved: true },

  "/admin": { view: AdminDashboard, roles: S, staff: ["dashboard"] },
  "/admin/customers": { view: Customers, roles: S, staff: ["customers", "customers_manage"] },
  "/admin/customers/review": { view: CustomerReview, roles: S, staff: ["customers", "customers_manage"] },
  "/admin/orders": { view: AdminOrders, roles: S, staff: ["orders", "orders_manage"] },
  "/admin/orders/detail": { view: AdminOrderDetail, roles: S, staff: ["orders", "orders_manage"] },
  "/admin/products": { view: AdminProducts, roles: S, staff: ["products"] },
  "/admin/pricing": { view: Pricing, roles: S, staff: ["pricing"] },
  "/admin/finance": { view: FinanceAdmin, roles: S, staff: ["finance", "finance_manage"] },
  "/admin/targets": { view: Targets, roles: S, staff: ["targets"] },
  "/admin/network": { view: Network, roles: S, staff: ["network"] },
  "/admin/marketing": { view: Marketing, roles: S },
  "/admin/training": { view: TrainingAdmin, roles: S },
  "/admin/announcements": { view: Announcements, roles: S, staff: ["announcements"] },
  "/admin/returns": { view: Returns, roles: S, staff: ["support"] },
  "/admin/tickets": { view: Tickets, roles: S, staff: ["support"] },
  "/admin/integrations": { view: Integrations, roles: S, staff: ["integrations"] },
  "/admin/users": { view: Users, roles: S, staff: ["users"] },
  "/admin/staff": { view: Users, roles: S, staff: ["users"] },
};
