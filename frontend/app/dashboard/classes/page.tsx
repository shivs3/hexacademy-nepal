import type { Metadata } from "next";

import { MyClasses } from "@/components/live-classes/my-classes";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Live classes" };

export default function ClassesPage() {
  return (
    <>
      <PageHeader
        title="Live classes"
        description="Classes for the batches you belong to. Times are Nepal time. The Join button opens 15 minutes before the start."
      />
      <MyClasses />
    </>
  );
}
