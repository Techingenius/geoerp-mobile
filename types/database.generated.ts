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
    PostgrestVersion: "14.1"
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
      asset_expenses: {
        Row: {
          amount: number
          asset_id: string
          category: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          expense_date: string
          hours_reading: number | null
          id: string
          invoice_number: string | null
          maintenance_record_id: string | null
          odometer_reading: number | null
          organization_id: string
          project_id: string | null
          receipt_photo_url: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          asset_id: string
          category: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          expense_date: string
          hours_reading?: number | null
          id?: string
          invoice_number?: string | null
          maintenance_record_id?: string | null
          odometer_reading?: number | null
          organization_id: string
          project_id?: string | null
          receipt_photo_url?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          asset_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          expense_date?: string
          hours_reading?: number | null
          id?: string
          invoice_number?: string | null
          maintenance_record_id?: string | null
          odometer_reading?: number | null
          organization_id?: string
          project_id?: string | null
          receipt_photo_url?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_expenses_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_expenses_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_maintenance_config: {
        Row: {
          asset_id: string
          created_at: string
          custom_interval_days: number | null
          custom_interval_hours: number | null
          custom_interval_km: number | null
          id: string
          is_enabled: boolean
          maintenance_type_id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          custom_interval_days?: number | null
          custom_interval_hours?: number | null
          custom_interval_km?: number | null
          id?: string
          is_enabled?: boolean
          maintenance_type_id: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          custom_interval_days?: number | null
          custom_interval_hours?: number | null
          custom_interval_km?: number | null
          id?: string
          is_enabled?: boolean
          maintenance_type_id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_maintenance_config_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenance_config_maintenance_type_id_fkey"
            columns: ["maintenance_type_id"]
            isOneToOne: false
            referencedRelation: "maintenance_types"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_parts: {
        Row: {
          applicable_asset_types: string[]
          avg_cost: number | null
          avg_lifespan_days: number | null
          category: string
          created_at: string
          id: string
          name: string
          notes: string | null
          organization_id: string
          part_number: string | null
          updated_at: string
        }
        Insert: {
          applicable_asset_types: string[]
          avg_cost?: number | null
          avg_lifespan_days?: number | null
          category?: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          part_number?: string | null
          updated_at?: string
        }
        Update: {
          applicable_asset_types?: string[]
          avg_cost?: number | null
          avg_lifespan_days?: number | null
          category?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          part_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_parts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_type: string
          assigned_crew_id: string | null
          assigned_project_id: string | null
          created_at: string
          created_by: string | null
          id: string
          identifier: string
          inspection_expiry: string | null
          insurance_expiry: string | null
          license_plate: string | null
          make: string | null
          model: string | null
          name: string
          notes: string | null
          organization_id: string
          photo_url: string | null
          purchase_cost: number | null
          purchase_date: string | null
          serial_number: string | null
          status: string
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          asset_type: string
          assigned_crew_id?: string | null
          assigned_project_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          identifier: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          name: string
          notes?: string | null
          organization_id: string
          photo_url?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          asset_type?: string
          assigned_crew_id?: string | null
          assigned_project_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          identifier?: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          photo_url?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_assigned_crew_id_fkey"
            columns: ["assigned_crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_assigned_project_id_fkey"
            columns: ["assigned_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          roles: string[]
          title: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          roles?: string[]
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          roles?: string[]
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          billing_address_line1: string | null
          billing_address_line2: string | null
          billing_city: string | null
          billing_state: string | null
          billing_zip: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          payment_terms_days: number | null
          payment_terms_notes: string | null
          phone: string | null
          settings: Json | null
          short_name: string | null
          status: string
          tax_id: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_state?: string | null
          billing_zip?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          payment_terms_days?: number | null
          payment_terms_notes?: string | null
          phone?: string | null
          settings?: Json | null
          short_name?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_state?: string | null
          billing_zip?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          payment_terms_days?: number | null
          payment_terms_notes?: string | null
          phone?: string | null
          settings?: Json | null
          short_name?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_default_members: {
        Row: {
          created_at: string | null
          crew_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          crew_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          crew_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_default_members_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_default_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members: {
        Row: {
          created_at: string | null
          id: string
          production_entry_id: string
          rate_applied: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          production_entry_id: string
          rate_applied?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          production_entry_id?: string
          rate_applied?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_production_entry_id_fkey"
            columns: ["production_entry_id"]
            isOneToOne: false
            referencedRelation: "production_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          lead_user_id: string | null
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          lead_user_id?: string | null
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          lead_user_id?: string | null
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crews_lead_user_id_fkey"
            columns: ["lead_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          damage_id: string
          filename: string
          id: string
          location: unknown
          storage_path: string
          taken_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          damage_id: string
          filename: string
          id?: string
          location?: unknown
          storage_path: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          damage_id?: string
          filename?: string
          id?: string
          location?: unknown
          storage_path?: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_photos_damage_id_fkey"
            columns: ["damage_id"]
            isOneToOne: false
            referencedRelation: "pre_existing_damages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drill_authorizations: {
        Row: {
          approved_by: string | null
          created_at: string | null
          id: string
          line_segment_id: string
          request_notes: string | null
          requested_at: string
          requested_by: string
          responded_at: string | null
          response_notes: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          id?: string
          line_segment_id: string
          request_notes?: string | null
          requested_at?: string
          requested_by: string
          responded_at?: string | null
          response_notes?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          id?: string
          line_segment_id?: string
          request_notes?: string | null
          requested_at?: string
          requested_by?: string
          responded_at?: string | null
          response_notes?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drill_authorizations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drill_authorizations_line_segment_id_fkey"
            columns: ["line_segment_id"]
            isOneToOne: false
            referencedRelation: "line_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drill_authorizations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category_id: string
          created_at: string
          created_by: string | null
          description: string
          expense_date: string
          id: string
          organization_id: string
          paid_at: string | null
          project_id: string | null
          receipt_filename: string | null
          receipt_storage_path: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          description: string
          expense_date: string
          id?: string
          organization_id: string
          paid_at?: string | null
          project_id?: string | null
          receipt_filename?: string | null
          receipt_storage_path?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          expense_date?: string
          id?: string
          organization_id?: string
          paid_at?: string | null
          project_id?: string | null
          receipt_filename?: string | null
          receipt_storage_path?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_photos: {
        Row: {
          caption: string | null
          created_at: string
          filename: string
          id: string
          incident_id: string
          location: unknown
          storage_path: string
          taken_at: string | null
          uploaded_by: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          filename: string
          id?: string
          incident_id: string
          location?: unknown
          storage_path: string
          taken_at?: string | null
          uploaded_by: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          filename?: string
          id?: string
          incident_id?: string
          location?: unknown
          storage_path?: string
          taken_at?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_photos_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          caused_by: string | null
          created_at: string
          description: string
          id: string
          incident_type: string
          line_segment_id: string | null
          location: unknown
          project_id: string
          reported_at: string
          reported_by: string
          resolution_notes: string | null
          resolved_at: string | null
          service_id: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          caused_by?: string | null
          created_at?: string
          description: string
          id?: string
          incident_type: string
          line_segment_id?: string | null
          location?: unknown
          project_id: string
          reported_at?: string
          reported_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          service_id?: string | null
          severity?: string
          updated_at?: string
        }
        Update: {
          caused_by?: string | null
          created_at?: string
          description?: string
          id?: string
          incident_type?: string
          line_segment_id?: string | null
          location?: unknown
          project_id?: string
          reported_at?: string
          reported_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          service_id?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_caused_by_fkey"
            columns: ["caused_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_line_segment_id_fkey"
            columns: ["line_segment_id"]
            isOneToOne: false
            referencedRelation: "line_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      line_segments: {
        Row: {
          auto_generated: boolean
          created_at: string | null
          created_by: string | null
          description: string | null
          geometry: unknown
          id: string
          name: string
          project_id: string | null
          properties: Json | null
          source_service_a_id: string | null
          source_service_b_id: string | null
          ticket_number: string | null
          updated_at: string | null
        }
        Insert: {
          auto_generated?: boolean
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          geometry: unknown
          id?: string
          name: string
          project_id?: string | null
          properties?: Json | null
          source_service_a_id?: string | null
          source_service_b_id?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_generated?: boolean
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          geometry?: unknown
          id?: string
          name?: string
          project_id?: string | null
          properties?: Json | null
          source_service_a_id?: string | null
          source_service_b_id?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "line_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_segments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_segments_source_service_a_id_fkey"
            columns: ["source_service_a_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_segments_source_service_b_id_fkey"
            columns: ["source_service_b_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          asset_id: string
          created_at: string
          due_date: string
          due_km: number | null
          id: string
          last_maintenance_id: string | null
          maintenance_type_id: string
          organization_id: string
          resolved_at: string | null
          resolved_by_maintenance_id: string | null
          severity: string
          snoozed_until: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          asset_id: string
          created_at?: string
          due_date: string
          due_km?: number | null
          id?: string
          last_maintenance_id?: string | null
          maintenance_type_id: string
          organization_id: string
          resolved_at?: string | null
          resolved_by_maintenance_id?: string | null
          severity?: string
          snoozed_until?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          asset_id?: string
          created_at?: string
          due_date?: string
          due_km?: number | null
          id?: string
          last_maintenance_id?: string | null
          maintenance_type_id?: string
          organization_id?: string
          resolved_at?: string | null
          resolved_by_maintenance_id?: string | null
          severity?: string
          snoozed_until?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_alerts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_alerts_last_maintenance_id_fkey"
            columns: ["last_maintenance_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_alerts_maintenance_type_id_fkey"
            columns: ["maintenance_type_id"]
            isOneToOne: false
            referencedRelation: "maintenance_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_alerts_resolved_by_maintenance_id_fkey"
            columns: ["resolved_by_maintenance_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          maintenance_record_id: string
          photo_url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          maintenance_record_id: string
          photo_url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          maintenance_record_id?: string
          photo_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_photos_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_records: {
        Row: {
          asset_id: string
          cost: number | null
          created_at: string
          created_by: string | null
          hours_reading: number | null
          id: string
          location: string | null
          maintenance_type_id: string
          next_due_date: string | null
          next_due_hours: number | null
          next_due_km: number | null
          notes: string | null
          odometer_reading: number | null
          organization_id: string
          performed_at: string
          performed_by: string
          status: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          hours_reading?: number | null
          id?: string
          location?: string | null
          maintenance_type_id: string
          next_due_date?: string | null
          next_due_hours?: number | null
          next_due_km?: number | null
          notes?: string | null
          odometer_reading?: number | null
          organization_id: string
          performed_at: string
          performed_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          hours_reading?: number | null
          id?: string
          location?: string | null
          maintenance_type_id?: string
          next_due_date?: string | null
          next_due_hours?: number | null
          next_due_km?: number | null
          notes?: string | null
          odometer_reading?: number | null
          organization_id?: string
          performed_at?: string
          performed_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_maintenance_type_id_fkey"
            columns: ["maintenance_type_id"]
            isOneToOne: false
            referencedRelation: "maintenance_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_types: {
        Row: {
          alert_lead_days: number | null
          applicable_asset_types: string[]
          created_at: string
          default_interval_days: number | null
          default_interval_hours: number | null
          default_interval_km: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          alert_lead_days?: number | null
          applicable_asset_types?: string[]
          created_at?: string
          default_interval_days?: number | null
          default_interval_hours?: number | null
          default_interval_km?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          alert_lead_days?: number | null
          applicable_asset_types?: string[]
          created_at?: string
          default_interval_days?: number | null
          default_interval_hours?: number | null
          default_interval_km?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      part_replacement_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          photo_url: string
          replacement_id: string
          type: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          photo_url: string
          replacement_id: string
          type?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          photo_url?: string
          replacement_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_replacement_photos_replacement_id_fkey"
            columns: ["replacement_id"]
            isOneToOne: false
            referencedRelation: "part_replacements"
            referencedColumns: ["id"]
          },
        ]
      }
      part_replacements: {
        Row: {
          asset_id: string
          cost: number | null
          created_at: string
          created_by: string | null
          id: string
          invoice_number: string | null
          maintenance_record_id: string | null
          notes: string | null
          old_part_condition: string | null
          organization_id: string
          part_id: string | null
          part_name: string
          reason: string
          replaced_at: string
          replaced_by: string
          supplier: string | null
          updated_at: string
          warranty_until: string | null
        }
        Insert: {
          asset_id: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_number?: string | null
          maintenance_record_id?: string | null
          notes?: string | null
          old_part_condition?: string | null
          organization_id: string
          part_id?: string | null
          part_name: string
          reason?: string
          replaced_at: string
          replaced_by: string
          supplier?: string | null
          updated_at?: string
          warranty_until?: string | null
        }
        Update: {
          asset_id?: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_number?: string | null
          maintenance_record_id?: string | null
          notes?: string | null
          old_part_condition?: string | null
          organization_id?: string
          part_id?: string | null
          part_name?: string
          reason?: string
          replaced_at?: string
          replaced_by?: string
          supplier?: string | null
          updated_at?: string
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_replacements_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_replacements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_replacements_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_replacements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_replacements_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "asset_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_advances: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          deducted_at: string | null
          deducted_from_payroll_date: string | null
          id: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          paid_by: string | null
          reason: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_at: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deducted_at?: string | null
          deducted_from_payroll_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          paid_by?: string | null
          reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deducted_at?: string | null
          deducted_from_payroll_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          paid_by?: string | null
          reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_advances_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_advances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_advances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_advances_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_advances_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_advances_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      points: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          geometry: unknown
          id: string
          name: string
          point_type: string
          project_id: string | null
          properties: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          geometry: unknown
          id?: string
          name: string
          point_type: string
          project_id?: string | null
          properties?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          geometry?: unknown
          id?: string
          name?: string
          point_type?: string
          project_id?: string | null
          properties?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "points_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_existing_damages: {
        Row: {
          created_at: string | null
          damage_type: string
          description: string | null
          geometry: unknown
          id: string
          project_id: string
          reported_at: string | null
          reported_by: string | null
          segment_id: string | null
          severity: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          damage_type: string
          description?: string | null
          geometry: unknown
          id?: string
          project_id: string
          reported_at?: string | null
          reported_by?: string | null
          segment_id?: string | null
          severity?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          damage_type?: string
          description?: string | null
          geometry?: unknown
          id?: string
          project_id?: string
          reported_at?: string | null
          reported_by?: string | null
          segment_id?: string | null
          severity?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_existing_damages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_existing_damages_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_existing_damages_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "line_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      production_entries: {
        Row: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          billing_status: string
          client_approval_notes: string | null
          client_approved: boolean
          client_approved_at: string | null
          created_at: string | null
          created_by: string | null
          crew_id: string | null
          id: string
          internal_status: string
          invoice_reference: string | null
          invoiced_at: string | null
          line_segment_id: string | null
          notes: string | null
          paid_at: string | null
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          reported_by: string
          supervisor_approved_at: string | null
          supervisor_approved_by: string | null
          unit_type: string
          units_completed: number
          updated_at: string | null
          work_date: string
        }
        Insert: {
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          billing_status?: string
          client_approval_notes?: string | null
          client_approved?: boolean
          client_approved_at?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_id?: string | null
          id?: string
          internal_status?: string
          invoice_reference?: string | null
          invoiced_at?: string | null
          line_segment_id?: string | null
          notes?: string | null
          paid_at?: string | null
          project_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reported_by: string
          supervisor_approved_at?: string | null
          supervisor_approved_by?: string | null
          unit_type?: string
          units_completed: number
          updated_at?: string | null
          work_date: string
        }
        Update: {
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          billing_status?: string
          client_approval_notes?: string | null
          client_approved?: boolean
          client_approved_at?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_id?: string | null
          id?: string
          internal_status?: string
          invoice_reference?: string | null
          invoiced_at?: string | null
          line_segment_id?: string | null
          notes?: string | null
          paid_at?: string | null
          project_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reported_by?: string
          supervisor_approved_at?: string | null
          supervisor_approved_by?: string | null
          unit_type?: string
          units_completed?: number
          updated_at?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_entries_admin_approved_by_fkey"
            columns: ["admin_approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_line_segment_id_fkey"
            columns: ["line_segment_id"]
            isOneToOne: false
            referencedRelation: "line_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_supervisor_approved_by_fkey"
            columns: ["supervisor_approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_budgets: {
        Row: {
          budget_amount: number | null
          client_rate_per_unit: number
          created_at: string | null
          created_by: string | null
          default_worker_rate_per_unit: number | null
          id: string
          name: string
          notes: string | null
          project_id: string
          total_units: number
          unit_type: string
          updated_at: string | null
        }
        Insert: {
          budget_amount?: number | null
          client_rate_per_unit: number
          created_at?: string | null
          created_by?: string | null
          default_worker_rate_per_unit?: number | null
          id?: string
          name?: string
          notes?: string | null
          project_id: string
          total_units: number
          unit_type?: string
          updated_at?: string | null
        }
        Update: {
          budget_amount?: number | null
          client_rate_per_unit?: number
          created_at?: string | null
          created_by?: string | null
          default_worker_rate_per_unit?: number | null
          id?: string
          name?: string
          notes?: string | null
          project_id?: string
          total_units?: number
          unit_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          added_at: string | null
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string | null
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          added_at?: string | null
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_report_config: {
        Row: {
          cc_internal: Json | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          last_sent_at: string | null
          project_id: string
          recipient_contact_ids: string[] | null
          recipients: Json | null
          schedule_days: string[] | null
          schedule_time: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          cc_internal?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          project_id: string
          recipient_contact_ids?: string[] | null
          recipients?: Json | null
          schedule_days?: string[] | null
          schedule_time?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          cc_internal?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          project_id?: string
          recipient_contact_ids?: string[] | null
          recipients?: Json | null
          schedule_days?: string[] | null
          schedule_time?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_report_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_report_config_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_report_config_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_end_date: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          settings: Json | null
          start_date: string | null
          status: string
          target_end_date: string | null
          updated_at: string | null
        }
        Insert: {
          actual_end_date?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          settings?: Json | null
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_end_date?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          settings?: Json | null
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_template_types: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_templates: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          organization_id: string
          template_json: Json
          template_type_id: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          organization_id: string
          template_json: Json
          template_type_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          organization_id?: string
          template_json?: Json
          template_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_template_type_id_fkey"
            columns: ["template_type_id"]
            isOneToOne: false
            referencedRelation: "report_template_types"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          id: string
          is_system: boolean | null
          name: string
          organization_id: string | null
          permissions: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          organization_id?: string | null
          permissions?: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          organization_id?: string | null
          permissions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          filename: string
          id: string
          location: unknown
          photo_type: string | null
          service_id: string
          service_status: string | null
          storage_path: string
          taken_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          filename: string
          id?: string
          location?: unknown
          photo_type?: string | null
          service_id: string
          service_status?: string | null
          storage_path: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          filename?: string
          id?: string
          location?: unknown
          photo_type?: string | null
          service_id?: string
          service_status?: string | null
          storage_path?: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_photos_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string | null
          created_by: string | null
          depth_feet: number | null
          drill_depth_feet: number | null
          geometry: unknown
          id: string
          line_segment_id: string | null
          marked_by: string | null
          notes: string | null
          opened_by: string | null
          project_id: string | null
          service_line: unknown
          service_type: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          depth_feet?: number | null
          drill_depth_feet?: number | null
          geometry: unknown
          id?: string
          line_segment_id?: string | null
          marked_by?: string | null
          notes?: string | null
          opened_by?: string | null
          project_id?: string | null
          service_line?: unknown
          service_type: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          depth_feet?: number | null
          drill_depth_feet?: number | null
          geometry?: unknown
          id?: string
          line_segment_id?: string | null
          marked_by?: string | null
          notes?: string | null
          opened_by?: string | null
          project_id?: string | null
          service_line?: unknown
          service_type?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_line_segment_id_fkey"
            columns: ["line_segment_id"]
            isOneToOne: false
            referencedRelation: "line_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      status_definitions: {
        Row: {
          color: string
          created_at: string | null
          display_name: string
          id: string
          is_initial: boolean | null
          is_terminal: boolean | null
          name: string
          requires_photo: boolean | null
          sequence: number
          task_type_id: string
          updated_at: string | null
        }
        Insert: {
          color: string
          created_at?: string | null
          display_name: string
          id?: string
          is_initial?: boolean | null
          is_terminal?: boolean | null
          name: string
          requires_photo?: boolean | null
          sequence: number
          task_type_id: string
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          display_name?: string
          id?: string
          is_initial?: boolean | null
          is_terminal?: boolean | null
          name?: string
          requires_photo?: boolean | null
          sequence?: number
          task_type_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "status_definitions_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          task_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          task_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          task_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          task_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_line_segments: {
        Row: {
          created_at: string | null
          id: string
          line_segment_id: string
          sequence_order: number
          task_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          line_segment_id: string
          sequence_order?: number
          task_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          line_segment_id?: string
          sequence_order?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_line_segments_line_segment_id_fkey"
            columns: ["line_segment_id"]
            isOneToOne: false
            referencedRelation: "line_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_line_segments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          filename: string
          id: string
          location: unknown
          storage_path: string
          taken_at: string | null
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          filename: string
          id?: string
          location?: unknown
          storage_path: string
          taken_at?: string | null
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          filename?: string
          id?: string
          location?: unknown
          storage_path?: string
          taken_at?: string | null
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_photos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_points: {
        Row: {
          created_at: string | null
          id: string
          point_id: string
          sequence_order: number
          task_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          point_id: string
          sequence_order?: number
          task_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          point_id?: string
          sequence_order?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_points_point_id_fkey"
            columns: ["point_id"]
            isOneToOne: false
            referencedRelation: "points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_points_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_types: {
        Row: {
          applies_to: string
          category: string
          color: string | null
          created_at: string | null
          default_sequence: number | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          applies_to?: string
          category: string
          color?: string | null
          created_at?: string | null
          default_sequence?: number | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          applies_to?: string
          category?: string
          color?: string | null
          created_at?: string | null
          default_sequence?: number | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          due_date: string | null
          id: string
          notes: string | null
          project_id: string
          started_at: string | null
          status_id: string
          task_type_id: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          project_id: string
          started_at?: string | null
          status_id: string
          task_type_id: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          started_at?: string | null
          status_id?: string
          task_type_id?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "status_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          clock_in: string | null
          clock_in_location: unknown
          clock_out: string | null
          clock_out_location: unknown
          created_at: string | null
          created_by: string | null
          entry_type: string
          hourly_rate: number | null
          hours_worked: number | null
          id: string
          notes: string | null
          project_id: string
          rejection_reason: string | null
          status: string
          updated_at: string | null
          user_id: string
          work_date: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          clock_in?: string | null
          clock_in_location?: unknown
          clock_out?: string | null
          clock_out_location?: unknown
          created_at?: string | null
          created_by?: string | null
          entry_type: string
          hourly_rate?: number | null
          hours_worked?: number | null
          id?: string
          notes?: string | null
          project_id: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
          work_date: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          clock_in?: string | null
          clock_in_location?: unknown
          clock_out?: string | null
          clock_out_location?: unknown
          created_at?: string | null
          created_by?: string | null
          entry_type?: string
          hourly_rate?: number | null
          hours_worked?: number | null
          id?: string
          notes?: string | null
          project_id?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          organization_id: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name: string
          id: string
          is_active?: boolean | null
          organization_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          role_id: string
          user_id: string
        }
        Insert: {
          role_id: string
          user_id: string
        }
        Update: {
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_rates: {
        Row: {
          created_at: string | null
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          organization_id: string
          project_id: string | null
          rate_amount: number
          rate_type: string
          unit_type: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id: string
          project_id?: string | null
          rate_amount: number
          rate_type: string
          unit_type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id?: string
          project_id?: string | null
          rate_amount?: number
          rate_type?: string
          unit_type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_rates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_rates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_rates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_retentions: {
        Row: {
          amount_retained: number
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_complete: boolean | null
          organization_id: string
          retention_amount: number
          retention_rate: number
          started_at: string | null
          updated_at: string | null
          waive_reason: string | null
          waived_at: string | null
          waived_by: string | null
          worker_id: string
        }
        Insert: {
          amount_retained?: number
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_complete?: boolean | null
          organization_id: string
          retention_amount?: number
          retention_rate?: number
          started_at?: string | null
          updated_at?: string | null
          waive_reason?: string | null
          waived_at?: string | null
          waived_by?: string | null
          worker_id: string
        }
        Update: {
          amount_retained?: number
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_complete?: boolean | null
          organization_id?: string
          retention_amount?: number
          retention_rate?: number
          started_at?: string | null
          updated_at?: string | null
          waive_reason?: string | null
          waived_at?: string | null
          waived_by?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_retentions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_retentions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_retentions_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_retentions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_default_roles: { Args: { org_id: string }; Returns: undefined }
      create_default_task_types: {
        Args: { org_id: string }
        Returns: undefined
      }
      current_user_org: { Args: never; Returns: string }
      generate_maintenance_alerts: {
        Args: { p_default_lead_days?: number }
        Returns: {
          created_count: number
          updated_count: number
          woken_count: number
        }[]
      }
      get_fleet_maintenance_summary: {
        Args: never
        Returns: {
          assets_overdue: number
          assets_up_to_date: number
          assets_upcoming: number
          open_alerts: number
          overdue_alerts: number
          total_assets: number
        }[]
      }
      get_org_users: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          organization_id: string
          phone: string
          roles: Json
          updated_at: string
        }[]
      }
      get_status_workflow: {
        Args: { p_task_type_id: string }
        Returns: {
          color: string
          display_name: string
          id: string
          is_initial: boolean
          is_terminal: boolean
          name: string
          requires_photo: boolean
          sequence: number
        }[]
      }
      get_task_org_id: { Args: { p_task_id: string }; Returns: string }
      has_role: { Args: { role_name: string }; Returns: boolean }
      maintenance_alert_severity: {
        Args: { p_due_date: string }
        Returns: string
      }
      supersede_worker_rate: {
        Args: {
          p_new_amount: number
          p_new_effective_from: string
          p_new_effective_to?: string
          p_old_id: string
        }
        Returns: string
      }
      verify_rls_policies: {
        Args: never
        Returns: {
          check_name: string
          details: string
          status: string
          table_name: string
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
