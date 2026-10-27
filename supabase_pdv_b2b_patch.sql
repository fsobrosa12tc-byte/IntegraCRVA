-- =====================================================================
--  PATCH: compatibilidade entre colunas legadas e novas de public.despachantes
--  Legado: razao_social, cnpj (NOT NULL)   |   PRD: nome_razao, documento
--  Um gatilho BEFORE mantém os dois pares sincronizados; assim o cadastro
--  pelo PDV (nome_razao/documento) e o código legado (razao_social/cnpj)
--  funcionam ao mesmo tempo. Idempotente.
-- =====================================================================

ALTER TABLE public.despachantes ALTER COLUMN razao_social DROP NOT NULL;
ALTER TABLE public.despachantes ALTER COLUMN cnpj DROP NOT NULL;
ALTER TABLE public.despachantes ALTER COLUMN nome_razao DROP NOT NULL;

UPDATE public.despachantes SET documento = cnpj WHERE documento IS NULL;
UPDATE public.despachantes SET nome_razao = razao_social WHERE nome_razao IS NULL;
UPDATE public.despachantes SET telefone = '' WHERE telefone IS NULL;

CREATE OR REPLACE FUNCTION public.fn_sync_despachante_colunas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.nome_razao   := COALESCE(NEW.nome_razao, NEW.razao_social);
  NEW.razao_social := COALESCE(NEW.razao_social, NEW.nome_razao);
  NEW.documento    := COALESCE(NEW.documento, NEW.cnpj);
  NEW.cnpj         := COALESCE(NEW.cnpj, NEW.documento);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_despachante_colunas ON public.despachantes;
CREATE TRIGGER trg_sync_despachante_colunas
BEFORE INSERT OR UPDATE ON public.despachantes
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_despachante_colunas();

CREATE INDEX IF NOT EXISTS idx_despachantes_nome ON public.despachantes (lower(nome_razao));
