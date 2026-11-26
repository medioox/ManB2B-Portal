"""Populate a realistic demo dataset.  Usage: python manage.py seed_demo [--reset]"""
import datetime as dt
import random
from decimal import Decimal

import jdatetime
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Customer, CustomerDocument, Position, User
from apps.accounts.roles import Role
from apps.catalog.models import Category, PriceGroup, Product, ProductPrice, VolumeDiscount
from apps.core.demo_images import banner_image, product_image, text_file
from apps.core.models import Announcement, Notification
from apps.engagement.models import Course, Lesson, QuizQuestion, RewardTier, SalesTarget
from apps.finance.models import Cheque, Invoice, LedgerEntry, Payment
from apps.integrations.models import SyncLog
from apps.marketing.models import Campaign, MarketingAsset
from apps.network.models import AgencyApplication, City, Province
from apps.orders.models import Order, OrderItem, OrderNote, OrderStatusLog
from apps.support.models import ReturnRequest, Ticket, TicketMessage

CITIES = {
    "تهران": [("تهران", 35.69, 51.39, 8700000), ("ری", 35.59, 51.43, 400000), ("اسلامشهر", 35.55, 51.23, 450000)],
    "اصفهان": [("اصفهان", 32.65, 51.67, 2000000), ("کاشان", 33.98, 51.43, 300000), ("نجف‌آباد", 32.63, 51.36, 240000)],
    "فارس": [("شیراز", 29.59, 52.58, 1600000), ("مرودشت", 29.87, 52.80, 150000), ("کازرون", 29.62, 51.65, 100000)],
    "خراسان رضوی": [("مشهد", 36.30, 59.60, 3000000), ("نیشابور", 36.21, 58.80, 260000), ("سبزوار", 36.21, 57.68, 240000)],
    "آذربایجان شرقی": [("تبریز", 38.08, 46.29, 1600000), ("مراغه", 37.39, 46.24, 170000)],
    "خوزستان": [("اهواز", 31.32, 48.67, 1300000), ("دزفول", 32.38, 48.40, 260000), ("آبادان", 30.34, 48.30, 230000)],
    "گیلان": [("رشت", 37.28, 49.58, 700000), ("انزلی", 37.47, 49.46, 120000)],
    "مازندران": [("ساری", 36.56, 53.06, 350000), ("بابل", 36.54, 52.68, 250000)],
    "کرمان": [("کرمان", 30.28, 57.08, 750000), ("رفسنجان", 30.40, 55.99, 160000)],
    "البرز": [("کرج", 35.84, 50.94, 1900000)],
    "قم": [("قم", 34.64, 50.88, 1300000)],
    "یزد": [("یزد", 31.90, 54.36, 550000)],
    "همدان": [("همدان", 34.80, 48.51, 550000)],
    "کرمانشاه": [("کرمانشاه", 34.31, 47.07, 950000)],
    "هرمزگان": [("بندرعباس", 27.18, 56.27, 530000)],
}

CATS = [
    ("شوینده‌های ظرف", "dish", "consumer"), ("شوینده‌های لباس", "laundry", "consumer"),
    ("بهداشت دست و بدن", "hygiene", "consumer"), ("پاک‌کننده‌های سطوح", "surface", "consumer"),
    ("محصولات صنعتی و سازمانی", "industrial", "consumer"),
    ("کیت‌های بیوشیمی", "biochem", "lab"), ("کیت‌های هماتولوژی", "hematology", "lab"),
]

