from django.db.models import Q

from .models import Customer
from .roles import Role


def customers_for(user):
    """Customers a user is allowed to see."""
    qs = Customer.objects.select_related("city", "city__province", "price_group", "sales_rep")
    if user.role in (Role.ADMIN, Role.SALES_MANAGER):
        return qs
    if user.role == Role.SALES_REP:
        return qs.filter(Q(sales_rep=user) | Q(city__province__in=user.regions.all())).distinct()
    if user.customer_id:
        return qs.filter(pk=user.customer_id)
    return qs.none()


def scope_by_customer(qs, user, field="customer"):
    """Filter any queryset that has a FK to Customer by what the user may see."""
    if user.role in (Role.ADMIN, Role.SALES_MANAGER):
        return qs
    if user.role == Role.SALES_REP:
        return qs.filter(**{f"{field}__in": customers_for(user).values("pk")})
    return qs.filter(**{field: user.customer_id})
