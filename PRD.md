PRD — Portal de Agendamento Odontológico Integrado ao WhatsApp

1. Visão geral
1.1 Nome provisório
Luna Agenda
O nome poderá ser alterado posteriormente sem impacto funcional.
1.2 Descrição
O Luna Agenda será um sistema de agendamento odontológico integrado ao WhatsApp e ao Google Calendar.
O WhatsApp continuará sendo o principal canal de comunicação com os pacientes, mas o bot não será responsável por interpretar horários nem criar consultas diretamente.
Quando o paciente desejar marcar, remarcar ou cancelar uma consulta, o bot enviará um link para um portal de agendamento simples.
O portal exibirá janelas fixas de 15 minutos conforme o horário de atendimento da dentista. Horários que possuírem eventos no Google Calendar serão automaticamente bloqueados.
A dentista continuará utilizando apenas o Google Calendar para visualizar, criar, alterar ou bloquear compromissos.


 2. Problema
A automação anterior utilizava inteligência artificial para:

- interpretar solicitações;
- verificar horários;
- consultar planos;
- oferecer disponibilidade;
- criar eventos;
- remarcar consultas;
- cancelar consultas.

Esse modelo gerava erros como:

- informar que não existiam horários quando havia disponibilidade;
- oferecer horários ocupados;
- informar incorretamente que determinados planos não eram aceitos;
- interpretar incorretamente eventos do Google Calendar;
- criar conflitos de agenda;
- responder com informações não confirmadas.

O problema principal era permitir que a inteligência artificial tomasse decisões operacionais críticas.


 3. Solução proposta
Separar as responsabilidades do sistema.
3.1 WhatsApp
O bot será responsável por:

- responder perguntas frequentes;
- informar planos aceitos;
- informar procedimentos realizados;
- informar endereço e horário de atendimento;
- identificar intenção de agendamento;
- enviar o link do portal;
- enviar confirmações e lembretes;
- encaminhar situações especiais para atendimento humano.

O bot não será responsável por:

- procurar horários;
- escolher horários;
- confirmar disponibilidade;
- criar diretamente consultas por interpretação de texto;
- decidir cobertura de planos sem consultar dados estruturados.

3.2 Portal de agendamento
O portal será responsável por:

- exibir os dias disponíveis;
- gerar horários fixos de 15 em 15 minutos;
- ocultar ou bloquear horários ocupados;
- criar consultas;
- remarcar consultas;
- cancelar consultas;
- impedir duplicidade de agendamento;
- identificar o paciente pelo telefone;
- consultar o Google Calendar em tempo real.

3.3 Google Calendar
O Google Calendar continuará sendo a agenda oficial da dentista.
A dentista poderá:

- visualizar consultas;
- criar consultas manualmente;
- bloquear horários;
- alterar consultas;
- arrastar eventos para outro horário;
- criar compromissos pessoais;
- registrar férias;
- excluir eventos.

Qualquer evento existente dentro do calendário configurado será considerado um horário ocupado.


 4. Objetivos do produto
4.1 Objetivo principal
Permitir que pacientes marquem, remarquem e cancelem consultas de maneira autônoma, sem que a dentista precise aprender ou operar um novo sistema complexo.
4.2 Objetivos secundários

- reduzir erros de agendamento;
- reduzir mensagens manuais;
- evitar conflitos de horário;
- manter o Google Calendar como ferramenta principal da dentista;
- melhorar a experiência do paciente;
- reduzir dependência da inteligência artificial;
- centralizar regras de planos e procedimentos;
- manter histórico de agendamentos;
- enviar confirmações automáticas pelo WhatsApp.



 5. Não objetivos
O MVP não terá como objetivo:

- criar prontuário odontológico;
- armazenar exames ou informações clínicas;
- realizar diagnóstico;
- substituir sistema financeiro;
- emitir notas fiscais;
- realizar cobrança online;
- controlar estoque;
- calcular cobertura completa de convênios;
- permitir que a IA escolha horários;
- criar um painel administrativo complexo;
- substituir o Google Calendar.



 6. Usuários
6.1 Paciente
Pessoa que deseja:

- marcar uma consulta;
- visualizar consulta futura;
- remarcar uma consulta;
- cancelar uma consulta;
- tirar dúvidas pelo WhatsApp.

6.2 Dentista
Profissional que:

- utiliza o Google Calendar;
- visualiza sua agenda;
- cria consultas manualmente;
- bloqueia períodos;
- altera eventos;
- exclui eventos.

