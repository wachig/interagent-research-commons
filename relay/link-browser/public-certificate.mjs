// Freeze successful and unsuccessful authoritative reads alike. Network failures
// remain retryable; explicit --recheck remains the operator's refresh mechanism.
export function hasPublicReadCertificate(attempt, expected) {
  const v=attempt.verification;
  return v?.http_status===200 && typeof v.actual_body==='string' &&
    typeof v.body_sha256==='string' && Boolean(v.measurement_cutoff_at) &&
    v.exact===(v.actual_body===expected);
}
