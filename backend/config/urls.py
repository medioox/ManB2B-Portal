from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts import views as acc
from apps.catalog import views as cat
from apps.core import views as core
from apps.engagement import views as eng
from apps.finance import views as fin
from apps.integrations import views as integ
from apps.marketing import views as mkt
from apps.network import views as net
from apps.orders import views as ord_
from apps.reports import views as rep
from apps.support import views as sup

router = DefaultRouter()
router.register("announcements", core.AnnouncementViewSet, basename="announcement")
router.register("notifications", core.NotificationViewSet, basename="notification")
router.register("customers", acc.CustomerViewSet, basename="customer")
router.register("sub-users", acc.SubUserViewSet, basename="subuser")
router.register("users", acc.UserAdminViewSet, basename="useradmin")
router.register("positions", acc.PositionViewSet, basename="position")
router.register("provinces", net.ProvinceViewSet, basename="province")
router.register("coverage", net.CoverageViewSet, basename="coverage")
router.register("agency-applications", net.AgencyApplicationViewSet, basename="agency")
router.register("categories", cat.CategoryViewSet, basename="category")
router.register("products", cat.ProductViewSet, basename="product")
router.register("price-groups", cat.PriceGroupViewSet, basename="pricegroup")
router.register("volume-discounts", cat.VolumeDiscountViewSet, basename="volumediscount")
router.register("orders", ord_.OrderViewSet, basename="order")
router.register("campaigns", mkt.CampaignViewSet, basename="campaign")
router.register("marketing-assets", mkt.MarketingAssetViewSet, basename="asset")
router.register("finance/ledger", fin.LedgerViewSet, basename="ledger")
router.register("finance/cheques", fin.ChequeViewSet, basename="cheque")
router.register("finance/invoices", fin.InvoiceViewSet, basename="invoice")
router.register("finance/payments", fin.PaymentViewSet, basename="payment")
router.register("targets", eng.SalesTargetViewSet, basename="target")
router.register("reward-tiers", eng.RewardTierViewSet, basename="rewardtier")
router.register("courses", eng.CourseViewSet, basename="course")
router.register("lessons", eng.LessonViewSet, basename="lesson")
router.register("quiz-questions", eng.QuestionViewSet, basename="question")
router.register("returns", sup.ReturnRequestViewSet, basename="return")
router.register("tickets", sup.TicketViewSet, basename="ticket")

api = [
    path("health/live/", core.health_live),
    path("health/ready/", core.health_ready),
    path("auth/otp/request/", acc.OTPRequestView.as_view()),
    path("auth/otp/verify/", acc.OTPVerifyView.as_view()),
    path("auth/login/", acc.PasswordLoginView.as_view()),
    path("auth/register/", acc.RegisterView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/me/", acc.MeView.as_view()),
    path("auth/me/documents/", acc.MyDocumentsView.as_view()),
    path("staff/", acc.StaffListView.as_view()),
    path("cart/", ord_.CartView.as_view()),
    path("checkout/", ord_.CheckoutView.as_view()),
    path("product-picker/", ord_.ProductPickerView.as_view()),
    path("finance/summary/", fin.SummaryView.as_view()),
    path("reports/dashboard/", rep.manager_dashboard),
    path("reports/export/", rep.export_excel),
    path("rewards/me/", eng.my_progress),
    path("rewards/overview/", eng.targets_overview),
    path("integrations/logs/", integ.sync_logs),
    path("integrations/run/", integ.run_sync),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema")),
    path("", include(router.urls)),
]

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/v1/", include(api)),
]

if settings.DEBUG or settings.SERVE_MEDIA:
    urlpatterns += [path("media/<path:path>", serve, {"document_root": settings.MEDIA_ROOT})]
