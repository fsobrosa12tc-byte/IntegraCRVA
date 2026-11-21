-- ============================================================================
-- INTEGRA CRVA / PDV - PATCH: VÍNCULO DE AUDITORIA (CLIENTE FINAL) EM ORDENS
-- Adiciona colunas opcionais cliente_final_nome, cliente_final_cpf_cnpj e
-- placa_veiculo em public.movimentacoes_caixa (100% idempotente).
-- Execute no SQL Editor do Supabase.
-- ============================================================================

ALTER TABLE public.movimentacoes_caixa
  ADD COLUMN IF NOT EXISTS cliente_final_nome TEXT,
  ADD COLUMN IF NOT EXISTS cliente_final_cpf_cnpj VARCHAR(30),
  ADD COLUMN IF NOT EXISTS placa_veiculo VARCHAR(15);

CREATE INDEX IF NOT EXISTS idx_mov_placa_veiculo
  ON public.movimentacoes_caixa(placa_veiculo);

NOTIFY pgrst, 'reload schema';
