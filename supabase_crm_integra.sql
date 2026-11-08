-- ==============================================================================
-- MARKS SYSTEMS · INTEGRA CRVA - ESTRUTURA SUPABASE PARA O MÓDULO CRM-INTEGRA
-- ==============================================================================
-- Armazena as conversas oriundas do WhatsApp, a separação estrita entre
-- Particulares e Despachantes, a fila exclusiva de transbordo para solicitações
-- de "Débitos / CRLV-e" e o log de intenções identificadas pela IA.
-- ==============================================================================

-- 1. Tabela Principal de Atendimentos e Conversas do CRM (Kanban)
CREATE TABLE IF NOT EXISTS public.crm_atendimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocolo TEXT NOT NULL,
    cliente_nome TEXT NOT NULL,
    cliente_telefone TEXT NOT NULL,
    cliente_documento TEXT,
    tipo_cliente TEXT NOT NULL DEFAULT 'particular' CHECK (tipo_cliente IN ('particular', 'despachante')),
    despachante_nome TEXT,
    veiculo_placa TEXT,
    veiculo_modelo TEXT,
    veiculo_renavam TEXT,
    intencao_ia TEXT NOT NULL DEFAULT 'duvida_geral' CHECK (
        intencao_ia IN (
            'debitos_crlve',
            'vistoria_veicular',
            'transferencia_atpve',
            'primeiro_emplacamento',
            'segunda_via_placa',
            'baixa_comunicado',
            'faturamento_b2b',
            'duvida_geral'
        )
    ),
    intencao_rotulo TEXT NOT NULL DEFAULT 'Triagem Geral',
    confianca_ia NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    resumo_ia TEXT,
    etapa_kanban TEXT NOT NULL DEFAULT 'triagem_ia' CHECK (
        etapa_kanban IN (
            'triagem_ia',
            'transbordo_crlve',
            'em_atendimento',
            'aguardando_cliente',
            'concluido'
        )
    ),
    fila_transbordo_crlve BOOLEAN NOT NULL DEFAULT false,
    prioridade TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
    valor_debitos NUMERIC(12,2) DEFAULT 0.00,
    status_emissao_crlve TEXT DEFAULT 'pendente' CHECK (
        status_emissao_crlve IN ('pendente', 'consultando_detran', 'guia_enviada', 'pago_aguardando_emissao', 'crlve_enviado')
    ),
    atendente_nome TEXT,
    ultima_mensagem TEXT,
    ultima_interacao_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    historico_mensagens JSONB NOT NULL DEFAULT '[]'::jsonb,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de Auditoria de Intenções Identificadas pela IA (NLU / WhatsApp)
CREATE TABLE IF NOT EXISTS public.crm_intencoes_ia_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atendimento_id UUID REFERENCES public.crm_atendimentos(id) ON DELETE CASCADE,
    telefone_origem TEXT NOT NULL,
    tipo_cliente TEXT NOT NULL DEFAULT 'particular',
    mensagem_recebida TEXT NOT NULL,
    intencao_identificada TEXT NOT NULL,
    confianca_ia NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    entidades_extraidas JSONB NOT NULL DEFAULT '{}'::jsonb,
    transbordo_automatico_crlve BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Índices para consultas rápidas do Kanban e Filas
CREATE INDEX IF NOT EXISTS idx_crm_atendimentos_tipo_cliente ON public.crm_atendimentos(tipo_cliente);
CREATE INDEX IF NOT EXISTS idx_crm_atendimentos_etapa_kanban ON public.crm_atendimentos(etapa_kanban);
CREATE INDEX IF NOT EXISTS idx_crm_atendimentos_transbordo_crlve ON public.crm_atendimentos(fila_transbordo_crlve);
CREATE INDEX IF NOT EXISTS idx_crm_atendimentos_intencao_ia ON public.crm_atendimentos(intencao_ia);
CREATE INDEX IF NOT EXISTS idx_crm_atendimentos_ultima_interacao ON public.crm_atendimentos(ultima_interacao_em DESC);

-- 4. Trigger para atualização automática do timestamp atualizado_em
CREATE OR REPLACE FUNCTION public.trg_crm_atendimentos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = now();
    -- Se a intenção identificada pela IA for 'debitos_crlve', ativa obrigatoriamente a flag de transbordo
    IF NEW.intencao_ia = 'debitos_crlve' THEN
        NEW.fila_transbordo_crlve = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_crm_atendimentos_updated_at ON public.crm_atendimentos;
CREATE TRIGGER set_crm_atendimentos_updated_at
    BEFORE INSERT OR UPDATE ON public.crm_atendimentos
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_crm_atendimentos_updated_at();

-- 5. Habilitar Row Level Security (RLS) com políticas operacionais para os colaboradores do CRVA
ALTER TABLE public.crm_atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_intencoes_ia_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura e escrita autenticada e operacional em crm_atendimentos" ON public.crm_atendimentos;
CREATE POLICY "Permitir leitura e escrita autenticada e operacional em crm_atendimentos"
    ON public.crm_atendimentos
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura e escrita em crm_intencoes_ia_log" ON public.crm_intencoes_ia_log;
CREATE POLICY "Permitir leitura e escrita em crm_intencoes_ia_log"
    ON public.crm_intencoes_ia_log
    FOR ALL
    USING (true)
    WITH CHECK (true);

