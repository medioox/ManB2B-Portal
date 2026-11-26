"""Section-level permissions for staff users.

Every staff user has a *position* (سمت). A position is a named set of panel sections plus a
data scope (all customers, or only the provinces/customers assigned to the user). The three
built-in positions (admin, sales manager, sales rep) are created by a data migration; the admin
can add any number of custom ones (e.g. انباردار، حسابدار، مسئول بازاریابی).
"""
from .roles import CUSTOMER_ROLES, Role

SECTIONS = [
    ("dashboard", "داشبورد مدیریتی و گزارش‌ها"),
    ("customers", "مشاهده‌ی مشتری‌ها"),
    ("customers_manage", "تأیید/رد مشتری و تعیین گروه قیمت، کارشناس و اعتبار"),
    ("orders", "مشاهده‌ی سفارش‌ها"),
    ("orders_manage", "تغییر وضعیت، ویرایش و یادداشت سفارش"),
    ("products", "مدیریت محصولات و دسته‌ها"),
    ("pricing", "قیمت‌گذاری و تخفیف پلکانی"),
    ("finance", "مشاهده‌ی حساب مشتری‌ها و چک‌ها"),
    ("finance_manage", "وصول/برگشت چک"),
    ("targets", "اهداف فروش و پاداش"),
    ("network", "شبکه‌ی فروش و درخواست‌های نمایندگی"),
    ("marketing", "کیت بازاریابی (بارگذاری و حذف)"),
    ("training", "آموزش (ساخت دوره و آزمون)"),
    ("announcements", "اطلاعیه‌ها"),
    ("support", "مرجوعی و تیکت‌ها"),
    ("integrations", "اتصال حسابداری"),
    ("users", "کاربران و سمت‌ها"),
]
SECTION_KEYS = [k for k, _ in SECTIONS]

SCOPE_ALL = "all"
SCOPE_REGION = "region"

DEFAULTS = {
    Role.ADMIN: (SECTION_KEYS, SCOPE_ALL),
    Role.SALES_MANAGER: ([k for k in SECTION_KEYS if k != "users"], SCOPE_ALL),
    Role.SALES_REP: (["dashboard", "customers", "orders", "orders_manage", "finance", "targets", "network", "support"], SCOPE_REGION),
}


def permissions_of(user):
    if not user.is_authenticated or user.role in CUSTOMER_ROLES:
        return []
    if user.role == Role.ADMIN:
        return list(SECTION_KEYS)
    pos = getattr(user, "position", None)
    if pos is not None:
        return list(pos.permissions)
    return list(DEFAULTS.get(user.role, ([], SCOPE_REGION))[0])


def scope_of(user):
    if user.role == Role.ADMIN:
        return SCOPE_ALL
    pos = getattr(user, "position", None)
    if pos is not None:
        return pos.scope
    return DEFAULTS.get(user.role, ([], SCOPE_REGION))[1]


def has_perm(user, key):
    return key in permissions_of(user)


def users_with_perm(key):
    from .models import User

    staff = User.objects.filter(is_active=True).exclude(role__in=CUSTOMER_ROLES).select_related("position")
    return [u for u in staff if has_perm(u, key)]