6.3 Administrador técnico
Responsável por:

- configurar horários de atendimento;
- cadastrar planos;
- cadastrar perguntas frequentes;
- acompanhar integrações;
- corrigir dados;
- visualizar logs;
- configurar regras do sistema.

No MVP, essas configurações poderão ser feitas diretamente pelo Supabase.


 7. Premissas

- A agenda será dividida em janelas de 15 minutos.
- O Google Calendar será a fonte oficial de horários ocupados.
- O sistema utilizará o fuso horário America/Sao_Paulo.
- Cada consulta terá pelo menos nome e telefone do paciente.
- O WhatsApp será integrado por meio da Evolution API.
- Um worker TypeScript separado será utilizado para mensagens e automações.
- O Supabase armazenará pacientes, regras, tokens e histórico.
- O portal deverá funcionar corretamente em dispositivos móveis.
- O paciente não precisará criar senha.
- A dentista não precisará acessar o Supabase.



 8. Escopo do MVP
8.1 Funcionalidades incluídas

- bot de WhatsApp para perguntas frequentes;
- detecção de intenção de agendamento;
- envio de link para o portal;
- autenticação pelo telefone;
- geração de horários de 15 minutos;
- consulta de eventos no Google Calendar;
- bloqueio de horários ocupados;
- marcação de consulta;
- remarcação de consulta;
- cancelamento de consulta;
- reserva temporária de horário;
- confirmação pelo WhatsApp;
- lembrete de consulta;
- histórico de operações;
- cadastro estruturado de planos;
- cadastro estruturado de procedimentos;
- tratamento de falhas de integração.

8.2 Funcionalidades futuras

- painel administrativo simplificado;
- lista de espera;
- múltiplas dentistas;
- múltiplas unidades;
- diferentes durações de consulta;
- confirmação de presença;
- registro de falta;
- relatórios gerenciais;
- pagamento antecipado;
- integração com prontuário;
- dashboard de conversão;
- campanhas de retorno;
- avaliações pós-consulta.



 9. Jornada do paciente
9.1 Entrada pelo WhatsApp
O paciente envia uma mensagem como:

- “Quero marcar uma consulta.”
- “Tem horário amanhã?”
- “Preciso remarcar.”
- “Quero cancelar.”
- “Quais horários estão disponíveis?”

O bot identifica que a solicitação está relacionada à agenda.
O bot responde:

Para marcar, remarcar ou cancelar sua consulta, acesse sua agenda online pelo botão abaixo.


 O paciente recebe o botão:
Gerenciar consulta


 10. Identificação do paciente
10.1 Acesso pelo WhatsApp
Quando o link for gerado pelo bot, ele deverá conter um token temporário associado ao telefone do paciente.
Exemplo:

https://agenda.clinica.com.br/acesso/abc123


 O token deverá conter ou referenciar:

- telefone;
- data de criação;
- data de expiração;
- origem;
- sessão;
- status de uso.

O telefone não deverá aparecer diretamente na URL.
10.2 Acesso direto pelo site
Caso o paciente acesse o portal diretamente:

1. informa o telefone;
2. recebe um código pelo WhatsApp;
3. informa o código;
4. acessa suas consultas.
10.3 Formato do telefone
Os telefones deverão ser armazenados no padrão internacional:

5513991743380


 O sistema deverá remover:

- espaços;
- parênteses;
- hífens;
- símbolos;
- zeros adicionais.



 11. Tela inicial do portal
Após a identificação, o portal exibirá:

- Marcar nova consulta;
- Minhas consultas;
- Remarcar consulta;
- Cancelar consulta.

Caso o paciente não tenha nenhuma consulta futura, as opções de remarcação e cancelamento poderão ficar ocultas ou desabilitadas.


 12. Fluxo de marcação
12.1 Dados solicitados
O paciente deverá informar:

- nome completo;
- plano ou particular;
- motivo geral da consulta;
- período desejado, opcionalmente.

O sistema não deverá solicitar informações clínicas sensíveis no MVP.
12.2 Seleção da data
O paciente visualizará um calendário com os dias disponíveis.
Dias sem horário de atendimento não poderão ser selecionados.
Dias completamente ocupados poderão:

- aparecer desabilitados; ou
- ser ocultados.

12.3 Seleção do horário
Após escolher uma data, o sistema mostrará todas as janelas livres de 15 minutos.
Exemplo:

