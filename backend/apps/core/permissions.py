from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.perms import has_perm
from apps.accounts.roles import CUSTOMER_ROLES, STAFF_ROLES


def is_staff_role(user):
    return user.is_authenticated and user.role in STAFF_ROLES


class IsStaffRole(BasePermission):
    def has_permission(self, request, view):
        return is_staff_role(request.user)


def Perm(key, *alt):
    """Staff user whose position includes `key` (or any of `alt`)."""

    class _P(BasePermission):
        message = "سمت شما به این بخش دسترسی ندارد."

        def has_permission(self, request, view):
            u = request.user
            return is_staff_role(u) and any(has_perm(u, k) for k in (key, *alt))

    _P.__name__ = f"Perm_{key}"
    return _P


def ReadOrPerm(key):
    """Anyone logged in may read (customers see their own catalogue etc.); writing needs `key`."""

    class _P(BasePermission):
        message = "سمت شما اجازه‌ی تغییر این بخش را ندارد."

        def has_permission(self, request, view):
            u = request.user
            if not u.is_authenticated:
                return False
            if request.method in SAFE_METHODS:
                return True
            return is_staff_role(u) and has_perm(u, key)

    _P.__name__ = f"ReadOrPerm_{key}"
    return _P


def StaffNeeds(key):
    """Customers pass (their own data is scoped elsewhere); staff need `key`."""

    class _P(BasePermission):
        message = "سمت شما به این بخش دسترسی ندارد."

        def has_permission(self, request, view):
            u = request.user
            if not u.is_authenticated:
                return False
            if u.role in CUSTOMER_ROLES:
                return True
            return has_perm(u, key)

    _P.__name__ = f"StaffNeeds_{key}"
    return _P


class IsApprovedCustomer(BasePermission):
    message = "حساب شما هنوز تأیید نشده است."

    def has_permission(self, request, view):
        u = request.user
        return (
            u.is_authenticated
            and u.role in CUSTOMER_ROLES
            and u.customer_id is not None
            and u.customer.status == "approved"
        )


class CustomerCanOrder(IsApprovedCustomer):
    message = "شما اجازه‌ی ثبت سفارش ندارید."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and (
            request.user.is_customer_owner or request.user.can_order
        )


class CustomerCanSeeFinance(IsApprovedCustomer):
    message = "شما به بخش مالی دسترسی ندارید."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and (
            request.user.is_customer_owner or request.user.can_view_finance
        )