PRODUCTS = [
    # name, sku, cat, units/carton, min, base price per carton (Rial), color, audiences, label
    ("مایع ظرفشویی مَن لیمو ۷۵۰ گرمی", "MD-750-L", "dish", 12, 2, 9_600_000, (240, 200, 60), [], ""),
    ("مایع ظرفشویی مَن سیب ۷۵۰ گرمی", "MD-750-A", "dish", 12, 2, 9_600_000, (130, 190, 90), [], ""),
    ("مایع ظرفشویی مَن ۴ لیتری", "MD-4L", "dish", 4, 2, 13_800_000, (230, 180, 70), [], ""),
    ("قرص ماشین ظرفشویی مَن ۳۰ عددی", "MD-TAB30", "dish", 10, 1, 19_500_000, (90, 140, 200), [], "جدید"),
    ("پودر لباسشویی دستی مَن ۵۰۰ گرمی", "ML-P500", "laundry", 24, 2, 12_000_000, (90, 150, 220), [], ""),
    ("پودر ماشین لباسشویی مَن ۳ کیلویی", "ML-P3K", "laundry", 6, 2, 21_600_000, (60, 110, 190), [], ""),
    ("مایع لباسشویی مَن ۲.۵ لیتری", "ML-L25", "laundry", 6, 2, 18_000_000, (120, 90, 180), [], ""),
    ("نرم‌کننده‌ی حوله و لباس مَن", "ML-SOFT", "laundry", 6, 1, 14_400_000, (220, 140, 180), [], ""),
    ("مایع دستشویی مَن صدفی ۵۰۰ گرمی", "MH-500", "hygiene", 12, 2, 8_400_000, (240, 170, 190), [], ""),
    ("شامپو بدن مَن ۴۰۰ میلی", "MH-SB400", "hygiene", 12, 1, 10_800_000, (170, 120, 200), [], ""),
    ("ژل ضدعفونی دست مَن", "MH-GEL", "hygiene", 24, 1, 9_000_000, (120, 200, 210), [], ""),
    ("شیشه‌پاک‌کن مَن ۵۰۰ میلی", "MS-GLASS", "surface", 12, 1, 7_200_000, (110, 180, 230), [], ""),
    ("سفیدکننده‌ی مَن ۴ لیتری", "MS-BLCH4", "surface", 4, 2, 9_200_000, (200, 210, 220), [], ""),
    ("جرم‌گیر سرویس بهداشتی مَن", "MS-WC", "surface", 12, 1, 9_600_000, (90, 170, 160), [], ""),
    ("پودر صنعتی لباسشویی مَن ۲۰ کیلویی", "MI-P20", "industrial", 1, 3, 32_000_000, (40, 80, 150),
     ["organization", "distributor"], "سازمانی"),
    ("مایع ظرفشویی صنعتی مَن ۲۰ لیتری", "MI-D20", "industrial", 1, 3, 24_000_000, (200, 160, 40),
     ["organization", "distributor"], "سازمانی"),
    ("نرم‌کننده‌ی صنعتی هتلی مَن ۲۰ لیتری", "MI-S20", "industrial", 1, 2, 27_500_000, (190, 110, 160),
     ["organization"], "هتلی"),
    ("کیت گلوکز (GOD-PAP) ۴×۱۰۰ میلی", "LB-GLU", "biochem", 1, 1, 18_500_000, (80, 160, 120), [], "بیوشیمی"),
    ("کیت کلسترول ۲×۱۰۰ میلی", "LB-CHOL", "biochem", 1, 1, 22_000_000, (220, 150, 60), [], "بیوشیمی"),
    ("کیت تری‌گلیسرید ۲×۵۰ میلی", "LB-TG", "biochem", 1, 1, 26_000_000, (200, 90, 90), [], "بیوشیمی"),
    ("کیت اوره ۲×۱۰۰ میلی", "LB-UREA", "biochem", 1, 1, 17_000_000, (100, 130, 200), [], "بیوشیمی"),
    ("کیت کراتینین ۲×۱۰۰ میلی", "LB-CREA", "biochem", 1, 1, 15_500_000, (150, 110, 190), [], "بیوشیمی"),
    ("دایلوئنت هماتولوژی ۲۰ لیتری", "LH-DIL", "hematology", 1, 1, 38_000_000, (70, 120, 170), [], "هماتولوژی"),
    ("محلول لایز هماتولوژی ۵۰۰ میلی", "LH-LYSE", "hematology", 1, 1, 21_000_000, (190, 80, 110), [], "هماتولوژی"),
    ("کنترل خون سه‌سطحی", "LH-CTRL", "hematology", 1, 1, 46_000_000, (160, 60, 60), [], "هماتولوژی"),
]

