-- ============================================================================
-- INTEGRA CRVA · PATCH SUPABASE: ESTEIRA DE VISTORIAS VEICULARES & WHATSAPP GATEWAY
-- ============================================================================
-- Script SQL idempotente para atualizar o schema do Supabase com as colunas de
-- auditoria, status de mensageria e notificações da Evolution API v2.
-- Execute no SQL Editor do Supabase.
-- ============================================================================

-- 1. Criação ou atualização da tabela principal 'vistorias_patio'
CREATE TABLE IF NOT EXISTS public.vistorias_patio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id UUID REFERENCES public.comandas_balcao(id) ON DELETE SET NULL,
  protocolo VARCHAR(50),
  placa VARCHAR(10),
  veiculo_placa VARCHAR(10),
  veiculo_modelo VARCHAR(150),
  cliente_nome VARCHAR(255),
  cliente_telefone VARCHAR(25),
  status VARCHAR(30) NOT NULL DEFAULT 'aguardando_box',
  box VARCHAR(30),
  motivos_pendencia TEXT,
  notificacao_whatsapp_status VARCHAR(30) DEFAULT 'pendente',
  notificacao_whatsapp_enviada_em TIMESTAMP WITH TIME ZONE,
  notificacao_whatsapp_detalhes JSONB,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Garantir colunas essenciais caso a tabela já existisse previamente
DO $$
BEGIN
  -- Comanda e Protocolo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vistorias_patio' AND column_name = 'comanda_id') THEN
    ALTER TABLE public.vistorias_patio ADD COLUMN comanda_id UUID REFERENCES public.comandas_balcao(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vistorias_patio' AND column_name = 'protocolo') THEN
    ALTER TABLE public.vistorias_patio ADD COLUMN protocolo VARCHAR(50);
  END IF;

  -- Placa padrão
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vistorias_patio' AND column_name = 'placa') THEN
    ALTER TABLE public.vistorias_patio ADD COLUMN placa VARCHAR(10);
  END IF;

  -- Box de atendimento
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vistorias_patio' AND column_name = 'box') THEN
    ALTER TABLE public.vistorias_patio ADD COLUMN box VARCHAR(30);
  END IF;

  -- Motivos de reprovação / pendência
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vistorias_patio' AND column_name = 'motivos_pendencia') THEN
    ALTER TABLE public.vistorias_patio ADD COLUMN motivos_pendencia TEXT;
  END IF;

  -- Auditoria de Notificação WhatsApp (Evolution API)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vistorias_patio' AND column_name = 'notificacao_whatsapp_status') THEN
    ALTER TABLE public.vistorias_patio ADD COLUMN notificacao_whatsapp_status VARCHAR(30) DEFAULT 'pendente';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vistorias_patio' AND column_name = 'notificacao_whatsapp_enviada_em') THEN
    ALTER TABLE public.vistorias_patio ADD COLUMN notificacao_whatsapp_enviada_em TIMESTAMP WITH TIME ZONE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vistorias_patio' AND column_name = 'notificacao_whatsapp_detalhes') THEN
    ALTER TABLE public.vistorias_patio ADD COLUMN notificacao_whatsapp_detalhes JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vistorias_patio' AND column_name = 'atualizado_em') THEN
    ALTER TABLE public.vistorias_patio ADD COLUMN atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
  END IF;
END $$;

-- 3. Sincronizar campo placa com veiculo_placa se vazio
UPDATE public.vistorias_patio
SET placa = veiculo_placa
WHERE (placa IS NULL OR placa = '') AND veiculo_placa IS NOT NULL;

-- 4. Tabela de Histórico e Auditoria de Notificações WhatsApp
CREATE TABLE IF NOT EXISTS public.vistorias_notificacoes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vistoria_id UUID REFERENCES public.vistorias_patio(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,
  mensagem TEXT,
  message_id VARCHAR(100),
  detalhes JSONB,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Índices para performance operacional em tempo real
CREATE INDEX IF NOT EXISTS idx_vistorias_patio_status ON public.vistorias_patio(status);
CREATE INDEX IF NOT EXISTS idx_vistorias_patio_placa ON public.vistorias_patio(placa);
CREATE INDEX IF NOT EXISTS idx_vistorias_patio_comanda_id ON public.vistorias_patio(comanda_id);
CREATE INDEX IF NOT EXISTS idx_vistorias_notif_vistoria_id ON public.vistorias_notificacoes_log(vistoria_id);

-- 6. Habilitar Supabase Realtime para vistorias_patio
ALTER TABLE public.vistorias_patio REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'vistorias_patio'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vistorias_patio;
  END IF;
END $$;

-- 7. Permissões de RLS e Acesso
ALTER TABLE public.vistorias_patio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistorias_notificacoes_log ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.vistorias_patio TO anon, authenticated, service_role;
GRANT ALL ON public.vistorias_notificacoes_log TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "permitir_acesso_geral_vistorias_patio" ON public.vistorias_patio;
CREATE POLICY "permitir_acesso_geral_vistorias_patio"
  ON public.vistorias_patio
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "permitir_acesso_geral_notificacoes_log" ON public.vistorias_notificacoes_log;
CREATE POLICY "permitir_acesso_geral_notificacoes_log"
  ON public.vistorias_notificacoes_log
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 8. Recarregar o cache do schema no PostgREST
NOTIFY pgrst, 'reload schema';

