# PRD

## Problema, público e valor

A clínica não dispõe de uma visão interna para acompanhar o que o agente de WhatsApp processou, quais consultas foram criadas, quais falhas ocorreram e como a agenda exibida ao paciente se relaciona à agenda real da dentista. Quando há um erro relatado, a investigação depende de logs técnicos e não oferece uma origem clara para a operação.

O proprietário inicial do painel é o desenvolvedor responsável pela clínica. Ele pode conceder acesso operacional à dentista quando ela desejar. A dentista continua usando o Google Calendar como ferramenta diária. O painel entrega supervisão, correção operacional e rastreabilidade sem exigir que ela adote outro fluxo.

## Objetivos e fora de escopo

### Objetivos

- Permitir ver a agenda diária e semanal, com consultas do portal e a situação de cada uma.
- Permitir criar, remarcar, cancelar e bloquear horários de forma administrativa, mantendo as mesmas regras de segurança do paciente.
- Mostrar a atividade do agente/worker: mensagens processadas, links enviados, notificações pendentes e falhas.
- Permitir identificar a origem de um erro por correlação, serviço e momento, sem expor segredos.
- Registrar toda ação administrativa e permitir marcar incidentes como resolvidos com uma nota.
- Permitir que um paciente reserve atendimento conjunto para duas pessoas sem criar um segundo cadastro de paciente.
- Informar limitações de atendimento antes da confirmação da consulta.
- Permitir que o proprietário mantenha, sem acessar diretamente o banco, os cadastros que alimentam portal, WhatsApp e disponibilidade.

### Fora de escopo da primeira versão

- Prontuário, dados clínicos, pagamentos, relatórios financeiros e campanhas.
- Alterar eventos externos sem confirmação explícita do administrador.
- Substituir o Google Calendar como agenda da dentista.
- Múltiplas unidades, permissões granulares por equipe ou dashboard gerencial avançado.

## Jornadas

1. O administrador entra no painel interno e vê hoje, próximos atendimentos, falhas abertas e notificações pendentes.
2. Ao selecionar uma consulta, vê paciente, horário, origem, status, identificador do evento, ações realizadas e correlação com mensagens/notificações.
3. Ao receber uma reclamação, pesquisa telefone, data, ID da consulta ou correlation ID; o painel indica se a causa veio de validação, Google Calendar, Supabase, Evolution ou worker.
4. Para intervir, o administrador cria, remarca, cancela ou bloqueia um horário. A ação solicita confirmação, respeita disponibilidade atual e fica auditada.
5. Ao concluir a análise, o administrador registra uma nota e encerra o incidente. O histórico permanece consultável.
6. No portal, o paciente informa se outra pessoa será atendida junto; quando positivo, fornece apenas o nome dela, vê somente inícios com dois slots consecutivos livres e revisa as limitações de atendimento antes de confirmar.

## Requisitos funcionais

