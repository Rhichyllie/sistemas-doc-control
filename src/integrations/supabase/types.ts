export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
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
      approval_comments: {
        Row: {
          attachments: string[] | null
          comment: string
          created_at: string
          id: string
          step_id: string
        }
        Insert: {
          attachments?: string[] | null
          comment: string
          created_at?: string
          id: string
          step_id: string
        }
        Update: {
          attachments?: string[] | null
          comment?: string
          created_at?: string
          id?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_comments_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_flows: {
        Row: {
          created_at: string
          document_id: string | null
          id: string
          revision: string
          status: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          id: string
          revision: string
          status?: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          id?: string
          revision?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_flows_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_history: {
        Row: {
          action: string
          created_at: string
          date: string
          description: string
          document_id: string | null
          id: string
          user: string
        }
        Insert: {
          action: string
          created_at?: string
          date?: string
          description: string
          document_id?: string | null
          id: string
          user: string
        }
        Update: {
          action?: string
          created_at?: string
          date?: string
          description?: string
          document_id?: string | null
          id?: string
          user?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_notifications: {
        Row: {
          id: string
          sent_at: string
          sent_to_email: string
          step_id: string
          type: string
        }
        Insert: {
          id?: string
          sent_at?: string
          sent_to_email: string
          step_id: string
          type?: string
        }
        Update: {
          id?: string
          sent_at?: string
          sent_to_email?: string
          step_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_notifications_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          deadline_days: number
          flow_id: string
          id: string
          responsible: string
          responsible_team_id: string | null
          sector: string
          sequence: number
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deadline_days?: number
          flow_id: string
          id: string
          responsible: string
          responsible_team_id?: string | null
          sector: string
          sequence: number
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deadline_days?: number
          flow_id?: string
          id?: string
          responsible?: string
          responsible_team_id?: string | null
          sector?: string
          sequence?: number
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "approval_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_responsible_team_id_fkey"
            columns: ["responsible_team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplines: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      document_revisions: {
        Row: {
          comments: string | null
          created_at: string
          document_id: string
          file_url: string | null
          id: string
          received_at: string | null
          revision: string
          status: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          document_id: string
          file_url?: string | null
          id?: string
          received_at?: string | null
          revision: string
          status: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          document_id?: string
          file_url?: string | null
          id?: string
          received_at?: string | null
          revision?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_revisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          analysis_days: string | null
          analysis_deadline: string | null
          analysis_returned_at: string | null
          code: string
          created_at: string
          current_revision: string
          discipline_id: string | null
          doc_type: string | null
          id: string
          origin: string
          origin_id: string | null
          project_id: string | null
          projetista_days: string | null
          projetista_deadline: string | null
          received_at: string | null
          responsible_name: string | null
          responsible_sector: string | null
          sent_to_projetista_at: string | null
          status: string
          title: string
        }
        Insert: {
          analysis_days?: string | null
          analysis_deadline?: string | null
          analysis_returned_at?: string | null
          code: string
          created_at?: string
          current_revision?: string
          discipline_id?: string | null
          doc_type?: string | null
          id?: string
          origin?: string
          origin_id?: string | null
          project_id?: string | null
          projetista_days?: string | null
          projetista_deadline?: string | null
          received_at?: string | null
          responsible_name?: string | null
          responsible_sector?: string | null
          sent_to_projetista_at?: string | null
          status?: string
          title: string
        }
        Update: {
          analysis_days?: string | null
          analysis_deadline?: string | null
          analysis_returned_at?: string | null
          code?: string
          created_at?: string
          current_revision?: string
          discipline_id?: string | null
          doc_type?: string | null
          id?: string
          origin?: string
          origin_id?: string | null
          project_id?: string | null
          projetista_days?: string | null
          projetista_deadline?: string | null
          received_at?: string | null
          responsible_name?: string | null
          responsible_sector?: string | null
          sent_to_projetista_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "projetistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_audit_log: {
        Row: {
          action: string
          created_at: string
          document_id: string | null
          flow_id: string
          id: string
          performed_by: string
          reason: string | null
          snapshot: Json
        }
        Insert: {
          action: string
          created_at?: string
          document_id?: string | null
          flow_id: string
          id?: string
          performed_by: string
          reason?: string | null
          snapshot: Json
        }
        Update: {
          action?: string
          created_at?: string
          document_id?: string | null
          flow_id?: string
          id?: string
          performed_by?: string
          reason?: string | null
          snapshot?: Json
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          document_id: string | null
          document_title: string | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          document_title?: string | null
          id?: string
          message: string
          read?: boolean
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          document_title?: string | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client: string | null
          code: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string
        }
        Insert: {
          client?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
        }
        Update: {
          client?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
        }
        Relationships: []
      }
      projetistas: {
        Row: {
          company: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      recent_activities: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          title: string
          type: string
          user_name: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          title: string
          type: string
          user_name?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          title?: string
          type?: string
          user_name?: string | null
        }
        Relationships: []
      }
      team: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          sector: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          sector?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          sector?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      trigger_approval_reminders: { Args: never; Returns: undefined }
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
