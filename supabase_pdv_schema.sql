-- =====================================================================
--            INTEGRA PDV - SCHEMA, REALTIME, TRIGGER E RLS
--   Marks Systems - Kickoff Técnico / PRD v1.0
--   Execute no SQL Editor do Supabase (idempotente).
-- =====================================================================

-- 1. TABELAS ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.despachantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_razao VARCHAR(255) NOT NULL,
  documento VARCHAR(20) NOT NULL UNIQUE,
  telefone VARCHAR(20) NOT NULL,
  saldo_devedor NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.caixas_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id UUID REFERENCES auth.users(id) NOT NULL,
  data_abertura TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  data_fechamento TIMESTAMP WITH TIME ZONE,
  valor_abertura NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  valor_fechamento_esperado NUMERIC(10,2),
  valor_fechamento_informado NUMERIC(10,2),
  diferenca NUMERIC(10,2),
  status VARCHAR(20) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
  status_conferencia VARCHAR(30) CHECK (status_conferencia IN ('exato', 'quebra_caixa', 'sobra_caixa'))
);

CREATE TABLE IF NOT EXISTS public.movimentacoes_caixa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id UUID REFERENCES public.caixas_diarios(id) ON DELETE RESTRICT NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('venda', 'sangria', 'suprimento')),
  descricao TEXT,
  valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  forma_pagamento VARCHAR(30) NOT NULL CHECK (forma_pagamento IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'faturamento')),
  despachante_id UUID REFERENCES public.despachantes(id) ON DELETE SET NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.fluxo_caixa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_movimentacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  categoria VARCHAR(50) NOT NULL,
  valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  origem_id UUID,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_caixas_operador ON public.caixas_diarios(operador_id);
CREATE INDEX IF NOT EXISTS idx_mov_caixa_id ON public.movimentacoes_caixa(caixa_id);
CREATE INDEX IF NOT EXISTS idx_mov_despachante ON public.movimentacoes_caixa(despachante_id);

-- 2. REALTIME (idempotente: ADD TABLE falha se já estiver na publicação) ---

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['caixas_diarios','movimentacoes_caixa','despachantes','fluxo_caixa'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 3. TRIGGER: SALDO DEVEDOR B2B (incremento atômico) --------------------

CREATE OR REPLACE FUNCTION public.fn_atualizar_saldo_despachante()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.forma_pagamento = 'faturamento' AND NEW.despachante_id IS NOT NULL THEN
    -- UPDATE único com expressão relativa: atômico e seguro contra concorrência
    UPDATE public.despachantes
       SET saldo_devedor = saldo_devedor + NEW.valor
     WHERE id = NEW.despachante_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atualizar_saldo_despachante ON public.movimentacoes_caixa;
CREATE TRIGGER trg_atualizar_saldo_despachante
AFTER INSERT ON public.movimentacoes_caixa
FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_saldo_despachante();

-- 4. ROW LEVEL SECURITY ---------------------------------------------------
-- Baseado em public.perfis (roles: master, gerente, financeiro, caixa, atendente)

CREATE OR REPLACE FUNCTION public.fn_role_atual()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.perfis WHERE id = auth.uid() AND ativo = TRUE $$;

ALTER TABLE public.despachantes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixas_diarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_caixa         ENABLE ROW LEVEL SECURITY;

-- Despachantes: leitura para operação; escrita para gestão/financeiro/caixa
DROP POLICY IF EXISTS despachantes_select ON public.despachantes;
CREATE POLICY despachantes_select ON public.despachantes FOR SELECT TO authenticated
  USING (public.fn_role_atual() IN ('master','gerente','financeiro','caixa'));
DROP POLICY IF EXISTS despachantes_insert ON public.despachantes;
CREATE POLICY despachantes_insert ON public.despachantes FOR INSERT TO authenticated
  WITH CHECK (public.fn_role_atual() IN ('master','gerente','financeiro','caixa'));
DROP POLICY IF EXISTS despachantes_update ON public.despachantes;
CREATE POLICY despachantes_update ON public.despachantes FOR UPDATE TO authenticated
  USING (public.fn_role_atual() IN ('master','gerente','financeiro'))
  WITH CHECK (public.fn_role_atual() IN ('master','gerente','financeiro'));

-- Caixas: operador vê/gerencia o próprio; gestão vê todos
DROP POLICY IF EXISTS caixas_select ON public.caixas_diarios;
CREATE POLICY caixas_select ON public.caixas_diarios FOR SELECT TO authenticated
  USING (operador_id = auth.uid() OR public.fn_role_atual() IN ('master','gerente','financeiro'));
DROP POLICY IF EXISTS caixas_insert ON public.caixas_diarios;
CREATE POLICY caixas_insert ON public.caixas_diarios FOR INSERT TO authenticated
  WITH CHECK (operador_id = auth.uid() AND public.fn_role_atual() IN ('master','gerente','caixa'));
DROP POLICY IF EXISTS caixas_update ON public.caixas_diarios;
CREATE POLICY caixas_update ON public.caixas_diarios FOR UPDATE TO authenticated
  USING (operador_id = auth.uid() OR public.fn_role_atual() IN ('master','gerente'))
  WITH CHECK (operador_id = auth.uid() OR public.fn_role_atual() IN ('master','gerente'));

-- Movimentações: apenas em caixa aberto do próprio operador; sem UPDATE/DELETE (auditoria)
DROP POLICY IF EXISTS mov_select ON public.movimentacoes_caixa;
CREATE POLICY mov_select ON public.movimentacoes_caixa FOR SELECT TO authenticated
  USING (
    public.fn_role_atual() IN ('master','gerente','financeiro')
    OR EXISTS (SELECT 1 FROM public.caixas_diarios c WHERE c.id = caixa_id AND c.operador_id = auth.uid())
  );
DROP POLICY IF EXISTS mov_insert ON public.movimentacoes_caixa;
CREATE POLICY mov_insert ON public.movimentacoes_caixa FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.caixas_diarios c
            WHERE c.id = caixa_id AND c.operador_id = auth.uid() AND c.status = 'aberto')
  );

-- Fluxo de caixa global: somente gestão/financeiro
DROP POLICY IF EXISTS fluxo_select ON public.fluxo_caixa;
CREATE POLICY fluxo_select ON public.fluxo_caixa FOR SELECT TO authenticated
  USING (public.fn_role_atual() IN ('master','gerente','financeiro'));
DROP POLICY IF EXISTS fluxo_insert ON public.fluxo_caixa;
CREATE POLICY fluxo_insert ON public.fluxo_caixa FOR INSERT TO authenticated
  WITH CHECK (public.fn_role_atual() IN ('master','gerente','financeiro'));
