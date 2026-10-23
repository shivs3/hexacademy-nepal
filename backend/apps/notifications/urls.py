from django.urls import path

from . import views

urlpatterns = [
    path("me/notifications/", views.MyNotificationsView.as_view(), name="my-notifications"),
    path("me/notifications/unread-count/", views.UnreadCountView.as_view(), name="my-notifications-unread"),
    path("me/notifications/read/", views.MarkReadView.as_view(), name="my-notifications-read"),
]
