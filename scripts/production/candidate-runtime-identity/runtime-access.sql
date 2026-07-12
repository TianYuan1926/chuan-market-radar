REVOKE ALL ON TABLE public.scan_archives FROM candidate_application_writer_role;
GRANT SELECT, INSERT ON TABLE public.scan_archives TO candidate_application_writer_role;

REVOKE ALL ON TABLE public.scan_archives FROM
  candidate_shadow_executor_role,
  candidate_audit_role;
