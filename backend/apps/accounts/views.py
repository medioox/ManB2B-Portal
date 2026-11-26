from django.conf import settings
from django.contrib.auth import authenticate
from django.db.models import Count
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.permissions import IsStaffRole, Perm
from apps.core.services import notify, notify_customer

from .models import Customer, CustomerDocument, Position, User
from .otp import check_code, is_valid_phone, issue_code, make_registration_token, normalize_phone
from .roles import CUSTOMER_ROLES, STAFF_ROLES, Role
from .scoping import customers_for
from .perms import SCOPE_REGION, SECTIONS, has_perm, users_with_perm
from .serializers import (
    AdminUserSerializer, CustomerDocumentSerializer, CustomerSerializer, PositionSerializer, RegisterSerializer,
    SubUserSerializer, UserSerializer,
)


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


class OTPRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        phone = normalize_phone(request.data.get("phone", ""))
        if not is_valid_phone(phone):
            raise ValidationError({"phone": ["شماره موبایل معتبر نیست."]})
        code = issue_code(phone)
        from apps.core.tasks import send_sms

        send_sms.delay(phone, f"کد ورود به پرتال مَن: {code}")
        body = {"ok": True, "phone": phone, "ttl": settings.OTP_TTL_SECONDS,
                "registered": User.objects.filter(phone=phone).exists()}
        if settings.OTP_DEBUG_ECHO:
            body["debug_code"] = code
        return Response(body)


class OTPVerifyView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        phone = normalize_phone(request.data.get("phone", ""))
        if not check_code(phone, request.data.get("code", "")):
            raise ValidationError({"code": ["کد وارد شده اشتباه یا منقضی است."]})
        user = User.objects.filter(phone=phone).first()
        if user is None:
            return Response({"registered": False, "registration_token": make_registration_token(phone)})
        if not user.is_active:
            raise PermissionDenied("حساب کاربری شما غیرفعال است.")
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        return Response({"registered": True, **tokens_for(user), "user": UserSerializer(user).data})


class PasswordLoginView(APIView):
    """Username/password login for staff (admin, managers, sales reps)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        user = authenticate(username=request.data.get("username"), password=request.data.get("password"))
        if user is None:
            raise ValidationError({"password": ["نام کاربری یا رمز عبور اشتباه است."]})
        return Response({**tokens_for(user), "user": UserSerializer(user).data})


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        payload = {k: data.get(k) for k in data.keys() if k not in ("documents", "document_kinds")}
        payload["documents"] = request.FILES.getlist("documents")
        payload["document_kinds"] = data.getlist("document_kinds") if hasattr(data, "getlist") else data.get("document_kinds", [])
        s = RegisterSerializer(data=payload)
        s.is_valid(raise_exception=True)
        user = s.save()
        for manager in users_with_perm("customers_manage"):
            notify(manager, "درخواست عضویت جدید", f"{user.customer.business_name} - {user.customer.city.name}",
                   link="/admin/customers/review?id=%d" % user.customer_id)
        return Response({**tokens_for(user), "user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        u = request.user
        for f in ("first_name", "last_name"):
            if f in request.data:
                setattr(u, f, request.data[f])
        u.save()
        return Response(UserSerializer(u).data)


class CustomerViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                      viewsets.GenericViewSet):
    """Staff-side customer management + approval queue."""

    serializer_class = CustomerSerializer
    permission_classes = [Perm("customers", "customers_manage", "finance")]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "type", "city", "city__province", "sales_rep", "price_group"]
    search_fields = ["business_name", "owner_name", "phone", "economic_code"]
    ordering_fields = ["created_at", "business_name"]

    def get_queryset(self):
        return customers_for(self.request.user).prefetch_related("documents")

    def perform_update(self, serializer):
        if not has_perm(self.request.user, "customers_manage"):
            raise PermissionDenied("سمت شما اجازه‌ی ویرایش مشتری را ندارد.")
        serializer.save()

    @action(detail=False)
    def stats(self, request):
        qs = self.get_queryset()
        return Response({row["status"]: row["n"] for row in qs.values("status").annotate(n=Count("id"))})

    @action(detail=True, methods=["post"], permission_classes=[Perm("customers_manage")])
    def approve(self, request, pk=None):
        c = self.get_object()
        s = self.get_serializer(c, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save(status=Customer.Status.APPROVED, approved_at=timezone.now(), rejection_reason="")
        notify_customer(c, "حساب شما تأیید شد", "اکنون می‌توانید قیمت‌ها را ببینید و سفارش ثبت کنید.",
                        link="/dashboard", sms=True)
        if c.sales_rep:
            notify(c.sales_rep, "مشتری جدید به شما سپرده شد", c.business_name, link=f"/admin/customers/review?id={c.id}")
        return Response(self.get_serializer(c).data)

    @action(detail=True, methods=["post"], permission_classes=[Perm("customers_manage")])
    def reject(self, request, pk=None):
        c = self.get_object()
        reason = request.data.get("reason", "").strip()
        if not reason:
            raise ValidationError({"reason": ["دلیل رد را بنویسید."]})
        c.status = Customer.Status.REJECTED
        c.rejection_reason = reason
        c.save()
        notify_customer(c, "درخواست عضویت شما رد شد", reason, link="/pending", sms=True)
        return Response(self.get_serializer(c).data)

    @action(detail=True, methods=["post"], permission_classes=[Perm("customers_manage")])
    def suspend(self, request, pk=None):
        c = self.get_object()
        c.status = Customer.Status.SUSPENDED
        c.save()
        return Response(self.get_serializer(c).data)


class MyDocumentsView(APIView):
    """A pending/rejected customer can upload more documents and resubmit."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        c = request.user.customer
        if not c or not request.user.is_customer_owner:
            raise PermissionDenied()
        f = request.FILES.get("file")
        if not f:
            raise ValidationError({"file": ["فایل را انتخاب کنید."]})
        doc = CustomerDocument.objects.create(customer=c, file=f, kind=request.data.get("kind", "other"),
                                              title=f.name[:150])
        if c.status == Customer.Status.REJECTED:
            c.status = Customer.Status.PENDING
            c.save(update_fields=["status"])
        return Response(CustomerDocumentSerializer(doc, context={"request": request}).data, status=201)


