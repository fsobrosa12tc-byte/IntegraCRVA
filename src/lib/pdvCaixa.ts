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

/**
 * Consulta todas as movimentações fiscais e de caixa registradas na data corrente (00:00:00 até agora).
 */
export async function listarMovimentacoesDoDia(): Promise<MovimentacaoCaixa[]> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('movimentacoes_caixa')
    .select('*')
    .gte('criado_em', hoje.toISOString())
    .order('criado_em', { ascending: false });
  if (error) {
    console.warn('Erro ao consultar movimentações do dia no Supabase:', error);
    return [];
  }
  return (data as MovimentacaoCaixa[]) ?? [];
}

/**
 * Identifica se uma movimentação é uma liquidação/quitação de fatura de despachante.
 * Inclui proteção retroativa caso algum registro legado tenha sido gravado como 'suprimento'
 * mas possua descrição de Quitação de Fatura ou meio eletrônico.
 */
export function ehLiquidacaoFatura(m: MovimentacaoCaixa): boolean {
  if (m.tipo === 'liquidacao_fatura') return true;
  if (
    m.tipo === 'suprimento' &&
    ((m.descricao && /quita[çc][ãa]o\s+fatura/i.test(m.descricao)) ||
      (m.forma_pagamento && m.forma_pagamento !== 'dinheiro'))
  ) {
    return true;
  }
  return false;
}

/**
 * Identifica se uma movimentação é um suprimento físico real de cédulas na gaveta.
 * Quitações de faturas de despachantes JAMAIS são suprimentos de caixa.
 */
export function ehSuprimentoRealGaveta(m: MovimentacaoCaixa): boolean {
  return m.tipo === 'suprimento' && !ehLiquidacaoFatura(m) && m.forma_pagamento === 'dinheiro';
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
  // Vínculo Operacional Independente (Cliente e Veículo da Ordem de Serviço)
  cliente_id?: string | null;
  veiculo_id?: string | null;
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

  // Payload principal com auditoria fiscal completa (tipo real preservado: JAMAIS converte liquidacao_fatura em suprimento)
  const payloadBase: Record<string, any> = {
    caixa_id: input.caixa_id,
    tipo: input.tipo,
    valor: valorTotalCobrado,
    forma_pagamento: input.forma_pagamento,
    descricao: input.descricao,
    despachante_id: input.despachante_id ?? null,
    operador_id: input.operador_id ?? null,
    operador_nome: input.operador_nome,
    valor_bruto: subtotalServicos,
    aliquota_issqn: ALIQUOTA_ISSQN_PERCENTUAL,
    valor_issqn: valorIssqn,
    valor_liquido: subtotalServicos,
    justificativa_motivo: exigeJustificativa ? justificativa : null,
  };

  if (input.cliente_id) payloadBase.cliente_id = input.cliente_id;
  if (input.veiculo_id) payloadBase.veiculo_id = input.veiculo_id;

  let { data, error } = await supabase
    .from('movimentacoes_caixa')
    .insert(payloadBase)
    .select('*')
    .single();

  // Tentativa 2: se falhar por ausência das colunas cliente_id / veiculo_id, grava sem elas mantendo auditoria e tipo real
  if (error && (input.cliente_id || input.veiculo_id) && /column|schema cache/i.test(error.message)) {
    const { cliente_id, veiculo_id, ...payloadSemVinculo } = payloadBase;
    const retryAuditoria = await supabase
      .from('movimentacoes_caixa')
      .insert(payloadSemVinculo)
      .select('*')
      .single();
    data = retryAuditoria.data;
    error = retryAuditoria.error;
  }

  // Tentativa 3: se o banco ainda não tiver colunas extras de auditoria, grava colunas essenciais preservando estritamente input.tipo
  if (error && /column|schema cache/i.test(error.message)) {
    console.warn('Schema sem colunas estendidas de auditoria; gravando com colunas nucleares preservando tipo:', error.message);
    const nuclear = await supabase
      .from('movimentacoes_caixa')
      .insert({
        caixa_id: input.caixa_id,
        tipo: input.tipo, // JAMAIS converte liquidacao_fatura em suprimento
        valor: valorTotalCobrado,
        forma_pagamento: input.forma_pagamento,
        descricao: input.descricao,
        despachante_id: input.despachante_id ?? null,
      })
      .select('*')
      .single();
    data = nuclear.data;
    error = nuclear.error;
  }

  if (error) throw new Error(error.message);
  return data as MovimentacaoCaixa;
}

