-- Forward-only: the base controls are already applied in staging. SQL CHECK
-- accepts NULL, so the original date/length condition also needs null pairing.
alter table app_private.fantasy_legacy_identity_repairs
 add constraint legacy_identity_release_audit_pairing
 check((released_at is null)=(release_reason is null));
