# Incidente: roteamento definitivo do WhatsApp

Data: 2026-08-12

## Resultado exigido

Eliminar respostas factualmente erradas e loops de contexto no atendimento da clínica. Fatos
críticos e ações devem ser decididos por código e dados estruturados. A IA é opcional e não pode
selecionar plano, procedimento, cobertura, pagamento, política infantil, link ou ação.

## Causas confirmadas

1. O catálogo ativo contém nomes canônicos que também são aliases de outro plano, fazendo
   Odontoprev e Bradesco Dental retornarem ambiguidade impossível de esclarecer.
2. O resolvedor usa aproximação por substring/palavra de marca, confundindo nomes próprios com
   planos e frases genéricas com atendimento particular.
3. Uma sessão `awaiting_plan` intercepta assuntos novos e chama qualquer texto curto desconhecido
   de plano não atendido.
4. O plano salvo do paciente vira resposta isolada para perguntas sem relação, como pagamento da
   manutenção do aparelho no cartão.
5. FAQ é selecionada por uma única palavra da pergunta ou da própria resposta, produzindo o loop
   “não possuo o link” → “acesse o link”.
6. A regra infantil existe em um helper que o worker não usa.
7. O worker grava atendimento particular como sessão aceita sem `insurance_plan_id`, contrariando
   a constraint do banco, depois de já ter enviado a resposta.
8. O debounce pode anexar mensagens `failed` antigas a uma conversa nova sem limite temporal.
9. OpenAI está documentada como opcional, mas sua ausência derruba o readiness.

## Invariantes da correção

- Cada termo público normalizado de plano aponta para exatamente um plano ativo.
- Conforme o PRD raiz, `Bradesco Dental`, `Odontoprev`, `Odontopreve`, `BB Dental` e `Previan`
  são termos públicos da `Rede UNNA`; registros canônicos duplicados devem ter todas as referências
  compatíveis (`patients`, `appointments`, `whatsapp_plan_triage_sessions` e
  `procedure_coverage`) remapeadas antes de serem desativados. Conflitos de cobertura abortam a
  migration.
- Nome canônico e alias são correspondências explícitas; grafias alternativas precisam estar
  cadastradas como aliases. Não há fuzzy matching por substring.
- Termo desconhecido significa “não identificado”, nunca “não atendido”. Rejeição só usa uma
  regra negativa cadastrada e inequívoca.
- A sessão de plano só consome uma resposta reconhecida como plano/particular. Uma pergunta nova
  tem prioridade e encerra ou ignora a pendência sem ser sequestrada.
- Plano salvo só qualifica cobertura quando a mensagem atual também resolve um procedimento e
  pede informação relacionada. Nunca é uma resposta autônoma por contexto.
- FAQ usa categoria/intenção e evidência suficiente da pergunta, nunca palavras da resposta.
- Política infantil e pedidos de reenvio de link são rotas determinísticas do pipeline ativo.
- Toda orientação de acesso ao portal inclui URL/botão real gerado naquela resposta.
- Atendimento particular resolve para o UUID do plano canônico ativo `Particular`, completa o perfil
  usado pelo portal e é salvo no estado existente `accepted` antes do envio.
- A aceitação de plano atualiza triagem e paciente numa única transação/RPC antes do envio; falha
  parcial não pode deixar sessão aceita com perfil incompleto.
- Gravações concorrentes de planos/aliases não podem violar a propriedade única de um termo público.
  A manutenção administrativa do plano e de todos os aliases é transacional.
- Mensagem antiga/falhada não é incorporada a uma conversa nova fora da janela de debounce.
- Sem `OPENAI_API_KEY`, o serviço continua correto e o readiness informa IA desativada, não falha.
- Catálogo/schema incompatível deve falhar fechado e ser detectável antes de liberar tráfego.

## Invariantes adicionais de retry e concorrência

- O aceite registra `accepted_by_inbox_id`; somente o mesmo inbox, prompt e plano podem repetir o
  aceite e retomar `pending_message`. Um inbox posterior nunca revive contexto antigo.
- Criar, substituir, rejeitar e aceitar triagem são transições compare-and-set serializadas pelo
  mesmo lock de telefone. Uma leitura atrasada não pode sobrescrever uma sessão aceita.
- Um inbox gera no máximo uma entrega de link. Token e entrega são persistidos atomicamente, o token
  opaco fica cifrado em repouso e a mesma URL é reutilizada em qualquer retry.
- Todo replay valida novamente que o plano continua ativo e que o perfil ainda aponta para ele.

## Casos de aceitação obrigatórios

1. `Odontoprev`, `Odontopreve` e uma frase longa contendo `Bradesco Dental` resolvem um único plano
   aceito; nunca retornam “mais de um plano”.
2. Durante `awaiting_plan`, `Jonathan Dos Reis Santos` e `Priscilla de Moraes Queiroz` não alteram
   plano e não recebem “esse plano não é atendido”.
3. `Camila de Souza`, `Meu nome é Amilton`, `Não possuo esse link` e `Sem pressa` jamais são
   identificados como Amil ou Particular.
4. Com DentalPar salvo, `Eu posso pagar a manutenção do aparelho no cartão de crédito?` segue
   pagamento/fallback humano e nunca menciona DentalPar ou outro plano.
5. `Atende criança também?` responde a regra cadastrada de menores de 8 anos, sem mencionar plano.
6. `Não possuo esse link`, `não recebi o link` e `pode enviar outro link?` geram acesso novo real.
7. `Mas a clínica atende?` não seleciona a FAQ de gerenciamento de consulta.
8. Atendimento `Particular` persiste com o UUID canônico ativo, antes do envio, não entra em retry e
   o link gerado permite concluir o agendamento no portal sem obrigar a escolha de outro convênio.
9. Uma mensagem `failed` antiga não é concatenada à mensagem recebida agora.
10. OpenAI ausente não impede readiness nem altera as respostas determinísticas acima.
11. Teste de invariante rejeita catálogo no qual um termo normalizado aponta para IDs ativos
    diferentes.

12. Se criação de token, envio ou finalização falhar depois do aceite, o retry do mesmo inbox restaura
    o pedido original e reutiliza uma única URL; um inbox diferente não restaura o contexto antigo.
13. Uma rejeição concorrente baseada em leitura antiga não consegue sobrescrever uma sessão aceita.
14. Readiness executado sem OpenAI retorna 200 quando o schema determinístico está pronto e retorna
    503 quando a RPC/schema exigidos estão ausentes ou incompatíveis.
15. Um replay aceito falha fechado se o plano foi desativado ou o perfil do paciente foi alterado.

## Escopo de rollout

O ciclo altera somente código, migrations, testes e documentação local. Aplicar migration em banco
externo, reconstruir imagens, promover containers e realizar smoke real exigem uma etapa operacional
separada com SHA/digest verificável e autorização explícita.
