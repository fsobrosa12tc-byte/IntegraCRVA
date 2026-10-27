import { 
  UserAccount, 
  UserRole, 
  canDeleteUser, 
  canEditUser, 
  canToggleStatusUser, 
  getAllowedCreationRoles 
} from '../types/auth';
import { supabase } from './supabase';

const STORAGE_KEY = 'integra_usuarios_db';

export const USUARIOS_INICIAIS: UserAccount[] = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    nome_completo: 'Antonio Sobrosa',
    cpf: '000.000.000-00',
    telefone: '(54) 99999-0001',
    email_contato: 'fsobrosa.12tc@gmail.com',
    email_login: 'fsobrosa.12tc@gmail.com',
    senha: 'Antonio2@26',
    role: 'master',
    ativo: true,
    criado_por_id: null,
    criado_por_nome: 'Sistema / Root',
    criado_em: '2025-01-01T00:00:00.000Z',
    nome: 'Antonio Sobrosa',
    email: 'fsobrosa.12tc@gmail.com',
    criadoEm: '2025-01-01T00:00:00.000Z'
  },
  {
    id: 'b0000000-0000-0000-0000-000000000002',
    nome_completo: 'Carlos Gerente Geral',
    cpf: '111.222.333-44',
    telefone: '(54) 99999-0002',
    email_contato: 'carlos.gerente@gmail.com',
    email_login: 'carlos.gerente@marks.com',
    senha: 'Gerente@123',
    role: 'gerente',
    ativo: true,
    criado_por_id: 'a0000000-0000-0000-0000-000000000001',
    criado_por_nome: 'Antonio Sobrosa',
    criado_em: '2025-01-10T00:00:00.000Z',
    nome: 'Carlos Gerente Geral',
    email: 'carlos.gerente@marks.com',
    criadoEm: '2025-01-10T00:00:00.000Z'
  },
  {
    id: 'c0000000-0000-0000-0000-000000000003',
    nome_completo: 'Mariana Gestão Financeira',
    cpf: '222.333.444-55',
    telefone: '(54) 99999-0003',
    email_contato: 'mariana.fin@gmail.com',
    email_login: 'mariana.financeiro@marks.com',
    senha: 'Financeiro@123',
    role: 'financeiro',
    ativo: true,
    criado_por_id: 'a0000000-0000-0000-0000-000000000001',
    criado_por_nome: 'Antonio Sobrosa',
    criado_em: '2025-02-01T00:00:00.000Z',
    nome: 'Mariana Gestão Financeira',
    email: 'mariana.financeiro@marks.com',
    criadoEm: '2025-02-01T00:00:00.000Z'
  },
  {
    id: 'd0000000-0000-0000-0000-000000000004',
    nome_completo: 'Lucas Operador de Caixa',
    cpf: '333.444.555-66',
    telefone: '(54) 99999-0004',
    email_contato: 'lucas.caixa@gmail.com',
    email_login: 'lucas.caixa@marks.com',
    senha: 'Caixa@123',
    role: 'caixa',
    ativo: true,
    criado_por_id: 'c0000000-0000-0000-0000-000000000003',
    criado_por_nome: 'Mariana Gestão Financeira',
    criado_em: '2025-02-10T00:00:00.000Z',
    nome: 'Lucas Operador de Caixa',
    email: 'lucas.caixa@marks.com',
    criadoEm: '2025-02-10T00:00:00.000Z'
  },
  {
    id: 'e0000000-0000-0000-0000-000000000005',
    nome_completo: 'Patrícia Atendente Balcão',
    cpf: '444.555.666-77',
    telefone: '(54) 99999-0005',
    email_contato: 'patricia.atendente@marks.com',
    email_login: 'patricia.atendente@marks.com',
    senha: 'Atendente@123',
    role: 'atendente',
    ativo: true,
    criado_por_id: 'b0000000-0000-0000-0000-000000000002',
    criado_por_nome: 'Carlos Gerente Geral',
    criado_em: '2025-02-15T00:00:00.000Z',
    nome: 'Patrícia Atendente Balcão',
    email: 'patricia.atendente@marks.com',
    criadoEm: '2025-02-15T00:00:00.000Z'
  }
];

