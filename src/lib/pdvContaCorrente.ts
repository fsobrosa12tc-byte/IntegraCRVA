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
  atualizarMovimentacoesResiliente,
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

// ============================================================================
// TABELA REAL UNIFICADA ENTRE ATENDIMENTO BALCÃO E INTEGRA PDV:
// `public.comandas_balcao` (já existente no Supabase com RLS FOR ALL e Realtime).
// - Clientes particulares usam `status = 'aguardando_pagamento'` (Frente de Caixa).
// - Faturas a prazo de Despachante usam `status = 'ABERTA'` (Balcão) e
//   `status = 'QUITADA'` (PDV), com `forma_pagamento = 'faturamento'` e metadados
//   completos dentro do JSONB `servicos` — zero erro 400 de schema cache.
// ============================================================================
const TABELA_COMANDAS = 'comandas_balcao';
const TABELA_ORDENS_OPCIONAL = 'ordens_despachante';
const MARCADOR_JSON_DESCRICAO = '@@ORDEM_JSON@@';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Padronização de Status (Balcão salva 'ABERTA'; PDV aceita todos os não quitados)
export const STATUS_ORDEM_DESPACHANTE_ABERTA = [
  'ABERTA',
  'PENDENTE',
  'A_PRAZO',
  'EM_ABERTO',
  'FATURADO',
  'A_RECEBER',
  'AGUARDANDO_LIQUIDACAO',
] as const;

export const STATUS_ORDEM_DESPACHANTE_ENCERRADA = [
  'QUITADA',
  'PAGA',
  'LIQUIDADA',
  'CANCELADA',
  'LIQUIDADO',
  'CONCLUIDO',
  'PAGO',
  'CANCELADO',
] as const;

const STATUS_ABERTA_QUERY = [
  ...STATUS_ORDEM_DESPACHANTE_ABERTA,
  ...STATUS_ORDEM_DESPACHANTE_ABERTA.map((s) => s.toLowerCase()),
];

const STATUS_ENCERRADA_SET = new Set<string>(
  STATUS_ORDEM_DESPACHANTE_ENCERRADA.map((s) => s.toUpperCase())
);

/** Evita 404 repetidos caso a tabela opcional `ordens_despachante` não exista na instância. */
let tabelaOrdensOpcionalDisponivel: boolean | null = null;

/** Memoriza colunas opcionais ausentes em `comandas_balcao` para evitar 400 repetidos. */
const colunasAusentesComandas = new Set<string>();

function sanitizarUuid(val?: string | null): string | null {
  if (!val || typeof val !== 'string') return null;
  const limpo = val.trim();
  return UUID_REGEX.test(limpo) ? limpo : null;
}

function ehErroTabelaInexistente(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('could not find the table') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  );
}

function extrairColunaAusenteSchema(mensagem?: string | null): string | null {
  if (!mensagem) return null;
  const m1 = mensagem.match(/Could not find the '([^']+)' column/i);
  if (m1) return m1[1];
  const m2 = mensagem.match(/column "([^"]+)" of relation "[^"]+" does not exist/i);
  if (m2) return m2[1];
  return null;
}

/**
 * INSERT resiliente em `public.comandas_balcao` usando exclusivamente colunas existentes.
 * Em caso de coluna opcional ausente (ex: `forma_pagamento` ou `veiculo_modelo`),
 * remove-a automaticamente e repete sem gerar falha.
 * Se ainda assim houver erro real (RLS, rede, constraint), retorna `{ data: null, error }`.
 */
async function inserirComandaDespachanteResiliente(
  payload: Record<string, any>
): Promise<{ data: any; error: any }> {
  const corpo: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined) continue;
    if (colunasAusentesComandas.has(k)) continue;
    corpo[k] = v;
  }

  let ultimoErro: any = null;
  for (let tentativa = 0; tentativa < 15; tentativa++) {
    const { data, error } = await supabase
      .from(TABELA_COMANDAS)
      .insert(corpo)
      .select('*')
      .maybeSingle();

    if (!error) return { data, error: null };
    ultimoErro = error;

    const colunaAusente = extrairColunaAusenteSchema(error.message);
    if (colunaAusente && colunaAusente in corpo) {
      colunasAusentesComandas.add(colunaAusente);
      delete corpo[colunaAusente];
      continue;
    }

    // Se a instância usa `itens`/`subtotal_servicos` em vez de `servicos`/`subtotal`
    if (/servicos/i.test(error.message || '') && 'servicos' in corpo && !('itens' in corpo)) {
      corpo.itens = corpo.servicos;
      delete corpo.servicos;
      continue;
    }
    if (/subtotal/i.test(error.message || '') && 'subtotal' in corpo && !('subtotal_servicos' in corpo)) {
      corpo.subtotal_servicos = corpo.subtotal;
      delete corpo.subtotal;
      continue;
    }
    break;
  }

  return { data: null, error: ultimoErro };
}

/** Verifica se uma linha de `comandas_balcao` corresponde a uma ordem a prazo de despachante. */
function ehLinhaComandaDeDespachante(row: any): boolean {
  if (!row) return false;
  if (String(row.forma_pagamento || '').toLowerCase() === 'faturamento') return true;
  const lista = Array.isArray(row.servicos) ? row.servicos : Array.isArray(row.itens) ? row.itens : [];
  const primeiro = lista[0];
  if (primeiro && (primeiro.tipo_ordem === 'faturamento_despachante' || Boolean(primeiro.despachante_id))) {
    return true;
  }
  if (row.despachante_id) return true;
  return false;
}

/** Extrai o texto limpo da descrição e o JSON embutido (quando presente). */
function separarDescricaoEJson(descricaoRaw?: string | null): {
  descricaoLimpa: string;
  jsonEmbutido: Record<string, any> | null;
} {
  if (typeof descricaoRaw !== 'string' || !descricaoRaw) {
    return { descricaoLimpa: '', jsonEmbutido: null };
  }
  const idx = descricaoRaw.indexOf(MARCADOR_JSON_DESCRICAO);
  if (idx < 0) {
    return { descricaoLimpa: descricaoRaw.trim(), jsonEmbutido: null };
  }
  const descricaoLimpa = descricaoRaw.slice(0, idx).trim();
  const jsonStr = descricaoRaw.slice(idx + MARCADOR_JSON_DESCRICAO.length).trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      descricaoLimpa,
      jsonEmbutido: parsed && typeof parsed === 'object' ? parsed : null,
    };
  } catch {
    return { descricaoLimpa, jsonEmbutido: null };
  }
}

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
    const numRec = fatura.numero_recibo || fatura.protocolo || fatura.protocolo_recibo || null;
    const idx = lista.findIndex(
      (x) =>
        x.id === fatura.id ||
        (numRec && (x.numero_recibo === numRec || x.protocolo === numRec || x.protocolo_recibo === numRec))
    );
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

function registrarIdsLiquidadosLocal(chaves: string[]): void {
  if (typeof window === 'undefined' || chaves.length === 0) return;
  try {
    const atual = obterIdsLiquidadosLocal();
    chaves.forEach((chave) => {
      if (chave) atual.add(String(chave).trim());
    });
    localStorage.setItem(STORAGE_FATURAS_LIQUIDADAS_KEY, JSON.stringify(Array.from(atual)));
  } catch {
    // ignora erro de quota
  }
}

/** Verifica se o status da ordem representa uma ordem em aberto (não quitada/paga/liquidada/cancelada). */
export function ehStatusOrdemAberta(status?: string | null): boolean {
  const s = String(status || 'ABERTA')
    .trim()
    .toUpperCase();
  if (!s) return true;
  if (STATUS_ENCERRADA_SET.has(s)) return false;
  return true;
}