DISTRIBUTORS = [
    ("پخش البرز شیراز", "رضا کریمی", "شیراز"), ("پخش سپاهان", "مهدی احمدی", "اصفهان"),
    ("بازرگانی توس", "حسین رضایی", "مشهد"), ("پخش آذر", "علی محمدی", "تبریز"),
    ("پخش کارون", "سعید موسوی", "اهواز"), ("پخش پایتخت", "محمد حسینی", "تهران"),
    ("پخش گیلان‌سبز", "امیر نوری", "رشت"), ("پخش کویر", "جواد صادقی", "یزد"),
    ("پخش کرمان‌تجارت", "نادر فرهادی", "کرمان"), ("پخش البرز کرج", "کامران جعفری", "کرج"),
]
STORES = [
    ("سوپرمارکت ستاره", "مریم کاظمی", "تهران"), ("هایپر خانواده", "زهرا اکبری", "تهران"),
    ("فروشگاه برکت", "فاطمه قاسمی", "اصفهان"), ("سوپر پارس", "بهرام شریفی", "شیراز"),
    ("فروشگاه نیک", "پریسا رحیمی", "مشهد"), ("سوپر محله", "یوسف باقری", "قم"),
]
ORGS = [
    ("هتل پارسیان شیراز", "مدیر خرید هتل", "شیراز"), ("خشکشویی سپید", "کاوه نادری", "تهران"),
    ("بیمارستان مهر", "واحد تدارکات", "مشهد"),
]
LABS = [("آزمایشگاه پاستور", "دکتر نیلوفر امینی", "تهران"), ("آزمایشگاه دی", "دکتر کیان راد", "اصفهان")]


def put(field, content, save=False):
    field.save(content.name, content, save=save)


def jago(days):
    return timezone.now() - dt.timedelta(days=days, hours=random.randint(0, 10))


