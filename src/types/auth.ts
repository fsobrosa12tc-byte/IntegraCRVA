export type UserRole = 'master' | 'gerente' | 'financeiro' | 'caixa' | 'atendente';

export interface UserAccount {
  id: string;
  nome_completo: string;
  cpf: string;
  telefone: string;
  email_contato: string;
  email_login: string;
  role: UserRole;
  ativo: boolean;
  criado_por_id?: string | null;
  criado_por_nome?: string | null;
  criado_em?: string;
  atualizado_por_id?: string | null;
  atualizado_por_nome?: string | null;
  atualizado_em?: string;

  // Campos de compatibilidade
  nome?: string;
  email?: string;
  senha?: string;
  criadoEm?: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  master: 'Master (Administrador)',
  gerente: 'Gerente Geral',
  financeiro: 'Gestor Financeiro',
  caixa: 'Operador de Caixa',
  atendente: 'Atendente de Balcão'
};

export const ROLE_BADGE_COLORS: Record<UserRole, { bg: string; text: string; border: string }> = {
  master: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  gerente: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
  financeiro: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' },
  caixa: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
  atendente: { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-200' }
};

/**
 * Verifica se a role tem permissão para acessar o painel de gestão de usuários
 */
export function canManageUsers(role: UserRole): boolean {
  return ['master', 'gerente', 'financeiro'].includes(role);
}

/**
 * Retorna quais perfis o usuário autenticado tem permissão de criar
 */
export function getAllowedCreationRoles(actorRole: UserRole): UserRole[] {
  switch (actorRole) {
    case 'master':
      return ['gerente', 'financeiro', 'caixa', 'atendente'];
    case 'gerente':
      return ['financeiro', 'caixa', 'atendente'];
    case 'financeiro':
      return ['caixa', 'atendente'];
    default:
      return [];
  }
}

/**
 * Verifica se o usuário autenticado pode editar o usuário alvo e redefinir sua senha
 * Regra: Conta Master nunca pode ter sua senha alterada por terceiros ou pelo painel
 */
export function canEditUser(actorRole: UserRole, targetUser: UserAccount): boolean {
  if (targetUser.role === 'master') {
    return false;
  }
  if (actorRole === 'master') {
    return true;
  }
  if (actorRole === 'gerente') {
    return ['financeiro', 'caixa', 'atendente'].includes(targetUser.role);
  }
  if (actorRole === 'financeiro') {
    return ['caixa', 'atendente'].includes(targetUser.role);
  }
  return false;
}

/**
 * Verifica se o usuário autenticado pode excluir o usuário alvo
 * Regra: Conta Master nunca pode ser excluída
 */
export function canDeleteUser(actorRole: UserRole, targetUser: UserAccount): boolean {
  if (targetUser.role === 'master') {
    return false;
  }
  if (actorRole === 'master') {
    return true;
  }
  if (actorRole === 'gerente') {
    return ['financeiro', 'caixa', 'atendente'].includes(targetUser.role);
  }
  if (actorRole === 'financeiro') {
    return ['caixa', 'atendente'].includes(targetUser.role);
  }
  return false;
}

/**
 * Verifica se o usuário autenticado pode alterar o status (Ativo/Inativo) do usuário alvo.
 * Regra: Conta Master nunca pode ser inativada ou desativada.
 */
export function canToggleStatusUser(actorRole: UserRole, targetUser: UserAccount): boolean {
  if (targetUser.role === 'master') {
    return false;
  }
  if (actorRole === 'master') {
    return true;
  }
  if (actorRole === 'gerente') {
    return ['financeiro', 'caixa', 'atendente'].includes(targetUser.role);
  }
  if (actorRole === 'financeiro') {
    return ['caixa', 'atendente'].includes(targetUser.role);
  }
  return false;
}

/**
 * Validação de acesso ao módulo solicitado
 */
export function hasModuleAccess(role: UserRole, modulo: 'CRVA' | 'PDV'): { permitido: boolean; motivo?: string } {
  // Master, Gerente e Financeiro têm acesso total e irrestrito a ambos os módulos
  if (['master', 'gerente', 'financeiro'].includes(role)) {
    return { permitido: true };
  }

  if (modulo === 'CRVA') {
    if (role === 'atendente') {
      return { permitido: true };
    }
    if (role === 'caixa') {
      return { 
        permitido: false, 
        motivo: "Acesso Negado: O perfil 'Caixa' possui permissão de acesso apenas ao Módulo PDV." 
      };
    }
  }

  if (modulo === 'PDV') {
    if (role === 'caixa') {
      return { permitido: true };
    }
    if (role === 'atendente') {
      return { 
        permitido: false, 
        motivo: "Acesso Negado: O perfil 'Atendente' possui permissão de acesso apenas ao Módulo Balcão CRVA." 
      };
    }
  }

  return { permitido: false, motivo: 'Perfil sem permissão para acessar este módulo.' };
}

/**
 * Verifica se o usuário tem permissão para transitar livremente entre módulos
 */
export function canSwitchModules(role: UserRole): boolean {
  return ['master', 'gerente', 'financeiro'].includes(role);
}
