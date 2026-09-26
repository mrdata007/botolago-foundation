// Generated from the greenfield BotolaGO database. Do not edit by hand.
// Run `bun run backend:types:generate` after every schema migration.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  api: {
    Tables: {
      live_fixture_updates: {
        Row: {
          added_time: number | null
          away_score: number | null
          fixture_id: string
          home_score: number | null
          kickoff_at: string
          minute: number | null
          provider_updated_at: string
          source_sequence: number
          status: string
          updated_at: string
        }
        Insert: {
          added_time?: number | null
          away_score?: number | null
          fixture_id: string
          home_score?: number | null
          kickoff_at: string
          minute?: number | null
          provider_updated_at: string
          source_sequence: number
          status: string
          updated_at?: string
        }
        Update: {
          added_time?: number | null
          away_score?: number | null
          fixture_id?: string
          home_score?: number | null
          kickoff_at?: string
          minute?: number | null
          provider_updated_at?: string
          source_sequence?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      my_account_deletion_requests: {
        Row: {
          id: string | null
          processed_at: string | null
          requested_at: string | null
          status: Database["app"]["Enums"]["account_deletion_status"] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string | null
          processed_at?: string | null
          requested_at?: string | null
          status?: Database["app"]["Enums"]["account_deletion_status"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string | null
          processed_at?: string | null
          requested_at?: string | null
          status?: Database["app"]["Enums"]["account_deletion_status"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      my_followed_competitions: {
        Row: {
          competition_id: string | null
          created_at: string | null
          user_id: string | null
        }
        Insert: {
          competition_id?: string | null
          created_at?: string | null
          user_id?: string | null
        }
        Update: {
          competition_id?: string | null
          created_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followed_competitions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      my_followed_teams: {
        Row: {
          created_at: string | null
          team_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          team_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          team_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followed_teams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      my_profile: {
        Row: {
          avatar_url: string | null
          breaking_news: boolean | null
          created_at: string | null
          display_name: string | null
          fantasy_deadline_reminders: boolean | null
          favorite_club_id: string | null
          favorite_team_id: string | null
          favorite_team_provisional_ref: string | null
          id: string | null
          match_alerts: boolean | null
          normalized_username: string | null
          onboarding_completed_at: string | null
          preferred_language: Database["app"]["Enums"]["language_code"] | null
          updated_at: string | null
          username: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_fantasy_chip: {
        Args: {
          p_chip_type: Database["app"]["Enums"]["fantasy_chip_type"]
          p_expected_version: number
          p_gameweek_id: string
          p_idempotency_key: string
          p_team_id: string
        }
        Returns: Json
      }
      admin_add_fantasy_prize_winner_note: {
        Args: { p_idempotency_key: string; p_note: string; p_winner_id: string }
        Returns: Json
      }
      admin_approve_request: {
        Args: {
          p_approval_id: string
          p_idempotency_key: string
          p_payload_fingerprint: string
          p_reason: string
        }
        Returns: Json
      }
      admin_assign_role: {
        Args: {
          p_approval_id?: string
          p_expires_at: string
          p_idempotency_key: string
          p_reason: string
          p_reference: string
          p_role_name: string
          p_target_auth_user_id: string
        }
        Returns: Json
      }
      admin_ban_user: {
        Args: {
          p_duration_hours: number
          p_idempotency_key: string
          p_reason: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_bootstrap_first_platform_admin: {
        Args: {
          p_auth_user_id: string
          p_reason?: string
          p_synthetic_test?: boolean
        }
        Returns: Json
      }
      admin_cancel_request: {
        Args: {
          p_approval_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      admin_claim_session_revocations: {
        Args: { p_limit?: number }
        Returns: Json
      }
      admin_claim_session_revocations_v2: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_worker_id: string
          p_worker_run_id: string
        }
        Returns: Json
      }
      admin_complete_session_revocation: {
        Args: {
          p_error_code?: string
          p_request_id: string
          p_succeeded: boolean
        }
        Returns: undefined
      }
      admin_complete_session_revocation_v2: {
        Args: {
          p_lease_token: string
          p_request_id: string
          p_result_code: string
        }
        Returns: Json
      }
      admin_create_staff_principal: {
        Args: {
          p_idempotency_key: string
          p_reason: string
          p_target_auth_user_id: string
        }
        Returns: Json
      }
      admin_emergency_revoke_staff: {
        Args: {
          p_idempotency_key: string
          p_reason: string
          p_staff_principal_id: string
        }
        Returns: Json
      }
      admin_execute_approved_platform_admin: {
        Args: {
          p_approval_id: string
          p_idempotency_key: string
          p_payload_fingerprint: string
          p_reason: string
        }
        Returns: Json
      }
      admin_expire_approvals: { Args: { p_limit?: number }; Returns: number }
      admin_fail_session_revocation: {
        Args: {
          p_error_code: string
          p_error_summary: string
          p_lease_token: string
          p_request_id: string
          p_retryable: boolean
        }
        Returns: Json
      }
      admin_finish_session_revocation_worker: {
        Args: {
          p_error_code?: string
          p_status: string
          p_worker_run_id: string
        }
        Returns: Json
      }
      admin_get_analytics_overview: { Args: never; Returns: Json }
      admin_get_approval: { Args: { p_approval_id: string }; Returns: Json }
      admin_get_fantasy_prize_settings: {
        Args: { p_season_id?: string }
        Returns: Json
      }
      admin_get_owner_bootstrap_readiness: {
        Args: { p_auth_user_id: string }
        Returns: Json
      }
      admin_get_revocation_worker_health: { Args: never; Returns: Json }
      admin_get_revocation_worker_runtime_status: { Args: never; Returns: Json }
      admin_get_session_revocation_status: {
        Args: { p_staff_principal_id: string }
        Returns: Json
      }
      admin_get_staff_principal: {
        Args: { p_staff_principal_id: string }
        Returns: Json
      }
      admin_get_user: { Args: { p_user_id: string }; Returns: Json }
      admin_list_active_assignments: {
        Args: { p_staff_principal_id: string }
        Returns: Json
      }
      admin_list_approval_queue: {
        Args: {
          p_before_id?: string
          p_before_requested_at?: string
          p_execution_status?: string
          p_limit?: number
          p_scope?: string
          p_status?: string
          p_target_domain?: string
        }
        Returns: Json
      }
      admin_list_assignment_history: {
        Args: {
          p_before_created_at?: string
          p_before_id?: string
          p_limit?: number
          p_staff_principal_id: string
        }
        Returns: Json
      }
      admin_list_audit_events: {
        Args: {
          p_before_id?: number
          p_before_occurred_at?: string
          p_limit?: number
        }
        Returns: Json
      }
      admin_list_audit_events_v2: {
        Args: {
          p_action?: string
          p_actor_principal_id?: string
          p_approval_id?: string
          p_before_id?: number
          p_before_occurred_at?: string
          p_correlation_id?: string
          p_from?: string
          p_limit?: number
          p_outcome?: string
          p_synthetic_test?: boolean
          p_target_domain?: string
          p_target_entity_type?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_list_fantasy_prize_flags: { Args: never; Returns: Json }
      admin_list_fantasy_prize_winners: {
        Args: {
          p_after_created_at?: string
          p_after_id?: string
          p_limit?: number
          p_status?: string
        }
        Returns: Json
      }
      admin_list_fantasy_prizes: { Args: never; Returns: Json }
      admin_list_role_catalog: { Args: never; Returns: Json }
      admin_list_staff_assignments: {
        Args: {
          p_assignment_status?: string
          p_before_created_at?: string
          p_before_id?: string
          p_limit?: number
          p_principal_status?: string
          p_role_name?: string
        }
        Returns: Json
      }
      admin_list_users: {
        Args: {
          p_after_created_at?: string
          p_after_id?: string
          p_limit?: number
          p_query?: string
          p_status?: string
        }
        Returns: Json
      }
      admin_override_fantasy_prize_winner: {
        Args: {
          p_fantasy_team_id: string
          p_idempotency_key: string
          p_reason: string
          p_username: string
          p_winner_id: string
        }
        Returns: Json
      }
      admin_reject_request: {
        Args: {
          p_approval_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      admin_renew_role: {
        Args: {
          p_approval_id?: string
          p_assignment_id: string
          p_expires_at: string
          p_idempotency_key: string
          p_reason: string
          p_reference: string
        }
        Returns: Json
      }
      admin_replay_session_revocation_dead_letter: {
        Args: { p_reason: string; p_request_id: string }
        Returns: Json
      }
      admin_request_approval: {
        Args: {
          p_expires_at: string
          p_idempotency_key: string
          p_operation_type: string
          p_reason: string
          p_required_permission: string
          p_safe_payload_reference: Json
          p_target_domain: string
          p_target_entity_id: string
        }
        Returns: Json
      }
      admin_resolve_staff_user_exact: {
        Args: { p_email: string }
        Returns: Json
      }
      admin_restore_staff: {
        Args: {
          p_idempotency_key: string
          p_reason: string
          p_staff_principal_id: string
        }
        Returns: Json
      }
      admin_revoke_role: {
        Args: {
          p_assignment_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      admin_save_fantasy_prize: {
        Args: {
          p_active: boolean
          p_description_ar: string
          p_description_fr: string
          p_estimated_value_mad: number
          p_idempotency_key: string
          p_image_url: string
          p_name_ar: string
          p_name_fr: string
          p_prize_id: string
          p_reason: string
          p_sponsor_logo_url: string
          p_sponsor_name: string
          p_tier: string
        }
        Returns: Json
      }
      admin_save_fantasy_prize_settings: {
        Args: {
          p_gameweek_count: number
          p_idempotency_key: string
          p_mini_league_min_members: number
          p_reason: string
          p_season_id: string
        }
        Returns: Json
      }
      admin_set_fantasy_prize_flag: {
        Args: {
          p_flagged: boolean
          p_idempotency_key: string
          p_reason: string
          p_user_id: string
          p_username: string
        }
        Returns: Json
      }
      admin_set_fantasy_prize_winner_status: {
        Args: {
          p_idempotency_key: string
          p_note: string
          p_status: string
          p_winner_id: string
        }
        Returns: Json
      }
      admin_shorten_role_expiry: {
        Args: {
          p_assignment_id: string
          p_expires_at: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      admin_start_session_revocation_worker: {
        Args: { p_synthetic_test?: boolean; p_worker_id: string }
        Returns: Json
      }
      admin_suspend_staff: {
        Args: {
          p_idempotency_key: string
          p_reason: string
          p_staff_principal_id: string
        }
        Returns: Json
      }
      admin_unban_user: {
        Args: { p_idempotency_key: string; p_reason: string; p_user_id: string }
        Returns: Json
      }
      archive_fantasy_league: {
        Args: { p_league_id: string; p_team_id: string }
        Returns: boolean
      }
      attach_football_team_crest: {
        Args: {
          p_external_team_id: string
          p_mime_type: string
          p_observed_at: string
          p_provider_name: string
          p_source_url: string
          p_storage_path: string
        }
        Returns: Json
      }
      begin_football_ingestion: {
        Args: {
          p_checkpoint?: Json
          p_job_type: string
          p_provider_name: string
          p_target_scope?: Json
        }
        Returns: string
      }
      begin_historical_performance_ingestion: {
        Args: {
          p_checkpoint?: Json
          p_provider_name: string
          p_season_external_id: string
          p_target_scope?: Json
        }
        Returns: string
      }
      cancel_account_deletion: { Args: never; Returns: boolean }
      cancel_fantasy_chip: {
        Args: {
          p_expected_version: number
          p_gameweek_id: string
          p_team_id: string
        }
        Returns: Json
      }
      cast_match_vote: {
        Args: { p_choice: string; p_fixture_id: string; p_question: string }
        Returns: Json
      }
      claim_guest_predictions: { Args: { p_items: Json }; Returns: Json }
      complete_football_ingestion: {
        Args: {
          p_checkpoint?: Json
          p_error_code?: string
          p_error_summary?: string
          p_records_fetched?: number
          p_records_inserted?: number
          p_records_rejected?: number
          p_records_skipped?: number
          p_records_updated?: number
          p_records_validated?: number
          p_retry_count?: number
          p_run_id: string
          p_status: string
        }
        Returns: undefined
      }
      complete_onboarding: {
        Args: {
          avatar_path: string
          breaking_news?: boolean
          display_name: string
          fantasy_deadline_reminders?: boolean
          favorite_team_id?: string
          favorite_team_provisional_ref?: string
          match_alerts?: boolean
          preferred_language: Database["app"]["Enums"]["language_code"]
          username: string
        }
        Returns: undefined
      }
      confirm_fantasy_transfers: {
        Args: {
          p_chip_type?: Database["app"]["Enums"]["fantasy_chip_type"]
          p_expected_version: number
          p_gameweek_id: string
          p_idempotency_key: string
          p_team_id: string
          p_transfers: Json
        }
        Returns: Json
      }
      create_fantasy_league: {
        Args: {
          p_idempotency_key: string
          p_name: string
          p_season_id: string
          p_team_id: string
          p_visibility: Database["app"]["Enums"]["fantasy_league_visibility"]
        }
        Returns: Json
      }
      create_fantasy_team: {
        Args: {
          p_gameweek_id: string
          p_idempotency_key: string
          p_season_id: string
          p_selection: Json
          p_team_name: string
        }
        Returns: Json
      }
      create_prediction_league: { Args: { p_name: string }; Returns: Json }
      disable_my_notification_device: {
        Args: { p_device_id: string }
        Returns: boolean
      }
      dismiss_my_notification: {
        Args: { p_archive?: boolean; p_notification_id: string }
        Returns: boolean
      }
      editorial_convert_imported_story: {
        Args: { p_reason: string; p_story_id: string }
        Returns: Json
      }
      editorial_create_draft: {
        Args: {
          p_author_id?: string
          p_body_format: Database["app"]["Enums"]["article_body_format"]
          p_body_html: string
          p_body_html_mac: string
          p_body_source: string
          p_language: string
          p_publisher_id?: string
          p_reading_time_minutes: number
          p_sanitizer_version: string
          p_slug: string
          p_story_id?: string
          p_summary: string
          p_title: string
        }
        Returns: Json
      }
      editorial_get_article: {
        Args: { p_article_edition_id: string }
        Returns: Json
      }
      editorial_list_revisions: {
        Args: { p_article_edition_id: string; p_limit?: number }
        Returns: Json
      }
      editorial_list_stories: {
        Args: {
          p_after_id?: string
          p_after_updated_at?: string
          p_language?: string
          p_limit?: number
          p_query?: string
          p_scope?: string
          p_status?: Database["app"]["Enums"]["publication_status"]
        }
        Returns: Json
      }
      editorial_register_media: {
        Args: {
          p_alt_text: string
          p_attribution_url?: string
          p_caption?: string
          p_copyright_owner?: string
          p_credit?: string
          p_height: number
          p_kind?: Database["app"]["Enums"]["media_kind"]
          p_license_url?: string
          p_mime_type: string
          p_storage_path: string
          p_width: number
        }
        Returns: Json
      }
      editorial_schedule_health: { Args: never; Returns: Json }
      editorial_set_placement: {
        Args: {
          p_article_edition_id: string
          p_ends_at?: string
          p_placement_type: Database["app"]["Enums"]["placement_type"]
          p_priority?: number
          p_scope_id?: string
          p_scope_type?: Database["app"]["Enums"]["placement_scope"]
          p_starts_at?: string
        }
        Returns: Json
      }
      editorial_soft_delete_story: {
        Args: { p_story_id: string }
        Returns: Json
      }
      editorial_transition_article: {
        Args: {
          p_article_edition_id: string
          p_scheduled_at?: string
          p_target_status: Database["app"]["Enums"]["publication_status"]
          p_visibility?: Database["app"]["Enums"]["article_visibility"]
        }
        Returns: Json
      }
      editorial_update_article: {
        Args: {
          p_article_edition_id: string
          p_body_format: Database["app"]["Enums"]["article_body_format"]
          p_body_html: string
          p_body_html_mac: string
          p_body_source: string
          p_expected_updated_at: string
          p_hero_asset_id?: string
          p_reading_time_minutes: number
          p_sanitizer_version: string
          p_seo_description?: string
          p_seo_title?: string
          p_slug: string
          p_subtitle: string
          p_summary: string
          p_title: string
        }
        Returns: Json
      }
      editorial_write_secret_for_service: { Args: never; Returns: string }
      fantasy_fixture_difficulty: {
        Args: {
          p_from_gameweek: number
          p_gameweek_count?: number
          p_season_id: string
        }
        Returns: Json
      }
      fantasy_gameweek_summary: {
        Args: { p_gameweek_id: string }
        Returns: Json
      }
      fantasy_gameweeks: {
        Args: {
          p_before_sequence?: number
          p_limit?: number
          p_season_id: string
        }
        Returns: Json
      }
      fantasy_hub: { Args: { p_language?: string }; Returns: Json }
      fantasy_league_standings: {
        Args: {
          p_after_rank?: number
          p_after_team_id?: string
          p_gameweek_id?: string
          p_league_id: string
          p_limit?: number
        }
        Returns: Json
      }
      fantasy_leagues: {
        Args: { p_limit?: number; p_season_id: string; p_visibility?: string }
        Returns: Json
      }
      fantasy_overall_standings: {
        Args: {
          p_after_rank?: number
          p_after_team_id?: string
          p_gameweek_id?: string
          p_limit?: number
          p_season_id: string
        }
        Returns: Json
      }
      fantasy_player_gameweek_history: {
        Args: { p_fantasy_player_id: string }
        Returns: Json
      }
      fantasy_player_pool: {
        Args: {
          p_after_id?: string
          p_after_price?: number
          p_limit?: number
          p_max_price?: number
          p_position?: string
          p_search?: string
          p_season_id: string
          p_team_id?: string
        }
        Returns: Json
      }
      fantasy_player_season_stats: {
        Args: { p_season_id: string; p_through_gameweek_id?: string }
        Returns: Json
      }
      fantasy_prize_winners: {
        Args: {
          p_after_created_at?: string
          p_after_id?: string
          p_limit?: number
        }
        Returns: Json
      }
      fantasy_prizes: { Args: never; Returns: Json }
      fantasy_rules: { Args: { p_season_id: string }; Returns: Json }
      fantasy_top_players: {
        Args: { p_gameweek_id: string; p_limit?: number }
        Returns: Json
      }
      follow_competition: {
        Args: { p_competition_id: string }
        Returns: boolean
      }
      follow_team: { Args: { p_team_id: string }; Returns: boolean }
      football_competition_fixtures: {
        Args: {
          p_after_id?: string
          p_after_kickoff?: string
          p_competition_id: string
          p_language?: string
          p_limit?: number
          p_season_id?: string
        }
        Returns: Json
      }
      football_competition_summary: {
        Args: { p_competition_id: string; p_language?: string }
        Returns: Json
      }
      football_current_performance_fixture_batch: {
        Args: {
          p_after_fixture_external_id?: string
          p_limit?: number
          p_provider_name: string
          p_season_external_id: string
        }
        Returns: Json
      }
      football_head_to_head: {
        Args: { p_fixture_id: string; p_language?: string; p_limit?: number }
        Returns: Json
      }
      football_historical_performance_fixture_batch: {
        Args: {
          p_after_fixture_external_id?: string
          p_limit?: number
          p_provider_name: string
          p_season_external_id: string
        }
        Returns: Json
      }
      football_historical_player_rating_inputs: {
        Args: { p_provider_name: string; p_season_external_id: string }
        Returns: Json
      }
      football_home_matches: {
        Args: { p_language?: string; p_limit?: number }
        Returns: Json
      }
      football_live_matches: {
        Args: { p_language?: string; p_limit?: number }
        Returns: Json
      }
      football_match_absences: {
        Args: { p_fixture_id: string; p_language?: string }
        Returns: Json
      }
      football_match_detail: {
        Args: { p_fixture_id: string; p_language?: string }
        Returns: Json
      }
      football_match_lineups: {
        Args: { p_fixture_id: string; p_language?: string }
        Returns: Json
      }
      football_match_pressure: {
        Args: { p_fixture_id: string; p_language?: string }
        Returns: Json
      }
      football_match_statistics: {
        Args: { p_fixture_id: string; p_language?: string }
        Returns: Json
      }
      football_match_timeline: {
        Args: { p_fixture_id: string; p_language?: string }
        Returns: Json
      }
      football_matches_by_date: {
        Args: {
          p_after_id?: string
          p_after_kickoff?: string
          p_competition_id?: string
          p_date: string
          p_language?: string
          p_limit?: number
          p_season_id?: string
          p_statuses?: string[]
          p_timezone?: string
        }
        Returns: Json
      }
      football_player_availability: {
        Args: { p_limit?: number; p_player_id: string }
        Returns: Json
      }
      football_player_rating_candidates: {
        Args: { p_provider_name: string; p_season_external_id: string }
        Returns: Json
      }
      football_player_season_ratings: {
        Args: {
          p_after_player_id?: string
          p_after_rating?: number
          p_limit?: number
          p_position?: string
          p_season_id: string
        }
        Returns: Json
      }
      football_player_summary: {
        Args: { p_language?: string; p_player_id: string }
        Returns: Json
      }
      football_season_catalog: {
        Args: { p_language?: string; p_limit?: number }
        Returns: Json
      }
      football_standings: {
        Args: {
          p_group_key?: string
          p_language?: string
          p_season_id: string
          p_table_type?: string
        }
        Returns: Json
      }
      football_team_catalog: {
        Args: { p_language?: string; p_limit?: number }
        Returns: Json
      }
      football_team_fixtures: {
        Args: {
          p_before_id?: string
          p_before_kickoff?: string
          p_language?: string
          p_limit?: number
          p_team_id: string
        }
        Returns: Json
      }
      football_team_squad: {
        Args: { p_language?: string; p_season_id?: string; p_team_id: string }
        Returns: Json
      }
      football_team_summary: {
        Args: { p_language?: string; p_team_id: string }
        Returns: Json
      }
      football_upcoming_matches: {
        Args: { p_language?: string; p_limit?: number }
        Returns: Json
      }
      get_my_account_standing: { Args: never; Returns: Json }
      get_my_fantasy_history: {
        Args: {
          p_before_gameweek_sequence?: number
          p_limit?: number
          p_team_id: string
        }
        Returns: Json
      }
      get_my_fantasy_points: {
        Args: { p_gameweek_id: string; p_team_id: string }
        Returns: Json
      }
      get_my_fantasy_team: { Args: { p_season_id: string }; Returns: Json }
      get_my_notification_preferences: { Args: never; Returns: Json }
      get_my_staff_context: { Args: never; Returns: Json }
      ingest_current_player_fixture_performance: {
        Args: {
          p_coverage: Json
          p_fixture_external_id: string
          p_observed_at: string
          p_provider_name: string
          p_rows: Json
          p_season_external_id: string
        }
        Returns: Json
      }
      ingest_football_catalog_entity: {
        Args: {
          p_entity: Json
          p_entity_type: string
          p_external_id: string
          p_provider_name: string
        }
        Returns: Json
      }
      ingest_football_fixture: {
        Args: {
          p_external_id: string
          p_fixture: Json
          p_provider_name: string
        }
        Returns: string
      }
      ingest_football_match_details: {
        Args: {
          p_details: Json
          p_fixture_external_id: string
          p_provider_name: string
        }
        Returns: Json
      }
      ingest_football_squad: {
        Args: {
          p_memberships: Json
          p_observed_at: string
          p_provider_name: string
          p_season_external_id: string
          p_source_sequence: number
          p_team_external_id: string
        }
        Returns: Json
      }
      ingest_football_standings: {
        Args: {
          p_observed_at: string
          p_provider_name: string
          p_rows: Json
          p_season_external_id: string
          p_source_sequence: number
        }
        Returns: Json
      }
      ingest_historical_player_fixture_performance: {
        Args: {
          p_coverage: Json
          p_fixture_external_id: string
          p_observed_at: string
          p_provider_name: string
          p_rows: Json
          p_season_external_id: string
          p_source_version: string
        }
        Returns: Json
      }
      ingest_historical_player_season_ratings: {
        Args: {
          p_algorithm_version: string
          p_observed_at: string
          p_provider_name: string
          p_rows: Json
          p_season_external_id: string
        }
        Returns: Json
      }
      ingest_player_season_ratings: {
        Args: {
          p_algorithm_version: string
          p_observed_at: string
          p_provider_name: string
          p_rows: Json
          p_season_external_id: string
        }
        Returns: Json
      }
      join_fantasy_league: {
        Args: {
          p_idempotency_key: string
          p_invite_code: string
          p_team_id: string
        }
        Returns: Json
      }
      join_prediction_league: { Args: { p_invite_code: string }; Returns: Json }
      leave_fantasy_league: {
        Args: { p_league_id: string; p_team_id: string }
        Returns: boolean
      }
      leave_prediction_league: { Args: { p_league_id: string }; Returns: Json }
      list_my_notification_devices: { Args: never; Returns: Json }
      list_my_notifications: {
        Args: {
          p_before_created_at?: string
          p_before_id?: string
          p_category?: Database["app"]["Enums"]["notification_category"]
          p_limit?: number
        }
        Returns: Json
      }
      mark_all_my_notifications_read: {
        Args: { p_category?: Database["app"]["Enums"]["notification_category"] }
        Returns: number
      }
      mark_my_notification_read: {
        Args: { p_notification_id: string; p_read?: boolean }
        Returns: boolean
      }
      match_votes: { Args: { p_fixture_id: string }; Returns: Json }
      my_notification_unread_count: {
        Args: { p_category?: Database["app"]["Enums"]["notification_category"] }
        Returns: number
      }
      my_prediction_leagues: { Args: never; Returns: Json }
      my_predictions: {
        Args: { p_fixture_id?: string; p_round_number?: number }
        Returns: Json
      }
      news_article_detail: {
        Args: { p_identifier: string; p_language: string }
        Returns: Json
      }
      news_attach_elbotola_hero: {
        Args: {
          p_alt_text: string
          p_external_id: string
          p_source_url: string
        }
        Returns: Json
      }
      news_begin_ingestion_run: {
        Args: {
          p_cursor?: string
          p_job_type: string
          p_publisher_id: string
          p_target_scope?: string
        }
        Returns: string
      }
      news_begin_provider_ingestion: {
        Args: {
          p_job_type: string
          p_provider_slug: string
          p_target_scope?: string
        }
        Returns: Json
      }
      news_complete_ingestion_run: {
        Args: {
          p_cursor: string
          p_error_code?: string
          p_error_summary?: string
          p_fetched: number
          p_inserted: number
          p_rejected: number
          p_run_id: string
          p_skipped: number
          p_status:
            | "pending"
            | "running"
            | "succeeded"
            | "partially_succeeded"
            | "failed"
            | "cancelled"
          p_updated: number
          p_validated: number
        }
        Returns: undefined
      }
      news_engine_assign_cluster: {
        Args: {
          p_claim_status?:
            | "official"
            | "confirmed"
            | "reported"
            | "rumour"
            | "disputed"
          p_cluster_key: string
          p_competition_id: string
          p_event_date: string
          p_event_type: string
          p_item_id: string
          p_match_signal?: string
          p_player_ids: string[]
          p_similarity?: number
          p_team_ids: string[]
        }
        Returns: Json
      }
      news_engine_begin_run: {
        Args: {
          p_dry_run?: boolean
          p_job_type: string
          p_source_slug: string
          p_target_scope?: string
          p_trigger_kind?: string
        }
        Returns: string
      }
      news_engine_claim_source: {
        Args: { p_force?: boolean; p_source_slug: string }
        Returns: Json
      }
      news_engine_cluster_bundle: {
        Args: { p_cluster_id: string }
        Returns: Json
      }
      news_engine_complete_run: {
        Args: {
          p_counts?: Json
          p_error_code?: string
          p_error_summary?: string
          p_run_id: string
          p_status:
            | "pending"
            | "running"
            | "succeeded"
            | "partially_succeeded"
            | "failed"
            | "cancelled"
        }
        Returns: undefined
      }
      news_engine_flag_cluster_conflict: {
        Args: { p_cluster_id: string; p_summary: string }
        Returns: undefined
      }
      news_engine_match_clusters: {
        Args: {
          p_event_date: string
          p_event_type: string
          p_limit?: number
          p_player_ids: string[]
          p_team_ids: string[]
          p_window_days?: number
        }
        Returns: Json
      }
      news_engine_open_failures: {
        Args: {
          p_failure_code?:
            | "DISCOVERY_FAILED"
            | "FETCH_FAILED"
            | "PARSE_FAILED"
            | "IRRELEVANT"
            | "ENTITY_UNRESOLVED"
            | "FACT_CONFLICT"
            | "GENERATION_FAILED"
            | "SIMILARITY_TOO_HIGH"
            | "MEDIA_FAILED"
            | "PUBLICATION_FAILED"
            | "VALIDATION_FAILED"
          p_limit?: number
        }
        Returns: Json
      }
      news_engine_pending_items: {
        Args: {
          p_include_text?: boolean
          p_limit?: number
          p_since?: string
          p_source_slug?: string
          p_status:
            | "discovered"
            | "fetched"
            | "parsed"
            | "irrelevant"
            | "extracted"
            | "clustered"
            | "generated"
            | "validated"
            | "ready"
            | "published"
            | "rejected"
            | "failed"
          p_until?: string
        }
        Returns: Json
      }
      news_engine_publish_article: {
        Args: {
          p_body_html: string
          p_category_slug: string
          p_cluster_id: string
          p_competition_ids: string[]
          p_generation_attempt_id: string
          p_hero_asset_id: string
          p_language: string
          p_player_ids: string[]
          p_publish: boolean
          p_reading_time_minutes: number
          p_sanitizer_version: string
          p_seo_description: string
          p_seo_title: string
          p_slug: string
          p_subtitle: string
          p_summary: string
          p_tag_slugs: string[]
          p_team_ids: string[]
          p_title: string
        }
        Returns: Json
      }
      news_engine_record_discovery: {
        Args: {
          p_etag?: string
          p_items: Json
          p_last_modified?: string
          p_last_seen_item_key?: string
          p_last_seen_published_at?: string
          p_source_slug: string
        }
        Returns: Json
      }
      news_engine_record_discovery_failure: {
        Args: { p_error_code: string; p_source_slug: string }
        Returns: undefined
      }
      news_engine_record_facts: {
        Args: {
          p_best_claim_status:
            | "official"
            | "confirmed"
            | "reported"
            | "rumour"
            | "disputed"
          p_claims: Json
          p_competition_id: string
          p_confidence?: number
          p_event_date: string
          p_event_type: string
          p_extractor_version: string
          p_fixture_id: string
          p_item_id: string
          p_model?: string
          p_player_ids: string[]
          p_quotes: Json
          p_score: Json
          p_team_ids: string[]
          p_unresolved: Json
        }
        Returns: string
      }
      news_engine_record_failure: {
        Args: {
          p_cluster_id?: string
          p_detail?: Json
          p_failure_code:
            | "DISCOVERY_FAILED"
            | "FETCH_FAILED"
            | "PARSE_FAILED"
            | "IRRELEVANT"
            | "ENTITY_UNRESOLVED"
            | "FACT_CONFLICT"
            | "GENERATION_FAILED"
            | "SIMILARITY_TOO_HIGH"
            | "MEDIA_FAILED"
            | "PUBLICATION_FAILED"
            | "VALIDATION_FAILED"
          p_item_id?: string
          p_message: string
          p_retry_after_seconds?: number
          p_run_id?: string
          p_source_slug?: string
          p_stage:
            | "discovery"
            | "fetch"
            | "parse"
            | "relevance"
            | "extraction"
            | "entities"
            | "clustering"
            | "generation"
            | "validation"
            | "publication"
        }
        Returns: string
      }
      news_engine_record_fetch: {
        Args: {
          p_content_hash: string
          p_etag?: string
          p_item_id: string
          p_last_modified?: string
          p_metadata?: Json
          p_normalized_text: string
          p_parser_version?: string
          p_source_published_at?: string
          p_source_title?: string
          p_source_updated_at?: string
        }
        Returns: Json
      }
      news_engine_record_generation: {
        Args: {
          p_cluster_id: string
          p_draft: Json
          p_factual_verdict:
            | "passed"
            | "needs_review"
            | "needs_regeneration"
            | "rejected"
          p_language: string
          p_model: string
          p_originality_verdict:
            | "passed"
            | "needs_review"
            | "needs_regeneration"
            | "rejected"
          p_prompt_version: string
          p_similarity_detail: Json
          p_similarity_score: number
          p_verdict:
            | "passed"
            | "needs_review"
            | "needs_regeneration"
            | "rejected"
          p_verdict_reason?: string
        }
        Returns: Json
      }
      news_engine_record_relevance: {
        Args: {
          p_item_id: string
          p_reason: string
          p_relevant: boolean
          p_score: number
        }
        Returns: undefined
      }
      news_engine_record_stage: {
        Args: {
          p_duration_ms?: number
          p_error_code?: string
          p_error_summary?: string
          p_failed_count?: number
          p_input_count?: number
          p_output_count?: number
          p_run_id: string
          p_stage:
            | "discovery"
            | "fetch"
            | "parse"
            | "relevance"
            | "extraction"
            | "entities"
            | "clustering"
            | "generation"
            | "validation"
            | "publication"
          p_status:
            | "pending"
            | "running"
            | "succeeded"
            | "partially_succeeded"
            | "failed"
            | "cancelled"
        }
        Returns: undefined
      }
      news_engine_reseed_aliases: { Args: never; Returns: Json }
      news_engine_resolve_entities: {
        Args: {
          p_entity_kind: "team" | "player" | "competition" | "coach"
          p_language?: string
          p_mentions: string[]
        }
        Returns: Json
      }
      news_engine_resolve_failure: {
        Args: { p_failure_id: string; p_resolution: string }
        Returns: undefined
      }
      news_engine_resolve_hero_asset: {
        Args: {
          p_competition_id?: string
          p_player_ids?: string[]
          p_team_ids?: string[]
        }
        Returns: Json
      }
      news_engine_retry_failure: {
        Args: { p_failure_id: string }
        Returns: Json
      }
      news_engine_set_source_article_fetch: {
        Args: { p_approved: boolean; p_source_slug: string }
        Returns: Json
      }
      news_engine_set_source_enabled: {
        Args: { p_enabled: boolean; p_source_slug: string }
        Returns: Json
      }
      news_engine_status: { Args: { p_window_hours?: number }; Returns: Json }
      news_engine_unpublish_article: {
        Args: { p_article_edition_id: string; p_reason: string }
        Returns: Json
      }
      news_engine_upsert_alias: {
        Args: {
          p_alias: string
          p_confidence?: number
          p_entity_id: string
          p_entity_kind: "team" | "player" | "competition" | "coach"
          p_language?: string
          p_origin?: string
        }
        Returns: string
      }
      news_feed: {
        Args: {
          p_after_id?: string
          p_after_published_at?: string
          p_category_slug?: string
          p_competition_id?: string
          p_language: string
          p_limit?: number
          p_player_id?: string
          p_team_id?: string
          p_topic_slug?: string
        }
        Returns: Json
      }
      news_home_modules: {
        Args: { p_language: string; p_limit?: number }
        Returns: Json
      }
      news_ingest_provider_article: {
        Args: {
          p_body_html: string
          p_canonical_url: string
          p_content_fingerprint: string
          p_external_id: string
          p_language: string
          p_provider_slug: string
          p_reading_time_minutes: number
          p_sanitizer_version: string
          p_source_name: string
          p_source_published_at: string
          p_source_updated_at: string
          p_source_url: string
          p_source_version: string
          p_summary: string
          p_title: string
        }
        Returns: Json
      }
      news_record_ingestion_rejection: {
        Args: {
          p_error_code: string
          p_external_id: string
          p_reason:
            | "invalid_payload"
            | "mapping_collision"
            | "duplicate_conflict"
            | "unsafe_content"
            | "unsupported_language"
            | "stale_update"
            | "source_blocked"
            | "rate_limited"
            | "provider_unavailable"
          p_run_id: string
          p_sanitized_summary: string
        }
        Returns: undefined
      }
      news_register_source_article: {
        Args: {
          p_article_edition_id: string
          p_canonical_url: string
          p_content_fingerprint: string
          p_external_id: string
          p_publisher_id: string
          p_source_published_at: string
          p_source_updated_at: string
          p_source_version: string
          p_story_id: string
        }
        Returns: Json
      }
      news_related_articles: {
        Args: { p_article_edition_id: string; p_limit?: number }
        Returns: Json
      }
      news_saved_articles: {
        Args: {
          p_after_article_id?: string
          p_after_created_at?: string
          p_limit?: number
        }
        Returns: Json
      }
      news_search: {
        Args: {
          p_after_id?: string
          p_after_published_at?: string
          p_after_rank?: number
          p_language: string
          p_limit?: number
          p_query: string
        }
        Returns: Json
      }
      news_sitemap_entries: { Args: { p_limit?: number }; Returns: Json }
      news_taxonomies: {
        Args: { p_language: string; p_type?: string }
        Returns: Json
      }
      news_team_filters: { Args: { p_language: string }; Returns: Json }
      predictions_leaderboard: {
        Args: {
          p_after_id?: string
          p_after_rank?: number
          p_limit?: number
          p_round_number?: number
          p_scope?: string
        }
        Returns: Json
      }
      predictions_league_standings: {
        Args: { p_league_id: string; p_round_number?: number }
        Returns: Json
      }
      predictions_round: {
        Args: { p_language?: string; p_round_number?: number }
        Returns: Json
      }
      preview_fantasy_catalog_activation: {
        Args: {
          p_expected_fixture_count?: number
          p_expected_round_count?: number
          p_expected_team_count?: number
          p_football_season_id: string
          p_maximum_player_count?: number
          p_minimum_player_count?: number
          p_ruleset_code?: string
        }
        Returns: Json
      }
      preview_fantasy_transfers: {
        Args: {
          p_chip_type?: Database["app"]["Enums"]["fantasy_chip_type"]
          p_expected_version: number
          p_gameweek_id: string
          p_team_id: string
          p_transfers: Json
        }
        Returns: Json
      }
      quarantine_historical_player_fixture_performance: {
        Args: {
          p_coverage: Json
          p_fixture_external_id: string
          p_observed_at: string
          p_provider_name: string
          p_season_external_id: string
          p_source_version: string
        }
        Returns: Json
      }
      record_football_ingestion_rejection: {
        Args: {
          p_entity_type: string
          p_error_code: string
          p_external_id: string
          p_payload_fingerprint: string
          p_run_id: string
          p_validation_issues?: Json
        }
        Returns: string
      }
      record_session_revocation: { Args: { scope: string }; Returns: undefined }
      register_my_notification_device: {
        Args: {
          p_app_version?: string
          p_destination: string
          p_device_id: string
          p_locale: Database["app"]["Enums"]["language_code"]
          p_platform: Database["app"]["Enums"]["notification_device_platform"]
          p_push_provider: Database["app"]["Enums"]["notification_push_provider"]
          p_timezone: string
        }
        Returns: Json
      }
      report_client_errors: { Args: { p_events: Json }; Returns: Json }
      request_account_deletion: { Args: never; Returns: string }
      reset_prediction_league_invite_code: {
        Args: { p_league_id: string }
        Returns: Json
      }
      resolve_football_mapping: {
        Args: {
          p_entity_type: string
          p_external_id: string
          p_internal_entity_id?: string
          p_last_seen_at?: string
          p_provider_name: string
          p_source_version?: string
        }
        Returns: string
      }
      save_article: { Args: { p_article_edition_id: string }; Returns: Json }
      save_fantasy_lineup: {
        Args: {
          p_expected_version: number
          p_gameweek_id: string
          p_idempotency_key: string
          p_selection: Json
          p_team_id: string
        }
        Returns: Json
      }
      save_predictions: { Args: { p_items: Json }; Returns: Json }
      service_advance_fantasy_lifecycle: {
        Args: {
          p_batch_size?: number
          p_expected_lock_version: number
          p_gameweek_id: string
        }
        Returns: Json
      }
      service_apply_current_player_list: {
        Args: { p_expected_plan_digest: string; p_observation_id: string }
        Returns: Json
      }
      service_apply_fantasy_price_changes: {
        Args: {
          p_after_player_id?: string
          p_batch_size?: number
          p_gameweek_id: string
          p_source_version: number
        }
        Returns: Json
      }
      service_begin_fantasy_finalization: {
        Args: {
          p_calculation_version: number
          p_gameweek_id: string
          p_input_digest: string
        }
        Returns: Json
      }
      service_begin_fantasy_job: {
        Args: {
          p_calculation_version?: number
          p_gameweek_id?: string
          p_job_type: string
          p_season_id?: string
        }
        Returns: string
      }
      service_cancel_notification_schedule: {
        Args: { p_schedule_id: string }
        Returns: boolean
      }
      service_checkpoint_notification_fanout: {
        Args: {
          p_audience_count: number
          p_checkpoint_user_id: string
          p_complete?: boolean
          p_deliveries_queued: number
          p_event_id: string
          p_notifications_created: number
          p_rejected_count: number
          p_skipped_count: number
        }
        Returns: boolean
      }
      service_claim_email_deliveries: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: Json
      }
      service_claim_notification_deliveries: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: Json
      }
      service_claim_notification_event: {
        Args: { p_event_id: string; p_lease_seconds?: number }
        Returns: Json
      }
      service_claim_notification_schedules: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: Json
      }
      service_complete_fantasy_gameweek: {
        Args: { p_calculation_version: number; p_gameweek_id: string }
        Returns: Json
      }
      service_complete_fantasy_job: {
        Args: {
          p_error_code?: string
          p_error_summary?: string
          p_failed: number
          p_processed: number
          p_run_id: string
          p_skipped: number
          p_status: Database["app"]["Enums"]["fantasy_run_status"]
        }
        Returns: boolean
      }
      service_complete_fantasy_postwork: {
        Args: { p_calculation_version: number; p_gameweek_id: string }
        Returns: Json
      }
      service_create_user_notification: {
        Args: {
          p_deep_link_entity_id?: string
          p_deep_link_target?: Database["app"]["Enums"]["notification_deep_link_target"]
          p_email_provider_key?: string
          p_event_id: string
          p_expires_at?: string
          p_priority?: Database["app"]["Enums"]["notification_priority"]
          p_push_provider_key?: string
          p_user_id: string
          p_variables: Json
        }
        Returns: string
      }
      service_elbotola_source_status: { Args: never; Returns: Json }
      service_enqueue_gameweek_finalized_notifications: {
        Args: {
          p_after_team_id?: string
          p_calculation_version: number
          p_gameweek_id: string
          p_limit?: number
        }
        Returns: Json
      }
      service_evaluate_fantasy_prizes: {
        Args: { p_limit?: number }
        Returns: Json
      }
      service_fantasy_deadline_watch: {
        Args: {
          p_escalate_hours?: number
          p_fantasy_season_id?: string
          p_warn_hours?: number
        }
        Returns: Json
      }
      service_fantasy_lifecycle_state: {
        Args: { p_gameweek_id: string }
        Returns: Json
      }
      service_fantasy_scoring_league_page: {
        Args: {
          p_after_league_id?: string
          p_batch_size?: number
          p_gameweek_id: string
        }
        Returns: Json
      }
      service_finalize_fantasy_team_results: {
        Args: {
          p_after_team_id?: string
          p_batch_size?: number
          p_calculation_version: number
          p_gameweek_id: string
        }
        Returns: Json
      }
      service_football_match_details_due: {
        Args: {
          p_limit?: number
          p_provider_name: string
          p_scope: string
          p_season_external_id: string
        }
        Returns: Json
      }
      service_get_fantasy_scoring_snapshot: {
        Args: {
          p_after_team_id?: string
          p_batch_size?: number
          p_calculation_version: number
          p_gameweek_id: string
        }
        Returns: Json
      }
      service_ingest_current_football_squads: {
        Args: {
          p_observed_at: string
          p_provider_name: string
          p_season_external_id: string
          p_team_squads: Json
        }
        Returns: Json
      }
      service_ingest_notification_event: {
        Args: {
          p_correlation_id: string
          p_deduplication_key: string
          p_event_id: string
          p_event_type: Database["app"]["Enums"]["notification_type"]
          p_occurred_at: string
          p_safe_payload?: Json
          p_schema_version: number
          p_source_domain: Database["app"]["Enums"]["notification_source_domain"]
          p_source_entity_id: string
          p_target_user_id: string
        }
        Returns: string
      }
      service_invalidate_notification_device: {
        Args: { p_device_registration_id: string; p_reason_code: string }
        Returns: boolean
      }
      service_list_notification_audience: {
        Args: { p_after_user_id?: string; p_event_id: string; p_limit?: number }
        Returns: Json
      }
      service_notification_email_health: { Args: never; Returns: Json }
      service_notification_metrics: {
        Args: { p_since?: string }
        Returns: Json
      }
      service_open_fantasy_registration: {
        Args: {
          p_catalog_activation_id: string
          p_expected_source_digest: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      service_ops_alert_email_target: { Args: never; Returns: string }
      service_ops_health: { Args: never; Returns: Json }
      service_pause_email_provider: {
        Args: { p_reason: string; p_until: string }
        Returns: Json
      }
      service_persist_fantasy_scoring_results: {
        Args: {
          p_calculation_version: number
          p_gameweek_id: string
          p_input_digest: string
          p_player_results: Json
          p_team_results: Json
        }
        Returns: Json
      }
      service_plan_current_player_list: {
        Args: { p_observation_id: string }
        Returns: Json
      }
      service_prepare_next_fantasy_gameweek: {
        Args: {
          p_batch_size?: number
          p_calculation_version: number
          p_next_gameweek_id: string
          p_previous_gameweek_id: string
        }
        Returns: Json
      }
      service_recalculate_fantasy_rankings: {
        Args: {
          p_calculation_version?: number
          p_gameweek_id?: string
          p_league_id?: string
          p_season_id: string
        }
        Returns: number
      }
      service_record_current_player_list: {
        Args: { p_observations: Json }
        Returns: Json
      }
      service_record_notification_delivery_attempt: {
        Args: {
          p_delivery_id: string
          p_max_attempts?: number
          p_outcome: string
          p_provider_latency_ms?: number
          p_provider_message_id?: string
          p_rate_limit_remaining?: number
          p_retry_after_seconds?: number
          p_retryable: boolean
          p_sanitized_summary?: string
          p_stable_error_code?: string
        }
        Returns: Database["app"]["Enums"]["notification_delivery_status"]
      }
      service_release_email_deliveries: {
        Args: { p_delivery_ids: string[]; p_retry_at: string }
        Returns: number
      }
      service_request_notification_dead_letter_replay: {
        Args: { p_dead_letter_id: string; p_idempotency_key: string }
        Returns: boolean
      }
      service_restore_free_hit: {
        Args: { p_batch_size?: number; p_gameweek_id: string }
        Returns: Json
      }
      service_roll_fantasy_free_transfers: {
        Args: { p_batch_size?: number; p_gameweek_id: string }
        Returns: Json
      }
      service_rollback_fantasy_catalog: {
        Args: {
          p_catalog_activation_id: string
          p_expected_source_digest: string
        }
        Returns: Json
      }
      service_run_fantasy_price_batch: {
        Args: {
          p_after_player_id?: string
          p_batch_size?: number
          p_calculation_version: number
          p_gameweek_id: string
        }
        Returns: Json
      }
      service_set_elbotola_source_active: {
        Args: { p_active: boolean }
        Returns: Json
      }
      service_stage_fantasy_catalog: {
        Args: {
          p_expected_fixture_count: number
          p_expected_round_count: number
          p_expected_source_digest: string
          p_expected_team_count: number
          p_football_season_id: string
          p_idempotency_key: string
          p_maximum_player_count: number
          p_minimum_player_count: number
          p_ruleset_code: string
        }
        Returns: Json
      }
      service_sync_fantasy_calendar: {
        Args: { p_fantasy_season_id?: string }
        Returns: Json
      }
      service_upsert_fantasy_player_points: {
        Args: {
          p_category: string
          p_fantasy_player_id: string
          p_fixture_id: string
          p_gameweek_id: string
          p_points: number
          p_scoring_version: number
          p_source_key: string
          p_source_sequence: number
          p_state?: Database["app"]["Enums"]["fantasy_points_state"]
        }
        Returns: string
      }
      service_upsert_notification_schedule: {
        Args: {
          p_due_at: string
          p_idempotency_key: string
          p_notification_type: Database["app"]["Enums"]["notification_type"]
          p_safe_payload?: Json
          p_source_domain: Database["app"]["Enums"]["notification_source_domain"]
          p_source_entity_id: string
          p_target_user_id: string
          p_timezone_basis: string
        }
        Returns: string
      }
      service_verify_scheduler_token: {
        Args: { p_token: string }
        Returns: boolean
      }
      set_my_notification_subscription: {
        Args: {
          p_enabled?: boolean
          p_kind: Database["app"]["Enums"]["notification_subscription_kind"]
          p_target_id: string
        }
        Returns: boolean
      }
      unfollow_competition: {
        Args: { p_competition_id: string }
        Returns: boolean
      }
      unfollow_team: { Args: { p_team_id: string }; Returns: boolean }
      unregister_my_notification_device: {
        Args: { p_device_id: string }
        Returns: boolean
      }
      unsave_article: { Args: { p_article_edition_id: string }; Returns: Json }
      unsubscribe_notification_email: {
        Args: { p_token: string }
        Returns: Json
      }
      update_my_notification_preferences: {
        Args: {
          p_breaking_news: boolean
          p_digest_mode?: Database["app"]["Enums"]["notification_digest_mode"]
          p_email_enabled: boolean
          p_fantasy_deadline_offset_minutes?: number
          p_fantasy_deadlines: boolean
          p_in_app_enabled: boolean
          p_match_alerts: boolean
          p_notifications_enabled: boolean
          p_push_enabled: boolean
          p_quiet_hours_enabled: boolean
          p_quiet_hours_end?: string
          p_quiet_hours_start?: string
          p_timezone: string
        }
        Returns: Json
      }
      update_my_preferences: {
        Args: {
          breaking_news: boolean
          fantasy_deadline_reminders: boolean
          match_alerts: boolean
          preferred_language: Database["app"]["Enums"]["language_code"]
        }
        Returns: undefined
      }
      username_availability: {
        Args: { candidate: string }
        Returns: {
          available: boolean
          normalized_username: string
          reason: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  app: {
    Tables: {
      account_deletion_requests: {
        Row: {
          id: string
          processed_at: string | null
          requested_at: string
          status: Database["app"]["Enums"]["account_deletion_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          processed_at?: string | null
          requested_at?: string
          status?: Database["app"]["Enums"]["account_deletion_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          processed_at?: string | null
          requested_at?: string
          status?: Database["app"]["Enums"]["account_deletion_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_editions: {
        Row: {
          body_format: Database["app"]["Enums"]["article_body_format"]
          body_html: string
          body_source: string | null
          created_at: string
          created_by: string | null
          hero_asset_id: string | null
          id: string
          language: Database["app"]["Enums"]["language_code"]
          published_at: string | null
          reading_time_minutes: number
          sanitizer_version: string
          scheduled_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          source_updated_at: string | null
          status: Database["app"]["Enums"]["publication_status"]
          story_id: string
          subtitle: string | null
          summary: string
          title: string
          unpublished_at: string | null
          updated_at: string
          updated_by: string | null
          visibility: Database["app"]["Enums"]["article_visibility"]
        }
        Insert: {
          body_format?: Database["app"]["Enums"]["article_body_format"]
          body_html: string
          body_source?: string | null
          created_at?: string
          created_by?: string | null
          hero_asset_id?: string | null
          id?: string
          language: Database["app"]["Enums"]["language_code"]
          published_at?: string | null
          reading_time_minutes: number
          sanitizer_version: string
          scheduled_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          source_updated_at?: string | null
          status?: Database["app"]["Enums"]["publication_status"]
          story_id: string
          subtitle?: string | null
          summary: string
          title: string
          unpublished_at?: string | null
          updated_at?: string
          updated_by?: string | null
          visibility?: Database["app"]["Enums"]["article_visibility"]
        }
        Update: {
          body_format?: Database["app"]["Enums"]["article_body_format"]
          body_html?: string
          body_source?: string | null
          created_at?: string
          created_by?: string | null
          hero_asset_id?: string | null
          id?: string
          language?: Database["app"]["Enums"]["language_code"]
          published_at?: string | null
          reading_time_minutes?: number
          sanitizer_version?: string
          scheduled_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          source_updated_at?: string | null
          status?: Database["app"]["Enums"]["publication_status"]
          story_id?: string
          subtitle?: string | null
          summary?: string
          title?: string
          unpublished_at?: string | null
          updated_at?: string
          updated_by?: string | null
          visibility?: Database["app"]["Enums"]["article_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "article_editions_hero_asset_id_fkey"
            columns: ["hero_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_editions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      article_revisions: {
        Row: {
          article_edition_id: string
          body_html: string
          body_source: string | null
          change_reason: string | null
          changed_by: string | null
          created_at: string
          id: string
          revision_number: number
          status: Database["app"]["Enums"]["publication_status"]
          subtitle: string | null
          summary: string
          title: string
          visibility: Database["app"]["Enums"]["article_visibility"]
        }
        Insert: {
          article_edition_id: string
          body_html: string
          body_source?: string | null
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          revision_number: number
          status: Database["app"]["Enums"]["publication_status"]
          subtitle?: string | null
          summary: string
          title: string
          visibility: Database["app"]["Enums"]["article_visibility"]
        }
        Update: {
          article_edition_id?: string
          body_html?: string
          body_source?: string | null
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          revision_number?: number
          status?: Database["app"]["Enums"]["publication_status"]
          subtitle?: string | null
          summary?: string
          title?: string
          visibility?: Database["app"]["Enums"]["article_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "article_revisions_article_edition_id_fkey"
            columns: ["article_edition_id"]
            isOneToOne: false
            referencedRelation: "article_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      article_search_documents: {
        Row: {
          article_edition_id: string
          language: Database["app"]["Enums"]["language_code"]
          published_at: string | null
          refreshed_at: string
          search_vector: unknown
          story_id: string
        }
        Insert: {
          article_edition_id: string
          language: Database["app"]["Enums"]["language_code"]
          published_at?: string | null
          refreshed_at?: string
          search_vector: unknown
          story_id: string
        }
        Update: {
          article_edition_id?: string
          language?: Database["app"]["Enums"]["language_code"]
          published_at?: string | null
          refreshed_at?: string
          search_vector?: unknown
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_search_documents_article_edition_id_fkey"
            columns: ["article_edition_id"]
            isOneToOne: true
            referencedRelation: "article_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_search_documents_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      authors: {
        Row: {
          active: boolean
          author_type: Database["app"]["Enums"]["author_type"]
          avatar_asset_id: string | null
          biography: string | null
          created_at: string
          display_name: string
          id: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          author_type?: Database["app"]["Enums"]["author_type"]
          avatar_asset_id?: string | null
          biography?: string | null
          created_at?: string
          display_name: string
          id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          author_type?: Database["app"]["Enums"]["author_type"]
          avatar_asset_id?: string | null
          biography?: string | null
          created_at?: string
          display_name?: string
          id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "authors_avatar_asset_id_fkey"
            columns: ["avatar_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_translations: {
        Row: {
          competition_id: string
          created_at: string
          display_name: string
          language: Database["app"]["Enums"]["language_code"]
          short_name: string | null
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          display_name: string
          language: Database["app"]["Enums"]["language_code"]
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          display_name?: string
          language?: Database["app"]["Enums"]["language_code"]
          short_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_translations_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          active: boolean
          competition_type: Database["app"]["Enums"]["competition_type"]
          country_id: string | null
          created_at: string
          display_order: number
          id: string
          logo_asset_id: string | null
          name: string
          short_name: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          competition_type: Database["app"]["Enums"]["competition_type"]
          country_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          logo_asset_id?: string | null
          name: string
          short_name?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          competition_type?: Database["app"]["Enums"]["competition_type"]
          country_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          logo_asset_id?: string | null
          name?: string
          short_name?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          active: boolean
          created_at: string
          flag_emoji: string | null
          id: string
          iso_alpha2: string
          iso_alpha3: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          flag_emoji?: string | null
          id?: string
          iso_alpha2: string
          iso_alpha3: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          flag_emoji?: string | null
          id?: string
          iso_alpha2?: string
          iso_alpha3?: string
          updated_at?: string
        }
        Relationships: []
      }
      country_translations: {
        Row: {
          country_id: string
          created_at: string
          display_name: string
          language: Database["app"]["Enums"]["language_code"]
          updated_at: string
        }
        Insert: {
          country_id: string
          created_at?: string
          display_name: string
          language: Database["app"]["Enums"]["language_code"]
          updated_at?: string
        }
        Update: {
          country_id?: string
          created_at?: string
          display_name?: string
          language?: Database["app"]["Enums"]["language_code"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "country_translations_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      device_registrations: {
        Row: {
          app_version: string | null
          created_at: string
          device_id: string
          enabled: boolean
          id: string
          invalidated_at: string | null
          last_seen_at: string
          locale: Database["app"]["Enums"]["language_code"]
          platform: Database["app"]["Enums"]["notification_device_platform"]
          push_provider: Database["app"]["Enums"]["notification_push_provider"]
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_id: string
          enabled?: boolean
          id?: string
          invalidated_at?: string | null
          last_seen_at?: string
          locale: Database["app"]["Enums"]["language_code"]
          platform: Database["app"]["Enums"]["notification_device_platform"]
          push_provider: Database["app"]["Enums"]["notification_push_provider"]
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_id?: string
          enabled?: boolean
          id?: string
          invalidated_at?: string | null
          last_seen_at?: string
          locale?: Database["app"]["Enums"]["language_code"]
          platform?: Database["app"]["Enums"]["notification_device_platform"]
          push_provider?: Database["app"]["Enums"]["notification_push_provider"]
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_placements: {
        Row: {
          article_edition_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          language: Database["app"]["Enums"]["language_code"]
          placement_type: Database["app"]["Enums"]["placement_type"]
          priority: number
          scope_id: string | null
          scope_type: Database["app"]["Enums"]["placement_scope"]
          starts_at: string
          updated_at: string
        }
        Insert: {
          article_edition_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          language: Database["app"]["Enums"]["language_code"]
          placement_type: Database["app"]["Enums"]["placement_type"]
          priority?: number
          scope_id?: string | null
          scope_type?: Database["app"]["Enums"]["placement_scope"]
          starts_at?: string
          updated_at?: string
        }
        Update: {
          article_edition_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          language?: Database["app"]["Enums"]["language_code"]
          placement_type?: Database["app"]["Enums"]["placement_type"]
          priority?: number
          scope_id?: string | null
          scope_type?: Database["app"]["Enums"]["placement_scope"]
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "editorial_placements_article_edition_id_fkey"
            columns: ["article_edition_id"]
            isOneToOne: false
            referencedRelation: "article_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_auto_substitutions: {
        Row: {
          calculation_version: number
          created_at: string
          id: string
          lineup_id: string
          player_in_id: string
          player_out_id: string
          reason: string
          sequence_number: number
        }
        Insert: {
          calculation_version: number
          created_at?: string
          id?: string
          lineup_id: string
          player_in_id: string
          player_out_id: string
          reason: string
          sequence_number: number
        }
        Update: {
          calculation_version?: number
          created_at?: string
          id?: string
          lineup_id?: string
          player_in_id?: string
          player_out_id?: string
          reason?: string
          sequence_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_auto_substitutions_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "fantasy_lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_auto_substitutions_player_in_id_fkey"
            columns: ["player_in_id"]
            isOneToOne: false
            referencedRelation: "fantasy_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_auto_substitutions_player_out_id_fkey"
            columns: ["player_out_id"]
            isOneToOne: false
            referencedRelation: "fantasy_players"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_chip_rules: {
        Row: {
          activation_cancellable: boolean
          allocation_code: string
          chip_type: Database["app"]["Enums"]["fantasy_chip_type"]
          created_at: string
          ends_at_gameweek: number | null
          id: string
          midpoint_fallback: boolean
          permanent_squad_change: boolean
          post_gameweek_free_transfers: number | null
          ruleset_id: string
          starts_at_gameweek: number
          transfer_hit_exempt: boolean
          updated_at: string
          use_limit: number
        }
        Insert: {
          activation_cancellable?: boolean
          allocation_code: string
          chip_type: Database["app"]["Enums"]["fantasy_chip_type"]
          created_at?: string
          ends_at_gameweek?: number | null
          id?: string
          midpoint_fallback?: boolean
          permanent_squad_change?: boolean
          post_gameweek_free_transfers?: number | null
          ruleset_id: string
          starts_at_gameweek: number
          transfer_hit_exempt?: boolean
          updated_at?: string
          use_limit?: number
        }
        Update: {
          activation_cancellable?: boolean
          allocation_code?: string
          chip_type?: Database["app"]["Enums"]["fantasy_chip_type"]
          created_at?: string
          ends_at_gameweek?: number | null
          id?: string
          midpoint_fallback?: boolean
          permanent_squad_change?: boolean
          post_gameweek_free_transfers?: number | null
          ruleset_id?: string
          starts_at_gameweek?: number
          transfer_hit_exempt?: boolean
          updated_at?: string
          use_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_chip_rules_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "fantasy_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_chip_uses: {
        Row: {
          activated_at: string
          activation_idempotency_key: string
          cancelled_at: string | null
          chip_rule_id: string | null
          chip_type: Database["app"]["Enums"]["fantasy_chip_type"]
          created_at: string
          fantasy_team_id: string
          finalized_at: string | null
          gameweek_id: string
          id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string
          activation_idempotency_key: string
          cancelled_at?: string | null
          chip_rule_id?: string | null
          chip_type: Database["app"]["Enums"]["fantasy_chip_type"]
          created_at?: string
          fantasy_team_id: string
          finalized_at?: string | null
          gameweek_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string
          activation_idempotency_key?: string
          cancelled_at?: string | null
          chip_rule_id?: string | null
          chip_type?: Database["app"]["Enums"]["fantasy_chip_type"]
          created_at?: string
          fantasy_team_id?: string
          finalized_at?: string | null
          gameweek_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_chip_uses_chip_rule_id_fkey"
            columns: ["chip_rule_id"]
            isOneToOne: false
            referencedRelation: "fantasy_chip_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_chip_uses_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_chip_uses_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_competitions: {
        Row: {
          active: boolean
          created_at: string
          football_competition_id: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          football_competition_id: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          football_competition_id?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_competitions_football_competition_id_fkey"
            columns: ["football_competition_id"]
            isOneToOne: true
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_deadline_rules: {
        Row: {
          administrative_change_requires_open_gameweek: boolean
          created_at: string
          grace_period_seconds: number
          minutes_before_first_fixture: number
          ruleset_id: string
          updated_at: string
        }
        Insert: {
          administrative_change_requires_open_gameweek?: boolean
          created_at?: string
          grace_period_seconds: number
          minutes_before_first_fixture: number
          ruleset_id: string
          updated_at?: string
        }
        Update: {
          administrative_change_requires_open_gameweek?: boolean
          created_at?: string
          grace_period_seconds?: number
          minutes_before_first_fixture?: number
          ruleset_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_deadline_rules_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: true
            referencedRelation: "fantasy_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_fixture_assignments: {
        Row: {
          assigned_kickoff_at: string
          assignment_status: string
          counts_points: boolean
          created_at: string
          fantasy_season_id: string
          fixture_id: string
          frozen_at: string | null
          gameweek_id: string
          id: string
          original_gameweek_id: string
          original_kickoff_at: string
          resolution: string | null
          source_version: number
          superseded_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_kickoff_at: string
          assignment_status?: string
          counts_points?: boolean
          created_at?: string
          fantasy_season_id: string
          fixture_id: string
          frozen_at?: string | null
          gameweek_id: string
          id?: string
          original_gameweek_id: string
          original_kickoff_at: string
          resolution?: string | null
          source_version: number
          superseded_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_kickoff_at?: string
          assignment_status?: string
          counts_points?: boolean
          created_at?: string
          fantasy_season_id?: string
          fixture_id?: string
          frozen_at?: string | null
          gameweek_id?: string
          id?: string
          original_gameweek_id?: string
          original_kickoff_at?: string
          resolution?: string | null
          source_version?: number
          superseded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_fixture_assignments_fantasy_season_id_fkey"
            columns: ["fantasy_season_id"]
            isOneToOne: false
            referencedRelation: "fantasy_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_fixture_assignments_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_fixture_assignments_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_fixture_assignments_original_gameweek_id_fkey"
            columns: ["original_gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_fixture_difficulty_rules: {
        Row: {
          algorithm_code: string
          away_difficulty_adjustment: number
          created_at: string
          goal_difference_weight: number
          level_1_upper: number
          level_2_upper: number
          level_3_upper: number
          level_4_upper: number
          minimum_current_season_matches: number
          points_per_match_weight: number
          rank_weight: number
          recent_form_matches: number
          recent_form_weight: number
          ruleset_id: string
          updated_at: string
        }
        Insert: {
          algorithm_code: string
          away_difficulty_adjustment: number
          created_at?: string
          goal_difference_weight: number
          level_1_upper: number
          level_2_upper: number
          level_3_upper: number
          level_4_upper: number
          minimum_current_season_matches: number
          points_per_match_weight: number
          rank_weight: number
          recent_form_matches: number
          recent_form_weight: number
          ruleset_id: string
          updated_at?: string
        }
        Update: {
          algorithm_code?: string
          away_difficulty_adjustment?: number
          created_at?: string
          goal_difference_weight?: number
          level_1_upper?: number
          level_2_upper?: number
          level_3_upper?: number
          level_4_upper?: number
          minimum_current_season_matches?: number
          points_per_match_weight?: number
          rank_weight?: number
          recent_form_matches?: number
          recent_form_weight?: number
          ruleset_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_fixture_difficulty_rules_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: true
            referencedRelation: "fantasy_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_fixture_rules: {
        Row: {
          aggregate_double_gameweek_fixtures: boolean
          assignment_frozen_at_deadline: boolean
          correction_window_hours: number
          created_at: string
          late_correction_requires_elevated_approval: boolean
          post_lock_completion_window_hours: number
          ruleset_id: string
          unresolved_gameweek_remains_provisional: boolean
          updated_at: string
        }
        Insert: {
          aggregate_double_gameweek_fixtures: boolean
          assignment_frozen_at_deadline: boolean
          correction_window_hours: number
          created_at?: string
          late_correction_requires_elevated_approval: boolean
          post_lock_completion_window_hours: number
          ruleset_id: string
          unresolved_gameweek_remains_provisional: boolean
          updated_at?: string
        }
        Update: {
          aggregate_double_gameweek_fixtures?: boolean
          assignment_frozen_at_deadline?: boolean
          correction_window_hours?: number
          created_at?: string
          late_correction_requires_elevated_approval?: boolean
          post_lock_completion_window_hours?: number
          ruleset_id?: string
          unresolved_gameweek_remains_provisional?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_fixture_rules_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: true
            referencedRelation: "fantasy_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_free_hit_snapshot_players: {
        Row: {
          acquired_gameweek_id: string
          created_at: string
          fantasy_player_id: string
          purchase_price: number
          sale_price: number
          snapshot_id: string
        }
        Insert: {
          acquired_gameweek_id: string
          created_at?: string
          fantasy_player_id: string
          purchase_price: number
          sale_price: number
          snapshot_id: string
        }
        Update: {
          acquired_gameweek_id?: string
          created_at?: string
          fantasy_player_id?: string
          purchase_price?: number
          sale_price?: number
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_free_hit_snapshot_players_acquired_gameweek_id_fkey"
            columns: ["acquired_gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_free_hit_snapshot_players_fantasy_player_id_fkey"
            columns: ["fantasy_player_id"]
            isOneToOne: false
            referencedRelation: "fantasy_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_free_hit_snapshot_players_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "fantasy_free_hit_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_free_hit_snapshots: {
        Row: {
          bank: number
          chip_use_id: string
          created_at: string
          fantasy_team_id: string
          free_transfers: number
          gameweek_id: string
          id: string
          restoration_version: number | null
          restored_at: string | null
          team_value: number
          team_version: number
        }
        Insert: {
          bank: number
          chip_use_id: string
          created_at?: string
          fantasy_team_id: string
          free_transfers: number
          gameweek_id: string
          id?: string
          restoration_version?: number | null
          restored_at?: string | null
          team_value: number
          team_version: number
        }
        Update: {
          bank?: number
          chip_use_id?: string
          created_at?: string
          fantasy_team_id?: string
          free_transfers?: number
          gameweek_id?: string
          id?: string
          restoration_version?: number | null
          restored_at?: string | null
          team_value?: number
          team_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_free_hit_snapshots_chip_use_id_fkey"
            columns: ["chip_use_id"]
            isOneToOne: true
            referencedRelation: "fantasy_chip_uses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_free_hit_snapshots_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_free_hit_snapshots_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_gameweeks: {
        Row: {
          corrected_at: string | null
          created_at: string
          deadline_at: string
          ends_at: string
          fantasy_season_id: string
          finalized_at: string | null
          football_round_id: string | null
          id: string
          lock_version: number
          name: string
          points_state: Database["app"]["Enums"]["fantasy_points_state"]
          scoring_input_version: number
          sequence_number: number
          starts_at: string
          status: Database["app"]["Enums"]["fantasy_gameweek_status"]
          updated_at: string
        }
        Insert: {
          corrected_at?: string | null
          created_at?: string
          deadline_at: string
          ends_at: string
          fantasy_season_id: string
          finalized_at?: string | null
          football_round_id?: string | null
          id?: string
          lock_version?: number
          name: string
          points_state?: Database["app"]["Enums"]["fantasy_points_state"]
          scoring_input_version?: number
          sequence_number: number
          starts_at: string
          status?: Database["app"]["Enums"]["fantasy_gameweek_status"]
          updated_at?: string
        }
        Update: {
          corrected_at?: string | null
          created_at?: string
          deadline_at?: string
          ends_at?: string
          fantasy_season_id?: string
          finalized_at?: string | null
          football_round_id?: string | null
          id?: string
          lock_version?: number
          name?: string
          points_state?: Database["app"]["Enums"]["fantasy_points_state"]
          scoring_input_version?: number
          sequence_number?: number
          starts_at?: string
          status?: Database["app"]["Enums"]["fantasy_gameweek_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_gameweeks_fantasy_season_id_fkey"
            columns: ["fantasy_season_id"]
            isOneToOne: false
            referencedRelation: "fantasy_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_gameweeks_football_round_id_fkey"
            columns: ["football_round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_league_memberships: {
        Row: {
          created_at: string
          fantasy_team_id: string
          id: string
          joined_at: string
          league_id: string
          left_at: string | null
          role: Database["app"]["Enums"]["fantasy_league_role"]
          status: Database["app"]["Enums"]["fantasy_league_member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fantasy_team_id: string
          id?: string
          joined_at?: string
          league_id: string
          left_at?: string | null
          role?: Database["app"]["Enums"]["fantasy_league_role"]
          status?: Database["app"]["Enums"]["fantasy_league_member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fantasy_team_id?: string
          id?: string
          joined_at?: string
          league_id?: string
          left_at?: string | null
          role?: Database["app"]["Enums"]["fantasy_league_role"]
          status?: Database["app"]["Enums"]["fantasy_league_member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_league_memberships_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_league_memberships_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_league_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_leagues: {
        Row: {
          active: boolean
          created_at: string
          fantasy_season_id: string
          id: string
          invite_code_digest: string | null
          invite_code_hint: string | null
          member_count: number
          name: string
          owner_user_id: string
          updated_at: string
          visibility: Database["app"]["Enums"]["fantasy_league_visibility"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          fantasy_season_id: string
          id?: string
          invite_code_digest?: string | null
          invite_code_hint?: string | null
          member_count?: number
          name: string
          owner_user_id: string
          updated_at?: string
          visibility: Database["app"]["Enums"]["fantasy_league_visibility"]
        }
        Update: {
          active?: boolean
          created_at?: string
          fantasy_season_id?: string
          id?: string
          invite_code_digest?: string | null
          invite_code_hint?: string | null
          member_count?: number
          name?: string
          owner_user_id?: string
          updated_at?: string
          visibility?: Database["app"]["Enums"]["fantasy_league_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_leagues_fantasy_season_id_fkey"
            columns: ["fantasy_season_id"]
            isOneToOne: false
            referencedRelation: "fantasy_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_leagues_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_lineup_players: {
        Row: {
          captain: boolean
          created_at: string
          fantasy_player_id: string
          lineup_id: string
          multiplier: number
          slot: Database["app"]["Enums"]["fantasy_lineup_slot"]
          slot_order: number
          snapshot_price: number
          updated_at: string
          vice_captain: boolean
        }
        Insert: {
          captain?: boolean
          created_at?: string
          fantasy_player_id: string
          lineup_id: string
          multiplier?: number
          slot: Database["app"]["Enums"]["fantasy_lineup_slot"]
          slot_order: number
          snapshot_price: number
          updated_at?: string
          vice_captain?: boolean
        }
        Update: {
          captain?: boolean
          created_at?: string
          fantasy_player_id?: string
          lineup_id?: string
          multiplier?: number
          slot?: Database["app"]["Enums"]["fantasy_lineup_slot"]
          slot_order?: number
          snapshot_price?: number
          updated_at?: string
          vice_captain?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_lineup_players_fantasy_player_id_fkey"
            columns: ["fantasy_player_id"]
            isOneToOne: false
            referencedRelation: "fantasy_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_lineup_players_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "fantasy_lineups"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_lineups: {
        Row: {
          created_at: string
          fantasy_team_id: string
          finalized_at: string | null
          gameweek_id: string
          id: string
          locked_at: string | null
          team_version: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fantasy_team_id: string
          finalized_at?: string | null
          gameweek_id: string
          id?: string
          locked_at?: string | null
          team_version: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fantasy_team_id?: string
          finalized_at?: string | null
          gameweek_id?: string
          id?: string
          locked_at?: string | null
          team_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_lineups_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_lineups_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_player_gameweek_points: {
        Row: {
          calculation_version: number
          created_at: string
          did_play: boolean
          fantasy_player_id: string
          final_points: number | null
          finalized_at: string | null
          football_input_version: number
          gameweek_id: string
          minutes_played: number
          provisional_points: number
          updated_at: string
        }
        Insert: {
          calculation_version: number
          created_at?: string
          did_play?: boolean
          fantasy_player_id: string
          final_points?: number | null
          finalized_at?: string | null
          football_input_version: number
          gameweek_id: string
          minutes_played?: number
          provisional_points?: number
          updated_at?: string
        }
        Update: {
          calculation_version?: number
          created_at?: string
          did_play?: boolean
          fantasy_player_id?: string
          final_points?: number | null
          finalized_at?: string | null
          football_input_version?: number
          gameweek_id?: string
          minutes_played?: number
          provisional_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_player_gameweek_points_fantasy_player_id_fkey"
            columns: ["fantasy_player_id"]
            isOneToOne: false
            referencedRelation: "fantasy_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_player_gameweek_points_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_player_point_events: {
        Row: {
          category: string
          created_at: string
          fantasy_player_id: string
          fixture_id: string
          football_event_id: string | null
          gameweek_id: string
          id: string
          points: number
          scoring_version: number
          source_key: string
          source_sequence: number
          state: Database["app"]["Enums"]["fantasy_points_state"]
          superseded_at: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          fantasy_player_id: string
          fixture_id: string
          football_event_id?: string | null
          gameweek_id: string
          id?: string
          points: number
          scoring_version: number
          source_key: string
          source_sequence: number
          state?: Database["app"]["Enums"]["fantasy_points_state"]
          superseded_at?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          fantasy_player_id?: string
          fixture_id?: string
          football_event_id?: string | null
          gameweek_id?: string
          id?: string
          points?: number
          scoring_version?: number
          source_key?: string
          source_sequence?: number
          state?: Database["app"]["Enums"]["fantasy_points_state"]
          superseded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_player_point_events_fantasy_player_id_fkey"
            columns: ["fantasy_player_id"]
            isOneToOne: false
            referencedRelation: "fantasy_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_player_point_events_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_player_point_events_football_event_id_fkey"
            columns: ["football_event_id"]
            isOneToOne: false
            referencedRelation: "match_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_player_point_events_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_player_price_history: {
        Row: {
          active_team_count: number | null
          created_at: string
          effective_at: string
          fantasy_player_id: string
          gameweek_id: string | null
          id: string
          movement: number | null
          net_transfers: number | null
          new_price: number
          old_price: number | null
          reason: string
          source_version: number
        }
        Insert: {
          active_team_count?: number | null
          created_at?: string
          effective_at: string
          fantasy_player_id: string
          gameweek_id?: string | null
          id?: string
          movement?: number | null
          net_transfers?: number | null
          new_price: number
          old_price?: number | null
          reason: string
          source_version: number
        }
        Update: {
          active_team_count?: number | null
          created_at?: string
          effective_at?: string
          fantasy_player_id?: string
          gameweek_id?: string | null
          id?: string
          movement?: number | null
          net_transfers?: number | null
          new_price?: number
          old_price?: number | null
          reason?: string
          source_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_player_price_history_fantasy_player_id_fkey"
            columns: ["fantasy_player_id"]
            isOneToOne: false
            referencedRelation: "fantasy_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_player_price_history_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_players: {
        Row: {
          active: boolean
          created_at: string
          eligible: boolean
          fantasy_season_id: string
          football_player_id: string
          football_team_id: string
          id: string
          position_id: string
          price: number
          price_version: number
          selected_by_count: number
          status: Database["app"]["Enums"]["fantasy_player_status"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          eligible?: boolean
          fantasy_season_id: string
          football_player_id: string
          football_team_id: string
          id?: string
          position_id: string
          price: number
          price_version?: number
          selected_by_count?: number
          status?: Database["app"]["Enums"]["fantasy_player_status"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          eligible?: boolean
          fantasy_season_id?: string
          football_player_id?: string
          football_team_id?: string
          id?: string
          position_id?: string
          price?: number
          price_version?: number
          selected_by_count?: number
          status?: Database["app"]["Enums"]["fantasy_player_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_players_fantasy_season_id_fkey"
            columns: ["fantasy_season_id"]
            isOneToOne: false
            referencedRelation: "fantasy_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_players_football_player_id_fkey"
            columns: ["football_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_players_football_team_id_fkey"
            columns: ["football_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_players_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "fantasy_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_position_rules: {
        Row: {
          clean_sheet_points: number
          created_at: string
          goal_points: number
          position_id: string
          ruleset_id: string
          squad_quota: number
          starting_maximum: number
          starting_minimum: number
          updated_at: string
        }
        Insert: {
          clean_sheet_points?: number
          created_at?: string
          goal_points: number
          position_id: string
          ruleset_id: string
          squad_quota: number
          starting_maximum: number
          starting_minimum: number
          updated_at?: string
        }
        Update: {
          clean_sheet_points?: number
          created_at?: string
          goal_points?: number
          position_id?: string
          ruleset_id?: string
          squad_quota?: number
          starting_maximum?: number
          starting_minimum?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_position_rules_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "fantasy_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_position_rules_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "fantasy_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_positions: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      fantasy_price_rules: {
        Row: {
          absolute_maximum: number
          absolute_minimum: number
          created_at: string
          exclude_free_hit_demand: boolean
          exclude_wildcard_demand: boolean
          initial_maximum: number
          initial_minimum: number
          large_movement: number
          large_rate_threshold: number
          maximum_gameweek_movement: number
          minimum_net_transfers: number
          price_increment: number
          ruleset_id: string
          sale_profit_block: number
          sale_profit_increment: number
          small_movement: number
          small_rate_threshold: number
          updated_at: string
        }
        Insert: {
          absolute_maximum: number
          absolute_minimum: number
          created_at?: string
          exclude_free_hit_demand?: boolean
          exclude_wildcard_demand?: boolean
          initial_maximum: number
          initial_minimum: number
          large_movement: number
          large_rate_threshold: number
          maximum_gameweek_movement: number
          minimum_net_transfers: number
          price_increment: number
          ruleset_id: string
          sale_profit_block: number
          sale_profit_increment: number
          small_movement: number
          small_rate_threshold: number
          updated_at?: string
        }
        Update: {
          absolute_maximum?: number
          absolute_minimum?: number
          created_at?: string
          exclude_free_hit_demand?: boolean
          exclude_wildcard_demand?: boolean
          initial_maximum?: number
          initial_minimum?: number
          large_movement?: number
          large_rate_threshold?: number
          maximum_gameweek_movement?: number
          minimum_net_transfers?: number
          price_increment?: number
          ruleset_id?: string
          sale_profit_block?: number
          sale_profit_increment?: number
          small_movement?: number
          small_rate_threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_price_rules_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: true
            referencedRelation: "fantasy_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_prize_settings: {
        Row: {
          created_at: string
          fantasy_season_id: string
          gameweek_count: number
          mini_league_min_members: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fantasy_season_id: string
          gameweek_count?: number
          mini_league_min_members?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fantasy_season_id?: string
          gameweek_count?: number
          mini_league_min_members?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_prize_settings_fantasy_season_id_fkey"
            columns: ["fantasy_season_id"]
            isOneToOne: true
            referencedRelation: "fantasy_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_prize_skips: {
        Row: {
          created_at: string
          fantasy_season_id: string
          fantasy_team_id: string
          id: string
          league_id: string | null
          period_key: string
          points: number
          reason: Database["app"]["Enums"]["fantasy_prize_skip_reason"]
          tier: Database["app"]["Enums"]["fantasy_prize_tier"]
          user_id: string
        }
        Insert: {
          created_at?: string
          fantasy_season_id: string
          fantasy_team_id: string
          id?: string
          league_id?: string | null
          period_key: string
          points: number
          reason: Database["app"]["Enums"]["fantasy_prize_skip_reason"]
          tier: Database["app"]["Enums"]["fantasy_prize_tier"]
          user_id: string
        }
        Update: {
          created_at?: string
          fantasy_season_id?: string
          fantasy_team_id?: string
          id?: string
          league_id?: string | null
          period_key?: string
          points?: number
          reason?: Database["app"]["Enums"]["fantasy_prize_skip_reason"]
          tier?: Database["app"]["Enums"]["fantasy_prize_tier"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_prize_skips_fantasy_season_id_fkey"
            columns: ["fantasy_season_id"]
            isOneToOne: false
            referencedRelation: "fantasy_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_prize_skips_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_prize_skips_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_prize_skips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_prize_winners: {
        Row: {
          block_number: number | null
          created_at: string
          fantasy_season_id: string
          fantasy_team_id: string
          first_gameweek_number: number
          forfeited_at: string | null
          forfeited_by_principal_id: string | null
          gameweek_id: string | null
          id: string
          last_gameweek_number: number
          league_id: string | null
          overridden_at: string | null
          overridden_by_principal_id: string | null
          override_of_winner_id: string | null
          override_reason: string | null
          paid_at: string | null
          paid_by_principal_id: string | null
          period_key: string
          points: number
          prize_id: string
          prize_name_ar: string | null
          prize_name_fr: string
          prize_value_mad: number | null
          runner_up_team_id: string | null
          status: Database["app"]["Enums"]["fantasy_prize_winner_status"]
          superseded_by_winner_id: string | null
          team_created_at: string
          team_name: string
          tie_break: Database["app"]["Enums"]["fantasy_prize_tie_break"]
          tier: Database["app"]["Enums"]["fantasy_prize_tier"]
          transfers_in_period: number
          updated_at: string
          user_id: string
          verification_notes: string | null
          verified_at: string | null
          verified_by_principal_id: string | null
        }
        Insert: {
          block_number?: number | null
          created_at?: string
          fantasy_season_id: string
          fantasy_team_id: string
          first_gameweek_number: number
          forfeited_at?: string | null
          forfeited_by_principal_id?: string | null
          gameweek_id?: string | null
          id?: string
          last_gameweek_number: number
          league_id?: string | null
          overridden_at?: string | null
          overridden_by_principal_id?: string | null
          override_of_winner_id?: string | null
          override_reason?: string | null
          paid_at?: string | null
          paid_by_principal_id?: string | null
          period_key: string
          points: number
          prize_id: string
          prize_name_ar?: string | null
          prize_name_fr: string
          prize_value_mad?: number | null
          runner_up_team_id?: string | null
          status?: Database["app"]["Enums"]["fantasy_prize_winner_status"]
          superseded_by_winner_id?: string | null
          team_created_at: string
          team_name: string
          tie_break: Database["app"]["Enums"]["fantasy_prize_tie_break"]
          tier: Database["app"]["Enums"]["fantasy_prize_tier"]
          transfers_in_period: number
          updated_at?: string
          user_id: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by_principal_id?: string | null
        }
        Update: {
          block_number?: number | null
          created_at?: string
          fantasy_season_id?: string
          fantasy_team_id?: string
          first_gameweek_number?: number
          forfeited_at?: string | null
          forfeited_by_principal_id?: string | null
          gameweek_id?: string | null
          id?: string
          last_gameweek_number?: number
          league_id?: string | null
          overridden_at?: string | null
          overridden_by_principal_id?: string | null
          override_of_winner_id?: string | null
          override_reason?: string | null
          paid_at?: string | null
          paid_by_principal_id?: string | null
          period_key?: string
          points?: number
          prize_id?: string
          prize_name_ar?: string | null
          prize_name_fr?: string
          prize_value_mad?: number | null
          runner_up_team_id?: string | null
          status?: Database["app"]["Enums"]["fantasy_prize_winner_status"]
          superseded_by_winner_id?: string | null
          team_created_at?: string
          team_name?: string
          tie_break?: Database["app"]["Enums"]["fantasy_prize_tie_break"]
          tier?: Database["app"]["Enums"]["fantasy_prize_tier"]
          transfers_in_period?: number
          updated_at?: string
          user_id?: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by_principal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_prize_winners_fantasy_season_id_fkey"
            columns: ["fantasy_season_id"]
            isOneToOne: false
            referencedRelation: "fantasy_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_prize_winners_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_prize_winners_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_prize_winners_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_prize_winners_override_of_winner_id_fkey"
            columns: ["override_of_winner_id"]
            isOneToOne: false
            referencedRelation: "fantasy_prize_winners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_prize_winners_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "fantasy_prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_prize_winners_runner_up_team_id_fkey"
            columns: ["runner_up_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_prize_winners_superseded_by_winner_id_fkey"
            columns: ["superseded_by_winner_id"]
            isOneToOne: false
            referencedRelation: "fantasy_prize_winners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_prize_winners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_prizes: {
        Row: {
          active: boolean
          created_at: string
          description_ar: string | null
          description_fr: string
          estimated_value_mad: number | null
          id: string
          image_url: string | null
          name_ar: string | null
          name_fr: string
          sponsor_logo_url: string | null
          sponsor_name: string | null
          tier: Database["app"]["Enums"]["fantasy_prize_tier"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description_ar?: string | null
          description_fr?: string
          estimated_value_mad?: number | null
          id?: string
          image_url?: string | null
          name_ar?: string | null
          name_fr: string
          sponsor_logo_url?: string | null
          sponsor_name?: string | null
          tier: Database["app"]["Enums"]["fantasy_prize_tier"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description_ar?: string | null
          description_fr?: string
          estimated_value_mad?: number | null
          id?: string
          image_url?: string | null
          name_ar?: string | null
          name_fr?: string
          sponsor_logo_url?: string | null
          sponsor_name?: string | null
          tier?: Database["app"]["Enums"]["fantasy_prize_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      fantasy_ranking_tiebreak_rules: {
        Row: {
          created_at: string
          criterion: string
          direction: string
          priority: number
          ruleset_id: string
        }
        Insert: {
          created_at?: string
          criterion: string
          direction: string
          priority: number
          ruleset_id: string
        }
        Update: {
          created_at?: string
          criterion?: string
          direction?: string
          priority?: number
          ruleset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_ranking_tiebreak_rules_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "fantasy_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_rankings: {
        Row: {
          calculated_at: string
          calculation_version: number
          confirmed_transfers: number
          created_at: string
          fantasy_season_id: string
          fantasy_team_id: string
          gameweek_id: string | null
          gameweek_points: number | null
          id: string
          latest_finalized_gameweek_score: number | null
          league_id: string | null
          previous_rank: number | null
          rank: number
          team_created_at: string | null
          total_points: number
          transfer_hits: number
          updated_at: string
        }
        Insert: {
          calculated_at: string
          calculation_version: number
          confirmed_transfers?: number
          created_at?: string
          fantasy_season_id: string
          fantasy_team_id: string
          gameweek_id?: string | null
          gameweek_points?: number | null
          id?: string
          latest_finalized_gameweek_score?: number | null
          league_id?: string | null
          previous_rank?: number | null
          rank: number
          team_created_at?: string | null
          total_points: number
          transfer_hits?: number
          updated_at?: string
        }
        Update: {
          calculated_at?: string
          calculation_version?: number
          confirmed_transfers?: number
          created_at?: string
          fantasy_season_id?: string
          fantasy_team_id?: string
          gameweek_id?: string | null
          gameweek_points?: number | null
          id?: string
          latest_finalized_gameweek_score?: number | null
          league_id?: string | null
          previous_rank?: number | null
          rank?: number
          team_created_at?: string | null
          total_points?: number
          transfer_hits?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_rankings_fantasy_season_id_fkey"
            columns: ["fantasy_season_id"]
            isOneToOne: false
            referencedRelation: "fantasy_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_rankings_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_rankings_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_rankings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_ruleset_features: {
        Row: {
          bonus_points_enabled: boolean
          created_at: string
          fixture_difficulty_enabled: boolean
          inferred_assists_enabled: boolean
          official_assists_only: boolean
          player_of_match_enabled: boolean
          ruleset_id: string
          updated_at: string
        }
        Insert: {
          bonus_points_enabled: boolean
          created_at?: string
          fixture_difficulty_enabled: boolean
          inferred_assists_enabled: boolean
          official_assists_only: boolean
          player_of_match_enabled: boolean
          ruleset_id: string
          updated_at?: string
        }
        Update: {
          bonus_points_enabled?: boolean
          created_at?: string
          fixture_difficulty_enabled?: boolean
          inferred_assists_enabled?: boolean
          official_assists_only?: boolean
          player_of_match_enabled?: boolean
          ruleset_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_ruleset_features_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: true
            referencedRelation: "fantasy_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_rulesets: {
        Row: {
          active: boolean
          captain_multiplier: number
          created_at: string
          effective_from: string
          fantasy_competition_id: string | null
          full_appearance_minutes: number
          id: string
          initial_budget: number
          initial_free_transfers: number
          max_free_transfer_rollover: number
          max_players_per_club: number
          minimum_minutes_for_appearance: number
          minor_version: number
          name: string
          published_at: string | null
          retired_at: string | null
          ruleset_code: string | null
          squad_size: number
          transfer_hit_cost: number
          triple_captain_multiplier: number
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          captain_multiplier?: number
          created_at?: string
          effective_from: string
          fantasy_competition_id?: string | null
          full_appearance_minutes?: number
          id?: string
          initial_budget: number
          initial_free_transfers: number
          max_free_transfer_rollover: number
          max_players_per_club: number
          minimum_minutes_for_appearance?: number
          minor_version?: number
          name: string
          published_at?: string | null
          retired_at?: string | null
          ruleset_code?: string | null
          squad_size: number
          transfer_hit_cost: number
          triple_captain_multiplier?: number
          updated_at?: string
          version: number
        }
        Update: {
          active?: boolean
          captain_multiplier?: number
          created_at?: string
          effective_from?: string
          fantasy_competition_id?: string | null
          full_appearance_minutes?: number
          id?: string
          initial_budget?: number
          initial_free_transfers?: number
          max_free_transfer_rollover?: number
          max_players_per_club?: number
          minimum_minutes_for_appearance?: number
          minor_version?: number
          name?: string
          published_at?: string | null
          retired_at?: string | null
          ruleset_code?: string | null
          squad_size?: number
          transfer_hit_cost?: number
          triple_captain_multiplier?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_rulesets_fantasy_competition_id_fkey"
            columns: ["fantasy_competition_id"]
            isOneToOne: false
            referencedRelation: "fantasy_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_scoring_rules: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          points: number
          position_id: string | null
          ruleset_id: string
          threshold: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          id?: string
          points: number
          position_id?: string | null
          ruleset_id: string
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          points?: number
          position_id?: string | null
          ruleset_id?: string
          threshold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_scoring_rules_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "fantasy_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_scoring_rules_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "fantasy_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_seasons: {
        Row: {
          created_at: string
          ends_at: string
          fantasy_competition_id: string
          football_season_id: string
          id: string
          name: string
          ruleset_id: string
          starts_at: string
          status: Database["app"]["Enums"]["fantasy_season_status"]
          updated_at: string
          wildcard_split_gameweek: number | null
        }
        Insert: {
          created_at?: string
          ends_at: string
          fantasy_competition_id: string
          football_season_id: string
          id?: string
          name: string
          ruleset_id: string
          starts_at: string
          status?: Database["app"]["Enums"]["fantasy_season_status"]
          updated_at?: string
          wildcard_split_gameweek?: number | null
        }
        Update: {
          created_at?: string
          ends_at?: string
          fantasy_competition_id?: string
          football_season_id?: string
          id?: string
          name?: string
          ruleset_id?: string
          starts_at?: string
          status?: Database["app"]["Enums"]["fantasy_season_status"]
          updated_at?: string
          wildcard_split_gameweek?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_seasons_fantasy_competition_id_fkey"
            columns: ["fantasy_competition_id"]
            isOneToOne: false
            referencedRelation: "fantasy_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_seasons_football_season_id_fkey"
            columns: ["football_season_id"]
            isOneToOne: true
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_seasons_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "fantasy_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_squad_memberships: {
        Row: {
          acquired_at: string
          acquired_gameweek_id: string
          created_at: string
          current_sale_price: number
          fantasy_player_id: string
          fantasy_team_id: string
          id: string
          purchase_price: number
          sold_at: string | null
          sold_gameweek_id: string | null
          updated_at: string
        }
        Insert: {
          acquired_at?: string
          acquired_gameweek_id: string
          created_at?: string
          current_sale_price: number
          fantasy_player_id: string
          fantasy_team_id: string
          id?: string
          purchase_price: number
          sold_at?: string | null
          sold_gameweek_id?: string | null
          updated_at?: string
        }
        Update: {
          acquired_at?: string
          acquired_gameweek_id?: string
          created_at?: string
          current_sale_price?: number
          fantasy_player_id?: string
          fantasy_team_id?: string
          id?: string
          purchase_price?: number
          sold_at?: string | null
          sold_gameweek_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_squad_memberships_acquired_gameweek_id_fkey"
            columns: ["acquired_gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_squad_memberships_fantasy_player_id_fkey"
            columns: ["fantasy_player_id"]
            isOneToOne: false
            referencedRelation: "fantasy_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_squad_memberships_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_squad_memberships_sold_gameweek_id_fkey"
            columns: ["sold_gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_team_gameweek_results: {
        Row: {
          bench_points: number
          calculation_version: number
          captain_points: number
          chip_type: Database["app"]["Enums"]["fantasy_chip_type"] | null
          created_at: string
          fantasy_team_id: string
          final_score: number | null
          finalized_at: string | null
          gameweek_id: string
          id: string
          overall_rank: number | null
          provisional_score: number
          rank: number | null
          starting_points: number
          state: Database["app"]["Enums"]["fantasy_points_state"]
          transfer_hit: number
          updated_at: string
        }
        Insert: {
          bench_points: number
          calculation_version: number
          captain_points: number
          chip_type?: Database["app"]["Enums"]["fantasy_chip_type"] | null
          created_at?: string
          fantasy_team_id: string
          final_score?: number | null
          finalized_at?: string | null
          gameweek_id: string
          id?: string
          overall_rank?: number | null
          provisional_score: number
          rank?: number | null
          starting_points: number
          state?: Database["app"]["Enums"]["fantasy_points_state"]
          transfer_hit: number
          updated_at?: string
        }
        Update: {
          bench_points?: number
          calculation_version?: number
          captain_points?: number
          chip_type?: Database["app"]["Enums"]["fantasy_chip_type"] | null
          created_at?: string
          fantasy_team_id?: string
          final_score?: number | null
          finalized_at?: string | null
          gameweek_id?: string
          id?: string
          overall_rank?: number | null
          provisional_score?: number
          rank?: number | null
          starting_points?: number
          state?: Database["app"]["Enums"]["fantasy_points_state"]
          transfer_hit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_team_gameweek_results_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_team_gameweek_results_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_teams: {
        Row: {
          bank: number
          created_at: string
          current_gameweek_id: string | null
          fantasy_season_id: string
          free_transfers: number
          id: string
          name: string
          status: Database["app"]["Enums"]["fantasy_team_status"]
          team_value: number
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          bank: number
          created_at?: string
          current_gameweek_id?: string | null
          fantasy_season_id: string
          free_transfers: number
          id?: string
          name: string
          status?: Database["app"]["Enums"]["fantasy_team_status"]
          team_value: number
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          bank?: number
          created_at?: string
          current_gameweek_id?: string | null
          fantasy_season_id?: string
          free_transfers?: number
          id?: string
          name?: string
          status?: Database["app"]["Enums"]["fantasy_team_status"]
          team_value?: number
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_teams_current_gameweek_id_fkey"
            columns: ["current_gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_teams_fantasy_season_id_fkey"
            columns: ["fantasy_season_id"]
            isOneToOne: false
            referencedRelation: "fantasy_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_teams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_transfer_batches: {
        Row: {
          bank_after: number
          bank_before: number
          base_team_version: number
          chip_type: Database["app"]["Enums"]["fantasy_chip_type"] | null
          confirmed_at: string
          created_at: string
          fantasy_team_id: string
          free_transfers_before: number
          free_transfers_used: number
          gameweek_id: string
          id: string
          idempotency_key: string
          point_hit: number
          resulting_team_version: number
          status: Database["app"]["Enums"]["fantasy_transfer_batch_status"]
          transfers_count: number
        }
        Insert: {
          bank_after: number
          bank_before: number
          base_team_version: number
          chip_type?: Database["app"]["Enums"]["fantasy_chip_type"] | null
          confirmed_at?: string
          created_at?: string
          fantasy_team_id: string
          free_transfers_before: number
          free_transfers_used: number
          gameweek_id: string
          id?: string
          idempotency_key: string
          point_hit: number
          resulting_team_version: number
          status?: Database["app"]["Enums"]["fantasy_transfer_batch_status"]
          transfers_count: number
        }
        Update: {
          bank_after?: number
          bank_before?: number
          base_team_version?: number
          chip_type?: Database["app"]["Enums"]["fantasy_chip_type"] | null
          confirmed_at?: string
          created_at?: string
          fantasy_team_id?: string
          free_transfers_before?: number
          free_transfers_used?: number
          gameweek_id?: string
          id?: string
          idempotency_key?: string
          point_hit?: number
          resulting_team_version?: number
          status?: Database["app"]["Enums"]["fantasy_transfer_batch_status"]
          transfers_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_transfer_batches_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_transfer_batches_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "fantasy_gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_transfers: {
        Row: {
          created_at: string
          id: string
          player_in_id: string
          player_out_id: string
          purchase_price: number
          sale_price: number
          sequence_number: number
          transfer_batch_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_in_id: string
          player_out_id: string
          purchase_price: number
          sale_price: number
          sequence_number: number
          transfer_batch_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_in_id?: string
          player_out_id?: string
          purchase_price?: number
          sale_price?: number
          sequence_number?: number
          transfer_batch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_transfers_player_in_id_fkey"
            columns: ["player_in_id"]
            isOneToOne: false
            referencedRelation: "fantasy_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_transfers_player_out_id_fkey"
            columns: ["player_out_id"]
            isOneToOne: false
            referencedRelation: "fantasy_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_transfers_transfer_batch_id_fkey"
            columns: ["transfer_batch_id"]
            isOneToOne: false
            referencedRelation: "fantasy_transfer_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      fixture_absences: {
        Row: {
          category: string
          created_at: string
          expected_return_on: string | null
          fixture_id: string
          games_missed: number | null
          id: string
          player_id: string | null
          player_name: string | null
          provider_key: string
          provider_updated_at: string
          source_sequence: number
          team_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          expected_return_on?: string | null
          fixture_id: string
          games_missed?: number | null
          id?: string
          player_id?: string | null
          player_name?: string | null
          provider_key: string
          provider_updated_at: string
          source_sequence?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          expected_return_on?: string | null
          fixture_id?: string
          games_missed?: number | null
          id?: string
          player_id?: string | null
          player_name?: string | null
          provider_key?: string
          provider_updated_at?: string
          source_sequence?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixture_absences_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_absences_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_absences_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fixture_pressure: {
        Row: {
          created_at: string
          fixture_id: string
          minute: number
          pressure: number
          provider_updated_at: string
          source_sequence: number
          team_id: string
        }
        Insert: {
          created_at?: string
          fixture_id: string
          minute: number
          pressure: number
          provider_updated_at: string
          source_sequence?: number
          team_id: string
        }
        Update: {
          created_at?: string
          fixture_id?: string
          minute?: number
          pressure?: number
          provider_updated_at?: string
          source_sequence?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixture_pressure_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_pressure_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fixture_team_statistics: {
        Row: {
          created_at: string
          display_value: string | null
          fixture_id: string
          id: string
          numeric_value: number
          provider_updated_at: string
          source_sequence: number
          statistic_definition_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_value?: string | null
          fixture_id: string
          id?: string
          numeric_value: number
          provider_updated_at: string
          source_sequence?: number
          statistic_definition_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_value?: string | null
          fixture_id?: string
          id?: string
          numeric_value?: number
          provider_updated_at?: string
          source_sequence?: number
          statistic_definition_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixture_team_statistics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_team_statistics_statistic_definition_id_fkey"
            columns: ["statistic_definition_id"]
            isOneToOne: false
            referencedRelation: "statistic_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_team_statistics_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fixtures: {
        Row: {
          added_time: number | null
          attendance: number | null
          away_score: number | null
          away_team_id: string
          competition_id: string
          created_at: string
          extra_time_away_score: number | null
          extra_time_home_score: number | null
          finalized_at: string | null
          half_time_away_score: number | null
          half_time_home_score: number | null
          home_score: number | null
          home_team_id: string
          id: string
          kickoff_at: string
          minute: number | null
          penalty_away_score: number | null
          penalty_home_score: number | null
          period: Database["app"]["Enums"]["fixture_period"]
          provider_updated_at: string
          round_id: string | null
          season_id: string
          source_sequence: number
          source_version: string | null
          status: Database["app"]["Enums"]["fixture_status"]
          updated_at: string
          venue_id: string | null
          winner_team_id: string | null
        }
        Insert: {
          added_time?: number | null
          attendance?: number | null
          away_score?: number | null
          away_team_id: string
          competition_id: string
          created_at?: string
          extra_time_away_score?: number | null
          extra_time_home_score?: number | null
          finalized_at?: string | null
          half_time_away_score?: number | null
          half_time_home_score?: number | null
          home_score?: number | null
          home_team_id: string
          id?: string
          kickoff_at: string
          minute?: number | null
          penalty_away_score?: number | null
          penalty_home_score?: number | null
          period?: Database["app"]["Enums"]["fixture_period"]
          provider_updated_at: string
          round_id?: string | null
          season_id: string
          source_sequence?: number
          source_version?: string | null
          status?: Database["app"]["Enums"]["fixture_status"]
          updated_at?: string
          venue_id?: string | null
          winner_team_id?: string | null
        }
        Update: {
          added_time?: number | null
          attendance?: number | null
          away_score?: number | null
          away_team_id?: string
          competition_id?: string
          created_at?: string
          extra_time_away_score?: number | null
          extra_time_home_score?: number | null
          finalized_at?: string | null
          half_time_away_score?: number | null
          half_time_home_score?: number | null
          home_score?: number | null
          home_team_id?: string
          id?: string
          kickoff_at?: string
          minute?: number | null
          penalty_away_score?: number | null
          penalty_home_score?: number | null
          period?: Database["app"]["Enums"]["fixture_period"]
          provider_updated_at?: string
          round_id?: string | null
          season_id?: string
          source_sequence?: number
          source_version?: string | null
          status?: Database["app"]["Enums"]["fixture_status"]
          updated_at?: string
          venue_id?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      followed_competitions: {
        Row: {
          competition_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followed_competitions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followed_competitions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      followed_teams: {
        Row: {
          created_at: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followed_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followed_teams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lineup_players: {
        Row: {
          captain: boolean
          created_at: string
          display_order: number
          id: string
          lineup_id: string
          player_id: string | null
          player_name: string | null
          position: Database["app"]["Enums"]["football_position"] | null
          shirt_number: number | null
          slot: Database["app"]["Enums"]["lineup_slot"]
          updated_at: string
        }
        Insert: {
          captain?: boolean
          created_at?: string
          display_order: number
          id?: string
          lineup_id: string
          player_id?: string | null
          player_name?: string | null
          position?: Database["app"]["Enums"]["football_position"] | null
          shirt_number?: number | null
          slot: Database["app"]["Enums"]["lineup_slot"]
          updated_at?: string
        }
        Update: {
          captain?: boolean
          created_at?: string
          display_order?: number
          id?: string
          lineup_id?: string
          player_id?: string | null
          player_name?: string | null
          position?: Database["app"]["Enums"]["football_position"] | null
          shirt_number?: number | null
          slot?: Database["app"]["Enums"]["lineup_slot"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineup_players_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lineups: {
        Row: {
          confirmed: boolean
          created_at: string
          fixture_id: string
          formation: string | null
          id: string
          provider_updated_at: string
          published_at: string | null
          source_sequence: number
          team_id: string
          updated_at: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          fixture_id: string
          formation?: string | null
          id?: string
          provider_updated_at: string
          published_at?: string | null
          source_sequence?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          fixture_id?: string
          formation?: string | null
          id?: string
          provider_updated_at?: string
          published_at?: string | null
          source_sequence?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_events: {
        Row: {
          added_time: number
          created_at: string
          detail: string | null
          event_type: Database["app"]["Enums"]["match_event_type"]
          fixture_id: string
          id: string
          idempotency_key: string
          minute: number
          period: Database["app"]["Enums"]["fixture_period"]
          player_id: string | null
          provider_event_key: string | null
          provider_updated_at: string
          related_player_id: string | null
          sequence_number: number
          source_sequence: number
          team_id: string | null
          updated_at: string
        }
        Insert: {
          added_time?: number
          created_at?: string
          detail?: string | null
          event_type: Database["app"]["Enums"]["match_event_type"]
          fixture_id: string
          id?: string
          idempotency_key: string
          minute: number
          period: Database["app"]["Enums"]["fixture_period"]
          player_id?: string | null
          provider_event_key?: string | null
          provider_updated_at: string
          related_player_id?: string | null
          sequence_number: number
          source_sequence?: number
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          added_time?: number
          created_at?: string
          detail?: string | null
          event_type?: Database["app"]["Enums"]["match_event_type"]
          fixture_id?: string
          id?: string
          idempotency_key?: string
          minute?: number
          period?: Database["app"]["Enums"]["fixture_period"]
          player_id?: string | null
          provider_event_key?: string | null
          provider_updated_at?: string
          related_player_id?: string | null
          sequence_number?: number
          source_sequence?: number
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_events_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_related_player_id_fkey"
            columns: ["related_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_votes: {
        Row: {
          choice: string
          created_at: string
          fixture_id: string
          question: string
          updated_at: string
          user_id: string
        }
        Insert: {
          choice: string
          created_at?: string
          fixture_id: string
          question: string
          updated_at?: string
          user_id: string
        }
        Update: {
          choice?: string
          created_at?: string
          fixture_id?: string
          question?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_votes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_text: string | null
          attribution: string | null
          attribution_url: string | null
          caption: string | null
          copyright_owner: string | null
          created_at: string
          credit: string | null
          height: number | null
          id: string
          kind: Database["app"]["Enums"]["media_kind"]
          license_code: string | null
          license_url: string | null
          mime_type: string | null
          source_url: string | null
          storage_path: string | null
          updated_at: string
          validated_at: string | null
          validation_status: Database["app"]["Enums"]["media_validation_status"]
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          attribution?: string | null
          attribution_url?: string | null
          caption?: string | null
          copyright_owner?: string | null
          created_at?: string
          credit?: string | null
          height?: number | null
          id?: string
          kind: Database["app"]["Enums"]["media_kind"]
          license_code?: string | null
          license_url?: string | null
          mime_type?: string | null
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
          validated_at?: string | null
          validation_status?: Database["app"]["Enums"]["media_validation_status"]
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          attribution?: string | null
          attribution_url?: string | null
          caption?: string | null
          copyright_owner?: string | null
          created_at?: string
          credit?: string | null
          height?: number | null
          id?: string
          kind?: Database["app"]["Enums"]["media_kind"]
          license_code?: string | null
          license_url?: string | null
          mime_type?: string | null
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
          validated_at?: string | null
          validation_status?: Database["app"]["Enums"]["media_validation_status"]
          width?: number | null
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          attempt_count: number
          channel: Database["app"]["Enums"]["notification_channel"]
          claim_expires_at: string | null
          claimed_at: string | null
          created_at: string
          delivered_at: string | null
          device_registration_id: string | null
          failed_at: string | null
          id: string
          next_retry_at: string | null
          notification_id: string
          provider_key: string
          provider_message_id: string | null
          sanitized_failure_summary: string | null
          sent_at: string | null
          stable_error_code: string | null
          status: Database["app"]["Enums"]["notification_delivery_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          channel: Database["app"]["Enums"]["notification_channel"]
          claim_expires_at?: string | null
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          device_registration_id?: string | null
          failed_at?: string | null
          id?: string
          next_retry_at?: string | null
          notification_id: string
          provider_key: string
          provider_message_id?: string | null
          sanitized_failure_summary?: string | null
          sent_at?: string | null
          stable_error_code?: string | null
          status?: Database["app"]["Enums"]["notification_delivery_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          channel?: Database["app"]["Enums"]["notification_channel"]
          claim_expires_at?: string | null
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          device_registration_id?: string | null
          failed_at?: string | null
          id?: string
          next_retry_at?: string | null
          notification_id?: string
          provider_key?: string
          provider_message_id?: string | null
          sanitized_failure_summary?: string | null
          sent_at?: string | null
          stable_error_code?: string | null
          status?: Database["app"]["Enums"]["notification_delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_device_registration_fkey"
            columns: ["device_registration_id"]
            isOneToOne: false
            referencedRelation: "device_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_subscriptions: {
        Row: {
          competition_id: string | null
          created_at: string
          enabled: boolean
          fixture_id: string | null
          id: string
          kind: Database["app"]["Enums"]["notification_subscription_kind"]
          news_topic_id: string | null
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          competition_id?: string | null
          created_at?: string
          enabled?: boolean
          fixture_id?: string | null
          id?: string
          kind: Database["app"]["Enums"]["notification_subscription_kind"]
          news_topic_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          competition_id?: string | null
          created_at?: string
          enabled?: boolean
          fixture_id?: string | null
          id?: string
          kind?: Database["app"]["Enums"]["notification_subscription_kind"]
          news_topic_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_subscriptions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_subscriptions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_subscriptions_news_topic_id_fkey"
            columns: ["news_topic_id"]
            isOneToOne: false
            referencedRelation: "taxonomies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_subscriptions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          activated_at: string | null
          active: boolean
          body_template: string
          bypass_quiet_hours: boolean
          category: Database["app"]["Enums"]["notification_category"]
          channel: Database["app"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          is_mandatory: boolean
          language: Database["app"]["Enums"]["language_code"]
          max_body_length: number
          max_title_length: number
          notification_type: Database["app"]["Enums"]["notification_type"]
          required_variables: string[]
          retired_at: string | null
          template_key: string
          title_template: string
          updated_at: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          active?: boolean
          body_template: string
          bypass_quiet_hours?: boolean
          category: Database["app"]["Enums"]["notification_category"]
          channel: Database["app"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          is_mandatory?: boolean
          language: Database["app"]["Enums"]["language_code"]
          max_body_length: number
          max_title_length: number
          notification_type: Database["app"]["Enums"]["notification_type"]
          required_variables?: string[]
          retired_at?: string | null
          template_key: string
          title_template: string
          updated_at?: string
          version: number
        }
        Update: {
          activated_at?: string | null
          active?: boolean
          body_template?: string
          bypass_quiet_hours?: boolean
          category?: Database["app"]["Enums"]["notification_category"]
          channel?: Database["app"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          is_mandatory?: boolean
          language?: Database["app"]["Enums"]["language_code"]
          max_body_length?: number
          max_title_length?: number
          notification_type?: Database["app"]["Enums"]["notification_type"]
          required_variables?: string[]
          retired_at?: string | null
          template_key?: string
          title_template?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          archived_at: string | null
          available_at: string
          body: string
          category: Database["app"]["Enums"]["notification_category"]
          created_at: string
          deep_link_entity_id: string | null
          deep_link_target: Database["app"]["Enums"]["notification_deep_link_target"]
          dismissed_at: string | null
          event_id: string
          expires_at: string | null
          id: string
          language: Database["app"]["Enums"]["language_code"]
          notification_type: Database["app"]["Enums"]["notification_type"]
          priority: Database["app"]["Enums"]["notification_priority"]
          read_at: string | null
          source_domain: Database["app"]["Enums"]["notification_source_domain"]
          source_entity_id: string | null
          template_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          available_at?: string
          body: string
          category: Database["app"]["Enums"]["notification_category"]
          created_at?: string
          deep_link_entity_id?: string | null
          deep_link_target?: Database["app"]["Enums"]["notification_deep_link_target"]
          dismissed_at?: string | null
          event_id: string
          expires_at?: string | null
          id?: string
          language: Database["app"]["Enums"]["language_code"]
          notification_type: Database["app"]["Enums"]["notification_type"]
          priority?: Database["app"]["Enums"]["notification_priority"]
          read_at?: string | null
          source_domain: Database["app"]["Enums"]["notification_source_domain"]
          source_entity_id?: string | null
          template_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          available_at?: string
          body?: string
          category?: Database["app"]["Enums"]["notification_category"]
          created_at?: string
          deep_link_entity_id?: string | null
          deep_link_target?: Database["app"]["Enums"]["notification_deep_link_target"]
          dismissed_at?: string | null
          event_id?: string
          expires_at?: string | null
          id?: string
          language?: Database["app"]["Enums"]["language_code"]
          notification_type?: Database["app"]["Enums"]["notification_type"]
          priority?: Database["app"]["Enums"]["notification_priority"]
          read_at?: string | null
          source_domain?: Database["app"]["Enums"]["notification_source_domain"]
          source_entity_id?: string | null
          template_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_availability: {
        Row: {
          active: boolean
          created_at: string
          ends_on: string | null
          expected_return_on: string | null
          id: string
          player_id: string
          provider_updated_at: string
          reason: string | null
          source_sequence: number
          starts_on: string
          status: Database["app"]["Enums"]["availability_status"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_on?: string | null
          expected_return_on?: string | null
          id?: string
          player_id: string
          provider_updated_at: string
          reason?: string | null
          source_sequence?: number
          starts_on: string
          status: Database["app"]["Enums"]["availability_status"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_on?: string | null
          expected_return_on?: string | null
          id?: string
          player_id?: string
          provider_updated_at?: string
          reason?: string | null
          source_sequence?: number
          starts_on?: string
          status?: Database["app"]["Enums"]["availability_status"]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_availability_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_availability_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_fixture_performances: {
        Row: {
          active: boolean
          appeared: boolean
          assists: number
          clean_sheets: number
          created_at: string
          fixture_id: string
          football_season_id: string
          goals: number
          goals_conceded: number
          id: string
          minutes: number
          own_goals: number
          penalties_missed: number
          penalties_saved: number | null
          player_id: string
          position: Database["app"]["Enums"]["football_position"]
          provider_observed_at: string
          provider_rating: number | null
          red_cards: number
          saves: number | null
          second_yellow_dismissals: number
          source_provider: string
          source_version: string
          started: boolean
          team_id: string
          updated_at: string
          yellow_cards: number
        }
        Insert: {
          active?: boolean
          appeared: boolean
          assists: number
          clean_sheets: number
          created_at?: string
          fixture_id: string
          football_season_id: string
          goals: number
          goals_conceded: number
          id?: string
          minutes: number
          own_goals: number
          penalties_missed: number
          penalties_saved?: number | null
          player_id: string
          position: Database["app"]["Enums"]["football_position"]
          provider_observed_at: string
          provider_rating?: number | null
          red_cards: number
          saves?: number | null
          second_yellow_dismissals: number
          source_provider: string
          source_version: string
          started: boolean
          team_id: string
          updated_at?: string
          yellow_cards: number
        }
        Update: {
          active?: boolean
          appeared?: boolean
          assists?: number
          clean_sheets?: number
          created_at?: string
          fixture_id?: string
          football_season_id?: string
          goals?: number
          goals_conceded?: number
          id?: string
          minutes?: number
          own_goals?: number
          penalties_missed?: number
          penalties_saved?: number | null
          player_id?: string
          position?: Database["app"]["Enums"]["football_position"]
          provider_observed_at?: string
          provider_rating?: number | null
          red_cards?: number
          saves?: number | null
          second_yellow_dismissals?: number
          source_provider?: string
          source_version?: string
          started?: boolean
          team_id?: string
          updated_at?: string
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_fixture_performances_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_fixture_performances_football_season_id_fkey"
            columns: ["football_season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_fixture_performances_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_fixture_performances_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_season_ratings: {
        Row: {
          active: boolean
          algorithm_version: string
          appearances: number
          assists: number
          calculated_at: string
          clean_sheets: number
          confidence: number
          created_at: string
          fantasy_equivalent_points: number
          football_season_id: string
          goals: number
          goals_conceded: number
          id: string
          minutes: number
          own_goals: number
          penalties_missed: number
          penalties_saved: number
          player_id: string
          points_per_90: number
          position: Database["app"]["Enums"]["football_position"]
          provider_rating: number | null
          rating: number
          red_cards: number
          saves: number
          second_yellow_dismissals: number
          source_provider: string
          source_updated_at: string
          source_version: string
          starts: number
          updated_at: string
          yellow_cards: number
        }
        Insert: {
          active?: boolean
          algorithm_version: string
          appearances: number
          assists: number
          calculated_at?: string
          clean_sheets: number
          confidence: number
          created_at?: string
          fantasy_equivalent_points: number
          football_season_id: string
          goals: number
          goals_conceded: number
          id?: string
          minutes: number
          own_goals: number
          penalties_missed: number
          penalties_saved: number
          player_id: string
          points_per_90: number
          position: Database["app"]["Enums"]["football_position"]
          provider_rating?: number | null
          rating: number
          red_cards: number
          saves: number
          second_yellow_dismissals: number
          source_provider: string
          source_updated_at: string
          source_version: string
          starts: number
          updated_at?: string
          yellow_cards: number
        }
        Update: {
          active?: boolean
          algorithm_version?: string
          appearances?: number
          assists?: number
          calculated_at?: string
          clean_sheets?: number
          confidence?: number
          created_at?: string
          fantasy_equivalent_points?: number
          football_season_id?: string
          goals?: number
          goals_conceded?: number
          id?: string
          minutes?: number
          own_goals?: number
          penalties_missed?: number
          penalties_saved?: number
          player_id?: string
          points_per_90?: number
          position?: Database["app"]["Enums"]["football_position"]
          provider_rating?: number | null
          rating?: number
          red_cards?: number
          saves?: number
          second_yellow_dismissals?: number
          source_provider?: string
          source_updated_at?: string
          source_version?: string
          starts?: number
          updated_at?: string
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_season_ratings_football_season_id_fkey"
            columns: ["football_season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_season_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          active: boolean
          created_at: string
          date_of_birth: string | null
          display_name: string
          first_name: string | null
          full_name: string
          id: string
          last_name: string | null
          nationality_country_id: string | null
          photo_asset_id: string | null
          position: Database["app"]["Enums"]["football_position"]
          preferred_foot: Database["app"]["Enums"]["preferred_foot"]
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          date_of_birth?: string | null
          display_name: string
          first_name?: string | null
          full_name: string
          id?: string
          last_name?: string | null
          nationality_country_id?: string | null
          photo_asset_id?: string | null
          position: Database["app"]["Enums"]["football_position"]
          preferred_foot?: Database["app"]["Enums"]["preferred_foot"]
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          date_of_birth?: string | null
          display_name?: string
          first_name?: string | null
          full_name?: string
          id?: string
          last_name?: string | null
          nationality_country_id?: string | null
          photo_asset_id?: string | null
          position?: Database["app"]["Enums"]["football_position"]
          preferred_foot?: Database["app"]["Enums"]["preferred_foot"]
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_nationality_country_id_fkey"
            columns: ["nationality_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_photo_asset_id_fkey"
            columns: ["photo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_league_members: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          league_id: string
          left_at: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          league_id: string
          left_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          league_id?: string
          left_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_standings: {
        Row: {
          created_at: string
          exact_count: number
          id: string
          miss_count: number
          outcome_count: number
          points: number
          predicted_count: number
          rank: number | null
          round_id: string | null
          rounds_played: number | null
          scored_count: number
          season_id: string
          updated_at: string
          user_id: string
          void_count: number
        }
        Insert: {
          created_at?: string
          exact_count?: number
          id?: string
          miss_count?: number
          outcome_count?: number
          points?: number
          predicted_count?: number
          rank?: number | null
          round_id?: string | null
          rounds_played?: number | null
          scored_count?: number
          season_id: string
          updated_at?: string
          user_id: string
          void_count?: number
        }
        Update: {
          created_at?: string
          exact_count?: number
          id?: string
          miss_count?: number
          outcome_count?: number
          points?: number
          predicted_count?: number
          rank?: number | null
          round_id?: string | null
          rounds_played?: number | null
          scored_count?: number
          season_id?: string
          updated_at?: string
          user_id?: string
          void_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "prediction_standings_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_standings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_standings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          away_goals: number
          away_team_id: string
          created_at: string
          fixture_id: string
          home_goals: number
          home_team_id: string
          id: string
          origin: string
          points: number | null
          result_kind: string | null
          rule_version: number | null
          scored_at: string | null
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          away_goals: number
          away_team_id: string
          created_at?: string
          fixture_id: string
          home_goals: number
          home_team_id: string
          id?: string
          origin?: string
          points?: number | null
          result_kind?: string | null
          rule_version?: number | null
          scored_at?: string | null
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          away_goals?: number
          away_team_id?: string
          created_at?: string
          fixture_id?: string
          home_goals?: number
          home_team_id?: string
          id?: string
          origin?: string
          points?: number | null
          result_kind?: string | null
          rule_version?: number | null
          scored_at?: string | null
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          id: string
          normalized_username: string | null
          onboarding_completed_at: string | null
          preferred_language: Database["app"]["Enums"]["language_code"]
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id: string
          normalized_username?: string | null
          onboarding_completed_at?: string | null
          preferred_language?: Database["app"]["Enums"]["language_code"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id?: string
          normalized_username?: string | null
          onboarding_completed_at?: string | null
          preferred_language?: Database["app"]["Enums"]["language_code"]
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      publishers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          ingestion_mode: Database["app"]["Enums"]["publisher_ingestion_mode"]
          logo_asset_id: string | null
          name: string
          name_ar: string | null
          slug: string
          source_type: Database["app"]["Enums"]["publisher_source_type"]
          syndication_license_note: string | null
          syndication_licensed_at: string | null
          trust_status: Database["app"]["Enums"]["publisher_trust_status"]
          updated_at: string
          website_url: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          ingestion_mode?: Database["app"]["Enums"]["publisher_ingestion_mode"]
          logo_asset_id?: string | null
          name: string
          name_ar?: string | null
          slug: string
          source_type: Database["app"]["Enums"]["publisher_source_type"]
          syndication_license_note?: string | null
          syndication_licensed_at?: string | null
          trust_status?: Database["app"]["Enums"]["publisher_trust_status"]
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          ingestion_mode?: Database["app"]["Enums"]["publisher_ingestion_mode"]
          logo_asset_id?: string | null
          name?: string
          name_ar?: string | null
          slug?: string
          source_type?: Database["app"]["Enums"]["publisher_source_type"]
          syndication_license_note?: string | null
          syndication_licensed_at?: string | null
          trust_status?: Database["app"]["Enums"]["publisher_trust_status"]
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publishers_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          name: string
          round_number: number | null
          season_id: string
          starts_at: string | null
          status: Database["app"]["Enums"]["round_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name: string
          round_number?: number | null
          season_id: string
          starts_at?: string | null
          status?: Database["app"]["Enums"]["round_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name?: string
          round_number?: number | null
          season_id?: string
          starts_at?: string | null
          status?: Database["app"]["Enums"]["round_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_articles: {
        Row: {
          article_edition_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          article_edition_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          article_edition_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_articles_article_edition_id_fkey"
            columns: ["article_edition_id"]
            isOneToOne: false
            referencedRelation: "article_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          bounds_locked_at: string | null
          bounds_locked_reason: string | null
          competition_id: string
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          label: string
          starts_on: string
          status: Database["app"]["Enums"]["season_status"]
          updated_at: string
        }
        Insert: {
          bounds_locked_at?: string | null
          bounds_locked_reason?: string | null
          competition_id: string
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          label: string
          starts_on: string
          status?: Database["app"]["Enums"]["season_status"]
          updated_at?: string
        }
        Update: {
          bounds_locked_at?: string | null
          bounds_locked_reason?: string | null
          competition_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          label?: string
          starts_on?: string
          status?: Database["app"]["Enums"]["season_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      standings: {
        Row: {
          competition_id: string
          created_at: string
          drawn: number
          form: string | null
          goal_difference: number | null
          goals_against: number
          goals_for: number
          group_key: string
          id: string
          lost: number
          played: number
          points: number
          provider_updated_at: string
          qualification_code: string | null
          rank: number
          season_id: string
          source_sequence: number
          table_type: string
          team_id: string
          updated_at: string
          won: number
        }
        Insert: {
          competition_id: string
          created_at?: string
          drawn?: number
          form?: string | null
          goal_difference?: number | null
          goals_against?: number
          goals_for?: number
          group_key?: string
          id?: string
          lost?: number
          played?: number
          points?: number
          provider_updated_at: string
          qualification_code?: string | null
          rank: number
          season_id: string
          source_sequence?: number
          table_type?: string
          team_id: string
          updated_at?: string
          won?: number
        }
        Update: {
          competition_id?: string
          created_at?: string
          drawn?: number
          form?: string | null
          goal_difference?: number | null
          goals_against?: number
          goals_for?: number
          group_key?: string
          id?: string
          lost?: number
          played?: number
          points?: number
          provider_updated_at?: string
          qualification_code?: string | null
          rank?: number
          season_id?: string
          source_sequence?: number
          table_type?: string
          team_id?: string
          updated_at?: string
          won?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      statistic_definitions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          display_name: string
          display_order: number
          id: string
          unit: string | null
          updated_at: string
          value_type: Database["app"]["Enums"]["statistic_value_type"]
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          display_name: string
          display_order?: number
          id?: string
          unit?: string | null
          updated_at?: string
          value_type: Database["app"]["Enums"]["statistic_value_type"]
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          display_name?: string
          display_order?: number
          id?: string
          unit?: string | null
          updated_at?: string
          value_type?: Database["app"]["Enums"]["statistic_value_type"]
        }
        Relationships: []
      }
      stories: {
        Row: {
          author_id: string | null
          canonical_url: string | null
          content_fingerprint: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          import_conversion_reason: string | null
          import_converted_at: string | null
          import_converted_by: string | null
          origin: Database["app"]["Enums"]["content_origin"]
          original_language: Database["app"]["Enums"]["language_code"]
          publisher_id: string | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          canonical_url?: string | null
          content_fingerprint?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          import_conversion_reason?: string | null
          import_converted_at?: string | null
          import_converted_by?: string | null
          origin?: Database["app"]["Enums"]["content_origin"]
          original_language: Database["app"]["Enums"]["language_code"]
          publisher_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          canonical_url?: string | null
          content_fingerprint?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          import_conversion_reason?: string | null
          import_converted_at?: string | null
          import_converted_by?: string | null
          origin?: Database["app"]["Enums"]["content_origin"]
          original_language?: Database["app"]["Enums"]["language_code"]
          publisher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
        ]
      }
      story_competitions: {
        Row: {
          competition_id: string
          created_at: string
          story_id: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          story_id: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_competitions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_competitions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_countries: {
        Row: {
          country_id: string
          created_at: string
          story_id: string
        }
        Insert: {
          country_id: string
          created_at?: string
          story_id: string
        }
        Update: {
          country_id?: string
          created_at?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_countries_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_countries_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_players: {
        Row: {
          created_at: string
          player_id: string
          story_id: string
        }
        Insert: {
          created_at?: string
          player_id: string
          story_id: string
        }
        Update: {
          created_at?: string
          player_id?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_players_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_taxonomies: {
        Row: {
          created_at: string
          is_primary: boolean
          story_id: string
          taxonomy_id: string
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          story_id: string
          taxonomy_id: string
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          story_id?: string
          taxonomy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_taxonomies_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_taxonomies_taxonomy_id_fkey"
            columns: ["taxonomy_id"]
            isOneToOne: false
            referencedRelation: "taxonomies"
            referencedColumns: ["id"]
          },
        ]
      }
      story_teams: {
        Row: {
          created_at: string
          story_id: string
          tagged_by: string
          team_id: string
        }
        Insert: {
          created_at?: string
          story_id: string
          tagged_by?: string
          team_id: string
        }
        Update: {
          created_at?: string
          story_id?: string
          tagged_by?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_teams_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomies: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          id: string
          slug: string
          taxonomy_type: Database["app"]["Enums"]["taxonomy_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          id?: string
          slug: string
          taxonomy_type: Database["app"]["Enums"]["taxonomy_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          id?: string
          slug?: string
          taxonomy_type?: Database["app"]["Enums"]["taxonomy_type"]
          updated_at?: string
        }
        Relationships: []
      }
      taxonomy_translations: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          language: Database["app"]["Enums"]["language_code"]
          taxonomy_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          language: Database["app"]["Enums"]["language_code"]
          taxonomy_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          language?: Database["app"]["Enums"]["language_code"]
          taxonomy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_translations_taxonomy_id_fkey"
            columns: ["taxonomy_id"]
            isOneToOne: false
            referencedRelation: "taxonomies"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          active: boolean
          created_at: string
          id: string
          player_id: string
          season_id: string | null
          shirt_number: number | null
          squad_role: Database["app"]["Enums"]["squad_role"]
          team_id: string
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          player_id: string
          season_id?: string | null
          shirt_number?: number | null
          squad_role?: Database["app"]["Enums"]["squad_role"]
          team_id: string
          updated_at?: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          player_id?: string
          season_id?: string | null
          shirt_number?: number | null
          squad_role?: Database["app"]["Enums"]["squad_role"]
          team_id?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_translations: {
        Row: {
          created_at: string
          language: Database["app"]["Enums"]["language_code"]
          name: string
          short_name: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          language: Database["app"]["Enums"]["language_code"]
          name: string
          short_name?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          language?: Database["app"]["Enums"]["language_code"]
          name?: string
          short_name?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_translations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          active: boolean
          city: string | null
          code: string | null
          country_id: string | null
          created_at: string
          crest_asset_id: string | null
          id: string
          name: string
          primary_color: string | null
          secondary_color: string | null
          short_name: string
          slug: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          active?: boolean
          city?: string | null
          code?: string | null
          country_id?: string | null
          created_at?: string
          crest_asset_id?: string | null
          id?: string
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          short_name: string
          slug: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          active?: boolean
          city?: string | null
          code?: string | null
          country_id?: string | null
          created_at?: string
          crest_asset_id?: string | null
          id?: string
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          short_name?: string
          slug?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_crest_asset_id_fkey"
            columns: ["crest_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          breaking_news: boolean
          created_at: string
          email_notifications_enabled: boolean
          fantasy_deadline_offset_minutes: number
          fantasy_deadline_reminders: boolean
          favorite_team_id: string | null
          favorite_team_provisional_ref: string | null
          in_app_notifications_enabled: boolean
          match_alerts: boolean
          notification_digest_mode: Database["app"]["Enums"]["notification_digest_mode"]
          notification_timezone: string
          notifications_enabled: boolean
          push_notifications_enabled: boolean
          quiet_hours_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          breaking_news?: boolean
          created_at?: string
          email_notifications_enabled?: boolean
          fantasy_deadline_offset_minutes?: number
          fantasy_deadline_reminders?: boolean
          favorite_team_id?: string | null
          favorite_team_provisional_ref?: string | null
          in_app_notifications_enabled?: boolean
          match_alerts?: boolean
          notification_digest_mode?: Database["app"]["Enums"]["notification_digest_mode"]
          notification_timezone?: string
          notifications_enabled?: boolean
          push_notifications_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          breaking_news?: boolean
          created_at?: string
          email_notifications_enabled?: boolean
          fantasy_deadline_offset_minutes?: number
          fantasy_deadline_reminders?: boolean
          favorite_team_id?: string | null
          favorite_team_provisional_ref?: string | null
          in_app_notifications_enabled?: boolean
          match_alerts?: boolean
          notification_digest_mode?: Database["app"]["Enums"]["notification_digest_mode"]
          notification_timezone?: string
          notifications_enabled?: boolean
          push_notifications_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_favorite_team_id_fkey"
            columns: ["favorite_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_translations: {
        Row: {
          city_name: string | null
          created_at: string
          display_name: string
          language: Database["app"]["Enums"]["language_code"]
          updated_at: string
          venue_id: string
        }
        Insert: {
          city_name?: string | null
          created_at?: string
          display_name: string
          language: Database["app"]["Enums"]["language_code"]
          updated_at?: string
          venue_id: string
        }
        Update: {
          city_name?: string | null
          created_at?: string
          display_name?: string
          language?: Database["app"]["Enums"]["language_code"]
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_translations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          active: boolean
          capacity: number | null
          city: string | null
          country_id: string | null
          created_at: string
          default_name: string
          id: string
          latitude: number | null
          longitude: number | null
          media_asset_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          capacity?: number | null
          city?: string | null
          country_id?: string | null
          created_at?: string
          default_name: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          media_asset_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          capacity?: number | null
          city?: string | null
          country_id?: string | null
          created_at?: string
          default_name?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          media_asset_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      account_deletion_status:
        | "requested"
        | "cancelled"
        | "processing"
        | "completed"
        | "rejected"
      article_body_format: "markdown" | "rich_text"
      article_visibility: "public" | "unlisted" | "private"
      author_type: "staff" | "guest" | "agency" | "automated"
      availability_status:
        | "available"
        | "injured"
        | "suspended"
        | "doubtful"
        | "unknown"
      competition_type:
        | "league"
        | "cup"
        | "super_cup"
        | "international"
        | "friendly"
      content_origin: "manual" | "provider" | "partner"
      fantasy_chip_type:
        | "wildcard"
        | "free_hit"
        | "bench_boost"
        | "triple_captain"
      fantasy_gameweek_status:
        | "scheduled"
        | "open"
        | "locked"
        | "live"
        | "provisional"
        | "finalizing"
        | "finalized"
        | "corrected"
        | "cancelled"
      fantasy_league_member_status: "active" | "left" | "removed"
      fantasy_league_role: "owner" | "admin" | "member"
      fantasy_league_visibility: "public" | "private"
      fantasy_lineup_slot: "starter" | "bench"
      fantasy_player_status:
        | "available"
        | "doubtful"
        | "injured"
        | "suspended"
        | "ineligible"
        | "unavailable"
      fantasy_points_state: "provisional" | "final"
      fantasy_prize_skip_reason:
        | "flagged"
        | "staff"
        | "gameweek_cap_reached"
        | "mini_league_cap_reached"
      fantasy_prize_tie_break:
        | "outright"
        | "fewer_transfers"
        | "earlier_registration"
        | "final_fallback"
        | "admin_override"
      fantasy_prize_tier: "gameweek" | "monthly" | "season" | "mini_league"
      fantasy_prize_winner_status:
        | "pending"
        | "verified"
        | "paid"
        | "forfeited"
        | "overridden"
      fantasy_run_status:
        | "pending"
        | "running"
        | "partial"
        | "succeeded"
        | "failed"
        | "cancelled"
      fantasy_season_status:
        | "planned"
        | "registration_open"
        | "active"
        | "completed"
        | "cancelled"
      fantasy_team_status: "active" | "suspended" | "archived"
      fantasy_transfer_batch_status: "confirmed" | "reversed_by_correction"
      fixture_period:
        | "pre_match"
        | "first_half"
        | "half_time"
        | "second_half"
        | "extra_time"
        | "penalties"
        | "post_match"
      fixture_status:
        | "scheduled"
        | "not_started"
        | "live_first_half"
        | "half_time"
        | "live_second_half"
        | "extra_time"
        | "penalties"
        | "finished"
        | "postponed"
        | "cancelled"
        | "suspended"
        | "delayed"
        | "abandoned"
      football_position: "goalkeeper" | "defender" | "midfielder" | "forward"
      language_code: "fr" | "ar"
      lineup_slot: "starting" | "bench"
      match_event_type:
        | "goal"
        | "own_goal"
        | "penalty_goal"
        | "missed_penalty"
        | "yellow_card"
        | "second_yellow"
        | "red_card"
        | "substitution"
        | "var"
        | "injury"
        | "period_start"
        | "period_end"
      media_kind:
        | "competition_logo"
        | "team_crest"
        | "player_photo"
        | "venue_image"
        | "article_hero"
        | "article_inline"
        | "author_avatar"
        | "publisher_logo"
        | "video_thumbnail"
      media_validation_status: "pending" | "validated" | "rejected" | "expired"
      notification_category:
        | "account"
        | "security"
        | "football"
        | "fantasy"
        | "news"
        | "system"
      notification_channel: "in_app" | "push" | "email"
      notification_deep_link_target:
        | "none"
        | "match_detail"
        | "article"
        | "fantasy_team"
        | "fantasy_points"
        | "fantasy_transfers"
        | "profile"
        | "settings"
        | "security_action"
      notification_delivery_status:
        | "pending"
        | "claimed"
        | "sent"
        | "delivered"
        | "retry_scheduled"
        | "failed"
        | "dead_lettered"
        | "cancelled"
      notification_device_platform: "web" | "ios" | "android"
      notification_digest_mode: "immediate" | "daily" | "weekly"
      notification_event_status:
        | "pending"
        | "processing"
        | "completed"
        | "partially_failed"
        | "failed"
        | "cancelled"
      notification_priority: "low" | "normal" | "high" | "urgent"
      notification_push_provider:
        | "fixture"
        | "web_push"
        | "fcm"
        | "apns"
        | "expo"
      notification_source_domain:
        | "identity"
        | "football"
        | "news"
        | "fantasy"
        | "system"
      notification_subscription_kind:
        | "match"
        | "team"
        | "competition"
        | "news_topic"
      notification_type:
        | "email_verified"
        | "password_changed"
        | "account_deletion_requested"
        | "account_deletion_cancelled"
        | "new_session_detected"
        | "sensitive_profile_change"
        | "match_starting"
        | "match_started"
        | "goal"
        | "half_time"
        | "full_time"
        | "lineup_available"
        | "match_postponed"
        | "match_cancelled"
        | "followed_team_result"
        | "deadline_24h"
        | "deadline_1h"
        | "team_incomplete"
        | "transfer_confirmation"
        | "chip_activated"
        | "gameweek_finalized"
        | "league_position_changed"
        | "breaking_news"
        | "followed_team_article"
        | "followed_competition_article"
        | "editorial_digest"
        | "system_announcement"
        | "matchday_preview"
        | "matchday_results"
        | "round_preview"
      placement_scope: "global" | "competition" | "team" | "country"
      placement_type:
        | "home_lead"
        | "news_lead"
        | "editors_pick"
        | "featured"
        | "breaking"
        | "trending"
      preferred_foot: "left" | "right" | "both" | "unknown"
      publication_status:
        | "draft"
        | "in_review"
        | "scheduled"
        | "published"
        | "unpublished"
        | "archived"
        | "rejected"
      publisher_ingestion_mode: "manual" | "api" | "rss"
      publisher_source_type: "internal" | "provider" | "partner"
      publisher_trust_status: "trusted" | "review_required" | "blocked"
      round_status: "planned" | "active" | "completed" | "cancelled"
      season_status: "planned" | "active" | "completed" | "cancelled"
      squad_role: "player" | "captain" | "vice_captain" | "reserve"
      statistic_value_type: "integer" | "decimal" | "percentage" | "duration"
      taxonomy_type: "category" | "topic" | "tag"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  api: {
    Enums: {},
  },
  app: {
    Enums: {
      account_deletion_status: [
        "requested",
        "cancelled",
        "processing",
        "completed",
        "rejected",
      ],
      article_body_format: ["markdown", "rich_text"],
      article_visibility: ["public", "unlisted", "private"],
      author_type: ["staff", "guest", "agency", "automated"],
      availability_status: [
        "available",
        "injured",
        "suspended",
        "doubtful",
        "unknown",
      ],
      competition_type: [
        "league",
        "cup",
        "super_cup",
        "international",
        "friendly",
      ],
      content_origin: ["manual", "provider", "partner"],
      fantasy_chip_type: [
        "wildcard",
        "free_hit",
        "bench_boost",
        "triple_captain",
      ],
      fantasy_gameweek_status: [
        "scheduled",
        "open",
        "locked",
        "live",
        "provisional",
        "finalizing",
        "finalized",
        "corrected",
        "cancelled",
      ],
      fantasy_league_member_status: ["active", "left", "removed"],
      fantasy_league_role: ["owner", "admin", "member"],
      fantasy_league_visibility: ["public", "private"],
      fantasy_lineup_slot: ["starter", "bench"],
      fantasy_player_status: [
        "available",
        "doubtful",
        "injured",
        "suspended",
        "ineligible",
        "unavailable",
      ],
      fantasy_points_state: ["provisional", "final"],
      fantasy_prize_skip_reason: [
        "flagged",
        "staff",
        "gameweek_cap_reached",
        "mini_league_cap_reached",
      ],
      fantasy_prize_tie_break: [
        "outright",
        "fewer_transfers",
        "earlier_registration",
        "final_fallback",
        "admin_override",
      ],
      fantasy_prize_tier: ["gameweek", "monthly", "season", "mini_league"],
      fantasy_prize_winner_status: [
        "pending",
        "verified",
        "paid",
        "forfeited",
        "overridden",
      ],
      fantasy_run_status: [
        "pending",
        "running",
        "partial",
        "succeeded",
        "failed",
        "cancelled",
      ],
      fantasy_season_status: [
        "planned",
        "registration_open",
        "active",
        "completed",
        "cancelled",
      ],
      fantasy_team_status: ["active", "suspended", "archived"],
      fantasy_transfer_batch_status: ["confirmed", "reversed_by_correction"],
      fixture_period: [
        "pre_match",
        "first_half",
        "half_time",
        "second_half",
        "extra_time",
        "penalties",
        "post_match",
      ],
      fixture_status: [
        "scheduled",
        "not_started",
        "live_first_half",
        "half_time",
        "live_second_half",
        "extra_time",
        "penalties",
        "finished",
        "postponed",
        "cancelled",
        "suspended",
        "delayed",
        "abandoned",
      ],
      football_position: ["goalkeeper", "defender", "midfielder", "forward"],
      language_code: ["fr", "ar"],
      lineup_slot: ["starting", "bench"],
      match_event_type: [
        "goal",
        "own_goal",
        "penalty_goal",
        "missed_penalty",
        "yellow_card",
        "second_yellow",
        "red_card",
        "substitution",
        "var",
        "injury",
        "period_start",
        "period_end",
      ],
      media_kind: [
        "competition_logo",
        "team_crest",
        "player_photo",
        "venue_image",
        "article_hero",
        "article_inline",
        "author_avatar",
        "publisher_logo",
        "video_thumbnail",
      ],
      media_validation_status: ["pending", "validated", "rejected", "expired"],
      notification_category: [
        "account",
        "security",
        "football",
        "fantasy",
        "news",
        "system",
      ],
      notification_channel: ["in_app", "push", "email"],
      notification_deep_link_target: [
        "none",
        "match_detail",
        "article",
        "fantasy_team",
        "fantasy_points",
        "fantasy_transfers",
        "profile",
        "settings",
        "security_action",
      ],
      notification_delivery_status: [
        "pending",
        "claimed",
        "sent",
        "delivered",
        "retry_scheduled",
        "failed",
        "dead_lettered",
        "cancelled",
      ],
      notification_device_platform: ["web", "ios", "android"],
      notification_digest_mode: ["immediate", "daily", "weekly"],
      notification_event_status: [
        "pending",
        "processing",
        "completed",
        "partially_failed",
        "failed",
        "cancelled",
      ],
      notification_priority: ["low", "normal", "high", "urgent"],
      notification_push_provider: [
        "fixture",
        "web_push",
        "fcm",
        "apns",
        "expo",
      ],
      notification_source_domain: [
        "identity",
        "football",
        "news",
        "fantasy",
        "system",
      ],
      notification_subscription_kind: [
        "match",
        "team",
        "competition",
        "news_topic",
      ],
      notification_type: [
        "email_verified",
        "password_changed",
        "account_deletion_requested",
        "account_deletion_cancelled",
        "new_session_detected",
        "sensitive_profile_change",
        "match_starting",
        "match_started",
        "goal",
        "half_time",
        "full_time",
        "lineup_available",
        "match_postponed",
        "match_cancelled",
        "followed_team_result",
        "deadline_24h",
        "deadline_1h",
        "team_incomplete",
        "transfer_confirmation",
        "chip_activated",
        "gameweek_finalized",
        "league_position_changed",
        "breaking_news",
        "followed_team_article",
        "followed_competition_article",
        "editorial_digest",
        "system_announcement",
        "matchday_preview",
        "matchday_results",
        "round_preview",
      ],
      placement_scope: ["global", "competition", "team", "country"],
      placement_type: [
        "home_lead",
        "news_lead",
        "editors_pick",
        "featured",
        "breaking",
        "trending",
      ],
      preferred_foot: ["left", "right", "both", "unknown"],
      publication_status: [
        "draft",
        "in_review",
        "scheduled",
        "published",
        "unpublished",
        "archived",
        "rejected",
      ],
      publisher_ingestion_mode: ["manual", "api", "rss"],
      publisher_source_type: ["internal", "provider", "partner"],
      publisher_trust_status: ["trusted", "review_required", "blocked"],
      round_status: ["planned", "active", "completed", "cancelled"],
      season_status: ["planned", "active", "completed", "cancelled"],
      squad_role: ["player", "captain", "vice_captain", "reserve"],
      statistic_value_type: ["integer", "decimal", "percentage", "duration"],
      taxonomy_type: ["category", "topic", "tag"],
    },
  },
  public: {
    Enums: {},
  },
} as const
