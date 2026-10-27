import { createClient } from '@supabase/supabase-js';

const USUARIOS_PADRAO = [
  {
    nome: 'Patrícia Atendente Balcão',
    cpf: '444.555.666-77',
    telefone: '(54) 99999-0005',
    emailContato: 'patricia.atendente@marks.com',
    emailInstitucional: 'patricia.atendente@marks.com',
    senhaGerada: 'Atendente@123',
    funcao: 'atendente'
  },
  {
    nome: 'Lucas Operador de Caixa',
    cpf: '333.444.555-66',
    telefone: '(54) 99999-0004',
    emailContato: 'lucas.caixa@gmail.com',
    emailInstitucional: 'lucas.caixa@marks.com',
    senhaGerada: 'Caixa@123',
    funcao: 'caixa'
  },
  {
    nome: 'Mariana Gestão Financeira',
    cpf: '222.333.444-55',
    telefone: '(54) 99999-0003',
    emailContato: 'mariana.fin@gmail.com',
    emailInstitucional: 'mariana.financeiro@marks.com',
    senhaGerada: 'Financeiro@123',
    funcao: 'financeiro'
  },
  {
    nome: 'Carlos Gerente Geral',
    cpf: '111.222.333-44',
    telefone: '(54) 99999-0002',
    emailContato: 'carlos.gerente@gmail.com',
    emailInstitucional: 'carlos.gerente@marks.com',
    senhaGerada: 'Gerente@123',
    funcao: 'gerente'
  },
  {
    nome: 'Antonio Sobrosa',
    cpf: '000.000.000-00',
    telefone: '(54) 99999-0001',
    emailContato: 'fsobrosa.12tc@gmail.com',
    emailInstitucional: 'fsobrosa.12tc@gmail.com',
    senhaGerada: 'Antonio2@26',
    funcao: 'master'
  }
];

export default async function handler(req: any, res: any) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

    const resultados: any[] = [];

    // Se temos service role key, faz a sincronização administrativa completa
    if (supabaseUrl && serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // 1. Lista todos os usuários de auth.users
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;

      const authUsers = listData?.users || [];

      // 2. Confirma todos os existentes que estejam com email_confirmed_at nulo
      for (const u of authUsers) {
        if (!u.email_confirmed_at) {
          await supabaseAdmin.auth.admin.updateUserById(u.id, {
            email_confirm: true
          });
          resultados.push({ email: u.email, acao: 'confirmado_updateUserById' });
        }
      }

      // 3. Garante que os usuários padrão existam em auth.users e perfis
      for (const u of USUARIOS_PADRAO) {
        const emailLimpo = u.emailInstitucional.toLowerCase().trim();
        const existente = authUsers.find(x => x.email?.toLowerCase() === emailLimpo);

        let finalUserId: string;

        if (!existente) {
          // Cria novo com email_confirm: true
          const { data: created, error: crtErr } = await supabaseAdmin.auth.admin.createUser({
            email: emailLimpo,
            password: u.senhaGerada,
            email_confirm: true,
            user_metadata: {
              nome_completo: u.nome,
              cpf: u.cpf,
              role: u.funcao,
              telefone: u.telefone,
              email_contato: u.emailContato
            }
          });
          if (crtErr) throw crtErr;
          finalUserId = created.user.id;
          resultados.push({ email: emailLimpo, acao: 'criado_confirmado', id: finalUserId });
        } else {
          finalUserId = existente.id;
          // Garante confirmação e senha atualizada
          await supabaseAdmin.auth.admin.updateUserById(existente.id, {
            email_confirm: true,
            password: u.senhaGerada,
            user_metadata: {
              nome_completo: u.nome,
              cpf: u.cpf,
              role: u.funcao,
              telefone: u.telefone,
              email_contato: u.emailContato
            }
          });
          resultados.push({ email: emailLimpo, acao: 'atualizado_confirmado', id: finalUserId });
        }

        // Sincroniza em public.perfis
        await supabaseAdmin.from('perfis').upsert({
          id: finalUserId,
          nome_completo: u.nome,
          cpf: u.cpf,
          telefone: u.telefone,
          email_contato: u.emailContato,
          email_login: emailLimpo,
          role: u.funcao,
          ativo: true,
          criado_em: new Date().toISOString()
        }, { onConflict: 'email_login' });
      }

      return res.status(200).json({ sucesso: true, metodo: 'supabase_admin', resultados });
    }

    // Fallback via RPC PostgreSQL
    if (supabaseUrl && supabaseAnonKey) {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      for (const u of USUARIOS_PADRAO) {
        try {
          const { data: rpcId } = await client.rpc('fn_provisionar_usuario_marks', {
            p_email: u.emailInstitucional.toLowerCase().trim(),
            p_senha: u.senhaGerada,
            p_nome: u.nome,
            p_cpf: u.cpf,
            p_telefone: u.telefone,
            p_email_contato: u.emailContato,
            p_role: u.funcao
          });
          resultados.push({ email: u.emailInstitucional, acao: 'rpc_postgres', id: rpcId });
        } catch (e: any) {
          resultados.push({ email: u.emailInstitucional, erro: e.message });
        }
      }
      return res.status(200).json({ sucesso: true, metodo: 'rpc_postgres', resultados });
    }

    return res.status(200).json({ sucesso: true, metodo: 'sem_conexao_admin' });
  } catch (err: any) {
    console.error('Erro na sincronização de usuários:', err);
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
}
