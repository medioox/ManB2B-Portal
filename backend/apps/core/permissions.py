from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.roles import CUSTOMER_ROLES, Role


def is_staff_role(user):
    return user.is_authenticated and user.role in (Role.ADMIN, Role.SALES_MANAGER, Role.SALES_REP)


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.ADMIN


class IsManager(BasePermission):
    """Admin or sales manager."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (Role.ADMIN, Role.SALES_MANAGER)


class IsStaffRole(BasePermission):
    def has_permission(self, request, view):
        return is_staff_role(request.user)


class IsManagerOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in (Role.ADMIN, Role.SALES_MANAGER)


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