class SubUserViewSet(viewsets.ModelViewSet):
    serializer_class = SubUserSerializer
    pagination_class = None

    def get_queryset(self):
        u = self.request.user
        if not (u.customer_id and u.is_customer_owner):
            raise PermissionDenied("فقط مدیر حساب مشتری می‌تواند زیرکاربر تعریف کند.")
        return User.objects.filter(customer_id=u.customer_id, is_customer_owner=False)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()


class StaffListView(APIView):
    """Light list of staff for dropdowns (e.g. choosing a customer's sales rep)."""

    permission_classes = [IsStaffRole]

    def get(self, request):
        qs = User.objects.exclude(role__in=CUSTOMER_ROLES).filter(is_active=True).select_related("position")
        if request.query_params.get("assignable"):
            qs = [u for u in qs if u.role != Role.ADMIN and (u.position.scope if u.position_id else "region") == SCOPE_REGION]
        return Response([{"id": u.id, "first_name": u.first_name, "last_name": u.last_name, "role": u.role,
                          "position_name": u.position.name if u.position_id else u.get_role_display()} for u in qs])


class PositionViewSet(viewsets.ModelViewSet):
    serializer_class = PositionSerializer
    permission_classes = [Perm("users")]
    pagination_class = None

    def get_queryset(self):
        return Position.objects.annotate(users_count=Count("users")).order_by("-is_system", "id")

    def perform_destroy(self, instance):
        if instance.is_system:
            raise ValidationError("سمت‌های پیش‌فرض قابل حذف نیستند.")
        if instance.users.exists():
            raise ValidationError("این سمت کاربر دارد؛ ابتدا سمت کاربرانش را تغییر دهید.")
        instance.delete()

    @action(detail=False)
    def sections(self, request):
        return Response([{"key": k, "label": l} for k, l in SECTIONS])


class UserAdminViewSet(viewsets.ModelViewSet):
    """Admin: create any user — staff with a position, or a ready-to-use customer account."""

    serializer_class = AdminUserSerializer
    permission_classes = [Perm("users")]
    http_method_names = ["get", "post", "patch", "head", "options"]
    search_fields = ["username", "phone", "first_name", "last_name", "customer__business_name"]

    def get_queryset(self):
        qs = User.objects.select_related("position", "customer").prefetch_related("regions").annotate(
            customers_count=Count("assigned_customers")).order_by("-date_joined")
        p = self.request.query_params
        if p.get("kind") == "staff":
            qs = qs.exclude(role__in=CUSTOMER_ROLES)
        elif p.get("kind") == "customer":
            qs = qs.filter(role__in=CUSTOMER_ROLES)
        if p.get("position"):
            qs = qs.filter(position_id=p["position"])
        if p.get("role"):
            qs = qs.filter(role=p["role"])
        return qs

    def perform_update(self, serializer):
        u = serializer.instance
        if u == self.request.user and serializer.validated_data.get("is_active") is False:
            raise ValidationError("نمی‌توانید حساب خودتان را غیرفعال کنید.")
        serializer.save()
