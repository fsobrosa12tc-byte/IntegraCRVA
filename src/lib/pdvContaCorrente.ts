import { supabase } from './supabase';
import type { Despachante, FaturaDespachantePendente, FormaPagamento } from '../types/pdv';
import { deCentavos, paraCentavos, registrarMovimentacao } from './pdvCaixa';
import { mascararDocumento, mascararTelefone } from '../utils/documento';

export interface LancamentoFaturamento {
  id: string;
  data: string;
  descricao: string;
  numero_os: string;
  valor: number;
  despachante_id: string;
  caixa_id: string;
  liquidado?: boolean;
}

export interface ComprovanteLiquidacao {
  protocolo: string;
  dataHora: string;
  despachante: Despachante;
  valorLiquidado: number;
  valorIssqnSegregado: number;
  meioPagamento: FormaPagamento | 'transferencia';
  saldoAnterior: number;
  saldoRestante: number;
  operadorNome: string;
  itensQuitadosCount: number;
  faturaNumeroOriginal?: string | null;
  hashAutenticidade: string;
}

export interface ContaCorrenteDespachanteConsolidada {
  despachante: Despachante;
  despachanteId: string;
  nomeRazao: string;
  documentoMascarado: string;
  telefoneMascarado: string;
  saldoDevedorConsolidado: number;
  totalIssqnConsolidado: number;
  quantidadeOrdens: number;
  ordens: FaturaDespachantePendente[];
}

const STORAGE_FATURAS_LIQUIDADAS_KEY = 'integra_faturas_liquidadas_ids';

function obterIdsLiquidadosLocal(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_FATURAS_LIQUIDADAS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function registrarIdsLiquidadosLocal(ids: string[]): void {
  if (typeof window === 'undefined' || ids.length === 0) return;
  try {
    const atual = obterIdsLiquidadosLocal();
    ids.forEach((id) => {
      if (id) atual.add(id);
    });
    localStorage.setItem(STORAGE_FATURAS_LIQUIDADAS_KEY, JSON.stringify(Array.from(atual)));
  } catch {
    // ignora erro de quota
  }
}

/**
 * Busca todas as movimentações faturadas a prazo em aberto vinculadas ao despachante.
 * Usa .select('*') para nunca falhar caso a coluna opcional fatura_liquidada não exista no banco.
 */
export async function buscarLancamentosDespachante(despachanteId: string): Promise<LancamentoFaturamento[]> {
  const { data, error } = await supabase
    .from('movimentacoes_caixa')
    .select('*')
    .eq('despachante_id', despachanteId)
    .eq('forma_pagamento', 'faturamento')
    .eq('tipo', 'venda')
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('Erro ao buscar lançamentos do despachante:', error);
    throw new Error(error.message || 'Falha ao buscar movimentações do despachante.');
  }

  const idsLocal = obterIdsLiquidadosLocal();

  return ((data as any[]) || [])
    .filter((m) => m.fatura_liquidada !== true && !idsLocal.has(m.id))
    .map((m) => {
      const partes = (m.descricao || '').split(' | ');
      const desc = partes[0] || 'Serviço Faturado';
      const ano = new Date(m.criado_em).getFullYear();
      const code = m.id.replace(/-/g, '').slice(0, 4).toUpperCase();
      return {
        id: m.id,
        data: m.criado_em,
        descricao: desc,
        numero_os: m.fatura_numero || `#FT-${ano}-${code}`,
        valor: Number(m.valor) || 0,
        despachante_id: m.despachante_id,
        caixa_id: m.caixa_id,
        liquidado: false,
      };
    });
}

/**
 * Busca todas as faturas a prazo de despachantes que aguardam quitação (esteira dinâmica).
 * Usa .select('*') para garantir resiliência total independente de colunas opcionais no schema.
 */
export async function buscarFaturasDespachantesAguardandoQuitacao(): Promise<FaturaDespachantePendente[]> {
  try {
    const contas = await buscarContasCorrentesDespachantes();
    const todasOrdens: FaturaDespachantePendente[] = [];
    for (const conta of contas) {
      todasOrdens.push(...conta.ordens);
    }
    return todasOrdens;
  } catch (e) {
    console.warn('Falha inesperada ao buscar faturas pendentes de despachantes:', e);
    return [];
  }
}

