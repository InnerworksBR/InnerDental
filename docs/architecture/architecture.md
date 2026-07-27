# Arquitetura

## Contexto e requisitos aprovados

Luna Agenda é um portal de agendamento odontológico. Google Calendar é a fonte de ocupação; Supabase/PostgreSQL mantém estado transacional, auditoria e outbox; Evolution API transporta mensagens WhatsApp.

## Componentes e limites

- Next.js: portal e APIs transacionais.
- PostgreSQL/Supabase: dados, RLS, auditoria, outbox e locks.
- Worker TypeScript: consome outbox, entrega mensagens e agenda lembretes.
- Evolution API: borda externa de WhatsApp.

## Contratos e integrações

O processo web produz eventos na `notification_outbox`. O worker reivindica eventos de forma concorrente segura, chama a Evolution API e marca o resultado. Falhas de mensageria não revertem agendamentos.

Encaminhamentos humanos usam a RPC `enqueue_human_handoff`: o registro em `human_handoffs` e o evento `human_handoff.created` são criados na mesma transação, com `dedupe_key` estável. O worker resolve o nome pelo telefone somente no envio e entrega nome, número e motivo ao `HANDOFF_NOTIFICATION_PHONE`; nenhum desses dados é incluído em logs operacionais.

## Segurança

Tokens e OTPs são persistidos somente como hash. Credenciais ficam no servidor/worker. O portal não acessa tabelas diretamente; RLS nega `anon` e `authenticated` por padrão.

## Testes

Testar outbox, retries, deduplicação de webhook, contratos Evolution e falhas de entrega em sandbox. Testar que o worker não chama APIs de disponibilidade/agendamento.

## Deploy e rollback

Deploy contém serviços separados web e worker. Rollback do worker pausa consumo e preserva outbox; nenhuma mensagem pendente é apagada.

Em produção, somente o Next.js cruza a borda HTTPS do EasyPanel. O worker compartilha apenas a rede de backplane, não publica porta e expõe health/métricas exclusivamente para coletores internos. Web e worker devem carregar a mesma revisão OCI e ser promovidos por digest, sem rebuild entre ambientes.

## Riscos e ADRs

Ver [ADR-001](decisions/ADR-001-worker-para-mensageria.md), [ADR-002](decisions/ADR-002-acesso-interno-supabase-auth.md) e [ADR-003](decisions/ADR-003-bloqueio-integral-calendar.md).

## Painel operacional interno — requisitos RF-016 a RF-023

### Contexto e limites

O painel interno complementa o portal do paciente. Ele não substitui o Google Calendar e não é acessível pela sessão de telefone do paciente. O desenvolvedor é o proprietário dos acessos; ele pode convidar a dentista como operadora interna.

### Componentes e responsabilidades

- **Área interna Next.js:** páginas de login, agenda, consultas, atividade do agente e incidentes. Toda rota `/interno` exige sessão Supabase Auth e perfil interno ativo.
- **API administrativa:** expõe somente consultas e mutações autorizadas. Criação, remarcação e cancelamento reutilizam as regras transacionais atuais; as rotas nunca recebem a chave de serviço no navegador.
- **Supabase Auth:** autentica colaboradores internos por convite; a autorização do produto fica na tabela de perfis internos, vinculada ao `auth.users`.
- **Supabase/PostgreSQL:** preserva consultas, auditoria, outbox, inbox de WhatsApp e acrescenta perfis internos, incidentes e bloqueios administrativos.
- **Google Calendar:** continua a fonte de ocupação. Um bloqueio integral só é concluído após a criação do evento de dia inteiro no calendário.
- **Worker:** permanece responsável apenas pelo processamento assíncrono de inbox/outbox. O painel o observa; não transfere para ele decisões transacionais de agenda.

### Contratos administrativos propostos

| Contrato | Responsabilidade | Requisitos |
|---|---|---|
| `GET /api/admin/dashboard` | agenda do dia, pendências e contadores | RF-017, RF-020, RF-021 |
| `GET /api/admin/agenda` | consultas e bloqueios por período/profissional | RF-017, RF-018 |
| `GET /api/admin/appointments` e detalhe | busca por data, telefone, consulta ou correlação | RF-018 |
| `POST /api/admin/appointments` | criar consulta manual com confirmação | RF-019, RF-022 |
| `POST /api/admin/appointments/:id/reschedule` e `/cancel` | operar consulta existente com as garantias do portal | RF-019, RF-022 |
| `POST /api/admin/blocks/full-day` | criar bloqueio de dia inteiro no Calendar e registrar a operação | RF-023 |
| `GET /api/admin/activity` | inbox/outbox, intenção, estado e falha segura | RF-020 |
| `GET/PATCH /api/admin/incidents/:id` | pesquisar, anotar e encerrar incidentes | RF-021, RF-022 |
| `POST /api/admin/users/invite` | convidar a dentista; somente proprietário | RF-016, RNF-015 |

Todas as mutações exigem confirmação na interface, `idempotencyKey`, correlation ID e auditoria. Erros externos retornam uma categoria segura e criam ou vinculam um incidente; detalhes de credenciais, headers e payloads brutos não são retornados.

### Modelo de dados proposto

| Entidade | Campos essenciais | Finalidade |
|---|---|---|
| `internal_profiles` | `user_id`, `role` (`owner`/`operator`), `active`, `created_at` | autorização interna, vinculada a `auth.users` |
| `operational_incidents` | `id`, `category`, `status`, `correlation_id`, `appointment_id`, `opened_at`, `resolved_at` | ciclo de vida de falhas operacionais |
| `operational_incident_notes` | `incident_id`, `author_id`, `body`, `created_at` | notas e encerramento preservando histórico |
| `calendar_blocks` | `id`, `professional_id`, `date`, `calendar_event_id`, `status`, `created_by`, `idempotency_key` | bloqueio integral e reconciliação com Calendar |

