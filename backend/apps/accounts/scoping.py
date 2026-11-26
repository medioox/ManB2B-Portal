from django.db.models import Q

from .models import Customer
from .perms import SCOPE_ALL, scope_of
from .roles import CUSTOMER_ROLES


def customers_for(user):
    """Customers a user is allowed to see."""
    qs = Customer.objects.select_related("city", "city__province", "price_group", "sales_rep")
    if user.role in CUSTOMER_ROLES:
        return qs.filter(pk=user.customer_id) if user.customer_id else qs.none()
    if scope_of(user) == SCOPE_ALL:
        return qs
    return qs.filter(Q(sales_rep=user) | Q(city__province__in=user.regions.all())).distinct()


def scope_by_customer(qs, user, field="customer"):
    """Filter any queryset that has a FK to Customer by what the user may see."""
    if user.role in CUSTOMER_ROLES:
        return qs.filter(**{field: user.customer_id})
    if scope_of(user) == SCOPE_ALL:
        return qs
    return qs.filter(**{f"{field}__in": customers_for(user).values("pk")})