/**
 * Busca e agrupa todas as movimentações faturadas com status pendente de liquidação
 * consolidadas por Despachante (Parceiro).
 */
export async function buscarContasCorrentesDespachantes(): Promise<ContaCorrenteDespachanteConsolidada[]> {
  try {
    // 1. Buscar todos os despachantes cadastrados
    const { data: despData, error: errDesp } = await supabase
      .from('despachantes')
      .select('*')
      .order('nome_razao', { ascending: true });

    if (errDesp) {
      console.warn('Erro ao buscar despachantes:', errDesp.message);
      return [];
    }

    const despachantesLista: Despachante[] = ((despData as any[]) || []).map((d) => ({
      id: d.id,
      nome_razao: d.nome_razao || d.razao_social || 'Despachante Parceiro',
      documento: d.documento || d.cnpj || '',
      telefone: d.telefone || '',
      email: d.email || '',
      saldo_devedor: Number(d.saldo_devedor) || 0,
      criado_em: d.criado_em || new Date().toISOString(),
    }));

    // Filtra parceiros que possuem saldo devedor positivo (> R$ 0,00)
    const despachantesComSaldo = despachantesLista.filter((d) => paraCentavos(d.saldo_devedor) > 0);
    if (despachantesComSaldo.length === 0) {
      return [];
    }

    const idsComSaldo = despachantesComSaldo.map((d) => d.id);

    // 2. Buscar movimentações faturadas a prazo desses despachantes
    const { data: movsFaturadas, error: errMovs } = await supabase
      .from('movimentacoes_caixa')
      .select('*')
      .eq('forma_pagamento', 'faturamento')
      .eq('tipo', 'venda')
      .in('despachante_id', idsComSaldo)
      .order('criado_em', { ascending: false });

    if (errMovs) {
      console.warn('Erro ao consultar movimentações faturadas:', errMovs.message);
    }

    const idsLocal = obterIdsLiquidadosLocal();
    const movsPorDespachante = new Map<string, any[]>();

    ((movsFaturadas as any[]) || []).forEach((m) => {
      if (m.fatura_liquidada === true || idsLocal.has(m.id)) return;
      if (!m.despachante_id) return;
      const lista = movsPorDespachante.get(m.despachante_id) || [];
      lista.push(m);
      movsPorDespachante.set(m.despachante_id, lista);
    });

    // 3. Construir o card consolidado por despachante
    const resultado: ContaCorrenteDespachanteConsolidada[] = [];

    for (const d of despachantesComSaldo) {
      const saldoDevedorCent = paraCentavos(d.saldo_devedor);
      if (saldoDevedorCent <= 0) continue;

      const movs = movsPorDespachante.get(d.id) || [];
      const ordens: FaturaDespachantePendente[] = [];
      let acumuladoCent = 0;

      for (const m of movs) {
        if (acumuladoCent >= saldoDevedorCent) break;

        const valorMov = Number(m.valor) || 0;
        const valorMovCent = paraCentavos(valorMov);
        if (valorMovCent <= 0) continue;

        // Se a ordem cabe dentro do saldo devedor restante (ou se é a última parcela em aberto)
        const valorEfetivoCent = Math.min(valorMovCent, saldoDevedorCent - acumuladoCent);
        const valorEfetivo = deCentavos(valorEfetivoCent);

        const partes = (m.descricao || '').split(' | ');
        const resumo = partes[0] || 'Serviços Notariais / CRVA';
        const ano = new Date(m.criado_em).getFullYear();
        const numProtocolo = m.fatura_numero || `#FT-${ano}-${m.id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
        const valorIssqn = Math.round(valorEfetivo * 2) / 100;

        ordens.push({
          id: m.id,
          numeroRecibo: numProtocolo,
          dataHora: m.criado_em,
          despachanteId: d.id,
          despachanteNome: d.nome_razao,
          despachanteDocumento: mascararDocumento(d.documento || ''),
          resumoServicos: resumo,
          valorTotal: valorEfetivo,
          valorBruto: Number(m.valor_bruto) || valorEfetivo,
          valorIssqn,
          caixaId: m.caixa_id,
        });

        acumuladoCent += valorEfetivoCent;
      }

      // Caso o despachante possua saldo devedor anterior não rastreado em ordens recentes
      if (ordens.length === 0 && saldoDevedorCent > 0) {
        const valorSaldo = deCentavos(saldoDevedorCent);
        const ano = new Date().getFullYear();
        const code = d.id.replace(/-/g, '').slice(0, 4).toUpperCase();
        ordens.push({
          id: `saldo-anterior-${d.id}`,
          numeroRecibo: `#FT-${ano}-${code}`,
          dataHora: d.criado_em || new Date().toISOString(),
          despachanteId: d.id,
          despachanteNome: d.nome_razao,
          despachanteDocumento: mascararDocumento(d.documento || ''),
          resumoServicos: 'Saldo Faturado Consolidado em Conta-Corrente',
          valorTotal: valorSaldo,
          valorBruto: valorSaldo,
          valorIssqn: Math.round(valorSaldo * 2) / 100,
          caixaId: '',
        });
      }

      const saldoConsolidado = deCentavos(saldoDevedorCent);
      const issqnConsolidado = Math.round(saldoConsolidado * 2) / 100;

      resultado.push({
        despachante: d,
        despachanteId: d.id,
        nomeRazao: d.nome_razao,
        documentoMascarado: mascararDocumento(d.documento || ''),
        telefoneMascarado: d.telefone ? mascararTelefone(d.telefone) : 'Não informado',
        saldoDevedorConsolidado: saldoConsolidado,
        totalIssqnConsolidado: issqnConsolidado,
        quantidadeOrdens: ordens.length,
        ordens,
      });
    }

    return resultado;
  } catch (e) {
    console.warn('Erro ao consolidar contas-correntes de despachantes:', e);
    return [];
  }
}