- **RF-016 — Acesso administrativo:** o sistema deve restringir o painel a usuários internos autorizados por Supabase Auth, sem reutilizar a sessão de paciente. O proprietário gerencia acessos; a dentista convidada possui acesso operacional, sem gerenciar usuários.
- **RF-017 — Visão de agenda:** o painel deve exibir consultas por dia e semana, com filtros por profissional, status e origem.
- **RF-018 — Detalhe e rastreabilidade:** o painel deve mostrar, para cada consulta, dados operacionais mínimos, histórico de alterações, identificador interno, identificador do evento e correlation IDs disponíveis.
- **RF-019 — Operação administrativa:** o administrador deve poder criar, remarcar, cancelar e bloquear horários com confirmação explícita e as mesmas validações de conflito aplicadas ao portal.
- **RF-020 — Supervisão do agente:** o painel deve listar mensagens/eventos processados, intenção identificada, ação tomada, link enviado, estado de notificação e falhas de processamento.
- **RF-021 — Incidentes:** o sistema deve agrupar falhas por correlation ID quando disponível, classificar a origem em `validação`, `Google Calendar`, `Supabase`, `Evolution`, `worker` ou `desconhecida`, e permitir anotar e encerrar o incidente.
- **RF-022 — Auditoria administrativa:** toda ação administrativa deve registrar autor, data/hora, entidade, ação, resultado e correlation ID quando existir.
- **RF-023 — Bloqueio de dia inteiro:** o administrador deve conseguir bloquear um dia inteiro; a ação deve criar um evento de dia inteiro no Google Calendar para impedir novas marcações naquele dia.
- **RF-044 — Atendimento conjunto:** o portal deve permitir escolher entre atendimento individual e atendimento de duas pessoas, exigindo o nome da segunda pessoa somente no segundo caso e reservando dois slots consecutivos.
- **RF-045 — Orientações antes da confirmação:** antes de confirmar, o portal deve listar todos os procedimentos com `online_booking = false`, acompanhados da orientação cadastrada, pois eles não podem ser marcados diretamente pelo portal.
- **RF-046 — Identificação na agenda:** consultas devem ser identificadas na agenda pelo padrão `Nome Telefone`; quando houver duas pessoas, o título deve identificar ambos os nomes e o telefone do paciente responsável.
- **RF-047 — Central de gestão:** a área interna deve reunir cadastros clínicos, agenda, conteúdo, pacientes, equipe e auditoria em uma central navegável no celular e no desktop.
- **RF-048 — Gestão de procedimentos:** o proprietário deve poder criar e editar nome, orientação, estado ativo e permissão para iniciar avaliação pelo portal, sem excluir fisicamente o procedimento.
- **RF-049 — Gestão de planos e aliases:** o proprietário deve poder criar e editar planos, instruções, estado ativo e nomes alternativos; o sistema deve rejeitar aliases ambíguos ou iguais a outro plano canônico.
- **RF-050 — Gestão de disponibilidade:** o proprietário deve poder editar períodos semanais e cadastrar, alterar ou desativar exceções de data por profissional.
- **RF-051 — Gestão de profissionais:** o proprietário deve poder criar e editar profissional, agenda Google vinculada e estado ativo, mantendo o timezone da clínica.
- **RF-052 — Gestão de conteúdo:** o proprietário deve poder criar e editar perguntas frequentes, categoria, resposta e estado ativo usados pelo atendimento no WhatsApp.
- **RF-053 — Auditoria de gestão:** toda alteração de cadastro deve registrar autor, entidade, ação, campos alterados e data/hora, sem armazenar secrets.
- **RF-054 — Gestão de acessos:** somente o proprietário deve poder convidar, alterar papel, ativar ou revogar acesso interno; operadores permanecem somente leitura para configurações.
- **RF-055 — Cobertura por plano:** o proprietário deve poder definir, para cada combinação de plano e procedimento, se há aceitação e qual orientação deve ser apresentada à equipe.
- **RF-056 — Gestão de pacientes:** a equipe interna deve poder buscar pacientes e corrigir nome e plano; alteração de telefone e exclusão de paciente ficam fora do fluxo comum.
- **RF-057 — Aviso de atendimento humano:** quando uma conversa exigir atendimento da equipe, o sistema deve avisar diretamente o WhatsApp configurado da doutora com nome cadastrado, telefone e motivo da solicitação.
- **RF-058 — Confirmação de presença pelo WhatsApp:** às 20h do dia anterior, no horário de São Paulo, o sistema deve solicitar confirmação de presença para cada consulta do dia seguinte; o paciente deve poder confirmar no próprio chat por botão ou texto, mantendo o link como apoio para consultar, remarcar ou cancelar.
- **RF-059 — Resumo diário de confirmações:** diariamente pela manhã, em horário configurável com padrão às 08h de São Paulo, o sistema deve avisar o WhatsApp configurado da doutora com a quantidade confirmada sobre o total de consultas do dia e listar nome e telefone dos pacientes ainda não confirmados.
- **RF-060 — Importação controlada do Google Calendar:** o sistema deve incluir nas confirmações e no resumo os atendimentos criados diretamente no Google Calendar quando forem eventos cronometrados, bloquearem o horário, tiverem duração suportada e título no padrão `Nome Telefone`; eventos inválidos, bloqueios e registros já vinculados não podem gerar paciente ou mensagem duplicada.

## Requisitos não funcionais

- **RNF-011 — Privacidade operacional:** o painel deve mostrar somente os dados necessários ao atendimento; nunca deve exibir secrets, chaves privadas, tokens, payloads brutos de webhooks ou conteúdo clínico.
- **RNF-012 — Segurança interna:** operações que alteram agenda exigem autenticação interna, autorização e confirmação explícita.
- **RNF-013 — Consistência:** bloqueios e alterações administrativos devem respeitar a agenda oficial e não confirmar uma consulta quando a disponibilidade não puder ser verificada.
- **RNF-014 — Investigação:** uma falha exibida no painel deve trazer timestamp, serviço, categoria, correlation ID e mensagem segura para permitir triagem sem terminal.
- **RNF-015 — Acesso gerenciado:** o provisionamento e a revogação de acessos internos devem ocorrer pelo proprietário, com registro de auditoria.
- **RNF-016 — Minimização do acompanhante:** o nome da segunda pessoa não pode ser persistido no Supabase, em auditoria, idempotência, logs ou notificações; ele existe somente no evento daquela consulta no Google Calendar.
- **RNF-017 — Alterações administrativas seguras:** mutações de gestão devem validar origem, autenticação, papel, formato, concorrência e referências; cadastros históricos usam desativação lógica e exibem resultado acionável.
- **RNF-018 — Entrega confiável do handoff:** o aviso à doutora deve usar fila idempotente, retry limitado e destino configurado fora do código; dados pessoais do aviso não podem ser emitidos em logs.
- **RNF-019 — Confirmação confiável e privada:** solicitações, respostas e resumos devem ser idempotentes, usar o telefone autenticado pelo webhook e a fila durável existente, não expor dados pessoais em logs e não alterar nem cancelar uma consulta por ausência de resposta.
- **RNF-020 — Sincronização externa segura:** a importação deve ser somente leitura no Google Calendar, idempotente por evento e profissional, falhar fechada sem reconciliar exclusões quando a leitura estiver indisponível, não sobrescrever o nome de paciente já cadastrado e não extrair destinatários de títulos ambíguos.

