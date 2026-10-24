import pytest

from apps.live_classes.models import Batch, BatchMembership

from .conftest import client

pytestmark = pytest.mark.django_db


def test_learner_and_instructor_session_lists(assert_constant_queries, world, make_course, make_session, enroll):
    def build(n):
        for _ in range(n):
            course = make_course(instructor=world.instructor)
            batch = Batch.objects.create(course=course, name="Evening", created_by=world.instructor)
            enroll(world.learner, course)
            BatchMembership.objects.create(batch=batch, user=world.learner)
            make_session(batch)

    assert_constant_queries(build, client(world.learner), "/api/v1/me/class-sessions/")
    assert_constant_queries(build, client(world.instructor), "/api/v1/admin/live-classes/sessions/")
    assert_constant_queries(build, client(world.instructor), "/api/v1/admin/live-classes/batches/")


def test_batch_list_with_a_course_per_batch(assert_constant_queries, world, make_course):
    def build(n):
        for _ in range(n):
            Batch.objects.create(course=make_course(instructor=world.instructor), name="B", created_by=world.instructor)

    assert_constant_queries(build, client(world.instructor), "/api/v1/admin/live-classes/batches/")
