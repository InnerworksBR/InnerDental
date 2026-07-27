# Plano

1. Expandir o schema de mensageria e tornar o fechamento do worker verificável.
2. Criar consumo atômico de hold e proteção de unicidade das consultas.
3. Tornar OTP atômico, limitado e livre de colisão histórica.
4. Implementar logout, estado de perfil e tratamento de erros na agenda.
5. Ampliar readiness e documentação de configuração.
6. Atualizar dependências, testes e pipeline; executar validação completa.

## Rollout da migration

- Aplicar a migration antes do novo web/worker, pois ela é compatível com os valores antigos.
- Monitorar violações de slot, falhas de OTP e itens de inbox em `processing` por mais de cinco minutos.
- Em caso de falha, interromper o rollout e aplicar forward-fix; nenhuma coluna/tabela existente será removida.
