import { supabase } from './supabase';
import type { CaixaDiario, Despachante, FormaPagamento, MovimentacaoCaixa } from '../types/pdv';
import { paraCentavos, deCentavos } from './pdvCaixa';

export interface ResumoDashboard {
  faturamentoBrutoDia: number;
  entradasFisicasGaveta: number;
  totalFaturadoB2B: number;
  terminaisAbertos: number;
  operadoresAtivos: string[];
  totalTerminaisHoje: number;
}

export interface MeioPagamentoResumo {
  forma: FormaPagamento;
  rotulo: string;
  valor: number;
  percentual: number;
  cor: string;
}

export interface DespachanteRanking {
  id: string;
  nome_razao: string;
  documento: string;
  telefone: string;
  total_consumido_mes: number;
  saldo_devedor_atual: number;
}

export interface CaixaAuditoria extends CaixaDiario {
  operador_nome?: string;
  operador_email?: string;
}

const CORES_PAGAMENTO: Record<FormaPagamento, string> = {
  dinheiro: '#10B981', // Emerald
  pix: '#14B8A6',      // Teal
  cartao_debito: '#3B82F6', // Blue
  cartao_credito: '#6366F1', // Indigo
  faturamento: '#F59E0B' // Amber
};

const ROTULOS_PAGAMENTO: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  faturamento: 'Faturamento A Prazo'
};

/**
 * Carrega todos os dados consolidados para o dashboard em tempo real
 */
