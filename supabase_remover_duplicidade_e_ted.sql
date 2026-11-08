-- ==============================================================================
-- INTEGRA CRVA - SCRIPT DE AUDITORIA E REMOÇÃO DE DUPLICIDADE EM MOVIMENTAÇÕES
-- DATA: 2026-11-08
-- OBJETIVO: 
-- 1. Excluir o lançamento em duplicidade gerado por clique duplo no Despachante Central
-- 2. Garantir integridade e idempotência nas movimentações de caixa
-- ==============================================================================

-- 1. Exclusão do registro em duplicidade (#928317E3) preservando a transação original (#C32518C9)
DELETE FROM movimentacoes_caixa 
WHERE (id = '928317e3-f5db-4a23-b5a2-e0cdc481d5f1' OR id_transacao = '#928317E3' OR numero_recibo = '#928317E3')
  AND (tomador_cliente ILIKE '%Despachante Central%' OR descricao ILIKE '%Despachante Central%')
  AND valor = 111.08;

-- 2. Auditoria e verificação das transações do Despachante Central
SELECT 
    id,
    criado_em,
    id_transacao,
    numero_recibo,
    servico_operacao,
    tomador_cliente,
    forma_pagamento,
    valor,
    status
FROM movimentacoes_caixa
WHERE tomador_cliente ILIKE '%Despachante Central%'
ORDER BY criado_em DESC;

