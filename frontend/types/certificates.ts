export type CertificateStatus = "valid" | "revoked";

export interface CertificateCourse {
  id: number;
  title: string;
  slug: string;
}

export interface MyCertificate {
  number: string;
  course: CertificateCourse;
  recipient_name: string;
  course_title: string;
  issued_at: string;
  status: CertificateStatus;
  revoked_at: string | null;
  verify_url: string;
}

export interface VerifiedCertificate {
  number: string;
  heading: string;
  recipient_name: string;
  course_title: string;
  issued_at: string;
  status: CertificateStatus;
  revoked_at: string | null;
}

export interface Requirement {
  key: string;
  label: string;
  met: boolean;
}

export interface CertificateEligibility {
  course: CertificateCourse;
  offered: boolean;
  eligible: boolean;
  requirements: Requirement[];
  certificate: MyCertificate | null;
}

export interface CertificateTemplate {
  id: number;
  name: string;
  heading: string;
  statement: string;
  signatory_name: string;
  signatory_title: string;
  footer_note: string;
  rule_count: number;
  certificate_count: number;
  updated_at: string;
}

export interface ExamRef {
  id: number;
  title: string;
  status: string;
  pass_marks: string | null;
}

export interface CertificateRule {
  id: number;
  course: CertificateCourse;
  is_enabled: boolean;
  template: number;
  template_name: string;
  require_lessons: boolean;
  required_exam: ExamRef | null;
  require_assignments: boolean;
  issued_count: number;
  updated_at: string;
}

export interface CertificateCourseOption extends CertificateCourse {
  status: string;
  exams: ExamRef[];
  has_rule: boolean;
}

export interface AdminCertificate {
  id: number;
  number: string;
  user: { id: number; full_name: string; email: string };
  course: CertificateCourse;
  recipient_name: string;
  course_title: string;
  issued_at: string;
  status: CertificateStatus;
  revoked_at: string | null;
  revoked_reason: string;
  revoked_by_name: string;
  verify_url: string;
}
