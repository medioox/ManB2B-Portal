export type Role = "admin" | "sales_manager" | "sales_rep" | "staff" | "distributor" | "store" | "organization" | "lab";
export const STAFF: Role[] = ["admin", "sales_manager", "sales_rep", "staff"];
export const CUSTOMER: Role[] = ["distributor", "store", "organization", "lab"];
export const MANAGERS: Role[] = ["admin", "sales_manager"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "ادمین کل", sales_manager: "مدیر فروش", sales_rep: "کارشناس فروش", staff: "کارمند", distributor: "نماینده / پخش‌کننده",
  store: "فروشگاه", organization: "مشتری سازمانی", lab: "آزمایشگاه",
};

export type Customer = {
  id: number; type: Role; type_display: string; business_name: string; owner_name: string; phone: string;
  economic_code: string; national_id: string; license_number: string; city: number; city_name: string;
  province_name: string; address: string; postal_code: string; status: "pending" | "approved" | "rejected" | "suspended";
  status_display: string; rejection_reason: string; price_group: number | null; price_group_name: string | null;
  sales_rep: number | null; sales_rep_name: string | null; credit_limit: number; block_on_credit: boolean;
  accounting_code: string; approved_at: string | null; created_at: string;
  documents: { id: number; kind: string; kind_display: string; file: string; title: string; created_at: string }[];
};

export type User = {
  id: number; username: string; phone: string | null; first_name: string; last_name: string; full_name: string;
  role: Role; role_display: string; is_customer_owner: boolean; can_order: boolean; can_view_finance: boolean;
  job_title: string; customer: Customer | null; region_ids: number[];
  permissions: string[]; scope: "all" | "region" | null; position: number | null; position_name: string | null;
};

export type Product = {
  id: number; name: string; sku: string; category: number; category_name: string; image: string | null;
  description: string; units_per_carton: number; min_order_cartons: number; is_available: boolean;
  product_line: "consumer" | "lab"; kit_type: string; tech_doc: string | null; brochure: string | null;
  carton_price?: number; unit_price?: number; base_price?: number; stock_cartons?: number; is_active?: boolean;
  audiences?: Role[]; accounting_code?: string; prices?: Record<string, number>;
};

export type OrderStatus = "submitted" | "confirmed" | "preparing" | "shipped" | "delivered" | "canceled";
export type Order = {
  id: number; number: string; status: OrderStatus; status_display: string; customer: number; customer_name: string;
  city: number; city_name: string; sales_rep: number | null; sales_rep_name: string | null; total_cartons: number;
  total: number; created_at: string; items_count: number | null; is_lab_order: boolean;
  delivery_address?: string; customer_note?: string; subtotal?: number; discount_percent?: number;
  discount_amount?: number; accounting_ref?: string; accounting_synced_at?: string | null; customer_phone?: string;
  items?: { id: number; product: number; product_name: string; sku: string; units_per_carton: number; cartons: number;
    unit_price: number; line_total: number; image: string | null }[];
  status_logs?: { status: OrderStatus; status_display: string; note: string; created_at: string; changed_by_name: string | null }[];
  flow?: { value: OrderStatus; label: string }[];
  notes?: { id: number; text: string; author_name: string; created_at: string }[];
};

export const ORDER_STATUS: { value: OrderStatus; label: string }[] = [
  { value: "submitted", label: "ثبت شده" }, { value: "confirmed", label: "تأیید شده" },
  { value: "preparing", label: "در حال آماده‌سازی" }, { value: "shipped", label: "ارسال شده" },
  { value: "delivered", label: "تحویل شده" }, { value: "canceled", label: "لغو شده" },
];

export type Province = { id: number; name: string; cities: { id: number; name: string; province: number }[] };