export function carregarUsuarios(): UserAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      salvarUsuarios(USUARIOS_INICIAIS);
      return USUARIOS_INICIAIS;
    }
    const parsed: UserAccount[] = JSON.parse(raw);
    
    // Assegura compatibilidade de propriedades
    const normalizados: UserAccount[] = parsed.map(u => ({
      ...u,
      nome_completo: u.nome_completo || u.nome || 'Colaborador',
      nome: u.nome_completo || u.nome || 'Colaborador',
      email_login: u.email_login || u.email || '',
      email: u.email_login || u.email || '',
      email_contato: u.email_contato || u.email || '',
      cpf: u.cpf || '000.000.000-00',
      telefone: u.telefone || '(54) 99999-0000',
      criado_em: u.criado_em || u.criadoEm || new Date().toISOString(),
      criadoEm: u.criado_em || u.criadoEm || new Date().toISOString()
    }));

    // Assegura que o Master original oficial esteja sempre presente
    const temMaster = normalizados.some(u => 
      u.email_login === 'fsobrosa.12tc@gmail.com' || u.email === 'fsobrosa.12tc@gmail.com'
    );
    if (!temMaster) {
      normalizados.unshift(USUARIOS_INICIAIS[0]);
      salvarUsuarios(normalizados);
    }
    return normalizados;
  } catch (err) {
    console.error('Erro ao ler usuários do storage:', err);
    return USUARIOS_INICIAIS;
  }
}

export function salvarUsuarios(usuarios: UserAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usuarios));
  } catch (err) {
    console.error('Erro ao salvar usuários no storage:', err);
  }
}

export function autenticarUsuario(email: string, senha: string): UserAccount | null {
  const emailLimpo = email.trim().toLowerCase();
  const senhaLimpa = senha.trim();
  const usuarios = carregarUsuarios();

  const usuario = usuarios.find(u => {
    const loginMatches = (u.email_login && u.email_login.toLowerCase() === emailLimpo) ||
                         (u.email && u.email.toLowerCase() === emailLimpo) ||
                         (u.email_contato && u.email_contato.toLowerCase() === emailLimpo);
    const senhaMatches = u.senha === senhaLimpa;
    return loginMatches && senhaMatches;
  });

  return usuario || null;
}

export interface NovoUsuarioInput {
  nome_completo: string;
  cpf: string;
  telefone: string;
  email_contato: string;
  email_login: string;
  role: UserRole;
  senha: string;
  criado_por_id: string;
  criado_por_nome: string;
}

export function criarUsuario(
  atorRole: UserRole,
  dados: NovoUsuarioInput
): { sucesso: boolean; usuario?: UserAccount; erro?: string } {
  const allowedRoles = getAllowedCreationRoles(atorRole);
  if (!allowedRoles.includes(dados.role)) {
    return {
      sucesso: false,
      erro: `Seu perfil (${atorRole}) não tem permissão para cadastrar um usuário com perfil '${dados.role}'.`
    };
  }

  const usuarios = carregarUsuarios();

  // Validação de unicidade de CPF
  const cpfLimpo = dados.cpf.replace(/\D/g, '');
  const cpfExistente = usuarios.some(u => (u.cpf || '').replace(/\D/g, '') === cpfLimpo);
  if (cpfExistente) {
    return { sucesso: false, erro: 'Já existe um colaborador cadastrado com este CPF.' };
  }

  // Validação de unicidade de email_login institucional
  const loginLimpo = dados.email_login.trim().toLowerCase();
  const loginExistente = usuarios.some(u => 
    (u.email_login && u.email_login.toLowerCase() === loginLimpo) ||
    (u.email && u.email.toLowerCase() === loginLimpo)
  );
  if (loginExistente) {
    return { sucesso: false, erro: 'Já existe um usuário com este login institucional.' };
  }

  const timestamp = new Date().toISOString();
  const novoUsuario: UserAccount = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    nome_completo: dados.nome_completo.trim(),
    nome: dados.nome_completo.trim(),
    cpf: dados.cpf.trim(),
    telefone: dados.telefone.trim(),
    email_contato: dados.email_contato.trim().toLowerCase(),
    email_login: loginLimpo,
    email: loginLimpo,
    senha: dados.senha.trim(),
    role: dados.role,
    ativo: true,
    criado_por_id: dados.criado_por_id,
    criado_por_nome: dados.criado_por_nome,
    criado_em: timestamp,
    criadoEm: timestamp
  };

  usuarios.push(novoUsuario);
  salvarUsuarios(usuarios);
  return { sucesso: true, usuario: novoUsuario };
}

