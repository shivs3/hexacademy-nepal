import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-bold text-navy">Sign in</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        New to Hexacademy?{" "}
        <Link href="/register" className="font-medium text-teal-700 hover:underline">
          Create an account
        </Link>
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
