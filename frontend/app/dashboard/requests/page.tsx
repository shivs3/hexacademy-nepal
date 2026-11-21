import type { Metadata } from "next";

import { MyAccessRequests } from "@/components/commerce/my-access-requests";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Access requests" };

export default function MyAccessRequestsPage() {
  return (
    <>
      <PageHeader
        title="Access requests"
        description="Paid courses and exams you asked for. Our team adds them to your account once your payment is confirmed."
      />
      <MyAccessRequests />
    </>
  );
}
