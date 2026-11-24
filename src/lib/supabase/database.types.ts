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
          created_at: string;
          estimated_cost_usd: number;
          id: number;
          input_tokens: number;
          latency_ms: number;
          model: string;
          organization_id: string;
          output_tokens: number;
          simulation_id: string | null;
          task: Database['public']['Enums']['ai_task'];
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          estimated_cost_usd: number;
          id?: never;
          input_tokens: number;
          latency_ms: number;
          model: string;
          organization_id: string;
          output_tokens: number;
          simulation_id?: string | null;
          task: Database['public']['Enums']['ai_task'];
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          estimated_cost_usd?: number;
          id?: never;
          input_tokens?: number;
          latency_ms?: number;
          model?: string;
          organization_id?: string;
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
      get_request_context: { Args: Record<PropertyKey, never>; Returns: Json };
      invitation_status: {
        Args: { p_accepted_at: string; p_expires_at: string; p_revoked_at: string };
        Returns: string;
      };
      record_rate_limit_event: { Args: { p_key: string; p_scope: string }; Returns: undefined };
      revoke_user_sessions: { Args: { p_user_id: string }; Returns: number };
      update_my_profile: { Args: { p_full_name: string; p_timezone: string }; Returns: undefined };
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
      ai_task: 'tutor' | 'buyer' | 'evaluator' | 'embedding';
      audit_actor_type: 'user' | 'system' | 'operator';
      audit_result: 'success' | 'failure';
      email_send_status: 'pending' | 'sent' | 'failed';
      legal_document_kind: 'terms' | 'ai_notice' | 'privacy';
      membership_status: 'invited' | 'active' | 'suspended';
      onboarding_status: 'pending' | 'in_progress' | 'completed' | 'skipped';
      org_role: 'admin_empresa' | 'supervisor' | 'instructor' | 'vendedor';
      organization_status: 'active' | 'suspended';
      organization_type: 'personal' | 'empresa';
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
      ai_task: ['tutor', 'buyer', 'evaluator', 'embedding'],
      audit_actor_type: ['user', 'system', 'operator'],
      audit_result: ['success', 'failure'],
      email_send_status: ['pending', 'sent', 'failed'],
      legal_document_kind: ['terms', 'ai_notice', 'privacy'],
      membership_status: ['invited', 'active', 'suspended'],
      onboarding_status: ['pending', 'in_progress', 'completed', 'skipped'],
      org_role: ['admin_empresa', 'supervisor', 'instructor', 'vendedor'],
      organization_status: ['active', 'suspended'],
      organization_type: ['personal', 'empresa'],
    },
  },
} as const;