08:00
08:15
08:30
08:45
09:00


 Horários ocupados deverão aparecer desabilitados ou não deverão ser exibidos.
O sistema não deverá sugerir ou priorizar horários.
O paciente poderá escolher qualquer horário livre.
12.4 Confirmação
Antes da criação do evento, o portal exibirá:

Nome: Maria Silva
Data: 21/07/2026
Horário: 09:15
Plano: SulAmérica
Motivo: Avaliação


 Botões:

- Confirmar agendamento;
- Voltar.

12.5 Criação
Ao confirmar:

1. o backend verifica novamente a disponibilidade;
2. valida a reserva temporária;
3. consulta novamente o Google Calendar;
4. cria o evento;
5. registra o agendamento no Supabase;
6. envia confirmação pelo WhatsApp.


 13. Fluxo de remarcação
13.1 Consulta atual
O sistema deverá listar as consultas futuras vinculadas ao telefone.
Exemplo:

Consulta marcada
21/07/2026 às 09:15


 13.2 Escolha do novo horário
O paciente seleciona a consulta e clica em:
Escolher novo horário
O portal exibirá novamente o calendário e os horários livres.
13.3 Confirmação da alteração
O sistema mostrará:

Horário atual:
21/07/2026 às 09:15

Novo horário:
23/07/2026 às 10:30


 13.4 Atualização
Ao confirmar:

1. reservar o novo horário;
2. verificar novamente a disponibilidade;
3. atualizar o evento existente no Google Calendar;
4. atualizar o registro no Supabase;
5. liberar o horário anterior;
6. enviar confirmação pelo WhatsApp.
O sistema não deverá excluir o evento atual antes de garantir que o novo horário esteja disponível.


 14. Fluxo de cancelamento
O sistema listará as consultas futuras.
Após selecionar uma consulta, deverá exibir:

Deseja cancelar sua consulta de 21/07/2026 às 09:15?


 Botões:

- Confirmar cancelamento;
- Manter consulta.

Ao confirmar:

1. localizar o evento no Google Calendar;
2. cancelar ou excluir o evento;
3. atualizar o status no Supabase;
4. registrar a data do cancelamento;
5. enviar confirmação pelo WhatsApp;
6. liberar o horário.
A política de antecedência mínima para cancelamento deverá ser configurável.


 15. Regras de disponibilidade
15.1 Intervalos fixos
A agenda deverá ser gerada em intervalos de 15 minutos.
Exemplo de expediente:

08:00 às 12:00
14:00 às 18:00


 Horários gerados:

08:00
08:15
08:30
08:45
...
11:45

14:00
14:15
14:30
...
17:45


 15.2 Dias da semana
Cada dia poderá possuir regras próprias.
Exemplo:

Dia	Início	Fim	Ativo
Segunda	08:00	18:00	Sim
Terça	08:00	18:00	Sim
Quarta	08:00	12:00	Sim
Quinta	08:00	18:00	Sim
Sexta	08:00	17:00	Sim
Sábado	—	—	Não
Domingo	—	—	Não

 15.3 Intervalos e almoço
O sistema deverá permitir múltiplos períodos no mesmo dia.
Exemplo:

- 08:00 às 12:00;
- 14:00 às 18:00.

O intervalo entre 12:00 e 14:00 não deverá aparecer.
15.4 Data mínima
A data mínima de agendamento deverá ser configurável.
Configuração inicial sugerida:

Hoje + 2 dias


 Isso impede agendamentos para o dia atual e para o dia seguinte.
15.5 Data máxima
O sistema deverá permitir definir quantos dias futuros estarão disponíveis.
Exemplo:

60 dias


 15.6 Eventos ocupados
Qualquer evento existente no Google Calendar selecionado deverá bloquear os horários sobrepostos.
A regra de conflito será:

evento_inicio < janela_fim
e
evento_fim > janela_inicio


 Exemplo:
Evento:

10:10 às 10:40


 Janelas bloqueadas:

10:00
10:15
10:30


 15.7 Eventos de dia inteiro
Eventos de dia inteiro deverão bloquear todo o expediente daquele dia, quando configurados como bloqueio.
Alternativamente, o sistema poderá permitir ignorar calendários secundários ou tipos específicos de evento.
15.8 Horários no passado
Horários anteriores ao momento atual nunca poderão ser exibidos.


 16. Reserva temporária de horário