export function atualizarUsuario(
  atorRole: UserRole,
  id: string,
  dados: { 
    nome_completo?: string; 
    email_contato?: string;
    telefone?: string;
    senha?: string; 
    role: UserRole;
    ativo?: boolean;
  }
): { sucesso: boolean; usuario?: UserAccount; erro?: string } {
  const usuarios = carregarUsuarios();
  const index = usuarios.findIndex(u => u.id === id);
  if (index === -1) {
    return { sucesso: false, erro: 'Usuário não encontrado.' };
  }

  const alvo = usuarios[index];
  if (!canEditUser(atorRole, alvo)) {
    return {
      sucesso: false,
      erro: `Seu perfil (${atorRole}) não tem permissão para editar este usuário (${alvo.role}).`
    };
  }

  // Verifica se a alteração de perfil é permitida
  if (alvo.role !== dados.role) {
    const allowedRoles = getAllowedCreationRoles(atorRole);
    if (!allowedRoles.includes(dados.role) && atorRole !== 'master') {
      return {
        sucesso: false,
        erro: `Não é permitido alterar o perfil para '${dados.role}'.`
      };
    }
  }

  const nomeFinal = dados.nome_completo ? dados.nome_completo.trim() : alvo.nome_completo || alvo.nome || '';
  usuarios[index] = {
    ...alvo,
    nome_completo: nomeFinal,
    nome: nomeFinal,
    telefone: dados.telefone ? dados.telefone.trim() : alvo.telefone,
    email_contato: dados.email_contato ? dados.email_contato.trim().toLowerCase() : alvo.email_contato,
    role: dados.role,
    senha: dados.senha && dados.senha.trim() ? dados.senha.trim() : alvo.senha,
    ativo: dados.ativo !== undefined ? dados.ativo : alvo.ativo
  };

  salvarUsuarios(usuarios);
  return { sucesso: true, usuario: usuarios[index] };
}

export function redefinirSenhaUsuario(
  atorRole: UserRole,
  id: string,
  novaSenha: string,
  supervisorId: string,
  supervisorNome: string
): { sucesso: boolean; usuario?: UserAccount; erro?: string } {
  const usuarios = carregarUsuarios();
  const index = usuarios.findIndex(u => u.id === id);
  if (index === -1) {
    return { sucesso: false, erro: 'Usuário não encontrado.' };
  }

  const alvo = usuarios[index];
  if (!canEditUser(atorRole, alvo)) {
    if (alvo.role === 'master') {
      return { sucesso: false, erro: 'A conta Master não pode ter sua senha redefinida por este painel.' };
    }
    return {
      sucesso: false,
      erro: `Seu perfil (${atorRole}) não possui permissão para redefinir a senha deste colaborador (${alvo.role}).`
    };
  }

  const senhaLimpa = (novaSenha || '').trim();
  if (senhaLimpa.length < 8) {
    return { sucesso: false, erro: 'A nova senha deve ter no mínimo 8 caracteres.' };
  }

  const timestamp = new Date().toISOString();
  usuarios[index] = {
    ...alvo,
    senha: senhaLimpa,
    atualizado_por_id: supervisorId,
    atualizado_por_nome: supervisorNome,
    atualizado_em: timestamp
  };

  salvarUsuarios(usuarios);
  return { sucesso: true, usuario: usuarios[index] };
}

