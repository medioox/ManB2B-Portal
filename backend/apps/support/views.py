from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.accounts.scoping import scope_by_customer
from apps.core.permissions import Perm, StaffNeeds
from apps.core.services import notify, notify_customer
from apps.orders.models import Order

from .models import ReturnImage, ReturnRequest, Ticket, TicketMessage
from .serializers import ReturnRequestSerializer, TicketMessageSerializer, TicketSerializer


def _staff_for(customer):
    from apps.accounts.perms import users_with_perm

    users = [u for u in users_with_perm("support") if u.role not in (Role.SALES_REP, Role.ADMIN)]
    if customer.sales_rep:
        users.append(customer.sales_rep)
    return users


class ReturnRequestViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                           viewsets.GenericViewSet):
    serializer_class = ReturnRequestSerializer
    permission_classes = [StaffNeeds("support")]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["status", "reason", "customer"]
    search_fields = ["order__number", "customer__business_name"]

    def get_queryset(self):
        return scope_by_customer(
            ReturnRequest.objects.select_related("order", "customer").prefetch_related("images"), self.request.user
        )

    def create(self, request, *args, **kwargs):
        u = request.user
        if not u.is_customer:
            raise PermissionDenied("ثبت مرجوعی از سمت مشتری انجام می‌شود.")
        order = get_object_or_404(Order.objects.filter(customer_id=u.customer_id), pk=request.data.get("order"))
        if order.status not in (Order.Status.SHIPPED, Order.Status.DELIVERED):
            raise ValidationError({"order": ["فقط برای سفارش‌های ارسال یا تحویل‌شده می‌توان مرجوعی ثبت کرد."]})
        items = request.data.get("items", [])
        if isinstance(items, str):
            import json

            items = json.loads(items or "[]")
        s = self.get_serializer(data={"order": order.id, "reason": request.data.get("reason"),
                                      "description": request.data.get("description", ""), "items": items})
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            r = s.save(customer=u.customer, created_by=u)
            for img in request.FILES.getlist("images")[:6]:
                ReturnImage.objects.create(request=r, image=img)
        for staff in _staff_for(u.customer):
            notify(staff, f"درخواست مرجوعی برای سفارش {order.number}", r.get_reason_display(),
                   link=f"/admin/returns?id={r.id}")
        return Response(self.get_serializer(r).data, status=201)

    @action(detail=True, methods=["post"], permission_classes=[Perm("support")])
    def set_status(self, request, pk=None):
        r = self.get_object()
        new = request.data.get("status")
        if new not in ReturnRequest.Status.values:
            raise ValidationError({"status": ["وضعیت نامعتبر است."]})
        r.status = new
        r.resolution = request.data.get("resolution", r.resolution)
        r.save()
        notify_customer(r.customer, f"مرجوعی سفارش {r.order.number}: {r.get_status_display()}", r.resolution,
                        link=f"/support/returns/detail?id={r.id}", sms=True)
        return Response(self.get_serializer(r).data)


class TicketViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                    viewsets.GenericViewSet):
    serializer_class = TicketSerializer
    permission_classes = [StaffNeeds("support")]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["status", "department", "customer"]
    search_fields = ["subject", "customer__business_name"]

    def get_queryset(self):
        qs = Ticket.objects.select_related("customer", "order")
        if self.action == "retrieve":
            qs = qs.prefetch_related("messages__author")
        return scope_by_customer(qs, self.request.user)

    def perform_create(self, serializer):
        u = self.request.user
        if not u.is_customer:
            raise PermissionDenied("تیکت از سمت مشتری ثبت می‌شود.")
        order = serializer.validated_data.get("order")
        if order and order.customer_id != u.customer_id:
            raise ValidationError({"order": ["سفارش نامعتبر است."]})
        text = serializer.validated_data.pop("first_message")
        t = serializer.save(customer=u.customer, created_by=u)
        TicketMessage.objects.create(ticket=t, author=u, text=text, attachment=self.request.FILES.get("attachment"))
        targets = [u.customer.sales_rep] if t.department == "sales" and u.customer.sales_rep else _staff_for(u.customer)
        for s in targets:
            notify(s, f"تیکت جدید: {t.subject}", u.customer.business_name, link=f"/admin/tickets?id={t.id}")

    @action(detail=True, methods=["post"])
    def reply(self, request, pk=None):
        t = self.get_object()
        if t.status == Ticket.Status.CLOSED:
            raise ValidationError("این تیکت بسته شده است.")
        text = (request.data.get("text") or "").strip()
        if not text:
            raise ValidationError({"text": ["متن پیام خالی است."]})
        staff = not request.user.is_customer
        m = TicketMessage.objects.create(ticket=t, author=request.user, text=text, is_staff_reply=staff,
                                         attachment=request.FILES.get("attachment"))
        t.status = Ticket.Status.ANSWERED if staff else Ticket.Status.WAITING
        t.save(update_fields=["status", "updated_at"])
        if staff:
            notify_customer(t.customer, f"پاسخ تیکت: {t.subject}", text[:120], link=f"/support/tickets/detail?id={t.id}",
                            sms=True)
        else:
            for s in _staff_for(t.customer):
                notify(s, f"پیام جدید در تیکت: {t.subject}", text[:120], link=f"/admin/tickets?id={t.id}")
        return Response(TicketMessageSerializer(m, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        t = self.get_object()
        t.status = Ticket.Status.CLOSED
        t.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(t).data)
