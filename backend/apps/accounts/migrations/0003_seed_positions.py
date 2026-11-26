from django.db import migrations

from apps.accounts.perms import DEFAULTS

SYSTEM = [
    ("admin", "ادمین کل", "دسترسی کامل به همه‌ی بخش‌ها"),
    ("sales_manager", "مدیر فروش", "تأیید مشتری‌ها، همه‌ی سفارش‌ها و گزارش‌ها"),
    ("sales_rep", "کارشناس فروش", "سفارش‌ها و مشتری‌های منطقه‌ی خودش"),
]


def seed(apps, schema_editor):
    Position = apps.get_model("accounts", "Position")
    User = apps.get_model("accounts", "User")
    for role, name, desc in SYSTEM:
        perms, scope = DEFAULTS[role]
        pos, _ = Position.objects.get_or_create(
            name=name, defaults={"description": desc, "permissions": list(perms), "scope": scope,
                                 "base_role": role, "is_system": True})
        User.objects.filter(role=role, position__isnull=True).update(position=pos)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_positions")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
