from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Customer, User
from apps.accounts.roles import Role
from apps.catalog.models import Product, discount_percent_for, unit_price_for
from apps.core.services import notify, notify_customer
from apps.finance.models import credit_summary

from .models import Order, OrderItem, OrderStatusLog


def quote(customer, lines):
    """Price a list of (product, cartons). Returns dict with items and totals; validates rules."""
    group = customer.price_group
    errors, items = [], []
    total_cartons = 0
    subtotal = Decimal(0)
    for product, cartons in lines:
        if not product.is_active or not product.is_available:
            errors.append(f"«{product.name}» در حال حاضر موجود نیست.")
        if cartons < product.min_order_cartons:
            errors.append(f"حداقل سفارش «{product.name}» {product.min_order_cartons} کارتن است.")
        price = unit_price_for(product, group)
        line_total = price * cartons
        subtotal += line_total
        total_cartons += cartons
        items.append({"product": product, "cartons": cartons, "unit_price": price, "line_total": line_total})
    pct = discount_percent_for(total_cartons, group)
    discount = (subtotal * pct / 100).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return {
        "items": items, "errors": errors, "total_cartons": total_cartons, "subtotal": subtotal,
        "discount_percent": pct, "discount_amount": discount, "total": subtotal - discount,
    }


def check_credit(customer, amount, exclude_order=None):
    s = credit_summary(customer)
    available = s["available_credit"]
    if exclude_order is not None:
        available += exclude_order.total
    if customer.block_on_credit and customer.credit_limit > 0 and amount > available:
        raise ValidationError(
            {"credit": [f"اعتبار شما کافی نیست. اعتبار باقی‌مانده: {int(max(available, 0)):,} ریال".replace(",", "٬")]}
        )
    return s


def _staff_to_notify(customer):
    from apps.accounts.perms import users_with_perm

    users = [u for u in users_with_perm("orders_manage") if u.role != Role.SALES_REP and u.role != Role.ADMIN]
    if customer.sales_rep:
        users.append(customer.sales_rep)
    return users


@transaction.atomic
def place_order(user, lines, delivery_address, note="", is_lab=False):
    # Row lock on the customer serialises concurrent checkouts so credit can't be overspent.
    customer = Customer.objects.select_for_update().get(pk=user.customer_id)
    if not lines:
        raise ValidationError({"cart": ["سبد خرید خالی است."]})
    q = quote(customer, lines)
    if q["errors"]:
        raise ValidationError({"items": q["errors"]})
    check_credit(customer, q["total"])
    order = Order.objects.create(
        customer=customer, created_by=user, sales_rep=customer.sales_rep, city=customer.city,
        delivery_address=delivery_address or customer.address, customer_note=note,
        total_cartons=q["total_cartons"], subtotal=q["subtotal"], discount_percent=q["discount_percent"],
        discount_amount=q["discount_amount"], total=q["total"], is_lab_order=is_lab,
    )
    OrderItem.objects.bulk_create([
        OrderItem(order=order, product=i["product"], product_name=i["product"].name, sku=i["product"].sku,
                  units_per_carton=i["product"].units_per_carton, cartons=i["cartons"],
                  unit_price=i["unit_price"], line_total=i["line_total"])
        for i in q["items"]
    ])
    OrderStatusLog.objects.create(order=order, status=order.status, changed_by=user)
    for staff in _staff_to_notify(customer):
        notify(staff, f"سفارش جدید {order.number}", f"{customer.business_name} - {int(order.total):,} ریال",
               link=f"/admin/orders/detail?id={order.id}")
    notify_customer(customer, f"سفارش {order.number} ثبت شد", "پس از بررسی، وضعیت از طریق پیامک اطلاع داده می‌شود.",
                    link=f"/orders/detail?id={order.id}", sms=True)
    return order


ALLOWED_TRANSITIONS = {
    Order.Status.SUBMITTED: {Order.Status.CONFIRMED, Order.Status.CANCELED},
    Order.Status.CONFIRMED: {Order.Status.PREPARING, Order.Status.CANCELED},
    Order.Status.PREPARING: {Order.Status.SHIPPED, Order.Status.CANCELED},
    Order.Status.SHIPPED: {Order.Status.DELIVERED},
    Order.Status.DELIVERED: set(),
    Order.Status.CANCELED: set(),
}


@transaction.atomic
def change_status(order, new_status, by, note=""):
    if new_status not in ALLOWED_TRANSITIONS[order.status]:
        raise ValidationError({"status": [
            f"تغییر وضعیت از «{order.get_status_display()}» به «{Order.Status(new_status).label}» مجاز نیست."]})
    order.status = new_status
    order.save(update_fields=["status", "updated_at"])
    OrderStatusLog.objects.create(order=order, status=new_status, changed_by=by, note=note)
    notify_customer(order.customer, f"سفارش {order.number}: {order.get_status_display()}", note,
                    link=f"/orders/detail?id={order.id}", sms=True)
    if new_status == Order.Status.CONFIRMED:
        from apps.integrations.tasks import push_order_to_accounting

        transaction.on_commit(lambda: push_order_to_accounting.delay(order.id))
    return order


@transaction.atomic
def edit_items(order, items, by):
    """Staff edit of an order's lines before preparation starts."""
    if order.status not in (Order.Status.SUBMITTED, Order.Status.CONFIRMED):
        raise ValidationError({"items": ["فقط سفارش‌های ثبت‌شده یا تأییدشده قابل ویرایش هستند."]})
    products = {p.id: p for p in Product.objects.filter(id__in=[int(i["product"]) for i in items])}
    lines = [(products[int(i["product"])], int(i["cartons"])) for i in items if int(i["cartons"]) > 0]
    if not lines:
        raise ValidationError({"items": ["سفارش نمی‌تواند خالی باشد؛ برای حذف، آن را لغو کنید."]})
    q = quote(order.customer, lines)
    if q["errors"]:
        raise ValidationError({"items": q["errors"]})
    order.items.all().delete()
    OrderItem.objects.bulk_create([
        OrderItem(order=order, product=i["product"], product_name=i["product"].name, sku=i["product"].sku,
                  units_per_carton=i["product"].units_per_carton, cartons=i["cartons"],
                  unit_price=i["unit_price"], line_total=i["line_total"])
        for i in q["items"]
    ])
    for f in ("total_cartons", "subtotal", "discount_percent", "discount_amount", "total"):
        setattr(order, f, q[f])
    order.save()
    OrderStatusLog.objects.create(order=order, status=order.status, changed_by=by, note="اقلام سفارش ویرایش شد")
    return order
