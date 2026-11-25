export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      access_requests: {
        Row: {
          anonymized_at: string | null;
          company_or_role: string | null;
          created_at: string;
          discarded_at: string | null;
          discarded_by_system: boolean;
          email: string | null;
          full_name: string | null;
          id: string;
          invitation_id: string | null;
          message: string | null;
          privacy_accepted_at: string;
          privacy_document_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database['public']['Enums']['access_request_status'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          anonymized_at?: string | null;
          company_or_role?: string | null;
          created_at?: string;
          discarded_at?: string | null;
          discarded_by_system?: boolean;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          invitation_id?: string | null;
          message?: string | null;
          privacy_accepted_at: string;
          privacy_document_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['access_request_status'];
          updated_at?: string;
        };
        Update: {
          anonymized_at?: string | null;
          company_or_role?: string | null;
          created_at?: string;
          discarded_at?: string | null;
          discarded_by_system?: boolean;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          invitation_id?: string | null;
          message?: string | null;
          privacy_accepted_at?: string;
          privacy_document_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['access_request_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'access_requests_invitation_id_fkey';
            columns: ['invitation_id'];
            isOneToOne: false;
            referencedRelation: 'invitations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'access_requests_privacy_document_id_fkey';
            columns: ['privacy_document_id'];
            isOneToOne: false;
            referencedRelation: 'legal_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_usage: {
        Row: {
          attempt: number;
          created_at: string;
          estimated_cost_usd: number;
          first_chunk_ms: number | null;
          id: number;
          input_tokens: number;
          latency_ms: number;
          model: string;
          organization_id: string;
          outcome: Database['public']['Enums']['ai_call_outcome'];
          output_tokens: number;
          simulation_id: string | null;
          task: Database['public']['Enums']['ai_task'];
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          attempt?: number;
          created_at?: string;
          estimated_cost_usd: number;
          first_chunk_ms?: number | null;
          id?: never;
          input_tokens: number;
          latency_ms: number;
          model: string;
          organization_id: string;
          outcome?: Database['public']['Enums']['ai_call_outcome'];
          output_tokens: number;
          simulation_id?: string | null;
          task: Database['public']['Enums']['ai_task'];
          user_id?: string | null;
        };
        Update: {
          attempt?: number;
          created_at?: string;
          estimated_cost_usd?: number;
          first_chunk_ms?: number | null;
          id?: never;
          input_tokens?: number;
          latency_ms?: number;
          model?: string;
          organization_id?: string;
          outcome?: Database['public']['Enums']['ai_call_outcome'];
          output_tokens?: number;
          simulation_id?: string | null;
          task?: Database['public']['Enums']['ai_task'];
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_usage_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_usage_simulation_id_fkey';
            columns: ['simulation_id'];
            isOneToOne: false;
            referencedRelation: 'practice_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_label: string | null;
          actor_type: Database['public']['Enums']['audit_actor_type'];
          actor_user_id: string | null;
          data: NonNullable<Json>;
          id: number;
          object_id: string | null;
          object_type: string;
          occurred_at: string;
          organization_id: string | null;
          result: Database['public']['Enums']['audit_result'];
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_label?: string | null;
          actor_type: Database['public']['Enums']['audit_actor_type'];
          actor_user_id?: string | null;
          data?: NonNullable<Json>;
          id?: never;
          object_id?: string | null;
          object_type: string;
          occurred_at?: string;
          organization_id?: string | null;
          result?: Database['public']['Enums']['audit_result'];
        };
        Update: {
          action?: string;
          actor_label?: string | null;
          actor_type?: Database['public']['Enums']['audit_actor_type'];
          actor_user_id?: string | null;
          data?: NonNullable<Json>;
          id?: never;
          object_id?: string | null;
          object_type?: string;
          occurred_at?: string;
          organization_id?: string | null;
          result?: Database['public']['Enums']['audit_result'];
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_user_id: string | null;
          access_request_id: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          expires_in_days: number;
          id: string;
          idempotency_key: string | null;
          invited_by: string;
          last_sent_at: string | null;
          resend_idempotency_key: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          roles: Database['public']['Enums']['org_role'][];
          send_attempts: number;
          send_status: Database['public']['Enums']['email_send_status'];
          target_organization_id: string | null;
          token_hash: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_user_id?: string | null;
          access_request_id?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          expires_in_days?: number;
          id?: string;
          idempotency_key?: string | null;
          invited_by: string;
          last_sent_at?: string | null;
          resend_idempotency_key?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          roles?: Database['public']['Enums']['org_role'][];
          send_attempts?: number;
          send_status?: Database['public']['Enums']['email_send_status'];
          target_organization_id?: string | null;
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_user_id?: string | null;
          access_request_id?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          expires_in_days?: number;
          id?: string;
          idempotency_key?: string | null;
          invited_by?: string;
          last_sent_at?: string | null;
          resend_idempotency_key?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          roles?: Database['public']['Enums']['org_role'][];
          send_attempts?: number;
          send_status?: Database['public']['Enums']['email_send_status'];
          target_organization_id?: string | null;
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_access_request_id_fkey';
            columns: ['access_request_id'];
            isOneToOne: true;
            referencedRelation: 'access_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invitations_target_organization_id_fkey';
            columns: ['target_organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      legal_acceptances: {
        Row: {
          accepted_at: string;
          document_id: string;
          id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string;
          document_id: string;
          id?: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string;
          document_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'legal_acceptances_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'legal_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      legal_documents: {
        Row: {
          content_path: string;
          created_at: string;
          effective_at: string;
          id: string;
          is_draft: boolean;
          kind: Database['public']['Enums']['legal_document_kind'];
          version: string;
        };
        ComputedFields: never;
        Insert: {
          content_path: string;
          created_at?: string;
          effective_at: string;
          id?: string;
          is_draft: boolean;
          kind: Database['public']['Enums']['legal_document_kind'];
          version: string;
        };
        Update: {
          content_path?: string;
          created_at?: string;
          effective_at?: string;
          id?: string;
          is_draft?: boolean;
          kind?: Database['public']['Enums']['legal_document_kind'];
          version?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          created_at: string;
          id: string;
          invited_at: string | null;
          joined_at: string | null;
          organization_id: string;
          roles: Database['public']['Enums']['org_role'][];
          status: Database['public']['Enums']['membership_status'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          invited_at?: string | null;
          joined_at?: string | null;
          organization_id: string;
          roles: Database['public']['Enums']['org_role'][];
          status?: Database['public']['Enums']['membership_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_at?: string | null;
          joined_at?: string | null;
          organization_id?: string;
          roles?: Database['public']['Enums']['org_role'][];
          status?: Database['public']['Enums']['membership_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      objections: {
        Row: {
          category: Database['public']['Enums']['objection_category'] | null;
          created_at: string;
          id: string;
          organization_id: string;
          product_id: string;
          text: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category?: Database['public']['Enums']['objection_category'] | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          product_id: string;
          text: string;
          updated_at?: string;
        };
        Update: {
          category?: Database['public']['Enums']['objection_category'] | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          product_id?: string;
          text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'objections_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'objections_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          sector: string | null;
          slug: string;
          status: Database['public']['Enums']['organization_status'];
          suspended_at: string | null;
          suspended_by: string | null;
          suspended_reason: string | null;
          timezone: string;
          type: Database['public']['Enums']['organization_type'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          sector?: string | null;
          slug: string;
          status?: Database['public']['Enums']['organization_status'];
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspended_reason?: string | null;
          timezone?: string;
          type: Database['public']['Enums']['organization_type'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          sector?: string | null;
          slug?: string;
          status?: Database['public']['Enums']['organization_status'];
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspended_reason?: string | null;
          timezone?: string;
          type?: Database['public']['Enums']['organization_type'];
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          created_at: string;
          created_by_label: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by_label: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by_label?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      practice_buyer_profiles: {
        Row: {
          age: number;
          goal: string;
          intro: string;
          name: string;
          occupation: string;
          organization_id: string;
          revealable_labels: Database['public']['Enums']['revealable_key'][];
          session_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          age: number;
          goal: string;
          intro: string;
          name: string;
          occupation: string;
          organization_id: string;
          revealable_labels: Database['public']['Enums']['revealable_key'][];
          session_id: string;
          user_id: string;
        };
        Update: {
          age?: number;
          goal?: string;
          intro?: string;
          name?: string;
          occupation?: string;
          organization_id?: string;
          revealable_labels?: Database['public']['Enums']['revealable_key'][];
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_buyer_profiles_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_buyer_profiles_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: true;
            referencedRelation: 'practice_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      practice_ethical_flags: {
        Row: {
          evaluation_id: string;
          explanation: string;
          id: string;
          message_seqs: number[];
          organization_id: string;
          type: Database['public']['Enums']['ethical_flag_type'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          evaluation_id: string;
          explanation: string;
          id?: string;
          message_seqs: number[];
          organization_id: string;
          type: Database['public']['Enums']['ethical_flag_type'];
          user_id: string;
        };
        Update: {
          evaluation_id?: string;
          explanation?: string;
          id?: string;
          message_seqs?: number[];
          organization_id?: string;
          type?: Database['public']['Enums']['ethical_flag_type'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_ethical_flags_evaluation_id_fkey';
            columns: ['evaluation_id'];
            isOneToOne: false;
            referencedRelation: 'practice_evaluations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_ethical_flags_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      practice_evaluation_criteria: {
        Row: {
          confidence: number;
          criterion_id: string;
          evaluation_id: string;
          evidence_seqs: number[];
          id: string;
          improvement: string;
          justification: string;
          max_score: number;
          organization_id: string;
          score: number | null;
          status: Database['public']['Enums']['criterion_status'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          confidence: number;
          criterion_id: string;
          evaluation_id: string;
          evidence_seqs: number[];
          id?: string;
          improvement: string;
          justification: string;
          max_score: number;
          organization_id: string;
          score?: number | null;
          status: Database['public']['Enums']['criterion_status'];
          user_id: string;
        };
        Update: {
          confidence?: number;
          criterion_id?: string;
          evaluation_id?: string;
          evidence_seqs?: number[];
          id?: string;
          improvement?: string;
          justification?: string;
          max_score?: number;
          organization_id?: string;
          score?: number | null;
          status?: Database['public']['Enums']['criterion_status'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_evaluation_criteria_criterion_id_fkey';
            columns: ['criterion_id'];
            isOneToOne: false;
            referencedRelation: 'rubric_criteria';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_evaluation_criteria_evaluation_id_fkey';
            columns: ['evaluation_id'];
            isOneToOne: false;
            referencedRelation: 'practice_evaluations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_evaluation_criteria_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      practice_evaluations: {
        Row: {
          auto_attempts: number;
          created_at: string;
          id: string;
          improvements: string[];
          level: Database['public']['Enums']['score_level'] | null;
          manual_retries: number;
          model: string;
          organization_id: string;
          prompt_version: string;
          rubric_id: string;
          rubric_version: string;
          session_id: string;
          strengths: string[];
          suggested_drill_stage: Database['public']['Enums']['cautiva_stage'];
          suggested_drill_text: string;
          total_score: number | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auto_attempts: number;
          created_at?: string;
          id?: string;
          improvements: string[];
          level?: Database['public']['Enums']['score_level'] | null;
          manual_retries: number;
          model: string;
          organization_id: string;
          prompt_version: string;
          rubric_id: string;
          rubric_version: string;
          session_id: string;
          strengths: string[];
          suggested_drill_stage: Database['public']['Enums']['cautiva_stage'];
          suggested_drill_text: string;
          total_score?: number | null;
          user_id: string;
        };
        Update: {
          auto_attempts?: number;
          created_at?: string;
          id?: string;
          improvements?: string[];
          level?: Database['public']['Enums']['score_level'] | null;
          manual_retries?: number;
          model?: string;
          organization_id?: string;
          prompt_version?: string;
          rubric_id?: string;
          rubric_version?: string;
          session_id?: string;
          strengths?: string[];
          suggested_drill_stage?: Database['public']['Enums']['cautiva_stage'];
          suggested_drill_text?: string;
          total_score?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_evaluations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_evaluations_rubric_id_fkey';
            columns: ['rubric_id'];
            isOneToOne: false;
            referencedRelation: 'rubrics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_evaluations_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: true;
            referencedRelation: 'practice_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      practice_messages: {
        Row: {
          author: Database['public']['Enums']['message_author'];
          client_message_id: string | null;
          content: string;
          created_at: string;
          ends_session: boolean;
          hidden_objection_raised: string | null;
          id: string;
          interest_after: number | null;
          interest_before: number | null;
          interest_delta: number | null;
          meta_status: Database['public']['Enums']['turn_meta_status'] | null;
          organization_id: string;
          reply_to_seq: number | null;
          revealed_keys: string[];
          seller_abusive: boolean | null;
          seq: number;
          session_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          author: Database['public']['Enums']['message_author'];
          client_message_id?: string | null;
          content: string;
          created_at?: string;
          ends_session?: boolean;
          hidden_objection_raised?: string | null;
          id?: string;
          interest_after?: number | null;
          interest_before?: number | null;
          interest_delta?: number | null;
          meta_status?: Database['public']['Enums']['turn_meta_status'] | null;
          organization_id: string;
          reply_to_seq?: number | null;
          revealed_keys?: string[];
          seller_abusive?: boolean | null;
          seq: number;
          session_id: string;
          user_id: string;
        };
        Update: {
          author?: Database['public']['Enums']['message_author'];
          client_message_id?: string | null;
          content?: string;
          created_at?: string;
          ends_session?: boolean;
          hidden_objection_raised?: string | null;
          id?: string;
          interest_after?: number | null;
          interest_before?: number | null;
          interest_delta?: number | null;
          meta_status?: Database['public']['Enums']['turn_meta_status'] | null;
          organization_id?: string;
          reply_to_seq?: number | null;
          revealed_keys?: string[];
          seller_abusive?: boolean | null;
          seq?: number;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_messages_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'practice_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      practice_session_reveals: {
        Row: {
          id: string;
          item_key: string;
          kind: string;
          message_seq: number;
          organization_id: string;
          revealed_at: string;
          session_id: string;
          user_id: string;
          value: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          item_key: string;
          kind: string;
          message_seq: number;
          organization_id: string;
          revealed_at?: string;
          session_id: string;
          user_id: string;
          value: string;
        };
        Update: {
          id?: string;
          item_key?: string;
          kind?: string;
          message_seq?: number;
          organization_id?: string;
          revealed_at?: string;
          session_id?: string;
          user_id?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_session_reveals_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_session_reveals_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'practice_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      practice_session_secrets: {
        Row: {
          hidden_objections: NonNullable<Json>;
          motivation: string;
          opening_message: string;
          organization_id: string;
          personality: string;
          revealables: NonNullable<Json>;
          session_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          hidden_objections: NonNullable<Json>;
          motivation: string;
          opening_message: string;
          organization_id: string;
          personality: string;
          revealables: NonNullable<Json>;
          session_id: string;
          user_id: string;
        };
        Update: {
          hidden_objections?: NonNullable<Json>;
          motivation?: string;
          opening_message?: string;
          organization_id?: string;
          personality?: string;
          revealables?: NonNullable<Json>;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_session_secrets_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_session_secrets_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: true;
            referencedRelation: 'practice_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      practice_sessions: {
        Row: {
          buyer_model: string;
          buyer_prompt_version: string;
          buyer_setup_model: string;
          buyer_setup_prompt_version: string;
          configured_at: string;
          configured_expires_at: string;
          created_at: string;
          deadline_at: string | null;
          difficulty: number;
          discarded_at: string | null;
          end_reason: Database['public']['Enums']['practice_end_reason'] | null;
          ended_at: string | null;
          evaluation_auto_attempts: number;
          evaluation_due_at: string | null;
          evaluation_failure_code: string | null;
          evaluation_manual_retries: number;
          evaluation_phase: Database['public']['Enums']['evaluation_phase'] | null;
          evaluation_status: Database['public']['Enums']['evaluation_status'] | null;
          focus_stage: Database['public']['Enums']['cautiva_stage'] | null;
          hints_enabled: boolean;
          hints_used: number;
          id: string;
          interest: number;
          last_hint_at_seller_count: number | null;
          last_interest_delta: number;
          last_seq: number;
          organization_id: string;
          product_id: string;
          product_version: number;
          product_version_id: string;
          provider_wait_ms: number;
          selected_objection_ids: string[];
          seller_message_count: number;
          setup_idempotency_key: string;
          started_at: string | null;
          status: Database['public']['Enums']['practice_status'];
          turn_lock_expires_at: string | null;
          turn_lock_seq: number | null;
          updated_at: string;
          user_id: string;
          visible_objection: string;
          visible_objection_category: Database['public']['Enums']['objection_category'] | null;
        };
        ComputedFields: never;
        Insert: {
          buyer_model: string;
          buyer_prompt_version: string;
          buyer_setup_model: string;
          buyer_setup_prompt_version: string;
          configured_at?: string;
          configured_expires_at: string;
          created_at?: string;
          deadline_at?: string | null;
          difficulty: number;
          discarded_at?: string | null;
          end_reason?: Database['public']['Enums']['practice_end_reason'] | null;
          ended_at?: string | null;
          evaluation_auto_attempts?: number;
          evaluation_due_at?: string | null;
          evaluation_failure_code?: string | null;
          evaluation_manual_retries?: number;
          evaluation_phase?: Database['public']['Enums']['evaluation_phase'] | null;
          evaluation_status?: Database['public']['Enums']['evaluation_status'] | null;
          focus_stage?: Database['public']['Enums']['cautiva_stage'] | null;
          hints_enabled?: boolean;
          hints_used?: number;
          id?: string;
          interest: number;
          last_hint_at_seller_count?: number | null;
          last_interest_delta?: number;
          last_seq?: number;
          organization_id: string;
          product_id: string;
          product_version: number;
          product_version_id: string;
          provider_wait_ms?: number;
          selected_objection_ids: string[];
          seller_message_count?: number;
          setup_idempotency_key: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['practice_status'];
          turn_lock_expires_at?: string | null;
          turn_lock_seq?: number | null;
          updated_at?: string;
          user_id: string;
          visible_objection: string;
          visible_objection_category?: Database['public']['Enums']['objection_category'] | null;
        };
        Update: {
          buyer_model?: string;
          buyer_prompt_version?: string;
          buyer_setup_model?: string;
          buyer_setup_prompt_version?: string;
          configured_at?: string;
          configured_expires_at?: string;
          created_at?: string;
          deadline_at?: string | null;
          difficulty?: number;
          discarded_at?: string | null;
          end_reason?: Database['public']['Enums']['practice_end_reason'] | null;
          ended_at?: string | null;
          evaluation_auto_attempts?: number;
          evaluation_due_at?: string | null;
          evaluation_failure_code?: string | null;
          evaluation_manual_retries?: number;
          evaluation_phase?: Database['public']['Enums']['evaluation_phase'] | null;
          evaluation_status?: Database['public']['Enums']['evaluation_status'] | null;
          focus_stage?: Database['public']['Enums']['cautiva_stage'] | null;
          hints_enabled?: boolean;
          hints_used?: number;
          id?: string;
          interest?: number;
          last_hint_at_seller_count?: number | null;
          last_interest_delta?: number;
          last_seq?: number;
          organization_id?: string;
          product_id?: string;
          product_version?: number;
          product_version_id?: string;
          provider_wait_ms?: number;
          selected_objection_ids?: string[];
          seller_message_count?: number;
          setup_idempotency_key?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['practice_status'];
          turn_lock_expires_at?: string | null;
          turn_lock_seq?: number | null;
          updated_at?: string;
          user_id?: string;
          visible_objection?: string;
          visible_objection_category?: Database['public']['Enums']['objection_category'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_sessions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_sessions_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_sessions_product_version_id_fkey';
            columns: ['product_version_id'];
            isOneToOne: false;
            referencedRelation: 'product_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      practice_setup_attempts: {
        Row: {
          created_at: string;
          failure_code: string | null;
          id: number;
          organization_id: string;
          outcome: Database['public']['Enums']['setup_outcome'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          failure_code?: string | null;
          id?: never;
          organization_id: string;
          outcome: Database['public']['Enums']['setup_outcome'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          failure_code?: string | null;
          id?: never;
          organization_id?: string;
          outcome?: Database['public']['Enums']['setup_outcome'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_setup_attempts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      product_versions: {
        Row: {
          benefits: string[];
          created_at: string;
          created_by: string;
          description: string;
          differentiators: string[];
          id: string;
          name: string;
          organization_id: string;
          price_kind: Database['public']['Enums']['price_kind'];
          price_max: number;
          price_min: number;
          product_id: string;
          sector: Database['public']['Enums']['product_sector'];
          verifiable_facts: string[];
          version: number;
        };
        ComputedFields: never;
        Insert: {
          benefits: string[];
          created_at?: string;
          created_by: string;
          description?: string;
          differentiators?: string[];
          id?: string;
          name: string;
          organization_id: string;
          price_kind: Database['public']['Enums']['price_kind'];
          price_max: number;
          price_min: number;
          product_id: string;
          sector: Database['public']['Enums']['product_sector'];
          verifiable_facts?: string[];
          version: number;
        };
        Update: {
          benefits?: string[];
          created_at?: string;
          created_by?: string;
          description?: string;
          differentiators?: string[];
          id?: string;
          name?: string;
          organization_id?: string;
          price_kind?: Database['public']['Enums']['price_kind'];
          price_max?: number;
          price_min?: number;
          product_id?: string;
          sector?: Database['public']['Enums']['product_sector'];
          verifiable_facts?: string[];
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'product_versions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_versions_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          archived_at: string | null;
          create_idempotency_key: string | null;
          created_at: string;
          created_by: string;
          current_name: string;
          current_version: number;
          id: string;
          organization_id: string;
          status: Database['public']['Enums']['product_status'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          create_idempotency_key?: string | null;
          created_at?: string;
          created_by: string;
          current_name: string;
          current_version?: number;
          id?: string;
          organization_id: string;
          status?: Database['public']['Enums']['product_status'];
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          create_idempotency_key?: string | null;
          created_at?: string;
          created_by?: string;
          current_name?: string;
          current_version?: number;
          id?: string;
          organization_id?: string;
          status?: Database['public']['Enums']['product_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'products_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string | null;
          onboarding_status: Database['public']['Enums']['onboarding_status'];
          onboarding_step: number;
          onboarding_updated_at: string | null;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string | null;
          onboarding_status?: Database['public']['Enums']['onboarding_status'];
          onboarding_step?: number;
          onboarding_updated_at?: string | null;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string | null;
          onboarding_status?: Database['public']['Enums']['onboarding_status'];
          onboarding_step?: number;
          onboarding_updated_at?: string | null;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      quotas: {
        Row: {
          daily_limit: number;
          monthly_limit: number;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          daily_limit?: number;
          monthly_limit?: number;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          daily_limit?: number;
          monthly_limit?: number;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'quotas_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: true;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      rubric_criteria: {
        Row: {
          anchors: NonNullable<Json>;
          description: string;
          id: string;
          key: string;
          name: string;
          position: number;
          rubric_id: string;
          stages: Database['public']['Enums']['cautiva_stage'][];
          weight: number;
        };
        ComputedFields: never;
        Insert: {
          anchors: NonNullable<Json>;
          description: string;
          id?: string;
          key: string;
          name: string;
          position: number;
          rubric_id: string;
          stages: Database['public']['Enums']['cautiva_stage'][];
          weight: number;
        };
        Update: {
          anchors?: NonNullable<Json>;
          description?: string;
          id?: string;
          key?: string;
          name?: string;
          position?: number;
          rubric_id?: string;
          stages?: Database['public']['Enums']['cautiva_stage'][];
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rubric_criteria_rubric_id_fkey';
            columns: ['rubric_id'];
            isOneToOne: false;
            referencedRelation: 'rubrics';
            referencedColumns: ['id'];
          },
        ];
      };
      rubrics: {
        Row: {
          id: string;
          is_current: boolean;
          name: string;
          published_at: string;
          slug: string;
          version: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          is_current: boolean;
          name: string;
          published_at: string;
          slug: string;
          version: string;
        };
        Update: {
          id?: string;
          is_current?: boolean;
          name?: string;
          published_at?: string;
          slug?: string;
          version?: string;
        };
        Relationships: [];
      };
      simulation_consumptions: {
        Row: {
          consumed_at: string;
          organization_id: string;
          session_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          consumed_at?: string;
          organization_id: string;
          session_id: string;
          user_id: string;
        };
        Update: {
          consumed_at?: string;
          organization_id?: string;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'simulation_consumptions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'simulation_consumptions_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: true;
            referencedRelation: 'practice_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      teams: {
        Row: {
          created_at: string;
          id: string;
          manager_user_id: string | null;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          manager_user_id?: string | null;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          manager_user_id?: string | null;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'teams_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: {
        Args: {
          p_ai_notice_doc: string;
          p_full_name: string;
          p_terms_doc: string;
          p_token_hash: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      admin_create_invitation: {
        Args: {
          p_access_request_id: string;
          p_days: number;
          p_email: string;
          p_idempotency_key: string;
          p_token_hash: string;
        };
        Returns: {
          duplicate: boolean;
          invitation_id: string;
        }[];
      };
      admin_discard_access_request: { Args: { p_id: string }; Returns: undefined };
      admin_list_invitations: {
        Args: { p_limit?: number; p_offset?: number; p_q?: string; p_status?: string };
        Returns: {
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          last_sent_at: string;
          send_status: Database['public']['Enums']['email_send_status'];
          status: string;
          total_count: number;
        }[];
      };
      admin_list_organizations: {
        Args: { p_limit?: number; p_offset?: number; p_q?: string };
        Returns: {
          created_at: string;
          daily_limit: number;
          id: string;
          month_simulations: number;
          monthly_limit: number;
          name: string;
          status: Database['public']['Enums']['organization_status'];
          suspended_reason: string;
          total_count: number;
          type: Database['public']['Enums']['organization_type'];
        }[];
      };
      admin_mark_invitation_sent: { Args: { p_id: string; p_ok: boolean }; Returns: undefined };
      admin_resend_invitation: {
        Args: { p_idempotency_key: string; p_invitation_id: string; p_token_hash: string };
        Returns: {
          duplicate: boolean;
          invitation_id: string;
        }[];
      };
      admin_revoke_invitation: {
        Args: { p_id: string };
        Returns: {
          duplicate: boolean;
          invitation_id: string;
        }[];
      };
      admin_set_organization_status: {
        Args: {
          p_org: string;
          p_reason?: string;
          p_status: Database['public']['Enums']['organization_status'];
        };
        Returns: undefined;
      };
      admin_update_quota: {
        Args: { p_daily: number; p_monthly: number; p_org: string };
        Returns: undefined;
      };
      admin_usage_summary: {
        Args: { p_from: string; p_to: string };
        Returns: {
          estimated_cost_usd: number;
          input_tokens: number;
          organization_id: string;
          organization_name: string;
          output_tokens: number;
          simulations: number;
        }[];
      };
      begin_practice_turn: {
        Args: { p_client_message_id: string; p_session: string; p_text: string };
        Returns: {
          already_answered: boolean;
          buyer_seq: number;
          closed: boolean;
          seller_seq: number;
        }[];
      };
      check_practice_setup: {
        Args: { p_objection_ids: string[]; p_product: string };
        Returns: {
          objections: Json;
          product_version_id: string;
          sector: Database['public']['Enums']['product_sector'];
        }[];
      };
      check_rate_limit: {
        Args: {
          p_key: string;
          p_lockout?: string;
          p_max: number;
          p_scope: string;
          p_window: string;
        };
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      claim_practice_evaluation: { Args: { p_session: string }; Returns: Json };
      commit_practice_turn: {
        Args: {
          p_meta: Json;
          p_meta_status: Database['public']['Enums']['turn_meta_status'];
          p_provider_wait_ms: number;
          p_reply: string;
          p_seller_seq: number;
          p_session: string;
          p_user: string;
        };
        Returns: {
          buyer_seq: number;
          end_reason: Database['public']['Enums']['practice_end_reason'];
          ended: boolean;
          evaluation_status: Database['public']['Enums']['evaluation_status'];
          state: Json;
        }[];
      };
      create_configured_practice: {
        Args: { p_payload: Json; p_user: string };
        Returns: {
          duplicate: boolean;
          session_id: string;
        }[];
      };
      create_objection: {
        Args: {
          p_category: Database['public']['Enums']['objection_category'];
          p_product: string;
          p_text: string;
        };
        Returns: string;
      };
      create_product: {
        Args: { p_idempotency_key: string; p_org: string; p_payload: Json };
        Returns: {
          duplicate: boolean;
          product_id: string;
        }[];
      };
      delete_objection: { Args: { p_objection: string }; Returns: undefined };
      fail_practice_evaluation_attempt: {
        Args: { p_failure_code: string; p_session: string };
        Returns: {
          evaluation_status: Database['public']['Enums']['evaluation_status'];
        }[];
      };
      finish_practice_session: {
        Args: { p_session: string };
        Returns: {
          evaluation_status: Database['public']['Enums']['evaluation_status'];
        }[];
      };
      get_practice_turn_context: { Args: { p_session: string; p_user: string }; Returns: Json };
      get_request_context: { Args: Record<PropertyKey, never>; Returns: Json };
      insert_ai_usage: { Args: { p_row: Json }; Returns: undefined };
      invitation_status: {
        Args: { p_accepted_at: string; p_expires_at: string; p_revoked_at: string };
        Returns: string;
      };
      my_practice_history: {
        Args: {
          p_difficulty?: number;
          p_from?: string;
          p_limit?: number;
          p_offset?: number;
          p_product?: string;
          p_to?: string;
        };
        Returns: {
          difficulty: number;
          evaluation_status: Database['public']['Enums']['evaluation_status'];
          level: Database['public']['Enums']['score_level'];
          product_id: string;
          product_name: string;
          product_version: number;
          session_id: string;
          started_at: string;
          status: Database['public']['Enums']['practice_status'];
          total_count: number;
          total_score: number;
        }[];
      };
      my_practice_stage_averages: {
        Args: {
          p_difficulty?: number;
          p_from?: string;
          p_last_n?: number;
          p_product?: string;
          p_to?: string;
        };
        Returns: {
          avg_pct: number;
          evaluated_criteria: number;
          stage: Database['public']['Enums']['cautiva_stage'];
        }[];
      };
      practice_quota_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          daily_limit: number;
          daily_used: number;
          exhausted_scope: string;
          monthly_limit: number;
          monthly_used: number;
          remaining_month: number;
          remaining_today: number;
          renews_at: string;
          setup_failure_today: number;
          setup_retry_at: string;
          setup_success_today: number;
        }[];
      };
      record_practice_setup_failure: {
        Args: { p_failure_code: string; p_user: string };
        Returns: undefined;
      };
      record_rate_limit_event: { Args: { p_key: string; p_scope: string }; Returns: undefined };
      release_practice_turn: {
        Args: {
          p_provider_wait_ms: number;
          p_seller_seq: number;
          p_session: string;
          p_user: string;
        };
        Returns: undefined;
      };
      request_practice_hint: {
        Args: { p_session: string };
        Returns: {
          hints_used: number;
        }[];
      };
      retry_practice_evaluation: {
        Args: { p_session: string };
        Returns: {
          manual_retries_left: number;
        }[];
      };
      revoke_user_sessions: { Args: { p_user_id: string }; Returns: number };
      save_practice_evaluation: { Args: { p_payload: Json; p_session: string }; Returns: string };
      set_practice_evaluation_phase: {
        Args: { p_phase: Database['public']['Enums']['evaluation_phase']; p_session: string };
        Returns: undefined;
      };
      set_product_status: {
        Args: { p_product: string; p_status: Database['public']['Enums']['product_status'] };
        Returns: undefined;
      };
      start_practice_session: {
        Args: { p_session: string };
        Returns: {
          already_active: boolean;
          session_id: string;
        }[];
      };
      update_my_profile: { Args: { p_full_name: string; p_timezone: string }; Returns: undefined };
      update_objection: {
        Args: {
          p_category: Database['public']['Enums']['objection_category'];
          p_objection: string;
          p_text: string;
        };
        Returns: undefined;
      };
      update_product: {
        Args: { p_expected_version: number; p_payload: Json; p_product: string };
        Returns: {
          unchanged: boolean;
          version: number;
        }[];
      };
      write_audit: {
        Args: {
          p_action: string;
          p_actor_label: string;
          p_actor_type: Database['public']['Enums']['audit_actor_type'];
          p_actor_user_id: string;
          p_data?: Json;
          p_object_id: string;
          p_object_type: string;
          p_org: string;
          p_result?: Database['public']['Enums']['audit_result'];
        };
        Returns: number;
      };
    };
    Enums: {
      access_request_status: 'new' | 'invited' | 'discarded';
      ai_call_outcome: 'success' | 'retry' | 'failure';
      ai_task: 'tutor' | 'buyer' | 'evaluator' | 'embedding' | 'buyer_setup';
      audit_actor_type: 'user' | 'system' | 'operator';
      audit_result: 'success' | 'failure';
      cautiva_stage: 'conoce' | 'aumenta' | 'une' | 'transforma' | 'innova' | 'vende' | 'asegura';
      criterion_status: 'evaluated' | 'no_evaluable';
      email_send_status: 'pending' | 'sent' | 'failed';
      ethical_flag_type: 'unfounded_promise' | 'undue_pressure';
      evaluation_phase: 'reading' | 'scoring' | 'reporting';
      evaluation_status: 'pending' | 'in_progress' | 'failed' | 'unavailable' | 'not_applicable';
      legal_document_kind: 'terms' | 'ai_notice' | 'privacy';
      membership_status: 'invited' | 'active' | 'suspended';
      message_author: 'seller' | 'buyer';
      objection_category:
        'price' | 'trust' | 'time' | 'competition' | 'logistics' | 'decision_maker';
      onboarding_status: 'pending' | 'in_progress' | 'completed' | 'skipped';
      org_role: 'admin_empresa' | 'supervisor' | 'instructor' | 'vendedor';
      organization_status: 'active' | 'suspended';
      organization_type: 'personal' | 'empresa';
      practice_end_reason:
        'goal_achieved' | 'buyer_abandoned' | 'message_limit' | 'time_limit' | 'seller_ended';
      practice_status: 'configured' | 'active' | 'finalized' | 'evaluated' | 'discarded';
      price_kind: 'fixed' | 'range';
      product_sector:
        | 'real_estate'
        | 'hardware'
        | 'telecom'
        | 'cooperative'
        | 'restaurants'
        | 'education'
        | 'b2b_services'
        | 'other';
      product_status: 'active' | 'archived';
      revealable_key: 'budget' | 'timeline' | 'decision_maker';
      score_level: 'reinforcement' | 'developing' | 'competent' | 'advanced';
      setup_outcome: 'success' | 'failure';
      turn_meta_status: 'valid' | 'corrected' | 'fallback';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_request_status: ['new', 'invited', 'discarded'],
      ai_call_outcome: ['success', 'retry', 'failure'],
      ai_task: ['tutor', 'buyer', 'evaluator', 'embedding', 'buyer_setup'],
      audit_actor_type: ['user', 'system', 'operator'],
      audit_result: ['success', 'failure'],
      cautiva_stage: ['conoce', 'aumenta', 'une', 'transforma', 'innova', 'vende', 'asegura'],
      criterion_status: ['evaluated', 'no_evaluable'],
      email_send_status: ['pending', 'sent', 'failed'],
      ethical_flag_type: ['unfounded_promise', 'undue_pressure'],
      evaluation_phase: ['reading', 'scoring', 'reporting'],
      evaluation_status: ['pending', 'in_progress', 'failed', 'unavailable', 'not_applicable'],
      legal_document_kind: ['terms', 'ai_notice', 'privacy'],
      membership_status: ['invited', 'active', 'suspended'],
      message_author: ['seller', 'buyer'],
      objection_category: ['price', 'trust', 'time', 'competition', 'logistics', 'decision_maker'],
      onboarding_status: ['pending', 'in_progress', 'completed', 'skipped'],
      org_role: ['admin_empresa', 'supervisor', 'instructor', 'vendedor'],
      organization_status: ['active', 'suspended'],
      organization_type: ['personal', 'empresa'],
      practice_end_reason: [
        'goal_achieved',
        'buyer_abandoned',
        'message_limit',
        'time_limit',
        'seller_ended',
      ],
      practice_status: ['configured', 'active', 'finalized', 'evaluated', 'discarded'],
      price_kind: ['fixed', 'range'],
      product_sector: [
        'real_estate',
        'hardware',
        'telecom',
        'cooperative',
        'restaurants',
        'education',
        'b2b_services',
        'other',
      ],
      product_status: ['active', 'archived'],
      revealable_key: ['budget', 'timeline', 'decision_maker'],
      score_level: ['reinforcement', 'developing', 'competent', 'advanced'],
      setup_outcome: ['success', 'failure'],
      turn_meta_status: ['valid', 'corrected', 'fallback'],
    },
  },
} as const;
