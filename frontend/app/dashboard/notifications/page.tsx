import type { Metadata } from "next";

import { NotificationsList } from "@/components/notifications/notifications-list";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notifications" description="Reminders and updates about your classes and courses." />
      <NotificationsList />
    </>
  );
}
