-- ==============================================================================
-- PATCH SUPABASE: UNIFICAÇÃO DA TABELA public.movimentacoes_caixa
-- Centralização contábil de pagamentos imediatos (Balcão/PDV) e lançamentos a prazo (B2B Despachantes)
-- ==============================================================================

-- 1. Criação das novas colunas de auditoria rápida se não existirem
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS horario text;
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS id_transacao text;
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS servico_operacao text;
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS tomador_cliente text;
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS status text DEFAULT 'liquidado';
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS operador_nome text;
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 2. Garantia de compatibilidade com colunas tradicionais
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS numero_recibo text;
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS protocolo_recibo text;
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS fatura_numero text;
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS fatura_liquidada boolean DEFAULT false;
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS valor_bruto numeric(12,2);
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS valor_liquido numeric(12,2);
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS valor_issqn numeric(12,2);
ALTER TABLE public.movimentacoes_caixa ADD COLUMN IF NOT EXISTS aliquota_issqn numeric(5,2) DEFAULT 2.00;

-- 3. Flexibilização de nulidade para operações avulsas de balcão (sem caixa_id aberto prévio)
DO $$
BEGIN
  ALTER TABLE public.movimentacoes_caixa ALTER COLUMN caixa_id DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 4. Garantia de tipo texto para suportar 'Faturado a Prazo (B2B)', 'PIX', 'Cartão Débito', 'Cartão Crédito', etc.
DO $$
BEGIN
  ALTER TABLE public.movimentacoes_caixa ALTER COLUMN forma_pagamento TYPE text;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.movimentacoes_caixa ALTER COLUMN tipo TYPE text;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 5. Atualização de registros legados para preenchimento dos campos unificados
UPDATE public.movimentacoes_caixa
SET 
  horario = COALESCE(horario, to_char(criado_em, 'HH24:MI')),
  id_transacao = COALESCE(id_transacao, protocolo_recibo, numero_recibo, concat('#REC-', substring(id::text, 1, 6))),
  servico_operacao = COALESCE(servico_operacao, split_part(descricao, ' | ', 1), 'Atendimento Balcão'),
  tomador_cliente = COALESCE(tomador_cliente, split_part(descricao, ' | ', 2), 'Consumidor'),
  status = COALESCE(status, CASE WHEN tipo = 'faturamento_despachante' OR forma_pagamento ILIKE '%prazo%' THEN 'a_receber' ELSE 'liquidado' END),
  created_at = COALESCE(created_at, criado_em, now())
WHERE horario IS NULL OR id_transacao IS NULL OR servico_operacao IS NULL OR tomador_cliente IS NULL OR status IS NULL;

-- 6. Habilitação de RLS e políticas seguras de consulta e auditoria
ALTER TABLE public.movimentacoes_caixa ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'movimentacoes_caixa' AND policyname = 'Permitir leitura de movimentacoes para todos'
  ) THEN
    CREATE POLICY "Permitir leitura de movimentacoes para todos"
      ON public.movimentacoes_caixa
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'movimentacoes_caixa' AND policyname = 'Permitir insercao de movimentacoes auditadas'
  ) THEN
    CREATE POLICY "Permitir insercao de movimentacoes auditadas"
      ON public.movimentacoes_caixa
      FOR INSERT
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'movimentacoes_caixa' AND policyname = 'Permitir atualizacao de movimentacoes'
  ) THEN
    CREATE POLICY "Permitir atualizacao de movimentacoes"
      ON public.movimentacoes_caixa
      FOR UPDATE
      USING (true);
  END IF;
END $$;

-- Notificar o PostgREST para recarregar o schema cache imediatamente
NOTIFY pgrst, 'reload schema';

