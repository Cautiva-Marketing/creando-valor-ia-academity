-- Migration: extensions, private schema, default privileges and enumerated types (T012)
--
-- Rollback (inverse migration, run in a new migration if ever needed):
--   drop type if exists public.ai_task, public.audit_result, public.audit_actor_type,
--     public.onboarding_status, public.legal_document_kind, public.access_request_status,
--     public.email_send_status, public.membership_status, public.org_role,
--     public.organization_status, public.organization_type;
--   alter default privileges for role postgres in schema public
--     grant all on tables to anon, authenticated;
--   alter default privileges for role postgres in schema public
--     grant all on functions to anon, authenticated;
--   drop schema if exists private cascade;
--   drop extension if exists unaccent; drop extension if exists pg_cron;

-- Extensions --------------------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Private schema: helpers and infrastructure, never exposed by PostgREST ----------------------------
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

-- Explicit grants only (Constitution I/II): new tables and functions created by `postgres` in
-- `public` do not get automatic privileges for the Data API roles.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke execute on functions from public;

-- Enumerated types (data-model.md → "Tipos enumerados") --------------------------------------------
create type public.organization_type as enum ('personal', 'empresa');
create type public.organization_status as enum ('active', 'suspended');
create type public.org_role as enum ('admin_empresa', 'supervisor', 'instructor', 'vendedor');
create type public.membership_status as enum ('invited', 'active', 'suspended');
create type public.email_send_status as enum ('pending', 'sent', 'failed');
create type public.access_request_status as enum ('new', 'invited', 'discarded');
create type public.legal_document_kind as enum ('terms', 'ai_notice', 'privacy');
create type public.onboarding_status as enum ('pending', 'in_progress', 'completed', 'skipped');
create type public.audit_actor_type as enum ('user', 'system', 'operator');
create type public.audit_result as enum ('success', 'failure');
create type public.ai_task as enum ('tutor', 'buyer', 'evaluator', 'embedding');
