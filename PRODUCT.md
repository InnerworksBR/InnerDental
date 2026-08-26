# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Doutora Priscila (operadora interna, papel `operator`).** Dentista em clínica solo no Brasil; usa o Google Calendar como agenda do dia-a-dia. Não opera infraestrutura, banco de dados nem build. Espera supervisão consolidada do que o agente WhatsApp fez sem precisar trocar de ferramenta.
- **Paciente (pessoa física brasileira, sem login tradicional).** Entra por um link recebido no WhatsApp; autentica por código OTP de uso único enviado ao mesmo telefone. Tarefas principais: ver próxima consulta, remarcar, cancelar, marcar nova consulta (individual ou em dupla) e confirmar presença.
- **Proprietário do painel (papel `owner`).** Desenvolvedor responsável; primeiro usuário interno, responsável por convidar/revogar a doutora e manter cadastros. Não atende pacientes pelo portal.

## Product Purpose

Luna Agenda é o portal de agendamento odontológico da clínica da Dra. Priscila. O produto resolve três problemas de uma vez:

1. O paciente agenda, remarca, cancela, marca em dupla e confirma presença sozinho, conversando com o agente Luna no WhatsApp — sem recepção humana no caminho.
2. A doutora continua usando o Google Calendar como agenda oficial; o portal e o agente só escrevem lá.
3. Quando algo falha, o painel interno permite investigar por correlation ID, ver a mensagem segura do erro, abrir incidente, anotar e encerrar — sem precisar abrir terminal.

Sucesso = a doutora passa a usar o portal como visão de supervisão, o paciente resolve tudo no WhatsApp, e nenhuma falha operacional relevante fica sem trilha.

## Positioning

Luna Agenda não é "mais um bot de WhatsApp para clínica". O que diferencia, na ordem do que importa:

- **Google Calendar é a fonte canônica de ocupação.** Portal e agente não mantêm agenda paralela; toda criação, remarcação, cancelamento e bloqueio de dia inteiro exige o evento correspondente no Calendar antes de ser considerado confirmado. Mudança de IP, troca de máquina ou criação manual direto no Calendar não geram conflito nem duplicam paciente.
- **Painel interno com auditoria, incidentes e gestão.** RF-016 a RF-060 entregam ao `owner` e à `operator` o que nenhuma agenda pessoal entrega: visão de hoje/semana, criação administrativa, fila de mensagens, falhas com correlation ID, encerramento de incidente com nota, gestão de procedimentos/planos/profissionais/FAQs/pacientes/cobertura/equipe — tudo com auditoria e desativação lógica.
- **Mensageria confiável.** Toda mensagem passa por outbox, dedupe, correlation ID, retries; falhas do WhatsApp não revertem consultas; o nome da segunda pessoa em atendimento conjunto não é persistido em nenhuma tabela.

## Operating Context

- **Ponto de entrada do paciente:** conversa no WhatsApp com o número configurado da doutora. Mensagens com horário comercial (timezone America/Sao_Paulo). Confirmações de presença são disparadas às 20h do dia anterior; resumo diário à doutora sai pela manhã em horário configurável (padrão 08h).
- **Agenda da doutora:** Google Calendar (única agenda oficial). Eventos criados direto no Calendar podem ser importados pelo sistema quando seguem o padrão `Nome Telefone` e bloqueiam o horário — ver RF-060.
- **Painel interno:** rota `/interno`, exige sessão Supabase Auth + perfil interno ativo. Sessão do paciente não dá acesso administrativo. `owner` é o único papel que convida/revoga; `operator` é leitura nas configurações.
- **Infraestrutura:** Next.js 16.2.11 (App Router, React 19, Tailwind 4) para o portal; worker TypeScript separado consome a `notification_outbox` e entrega mensagens pela Evolution API. Supabase/PostgreSQL guarda estado transacional, auditoria, outbox e RLS. Tudo via HTTPS; chave de serviço nunca vai para o navegador.
- **Materiais de apoio já existentes no repositório:** `docs/Manual_Luna_Agenda_para_a_Doutora.{pdf,docx}` (manual da doutora), `docs/architecture/architecture.md` e ADRs 001 a 004 (decisões), protótipos exportados em `design/telas-da-aplica-o/project/`.

