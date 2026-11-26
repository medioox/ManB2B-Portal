from rest_framework import serializers

from .models import Campaign, MarketingAsset


class CampaignSerializer(serializers.ModelSerializer):
    assets_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Campaign
        fields = ["id", "title", "description", "starts_on", "ends_on", "cover", "assets_count", "created_at"]


class MarketingAssetSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    campaign_title = serializers.CharField(source="campaign.title", read_only=True, default=None)

    class Meta:
        model = MarketingAsset
        fields = ["id", "campaign", "campaign_title", "title", "kind", "kind_display", "file", "thumbnail",
                  "size_bytes", "downloads", "created_at"]
        read_only_fields = ["size_bytes", "downloads"]
