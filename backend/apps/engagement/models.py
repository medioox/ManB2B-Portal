from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class SalesTarget(TimeStampedModel):
    """Monthly sales goal for a customer (mostly distributors). Month stored as Jalali 'YYYY-MM'."""

    customer = models.ForeignKey("accounts.Customer", on_delete=models.CASCADE, related_name="targets")
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    target_amount = models.DecimalField(max_digits=16, decimal_places=0)

    class Meta:
        unique_together = ("customer", "year", "month")
        ordering = ["-year", "-month"]


class RewardTier(models.Model):
    """Reaching `min_percent` of the monthly target earns the reward."""

    min_percent = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=150)
    reward_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text="درصد پاداش از فروش")
    description = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["min_percent"]


class Course(TimeStampedModel):
    title = models.CharField(max_length=200)
    summary = models.TextField(blank=True)
    cover = models.ImageField(upload_to="courses/", blank=True)
    audiences = models.JSONField(default=list, blank=True)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]


class Lesson(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="lessons")
    title = models.CharField(max_length=200)
    video = models.FileField(upload_to="courses/videos/", blank=True)
    video_url = models.URLField(blank=True)
    body = models.TextField(blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]


class QuizQuestion(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="questions")
    text = models.CharField(max_length=300)
    choices = models.JSONField(help_text="list of strings")
    correct_index = models.PositiveSmallIntegerField()
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]


class QuizAttempt(TimeStampedModel):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="attempts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quiz_attempts")
    score = models.PositiveSmallIntegerField()
    total = models.PositiveSmallIntegerField()
    answers = models.JSONField(default=list)

    class Meta:
        ordering = ["-created_at"]


class LessonProgress(models.Model):
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("lesson", "user")
