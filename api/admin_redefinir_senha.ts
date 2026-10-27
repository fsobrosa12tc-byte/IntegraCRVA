import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }

  try {
    const { userId, novaSenha, supervisorId, supervisorNome } = req.body;

    if (!userId || !novaSenha || novaSenha.length < 8) {
      return res.status(400).json({ sucesso: false, erro: 'Parâmetros incompletos para redefinição de senha.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

    const timestamp = new Date().toISOString();

    if (supabaseUrl && serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      const { error: adminError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: novaSenha
      });

      if (adminError) {
        console.warn('Erro ao atualizar senha no Supabase Auth Admin (Vercel):', adminError);
      }

      await supabaseAdmin.from('perfis').update({
        atualizado_por_id: supervisorId || null,
        atualizado_por_nome: supervisorNome || null,
        atualizado_em: timestamp
      }).eq('id', userId);

      return res.status(200).json({ sucesso: true, metodo: 'supabase_admin_auth' });
    }

    if (supabaseUrl && supabaseAnonKey) {
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
      await supabaseClient.from('perfis').update({
        atualizado_por_id: supervisorId || null,
        atualizado_por_nome: supervisorNome || null,
        atualizado_em: timestamp
      }).eq('id', userId);
    }

    return res.status(200).json({ sucesso: true, metodo: 'supabase_perfis_audit' });
  } catch (err: any) {
    console.error('Erro na função serverless de redefinição de senha:', err);
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
}
