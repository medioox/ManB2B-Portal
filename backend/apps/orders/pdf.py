from apps.core.pdf import build_table_doc, jdate, money


def proforma_pdf(order):
    c = order.customer
    meta = [
        ("شماره", order.number),
        ("تاریخ", jdate(order.created_at)),
        ("خریدار", f"{c.business_name} ({c.owner_name})"),
        ("کد اقتصادی", c.economic_code or "-"),
        ("تلفن", c.phone),
        ("آدرس تحویل", f"{order.city.name} - {order.delivery_address}"),
    ]
    headers = ["ردیف", "شرح کالا", "کد کالا", "کارتن", "قیمت کارتن", "مبلغ (ریال)"]
    rows = [
        [i, f"{it.product_name} ({it.units_per_carton} عددی)", it.sku, it.cartons, money(it.unit_price),
         money(it.line_total)]
        for i, it in enumerate(order.items.all(), 1)
    ]
    totals = [("جمع کل", money(order.subtotal) + " ریال")]
    if order.discount_amount:
        totals.append((f"تخفیف حجمی {format(order.discount_percent.normalize(), 'f')}٪", money(order.discount_amount) + " ریال"))
    totals.append(("مبلغ قابل پرداخت", money(order.total) + " ریال"))
    return build_table_doc(
        "پیش‌فاکتور", meta, headers, rows, totals,
        footer_note="این پیش‌فاکتور تا ۳ روز کاری معتبر است و فاکتور رسمی پس از ارسال صادر می‌شود.",
    )
