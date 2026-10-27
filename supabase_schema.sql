-- =====================================================================
--                   INTEGRA CRVA - ESQUEMA SUPABASE (POSTGRESQL)
-- =====================================================================
-- Este script adapta o banco de dados SQLite/MySQL para PostgreSQL.
-- - Modificado de INT UNSIGNED AUTO_INCREMENT para SERIAL PRIMARY KEY.
-- - Modificado de YEAR para SMALLINT.
-- - Mantém Foreign Keys, Unique Constraints e Índices de Performance.
-- =====================================================================

-- 1. Tabela de Proprietários (LGPD: Dados sensíveis protegidos)
CREATE TABLE IF NOT EXISTS proprietarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf_cnpj VARCHAR(20) NOT NULL,
  endereco TEXT NOT NULL,
  telefone VARCHAR(20),
  email TEXT,
  autorizacao VARCHAR(3) DEFAULT 'NÃO'
);

-- 2. Tabela de Veículos
CREATE TABLE IF NOT EXISTS veiculos (
  id SERIAL PRIMARY KEY,
  placa VARCHAR(10) NOT NULL,
  renavam VARCHAR(20) NOT NULL,
  chassi VARCHAR(20) NOT NULL,
  modelo TEXT NOT NULL,
  ano SMALLINT NOT NULL
);

-- 3. Tabela de Requerimentos (Auditoria e Integridade Digital)
CREATE TABLE IF NOT EXISTS requerimentos (
  id SERIAL PRIMARY KEY,
  id_servico TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Pendente',
  hash_integridade CHAR(64) NOT NULL UNIQUE,
  rest_havera VARCHAR(10),
  rest_modalidade TEXT,
  rest_tipo_credor TEXT,
  proprietario_id INT REFERENCES proprietarios(id) ON DELETE CASCADE,
  veiculo_id INT REFERENCES veiculos(id) ON DELETE CASCADE
);

-- =====================================================================
--           ÍNDICES DE ALTA PERFORMANCE PARA AUDITORIA E BUSCA
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_requerimentos_hash ON requerimentos(hash_integridade);
CREATE INDEX IF NOT EXISTS idx_proprietarios_cpf ON proprietarios(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_veiculos_placa ON veiculos(placa);

-- =====================================================================
-- 4. Tabela de Perfis de Usuários (Governança, RBAC e Auditoria)
-- =====================================================================
CREATE TABLE IF NOT EXISTS perfis (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  cpf VARCHAR(14) NOT NULL UNIQUE,
  telefone VARCHAR(20) NOT NULL,
  email_contato TEXT NOT NULL,
  email_login TEXT NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('master', 'gerente', 'financeiro', 'caixa', 'atendente')),
  ativo BOOLEAN DEFAULT TRUE,
  criado_por_id UUID REFERENCES auth.users(id),
  criado_por_nome TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perfis_email_login ON perfis(email_login);
CREATE INDEX IF NOT EXISTS idx_perfis_cpf ON perfis(cpf);
CREATE INDEX IF NOT EXISTS idx_perfis_role ON perfis(role);
