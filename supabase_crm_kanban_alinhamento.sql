-- ==============================================================================
-- MARKS SYSTEMS · CRM-INTEGRA — ALINHAMENTO DEFINITIVO DE SCHEMA DO SUPABASE
-- ==============================================================================
-- Este script SQL é 100% IDEMPOTENTE (pode ser executado múltiplas vezes com segurança).
-- Ele elimina em definitivo o erro:
--   "GET .../rest/v1/crm_atendimentos?select=*&order=ultima_interacao_em.desc 400"
-- e garante suporte total a todas as nomenclaturas de colunas usadas pelo Kanban
-- e pelo Webhook do WhatsApp (Evolution API v2 / Antonella).
--
-- EXECUÇÃO:
-- Copie e cole no "SQL Editor" do painel do seu projeto Supabase e clique em "RUN".
-- ==============================================================================

-- 1. Criação / Atualização da tabela principal crm_atendimentos
CREATE TABLE IF NOT EXISTS public.crm_atendimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocolo TEXT NOT NULL DEFAULT '#CRM-100',
    telefone TEXT,
    cliente_telefone TEXT,
    nome_cliente TEXT,
    cliente_nome TEXT,
    status_coluna TEXT NOT NULL DEFAULT 'triagem_ia',
    etapa_kanban TEXT NOT NULL DEFAULT 'triagem_ia',
    ultima_mensagem TEXT,
    snippet_lgpd TEXT,
    ultima_interacao_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atendido_por_ia BOOLEAN NOT NULL DEFAULT true,
    responsavel_tipo TEXT NOT NULL DEFAULT 'ia',
    urgente BOOLEAN NOT NULL DEFAULT false,
    motivo_urgencia TEXT,
    termos_criticos JSONB NOT NULL DEFAULT '[]'::jsonb,
    tipo_cliente TEXT NOT NULL DEFAULT 'particular',
    assunto TEXT NOT NULL DEFAULT 'outros',
    confianca_ia NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    resumo_ia TEXT,
    regra_aplicada TEXT DEFAULT 'Inbound WhatsApp',
    atendente_nome TEXT,
    veiculo_placa TEXT,
    veiculo_renavam TEXT,
    veiculo_modelo TEXT,
    cliente_documento TEXT,
    despachante_nome TEXT,
    registro_crdd TEXT,
    grt_numero TEXT,
    mencionou_crdd BOOLEAN NOT NULL DEFAULT false,
    mencionou_grt BOOLEAN NOT NULL DEFAULT false,
    valor_debitos NUMERIC(12,2) DEFAULT 0.00,
    status_emissao_crlve TEXT DEFAULT 'pendente',
    historico_mensagens JSONB NOT NULL DEFAULT '[]'::jsonb,
    transicoes JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Garantir que todas as colunas existam mesmo se a tabela foi criada anteriormente (ADD COLUMN IF NOT EXISTS)
ALTER TABLE public.crm_atendimentos
    ADD COLUMN IF NOT EXISTS protocolo TEXT NOT NULL DEFAULT '#CRM-100',
    ADD COLUMN IF NOT EXISTS telefone TEXT,
    ADD COLUMN IF NOT EXISTS cliente_telefone TEXT,
    ADD COLUMN IF NOT EXISTS nome_cliente TEXT,
    ADD COLUMN IF NOT EXISTS cliente_nome TEXT,
    ADD COLUMN IF NOT EXISTS status_coluna TEXT NOT NULL DEFAULT 'triagem_ia',
    ADD COLUMN IF NOT EXISTS etapa_kanban TEXT NOT NULL DEFAULT 'triagem_ia',
    ADD COLUMN IF NOT EXISTS ultima_mensagem TEXT,
    ADD COLUMN IF NOT EXISTS snippet_lgpd TEXT,
    ADD COLUMN IF NOT EXISTS ultima_interacao_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS atendido_por_ia BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS responsavel_tipo TEXT NOT NULL DEFAULT 'ia',
    ADD COLUMN IF NOT EXISTS urgente BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS motivo_urgencia TEXT,
    ADD COLUMN IF NOT EXISTS termos_criticos JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS tipo_cliente TEXT NOT NULL DEFAULT 'particular',
    ADD COLUMN IF NOT EXISTS assunto TEXT NOT NULL DEFAULT 'outros',
    ADD COLUMN IF NOT EXISTS confianca_ia NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    ADD COLUMN IF NOT EXISTS resumo_ia TEXT,
    ADD COLUMN IF NOT EXISTS regra_aplicada TEXT DEFAULT 'Inbound WhatsApp',
    ADD COLUMN IF NOT EXISTS atendente_nome TEXT,
    ADD COLUMN IF NOT EXISTS veiculo_placa TEXT,
    ADD COLUMN IF NOT EXISTS veiculo_renavam TEXT,
    ADD COLUMN IF NOT EXISTS veiculo_modelo TEXT,
    ADD COLUMN IF NOT EXISTS cliente_documento TEXT,
    ADD COLUMN IF NOT EXISTS despachante_nome TEXT,
    ADD COLUMN IF NOT EXISTS registro_crdd TEXT,
    ADD COLUMN IF NOT EXISTS grt_numero TEXT,
    ADD COLUMN IF NOT EXISTS mencionou_crdd BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS mencionou_grt BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS valor_debitos NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS status_emissao_crlve TEXT DEFAULT 'pendente',
    ADD COLUMN IF NOT EXISTS historico_mensagens JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS transicoes JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Sincronização inicial de dados entre nomes de colunas sinônimas
