import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default function RegisterPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-bold text-navy">Create your account</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-teal-700 hover:underline">
          Sign in
        </Link>
      </p>
      <RegisterForm />
    </>
  );
}
