import { supabase } from './supabase';
import { paraCentavos, deCentavos } from './pdvCaixa';
import type {
  CaixaDiario,
  Despachante,
  FormaPagamento,
  LogTrocaOperador,
  MovimentacaoCaixa,
  StatusConferencia,
} from '../types/pdv';

/* ------------------------------- Tipos ----------------------------------- */

export type PeriodoRapido = 'hoje' | '7dias' | 'mes' | 'personalizado';
export type FiltroMeioPagamento = 'todos' | 'dinheiro' | 'pix' | 'cartoes' | 'faturamento';
export type FiltroStatusAta = 'todos' | 'divergentes' | 'exatos';

export interface FiltrosRelatorio {
  periodo: PeriodoRapido;
  dataInicial: string; // yyyy-mm-dd
  dataFinal: string; // yyyy-mm-dd
  operadorId: string; // '' = todos
  meioPagamento: FiltroMeioPagamento;
  statusAta: FiltroStatusAta;
}

export interface OperadorOpcao {
  id: string;
  nome: string;
}

export interface AtaFechamento extends CaixaDiario {
  operador_nome: string;
  operador_email: string;
  status_conferencia_efetivo: StatusConferencia;
}

export interface VendaRelatorio {
  id: string;
  criado_em: string;
  protocolo: string;
  operador_nome: string; // Titular do caixa
  operador_auditado_nome: string; // Quem efetuou a venda (Auditado por)
  operador_id: string;
  cliente: string;
  servico: string;
  forma_pagamento: FormaPagamento;
  valor: number;
  issqn: number;
}

export interface TotaisVendas {
  totalFaturado: number;
  quantidade: number;
  totalISSQN: number;
  ticketMedio: number;
}

export interface DadosRelatorios {
  operadores: OperadorOpcao[];
  atas: AtaFechamento[];
  vendas: VendaRelatorio[];
  transicoes: LogTrocaOperador[];
}

export const ALIQUOTA_ISSQN = 0.02;

/* ------------------------------ Utilitários ------------------------------ */

const pad = (n: number): string => String(n).padStart(2, '0');

export const paraInputDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Resolve o intervalo (datas locais yyyy-mm-dd) a partir do atalho de período. */
export function resolverPeriodo(
  periodo: PeriodoRapido,
  atual?: { dataInicial: string; dataFinal: string }
): { dataInicial: string; dataFinal: string } {
  const hoje = new Date();
  if (periodo === 'hoje') return { dataInicial: paraInputDate(hoje), dataFinal: paraInputDate(hoje) };
  if (periodo === '7dias') {
    const ini = new Date(hoje);
    ini.setDate(ini.getDate() - 6);
    return { dataInicial: paraInputDate(ini), dataFinal: paraInputDate(hoje) };
  }
  if (periodo === 'mes') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { dataInicial: paraInputDate(ini), dataFinal: paraInputDate(hoje) };
  }
  return atual ?? { dataInicial: paraInputDate(hoje), dataFinal: paraInputDate(hoje) };
}

export function filtrosIniciais(): FiltrosRelatorio {
  return {
    periodo: 'mes',
    ...resolverPeriodo('mes'),
    operadorId: '',
    meioPagamento: 'todos',
    statusAta: 'todos',
  };
}

