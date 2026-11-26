"""End-to-end API tests for the critical B2B flows."""
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import Customer, User
from apps.catalog.models import Category, PriceGroup, Product, ProductPrice, VolumeDiscount
from apps.finance.models import LedgerEntry
from apps.network.models import City, Province
from apps.orders.models import Order


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, OTP_DEBUG_ECHO=True,
                   CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
class FlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.prov = Province.objects.create(name="فارس")
        self.city = City.objects.create(province=self.prov, name="شیراز")
        self.group = PriceGroup.objects.create(name="A")
        cat = Category.objects.create(name="c", slug="c")
        self.p1 = Product.objects.create(name="P1", sku="P1", category=cat, units_per_carton=12, min_order_cartons=2,
                                         base_price=1000)
        self.p_org = Product.objects.create(name="ORG", sku="P2", category=cat, base_price=5000, audiences=["organization"])
        ProductPrice.objects.create(group=self.group, product=self.p1, carton_price=800)
        VolumeDiscount.objects.create(min_cartons=50, percent=Decimal("5"))
        self.customer = Customer.objects.create(type="distributor", business_name="B", owner_name="O", phone="09121111111",
                                                city=self.city, address="addr", status="approved", price_group=self.group,
                                                credit_limit=100000)
        self.owner = User.objects.create(username="u1", phone="09121111111", role="distributor", customer=self.customer,
                                         is_customer_owner=True)
        self.manager = User.objects.create(username="m", role="sales_manager")
        self.manager.set_password("x12345678")
        self.manager.save()
        self.c = APIClient()

    def login_otp(self, phone):
        r = self.c.post("/api/v1/auth/otp/request/", {"phone": phone}, format="json")
        code = r.data["debug_code"]
        return self.c.post("/api/v1/auth/otp/verify/", {"phone": phone, "code": code}, format="json")

    def test_otp_login_and_wrong_code(self):
        self.c.post("/api/v1/auth/otp/request/", {"phone": "۰۹۱۲۱۱۱۱۱۱۱"}, format="json")
        r = self.c.post("/api/v1/auth/otp/verify/", {"phone": "09121111111", "code": "000000"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.login_otp("09121111111")
        self.assertTrue(r.data["registered"])
        self.assertIn("access", r.data)

    def test_registration_goes_to_pending(self):
        r = self.login_otp("09129999999")
        self.assertFalse(r.data["registered"])
        r = self.c.post("/api/v1/auth/register/", {
            "registration_token": r.data["registration_token"], "first_name": "a", "last_name": "b", "type": "store",
            "business_name": "S", "city": self.city.id, "address": "x",
        })
        self.assertEqual(r.status_code, 201, r.data)
        self.c.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["access"])
        self.assertEqual(self.c.get("/api/v1/auth/me/").data["customer"]["status"], "pending")
        self.assertEqual(self.c.get("/api/v1/products/").status_code, 403)

    def test_customer_price_visibility_and_order(self):
        self.c.force_authenticate(self.owner)
        r = self.c.get("/api/v1/products/")
        names = [p["name"] for p in r.data["results"]]
        self.assertIn("P1", names)
        self.assertNotIn("ORG", names)  # organization-only product hidden from distributor
        self.assertEqual(r.data["results"][0]["carton_price"], 800)

        r = self.c.post("/api/v1/cart/", {"product": self.p1.id, "cartons": 1}, format="json")
        self.assertTrue(r.data["errors"])  # below min order
        self.c.post("/api/v1/cart/", {"product": self.p1.id, "cartons": 60}, format="json")
        r = self.c.get("/api/v1/cart/")
        self.assertEqual(r.data["discount_percent"], Decimal("5"))
        self.assertEqual(r.data["total"], Decimal(800 * 60 * 95 / 100))
        r = self.c.post("/api/v1/checkout/", {}, format="json", HTTP_IDEMPOTENCY_KEY="k1")
        self.assertEqual(r.status_code, 201, r.data)
        r2 = self.c.post("/api/v1/checkout/", {}, format="json", HTTP_IDEMPOTENCY_KEY="k1")
        self.assertEqual(r2.data["id"], r.data["id"])
        self.assertEqual(Order.objects.count(), 1)

    def test_credit_limit_blocks_order(self):
        LedgerEntry.objects.create(customer=self.customer, kind="invoice", debit=99000, date="2026-01-01")
        self.c.force_authenticate(self.owner)
        self.c.post("/api/v1/cart/", {"product": self.p1.id, "cartons": 10}, format="json")
        r = self.c.post("/api/v1/checkout/", {}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("credit", r.data["errors"])

    def test_status_flow_and_scoping(self):
        self.c.force_authenticate(self.owner)
        self.c.post("/api/v1/cart/", {"product": self.p1.id, "cartons": 2}, format="json")
        oid = self.c.post("/api/v1/checkout/", {}, format="json").data["id"]
        # customer cannot change status
        self.assertEqual(self.c.post(f"/api/v1/orders/{oid}/set_status/", {"status": "confirmed"}).status_code, 403)
        self.c.force_authenticate(self.manager)
        self.assertEqual(self.c.post(f"/api/v1/orders/{oid}/set_status/", {"status": "shipped"}).status_code, 400)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.c.post(f"/api/v1/orders/{oid}/set_status/", {"status": "confirmed"})
        self.assertEqual(r.data["status"], "confirmed")
        self.assertTrue(Order.objects.get(pk=oid).accounting_ref)  # pushed to accounting (eager celery)
        # a sales rep from another region sees nothing
        rep = User.objects.create(username="rep", role="sales_rep")
        self.c.force_authenticate(rep)
        self.assertEqual(self.c.get("/api/v1/orders/").data["count"], 0)
        rep.regions.add(self.prov)
        self.assertEqual(self.c.get("/api/v1/orders/").data["count"], 1)

    def test_sub_user_without_finance(self):
        sub = User.objects.create(username="s", phone="09120000009", role="distributor", customer=self.customer,
                                  can_order=True, can_view_finance=False)
        self.c.force_authenticate(sub)
        self.assertEqual(self.c.get("/api/v1/finance/summary/").status_code, 403)
        self.assertEqual(self.c.get("/api/v1/sub-users/").status_code, 403)

    def test_health(self):
        self.assertEqual(self.c.get("/api/v1/health/live/").status_code, 200)
        self.assertEqual(self.c.get("/api/v1/health/ready/").status_code, 200)