class Command(BaseCommand):
    help = "Seed demo data"

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true")

    @transaction.atomic
    def handle(self, *args, **opts):
        random.seed(42)
        if opts["reset"]:
            for m in (TicketMessage, Ticket, ReturnRequest, Payment, Invoice, Cheque, LedgerEntry, OrderNote,
                      OrderStatusLog, OrderItem, Order, SalesTarget, Notification, CustomerDocument):
                m.objects.all().delete()
            User.objects.exclude(is_superuser=True).delete()
            for m in (Customer, ProductPrice, VolumeDiscount, PriceGroup, Product, Category, MarketingAsset, Campaign,
                      Announcement, QuizQuestion, Lesson, Course, RewardTier, AgencyApplication, SyncLog, City, Province):
                m.objects.all().delete()
        if Province.objects.exists():
            self.stdout.write("Demo data already present (use --reset).")
            return

        cities = {}
        for prov, items in CITIES.items():
            p = Province.objects.create(name=prov)
            for name, lat, lng, pop in items:
                cities[name] = City.objects.create(province=p, name=name, lat=lat, lng=lng, population=pop)

        # --- staff
        admin = User.objects.filter(username="admin").first() or User.objects.create_superuser("admin", password="admin1234")
        admin.first_name, admin.last_name, admin.phone, admin.role = "ادمین", "فنی", "09120000000", Role.ADMIN
        admin.position = Position.objects.filter(base_role=Role.ADMIN, is_system=True).first()
        admin.save()
        Position.objects.filter(is_system=False).delete()
        wh = Position.objects.create(name="انباردار", description="آماده‌سازی و ارسال سفارش‌ها",
                                     permissions=["orders", "orders_manage", "support"], scope="all")
        acc = Position.objects.create(name="حسابدار شرکت", description="چک‌ها، حساب مشتری‌ها و اتصال حسابداری",
                                      permissions=["dashboard", "customers", "finance", "finance_manage", "integrations"], scope="all")
        self._staff("warehouse", "09120000005", "مجید", "رستمی", Role.STAFF, wh)
        self._staff("accountant", "09120000006", "الهام", "نیک‌نام", Role.STAFF, acc)
        manager = self._staff("manager", "09120000001", "نسرین", "توکلی", Role.SALES_MANAGER)
        rep_south = self._staff("rep.south", "09120000002", "آرش", "منصوری", Role.SALES_REP)
        rep_south.regions.set(Province.objects.filter(name__in=["فارس", "خوزستان", "کرمان", "هرمزگان", "یزد"]))
        rep_north = self._staff("rep.north", "09120000003", "سارا", "فاضلی", Role.SALES_REP)
        rep_north.regions.set(Province.objects.filter(name__in=["تهران", "البرز", "گیلان", "مازندران", "قم"]))
        rep_east = self._staff("rep.east", "09120000004", "بابک", "یزدانی", Role.SALES_REP)
        rep_east.regions.set(Province.objects.filter(name__in=["خراسان رضوی", "اصفهان", "آذربایجان شرقی", "همدان", "کرمانشاه"]))

        def rep_for(city):
            return User.objects.filter(role=Role.SALES_REP, regions=city.province).first()

        # --- pricing
        g_dist = PriceGroup.objects.create(name="نماینده‌های درجه یک", description="پخش‌کننده‌های اصلی استانی")
        g_dist2 = PriceGroup.objects.create(name="نماینده‌های درجه دو", description="پخش‌کننده‌های شهرستان")
        g_store = PriceGroup.objects.create(name="فروشگاه‌ها", description="سوپرمارکت و هایپر", is_default=True)
        g_org = PriceGroup.objects.create(name="سازمانی", description="هتل، خشکشویی، بیمارستان")
        g_lab = PriceGroup.objects.create(name="آزمایشگاه‌ها", description="قیمت کیت‌های تشخیصی")
        VolumeDiscount.objects.create(group=None, min_cartons=50, percent=Decimal("5"))
        VolumeDiscount.objects.create(group=None, min_cartons=100, percent=Decimal("7"))
        VolumeDiscount.objects.create(group=g_dist, min_cartons=200, percent=Decimal("10"))
        VolumeDiscount.objects.create(group=g_lab, min_cartons=10, percent=Decimal("4"))

        cats = {}
        for i, (name, slug, line) in enumerate(CATS):
            cats[slug] = Category.objects.create(name=name, slug=slug, product_line=line, order=i)
        products = []
        for name, sku, cat, upc, mn, price, color, aud, label in PRODUCTS:
            line = cats[cat].product_line
            p = Product(name=name, sku=sku, category=cats[cat], units_per_carton=upc, min_order_cartons=mn,
                        base_price=price, product_line=line, audiences=aud, stock_cartons=random.randint(0, 900),
                        description=self._desc(name, line), kit_type=cat if line == "lab" else "",
                        accounting_code=f"A{sku}")
            p.is_available = sku not in ("MH-SB400",)
            put(p.image, product_image(name.split(" ")[0] + " " + name.split(" ")[1], color, label), save=False)
            if line == "lab":
                put(p.tech_doc, text_file(f"مستندات فنی {name}\nروش: آنزیمی\nپایداری: ۱۸ ماه در ۲-۸ درجه", f"{sku}-ifu.txt"), save=False)
                put(p.brochure, banner_image(name[:24], "بروشور محصول", (232, 220, 192)), save=False)
            p.save()
            products.append(p)
        factors = {g_dist: 0.86, g_dist2: 0.9, g_store: 0.97, g_org: 0.93, g_lab: 0.95}
        for g, f in factors.items():
            for p in products:
                if (g == g_lab) != (p.product_line == "lab"):
                    continue
                ProductPrice.objects.create(group=g, product=p, carton_price=int(p.base_price * Decimal(f) / 1000) * 1000)

        # --- customers
        customers = []
        n = 0

        def mk(name, owner, city, ctype, group, credit, status="approved", idx=0):
            nonlocal n
            n += 1
            c = cities[city]
            phone = f"0912{n:07d}"[-11:] if False else f"09{350000000 + n:09d}"[-11:]
            cust = Customer.objects.create(
                type=ctype, business_name=name, owner_name=owner, phone=phone, economic_code=f"4114{n:07d}",
                national_id=f"1080{n:06d}", license_number=f"JK-{1400 + n}", city=c,
                address=f"{c.name}، خیابان {random.choice(['امام', 'آزادی', 'ولیعصر', 'انقلاب', 'جمهوری'])}، پلاک {random.randint(5, 300)}",
                postal_code=f"{random.randint(1000000000, 9999999999)}", status=status,
                price_group=group if status == "approved" else None,
                sales_rep=rep_for(c) if status == "approved" else None, credit_limit=credit,
                accounting_code=f"C{n:04d}", approved_at=timezone.now() if status == "approved" else None,
            )
            first, *rest = owner.split(" ")
            User.objects.create(username=phone, phone=phone, first_name=first, last_name=" ".join(rest), role=ctype,
                                customer=cust, is_customer_owner=True, can_order=True, can_view_finance=True)
            return cust

        for i, (name, owner, city) in enumerate(DISTRIBUTORS):
            customers.append(mk(name, owner, city, "distributor", g_dist if i < 6 else g_dist2,
                                random.choice([12_000_000_000, 15_000_000_000, 20_000_000_000])))
        for name, owner, city in STORES:
            customers.append(mk(name, owner, city, "store", g_store, 1_000_000_000))
        for name, owner, city in ORGS:
            customers.append(mk(name, owner, city, "organization", g_org, 2_500_000_000))
        for name, owner, city in LABS:
            customers.append(mk(name, owner, city, "lab", g_lab, 1_500_000_000))

        # fixed easy demo logins
        fixed = {customers[0]: "09121111111", customers[10]: "09122222222", customers[16]: "09123333333",
                 customers[19]: "09124444444"}
        for cust, phone in fixed.items():
            cust.phone = phone
            cust.save()
            u = cust.users.first()
            u.phone = u.username = phone
            u.save()
        # sub-user: accountant of the Shiraz distributor
        User.objects.create(username="09125555555", phone="09125555555", first_name="لیلا", last_name="صالحی",
                            job_title="حسابدار", role="distributor", customer=customers[0], is_customer_owner=False,
                            can_order=False, can_view_finance=True)

        # pending / rejected applicants
        pend = [mk("پخش نوین بندر", "فرزاد کیانی", "بندرعباس", "distributor", None, 0, status="pending"),
                mk("سوپر گلستان", "شیما احمدی", "ساری", "store", None, 0, status="pending"),
                mk("خشکشویی آفتاب", "حمید زارع", "همدان", "organization", None, 0, status="pending")]
        pend[0].phone = "09126666666"
        pend[0].save()
        u = pend[0].users.first()
        u.phone = u.username = "09126666666"
        u.save()
        for c in pend:
            CustomerDocument.objects.create(customer=c, kind="license",
                                            file=banner_image("جواز کسب", c.business_name, (240, 235, 220), (900, 600)),
                                            title="جواز کسب.png")
            CustomerDocument.objects.create(customer=c, kind="national_card",
                                            file=banner_image("کارت ملی", c.owner_name, (225, 232, 240), (856, 540)),
                                            title="کارت ملی.png")
        mk("فروشگاه امید", "کیوان امیری", "کرمانشاه", "store", None, 0, status="rejected").__class__.objects.filter(
            status="rejected").update(rejection_reason="تصویر جواز کسب ناخوانا است؛ لطفاً دوباره بارگذاری کنید.")

        # --- orders history (~8 months)
        consumer = [p for p in products if p.product_line == "consumer"]
        lab = [p for p in products if p.product_line == "lab"]
        price_of = {(pp.group_id, pp.product_id): pp.carton_price for pp in ProductPrice.objects.all()}
        statuses_old = [Order.Status.DELIVERED] * 8 + [Order.Status.CANCELED]
        all_orders = []
        for cust in customers:
            pool = lab if cust.type == "lab" else [p for p in consumer if not p.audiences or cust.type in p.audiences]
            freq = {"distributor": 9, "store": 16, "organization": 20, "lab": 22}[cust.type]
            if cust == customers[8]:
                freq = 200  # inactive distributor for the dashboard
            day = 240
            while day > 0:
                day -= random.randint(max(3, freq - 6), freq + 6)
                if day < 0 or (cust == customers[8] and day < 60):
                    break
                if day > 14:
                    st = random.choice(statuses_old)
                elif day > 7:
                    st = random.choice([Order.Status.SHIPPED, Order.Status.DELIVERED])
                elif day > 3:
                    st = random.choice([Order.Status.CONFIRMED, Order.Status.PREPARING])
                else:
                    st = Order.Status.SUBMITTED
                all_orders.append(self._order(cust, random.sample(pool, k=min(len(pool), random.randint(2, 5))),
                                              st, day, price_of))
        # ensure the main demo distributor has recent orders in all states
        for st, d in [(Order.Status.SUBMITTED, 0), (Order.Status.PREPARING, 2), (Order.Status.SHIPPED, 5)]:
            all_orders.append(self._order(customers[0], random.sample(consumer, 3), st, d, price_of))

        # --- finance: invoices + ledger + payments + cheques
        for o in all_orders:
            if o.status in (Order.Status.SHIPPED, Order.Status.DELIVERED):
                o.accounting_ref = f"ACC-{o.number}"
                o.accounting_synced_at = o.created_at
                o.save(update_fields=["accounting_ref", "accounting_synced_at"])
                d = timezone.localtime(o.created_at).date() + dt.timedelta(days=2)
                Invoice.objects.create(customer=o.customer, order=o, number=f"F-{o.number}", amount=o.total, issued_on=d,
                                       external_id=f"INV-{o.number}")
                LedgerEntry.objects.create(customer=o.customer, kind="invoice", debit=o.total, date=d,
                                           due_date=d + dt.timedelta(days=45), description=f"فاکتور {o.number}",
                                           reference=f"F-{o.number}", external_id=f"INV-{o.number}")
        for cust in customers:
            debt = sum(e.debit for e in cust.ledger.all())
            ratio = 0.55 if cust in (customers[3], customers[12]) else random.uniform(0.75, 0.95)
            to_pay = int(debt * Decimal(ratio))
            day = 230
            chunk = max(50_000_000, to_pay // 9 // 1_000_000 * 1_000_000)
            while to_pay > 0 and day > 5:
                amt = min(to_pay, chunk)
                date = timezone.localdate() - dt.timedelta(days=day)
                if random.random() < 0.5:
                    p = Payment.objects.create(customer=cust, amount=amt, gateway="mock", status="paid",
                                               ref_id=f"MREF{random.randint(10000, 99999)}", authority=f"MOCKSEED{cust.id}{day}")
                    Payment.objects.filter(pk=p.pk).update(created_at=timezone.now() - dt.timedelta(days=day))
                    LedgerEntry.objects.create(customer=cust, kind="payment", credit=amt, date=date,
                                               description="پرداخت اینترنتی", reference=p.ref_id)
                else:
                    num = str(random.randint(100000, 999999))
                    Cheque.objects.create(customer=cust, number=num, bank=random.choice(["ملت", "ملی", "صادرات", "پاسارگاد"]),
                                          amount=amt, due_date=date, status="cleared")
                    LedgerEntry.objects.create(customer=cust, kind="cheque", credit=amt, date=date,
                                               description=f"وصول چک {num}", reference=num)
                to_pay -= amt
                day -= random.randint(20, 30)
        for cust in customers[:10]:
            for k in range(2):
                Cheque.objects.create(customer=cust, number=str(random.randint(100000, 999999)), bank="ملت",
                                      amount=random.choice([800, 1200, 1500]) * 1_000_000,
                                      due_date=timezone.localdate() + dt.timedelta(days=10 + 25 * k), status="pending",
                                      image=banner_image("چک بانکی", cust.business_name, (230, 238, 230), (900, 420)))
        Cheque.objects.create(customer=customers[3], number="771203", bank="صادرات", amount=420_000_000,
                              due_date=timezone.localdate() - dt.timedelta(days=12), status="bounced")
        LedgerEntry.objects.create(customer=customers[3], kind="bounced", debit=420_000_000,
                                   date=timezone.localdate() - dt.timedelta(days=12),
                                   due_date=timezone.localdate() - dt.timedelta(days=12), description="برگشت چک 771203")
        # statement invoice
        Invoice.objects.create(customer=customers[0], kind="statement", number="S-1405-07", amount=0,
                               issued_on=timezone.localdate() - dt.timedelta(days=20),
                               period_start=timezone.localdate() - dt.timedelta(days=50),
                               period_end=timezone.localdate() - dt.timedelta(days=20))

        # --- engagement
        for pct, title, rp, desc in [(70, "برنزی", 0.5, "پاداش نیم درصد از کل فروش ماه"),
                                     (100, "نقره‌ای", 1.5, "پاداش ۱.۵ درصد + اولویت ارسال"),
                                     (120, "طلایی", 3, "پاداش ۳ درصد + سفر تفریحی فصلی")]:
            RewardTier.objects.create(min_percent=pct, title=title, reward_percent=Decimal(str(rp)), description=desc)
        today = jdatetime.date.today()
        for cust in customers[:10]:
            y, m = today.year, today.month
            for _ in range(6):
                SalesTarget.objects.create(customer=cust, year=y, month=m,
                                           target_amount=random.choice([3500, 4500, 5500, 6500]) * 1_000_000)
                y, m = (y - 1, 12) if m == 1 else (y, m - 1)

        c1 = Course.objects.create(title="آشنایی با قرص ماشین ظرفشویی مَن", audiences=[],
                                   summary="ویژگی‌ها، مزیت رقابتی و نکات فروش محصول جدید.")
        put(c1.cover, banner_image("قرص ظرفشویی مَن", "دوره‌ی آموزشی", (200, 220, 240)), save=True)
        for i, (t, b) in enumerate([("معرفی محصول", "قرص‌های ۳ لایه با آنزیم فعال در دمای پایین…"),
                                    ("مقایسه با رقبا", "۲۰٪ کف کمتر، بدون باقی‌مانده روی ظرف…"),
                                    ("نکات چیدمان در قفسه", "کنار نمک و جلادهنده، در ارتفاع دید…")]):
            Lesson.objects.create(course=c1, title=t, body=b, order=i,
                                  video_url="https://www.w3schools.com/html/mov_bbb.mp4")
        for i, (q, ch, ok) in enumerate([
            ("قرص مَن در چه دمایی بهترین عملکرد را دارد؟", ["فقط ۷۰ درجه", "از ۴۰ درجه به بالا", "فقط آب سرد"], 1),
            ("مزیت اصلی نسبت به رقبا چیست؟", ["قیمت بیشتر", "کف کمتر و بدون باقی‌مانده", "بسته‌بندی بزرگتر"], 1),
            ("بهترین جای چیدمان در قفسه؟", ["کنار نمک و جلادهنده", "کنار نوشابه", "انبار"], 0),
        ]):
            QuizQuestion.objects.create(course=c1, text=q, choices=ch, correct_index=ok, order=i)
        c2 = Course.objects.create(title="خط تولید صنعتی برای هتل‌ها و خشکشویی‌ها", audiences=["distributor", "organization"],
                                   summary="دوز مصرف، ماشین‌های صنعتی و محاسبه‌ی هزینه برای هر کیلو لباس.")
        put(c2.cover, banner_image("محصولات صنعتی", "هتل و خشکشویی", (230, 215, 190)), save=True)
        Lesson.objects.create(course=c2, title="دوز مصرف پودر ۲۰ کیلویی", body="به ازای هر کیلو لباس خشک ۸ تا ۱۰ گرم…")
        c3 = Course.objects.create(title="کار با کیت‌های بیوشیمی مَن", audiences=["lab"],
                                   summary="روش انجام، کالیبراسیون و کنترل کیفی.")
        Lesson.objects.create(course=c3, title="کالیبراسیون کیت گلوکز", body="از کالیبراتور چندسطحی استفاده کنید…")

        # --- marketing
        camp1 = Campaign.objects.create(title="کمپین زمستان ۱۴۰۵", description="تخفیف ویژه‌ی پودرهای لباسشویی")
        put(camp1.cover, banner_image("کمپین زمستان", "پودرهای لباسشویی مَن", (200, 220, 240)), save=True)
        camp2 = Campaign.objects.create(title="معرفی قرص ظرفشویی", description="محصول جدید مَن")
        put(camp2.cover, banner_image("قرص ظرفشویی", "محصول جدید", (240, 225, 190)), save=True)
        for camp, items in [(camp1, [("پوستر ویترین زمستان", "poster", (200, 220, 240)), ("بنر استند ۸۰×۲۰۰", "banner", (220, 210, 240)),
                                     ("عکس پودر ۳ کیلویی", "photo", (230, 230, 230))]),
                            (camp2, [("پوستر قرص ظرفشویی", "poster", (240, 225, 190)), ("بنر اینستاگرام", "banner", (250, 230, 200)),
                                     ("عکس بسته‌بندی ۳۰ عددی", "photo", (235, 235, 225))])]:
            for t, k, col in items:
                a = MarketingAsset(campaign=camp, title=t, kind=k)
                put(a.file, banner_image(t, camp.title, col), save=False)
                a.thumbnail = a.file.name
                a.save()
        v = MarketingAsset(campaign=camp2, title="ویدیوی تبلیغاتی ۳۰ ثانیه", kind="video")
        put(v.file, text_file("demo video placeholder", "teaser.mp4"), save=False)
        put(v.thumbnail, banner_image("ویدیو تبلیغاتی", "۳۰ ثانیه", (210, 200, 230)), save=False)
        v.save()

        Announcement.objects.create(title="افزایش سقف تخفیف حجمی", pinned=True,
                                    body="از ابتدای آذر، سفارش‌های بالای ۱۰۰ کارتن ۷٪ تخفیف می‌گیرند.")
        Announcement.objects.create(title="تعطیلی انبار مرکزی", body="انبار مرکزی روز جمعه و شنبه‌ی آینده تعطیل است؛ ارسال‌ها از یکشنبه انجام می‌شود.")
        Announcement.objects.create(title="کیت جدید تری‌گلیسرید", audiences=["lab"], body="کیت تری‌گلیسرید با پایداری ۲۴ ماهه موجود شد.")

        # --- support
        delivered = [o for o in all_orders if o.status == "delivered" and o.customer == customers[0]]
        if delivered:
            r = ReturnRequest.objects.create(customer=customers[0], order=delivered[0], reason="broken",
                                             description="۳ کارتن مایع ظرفشویی هنگام تخلیه شکسته بود.",
                                             items=[{"order_item_id": delivered[0].items.first().id, "cartons": 3}],
                                             status="reviewing", created_by=customers[0].users.first())
            r2 = ReturnRequest.objects.create(customer=customers[1], order=[o for o in all_orders if o.customer == customers[1] and o.status == "delivered"][0],
                                              reason="shortage", description="۲ کارتن کسری داشت.", status="submitted",
                                              created_by=customers[1].users.first())
        t = Ticket.objects.create(customer=customers[0], created_by=customers[0].users.first(), subject="زمان ارسال سفارش",
                                  department="sales", status="answered")
        TicketMessage.objects.create(ticket=t, author=customers[0].users.first(), text="سلام، سفارش هفته‌ی پیش کی ارسال می‌شه؟")
        TicketMessage.objects.create(ticket=t, author=rep_south, is_staff_reply=True,
                                     text="سلام، امروز بارگیری می‌شه و فردا صبح شیراز تحویل می‌گیرید.")
        t2 = Ticket.objects.create(customer=customers[10], created_by=customers[10].users.first(),
                                   subject="درخواست پوستر برای ویترین", department="support", status="open")
        TicketMessage.objects.create(ticket=t2, author=customers[10].users.first(), text="امکانش هست پوستر چاپی کمپین زمستان رو برامون بفرستید؟")

        for name, phone, city, st in [("کورش رستمی", "09187776655", "همدان", "new"), ("نیما فلاحی", "09171112233", "بندرعباس", "reviewing"),
                                      ("الهام یوسفی", "09151234567", "سبزوار", "new"), ("رامین غفاری", "09111234567", "بابل", "rejected")]:
            AgencyApplication.objects.create(full_name=name, phone=phone, business_name=f"پخش {city}", city=cities[city],
                                             experience="۵ سال سابقه‌ی پخش مواد شوینده", has_warehouse=True, vehicles=3,
                                             status=st, source=random.choice(["website", "portal"]))
        SyncLog.objects.create(kind="products", items=len(products), message=f"{len(products)} کالا به‌روزرسانی شد")
        SyncLog.objects.create(kind="invoices", items=12, message="12 فاکتور جدید")
        self.stdout.write(self.style.SUCCESS(f"Seeded: {len(customers)} customers, {len(all_orders)} orders."))

    def _staff(self, username, phone, first, last, role, position=None):
        position = position or Position.objects.filter(base_role=role, is_system=True).first()
        u = User.objects.create(username=username, phone=phone, first_name=first, last_name=last, role=role,
                                position=position)
        u.set_password("demo1234")
        u.save()
        return u

    def _desc(self, name, line):
        if line == "lab":
            return f"{name} با دقت بالا و پایداری طولانی؛ مناسب آنالایزرهای اتوماتیک و نیمه‌اتوماتیک."
        return f"{name}؛ فرمول جدید با رایحه‌ی ماندگار و قدرت پاک‌کنندگی بالا. تولید شده با استانداردهای ملی ایران."

    def _order(self, cust, prods, status, days_ago, price_of):
        when = jago(days_ago)
        o = Order(customer=cust, created_by=cust.users.first(), sales_rep=cust.sales_rep, city=cust.city,
                  delivery_address=cust.address, status=status, is_lab_order=cust.type == "lab")
        o.save()
        mult = {"distributor": (8, 60), "store": (2, 8), "organization": (3, 15), "lab": (1, 4)}[cust.type]
        items, subtotal, cartons = [], Decimal(0), 0
        for p in prods:
            n = max(p.min_order_cartons, random.randint(*mult))
            price = price_of.get((cust.price_group_id, p.id), p.base_price)
            items.append(OrderItem(order=o, product=p, product_name=p.name, sku=p.sku, units_per_carton=p.units_per_carton,
                                   cartons=n, unit_price=price, line_total=price * n))
            subtotal += price * n
            cartons += n
        OrderItem.objects.bulk_create(items)
        from apps.catalog.models import discount_percent_for

        pct = discount_percent_for(cartons, cust.price_group)
        disc = int(subtotal * pct / 100)
        o.subtotal, o.total_cartons, o.discount_percent, o.discount_amount, o.total = subtotal, cartons, pct, disc, subtotal - disc
        o.save()
        Order.objects.filter(pk=o.pk).update(created_at=when, updated_at=when)
        o.created_at = when
        flow = Order.FLOW[: Order.FLOW.index(status) + 1] if status in Order.FLOW else [Order.Status.SUBMITTED, status]
        for i, st in enumerate(flow):
            log = OrderStatusLog.objects.create(order=o, status=st, changed_by=cust.sales_rep if i else cust.users.first())
            OrderStatusLog.objects.filter(pk=log.pk).update(created_at=when + dt.timedelta(hours=8 * i))
        return o
