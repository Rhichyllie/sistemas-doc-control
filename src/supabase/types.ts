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
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      disciplines: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string | null
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
          file_name: string | null
          file_path: string | null
          id: string
          received_at: string | null
          revision: string
          status: Database["public"]["Enums"]["doc_status"]
          user_id: string | null
        }
        Insert: {
          comments?: string | null
          created_at?: string
          document_id: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          received_at?: string | null
          revision: string
          status?: Database["public"]["Enums"]["doc_status"]
          user_id?: string | null
        }
        Update: {
          comments?: string | null
          created_at?: string
          document_id?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          received_at?: string | null
          revision?: string
          status?: Database["public"]["Enums"]["doc_status"]
          user_id?: string | null
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
          analysis_deadline: string | null
          analyst_id: string | null
          approved_at: string | null
          code: string
          created_at: string
          created_by: string | null
          current_revision: string
          discipline_id: string | null
          doc_type: string | null
          id: string
          new_revision_received_at: string | null
          origin: Database["public"]["Enums"]["doc_origin"]
          project_id: string
          received_at: string | null
          returned_from_analysis_at: string | null
          sent_to_analysis_at: string | null
          sent_to_designer_at: string | null
          status: Database["public"]["Enums"]["doc_status"]
          title: string
          updated_at: string
        }
        Insert: {
          analysis_deadline?: string | null
          analyst_id?: string | null
          approved_at?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          current_revision?: string
          discipline_id?: string | null
          doc_type?: string | null
          id?: string
          new_revision_received_at?: string | null
          origin?: Database["public"]["Enums"]["doc_origin"]
          project_id: string
          received_at?: string | null
          returned_from_analysis_at?: string | null
          sent_to_analysis_at?: string | null
          sent_to_designer_at?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          title: string
          updated_at?: string
        }
        Update: {
          analysis_deadline?: string | null
          analyst_id?: string | null
          approved_at?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          current_revision?: string
          discipline_id?: string | null
          doc_type?: string | null
          id?: string
          new_revision_received_at?: string | null
          origin?: Database["public"]["Enums"]["doc_origin"]
          project_id?: string
          received_at?: string | null
          returned_from_analysis_at?: string | null
          sent_to_analysis_at?: string | null
          sent_to_designer_at?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          title?: string
          updated_at?: string
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
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          discipline: string | null
          email: string | null
          full_name: string | null
          id: string
          position: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discipline?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          position?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discipline?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          position?: string | null
          updated_at?: string
        }
        Relationships: []
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
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
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
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
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
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "document_controller"
        | "coordinator"
        | "analyzer"
        | "supplier"
        | "client"
      doc_origin: "supplier" | "client" | "internal"
      doc_status:
        | "received"
        | "in_analysis"
        | "awaiting_revision"
        | "approved"
        | "approved_with_comments"
        | "rejected"
        | "cancelled"
      project_status: "planning" | "in_progress" | "completed" | "cancelled"
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
      app_role: [
        "admin",
        "document_controller",
        "coordinator",
        "analyzer",
        "supplier",
        "client",
      ],
      doc_origin: ["supplier", "client", "internal"],
      doc_status: [
        "received",
        "in_analysis",
        "awaiting_revision",
        "approved",
        "approved_with_comments",
        "rejected",
        "cancelled",
      ],
      project_status: ["planning", "in_progress", "completed", "cancelled"],
    },
  },
} as const
