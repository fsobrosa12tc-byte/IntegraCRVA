import { supabase } from './supabase';
import type {
  Despachante,
  FaturaDespachantePendente,
  FormaPagamento,
  ItemFaturamentoDespachante,
  ReciboFaturamentoDespachante,
} from '../types/pdv';
import {
  deCentavos,
  paraCentavos,
  registrarMovimentacao,
  registrarMovimentacaoCaixa,
  atualizarMovimentacoesResiliente,
  inserirMovimentacaoResiliente,
} from './pdvCaixa';
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
  servicos?: ItemFaturamentoDespachante[];
  subtotalServicos?: number;
  clienteNome?: string | null;
  clienteDocumento?: string | null;
  veiculoPlaca?: string | null;
  veiculoModelo?: string | null;
  /** Aviso secundário: a quitação foi concluída, mas a gravação de auditoria no caixa falhou. */
  avisoAuditoria?: string | null;
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
const STORAGE_FATURAS_BALCAO_KEY = 'integra_faturas_despachantes_balcao';

export function obterFaturasBalcaoLocal(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_FATURAS_BALCAO_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function salvarFaturaBalcaoLocal(fatura: any): void {
  if (typeof window === 'undefined' || !fatura) return;
  try {
    const lista = obterFaturasBalcaoLocal();
    const idx = lista.findIndex((x) => x.id === fatura.id);
    if (idx >= 0) {
      lista[idx] = fatura;
    } else {
      lista.unshift(fatura);
    }
    localStorage.setItem(STORAGE_FATURAS_BALCAO_KEY, JSON.stringify(lista));
  } catch {
    // quota
  }
}

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
 * Extrai e normaliza itens de serviços a partir de um registro bruto (movimentações_caixa, comanda ou storage).
 */
export function normalizarItensServicos(raw: any, valorFallback?: number): ItemFaturamentoDespachante[] {
  let itens: any[] = [];
  if (Array.isArray(raw?.servicos) && raw.servicos.length > 0) {
    itens = raw.servicos;
  } else if (Array.isArray(raw?.itens) && raw.itens.length > 0) {
    itens = raw.itens;
  } else if (typeof raw?.servicos === 'string') {
    try {
      const parsed = JSON.parse(raw.servicos);
      if (Array.isArray(parsed)) itens = parsed;
    } catch {}
  } else if (typeof raw?.itens === 'string') {
    try {
      const parsed = JSON.parse(raw.itens);
      if (Array.isArray(parsed)) itens = parsed;
    } catch {}
  }

  if (itens.length > 0) {
    return itens.map((it, idx) => {
      const qtd = Number(it.quantidade || it.qtd || 1);
      const sub = Number(it.subtotal || (Number(it.valor_unitario || it.valor || 0) * qtd));
      const unit = Number(it.valor_unitario || it.valor || (qtd > 0 ? sub / qtd : sub));
      return {
        codigo: it.codigo || it.cod || `SRV-${String(idx + 1).padStart(4, '0')}`,
        servico: it.servico || it.nome || it.descricao || 'Serviço Notarial / Balcão CRVA',
        quantidade: qtd,
        valor_unitario: Math.round(unit * 100) / 100,
        subtotal: Math.round(sub * 100) / 100,
      };
    });
  }

  // Fallback 1: se houver texto em `descricao` ou `resumoServicos` (NUNCA usar número de protocolo/recibo como descrição)
  const texto = raw?.descricao || raw?.resumoServicos || '';
  const parteDesc = texto.split(' | ')[0]?.trim() || '';
  const pareceCodigoRecibo = /^#?(REC|FT|LIQ|CMD)[-\s0-9A-Z]+(\s*,\s*#?(REC|FT|LIQ|CMD)[-\s0-9A-Z]+)*$/i.test(parteDesc);
  if (parteDesc && !pareceCodigoRecibo && !parteDesc.toLowerCase().includes('saldo faturado')) {
    const segmentos = parteDesc.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (segmentos.length > 0) {
      const valorTotal = Number(valorFallback || raw?.valor || raw?.valor_total || 0);
      const subtotalBase = Math.round((valorTotal / 1.02) * 100) / 100;
      const valorPorItem = Math.round((subtotalBase / segmentos.length) * 100) / 100;

      return segmentos.map((seg: string, idx: number) => {
        const matchQtd = seg.match(/^(\d+)x\s*(.+)$/i);
        const qtd = matchQtd ? Number(matchQtd[1]) : 1;
        const nome = matchQtd ? matchQtd[2].trim() : seg;
        return {
          codigo: `SRV-${String(idx + 1).padStart(4, '0')}`,
          servico: nome,
          quantidade: qtd,
          valor_unitario: Math.round((valorPorItem / qtd) * 100) / 100,
          subtotal: valorPorItem,
        };
      });
    }
  }

  // Fallback 2: Item genérico padrão
  const total = Number(valorFallback || raw?.valor || raw?.valor_total || 0);
  const subtotalPadrao = Math.round((total / 1.02) * 100) / 100;
  return [
    {
      codigo: 'SRV-0001',
      servico: (!pareceCodigoRecibo && parteDesc) ? parteDesc : 'Serviços Notariais / Balcão CRVA',
      quantidade: 1,
      valor_unitario: subtotalPadrao,
      subtotal: subtotalPadrao,
    },
  ];
}

/**
 * Consolida uma lista de itens somando quantidades e subtotais
 * para itens com o mesmo código ou mesmo nome de serviço.
 */
export function consolidarItensServicos(itens: ItemFaturamentoDespachante[]): ItemFaturamentoDespachante[] {
  const mapa = new Map<string, ItemFaturamentoDespachante>();

  for (const item of itens) {
    if (!item.servico) continue;
    const chave = item.codigo && !item.codigo.startsWith('SRV-000')
      ? item.codigo.trim().toUpperCase()
      : item.servico.trim().toLowerCase();

    const existente = mapa.get(chave);
    if (existente) {
      existente.quantidade += Number(item.quantidade || 1);
      existente.subtotal = Math.round((existente.subtotal + Number(item.subtotal || 0)) * 100) / 100;
      if (existente.quantidade > 0) {
        existente.valor_unitario = Math.round((existente.subtotal / existente.quantidade) * 100) / 100;
      }
    } else {
      mapa.set(chave, {
        codigo: item.codigo || `SRV-${String(mapa.size + 1).padStart(4, '0')}`,
        servico: item.servico.trim(),
        quantidade: Number(item.quantidade || 1),
        valor_unitario: Number(item.valor_unitario || item.subtotal || 0),
        subtotal: Number(item.subtotal || 0),
      });
    }
  }

  return Array.from(mapa.values());
}

// ============================================================================
// REGRA DE AUDITORIA FISCAL CRVA - NÃO ALTERAR
// Garante que toda ordem de faturamento de despachante preserve sua identidade
// fiscal imutável (numero_recibo #REC-...), seus atos discriminados reais,
// seus valores e o vínculo de auditoria (cliente final, CPF/CNPJ e placa).
// ============================================================================
export function mapOrdemDespachanteParaPdv(ordemRaw: any): FaturaDespachantePendente {
  if (!ordemRaw) {
    throw new Error('Registro de ordem de despachante inválido para mapeamento.');
  }

  const id = String(ordemRaw.id || ordemRaw.fatura_id || '').trim();
  const dataHora = ordemRaw.criado_em || ordemRaw.dataHora || ordemRaw.created_at || new Date().toISOString();
  const ano = new Date(dataHora).getFullYear() || new Date().getFullYear();

  // Metadados de redundância auditada (gravados no Balcão)
  const auditoriaJson = ordemRaw.dados_auditoria || ordemRaw.snapshot_ata || ordemRaw.metadados || null;

  // 1. PROTOCOLO REAL (#REC-2026-XXXXXX) — IMUTABILIDADE ABSOLUTA
  // PROIBIÇÃO ESTRITA: NUNCA substituir o número de recibo original por códigos sintéticos (#FT-...)
  const candidatosRecibo = [
    ordemRaw.numero_recibo,
    ordemRaw.protocolo_recibo,
    ordemRaw.numeroRecibo,
    ordemRaw.fatura_numero,
    ordemRaw.protocolo,
    ordemRaw.id_transacao,
    auditoriaJson?.numero_recibo,
    auditoriaJson?.protocolo_recibo,
    Array.isArray(ordemRaw.servicos) ? ordemRaw.servicos[0]?.numero_recibo : null,
  ];

  let protocoloEncontrado: string | null = null;
  for (const cand of candidatosRecibo) {
    if (typeof cand === 'string' && cand.trim().length > 0) {
      const limpo = cand.trim();
      if (!limpo.toLowerCase().includes('saldo faturado')) {
        protocoloEncontrado = limpo;
        break;
      }
    }
  }

  // Se ainda não encontrou, tenta regex na descrição: "Recibo: #REC-2026-XXXXXX"
  if (!protocoloEncontrado && typeof ordemRaw.descricao === 'string') {
    const matchDescRec = ordemRaw.descricao.match(/(?:Recibo|Protocolo):\s*(#?REC-[0-9A-Z-]+)/i);
    if (matchDescRec) {
      protocoloEncontrado = matchDescRec[1].trim();
    }
  }

  let numeroReciboFinal: string;
  if (protocoloEncontrado) {
    numeroReciboFinal = `#${protocoloEncontrado.replace(/^#+/, '')}`;
  } else if (id && !id.startsWith('saldo-anterior-')) {
    const code = id.replace(/-/g, '').slice(0, 6).toUpperCase();
    numeroReciboFinal = `#REC-${ano}-${code}`;
  } else {
    const despCode = String(ordemRaw.despachante_id || ordemRaw.despachanteId || '0000').replace(/-/g, '').slice(0, 6).toUpperCase();
    numeroReciboFinal = `#REC-${ano}-${despCode}`;
  }

  // 2. APURAÇÃO FINANCEIRA E TRIBUTÁRIA COM FIDELIDADE DE CENTAVOS
  const valorTotal = Math.round(Number(ordemRaw.valorTotal ?? ordemRaw.valor ?? ordemRaw.valor_total ?? auditoriaJson?.valor_total ?? 0) * 100) / 100;
  let subtotal = Number(ordemRaw.subtotal ?? auditoriaJson?.subtotal ?? 0);
  let valorIssqn = Number(ordemRaw.valor_issqn ?? ordemRaw.valorIssqn ?? auditoriaJson?.valor_issqn ?? 0);

  if (subtotal <= 0) {
    subtotal = Math.round((valorTotal / 1.02) * 100) / 100;
  }
  if (valorIssqn <= 0 && valorTotal > 0) {
    valorIssqn = Math.round((valorTotal - subtotal) * 100) / 100;
  }
  const valorBruto = Number(ordemRaw.valor_bruto ?? ordemRaw.valorBruto ?? auditoriaJson?.valor_bruto ?? valorTotal);

  // 3. ATOS / SERVIÇOS DISCRIMINADOS REAIS (ZERO PLACEHOLDERS GENÉRICOS)
  const servicosRaw = ordemRaw.servicos || ordemRaw.itens || auditoriaJson?.servicos || auditoriaJson?.itens;
  const servicos = normalizarItensServicos({ ...ordemRaw, servicos: servicosRaw }, valorTotal);

  // Resumo de serviços: construir a partir dos itens reais, ou limpar texto evitando códigos de recibo
  let resumoServicos: string;
  if (servicos.length > 0) {
    const ehApenasGenerico =
      servicos.length === 1 &&
      (servicos[0].codigo === 'SRV-0001' || servicos[0].servico.toLowerCase().includes('saldo faturado'));

    if (!ehApenasGenerico) {
      resumoServicos = servicos
        .map((it) => (it.quantidade > 1 ? `${it.quantidade}x ${it.servico}` : it.servico))
        .join(', ');
    } else {
      const textoDesc = (ordemRaw.descricao || ordemRaw.resumoServicos || ordemRaw.servico_operacao || '')
        .split(' | ')[0]
        ?.trim();
      const pareceCodigo = /^#?(REC|FT|LIQ|CMD)[-\s0-9A-Z]+$/i.test(textoDesc);
      resumoServicos = textoDesc && !pareceCodigo && !textoDesc.toLowerCase().includes('saldo faturado')
        ? textoDesc
        : 'Serviços Notariais / Balcão CRVA';
    }
  } else {
    resumoServicos = 'Serviços Notariais / Balcão CRVA';
  }

  // 4. VÍNCULO OPCIONAL DE AUDITORIA (CLIENTE FINAL, CPF/CNPJ E PLACA)
  let clienteFinalNome = (
    ordemRaw.cliente_final_nome ||
    ordemRaw.cliente_nome ||
    ordemRaw.clienteFinalNome ||
    ordemRaw.tomador_cliente_final ||
    auditoriaJson?.cliente_final_nome ||
    (Array.isArray(ordemRaw.servicos) ? ordemRaw.servicos[0]?.cliente_final_nome : null) ||
    ''
  ).trim() || null;

  let clienteFinalDocumento = (
    ordemRaw.cliente_final_cpf_cnpj ||
    ordemRaw.cliente_documento ||
    ordemRaw.clienteFinalDocumento ||
    auditoriaJson?.cliente_final_cpf_cnpj ||
    (Array.isArray(ordemRaw.servicos) ? ordemRaw.servicos[0]?.cliente_final_cpf_cnpj : null) ||
    ''
  ).trim() || null;

  let veiculoPlaca = (
    ordemRaw.placa_veiculo ||
    ordemRaw.veiculo_placa ||
    ordemRaw.placa ||
    ordemRaw.veiculoPlaca ||
    auditoriaJson?.placa_veiculo ||
    (Array.isArray(ordemRaw.servicos) ? ordemRaw.servicos[0]?.placa_veiculo : null) ||
    ''
  ).trim().toUpperCase() || null;

  // Fallbacks adicionais de regex na descrição caso gravado como string composta
  if (typeof ordemRaw.descricao === 'string') {
    if (!clienteFinalNome) {
      const mCli = ordemRaw.descricao.match(/Cliente:\s*([^|]+)/i);
      if (mCli) clienteFinalNome = mCli[1].trim();
    }
    if (!clienteFinalDocumento) {
      const mDoc = ordemRaw.descricao.match(/(?:CPF\/CNPJ|Doc):\s*([^|]+)/i);
      if (mDoc) clienteFinalDocumento = mDoc[1].trim();
    }
    if (!veiculoPlaca) {
      const mPlaca = ordemRaw.descricao.match(/Placa:\s*([A-Z0-9-]{7,8})/i);
      if (mPlaca) veiculoPlaca = mPlaca[1].trim().toUpperCase();
    }
  }

  // 5. DADOS DO DESPACHANTE E CAIXA
  const despachanteId = String(ordemRaw.despachante_id || ordemRaw.despachanteId || auditoriaJson?.despachante_id || '').trim();
  const despachanteNome = String(
    ordemRaw.despachante_nome ||
    ordemRaw.despachanteNome ||
    ordemRaw.despachante?.nome_razao ||
    ordemRaw.tomador_cliente ||
    auditoriaJson?.despachante_nome ||
    'Despachante Parceiro'
  ).trim();

  const despachanteDocumento = mascararDocumento(
    ordemRaw.despachante_documento ||
    ordemRaw.despachanteDocumento ||
    ordemRaw.despachante?.documento ||
    auditoriaJson?.despachante_documento ||
    ''
  );

  const caixaId = String(ordemRaw.caixa_id || ordemRaw.caixaId || '').trim();

  return {
    id,
    numeroRecibo: numeroReciboFinal,
    numeroReciboOriginal: numeroReciboFinal,
    dataHora,
    despachanteId,
    despachanteNome,
    despachanteDocumento,
    resumoServicos,
    subtotal,
    valorTotal,
    valorBruto,
    valorIssqn,
    caixaId,
    servicos,
    clienteFinalNome,
    clienteFinalDocumento,
    veiculoPlaca,
  };
}

export const normalizarOrdemDespachante = mapOrdemDespachanteParaPdv;

/**
 * Recupera de forma assíncrona os serviços vinculados às ordens/faturas selecionadas
 * consultando `movimentacoes_caixa`, `comandas_balcao`, cache local e fallback.
 */
export async function recuperarServicosOrdensLiquidadas(params: {
  faturasIds?: string[];
  ordensFallback?: FaturaDespachantePendente[];
  resumoFallback?: string;
  valorTotalFallback?: number;
}): Promise<ItemFaturamentoDespachante[]> {
  const { faturasIds = [], ordensFallback = [], resumoFallback, valorTotalFallback } = params;
  const todosItens: ItemFaturamentoDespachante[] = [];

  // 1. Itens já presentes em ordensFallback
  for (const o of ordensFallback) {
    if (o.servicos && o.servicos.length > 0) {
      todosItens.push(...o.servicos);
    }
  }

  // 2. Faturas salvas localmente no localStorage
  const faturasLocais = obterFaturasBalcaoLocal();
  for (const fl of faturasLocais) {
    if (faturasIds.includes(fl.id)) {
      const itensFl = normalizarItensServicos(fl, fl.valor);
      todosItens.push(...itensFl);
    }
  }

  // 3. Consultar no Supabase tabelas `movimentacoes_caixa` e `comandas_balcao`
  const idsFiltrados = faturasIds.filter((id) => id && !id.startsWith('saldo-anterior-'));
  if (idsFiltrados.length > 0) {
    try {
      const { data: movs } = await supabase
        .from('movimentacoes_caixa')
        .select('*')
        .in('id', idsFiltrados);

      if (movs && movs.length > 0) {
        for (const m of movs) {
          const itensMov = normalizarItensServicos(m, m.valor || m.valor_total);
          todosItens.push(...itensMov);
        }
      }
    } catch (e) {
      console.warn('Aviso: busca em movimentacoes_caixa:', e);
    }

    try {
      const { data: comandas } = await supabase
        .from('comandas_balcao')
        .select('*')
        .in('id', idsFiltrados);

      if (comandas && comandas.length > 0) {
        for (const c of comandas) {
          const itensComanda = normalizarItensServicos(c, c.valor_total || c.subtotal);
          todosItens.push(...itensComanda);
        }
      }
    } catch (e) {
      console.warn('Aviso: busca em comandas_balcao:', e);
    }
  }

  // 4. Se encontrou itens, consolida e retorna
  if (todosItens.length > 0) {
    return consolidarItensServicos(todosItens);
  }

  // 5. Fallback com o resumo dos serviços e valor total
  return normalizarItensServicos({ descricao: resumoFallback }, valorTotalFallback);
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
    .in('tipo', ['venda', 'faturamento_despachante'])
    .order('criado_em', { ascending: false });

  if (error) {
    console.warn('Erro ao buscar lançamentos do despachante:', error);
  }

  const idsLocal = obterIdsLiquidadosLocal();
  const faturasLocal = obterFaturasBalcaoLocal().filter(
    (f) => f.despachante_id === despachanteId && f.fatura_liquidada !== true && !idsLocal.has(f.id)
  );

  const listaBanco = ((data as any[]) || []).filter(
    (m) => m.fatura_liquidada !== true && !idsLocal.has(m.id)
  );

  const mapa = new Map<string, any>();
  [...listaBanco, ...faturasLocal].forEach((m) => {
    if (m && m.id && !mapa.has(m.id)) {
      mapa.set(m.id, m);
    }
  });

  return Array.from(mapa.values()).map((m) => {
    const ordemNorm = normalizarOrdemDespachante({
      ...m,
      despachante_id: m.despachante_id,
      caixa_id: m.caixa_id,
    });
    return {
      id: m.id,
      data: m.criado_em,
      descricao: ordemNorm.resumoServicos,
      numero_os: ordemNorm.numeroRecibo,
      valor: ordemNorm.valorTotal,
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
      .in('tipo', ['venda', 'faturamento_despachante'])
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

    // Mescla lançamentos do balcão (enriquecendo ordens do banco com servicos e vínculo de auditoria caso ausentes no schema)
    const faturasLocal = obterFaturasBalcaoLocal();
    const mapaLocalPorIdOuRecibo = new Map<string, any>();
    faturasLocal.forEach((fl) => {
      if (fl?.id) mapaLocalPorIdOuRecibo.set(fl.id, fl);
      if (fl?.numero_recibo) mapaLocalPorIdOuRecibo.set(fl.numero_recibo, fl);
    });

    movsPorDespachante.forEach((lista, despId) => {
      const enriquecida = lista.map((m) => {
        const localMatch =
          mapaLocalPorIdOuRecibo.get(m.id) ||
          (m.numero_recibo ? mapaLocalPorIdOuRecibo.get(m.numero_recibo) : null) ||
          (m.protocolo_recibo ? mapaLocalPorIdOuRecibo.get(m.protocolo_recibo) : null);
        if (!localMatch) return m;
        return {
          ...m,
          servicos: Array.isArray(m.servicos) && m.servicos.length > 0 ? m.servicos : localMatch.servicos,
          cliente_final_nome: m.cliente_final_nome || m.cliente_nome || localMatch.cliente_final_nome || localMatch.cliente_nome || null,
          cliente_final_cpf_cnpj: m.cliente_final_cpf_cnpj || m.cliente_documento || localMatch.cliente_final_cpf_cnpj || localMatch.cliente_documento || null,
          placa_veiculo: m.placa_veiculo || m.veiculo_placa || localMatch.placa_veiculo || localMatch.veiculo_placa || null,
        };
      });
      movsPorDespachante.set(despId, enriquecida);
    });

    faturasLocal.forEach((m) => {
      if (m.fatura_liquidada === true || idsLocal.has(m.id)) return;
      if (!m.despachante_id || !idsComSaldo.includes(m.despachante_id)) return;
      const lista = movsPorDespachante.get(m.despachante_id) || [];
      if (!lista.some((x) => x.id === m.id || (m.numero_recibo && x.numero_recibo === m.numero_recibo))) {
        lista.push(m);
        movsPorDespachante.set(m.despachante_id, lista);
      }
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

        const valorMov = Number(m.valor) || Number(m.valor_total) || 0;
        const valorMovCent = paraCentavos(valorMov);
        if (valorMovCent <= 0) continue;

        // Se a ordem cabe dentro do saldo devedor restante (ou se é a última parcela em aberto)
        const valorEfetivoCent = Math.min(valorMovCent, saldoDevedorCent - acumuladoCent);
        const valorEfetivo = deCentavos(valorEfetivoCent);

        // REGRA CRÍTICA DE AUDITORIA:
        // Usa exclusivamente normalizarOrdemDespachante para preservar #REC-2026-XXXXXX original,
        // atos discriminados reais e vínculo de auditoria (cliente final, CPF/CNPJ e placa)
        const ordemNormalizada = normalizarOrdemDespachante({
          ...m,
          valor: valorEfetivo,
          valor_total: valorEfetivo,
          despachante_id: d.id,
          despachante_nome: d.nome_razao,
          despachante_documento: d.documento,
        });

        ordens.push(ordemNormalizada);
        acumuladoCent += valorEfetivoCent;
      }

      // Caso o despachante possua saldo devedor anterior não rastreado em ordens recentes
      if (ordens.length === 0 && saldoDevedorCent > 0) {
        const valorSaldo = deCentavos(saldoDevedorCent);
        const ano = new Date().getFullYear();
        const code = d.id.replace(/-/g, '').slice(0, 6).toUpperCase();

        // Tenta recuperar do histórico de faturas do balcão para reaproveitar o #REC real e os atos faturados
        const faturaBalcaoHist = faturasLocal.find((fl) => fl.despachante_id === d.id);
        const itensSaldo = faturaBalcaoHist ? normalizarItensServicos(faturaBalcaoHist, valorSaldo) : undefined;
        const numReciboBalcao = faturaBalcaoHist?.numero_recibo || faturaBalcaoHist?.protocolo_recibo;

        ordens.push(
          normalizarOrdemDespachante({
            id: `saldo-anterior-${d.id}`,
            numero_recibo: numReciboBalcao || `#REC-${ano}-${code}`,
            criado_em: d.criado_em || new Date().toISOString(),
            despachante_id: d.id,
            despachante_nome: d.nome_razao,
            despachante_documento: d.documento || '',
            servicos: itensSaldo,
            descricao: faturaBalcaoHist?.descricao || 'Serviços Notariais / Balcão CRVA',
            valor: valorSaldo,
            valor_total: valorSaldo,
            cliente_final_nome: faturaBalcaoHist?.cliente_final_nome || null,
            cliente_final_cpf_cnpj: faturaBalcaoHist?.cliente_final_cpf_cnpj || null,
            placa_veiculo: faturaBalcaoHist?.placa_veiculo || null,
          })
        );
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
  servicos?: ItemFaturamentoDespachante[];
  resumoServicosFallback?: string | null;
  clienteNome?: string | null;
  clienteDocumento?: string | null;
  veiculoPlaca?: string | null;
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
    servicos = [],
    resumoServicosFallback = null,
    clienteNome = null,
    clienteDocumento = null,
    veiculoPlaca = null,
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

  // 2. Marcar as ordens/faturas correspondentes como QUITADAS (banco + cache local)
  //    Usa apenas colunas existentes: fatura_liquidada / status; data_quitacao e forma_pagamento_quitacao
  //    são opcionais (removidas automaticamente se o schema não as possuir).
  //    IMPORTANTE: NÃO sobrescreve `forma_pagamento` da ordem ('faturamento'), pois isso duplicaria o KPI do turno.
  const todosIdsLiquidados = Array.from(
    new Set([...(faturasIds || []), ...(faturaId ? [faturaId] : [])].filter((id) => id && !id.startsWith('saldo-anterior-')))
  );

  const dataQuitacaoIso = new Date().toISOString();
  const formaPdv: FormaPagamento =
    formaPagamento === 'transferencia' ? 'pix' : formaPagamento;
  const patchQuitacao = {
    fatura_liquidada: true,
    status: 'QUITADA',
    data_quitacao: dataQuitacaoIso,
    forma_pagamento_quitacao: formaPdv,
  };

  if (todosIdsLiquidados.length > 0) {
    registrarIdsLiquidadosLocal(todosIdsLiquidados);
    try {
      const { error: errQuit } = await atualizarMovimentacoesResiliente(todosIdsLiquidados, patchQuitacao);
      if (errQuit) console.warn('Aviso: não foi possível marcar ordens como QUITADA no banco:', errQuit.message);
    } catch (e) {
      console.warn('Aviso: marcação de ordens QUITADAS:', e);
    }
  } else if (novoSaldoCent === 0) {
    // Se liquidou 100% da conta, marca todas as movimentações faturadas deste despachante como quitadas
    try {
      const { data: movsDesp } = await supabase
        .from('movimentacoes_caixa')
        .select('id')
        .eq('despachante_id', despachante.id)
        .eq('forma_pagamento', 'faturamento')
        .in('tipo', ['venda', 'faturamento_despachante']);
      const ids = ((movsDesp as any[]) || []).map((m) => m.id);
      if (ids.length > 0) {
        registrarIdsLiquidadosLocal(ids);
        await atualizarMovimentacoesResiliente(ids, patchQuitacao);
      }
    } catch {
      // ignora se colunas opcionais ausentes
    }
  }

  // Cálculo segregado de ISSQN (2,00% sobre serviços)
  const valorIssqnSegregado = Math.round(valorPago * 2) / 100;
  const descNumero = faturaNumero ? ` ${faturaNumero}` : todosIdsLiquidados.length > 1 ? ` (${todosIdsLiquidados.length} ordens)` : '';
  const descOperacao = `Quitação Fatura${descNumero} | Despachante: ${despachante.nome_razao}`;

  // Protocolo / hash de autenticidade — PRESERVA O NÚMERO DE RECIBO ORIGINAL DO ATENDIMENTO
  const timestamp = Date.now();
  const rawHash = `${despachante.id}-${timestamp}-${valorPago.toFixed(2)}`;
  const hashAutenticidade = Array.from(rawHash)
    .reduce((hash, char) => 0 | (31 * hash + char.charCodeAt(0)), 0)
    .toString(16)
    .toUpperCase()
    .replace('-', '')
    .padStart(8, '0');

  const recibosOriginaisLimpos = (faturaNumero || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `#${s.replace(/^#+/, '')}`);

  // Se faturaNumero não veio ou veio genérico, recupera das ordens liquidadas no cache local
  let recibosEncontrados: string[] = recibosOriginaisLimpos;
  if (recibosEncontrados.length === 0 && todosIdsLiquidados.length > 0) {
    const fLocais = obterFaturasBalcaoLocal();
    for (const fl of fLocais) {
      if (todosIdsLiquidados.includes(fl.id) && (fl.numero_recibo || fl.protocolo_recibo)) {
        const num = fl.numero_recibo || fl.protocolo_recibo;
        const formatado = `#${num.replace(/^#+/, '')}`;
        if (!recibosEncontrados.includes(formatado)) {
          recibosEncontrados.push(formatado);
        }
      }
    }
  }

  const protocoloOriginal =
    recibosEncontrados.length === 1
      ? recibosEncontrados[0]
      : recibosEncontrados.length > 1
      ? recibosEncontrados[0]
      : `#REC-${new Date().getFullYear()}-${hashAutenticidade.slice(0, 6)}`;

  const faturaReferenciaOriginal =
    recibosEncontrados.length > 0
      ? recibosEncontrados.join(', ')
      : todosIdsLiquidados.length > 1
      ? `${todosIdsLiquidados.length} ordens liquidadas`
      : null;

  const protocolo = protocoloOriginal;

  // 3. Entrada no caixa (movimentacoes_caixa): UMA única gravação, tipo 'liquidacao_fatura',
  //    forma de pagamento canônica (pix | cartao_debito | cartao_credito | dinheiro) e SOMENTE colunas válidas.
  //    Falha secundária de auditoria NÃO desfaz a quitação já efetivada (saldo + ordens): vira aviso no recibo.
  let avisoAuditoria: string | null = null;
  try {
    await registrarMovimentacao({
      caixa_id: caixaId,
      tipo: 'liquidacao_fatura',
      valor: valorPago,
      forma_pagamento: formaPdv,
      despachante_id: despachante.id,
      operador_id: operadorId,
      operador_nome: operadorNome,
      valor_bruto: valorPago,
      valor_issqn: valorIssqnSegregado,
      descricao: descOperacao,
      protocolo_recibo: protocolo,
    });
  } catch (e: any) {
    avisoAuditoria = e?.message || 'Falha ao registrar a entrada no caixa (auditoria).';
    console.error('[liquidarFaturaDespachante] Quitação concluída, porém o lançamento de auditoria falhou:', e);
  }

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

  // Atualiza faturas no storage local se existirem
  const faturasLocais = obterFaturasBalcaoLocal();
  if (faturasLocais.length > 0) {
    const atualizadas = faturasLocais.map((f) => {
      if (todosIdsLiquidados.includes(f.id) || (novoSaldoCent === 0 && f.despachante_id === despachante.id)) {
        return { ...f, fatura_liquidada: true, status: 'QUITADA' };
      }
      return f;
    });
    localStorage.setItem(STORAGE_FATURAS_BALCAO_KEY, JSON.stringify(atualizadas));
  }

  // 4. Recuperação e Consolidação de Serviços Vinculados (NUNCA usar número da fatura como descrição)
  const servicosLiquidados = servicos && servicos.length > 0
    ? consolidarItensServicos(servicos)
    : await recuperarServicosOrdensLiquidadas({
        faturasIds: todosIdsLiquidados,
        resumoFallback: resumoServicosFallback || undefined,
        valorTotalFallback: valorPago,
      });

  // 4.1 Recuperação do Vínculo de Auditoria (Cliente Final, CPF/CNPJ e Placa) das ordens liquidadas
  let cliFinalNome: string | null = clienteNome?.trim() || null;
  let cliFinalDoc: string | null = clienteDocumento?.trim() || null;
  let cliFinalPlaca: string | null = veiculoPlaca?.trim() ? veiculoPlaca.trim().toUpperCase() : null;

  if (!cliFinalNome && !cliFinalDoc && !cliFinalPlaca && todosIdsLiquidados.length > 0) {
    // Tenta localizar no cache local primeiro
    const matchLocal = faturasLocais.find(
      (f) => todosIdsLiquidados.includes(f.id) && (f.cliente_final_nome || f.cliente_nome || f.cliente_final_cpf_cnpj || f.cliente_documento || f.placa_veiculo || f.veiculo_placa)
    );
    if (matchLocal) {
      cliFinalNome = matchLocal.cliente_final_nome || matchLocal.cliente_nome || null;
      cliFinalDoc = matchLocal.cliente_final_cpf_cnpj || matchLocal.cliente_documento || null;
      cliFinalPlaca = matchLocal.placa_veiculo || matchLocal.veiculo_placa || null;
    } else {
      try {
        const { data: movsAud } = await supabase
          .from('movimentacoes_caixa')
          .select('*')
          .in('id', todosIdsLiquidados);
        const matchDb = ((movsAud as any[]) || []).find(
          (m) => m.cliente_final_nome || m.cliente_nome || m.cliente_final_cpf_cnpj || m.cliente_documento || m.placa_veiculo || m.veiculo_placa
        );
        if (matchDb) {
          cliFinalNome = matchDb.cliente_final_nome || matchDb.cliente_nome || null;
          cliFinalDoc = matchDb.cliente_final_cpf_cnpj || matchDb.cliente_documento || null;
          cliFinalPlaca = matchDb.placa_veiculo || matchDb.veiculo_placa || null;
        }
      } catch {
        // ignora erro secundário de leitura
      }
    }
  }

  const subtotalServicos = Math.round(
    servicosLiquidados.reduce((acc, i) => acc + Number(i.subtotal || 0), 0) * 100
  ) / 100;

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
    faturaNumeroOriginal: faturaReferenciaOriginal,
    hashAutenticidade: `AUT-${hashAutenticidade}-${timestamp.toString().slice(-4)}`,
    servicos: servicosLiquidados,
    subtotalServicos: subtotalServicos > 0 ? subtotalServicos : Math.round((valorPago / 1.02) * 100) / 100,
    clienteNome: cliFinalNome,
    clienteDocumento: cliFinalDoc,
    veiculoPlaca: cliFinalPlaca,
    avisoAuditoria,
  };
}

/**
 * Registra lançamento direto a prazo na conta-corrente de um despachante a partir do Balcão CRVA.
 * Segregação de Funções: O atendente nunca manipula dinheiro/pix/cartão, operando estritamente em 'faturamento'.
 * Independe de haver caixa aberto no momento do atendimento.
 */
export async function lancarFaturaDespachanteBalcao(params: {
  despachanteId: string;
  itens: ItemFaturamentoDespachante[];
  atendenteId?: string | null;
  atendenteNome: string;
  clienteId?: string | null;
  clienteNome?: string | null;
  clienteDocumento?: string | null;
  veiculoId?: string | null;
  veiculoPlaca?: string | null;
  veiculoModelo?: string | null;
}): Promise<ReciboFaturamentoDespachante> {
  const {
    despachanteId,
    itens,
    atendenteId = null,
    atendenteNome,
    clienteId = null,
    clienteNome = null,
    clienteDocumento = null,
    veiculoId = null,
    veiculoPlaca = null,
    veiculoModelo = null,
  } = params;

  if (!despachanteId) {
    throw new Error('Selecione um despachante credenciado para realizar o faturamento a prazo.');
  }

  if (!itens || itens.length === 0) {
    throw new Error('Adicione ao menos um serviço do catálogo para efetuar o lançamento.');
  }

  // 1. Buscar dados do despachante no Supabase
  const { data: despData, error: errDesp } = await supabase
    .from('despachantes')
    .select('*')
    .eq('id', despachanteId)
    .single();

  if (errDesp || !despData) {
    throw new Error(`Falha ao carregar despachante selecionado: ${errDesp?.message || 'Registro não localizado.'}`);
  }

  const despachante: Despachante = {
    id: despData.id,
    nome_razao: despData.nome_razao || despData.razao_social || 'Despachante Parceiro',
    documento: despData.documento || despData.cnpj || '',
    telefone: despData.telefone || '',
    email: despData.email || '',
    saldo_devedor: Number(despData.saldo_devedor) || 0,
    criado_em: despData.criado_em || new Date().toISOString(),
  };

  // 2. Apuração fiscal estrita: Subtotal + ISSQN (2,00%)
  const subtotal = Math.round(
    itens.reduce((acc, i) => acc + (Number(i.quantidade || 1) * Number(i.valor_unitario || 0)), 0) * 100
  ) / 100;
  const aliquotaIssqn = 2.0;
  const valorIssqn = Math.round((subtotal * 0.02) * 100) / 100;
  const valorTotal = Math.round((subtotal + valorIssqn) * 100) / 100;

  const anoAtual = new Date().getFullYear();
  const numeroRecibo = `#REC-${anoAtual}-${Date.now().toString().slice(-6)}`;
  const dataHora = new Date().toISOString();
  const idGerado = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `fat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Normaliza campos opcionais de auditoria (salva null se vazios)
  const clienteFinalNomeLimpo = clienteNome?.trim() || null;
  const clienteFinalDocLimpo = clienteDocumento?.trim() || null;
  const placaVeiculoLimpa = veiculoPlaca?.trim() ? veiculoPlaca.trim().toUpperCase() : null;

  // Garante código e descrição real em cada item salvo + metadados de auditoria em cada item
  const itensNormalizados: ItemFaturamentoDespachante[] = itens.map((it, idx) => ({
    codigo: it.codigo || `SRV-${String(idx + 1).padStart(4, '0')}`,
    servico: (it.servico || 'Serviço Notarial CRVA').trim(),
    quantidade: Number(it.quantidade || 1),
    valor_unitario: Number(it.valor_unitario || 0),
    subtotal: Number(it.subtotal || Number(it.quantidade || 1) * Number(it.valor_unitario || 0)),
  }));

  const itensComRedundanciaAuditoria = itensNormalizados.map((it) => ({
    ...it,
    numero_recibo: numeroRecibo,
    cliente_final_nome: clienteFinalNomeLimpo,
    cliente_final_cpf_cnpj: clienteFinalDocLimpo,
    placa_veiculo: placaVeiculoLimpa,
  }));

  // Gerar hash criptográfico / de conformidade para o recibo
  const rawBytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(rawBytes);
  } else {
    for (let i = 0; i < 16; i++) rawBytes[i] = Math.floor(Math.random() * 256);
  }
  const hashAutenticidade = `AUT-FAT-${Array.from(rawBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 16)}`;

  // Metadados estruturados para redundância e blindagem contra descarte de colunas no schema cache
  const metadadosAuditoria = {
    numero_recibo: numeroRecibo,
    protocolo_recibo: numeroRecibo,
    cliente_final_nome: clienteFinalNomeLimpo,
    cliente_final_cpf_cnpj: clienteFinalDocLimpo,
    placa_veiculo: placaVeiculoLimpa,
    veiculo_modelo: veiculoModelo,
    itens: itensNormalizados,
    servicos: itensNormalizados,
    subtotal,
    valor_issqn: valorIssqn,
    valor_total: valorTotal,
    atendente_nome: atendenteNome,
    atendente_id: atendenteId,
    despachante_id: despachante.id,
    despachante_nome: despachante.nome_razao,
    despachante_documento: despachante.documento,
    hash_autenticidade: hashAutenticidade,
    criado_em: dataHora,
  };

  // 3. Atualizar atomicamente o saldo devedor do despachante no banco
  const saldoAnterior = Number(despachante.saldo_devedor) || 0;
  const novoSaldo = Math.round((saldoAnterior + valorTotal) * 100) / 100;

  const { error: errSaldo } = await supabase
    .from('despachantes')
    .update({ saldo_devedor: novoSaldo })
    .eq('id', despachante.id);

  if (errSaldo) {
    throw new Error(`Falha ao atualizar o saldo devedor do despachante no banco de dados: ${errSaldo.message}`);
  }

  // 4. Inserção direta na tabela movimentacoes_caixa com auditoria integral,
  //    preservando numero_recibo, servicos reais e os 3 campos opcionais de auditoria
  const resumoServicos = itensNormalizados.map((i) => `${i.quantidade}x ${i.servico}`).join(', ');
  const horaFormatada = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Descrição auditada e imutável que preserva o Recibo e Auditoria mesmo em consultas puramente textuais
  const partesDesc = [
    `Recibo: ${numeroRecibo}`,
    resumoServicos.slice(0, 100),
    `Despachante: ${despachante.nome_razao}`,
    clienteFinalNomeLimpo ? `Cliente: ${clienteFinalNomeLimpo}` : null,
    clienteFinalDocLimpo ? `Doc: ${clienteFinalDocLimpo}` : null,
    placaVeiculoLimpa ? `Placa: ${placaVeiculoLimpa}` : null,
  ].filter(Boolean);

  const payloadMov: Record<string, any> = {
    id: idGerado,
    caixa_id: null,
    operador_id: atendenteId || null,
    operador_nome: atendenteNome || 'Patricia Atendente Balcão',
    tipo: 'faturamento_despachante',
    forma_pagamento: 'faturamento',
    status: 'a_receber',
    horario: horaFormatada,
    id_transacao: numeroRecibo,
    servico_operacao: resumoServicos || 'Atendimento Balcão',
    tomador_cliente: despachante.nome_razao,
    despachante_id: despachante.id,
    cliente_id: clienteId || null,
    veiculo_id: veiculoId || null,
    cliente_final_nome: clienteFinalNomeLimpo,
    cliente_final_cpf_cnpj: clienteFinalDocLimpo,
    placa_veiculo: placaVeiculoLimpa,
    numero_recibo: numeroRecibo,
    protocolo_recibo: numeroRecibo,
    fatura_numero: numeroRecibo,
    fatura_liquidada: false,
    servicos: itensComRedundanciaAuditoria,
    dados_auditoria: metadadosAuditoria,
    snapshot_ata: metadadosAuditoria,
    descricao: partesDesc.join(' | '),
    subtotal: subtotal,
    valor_bruto: valorTotal,
    valor: valorTotal,
    valor_total: valorTotal,
    valor_issqn: valorIssqn,
    valor_liquido: valorTotal,
    criado_em: dataHora,
  };

  try {
    const { error: errMov } = await inserirMovimentacaoResiliente(payloadMov);
    if (errMov) {
      await inserirMovimentacaoResiliente({ ...payloadMov, tipo: 'venda', forma_pagamento: 'faturamento' });
    }
  } catch (e: any) {
    console.warn('[lancarFaturaDespachanteBalcao] Aviso ao gravar em movimentacoes_caixa:', e?.message);
  }

  // Sempre grava no storage local garantindo que o PDV e a esteira reflitam a ordem e o vínculo de auditoria imediatamente
  salvarFaturaBalcaoLocal({
    ...payloadMov,
    despachante_nome: despachante.nome_razao,
    despachante_documento: despachante.documento,
    cliente_nome: clienteFinalNomeLimpo,
    cliente_documento: clienteFinalDocLimpo,
    veiculo_placa: placaVeiculoLimpa,
    veiculo_modelo: veiculoModelo,
    dados_auditoria: metadadosAuditoria,
  });

  return {
    id: idGerado,
    numeroRecibo,
    dataHora,
    despachante: {
      ...despachante,
      saldo_devedor: novoSaldo,
    },
    clienteNome: clienteFinalNomeLimpo,
    clienteDocumento: clienteFinalDocLimpo,
    veiculoPlaca: placaVeiculoLimpa,
    veiculoModelo,
    itens: itensNormalizados,
    subtotal,
    aliquotaIssqn,
    valorIssqn,
    valorTotal,
    atendenteNome,
    atendenteId,
    hashAutenticidade,
  };
}