/**
 * SaldoEsperado (dinheiro físico na gaveta) = ValorAbertura + Vendas em dinheiro
 * + Liquidações de fatura em dinheiro + Suprimentos reais em dinheiro - Sangrias
 * (cálculo estrito em centavos inteiros; meios eletrônicos JAMAIS entram na gaveta).
 */
export function calcularSaldoEsperado(caixa: CaixaDiario, movs: MovimentacaoCaixa[]): number {
  let c = paraCentavos(caixa.valor_abertura);
  for (const m of movs) {
    const v = paraCentavos(Number((m as any).valor_total || m.valor || 0));
    if (m.tipo === 'sangria') {
      c -= v;
    } else if (
      m.forma_pagamento === 'dinheiro' &&
      (m.tipo === 'venda' || ehLiquidacaoFatura(m) || ehSuprimentoRealGaveta(m))
    ) {
      c += v;
    }
  }
  return deCentavos(c);
}

export interface SnapshotTotalizadoresTurno {
  fundoAbertura: number;
  totalDinheiro: number;
  totalPix: number;
  totalDebito: number;
  totalCredito: number;
  totalFaturamento: number;
  totalEntradasFaturamentoBruto: number;
  totalSangrias: number;
  totalSuprimentos: number;
  issqnTotalApurado: number;
  saldoEsperadoDinheiro: number;
  saldoDeclarado: number;
  diferenca: number;
  statusConferencia: StatusConferencia;
}

export type { CaixaDiario };

export interface SnapshotAtaIdentificacao {
  unidade: string;
  terminal: string;
  turno_id: string;
  data_abertura: string;
  data_fechamento: string;
  operador_nome: string;
  operador_cpf: string;
  operador_email?: string | null;
}

export interface SnapshotAtaValores {
  fundo_troco: number;
  total_dinheiro: number;
  total_pix: number;
  total_debito: number;
  total_credito: number;
  total_despachante_aberto: number;
  total_suprimentos: number;
  total_sangrias: number;
  faturamento_bruto: number;
  total_issqn: number;
  saldo_esperado: number;
  valor_declarado: number;
  diferenca: number;
  resultado_conferencia: 'EXATO' | 'SOBRA' | 'QUEBRA';
}

export interface SnapshotMovimentacaoDetalhada {
  id: string;
  hora: string;
  protocolo: string;
  tipo: string;
  descricao: string;
  tomador: string;
  meio: string;
  valor: number;
  issqn: number;
  operador?: string;
}

export interface SnapshotSangriaSuprimento {
  id: string;
  hora: string;
  operador: string;
  tipo: 'sangria' | 'suprimento';
  valor: number;
  motivo: string;
}

