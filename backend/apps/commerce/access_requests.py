"""Access requests: the checkout for paid courses and exams while no payment
gateway is connected.

A learner fills in the form (name, phone, how they paid). The request is
stored, emailed to the address in PaymentSettings and listed in the admin.
Staff check the payment themselves and approve, which enrolls the learner or
gives exam access; or reject it with a note. The form itself never grants
anything, and the price is read from the server, never from the browser.
"""

import logging
import secrets

from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.services import require_verified_email
from apps.assessments import access as exam_access
from apps.assessments.models import Exam, ExamAccess
from apps.audit import services as audit
from apps.catalog.models import Course
from apps.learning import services as learning
from apps.learning.models import Enrollment
from apps.notifications.models import Notification
from apps.notifications.services import notify
from common.exceptions import ConflictError, DomainError

from .models import AccessRequest, PaymentSettings

logger = logging.getLogger(__name__)


def _new_number() -> str:
    return f"RQ{timezone.localdate():%y%m%d}-{secrets.token_hex(3).upper()}"


def _check_course(user, course: Course) -> None:
    if not course.is_published:
        raise DomainError("This course is not available.", code="not_available", status_code=404)
    if course.is_free():
        raise DomainError("This course is free. Enroll from the course page.", code="free_item")
    enrollment = Enrollment.objects.filter(user=user, course=course).first()
    if enrollment and enrollment.is_active:
        raise ConflictError("You are already enrolled in this course.", code="already_enrolled")


def _check_exam(user, exam: Exam) -> None:
    if exam.status != Exam.Status.PUBLISHED or not exam.offered_on_its_own:
        raise DomainError("This exam is not available.", code="not_available", status_code=404)
    if exam.is_free:
        raise DomainError("This exam is free. Start it from the exam page.", code="free_item")
    if exam.course_id:
        enrollment = Enrollment.objects.filter(user=user, course_id=exam.course_id).first()
        if enrollment and enrollment.is_active:
            raise ConflictError("This exam is included with your course.", code="already_has_access")
    if ExamAccess.objects.filter(user=user, exam=exam, status=ExamAccess.Status.ACTIVE).exists():
        raise ConflictError("You already have access to this exam.", code="already_has_access")


def create(user, *, course: Course | None = None, exam: Exam | None = None, request=None, **details) -> AccessRequest:
    require_verified_email(user, "request a course or exam")
    if (course is None) == (exam is None):
        raise DomainError("Choose one course or one exam.")
    if course is not None:
        _check_course(user, course)
        kind, title, price = AccessRequest.Kind.COURSE, course.title, course.current_price()
    else:
        _check_exam(user, exam)
        kind, title, price = AccessRequest.Kind.EXAM, exam.title, exam.current_price()
    pending = AccessRequest.objects.filter(user=user, status=AccessRequest.Status.PENDING)
    if pending.filter(course=course).exists() if course else pending.filter(exam=exam).exists():
        raise ConflictError("You have already sent a request for this. We will be in touch.", code="already_requested")
    try:
        with transaction.atomic():
            req = AccessRequest.objects.create(
                number=_new_number(),
                user=user,
                kind=kind,
                course=course,
                exam=exam,
                item_title=title[:200],
                price=price,
                **details,
            )
            audit.record("commerce.access_requested", actor=user, target=req, request=request, kind=kind)
            transaction.on_commit(lambda: _queue_email(req.pk))
    except IntegrityError:  # a concurrent identical request won
        raise ConflictError(
            "You have already sent a request for this. We will be in touch.", code="already_requested"
        ) from None
    return req


def _queue_email(request_id: int) -> None:
    from .tasks import send_access_request_email

    try:
        send_access_request_email.delay(request_id)
    except Exception:  # broker down: the request is saved and shown in the admin
        logger.exception("Could not queue the email for access request %s", request_id)


def deliver_email(request_id: int) -> bool:
    """Email a new request to the address staff chose. Returns whether it was sent."""
    req = AccessRequest.objects.select_related("user").filter(pk=request_id).first()
    to = PaymentSettings.load().request_notify_email
    if req is None or not to:
        return False
    lines = [
        f"New {req.get_kind_display().lower()} request {req.number}",
        "",
        f"Item: {req.item_title}",
        f"Price: Rs {req.price}",
        f"Name: {req.full_name}",
        f"Account email: {req.user.email}",
        f"Phone: {req.phone}",
        f"Payment reference: {req.payment_reference or '—'}",
    ]
    if req.message:
        lines += ["", "Message:", req.message]
    lines += ["", f"Review it: {settings.FRONTEND_URL}/admin/commerce/requests?status=pending"]
    send_mail(
        subject=f"[Hexacademy] {req.get_kind_display()} request: {req.item_title}"[:200],
        message="\n".join(lines),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to],
    )
    return True


def _locked_pending(req: AccessRequest) -> AccessRequest:
    req = AccessRequest.objects.select_for_update(of=("self",)).select_related("user", "course", "exam").get(pk=req.pk)
    if req.status != AccessRequest.Status.PENDING:
        raise ConflictError(f"This request is already {req.get_status_display().lower()}.", code="not_pending")
    return req


def _close(req: AccessRequest, status: str, *, actor, note: str) -> None:
    req.status, req.staff_note, req.handled_by, req.handled_at = status, note, actor, timezone.now()
    req.save(update_fields=["status", "staff_note", "handled_by", "handled_at", "updated_at"])


@transaction.atomic
def approve(req: AccessRequest, *, actor, note: str = "", request=None) -> AccessRequest:
    req = _locked_pending(req)
    if req.kind == AccessRequest.Kind.COURSE:
        if req.course is None:
            raise DomainError("This course no longer exists. Reject the request instead.")
        learning.grant(req.user, req.course, actor=actor, request=request)
        link = f"/learn/{req.course.slug}"
    else:
        if req.exam is None:
            raise DomainError("This exam no longer exists. Reject the request instead.")
        exam_access.grant(req.user, req.exam, actor=actor, source=ExamAccess.Source.REQUEST, request=request)
        link = f"/dashboard/exams/{req.exam.slug}"
    _close(req, AccessRequest.Status.APPROVED, actor=actor, note=note)
    audit.record("commerce.access_request_approved", actor=actor, target=req, request=request)
    notify(
        [req.user],
        kind=Notification.Kind.GENERAL,
        title=f"Access approved: {req.item_title}",
        body=note or "Your request was approved. You can start now.",
        link=link,
        email=True,
    )
    return req


@transaction.atomic
def reject(req: AccessRequest, *, actor, note: str, request=None) -> AccessRequest:
    if not note.strip():
        raise DomainError("Tell the learner why the request was rejected.", code="note_required")
    req = _locked_pending(req)
    _close(req, AccessRequest.Status.REJECTED, actor=actor, note=note.strip())
    audit.record("commerce.access_request_rejected", actor=actor, target=req, request=request)
    notify(
        [req.user],
        kind=Notification.Kind.GENERAL,
        title=f"Request not approved: {req.item_title}",
        body=req.staff_note,
        link="/dashboard/requests",
        email=True,
    )
    return req


@transaction.atomic
def cancel(req: AccessRequest, *, actor, request=None) -> AccessRequest:
    req = _locked_pending(req)
    _close(req, AccessRequest.Status.CANCELLED, actor=actor, note="")
    audit.record("commerce.access_request_cancelled", actor=actor, target=req, request=request)
    return req
