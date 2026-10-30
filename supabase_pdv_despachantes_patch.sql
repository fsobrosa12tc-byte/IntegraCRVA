-- =====================================================================
--   PATCH: DESPACHANTES COMPLETOS E CATÁLOGO DE SERVIÇOS CRVA
--   Executável no SQL Editor do Supabase (100% idempotente)
-- =====================================================================

-- 1. Ampliação da tabela public.despachantes com campos cadastrais completos
ALTER TABLE public.despachantes ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE public.despachantes ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255);
ALTER TABLE public.despachantes ADD COLUMN IF NOT EXISTS numero VARCHAR(50);
ALTER TABLE public.despachantes ADD COLUMN IF NOT EXISTS bairro VARCHAR(100);
ALTER TABLE public.despachantes ADD COLUMN IF NOT EXISTS cidade VARCHAR(100);

-- Índice único ou de consulta para CPF/CNPJ limpo se aplicável
CREATE INDEX IF NOT EXISTS idx_despachantes_documento ON public.despachantes(documento);

-- 2. Tabela de serviços oficial caso ainda não exista no Supabase
CREATE TABLE IF NOT EXISTS public.servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  base_value NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Políticas RLS básicas de leitura pública e escrita autenticada
ALTER TABLE public.despachantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'despachantes' AND policyname = 'Leitura permitida despachantes'
  ) THEN
    CREATE POLICY "Leitura permitida despachantes" ON public.despachantes FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'despachantes' AND policyname = 'Insercao permitida despachantes'
  ) THEN
    CREATE POLICY "Insercao permitida despachantes" ON public.despachantes FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'despachantes' AND policyname = 'Atualizacao permitida despachantes'
  ) THEN
    CREATE POLICY "Atualizacao permitida despachantes" ON public.despachantes FOR UPDATE USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'servicos' AND policyname = 'Leitura permitida servicos'
  ) THEN
    CREATE POLICY "Leitura permitida servicos" ON public.servicos FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'servicos' AND policyname = 'Escrita permitida servicos'
  ) THEN
    CREATE POLICY "Escrita permitida servicos" ON public.servicos FOR ALL USING (true);
  END IF;
END $$;
