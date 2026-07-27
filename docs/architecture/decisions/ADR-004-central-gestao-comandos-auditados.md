# ADR-004: Central de gestão com comandos auditados
- Status: accepted
- Data: 2026-07-27

## Contexto

Cadastros que alimentam portal, disponibilidade e WhatsApp existem no Supabase, mas só podem ser alterados diretamente no banco. A área interna já possui autenticação `owner`/`operator`, proteção de origem e auditoria operacional.

## Decisão

Reutilizar a aplicação Next.js e o Supabase existentes. Expor um snapshot administrativo sanitizado e um endpoint de comandos tipados. Configurações e acessos são exclusivos do proprietário; operadores consultam configurações e podem corrigir nome/plano de pacientes. Registros históricos são desativados, e cada comando grava auditoria explícita com o ator.

`online_booking` será apresentado como “pode iniciar avaliação pelo portal”; não será criado vínculo de procedimento na consulta. A matriz de cobertura será gerencial até existir requisito específico para responder cobertura automaticamente.

## Alternativas

- CRUD direto do navegador no Supabase: rejeitado por expor a fronteira de autorização e dificultar auditoria consistente.
- Uma rota por tabela: rejeitada nesta etapa por duplicar autorização, erros e contratos; o endpoint discriminado mantém comandos explícitos sem virar CRUD genérico.
- Exclusão física: rejeitada para cadastros históricos; aliases e exceções recebem estado ativo por migration aditiva.

## Consequências

A central depende da migration aditiva antes do rollout. Convites dependem do serviço de e-mail do Supabase Auth. O snapshot deve manter limites para pacientes/auditoria e não expor payloads técnicos.

## Evidências

RF-047–RF-056, RNF-017 e implementação 015.
