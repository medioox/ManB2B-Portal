from django.db import models


class Role(models.TextChoices):
    ADMIN = "admin", "ادمین کل"
    SALES_MANAGER = "sales_manager", "مدیر فروش"
    SALES_REP = "sales_rep", "کارشناس فروش"
    STAFF = "staff", "کارمند"
    DISTRIBUTOR = "distributor", "نماینده / پخش‌کننده"
    STORE = "store", "فروشگاه"
    ORGANIZATION = "organization", "مشتری سازمانی"
    LAB = "lab", "آزمایشگاه"


STAFF_ROLES = (Role.ADMIN, Role.SALES_MANAGER, Role.SALES_REP, Role.STAFF)
CUSTOMER_ROLES = (Role.DISTRIBUTOR, Role.STORE, Role.ORGANIZATION, Role.LAB)
