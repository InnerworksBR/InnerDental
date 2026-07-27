# Análise do repositório

## Escopo e evidências

Análise da raiz `C:\Apps\Projeto_priscila` para planejar o MVP descrito em `PRD.md`. Em 2026-07-16, o workspace contém somente o PRD e não é um repositório Git.

## Linguagens e frameworks

- Não há código, manifesto ou lockfile existente.
- O PRD recomenda Next.js, TypeScript, Tailwind CSS, ShadCN UI, React Hook Form, Zod, API Routes e Supabase PostgreSQL (`PRD.md`, seções 23 e 33).
- Google Calendar e Evolution API são integrações obrigatórias; um worker TypeScript separado processará mensageria e automações (`PRD.md`, seção 22 e ADR-001).

## Estrutura, entrypoints e módulos

- Estado greenfield: nenhum entrypoint, módulo, pacote ou configuração foi encontrado.
- A única fonte de requisitos é `PRD.md`.

## Padrões, lint, formatação e testes

- Não existem convenções, ferramentas de lint/formatação, testes ou CI configurados.
- O planejamento deve incluir a criação desses padrões e testes unitários, de integração, contrato e E2E.

## Dados, integrações e autenticação

- O modelo inicial prevê pacientes, profissionais, regras/exceções de disponibilidade, consultas, reservas, tokens, planos, procedimentos, FAQs e auditoria.
- A autenticação será sem senha, por link temporário ou código enviado ao WhatsApp.
- O Google Calendar é a fonte oficial de ocupação; Supabase mantém estado de domínio e auditoria.
- Não há credenciais, IDs de calendário, instância Evolution API ou implementação do worker de mensageria configurados para ambiente externo no workspace.

## Build, deploy e observabilidade

- Não existem Dockerfile, Compose, pipeline, ambiente, health check, logs ou runbook.
- O PRD prevê VPS, Docker, EasyPanel, proxy reverso e HTTPS.

## Documentação

- `PRD.md` define produto, jornadas, regras, modelo de dados, APIs, RF01–RF15, RNF01–RNF10 e CA01–CA15.
- Não há constituição, arquitetura, ADRs ou implementações anteriores.

## Riscos, dívida e lacunas

- Decidir estratégia de credencial e sincronização do Google Calendar.
- Definir contrato de webhooks e autenticação entre backend, worker e Evolution API.
- Especificar retenção/anonimização LGPD, rate limits e política de cancelamento.
- Resolver consistência entre Calendar e Supabase em falhas parciais e alterações manuais.
- Definir calendário-alvo, domínio, infraestrutura, ambientes e responsáveis por segredos.
- Validar se eventos de dia inteiro sempre bloqueiam ou se haverá configuração por calendário/tipo.

## Comandos executados e limitações

- `rg --files -g 'AGENTS.md' -g '!node_modules' -g '!implementation'`: nenhum `AGENTS.md` encontrado; exit code 0 no script de inspeção.
- `rg --files -g '!node_modules'`: retornou apenas `PRD.md`; exit code 0.
- `git status --short`: informou que a pasta não é repositório Git; exit code do comando Git 128.
- `Get-ChildItem -Force`: confirmou apenas `PRD.md` na raiz.
- Nenhum teste foi executado, pois não existe código. A análise não valida credenciais nem serviços externos.
