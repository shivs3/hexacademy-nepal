"""Seed the demo IOE MSc Section A practice exam and its question bank.

Idempotent: subjects and topics are matched by slug, questions by their
`seed:<key>` tag, and the exam by slug, so a re-run never duplicates or
overwrites anything staff have edited. See apps/assessments/demo_ioe.py for the
questions and the sources of the exam pattern.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.assessments import demo_ioe, services
from apps.assessments.models import Exam, Question, Subject, Topic


class Command(BaseCommand):
    help = "Create the demo IOE MSc entrance Section A practice exam (labelled as demo content)."

    @transaction.atomic
    def handle(self, *args, **options):
        topics = self._subjects()
        items = []
        created = 0
        for spec, (marks, negative) in (
            *((s, demo_ioe.REASONING_MARKS) for s in demo_ioe.REASONING),
            *((s, demo_ioe.MATHEMATICS_MARKS) for s in demo_ioe.MATHEMATICS),
        ):
            question, new = self._question(spec, topics, Decimal(marks), Decimal(negative))
            created += new
            items.append({"question": question})
        self.stdout.write(f"Questions: {created} created, {len(items) - created} already present.")

        exam = Exam.objects.filter(slug=demo_ioe.EXAM["slug"]).first()
        if exam is None:
            exam = Exam.objects.create(
                **demo_ioe.EXAM,
                kind=Exam.Kind.PRACTICE,
                negative_marking=True,
                shuffle_options=True,
                result_release=Exam.ResultRelease.IMMEDIATE,
                show_answers=True,
                show_explanations=True,
            )
            services.set_exam_questions(None, exam, items)
            services.set_status(None, exam, Exam.Status.PUBLISHED)
            self.stdout.write(f"Exam {exam.slug}: created and published.")
        else:
            self.stdout.write(f"Exam {exam.slug}: already exists, left unchanged.")
        self.stdout.write(self.style.SUCCESS("Exam seed complete."))

    def _subjects(self) -> dict[tuple[str, str], Topic]:
        topics = {}
        for position, spec in enumerate(demo_ioe.SUBJECTS):
            subject, _ = Subject.objects.get_or_create(
                slug=spec["slug"],
                defaults={"name": spec["name"], "description": spec["description"], "position": position},
            )
            for t_pos, (slug, name) in enumerate(spec["topics"]):
                topics[spec["slug"], slug], _ = Topic.objects.get_or_create(
                    subject=subject, slug=slug, defaults={"name": name, "position": t_pos}
                )
        return topics

    def _question(self, spec, topics, marks: Decimal, negative: Decimal) -> tuple[Question, bool]:
        key, subject_slug, topic_slug, difficulty, prompt, options, explanation = spec
        tag = f"seed:{key}"
        existing = Question.objects.filter(tags__contains=[tag]).first()
        if existing:
            return existing, False
        topic = topics[subject_slug, topic_slug]
        question = services.create_question(
            None,
            {
                "subject": topic.subject,
                "topic": topic,
                "kind": Question.Kind.SINGLE,
                "status": Question.Status.ACTIVE,
                "difficulty": difficulty,
                "prompt": prompt,
                "explanation": explanation,
                "tags": [demo_ioe.SOURCE_TAG, "demo", tag],
                "default_marks": marks,
                "default_negative_marks": negative,
            },
            [{"text": text, "is_correct": correct} for text, correct in options],
            audit_event=False,
        )
        return question, True
