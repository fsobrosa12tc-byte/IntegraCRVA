-- ============================================================================
-- PATCH: PERSISTÊNCIA DE ATAS OFICIAIS E SNAPSHOT IMUTÁVEL DE FECHAMENTO DE CAIXA
-- Sistema Integra CRVA / Módulo PDV (Fintech Audit Grade)
-- ============================================================================

-- 1. Colunas oficiais de snapshot imutável e hash de auditoria em caixas_diarios
ALTER TABLE public.caixas_diarios 
  ADD COLUMN IF NOT EXISTS snapshot_ata JSONB,
  ADD COLUMN IF NOT EXISTS hash_auditoria VARCHAR(64),
  ADD COLUMN IF NOT EXISTS dados_fechamento JSONB,
  ADD COLUMN IF NOT EXISTS ata_encerramento JSONB;

-- 2. Índices GIN e B-Tree para busca e auditoria de snapshots contábeis
CREATE INDEX IF NOT EXISTS idx_caixas_diarios_snapshot_ata 
  ON public.caixas_diarios USING GIN (snapshot_ata);

CREATE INDEX IF NOT EXISTS idx_caixas_diarios_hash_auditoria 
  ON public.caixas_diarios (hash_auditoria);

CREATE INDEX IF NOT EXISTS idx_caixas_diarios_dados_fechamento 
  ON public.caixas_diarios USING GIN (dados_fechamento);

-- 3. Comentários explicativos da estrutura do snapshot
COMMENT ON COLUMN public.caixas_diarios.snapshot_ata IS 
'Snapshot contábil imutável do encerramento do turno contendo: identificacao (com CPF real do operador), valores consolidados, movimentacoes_detalhadas, sangrias_suprimentos, trocas_operador e hash_autenticacao SHA-256.';

-- 4. Atualização de políticas de RLS para consulta transparente das atas pela equipe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'caixas_diarios'
  ) THEN
    ALTER TABLE public.caixas_diarios ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
