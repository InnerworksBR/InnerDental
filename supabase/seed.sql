-- Dados operacionais iniciais. Seguro para execução repetida; não inclui pacientes.

insert into public.professionals (name, calendar_id)
values ('Profissional padrão', 'CONFIGURE_GOOGLE_CALENDAR_ID')
on conflict (calendar_id) do update set name = excluded.name;

insert into public.availability_rules (professional_id, weekday, start_time, end_time)
select p.id, schedule.weekday, schedule.start_time, schedule.end_time
from public.professionals p
cross join (
  values
    (1::smallint, '08:00'::time, '12:00'::time),
    (1::smallint, '14:00'::time, '18:00'::time),
    (2::smallint, '08:00'::time, '12:00'::time),
    (2::smallint, '14:00'::time, '18:00'::time),
    (3::smallint, '08:00'::time, '12:00'::time),
    (4::smallint, '08:00'::time, '12:00'::time),
    (4::smallint, '14:00'::time, '18:00'::time),
    (5::smallint, '08:00'::time, '12:00'::time),
    (5::smallint, '14:00'::time, '17:00'::time)
) as schedule(weekday, start_time, end_time)
where p.calendar_id = 'CONFIGURE_GOOGLE_CALENDAR_ID'
on conflict (professional_id, weekday, start_time, end_time) do nothing;

insert into public.insurance_plans (name, active, instructions)
values
  ('Rede UNNA', true, null),
  ('Odontoprev', true, null),
  ('Bradesco Dental', true, null),
  ('BB Dental', true, null),
  ('Previan', true, null),
  ('Unimed Odonto', true, null),
  ('SulAmérica', true, null),
  ('Amil Dental', true, null),
  ('Uniodonto', true, null),
  ('MetLife', true, null),
  ('Caixa de Pecúlio de São Vicente', false, 'Não é mais atendido pela Dra. Tarcília.'),
  ('Caixa de Saúde de São Vicente', false, 'Não é mais atendido pela Dra. Tarcília.')
on conflict (name) do update set active = excluded.active, instructions = excluded.instructions;

insert into public.insurance_aliases (insurance_plan_id, alias)
select plan.id, alias.alias
from public.insurance_plans plan
join (
  values
    ('Rede UNNA', 'Bradesco Dental'),
    ('Rede UNNA', 'Odontoprev'),
    ('Rede UNNA', 'BB Dental'),
    ('Rede UNNA', 'Previan')
) as alias(plan_name, alias) on alias.plan_name = plan.name
on conflict (insurance_plan_id, alias) do nothing;

insert into public.procedures (name, description, online_booking, active)
values
  ('Consulta padrão', 'Agendamento online de avaliação em janela de 15 minutos.', true, true),
  ('Prótese', 'Conforme plano; iniciar por avaliação.', true, true),
  ('Ortodontia', 'Conforme plano; iniciar por avaliação.', true, true),
  ('Canal em molar', 'Não realizado.', false, false),
  ('Extração de siso', 'Apenas particular; encaminhar para avaliação.', false, true),
  ('Urgência', 'Encaminhar para avaliação.', false, true)
on conflict (name) do update set description = excluded.description, online_booking = excluded.online_booking, active = excluded.active;

insert into public.faq_entries (category, question, answer)
values
  ('agendamento', 'Como marcar, remarcar ou cancelar?', 'Acesse o link de gerenciamento de consulta enviado pela clínica.'),
  ('planos', 'Quais planos são aceitos?', 'Consulte o plano desejado pelo atendimento; a resposta será baseada no cadastro atualizado.'),
  ('atendimento_humano', 'Preciso falar com a equipe.', 'Vou encaminhar sua mensagem para a equipe responsável.')
on conflict (category, question) do update set answer = excluded.answer, active = true;
