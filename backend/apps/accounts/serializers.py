from django.db import transaction
from rest_framework import serializers

from apps.network.models import City, Province

from .models import Customer, CustomerDocument, User
from .otp import normalize_phone, read_registration_token
from .roles import CUSTOMER_ROLES, STAFF_ROLES


class CustomerDocumentSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = CustomerDocument
        fields = ["id", "kind", "kind_display", "file", "title", "created_at"]


class CustomerSerializer(serializers.ModelSerializer):
    city_name = serializers.CharField(source="city.name", read_only=True)
    province_name = serializers.CharField(source="city.province.name", read_only=True)
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    price_group_name = serializers.CharField(source="price_group.name", read_only=True, default=None)
    sales_rep_name = serializers.SerializerMethodField()
    documents = CustomerDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id", "type", "type_display", "business_name", "owner_name", "phone", "economic_code",
            "national_id", "license_number", "city", "city_name", "province_name", "address", "postal_code",
            "status", "status_display", "rejection_reason", "price_group", "price_group_name", "sales_rep",
            "sales_rep_name", "credit_limit", "block_on_credit", "accounting_code", "approved_at",
            "created_at", "documents",
        ]
        read_only_fields = ["status", "rejection_reason", "approved_at", "created_at"]

    def get_sales_rep_name(self, obj):
        return str(obj.sales_rep) if obj.sales_rep else None


class CustomerSelfSerializer(CustomerSerializer):
    """What a customer may edit about themselves."""

    class Meta(CustomerSerializer.Meta):
        read_only_fields = CustomerSerializer.Meta.fields


class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    full_name = serializers.SerializerMethodField()
    customer = CustomerSelfSerializer(read_only=True)
    region_ids = serializers.PrimaryKeyRelatedField(source="regions", many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "phone", "first_name", "last_name", "full_name", "role", "role_display",
            "is_customer_owner", "can_order", "can_view_finance", "job_title", "customer", "region_ids",
        ]

    def get_full_name(self, obj):
        return obj.get_full_name()


class RegisterSerializer(serializers.Serializer):
    registration_token = serializers.CharField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    type = serializers.ChoiceField(choices=[(r.value, r.label) for r in CUSTOMER_ROLES])
    business_name = serializers.CharField(max_length=200)
    economic_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    national_id = serializers.CharField(max_length=20, required=False, allow_blank=True)
    license_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all())
    address = serializers.CharField()
    postal_code = serializers.CharField(max_length=10, required=False, allow_blank=True)
    documents = serializers.ListField(child=serializers.FileField(), required=False, allow_empty=True)
    document_kinds = serializers.ListField(child=serializers.CharField(), required=False)

    def validate_registration_token(self, value):
        phone = read_registration_token(value)
        if not phone:
            raise serializers.ValidationError("مهلت ثبت‌نام تمام شده؛ دوباره کد تأیید بگیرید.")
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError("این شماره قبلاً ثبت‌نام کرده است.")
        return phone

    def validate_documents(self, files):
        for f in files:
            if f.size > 8 * 1024 * 1024:
                raise serializers.ValidationError("حجم هر فایل حداکثر ۸ مگابایت است.")
        return files

    @transaction.atomic
    def create(self, data):
        phone = data["registration_token"]
        docs = data.pop("documents", [])
        kinds = data.pop("document_kinds", [])
        customer = Customer.objects.create(
            type=data["type"], business_name=data["business_name"],
            owner_name=f"{data['first_name']} {data['last_name']}", phone=phone,
            economic_code=data.get("economic_code", ""), national_id=data.get("national_id", ""),
            license_number=data.get("license_number", ""), city=data["city"], address=data["address"],
            postal_code=data.get("postal_code", ""),
        )
        valid_kinds = set(CustomerDocument.Kind.values)
        for i, f in enumerate(docs):
            kind = kinds[i] if i < len(kinds) and kinds[i] in valid_kinds else CustomerDocument.Kind.OTHER
            CustomerDocument.objects.create(customer=customer, file=f, kind=kind, title=f.name[:150])
        user = User.objects.create(
            username=phone, phone=phone, first_name=data["first_name"], last_name=data["last_name"],
            role=data["type"], customer=customer, is_customer_owner=True, can_order=True, can_view_finance=True,
        )
        user.set_unusable_password()
        user.save()
        return user


class SubUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "phone", "first_name", "last_name", "job_title", "can_order", "can_view_finance", "is_active"]

    def validate_phone(self, value):
        phone = normalize_phone(value)
        qs = User.objects.filter(phone=phone)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("این شماره قبلاً در سامانه ثبت شده است.")
        return phone

    def create(self, data):
        owner = self.context["request"].user
        user = User(
            username=data["phone"], role=owner.role, customer=owner.customer, is_customer_owner=False, **data,
        )
        user.set_unusable_password()
        user.save()
        return user


class StaffUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    regions = serializers.PrimaryKeyRelatedField(many=True, required=False, queryset=Province.objects.all())
    customers_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = User
        fields = ["id", "username", "phone", "first_name", "last_name", "role", "role_display", "regions",
                  "is_active", "password", "customers_count"]

    def validate_role(self, value):
        if value not in STAFF_ROLES:
            raise serializers.ValidationError("نقش نامعتبر است.")
        return value

    def validate_phone(self, value):
        return normalize_phone(value) if value else None

    def create(self, data):
        regions = data.pop("regions", [])
        password = data.pop("password", "")
        user = User(**data)
        user.is_staff = data.get("role") == "admin"
        user.set_password(password) if password else user.set_unusable_password()
        user.save()
        user.regions.set(regions)
        return user

    def update(self, instance, data):
        regions = data.pop("regions", None)
        password = data.pop("password", "")
        for k, v in data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        if regions is not None:
            instance.regions.set(regions)
        return instance