UPDATE public.crm_atendimentos
SET
    telefone = COALESCE(telefone, cliente_telefone),
    cliente_telefone = COALESCE(cliente_telefone, telefone),
    nome_cliente = COALESCE(nome_cliente, cliente_nome, 'Cliente'),
    cliente_nome = COALESCE(cliente_nome, nome_cliente, 'Cliente'),
    status_coluna = COALESCE(status_coluna, etapa_kanban, 'triagem_ia'),
    etapa_kanban = COALESCE(etapa_kanban, status_coluna, 'triagem_ia'),
    created_at = COALESCE(created_at, criado_em, now()),
    criado_em = COALESCE(criado_em, created_at, now()),
    ultima_interacao_em = COALESCE(ultima_interacao_em, atualizado_em, created_at, now());

-- 4. Criação da tabela de mensagens individuais crm_mensagens
CREATE TABLE IF NOT EXISTS public.crm_mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atendimento_id UUID REFERENCES public.crm_atendimentos(id) ON DELETE CASCADE,
    telefone TEXT NOT NULL,
    remetente TEXT NOT NULL CHECK (remetente IN ('cliente', 'ia', 'atendente')),
    autor_nome TEXT NOT NULL DEFAULT 'Cliente',
    texto TEXT NOT NULL,
    enviado_whatsapp BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_mensagens
    ADD COLUMN IF NOT EXISTS atendimento_id UUID REFERENCES public.crm_atendimentos(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS telefone TEXT,
    ADD COLUMN IF NOT EXISTS remetente TEXT,
    ADD COLUMN IF NOT EXISTS autor_nome TEXT,
    ADD COLUMN IF NOT EXISTS texto TEXT,
    ADD COLUMN IF NOT EXISTS enviado_whatsapp BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 5. Índices de alta performance para ordenar e buscar rapidamente
CREATE INDEX IF NOT EXISTS idx_crm_atendimentos_ultima_interacao 
    ON public.crm_atendimentos (ultima_interacao_em DESC);

CREATE INDEX IF NOT EXISTS idx_crm_atendimentos_telefone 
    ON public.crm_atendimentos (telefone);

CREATE INDEX IF NOT EXISTS idx_crm_atendimentos_cliente_telefone 
    ON public.crm_atendimentos (cliente_telefone);

CREATE INDEX IF NOT EXISTS idx_crm_mensagens_atendimento_id 
    ON public.crm_mensagens (atendimento_id);

CREATE INDEX IF NOT EXISTS idx_crm_mensagens_telefone 
    ON public.crm_mensagens (telefone);

-- 6. Trigger para manter colunas sinônimas automaticamente sincronizadas
CREATE OR REPLACE FUNCTION public.fn_sincronizar_colunas_crm()
RETURNS TRIGGER AS $$
BEGIN
    NEW.telefone := COALESCE(NEW.telefone, NEW.cliente_telefone);
    NEW.cliente_telefone := COALESCE(NEW.cliente_telefone, NEW.telefone);
    NEW.nome_cliente := COALESCE(NEW.nome_cliente, NEW.cliente_nome, 'Cliente');
    NEW.cliente_nome := COALESCE(NEW.cliente_nome, NEW.nome_cliente, 'Cliente');
    NEW.status_coluna := COALESCE(NEW.status_coluna, NEW.etapa_kanban, 'triagem_ia');
    NEW.etapa_kanban := COALESCE(NEW.etapa_kanban, NEW.status_coluna, 'triagem_ia');
    NEW.created_at := COALESCE(NEW.created_at, NEW.criado_em, now());
    NEW.criado_em := COALESCE(NEW.criado_em, NEW.created_at, now());
    NEW.atualizado_em := now();
    IF NEW.ultima_interacao_em IS NULL THEN
        NEW.ultima_interacao_em := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sincronizar_colunas_crm ON public.crm_atendimentos;
CREATE TRIGGER trg_sincronizar_colunas_crm
BEFORE INSERT OR UPDATE ON public.crm_atendimentos
FOR EACH ROW EXECUTE FUNCTION public.fn_sincronizar_colunas_crm();

-- 7. Configuração de RLS (Row Level Security) permissivo para evitar bloqueios no CRM
ALTER TABLE public.crm_atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso publico crm_atendimentos" ON public.crm_atendimentos;
CREATE POLICY "Acesso publico crm_atendimentos"
    ON public.crm_atendimentos
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso publico crm_mensagens" ON public.crm_mensagens;
CREATE POLICY "Acesso publico crm_mensagens"
    ON public.crm_mensagens
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

-- Notifica o PostgREST para recarregar o schema imediatamente
NOTIFY pgrst, 'reload schema';
