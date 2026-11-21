-- ============================================================================
-- INTEGRA CRVA / PDV - PATCH: SEQUÊNCIA AUTOMÁTICA E COLUNA numero_recibo
-- Garante numeração sequencial limpa (REC-001001, REC-001002...) e backfill
-- em atendimentos, comandas_balcao e movimentacoes_caixa (100% idempotente).
-- Execute este script no SQL Editor do Supabase.
-- ============================================================================

-- 1. Cria a sequência automática para numeração sequencial limpa de recibos
CREATE SEQUENCE IF NOT EXISTS public.seq_numero_recibo START 1001;

-- 2. Aplica a coluna numero_recibo e backfill de forma segura em cada tabela existente
DO $$
BEGIN
  -- 2.1 Tabela atendimentos (se existir no schema)
  IF to_regclass('public.atendimentos') IS NOT NULL THEN
    ALTER TABLE public.atendimentos
      ADD COLUMN IF NOT EXISTS numero_recibo TEXT
      DEFAULT ('REC-' || LPAD(nextval('public.seq_numero_recibo')::TEXT, 6, '0'));

    UPDATE public.atendimentos
    SET numero_recibo = 'REC-' || LPAD(nextval('public.seq_numero_recibo')::TEXT, 6, '0')
    WHERE numero_recibo IS NULL;

    CREATE INDEX IF NOT EXISTS idx_atendimentos_numero_recibo
      ON public.atendimentos(numero_recibo);
  END IF;

  -- 2.2 Tabela comandas_balcao (atendimentos/ordens do balcão CRVA)
  IF to_regclass('public.comandas_balcao') IS NOT NULL THEN
    ALTER TABLE public.comandas_balcao
      ADD COLUMN IF NOT EXISTS numero_recibo TEXT
      DEFAULT ('REC-' || LPAD(nextval('public.seq_numero_recibo')::TEXT, 6, '0'));

    UPDATE public.comandas_balcao
    SET numero_recibo = COALESCE(
      NULLIF(TRIM(protocolo), ''),
      'REC-' || LPAD(nextval('public.seq_numero_recibo')::TEXT, 6, '0')
    )
    WHERE numero_recibo IS NULL;

    CREATE INDEX IF NOT EXISTS idx_comandas_balcao_numero_recibo
      ON public.comandas_balcao(numero_recibo);
  END IF;

  -- 2.3 Tabela movimentacoes_caixa (lançamentos e vendas do Integra PDV)
  IF to_regclass('public.movimentacoes_caixa') IS NOT NULL THEN
    ALTER TABLE public.movimentacoes_caixa
      ADD COLUMN IF NOT EXISTS numero_recibo TEXT
      DEFAULT ('REC-' || LPAD(nextval('public.seq_numero_recibo')::TEXT, 6, '0'));

    UPDATE public.movimentacoes_caixa
    SET numero_recibo = 'REC-' || LPAD(nextval('public.seq_numero_recibo')::TEXT, 6, '0')
    WHERE numero_recibo IS NULL;

    CREATE INDEX IF NOT EXISTS idx_mov_caixa_numero_recibo
      ON public.movimentacoes_caixa(numero_recibo);
  END IF;
END $$;

-- 3. Recarrega o schema cache do PostgREST imediatamente
NOTIFY pgrst, 'reload schema';
