-- ============================================================================
-- INTEGRA CRVA / PDV - CORREÇÃO DEFINITIVA: COMANDAS BALCÃO, GRANTS, RLS,
-- REPLICA IDENTITY, SUPABASE REALTIME E RELOAD DO SCHEMA CACHE POSTGREST
-- Execute este script no SQL Editor do Supabase (idempotente).
-- ============================================================================

-- 0. Garantir existência das tabelas base independentes (clientes e veiculos)
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf VARCHAR(20) NOT NULL UNIQUE,
  nome_razao VARCHAR(255) NOT NULL,
  tipo_pessoa VARCHAR(2) NOT NULL DEFAULT 'PF',
  rg_ie VARCHAR(30),
  telefone VARCHAR(25),
  email VARCHAR(255),
  cep VARCHAR(10),
  logradouro VARCHAR(255),
  numero VARCHAR(20),
  complemento VARCHAR(100),
  bairro VARCHAR(100),
  cidade VARCHAR(100),
  uf VARCHAR(2),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Se a tabela legada public.veiculos possuir id INTEGER (SERIAL) sem registros ou incompatível com UUID,
-- garante estrutura moderna com id UUID para permitir chave estrangeira em comandas_balcao.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'veiculos'
      AND column_name = 'id'
      AND data_type <> 'uuid'
  ) THEN
    DROP TABLE IF EXISTS public.veiculos CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.veiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa VARCHAR(10) NOT NULL UNIQUE,
  chassi VARCHAR(25),
  renavam VARCHAR(20),
  marca_modelo VARCHAR(150),
  ano_fabricacao INTEGER,
  ano_modelo INTEGER,
  cor VARCHAR(50),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1. Garantir a existência e estrutura da tabela 'public.comandas_balcao'
CREATE TABLE IF NOT EXISTS public.comandas_balcao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo VARCHAR(50),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  cliente_nome VARCHAR(255),
  cliente_documento VARCHAR(20),
  veiculo_placa VARCHAR(10),
  veiculo_modelo VARCHAR(150),
  servicos JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  aliquota_issqn NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  valor_issqn NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  valor_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(30) NOT NULL DEFAULT 'aguardando_pagamento',
  atendente_id UUID,
  atendente_nome VARCHAR(255),
  caixa_id UUID,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  pago_em TIMESTAMP WITH TIME ZONE
);

-- Garantir todas as colunas caso a tabela já existisse com versão anterior
ALTER TABLE public.comandas_balcao
  ADD COLUMN IF NOT EXISTS protocolo VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_nome VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cliente_documento VARCHAR(20),
  ADD COLUMN IF NOT EXISTS veiculo_placa VARCHAR(10),
  ADD COLUMN IF NOT EXISTS veiculo_modelo VARCHAR(150),
  ADD COLUMN IF NOT EXISTS servicos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS itens JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS subtotal_servicos NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS aliquota_issqn NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS valor_issqn NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'aguardando_pagamento',
  ADD COLUMN IF NOT EXISTS atendente_id UUID,
  ADD COLUMN IF NOT EXISTS atendente_nome VARCHAR(255),
  ADD COLUMN IF NOT EXISTS caixa_id UUID,
  ADD COLUMN IF NOT EXISTS operador_caixa_id UUID,
  ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(30),
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  ADD COLUMN IF NOT EXISTS pago_em TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_comandas_balcao_status ON public.comandas_balcao(status);
CREATE INDEX IF NOT EXISTS idx_comandas_balcao_criado_em ON public.comandas_balcao(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_comandas_balcao_caixa_id ON public.comandas_balcao(caixa_id);

-- 2. Concessão explícita de permissões (GRANTs) para todas as roles da API
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 3. Ajuste de RLS (Row Level Security) sem bloqueio entre usuários
ALTER TABLE public.comandas_balcao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comandas_balcao_all" ON public.comandas_balcao;
DROP POLICY IF EXISTS "comandas_balcao_anon_fallback" ON public.comandas_balcao;
DROP POLICY IF EXISTS "permitir_todos_comandas" ON public.comandas_balcao;
CREATE POLICY "permitir_todos_comandas" ON public.comandas_balcao 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "permitir_anon_comandas" ON public.comandas_balcao;
CREATE POLICY "permitir_anon_comandas" ON public.comandas_balcao 
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clientes_all_policy" ON public.clientes;
DROP POLICY IF EXISTS "permitir_todos_clientes" ON public.clientes;
CREATE POLICY "permitir_todos_clientes" ON public.clientes 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "permitir_anon_clientes" ON public.clientes;
CREATE POLICY "permitir_anon_clientes" ON public.clientes 
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "veiculos_all_policy" ON public.veiculos;
DROP POLICY IF EXISTS "permitir_todos_veiculos" ON public.veiculos;
CREATE POLICY "permitir_todos_veiculos" ON public.veiculos 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "permitir_anon_veiculos" ON public.veiculos;
CREATE POLICY "permitir_anon_veiculos" ON public.veiculos 
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.movimentacoes_caixa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "movimentacoes_caixa_all_policy" ON public.movimentacoes_caixa;
DROP POLICY IF EXISTS "permitir_todos_movimentacoes" ON public.movimentacoes_caixa;
CREATE POLICY "permitir_todos_movimentacoes" ON public.movimentacoes_caixa 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "permitir_anon_movimentacoes" ON public.movimentacoes_caixa;
CREATE POLICY "permitir_anon_movimentacoes" ON public.movimentacoes_caixa 
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.despachantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "despachantes_all_policy" ON public.despachantes;
DROP POLICY IF EXISTS "permitir_todos_despachantes" ON public.despachantes;
CREATE POLICY "permitir_todos_despachantes" ON public.despachantes 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "permitir_anon_despachantes" ON public.despachantes;
CREATE POLICY "permitir_anon_despachantes" ON public.despachantes 
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Realtime e Replica Identity
ALTER TABLE public.comandas_balcao REPLICA IDENTITY FULL;
ALTER TABLE public.movimentacoes_caixa REPLICA IDENTITY FULL;
ALTER TABLE public.despachantes REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comandas_balcao;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.movimentacoes_caixa;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.despachantes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 5. Notificação para recarga imediata do Schema Cache do PostgREST
NOTIFY pgrst, 'reload schema';
