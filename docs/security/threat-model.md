# Threat model e revisão de segurança

Data: 2026-07-16. Escopo: código local, migrations, imagens e configuração de homologação. Não houve scanner ativo, acesso a rede privada, credenciais ou dados reais.

## Ativos e fronteiras

Ativos principais: identidade por telefone, tokens de sessão/OTP, consultas, eventos Calendar, mensagens WhatsApp e credenciais de integração. As fronteiras são navegador → Next.js, Evolution → webhook, Next/worker → Supabase, Next → Google Calendar e worker → Evolution.

## Ameaças e controles

| Ameaça | Controle verificado | Risco residual |
|---|---|---|
| enumeração ou força bruta de OTP | resposta uniforme, hash, expiração, uso único e rate limit no PostgreSQL | validar limites com tráfego autorizado em homologação |
| CSRF em mutações autenticadas | cookie SameSite=Lax e validação de `Origin`/`Sec-Fetch-Site`; webhook é excluído e usa assinatura | clientes não-browser sem headers continuam permitidos e dependem de sessão válida |
| replay/forja de webhook | API key da instância validada em tempo constante, deduplicação por `external_id`, schema e inbox persistente | rotacionar a chave se houver exposição e manter webhook somente em HTTPS |
| exposição de PII/segredo | logger com redaction, correlação opaca, métricas sem IDs, secrets somente em runtime | política de retenção/destino ainda precisa de aprovação |
| privilégio indevido no banco | RLS habilitado e service role restrita ao servidor | revisão com papéis reais do projeto Supabase continua externa |
| clickjacking/XSS/MIME sniffing | CSP, frame-ancestors/X-Frame-Options, nosniff e políticas de navegador | CSP permite inline de Next; adotar nonce é melhoria futura |
| container comprometido | usuário não-root, `no-new-privileges`, capabilities removidas e base por digest | scanner de imagem depende do CI/registry escolhido |
| confirmação sem Calendar | falha fechada e revalidação no serviço | E2E real depende da sandbox Calendar |

## Achados

Nenhum achado critical/high ficou aberto na análise estática local após os controles acima. Permanecem riscos médios bloqueadores de produção até validação externa: assinatura real da Evolution, papéis/RLS no projeto Supabase, definição de retenção/anonimização LGPD e o advisory transitivo `GHSA-qx2v-qp2m-jg93` no PostCSS 8.4.31 trazido pelo Next. O fluxo atual não recebe CSS não confiável, reduzindo a explorabilidade do advisory, mas a cadeia deve ser atualizada quando o Next adotar PostCSS corrigido ou após teste explícito de compatibilidade de override. A afirmação não equivale a garantir ausência de vulnerabilidades.
