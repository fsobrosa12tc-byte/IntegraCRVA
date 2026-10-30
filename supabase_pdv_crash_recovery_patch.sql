-- =====================================================================
--  PATCH DE AUDITORIA DE CRASH RECOVERY & TOLERÂNCIA A FALHAS - INTEGRA PDV
--  Registra eventos de retomada de sessão pós-queda de energia ou desconexão
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.logs_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id UUID REFERENCES auth.users(id),
  operador_nome VARCHAR(255) NOT NULL,
  tipo_evento VARCHAR(100) NOT NULL DEFAULT 'crash_recovery_reconexao',
  evento VARCHAR(100) NOT NULL DEFAULT 'RETOMADA_SESSAO_CRASH_RECOVERY',
  descricao TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_auditoria_operador ON public.logs_auditoria(operador_id);
CREATE INDEX IF NOT EXISTS idx_logs_auditoria_evento ON public.logs_auditoria(evento);
CREATE INDEX IF NOT EXISTS idx_logs_auditoria_criado_em ON public.logs_auditoria(criado_em);

ALTER TABLE public.logs_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logs_auditoria_select ON public.logs_auditoria;
CREATE POLICY logs_auditoria_select ON public.logs_auditoria FOR SELECT TO authenticated
  USING (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.perfis p 
       WHERE p.id = auth.uid() AND p.role IN ('master', 'gerente', 'financeiro')
    )
  );

DROP POLICY IF EXISTS logs_auditoria_insert ON public.logs_auditoria;
CREATE POLICY logs_auditoria_insert ON public.logs_auditoria FOR INSERT TO authenticated
  WITH CHECK (
    operador_id = auth.uid()
    OR auth.uid() IS NOT NULL
  );
