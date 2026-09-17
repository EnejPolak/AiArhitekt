export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      project_ai_request_guards: {
        Row: {
          last_started_at: string
          operation: string
          project_id: string
          updated_at: string
        }
        Insert: {
          last_started_at: string
          operation: string
          project_id: string
          updated_at?: string
        }
        Update: {
          last_started_at?: string
          operation?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_ai_request_guards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_product_discoveries: {
        Row: {
          allowlist_domains: Json
          created_at: string
          id: string
          latitude: number
          location_input: string
          longitude: number
          not_searched_count: number
          project_id: string
          radius_km: number
          searched_item_count: number
          source_analysis_id: string
          source_analysis_updated_at: string
          source_preferences: Json
          source_preferences_hash: string
          unmatched_requirements: Json
          updated_at: string
        }
        Insert: {
          allowlist_domains?: Json
          created_at?: string
          id?: string
          latitude: number
          location_input: string
          longitude: number
          not_searched_count: number
          project_id: string
          radius_km: number
          searched_item_count: number
          source_analysis_id: string
          source_analysis_updated_at: string
          source_preferences?: Json
          source_preferences_hash?: string
          unmatched_requirements?: Json
          updated_at?: string
        }
        Update: {
          allowlist_domains?: Json
          created_at?: string
          id?: string
          latitude?: number
          location_input?: string
          longitude?: number
          not_searched_count?: number
          project_id?: string
          radius_km?: number
          searched_item_count?: number
          source_analysis_id?: string
          source_analysis_updated_at?: string
          source_preferences?: Json
          source_preferences_hash?: string
          unmatched_requirements?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_product_discoveries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_product_discoveries_source_analysis_id_fkey"
            columns: ["source_analysis_id"]
            isOneToOne: false
            referencedRelation: "project_room_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      project_product_reference_assets: {
        Row: {
          created_at: string
          height: number | null
          id: string
          is_primary: boolean
          mime_type: string
          project_id: string
          selection_id: string
          size_bytes: number
          sort_order: number
          source_hash: string
          source_image_url: string
          source_page_url: string | null
          storage_bucket: string
          storage_path: string
          updated_at: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          is_primary?: boolean
          mime_type: string
          project_id: string
          selection_id: string
          size_bytes: number
          sort_order?: number
          source_hash: string
          source_image_url: string
          source_page_url?: string | null
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          is_primary?: boolean
          mime_type?: string
          project_id?: string
          selection_id?: string
          size_bytes?: number
          sort_order?: number
          source_hash?: string
          source_image_url?: string
          source_page_url?: string | null
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_product_reference_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_product_reference_assets_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: true
            referencedRelation: "project_product_selections"
            referencedColumns: ["id"]
          },
        ]
      }
      project_product_selections: {
        Row: {
          created_at: string
          currency: string | null
          discovery_id: string
          has_reference_image: boolean
          id: string
          is_confirmed: boolean
          item_spec: string
          price: number | null
          product_image_url: string | null
          product_title: string
          product_url: string
          project_id: string
          requirement_key: string
          requirement_snapshot: Json
          requirement_type: string
          retailer_domain: string
          retailer_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          discovery_id: string
          has_reference_image?: boolean
          id?: string
          is_confirmed?: boolean
          item_spec: string
          price?: number | null
          product_image_url?: string | null
          product_title: string
          product_url: string
          project_id: string
          requirement_key: string
          requirement_snapshot: Json
          requirement_type: string
          retailer_domain: string
          retailer_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          discovery_id?: string
          has_reference_image?: boolean
          id?: string
          is_confirmed?: boolean
          item_spec?: string
          price?: number | null
          product_image_url?: string | null
          product_title?: string
          product_url?: string
          project_id?: string
          requirement_key?: string
          requirement_snapshot?: Json
          requirement_type?: string
          retailer_domain?: string
          retailer_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_product_selections_discovery_id_fkey"
            columns: ["discovery_id"]
            isOneToOne: false
            referencedRelation: "project_product_discoveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_product_selections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_room_analyses: {
        Row: {
          analysis: Json
          created_at: string
          design_requirements: Json
          id: string
          model: string
          project_id: string
          provider: string
          schema_version: number
          source_storage_path: string
          source_upload_id: string
          updated_at: string
        }
        Insert: {
          analysis: Json
          created_at?: string
          design_requirements: Json
          id?: string
          model: string
          project_id: string
          provider: string
          schema_version: number
          source_storage_path: string
          source_upload_id: string
          updated_at?: string
        }
        Update: {
          analysis?: Json
          created_at?: string
          design_requirements?: Json
          id?: string
          model?: string
          project_id?: string
          provider?: string
          schema_version?: number
          source_storage_path?: string
          source_upload_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_room_analyses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_room_analyses_source_upload_id_fkey"
            columns: ["source_upload_id"]
            isOneToOne: false
            referencedRelation: "project_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      project_room_preferences: {
        Row: {
          bed_type: string
          budget_level: string | null
          country_code: string | null
          created_at: string
          flooring: string
          formatted_address: string | null
          keep_existing_walls: boolean
          latitude: number | null
          location_input: string | null
          longitude: number | null
          notes: string
          project_id: string
          radius_km: number | null
          room_type: string | null
          selected_styles: Json
          underfloor_heating: boolean
          updated_at: string
          wall_accent_color: string
          wall_main_color: string
        }
        Insert: {
          bed_type?: string
          budget_level?: string | null
          country_code?: string | null
          created_at?: string
          flooring?: string
          formatted_address?: string | null
          keep_existing_walls?: boolean
          latitude?: number | null
          location_input?: string | null
          longitude?: number | null
          notes?: string
          project_id: string
          radius_km?: number | null
          room_type?: string | null
          selected_styles?: Json
          underfloor_heating?: boolean
          updated_at?: string
          wall_accent_color?: string
          wall_main_color?: string
        }
        Update: {
          bed_type?: string
          budget_level?: string | null
          country_code?: string | null
          created_at?: string
          flooring?: string
          formatted_address?: string | null
          keep_existing_walls?: boolean
          latitude?: number | null
          location_input?: string | null
          longitude?: number | null
          notes?: string
          project_id?: string
          radius_km?: number | null
          room_type?: string | null
          selected_styles?: Json
          underfloor_heating?: boolean
          updated_at?: string
          wall_accent_color?: string
          wall_main_color?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_room_preferences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_room_renders: {
        Row: {
          completed_at: string | null
          created_at: string
          error_code: string | null
          id: string
          model: string
          output_hash: string | null
          output_mime_type: string | null
          output_size_bytes: number | null
          output_storage_bucket: string | null
          output_storage_path: string | null
          project_id: string
          prompt_snapshot: Json
          provider: string
          reference_snapshot: Json
          schema_version: number
          source_analysis_id: string | null
          source_analysis_updated_at: string | null
          source_discovery_id: string | null
          source_fingerprint: string
          source_upload_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          model: string
          output_hash?: string | null
          output_mime_type?: string | null
          output_size_bytes?: number | null
          output_storage_bucket?: string | null
          output_storage_path?: string | null
          project_id: string
          prompt_snapshot?: Json
          provider: string
          reference_snapshot?: Json
          schema_version: number
          source_analysis_id?: string | null
          source_analysis_updated_at?: string | null
          source_discovery_id?: string | null
          source_fingerprint: string
          source_upload_id?: string | null
          started_at?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          model?: string
          output_hash?: string | null
          output_mime_type?: string | null
          output_size_bytes?: number | null
          output_storage_bucket?: string | null
          output_storage_path?: string | null
          project_id?: string
          prompt_snapshot?: Json
          provider?: string
          reference_snapshot?: Json
          schema_version?: number
          source_analysis_id?: string | null
          source_analysis_updated_at?: string | null
          source_discovery_id?: string | null
          source_fingerprint?: string
          source_upload_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_room_renders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_room_renders_source_analysis_id_fkey"
            columns: ["source_analysis_id"]
            isOneToOne: false
            referencedRelation: "project_room_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_room_renders_source_discovery_id_fkey"
            columns: ["source_discovery_id"]
            isOneToOne: false
            referencedRelation: "project_product_discoveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_room_renders_source_upload_id_fkey"
            columns: ["source_upload_id"]
            isOneToOne: false
            referencedRelation: "project_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      project_uploads: {
        Row: {
          created_at: string
          id: string
          kind: string
          mime_type: string
          original_filename: string
          project_id: string
          size_bytes: number
          storage_bucket: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          mime_type: string
          original_filename: string
          project_id: string
          size_bytes: number
          storage_bucket?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string
          original_filename?: string
          project_id?: string
          size_bytes?: number
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_uploads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          created_at: string
          current_step_key: string
          flow_version: number
          id: string
          name: string
          project_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          current_step_key?: string
          flow_version?: number
          id?: string
          name: string
          project_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          current_step_key?: string
          flow_version?: number
          id?: string
          name?: string
          project_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_product_discovery_slot: {
        Args: { p_project_id: string }
        Returns: Json
      }
      claim_room_analysis_slot: {
        Args: { p_project_id: string }
        Returns: Json
      }
      claim_room_render_slot: { Args: { p_project_id: string }; Returns: Json }
      complete_project_room_render: {
        Args: {
          p_output_hash: string
          p_output_mime_type: string
          p_output_size_bytes: number
          p_output_storage_path: string
          p_owner_user_id: string
          p_project_id: string
          p_render_id: string
        }
        Returns: string
      }
      fail_project_room_render: {
        Args: {
          p_error_code: string
          p_owner_user_id: string
          p_project_id: string
          p_render_id: string
        }
        Returns: string
      }
      insert_project_room_render_processing: {
        Args: {
          p_model: string
          p_owner_user_id: string
          p_project_id: string
          p_prompt_snapshot: Json
          p_provider: string
          p_reference_snapshot: Json
          p_schema_version: number
          p_source_analysis_id: string
          p_source_analysis_updated_at: string
          p_source_discovery_id: string
          p_source_fingerprint: string
          p_source_upload_id: string
        }
        Returns: Json
      }
      is_owned_project_asset_path: {
        Args: { object_name: string }
        Returns: boolean
      }
      is_owned_project_upload_path: {
        Args: { object_name: string }
        Returns: boolean
      }
      project_room_preference_styles_valid: {
        Args: { styles: Json }
        Returns: boolean
      }
      replace_project_product_discovery_result: {
        Args: {
          p_discovery: Json
          p_owner_user_id: string
          p_project_id: string
          p_selections: Json
        }
        Returns: string
      }
      upsert_project_product_reference_asset: {
        Args: {
          p_height: number | null
          p_is_primary?: boolean
          p_mime_type: string
          p_owner_user_id: string
          p_project_id: string
          p_selection_id: string
          p_size_bytes: number
          p_sort_order?: number
          p_source_hash: string
          p_source_image_url: string
          p_source_page_url?: string | null
          p_storage_path: string
          p_width: number | null
        }
        Returns: string
      }
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

