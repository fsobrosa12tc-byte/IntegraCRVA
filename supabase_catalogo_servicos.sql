-- ============================================================================
-- INTEGRA CRVA - TABELA catalogo_servicos, GRANTS E POLÍTICAS RLS GLOBAIS
-- Execute este script no SQL Editor do Supabase (idempotente).
-- ============================================================================

-- 1. Criação da tabela public.catalogo_servicos
CREATE TABLE IF NOT EXISTS public.catalogo_servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) NOT NULL UNIQUE,
  nome VARCHAR(255) NOT NULL,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  descricao TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Popula com serviços padrão se a tabela estiver vazia
INSERT INTO public.catalogo_servicos (codigo, nome, valor)
VALUES
  ('SRV-VIST', 'Vistoria: Solicitação e Identificação Veicular', 98.40),
  ('SRV-TRRS', 'Transferência: Transferência de Propriedade (RS)', 142.60),
  ('SRV-TRUF', 'Transferência: Transferência de Propriedade (Outra UF)', 168.90),
  ('SRV-ALTD', 'Alteração: Alteração de Informações do Proprietário / Veículo', 85.30),
  ('SRV-RECF', 'Reconhecimento: Reconhecimento de Firma / Autenticação ATPV-e', 12.80),
  ('SRV-2CRV', 'Documento: 2ª via do CRV / ATPV-e', 76.50),
  ('SRV-CRLV', 'Impressão: Impressão do CRLV-e Oficial', 18.50),
  ('SRV-CERT', 'Certidão: Emissão de Certidão de Registro de Veículo', 24.20),
  ('SRV-EMPL', 'Emplacamento: Primeiro Emplacamento', 154.00),
  ('SRV-RPLA', 'Placa: Reserva de Placa Especial', 65.00),
  ('SRV-BAIX', 'Baixa: Baixa Definitiva de Veículo - Simples', 88.00),
  ('SRV-CVEN', 'Comunicação: Comunicação de Venda de Veículo', 35.00),
  ('SRV-CDOC', 'Cópia: Busca e fornecimento de cópias de processos', 15.00),
  ('SRV-LACR', 'Placa: Colocação / Substituição de Lacre ou Placa Mercosul', 42.00)
ON CONFLICT (codigo) DO NOTHING;

-- 2. Concessão de permissões globais
GRANT ALL ON public.catalogo_servicos TO anon, authenticated, service_role;

-- 3. Habilitação de RLS e Políticas
ALTER TABLE public.catalogo_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permitir_leitura_geral_catalogo" ON public.catalogo_servicos;
CREATE POLICY "permitir_leitura_geral_catalogo" ON public.catalogo_servicos 
  FOR SELECT TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "permitir_leitura_anon_catalogo" ON public.catalogo_servicos;
CREATE POLICY "permitir_leitura_anon_catalogo" ON public.catalogo_servicos 
  FOR SELECT TO anon 
  USING (true);

DROP POLICY IF EXISTS "permitir_insercao_catalogo" ON public.catalogo_servicos;
CREATE POLICY "permitir_insercao_catalogo" ON public.catalogo_servicos 
  FOR INSERT TO authenticated 
  WITH CHECK (true);

DROP POLICY IF EXISTS "permitir_atualizacao_catalogo" ON public.catalogo_servicos;
CREATE POLICY "permitir_atualizacao_catalogo" ON public.catalogo_servicos 
  FOR UPDATE TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "permitir_delecao_catalogo" ON public.catalogo_servicos;
CREATE POLICY "permitir_delecao_catalogo" ON public.catalogo_servicos 
  FOR DELETE TO authenticated 
  USING (true);

-- 4. Notificação de Recarga do Schema Cache do PostgREST
NOTIFY pgrst, 'reload schema';

