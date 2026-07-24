-- BotolaGO Production V2
-- Phase 7B: transaction boundary for the terminal revocation status.
--
-- PostgreSQL requires a committed enum-value addition before later migrations
-- may reference that value in constraints and functions.

alter type app_private.staff_session_revocation_status
  add value if not exists 'dead_letter';
