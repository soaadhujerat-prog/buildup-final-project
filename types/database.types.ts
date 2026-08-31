// =============================================================================
// BuildUp – Supabase generated database types
// =============================================================================
// GENERATED FILE — do not edit by hand.
// Regenerate after every schema migration with:  npm run gen:types
// (supabase gen types typescript --project-id rxoyzsrnlterhmyzpsnd --schema public)
//
// Generated from the Phase 1 schema (migrations 001..013).
// =============================================================================

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
      admin_permissions: {
        Row: {
          permission: Database["public"]["Enums"]["admin_permission"]
          profile_id: string
        }
        Insert: {
          permission: Database["public"]["Enums"]["admin_permission"]
          profile_id: string
        }
        Update: {
          permission?: Database["public"]["Enums"]["admin_permission"]
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string
          contractor_response: string | null
          created_at: string
          id: string
          job_id: string
          message: string | null
          recruitment_cycle: number
          responded_at: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          withdrawn_at: string | null
          worker_id: string
        }
        Insert: {
          applied_at?: string
          contractor_response?: string | null
          created_at?: string
          id?: string
          job_id: string
          message?: string | null
          recruitment_cycle: number
          responded_at?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          withdrawn_at?: string | null
          worker_id: string
        }
        Update: {
          applied_at?: string
          contractor_response?: string | null
          created_at?: string
          id?: string
          job_id?: string
          message?: string | null
          recruitment_cycle?: number
          responded_at?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          withdrawn_at?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_registration_state"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      areas: {
        Row: {
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      assignments: {
        Row: {
          cancellation_message: string | null
          cancelled_at: string | null
          cancelled_by: Database["public"]["Enums"]["assignment_actor"] | null
          completed_at: string | null
          contractor_id: string
          created_at: string
          id: string
          job_id: string
          source: Database["public"]["Enums"]["assignment_source"]
          source_id: string | null
          status: Database["public"]["Enums"]["assignment_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          cancellation_message?: string | null
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["assignment_actor"] | null
          completed_at?: string | null
          contractor_id: string
          created_at?: string
          id?: string
          job_id: string
          source: Database["public"]["Enums"]["assignment_source"]
          source_id?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          cancellation_message?: string | null
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["assignment_actor"] | null
          completed_at?: string | null
          contractor_id?: string
          created_at?: string
          id?: string
          job_id?: string
          source?: Database["public"]["Enums"]["assignment_source"]
          source_id?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractor_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_registration_state"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      cities: {
        Row: {
          aliases: string[]
          area_slug: string | null
          id: number
          lat: number
          lon: number
          name: string
        }
        Insert: {
          aliases?: string[]
          area_slug?: string | null
          id?: never
          lat: number
          lon: number
          name: string
        }
        Update: {
          aliases?: string[]
          area_slug?: string | null
          id?: never
          lat?: number
          lon?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_area_slug_fkey"
            columns: ["area_slug"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["slug"]
          },
        ]
      }
      contractor_areas: {
        Row: {
          area_slug: string
          contractor_id: string
        }
        Insert: {
          area_slug: string
          contractor_id: string
        }
        Update: {
          area_slug?: string
          contractor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_areas_area_slug_fkey"
            columns: ["area_slug"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "contractor_areas_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractor_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      contractor_favorite_workers: {
        Row: {
          contractor_id: string
          created_at: string
          worker_id: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          worker_id: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_favorite_workers_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractor_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "contractor_favorite_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      contractor_license_update_requests: {
        Row: {
          contractor_id: string
          created_at: string
          id: string
          new_license_details: string | null
          new_license_document_path: string | null
          new_registration_number: string | null
          proposed_valid_from: string | null
          proposed_valid_until: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["license_request_status"]
          updated_at: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          id?: string
          new_license_details?: string | null
          new_license_document_path?: string | null
          new_registration_number?: string | null
          proposed_valid_from?: string | null
          proposed_valid_until?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["license_request_status"]
          updated_at?: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          id?: string
          new_license_details?: string | null
          new_license_document_path?: string | null
          new_registration_number?: string | null
          proposed_valid_from?: string | null
          proposed_valid_until?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["license_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_license_update_requests_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractor_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "contractor_license_update_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_profiles: {
        Row: {
          bio: string | null
          city_id: number | null
          city_name: string
          company_name: string
          contractor_registration_number: string
          created_at: string
          lat: number | null
          license_details: string
          license_document_path: string | null
          license_last_verified_at: string | null
          license_next_review_at: string | null
          license_valid_from: string | null
          license_valid_until: string | null
          license_verification_status: Database["public"]["Enums"]["contractor_license_status"]
          lon: number | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          city_id?: number | null
          city_name?: string
          company_name: string
          contractor_registration_number: string
          created_at?: string
          lat?: number | null
          license_details?: string
          license_document_path?: string | null
          license_last_verified_at?: string | null
          license_next_review_at?: string | null
          license_valid_from?: string | null
          license_valid_until?: string | null
          license_verification_status?: Database["public"]["Enums"]["contractor_license_status"]
          lon?: number | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          city_id?: number | null
          city_name?: string
          company_name?: string
          contractor_registration_number?: string
          created_at?: string
          lat?: number | null
          license_details?: string
          license_document_path?: string | null
          license_last_verified_at?: string | null
          license_next_review_at?: string | null
          license_valid_from?: string | null
          license_valid_until?: string | null
          license_verification_status?: Database["public"]["Enums"]["contractor_license_status"]
          lon?: number | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_project_types: {
        Row: {
          contractor_id: string
          project_type_slug: string
        }
        Insert: {
          contractor_id: string
          project_type_slug: string
        }
        Update: {
          contractor_id?: string
          project_type_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_project_types_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractor_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "contractor_project_types_project_type_slug_fkey"
            columns: ["project_type_slug"]
            isOneToOne: false
            referencedRelation: "project_types"
            referencedColumns: ["slug"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          is_group: boolean
          last_message: string
          last_message_at: string | null
          pair_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_group?: boolean
          last_message?: string
          last_message_at?: string | null
          pair_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_group?: boolean
          last_message?: string
          last_message_at?: string | null
          pair_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          cancellation_reason:
            | Database["public"]["Enums"]["invitation_cancel_reason"]
            | null
          cancelled_at: string | null
          contractor_id: string
          created_at: string
          id: string
          job_id: string
          message: string | null
          responded_at: string | null
          response_message: string | null
          sent_at: string
          status: Database["public"]["Enums"]["invitation_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          cancellation_reason?:
            | Database["public"]["Enums"]["invitation_cancel_reason"]
            | null
          cancelled_at?: string | null
          contractor_id: string
          created_at?: string
          id?: string
          job_id: string
          message?: string | null
          responded_at?: string | null
          response_message?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          cancellation_reason?:
            | Database["public"]["Enums"]["invitation_cancel_reason"]
            | null
          cancelled_at?: string | null
          contractor_id?: string
          created_at?: string
          id?: string
          job_id?: string
          message?: string | null
          responded_at?: string | null
          response_message?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractor_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "invitations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_registration_state"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "invitations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      job_professions: {
        Row: {
          is_primary: boolean
          job_id: string
          profession_slug: string
        }
        Insert: {
          is_primary?: boolean
          job_id: string
          profession_slug: string
        }
        Update: {
          is_primary?: boolean
          job_id?: string
          profession_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_professions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_registration_state"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_professions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_professions_profession_slug_fkey"
            columns: ["profession_slug"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["slug"]
          },
        ]
      }
      job_required_certifications: {
        Row: {
          job_id: string
          name: string
        }
        Insert: {
          job_id: string
          name: string
        }
        Update: {
          job_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_required_certifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_registration_state"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_required_certifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_requirements: {
        Row: {
          id: string
          job_id: string
          sort_order: number
          text: string
        }
        Insert: {
          id?: string
          job_id: string
          sort_order?: number
          text: string
        }
        Update: {
          id?: string
          job_id?: string
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_requirements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_registration_state"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_requirements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_worksite_images: {
        Row: {
          id: string
          job_id: string
          path: string
          sort_order: number
        }
        Insert: {
          id?: string
          job_id: string
          path: string
          sort_order?: number
        }
        Update: {
          id?: string
          job_id?: string
          path?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_worksite_images_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_registration_state"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_worksite_images_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          address: string
          city_id: number | null
          city_name: string
          closed_manually: boolean
          contractor_id: string
          created_at: string
          daily_rate: number | null
          description: string
          duration: string
          end_date: string | null
          hourly_rate: number | null
          id: string
          lat: number | null
          lon: number | null
          posted_at: string
          profession_category_slug: string
          recruitment_cycle: number
          start_date: string
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string | null
          urgent: boolean
          workers_needed: number
        }
        Insert: {
          address?: string
          city_id?: number | null
          city_name: string
          closed_manually?: boolean
          contractor_id: string
          created_at?: string
          daily_rate?: number | null
          description?: string
          duration?: string
          end_date?: string | null
          hourly_rate?: number | null
          id?: string
          lat?: number | null
          lon?: number | null
          posted_at?: string
          profession_category_slug: string
          recruitment_cycle?: number
          start_date: string
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string | null
          urgent?: boolean
          workers_needed: number
        }
        Update: {
          address?: string
          city_id?: number | null
          city_name?: string
          closed_manually?: boolean
          contractor_id?: string
          created_at?: string
          daily_rate?: number | null
          description?: string
          duration?: string
          end_date?: string | null
          hourly_rate?: number | null
          id?: string
          lat?: number | null
          lon?: number | null
          posted_at?: string
          profession_category_slug?: string
          recruitment_cycle?: number
          start_date?: string
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string | null
          urgent?: boolean
          workers_needed?: number
        }
        Relationships: [
          {
            foreignKeyName: "jobs_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractor_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "jobs_profession_category_slug_fkey"
            columns: ["profession_category_slug"]
            isOneToOne: false
            referencedRelation: "profession_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string | null
          id: string
          is_read: boolean
          related_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          related_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          related_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profession_categories: {
        Row: {
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      professions: {
        Row: {
          category_slug: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          category_slug: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          category_slug?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "professions_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "profession_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          blocked_at: string | null
          blocked_reason: string | null
          created_at: string
          email: string
          email_verified: boolean
          full_name: string
          id: string
          phone: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          created_at?: string
          email: string
          email_verified?: boolean
          full_name: string
          id: string
          phone: string
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          created_at?: string
          email?: string
          email_verified?: boolean
          full_name?: string
          id?: string
          phone?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
      project_types: {
        Row: {
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      registration_status_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["user_status"]
          id: string
          message: string | null
          reason: string | null
          registration_id: string
          to_status: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status: Database["public"]["Enums"]["user_status"]
          id?: string
          message?: string | null
          reason?: string | null
          registration_id: string
          to_status: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["user_status"]
          id?: string
          message?: string | null
          reason?: string | null
          registration_id?: string
          to_status?: Database["public"]["Enums"]["user_status"]
        }
        Relationships: [
          {
            foreignKeyName: "registration_status_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_status_events_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          approval_message: string | null
          approved_at: string | null
          auth_user_id: string
          created_at: string
          created_user_id: string | null
          data: Json
          external_checks: Json
          id: string
          id_document_path: string | null
          processed_at: string | null
          processed_by: string | null
          rejected_at: string | null
          rejection_reason: string | null
          role: Database["public"]["Enums"]["registration_role"]
          status: Database["public"]["Enums"]["user_status"]
          submitted_at: string
          updated_at: string
        }
        Insert: {
          approval_message?: string | null
          approved_at?: string | null
          auth_user_id: string
          created_at?: string
          created_user_id?: string | null
          data: Json
          external_checks?: Json
          id?: string
          id_document_path?: string | null
          processed_at?: string | null
          processed_by?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          role: Database["public"]["Enums"]["registration_role"]
          status?: Database["public"]["Enums"]["user_status"]
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          approval_message?: string | null
          approved_at?: string | null
          auth_user_id?: string
          created_at?: string
          created_user_id?: string | null
          data?: Json
          external_checks?: Json
          id?: string
          id_document_path?: string | null
          processed_at?: string | null
          processed_by?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          role?: Database["public"]["Enums"]["registration_role"]
          status?: Database["public"]["Enums"]["user_status"]
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_created_user_id_fkey"
            columns: ["created_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          sender_id: string
          sender_role: Database["public"]["Enums"]["support_sender_role"]
          status_change:
            | Database["public"]["Enums"]["support_ticket_status"]
            | null
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender_id: string
          sender_role: Database["public"]["Enums"]["support_sender_role"]
          status_change?:
            | Database["public"]["Enums"]["support_ticket_status"]
            | null
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          sender_role?: Database["public"]["Enums"]["support_sender_role"]
          status_change?:
            | Database["public"]["Enums"]["support_ticket_status"]
            | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_admin_id: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          description: string
          id: string
          is_closed: boolean
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          type: Database["public"]["Enums"]["support_ticket_type"]
          updated_at: string
          user_id: string
          user_role: Database["public"]["Enums"]["registration_role"]
        }
        Insert: {
          assigned_admin_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          description: string
          id?: string
          is_closed?: boolean
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          type: Database["public"]["Enums"]["support_ticket_type"]
          updated_at?: string
          user_id: string
          user_role: Database["public"]["Enums"]["registration_role"]
        }
        Update: {
          assigned_admin_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          description?: string
          id?: string
          is_closed?: boolean
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          type?: Database["public"]["Enums"]["support_ticket_type"]
          updated_at?: string
          user_id?: string
          user_role?: Database["public"]["Enums"]["registration_role"]
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_identity: {
        Row: {
          created_at: string
          id_document_path: string | null
          id_number_enc: string | null
          id_number_hash: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id_document_path?: string | null
          id_number_enc?: string | null
          id_number_hash: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id_document_path?: string | null
          id_number_enc?: string | null
          id_number_hash?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_identity_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_certifications: {
        Row: {
          created_at: string
          document_path: string | null
          id: string
          name: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          document_path?: string | null
          id?: string
          name: string
          worker_id: string
        }
        Update: {
          created_at?: string
          document_path?: string | null
          id?: string
          name?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_certifications_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      worker_favorite_contractors: {
        Row: {
          contractor_id: string
          created_at: string
          worker_id: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          worker_id: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_favorite_contractors_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractor_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "worker_favorite_contractors_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      worker_preferred_areas: {
        Row: {
          area_slug: string
          worker_id: string
        }
        Insert: {
          area_slug: string
          worker_id: string
        }
        Update: {
          area_slug?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_preferred_areas_area_slug_fkey"
            columns: ["area_slug"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "worker_preferred_areas_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      worker_professions: {
        Row: {
          is_primary: boolean
          profession_slug: string
          worker_id: string
        }
        Insert: {
          is_primary?: boolean
          profession_slug: string
          worker_id: string
        }
        Update: {
          is_primary?: boolean
          profession_slug?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_professions_profession_slug_fkey"
            columns: ["profession_slug"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "worker_professions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      worker_profiles: {
        Row: {
          available_from: string | null
          bio: string
          city_id: number | null
          city_name: string
          created_at: string
          daily_rate: number
          experience_years: number
          hourly_rate: number
          is_available: boolean
          lat: number | null
          lon: number | null
          profession_category_slug: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          available_from?: string | null
          bio?: string
          city_id?: number | null
          city_name?: string
          created_at?: string
          daily_rate: number
          experience_years?: number
          hourly_rate: number
          is_available?: boolean
          lat?: number | null
          lon?: number | null
          profession_category_slug: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          available_from?: string | null
          bio?: string
          city_id?: number | null
          city_name?: string
          created_at?: string
          daily_rate?: number
          experience_years?: number
          hourly_rate?: number
          is_available?: boolean
          lat?: number | null
          lon?: number | null
          profession_category_slug?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_profiles_profession_category_slug_fkey"
            columns: ["profession_category_slug"]
            isOneToOne: false
            referencedRelation: "profession_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "worker_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_skills: {
        Row: {
          skill: string
          worker_id: string
        }
        Insert: {
          skill: string
          worker_id: string
        }
        Update: {
          skill?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_skills_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
    }
    Views: {
      job_registration_state: {
        Row: {
          closed_manually: boolean | null
          closure_reason:
            | Database["public"]["Enums"]["job_closure_reason"]
            | null
          filled_count: number | null
          is_full: boolean | null
          job_id: string | null
          open_for_applications: boolean | null
          recruitment_cycle: number | null
          remaining_slots: number | null
          workers_needed: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      active_assignment_count: { Args: { p_job_id: string }; Returns: number }
      can_view_job: { Args: { p_job_id: string }; Returns: boolean }
      can_view_profile: { Args: { p_target: string }; Returns: boolean }
      can_worker_apply: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      conversation_pair_key: { Args: { a: string; b: string }; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_member: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_job_fully_staffed: { Args: { p_job_id: string }; Returns: boolean }
      job_owner: { Args: { p_job_id: string }; Returns: boolean }
      occupied_slot_count: { Args: { p_job_id: string }; Returns: number }
      staffing_progress: {
        Args: { p_job_id: string }
        Returns: {
          active: number
          completed: number
          filled: number
          missing: number
          needed: number
          percent: number
          status: string
        }[]
      }
      storage_owns_registration: {
        Args: { p_registration_id: string }
        Returns: boolean
      }
      worker_contractor_relationship: {
        Args: { p_contractor_id: string; p_worker_id: string }
        Returns: string
      }
    }
    Enums: {
      admin_permission:
        | "approve_registrations"
        | "reject_registrations"
        | "block_users"
        | "unblock_users"
        | "handle_support"
      application_status: "pending" | "accepted" | "rejected" | "withdrawn"
      assignment_actor: "worker" | "contractor"
      assignment_source: "application" | "invitation"
      assignment_status: "active" | "completed" | "cancelled"
      contractor_license_status: "pending_review" | "verified" | "rejected"
      invitation_cancel_reason: "manual" | "capacity_full"
      invitation_status:
        | "pending"
        | "accepted"
        | "declined"
        | "expired"
        | "cancelled"
      job_closure_reason: "manual" | "capacity"
      job_status: "open" | "in_progress" | "completed" | "cancelled"
      license_request_status: "pending" | "approved" | "rejected"
      notification_type:
        | "job_application"
        | "application_accepted"
        | "application_rejected"
        | "invitation_received"
        | "invitation_accepted"
        | "invitation_declined"
        | "invitation_cancelled"
        | "assignment_cancelled"
        | "assignment_completed"
        | "new_message"
        | "review"
        | "registration_approved"
        | "registration_rejected"
        | "account_blocked"
        | "account_unblocked"
        | "support_response"
        | "new_pending_registration"
        | "new_support_ticket"
        | "license_update_submitted"
        | "license_update_approved"
        | "license_update_rejected"
        | "license_attention"
        | "license_renewal_requested"
        | "contractor_registration_number_updated"
        | "system"
      registration_role: "worker" | "contractor"
      support_sender_role: "admin" | "worker" | "contractor"
      support_ticket_status: "open" | "in_progress" | "resolved" | "closed"
      support_ticket_type: "complaint" | "claim" | "question" | "technical"
      user_role: "admin" | "contractor" | "worker"
      user_status: "pending" | "approved" | "blocked" | "rejected"
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
      admin_permission: [
        "approve_registrations",
        "reject_registrations",
        "block_users",
        "unblock_users",
        "handle_support",
      ],
      application_status: ["pending", "accepted", "rejected", "withdrawn"],
      assignment_actor: ["worker", "contractor"],
      assignment_source: ["application", "invitation"],
      assignment_status: ["active", "completed", "cancelled"],
      contractor_license_status: ["pending_review", "verified", "rejected"],
      invitation_cancel_reason: ["manual", "capacity_full"],
      invitation_status: [
        "pending",
        "accepted",
        "declined",
        "expired",
        "cancelled",
      ],
      job_closure_reason: ["manual", "capacity"],
      job_status: ["open", "in_progress", "completed", "cancelled"],
      license_request_status: ["pending", "approved", "rejected"],
      notification_type: [
        "job_application",
        "application_accepted",
        "application_rejected",
        "invitation_received",
        "invitation_accepted",
        "invitation_declined",
        "invitation_cancelled",
        "assignment_cancelled",
        "assignment_completed",
        "new_message",
        "review",
        "registration_approved",
        "registration_rejected",
        "account_blocked",
        "account_unblocked",
        "support_response",
        "new_pending_registration",
        "new_support_ticket",
        "license_update_submitted",
        "license_update_approved",
        "license_update_rejected",
        "license_attention",
        "license_renewal_requested",
        "contractor_registration_number_updated",
        "system",
      ],
      registration_role: ["worker", "contractor"],
      support_sender_role: ["admin", "worker", "contractor"],
      support_ticket_status: ["open", "in_progress", "resolved", "closed"],
      support_ticket_type: ["complaint", "claim", "question", "technical"],
      user_role: ["admin", "contractor", "worker"],
      user_status: ["pending", "approved", "blocked", "rejected"],
    },
  },
} as const
