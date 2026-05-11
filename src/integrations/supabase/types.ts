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
      briefings: {
        Row: {
          content: string
          created_at: string
          date: string
          workout: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          date: string
          workout?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          date?: string
          workout?: Json | null
        }
        Relationships: []
      }
      coach_plan: {
        Row: {
          acwr: number | null
          acwr_zone: string | null
          based_on_run: Json | null
          commentary: string
          computed_at: string
          id: number
          plan: Json
        }
        Insert: {
          acwr?: number | null
          acwr_zone?: string | null
          based_on_run?: Json | null
          commentary: string
          computed_at?: string
          id?: number
          plan: Json
        }
        Update: {
          acwr?: number | null
          acwr_zone?: string | null
          based_on_run?: Json | null
          commentary?: string
          computed_at?: string
          id?: number
          plan?: Json
        }
        Relationships: []
      }
      pace_dna: {
        Row: {
          computed_at: string
          id: number
          insights: Json
        }
        Insert: {
          computed_at?: string
          id?: number
          insights: Json
        }
        Update: {
          computed_at?: string
          id?: number
          insights?: Json
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
        }
        Relationships: []
      }
      race_goal: {
        Row: {
          created_at: string
          distance_km: number
          goal_pace_sec: number
          id: string
          is_active: boolean
          name: string
          race_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          distance_km: number
          goal_pace_sec: number
          id?: string
          is_active?: boolean
          name: string
          race_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          distance_km?: number
          goal_pace_sec?: number
          id?: string
          is_active?: boolean
          name?: string
          race_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      strava_activities: {
        Row: {
          average_heartrate: number | null
          average_speed: number | null
          created_at: string
          detail_fetched_at: string | null
          distance: number
          elapsed_time: number | null
          id: number
          max_heartrate: number | null
          moving_time: number
          name: string
          raw: Json | null
          splits: Json | null
          sport_type: string | null
          start_date: string
          start_date_local: string | null
          total_elevation_gain: number | null
          type: string | null
        }
        Insert: {
          average_heartrate?: number | null
          average_speed?: number | null
          created_at?: string
          detail_fetched_at?: string | null
          distance: number
          elapsed_time?: number | null
          id: number
          max_heartrate?: number | null
          moving_time: number
          name: string
          raw?: Json | null
          splits?: Json | null
          sport_type?: string | null
          start_date: string
          start_date_local?: string | null
          total_elevation_gain?: number | null
          type?: string | null
        }
        Update: {
          average_heartrate?: number | null
          average_speed?: number | null
          created_at?: string
          detail_fetched_at?: string | null
          distance?: number
          elapsed_time?: number | null
          id?: number
          max_heartrate?: number | null
          moving_time?: number
          name?: string
          raw?: Json | null
          splits?: Json | null
          sport_type?: string | null
          start_date?: string
          start_date_local?: string | null
          total_elevation_gain?: number | null
          type?: string | null
        }
        Relationships: []
      }
      strava_sync: {
        Row: {
          id: number
          last_activity_id: number | null
          last_event_at: string | null
          subscription_id: number | null
        }
        Insert: {
          id?: number
          last_activity_id?: number | null
          last_event_at?: string | null
          subscription_id?: number | null
        }
        Update: {
          id?: number
          last_activity_id?: number | null
          last_event_at?: string | null
          subscription_id?: number | null
        }
        Relationships: []
      }
      strava_tokens: {
        Row: {
          access_token: string
          athlete_id: number | null
          expires_at: number
          id: number
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_token: string
          athlete_id?: number | null
          expires_at: number
          id?: number
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          athlete_id?: number | null
          expires_at?: number
          id?: number
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_load: {
        Row: {
          atl: number
          ctl: number
          daily_tss: number
          date: string
          tsb: number
          updated_at: string
        }
        Insert: {
          atl?: number
          ctl?: number
          daily_tss?: number
          date: string
          tsb?: number
          updated_at?: string
        }
        Update: {
          atl?: number
          ctl?: number
          daily_tss?: number
          date?: string
          tsb?: number
          updated_at?: string
        }
        Relationships: []
      }
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
  public: {
    Enums: {},
  },
} as const
