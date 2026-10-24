import pytest

from .conftest import order_for, pay_with_sandbox

pytestmark = pytest.mark.django_db


def test_order_history_and_finance_lists(assert_constant_queries, buyer, finance, paid_course):
    def build(n):
        for _ in range(n):
            pay_with_sandbox(buyer, paid_course())
            order_for(buyer, paid_course(), paid_course())

    assert_constant_queries(build, buyer, "/api/v1/me/orders/")
    assert_constant_queries(build, finance, "/api/v1/admin/commerce/orders/")
