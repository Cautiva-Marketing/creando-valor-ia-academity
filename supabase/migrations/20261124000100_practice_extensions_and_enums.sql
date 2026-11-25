-- Migration: 002 extensions and enumerated types (T009) — data-model.md → "Tipos enumerados nuevos"
--
-- Rollback (inverse migration, run in a new migration if ever needed):
--   drop type if exists public.ai_call_outcome, public.setup_outcome, public.ethical_flag_type,
--     public.score_level, public.criterion_status, public.revealable_key, public.turn_meta_status,
--     public.message_author, public.practice_end_reason, public.evaluation_phase,
--     public.evaluation_status, public.practice_status, public.cautiva_stage,
--     public.objection_category, public.price_kind, public.product_status, public.product_sector;
--   -- `ai_task` keeps 'buyer_setup' (Postgres cannot drop enum values; recreate the type if needed).
--   drop extension if exists pg_net;   -- only if nothing else uses it

-- Extensions (included in Supabase at no cost): pg_net for the evaluation dispatcher and Vault for
-- its URL/secret (research.md §R8).
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create type public.product_sector as enum (
  'real_estate', 'hardware', 'telecom', 'cooperative', 'restaurants', 'education', 'b2b_services', 'other'
);
create type public.product_status as enum ('active', 'archived');
create type public.price_kind as enum ('fixed', 'range');
create type public.objection_category as enum (
  'price', 'trust', 'time', 'competition', 'logistics', 'decision_maker'
);
-- Canonical C.A.U.T.I.V.A.™ order (enum order is used for sorting).
create type public.cautiva_stage as enum (
  'conoce', 'aumenta', 'une', 'transforma', 'innova', 'vende', 'asegura'
);
create type public.practice_status as enum ('configured', 'active', 'finalized', 'evaluated', 'discarded');
create type public.evaluation_status as enum (
  'pending', 'in_progress', 'failed', 'unavailable', 'not_applicable'
);
create type public.evaluation_phase as enum ('reading', 'scoring', 'reporting');
create type public.practice_end_reason as enum (
  'goal_achieved', 'buyer_abandoned', 'message_limit', 'time_limit', 'seller_ended'
);
create type public.message_author as enum ('seller', 'buyer');
create type public.turn_meta_status as enum ('valid', 'corrected', 'fallback');
create type public.revealable_key as enum ('budget', 'timeline', 'decision_maker');
create type public.criterion_status as enum ('evaluated', 'no_evaluable');
create type public.score_level as enum ('reinforcement', 'developing', 'competent', 'advanced');
create type public.ethical_flag_type as enum ('unfounded_promise', 'undue_pressure');
create type public.setup_outcome as enum ('success', 'failure');
create type public.ai_call_outcome as enum ('success', 'retry', 'failure');

-- The buyer persona generation is its own AI task (buyer = turns, evaluator = evaluation).
alter type public.ai_task add value if not exists 'buyer_setup';
