from rest_framework import serializers

from .models import Course, Lesson, QuizQuestion, RewardTier, SalesTarget


class SalesTargetSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.business_name", read_only=True)

    class Meta:
        model = SalesTarget
        fields = ["id", "customer", "customer_name", "year", "month", "target_amount"]


class RewardTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = RewardTier
        fields = ["id", "min_percent", "title", "reward_percent", "description"]


class LessonSerializer(serializers.ModelSerializer):
    completed = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = ["id", "course", "title", "video", "video_url", "body", "order", "completed"]

    def get_completed(self, obj):
        return obj.id in self.context.get("completed_ids", set())


class QuestionPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizQuestion
        fields = ["id", "text", "choices", "order"]


class QuestionAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizQuestion
        fields = ["id", "course", "text", "choices", "correct_index", "order"]


class CourseSerializer(serializers.ModelSerializer):
    lessons_count = serializers.IntegerField(read_only=True, default=0)
    completed_count = serializers.IntegerField(read_only=True, default=0)
    best_score = serializers.IntegerField(read_only=True, default=None)
    questions_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Course
        fields = ["id", "title", "summary", "cover", "audiences", "is_published", "created_at", "lessons_count",
                  "completed_count", "best_score", "questions_count"]
