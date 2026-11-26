from django.db.models import Count, Q
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework import mixins, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.models import Customer
from apps.core.permissions import Perm
from apps.core.services import notify
from apps.accounts.roles import Role

from .models import AgencyApplication, City, Province
from .serializers import AgencyApplicationSerializer, ProvinceSerializer


@method_decorator(cache_page(60 * 60), name="list")
class ProvinceViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Province.objects.prefetch_related("cities")
    serializer_class = ProvinceSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None


class CoverageViewSet(viewsets.ViewSet):
    permission_classes = [Perm("network")]

    def list(self, request):
        approved = Q(customers__status=Customer.Status.APPROVED)
        cities = (
            City.objects.select_related("province")
            .annotate(
                distributors=Count("customers", filter=approved & Q(customers__type=Customer.Type.DISTRIBUTOR)),
                stores=Count("customers", filter=approved & Q(customers__type=Customer.Type.STORE)),
                organizations=Count("customers", filter=approved & Q(customers__type=Customer.Type.ORGANIZATION)),
                applications=Count("agency_applications", filter=~Q(agency_applications__status="rejected")),
            )
            .order_by("province__name", "name")
        )
        rows = [
            {"id": c.id, "name": c.name, "province": c.province.name, "lat": c.lat, "lng": c.lng,
             "population": c.population, "distributors": c.distributors, "stores": c.stores,
             "organizations": c.organizations, "applications": c.applications}
            for c in cities
        ]
        covered = sum(1 for r in rows if r["distributors"])
        return Response({"cities": rows, "covered": covered, "uncovered": len(rows) - covered})


class AgencyApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = AgencyApplicationSerializer
    filterset_fields = ["status", "city", "city__province"]
    search_fields = ["full_name", "phone", "business_name"]

    def get_permissions(self):
        if self.action == "create":
            return [permissions.AllowAny()]
        return [Perm("network")()]

    def get_throttles(self):
        if self.action == "create":
            self.throttle_scope = "otp"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        return AgencyApplication.objects.select_related("city", "city__province")

    def perform_create(self, serializer):
        app = serializer.save(status=AgencyApplication.Status.NEW, admin_note="")
        from apps.accounts.models import User

        from apps.accounts.perms import users_with_perm

        for m in [u for u in users_with_perm("network") if u.role != Role.SALES_REP]:
            notify(m, "درخواست نمایندگی جدید", f"{app.full_name} - {app.city.name}", link="/admin/network")

    @action(detail=False)
    def stats(self, request):
        return Response({r["status"]: r["n"] for r in self.get_queryset().values("status").annotate(n=Count("id"))})