/**
 * Assina mudanças em tempo real nas movimentações de caixa e despachantes para atualizar a esteira.
 */
export function inscreverFaturasDespachantesRealtime(onAtualizar: () => void) {
  const canal = supabase
    .channel('faturas_despachantes_realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'movimentacoes_caixa' },
      () => onAtualizar()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'despachantes' },
      () => onAtualizar()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(canal);
  };
}

/**
 * Executa a liquidação/quitação de fatura do Despachante (individual, ordens selecionadas ou conta completa).
 * REGRA CONTÁBIL ESTRITA:
 * - Registra em movimentacoes_caixa com tipo: 'liquidacao_fatura' (JAMAIS 'suprimento').
 * - Salva a forma_pagamento REAL selecionada ('pix', 'dinheiro', 'cartao_debito', 'cartao_credito').
 * - Apenas 'dinheiro' entra no saldo físico esperado da gaveta.
 */
export async function liquidarFaturaDespachante(params: {
  despachante: Despachante;
  valorPago: number;
  formaPagamento: 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'transferencia';
  caixaId: string | null;
  operadorNome: string;
  operadorId?: string | null;
  itensQuitadosCount?: number;
  faturaId?: string | null;
  faturasIds?: string[];
  faturaNumero?: string | null;
}): Promise<ComprovanteLiquidacao> {
  const {
    despachante,
    valorPago,
    formaPagamento,
    caixaId,
    operadorNome,
    operadorId = null,
    itensQuitadosCount = 1,
    faturaId = null,
    faturasIds = [],
    faturaNumero = null,
  } = params;

  if (valorPago <= 0) {
    throw new Error('O valor do pagamento deve ser superior a zero.');
  }

  if (!caixaId) {
    throw new Error('É necessário ter um turno de caixa aberto no terminal para registrar a quitação.');
  }

  const saldoAnterior = Number(despachante.saldo_devedor) || 0;
  const saldoAntCent = paraCentavos(saldoAnterior);
  const pagoCent = paraCentavos(valorPago);
  const novoSaldoCent = Math.max(0, saldoAntCent - pagoCent);
  const saldoRestante = deCentavos(novoSaldoCent);

  // 1. Atualizar atomicamente o saldo devedor do despachante
  const { error: errSaldo } = await supabase
    .from('despachantes')
    .update({ saldo_devedor: saldoRestante })
    .eq('id', despachante.id);

  if (errSaldo) {
    throw new Error(`Falha ao abater saldo do despachante: ${errSaldo.message}`);
  }

  // 2. Marcar as ordens/faturas correspondentes como liquidadas no banco e no cache local
  const todosIdsLiquidados = Array.from(
    new Set([...(faturasIds || []), ...(faturaId ? [faturaId] : [])].filter((id) => id && !id.startsWith('saldo-anterior-')))
  );

  if (todosIdsLiquidados.length > 0) {
    registrarIdsLiquidadosLocal(todosIdsLiquidados);
    try {
      await supabase
        .from('movimentacoes_caixa')
        .update({ fatura_liquidada: true } as any)
        .in('id', todosIdsLiquidados);
    } catch (e) {
      console.warn('Aviso: coluna fatura_liquidada opcional:', e);
    }
  } else if (novoSaldoCent === 0) {
    // Se liquidou 100% da conta, marca todas as movimentações faturadas deste despachante como liquidadas
    try {
      const { data: movsDesp } = await supabase
        .from('movimentacoes_caixa')
        .select('id')
        .eq('despachante_id', despachante.id)
        .eq('forma_pagamento', 'faturamento')
        .eq('tipo', 'venda');
      const ids = ((movsDesp as any[]) || []).map((m) => m.id);
      if (ids.length > 0) {
        registrarIdsLiquidadosLocal(ids);
        await supabase
          .from('movimentacoes_caixa')
          .update({ fatura_liquidada: true } as any)
          .in('id', ids);
      }
    } catch {
      // ignora se coluna opcional ausente
    }
  }

  // Cálculo segregado de ISSQN (2,00% sobre serviços)
  const valorIssqnSegregado = Math.round(valorPago * 2) / 100;
  const descNumero = faturaNumero ? ` ${faturaNumero}` : todosIdsLiquidados.length > 1 ? ` (${todosIdsLiquidados.length} ordens)` : '';
  const descOperacao = `Quitação Fatura${descNumero} | Despachante: ${despachante.nome_razao}`;

  const formaPdv: FormaPagamento =
    formaPagamento === 'transferencia' ? 'pix' : formaPagamento;

  // 3. Persistência atômica da movimentação de caixa com tipo ESTRITO 'liquidacao_fatura'
  await registrarMovimentacao({
    caixa_id: caixaId,
    tipo: 'liquidacao_fatura',
    valor: valorPago,
    forma_pagamento: formaPdv,
    despachante_id: despachante.id,
    operador_id: operadorId,
    operador_nome: operadorNome,
    valor_bruto: valorPago,
    aliquota_issqn: 2.0,
    valor_issqn: valorIssqnSegregado,
    descricao: descOperacao,
  });

  // Se for PIX ou Transferência, audita opcionalmente no fluxo de caixa geral
  if (formaPagamento === 'pix' || formaPagamento === 'transferencia') {
    try {
      await supabase.from('fluxo_caixa').insert({
        tipo: 'entrada',
        categoria: `Recebimento Despachante (${formaPagamento.toUpperCase()})`,
        valor: valorPago,
        origem_id: despachante.id,
        data_movimentacao: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Registro no fluxo_caixa (opcional):', e);
    }
  }

  // 4. Gerar protocolo de auditoria
  const timestamp = Date.now();
  const rawHash = `${despachante.id}-${timestamp}-${valorPago.toFixed(2)}`;
  const hashAutenticidade = Array.from(rawHash)
    .reduce((hash, char) => 0 | (31 * hash + char.charCodeAt(0)), 0)
    .toString(16)
    .toUpperCase()
    .replace('-', '')
    .padStart(8, '0');

  const protocolo = `LIQ-${new Date().getFullYear()}-${hashAutenticidade.slice(0, 6)}`;

  return {
    protocolo,
    dataHora: new Date().toISOString(),
    despachante: {
      ...despachante,
      saldo_devedor: saldoRestante,
    },
    valorLiquidado: valorPago,
    valorIssqnSegregado,
    meioPagamento: formaPdv,
    saldoAnterior,
    saldoRestante,
    operadorNome,
    itensQuitadosCount,
    faturaNumeroOriginal: faturaNumero || (todosIdsLiquidados.length > 1 ? `${todosIdsLiquidados.length} ordens liquidadas` : null),
    hashAutenticidade: `AUT-${hashAutenticidade}-${timestamp.toString().slice(-4)}`,
  };
}
