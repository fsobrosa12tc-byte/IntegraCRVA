-- ============================================================================
-- INTEGRA CRVA / PDV - ARQUITETURA DE PERSISTÊNCIA: CLIENTES E VEÍCULOS INDEPENDENTES
-- 1. Clientes e Veículos são entidades INDEPENDENTES (sem FK entre si).
-- 2. Chave de unicidade do Cliente: estritamente o CPF (ou CNPJ no caso de PJ).
-- 3. Chave de unicidade do Veículo: estritamente a PLACA.
-- 4. Comandas e Movimentações referenciam separadamente cliente_id e veiculo_id.
-- ============================================================================

-- 1. Tabela de Clientes Independentes (Unicidade por CPF/Documento)
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf VARCHAR(20) NOT NULL UNIQUE, -- Chave de unicidade estrita
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

-- 2. Tabela de Veículos Independentes (Unicidade por Placa)
-- Remova qualquer dependência direta de cliente_id da tabela veiculos se existir:
CREATE TABLE IF NOT EXISTS public.veiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa VARCHAR(10) NOT NULL UNIQUE, -- Chave de unicidade estrita (Mercosul ou padrão antigo)
  chassi VARCHAR(30),
  renavam VARCHAR(20),
  marca_modelo VARCHAR(150),
  ano_fabricacao INT,
  ano_modelo INT,
  cor VARCHAR(50),
  combustivel VARCHAR(50),
  categoria VARCHAR(50),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Caso a tabela veiculos já possua a coluna cliente_id, remova a constraint ou a coluna:
ALTER TABLE public.veiculos DROP COLUMN IF EXISTS cliente_id;

-- Garante colunas caso a tabela veiculos tenha sido criada em versão anterior
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS marca_modelo VARCHAR(150);
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS ano_fabricacao INT;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS ano_modelo INT;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS cor VARCHAR(50);
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS combustivel VARCHAR(50);
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS categoria VARCHAR(50);
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- 3. Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON public.clientes(cpf);
CREATE INDEX IF NOT EXISTS idx_veiculos_placa ON public.veiculos(placa);

-- 4. Vínculo Operacional nas Comandas e Movimentações (Relacionamento por Atendimento)
ALTER TABLE public.comandas_balcao 
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id),
  ADD COLUMN IF NOT EXISTS veiculo_id UUID REFERENCES public.veiculos(id);

ALTER TABLE public.movimentacoes_caixa 
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id),
  ADD COLUMN IF NOT EXISTS veiculo_id UUID REFERENCES public.veiculos(id);

-- RLS
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clientes_policy" ON public.clientes;
DROP POLICY IF EXISTS "veiculos_policy" ON public.veiculos;
CREATE POLICY "clientes_policy" ON public.clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "veiculos_policy" ON public.veiculos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas de contingência para ambiente anon/desenvolvimento
DROP POLICY IF EXISTS "clientes_anon_policy" ON public.clientes;
DROP POLICY IF EXISTS "veiculos_anon_policy" ON public.veiculos;
CREATE POLICY "clientes_anon_policy" ON public.clientes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "veiculos_anon_policy" ON public.veiculos FOR ALL TO anon USING (true) WITH CHECK (true);

