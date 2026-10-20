"""Question bank, exams and attempts.

The answer key lives in `QuestionOption.is_correct` (bank) and
`AttemptQuestion.answer_key` (attempt snapshot). Neither is ever serialised by
a learner endpoint before the exam's results are released: learners only ever
read `AttemptQuestion.content`, which is built without the key.

An attempt copies every question it uses into `AttemptQuestion` when it
starts, so later edits to the bank or the exam never change an attempt that is
under way or already graded.
"""

from decimal import Decimal

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.contrib.postgres.indexes import GinIndex
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from apps.catalog.models import Course
from apps.cms.models import MediaAsset
from common.models import TimeStampedModel

ZERO = Decimal("0")
MARKS = {"max_digits": 7, "decimal_places": 2}


class Difficulty(models.TextChoices):
    EASY = "easy", "Easy"
    MEDIUM = "medium", "Medium"
    HARD = "hard", "Hard"


class Subject(TimeStampedModel):
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.CharField(max_length=500, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "name"]
        permissions = [
            ("manage_question_bank", "Can manage every subject, topic and question, including answer keys"),
            ("manage_exams", "Can manage every exam and see every result"),
            ("author_course_assessments", "Can write questions and exams for the courses they teach"),
        ]

    def __str__(self):
        return self.name


class Topic(TimeStampedModel):
    """A topic, or a subtopic when `parent` is set (two levels only)."""

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="topics")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="children")
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "name"]
        constraints = [models.UniqueConstraint(fields=["subject", "slug"], name="assessments_topic_slug_unique")]

    def __str__(self):
        return self.name


class Question(TimeStampedModel):
    class Kind(models.TextChoices):
        SINGLE = "single", "Single choice"
        MULTIPLE = "multiple", "Multiple select"
        TRUE_FALSE = "true_false", "True or false"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Ready to use"
        RETIRED = "retired", "Retired"

    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name="questions")
    topic = models.ForeignKey(Topic, null=True, blank=True, on_delete=models.SET_NULL, related_name="questions")
    # Questions owned by a course can be edited by its instructors; course-less
    # questions form the shared bank, edited by question-bank managers only.
    course = models.ForeignKey(Course, null=True, blank=True, on_delete=models.SET_NULL, related_name="questions")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.SINGLE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    difficulty = models.CharField(max_length=20, choices=Difficulty.choices, default=Difficulty.MEDIUM)
    prompt = models.TextField(help_text="Sanitised rich text; formulas are stored as maths nodes.")
    image = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    explanation = models.TextField(blank=True)
    tags = ArrayField(models.CharField(max_length=40), default=list, blank=True)
    default_marks = models.DecimalField(**MARKS, default=Decimal("1"), validators=[MinValueValidator(Decimal("0.25"))])
    default_negative_marks = models.DecimalField(**MARKS, default=ZERO, validators=[MinValueValidator(ZERO)])
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["subject", "status"]),
            models.Index(fields=["topic", "status"]),
            GinIndex(fields=["tags"], name="assessments_question_tags"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(default_marks__gt=0), name="assessments_question_marks_positive"),
            models.CheckConstraint(
                condition=Q(default_negative_marks__gte=0), name="assessments_question_negative_nonneg"
            ),
        ]

    def __str__(self):
        return f"Question {self.pk}"


class QuestionOption(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    text = models.TextField()
    image = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    is_correct = models.BooleanField(default=False)  # the private answer key
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"Option {self.pk} of {self.question_id}"


class QuestionVersion(models.Model):
    """Immutable copy of a question (including its key) after each content change."""

    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="versions")
    version = models.PositiveIntegerField()
    snapshot = models.JSONField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version"]
        constraints = [
            models.UniqueConstraint(fields=["question", "version"], name="assessments_questionversion_unique")
        ]


class Exam(TimeStampedModel):
    class Kind(models.TextChoices):
        PRACTICE = "practice", "Practice test"
        FORMAL = "formal", "Formal assessment"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        CLOSED = "closed", "Closed"

    class ResultRelease(models.TextChoices):
        IMMEDIATE = "immediate", "As soon as the attempt ends"
        AFTER_CLOSE = "after_close", "When the exam window closes"
        MANUAL = "manual", "When staff publish the results"

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    instructions = models.TextField(blank=True)
    # A course exam is open to that course's active learners; an exam without a
    # course is open to every signed-in learner.
    course = models.ForeignKey(Course, null=True, blank=True, on_delete=models.PROTECT, related_name="exams")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.PRACTICE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)

    duration_minutes = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(600)])
    opens_at = models.DateTimeField(null=True, blank=True)
    closes_at = models.DateTimeField(null=True, blank=True)

    # Number of questions drawn for each attempt; null uses every question.
    question_count = models.PositiveIntegerField(null=True, blank=True)
    shuffle_questions = models.BooleanField(default=False)
    shuffle_options = models.BooleanField(default=False)
    negative_marking = models.BooleanField(default=False)
    pass_marks = models.DecimalField(**MARKS, null=True, blank=True)
    max_attempts = models.PositiveIntegerField(null=True, blank=True, help_text="Leave empty for unlimited attempts.")
    allow_revisit = models.BooleanField(default=True)

    result_release = models.CharField(max_length=20, choices=ResultRelease.choices, default=ResultRelease.IMMEDIATE)
    results_published_at = models.DateTimeField(null=True, blank=True)
    show_answers = models.BooleanField(default=True, help_text="Show correct answers in the review once released.")
    show_explanations = models.BooleanField(default=True)
    ranking_enabled = models.BooleanField(default=False)

    published_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "course"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(opens_at__isnull=True) | Q(closes_at__isnull=True) | Q(closes_at__gt=models.F("opens_at")),
                name="assessments_exam_window_order",
            ),
            models.CheckConstraint(
                condition=Q(question_count__isnull=True) | Q(question_count__gt=0),
                name="assessments_exam_question_count_positive",
            ),
            models.CheckConstraint(
                condition=Q(max_attempts__isnull=True) | Q(max_attempts__gt=0),
                name="assessments_exam_max_attempts_positive",
            ),
        ]

    def __str__(self):
        return self.title


