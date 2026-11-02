-- =====================================================================
--  INTEGRA CRVA / PDV - MIGRATION: FATURAMENTO DIRETO A PRAZO NO BALCÃO
--  Permite lançamento de serviços em conta-corrente de despachante sem caixa ativo
--  Executável no SQL Editor do Supabase (100% idempotente).
-- =====================================================================

-- 1. Permitir caixa_id nulo para registros originados no balcão sem caixa aberto
ALTER TABLE public.movimentacoes_caixa 
  ALTER COLUMN caixa_id DROP NOT NULL;

-- 2. Expandir tamanho da coluna tipo e atualizar a restrição CHECK
ALTER TABLE public.movimentacoes_caixa 
  ALTER COLUMN tipo TYPE VARCHAR(50);

DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.movimentacoes_caixa'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.movimentacoes_caixa DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.movimentacoes_caixa
  ADD CONSTRAINT movimentacoes_caixa_tipo_check
  CHECK (tipo IN ('venda', 'sangria', 'suprimento', 'liquidacao_fatura', 'faturamento_despachante'));

-- 3. Adicionar colunas de auditoria de recibo, serviços e valores consolidados
ALTER TABLE public.movimentacoes_caixa
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'aguardando_liquidacao',
  ADD COLUMN IF NOT EXISTS numero_recibo VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fatura_numero VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fatura_liquidada BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS servicos JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL;

-- 4. Atualizar trigger de auditoria para suportar lançamentos com caixa_id nulo
CREATE OR REPLACE FUNCTION public.fn_auditar_movimentacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dono UUID;
BEGIN
  IF NEW.caixa_id IS NOT NULL THEN
    SELECT operador_id INTO v_dono FROM public.caixas_diarios WHERE id = NEW.caixa_id;
  END IF;

  NEW.valor_bruto := COALESCE(NEW.valor_bruto, NEW.valor, NEW.valor_total, NEW.subtotal);
  NEW.valor := COALESCE(NEW.valor, NEW.valor_total, NEW.valor_bruto);
  NEW.valor_total := COALESCE(NEW.valor_total, NEW.valor, NEW.valor_bruto);
  NEW.subtotal := COALESCE(NEW.subtotal, NEW.valor_bruto);
  NEW.aliquota_issqn := COALESCE(NEW.aliquota_issqn, 2.00);
  NEW.operador_id := COALESCE(NEW.operador_id, auth.uid(), v_dono);

  IF NEW.operador_nome IS NULL OR btrim(NEW.operador_nome) = '' THEN
    SELECT nome_completo INTO NEW.operador_nome FROM public.perfis WHERE id = NEW.operador_id;
    NEW.operador_nome := COALESCE(NEW.operador_nome, 'Atendente Balcão CRVA');
  END IF;

  IF NEW.tipo IN ('venda', 'liquidacao_fatura', 'faturamento_despachante') THEN
    NEW.valor_issqn := COALESCE(NEW.valor_issqn, ROUND(NEW.valor_bruto * NEW.aliquota_issqn / 100, 2));
  ELSE
    NEW.valor_issqn := 0.00;
  END IF;
  NEW.valor_liquido := COALESCE(NEW.valor_liquido, NEW.valor_bruto);

  IF NEW.numero_recibo IS NOT NULL AND NEW.fatura_numero IS NULL THEN
    NEW.fatura_numero := NEW.numero_recibo;
  ELSIF NEW.fatura_numero IS NOT NULL AND NEW.numero_recibo IS NULL THEN
    NEW.numero_recibo := NEW.fatura_numero;
  END IF;

  IF NEW.tipo IN ('sangria', 'suprimento') THEN
    NEW.justificativa_motivo := COALESCE(NULLIF(btrim(NEW.justificativa_motivo), ''), NULLIF(btrim(NEW.descricao), ''));
    IF NEW.justificativa_motivo IS NULL THEN
      RAISE EXCEPTION 'Justificativa obrigatória para sangrias e suprimentos.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Atualizar políticas RLS de movimentacoes_caixa para permitir lançamentos do balcão
DROP POLICY IF EXISTS "Permitir insercao de faturamento balcao" ON public.movimentacoes_caixa;
CREATE POLICY "Permitir insercao de faturamento balcao"
  ON public.movimentacoes_caixa
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tipo = 'faturamento_despachante'
    OR caixa_id IS NULL
    OR EXISTS (SELECT 1 FROM public.caixas_diarios c WHERE c.id = caixa_id AND c.operador_id = auth.uid() AND c.status = 'aberto')
    OR public.fn_role_atual() IN ('master','gerente','financeiro','atendente','caixa')
  );

DROP POLICY IF EXISTS "Permitir leitura total autenticada de movimentacoes" ON public.movimentacoes_caixa;
CREATE POLICY "Permitir leitura total autenticada de movimentacoes"
  ON public.movimentacoes_caixa
  FOR SELECT
  TO authenticated
  USING (true);

-- 6. Índices para performance
CREATE INDEX IF NOT EXISTS idx_mov_faturamento_despachante 
  ON public.movimentacoes_caixa(despachante_id, forma_pagamento, status);

CREATE INDEX IF NOT EXISTS idx_mov_recibo 
  ON public.movimentacoes_caixa(numero_recibo);

-- Força o PostgREST a recarregar o schema cache
NOTIFY pgrst, 'reload schema';

