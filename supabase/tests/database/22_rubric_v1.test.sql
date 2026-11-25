-- T022 — "Ventas consultivas 1.0" (FR-037): single current version, 7 criteria with their keys,
-- weights (sum 100), positions and Cautiva stages; private.assert_rubric_complete rejects gaps.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  (select count(*)::int from public.rubrics where is_current),
  1, 'exactly one current rubric'
);
select results_eq(
  $$ select id, name, version from public.rubrics where is_current $$,
  $$ values ('00000000-0000-4000-8000-0000000000a1'::uuid, 'Ventas consultivas'::text, '1.0'::text) $$,
  'the current rubric is Ventas consultivas 1.0'
);
select results_eq(
  $$
    select position::int, key, weight::int, stages::text
      from public.rubric_criteria
     where rubric_id = '00000000-0000-4000-8000-0000000000a1'
     order by position
  $$,
  $$
    values
      (1, 'first_impression', 10, '{conoce}'),
      (2, 'diagnosis', 20, '{conoce}'),
      (3, 'active_listening', 10, '{une}'),
      (4, 'value_argument', 20, '{aumenta,transforma}'),
      (5, 'objection_handling', 15, '{innova}'),
      (6, 'negotiation_close', 15, '{vende}'),
      (7, 'follow_up', 10, '{asegura}')
  $$,
  'criteria keys, weights, positions and stages match FR-037'
);
select is(
  (select sum(weight)::int from public.rubric_criteria where rubric_id = '00000000-0000-4000-8000-0000000000a1'),
  100, 'weights sum 100'
);
select lives_ok(
  $$ select private.assert_rubric_complete('00000000-0000-4000-8000-0000000000a1') $$,
  'the seeded rubric is complete'
);

-- A draft rubric (not current) to exercise the completeness check.
insert into public.rubrics (id, slug, name, version, is_current, published_at)
values ('00000000-0000-4000-8000-0000000000f1', 'ventas-consultivas', 'Borrador', '9.0', false, now());
insert into public.rubric_criteria (rubric_id, key, name, weight, stages, description, anchors, position)
select '00000000-0000-4000-8000-0000000000f1', key, name, weight, stages, description, anchors, position
  from public.rubric_criteria
 where rubric_id = '00000000-0000-4000-8000-0000000000a1' and key <> 'follow_up';

select throws_ok(
  $$ select private.assert_rubric_complete('00000000-0000-4000-8000-0000000000f1') $$,
  '23514', null, 'a rubric whose weights do not sum 100 is incomplete'
);

insert into public.rubric_criteria (rubric_id, key, name, weight, stages, description, anchors, position)
values ('00000000-0000-4000-8000-0000000000f1', 'closing_extra', 'Extra', 10, '{vende}', 'Extra',
  '{"low": "a", "mid": "b", "high": "c"}', 7);

select throws_ok(
  $$ select private.assert_rubric_complete('00000000-0000-4000-8000-0000000000f1') $$,
  '23514', null, 'a rubric that does not cover every Cautiva stage is incomplete'
);

select throws_ok(
  $$ insert into public.rubrics (slug, name, version, is_current, published_at) values ('ventas-consultivas', 'Otra', '9.1', true, now()) $$,
  '23505', null, 'only one current version per slug'
);

select * from finish();
rollback;
