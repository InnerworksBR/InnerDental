-- Cadastra limpeza como procedimento aceito para iniciar agendamento online.

insert into public.procedures (name, description, online_booking, active)
values ('Limpeza', 'Agendamento online iniciado por consulta de avaliação.', true, true)
on conflict (name) do update
set description = excluded.description,
    online_booking = excluded.online_booking,
    active = excluded.active;
