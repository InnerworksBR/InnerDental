# Plano

## Estratégia

Generalizar o intervalo suportado para um ou dois slots, tornar holds e consultas resistentes a sobreposição, manter o nome adicional apenas no payload do Calendar e derivar a divulgação de procedimentos do cadastro estruturado existente.

## Arquivos previstos

Domínio de disponibilidade/consultas, repositories e APIs de holds/consultas/procedimentos, adapter Google Calendar, migration aditiva de duração e exclusão, portal do paciente, projeção interna, estilos, testes e artefatos desta implementação.

## Sequência reversível

Domínio puro e migration local → contratos/serviços de hold e consulta → Calendar → leitura de procedimentos → UI → painel → testes e evidências. O código permanece compatível com consultas existentes de 15 minutos.

## Testes e validações

Unitários para slots consecutivos, payload, schemas, duração e privacidade; migration estática/isolada; E2E mobile/desktop para pergunta, filtro de horários e aviso; suíte completa, typecheck, lint, security scan e build.

## Rollback

Desabilitar a opção de duas pessoas no portal e manter o fluxo de 15 minutos; a migration aceita ambos os formatos e não exige apagar consultas de 30 minutos. Eventos já criados permanecem no Calendar.

## Aprovações necessárias

O escopo local foi aprovado pelo solicitante em 2026-07-27. Aplicação da migration e smoke com dados/Calendar reais exigem autorização operacional separada.