## Capabilities and Constraints

**Capacidades confirmadas:**

- Agendamento individual (15 min) e em dupla (30 min contínuos exigindo dois slots consecutivos livres); o segundo nome só existe no evento do Calendar daquela consulta — não é persistido, auditado nem logado.
- Login do paciente por código OTP de uso único enviado ao próprio telefone; tokens e códigos persistidos apenas como hash.
- Login interno por e-mail/senha (Supabase Auth) com perfis `owner` e `operator`.
- Painel interno com visão de hoje e semana, detalhe de consulta com identificador do evento Calendar e correlation ID, criação/remarcação/cancelamento administrativos com confirmação explícita, bloqueio de dia inteiro, fila de mensagens e outbox, classificação de falha (`validação`, `Google Calendar`, `Supabase`, `Evolution`, `worker`, `desconhecida`), incidentes com nota, central de gestão (procedimentos, planos/aliases/cobertura, disponibilidade, profissionais, FAQs, pacientes, equipe, auditoria recente).
- Confirmação de presença via WhatsApp às 20h do dia anterior; resposta `confirmo` confirma automaticamente apenas quando há uma única consulta futura elegível para o telefone remetente; ambiguidade leva o paciente à agenda segura.
- Resumo diário à doutora com `X de Y` confirmados e nome + telefone dos não confirmados.
- Importação controlada de eventos diretos do Calendar para confirmações e resumo, somente quando o título casa `Nome Telefone`, duração é 15 ou 30 min, evento não é transparente nem integral e não é bloqueio.

**Constraints técnicas e de produto:**

- Toda mutação de agenda exige idempotency key, correlation ID e auditoria; falhas externas retornam categoria segura e abrem/vinculam incidente; credenciais, headers de webhook e payloads brutos nunca saem em resposta nem em log.
- Listagens mascaram telefone; detalhe só mostra o número completo para perfil interno ativo.
- Procedimentos, planos, profissionais, FAQs, aliases e exceções usam desativação lógica (`active = false`), nunca exclusão física.
- Filas, tokens, holds, inbox, outbox e logs não são editáveis pela UI; mudanças operacionais serão comandos auditados.
- A doutora continua usando o Google Calendar como ferramenta; o painel não substitui a agenda dela.
- Fora do escopo da versão atual: prontuário, dados clínicos, pagamentos, relatórios financeiros, campanhas, múltiplas unidades, permissões granulares por equipe, dashboard gerencial avançado.

## Brand Commitments

- **Nome:** Luna Agenda. Marca registrada visualmente por um quadrado verde escuro com a letra `L` branca (tema claro) ou verde claro com `L` escura (tema escuro).
- **Tipografia:** `Bricolage Grotesque` para títulos e números em destaque (sensação editorial/calma), `Instrument Sans` para corpo de texto. Já carregadas no `globals.css`.
- **Paleta (já no produto):** portal do paciente é claro, com fundo `#f8f7f3`/gradiente bege, primária `#16655b` (verde-petróleo profundo), texto `#1b2422`, secundário `#66716d`. Painel interno é escuro, com fundo `#0c1511`/`#0f1a16`, primária `#7fd8bd` (verde-água), texto `#e9f2ec`, bordas `#263b32`. Cores de status: sucesso `#7fd8bd`, perigo `#b23b2a`, aviso `#e5b45a`.
- **Tons:** silencioso, sóbrio, sem ilustrações decorativas; a forma é a confiança. O portal do paciente é mobile-first emulando moldura de celular no desktop; o painel interno é mobile-first com desktop dedicado (sidebar em `≥1024px`, calendário em três colunas em `≥1320px`).
- **Voz da marca:** direta, sem hype. Microcopy do tipo "Acessar minha agenda", "Confirmar presença", "Bloquear dia inteiro". Nunca promete o que o produto não faz; nunca usa termos clínicos que ainda não existem.