export async function carregarDadosDashboard() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioDiaISO = hoje.toISOString();

  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioMesISO = inicioMes.toISOString();

  // 1. Caixas Diários (todos ou de hoje)
  const { data: caixasData, error: errCaixas } = await supabase
    .from('caixas_diarios')
    .select('*')
    .order('data_abertura', { ascending: false });

  if (errCaixas) throw errCaixas;
  const caixas: CaixaDiario[] = (caixasData as any) || [];

  // 2. Movimentações de Caixa (do mês para permitir cálculos diários e mensais)
  const { data: movsData, error: errMovs } = await supabase
    .from('movimentacoes_caixa')
    .select('*')
    .gte('criado_em', inicioMesISO)
    .order('criado_em', { ascending: false });

  if (errMovs) throw errMovs;
  const movimentacoes: MovimentacaoCaixa[] = (movsData as any) || [];

  // 3. Despachantes
  const { data: despData, error: errDesp } = await supabase
    .from('despachantes')
    .select('*')
    .order('saldo_devedor', { ascending: false });

  if (errDesp) throw errDesp;
  const despachantes: Despachante[] = (despData as any) || [];

  // 4. Perfis / Usuários (para enriquecer nome de operadores)
  const { data: perfisData } = await supabase
    .from('perfis')
    .select('id, nome_completo, email_login');
  const perfisMap = new Map<string, { nome: string; email: string }>();
  (perfisData || []).forEach((p: any) => {
    perfisMap.set(p.id, { nome: p.nome_completo, email: p.email_login });
  });

  // --- CÁLCULO DE KPIs DO DIA ---
  const movsHoje = movimentacoes.filter(m => m.criado_em >= inicioDiaISO);
  const vendasHoje = movsHoje.filter(m => m.tipo === 'venda');

  // Faturamento Bruto do Dia (todas as vendas)
  const faturamentoBrutoCent = vendasHoje.reduce((acc, m) => acc + paraCentavos(m.valor), 0);
  const faturamentoBrutoDia = deCentavos(faturamentoBrutoCent);

  // Total Faturado B2B do Dia
  const faturadoB2BCent = vendasHoje
    .filter(m => m.forma_pagamento === 'faturamento')
    .reduce((acc, m) => acc + paraCentavos(m.valor), 0);
  const totalFaturadoB2B = deCentavos(faturadoB2BCent);

  // Entradas Físicas em Gaveta:
  // Saldo em dinheiro vivo nos caixas de hoje = Fundos de abertura dos caixas abertos/criados hoje
  // + vendas em dinheiro - sangrias + suprimentos de hoje
  const caixasHoje = caixas.filter(c => c.data_abertura >= inicioDiaISO);
  let gavetaCent = caixasHoje.reduce((acc, c) => acc + paraCentavos(c.valor_abertura), 0);
  movsHoje.forEach(m => {
    const vCent = paraCentavos(m.valor);
    if (m.tipo === 'sangria') gavetaCent -= vCent;
    else if (m.forma_pagamento === 'dinheiro') gavetaCent += vCent; // venda | suprimento | liquidacao_fatura
  });
  const entradasFisicasGaveta = deCentavos(gavetaCent);

  // Status de Terminais
  const caixasAbertosAgora = caixas.filter(c => c.status === 'aberto');
  const operadoresAtivosSet = new Set<string>();
  caixasAbertosAgora.forEach(c => {
    const info = perfisMap.get(c.operador_id);
    operadoresAtivosSet.add(info ? info.nome : `Operador #${c.operador_id.slice(0, 5)}`);
  });

  const resumo: ResumoDashboard = {
    faturamentoBrutoDia,
    entradasFisicasGaveta,
    totalFaturadoB2B,
    terminaisAbertos: caixasAbertosAgora.length,
    operadoresAtivos: Array.from(operadoresAtivosSet),
    totalTerminaisHoje: caixasHoje.length
  };

  // --- DISTRIBUIÇÃO MEIOS DE PAGAMENTO (DONUT) ---
  const totaisPorForma: Record<FormaPagamento, number> = {
    dinheiro: 0,
    pix: 0,
    cartao_debito: 0,
    cartao_credito: 0,
    faturamento: 0
  };

  vendasHoje.forEach(m => {
    if (totaisPorForma[m.forma_pagamento] !== undefined) {
      totaisPorForma[m.forma_pagamento] += paraCentavos(m.valor);
    }
  });

  const formasGrafico: MeioPagamentoResumo[] = (Object.keys(totaisPorForma) as FormaPagamento[]).map(f => {
    const v = deCentavos(totaisPorForma[f]);
    const pct = faturamentoBrutoDia > 0 ? (v / faturamentoBrutoDia) * 100 : 0;
    return {
      forma: f,
      rotulo: ROTULOS_PAGAMENTO[f],
      valor: v,
      percentual: Number(pct.toFixed(1)),
      cor: CORES_PAGAMENTO[f]
    };
  });

  // --- RANKING TOP 10 DESPACHANTES NO MÊS ---
  // Consumo no mês: soma de vendas vinculadas ao despachante desde inicioMesISO
  const consumoMap = new Map<string, number>();
  movimentacoes
    .filter(m => m.tipo === 'venda' && m.despachante_id)
    .forEach(m => {
      const id = m.despachante_id!;
      const atual = consumoMap.get(id) || 0;
      consumoMap.set(id, atual + paraCentavos(m.valor));
    });

  const rankingDespachantes: DespachanteRanking[] = despachantes
    .map(d => ({
      id: d.id,
      nome_razao: d.nome_razao || (d as any).razao_social || 'Sem Razão Social',
      documento: d.documento || (d as any).cnpj || '',
      telefone: d.telefone || '',
      total_consumido_mes: deCentavos(consumoMap.get(d.id) || 0),
      saldo_devedor_atual: Number(d.saldo_devedor) || 0
    }))
    .sort((a, b) => b.total_consumido_mes - a.total_consumido_mes)
    .slice(0, 10);

  // --- AUDITORIA DE FECHAMENTOS RECENTES ---
  const caixasFechados: CaixaAuditoria[] = caixas
    .filter(c => c.status === 'fechado')
    .slice(0, 15)
    .map(c => {
      const p = perfisMap.get(c.operador_id);
      return {
        ...c,
        operador_nome: p ? p.nome : `Operador #${c.operador_id.slice(0, 6)}`,
        operador_email: p ? p.email : ''
      };
    });

  return {
    resumo,
    formasGrafico,
    rankingDespachantes,
    caixasFechados,
    ultimaAtualizacao: new Date()
  };
}
