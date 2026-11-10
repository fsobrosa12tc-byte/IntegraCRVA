-- ==============================================================================
-- MARKS SYSTEMS · CRM-INTEGRA v2 — KANBAN CRVA/RS (6 COLUNAS) + LGPD
-- ------------------------------------------------------------------------------
-- Idempotente: cria a tabela se não existir e adapta a estrutura da v1.
-- Execute no SQL Editor do Supabase.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.crm_atendimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocolo TEXT NOT NULL,
    cliente_nome TEXT NOT NULL,
    cliente_telefone TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colunas da v2 (ADD COLUMN IF NOT EXISTS preserva dados existentes)
ALTER TABLE public.crm_atendimentos
    ADD COLUMN IF NOT EXISTS cliente_documento TEXT,
    ADD COLUMN IF NOT EXISTS tipo_cliente TEXT NOT NULL DEFAULT 'particular',
    ADD COLUMN IF NOT EXISTS despachante_nome TEXT,
    ADD COLUMN IF NOT EXISTS registro_crdd TEXT,
    ADD COLUMN IF NOT EXISTS grt_numero TEXT,
    ADD COLUMN IF NOT EXISTS mencionou_crdd BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS mencionou_grt BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS veiculo_placa TEXT,
    ADD COLUMN IF NOT EXISTS veiculo_renavam TEXT,
    ADD COLUMN IF NOT EXISTS veiculo_modelo TEXT,
    ADD COLUMN IF NOT EXISTS assunto TEXT NOT NULL DEFAULT 'outros',
    ADD COLUMN IF NOT EXISTS confianca_ia NUMERIC(5,2) NOT NULL DEFAULT 90.00,
    ADD COLUMN IF NOT EXISTS resumo_ia TEXT,
    ADD COLUMN IF NOT EXISTS regra_aplicada TEXT,
    ADD COLUMN IF NOT EXISTS etapa_kanban TEXT NOT NULL DEFAULT 'triagem_ia',
    ADD COLUMN IF NOT EXISTS urgente BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS motivo_urgencia TEXT,
    ADD COLUMN IF NOT EXISTS termos_criticos JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS responsavel_tipo TEXT NOT NULL DEFAULT 'ia',
    ADD COLUMN IF NOT EXISTS atendente_nome TEXT,
    ADD COLUMN IF NOT EXISTS ultima_mensagem TEXT,
    ADD COLUMN IF NOT EXISTS snippet_lgpd TEXT,
    ADD COLUMN IF NOT EXISTS ultima_interacao_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS valor_debitos NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS status_emissao_crlve TEXT DEFAULT 'pendente',
    ADD COLUMN IF NOT EXISTS historico_mensagens JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS transicoes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Remove restrições antigas (etapas/intenções da v1) antes de migrar os dados
ALTER TABLE public.crm_atendimentos DROP CONSTRAINT IF EXISTS crm_atendimentos_etapa_kanban_check;
ALTER TABLE public.crm_atendimentos DROP CONSTRAINT IF EXISTS crm_atendimentos_intencao_ia_check;
ALTER TABLE public.crm_atendimentos DROP CONSTRAINT IF EXISTS crm_atendimentos_tipo_cliente_check;
ALTER TABLE public.crm_atendimentos DROP CONSTRAINT IF EXISTS crm_atendimentos_assunto_check;
ALTER TABLE public.crm_atendimentos DROP CONSTRAINT IF EXISTS crm_atendimentos_responsavel_tipo_check;

-- Migra etapas da v1 para as 6 colunas da v2
UPDATE public.crm_atendimentos
SET etapa_kanban = CASE
        WHEN etapa_kanban IN ('transbordo_crlve', 'em_atendimento') AND tipo_cliente = 'despachante' THEN 'fila_humana_despachante'
        WHEN etapa_kanban IN ('transbordo_crlve', 'em_atendimento') THEN 'fila_humana_particular'
        WHEN etapa_kanban = 'aguardando_cliente' THEN 'aguardando_documentacao'
        ELSE etapa_kanban
    END
WHERE etapa_kanban IN ('transbordo_crlve', 'em_atendimento', 'aguardando_cliente');

