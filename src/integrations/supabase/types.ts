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
      areas: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_activity_log: {
        Row: {
          action_by_user_id: string
          action_type: string
          created_at: string
          id: string
          note: string | null
          weekly_report_id: string
        }
        Insert: {
          action_by_user_id: string
          action_type: string
          created_at?: string
          id?: string
          note?: string | null
          weekly_report_id: string
        }
        Update: {
          action_by_user_id?: string
          action_type?: string
          created_at?: string
          id?: string
          note?: string | null
          weekly_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_activity_log_action_by_user_id_fkey"
            columns: ["action_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_activity_log_weekly_report_id_fkey"
            columns: ["weekly_report_id"]
            isOneToOne: false
            referencedRelation: "reports_pending_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_activity_log_weekly_report_id_fkey"
            columns: ["weekly_report_id"]
            isOneToOne: false
            referencedRelation: "reports_pending_submission"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_activity_log_weekly_report_id_fkey"
            columns: ["weekly_report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          area_id: string | null
          area_manager_id: string | null
          commission_rate: number
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          area_manager_id?: string | null
          commission_rate?: number
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          area_manager_id?: string | null
          commission_rate?: number
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_area_manager_id_fkey"
            columns: ["area_manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_report_jobs: {
        Row: {
          address: string | null
          amount_before_parts: number
          base_amount: number
          base_for_split: number
          card_amount: number
          card_fee_amount: number
          card_fee_base: number
          card_fee_rate: number
          card_tip_amount: number
          cash_amount: number
          cash_tip_amount: number
          commission_rate: number
          company_70: number
          company_cash: number
          company_parts: number
          company_total: number
          created_at: string
          customer_name: string | null
          id: string
          job_after_fee: number
          job_balance: number
          job_date: string
          my_parts: number
          notes: string | null
          payment_type: Database["public"]["Enums"]["payment_type"]
          source_text: string | null
          tech_30: number
          tech_cash: number
          tech_payout: number
          tip_amount: number
          tip_net: number
          tip_type: Database["public"]["Enums"]["tip_type"]
          total_job: number
          updated_at: string
          weekly_report_id: string
        }
        Insert: {
          address?: string | null
          amount_before_parts?: number
          base_amount?: number
          base_for_split?: number
          card_amount?: number
          card_fee_amount?: number
          card_fee_base?: number
          card_fee_rate?: number
          card_tip_amount?: number
          cash_amount?: number
          cash_tip_amount?: number
          commission_rate?: number
          company_70?: number
          company_cash?: number
          company_parts?: number
          company_total?: number
          created_at?: string
          customer_name?: string | null
          id?: string
          job_after_fee?: number
          job_balance?: number
          job_date: string
          my_parts?: number
          notes?: string | null
          payment_type: Database["public"]["Enums"]["payment_type"]
          source_text?: string | null
          tech_30?: number
          tech_cash?: number
          tech_payout?: number
          tip_amount?: number
          tip_net?: number
          tip_type?: Database["public"]["Enums"]["tip_type"]
          total_job?: number
          updated_at?: string
          weekly_report_id: string
        }
        Update: {
          address?: string | null
          amount_before_parts?: number
          base_amount?: number
          base_for_split?: number
          card_amount?: number
          card_fee_amount?: number
          card_fee_base?: number
          card_fee_rate?: number
          card_tip_amount?: number
          cash_amount?: number
          cash_tip_amount?: number
          commission_rate?: number
          company_70?: number
          company_cash?: number
          company_parts?: number
          company_total?: number
          created_at?: string
          customer_name?: string | null
          id?: string
          job_after_fee?: number
          job_balance?: number
          job_date?: string
          my_parts?: number
          notes?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type"]
          source_text?: string | null
          tech_30?: number
          tech_cash?: number
          tech_payout?: number
          tip_amount?: number
          tip_net?: number
          tip_type?: Database["public"]["Enums"]["tip_type"]
          total_job?: number
          updated_at?: string
          weekly_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_jobs_weekly_report_id_fkey"
            columns: ["weekly_report_id"]
            isOneToOne: false
            referencedRelation: "reports_pending_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_report_jobs_weekly_report_id_fkey"
            columns: ["weekly_report_id"]
            isOneToOne: false
            referencedRelation: "reports_pending_submission"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_report_jobs_weekly_report_id_fkey"
            columns: ["weekly_report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reports: {
        Row: {
          amount_transferred: number
          approved_at: string | null
          area_id: string
          balance_direction: string
          balance_payment_status: string
          commission_rate: number
          company_cash_collected: number
          created_at: string
          id: string
          manager_note: string | null
          net_balance: number
          opens_at: string | null
          payment_note: string | null
          payment_sent_at: string | null
          report_sent_at: string | null
          report_sent_by_user_id: string | null
          report_sent_to_technician: boolean
          returned_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          tech_cash_collected: number
          tech_gross_payout: number
          tech_net_profit: number
          technician_id: string
          total_card_amount: number
          total_card_fee: number
          total_card_tip_amount: number
          total_cash_amount: number
          total_cash_tip_amount: number
          total_company_70: number
          total_company_parts: number
          total_my_parts: number
          total_sales: number
          total_tech_30: number
          total_tips: number
          under_review_at: string | null
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          amount_transferred?: number
          approved_at?: string | null
          area_id: string
          balance_direction?: string
          balance_payment_status?: string
          commission_rate?: number
          company_cash_collected?: number
          created_at?: string
          id?: string
          manager_note?: string | null
          net_balance?: number
          opens_at?: string | null
          payment_note?: string | null
          payment_sent_at?: string | null
          report_sent_at?: string | null
          report_sent_by_user_id?: string | null
          report_sent_to_technician?: boolean
          returned_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          tech_cash_collected?: number
          tech_gross_payout?: number
          tech_net_profit?: number
          technician_id: string
          total_card_amount?: number
          total_card_fee?: number
          total_card_tip_amount?: number
          total_cash_amount?: number
          total_cash_tip_amount?: number
          total_company_70?: number
          total_company_parts?: number
          total_my_parts?: number
          total_sales?: number
          total_tech_30?: number
          total_tips?: number
          under_review_at?: string | null
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          amount_transferred?: number
          approved_at?: string | null
          area_id?: string
          balance_direction?: string
          balance_payment_status?: string
          commission_rate?: number
          company_cash_collected?: number
          created_at?: string
          id?: string
          manager_note?: string | null
          net_balance?: number
          opens_at?: string | null
          payment_note?: string | null
          payment_sent_at?: string | null
          report_sent_at?: string | null
          report_sent_by_user_id?: string | null
          report_sent_to_technician?: boolean
          returned_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          tech_cash_collected?: number
          tech_gross_payout?: number
          tech_net_profit?: number
          technician_id?: string
          total_card_amount?: number
          total_card_fee?: number
          total_card_tip_amount?: number
          total_cash_amount?: number
          total_cash_tip_amount?: number
          total_company_70?: number
          total_company_parts?: number
          total_my_parts?: number
          total_sales?: number
          total_tech_30?: number
          total_tips?: number
          under_review_at?: string | null
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_report_sent_by_user_id_fkey"
            columns: ["report_sent_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      reports_pending_review: {
        Row: {
          area_id: string | null
          id: string | null
          status: Database["public"]["Enums"]["report_status"] | null
          submitted_at: string | null
          technician_id: string | null
          week_end: string | null
          week_start: string | null
        }
        Insert: {
          area_id?: string | null
          id?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          submitted_at?: string | null
          technician_id?: string | null
          week_end?: string | null
          week_start?: string | null
        }
        Update: {
          area_id?: string | null
          id?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          submitted_at?: string | null
          technician_id?: string | null
          week_end?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports_pending_submission: {
        Row: {
          area_id: string | null
          id: string | null
          opens_at: string | null
          status: Database["public"]["Enums"]["report_status"] | null
          technician_id: string | null
          week_end: string | null
          week_start: string | null
        }
        Insert: {
          area_id?: string | null
          id?: string | null
          opens_at?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          technician_id?: string | null
          week_end?: string | null
          week_start?: string | null
        }
        Update: {
          area_id?: string | null
          id?: string | null
          opens_at?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          technician_id?: string | null
          week_end?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      is_area_manager: { Args: { _user_id: string }; Returns: boolean }
      is_management: { Args: { _user_id: string }; Returns: boolean }
      is_technician: { Args: { _user_id: string }; Returns: boolean }
      manages_technician: {
        Args: { _manager_id: string; _tech_id: string }
        Returns: boolean
      }
      open_weekly_reports_for_previous_week: {
        Args: never
        Returns: {
          created_report_id: string
          technician_id: string
          week_end: string
          week_start: string
        }[]
      }
      previous_chicago_work_week: {
        Args: { _now?: string }
        Returns: {
          week_end: string
          week_start: string
        }[]
      }
      recalc_weekly_report_totals: {
        Args: { _report_id: string }
        Returns: undefined
      }
      validate_report_for_submission: {
        Args: { _report_id: string }
        Returns: string[]
      }
    }
    Enums: {
      app_role: "technician" | "management" | "area_manager" | "office_staff"
      payment_type: "Card" | "Cash" | "Split"
      report_status:
        | "Draft"
        | "Submitted"
        | "Under Review"
        | "Returned"
        | "Approved"
      tip_type: "Cash" | "Card" | "None"
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
    Enums: {
      app_role: ["technician", "management", "area_manager", "office_staff"],
      payment_type: ["Card", "Cash", "Split"],
      report_status: [
        "Draft",
        "Submitted",
        "Under Review",
        "Returned",
        "Approved",
      ],
      tip_type: ["Cash", "Card", "None"],
    },
  },
} as const
