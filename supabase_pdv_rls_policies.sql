-- =========================================================================
-- MIGRAÇÃO DE POLÍTICAS ROW LEVEL SECURITY (RLS) - INTEGRA PDV
-- Executado e validado em db.hyphsoqjyrqpbplwcotk.supabase.co
-- =========================================================================

-- 1. POLÍTICAS RLS PARA A TABELA 'caixas_diarios'
ALTER TABLE public.caixas_diarios ENABLE ROW LEVEL SECURITY;

-- Limpeza de políticas anteriores conflitantes
DROP POLICY IF EXISTS "Permitir insercao caixas_diarios" ON public.caixas_diarios;
DROP POLICY IF EXISTS "Permitir leitura caixas_diarios" ON public.caixas_diarios;
DROP POLICY IF EXISTS "Permitir atualizacao caixas_diarios" ON public.caixas_diarios;
DROP POLICY IF EXISTS "caixas_select" ON public.caixas_diarios;
DROP POLICY IF EXISTS "caixas_insert" ON public.caixas_diarios;
DROP POLICY IF EXISTS "caixas_update" ON public.caixas_diarios;
DROP POLICY IF EXISTS "caixas_diarios_select_policy" ON public.caixas_diarios;
DROP POLICY IF EXISTS "caixas_diarios_insert_policy" ON public.caixas_diarios;
DROP POLICY IF EXISTS "caixas_diarios_update_policy" ON public.caixas_diarios;

-- Leitura: Operador lê os seus caixas ou utilizador Master/Gerente/Financeiro lê todos
CREATE POLICY "caixas_diarios_select_policy" ON public.caixas_diarios
FOR SELECT TO authenticated
USING (
  auth.uid() = operador_id 
  OR EXISTS (
    SELECT 1 FROM public.perfis 
    WHERE perfis.id = auth.uid() 
    AND perfis.role IN ('master', 'gerente', 'financeiro')
  )
);

-- Inserção: Operador insere para o seu próprio operador_id ou Master/Gerente/Financeiro insere
CREATE POLICY "caixas_diarios_insert_policy" ON public.caixas_diarios
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = operador_id 
  OR EXISTS (
    SELECT 1 FROM public.perfis 
    WHERE perfis.id = auth.uid() 
    AND perfis.role IN ('master', 'gerente', 'financeiro')
  )
);

-- Atualização (Fechamento/Conferência): Operador atualiza seu caixa ou Master/Gerente/Financeiro
CREATE POLICY "caixas_diarios_update_policy" ON public.caixas_diarios
FOR UPDATE TO authenticated
USING (
  auth.uid() = operador_id 
  OR EXISTS (
    SELECT 1 FROM public.perfis 
    WHERE perfis.id = auth.uid() 
    AND perfis.role IN ('master', 'gerente', 'financeiro')
  )
);


-- 2. POLÍTICAS RLS PARA 'movimentacoes_caixa' E 'despachantes'
-- 'movimentacoes_caixa'
ALTER TABLE public.movimentacoes_caixa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mov_select" ON public.movimentacoes_caixa;
DROP POLICY IF EXISTS "mov_insert" ON public.movimentacoes_caixa;
DROP POLICY IF EXISTS "movimentacoes_caixa_all_policy" ON public.movimentacoes_caixa;
CREATE POLICY "movimentacoes_caixa_all_policy" ON public.movimentacoes_caixa
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- 'despachantes'
ALTER TABLE public.despachantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "despachantes_select" ON public.despachantes;
DROP POLICY IF EXISTS "despachantes_insert" ON public.despachantes;
DROP POLICY IF EXISTS "despachantes_update" ON public.despachantes;
DROP POLICY IF EXISTS "despachantes_all_policy" ON public.despachantes;
CREATE POLICY "despachantes_all_policy" ON public.despachantes
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- Leitura de perfis por authenticated (necessário para a subquery das políticas RLS)
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "perfis_select_policy" ON public.perfis;
CREATE POLICY "perfis_select_policy" ON public.perfis
FOR SELECT TO authenticated
USING (true);