/** Converte yyyy-mm-dd (local) em limites ISO [início do dia, fim do dia]. */
function limitesISO(dataInicial: string, dataFinal: string): { inicio: string; fim: string } {
  const [yi, mi, di] = dataInicial.split('-').map(Number);
  const [yf, mf, df] = dataFinal.split('-').map(Number);
  const inicio = new Date(yi, mi - 1, di, 0, 0, 0, 0);
  const fim = new Date(yf, mf - 1, df, 23, 59, 59, 999);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

export function calcularISSQN(valor: number): number {
  return deCentavos(Math.round(paraCentavos(valor) * ALIQUOTA_ISSQN));
}

export function calcularTotaisVendas(vendas: VendaRelatorio[]): TotaisVendas {
  const totalCent = vendas.reduce((acc, v) => acc + paraCentavos(v.valor), 0);
  const issqnCent = vendas.reduce((acc, v) => acc + paraCentavos(v.issqn), 0);
  const quantidade = vendas.length;
  return {
    totalFaturado: deCentavos(totalCent),
    quantidade,
    totalISSQN: deCentavos(issqnCent),
    ticketMedio: quantidade > 0 ? deCentavos(Math.round(totalCent / quantidade)) : 0,
  };
}

export const casaMeioPagamento = (forma: FormaPagamento, filtro: FiltroMeioPagamento): boolean => {
  if (filtro === 'todos') return true;
  if (filtro === 'cartoes') return forma === 'cartao_credito' || forma === 'cartao_debito';
  return forma === filtro;
};

export function statusEfetivo(c: CaixaDiario): StatusConferencia {
  if (c.status_conferencia) return c.status_conferencia;
  const dif = paraCentavos(c.diferenca);
  return dif === 0 ? 'exato' : dif < 0 ? 'quebra_caixa' : 'sobra_caixa';
}

/* ------------------------------- Consultas ------------------------------- */

/** Carrega, no período, os caixas, operadores, vendas e histórico de transições. */
export async function carregarRelatorios(filtros: FiltrosRelatorio): Promise<DadosRelatorios> {
  const { inicio, fim } = limitesISO(filtros.dataInicial, filtros.dataFinal);

  const { data: perfisData } = await supabase
    .from('perfis')
    .select('id, nome_completo, email_login');
  const perfis = new Map<string, { nome: string; email: string }>();
  (perfisData || []).forEach((p: any) => {
    perfis.set(p.id, { nome: p.nome_completo, email: p.email_login });
  });
  const nomeOperador = (id: string): string =>
    perfis.get(id)?.nome || `Operador #${id.slice(0, 6)}`;

  // 1. Atas: caixas fechados cujo fechamento ocorreu no período
  let qAtas = supabase
    .from('caixas_diarios')
    .select('*')
    .eq('status', 'fechado')
    .gte('data_fechamento', inicio)
    .lte('data_fechamento', fim)
    .order('data_fechamento', { ascending: false });
  if (filtros.operadorId) qAtas = qAtas.eq('operador_id', filtros.operadorId);
  const { data: atasData, error: errAtas } = await qAtas;
  if (errAtas) throw new Error(errAtas.message);

  const atas: AtaFechamento[] = ((atasData as CaixaDiario[]) || [])
    .map((c) => ({
      ...c,
      operador_nome: nomeOperador(c.operador_id),
      operador_email: perfis.get(c.operador_id)?.email || '',
      status_conferencia_efetivo: statusEfetivo(c),
    }))
    .filter((a) => {
      if (filtros.statusAta === 'exatos') return a.status_conferencia_efetivo === 'exato';
      if (filtros.statusAta === 'divergentes') return a.status_conferencia_efetivo !== 'exato';
      return true;
    });

  // 2. Transições de operador no período (logs_troca_operador)
  let transicoes: LogTrocaOperador[] = [];
  try {
    let qLogs = supabase
      .from('logs_troca_operador')
      .select('*')
      .gte('trocado_em', inicio)
      .lte('trocado_em', fim)
      .order('trocado_em', { ascending: false });

    if (filtros.operadorId) {
      qLogs = qLogs.or(`operador_anterior_id.eq.${filtros.operadorId},operador_novo_id.eq.${filtros.operadorId}`);
    }

    const { data: logsData, error: errLogs } = await qLogs;
    if (!errLogs && logsData) {
      transicoes = logsData as LogTrocaOperador[];
    }
  } catch (e) {
    console.warn('logs_troca_operador ainda não disponível ou sem registros:', e);
  }

  // 3. Vendas do período
  const { data: movsData, error: errMovs } = await supabase
    .from('movimentacoes_caixa')
    .select('*')
    .eq('tipo', 'venda')
    .gte('criado_em', inicio)
    .lte('criado_em', fim)
    .order('criado_em', { ascending: false });
  if (errMovs) throw new Error(errMovs.message);
  const movs = (movsData as MovimentacaoCaixa[]) || [];

  const caixaIds = Array.from(new Set(movs.map((m) => m.caixa_id)));
  const caixaOperador = new Map<string, string>();
  if (caixaIds.length > 0) {
    const { data: cxData } = await supabase
      .from('caixas_diarios')
      .select('id, operador_id')
      .in('id', caixaIds);
    ((cxData as any[]) || []).forEach((c) => caixaOperador.set(c.id, c.operador_id));
  }

  const { data: despData } = await supabase.from('despachantes').select('id, nome_razao');
  const despachantes = new Map<string, string>();
  ((despData as Pick<Despachante, 'id' | 'nome_razao'>[]) || []).forEach((d) =>
    despachantes.set(d.id, d.nome_razao)
  );

  // Mapeamento e identificação rigorosa de QUEM efetuou o lançamento
  const vendas: VendaRelatorio[] = movs
    .map((m) => {
      const partes = (m.descricao || '').split(' | ');
      const donoCaixaId = caixaOperador.get(m.caixa_id) || '';
      // Se houver operador_id gravado na movimentação, ele é quem auditou; caso contrário, fallback no dono do caixa
      const operadorEfetivoId = m.operador_id || donoCaixaId;
      const operadorAuditadoNome =
        m.operador_nome || (operadorEfetivoId ? nomeOperador(operadorEfetivoId) : '-');
      const donoCaixaNome = donoCaixaId ? nomeOperador(donoCaixaId) : '-';
      const valor = Number(m.valor) || 0;
      const cliente = m.despachante_id
        ? despachantes.get(m.despachante_id) || partes[1] || 'Despachante'
        : partes[1] || 'Consumidor';
      const valorIssqn =
        m.valor_issqn !== null && m.valor_issqn !== undefined
          ? Number(m.valor_issqn)
          : calcularISSQN(valor);

      return {
        id: m.id,
        criado_em: m.criado_em,
        protocolo: m.id.slice(0, 8).toUpperCase(),
        operador_id: operadorEfetivoId,
        operador_nome: donoCaixaNome,
        operador_auditado_nome: operadorAuditadoNome,
        cliente,
        servico: partes[0] || 'Venda de Balcão',
        forma_pagamento: m.forma_pagamento,
        valor,
        issqn: valorIssqn,
      };
    })
    .filter((v) => (filtros.operadorId ? v.operador_id === filtros.operadorId : true))
    .filter((v) => casaMeioPagamento(v.forma_pagamento, filtros.meioPagamento));

  // 4. Lista consolidada de operadores (para popular o dropdown de filtros)
  const setOperadoresIds = new Set<string>();
  (perfisData || []).forEach((p: any) => setOperadoresIds.add(p.id));
  movs.forEach((m) => {
    if (m.operador_id) setOperadoresIds.add(m.operador_id);
  });
  atas.forEach((a) => setOperadoresIds.add(a.operador_id));
  transicoes.forEach((t) => {
    if (t.operador_anterior_id) setOperadoresIds.add(t.operador_anterior_id);
    if (t.operador_novo_id) setOperadoresIds.add(t.operador_novo_id);
  });

  const operadores: OperadorOpcao[] = Array.from(setOperadoresIds)
    .map((id) => ({ id, nome: nomeOperador(id) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return { operadores, atas, vendas, transicoes };
}

/** Sangrias e suprimentos de um turno (detalhamento da ata). */
export async function listarSangriasSuprimentos(caixaId: string): Promise<MovimentacaoCaixa[]> {
  const { data, error } = await supabase
    .from('movimentacoes_caixa')
    .select('*')
    .eq('caixa_id', caixaId)
    .in('tipo', ['sangria', 'suprimento'])
    .order('criado_em', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as MovimentacaoCaixa[]) || [];
}

/** Hash SHA-256 (hex) para a assinatura digital da ata. */
export async function gerarHashAta(ata: AtaFechamento): Promise<string> {
  const payload = [
    ata.id,
    ata.operador_id,
    ata.data_abertura,
    ata.data_fechamento ?? '',
    ata.valor_abertura,
    ata.valor_fechamento_esperado ?? '',
    ata.valor_fechamento_informado ?? '',
    ata.diferenca ?? '',
  ].join('|');
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}