/** Verifica se um registro bruto está em status ABERTO (não quitado/pago/liquidado/cancelado). */
function ehRegistroOrdemAberta(raw: any, idsLiquidados: Set<string>): boolean {
  if (!raw) return false;
  if (raw.fatura_liquidada === true) return false;
  const { jsonEmbutido } = separarDescricaoEJson(raw.descricao);
  if (jsonEmbutido?.fatura_liquidada === true) return false;

  const statusBruto = raw.status ?? jsonEmbutido?.status ?? 'ABERTA';
  if (!ehStatusOrdemAberta(statusBruto)) return false;

  const id = String(raw.id || jsonEmbutido?.id || '').trim();
  if (id && idsLiquidados.has(id)) return false;

  const primeiroItem =
    (Array.isArray(raw.servicos) && raw.servicos[0]) ||
    (Array.isArray(raw.itens) && raw.itens[0]) ||
    null;

  const recibo = String(
    raw.numero_recibo ||
      raw.protocolo ||
      raw.protocolo_recibo ||
      raw.numeroRecibo ||
      raw.fatura_numero ||
      jsonEmbutido?.numero_recibo ||
      primeiroItem?.numero_recibo ||
      ''
  ).trim();

  if (recibo) {
    const comHash = `#${recibo.replace(/^#+/, '')}`;
    const semHash = recibo.replace(/^#+/, '');
    if (idsLiquidados.has(comHash) || idsLiquidados.has(semHash)) return false;
  }

  return true;
}

/**
 * Extrai e normaliza itens de serviços a partir de um registro bruto
 * (`comandas_balcao`, `ordens_despachante`, `movimentacoes_caixa` ou cache local).
 */
export function normalizarItensServicos(raw: any, valorFallback?: number): ItemFaturamentoDespachante[] {
  const { descricaoLimpa, jsonEmbutido } = separarDescricaoEJson(raw?.descricao);
  let itens: any[] = [];

  if (Array.isArray(raw?.itens) && raw.itens.length > 0) {
    itens = raw.itens;
  } else if (Array.isArray(raw?.servicos) && raw.servicos.length > 0) {
    itens = raw.servicos;
  } else if (Array.isArray(jsonEmbutido?.itens) && jsonEmbutido.itens.length > 0) {
    itens = jsonEmbutido.itens;
  } else if (Array.isArray(jsonEmbutido?.servicos) && jsonEmbutido.servicos.length > 0) {
    itens = jsonEmbutido.servicos;
  } else if (typeof raw?.itens === 'string') {
    try {
      const parsed = JSON.parse(raw.itens);
      if (Array.isArray(parsed)) itens = parsed;
    } catch { }
  } else if (typeof raw?.servicos === 'string') {
    try {
      const parsed = JSON.parse(raw.servicos);
      if (Array.isArray(parsed)) itens = parsed;
    } catch { }
  }

  if (itens.length > 0) {
    return itens.map((it, idx) => {
      const qtd = Math.max(1, Number(it.quantidade || it.qtd || 1));
      const unitCent = paraCentavos(it.valor_unitario ?? it.valor ?? (it.subtotal ? Number(it.subtotal) / qtd : 0));
      const subCent = it.subtotal !== undefined && Number(it.subtotal) > 0 ? paraCentavos(it.subtotal) : unitCent * qtd;
      return {
        codigo: it.codigo || it.cod || `SRV-${String(idx + 1).padStart(4, '0')}`,
        servico: (it.servico || it.descricao || it.nome || 'Serviço Notarial / Balcão CRVA').trim(),
        quantidade: qtd,
        valor_unitario: deCentavos(unitCent),
        subtotal: deCentavos(subCent),
      };
    });
  }

  // Fallback 1: texto descritivo limpo (NUNCA usar número de protocolo/recibo como descrição de serviço)
  const textoBase = descricaoLimpa || raw?.resumoServicos || raw?.servico_operacao || '';
  const segmentosPipe = textoBase
    .split(' | ')
    .map((p: string) => p.trim())
    .filter(Boolean);
  const ehMetadadoPipe = (p: string) =>
    /^(Recibo|Protocolo|Despachante|Cliente|Doc|CPF\/CNPJ|Placa):/i.test(p) ||
    /^#?(REC|FT|LIQ|CMD)[-\s0-9A-Z]+$/i.test(p);
  const parteDesc = segmentosPipe.find((p: string) => !ehMetadadoPipe(p)) || '';

  if (parteDesc && !parteDesc.toLowerCase().includes('saldo faturado')) {
    const segmentos = parteDesc
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (segmentos.length > 0) {
      const valorTotalCent = paraCentavos(valorFallback || raw?.valor_total || raw?.valor || 0);
      const subtotalBaseCent = Math.round(valorTotalCent / 1.02);
      const valorPorItemCent = Math.floor(subtotalBaseCent / segmentos.length);

      return segmentos.map((seg: string, idx: number) => {
        const matchQtd = seg.match(/^(\d+)x\s*(.+)$/i);
        const qtd = matchQtd ? Math.max(1, Number(matchQtd[1])) : 1;
        const nome = matchQtd ? matchQtd[2].trim() : seg;
        const subItemCent =
          idx === segmentos.length - 1
            ? subtotalBaseCent - valorPorItemCent * (segmentos.length - 1)
            : valorPorItemCent;
        const unitCent = Math.round(subItemCent / qtd);
        return {
          codigo: `SRV-${String(idx + 1).padStart(4, '0')}`,
          servico: nome,
          quantidade: qtd,
          valor_unitario: deCentavos(unitCent),
          subtotal: deCentavos(subItemCent),
        };
      });
    }
  }

  const totalCent = paraCentavos(valorFallback || raw?.valor_total || raw?.valor || 0);
  const subtotalPadrao = deCentavos(Math.round(totalCent / 1.02));
  return [
    {
      codigo: 'SRV-0001',
      servico: parteDesc || 'Serviços Notariais / Balcão CRVA',
      quantidade: 1,
      valor_unitario: subtotalPadrao,
      subtotal: subtotalPadrao,
    },
  ];
}

export function consolidarItensServicos(itens: ItemFaturamentoDespachante[]): ItemFaturamentoDespachante[] {
  const mapa = new Map<string, ItemFaturamentoDespachante>();

  for (const item of itens) {
    if (!item.servico) continue;
    const chave =
      item.codigo && !item.codigo.startsWith('SRV-000')
        ? item.codigo.trim().toUpperCase()
        : item.servico.trim().toLowerCase();

    const existente = mapa.get(chave);
    if (existente) {
      existente.quantidade += Number(item.quantidade || 1);
      existente.subtotal = deCentavos(paraCentavos(existente.subtotal) + paraCentavos(item.subtotal));
      if (existente.quantidade > 0) {
        existente.valor_unitario = deCentavos(Math.round(paraCentavos(existente.subtotal) / existente.quantidade));
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
// seus valores em centavos exatos (subtotal + ISSQN = total) e o vínculo de
// auditoria (cliente final, CPF/CNPJ e placa), lendo de `comandas_balcao`,
// `ordens_despachante`, `movimentacoes_caixa` ou cache local.
// ============================================================================
export function mapOrdemDespachanteParaPdv(ordemRaw: any): FaturaDespachantePendente {
  if (!ordemRaw) {
    throw new Error('Registro de ordem de despachante inválido para mapeamento.');
  }

  const { descricaoLimpa, jsonEmbutido } = separarDescricaoEJson(ordemRaw.descricao);
  const itemZero: any =
    (Array.isArray(ordemRaw.itens) && ordemRaw.itens[0]) ||
    (Array.isArray(ordemRaw.servicos) && ordemRaw.servicos[0]) ||
    null;

  const auditoriaJson =
    ordemRaw.dados_auditoria || ordemRaw.snapshot_ata || ordemRaw.metadados || jsonEmbutido || null;

  const ehComandaDesp = ehLinhaComandaDeDespachante(ordemRaw);

  const id = String(ordemRaw.id || ordemRaw.fatura_id || jsonEmbutido?.id || '').trim();
  const dataHora =
    ordemRaw.criado_em ||
    ordemRaw.dataHora ||
    ordemRaw.created_at ||
    auditoriaJson?.criado_em ||
    new Date().toISOString();
  const ano = new Date(dataHora).getFullYear() || new Date().getFullYear();

  // 1. PROTOCOLO REAL (#REC-2026-XXXXXX) — IMUTABILIDADE ABSOLUTA
  const candidatosRecibo = [
    ordemRaw.numero_recibo,
    ordemRaw.protocolo,
    ordemRaw.protocolo_recibo,
    ordemRaw.numeroRecibo,
    ordemRaw.fatura_numero,
    ordemRaw.id_transacao,
    auditoriaJson?.numero_recibo,
    auditoriaJson?.protocolo_recibo,
    jsonEmbutido?.numero_recibo,
    itemZero?.numero_recibo,
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

  if (!protocoloEncontrado && descricaoLimpa) {
    const matchDescRec = descricaoLimpa.match(/(?:Recibo|Protocolo):\s*(#?REC-[0-9A-Z-]+)/i);
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
    const despCode = String(
      ordemRaw.despachante_id || ordemRaw.despachanteId || itemZero?.despachante_id || '0000'
    )
      .replace(/-/g, '')
      .slice(0, 6)
      .toUpperCase();
    numeroReciboFinal = `#REC-${ano}-${despCode}`;
  }

  // 2. ATOS / SERVIÇOS DISCRIMINADOS REAIS DESTA ORDEM ESPECÍFICA
  const valorBrutoInformado = Number(
    ordemRaw.valorTotal ??
      ordemRaw.valor_total ??
      ordemRaw.valor ??
      auditoriaJson?.valor_total ??
      jsonEmbutido?.valor_total ??
      0
  );
  const servicosRaw =
    ordemRaw.itens ||
    ordemRaw.servicos ||
    auditoriaJson?.itens ||
    auditoriaJson?.servicos ||
    jsonEmbutido?.itens ||
    jsonEmbutido?.servicos;
  const servicos = normalizarItensServicos(
    { ...ordemRaw, descricao: descricaoLimpa, itens: servicosRaw, servicos: servicosRaw },
    valorBrutoInformado
  );

  // 3. APURAÇÃO FINANCEIRA E TRIBUTÁRIA EM CENTAVOS (subtotal + valorIssqn === valorTotal)
  const somaItensCent = servicos.reduce((acc, it) => acc + paraCentavos(it.subtotal), 0);
  let subtotalCent = paraCentavos(
    ordemRaw.subtotal ??
      ordemRaw.subtotal_servicos ??
      auditoriaJson?.subtotal ??
      jsonEmbutido?.subtotal ??
      0
  );
  let issqnCent = paraCentavos(
    ordemRaw.issqn ??
      ordemRaw.valor_issqn ??
      ordemRaw.valorIssqn ??
      auditoriaJson?.issqn ??
      auditoriaJson?.valor_issqn ??
      jsonEmbutido?.issqn ??
      jsonEmbutido?.valor_issqn ??
      0
  );
  let totalCent = paraCentavos(valorBrutoInformado);

  if (somaItensCent > 0 && subtotalCent <= 0) {
    const issqnSobreItens = Math.round(somaItensCent * 0.02);
    if (totalCent <= 0 || Math.abs(somaItensCent + issqnSobreItens - totalCent) <= 2) {
      subtotalCent = somaItensCent;
      if (issqnCent <= 0) issqnCent = totalCent > 0 ? totalCent - subtotalCent : issqnSobreItens;
    }
  }
  if (subtotalCent <= 0 && totalCent > 0) {
    subtotalCent = Math.round(totalCent / 1.02);
  }
  if (issqnCent <= 0 && totalCent > subtotalCent) {
    issqnCent = totalCent - subtotalCent;
  } else if (issqnCent <= 0 && subtotalCent > 0) {
    issqnCent = Math.round(subtotalCent * 0.02);
  }
  if (totalCent <= 0) {
    totalCent = subtotalCent + issqnCent;
  } else if (subtotalCent + issqnCent !== totalCent) {
    issqnCent = Math.max(0, totalCent - subtotalCent);
  }

  const subtotal = deCentavos(subtotalCent);
  const valorIssqn = deCentavos(issqnCent);
  const valorTotal = deCentavos(totalCent);
  const valorBruto = deCentavos(
    paraCentavos(ordemRaw.valor_bruto ?? ordemRaw.valorBruto ?? auditoriaJson?.valor_bruto ?? valorTotal)
  );

  let resumoServicos: string;
  if (servicos.length > 0) {
    const ehApenasGenerico =
      servicos.length === 1 &&
      (servicos[0].codigo === 'SRV-0001' || servicos[0].servico.toLowerCase().includes('saldo faturado'));
    resumoServicos = !ehApenasGenerico
      ? servicos.map((it) => `${it.quantidade}x ${it.servico}`).join(', ')
      : servicos[0].servico || 'Serviços Notariais / Balcão CRVA';
  } else {
    resumoServicos = 'Serviços Notariais / Balcão CRVA';
  }

  // 4. VÍNCULO OPCIONAL DE AUDITORIA (CLIENTE FINAL, CPF/CNPJ E PLACA)
  // Em linhas vindas de `comandas_balcao`, `cliente_nome`/`cliente_documento` armazenam o Despachante;
  // o Cliente Final opcional fica em `cliente_final_nome` / `itemZero.cliente_final_nome`.
  let clienteFinalNome =
    (
      ordemRaw.cliente_final_nome ||
      ordemRaw.clienteFinalNome ||
      ordemRaw.tomador_cliente_final ||
      auditoriaJson?.cliente_final_nome ||
      jsonEmbutido?.cliente_final_nome ||
      itemZero?.cliente_final_nome ||
      (!ehComandaDesp ? ordemRaw.cliente_nome : '') ||
      ''
    ).trim() || null;

  let clienteFinalDocumento =
    (
      ordemRaw.cliente_final_cpf_cnpj ||
      ordemRaw.clienteFinalDocumento ||
      auditoriaJson?.cliente_final_cpf_cnpj ||
      jsonEmbutido?.cliente_final_cpf_cnpj ||
      itemZero?.cliente_final_cpf_cnpj ||
      (!ehComandaDesp ? ordemRaw.cliente_documento : '') ||
      ''
    ).trim() || null;

  let veiculoPlaca =
    (
      ordemRaw.placa_veiculo ||
      ordemRaw.veiculo_placa ||
      ordemRaw.placa ||
      ordemRaw.veiculoPlaca ||
      auditoriaJson?.placa_veiculo ||
      jsonEmbutido?.placa_veiculo ||
      itemZero?.placa_veiculo ||
      ''
    )
      .trim()
      .toUpperCase() || null;

  if (descricaoLimpa) {
    if (!clienteFinalNome) {
      const mCli = descricaoLimpa.match(/Cliente:\s*([^|]+)/i);
      if (mCli) clienteFinalNome = mCli[1].trim();
    }
    if (!clienteFinalDocumento) {
      const mDoc = descricaoLimpa.match(/(?:CPF\/CNPJ|Doc):\s*([^|]+)/i);
      if (mDoc) clienteFinalDocumento = mDoc[1].trim();
    }
    if (!veiculoPlaca) {
      const mPlaca = descricaoLimpa.match(/Placa:\s*([A-Z0-9-]{7,8})/i);
      if (mPlaca) veiculoPlaca = mPlaca[1].trim().toUpperCase();
    }
  }

  // 5. DADOS DO DESPACHANTE E CAIXA
  const despachanteId = String(
    ordemRaw.despachante_id ||
      ordemRaw.despachanteId ||
      auditoriaJson?.despachante_id ||
      jsonEmbutido?.despachante_id ||
      itemZero?.despachante_id ||
      ''
  ).trim();

  const despachanteNome = String(
    ordemRaw.despachante_nome ||
      ordemRaw.despachanteNome ||
      ordemRaw.despachante?.nome_razao ||
      itemZero?.despachante_nome ||
      (ehComandaDesp ? ordemRaw.cliente_nome : null) ||
      ordemRaw.tomador_cliente ||
      auditoriaJson?.despachante_nome ||
      jsonEmbutido?.despachante_nome ||
      'Despachante Parceiro'
  ).trim();

  const despachanteDocumento = mascararDocumento(
    ordemRaw.despachante_documento ||
      ordemRaw.despachanteDocumento ||
      ordemRaw.despachante?.documento ||
      itemZero?.despachante_documento ||
      (ehComandaDesp ? ordemRaw.cliente_documento : null) ||
      auditoriaJson?.despachante_documento ||
      jsonEmbutido?.despachante_documento ||
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

function unirDistintos(valores: Array<string | null | undefined>): string | null {
  const unicos = Array.from(new Set(valores.map((v) => (v || '').trim()).filter(Boolean)));
  return unicos.length > 0 ? unicos.join(' / ') : null;
}

// REGRA DE AUDITORIA FISCAL CRVA - NÃO ALTERAR
export function consolidarVinculoAuditoria(ordens: FaturaDespachantePendente[]) {
  return {
    clienteFinalNome: unirDistintos(ordens.map((o) => o.clienteFinalNome)),
    clienteFinalDocumento: unirDistintos(ordens.map((o) => o.clienteFinalDocumento)),
    veiculoPlaca: unirDistintos(ordens.map((o) => o.veiculoPlaca)),
  };
}

// REGRA DE AUDITORIA FISCAL CRVA - NÃO ALTERAR
export function totalizarOrdens(ordens: FaturaDespachantePendente[]) {
  const subtotalCent = ordens.reduce(
    (acc, o) => acc + paraCentavos(o.subtotal ?? o.valorTotal - (o.valorIssqn || 0)),
    0
  );
  const totalCent = ordens.reduce((acc, o) => acc + paraCentavos(o.valorTotal ?? 0), 0);
  const issqnCent = Math.max(0, totalCent - subtotalCent);
  return {
    subtotal: deCentavos(subtotalCent),
    issqn: deCentavos(issqnCent),
    valorTotal: deCentavos(totalCent),
  };
}

// REGRA DE AUDITORIA FISCAL CRVA - NÃO ALTERAR
export function itensDasOrdens(ordens: FaturaDespachantePendente[]): ItemFaturamentoDespachante[] {
  const vistosPorOrdem = new Set<string>();
  const resultado: ItemFaturamentoDespachante[] = [];
  for (const o of ordens) {
    const chaveOrdem = o.numeroRecibo || o.id;
    if (chaveOrdem && vistosPorOrdem.has(chaveOrdem)) continue;
    if (chaveOrdem) vistosPorOrdem.add(chaveOrdem);
    for (const it of o.servicos || []) {
      resultado.push({ ...it });
    }
  }
  return resultado;
}

/**
 * Recupera os serviços das ordens informadas lendo cada ordem de UMA ÚNICA fonte
 * (ordensFallback -> comandas_balcao -> cache local -> movimentacoes_caixa).
 */
export async function recuperarServicosOrdensLiquidadas(params: {
  faturasIds?: string[];
  ordensFallback?: FaturaDespachantePendente[];
  resumoFallback?: string;
  valorTotalFallback?: number;
}): Promise<ItemFaturamentoDespachante[]> {
  const { faturasIds = [], ordensFallback = [], resumoFallback, valorTotalFallback } = params;

  if (ordensFallback.length > 0) {
    const diretos = itensDasOrdens(ordensFallback);
    if (diretos.length > 0) return diretos;
  }

  const ids = Array.from(
    new Set(
      faturasIds.filter(
        (id) => id && !id.startsWith('saldo-anterior-') && !id.startsWith('fat-sintetica-')
      )
    )
  );
  const porId = new Map<string, ItemFaturamentoDespachante[]>();
  const pendentes = () => ids.filter((id) => !porId.has(id));

  // 1. Tabela unificada `comandas_balcao`
  if (pendentes().length > 0) {
    try {
      const { data } = await supabase.from(TABELA_COMANDAS).select('*').in('id', pendentes());
      for (const row of (data as any[]) || []) {
        const ordem = mapOrdemDespachanteParaPdv(row);
        if (ordem.servicos && ordem.servicos.length > 0) {
          porId.set(row.id, ordem.servicos);
        }
      }
    } catch { }
  }

  // 2. Cache local do Balcão
  if (pendentes().length > 0) {
    for (const fl of obterFaturasBalcaoLocal()) {
      if (pendentes().includes(fl.id) || (fl.numero_recibo && pendentes().includes(fl.numero_recibo))) {
        const ordem = mapOrdemDespachanteParaPdv(fl);
        if (ordem.servicos && ordem.servicos.length > 0) {
          porId.set(fl.id, ordem.servicos);
        }
      }
    }
  }

  // 3. Tabela `movimentacoes_caixa`
  if (pendentes().length > 0) {
    try {
      const { data: movs } = await supabase.from('movimentacoes_caixa').select('*').in('id', pendentes());
      for (const m of (movs as any[]) || []) {
        const ordem = mapOrdemDespachanteParaPdv(m);
        if (ordem.servicos && ordem.servicos.length > 0) {
          porId.set(m.id, ordem.servicos);
        }
      }
    } catch { }
  }

  const itens = ids.flatMap((id) => (porId.get(id) || []).map((it) => ({ ...it })));
  if (itens.length > 0) return itens;

  return normalizarItensServicos({ descricao: resumoFallback }, valorTotalFallback);
}

export async function buscarLancamentosDespachante(despachanteId: string): Promise<LancamentoFaturamento[]> {
  const contas = await buscarContasCorrentesDespachantes();
  const conta = contas.find((c) => c.despachanteId === despachanteId);
  if (!conta) return [];

  return conta.ordens.map((o) => ({
    id: o.id,
    data: o.dataHora,
    descricao: o.resumoServicos,
    numero_os: o.numeroRecibo,
    valor: o.valorTotal,
    despachante_id: o.despachanteId,
    caixa_id: o.caixaId,
    liquidado: false,
  }));
}

export async function buscarFaturasDespachantesAguardandoQuitacao(): Promise<FaturaDespachantePendente[]> {
  try {
    const contas = await buscarContasCorrentesDespachantes();
    return contas.flatMap((conta) => conta.ordens);
  } catch (e) {
    console.warn('Falha inesperada ao buscar faturas pendentes de despachantes:', e);
    return [];
  }
}

/**
 * Esteira Conta-Corrente de Despachantes (Integra PDV):
 * - Lê da MESMA tabela real gravada pelo Atendimento Balcão (`public.comandas_balcao`),
 *   aceitando todos os status em aberto (`['ABERTA', 'PENDENTE', 'A_PRAZO', 'EM_ABERTO', 'FATURADO']`)
 *   e excluindo estritamente `['QUITADA', 'PAGA', 'LIQUIDADA', 'CANCELADA']`.
 * - Mescla com `ordens_despachante` (se existir) e fallback legado sem jamais duplicar quantidades.
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

    const mapaDespachantes = new Map<string, Despachante>(despachantesLista.map((d) => [d.id, d]));
    const idsLiquidados = obterIdsLiquidadosLocal();

    // 2. Consultar a tabela unificada `public.comandas_balcao` filtrando todos os status em aberto
    let comandasDespAbertas: any[] = [];
    try {
      const { data: comandasData, error: errComandas } = await supabase
        .from(TABELA_COMANDAS)
        .select('*')
        .in('status', STATUS_ABERTA_QUERY)
        .order('criado_em', { ascending: false });

      if (errComandas) {
        console.warn('[buscarContasCorrentesDespachantes] Aviso ao ler comandas_balcao:', errComandas.message);
      } else if (Array.isArray(comandasData)) {
        comandasDespAbertas = comandasData.filter(
          (row) => ehLinhaComandaDeDespachante(row) && ehRegistroOrdemAberta(row, idsLiquidados)
        );
      }
    } catch (e) {
      console.warn('[buscarContasCorrentesDespachantes] Erro inesperado em comandas_balcao:', e);
    }

    // 3. Consultar tabela opcional `ordens_despachante` (somente se ainda não soubermos que não existe)
    let ordensTabelaOpcional: any[] = [];
    if (tabelaOrdensOpcionalDisponivel !== false) {
      try {
        const { data: ordData, error: errOrd } = await supabase
          .from(TABELA_ORDENS_OPCIONAL)
          .select('*')
          .in('status', STATUS_ABERTA_QUERY)
          .order('criado_em', { ascending: false });

        if (errOrd) {
          if (ehErroTabelaInexistente(errOrd)) {
            tabelaOrdensOpcionalDisponivel = false;
          }
        } else if (Array.isArray(ordData)) {
          tabelaOrdensOpcionalDisponivel = true;
          ordensTabelaOpcional = ordData.filter((row) => ehRegistroOrdemAberta(row, idsLiquidados));
        }
      } catch { }
    }

    // Identifica todos os despachantes que possuem saldo_devedor > 0 OU ordens abertas no banco
    const idsDespComOrdensBanco = new Set<string>();
    const extrairDespId = (row: any): string => {
      const item0 =
        (Array.isArray(row?.servicos) && row.servicos[0]) ||
        (Array.isArray(row?.itens) && row.itens[0]) ||
        null;
      return String(row?.despachante_id || item0?.despachante_id || '').trim();
    };

    for (const r of [...comandasDespAbertas, ...ordensTabelaOpcional]) {
      const did = extrairDespId(r);
      if (did) idsDespComOrdensBanco.add(did);
    }

    // Higiene do cache local apenas para despachantes sem saldo E sem ordens abertas no banco
    const faturasLocalAtuais = obterFaturasBalcaoLocal();
    const idsSemDividaAlguma = new Set(
      despachantesLista
        .filter((d) => paraCentavos(d.saldo_devedor) <= 0 && !idsDespComOrdensBanco.has(d.id))
        .map((d) => d.id)
    );
    if (idsSemDividaAlguma.size > 0 && faturasLocalAtuais.length > 0) {
      let alterou = false;
      const chavesLiquidar: string[] = [];
      const higienizadas = faturasLocalAtuais.map((fl) => {
        if (fl?.despachante_id && idsSemDividaAlguma.has(fl.despachante_id) && fl.fatura_liquidada !== true) {
          alterou = true;
          if (fl.id) chavesLiquidar.push(fl.id);
          if (fl.numero_recibo) chavesLiquidar.push(fl.numero_recibo);
          return { ...fl, fatura_liquidada: true, status: 'QUITADA' };
        }
        return fl;
      });
      if (alterou) {
        registrarIdsLiquidadosLocal(chavesLiquidar);
        try {
          localStorage.setItem(STORAGE_FATURAS_BALCAO_KEY, JSON.stringify(higienizadas));
        } catch { }
      }
    }

    const despachantesAtivos = despachantesLista.filter(
      (d) => paraCentavos(d.saldo_devedor) > 0 || idsDespComOrdensBanco.has(d.id)
    );
    if (despachantesAtivos.length === 0) {
      return [];
    }

    // 4. Fallback legado: busca `movimentacoes_caixa` SOMENTE para despachantes com saldo_devedor > 0
    //    que ainda não possuem ordens em `comandas_balcao` nem `ordens_despachante`.
    const idsSemOrdemNaTabelaPrincipal = despachantesAtivos
      .filter((d) => paraCentavos(d.saldo_devedor) > 0 && !idsDespComOrdensBanco.has(d.id))
      .map((d) => d.id);

    let movsLegado: any[] = [];
    if (idsSemOrdemNaTabelaPrincipal.length > 0) {
      try {
        const { data: movsData } = await supabase
          .from('movimentacoes_caixa')
          .select('*')
          .eq('forma_pagamento', 'faturamento')
          .in('tipo', ['venda', 'faturamento_despachante'])
          .in('despachante_id', idsSemOrdemNaTabelaPrincipal)
          .order('criado_em', { ascending: false });
        movsLegado = ((movsData as any[]) || []).filter((m) => ehRegistroOrdemAberta(m, idsLiquidados));
      } catch { }
    }

    // 5. Consolidar por despachante sem duplicar ordens
    const resultado: ContaCorrenteDespachanteConsolidada[] = [];

    for (const d of despachantesAtivos) {
      const doBancoComandas = comandasDespAbertas.filter((r) => extrairDespId(r) === d.id);
      const doBancoOpcional = ordensTabelaOpcional.filter((r) => extrairDespId(r) === d.id);
      const temOrdensOficiaisNoBanco = doBancoComandas.length > 0 || doBancoOpcional.length > 0;

      const mapaPorChave = new Map<string, any>();
      const idParaChave = new Map<string, string>();

      const adicionarDedup = (raw: any) => {
        const { jsonEmbutido } = separarDescricaoEJson(raw?.descricao);
        const item0 =
          (Array.isArray(raw?.servicos) && raw.servicos[0]) ||
          (Array.isArray(raw?.itens) && raw.itens[0]) ||
          null;
        const recBruto =
          raw?.numero_recibo ||
          raw?.protocolo ||
          raw?.protocolo_recibo ||
          raw?.fatura_numero ||
          jsonEmbutido?.numero_recibo ||
          item0?.numero_recibo ||
          null;
        const recNorm = recBruto ? `#${String(recBruto).trim().replace(/^#+/, '')}` : null;
        const rawId = String(raw?.id || jsonEmbutido?.id || '').trim();

        const chaveExistente =
          (recNorm && mapaPorChave.has(recNorm) ? recNorm : null) ||
          (rawId && idParaChave.get(rawId)) ||
          (rawId && mapaPorChave.has(rawId) ? rawId : null);

        const chave = chaveExistente || recNorm || rawId;
        if (!chave || mapaPorChave.has(chave)) return;

        mapaPorChave.set(chave, raw);
        if (rawId) idParaChave.set(rawId, chave);
        if (recNorm) idParaChave.set(recNorm, chave);
      };

      if (temOrdensOficiaisNoBanco) {
        // Fonte oficial do Supabase (`comandas_balcao` / `ordens_despachante`) — 100% isolada por status 'ABERTA'
        doBancoComandas.forEach(adicionarDedup);
        doBancoOpcional.forEach(adicionarDedup);
      } else {
        // Modo legado (somente para saldos antigos anteriores à gravação em `comandas_balcao`)
        const locaisAbertas = obterFaturasBalcaoLocal().filter(
          (fl) => fl?.despachante_id === d.id && ehRegistroOrdemAberta(fl, idsLiquidados)
        );
        locaisAbertas.forEach(adicionarDedup);
        movsLegado.filter((m) => m.despachante_id === d.id).forEach(adicionarDedup);
      }

      const mapeadas = Array.from(mapaPorChave.values())
        .map((raw) =>
          mapOrdemDespachanteParaPdv({
            ...raw,
            despachante_id: d.id,
            despachante_nome: d.nome_razao,
            despachante_documento: d.documento,
          })
        )
        .filter((o) => paraCentavos(o.valorTotal) > 0)
        .sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());

      let ordens: FaturaDespachantePendente[];
      if (temOrdensOficiaisNoBanco) {
        // Com ordens oficiais do banco filtradas por status ABERTA, exibimos TODAS elas sem truncar
        ordens = mapeadas;
      } else {
        // No fallback legado, isola apenas as ordens mais recentes até o saldo_devedor atual
        const saldoDevedorCent = paraCentavos(d.saldo_devedor);
        ordens = [];
        let acumuladoCent = 0;
        for (const o of mapeadas) {
          const valCent = paraCentavos(o.valorTotal);
          if (acumuladoCent + valCent <= saldoDevedorCent || ordens.length === 0) {
            ordens.push(o);
            acumuladoCent += valCent;
          }
        }
      }

      if (ordens.length === 0) continue;

      const totais = totalizarOrdens(ordens);
      const despComSaldoAtualizado: Despachante = {
        ...d,
        saldo_devedor: Math.max(Number(d.saldo_devedor) || 0, totais.valorTotal),
      };

      resultado.push({
        despachante: despComSaldoAtualizado,
        despachanteId: d.id,
        nomeRazao: d.nome_razao,
        documentoMascarado: mascararDocumento(d.documento || ''),
        telefoneMascarado: d.telefone ? mascararTelefone(d.telefone) : 'Não informado',
        saldoDevedorConsolidado: totais.valorTotal,
        totalIssqnConsolidado: totais.issqn,
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
 * Listener Realtime no Integra PDV para atualizar a esteira imediatamente ao lançar ou quitar ordens.
 */
export function inscreverFaturasDespachantesRealtime(onAtualizar: () => void) {
  const canal = supabase
    .channel('faturas_despachantes_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABELA_COMANDAS }, () => onAtualizar())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'despachantes' }, () => onAtualizar())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentacoes_caixa' }, () => onAtualizar())
    .subscribe();

  return () => {
    supabase.removeChannel(canal);
  };
}

/**
 * Quitação/liquidação de ordens de Despachante no Integra PDV.
 * Atualiza `status = 'QUITADA'` em `public.comandas_balcao`, abate `saldo_devedor` em `despachantes`,
 * registra UMA movimentação `liquidacao_fatura` em `movimentacoes_caixa` e emite o comprovante fiel.
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
  subtotalOriginal?: number | null;
  issqnOriginal?: number | null;
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
    subtotalOriginal = null,
    issqnOriginal = null,
  } = params;

  if (valorPago <= 0) {
    throw new Error('O valor do pagamento deve ser superior a zero.');
  }

  if (!caixaId) {
    throw new Error('É necessário ter um turno de caixa aberto no terminal para registrar a quitação.');
  }

  // Lê saldo devedor atualizado direto do banco
  let saldoAnterior = Number(despachante.saldo_devedor) || 0;
  try {
    const { data: despAtual } = await supabase
      .from('despachantes')
      .select('saldo_devedor')
      .eq('id', despachante.id)
      .maybeSingle();
    if (despAtual && despAtual.saldo_devedor !== undefined && despAtual.saldo_devedor !== null) {
      saldoAnterior = Math.max(saldoAnterior, Number(despAtual.saldo_devedor) || 0);
    }
  } catch { }

  const saldoAntCent = paraCentavos(saldoAnterior);
  const pagoCent = paraCentavos(valorPago);
  const novoSaldoCent = Math.max(0, saldoAntCent - pagoCent);
  const saldoRestante = deCentavos(novoSaldoCent);

  // 1. Atualizar saldo devedor do despachante
  const { error: errSaldo } = await supabase
    .from('despachantes')
    .update({ saldo_devedor: saldoRestante })
    .eq('id', despachante.id);

  if (errSaldo) {
    throw new Error(`Falha ao abater saldo do despachante: ${errSaldo.message}`);
  }

  // 2. Identificar IDs e recibos originais (#REC-...) das ordens liquidadas
  const todosIdsLiquidados = Array.from(
    new Set(
      [...(faturasIds || []), ...(faturaId ? [faturaId] : [])].filter(
        (id) => id && !id.startsWith('saldo-anterior-') && !id.startsWith('fat-sintetica-')
      )
    )
  );

  const recibosOriginaisLimpos = (faturaNumero || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `#${s.replace(/^#+/, '')}`);

  const faturasLocais = obterFaturasBalcaoLocal();
  const ordensLocaisMatched = faturasLocais.filter(
    (fl) =>
      todosIdsLiquidados.includes(fl.id) ||
      (fl.numero_recibo &&
        recibosOriginaisLimpos.includes(`#${String(fl.numero_recibo).trim().replace(/^#+/, '')}`))
  );

  for (const fl of ordensLocaisMatched) {
    if (fl.id && !todosIdsLiquidados.includes(fl.id)) todosIdsLiquidados.push(fl.id);
    const num = fl.numero_recibo || fl.protocolo || fl.protocolo_recibo;
    if (num) {
      const fmt = `#${String(num).trim().replace(/^#+/, '')}`;
      if (!recibosOriginaisLimpos.includes(fmt)) recibosOriginaisLimpos.push(fmt);
    }
  }

  const dataQuitacaoIso = new Date().toISOString();
  const formaPdv: FormaPagamento = formaPagamento === 'transferencia' ? 'pix' : formaPagamento;
  registrarIdsLiquidadosLocal([...todosIdsLiquidados, ...recibosOriginaisLimpos]);

  // 2.1 Baixa definitiva na tabela unificada `public.comandas_balcao` (`status = 'QUITADA'`)
  const patchComanda: Record<string, any> = {
    status: 'QUITADA',
    pago_em: dataQuitacaoIso,
    caixa_id: sanitizarUuid(caixaId),
  };
  if (todosIdsLiquidados.length > 0) {
    try {
      const { error: errUpdCom } = await supabase
        .from(TABELA_COMANDAS)
        .update(patchComanda)
        .in('id', todosIdsLiquidados);
      if (errUpdCom) {
        console.warn('[liquidarFaturaDespachante] Aviso ao baixar em comandas_balcao por id:', errUpdCom.message);
      }
    } catch { }
  }
  if (recibosOriginaisLimpos.length > 0) {
    try {
      await supabase
        .from(TABELA_COMANDAS)
        .update(patchComanda)
        .in('protocolo', recibosOriginaisLimpos);
    } catch { }
  }

  // 2.2 Baixa na tabela opcional `ordens_despachante` (se disponível)
  if (tabelaOrdensOpcionalDisponivel === true && todosIdsLiquidados.length > 0) {
    try {
      await supabase
        .from(TABELA_ORDENS_OPCIONAL)
        .update({
          status: 'QUITADA',
          quitada_em: dataQuitacaoIso,
          forma_pagamento_quitacao: formaPdv,
          caixa_quitacao_id: sanitizarUuid(caixaId),
          operador_quitacao_nome: operadorNome,
        })
        .in('id', todosIdsLiquidados);
    } catch { }
  }

  // 2.3 Baixa legada em movimentacoes_caixa e cache local
  const patchMovLegado = {
    fatura_liquidada: true,
    status: 'QUITADA',
    data_quitacao: dataQuitacaoIso,
    forma_pagamento_quitacao: formaPdv,
  };
  if (todosIdsLiquidados.length > 0) {
    try {
      await atualizarMovimentacoesResiliente(todosIdsLiquidados, patchMovLegado);
    } catch { }
  }

  if (novoSaldoCent === 0) {
    try {
      const { data: movsDesp } = await supabase
        .from('movimentacoes_caixa')
        .select('id')
        .eq('despachante_id', despachante.id)
        .eq('forma_pagamento', 'faturamento')
        .in('tipo', ['venda', 'faturamento_despachante']);
      const ids = ((movsDesp as any[]) || []).map((m) => m.id).filter(Boolean);
      if (ids.length > 0) {
        registrarIdsLiquidadosLocal(ids);
        await atualizarMovimentacoesResiliente(ids, patchMovLegado);
      }
    } catch { }
  }

  if (faturasLocais.length > 0) {
    const atualizadas = faturasLocais.map((f) => {
      const recF = f.numero_recibo || f.protocolo ? `#${String(f.numero_recibo || f.protocolo).trim().replace(/^#+/, '')}` : '';
      if (
        todosIdsLiquidados.includes(f.id) ||
        (recF && recibosOriginaisLimpos.includes(recF)) ||
        (novoSaldoCent === 0 && f.despachante_id === despachante.id)
      ) {
        return { ...f, fatura_liquidada: true, status: 'QUITADA' };
      }
      return f;
    });
    try {
      localStorage.setItem(STORAGE_FATURAS_BALCAO_KEY, JSON.stringify(atualizadas));
    } catch { }
  }

  // 3. Protocolo Original Imutável e Hash de Autenticidade
  const timestamp = Date.now();
  const rawHash = `${despachante.id}-${timestamp}-${valorPago.toFixed(2)}`;
  const hashAutenticidade = Array.from(rawHash)
    .reduce((hash, char) => 0 | (31 * hash + char.charCodeAt(0)), 0)
    .toString(16)
    .toUpperCase()
    .replace('-', '')
    .padStart(8, '0');

  const protocoloOriginal =
    recibosOriginaisLimpos.length > 0
      ? recibosOriginaisLimpos[0]
      : `#REC-${new Date().getFullYear()}-${hashAutenticidade.slice(0, 6)}`;

  const faturaReferenciaOriginal =
    recibosOriginaisLimpos.length > 0 ? recibosOriginaisLimpos.join(', ') : protocoloOriginal;

  const protocolo = protocoloOriginal;

  // 4. Itens e Valores Fiscais Exatos (Subtotal + ISSQN === TOTAL PAGO)
  const servicosLiquidados: ItemFaturamentoDespachante[] =
    servicos && servicos.length > 0
      ? servicos.map((it) => ({ ...it }))
      : await recuperarServicosOrdensLiquidadas({
          faturasIds: todosIdsLiquidados,
          resumoFallback: resumoServicosFallback || undefined,
          valorTotalFallback: valorPago,
        });

  const somaItensCent = servicosLiquidados.reduce((acc, i) => acc + paraCentavos(i.subtotal), 0);
  let subtotalCent: number;
  let issqnCent: number;

  if (
    subtotalOriginal !== null &&
    subtotalOriginal > 0 &&
    issqnOriginal !== null &&
    issqnOriginal >= 0 &&
    paraCentavos(subtotalOriginal) + paraCentavos(issqnOriginal) === pagoCent
  ) {
    subtotalCent = paraCentavos(subtotalOriginal);
    issqnCent = paraCentavos(issqnOriginal);
  } else if (somaItensCent > 0 && Math.abs(somaItensCent + Math.round(somaItensCent * 0.02) - pagoCent) <= 2) {
    subtotalCent = somaItensCent;
    issqnCent = Math.max(0, pagoCent - subtotalCent);
  } else {
    subtotalCent = Math.round(pagoCent / 1.02);
    issqnCent = Math.max(0, pagoCent - subtotalCent);
  }

  const subtotalServicos = deCentavos(subtotalCent);
  const valorIssqnSegregado = deCentavos(issqnCent);

  // 5. Registro de entrada financeira no caixa (`movimentacoes_caixa`: tipo 'liquidacao_fatura')
  const descOperacao = `Quitação Fatura ${faturaReferenciaOriginal} | Despachante: ${despachante.nome_razao}`;
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

  if (formaPagamento === 'pix' || formaPagamento === 'transferencia') {
    try {
      await supabase.from('fluxo_caixa').insert({
        tipo: 'entrada',
        categoria: `Recebimento Despachante (${formaPagamento.toUpperCase()})`,
        valor: valorPago,
        origem_id: despachante.id,
        data_movimentacao: dataQuitacaoIso,
      });
    } catch { }
  }

  // 6. Vínculo de Auditoria (Cliente Final, CPF/CNPJ e Placa)
  let cliFinalNome: string | null = clienteNome?.trim() || null;
  let cliFinalDoc: string | null = clienteDocumento?.trim() || null;
  let cliFinalPlaca: string | null = veiculoPlaca?.trim() ? veiculoPlaca.trim().toUpperCase() : null;

  if (!cliFinalNome && !cliFinalDoc && !cliFinalPlaca && ordensLocaisMatched.length > 0) {
    const vinculo = consolidarVinculoAuditoria(
      ordensLocaisMatched.map((fl) => mapOrdemDespachanteParaPdv(fl))
    );
    cliFinalNome = vinculo.clienteFinalNome;
    cliFinalDoc = vinculo.clienteFinalDocumento;
    cliFinalPlaca = vinculo.veiculoPlaca;
  }

  return {
    protocolo,
    dataHora: dataQuitacaoIso,
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
    subtotalServicos,
    clienteNome: cliFinalNome,
    clienteDocumento: cliFinalDoc,
    veiculoPlaca: cliFinalPlaca,
    avisoAuditoria,
  };
}

/**
 * Lançamento a prazo de Despachante no Atendimento Balcão -> Integra PDV.
 * - Grava diretamente na tabela real unificada `public.comandas_balcao` com `status: 'ABERTA'`
 *   usando apenas colunas reais do schema do Supabase (ZERO erro 400).
 * - Preserva `numero_recibo` (#REC-2026-XXXXXX), `itens` exatos e os campos opcionais de auditoria
 *   (`cliente_final_nome`, `cliente_final_cpf_cnpj`, `placa_veiculo`) dentro do JSONB `servicos`.
 * - Se o `INSERT` no Supabase falhar por qualquer motivo, reverte o `saldo_devedor` e lança
 *   erro explícito com a mensagem real do banco (nunca emite comprovante falso).
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

  // 1. Buscar dados atualizados do despachante no Supabase
  const { data: despData, error: errDesp } = await supabase
    .from('despachantes')
    .select('*')
    .eq('id', despachanteId)
    .single();

  if (errDesp || !despData) {
    throw new Error(
      `Falha ao carregar despachante selecionado: ${errDesp?.message || 'Registro não localizado.'}`
    );
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

  // 2. Apuração fiscal estrita em centavos: Subtotal + ISSQN (2,00%) === Valor Total
  const itensNormalizados: ItemFaturamentoDespachante[] = itens.map((it, idx) => {
    const quantidade = Math.max(1, Number(it.quantidade || 1));
    const unitCent = paraCentavos(it.valor_unitario || 0);
    const subCent = unitCent * quantidade;
    return {
      codigo: it.codigo || `SRV-${String(idx + 1).padStart(4, '0')}`,
      servico: (it.servico || 'Serviço Notarial CRVA').trim(),
      quantidade,
      valor_unitario: deCentavos(unitCent),
      subtotal: deCentavos(subCent),
    };
  });

  const subtotalCent = itensNormalizados.reduce((acc, i) => acc + paraCentavos(i.subtotal), 0);
  const issqnCent = Math.round(subtotalCent * 0.02);
  const totalCent = subtotalCent + issqnCent;
  const subtotal = deCentavos(subtotalCent);
  const valorIssqn = deCentavos(issqnCent);
  const valorTotal = deCentavos(totalCent);
  const aliquotaIssqn = 2.0;

  const anoAtual = new Date().getFullYear();
  const numeroRecibo = `#REC-${anoAtual}-${Date.now().toString().slice(-6)}`;
  const dataHora = new Date().toISOString();
  const idGerado =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `00000000-0000-4000-8000-${Date.now().toString().slice(-12).padStart(12, '0')}`;

  // Normaliza campos opcionais de auditoria (null se vazios)
  const clienteFinalNomeLimpo = clienteNome?.trim() || null;
  const clienteFinalDocLimpo = clienteDocumento?.trim() || null;
  const placaVeiculoLimpa = veiculoPlaca?.trim() ? veiculoPlaca.trim().toUpperCase() : null;

  // Hash de autenticidade do recibo
  const rawBytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(rawBytes);
  } else {
    for (let i = 0; i < 16; i++) rawBytes[i] = Math.floor(Math.random() * 256);
  }
  const hashAutenticidade = `AUT-FAT-${Array.from(rawBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .slice(0, 16)}`;

  // 3. Metadados seguros dentro do array JSONB `servicos` (nunca quebra schema do Supabase)
  const itensComMetadadosOrdem = itensNormalizados.map((it) => ({
    codigo: it.codigo,
    descricao: it.servico,
    servico: it.servico,
    quantidade: it.quantidade,
    valor_unitario: it.valor_unitario,
    subtotal: it.subtotal,
    tipo_ordem: 'faturamento_despachante',
    numero_recibo: numeroRecibo,
    despachante_id: despachante.id,
    despachante_nome: despachante.nome_razao,
    despachante_documento: despachante.documento,
    cliente_final_nome: clienteFinalNomeLimpo,
    cliente_final_cpf_cnpj: clienteFinalDocLimpo,
    placa_veiculo: placaVeiculoLimpa,
    hash_autenticidade: hashAutenticidade,
  }));

  // 4. INSERT na tabela unificada `public.comandas_balcao` (SOMENTE colunas reais do schema)
  const payloadComanda: Record<string, any> = {
    id: idGerado,
    protocolo: numeroRecibo,
    cliente_id: sanitizarUuid(clienteId),
    veiculo_id: sanitizarUuid(veiculoId),
    cliente_nome: despachante.nome_razao,
    cliente_documento: despachante.documento ? despachante.documento.slice(0, 20) : null,
    veiculo_placa: placaVeiculoLimpa ? placaVeiculoLimpa.slice(0, 10) : null,
    veiculo_modelo: veiculoModelo ? veiculoModelo.trim().slice(0, 150) : null,
    servicos: itensComMetadadosOrdem,
    subtotal,
    aliquota_issqn: aliquotaIssqn,
    valor_issqn: valorIssqn,
    valor_total: valorTotal,
    status: 'ABERTA',
    atendente_id: sanitizarUuid(atendenteId),
    atendente_nome: (atendenteNome || 'Atendente Balcão CRVA').slice(0, 255),
    caixa_id: null,
    forma_pagamento: 'faturamento',
    criado_em: dataHora,
  };

  const { data: ordemSalva, error: errInsertComanda } = await inserirComandaDespachanteResiliente(payloadComanda);

  if (errInsertComanda || !ordemSalva) {
    const detalhe = errInsertComanda?.message || 'O banco de dados não confirmou o salvamento da fatura.';
    throw new Error(`Erro ao gravar ordem a prazo no Supabase (${TABELA_COMANDAS}): ${detalhe}`);
  }

  // 4.1 Se a tabela dedicada `ordens_despachante` existir na instância, espelha nela também
  if (tabelaOrdensOpcionalDisponivel !== false) {
    try {
      const { error: errOrd } = await supabase.from(TABELA_ORDENS_OPCIONAL).insert({
        id: ordemSalva.id || idGerado,
        numero_recibo: numeroRecibo,
        despachante_id: despachante.id,
        status: 'ABERTA',
        itens: itensComMetadadosOrdem,
        subtotal,
        issqn: valorIssqn,
        valor_total: valorTotal,
        cliente_final_nome: clienteFinalNomeLimpo,
        cliente_final_cpf_cnpj: clienteFinalDocLimpo,
        placa_veiculo: placaVeiculoLimpa,
        veiculo_modelo: veiculoModelo,
        atendente_id: atendenteId,
        atendente_nome: atendenteNome,
        hash_autenticidade: hashAutenticidade,
        criado_em: dataHora,
      });
      if (errOrd && ehErroTabelaInexistente(errOrd)) {
        tabelaOrdensOpcionalDisponivel = false;
      } else if (!errOrd) {
        tabelaOrdensOpcionalDisponivel = true;
      }
    } catch { }
  }

  // 5. Atualizar atomicamente o saldo devedor do despachante (com rollback se falhar)
  const saldoAnterior = Number(despachante.saldo_devedor) || 0;
  const novoSaldo = deCentavos(Math.max(0, paraCentavos(saldoAnterior)) + totalCent);

  const { error: errSaldo } = await supabase
    .from('despachantes')
    .update({ saldo_devedor: novoSaldo })
    .eq('id', despachante.id);

  if (errSaldo) {
    // Rollback da ordem recém-criada para não deixar inconsistência entre ordem e saldo
    try {
      await supabase.from(TABELA_COMANDAS).delete().eq('id', ordemSalva.id || idGerado);
    } catch { }
    throw new Error(
      `Falha ao atualizar o saldo devedor do despachante no banco de dados: ${errSaldo.message}`
    );
  }

  // 6. Higiene de cache local (se o despachante estava zerado) + registro da ordem confirmada
  if (paraCentavos(saldoAnterior) <= 0) {
    const faturasAntigas = obterFaturasBalcaoLocal();
    if (faturasAntigas.length > 0) {
      const chavesAntigas: string[] = [];
      const limpas = faturasAntigas.map((f) => {
        if (f?.despachante_id === despachante.id && f.fatura_liquidada !== true) {
          if (f.id) chavesAntigas.push(f.id);
          if (f.numero_recibo) chavesAntigas.push(f.numero_recibo);
          return { ...f, fatura_liquidada: true, status: 'QUITADA' };
        }
        return f;
      });
      if (chavesAntigas.length > 0) {
        registrarIdsLiquidadosLocal(chavesAntigas);
        try {
          localStorage.setItem(STORAGE_FATURAS_BALCAO_KEY, JSON.stringify(limpas));
        } catch { }
      }
    }
  }

  salvarFaturaBalcaoLocal({
    id: ordemSalva.id || idGerado,
    numero_recibo: numeroRecibo,
    protocolo: numeroRecibo,
    despachante_id: despachante.id,
    despachante_nome: despachante.nome_razao,
    despachante_documento: despachante.documento,
    status: 'ABERTA',
    fatura_liquidada: false,
    servicos: itensComMetadadosOrdem,
    itens: itensComMetadadosOrdem,
    subtotal,
    valor_issqn: valorIssqn,
    valor_total: valorTotal,
    cliente_final_nome: clienteFinalNomeLimpo,
    cliente_final_cpf_cnpj: clienteFinalDocLimpo,
    placa_veiculo: placaVeiculoLimpa,
    veiculo_modelo: veiculoModelo,
    criado_em: dataHora,
  });

  return {
    id: ordemSalva.id || idGerado,
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
