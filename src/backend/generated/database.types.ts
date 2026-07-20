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
      [_ in never]: never
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
      cancel_account_deletion: { Args: never; Returns: boolean }
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
      record_session_revocation: { Args: { scope: string }; Returns: undefined }
      request_account_deletion: { Args: never; Returns: string }
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
            foreignKeyName: "followed_teams_user_id_fkey"
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
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
      language_code: "fr" | "ar"
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
      language_code: ["fr", "ar"],
    },
  },
  public: {
    Enums: {},
  },
} as const
