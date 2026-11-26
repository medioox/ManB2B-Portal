from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import Perm

from .models import SyncLog
from . import tasks


class SyncLogSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = SyncLog
        fields = ["id", "kind", "kind_display", "success", "message", "items", "created_at"]


@api_view(["GET"])
@permission_classes([Perm("integrations")])
def sync_logs(request):
    return Response(SyncLogSerializer(SyncLog.objects.all()[:50], many=True).data)


@api_view(["POST"])
@permission_classes([Perm("integrations")])
def run_sync(request):
    kind = request.data.get("kind")
    task = {"products": tasks.sync_products, "invoices": tasks.pull_invoices}.get(kind)
    if not task:
        return Response({"detail": "نوع همگام‌سازی نامعتبر است."}, status=400)
    res = task.delay()
    return Response({"queued": True, "task_id": res.id})
