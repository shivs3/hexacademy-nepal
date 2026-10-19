import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { SubscriberList } from "./subscriber-list";

export const metadata: Metadata = { title: "Newsletter" };

export default async function NewsletterPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "cms.view_newsletter_subscribers")) redirect("/admin");
  return (
    <>
      <PageHeader
        title="Newsletter subscribers"
        description="People who signed up through the website's newsletter forms. Exports include active subscribers only and are recorded in the audit log."
      />
      <SubscriberList />
    </>
  );
}
