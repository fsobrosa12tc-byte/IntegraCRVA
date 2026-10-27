import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }

  try {
    const {
      nome,
      cpf,
      telefone,
      emailPessoal,
      emailInstitucional,
      funcao,
      senhaGerada,
      criadoPorId,
      criadoPorNome
    } = req.body;

    if (!emailInstitucional || !senhaGerada || !funcao) {
      return res.status(400).json({ sucesso: false, erro: 'Campos obrigatórios não informados.' });
    }

    const emailLimpo = emailInstitucional.toLowerCase().trim();
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

    let userId: string | null = null;

    // 1. Criação via Supabase Admin (auth.admin.createUser com email_confirm: true)
    if (supabaseUrl && serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // Tenta criar diretamente
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: emailLimpo,
        password: senhaGerada,
        email_confirm: true, // Garante que o e-mail já nasce confirmado
        user_metadata: {
          nome_completo: nome,
          cpf: cpf,
          role: funcao,
          telefone: telefone,
          email_contato: emailPessoal
        }
      });

      if (createError) {
        // Se já existe, atualiza para garantir email_confirm: true e senha
        if (/already registered|exists|23505/i.test(createError.message)) {
          const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
          const userExistente = (usersList?.users as any[])?.find((u: any) => u.email?.toLowerCase() === emailLimpo);
          if (userExistente) {
            userId = userExistente.id;
            await supabaseAdmin.auth.admin.updateUserById(userExistente.id, {
              password: senhaGerada,
              email_confirm: true,
              user_metadata: {
                nome_completo: nome,
                cpf: cpf,
                role: funcao,
                telefone: telefone,
                email_contato: emailPessoal
              }
            });
          }
        } else {
          throw createError;
        }
      } else if (createData?.user) {
        userId = createData.user.id;
      }

      // Sincroniza tabela public.perfis com o UUID exato retornado pelo Supabase Auth
      if (userId) {
        const { error: errPerfil } = await supabaseAdmin.from('perfis').upsert({
          id: userId,
          nome_completo: nome,
          cpf: cpf,
          telefone: telefone,
          email_contato: emailPessoal,
          email_login: emailLimpo,
          role: funcao,
          ativo: true,
          criado_por_id: criadoPorId || null,
          criado_por_nome: criadoPorNome || null,
          criado_em: new Date().toISOString()
        }, { onConflict: 'email_login' });

        if (errPerfil) {
          console.warn('Aviso ao sincronizar perfis via Admin:', errPerfil.message);
        }
      }

      return res.status(200).json({
        sucesso: true,
        userId,
        email: emailLimpo,
        emailConfirmado: true
      });
    }

    // 2. Fallback via RPC PostgreSQL se não houver serviceRoleKey no runtime
    if (supabaseUrl && supabaseAnonKey) {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      const { data: rpcUserId, error: rpcError } = await client.rpc('fn_provisionar_usuario_marks', {
        p_email: emailLimpo,
        p_senha: senhaGerada,
        p_nome: nome,
        p_cpf: cpf,
        p_telefone: telefone,
        p_email_contato: emailPessoal,
        p_role: funcao,
        p_criado_por_id: criadoPorId || null,
        p_criado_por_nome: criadoPorNome || null
      });

      if (!rpcError && rpcUserId) {
        return res.status(200).json({
          sucesso: true,
          userId: rpcUserId,
          email: emailLimpo,
          emailConfirmado: true,
          metodo: 'rpc_postgres'
        });
      }
    }

    return res.status(200).json({
      sucesso: true,
      email: emailLimpo,
      metodo: 'fallback_local'
    });
  } catch (err: any) {
    console.error('Erro ao provisionar usuário:', err);
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
}
