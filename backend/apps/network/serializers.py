from rest_framework import serializers

from .models import AgencyApplication, City, Province


class CitySerializer(serializers.ModelSerializer):
    province_name = serializers.CharField(source="province.name", read_only=True)

    class Meta:
        model = City
        fields = ["id", "name", "province", "province_name", "lat", "lng"]


class ProvinceSerializer(serializers.ModelSerializer):
    cities = CitySerializer(many=True, read_only=True)

    class Meta:
        model = Province
        fields = ["id", "name", "cities"]


class AgencyApplicationSerializer(serializers.ModelSerializer):
    city_name = serializers.CharField(source="city.name", read_only=True)
    province_name = serializers.CharField(source="city.province.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = AgencyApplication
        fields = ["id", "full_name", "phone", "business_name", "city", "city_name", "province_name", "experience",
                  "has_warehouse", "vehicles", "source", "status", "status_display", "admin_note", "created_at"]
        read_only_fields = ["created_at"]