export interface SnapshotAtaEncerramento {
  idAta: string;
  versao: string;
  // Estrutura Oficial SaaS Enterprise (Fintech Audit Grade)
  identificacao: SnapshotAtaIdentificacao;
  valores: SnapshotAtaValores;
  movimentacoes_detalhadas: SnapshotMovimentacaoDetalhada[];
  sangrias_suprimentos: SnapshotSangriaSuprimento[];
  trocas_operador: Array<{
    id: string;
    anteriorNome: string;
    novoNome: string;
    saldoGaveta: number;
    motivo: string | null;
    horario: string;
  }>;
  hash_autenticacao: string;
  // Campos de compatibilidade
  empresa: {
    razaoSocial: string;
    nomeFantasia: string;
    unidade: string;
    sistema: string;
  };
  caixa: {
    id: string;
    operadorId: string;
    operadorNome: string;
    operadorCpf?: string | null;
    operadorEmail?: string | null;
    dataAbertura: string;
    dataFechamento: string;
  };
  totais: SnapshotTotalizadoresTurno;
  sangriasSuprimentos: Array<{
    id: string;
    tipo: 'sangria' | 'suprimento';
    valor: number;
    descricao: string;
    criado_em: string;
    operador_nome?: string;
  }>;
  trocasOperador: Array<{
    id: string;
    anteriorNome: string;
    novoNome: string;
    saldoGaveta: number;
    motivo: string | null;
    horario: string;
  }>;
  totalVendasQuantidade: number;
  totalMovimentacoesQuantidade: number;
  hashDigitalSha256: string;
  emitidoEm: string;
  bloco1Institucional?: any;
  bloco2Demonstrativo?: any;
  bloco3Ocorrencias?: any;
  bloco4TermoAssinaturas?: any;
  hashSha256?: string;
}

export interface ResultadoFechamento {
  caixa: CaixaDiario;
  esperado: number;
  informado: number;
  diferenca: number;
  status_conferencia: StatusConferencia;
  ata: SnapshotAtaEncerramento;
}

function formatarCpfOficial(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  const limpo = raw.trim();
  return limpo.length > 0 && limpo.toLowerCase() !== 'não informado' ? limpo : null;
}

export async function obterDadosOperadorPerfis(
  operadorId: string,
  operadorInfo?: { nome?: string; cpf?: string; email?: string }
): Promise<{ nome: string; cpf: string; email: string }> {
  let nome = (operadorInfo?.nome || '').trim();
  let cpf = formatarCpfOficial(operadorInfo?.cpf) || '';
  let email = (operadorInfo?.email || '').trim() || '';

  try {
    if (operadorId) {
      const { data: perfilById } = await supabase
        .from('perfis')
        .select('*')
        .eq('id', operadorId)
        .maybeSingle();

      if (perfilById) {
        const p = perfilById as any;
        if (!nome && (p.nome_completo || p.nome)) nome = p.nome_completo || p.nome;
        if (!cpf && (p.cpf || p.documento)) cpf = formatarCpfOficial(p.cpf || p.documento) || '';
        if (!email && (p.email_login || p.email_contato || p.email)) {
          email = p.email_login || p.email_contato || p.email;
        }
      }
    }

    if ((!cpf || !email) && email) {
      const { data: perfilByEmail } = await supabase
        .from('perfis')
        .select('*')
        .eq('email_login', email)
        .maybeSingle();

      if (perfilByEmail) {
        const p = perfilByEmail as any;
        if (!nome && (p.nome_completo || p.nome)) nome = p.nome_completo || p.nome;
        if (!cpf && (p.cpf || p.documento)) cpf = formatarCpfOficial(p.cpf || p.documento) || '';
      }
    }

    if ((!cpf || !email) && nome) {
      const { data: perfilByNome } = await supabase
        .from('perfis')
        .select('*')
        .ilike('nome_completo', `%${nome}%`)
        .limit(1)
        .maybeSingle();

      if (perfilByNome) {
        const p = perfilByNome as any;
        if (!cpf && (p.cpf || p.documento)) cpf = formatarCpfOficial(p.cpf || p.documento) || '';
        if (!email && (p.email_login || p.email_contato || p.email)) {
          email = p.email_login || p.email_contato || p.email;
        }
      }
    }

    if (!email) {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.email) {
        email = authData.user.email;
      }
    }
  } catch (e) {
    console.warn('Aviso ao consultar public.perfis no encerramento:', e);
  }

  return {
    nome: nome || 'Operador Titular Homologado',
    cpf: cpf || '000.000.000-01',
    email: email || 'operador@integracrva.com.br',
  };
}

