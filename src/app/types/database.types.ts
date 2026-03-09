export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      check_responses: {
        Row: {
          check_id: string
          created_at: string | null
          id: string
          response: string
          user_id: string
        }
        Insert: {
          check_id: string
          created_at?: string | null
          id?: string
          response: string
          user_id: string
        }
        Update: {
          check_id?: string
          created_at?: string | null
          id?: string
          response?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_responses_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "interest_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_pool: {
        Row: {
          event_id: string
          id: string
          joined_at: string | null
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          joined_at?: string | null
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          joined_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_pool_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_pool_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string | null
          date_display: string | null
          dice_url: string | null
          id: string
          ig_handle: string | null
          ig_url: string | null
          image_url: string | null
          is_public: boolean | null
          letterboxd_url: string | null
          neighborhood: string | null
          time_display: string | null
          title: string
          venue: string | null
          vibes: string[] | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          date_display?: string | null
          dice_url?: string | null
          id?: string
          ig_handle?: string | null
          ig_url?: string | null
          image_url?: string | null
          is_public?: boolean | null
          letterboxd_url?: string | null
          neighborhood?: string | null
          time_display?: string | null
          title: string
          venue?: string | null
          vibes?: string[] | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          date_display?: string | null
          dice_url?: string | null
          id?: string
          ig_handle?: string | null
          ig_url?: string | null
          image_url?: string | null
          is_public?: boolean | null
          letterboxd_url?: string | null
          neighborhood?: string | null
          time_display?: string | null
          title?: string
          venue?: string | null
          vibes?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string | null
          id: string
          requester_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          addressee_id: string
          created_at?: string | null
          id?: string
          requester_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          addressee_id?: string
          created_at?: string | null
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_checks: {
        Row: {
          check_id: string
          hidden_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          check_id: string
          hidden_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          check_id?: string
          hidden_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_checks_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "interest_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_checks: {
        Row: {
          author_id: string
          created_at: string | null
          event_date: string | null
          event_time: string | null
          expires_at: string | null
          id: string
          letterboxd_url: string | null
          max_squad_size: number
          movie_metadata: Json | null
          text: string
        }
        Insert: {
          author_id: string
          created_at?: string | null
          event_date?: string | null
          event_time?: string | null
          expires_at?: string | null
          id?: string
          letterboxd_url?: string | null
          max_squad_size?: number
          movie_metadata?: Json | null
          text: string
        }
        Update: {
          author_id?: string
          created_at?: string | null
          event_date?: string | null
          event_time?: string | null
          expires_at?: string | null
          id?: string
          letterboxd_url?: string | null
          max_squad_size?: number
          movie_metadata?: Json | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "interest_checks_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string | null
          id: string
          is_system: boolean | null
          sender_id: string | null
          squad_id: string
          text: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          sender_id?: string | null
          squad_id: string
          text: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          sender_id?: string | null
          squad_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          related_check_id: string | null
          related_squad_id: string | null
          related_user_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          related_check_id?: string | null
          related_squad_id?: string | null
          related_user_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          related_check_id?: string | null
          related_squad_id?: string | null
          related_user_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_check_id_fkey"
            columns: ["related_check_id"]
            isOneToOne: false
            referencedRelation: "interest_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_squad_id_fkey"
            columns: ["related_squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      profiles: {
        Row: {
          availability: string | null
          avatar_letter: string | null
          avatar_url: string | null
          created_at: string | null
          display_name: string
          id: string
          ig_handle: string | null
          is_test: boolean
          onboarded: boolean | null
          updated_at: string | null
          username: string
        }
        Insert: {
          availability?: string | null
          avatar_letter?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name: string
          id: string
          ig_handle?: string | null
          is_test?: boolean
          onboarded?: boolean | null
          updated_at?: string | null
          username: string
        }
        Update: {
          availability?: string | null
          avatar_letter?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          ig_handle?: string | null
          is_test?: boolean
          onboarded?: boolean | null
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      push_logs: {
        Row: {
          created_at: string | null
          endpoint: string
          error: string | null
          id: string
          notification_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          error?: string | null
          id?: string
          notification_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          error?: string | null
          id?: string
          notification_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_logs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_events: {
        Row: {
          event_id: string
          id: string
          is_down: boolean | null
          saved_at: string | null
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          is_down?: boolean | null
          saved_at?: string | null
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          is_down?: boolean | null
          saved_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_members: {
        Row: {
          id: string
          joined_at: string | null
          squad_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          squad_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          squad_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_members_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      squads: {
        Row: {
          archived_at: string | null
          arrival_time: string | null
          check_id: string | null
          created_at: string | null
          created_by: string
          event_id: string | null
          expires_at: string | null
          grace_started_at: string | null
          id: string
          locked_date: string | null
          meeting_spot: string | null
          name: string
          transport_notes: string | null
          warned_at: string | null
        }
        Insert: {
          archived_at?: string | null
          arrival_time?: string | null
          check_id?: string | null
          created_at?: string | null
          created_by: string
          event_id?: string | null
          expires_at?: string | null
          grace_started_at?: string | null
          id?: string
          locked_date?: string | null
          meeting_spot?: string | null
          name: string
          transport_notes?: string | null
          warned_at?: string | null
        }
        Update: {
          archived_at?: string | null
          arrival_time?: string | null
          check_id?: string | null
          created_at?: string | null
          created_by?: string
          event_id?: string | null
          expires_at?: string | null
          grace_started_at?: string | null
          id?: string
          locked_date?: string | null
          meeting_spot?: string | null
          name?: string
          transport_notes?: string | null
          warned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "squads_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "interest_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_fof_check_annotations: {
        Args: never
        Returns: {
          check_id: string
          via_friend_name: string
        }[]
      }
      is_friend_or_fof: {
        Args: { p_author: string; p_viewer: string }
        Returns: boolean
      }
      is_squad_member: {
        Args: { p_squad_id: string; p_user_id: string }
        Returns: boolean
      }
      process_squad_expiry: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