## Regras de negócio

- Google Calendar continua sendo a fonte de ocupação da dentista.
- Ações administrativas que mudem uma consulta devem usar o mesmo fluxo seguro de disponibilidade, idempotência e auditoria do portal do paciente.
- Um bloqueio administrativo deve ser distinguido de uma consulta e identificado visualmente na agenda.
- Um bloqueio de dia inteiro feito pelo painel deve existir no Google Calendar antes de ser considerado concluído; falhas devem manter o incidente aberto e não apresentar sucesso.
- Fechar um incidente não apaga logs nem eventos de auditoria.
- O painel deve mascarar telefone em listas; o número completo só aparece no detalhe para o administrador autorizado.
- A linha do tempo operacional e o título do Google Calendar usam `Nome Telefone`; outras listas continuam mascarando o número.
- Consulta individual ocupa 15 minutos; atendimento conjunto ocupa 30 minutos contínuos e só pode iniciar quando os dois slots de 15 minutos estiverem livres.
- O nome da segunda pessoa não cria perfil e não é gravado nas tabelas da aplicação; o Google Calendar é o único registro nominal desse acompanhante para aquela consulta.
- `online_booking` significa que o paciente pode iniciar uma avaliação pelo portal; não representa marcação direta de um procedimento específico.
- Procedimentos, planos, profissionais, FAQs, aliases e exceções são desativados em vez de excluídos pelo painel.
- Filas, tokens, holds, inbox, outbox e logs não possuem edição livre; ações operacionais futuras devem ser comandos controlados.
- O proprietário altera configurações e acessos; o operador pode consultá-los e operar agenda, pacientes e incidentes.
- O motivo do atendimento humano usa a solicitação original normalizada e limitada; o botão “Falar com equipe” usa uma descrição explícita. O nome é obtido pelo telefone e pode aparecer como “Não informado” quando ainda não houver cadastro.
- Consulta agendada e presença confirmada são estados distintos; confirmar presença não recria a consulta nem altera sua ocupação no Google Calendar.
- A resposta “confirmo” só confirma automaticamente quando existe uma única consulta futura elegível para o telefone remetente; ambiguidades direcionam o paciente à agenda segura.
- Remarcação reinicia a confirmação de presença; falta de resposta mantém a consulta agendada como pendente de confirmação.
- O resumo diário exclui consultas canceladas, apresenta `0 de 0` nos dias sem consultas e usa o mesmo número configurado para avisos operacionais da doutora.
- A importação de evento direto aceita somente título com nome não vazio seguido por telefone brasileiro válido, evento não transparente, não integral e duração de 15 ou 30 minutos.
- Um evento direto movido reinicia a confirmação; um evento removido ou que deixe de atender aos critérios deixa de participar de novas mensagens e do resumo, sem apagar o histórico importado.

## Critérios de aceitação