As tabelas existentes `appointments`, `audit_logs`, `notification_outbox`, `whatsapp_inbox`, `human_handoffs` e `appointment_operations` são fontes de consulta para a agenda e atividade. `audit_logs.metadata` deve permanecer sanitizado; novos eventos administrativos devem registrar apenas identificadores e dados operacionais mínimos.

### Fluxos críticos

**Bloqueio de dia inteiro:** validar sessão interna e papel → validar profissional/data → iniciar operação idempotente → criar evento all-day no Google Calendar → persistir `calendar_blocks` e auditoria → expor bloqueio na agenda. Se a persistência local falhar após sucesso externo, marcar reconciliação/incidente; nunca responder sucesso silencioso.

**Investigação de erro:** pesquisar consulta/telefone/correlation ID → correlacionar auditoria, operação, inbox/outbox e incidente → mostrar origem, horário, estado e mensagem segura → adicionar nota ou encerrar. A ausência de um registro é exibida como ausência de correlação, não como sucesso.

**Ação administrativa sobre consulta:** autenticar operador → confirmar intenção → executar a mesma verificação fresca de Calendar usada pelo portal → alterar o evento → persistir a consulta → auditar e enfileirar notificação. Falha do Calendar fecha a operação.

### Segurança e privacidade

- Supabase Auth será exclusivo para usuários internos; cookies/sessões do paciente não concedem acesso administrativo.
- RLS começa negando acesso direto a `anon` e pacientes. A API verifica perfil interno no servidor; o proprietário é o único papel que convida/revoga usuários.
- Listas mascaram telefones. O detalhe completo exige perfil ativo. Nenhuma tela ou log do painel exibe chave privada, token, API key, header de webhook ou payload bruto.
- Ações de escrita registram autor autenticado, origem `admin`, resultado e correlação. Encerrar incidente não apaga dados.

### Testes

- Unitários para papel interno, mascaramento, filtros, classificação e transições de incidente.
- Integração/RLS para anonimato, paciente, operador e proprietário; testes de convite somente pelo proprietário.
- Contrato para todas as rotas administrativas, inclusive `401`, `403`, `409` e `503`.
- Integração Calendar sandbox para bloqueio all-day, falha parcial e reconciliação.
- E2E: login interno, visualização da agenda, busca de falha, criação de bloqueio e confirmação de indisponibilidade no portal.

### Deploy, rollout e rollback

Aplicar migrations aditivas após revisão de RLS; criar o primeiro proprietário por procedimento controlado; habilitar o menu interno apenas depois do smoke com login e Calendar sandbox. Rollback desabilita as rotas e UI internas, preservando perfis, auditoria, incidentes e eventos Calendar para reconciliação. Não apagar bloqueios externos automaticamente.

### Riscos e pendências antes da implementação

- A criação do primeiro proprietário e o envio de convite via Supabase Auth exigem aprovação operacional específica, pois criam acesso externo.
- Migrations de perfis/incidentes/bloqueios e as políticas RLS requerem revisão e aprovação específicas.
- Definir prazo de retenção para incidentes e atividade de WhatsApp.
- Confirmar se o reenfileiramento manual de notificações entra nesta versão; permanece fora do contrato atual.

## Central de gestão — requisitos RF-047 a RF-056

### Componentes e contratos

- **`AdminManagement`:** interface mobile-first dentro da aba Gestão, com navegação interna por cadastros; operadores recebem projeção somente leitura e proprietários recebem formulários.
- **`GET /api/admin/management`:** snapshot sanitizado de procedimentos, planos/aliases/coberturas, profissionais, regras/exceções, FAQs, pacientes, equipe e auditoria recente.
- **`POST /api/admin/management`:** endpoint de comandos com união discriminada, validação Zod, origem confiável e autorização de proprietário para configurações/acessos; correção de paciente aceita operador.
- **`lib/admin/management`:** concentra consultas, validação cruzada, desativação lógica, convite Supabase Auth e auditoria explícita.
- **Consumidores existentes:** portal e worker continuam lendo as tabelas canônicas; aliases e exceções passam a filtrar `active = true`.

### Dados e consistência

A migration aditiva acrescenta `active` a `insurance_aliases` e `availability_exceptions`, preservando registros removidos da operação. Planos, procedimentos, profissionais e FAQs já possuem o campo. Coberturas são atualizadas por par único sem exclusão. Pacientes permitem apenas correção de nome e plano. O telefone permanece identificador imutável no fluxo de gestão comum.

Cada comando calcula campos alterados e grava `audit_logs` com `actor_id`, origem `internal_management` e metadados mínimos. Tabelas técnicas não recebem comando de edição. Aliases ativos são comparados de forma normalizada contra aliases e nomes canônicos para evitar resolução ambígua no WhatsApp.

### Segurança, rollout e rollback

Leitura exige perfil interno ativo. Configuração e acesso exigem `owner`; paciente aceita `owner` ou `operator`. Toda escrita exige proteção de origem já usada pelo painel. Convites são enviados apenas quando um proprietário aciona explicitamente a interface. Rollback da aplicação remove a UI/rotas; a migration é mantida porque é aditiva e valores `active = true` preservam o comportamento anterior. Nenhuma migration ou convite é executado durante build/teste local.

### Decisão

Ver [ADR-004](decisions/ADR-004-central-gestao-comandos-auditados.md).
