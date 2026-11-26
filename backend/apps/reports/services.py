import datetime as dt
from collections import OrderedDict

import jdatetime
from django.db.models import Count, F, Max, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.accounts.models import Customer
from apps.accounts.scoping import customers_for, scope_by_customer
from apps.finance.models import LedgerEntry
from apps.orders.models import Order, OrderItem

COUNTED = [Order.Status.CONFIRMED, Order.Status.PREPARING, Order.Status.SHIPPED, Order.Status.DELIVERED,
           Order.Status.SUBMITTED]

JMONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]


def _orders(user, start, end, filters):
    qs = scope_by_customer(Order.objects.filter(status__in=COUNTED), user)
    qs = qs.filter(created_at__date__gte=start, created_at__date__lte=end)
    if filters.get("city"):
        qs = qs.filter(city_id=filters["city"])
    if filters.get("province"):
        qs = qs.filter(city__province_id=filters["province"])
    if filters.get("sales_rep"):
        qs = qs.filter(sales_rep_id=filters["sales_rep"])
    if filters.get("customer_type"):
        qs = qs.filter(customer__type=filters["customer_type"])
    return qs


def sales_over_time(qs, granularity):
    daily = qs.annotate(d=TruncDate("created_at")).values("d").annotate(total=Sum("total"), n=Count("id")).order_by("d")
    buckets = OrderedDict()
    for row in daily:
        jd = jdatetime.date.fromgregorian(date=row["d"])
        if granularity == "day":
            key, label = row["d"].isoformat(), jd.strftime("%m/%d")
        elif granularity == "week":
            monday = row["d"] - dt.timedelta(days=(row["d"].weekday() + 2) % 7)  # Persian week starts Saturday
            key, label = monday.isoformat(), jdatetime.date.fromgregorian(date=monday).strftime("%m/%d")
        else:
            key, label = f"{jd.year}-{jd.month:02d}", f"{JMONTHS[jd.month - 1]} {jd.year % 100:02d}"
        b = buckets.setdefault(key, {"key": key, "label": label, "total": 0, "orders": 0})
        b["total"] += int(row["total"] or 0)
        b["orders"] += row["n"]
    return list(buckets.values())


def dashboard(user, start, end, granularity="month", filters=None, inactive_days=30):
    filters = filters or {}
    qs = _orders(user, start, end, filters)
    span = (end - start).days + 1
    prev = _orders(user, start - dt.timedelta(days=span), start - dt.timedelta(days=1), filters)
    agg = qs.aggregate(total=Sum("total"), n=Count("id"), cartons=Sum("total_cartons"),
                       customers=Count("customer", distinct=True))
    prev_total = prev.aggregate(t=Sum("total"))["t"] or 0

    by_city = list(qs.values(name=F("city__name")).annotate(total=Sum("total"), orders=Count("id")).order_by("-total")[:15])
    by_customer = list(
        qs.values("customer_id", name=F("customer__business_name"), type=F("customer__type"))
        .annotate(total=Sum("total"), orders=Count("id")).order_by("-total")[:15]
    )
    by_rep = list(
        qs.exclude(sales_rep=None)
        .values("sales_rep_id", first=F("sales_rep__first_name"), last=F("sales_rep__last_name"))
        .annotate(total=Sum("total"), orders=Count("id")).order_by("-total")
    )
    by_product = list(
        OrderItem.objects.filter(order__in=qs).values("product_id", name=F("product_name"))
        .annotate(total=Sum("line_total"), cartons=Sum("cartons")).order_by("-total")[:15]
    )

    cutoff = timezone.now() - dt.timedelta(days=inactive_days)
    inactive = list(
        customers_for(user).filter(status=Customer.Status.APPROVED, type=Customer.Type.DISTRIBUTOR)
        .annotate(last_order=Max("orders__created_at"))
        .filter(Q(last_order__lt=cutoff) | Q(last_order__isnull=True))
        .values("id", "business_name", "phone", "last_order", city_name=F("city__name"))
        .order_by(F("last_order").asc(nulls_first=True))[:50]
    )
    return {
        "range": {"start": start, "end": end},
        "kpis": {
            "sales": int(agg["total"] or 0), "orders": agg["n"], "cartons": int(agg["cartons"] or 0),
            "active_customers": agg["customers"],
            "avg_order": int((agg["total"] or 0) / agg["n"]) if agg["n"] else 0,
            "growth": float(round(((agg["total"] or 0) - prev_total) * 100 / prev_total, 1)) if prev_total else None,
            "pending_approvals": customers_for(user).filter(status=Customer.Status.PENDING).count(),
            "open_orders": scope_by_customer(Order.objects.filter(status__in=[Order.Status.SUBMITTED]), user).count(),
        },
        "series": sales_over_time(qs, granularity),
        "by_city": [{**r, "total": int(r["total"])} for r in by_city],
        "by_customer": [{**r, "total": int(r["total"])} for r in by_customer],
        "by_rep": [{"id": r["sales_rep_id"], "name": f"{r['first']} {r['last']}", "total": int(r["total"]),
                    "orders": r["orders"]} for r in by_rep],
        "by_product": [{**r, "total": int(r["total"])} for r in by_product],
        "inactive": inactive,
        "receivables": receivables(user),
    }


def receivables(user, limit=50):
    today = timezone.localdate()
    qs = scope_by_customer(LedgerEntry.objects.all(), user)
    rows = (
        qs.values("customer_id", name=F("customer__business_name"), phone=F("customer__phone"))
        .annotate(
            balance=Sum("debit") - Sum("credit"),
            paid=Sum("credit"),
            overdue=Sum("debit", filter=Q(due_date__lt=today)),
            oldest_due=Max("due_date", filter=Q(due_date__lt=today, debit__gt=0)),
        )
        .filter(balance__gt=0)
        .order_by("-balance")[:limit]
    )
    total = 0
    out = []
    for r in rows:
        # FIFO approximation: payments settle the oldest debts first.
        overdue = min(max(0, int((r["overdue"] or 0) - (r["paid"] or 0))), int(r["balance"]))
        total += overdue
        out.append({"customer_id": r["customer_id"], "name": r["name"], "phone": r["phone"],
                    "balance": int(r["balance"]), "overdue": overdue,
                    "oldest_due": r["oldest_due"]})
    return {"rows": out, "total_overdue": total}
