import datetime as dt

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Customer
from apps.catalog.models import Product
from apps.finance.models import Invoice, LedgerEntry
from apps.orders.models import Order

from .accounting import get_accounting
from .models import SyncLog


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=30, retry_kwargs={"max_retries": 3})
def sync_products(self):
    """Pull stock & base price from accounting. Runs every 15 min via beat."""
    rows = get_accounting().fetch_products()
    by_code = {r["code"]: r for r in rows}
    n = 0
    for p in Product.objects.filter(is_active=True):
        r = by_code.get(p.accounting_code or p.sku)
        if not r:
            continue
        p.stock_cartons = r.get("stock_cartons", p.stock_cartons)
        p.is_available = p.stock_cartons > 0
        if r.get("base_price"):
            p.base_price = r["base_price"]
        p.save(update_fields=["stock_cartons", "is_available", "base_price", "updated_at"])
        n += 1
    from apps.catalog.views import bump_catalog_version

    bump_catalog_version()
    SyncLog.objects.create(kind=SyncLog.Kind.PRODUCTS, items=n, message=f"{n} کالا به‌روزرسانی شد")
    return n


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=60, retry_kwargs={"max_retries": 8})
def push_order_to_accounting(self, order_id):
    order = Order.objects.select_related("customer").get(pk=order_id)
    if order.accounting_ref:
        return order.accounting_ref  # idempotent: already pushed
    try:
        res = get_accounting().push_order(order)
    except Exception as e:
        SyncLog.objects.create(kind=SyncLog.Kind.ORDER, success=False, message=f"{order.number}: {e}")
        raise
    order.accounting_ref = res.get("ref", "")
    order.accounting_synced_at = timezone.now()
    order.save(update_fields=["accounting_ref", "accounting_synced_at"])
    SyncLog.objects.create(kind=SyncLog.Kind.ORDER, items=1, message=f"سفارش {order.number} ← {order.accounting_ref}")
    return order.accounting_ref


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=60, retry_kwargs={"max_retries": 3})
def pull_invoices(self):
    """Import official invoices; each new invoice becomes a debit on the customer's ledger."""
    since = (timezone.localdate() - dt.timedelta(days=30)).isoformat()
    created = 0
    for r in get_accounting().fetch_invoices(since):
        if Invoice.objects.filter(external_id=r["external_id"]).exists():
            continue
        customer = (Customer.objects.filter(accounting_code=r["customer_code"]).first()
                    or Customer.objects.filter(pk=int(r["customer_code"]) if str(r["customer_code"]).isdigit() else 0).first())
        if not customer:
            continue
        order = Order.objects.filter(accounting_ref=r.get("order_ref")).first() if r.get("order_ref") else None
        with transaction.atomic():
            Invoice.objects.create(customer=customer, order=order, number=r["number"], amount=r["amount"],
                                   issued_on=r["issued_on"], external_id=r["external_id"])
            LedgerEntry.objects.create(customer=customer, kind=LedgerEntry.Kind.INVOICE, debit=r["amount"],
                                       description=f"فاکتور {r['number']}", reference=r["number"],
                                       date=r["issued_on"], external_id=r["external_id"],
                                       due_date=dt.date.fromisoformat(r["issued_on"]) + dt.timedelta(days=45))
        created += 1
    SyncLog.objects.create(kind=SyncLog.Kind.INVOICES, items=created, message=f"{created} فاکتور جدید")
    return created