export function alternarStatusUsuario(
  atorRole: UserRole,
  id: string
): { sucesso: boolean; usuario?: UserAccount; erro?: string } {
  const usuarios = carregarUsuarios();
  const index = usuarios.findIndex(u => u.id === id);
  if (index === -1) {
    return { sucesso: false, erro: 'Usuário não encontrado.' };
  }

  const alvo = usuarios[index];
  if (!canToggleStatusUser(atorRole, alvo)) {
    if (alvo.role === 'master') {
      return { sucesso: false, erro: 'A conta Master não pode ser desativada.' };
    }
    return {
      sucesso: false,
      erro: `Seu perfil (${atorRole}) não possui permissão para alterar o status deste usuário (${alvo.role}).`
    };
  }

  const novoStatus = !alvo.ativo;
  usuarios[index] = {
    ...alvo,
    ativo: novoStatus
  };

  salvarUsuarios(usuarios);
  return { sucesso: true, usuario: usuarios[index] };
}

export function excluirUsuario(
  atorRole: UserRole,
  id: string
): { sucesso: boolean; erro?: string } {
  const usuarios = carregarUsuarios();
  const alvo = usuarios.find(u => u.id === id);
  if (!alvo) {
    return { sucesso: false, erro: 'Usuário não encontrado.' };
  }

  if (!canDeleteUser(atorRole, alvo)) {
    if (alvo.role === 'master') {
      return { sucesso: false, erro: 'A conta Master é protegida pelo sistema e não pode ser excluída.' };
    }
    return {
      sucesso: false,
      erro: `Seu perfil (${atorRole}) não possui permissão para excluir este usuário (${alvo.role}).`
    };
  }

  const filtrados = usuarios.filter(u => u.id !== id);
  salvarUsuarios(filtrados);
  return { sucesso: true };
}

// =====================================================================
// INTEGRAÇÃO ASSÍNCRONA COM SUPABASE COM AUDITORIA DETALHADA E RESILIÊNCIA
// =====================================================================

export async function buscarUsuariosSupabase(): Promise<UserAccount[]> {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('perfis')
        .select('*')
        .order('criado_em', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapeados: UserAccount[] = data.map((item: any) => ({
          id: item.id || `usr_${item.email_login || item.email}`,
          nome_completo: item.nome_completo || item.nome || 'Colaborador',
          nome: item.nome_completo || item.nome || 'Colaborador',
          cpf: item.cpf || '000.000.000-00',
          telefone: item.telefone || '(54) 99999-0000',
          email_contato: item.email_contato || item.email || '',
          email_login: item.email_login || item.email || '',
          email: item.email_login || item.email || '',
          senha: item.senha || '',
          role: item.role as UserRole,
          ativo: item.ativo !== false,
          criado_por_id: item.criado_por_id || null,
          criado_por_nome: item.criado_por_nome || null,
          criado_em: item.criado_em || new Date().toISOString(),
          criadoEm: item.criado_em || new Date().toISOString()
        }));

        // Preserva o master oficial
        const temMaster = mapeados.some(u => 
          u.email_login === 'fsobrosa.12tc@gmail.com' || u.email === 'fsobrosa.12tc@gmail.com'
        );
        if (!temMaster) {
          mapeados.unshift(USUARIOS_INICIAIS[0]);
        }
        salvarUsuarios(mapeados);
        return mapeados;
      }
    }
  } catch (err) {
    console.warn('Supabase não disponível no momento. Utilizando storage local:', err);
  }
  return carregarUsuarios();
}

