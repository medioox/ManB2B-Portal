from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.db.models import Q
from rest_framework import mixins, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Announcement, Notification, PushSubscription
from .permissions import IsManagerOrReadOnly
from .serializers import AnnouncementSerializer, NotificationSerializer, PushSubscriptionSerializer


@api_view(["GET"])
@permission_classes([AllowAny])
def health_live(request):
    """Liveness: the process is up. Used by Docker/orchestrator to restart dead containers."""
    return Response({"status": "ok", "version": settings.APP_VERSION})


@api_view(["GET"])
@permission_classes([AllowAny])
def health_ready(request):
    """Readiness: dependencies reachable. The deploy script waits on this before switching traffic."""
    checks = {}
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception as e:  # noqa: BLE001
        checks["database"] = f"error: {e.__class__.__name__}"
    try:
        cache.set("health", "1", 5)
        checks["redis"] = "ok" if cache.get("health") == "1" else "degraded"
    except Exception as e:  # noqa: BLE001
        checks["redis"] = f"error: {e.__class__.__name__}"
    ok = checks["database"] == "ok"
    return Response({"status": "ok" if ok else "fail", "checks": checks, "version": settings.APP_VERSION},
                    status=200 if ok else 503)


class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer
    permission_classes = [IsManagerOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        qs = Announcement.objects.all()
        u = self.request.user
        if u.is_customer:
            qs = qs.filter(is_active=True).filter(Q(audiences=[]) | Q(audiences__contains=[u.role]))
        return qs[:50] if self.action == "list" else qs


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        resp = super().list(request, *args, **kwargs)
        resp.data["unread"] = self.get_queryset().filter(is_read=False).count()
        return resp

    @action(detail=False, methods=["post"])
    def read_all(self, request):
        self.get_queryset().update(is_read=True)
        return Response({"ok": True})

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        self.get_queryset().filter(pk=pk).update(is_read=True)
        return Response({"ok": True})

    @action(detail=False, methods=["post"])
    def subscribe(self, request):
        s = PushSubscriptionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        PushSubscription.objects.update_or_create(
            endpoint=s.validated_data["endpoint"],
            defaults={**s.validated_data, "user": request.user},
        )
        return Response({"ok": True})
