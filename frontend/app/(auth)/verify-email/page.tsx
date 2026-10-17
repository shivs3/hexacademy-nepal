import type { Metadata } from "next";
import { Suspense } from "react";

import { VerifyEmail } from "./verify";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };

export default function VerifyEmailPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-bold text-navy">Email verification</h1>
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </>
  );
}