export async function autenticarSupervisorSupabase(
  email: string, 
  senha: string
): Promise<UserAccount | null> {
  const emailLimpo = email.trim().toLowerCase();
  const senhaLimpa = senha.trim();

  // 1. Tenta autenticação direta no Supabase Auth
  try {
    if (supabase && supabase.auth) {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailLimpo,
        password: senhaLimpa
      });

      if (!authError && authData.user) {
        let perfilData: any = null;
        try {
          const { data: pId } = await supabase
            .from('perfis')
            .select('*')
            .eq('id', authData.user.id)
            .maybeSingle();
          perfilData = pId;

          if (!perfilData) {
            const { data: pEmail } = await supabase
              .from('perfis')
              .select('*')
              .ilike('email_login', emailLimpo)
              .maybeSingle();
            perfilData = pEmail;
          }
        } catch (errP) {
          console.warn('[autenticarSupervisorSupabase] Falha ao consultar perfis:', errP);
        }

        const role = (perfilData?.role || authData.user.user_metadata?.role || 'atendente') as UserRole;
        const nomeCompleto = perfilData?.nome_completo || authData.user.user_metadata?.nome_completo || authData.user.user_metadata?.full_name || emailLimpo.split('@')[0];

        const userAccount: UserAccount = {
          id: authData.user.id,
          nome_completo: nomeCompleto,
          nome: nomeCompleto,
          cpf: perfilData?.cpf || '000.000.000-00',
          telefone: perfilData?.telefone || '(54) 99999-0000',
          email_contato: perfilData?.email_contato || emailLimpo,
          email_login: emailLimpo,
          email: emailLimpo,
          senha: senhaLimpa,
          role,
          ativo: perfilData?.ativo !== false,
          criado_por_id: perfilData?.criado_por_id || null,
          criado_por_nome: perfilData?.criado_por_nome || null,
          criado_em: authData.user.created_at,
          criadoEm: authData.user.created_at
        };

        return userAccount;
      }
    }
  } catch (e) {
    console.warn('Tentativa de autenticação Supabase falhou, consultando base local:', e);
  }

  // 2. Fallback resiliente no banco local
  return autenticarUsuario(emailLimpo, senhaLimpa);
}