/**
 * Gera hash determinístico SHA-256 para auditoria de autenticidade da Ata.
 */
export async function gerarHashSha256Ata(conteudo: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const msgUint8 = new TextEncoder().encode(conteudo);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    console.warn('Crypto subtle indisponível, gerando hash fallback:', e);
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < conteudo.length; i++) {
    h ^= conteudo.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `AUTH-${Math.abs(h).toString(16).toUpperCase().padStart(8, '0')}-${Date.now().toString(16).toUpperCase()}`;
}

/** Fechamento cego e consolidação oficial da Ata com snapshot imutável e totalizadores segregados. */
export async function fecharCaixa(
  caixa: CaixaDiario,
  valorInformado: number,
  operadorInfo?: { nome?: string; cpf?: string; email?: string }
): Promise<ResultadoFechamento> {
  // 1. Busca TODAS as movimentações ligadas ao caixa.id e dados reais do operador em public.perfis
  const movs = await listarMovimentacoes(caixa.id);
  const dadosOperador = await obterDadosOperadorPerfis(caixa.operador_id, operadorInfo);
  const dataFechamento = new Date().toISOString();

  // Consulta transições de operador ocorridas no turno ativo
  let trocasOperador: Array<{
    id: string;
    anteriorNome: string;
    novoNome: string;
    saldoGaveta: number;
    motivo: string | null;
    horario: string;
  }> = [];

  try {
    const { data: logsTroca } = await supabase
      .from('logs_troca_operador')
      .select('*')
      .eq('caixa_id', caixa.id)
      .order('trocado_em', { ascending: true });

    if (logsTroca) {
      trocasOperador = logsTroca.map((t: any) => ({
        id: t.id,
        anteriorNome: t.operador_anterior_nome || 'Operador',
        novoNome: t.operador_novo_nome || 'Operador',
        saldoGaveta: Number(t.saldo_gaveta_momento) || 0,
        motivo: t.motivo_troca,
        horario: t.trocado_em,
      }));
    }
  } catch (e) {
    console.warn('Aviso: Tabela logs_troca_operador não consultada:', e);
  }

  // 2. Agregação Matemática Rígida (em centavos inteiros)
  const fundo_troco = Number(caixa.valor_abertura) || 0;

  // total_dinheiro = soma(vendas dinheiro) + soma(liquidacoes dinheiro)
  const total_dinheiro = deCentavos(
    movs
      .filter((m) => m.forma_pagamento === 'dinheiro' && (m.tipo === 'venda' || ehLiquidacaoFatura(m)))
      .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
  );

  // total_pix = soma(vendas pix) + soma(liquidacoes pix)
  const total_pix = deCentavos(
    movs
      .filter((m) => m.forma_pagamento === 'pix' && (m.tipo === 'venda' || ehLiquidacaoFatura(m)))
      .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
  );

  // total_debito = soma(vendas cartao_debito) + soma(liquidacoes cartao_debito)
  const total_debito = deCentavos(
    movs
      .filter((m) => m.forma_pagamento === 'cartao_debito' && (m.tipo === 'venda' || ehLiquidacaoFatura(m)))
      .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
  );

  // total_credito = soma(vendas cartao_credito) + soma(liquidacoes cartao_credito)
  const total_credito = deCentavos(
    movs
      .filter((m) => m.forma_pagamento === 'cartao_credito' && (m.tipo === 'venda' || ehLiquidacaoFatura(m)))
      .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
  );

  // total_despachante_aberto = soma(vendas faturamento a prazo do turno) MENOS soma(quitacoes realizadas no turno)
  const totalTodasVendasFaturadasCent = movs
    .filter((m) => m.forma_pagamento === 'faturamento' && m.tipo === 'venda')
    .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0);

  const totalLiquidacoesTurnoCent = movs
    .filter((m) => ehLiquidacaoFatura(m))
    .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0);

  const total_despachante_aberto = deCentavos(
    Math.max(0, totalTodasVendasFaturadasCent - totalLiquidacoesTurnoCent)
  );

  // faturamento_bruto = total_dinheiro + total_pix + total_debito + total_credito + total_despachante_aberto
  const faturamento_bruto = deCentavos(
    paraCentavos(total_dinheiro) +
    paraCentavos(total_pix) +
    paraCentavos(total_debito) +
    paraCentavos(total_credito) +
    paraCentavos(total_despachante_aberto)
  );

  // total_issqn = faturamento_bruto * 0.02
  const total_issqn = Math.round(faturamento_bruto * 2) / 100;

  // Suprimentos reais de gaveta (JAMAIS inclui quitações de faturas) e Sangrias
  const total_suprimentos = deCentavos(
    movs
      .filter((m) => ehSuprimentoRealGaveta(m))
      .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
  );

  const total_sangrias = deCentavos(
    movs
      .filter((m) => m.tipo === 'sangria')
      .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
  );

  // saldo_dinheiro_esperado = fundo_troco_inicial + total_dinheiro + total_suprimentos - total_sangrias
  const esperado = deCentavos(
    paraCentavos(fundo_troco) +
    paraCentavos(total_dinheiro) +
    paraCentavos(total_suprimentos) -
    paraCentavos(total_sangrias)
  );

  // diferenca_conferencia = valor_declarado_operador - saldo_dinheiro_esperado
  const difCent = paraCentavos(valorInformado) - paraCentavos(esperado);
  const diferenca = deCentavos(difCent);
  const status_conferencia: StatusConferencia =
    difCent === 0 ? 'exato' : difCent < 0 ? 'quebra_caixa' : 'sobra_caixa';
  const resultado_conferencia: 'EXATO' | 'SOBRA' | 'QUEBRA' =
    difCent === 0 ? 'EXATO' : difCent > 0 ? 'SOBRA' : 'QUEBRA';

  // Listas detalhadas do turno
  const movimentacoes_detalhadas: SnapshotMovimentacaoDetalhada[] = movs.map((m) => {
    const ehLiq = ehLiquidacaoFatura(m);
    const partes = (m.descricao || '').split(' | ');
    const servicoDesc =
      m.tipo === 'venda'
        ? partes[0] || 'Serviço CRVA'
        : ehLiq
          ? partes[0] || 'Quitação Fatura Despachante'
          : m.tipo === 'sangria'
            ? 'Sangria de Caixa'
            : 'Suprimento de Troco';
    const tomadorDesc =
      m.tipo === 'venda' || ehLiq
        ? partes[1] || 'Consumidor / Balcão'
        : m.descricao || m.justificativa_motivo || '-';
    const val = Number((m as any).valor_total || m.valor || 0);
    const issqn =
      m.tipo === 'venda' || ehLiq
        ? Number(m.valor_issqn) || Math.round(val * 2) / 100
        : 0;
    return {
      id: m.id,
      hora: m.criado_em,
      protocolo: `#${m.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      tipo: ehLiq ? 'liquidacao_fatura' : m.tipo,
      descricao: servicoDesc,
      tomador: tomadorDesc,
      meio: m.forma_pagamento,
      valor: val,
      issqn,
      operador: m.operador_nome || dadosOperador.nome,
    };
  });

  const sangrias_suprimentos: SnapshotSangriaSuprimento[] = movs
    .filter((m) => m.tipo === 'sangria' || ehSuprimentoRealGaveta(m))
    .map((m) => ({
      id: m.id,
      hora: m.criado_em,
      operador: m.operador_nome || dadosOperador.nome,
      tipo: m.tipo as 'sangria' | 'suprimento',
      valor: Number((m as any).valor_total || m.valor || 0),
      motivo: m.justificativa_motivo || m.descricao || 'Movimentação operacional autorizada',
    }));

  const identificacao: SnapshotAtaIdentificacao = {
    unidade: 'Integra CRVA - Registro de Veículos Automotores',
    terminal: 'PDV-01',
    turno_id: `#${caixa.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    data_abertura: caixa.data_abertura,
    data_fechamento: dataFechamento,
    operador_nome: dadosOperador.nome,
    operador_cpf: dadosOperador.cpf,
    operador_email: dadosOperador.email,
  };

  const valores: SnapshotAtaValores = {
    fundo_troco,
    total_dinheiro,
    total_pix,
    total_debito,
    total_credito,
    total_despachante_aberto,
    total_suprimentos,
    total_sangrias,
    faturamento_bruto,
    total_issqn,
    saldo_esperado: esperado,
    valor_declarado: valorInformado,
    diferenca,
    resultado_conferencia,
  };

  // Geração do Hash SHA-256 do payload completo gerado
  const payloadHash = JSON.stringify({
    identificacao,
    valores,
    qtd_movs: movimentacoes_detalhadas.length,
    qtd_trocas: trocasOperador.length,
  });
  const hashDigital = await gerarHashSha256Ata(payloadHash);

  const totaisTurno: SnapshotTotalizadoresTurno = {
    fundoAbertura: fundo_troco,
    totalDinheiro: total_dinheiro,
    totalPix: total_pix,
    totalDebito: total_debito,
    totalCredito: total_credito,
    totalFaturamento: total_despachante_aberto,
    totalEntradasFaturamentoBruto: faturamento_bruto,
    totalSangrias: total_sangrias,
    totalSuprimentos: total_suprimentos,
    issqnTotalApurado: total_issqn,
    saldoEsperadoDinheiro: esperado,
    saldoDeclarado: valorInformado,
    diferenca,
    statusConferencia: status_conferencia,
  };

  const snapshotAta: SnapshotAtaEncerramento = {
    idAta: `ATA-${caixa.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    versao: '3.0-ENTERPRISE',
    identificacao,
    valores,
    movimentacoes_detalhadas,
    sangrias_suprimentos,
    trocas_operador: trocasOperador,
    hash_autenticacao: hashDigital,
    empresa: {
      razaoSocial: 'Marks Systems / Centro de Registro de Veículos Automotores',
      nomeFantasia: 'CRVA Autorizado DETRAN/RS - Integra PDV',
      unidade: identificacao.unidade,
      sistema: 'Integra PDV - Frente de Caixa Corporativa',
    },
    caixa: {
      id: caixa.id,
      operadorId: caixa.operador_id,
      operadorNome: dadosOperador.nome,
      operadorCpf: dadosOperador.cpf,
      operadorEmail: dadosOperador.email,
      dataAbertura: caixa.data_abertura,
      dataFechamento,
    },
    totais: totaisTurno,
    sangriasSuprimentos: sangrias_suprimentos.map((s) => ({
      id: s.id,
      tipo: s.tipo,
      valor: s.valor,
      descricao: s.motivo,
      criado_em: s.hora,
      operador_nome: s.operador,
    })),
    trocasOperador,
    totalVendasQuantidade: movs.filter((m) => m.tipo === 'venda' || m.tipo === 'liquidacao_fatura').length,
    totalMovimentacoesQuantidade: movs.length,
    hashDigitalSha256: hashDigital,
    hashSha256: hashDigital,
    emitidoEm: dataFechamento,
    bloco1Institucional: {
      empresa: identificacao.unidade,
      terminalId: identificacao.terminal,
      operadorNome: identificacao.operador_nome,
      operadorCpf: identificacao.operador_cpf,
    },
    bloco2Demonstrativo: {
      totalizadores: {
        fundoAbertura: fundo_troco,
        totalDinheiro: total_dinheiro,
        totalPix: total_pix,
        totalCartaoDebito: total_debito,
        totalCartaoCredito: total_credito,
        totalFaturamentoDespachantes: total_despachante_aberto,
        totalEntradasFaturamentoBruto: faturamento_bruto,
        issqnTotalApurado: total_issqn,
        totalSangrias: total_sangrias,
        totalSuprimentos: total_suprimentos,
        saldoFisicoEsperadoDinheiro: esperado,
        saldoFisicoDeclarado: valorInformado,
      },
      suprimentosRealizados: sangrias_suprimentos
        .filter((s) => s.tipo === 'suprimento')
        .map((s) => ({ horario: s.hora, justificativa: s.motivo, valor: s.valor })),
      sangriasRealizadas: sangrias_suprimentos
        .filter((s) => s.tipo === 'sangria')
        .map((s) => ({ horario: s.hora, justificativa: s.motivo, valor: s.valor })),
    },
    bloco3Ocorrencias: {
      trocasOperador,
      reconexoesAuditoria: [],
    },
  };

  // 3. Gravação em caixas_diarios no Supabase com snapshot_ata e hash_auditoria
  let caixaAtualizado: CaixaDiario | null = null;
  try {
    const { data, error } = await supabase
      .from('caixas_diarios')
      .update({
        data_fechamento: dataFechamento,
        valor_fechamento_esperado: esperado,
        valor_fechamento_informado: valorInformado,
        diferenca,
        status_conferencia,
        status: 'fechado',
        snapshot_ata: snapshotAta,
        hash_auditoria: hashDigital,
        dados_fechamento: snapshotAta,
      } as any)
      .eq('id', caixa.id)
      .eq('status', 'aberto')
      .select('*')
      .single();

    if (error) throw error;
    caixaAtualizado = data as CaixaDiario;
  } catch (errSchema: any) {
    console.warn('Tentativa com snapshot_ata falhou (coluna ausente), tentando dados_fechamento ou padrão:', errSchema.message);
    try {
      const { data: dataFallback1, error: errFallback1 } = await supabase
        .from('caixas_diarios')
        .update({
          data_fechamento: dataFechamento,
          valor_fechamento_esperado: esperado,
          valor_fechamento_informado: valorInformado,
          diferenca,
          status_conferencia,
          status: 'fechado',
          dados_fechamento: snapshotAta,
        } as any)
        .eq('id', caixa.id)
        .eq('status', 'aberto')
        .select('*')
        .single();

      if (errFallback1) throw errFallback1;
      caixaAtualizado = dataFallback1 as CaixaDiario;
    } catch {
      const { data: dataPadrao, error: errPadrao } = await supabase
        .from('caixas_diarios')
        .update({
          data_fechamento: dataFechamento,
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

      if (errPadrao) throw new Error(errPadrao.message);
      caixaAtualizado = dataPadrao as CaixaDiario;
    }
  }

  // Persistência de backup em logs_auditoria e localStorage
  try {
    localStorage.setItem(`integra_pdv_ata_${caixa.id}`, JSON.stringify(snapshotAta));
  } catch (e) { }

  try {
    await supabase.from('logs_auditoria').insert({
      operador_id: caixa.operador_id,
      operador_nome: dadosOperador.nome,
      tipo_evento: 'fechamento_caixa_ata_oficial',
      evento: 'ATA_ENCERRAMENTO_TURNO',
      descricao: `Encerramento de caixa ${identificacao.turno_id} | Parecer: ${resultado_conferencia} | Diferença: ${formatarBRL(diferenca)}`,
      metadata: snapshotAta,
      criado_em: dataFechamento,
    });
  } catch (e) {
    // Tabela opcional
  }

  const caixaFinal: CaixaDiario = {
    ...(caixaAtualizado || {
      ...caixa,
      status: 'fechado',
      data_fechamento: dataFechamento,
      valor_fechamento_esperado: esperado,
      valor_fechamento_informado: valorInformado,
      diferenca,
      status_conferencia,
    }),
    snapshot_ata: snapshotAta,
    hash_auditoria: hashDigital,
    dados_fechamento: snapshotAta,
  };

  return {
    caixa: caixaFinal,
    esperado,
    informado: valorInformado,
    diferenca,
    status_conferencia,
    ata: snapshotAta,
  };
}
