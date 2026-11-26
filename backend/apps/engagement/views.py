import jdatetime
from django.db.models import Count, Max, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import Customer
from apps.accounts.scoping import customers_for
from apps.core.permissions import IsManager, IsManagerOrReadOnly
from apps.orders.models import Order
from apps.reports.services import COUNTED, JMONTHS

from .models import Course, Lesson, LessonProgress, QuizAttempt, QuizQuestion, RewardTier, SalesTarget
from .serializers import (
    CourseSerializer, LessonSerializer, QuestionAdminSerializer, QuestionPublicSerializer, RewardTierSerializer,
    SalesTargetSerializer,
)


def jmonth_range(year, month):
    start = jdatetime.date(year, month, 1)
    end = jdatetime.date(year + (month == 12), month % 12 + 1, 1) - jdatetime.timedelta(days=1)
    return start.togregorian(), end.togregorian()


def progress_for(customer, year, month):
    start, end = jmonth_range(year, month)
    sold = Order.objects.filter(customer=customer, status__in=COUNTED, created_at__date__gte=start,
                                created_at__date__lte=end).aggregate(t=Sum("total"))["t"] or 0
    target = SalesTarget.objects.filter(customer=customer, year=year, month=month).first()
    amount = int(target.target_amount) if target else 0
    pct = round(int(sold) * 100 / amount, 1) if amount else 0
    tiers = list(RewardTier.objects.all())
    reached = [t for t in tiers if pct >= t.min_percent]
    nxt = next((t for t in tiers if pct < t.min_percent), None)
    return {
        "year": year, "month": month, "month_name": JMONTHS[month - 1], "target": amount, "sold": int(sold),
        "percent": pct,
        "current_tier": RewardTierSerializer(reached[-1]).data if reached else None,
        "next_tier": RewardTierSerializer(nxt).data if nxt else None,
        "remaining_to_next": max(0, int(amount * nxt.min_percent / 100 - int(sold))) if nxt and amount else None,
        "reward_amount": int(int(sold) * reached[-1].reward_percent / 100) if reached else 0,
    }


@api_view(["GET"])
def my_progress(request):
    u = request.user
    if not u.customer_id:
        raise PermissionDenied()
    today = jdatetime.date.today()
    history = []
    y, m = today.year, today.month
    for _ in range(6):
        history.append(progress_for(u.customer, y, m))
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return Response({
        "current": history[0], "history": history[1:],
        "tiers": RewardTierSerializer(RewardTier.objects.all(), many=True).data,
        "leaderboard": leaderboard_data(today.year, today.month, highlight=u.customer_id),
    })


def leaderboard_data(year, month, highlight=None, limit=10):
    start, end = jmonth_range(year, month)
    rows = (
        Customer.objects.filter(type=Customer.Type.DISTRIBUTOR, status=Customer.Status.APPROVED)
        .annotate(sold=Sum("orders__total", filter=Q(orders__status__in=COUNTED, orders__created_at__date__gte=start,
                                                     orders__created_at__date__lte=end)))
        .filter(sold__gt=0).order_by("-sold").values("id", "business_name", "sold", "city__name")
    )
    out = []
    for i, r in enumerate(rows, 1):
        if i <= limit or r["id"] == highlight:
            out.append({"rank": i, "name": r["business_name"], "city": r["city__name"], "sold": int(r["sold"]),
                        "is_me": r["id"] == highlight})
    return out


@api_view(["GET"])
def targets_overview(request):
    """Staff: every distributor's progress this month."""
    if request.user.is_customer:
        raise PermissionDenied()
    today = jdatetime.date.today()
    year = int(request.query_params.get("year", today.year))
    month = int(request.query_params.get("month", today.month))
    rows = []
    for c in customers_for(request.user).filter(type=Customer.Type.DISTRIBUTOR, status=Customer.Status.APPROVED):
        p = progress_for(c, year, month)
        rows.append({"customer": c.id, "name": c.business_name, "city": c.city.name, **p})
    rows.sort(key=lambda r: -r["percent"])
    return Response({"year": year, "month": month, "rows": rows})


class SalesTargetViewSet(viewsets.ModelViewSet):
    serializer_class = SalesTargetSerializer
    permission_classes = [IsManager]
    filterset_fields = ["customer", "year", "month"]
    queryset = SalesTarget.objects.select_related("customer")


class RewardTierViewSet(viewsets.ModelViewSet):
    serializer_class = RewardTierSerializer
    permission_classes = [IsManagerOrReadOnly]
    pagination_class = None
    queryset = RewardTier.objects.all()


class CourseViewSet(viewsets.ModelViewSet):
    serializer_class = CourseSerializer
    permission_classes = [IsManagerOrReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None

    def get_queryset(self):
        u = self.request.user
        qs = Course.objects.annotate(
            lessons_count=Count("lessons", distinct=True),
            questions_count=Count("questions", distinct=True),
            completed_count=Count("lessons__lessonprogress", filter=Q(lessons__lessonprogress__user=u), distinct=True),
            best_score=Max("attempts__score", filter=Q(attempts__user=u)),
        )
        if u.is_customer:
            qs = qs.filter(is_published=True).filter(Q(audiences=[]) | Q(audiences__contains=[u.role]))
        return qs

    @action(detail=True)
    def lessons(self, request, pk=None):
        course = self.get_object()
        done = set(LessonProgress.objects.filter(user=request.user, lesson__course=course).values_list("lesson_id", flat=True))
        return Response(LessonSerializer(course.lessons.all(), many=True,
                                         context={"request": request, "completed_ids": done}).data)

    @action(detail=True, methods=["post"], url_path=r"lessons/(?P<lesson_id>\d+)/complete")
    def complete_lesson(self, request, pk=None, lesson_id=None):
        lesson = get_object_or_404(Lesson, pk=lesson_id, course=self.get_object())
        LessonProgress.objects.get_or_create(lesson=lesson, user=request.user)
        return Response({"ok": True})

    @action(detail=True)
    def quiz(self, request, pk=None):
        course = self.get_object()
        ser = QuestionAdminSerializer if not request.user.is_customer else QuestionPublicSerializer
        return Response(ser(course.questions.all(), many=True).data)

    @action(detail=True, methods=["post"])
    def submit_quiz(self, request, pk=None):
        course = self.get_object()
        answers = request.data.get("answers", {})
        qs = list(course.questions.all())
        if not qs:
            raise ValidationError("این دوره آزمون ندارد.")
        result, score = [], 0
        for q in qs:
            given = answers.get(str(q.id))
            ok = given is not None and int(given) == q.correct_index
            score += ok
            result.append({"question": q.id, "given": given, "correct_index": q.correct_index, "ok": ok})
        QuizAttempt.objects.create(course=course, user=request.user, score=score, total=len(qs), answers=result)
        return Response({"score": score, "total": len(qs), "result": result})


class LessonViewSet(viewsets.ModelViewSet):
    serializer_class = LessonSerializer
    permission_classes = [IsManager]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = Lesson.objects.all()
    filterset_fields = ["course"]


class QuestionViewSet(viewsets.ModelViewSet):
    serializer_class = QuestionAdminSerializer
    permission_classes = [IsManager]
    queryset = QuizQuestion.objects.all()
    filterset_fields = ["course"]
