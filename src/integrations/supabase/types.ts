export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      article_clubs: {
        Row: {
          article_id: string
          club_id: string
        }
        Insert: {
          article_id: string
          club_id: string
        }
        Update: {
          article_id?: string
          club_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_clubs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_clubs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author_id: string | null
          body_ar: string | null
          body_fr: string | null
          byline: string | null
          category: string
          created_at: string
          excerpt_ar: string | null
          excerpt_fr: string | null
          hero_image_url: string | null
          id: string
          provider_id: string | null
          published_at: string | null
          slug: string
          source_url: string | null
          status: string
          title_ar: string
          title_fr: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_ar?: string | null
          body_fr?: string | null
          byline?: string | null
          category?: string
          created_at?: string
          excerpt_ar?: string | null
          excerpt_fr?: string | null
          hero_image_url?: string | null
          id?: string
          provider_id?: string | null
          published_at?: string | null
          slug: string
          source_url?: string | null
          status?: string
          title_ar: string
          title_fr: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_ar?: string | null
          body_fr?: string | null
          byline?: string | null
          category?: string
          created_at?: string
          excerpt_ar?: string | null
          excerpt_fr?: string | null
          hero_image_url?: string | null
          id?: string
          provider_id?: string | null
          published_at?: string | null
          slug?: string
          source_url?: string | null
          status?: string
          title_ar?: string
          title_fr?: string
          updated_at?: string
        }
        Relationships: []
      }
      club_follows: {
        Row: {
          club_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_follows_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          city_ar: string | null
          city_fr: string | null
          created_at: string
          crest_url: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_fr: string
          primary_color: string | null
          provider_id: string | null
          secondary_color: string | null
          short_name_ar: string
          short_name_fr: string
          slug: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          city_ar?: string | null
          city_fr?: string | null
          created_at?: string
          crest_url?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_fr: string
          primary_color?: string | null
          provider_id?: string | null
          secondary_color?: string | null
          short_name_ar: string
          short_name_fr: string
          slug: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          city_ar?: string | null
          city_fr?: string | null
          created_at?: string
          crest_url?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_fr?: string
          primary_color?: string | null
          provider_id?: string | null
          secondary_color?: string | null
          short_name_ar?: string
          short_name_fr?: string
          slug?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      fantasy_chip_uses: {
        Row: {
          activated_at: string
          chip: string
          finalized_at: string | null
          gameweek_id: string
          id: string
          season: string
          state: string
          team_id: string
        }
        Insert: {
          activated_at?: string
          chip: string
          finalized_at?: string | null
          gameweek_id: string
          id?: string
          season: string
          state?: string
          team_id: string
        }
        Update: {
          activated_at?: string
          chip?: string
          finalized_at?: string | null
          gameweek_id?: string
          id?: string
          season?: string
          state?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_chip_uses_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "gameweeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_chip_uses_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_gameweek_results: {
        Row: {
          auto_subs: Json
          bench_boost_points: number
          bench_points: number
          captain_multiplier: number
          captain_points: number
          chip: string | null
          created_at: string
          effective_captain_id: string | null
          final_points: number
          finalized_at: string | null
          gameweek_id: string
          id: string
          is_finalized: boolean
          raw_points: number
          team_id: string
          transfer_hit: number
          triple_captain_points: number
          updated_at: string
        }
        Insert: {
          auto_subs?: Json
          bench_boost_points?: number
          bench_points?: number
          captain_multiplier?: number
          captain_points?: number
          chip?: string | null
          created_at?: string
          effective_captain_id?: string | null
          final_points?: number
          finalized_at?: string | null
          gameweek_id: string
          id?: string
          is_finalized?: boolean
          raw_points?: number
          team_id: string
          transfer_hit?: number
          triple_captain_points?: number
          updated_at?: string
        }
        Update: {
          auto_subs?: Json
          bench_boost_points?: number
          bench_points?: number
          captain_multiplier?: number
          captain_points?: number
          chip?: string | null
          created_at?: string
          effective_captain_id?: string | null
          final_points?: number
          finalized_at?: string | null
          gameweek_id?: string
          id?: string
          is_finalized?: boolean
          raw_points?: number
          team_id?: string
          transfer_hit?: number
          triple_captain_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_gameweek_results_effective_captain_id_fkey"
            columns: ["effective_captain_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_gameweek_results_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "gameweeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_gameweek_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_squad_members: {
        Row: {
          created_at: string
          id: string
          is_captain: boolean
          is_vice: boolean
          player_id: string
          purchase_price: number
          slot: number
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_captain?: boolean
          is_vice?: boolean
          player_id: string
          purchase_price: number
          slot: number
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_captain?: boolean
          is_vice?: boolean
          player_id?: string
          purchase_price?: number
          slot?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_squad_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_squad_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_teams: {
        Row: {
          bank: number
          created_at: string
          current_gameweek_id: string | null
          formation: string
          free_transfers: number
          id: string
          lifecycle_state: Json
          manager_name: string | null
          pending_transfers: number
          team_name: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          bank?: number
          created_at?: string
          current_gameweek_id?: string | null
          formation?: string
          free_transfers?: number
          id?: string
          lifecycle_state?: Json
          manager_name?: string | null
          pending_transfers?: number
          team_name: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          bank?: number
          created_at?: string
          current_gameweek_id?: string | null
          formation?: string
          free_transfers?: number
          id?: string
          lifecycle_state?: Json
          manager_name?: string | null
          pending_transfers?: number
          team_name?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_teams_current_gameweek_id_fkey"
            columns: ["current_gameweek_id"]
            isOneToOne: false
            referencedRelation: "gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_transfers: {
        Row: {
          chip: string | null
          confirmed_at: string | null
          cost: number
          created_at: string
          gameweek_id: string
          hit: number
          id: string
          player_in_id: string
          player_out_id: string
          price_in: number
          price_out: number
          status: string
          team_id: string
          user_id: string
        }
        Insert: {
          chip?: string | null
          confirmed_at?: string | null
          cost?: number
          created_at?: string
          gameweek_id: string
          hit?: number
          id?: string
          player_in_id: string
          player_out_id: string
          price_in: number
          price_out: number
          status?: string
          team_id: string
          user_id: string
        }
        Update: {
          chip?: string | null
          confirmed_at?: string | null
          cost?: number
          created_at?: string
          gameweek_id?: string
          hit?: number
          id?: string
          player_in_id?: string
          player_out_id?: string
          price_in?: number
          price_out?: number
          status?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_transfers_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "gameweeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_transfers_player_in_id_fkey"
            columns: ["player_in_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_transfers_player_out_id_fkey"
            columns: ["player_out_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_transfers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fixtures: {
        Row: {
          away_club_id: string
          away_score: number | null
          created_at: string
          gameweek_id: string
          home_club_id: string
          home_score: number | null
          id: string
          kickoff: string
          last_synced_at: string | null
          provider_id: string | null
          status: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          away_club_id: string
          away_score?: number | null
          created_at?: string
          gameweek_id: string
          home_club_id: string
          home_score?: number | null
          id?: string
          kickoff: string
          last_synced_at?: string | null
          provider_id?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          away_club_id?: string
          away_score?: number | null
          created_at?: string
          gameweek_id?: string
          home_club_id?: string
          home_score?: number | null
          id?: string
          kickoff?: string
          last_synced_at?: string | null
          provider_id?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_away_club_id_fkey"
            columns: ["away_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "gameweeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_home_club_id_fkey"
            columns: ["home_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      gameweeks: {
        Row: {
          created_at: string
          deadline: string
          finalized_at: string | null
          id: string
          number: number
          season: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deadline: string
          finalized_at?: string | null
          id?: string
          number: number
          season: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deadline?: string
          finalized_at?: string | null
          id?: string
          number?: number
          season?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      injuries: {
        Row: {
          created_at: string
          detail_ar: string | null
          detail_fr: string | null
          expected_return: string | null
          id: string
          player_id: string
          provider_id: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail_ar?: string | null
          detail_fr?: string | null
          expected_return?: string | null
          id?: string
          player_id: string
          provider_id?: string | null
          source?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail_ar?: string | null
          detail_fr?: string | null
          expected_return?: string | null
          id?: string
          player_id?: string
          provider_id?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "injuries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          id: string
          joined_at: string
          league_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          league_id: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          league_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          creator_id: string
          description: string | null
          id: string
          invite_code: string
          is_active: boolean
          name: string
          scoring_mode: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          invite_code: string
          is_active?: boolean
          name: string
          scoring_mode?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          invite_code?: string
          is_active?: boolean
          name?: string
          scoring_mode?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      player_follows: {
        Row: {
          created_at: string
          player_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          player_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          player_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_follows_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          club_id: string | null
          created_at: string
          form: number
          id: string
          is_active: boolean
          name_ar: string
          name_fr: string
          ownership_percent: number
          photo_url: string | null
          position: string
          price_millions: number
          provider_id: string | null
          shirt_number: number | null
          status: string
          total_points: number
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          form?: number
          id?: string
          is_active?: boolean
          name_ar: string
          name_fr: string
          ownership_percent?: number
          photo_url?: string | null
          position: string
          price_millions?: number
          provider_id?: string | null
          shirt_number?: number | null
          status?: string
          total_points?: number
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          form?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          name_fr?: string
          ownership_percent?: number
          photo_url?: string | null
          position?: string
          price_millions?: number
          provider_id?: string | null
          shirt_number?: number | null
          status?: string
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          favorite_club_id: string | null
          id: string
          preferred_language: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          favorite_club_id?: string | null
          id: string
          preferred_language?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          favorite_club_id?: string | null
          id?: string
          preferred_language?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_favorite_club_id_fkey"
            columns: ["favorite_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_articles: {
        Row: {
          article_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_articles_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      standings: {
        Row: {
          club_id: string
          created_at: string
          drawn: number
          form: string | null
          gameweek_id: string | null
          goal_diff: number
          goals_against: number
          goals_for: number
          id: string
          lost: number
          played: number
          points: number
          rank: number
          season: string
          updated_at: string
          won: number
        }
        Insert: {
          club_id: string
          created_at?: string
          drawn?: number
          form?: string | null
          gameweek_id?: string | null
          goal_diff?: number
          goals_against?: number
          goals_for?: number
          id?: string
          lost?: number
          played?: number
          points?: number
          rank: number
          season: string
          updated_at?: string
          won?: number
        }
        Update: {
          club_id?: string
          created_at?: string
          drawn?: number
          form?: string | null
          gameweek_id?: string | null
          goal_diff?: number
          goals_against?: number
          goals_for?: number
          id?: string
          lost?: number
          played?: number
          points?: number
          rank?: number
          season?: string
          updated_at?: string
          won?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_gameweek_id_fkey"
            columns: ["gameweek_id"]
            isOneToOne: false
            referencedRelation: "gameweeks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          breaking_news: boolean
          chat_notifications: boolean
          created_at: string
          fantasy_deadline_reminders: boolean
          marketing_opt_in: boolean
          match_alerts: boolean
          social_notifications: boolean
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          breaking_news?: boolean
          chat_notifications?: boolean
          created_at?: string
          fantasy_deadline_reminders?: boolean
          marketing_opt_in?: boolean
          match_alerts?: boolean
          social_notifications?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          breaking_news?: boolean
          chat_notifications?: boolean
          created_at?: string
          fantasy_deadline_reminders?: boolean
          marketing_opt_in?: boolean
          match_alerts?: boolean
          social_notifications?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _replace_fantasy_squad: {
        Args: { _squad: Json; _team_id: string }
        Returns: undefined
      }
      confirm_fantasy_transfers: {
        Args: {
          _bank: number
          _current_gameweek_id: string
          _expected_version: number
          _formation: string
          _free_transfers: number
          _lifecycle: Json
          _pending_transfers: number
          _squad: Json
          _team_id: string
          _transfers: Json
        }
        Returns: {
          id: string
          transfer_ids: string[]
          updated_at: string
          version: number
        }[]
      }
      create_private_league: {
        Args: { _description: string; _name: string; _scoring_mode?: string }
        Returns: string
      }
      delete_league: { Args: { _league_id: string }; Returns: undefined }
      finalize_fantasy_gameweek_v2: {
        Args: {
          _chip_finalize: string
          _expected_version: number
          _gameweek_id: string
          _post_team: Json
          _result: Json
          _season: string
          _team_id: string
        }
        Returns: {
          already_finalized: boolean
          final_points: number
          gameweek_id: string
          result_id: string
          team_id: string
          version: number
        }[]
      }
      finalize_gameweek_result: {
        Args: { _gameweek_id: string; _payload: Json; _team_id: string }
        Returns: string
      }
      get_fantasy_entry_squad: {
        Args: { _entry_id: string; _gameweek?: number }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_moderator: { Args: { _user_id: string }; Returns: boolean }
      is_league_admin: {
        Args: { _league_id: string; _user_id: string }
        Returns: boolean
      }
      is_league_member: {
        Args: { _league_id: string; _user_id: string }
        Returns: boolean
      }
      join_league_by_code: { Args: { _code: string }; Returns: string }
      leave_league: { Args: { _league_id: string }; Returns: undefined }
      save_fantasy_lifecycle: {
        Args: {
          _current_gameweek_id?: string
          _expected_version: number
          _lifecycle: Json
          _team_id: string
        }
        Returns: {
          id: string
          lifecycle_state: Json
          version: number
        }[]
      }
      save_fantasy_team: {
        Args: {
          _bank: number
          _current_gameweek_id: string
          _formation: string
          _manager_name: string
          _squad: Json
          _team_name: string
        }
        Returns: string
      }
      save_fantasy_team_v2: {
        Args: {
          _bank: number
          _current_gameweek_id: string
          _expected_version: number
          _formation: string
          _free_transfers: number
          _lifecycle: Json
          _manager_name: string
          _pending_transfers: number
          _squad: Json
          _team_id: string
          _team_name: string
        }
        Returns: {
          id: string
          updated_at: string
          version: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
