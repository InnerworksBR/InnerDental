-- Adiciona Santa Casa Saúde ao catálogo de planos aceitos pela clínica.

insert into public.insurance_plans (name, active, instructions)
values ('Santa Casa Saúde', true, null)
on conflict (name) do update
set active = true;
