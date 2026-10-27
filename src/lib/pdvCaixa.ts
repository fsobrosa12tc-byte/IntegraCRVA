import { supabase } from './supabase';
import type {
  CaixaDiario,
  FormaPagamento,
  MovimentacaoCaixa,
  StatusConferencia,
  TipoMovimentacao,
} from '../types/pdv';

/* ------------------------- Utilitários monetários ------------------------- */

/** Converte reais para centavos inteiros (evita erros de ponto flutuante). */
export const paraCentavos = (v: number | string | null | undefined): number =>
  Math.round(Number(v ?? 0) * 100);

export const deCentavos = (c: number): number => c / 100;

export const formatarBRL = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Máscara monetária: mantém apenas dígitos e interpreta como centavos. */
export const mascararMoeda = (raw: string): string => {
  const digitos = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!digitos) return '';
  return formatarBRL(Number(digitos) / 100);
};

/** "R$ 1.234,56" -> 1234.56 */
export const desmascararMoeda = (mascarado: string): number => {
  const digitos = mascarado.replace(/\D/g, '');
  return digitos ? Number(digitos) / 100 : 0;
};

/* ----------------------------- ISSQN (2,00%) ------------------------------ */

/** Alíquota fixa do ISSQN municipal (2,00%). */
export const ALIQUOTA_ISSQN_PERCENTUAL = 2.0;

/**
 * Cálculo do ISSQN (2,00%):
 * Math.round((subtotalServicos * 0.02) * 100) / 100
 */
export const calcularISSQN = (subtotalServicos: number): number => {
  const subtotal = Number(subtotalServicos || 0);
  return Math.round((subtotal * 0.02) * 100) / 100;
};

/**
 * Total Final Obrigatório (COM O ISSQN SOMADO):
 * 1. subtotalServicos = soma dos itens
 * 2. valorIssqn = Math.round((subtotalServicos * 0.02) * 100) / 100
 * 3. valorTotalCobrado = Math.round((subtotalServicos + valorIssqn) * 100) / 100
 */
export const calcularTotalComIssqn = (subtotalServicos: number): {
  subtotalServicos: number;
  valorIssqn: number;
  valorTotalCobrado: number;
} => {
  const subtotal = Math.round(Number(subtotalServicos || 0) * 100) / 100;
  const valorIssqn = calcularISSQN(subtotal);
  const valorTotalCobrado = Math.round((subtotal + valorIssqn) * 100) / 100;
  return {
    subtotalServicos: subtotal,
    valorIssqn,
    valorTotalCobrado
  };
};

/* ------------------------------- Sessão ---------------------------------- */

/** ID do operador conforme auth.users (exigido pela FK e pelas políticas RLS) com fallback resiliente. */
export async function obterOperadorId(usuarioLocal?: any): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id) return data.user.id;
  } catch (err) {
    console.warn('Erro ao obter usuário do Supabase Auth:', err);
  }

  // Fallback 1: ID fornecido pelo prop ou storage
  if (usuarioLocal?.id) {
    // Se for UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(usuarioLocal.id)) {
      return usuarioLocal.id;
    }
  }

  // Fallback 2: Buscar UUID oficial em public.perfis pelo email
  const email = usuarioLocal?.email || usuarioLocal?.email_login;
  if (email) {
    try {
      const { data: perfil } = await supabase
        .from('perfis')
        .select('id')
        .eq('email_login', email)
        .maybeSingle();

      if (perfil?.id) return perfil.id;
    } catch {
      // continua
    }
  }

  // Fallback 3: Master Oficial (Antonio Sobrosa)
  if (email === 'fsobrosa.12tc@gmail.com' || usuarioLocal?.role === 'master') {
    return 'a0000000-0000-0000-0000-000000000001';
  }

  return null;
}

/* -------------------------------- Caixa ---------------------------------- */

export async function buscarCaixaAberto(operadorId: string): Promise<CaixaDiario | null> {
  const { data, error } = await supabase
    .from('caixas_diarios')
    .select('*')
    .eq('operador_id', operadorId)
    .eq('status', 'aberto')
    .order('data_abertura', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CaixaDiario) ?? null;
}

/** Inserção em caixas_diarios com data e tratamento rigoroso de sessão JWT para RLS. */
export async function abrirCaixa(operadorId: string, valorAbertura: number): Promise<CaixaDiario> {
  // Garante que o operador_id corresponda rigorosamente ao 'id' retornado por supabase.auth.getUser()
  let sessionUserId = operadorId;
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user?.id) {
      sessionUserId = authData.user.id;
    }
  } catch (err) {
    console.warn('Sessão JWT Supabase não identificada em abrirCaixa, usando ID informado:', err);
  }

  const { data, error } = await supabase
    .from('caixas_diarios')
    .insert({
      operador_id: sessionUserId,
      data_abertura: new Date().toISOString(),
      valor_abertura: valorAbertura,
      status: 'aberto'
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '42501' || error.message?.includes('row-level security')) {
      throw new Error(
        'Permissão negada por política de segurança (RLS): Certifique-se de estar autenticado com uma conta autorizada (Master, Gerente, Financeiro ou o próprio Operador).'
      );
    }
    if (error.code === '23503' || error.message.includes('foreign key')) {
      throw new Error(
        'Falha de Autorização: O identificador deste operador não está registrado em auth.users do Supabase. Efetue logout e entre novamente.'
      );
    }
    throw new Error(error.message || 'Erro ao registrar abertura de caixa.');
  }
  return data as CaixaDiario;
}

export async function listarMovimentacoes(caixaId: string): Promise<MovimentacaoCaixa[]> {
  const { data, error } = await supabase
    .from('movimentacoes_caixa')
    .select('*')
    .eq('caixa_id', caixaId)
    .order('criado_em', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as MovimentacaoCaixa[]) ?? [];
}