Quando o paciente selecionar um horário, o sistema deverá criar uma reserva temporária.
Exemplo:

09:15 reservado por 5 minutos


 Durante esse período, outro paciente não poderá confirmar o mesmo horário.
16.1 Expiração
A reserva deverá expirar automaticamente após um tempo configurável.
Configuração sugerida:

5 minutos


 16.2 Confirmação final
Mesmo com a reserva, o backend deverá consultar novamente o Google Calendar antes de criar o evento.
16.3 Restrição de banco
O banco deverá impedir duas reservas ativas para:

- mesma profissional;
- mesma data;
- mesmo horário.



 17. Padrão dos eventos no Google Calendar
17.1 Título
O título deverá seguir o padrão:

Nome do paciente | Telefone


 Exemplo:

Maria Silva | 5513991743380


 17.2 Descrição
A descrição poderá conter:

Agendamento online

Paciente: Maria Silva
Telefone: 5513991743380
Plano: SulAmérica
Motivo: Avaliação
Origem: WhatsApp
ID interno: uuid-do-agendamento


 17.3 Duração
No MVP, toda consulta criada pelo portal terá duração de 15 minutos.
Consultas maiores poderão ser criadas ou ajustadas manualmente pela dentista.
17.4 Identificador
O sistema deverá armazenar o calendar_event_id retornado pelo Google Calendar.
Esse identificador será usado para:

- atualização;
- cancelamento;
- consulta;
- sincronização;
- auditoria.



 18. Alterações feitas pela dentista
18.1 Criação manual
Se a dentista criar um evento diretamente no Google Calendar, o horário deverá aparecer automaticamente como ocupado.
Não será obrigatório que o evento manual exista no Supabase para bloquear o horário.
18.2 Remarcação manual
Se a dentista arrastar um evento para outro horário, o portal deverá considerar imediatamente o novo horário como ocupado.
Uma sincronização posterior poderá atualizar o registro no Supabase.
18.3 Exclusão manual
Se um evento for excluído manualmente, o horário deverá voltar a aparecer disponível.
O sistema poderá registrar essa exclusão por webhook ou sincronização periódica.
18.4 Bloqueios
A dentista poderá criar eventos como:

BLOQUEADO
ALMOÇO
REUNIÃO
FÉRIAS
COMPROMISSO


 Qualquer evento deverá bloquear a agenda, independentemente do título.


 19. Bot de WhatsApp
19.1 Responsabilidades
O bot deverá:

- identificar perguntas;
- responder utilizando dados estruturados;
- enviar link de agendamento;
- enviar confirmação;
- enviar lembretes;
- encaminhar casos especiais.

19.2 Perguntas frequentes
Categorias iniciais:

- endereço;
- horário de funcionamento;
- planos aceitos;
- procedimentos;
- atendimento infantil;
- formas de pagamento;
- documentos necessários;
- urgências;
- remarcação;
- cancelamento;
- contato humano.

19.3 Respostas estruturadas
Informações críticas deverão vir do banco de dados.
Exemplo:

Paciente pergunta: “Aceita Bradesco Dental?”


 O sistema deverá consultar os aliases de planos:

Bradesco Dental → Rede UNNA


 Depois responder com base no cadastro.
A IA não deverá responder usando apenas memória ou prompt.
19.4 Falta de correspondência
Caso o sistema não encontre uma resposta segura:

Não consegui confirmar essa informação automaticamente. Vou encaminhar sua dúvida para a equipe.


 A IA não deverá inventar respostas.


 20. Planos aceitos
Os planos deverão ser cadastrados em uma tabela estruturada.
Cadastro inicial:

- Rede UNNA;
- Odontoprev;
- Bradesco Dental;
- BB Dental;
- Previan;
- Unimed Odonto;
- SulAmérica;
- Amil Dental;
- Uniodonto;
- MetLife.

20.1 Aliases
Exemplo:

Nome informado	Plano associado
Bradesco Dental	Rede UNNA
Odontoprev	Rede UNNA
BB Dental	Rede UNNA
Previan	Rede UNNA

 20.2 Planos encaminhados
Planos específicos poderão possuir instruções próprias.
Exemplo:

- Caixa de Pecúlio de São Vicente;
- Caixa de Saúde de São Vicente.

Nesses casos, o bot deverá encaminhar para a profissional responsável.


 21. Procedimentos e regras
