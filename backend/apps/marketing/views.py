from django.db.models import Count, F
from django.http import HttpResponseRedirect
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from apps.core.permissions import IsManagerOrReadOnly

from .models import Campaign, MarketingAsset
from .serializers import CampaignSerializer, MarketingAssetSerializer


class CampaignViewSet(viewsets.ModelViewSet):
    serializer_class = CampaignSerializer
    permission_classes = [IsManagerOrReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None

    def get_queryset(self):
        return Campaign.objects.annotate(assets_count=Count("assets")).order_by("-created_at")


class MarketingAssetViewSet(viewsets.ModelViewSet):
    serializer_class = MarketingAssetSerializer
    permission_classes = [IsManagerOrReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["kind", "campaign"]
    search_fields = ["title"]
    queryset = MarketingAsset.objects.select_related("campaign")

    @action(detail=True)
    def download(self, request, pk=None):
        asset = self.get_object()
        MarketingAsset.objects.filter(pk=asset.pk).update(downloads=F("downloads") + 1)
        return HttpResponseRedirect(asset.file.url)