export async function registrarMovimentacao(input: {
  caixa_id: string;
  tipo: TipoMovimentacao;
  valor: number; // Total Cobrado (COM O ISSQN SOMADO para vendas)
  forma_pagamento: FormaPagamento;
  descricao: string;
  despachante_id?: string | null;
  /** QUEM: operador que efetua o lançamento (o servidor preenche se omitido). */
  operador_id?: string | null;
  operador_nome?: string;
  justificativa_motivo?: string;
  // Campos Fiscais Segregados
  valor_bruto?: number | null; // Subtotal dos serviços
  aliquota_issqn?: number | null;
  valor_issqn?: number | null;
}): Promise<MovimentacaoCaixa> {
  if (input.forma_pagamento === 'faturamento' && !input.despachante_id) {
    throw new Error('Faturamento A Prazo exige um Despachante vinculado à venda.');
  }
  const exigeJustificativa = input.tipo === 'sangria' || input.tipo === 'suprimento';
  const justificativa = (input.justificativa_motivo ?? input.descricao ?? '').trim();
  if (exigeJustificativa && !justificativa) {
    throw new Error('Justificativa obrigatória para sangrias e suprimentos.');
  }

  const incideISSQN = input.tipo === 'venda' || input.tipo === 'liquidacao_fatura';
  const subtotalServicos = incideISSQN
    ? (input.valor_bruto !== undefined && input.valor_bruto !== null ? Number(input.valor_bruto) : Number(input.valor))
    : Number(input.valor);
  const valorIssqn = incideISSQN
    ? (input.valor_issqn !== undefined && input.valor_issqn !== null ? Number(input.valor_issqn) : calcularISSQN(subtotalServicos))
    : 0;
  const valorTotalCobrado = Number(input.valor);

  const payload = {
    caixa_id: input.caixa_id,
    tipo: input.tipo,
    valor: valorTotalCobrado, // Total Cobrado que entra na gaveta ou no faturamento B2B
    forma_pagamento: input.forma_pagamento,
    descricao: input.descricao,
    despachante_id: input.despachante_id ?? null,
    operador_id: input.operador_id ?? null,
    operador_nome: input.operador_nome,
    valor_bruto: subtotalServicos, // Subtotal dos serviços prestados
    aliquota_issqn: ALIQUOTA_ISSQN_PERCENTUAL, // 2.00
    valor_issqn: valorIssqn, // Valor do imposto ISSQN (2%)
    valor_liquido: subtotalServicos, // Receita operacional líquida de serviços
    justificativa_motivo: exigeJustificativa ? justificativa : null,
  };

  let { data, error } = await supabase
    .from('movimentacoes_caixa')
    .insert(payload)
    .select('*')
    .single();

  // Compatibilidade: banco ainda sem o patch supabase_pdv_auditoria_patch.sql
  if (error && /column|schema cache|check constraint/i.test(error.message)) {
    console.warn('Schema sem campos de auditoria; gravando no formato legado:', error.message);
    const legado = await supabase
      .from('movimentacoes_caixa')
      .insert({
        caixa_id: input.caixa_id,
        tipo: input.tipo === 'liquidacao_fatura' ? 'suprimento' : input.tipo,
        valor: input.valor,
        forma_pagamento: input.forma_pagamento,
        descricao: input.descricao,
        despachante_id: input.despachante_id ?? null,
      })
      .select('*')
      .single();
    data = legado.data;
    error = legado.error;
  }
  if (error) throw new Error(error.message);
  return data as MovimentacaoCaixa;
}

/**
 * SaldoEsperado (dinheiro físico) = ValorAbertura + Vendas em dinheiro
 * + Suprimentos em dinheiro + Liquidações de fatura em dinheiro - Sangrias
 * (cálculo em centavos inteiros).
 */
export function calcularSaldoEsperado(caixa: CaixaDiario, movs: MovimentacaoCaixa[]): number {
  let c = paraCentavos(caixa.valor_abertura);
  for (const m of movs) {
    const v = paraCentavos(m.valor);
    if (m.tipo === 'sangria') c -= v;
    else if (m.forma_pagamento === 'dinheiro') c += v; // venda | suprimento | liquidacao_fatura
  }
  return deCentavos(c);
}

export interface ResultadoFechamento {
  caixa: CaixaDiario;
  esperado: number;
  informado: number;
  diferenca: number;
  status_conferencia: StatusConferencia;
}

/** Fechamento cego: o esperado é calculado aqui, nunca exibido ao operador. */
export async function fecharCaixa(
  caixa: CaixaDiario,
  valorInformado: number
): Promise<ResultadoFechamento> {
  // Recalcula a partir do banco (fonte da verdade), não do estado da tela
  const movs = await listarMovimentacoes(caixa.id);
  const esperado = calcularSaldoEsperado(caixa, movs);
  const difCent = paraCentavos(valorInformado) - paraCentavos(esperado);
  const diferenca = deCentavos(difCent);
  const status_conferencia: StatusConferencia =
    difCent === 0 ? 'exato' : difCent < 0 ? 'quebra_caixa' : 'sobra_caixa';

  const { data, error } = await supabase
    .from('caixas_diarios')
    .update({
      data_fechamento: new Date().toISOString(),
      valor_fechamento_esperado: esperado,
      valor_fechamento_informado: valorInformado,
      diferenca,
      status_conferencia,
      status: 'fechado',
    })
    .eq('id', caixa.id)
    .eq('status', 'aberto')
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  return {
    caixa: data as CaixaDiario,
    esperado,
    informado: valorInformado,
    diferenca,
    status_conferencia,
  };
}
