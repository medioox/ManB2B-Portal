import datetime as dt

from django.db import transaction
from django.db.models import F, Sum, Window
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.scoping import customers_for, scope_by_customer
from apps.core.idempotency import idempotent
from apps.core.pdf import build_table_doc, jdate, money
from apps.core.permissions import CustomerCanSeeFinance, IsManager
from apps.core.services import notify_customer
from apps.orders.models import Order

from .gateway import get_gateway
from .models import Cheque, Invoice, LedgerEntry, Payment, credit_summary
from .serializers import ChequeSerializer, InvoiceSerializer, LedgerEntrySerializer, PaymentSerializer


def _finance_guard(user):
    if user.is_customer and not CustomerCanSeeFinance().has_permission(type("R", (), {"user": user}), None):
        raise PermissionDenied("شما به بخش مالی دسترسی ندارید.")


def _customer_param(request):
    """Customers see themselves; staff pass ?customer=<id> (scoped)."""
    u = request.user
    if u.is_customer:
        _finance_guard(u)
        return u.customer
    cid = request.query_params.get("customer")
    if not cid:
        return None
    return get_object_or_404(customers_for(u), pk=cid)


class SummaryView(APIView):
    def get(self, request):
        c = _customer_param(request)
        if c is None:
            raise ValidationError({"customer": ["مشتری را مشخص کنید."]})
        data = credit_summary(c)
        today = timezone.localdate()
        # FIFO: payments settle the oldest debts first, so overdue = past-due debits − all credits.
        past_due = c.ledger.filter(due_date__lt=today).aggregate(t=Sum("debit"))["t"] or 0
        paid = c.ledger.aggregate(t=Sum("credit"))["t"] or 0
        data["overdue"] = min(max(0, past_due - paid), max(0, data["balance"]))
        data["upcoming_cheques"] = ChequeSerializer(
            c.cheques.filter(status=Cheque.Status.PENDING).order_by("due_date")[:5], many=True,
            context={"request": request}).data
        data["recent_payments"] = PaymentSerializer(c.payments.all()[:5], many=True).data
        return Response(data)


class LedgerViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = LedgerEntrySerializer
    filterset_fields = {"kind": ["exact"], "date": ["gte", "lte"], "customer": ["exact"]}

    def get_queryset(self):
        u = self.request.user
        _finance_guard(u)
        qs = scope_by_customer(LedgerEntry.objects.select_related("customer"), u)
        if u.is_customer or self.request.query_params.get("customer"):
            qs = qs.annotate(balance_after=Window(
                Sum(F("debit") - F("credit")), partition_by=[F("customer_id")], order_by=[F("date").asc(), F("id").asc()]
            ))
        return qs.order_by("-date", "-id")

    @action(detail=False)
    def statement(self, request):
        """Periodic statement (صورت‌حساب) PDF for a date range."""
        c = _customer_param(request)
        if c is None:
            raise ValidationError({"customer": ["مشتری را مشخص کنید."]})
        today = timezone.localdate()
        start = dt.date.fromisoformat(request.query_params.get("from") or (today - dt.timedelta(days=90)).isoformat())
        end = dt.date.fromisoformat(request.query_params.get("to") or today.isoformat())
        before = c.ledger.filter(date__lt=start).aggregate(d=Sum("debit"), c=Sum("credit"))
        opening = (before["d"] or 0) - (before["c"] or 0)
        rows, bal = [], opening
        for e in c.ledger.filter(date__gte=start, date__lte=end).order_by("date", "id"):
            bal += e.debit - e.credit
            rows.append([jdate(e.date), f"{e.get_kind_display()} {e.description}", money(e.debit) if e.debit else "-",
                         money(e.credit) if e.credit else "-", money(bal)])
        headers = ["تاریخ", "شرح", "بدهکار", "بستانکار", "مانده"]
        pdf = build_table_doc(
            "صورت‌حساب دوره‌ای",
            [("مشتری", c.business_name), ("از تاریخ", jdate(start)), ("تا تاریخ", jdate(end)),
             ("مانده ابتدای دوره", money(opening) + " ریال")],
            headers, rows, [("مانده پایان دوره", money(bal) + " ریال"), ("سقف اعتبار", money(c.credit_limit) + " ریال")],
        )
        resp = HttpResponse(pdf, content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="statement-{c.id}-{end}.pdf"'
        return resp


class ChequeViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                    viewsets.GenericViewSet):
    serializer_class = ChequeSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = {"status": ["exact"], "customer": ["exact"], "due_date": ["gte", "lte"]}

    def get_queryset(self):
        _finance_guard(self.request.user)
        return scope_by_customer(Cheque.objects.select_related("customer"), self.request.user)

    def perform_create(self, serializer):
        u = self.request.user
        if u.is_customer:
            customer = u.customer
        else:
            customer = get_object_or_404(customers_for(u), pk=self.request.data.get("customer"))
        serializer.save(customer=customer, submitted_by=u)

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def set_status(self, request, pk=None):
        cheque = self.get_object()
        new = request.data.get("status")
        if new not in Cheque.Status.values or new == cheque.status:
            raise ValidationError({"status": ["وضعیت نامعتبر است."]})
        with transaction.atomic():
            if new == Cheque.Status.CLEARED:
                LedgerEntry.objects.create(customer=cheque.customer, kind=LedgerEntry.Kind.CHEQUE, credit=cheque.amount,
                                           description=f"چک {cheque.number} - {cheque.bank}", reference=cheque.number,
                                           date=timezone.localdate())
            elif new == Cheque.Status.BOUNCED and cheque.status == Cheque.Status.CLEARED:
                LedgerEntry.objects.create(customer=cheque.customer, kind=LedgerEntry.Kind.BOUNCED, debit=cheque.amount,
                                           description=f"برگشت چک {cheque.number}", reference=cheque.number,
                                           date=timezone.localdate())
            cheque.status = new
            cheque.save(update_fields=["status", "updated_at"])
        notify_customer(cheque.customer, f"چک {cheque.number}: {cheque.get_status_display()}", link="/finance/cheques",
                        sms=new == Cheque.Status.BOUNCED)
        return Response(self.get_serializer(cheque).data)


class InvoiceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = InvoiceSerializer
    filterset_fields = {"kind": ["exact"], "customer": ["exact"], "issued_on": ["gte", "lte"]}
    search_fields = ["number", "order__number"]

    def get_queryset(self):
        _finance_guard(self.request.user)
        return scope_by_customer(Invoice.objects.select_related("customer", "order"), self.request.user)

    @action(detail=True)
    def download(self, request, pk=None):
        inv = self.get_object()
        if inv.file:
            return HttpResponseRedirect(inv.file.url)
        if inv.order is None:
            raise ValidationError("فایل این فاکتور هنوز از حسابداری دریافت نشده است.")
        from apps.orders.pdf import proforma_pdf

        resp = HttpResponse(proforma_pdf(inv.order), content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="invoice-{inv.number}.pdf"'
        return resp


class PaymentViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = PaymentSerializer

    def get_queryset(self):
        _finance_guard(self.request.user)
        return scope_by_customer(Payment.objects.select_related("order"), self.request.user)

    @action(detail=False, methods=["post"])
    @idempotent("payment")
    def start(self, request):
        u = request.user
        if not u.is_customer:
            raise PermissionDenied("پرداخت فقط از حساب مشتری امکان‌پذیر است.")
        try:
            amount = int(request.data.get("amount", 0))
        except (TypeError, ValueError):
            amount = 0
        if amount < 10000:
            raise ValidationError({"amount": ["حداقل مبلغ پرداخت ۱۰٬۰۰۰ ریال است."]})
        order = None
        if request.data.get("order"):
            order = get_object_or_404(Order.objects.filter(customer=u.customer), pk=request.data["order"])
        payment = Payment.objects.create(
            customer=u.customer, user=u, order=order, amount=amount,
            purpose=Payment.Purpose.PREPAYMENT if order else Payment.Purpose.SETTLEMENT,
            gateway=get_gateway().name,
        )
        authority, url = get_gateway().request(payment, request.data.get("callback_url", ""))
        payment.authority = authority
        payment.save(update_fields=["authority"])
        return Response({"payment": payment.id, "redirect_url": url, "authority": authority}, status=201)

    @action(detail=False, methods=["post"])
    def verify(self, request):
        with transaction.atomic():
            payment = get_object_or_404(
                Payment.objects.select_for_update(), authority=request.data.get("authority", ""),
                customer_id=request.user.customer_id,
            )
            if payment.status == Payment.Status.INITIATED:
                ok, ref = get_gateway().verify(payment, request.data)
                payment.status = Payment.Status.PAID if ok else Payment.Status.FAILED
                payment.ref_id = ref
                payment.save(update_fields=["status", "ref_id", "updated_at"])
                if ok:
                    LedgerEntry.objects.create(
                        customer=payment.customer, kind=LedgerEntry.Kind.PAYMENT, credit=payment.amount,
                        description="پرداخت اینترنتی" + (f" سفارش {payment.order.number}" if payment.order else ""),
                        reference=ref, date=timezone.localdate(),
                    )
        return Response(PaymentSerializer(payment).data)
