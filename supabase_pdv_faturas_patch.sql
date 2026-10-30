-- =====================================================================
--  PATCH: CONTROLE DE FATURAS DE DESPACHANTES E LIQUIDAÇÃO DE CONTAS
--  Executável no Supabase SQL Editor (100% idempotente)
-- =====================================================================

-- 1. Colunas na tabela movimentacoes_caixa para rastreamento de faturas
ALTER TABLE public.movimentacoes_caixa
  ADD COLUMN IF NOT EXISTS fatura_liquidada BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fatura_numero VARCHAR(50);

-- 2. Índices de alta performance para faturas a prazo e esteira de quitação
CREATE INDEX IF NOT EXISTS idx_mov_faturamento_aberto 
  ON public.movimentacoes_caixa(forma_pagamento, tipo, fatura_liquidada)
  WHERE forma_pagamento = 'faturamento';

CREATE INDEX IF NOT EXISTS idx_mov_despachante_fatura
  ON public.movimentacoes_caixa(despachante_id, forma_pagamento, fatura_liquidada);

-- 3. Atualizar faturas anteriores de despachantes que já estejam com saldo zerado
UPDATE public.movimentacoes_caixa m
   SET fatura_liquidada = TRUE
  FROM public.despachantes d
 WHERE m.despachante_id = d.id
   AND m.forma_pagamento = 'faturamento'
   AND d.saldo_devedor <= 0;