- **CA-016:** usuário sem acesso interno não consegue abrir nenhuma rota nem consultar dados administrativos.
- **CA-017:** administrador visualiza agenda de uma data e identifica consulta, bloqueio, origem e status.
- **CA-018:** busca por telefone, data, ID de consulta ou correlation ID encontra o registro operacional correspondente quando existir.
- **CA-019:** uma criação, remarcação, cancelamento ou bloqueio administrativo não produz conflito de horário e gera auditoria.
- **CA-020:** uma falha de Calendar, Evolution, worker ou validação aparece com origem, timestamp e correlation ID, sem segredo ou payload sensível.
- **CA-021:** ao anotar e encerrar incidente, o painel preserva a falha original e registra autor, data e nota.
- **CA-022:** consultas criadas pelo agente/portal e ações administrativas podem ser diferenciadas na agenda e no detalhe da consulta.
- **CA-023:** ao bloquear um dia inteiro, o painel cria um evento de dia inteiro no Google Calendar; a disponibilidade do portal não retorna horários para aquela data.
- **CA-044:** ao selecionar duas pessoas, dias/horários sem dois slots consecutivos desaparecem; hold, confirmação e remarcação protegem os 30 minutos completos contra conflito.
- **CA-045:** a confirmação fica indisponível até o nome da segunda pessoa ser válido; na mesma tela e antes do botão final aparecem todos os procedimentos com `online_booking = false`, incluindo os ativos, com nome e orientação cadastrada.
- **CA-046:** uma consulta individual cria título `Nome Telefone`; uma consulta conjunta cria `Nome e Segundo nome Telefone`, sem que o segundo nome apareça em nenhuma persistência Supabase.
- **CA-047:** a central de gestão permite abrir cada módulo sem acrescentar novas opções à barra inferior e preserva usabilidade em largura móvel.
- **CA-048:** criar ou editar procedimento atualiza os dados exibidos em novas sessões do portal e em novas respostas do WhatsApp; desativar preserva o registro.
- **CA-049:** plano e aliases válidos ficam disponíveis nas novas consultas; alias que conflita com plano ou outro alias retorna erro antes de gravar.
- **CA-050:** períodos ativos e exceções ativas alteram a disponibilidade subsequente; períodos sobrepostos ou inválidos são rejeitados.
- **CA-051:** somente profissionais ativos aparecem ao paciente; calendário vazio ou duplicado é rejeitado.
- **CA-052:** somente FAQs ativas alimentam novas respostas e o painel permite pré-visualizar pergunta e resposta.
- **CA-053:** após cada mutação bem-sucedida, a auditoria identifica autor, entidade, ação e campos alterados.
- **CA-054:** operador recebe `403` em qualquer mutação de configuração ou acesso; proprietário consegue convidar e revogar sem expor credenciais.
- **CA-055:** a matriz plano × procedimento salva aceitação e orientação e pode ser consultada na central de gestão.
- **CA-056:** busca de pacientes retorna nome, telefone mascarado, plano e histórico básico; edição comum não permite alterar telefone.
- **CA-057:** um handoff cria uma única notificação enfileirada para a doutora; a mensagem entregue contém nome ou fallback, telefone legível e motivo, e uma nova tentativa do inbox não cria um segundo evento para o mesmo handoff.
- **CA-058:** cada consulta ativa do dia seguinte recebe no máximo uma solicitação para a versão vigente do horário, disponível às 20h; botão ou texto de confirmação do mesmo telefone registra presença uma única vez, responde com sucesso e não confunde múltiplas consultas nem consultas inexistentes.
- **CA-059:** uma única mensagem por data é disponibilizada no horário matinal configurado; ela informa `confirmadas de total` e, quando houver pendências, lista nome, telefone legível e horário sem incluir esses dados nos logs.
- **CA-060:** após sincronização bem-sucedida, evento direto válido cria ou atualiza uma única consulta importada e entra no mesmo fluxo das 20h; evento já vinculado não é duplicado, título/telefone/duração inválidos são ignorados, e remoção ou alteração inválida cancela somente a projeção importada correspondente.

## Métricas de sucesso

- Tempo para localizar a causa de um erro relatado.
- Percentual de falhas com origem identificada.
- Quantidade de operações administrativas concluídas sem reconciliação.
- Quantidade de incidentes abertos e tempo até encerramento.

## Riscos e perguntas abertas

- Acesso aprovado: o desenvolvedor é proprietário e pode convidar a dentista para acesso operacional; Supabase Auth é a credencial interna definida. MFA fica fora da primeira versão, sujeito a revisão de segurança antes de produção.
- Definir retenção de logs, telefone completo no detalhe e prazo para ocultação/anonimização.
- Bloqueio aprovado: bloqueios administrativos de dia inteiro criam evento de dia inteiro no Google Calendar; não haverá bloqueio apenas interno nessa primeira versão.
- Definir se o administrador pode reenviar mensagens/notificações manualmente na primeira versão.
- O atendimento conjunto depende de smoke de concorrência no PostgreSQL e de validação do evento no Google Calendar de homologação.

## Aprovação

Status: aprovado pelo solicitante em 2026-07-17; extensão de atendimento conjunto, identificação `Nome Telefone` e aviso pré-confirmação aprovada em 2026-07-27; central completa de gestão RF-047–RF-056 e RNF-017 aprovada em 2026-07-27; aviso direto de handoff RF-057 e RNF-018 aprovado em 2026-07-27; confirmação de presença às 20h e resumo matinal RF-058–RF-059 e RNF-019 aprovados pelo solicitante em 2026-07-27; inclusão controlada de eventos diretos do Google Calendar RF-060 e RNF-020 aprovada pelo solicitante em 2026-07-27 com a instrução “pode seguir então”.
