-- ============================================================================
-- INTEGRA CRVA - PATCH: PROTOCOLO DE RECIBO VINCULADO EM MOVIMENTACOES_CAIXA
-- Execute no SQL Editor do Supabase (idempotente).
-- ============================================================================

-- 1. Garante a coluna protocolo_recibo e numero_recibo na tabela movimentacoes_caixa
ALTER TABLE public.movimentacoes_caixa 
  ADD COLUMN IF NOT EXISTS protocolo_recibo VARCHAR(60),
  ADD COLUMN IF NOT EXISTS numero_recibo VARCHAR(60);

-- 2. Cria índice para busca rápida por número de protocolo / recibo
CREATE INDEX IF NOT EXISTS idx_mov_protocolo_recibo 
  ON public.movimentacoes_caixa(protocolo_recibo);

CREATE INDEX IF NOT EXISTS idx_mov_numero_recibo 
  ON public.movimentacoes_caixa(numero_recibo);

-- 3. Notifica recarga do schema cache do PostgREST
NOTIFY pgrst, 'reload schema';