Os procedimentos deverão ser cadastrados de maneira estruturada.
Exemplo inicial:

Procedimento	Regra
Consulta padrão	Agendamento online
Prótese	Conforme plano
Ortodontia	Conforme plano
Canal em molar	Não realizado
Extração de siso	Apenas particular
Urgência	Encaminhar para avaliação
Crianças abaixo de 8 anos	Não atendidas

 Procedimentos complexos poderão ser marcados inicialmente como consulta de avaliação de 15 minutos.
O paciente não deverá escolher durações diferentes no MVP.


 22. Integrações
22.1 Google Calendar
Responsável por:

- eventos;
- bloqueios;
- consultas;
- disponibilidade real;
- alterações manuais.

22.2 Supabase
Responsável por:

- pacientes;
- agendamentos;
- reservas temporárias;
- tokens;
- regras de disponibilidade;
- planos;
- procedimentos;
- FAQs;
- logs;
- auditoria.

22.3 Evolution API
Responsável por:

- envio de mensagens;
- códigos de acesso;
- confirmações;
- lembretes;
- links;
- notificações.

22.4 Worker TypeScript
Responsável por:

- fluxo do WhatsApp;
- lembretes;
- confirmações;
- notificações;
- sincronizações não críticas;
- encaminhamentos humanos.

O worker não deverá ser responsável pelo bloqueio transacional dos horários, pela decisão de disponibilidade ou pela confirmação transacional de consultas. Ele consumirá a outbox de forma idempotente, com retry e concorrência limitada.


 23. Arquitetura técnica

Paciente
   ↓
WhatsApp
   ↓
Evolution API
   ↓
Worker TypeScript
   ├── Perguntas frequentes
   ├── Planos e procedimentos
   └── Geração de link
              ↓
        Portal Next.js
              ↓
       API de agendamento
          ├── Supabase
          └── Google Calendar
              ↓
      Confirmação no WhatsApp


 23.1 Stack recomendada
Frontend

- Next.js;
- TypeScript;
- Tailwind CSS;
- ShadCN UI;
- React Hook Form;
- Zod.

Backend
Uma das opções:

- API Routes do Next.js;
- Fastify separado;
- Supabase Edge Functions.

Recomendação para o MVP:

Next.js + API Routes + Supabase


 Caso o produto cresça, o backend poderá ser separado posteriormente.
Banco

- Supabase PostgreSQL.

Autenticação

- token temporário;
- código enviado pelo WhatsApp;
- sem senha tradicional.

Hospedagem

- VPS;
- Docker;
- EasyPanel;
- proxy reverso;
- HTTPS obrigatório.



 24. Modelo de dados inicial
24.1 patients

id
name
phone
created_at
updated_at


 24.2 appointments

id
patient_id
calendar_event_id
professional_id
start_at
end_at
status
insurance_plan_id
reason
source
created_at
updated_at
cancelled_at


 Status possíveis:

scheduled
rescheduled
cancelled
completed
no_show


 24.3 professionals

id
name
calendar_id
timezone
active


 24.4 availability_rules

id
professional_id
weekday
start_time
end_time
slot_duration
active


 24.5 availability_exceptions

id
professional_id
date
start_time
end_time
type
description


 Tipos:

available
blocked
holiday
vacation


 24.6 slot_holds

id
professional_id
start_at
end_at
phone
session_id
expires_at
created_at


 24.7 access_tokens

id
phone
token_hash
expires_at
used_at
created_at


 24.8 insurance_plans

id
name
active
instructions
created_at
updated_at


 24.9 insurance_aliases

id
insurance_plan_id
alias


 24.10 procedures

id
name
description
online_booking
active


 24.11 procedure_coverage

id
procedure_id
insurance_plan_id
accepted
instructions


 24.12 faq_entries

id
category
question
answer
active
created_at
updated_at


 24.13 audit_logs

id
action
entity
entity_id
source
metadata
created_at




 25. APIs principais
25.1 Disponibilidade

GET /api/availability


 Parâmetros:

date
professional_id


 Retorno:

{
  "date": "2026-07-21",
  "slots": [
    {
      "start": "08:00",
      "end": "08:15",
      "available": true
    }
  ]
}


 25.2 Criar reserva temporária

POST /api/slot-holds


 25.3 Criar consulta

POST /api/appointments


 25.4 Consultar consultas por paciente

GET /api/appointments/me


 25.5 Remarcar consulta