class ExamQuestion(models.Model):
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="exam_questions")
    # PROTECT: a question used by an exam is retired, never deleted.
    question = models.ForeignKey(Question, on_delete=models.PROTECT, related_name="exam_links")
    position = models.PositiveIntegerField(default=0)
    marks = models.DecimalField(**MARKS)
    negative_marks = models.DecimalField(**MARKS, default=ZERO)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["exam", "question"], name="assessments_examquestion_unique"),
            models.CheckConstraint(condition=Q(marks__gt=0), name="assessments_examquestion_marks_positive"),
            models.CheckConstraint(condition=Q(negative_marks__gte=0), name="assessments_examquestion_negative_nonneg"),
        ]


class ExamAttempt(TimeStampedModel):
    """State machine: in_progress -> submitted (learner) | expired (deadline).

    Both end states are graded in the same transaction that ends the attempt,
    so `graded_at` is set exactly when the status is no longer in_progress.
    """

    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In progress"
        SUBMITTED = "submitted", "Submitted"
        EXPIRED = "expired", "Time ran out"

    exam = models.ForeignKey(Exam, on_delete=models.PROTECT, related_name="attempts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="exam_attempts")
    number = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS, db_index=True)
    started_at = models.DateTimeField()
    deadline = models.DateTimeField(db_index=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    graded_at = models.DateTimeField(null=True, blank=True)
    furthest_position = models.PositiveIntegerField(default=0)

    score = models.DecimalField(**MARKS, null=True, blank=True)
    max_score = models.DecimalField(**MARKS)
    correct_count = models.PositiveIntegerField(default=0)
    incorrect_count = models.PositiveIntegerField(default=0)
    unanswered_count = models.PositiveIntegerField(default=0)
    passed = models.BooleanField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [models.Index(fields=["exam", "status"]), models.Index(fields=["user", "-started_at"])]
        constraints = [
            models.UniqueConstraint(fields=["exam", "user", "number"], name="assessments_attempt_number_unique"),
            models.UniqueConstraint(
                fields=["exam", "user"],
                condition=Q(status="in_progress"),
                name="assessments_attempt_one_open",
            ),
            models.CheckConstraint(
                condition=(Q(status="in_progress") & Q(graded_at__isnull=True) & Q(ended_at__isnull=True))
                | (~Q(status="in_progress") & Q(graded_at__isnull=False) & Q(ended_at__isnull=False)),
                name="assessments_attempt_graded_when_ended",
            ),
        ]

    def __str__(self):
        return f"Attempt {self.number} of {self.exam_id} by {self.user_id}"

    @property
    def is_open(self) -> bool:
        return self.status == self.Status.IN_PROGRESS


class AttemptQuestion(models.Model):
    """The question exactly as this attempt saw it.

    `content` is the learner-visible part (prompt and options in display
    order, no key). `answer_key` and `explanation` stay on the server until
    the exam's results are released.
    """

    attempt = models.ForeignKey(ExamAttempt, on_delete=models.CASCADE, related_name="questions")
    position = models.PositiveIntegerField()
    question = models.ForeignKey(Question, null=True, on_delete=models.SET_NULL, related_name="+")
    question_version = models.PositiveIntegerField()
    kind = models.CharField(max_length=20, choices=Question.Kind.choices)
    topic_name = models.CharField(max_length=120, blank=True)
    subject_name = models.CharField(max_length=120, blank=True)
    content = models.JSONField()
    answer_key = models.JSONField()  # sorted list of correct option ids
    explanation = models.TextField(blank=True)
    marks = models.DecimalField(**MARKS)
    negative_marks = models.DecimalField(**MARKS, default=ZERO)

    class Meta:
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(fields=["attempt", "position"], name="assessments_attemptquestion_position_unique")
        ]


class AttemptAnswer(models.Model):
    attempt_question = models.OneToOneField(AttemptQuestion, on_delete=models.CASCADE, related_name="answer")
    selected = models.JSONField(default=list)  # sorted option ids; empty means cleared
    flagged = models.BooleanField(default=False)
    saved_at = models.DateTimeField()
    # Filled in by grading only.
    is_correct = models.BooleanField(null=True, blank=True)
    awarded_marks = models.DecimalField(**MARKS, null=True, blank=True)
