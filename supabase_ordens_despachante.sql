-- =====================================================================
--  INTEGRA CRVA / PDV - MIGRATION: ORDENS DE DESPACHANTE (FONTE ÚNICA DA VERDADE)
--  Uma linha por atendimento a prazo no Balcão, com numero_recibo imutável,
--  itens exatos, valores fiscais exatos e vínculo de auditoria (cliente final).
--  Executável no SQL Editor do Supabase (100% idempotente).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ordens_despachante (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_recibo             VARCHAR(50)  NOT NULL,
  despachante_id            UUID         NOT NULL REFERENCES public.despachantes(id) ON DELETE RESTRICT,
  status                    VARCHAR(20)  NOT NULL DEFAULT 'ABERTA',
  itens                     JSONB        NOT NULL DEFAULT '[]'::jsonb,
  subtotal                  NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
  issqn                     NUMERIC(10,2) NOT NULL CHECK (issqn >= 0),
  valor_total               NUMERIC(10,2) NOT NULL CHECK (valor_total >= 0),
  cliente_final_nome        TEXT,
  cliente_final_cpf_cnpj    VARCHAR(20),
  placa_veiculo             VARCHAR(10),
  veiculo_modelo            TEXT,
  atendente_id              TEXT,
  atendente_nome            TEXT,
  hash_autenticidade        TEXT,
  criado_em                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Dados da quitação (preenchidos somente no PDV)
  quitada_em                TIMESTAMPTZ,
  forma_pagamento_quitacao  VARCHAR(30),
  caixa_quitacao_id         UUID,
  operador_quitacao_nome    TEXT,
  CONSTRAINT ordens_despachante_status_check CHECK (status IN ('ABERTA', 'QUITADA', 'CANCELADA')),
  -- REGRA DE AUDITORIA FISCAL CRVA: o número do recibo é único e imutável
  CONSTRAINT ordens_despachante_numero_recibo_key UNIQUE (numero_recibo),
  -- Fidelidade matemática: subtotal + ISSQN = total (tolerância zero)
  CONSTRAINT ordens_despachante_total_check CHECK (subtotal + issqn = valor_total)
);

-- Índice da esteira do PDV (somente ordens em aberto por despachante)
CREATE INDEX IF NOT EXISTS idx_ordens_despachante_abertas
  ON public.ordens_despachante (despachante_id, criado_em DESC)
  WHERE status = 'ABERTA';

-- Bloqueia alteração do numero_recibo, dos itens e dos valores após a emissão
CREATE OR REPLACE FUNCTION public.fn_ordens_despachante_imutavel()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero_recibo IS DISTINCT FROM OLD.numero_recibo
     OR NEW.itens IS DISTINCT FROM OLD.itens
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.issqn IS DISTINCT FROM OLD.issqn
     OR NEW.valor_total IS DISTINCT FROM OLD.valor_total
     OR NEW.despachante_id IS DISTINCT FROM OLD.despachante_id THEN
    RAISE EXCEPTION 'Ordem % é imutável: recibo, itens e valores não podem ser alterados.', OLD.numero_recibo;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ordens_despachante_imutavel ON public.ordens_despachante;
CREATE TRIGGER trg_ordens_despachante_imutavel
  BEFORE UPDATE ON public.ordens_despachante
  FOR EACH ROW EXECUTE FUNCTION public.fn_ordens_despachante_imutavel();

-- Permissões e RLS (mesmo padrão de public.comandas_balcao)
GRANT ALL ON public.ordens_despachante TO anon, authenticated, service_role;
ALTER TABLE public.ordens_despachante ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permitir_todos_ordens_despachante" ON public.ordens_despachante;
CREATE POLICY "permitir_todos_ordens_despachante" ON public.ordens_despachante
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "permitir_anon_ordens_despachante" ON public.ordens_despachante;
CREATE POLICY "permitir_anon_ordens_despachante" ON public.ordens_despachante
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Realtime para a esteira do PDV
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ordens_despachante;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;

-- Recarrega o schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
