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
      begin_football_ingestion: {
        Args: {
          p_checkpoint?: Json
          p_job_type: string
          p_provider_name: string
          p_target_scope?: Json
        }
        Returns: string
      }
      cancel_account_deletion: { Args: never; Returns: boolean }
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
      football_head_to_head: {
        Args: { p_fixture_id: string; p_language?: string; p_limit?: number }
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
      football_match_detail: {
        Args: { p_fixture_id: string; p_language?: string }
        Returns: Json
      }
      football_match_lineups: {
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
          p_statuses?: string[]
          p_timezone?: string
        }
        Returns: Json
      }
      football_player_availability: {
        Args: { p_limit?: number; p_player_id: string }
        Returns: Json
      }
      football_player_summary: {
        Args: { p_language?: string; p_player_id: string }
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
      ingest_football_fixture: {
        Args: {
          p_external_id: string
          p_fixture: Json
          p_provider_name: string
        }
        Returns: string
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
      request_account_deletion: { Args: never; Returns: string }
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
      unfollow_competition: {
        Args: { p_competition_id: string }
        Returns: boolean
      }
      unfollow_team: { Args: { p_team_id: string }; Returns: boolean }
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
          player_id: string
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
          player_id: string
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
          player_id?: string
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
      media_assets: {
        Row: {
          attribution: string | null
          created_at: string
          id: string
          kind: Database["app"]["Enums"]["media_kind"]
          license_code: string | null
          source_url: string | null
          storage_path: string | null
          updated_at: string
          validated_at: string | null
          validation_status: Database["app"]["Enums"]["media_validation_status"]
        }
        Insert: {
          attribution?: string | null
          created_at?: string
          id?: string
          kind: Database["app"]["Enums"]["media_kind"]
          license_code?: string | null
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
          validated_at?: string | null
          validation_status?: Database["app"]["Enums"]["media_validation_status"]
        }
        Update: {
          attribution?: string | null
          created_at?: string
          id?: string
          kind?: Database["app"]["Enums"]["media_kind"]
          license_code?: string | null
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
          validated_at?: string | null
          validation_status?: Database["app"]["Enums"]["media_validation_status"]
        }
        Relationships: []
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
      seasons: {
        Row: {
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
          fantasy_deadline_reminders: boolean
          favorite_team_id: string | null
          favorite_team_provisional_ref: string | null
          match_alerts: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          breaking_news?: boolean
          created_at?: string
          fantasy_deadline_reminders?: boolean
          favorite_team_id?: string | null
          favorite_team_provisional_ref?: string | null
          match_alerts?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          breaking_news?: boolean
          created_at?: string
          fantasy_deadline_reminders?: boolean
          favorite_team_id?: string | null
          favorite_team_provisional_ref?: string | null
          match_alerts?: boolean
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
      media_validation_status: "pending" | "validated" | "rejected" | "expired"
      preferred_foot: "left" | "right" | "both" | "unknown"
      round_status: "planned" | "active" | "completed" | "cancelled"
      season_status: "planned" | "active" | "completed" | "cancelled"
      squad_role: "player" | "captain" | "vice_captain" | "reserve"
      statistic_value_type: "integer" | "decimal" | "percentage" | "duration"
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
      ],
      media_validation_status: ["pending", "validated", "rejected", "expired"],
      preferred_foot: ["left", "right", "both", "unknown"],
      round_status: ["planned", "active", "completed", "cancelled"],
      season_status: ["planned", "active", "completed", "cancelled"],
      squad_role: ["player", "captain", "vice_captain", "reserve"],
      statistic_value_type: ["integer", "decimal", "percentage", "duration"],
    },
  },
  public: {
    Enums: {},
  },
} as const