PATCH /api/appointments/:id/reschedule


 25.6 Cancelar consulta

PATCH /api/appointments/:id/cancel


 25.7 Solicitar código de acesso

POST /api/auth/request-code


 25.8 Validar código

POST /api/auth/verify-code




 26. Requisitos funcionais
RF01 — Gerar horários
O sistema deverá gerar janelas conforme as regras de disponibilidade.
RF02 — Consultar Google Calendar
O sistema deverá consultar eventos antes de exibir horários.
RF03 — Bloquear conflitos
O sistema deverá bloquear qualquer janela que possua sobreposição com um evento.
RF04 — Criar consulta
O paciente deverá conseguir criar uma consulta em uma janela livre.
RF05 — Remarcar consulta
O paciente deverá conseguir escolher uma nova janela disponível.
RF06 — Cancelar consulta
O paciente deverá conseguir cancelar uma consulta futura.
RF07 — Identificar paciente
O sistema deverá identificar o paciente pelo telefone.
RF08 — Validar telefone
O sistema deverá validar a posse do telefone quando necessário.
RF09 — Enviar confirmação
O sistema deverá enviar confirmação pelo WhatsApp.
RF10 — Reserva temporária
O sistema deverá reservar temporariamente um horário selecionado.
RF11 — Segunda validação
O sistema deverá verificar novamente o Google Calendar antes da criação.
RF12 — Histórico
O sistema deverá registrar ações de criação, remarcação e cancelamento.
RF13 — FAQ
O bot deverá responder utilizando informações cadastradas.
RF14 — Planos
O bot deverá consultar planos e aliases cadastrados.
RF15 — Encaminhamento
O bot deverá encaminhar situações não resolvidas para atendimento humano.


 27. Requisitos não funcionais
RNF01 — Responsividade
O portal deverá ser mobile-first.
RNF02 — Desempenho
A consulta de disponibilidade deverá responder preferencialmente em até 3 segundos.
RNF03 — Segurança
Todos os acessos deverão ocorrer por HTTPS.
RNF04 — Privacidade
O telefone não deverá ser exposto em URLs ou logs públicos.
RNF05 — Confiabilidade
O sistema não deverá confirmar uma consulta sem resposta positiva do Google Calendar.
RNF06 — Disponibilidade
Falhas no Google Calendar deverão impedir novas marcações até que a disponibilidade possa ser confirmada.
RNF07 — Auditoria
Todas as alterações deverão gerar registros de auditoria.
RNF08 — Fuso horário
Todas as operações deverão usar America/Sao_Paulo.
RNF09 — Idempotência
Uma mesma requisição não poderá criar duas consultas.
RNF10 — Acessibilidade
Botões e textos deverão ser grandes e legíveis em celulares.


 28. Tratamento de erros
28.1 Horário ocupado durante a confirmação
Mensagem:

Esse horário acabou de ser selecionado por outra pessoa. Escolha outro horário disponível.


 28.2 Falha no Google Calendar
Mensagem:

Não foi possível confirmar a agenda neste momento. Tente novamente em alguns minutos ou fale com a clínica.


 Nenhuma consulta deverá ser criada apenas no Supabase.
28.3 Falha no WhatsApp
A consulta poderá ser criada normalmente, mas deverá ser registrada uma pendência de notificação.
28.4 Token expirado
Mensagem:

Este link expirou. Solicite um novo link pelo WhatsApp.


 28.5 Consulta não encontrada
Mensagem:

Não encontramos consultas futuras vinculadas a este telefone.


 28.6 Evento alterado manualmente
O sistema deverá consultar o Google Calendar antes de apresentar ou modificar a consulta.


 29. Segurança e LGPD
O sistema deverá:

- coletar apenas dados necessários;
- evitar armazenar dados clínicos;
- proteger tokens;
- criptografar segredos;
- limitar acesso ao banco;
- utilizar Row Level Security no Supabase;
- registrar operações administrativas;
- permitir exclusão ou anonimização de dados;
- não expor credenciais do Google Calendar;
- não enviar dados sensíveis em mensagens;
- limitar a validade dos links.



 30. Experiência da dentista
A dentista continuará usando o Google Calendar.
Ela não será obrigada a:

- aprender um novo painel;
- cadastrar manualmente todos os pacientes;
- atualizar dois sistemas;
- confirmar cada consulta;
- verificar mensagens individualmente.

