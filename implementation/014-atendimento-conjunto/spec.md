---
id: "014"
title: "Atendimento conjunto e confirmação informada"
status: in_progress_external_validation
priority: critical
risk: critical
created_at: 2026-07-27
updated_at: 2026-07-27
owner: ai-agent
depends_on: ["003", "004", "005", "008"]
requirements: [RF-044, RF-045, RF-046, RNF-016]
---
# Especificação

## Objetivo e escopo

Permitir consultas individuais de 15 minutos ou conjuntas de 30 minutos no portal, proteger toda a duração contra conflitos, identificar a consulta como `Nome Telefone` na agenda e orientar sobre procedimentos indisponíveis para marcação direta antes da confirmação.

## Fora de escopo

Criar cadastro para a segunda pessoa, persistir o nome dela no Supabase, grupos acima de duas pessoas, durações diferentes de 15/30 minutos e alterar o cadastro de procedimentos nesta tela.

## Requisitos e critérios

- **RF-044 / CA-044:** a escolha “duas pessoas” exige segundo nome e só oferece inícios com dois slots consecutivos; hold, confirmação, banco, Calendar e remarcação cobrem os 30 minutos completos.
- **RF-045 / CA-045:** todos os procedimentos com `online_booking = false`, ativos ou inativos, aparecem com nome e descrição antes do botão final; procedimentos com `online_booking = true` não entram nesse aviso e a ausência de registros não inventa conteúdo.
- **RF-046 / CA-046:** título de uma pessoa é `Nome Telefone`; para duas, `Nome e Segundo nome Telefone`; a linha do tempo interna autorizada segue o mesmo padrão.
- **RNF-016:** o segundo nome pode existir no corpo transitório da requisição e no evento Google Calendar, mas nunca em tabelas, operações idempotentes, auditoria, logs ou notificações do Supabase.

## Restrições

Google Calendar permanece fonte oficial de ocupação; telefone completo aparece somente na linha do tempo interna autorizada e no Calendar; demais listas continuam mascaradas; migrations não serão aplicadas remotamente sem gate específico.

## Riscos

Corrida entre holds sobrepostos, constraint histórica limitada a 15 minutos, perda do segundo nome ao remarcar, vazamento por log/persistência acidental e intervalos de 30 minutos atravessando pausas de expediente.