## Evidence on Hand

- **PRD raiz** (`PRD.md`): visão geral do produto, agentes, outbox, handoff, integrações, segurança.
- **PRD interno** (`docs/product/PRD.md`): RF-016 a RF-060, jornadas, regras de negócio, critérios de aceitação.
- **Arquitetura** (`docs/architecture/architecture.md`): componentes, contratos administrativos, dados, fluxos críticos, segurança/privacidade, testes, deploy/rollback.
- **ADRs:** 001 (worker para mensageria), 002 (acesso interno via Supabase Auth), 003 (bloqueio integral Calendar), 004 (central de gestão).
- **Diagramas:** `docs/architecture/luna-agenda-current.html` e `luna-agenda-as-is-to-be.html` (+ previews PNG) — referência visual do estado atual e desejado.
- **Protótipos Figma exportados:** `design/telas-da-aplica-o/project/Luna Agenda.dc.html` com Home, Acesso, Agenda, Booking, Login interno e Dashboard interno.
- **Runbooks:** `painel-interno`, `incident-response`, `backup-restore-lgpd`, `deploy-vps-docker`, `deploy-easypanel`, `llm-routing-incident`.
- **Manual da doutora:** `docs/Manual_Luna_Agenda_para_a_Doutora.{pdf,docx}`.
- **Status da refatoração WhatsApp:** `docs/whatsapp-refactor-status.md` (PR 1–8, já em curso).
- **Implementação:** `implementation/README.md` e rastreabilidade 001–018.
- **Ausências que futuras rodadas NÃO devem fabricar:** nomes de pacientes reais, números de telefone reais, depoimentos, dados clínicos, prints de produção, métricas de uso atuais.

## Product Principles

1. **A agenda da doutora é o Calendar.** Nunca criar uma fonte paralela de ocupação; toda ação de agenda precisa refletir no Calendar antes de virar verdade para o paciente.
2. **O paciente resolve sozinho no WhatsApp.** Toda decisão importante (lembrete, confirmação, remarcação, atendimento em dupla) acontece na conversa; o portal é a porta de entrada para os fluxos mais longos.
3. **Falhas nunca mentem.** Se algo falhou, o painel mostra categoria, correlation ID, timestamp e mensagem segura — não silencia, não infere sucesso, não expõe segredo.
4. **Privacidade por construção.** Telefone só aparece completo no detalhe para perfil interno ativo; nome da segunda pessoa nunca é persistido; tokens e códigos vivem apenas como hash.
5. **Mudança mínima, rastro máximo.** Desativação lógica em cadastros; auditoria em toda escrita; nenhuma mutação sem `idempotencyKey` e correlation ID.

## Accessibility & Inclusion

- Paciente pode entrar por telefone, não por e-mail. Login OTP por SMS/WhatsApp reduz a barreira de criação de conta.
- Contraste: paleta clara (portal) usa verde-petróleo `#16655b` sobre `#f8f7f3`; paleta escura (painel) usa verde-água `#7fd8bd` sobre `#0c1511`. Ambos já passaram pelos ajustes finos do design atual; foco visível com outline de 3 px e offset.
- `prefers-reduced-motion: reduce` desliga animações e transições globalmente.
- `prefers-reduced-motion: reduce` aplicado em CSS global; foco visível em todos os controles interativos.
- Mobile-first: paciente usa no celular; profissional usa celular durante o atendimento e desktop no consultório. Largura mínima do shell do paciente é 320 px.
- Sem requisito explícito de leitura de tela além do foco visível e semântica HTML corrente; futuras rodadas de auditoria técnica devem verificar leitor de tela no fluxo de OTP e no detalhe da consulta.
