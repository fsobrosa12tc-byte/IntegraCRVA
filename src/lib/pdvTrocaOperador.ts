import { supabase } from './supabase';
import { autenticarSupervisorSupabase, carregarUsuarios } from './authStorage';
import { calcularSaldoEsperado, listarMovimentacoes } from './pdvCaixa';
import { hasModuleAccess, ROLE_LABELS, type UserRole } from '../types/auth';
import type { CaixaDiario, LogTrocaOperador } from '../types/pdv';

export interface OperadorSessao {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  funcao: string;
}

export interface OpcaoOperador {
  login: string;
  nome: string;
  role: UserRole;
}

const UUID_FROUXO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Operadores ativos com acesso ao PDV (lista para seleção do nome na troca rápida). */
export function listarOperadoresPDV(): OpcaoOperador[] {
  return carregarUsuarios()
    .filter((u) => u.ativo && hasModuleAccess(u.role, 'PDV').permitido)
    .map((u) => ({
      login: u.email_login || u.email || '',
      nome: u.nome_completo || u.nome || u.email_login,
      role: u.role,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function restaurarSessao(
  anterior: { access_token: string; refresh_token: string } | null
): Promise<void> {
  if (!anterior) return;
  try {
    await supabase.auth.setSession({
      access_token: anterior.access_token,
      refresh_token: anterior.refresh_token,
    });
  } catch (e) {
    console.warn('Não foi possível restaurar a sessão anterior:', e);
  }
}

/** Resolve o UUID oficial (auth.users / perfis) do operador que assume. */
async function resolverUuidOperador(login: string, idCandidato: string): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id && data.user.email?.toLowerCase() === login.toLowerCase()) return data.user.id;
  } catch {
    // segue para o fallback
  }
  try {
    const { data: perfil } = await supabase
      .from('perfis')
      .select('id')
      .eq('email_login', login)
      .maybeSingle();
    if (perfil?.id) return perfil.id as string;
  } catch {
    // segue
  }
  if (UUID_FROUXO.test(idCandidato)) return idCandidato;
  throw new Error(
    'Este colaborador não possui registro oficial (auth.users/perfis) no Supabase e não pode assumir o terminal.'
  );
}

/**
 * Valida as credenciais do novo operador (Supabase Auth, com fallback à base de perfis local).
 * Em caso de falha, a sessão do operador anterior é restaurada.
 */
export async function autenticarNovoOperador(
  login: string,
  senha: string
): Promise<{ operador: OperadorSessao; sessaoAnterior: { access_token: string; refresh_token: string } | null }> {
  const loginLimpo = login.trim();
  if (!loginLimpo || !senha.trim()) throw new Error('Informe o login institucional e a senha/PIN.');

  let sessaoAnterior: { access_token: string; refresh_token: string } | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      sessaoAnterior = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };
    }
  } catch {
    sessaoAnterior = null;
  }

  const conta = await autenticarSupervisorSupabase(loginLimpo, senha);
  try {
    if (!conta) throw new Error('Login ou senha/PIN inválidos.');
    if (!conta.ativo) throw new Error('Colaborador inativo. Procure a gestão.');
    const acesso = hasModuleAccess(conta.role, 'PDV');
    if (!acesso.permitido) throw new Error(acesso.motivo || 'Perfil sem acesso ao módulo PDV.');

    const id = await resolverUuidOperador(conta.email_login || loginLimpo, conta.id);
    return {
      operador: {
        id,
        nome: conta.nome_completo || conta.nome || loginLimpo,
        email: conta.email_login || loginLimpo,
        role: conta.role,
        funcao: ROLE_LABELS[conta.role],
      },
      sessaoAnterior,
    };
  } catch (e) {
    await restaurarSessao(sessaoAnterior);
    throw e;
  }
}

/**
 * Transfere a titularidade do caixa aberto (sem fechar). Tenta a RPC atômica
 * fn_trocar_operador; se o patch SQL ainda não foi aplicado, usa gravação direta.
 */
export async function executarTrocaOperador(params: {
  caixa: CaixaDiario;
  anterior: { id: string; nome: string };
  novo: OperadorSessao;
  motivo?: string;
  sessaoAnterior: { access_token: string; refresh_token: string } | null;
}): Promise<LogTrocaOperador> {
  const { caixa, anterior, novo, sessaoAnterior } = params;
  const motivo = params.motivo?.trim() || 'Troca rápida de turno / Emergência';

  try {
    if (anterior.id === novo.id) throw new Error('O operador informado já é o titular do terminal.');

    const rpc = await supabase.rpc('fn_trocar_operador', {
      p_caixa_id: caixa.id,
      p_novo_operador_id: novo.id,
      p_novo_operador_nome: novo.nome,
      p_motivo: motivo,
    });
    if (!rpc.error && rpc.data) return rpc.data as LogTrocaOperador;

    const semFuncao = rpc.error && /Could not find the function|PGRST202|42883/i.test(`${rpc.error.code} ${rpc.error.message}`);
    if (!semFuncao) throw new Error(rpc.error?.message || 'Falha ao transferir o terminal.');

    // Fallback: gravação direta (saldo calculado no cliente, em centavos)
    const movs = await listarMovimentacoes(caixa.id);
    const saldo = calcularSaldoEsperado(caixa, movs);
    const { data: log, error: errLog } = await supabase
      .from('logs_troca_operador')
      .insert({
        caixa_id: caixa.id,
        operador_anterior_id: anterior.id,
        operador_anterior_nome: anterior.nome,
        operador_novo_id: novo.id,
        operador_novo_nome: novo.nome,
        saldo_gaveta_momento: saldo,
        motivo_troca: motivo,
      })
      .select('*')
      .single();
    if (errLog) throw new Error(`Falha ao auditar a troca: ${errLog.message}`);

    const { error: errCx } = await supabase
      .from('caixas_diarios')
      .update({ operador_id: novo.id })
      .eq('id', caixa.id)
      .eq('status', 'aberto');
    if (errCx) throw new Error(`Falha ao transferir o caixa: ${errCx.message}`);
    return log as LogTrocaOperador;
  } catch (e) {
    await restaurarSessao(sessaoAnterior);
    throw e;
  }
}
