import datetime as dt
import hashlib
import io
import json

from django.core.cache import cache
from django.core.serializers.json import DjangoJSONEncoder
from django.http import HttpResponse
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsStaffRole

from .services import dashboard


def _params(request):
    today = timezone.localdate()
    p = request.query_params
    start = dt.date.fromisoformat(p.get("from") or (today - dt.timedelta(days=180)).isoformat())
    end = dt.date.fromisoformat(p.get("to") or today.isoformat())
    filters = {k: p.get(k) for k in ("city", "province", "sales_rep", "customer_type") if p.get(k)}
    return start, end, p.get("granularity", "month"), filters, int(p.get("inactive_days", 30))


def _cached_dashboard(request):
    args = _params(request)
    key = "dash:" + hashlib.md5(
        json.dumps([request.user.id, request.user.role, *map(str, args)], sort_keys=True).encode()
    ).hexdigest()
    data = cache.get(key)
    if data is None:
        data = json.loads(json.dumps(dashboard(request.user, *args), cls=DjangoJSONEncoder))
        cache.set(key, data, 120)
    return data


@api_view(["GET"])
@permission_classes([IsStaffRole])
def manager_dashboard(request):
    return Response(_cached_dashboard(request))


SHEETS = [
    ("فروش زمانی", "series", [("label", "دوره"), ("orders", "تعداد سفارش"), ("total", "مبلغ (ریال)")]),
    ("شهرها", "by_city", [("name", "شهر"), ("orders", "تعداد سفارش"), ("total", "مبلغ (ریال)")]),
    ("محصولات", "by_product", [("name", "محصول"), ("cartons", "کارتن"), ("total", "مبلغ (ریال)")]),
    ("نماینده‌ها و مشتری‌ها", "by_customer", [("name", "مشتری"), ("orders", "تعداد سفارش"), ("total", "مبلغ (ریال)")]),
    ("کارشناسان فروش", "by_rep", [("name", "کارشناس"), ("orders", "تعداد سفارش"), ("total", "مبلغ (ریال)")]),
    ("نماینده‌های غیرفعال", "inactive", [("business_name", "نام"), ("city_name", "شهر"), ("phone", "تلفن"),
                                         ("last_order", "آخرین سفارش")]),
]


@api_view(["GET"])
@permission_classes([IsStaffRole])
def export_excel(request):
    data = _cached_dashboard(request)
    wb = Workbook()
    wb.remove(wb.active)
    head_fill = PatternFill("solid", fgColor="1F3A5F")
    for title, key, cols in SHEETS + [("مطالبات معوق", "receivables.rows",
                                       [("name", "مشتری"), ("phone", "تلفن"), ("balance", "مانده"),
                                        ("overdue", "معوق"), ("oldest_due", "قدیمی‌ترین سررسید")])]:
        ws = wb.create_sheet(title)
        ws.sheet_view.rightToLeft = True
        rows = data
        for part in key.split("."):
            rows = rows[part]
        ws.append([c[1] for c in cols])
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = head_fill
            cell.alignment = Alignment(horizontal="center")
        for r in rows:
            ws.append([r.get(c[0]) for c in cols])
        for i, _ in enumerate(cols, 1):
            ws.column_dimensions[chr(64 + i)].width = 24
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                if isinstance(cell.value, int):
                    cell.number_format = "#,##0"
    buf = io.BytesIO()
    wb.save(buf)
    resp = HttpResponse(buf.getvalue(),
                        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    resp["Content-Disposition"] = f'attachment; filename="man-report-{timezone.localdate()}.xlsx"'
    return resp
