from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Customer, CustomerDocument, User


@admin.register(User)
class ManUserAdmin(UserAdmin):
    list_display = ("username", "phone", "first_name", "last_name", "role", "customer", "is_active")
    list_filter = ("role", "is_active")
    search_fields = ("username", "phone", "first_name", "last_name")
    fieldsets = UserAdmin.fieldsets + (
        ("پرتال", {"fields": ("phone", "role", "customer", "is_customer_owner", "can_order", "can_view_finance",
                              "job_title", "regions")}),
    )


class DocInline(admin.TabularInline):
    model = CustomerDocument
    extra = 0


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("business_name", "type", "city", "status", "price_group", "sales_rep", "credit_limit")
    list_filter = ("status", "type", "price_group")
    search_fields = ("business_name", "owner_name", "phone")
    inlines = [DocInline]
