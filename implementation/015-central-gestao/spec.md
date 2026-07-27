---
id: "015"
title: "Central de gestão clínica e operacional"
status: implemented_local_validation_passed
priority: critical
risk: high
created_at: 2026-07-27
updated_at: 2026-07-27
owner: ai-agent
depends_on: ["001", "006", "008", "009"]
requirements: [RF-047, RF-048, RF-049, RF-050, RF-051, RF-052, RF-053, RF-054, RF-055, RF-056, RNF-017]
---
# Especificação

## Objetivo

Permitir que a clínica mantenha cadastros de negócio pelo painel interno, com visão somente leitura para operadores, edição segura pelo proprietário e auditoria de todas as alterações.

## Escopo e critérios

- **RF-047 / CA-047:** hub de gestão interno, navegável em celular e desktop sem ampliar a barra inferior.
- **RF-048 / CA-048:** criar/editar/desativar procedimentos e pré-visualizar orientação; `online_booking` inicia avaliação.
- **RF-049 / CA-049:** criar/editar/desativar planos e aliases sem ambiguidades normalizadas.
- **RF-050 / CA-050:** manter períodos semanais e exceções ativas, rejeitando intervalos inválidos/sobrepostos.
- **RF-051 / CA-051:** criar/editar/desativar profissionais com `calendar_id` obrigatório e único.
- **RF-052 / CA-052:** manter FAQs usadas pelo WhatsApp.
- **RF-053 / CA-053:** registrar auditoria segura de cada comando.
- **RF-054 / CA-054:** owner gerencia configurações/acessos; operator é leitura e pode corrigir paciente.
- **RF-055 / CA-055:** manter matriz plano × procedimento.
- **RF-056 / CA-056:** buscar pacientes e corrigir somente nome/plano.

## Fora de escopo

Agendar procedimento específico, duração por procedimento, prontuário, pagamentos, exclusão de pacientes, edição de telefone, edição livre de filas/tokens/logs e aplicação remota de migration.

## Aprovação

Escopo completo aprovado pelo solicitante em 2026-07-27 com a instrução “pode implementar tudo”. A aprovação cobre a regra owner/operator descrita, preparação da migration aditiva e código de convite; não autoriza aplicar migration compartilhada, convidar pessoa real ou fazer deploy.
