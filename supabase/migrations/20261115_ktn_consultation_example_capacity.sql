begin;

alter table public.ktn_consultation_guidance
  drop constraint ktn_consultation_guidance_examples_check,
  add constraint ktn_consultation_guidance_examples_check
    check (jsonb_typeof(examples) = 'array' and jsonb_array_length(examples) <= 120);

commit;
