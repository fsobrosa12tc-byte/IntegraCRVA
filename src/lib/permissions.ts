/**
 * ============================================================================
 * MARKS SYSTEMS • MATRIZ CENTRALIZADA DE HIERARQUIA E PERMISSÕES (RBAC)
 * ============================================================================
 * 
 * Regras estritas de governança:
 * - MASTER (Super Administrador): Poderes ilimitados em todo o ecossistema.
 *   Nunca bloqueie nenhuma ação para a role MASTER.
 * - GERENTE e FINANCEIRO: Autorizados a criar e editar contas operacionais
 *   (exceto alterar/excluir contas MASTER) e autorizados a criar e editar
 *   serviços no Catálogo CRVA / Notariais.
 * - OPERACIONAIS (ATENDENTE, OPERADOR_CAIXA, CAIXA, VISTORIADOR, SUPERVISAO):
 *   Podem visualizar e lançar serviços no Atendimento e no PDV, mas NÃO
 *   visualizam os botões de + Novo Serviço nem o ícone de lápis (editar serviço),
 *   e têm acesso bloqueado (403 Forbidden) em rotas de escrita (POST/PUT/DELETE).
 */

export type RoleName =
  | 'master'
  | 'gerente'
  | 'financeiro'
  | 'caixa'
  | 'operador_caixa'
  | 'atendente'
  | 'vistoriador'
  | 'supervisao';

export type PermissionAction =
  // Catálogo de Serviços
  | 'servicos:view'
  | 'servicos:listar'
  | 'servicos:create'
  | 'servicos:cadastrar'
  | 'servicos:edit'
  | 'servicos:editar'
  | 'servicos:delete'
  | 'servicos:excluir'
  | 'catalogo:gerenciar'
  // Gestão de Usuários e Acessos
  | 'usuarios:view'
  | 'usuarios:create'
  | 'usuarios:edit'
  | 'usuarios:delete'
  | 'usuarios:gerenciar'
  // Caixa e PDV
  | 'caixa:operar'
  | 'caixa:abrir'
  | 'caixa:fechar'
  | 'caixa:movimentar'
  | 'caixa:supervisionar'
  // Auditoria e Relatórios
  | 'auditoria:view'
  | 'relatorios:avancados'
  // Motor de Inteligência Artificial
  | 'ai:studio'
  | 'ai:manage';

/**
 * Normaliza qualquer formato de usuário ou role vindo do Supabase, JWT ou frontend
 */
export function normalizarRole(userOrRole: any): string {
  if (!userOrRole) return '';
  if (typeof userOrRole === 'string') {
    return userOrRole.toLowerCase().trim();
  }
  const r =
    userOrRole.role ||
    userOrRole.funcao ||
    userOrRole.user_metadata?.role ||
    userOrRole.app_metadata?.role ||
    '';
  return String(r).toLowerCase().trim();
}

/**
 * Helper Centralizado de Avaliação de Permissões RBAC
 * 
 * @param userOrRole Usuário completo, objeto de sessão ou string da role
 * @param action Ação que está sendo requisitada no frontend ou na API
 * @returns boolean
 */
export function hasPermission(userOrRole: any, action: PermissionAction | string): boolean {
  const role = normalizarRole(userOrRole);

  // 1. CONTA MASTER: PODERES ILIMITADOS
  // Nunca bloqueie nenhuma ação para a role MASTER em nenhum módulo ou rota.
  if (role === 'master' || role === 'super_admin' || role === 'admin_master') {
    return true;
  }

  // 2. CONTAS GERENTE E FINANCEIRO (GESTÃO CRVA)
  const isGestor = role === 'gerente' || role === 'financeiro';

  switch (action) {
    // -------------------------------------------------------------------------
    // CATÁLOGO DE SERVIÇOS CRVA / NOTARIAIS
    // -------------------------------------------------------------------------
    case 'servicos:view':
    case 'servicos:listar':
      // Todos os perfis podem visualizar o catálogo e lançar atendimentos/vendas
      return true;

    case 'servicos:create':
    case 'servicos:cadastrar':
    case 'servicos:edit':
    case 'servicos:editar':
    case 'servicos:delete':
    case 'servicos:excluir':
    case 'catalogo:gerenciar':
      // Apenas MASTER, GERENTE e FINANCEIRO podem criar ou editar serviços
      return isGestor;

    // -------------------------------------------------------------------------
    // GESTÃO DE USUÁRIOS
    // -------------------------------------------------------------------------
    case 'usuarios:view':
    case 'usuarios:create':
    case 'usuarios:edit':
    case 'usuarios:gerenciar':
      return isGestor;

    case 'usuarios:delete':
      // Exclusão de contas restrita a Master e Gerente
      return role === 'gerente';

    // -------------------------------------------------------------------------
    // CAIXA E OPERAÇÕES PDV
    // -------------------------------------------------------------------------
    case 'caixa:operar':
    case 'caixa:abrir':
    case 'caixa:fechar':
    case 'caixa:movimentar':
      // Operadores de caixa, caixas, atendentes e gestores
      return isGestor || ['caixa', 'operador_caixa', 'atendente'].includes(role);

    case 'caixa:supervisionar':
      return isGestor;

    // -------------------------------------------------------------------------
    // AUDITORIA E RELATÓRIOS
    // -------------------------------------------------------------------------
    case 'auditoria:view':
    case 'relatorios:avancados':
      return isGestor;

    // -------------------------------------------------------------------------
    // MOTOR DE IA
    // -------------------------------------------------------------------------
    case 'ai:studio':
    case 'ai:manage':
      return false; // Exclusivo de Master (já tratado no topo)

    default:
      // Ações de leitura operacional liberadas
      if (action.endsWith(':view') || action.endsWith(':listar')) {
        return true;
      }
      return false;
  }
}

/**
 * Atalho para verificar se o usuário pode gerenciar (criar/editar/inativar) o catálogo de serviços
 */
export function canManageCatalogo(userOrRole: any): boolean {
  return hasPermission(userOrRole, 'servicos:edit');
}

/**
 * Atalho para verificar se o usuário pode gerenciar contas de usuários
 */
export function canManageUsers(userOrRole: any): boolean {
  return hasPermission(userOrRole, 'usuarios:create');
}
