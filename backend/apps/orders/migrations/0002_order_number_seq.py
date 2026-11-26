from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("orders", "0001_initial")]

    operations = [
        migrations.RunSQL(
            "CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1001;",
            "DROP SEQUENCE IF EXISTS order_number_seq;",
        )
    ]