O sistema deverá ser construído ao redor da rotina atual da dentista, e não obrigar a dentista a mudar sua operação.


 31. Métricas
O sistema deverá permitir medir:

- quantidade de agendamentos;
- quantidade de remarcações;
- quantidade de cancelamentos;
- horários mais escolhidos;
- dias mais procurados;
- origem dos agendamentos;
- quantidade de acessos ao portal;
- conversão de acesso em consulta;
- falhas de criação;
- dúvidas mais frequentes;
- encaminhamentos humanos;
- planos mais consultados.



 32. Critérios de aceite do MVP
CA01
Dado que um horário está livre no Google Calendar, ele deverá aparecer disponível no portal.
CA02
Dado que existe um evento no Google Calendar, qualquer janela sobreposta deverá ficar bloqueada.
CA03
Dado um evento de 30 minutos, duas janelas consecutivas deverão ficar bloqueadas.
CA04
O paciente não deverá conseguir confirmar um horário que foi ocupado por outra pessoa durante o processo.
CA05
Ao confirmar uma consulta, um evento deverá ser criado no Google Calendar.
CA06
O evento criado deverá possuir nome e telefone no título.
CA07
O paciente deverá receber confirmação pelo WhatsApp.
CA08
Ao remarcar, o mesmo evento deverá ser atualizado.
CA09
Ao cancelar, o horário deverá voltar a ficar disponível.
CA10
A dentista deverá conseguir bloquear horários criando eventos no Google Calendar.
CA11
O bot não deverá oferecer horários diretamente.
CA12
O bot deverá consultar dados estruturados antes de informar planos.
CA13
Em caso de falha no Google Calendar, a consulta não deverá ser confirmada.
CA14
O sistema deverá funcionar em celular sem necessidade de instalação.
CA15
O paciente não deverá precisar criar senha.


 33. Roadmap sugerido
Sprint 1 — Fundação

- criar projeto Next.js;
- configurar Supabase;
- criar tabelas;
- configurar variáveis de ambiente;
- integrar Google Calendar;
- configurar autenticação técnica;
- criar serviço de disponibilidade.

Sprint 2 — Agenda

- criar regras de expediente;
- gerar intervalos de 15 minutos;
- consultar eventos;
- bloquear sobreposições;
- criar interface de calendário;
- criar interface de horários.

Sprint 3 — Marcação

- cadastro de paciente;
- reserva temporária;
- validação final;
- criação do evento;
- registro no Supabase;
- tela de confirmação.

Sprint 4 — Remarcação e cancelamento

- listar consultas futuras;
- remarcar evento;
- cancelar evento;
- atualizar histórico;
- tratar consultas alteradas manualmente.

Sprint 5 — WhatsApp

- integrar Evolution API;
- gerar link seguro;
- enviar código de acesso;
- enviar confirmação;
- enviar cancelamento;
- enviar remarcação;
- integrar com o worker TypeScript.

Sprint 6 — FAQ e planos

- cadastrar FAQs;
- cadastrar planos;
- cadastrar aliases;
- cadastrar procedimentos;
- restringir respostas da IA;
- criar fluxo de encaminhamento humano.

Sprint 7 — Segurança e publicação

- configurar RLS;
- proteger rotas;
- validar tokens;
- configurar domínio;
- configurar HTTPS;
- publicar na VPS;
- criar backup;
- realizar testes finais.



 34. Definição de pronto
O MVP será considerado pronto quando:

- o paciente conseguir acessar pelo WhatsApp;
- visualizar horários livres;
- selecionar uma janela de 15 minutos;
- criar uma consulta;
- receber confirmação;
- visualizar consultas futuras;
- remarcar;
- cancelar;
- o Google Calendar refletir todas as ações;
- eventos manuais bloquearem horários;
- não existirem conflitos de agenda;
- a dentista continuar operando apenas pelo Google Calendar;
- o bot responder perguntas usando informações cadastradas;
- falhas de integração não gerarem agendamentos inconsistentes.



 35. Resumo do produto
O Luna Agenda será um sistema de agendamento simples e determinístico.
A inteligência artificial será utilizada apenas para comunicação e identificação de intenção.
A disponibilidade será calculada por código utilizando:

Horários configurados
- eventos do Google Calendar
- intervalos
- reservas temporárias
- bloqueios
= horários disponíveis


 A dentista continuará utilizando sua ferramenta atual, enquanto os pacientes terão autonomia para gerenciar consultas sem depender de atendimento manual.
