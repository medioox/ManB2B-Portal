"""Export the database in API shape for the static demo (frontend/src/demo). Usage:
    python manage.py export_demo ../frontend/demo-build/data.json
Media URLs are made relative ("media/…") so the demo can ship them next to the page."""
import json

from django.core.management.base import BaseCommand
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

from apps.accounts.models import Customer, Position, User
from apps.accounts.perms import SECTIONS, permissions_of, scope_of
from apps.accounts.serializers import PositionSerializer
from apps.accounts.serializers import CustomerSerializer
from apps.catalog.models import Category, PriceGroup, Product, VolumeDiscount
from apps.catalog.serializers import (
    CategorySerializer, PriceGroupSerializer, ProductAdminSerializer, VolumeDiscountSerializer,
)
from apps.core.models import Announcement, Notification
from apps.core.serializers import AnnouncementSerializer, NotificationSerializer
from apps.engagement.models import Course, Lesson, QuizQuestion, RewardTier, SalesTarget
from apps.engagement.serializers import (
    CourseSerializer, LessonSerializer, QuestionAdminSerializer, RewardTierSerializer, SalesTargetSerializer,
)
from apps.finance.models import Cheque, Invoice, LedgerEntry, Payment
from apps.finance.serializers import ChequeSerializer, InvoiceSerializer, LedgerEntrySerializer, PaymentSerializer
from apps.integrations.models import SyncLog
from apps.integrations.views import SyncLogSerializer
from apps.marketing.models import Campaign, MarketingAsset
from apps.marketing.serializers import CampaignSerializer, MarketingAssetSerializer
from apps.network.models import AgencyApplication, Province
from apps.network.serializers import AgencyApplicationSerializer, ProvinceSerializer
from apps.orders.models import Order
from apps.orders.serializers import OrderStaffDetailSerializer
from apps.support.models import ReturnRequest, Ticket
from apps.support.serializers import ReturnRequestSerializer, TicketSerializer


def rel(obj):
    """Turn '/media/x' into 'media/x' everywhere."""
    if isinstance(obj, dict):
        return {k: rel(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [rel(v) for v in obj]
    if isinstance(obj, str) and obj.startswith("/media/"):
        return obj[1:]
    return obj


class Command(BaseCommand):
    def add_arguments(self, parser):
        parser.add_argument("out")

    def handle(self, out, **kw):
        many = lambda S, qs: S(qs, many=True).data  # noqa: E731
        users = []
        for u in User.objects.all().prefetch_related("regions").select_related("position"):
            users.append({
                "id": u.id, "username": u.username, "phone": u.phone, "first_name": u.first_name,
                "last_name": u.last_name, "role": u.role,
                "role_display": u.position.name if u.position_id else u.get_role_display(),
                "position": u.position_id, "position_name": u.position.name if u.position_id else None,
                "permissions": permissions_of(u), "scope": scope_of(u) if u.role in ("admin", "sales_manager", "sales_rep", "staff") else None,
                "last_login": u.last_login, "date_joined": u.date_joined,
                "is_customer_owner": u.is_customer_owner, "can_order": u.can_order,
                "can_view_finance": u.can_view_finance, "job_title": u.job_title, "customer_id": u.customer_id,
                "region_ids": [r.id for r in u.regions.all()], "is_active": u.is_active,
                "password": {"admin": "admin1234"}.get(u.username, "demo1234") if u.role in ("admin", "sales_manager", "sales_rep", "staff") else None,
            })
        provinces = many(ProvinceSerializer, Province.objects.prefetch_related("cities"))
        pops = {}
        from apps.network.models import City

        for c in City.objects.all():
            pops[c.id] = c.population
        for p in provinces:
            for c in p["cities"]:
                c["population"] = pops.get(c["id"])
        data = {
            "exported_at": timezone.now(),
            "users": users,
            "positions": [dict(p) for p in PositionSerializer(Position.objects.all(), many=True).data],
            "sections": [{"key": k, "label": l} for k, l in SECTIONS],
            "provinces": provinces,
            "customers": many(CustomerSerializer, Customer.objects.select_related("city__province", "price_group", "sales_rep").prefetch_related("documents")),
            "categories": many(CategorySerializer, Category.objects.all()),
            "products": many(ProductAdminSerializer, Product.objects.select_related("category").prefetch_related("prices")),
            "price_groups": many(PriceGroupSerializer, PriceGroup.objects.all()),
            "discounts": many(VolumeDiscountSerializer, VolumeDiscount.objects.select_related("group")),
            "orders": many(OrderStaffDetailSerializer, Order.objects.select_related("customer", "city", "sales_rep").prefetch_related("items__product", "status_logs__changed_by", "notes__author")),
            "ledger": many(LedgerEntrySerializer, LedgerEntry.objects.select_related("customer")),
            "cheques": many(ChequeSerializer, Cheque.objects.select_related("customer")),
            "invoices": many(InvoiceSerializer, Invoice.objects.select_related("customer", "order")),
            "payments": [{**p, "customer": c} for p, c in zip(many(PaymentSerializer, Payment.objects.all()), Payment.objects.values_list("customer_id", flat=True))],
            "announcements": many(AnnouncementSerializer, Announcement.objects.all()),
            "notifications": [{**n, "user": uid} for n, uid in zip(many(NotificationSerializer, Notification.objects.all()), Notification.objects.values_list("user_id", flat=True))],
            "campaigns": many(CampaignSerializer, Campaign.objects.all()),
            "assets": many(MarketingAssetSerializer, MarketingAsset.objects.select_related("campaign")),
            "targets": many(SalesTargetSerializer, SalesTarget.objects.select_related("customer")),
            "tiers": many(RewardTierSerializer, RewardTier.objects.all()),
            "courses": many(CourseSerializer, Course.objects.all()),
            "lessons": many(LessonSerializer, Lesson.objects.all()),
            "questions": many(QuestionAdminSerializer, QuizQuestion.objects.all()),
            "returns": many(ReturnRequestSerializer, ReturnRequest.objects.select_related("order", "customer").prefetch_related("images")),
            "tickets": many(TicketSerializer, Ticket.objects.select_related("customer", "order").prefetch_related("messages__author")),
            "applications": many(AgencyApplicationSerializer, AgencyApplication.objects.select_related("city__province")),
            "synclogs": many(SyncLogSerializer, SyncLog.objects.all()),
        }
        with open(out, "w", encoding="utf-8") as f:
            json.dump(rel(json.loads(json.dumps(data, cls=DjangoJSONEncoder))), f, ensure_ascii=False, separators=(",", ":"))
        self.stdout.write(f"wrote {out}")
