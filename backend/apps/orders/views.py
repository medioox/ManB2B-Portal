from django.db.models import Count
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.accounts.scoping import scope_by_customer
from apps.catalog.models import Product
from apps.catalog.views import visible_products_for
from apps.core.idempotency import idempotent
from apps.core.permissions import CustomerCanOrder, IsStaffRole
from apps.finance.models import credit_summary

from . import services
from .models import Cart, CartItem, Order, OrderNote
from .pdf import proforma_pdf
from .serializers import (
    CheckoutSerializer, OrderDetailSerializer, OrderListSerializer, OrderNoteSerializer, OrderStaffDetailSerializer,
)


def _cart_payload(request, cart):
    customer = request.user.customer
    items = list(cart.items.select_related("product", "product__category"))
    lines = [(i.product, i.cartons) for i in items]
    q = services.quote(customer, lines)
    credit = credit_summary(customer)
    rows = []
    for ci, qi in zip(items, q["items"]):
        p = ci.product
        rows.append({
            "product": p.id, "name": p.name, "sku": p.sku, "image": request.build_absolute_uri(p.image.url) if p.image else None,
            "units_per_carton": p.units_per_carton, "min_order_cartons": p.min_order_cartons,
            "is_available": p.is_available, "cartons": ci.cartons, "unit_price": qi["unit_price"],
            "line_total": qi["line_total"],
        })
    return {
        "items": rows, "errors": q["errors"], "total_cartons": q["total_cartons"], "subtotal": q["subtotal"],
        "discount_percent": q["discount_percent"], "discount_amount": q["discount_amount"], "total": q["total"],
        "credit": credit, "default_address": customer.address,
        "credit_ok": (not customer.block_on_credit or customer.credit_limit == 0
                      or q["total"] <= credit["available_credit"]),
    }


class CartView(APIView):
    """GET cart · POST {product, cartons} set quantity (0 removes) · DELETE clears."""

    permission_classes = [CustomerCanOrder]

    def get_cart(self):
        return Cart.objects.get_or_create(user=self.request.user)[0]

    def get(self, request):
        return Response(_cart_payload(request, self.get_cart()))

    def post(self, request):
        cart = self.get_cart()
        try:
            cartons = int(request.data.get("cartons", 0))
        except (TypeError, ValueError):
            raise ValidationError({"cartons": ["تعداد نامعتبر است."]})
        product = get_object_or_404(visible_products_for(request.user), pk=request.data.get("product"))
        if cartons <= 0:
            CartItem.objects.filter(cart=cart, product=product).delete()
        else:
            if cartons > 100000:
                raise ValidationError({"cartons": ["تعداد بیش از حد مجاز است."]})
            CartItem.objects.update_or_create(cart=cart, product=product, defaults={"cartons": cartons})
        return Response(_cart_payload(request, cart))

    def delete(self, request):
        self.get_cart().items.all().delete()
        return Response(_cart_payload(request, self.get_cart()))


class CheckoutView(APIView):
    permission_classes = [CustomerCanOrder]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "order"

    @idempotent("checkout")
    def post(self, request):
        s = CheckoutSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        cart = Cart.objects.get_or_create(user=request.user)[0]
        items = list(cart.items.select_related("product"))
        order = services.place_order(
            request.user, [(i.product, i.cartons) for i in items], s.validated_data.get("delivery_address", ""),
            s.validated_data.get("customer_note", ""), is_lab=request.user.role == Role.LAB,
        )
        cart.items.all().delete()
        return Response(OrderDetailSerializer(order, context={"request": request}).data, status=201)


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Orders scoped by role: customer → own, rep → own region/customers, manager/admin → all."""

    filterset_fields = {
        "status": ["exact", "in"], "city": ["exact"], "city__province": ["exact"], "sales_rep": ["exact"],
        "customer": ["exact"], "created_at": ["gte", "lte"], "is_lab_order": ["exact"],
    }
    search_fields = ["number", "customer__business_name", "customer__phone"]
    ordering_fields = ["created_at", "total", "status"]

    def get_queryset(self):
        u = self.request.user
        qs = Order.objects.select_related("customer", "city", "sales_rep").annotate(items_count=Count("items")).order_by("-created_at")
        if u.is_customer and not (u.customer_id and u.customer.status == "approved"):
            raise PermissionDenied("حساب شما هنوز تأیید نشده است.")
        qs = scope_by_customer(qs, u)
        if self.action == "retrieve":
            qs = qs.prefetch_related("items__product", "status_logs__changed_by", "notes__author")
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return OrderListSerializer
        return OrderDetailSerializer if self.request.user.is_customer else OrderStaffDetailSerializer

    @action(detail=True)
    def proforma(self, request, pk=None):
        order = self.get_object()
        resp = HttpResponse(proforma_pdf(order), content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="proforma-{order.number}.pdf"'
        return resp

    @action(detail=True, methods=["post"], permission_classes=[CustomerCanOrder])
    def reorder(self, request, pk=None):
        """'Repeat previous order': copy still-available items into the cart."""
        order = self.get_object()
        cart = Cart.objects.get_or_create(user=request.user)[0]
        visible = visible_products_for(request.user).filter(is_available=True)
        skipped = []
        for item in order.items.select_related("product"):
            if visible.filter(pk=item.product_id).exists():
                CartItem.objects.update_or_create(cart=cart, product=item.product, defaults={"cartons": item.cartons})
            else:
                skipped.append(item.product_name)
        return Response({"skipped": skipped, "cart": _cart_payload(request, cart)})

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if request.user.is_customer and order.status != Order.Status.SUBMITTED:
            raise ValidationError({"status": ["فقط سفارش‌های بررسی‌نشده را می‌توانید لغو کنید."]})
        services.change_status(order, Order.Status.CANCELED, request.user, request.data.get("note", ""))
        return Response(self.get_serializer(order).data)

    # ---- staff actions ----
    @action(detail=True, methods=["post"], permission_classes=[IsStaffRole])
    def set_status(self, request, pk=None):
        order = self.get_object()
        services.change_status(order, request.data.get("status"), request.user, request.data.get("note", ""))
        return Response(OrderStaffDetailSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], permission_classes=[IsStaffRole])
    def edit_items(self, request, pk=None):
        order = self.get_object()
        services.edit_items(order, request.data.get("items", []), request.user)
        order.refresh_from_db()
        return Response(OrderStaffDetailSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], permission_classes=[IsStaffRole])
    def add_note(self, request, pk=None):
        order = self.get_object()
        text = (request.data.get("text") or "").strip()
        if not text:
            raise ValidationError({"text": ["متن یادداشت خالی است."]})
        note = OrderNote.objects.create(order=order, author=request.user, text=text)
        return Response(OrderNoteSerializer(note).data, status=201)

    @action(detail=False, permission_classes=[IsStaffRole])
    def stats(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return Response({r["status"]: r["n"] for r in qs.values("status").annotate(n=Count("id")).order_by()})


class ProductPickerView(APIView):
    """Staff helper to list products when editing an order."""

    permission_classes = [IsStaffRole]

    def get(self, request):
        qs = Product.objects.filter(is_active=True).values("id", "name", "sku", "min_order_cartons")
        return Response(list(qs))
