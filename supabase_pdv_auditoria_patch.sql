-- =====================================================================
--  PATCH DE AUDITORIA TRANSACIONAL E FISCAL - INTEGRA PDV
--  [Onde, Quem, Quando] + ISSQN 2% segregado + Troca Rápida de Operador
--  Execute no SQL Editor do Supabase (idempotente). Requer
--  supabase_pdv_schema.sql e supabase_pdv_rls_policies.sql já aplicados.
--  Mantém a coluna legada "valor" (compatibilidade com o front/dashboards).
-- =====================================================================

-- 1. MOVIMENTACOES_CAIXA: colunas de auditoria ----------------------------

ALTER TABLE public.movimentacoes_caixa
  ADD COLUMN IF NOT EXISTS operador_id UUID REFERENCES auth.users(id),            -- QUEM
  ADD COLUMN IF NOT EXISTS operador_nome VARCHAR(255),                            -- QUEM (snapshot)
  ADD COLUMN IF NOT EXISTS valor_bruto NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS aliquota_issqn NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS valor_issqn NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS justificativa_motivo TEXT;

-- Tipo 'liquidacao_fatura' (quitação de fatura B2B)
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.movimentacoes_caixa'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%tipo%'
       AND pg_get_constraintdef(oid) ILIKE '%sangria%'
  LOOP
    EXECUTE format('ALTER TABLE public.movimentacoes_caixa DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.movimentacoes_caixa
  ADD CONSTRAINT movimentacoes_caixa_tipo_check
  CHECK (tipo IN ('venda', 'sangria', 'suprimento', 'liquidacao_fatura'));

-- Backfill dos registros anteriores ao patch
UPDATE public.movimentacoes_caixa m
   SET operador_id = c.operador_id
  FROM public.caixas_diarios c
 WHERE m.caixa_id = c.id AND m.operador_id IS NULL;

UPDATE public.movimentacoes_caixa m
   SET operador_nome = COALESCE(p.nome_completo, 'Operador não identificado')
  FROM public.perfis p
 WHERE m.operador_id = p.id AND m.operador_nome IS NULL;

UPDATE public.movimentacoes_caixa SET operador_nome = 'Operador não identificado' WHERE operador_nome IS NULL;
UPDATE public.movimentacoes_caixa SET valor_bruto = valor WHERE valor_bruto IS NULL;
UPDATE public.movimentacoes_caixa SET valor_liquido = valor_bruto WHERE valor_liquido IS NULL;
UPDATE public.movimentacoes_caixa
   SET valor_issqn = ROUND(valor_bruto * aliquota_issqn / 100, 2)
 WHERE tipo IN ('venda', 'liquidacao_fatura') AND valor_issqn = 0;
UPDATE public.movimentacoes_caixa
   SET justificativa_motivo = COALESCE(NULLIF(descricao, ''), 'Registro anterior ao patch de auditoria')
 WHERE tipo IN ('sangria', 'suprimento') AND justificativa_motivo IS NULL;

ALTER TABLE public.movimentacoes_caixa ALTER COLUMN operador_nome SET NOT NULL;
ALTER TABLE public.movimentacoes_caixa ALTER COLUMN valor_bruto SET NOT NULL;
ALTER TABLE public.movimentacoes_caixa ALTER COLUMN valor_liquido SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mov_operador ON public.movimentacoes_caixa(operador_id);
CREATE INDEX IF NOT EXISTS idx_mov_criado_em ON public.movimentacoes_caixa(criado_em);

-- 2. TRIGGER BEFORE INSERT: garante QUEM e ISSQN no servidor --------------
--  O ISSQN é sempre recalculado aqui (fonte da verdade fiscal):
--  valor_issqn = ROUND(valor_bruto * aliquota/100, 2); valor_liquido = valor_bruto.

CREATE OR REPLACE FUNCTION public.fn_auditar_movimentacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dono UUID;
BEGIN
  SELECT operador_id INTO v_dono FROM public.caixas_diarios WHERE id = NEW.caixa_id;

  NEW.valor_bruto := COALESCE(NEW.valor_bruto, NEW.valor);
  NEW.valor := COALESCE(NEW.valor, NEW.valor_bruto);
  NEW.aliquota_issqn := COALESCE(NEW.aliquota_issqn, 2.00);
  NEW.operador_id := COALESCE(NEW.operador_id, auth.uid(), v_dono);

  IF NEW.operador_nome IS NULL OR btrim(NEW.operador_nome) = '' THEN
    SELECT nome_completo INTO NEW.operador_nome FROM public.perfis WHERE id = NEW.operador_id;
    NEW.operador_nome := COALESCE(NEW.operador_nome, 'Operador não identificado');
  END IF;

  IF NEW.tipo IN ('venda', 'liquidacao_fatura') THEN
    NEW.valor_issqn := ROUND(NEW.valor_bruto * NEW.aliquota_issqn / 100, 2);
  ELSE
    NEW.valor_issqn := 0.00;
  END IF;
  NEW.valor_liquido := NEW.valor_bruto;

  IF NEW.tipo IN ('sangria', 'suprimento') THEN
    NEW.justificativa_motivo := COALESCE(NULLIF(btrim(NEW.justificativa_motivo), ''), NULLIF(btrim(NEW.descricao), ''));
    IF NEW.justificativa_motivo IS NULL THEN
      RAISE EXCEPTION 'Justificativa obrigatória para sangrias e suprimentos.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditar_movimentacao ON public.movimentacoes_caixa;
CREATE TRIGGER trg_auditar_movimentacao
BEFORE INSERT ON public.movimentacoes_caixa
FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_movimentacao();

-- 3. LOGS_TROCA_OPERADOR ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.logs_troca_operador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id UUID REFERENCES public.caixas_diarios(id) ON DELETE RESTRICT NOT NULL,
  operador_anterior_id UUID REFERENCES auth.users(id) NOT NULL,
  operador_anterior_nome VARCHAR(255) NOT NULL,
  operador_novo_id UUID REFERENCES auth.users(id) NOT NULL,
  operador_novo_nome VARCHAR(255) NOT NULL,
  saldo_gaveta_momento NUMERIC(10,2) NOT NULL,
  motivo_troca TEXT DEFAULT 'Troca rápida de turno / Emergência',
  trocado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_troca_caixa ON public.logs_troca_operador(caixa_id);
CREATE INDEX IF NOT EXISTS idx_logs_troca_em ON public.logs_troca_operador(trocado_em);

ALTER TABLE public.logs_troca_operador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logs_troca_select ON public.logs_troca_operador;
CREATE POLICY logs_troca_select ON public.logs_troca_operador FOR SELECT TO authenticated
  USING (
    operador_anterior_id = auth.uid()
    OR operador_novo_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master','gerente','financeiro'))
  );

-- Somente INSERT (trilha imutável: sem UPDATE/DELETE)
DROP POLICY IF EXISTS logs_troca_insert ON public.logs_troca_operador;
CREATE POLICY logs_troca_insert ON public.logs_troca_operador FOR INSERT TO authenticated
  WITH CHECK (
    operador_anterior_id = auth.uid()
    OR operador_novo_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master','gerente'))
  );

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'logs_troca_operador'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.logs_troca_operador;
  END IF;
END $$;

-- 4. RPC ATÔMICA: TROCA RÁPIDA DE OPERADOR (caixa permanece aberto) --------
--  Calcula o saldo da gaveta no servidor, grava o log e transfere a titularidade
--  do caixa numa única transação. Pode ser chamada pelo operador atual, pelo
--  operador que assume (já autenticado com suas credenciais) ou pela gestão.

CREATE OR REPLACE FUNCTION public.fn_trocar_operador(
  p_caixa_id UUID,
  p_novo_operador_id UUID,
  p_novo_operador_nome VARCHAR,
  p_motivo TEXT DEFAULT 'Troca rápida de turno / Emergência'
) RETURNS public.logs_troca_operador
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caixa public.caixas_diarios%ROWTYPE;
  v_nome_ant VARCHAR(255);
  v_saldo NUMERIC(10,2);
  v_log public.logs_troca_operador;
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  SELECT * INTO v_caixa FROM public.caixas_diarios WHERE id = p_caixa_id FOR UPDATE;
  IF NOT FOUND OR v_caixa.status <> 'aberto' THEN
    RAISE EXCEPTION 'Caixa inexistente ou já fechado.';
  END IF;
  IF v_caixa.operador_id = p_novo_operador_id THEN
    RAISE EXCEPTION 'O operador informado já é o titular deste caixa.';
  END IF;

  SELECT role INTO v_role FROM public.perfis WHERE id = auth.uid();
  IF NOT (auth.uid() = v_caixa.operador_id
          OR auth.uid() = p_novo_operador_id
          OR v_role IN ('master','gerente')) THEN
    RAISE EXCEPTION 'Sem permissão para transferir este terminal.';
  END IF;

  SELECT COALESCE(nome_completo, 'Operador') INTO v_nome_ant
    FROM public.perfis WHERE id = v_caixa.operador_id;

  -- Saldo contábil em dinheiro na gaveta neste exato momento
  SELECT v_caixa.valor_abertura + COALESCE(SUM(
           CASE
             WHEN m.tipo = 'sangria' THEN -m.valor
             WHEN m.forma_pagamento = 'dinheiro' AND m.tipo IN ('venda','suprimento','liquidacao_fatura') THEN m.valor
             ELSE 0
           END), 0)
    INTO v_saldo
    FROM public.movimentacoes_caixa m
   WHERE m.caixa_id = p_caixa_id;

  INSERT INTO public.logs_troca_operador (
    caixa_id, operador_anterior_id, operador_anterior_nome,
    operador_novo_id, operador_novo_nome, saldo_gaveta_momento, motivo_troca
  ) VALUES (
    p_caixa_id, v_caixa.operador_id, COALESCE(v_nome_ant, 'Operador'),
    p_novo_operador_id, p_novo_operador_nome, v_saldo,
    COALESCE(NULLIF(btrim(p_motivo), ''), 'Troca rápida de turno / Emergência')
  ) RETURNING * INTO v_log;

  UPDATE public.caixas_diarios SET operador_id = p_novo_operador_id WHERE id = p_caixa_id;

  RETURN v_log;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_trocar_operador(UUID, UUID, VARCHAR, TEXT) TO authenticated;
