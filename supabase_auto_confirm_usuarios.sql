-- ============================================================================
-- INTEGRA CRVA / PDV - SINCRONIZAÇÃO E AUTO-CONFIRMAÇÃO DE USUÁRIOS
-- Regras de Negócio Marks Systems:
-- 1. E-mail institucional nome.funcao@marks.com
-- 2. Senha alfanumérica gerada automaticamente
-- 3. Confirmação imediata 100% ativa (SEM confirmação de e-mail)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Confirma imediatamente todos os usuários que já constam em auth.users
UPDATE auth.users
SET 
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  confirmed_at = COALESCE(confirmed_at, NOW())
WHERE email_confirmed_at IS NULL;

-- 2. Trigger de Auto-Confirmação Imediata
-- Garante que QUALQUER usuário criado no Supabase já nasce 100% confirmado
CREATE OR REPLACE FUNCTION public.fn_auto_confirmar_usuario()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, NOW());
  NEW.confirmed_at := COALESCE(NEW.confirmed_at, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_auto_confirmar_usuario ON auth.users;
CREATE TRIGGER tr_auto_confirmar_usuario
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_confirmar_usuario();

-- 3. Função RPC para provisionamento e sincronização atômica (Security Definer)
CREATE OR REPLACE FUNCTION public.fn_provisionar_usuario_marks(
  p_email TEXT,
  p_senha TEXT,
  p_nome TEXT,
  p_cpf TEXT,
  p_telefone TEXT,
  p_email_contato TEXT,
  p_role TEXT,
  p_criado_por_id UUID DEFAULT NULL,
  p_criado_por_nome TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  p_email := LOWER(TRIM(p_email));
  v_encrypted_pw := crypt(p_senha, gen_salt('bf'));

  -- Verifica se já existe em auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = p_email LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Atualiza usuário existente: confirma e atualiza senha e metadados
    UPDATE auth.users
    SET 
      encrypted_password = v_encrypted_pw,
      email_confirmed_at = NOW(),
      confirmed_at = NOW(),
      raw_user_meta_data = jsonb_build_object(
        'nome_completo', p_nome,
        'cpf', p_cpf,
        'role', p_role,
        'telefone', p_telefone,
        'email_contato', p_email_contato
      ),
      updated_at = NOW()
    WHERE id = v_user_id;
  ELSE
    -- Cria novo usuário já confirmado
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      p_email,
      v_encrypted_pw,
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'nome_completo', p_nome,
        'cpf', p_cpf,
        'role', p_role,
        'telefone', p_telefone,
        'email_contato', p_email_contato
      ),
      NOW(),
      NOW()
    );
  END IF;

  -- Sincroniza tabela public.perfis garantindo o mesmo UUID
  INSERT INTO public.perfis (
    id,
    nome_completo,
    cpf,
    telefone,
    email_contato,
    email_login,
    role,
    ativo,
    criado_por_id,
    criado_por_nome,
    criado_em
  ) VALUES (
    v_user_id,
    p_nome,
    p_cpf,
    p_telefone,
    p_email_contato,
    p_email,
    p_role,
    TRUE,
    p_criado_por_id,
    p_criado_por_nome,
    NOW()
  )
  ON CONFLICT (email_login) DO UPDATE SET
    nome_completo = EXCLUDED.nome_completo,
    cpf = EXCLUDED.cpf,
    telefone = EXCLUDED.telefone,
    email_contato = EXCLUDED.email_contato,
    role = EXCLUDED.role,
    ativo = TRUE;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Provisionamento e sincronização imediata dos colaboradores institucionais
-- (Especialmente Patricia Atendente e contas principais)
DO $$
BEGIN
  -- Patrícia Atendente Balcão
  PERFORM public.fn_provisionar_usuario_marks(
    'patricia.atendente@marks.com',
    'Atendente@123',
    'Patrícia Atendente Balcão',
    '444.555.666-77',
    '(54) 99999-0005',
    'patricia.atendente@marks.com',
    'atendente',
    NULL,
    'Sistema / Provisionamento'
  );

  -- Lucas Operador de Caixa
  PERFORM public.fn_provisionar_usuario_marks(
    'lucas.caixa@marks.com',
    'Caixa@123',
    'Lucas Operador de Caixa',
    '333.444.555-66',
    '(54) 99999-0004',
    'lucas.caixa@gmail.com',
    'caixa',
    NULL,
    'Sistema / Provisionamento'
  );

  -- Mariana Gestão Financeira
  PERFORM public.fn_provisionar_usuario_marks(
    'mariana.financeiro@marks.com',
    'Financeiro@123',
    'Mariana Gestão Financeira',
    '222.333.444-55',
    '(54) 99999-0003',
    'mariana.fin@gmail.com',
    'financeiro',
    NULL,
    'Sistema / Provisionamento'
  );

  -- Carlos Gerente Geral
  PERFORM public.fn_provisionar_usuario_marks(
    'carlos.gerente@marks.com',
    'Gerente@123',
    'Carlos Gerente Geral',
    '111.222.333-44',
    '(54) 99999-0002',
    'carlos.gerente@gmail.com',
    'gerente',
    NULL,
    'Sistema / Provisionamento'
  );

  -- Antonio Sobrosa (Master Root)
  PERFORM public.fn_provisionar_usuario_marks(
    'fsobrosa.12tc@gmail.com',
    'Antonio2@26',
    'Antonio Sobrosa',
    '000.000.000-00',
    '(54) 99999-0001',
    'fsobrosa.12tc@gmail.com',
    'master',
    NULL,
    'Sistema / Root'
  );
END $$;