-- Migra intenção da v1 para o assunto da v2 (somente onde ainda está no padrão)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_atendimentos' AND column_name = 'intencao_ia'
    ) THEN
        UPDATE public.crm_atendimentos SET assunto = CASE intencao_ia
            WHEN 'debitos_crlve' THEN 'crlve_atpve'
            WHEN 'vistoria_veicular' THEN 'vistoria'
            WHEN 'transferencia_atpve' THEN 'transferencia'
            WHEN 'primeiro_emplacamento' THEN 'primeiro_emplacamento'
            ELSE 'outros'
        END
        WHERE assunto = 'outros';
    END IF;
END $$;

-- Restrições da v2
ALTER TABLE public.crm_atendimentos
    ADD CONSTRAINT crm_atendimentos_tipo_cliente_check CHECK (tipo_cliente IN ('particular', 'despachante')),
    ADD CONSTRAINT crm_atendimentos_assunto_check CHECK (
        assunto IN ('transferencia', 'primeiro_emplacamento', 'vistoria', 'crlve_atpve', 'bloqueio_debitos', 'outros')
    ),
    ADD CONSTRAINT crm_atendimentos_etapa_kanban_check CHECK (
        etapa_kanban IN (
            'triagem_ia',
            'aguardando_documentacao',
            'fila_humana_particular',
            'fila_humana_despachante',
            'analise_vistoria',
            'concluido'
        )
    ),
    ADD CONSTRAINT crm_atendimentos_responsavel_tipo_check CHECK (responsavel_tipo IN ('ia', 'humano')),
    -- Separação estrita: despachante nunca na fila particular e vice-versa
    ADD CONSTRAINT crm_atendimentos_fila_perfil_check CHECK (
        NOT (etapa_kanban = 'fila_humana_particular' AND tipo_cliente = 'despachante')
        AND NOT (etapa_kanban = 'fila_humana_despachante' AND tipo_cliente = 'particular')
    );

-- Índices do painel
CREATE INDEX IF NOT EXISTS idx_crm_atend_etapa ON public.crm_atendimentos (etapa_kanban);
CREATE INDEX IF NOT EXISTS idx_crm_atend_tipo ON public.crm_atendimentos (tipo_cliente);
CREATE INDEX IF NOT EXISTS idx_crm_atend_assunto ON public.crm_atendimentos (assunto);
CREATE INDEX IF NOT EXISTS idx_crm_atend_urgente ON public.crm_atendimentos (urgente) WHERE urgente;
CREATE INDEX IF NOT EXISTS idx_crm_atend_interacao ON public.crm_atendimentos (ultima_interacao_em DESC);

-- Trigger: mantém atualizado_em
CREATE OR REPLACE FUNCTION public.trg_crm_atendimentos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_crm_atendimentos_updated_at ON public.crm_atendimentos;
CREATE TRIGGER set_crm_atendimentos_updated_at
    BEFORE INSERT OR UPDATE ON public.crm_atendimentos
    FOR EACH ROW EXECUTE FUNCTION public.trg_crm_atendimentos_updated_at();

-- RLS
ALTER TABLE public.crm_atendimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura e escrita autenticada e operacional em crm_atendimentos" ON public.crm_atendimentos;
CREATE POLICY "Permitir leitura e escrita autenticada e operacional em crm_atendimentos"
    ON public.crm_atendimentos FOR ALL USING (true) WITH CHECK (true);

-- Log de intenções/triagens (auditoria) — mantém a tabela da v1 se já existir
CREATE TABLE IF NOT EXISTS public.crm_intencoes_ia_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atendimento_id UUID REFERENCES public.crm_atendimentos(id) ON DELETE CASCADE,
    telefone_origem TEXT NOT NULL,
    tipo_cliente TEXT NOT NULL DEFAULT 'particular',
    mensagem_recebida TEXT NOT NULL,
    intencao_identificada TEXT NOT NULL,
    confianca_ia NUMERIC(5,2) NOT NULL DEFAULT 90.00,
    entidades_extraidas JSONB NOT NULL DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

