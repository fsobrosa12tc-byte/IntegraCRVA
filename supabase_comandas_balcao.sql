-- ============================================================================
-- INTEGRA CRVA / PDV - FLUXO INTEGRADO BALCÃO CRVA -> FRENTE DE CAIXA
-- Criação da tabela public.comandas_balcao, RLS, Realtime e Índices
-- Script idempotente (pode ser executado múltiplas vezes com segurança)
-- ============================================================================

-- 1. Criação da tabela de comandas do balcão
CREATE TABLE IF NOT EXISTS public.comandas_balcao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nome VARCHAR(255) NOT NULL,
  cliente_documento VARCHAR(20),
  atendente_id UUID REFERENCES auth.users(id) NOT NULL,
  atendente_nome VARCHAR(255) NOT NULL,
  itens JSONB NOT NULL, -- Array de objetos: [{ codigo, servico, quantidade, valor_unitario, subtotal }]
  subtotal_servicos NUMERIC(10,2), -- Subtotal dos serviços prestados
  valor_total NUMERIC(10,2) NOT NULL, -- Total Cobrado (COM O ISSQN SOMADO)
  aliquota_issqn NUMERIC(5,2) DEFAULT 2.00 NOT NULL,
  valor_issqn NUMERIC(10,2) NOT NULL,
  status VARCHAR(30) DEFAULT 'aguardando_pagamento' CHECK (status IN ('aguardando_pagamento', 'pago', 'cancelado')),
  caixa_id UUID REFERENCES public.caixas_diarios(id),
  operador_caixa_id UUID REFERENCES auth.users(id),
  forma_pagamento VARCHAR(30),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  pago_em TIMESTAMP WITH TIME ZONE
);

-- Garante a coluna subtotal_servicos e os vínculos operacionais independentes caso a tabela já existisse
ALTER TABLE public.comandas_balcao ADD COLUMN IF NOT EXISTS subtotal_servicos NUMERIC(10,2);
ALTER TABLE public.comandas_balcao 
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id),
  ADD COLUMN IF NOT EXISTS veiculo_id UUID REFERENCES public.veiculos(id);

-- 2. Índices de alta performance para a fila de atendimento
CREATE INDEX IF NOT EXISTS idx_comandas_balcao_status ON public.comandas_balcao(status);
CREATE INDEX IF NOT EXISTS idx_comandas_balcao_criado_em ON public.comandas_balcao(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_comandas_balcao_caixa_id ON public.comandas_balcao(caixa_id);
CREATE INDEX IF NOT EXISTS idx_comandas_balcao_atendente_id ON public.comandas_balcao(atendente_id);

-- 3. Habilitação de RLS (Row Level Security)
ALTER TABLE public.comandas_balcao ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Acesso
DROP POLICY IF EXISTS "comandas_balcao_all" ON public.comandas_balcao;
CREATE POLICY "comandas_balcao_all" ON public.comandas_balcao 
  FOR ALL 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);

-- Política de contingência para ambiente anon/desenvolvimento
DROP POLICY IF EXISTS "comandas_balcao_anon_fallback" ON public.comandas_balcao;
CREATE POLICY "comandas_balcao_anon_fallback" ON public.comandas_balcao 
  FOR ALL 
  TO anon 
  USING (true) 
  WITH CHECK (true);

-- 5. Inclusão idempotente na publicação de Supabase Realtime (WebSocket)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'comandas_balcao'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comandas_balcao;
  END IF;
END $$;

COMMENT ON TABLE public.comandas_balcao IS 'Comandas de ordens de serviço geradas no Balcão CRVA para quitação na Frente de Caixa PDV com segregação de funções.';