export async function cadastrarUsuarioSupabase(
  atorRole: UserRole,
  dados: NovoUsuarioInput
): Promise<{ sucesso: boolean; usuario?: UserAccount; erro?: string }> {
  // Salva no banco de contingência local primeiro
  const localRes = criarUsuario(atorRole, dados);
  if (!localRes.sucesso || !localRes.usuario) {
    return localRes;
  }

  const emailLimpo = dados.email_login.toLowerCase().trim();

  // 1. Tenta provisionamento via endpoint administrativo Supabase (auth.admin.createUser com email_confirm: true)
  try {
    const apiBase = (import.meta as any).env?.VITE_API_URL || '';
    const resp = await fetch(`${apiBase}/api/admin/criar_usuario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: dados.nome_completo,
        cpf: dados.cpf,
        telefone: dados.telefone,
        emailPessoal: dados.email_contato,
        emailInstitucional: emailLimpo,
        funcao: dados.role,
        senhaGerada: dados.senha,
        criadoPorId: dados.criado_por_id,
        criadoPorNome: dados.criado_por_nome
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.sucesso && data.userId) {
        // Sincroniza o UUID local para coincidir com o UUID do auth.users
        localRes.usuario.id = data.userId;
        const usuarios = carregarUsuarios();
        const idx = usuarios.findIndex(u => u.email_login?.toLowerCase() === emailLimpo);
        if (idx !== -1) {
          usuarios[idx].id = data.userId;
          salvarUsuarios(usuarios);
        }
        return localRes;
      }
    }
  } catch (apiErr) {
    console.warn('[authStorage] Endpoint /api/admin/criar_usuario indisponível, tentando RPC direta:', apiErr);
  }

  // 2. Fallback via RPC PostgreSQL no Supabase (fn_provisionar_usuario_marks com auto-confirmação)
  try {
    if (supabase) {
      const { data: rpcId, error: rpcError } = await supabase.rpc('fn_provisionar_usuario_marks', {
        p_email: emailLimpo,
        p_senha: dados.senha,
        p_nome: dados.nome_completo,
        p_cpf: dados.cpf,
        p_telefone: dados.telefone,
        p_email_contato: dados.email_contato,
        p_role: dados.role,
        p_criado_por_id: dados.criado_por_id || null,
        p_criado_por_nome: dados.criado_por_nome || null
      });

      if (!rpcError && rpcId) {
        localRes.usuario.id = rpcId;
        const usuarios = carregarUsuarios();
        const idx = usuarios.findIndex(u => u.email_login?.toLowerCase() === emailLimpo);
        if (idx !== -1) {
          usuarios[idx].id = rpcId;
          salvarUsuarios(usuarios);
        }
        return localRes;
      }
    }
  } catch (rpcErr) {
    console.warn('[authStorage] RPC fn_provisionar_usuario_marks falhou:', rpcErr);
  }

  // 3. Fallback clássico via Supabase client
  try {
    if (supabase && supabase.auth) {
      const { data: authData } = await supabase.auth.signUp({
        email: emailLimpo,
        password: dados.senha,
        options: {
          data: {
            nome_completo: dados.nome_completo,
            role: dados.role,
            cpf: dados.cpf,
            telefone: dados.telefone,
            email_contato: dados.email_contato
          }
        }
      });

      const userId = authData.user?.id || localRes.usuario.id;
      localRes.usuario.id = userId;

      await supabase.from('perfis').upsert({
        id: userId,
        nome_completo: dados.nome_completo,
        cpf: dados.cpf,
        telefone: dados.telefone,
        email_contato: dados.email_contato,
        email_login: emailLimpo,
        role: dados.role,
        ativo: true,
        criado_por_id: dados.criado_por_id,
        criado_por_nome: dados.criado_por_nome,
        criado_em: new Date().toISOString()
      }, { onConflict: 'email_login' });
    }
  } catch (e) {
    console.warn('Sincronização com Supabase (mantido no banco local de contingência):', e);
  }

  return localRes;
}

/**
 * Dispara a rotina de autocorreção e sincronização de contas existentes.
 */
export async function sincronizarUsuariosExistentesSupabase(): Promise<void> {
  try {
    const apiBase = (import.meta as any).env?.VITE_API_URL || '';
    await fetch(`${apiBase}/api/admin/sincronizar_usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.warn('Rotina de sincronização administrativa não acionada via API:', e);
  }
}


export async function alternarStatusUsuarioSupabase(
  atorRole: UserRole,
  id: string
): Promise<{ sucesso: boolean; usuario?: UserAccount; erro?: string }> {
  const localRes = alternarStatusUsuario(atorRole, id);
  if (!localRes.sucesso || !localRes.usuario) {
    return localRes;
  }

  try {
    if (supabase) {
      await supabase
        .from('perfis')
        .update({ ativo: localRes.usuario.ativo })
        .eq('id', id);
    }
  } catch (e) {
    console.warn('Sincronização Supabase de status falhou (mantido localmente):', e);
  }

  return localRes;
}

export async function excluirUsuarioSupabase(
  atorRole: UserRole,
  id: string
): Promise<{ sucesso: boolean; erro?: string }> {
  const localRes = excluirUsuario(atorRole, id);
  if (!localRes.sucesso) {
    return localRes;
  }

  try {
    if (supabase) {
      await supabase
        .from('perfis')
        .delete()
        .eq('id', id);
    }
  } catch (e) {
    console.warn('Sincronização Supabase de exclusão falhou (mantido localmente):', e);
  }

  return localRes;
}

export async function redefinirSenhaUsuarioSupabase(
  atorRole: UserRole,
  id: string,
  novaSenha: string,
  supervisorId: string,
  supervisorNome: string
): Promise<{ sucesso: boolean; usuario?: UserAccount; erro?: string }> {
  // 1. Atualiza e valida regras de hierarquia e auditoria no storage local
  const localRes = redefinirSenhaUsuario(atorRole, id, novaSenha, supervisorId, supervisorNome);
  if (!localRes.sucesso || !localRes.usuario) {
    return localRes;
  }

  const timestamp = new Date().toISOString();

  // 2. Sincroniza auditoria na tabela 'perfis' do Supabase
  try {
    if (supabase) {
      await supabase
        .from('perfis')
        .update({
          atualizado_por_id: supervisorId,
          atualizado_por_nome: supervisorNome,
          atualizado_em: timestamp
        })
        .eq('id', id);

      // 3. Tenta sincronização direta com Supabase Auth Admin via API backend ou cliente
      try {
        await fetch('/api/admin/redefinir_senha', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: id,
            novaSenha: novaSenha.trim(),
            supervisorId,
            supervisorNome
          })
        }).catch(() => null);
      } catch (authErr) {
        console.warn('Endpoint de redefinição de auth admin não disponível (mantido no banco de dados):', authErr);
      }
    }
  } catch (e) {
    console.warn('Sincronização Supabase de redefinição de senha falhou (mantido localmente):', e);
  }

  return localRes;
}
