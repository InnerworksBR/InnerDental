---
id: "017"
title: "Confiabilidade factual e readiness do WhatsApp"
status: completed_local_validation
priority: critical
risk: critical
created_at: 2026-08-10
updated_at: 2026-08-10
owner: ai-agent
depends_on: ["006", "009", "012", "015"]
requirements: [RF-013, RF-014, RF-015, RNF-007, CA-011, CA-012]
---
# Especificação

## Objetivo e escopo

Fechar as lacunas críticas encontradas na comparação com a arquitetura de referência para atendimento via WhatsApp, mantendo a regra “banco determina os fatos, workflow determina as ações e IA determina como conversar”.

Esta implementação deve:

- rejeitar correspondências ambíguas de plano em vez de escolher o primeiro candidato;
- consultar plano, procedimento e cobertura como dados estruturados e direcionados à pergunta atual;
- impedir que o LLM confirme cobertura, preço, procedimento ou plano sem evidência oficial suficiente;
- substituir ausência de evidência por fallback seguro e encaminhamento humano rastreável;
- impedir que histórico textual livre funcione como fonte de verdade para fatos críticos;
- validar em runtime que a instância Evolution configurada existe e está conectada;
- manter agenda, confirmação de presença e demais ações críticas fora do LLM.

## Fora de escopo

- Alterar automaticamente `.env`, secrets, nome da instância Evolution ou configuração de produção.
- Enviar WhatsApp real, aplicar migration externa, promover containers ou executar deploy.
- Introduzir RAG, embeddings, banco vetorial, n8n ou um novo AI Agent com ferramentas.
- Cadastrar valores comerciais sem dados e aprovação da clínica. Até existir fonte estruturada aprovada, perguntas de preço devem usar fallback seguro.
- Redesenhar portal, disponibilidade, criação, remarcação ou cancelamento de consultas.
- Usar um segundo LLM como autoridade final para regras que possam ser verificadas por código.

## Requisitos e critérios

- **RF-013:** FAQ e conhecimento administrativo só podem usar conteúdo ativo cadastrado.
- **RF-014:** planos, aliases, procedimentos e coberturas devem ser consultados no banco antes da resposta.
- **RF-015:** ausência, ambiguidade ou conflito de evidência deve produzir fallback seguro e, quando necessário, encaminhamento humano idempotente.
- **RNF-007:** decisão, fonte factual, validação, fallback e erro devem ser observáveis sem registrar secrets ou conteúdo sensível desnecessário.
- **CA-011:** o bot continua sem buscar, escolher ou oferecer horários diretamente.
- **CA-012:** nenhum plano pode ser informado como aceito sem correspondência estruturada ativa.
- **CA-1701:** uma entrada compatível com mais de um plano retorna `ambiguous`; nenhum candidato é aceito automaticamente.
- **CA-1702:** pergunta combinando plano e procedimento só recebe confirmação de cobertura quando existir registro ativo e inequívoco em `procedure_coverage` com `accepted = true`.
- **CA-1703:** cobertura ausente, negativa ou conflitante não pode ser transformada em resposta positiva pelo LLM.
- **CA-1704:** preço sem fonte estruturada não é estimado, deduzido nem inventado; a resposta informa que a equipe precisa confirmar.
- **CA-1705:** o gerador recebe somente fatos verificados e contexto estruturado necessário; mensagens anteriores não são reenviadas como base factual.
- **CA-1706:** a saída final passa por validação em código e bloqueia URLs, nomes de planos/procedimentos e afirmações críticas não sustentadas pelos fatos verificados.
- **CA-1707:** o readiness retorna indisponível quando a instância Evolution configurada não existe ou não está `open`, diferenciando configuração de conectividade real.
- **CA-1708:** logs e estado da inbox permitem reconstruir intenção, rota, fonte factual, resultado da validação, fallback/handoff e falha sem armazenar resposta clínica ou secrets.
- **CA-1709:** casos adversariais de ambiguidade, prompt injection, cobertura ausente/negativa e instância Evolution incorreta são cobertos por testes automatizados.

## Restrições

- Falhar fechado: falso negativo encaminhado à equipe é preferível a falso positivo sobre plano, cobertura, preço ou ação executada.
- Respostas críticas devem ser determinadas por código e dados; o LLM pode apenas redigir dentro de um contrato verificado.
- Nenhuma mudança pode transferir disponibilidade, agendamento ou confirmação de evento para o worker de mensageria ou para o LLM.
- A integração Evolution deve preservar compatibilidade com fallback textual e não pode enviar mensagem durante readiness.
- A implementação não pode registrar API keys, tokens, nomes completos, telefones ou payloads brutos em logs operacionais.

## Riscos

- A política mais conservadora pode aumentar encaminhamentos humanos quando cadastros ou coberturas estiverem incompletos.
- Versões diferentes da Evolution API podem variar o formato de `fetchInstances` e `connectionState`; o adapter deve normalizar respostas conhecidas e falhar fechado nas demais.
- Validação textual genérica pode produzir falsos positivos; fatos críticos devem preferir templates determinísticos.
- Mudança no contexto enviado ao LLM pode reduzir naturalidade de respostas curtas dependentes da conversa anterior.
- A cobertura cadastrada pode estar desatualizada; a UI de gestão e a auditoria existentes permanecem responsáveis pela qualidade do dado oficial.

## Gate de aprovação

Estado atual: **aprovado e implementado localmente em 2026-08-10**. Permanecem fora do escopo as alterações de secrets/configuração, deploy e envio de WhatsApp real.
