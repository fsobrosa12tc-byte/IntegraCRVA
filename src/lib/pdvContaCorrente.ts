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
const TABELA_ORDENS = 'ordens_despachante';
const STATUS_ORDEM_ABERTA = ['ABERTA', 'PENDENTE'];
const STATUS_ORDEM_ENCERRADA = ['quitada', 'liquidado', 'concluido', 'pago', 'cancelada', 'cancelado'];
const MARCADOR_JSON_DESCRICAO = '@@ORDEM_JSON@@';

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
    const numRec = fatura.numero_recibo || fatura.protocolo_recibo || null;
    const idx = lista.findIndex(
      (x) => x.id === fatura.id || (numRec && (x.numero_recibo === numRec || x.protocolo_recibo === numRec))
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

/** Verifica se um registro bruto está em status ABERTO (não quitado/cancelado). */
function ehRegistroOrdemAberta(raw: any, idsLiquidados: Set<string>): boolean {
  if (!raw) return false;
  if (raw.fatura_liquidada === true) return false;
  const { jsonEmbutido } = separarDescricaoEJson(raw.descricao);
  if (jsonEmbutido?.fatura_liquidada === true) return false;

  const statusBruto = String(raw.status || jsonEmbutido?.status || 'ABERTA')
    .trim()
    .toLowerCase();
  if (STATUS_ORDEM_ENCERRADA.includes(statusBruto)) return false;

  const id = String(raw.id || jsonEmbutido?.id || '').trim();
  if (id && idsLiquidados.has(id)) return false;

  const recibo = String(
    raw.numero_recibo ||
      raw.protocolo_recibo ||
      raw.numeroRecibo ||
      raw.fatura_numero ||
      jsonEmbutido?.numero_recibo ||
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
 * Extrai e normaliza itens de serviços a partir de um registro bruto (ordens_despachante, movimentacoes_caixa ou cache local).
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

  // Fallback 2: Item genérico padrão
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

/**
 * Consolida uma lista de itens somando quantidades e subtotais
 * (mantido para compatibilidade de relatórios gerais; na liquidação de ordens usa-se `itensDasOrdens`).
 */
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
// auditoria (cliente final, CPF/CNPJ e placa).
// ============================================================================
export function mapOrdemDespachanteParaPdv(ordemRaw: any): FaturaDespachantePendente {
  if (!ordemRaw) {
    throw new Error('Registro de ordem de despachante inválido para mapeamento.');
  }

  const { descricaoLimpa, jsonEmbutido } = separarDescricaoEJson(ordemRaw.descricao);
  const auditoriaJson =
    ordemRaw.dados_auditoria || ordemRaw.snapshot_ata || ordemRaw.metadados || jsonEmbutido || null;

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
    ordemRaw.protocolo_recibo,
    ordemRaw.numeroRecibo,
    ordemRaw.fatura_numero,
    ordemRaw.protocolo,
    ordemRaw.id_transacao,
    auditoriaJson?.numero_recibo,
    auditoriaJson?.protocolo_recibo,
    jsonEmbutido?.numero_recibo,
    Array.isArray(ordemRaw.itens) ? ordemRaw.itens[0]?.numero_recibo : null,
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
    const despCode = String(ordemRaw.despachante_id || ordemRaw.despachanteId || '0000')
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
  let subtotalCent = paraCentavos(ordemRaw.subtotal ?? auditoriaJson?.subtotal ?? jsonEmbutido?.subtotal ?? 0);
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
    // Ajusta ISSQN para garantir subtotal + ISSQN === valorTotal sem divergência de centavos
    issqnCent = Math.max(0, totalCent - subtotalCent);
  }

  const subtotal = deCentavos(subtotalCent);
  const valorIssqn = deCentavos(issqnCent);
  const valorTotal = deCentavos(totalCent);
  const valorBruto = deCentavos(
    paraCentavos(ordemRaw.valor_bruto ?? ordemRaw.valorBruto ?? auditoriaJson?.valor_bruto ?? valorTotal)
  );

  // Resumo dos serviços: construído exclusivamente a partir dos itens desta ordem
  let resumoServicos: string;
  if (servicos.length > 0) {
    const ehApenasGenerico =
      servicos.length === 1 &&
      (servicos[0].codigo === 'SRV-0001' || servicos[0].servico.toLowerCase().includes('saldo faturado'));

    if (!ehApenasGenerico) {
      resumoServicos = servicos.map((it) => `${it.quantidade}x ${it.servico}`).join(', ');
    } else {
      resumoServicos = servicos[0].servico || 'Serviços Notariais / Balcão CRVA';
    }
  } else {
    resumoServicos = 'Serviços Notariais / Balcão CRVA';
  }

  // 4. VÍNCULO OPCIONAL DE AUDITORIA (CLIENTE FINAL, CPF/CNPJ E PLACA)
  const itemZero: any =
    (Array.isArray(ordemRaw.itens) && ordemRaw.itens[0]) ||
    (Array.isArray(ordemRaw.servicos) && ordemRaw.servicos[0]) ||
    null;

  let clienteFinalNome =
    (
      ordemRaw.cliente_final_nome ||
      ordemRaw.cliente_nome ||
      ordemRaw.clienteFinalNome ||
      ordemRaw.tomador_cliente_final ||
      auditoriaJson?.cliente_final_nome ||
      jsonEmbutido?.cliente_final_nome ||
      itemZero?.cliente_final_nome ||
      ''
    ).trim() || null;

  let clienteFinalDocumento =
    (
      ordemRaw.cliente_final_cpf_cnpj ||
      ordemRaw.cliente_documento ||
      ordemRaw.clienteFinalDocumento ||
      auditoriaJson?.cliente_final_cpf_cnpj ||
      jsonEmbutido?.cliente_final_cpf_cnpj ||
      itemZero?.cliente_final_cpf_cnpj ||
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
    ordemRaw.despachante_id || ordemRaw.despachanteId || auditoriaJson?.despachante_id || jsonEmbutido?.despachante_id || ''
  ).trim();
  const despachanteNome = String(
    ordemRaw.despachante_nome ||
      ordemRaw.despachanteNome ||
      ordemRaw.despachante?.nome_razao ||
      ordemRaw.tomador_cliente ||
      auditoriaJson?.despachante_nome ||
      jsonEmbutido?.despachante_nome ||
      'Despachante Parceiro'
  ).trim();

  const despachanteDocumento = mascararDocumento(
    ordemRaw.despachante_documento ||
      ordemRaw.despachanteDocumento ||
      ordemRaw.despachante?.documento ||
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
// Consolida o vínculo de auditoria (cliente final, CPF/CNPJ e placa) das ordens selecionadas.
export function consolidarVinculoAuditoria(ordens: FaturaDespachantePendente[]) {
  return {
    clienteFinalNome: unirDistintos(ordens.map((o) => o.clienteFinalNome)),
    clienteFinalDocumento: unirDistintos(ordens.map((o) => o.clienteFinalDocumento)),
    veiculoPlaca: unirDistintos(ordens.map((o) => o.veiculoPlaca)),
  };
}

// REGRA DE AUDITORIA FISCAL CRVA - NÃO ALTERAR
// Totaliza ordens em CENTAVOS inteiros (subtotal + issqn === valorTotal).
export function totalizarOrdens(ordens: FaturaDespachantePendente[]) {
  const subtotalCent = ordens.reduce(
    (acc, o) => acc + paraCentavos(o.subtotal ?? (o.valorTotal - (o.valorIssqn || 0))),
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
// Retorna os itens exatos das ordens selecionadas, preservando as quantidades originais
// de cada atendimento sem jamais multiplicar a mesma ordem por múltiplas fontes.
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

/** Detecta erro de tabela inexistente (migration ainda não executada no Supabase). */
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

/**
 * Recupera os serviços das ordens informadas lendo cada ordem de UMA ÚNICA fonte
 * (ordensFallback -> ordens_despachante -> cache local -> movimentacoes_caixa).
 * NUNCA empilha a mesma ordem de múltiplas fontes.
 */
export async function recuperarServicosOrdensLiquidadas(params: {
  faturasIds?: string[];
  ordensFallback?: FaturaDespachantePendente[];
  resumoFallback?: string;
  valorTotalFallback?: number;
}): Promise<ItemFaturamentoDespachante[]> {
  const { faturasIds = [], ordensFallback = [], resumoFallback, valorTotalFallback } = params;

  // 1. Se ordensFallback já traz os serviços das ordens, retorna diretamente sem consultar outras fontes
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

  // 2. Cache local do Balcão (fonte primária imediata)
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

  // 3. Tabela dedicada ordens_despachante (se existir no Supabase)
  if (pendentes().length > 0) {
    try {
      const { data, error } = await supabase.from(TABELA_ORDENS).select('*').in('id', pendentes());
      if (!error && data) {
        for (const r of data as any[]) {
          const ordem = mapOrdemDespachanteParaPdv(r);
          if (ordem.servicos && ordem.servicos.length > 0) {
            porId.set(r.id, ordem.servicos);
          }
        }
      }
    } catch { }
  }

  // 4. Tabela movimentacoes_caixa
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

/**
 * Busca todas as movimentações faturadas a prazo em aberto vinculadas ao despachante.
 */
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

/**
 * Busca todas as faturas a prazo de despachantes que aguardam quitação (esteira dinâmica).
 */
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
 * Esteira Conta-Corrente de Despachantes:
 * - Filtra estritamente ordens com status 'ABERTA' / 'PENDENTE' (nunca agrega ordens 'QUITADAS').
 * - Mescla e deduplica registros por `numero_recibo` e `id`, priorizando os registros completos
 *   emitidos no Atendimento Balcão (com `numero_recibo` #REC-..., itens reais e vínculo de auditoria).
 * - Isola exclusivamente as ordens abertas mais recentes que compõem o `saldo_devedor` atual
 *   do despachante, eliminando qualquer contaminação por ordens antigas de testes anteriores.
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

    const idsLiquidados = obterIdsLiquidadosLocal();
    const faturasLocal = obterFaturasBalcaoLocal();

    // Higiene automática: se um despachante está com saldo_devedor <= 0 no banco,
    // qualquer fatura local antiga dele que ainda conste aberta já foi quitada.
    const idsDespSemSaldo = new Set(
      despachantesLista.filter((d) => paraCentavos(d.saldo_devedor) <= 0).map((d) => d.id)
    );
    if (idsDespSemSaldo.size > 0 && faturasLocal.length > 0) {
      let alterouLocal = false;
      const chavesParaLiquidar: string[] = [];
      const higienizadas = faturasLocal.map((fl) => {
        if (fl?.despachante_id && idsDespSemSaldo.has(fl.despachante_id) && fl.fatura_liquidada !== true) {
          alterouLocal = true;
          if (fl.id) chavesParaLiquidar.push(fl.id);
          if (fl.numero_recibo) chavesParaLiquidar.push(fl.numero_recibo);
          return { ...fl, fatura_liquidada: true, status: 'QUITADA' };
        }
        return fl;
      });
      if (alterouLocal) {
        registrarIdsLiquidadosLocal(chavesParaLiquidar);
        try {
          localStorage.setItem(STORAGE_FATURAS_BALCAO_KEY, JSON.stringify(higienizadas));
        } catch { }
      }
    }

    const despachantesComSaldo = despachantesLista.filter((d) => paraCentavos(d.saldo_devedor) > 0);
    if (despachantesComSaldo.length === 0) {
      return [];
    }

    const idsComSaldo = despachantesComSaldo.map((d) => d.id);

    // 2. Consultar tabela dedicada `ordens_despachante` (quando disponível no Supabase)
    let ordensTabelaDedicada: any[] = [];
    try {
      const { data: ordData, error: errOrd } = await supabase
        .from(TABELA_ORDENS)
        .select('*')
        .in('despachante_id', idsComSaldo)
        .in('status', STATUS_ORDEM_ABERTA)
        .order('criado_em', { ascending: false });
      if (!errOrd && Array.isArray(ordData)) {
        ordensTabelaDedicada = ordData;
      }
    } catch { }

    // 3. Consultar `movimentacoes_caixa`
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

    // 4. Unificar e deduplicar por despachante, com PRIORIDADE para ordens com numero_recibo real do Balcão
    const resultado: ContaCorrenteDespachanteConsolidada[] = [];

    for (const d of despachantesComSaldo) {
      const saldoDevedorCent = paraCentavos(d.saldo_devedor);
      if (saldoDevedorCent <= 0) continue;

      // Coleta todas as fontes abertas deste despachante
      const locaisAbertas = obterFaturasBalcaoLocal().filter(
        (fl) => fl?.despachante_id === d.id && ehRegistroOrdemAberta(fl, idsLiquidados)
      );
      const dedicadasAbertas = ordensTabelaDedicada.filter(
        (od) => od?.despachante_id === d.id && ehRegistroOrdemAberta(od, idsLiquidados)
      );
      const movsAbertas = ((movsFaturadas as any[]) || []).filter(
        (m) => m?.despachante_id === d.id && ehRegistroOrdemAberta(m, idsLiquidados)
      );

      // Mapa deduplicado por numero_recibo e por id
      const mapaPorChave = new Map<string, any>();
      const idParaChave = new Map<string, string>();

      const mesclarRegistro = (raw: any) => {
        const { jsonEmbutido } = separarDescricaoEJson(raw?.descricao);
        const recBruto =
          raw?.numero_recibo ||
          raw?.protocolo_recibo ||
          raw?.fatura_numero ||
          jsonEmbutido?.numero_recibo ||
          null;
        const recNorm = recBruto ? `#${String(recBruto).trim().replace(/^#+/, '')}` : null;
        const rawId = String(raw?.id || jsonEmbutido?.id || '').trim();

        const chaveExistente =
          (recNorm && mapaPorChave.has(recNorm) ? recNorm : null) ||
          (rawId && idParaChave.get(rawId)) ||
          (rawId && mapaPorChave.has(rawId) ? rawId : null);

        const chave = chaveExistente || recNorm || rawId;
        if (!chave) return;

        const anterior = mapaPorChave.get(chave);
        if (!anterior) {
          mapaPorChave.set(chave, raw);
          if (rawId) idParaChave.set(rawId, chave);
          if (recNorm) idParaChave.set(recNorm, chave);
          return;
        }

        // Mescla preservando campos mais ricos (numero_recibo, itens/servicos, vínculo de auditoria)
        const temItensAnt =
          (Array.isArray(anterior.itens) && anterior.itens.length > 0) ||
          (Array.isArray(anterior.servicos) && anterior.servicos.length > 0);
        const temItensNovo =
          (Array.isArray(raw.itens) && raw.itens.length > 0) ||
          (Array.isArray(raw.servicos) && raw.servicos.length > 0);

        const mesclado = {
          ...raw,
          ...anterior,
          id: anterior.id || raw.id,
          numero_recibo:
            anterior.numero_recibo ||
            anterior.protocolo_recibo ||
            raw.numero_recibo ||
            raw.protocolo_recibo ||
            jsonEmbutido?.numero_recibo ||
            null,
          itens: temItensAnt ? anterior.itens || anterior.servicos : temItensNovo ? raw.itens || raw.servicos : anterior.itens,
          servicos: temItensAnt ? anterior.servicos || anterior.itens : temItensNovo ? raw.servicos || raw.itens : anterior.servicos,
          subtotal: anterior.subtotal ?? raw.subtotal ?? jsonEmbutido?.subtotal,
          issqn: anterior.issqn ?? anterior.valor_issqn ?? raw.issqn ?? raw.valor_issqn ?? jsonEmbutido?.issqn,
          valor_issqn: anterior.valor_issqn ?? anterior.issqn ?? raw.valor_issqn ?? raw.issqn ?? jsonEmbutido?.valor_issqn,
          valor_total: anterior.valor_total ?? anterior.valor ?? raw.valor_total ?? raw.valor ?? jsonEmbutido?.valor_total,
          cliente_final_nome:
            anterior.cliente_final_nome ||
            anterior.cliente_nome ||
            raw.cliente_final_nome ||
            raw.cliente_nome ||
            jsonEmbutido?.cliente_final_nome ||
            null,
          cliente_final_cpf_cnpj:
            anterior.cliente_final_cpf_cnpj ||
            anterior.cliente_documento ||
            raw.cliente_final_cpf_cnpj ||
            raw.cliente_documento ||
            jsonEmbutido?.cliente_final_cpf_cnpj ||
            null,
          placa_veiculo:
            anterior.placa_veiculo ||
            anterior.veiculo_placa ||
            raw.placa_veiculo ||
            raw.veiculo_placa ||
            jsonEmbutido?.placa_veiculo ||
            null,
          dados_auditoria: anterior.dados_auditoria || raw.dados_auditoria || jsonEmbutido || null,
        };
        mapaPorChave.set(chave, mesclado);
        if (rawId) idParaChave.set(rawId, chave);
        if (recNorm) idParaChave.set(recNorm, chave);
      };

      // Ordem de prioridade: 1º Tabela dedicada, 2º Cache local do Balcão (sempre tem #REC e itens), 3º movimentacoes_caixa
      dedicadasAbertas.forEach(mesclarRegistro);
      locaisAbertas.forEach(mesclarRegistro);
      movsAbertas.forEach(mesclarRegistro);

      // Mapeia todas as candidatas pelo mapper oficial e ordena da MAIS RECENTE para a mais antiga,
      // priorizando ordens que possuem recibo oficial emitido no Balcão (#REC-YYYY-NNNNNN)
      const candidatas = Array.from(mapaPorChave.values())
        .map((raw) => {
          const { jsonEmbutido } = separarDescricaoEJson(raw?.descricao);
          const possuiReciboExplicito = Boolean(
            raw?.numero_recibo ||
              raw?.protocolo_recibo ||
              raw?.fatura_numero ||
              jsonEmbutido?.numero_recibo ||
              (typeof raw?.descricao === 'string' && /(?:Recibo|Protocolo):\s*#?REC-/i.test(raw.descricao))
          );
          const ordem = mapOrdemDespachanteParaPdv({
            ...raw,
            despachante_id: d.id,
            despachante_nome: d.nome_razao,
            despachante_documento: d.documento,
          });
          return { ordem, possuiReciboExplicito };
        })
        .filter((c) => paraCentavos(c.ordem.valorTotal) > 0)
        .sort((a, b) => {
          if (a.possuiReciboExplicito !== b.possuiReciboExplicito) {
            return a.possuiReciboExplicito ? -1 : 1;
          }
          return new Date(b.ordem.dataHora).getTime() - new Date(a.ordem.dataHora).getTime();
        });

      // Isola estritamente as ordens em aberto (da mais recente para a mais antiga) que compõem o saldo devedor atual.
      // Nunca corta uma ordem ao meio e nunca inclui ordens antigas além do saldo devedor real.
      const ordens: FaturaDespachantePendente[] = [];
      const chavesExcedentesAntigas: string[] = [];
      let acumuladoCent = 0;

      for (const { ordem } of candidatas) {
        const valorOrdemCent = paraCentavos(ordem.valorTotal);
        if (acumuladoCent + valorOrdemCent <= saldoDevedorCent) {
          ordens.push(ordem);
          acumuladoCent += valorOrdemCent;
        } else if (ordens.length === 0 && acumuladoCent === 0) {
          // Caso a única ordem aberta recente seja ligeiramente diferente do saldo devedor gravado,
          // preserva a ordem real intacta com seus itens e seu protocolo original.
          ordens.push(ordem);
          acumuladoCent += valorOrdemCent;
        } else {
          // Ordem antiga já quitada cujo status não havia sido baixado no banco legado
          if (ordem.id) chavesExcedentesAntigas.push(ordem.id);
          if (ordem.numeroRecibo) chavesExcedentesAntigas.push(ordem.numeroRecibo);
        }
      }

      if (chavesExcedentesAntigas.length > 0) {
        registrarIdsLiquidadosLocal(chavesExcedentesAntigas);
      }

      if (ordens.length === 0) continue;

      const totais = totalizarOrdens(ordens);

      resultado.push({
        despachante: d,
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
 * Assina mudanças em tempo real nas ordens, movimentações de caixa e despachantes para atualizar a esteira.
 */
export function inscreverFaturasDespachantesRealtime(onAtualizar: () => void) {
  const canal = supabase
    .channel('faturas_despachantes_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABELA_ORDENS }, () => onAtualizar())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentacoes_caixa' }, () => onAtualizar())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'despachantes' }, () => onAtualizar())
    .subscribe();

  return () => {
    supabase.removeChannel(canal);
  };
}

/**
 * Executa a liquidação/quitação de fatura do Despachante (individual, ordens selecionadas ou conta completa).
 * REGRAS CONTÁBEIS E FISCAIS ESTRITAS:
 * - Preserva 100% o `numero_recibo` original (`#REC-2026-XXXXXX`) das ordens liquidadas.
 * - Preserva os itens exatos das ordens liquidadas sem jamais duplicar quantidades (`1x` permanece `1x`).
 * - Garante que `Subtotal (itens) + ISSQN (2%) === TOTAL PAGO` ao centavo.
 * - Registra em `movimentacoes_caixa` com `tipo: 'liquidacao_fatura'` na forma de pagamento real.
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

  // 2. Identificar ordens liquidadas e seus recibos originais (#REC-...)
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
    if (fl.id && !todosIdsLiquidados.includes(fl.id)) {
      todosIdsLiquidados.push(fl.id);
    }
    const num = fl.numero_recibo || fl.protocolo_recibo;
    if (num) {
      const fmt = `#${String(num).trim().replace(/^#+/, '')}`;
      if (!recibosOriginaisLimpos.includes(fmt)) {
        recibosOriginaisLimpos.push(fmt);
      }
    }
  }

  const dataQuitacaoIso = new Date().toISOString();
  const formaPdv: FormaPagamento = formaPagamento === 'transferencia' ? 'pix' : formaPagamento;
  const patchQuitacao = {
    fatura_liquidada: true,
    status: 'QUITADA',
    data_quitacao: dataQuitacaoIso,
    forma_pagamento_quitacao: formaPdv,
  };

  // Registra tanto os IDs quanto os números de recibo como liquidados no storage local
  registrarIdsLiquidadosLocal([...todosIdsLiquidados, ...recibosOriginaisLimpos]);

  // 2.1 Baixa na tabela dedicada ordens_despachante (quando existir)
  if (todosIdsLiquidados.length > 0) {
    try {
      await supabase
        .from(TABELA_ORDENS)
        .update({
          status: 'QUITADA',
          quitada_em: dataQuitacaoIso,
          forma_pagamento_quitacao: formaPdv,
          caixa_quitacao_id: caixaId,
          operador_quitacao_nome: operadorNome,
        })
        .in('id', todosIdsLiquidados);
    } catch { }
  }
  if (recibosOriginaisLimpos.length > 0) {
    try {
      await supabase
        .from(TABELA_ORDENS)
        .update({
          status: 'QUITADA',
          quitada_em: dataQuitacaoIso,
          forma_pagamento_quitacao: formaPdv,
          caixa_quitacao_id: caixaId,
          operador_quitacao_nome: operadorNome,
        })
        .in('numero_recibo', recibosOriginaisLimpos);
    } catch { }
  }

  // 2.2 Baixa em movimentacoes_caixa
  if (todosIdsLiquidados.length > 0) {
    try {
      await atualizarMovimentacoesResiliente(todosIdsLiquidados, patchQuitacao);
    } catch { }
  }

  // IMPORTANTE: Sempre que o saldo do despachante zerar (novoSaldoCent === 0),
  // marca TODAS as movimentações e ordens faturadas daquele despachante como quitadas!
  if (novoSaldoCent === 0) {
    try {
      const { data: movsDesp } = await supabase
        .from('movimentacoes_caixa')
        .select('id, descricao')
        .eq('despachante_id', despachante.id)
        .eq('forma_pagamento', 'faturamento')
        .in('tipo', ['venda', 'faturamento_despachante']);
      const ids = ((movsDesp as any[]) || []).map((m) => m.id).filter(Boolean);
      const recsExtra: string[] = [];
      for (const m of (movsDesp as any[]) || []) {
        const { jsonEmbutido } = separarDescricaoEJson(m?.descricao);
        if (jsonEmbutido?.numero_recibo) recsExtra.push(jsonEmbutido.numero_recibo);
      }
      if (ids.length > 0) {
        registrarIdsLiquidadosLocal([...ids, ...recsExtra]);
        await atualizarMovimentacoesResiliente(ids, patchQuitacao);
      }
    } catch { }
    try {
      await supabase
        .from(TABELA_ORDENS)
        .update({
          status: 'QUITADA',
          quitada_em: dataQuitacaoIso,
          forma_pagamento_quitacao: formaPdv,
          caixa_quitacao_id: caixaId,
          operador_quitacao_nome: operadorNome,
        })
        .eq('despachante_id', despachante.id)
        .in('status', STATUS_ORDEM_ABERTA);
    } catch { }
  }

  // 2.3 Atualiza cache local do Balcão
  if (faturasLocais.length > 0) {
    const atualizadas = faturasLocais.map((f) => {
      const recF = f.numero_recibo ? `#${String(f.numero_recibo).trim().replace(/^#+/, '')}` : '';
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

  // 4. Itens e Valores Fiscais Exatos (Subtotal + ISSQN === Total Pago, sem duplicar quantidades)
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

  // 5. Registro de entrada no caixa (movimentacoes_caixa: tipo 'liquidacao_fatura')
  const descNumero = faturaReferenciaOriginal ? ` ${faturaReferenciaOriginal}` : '';
  const descOperacao = `Quitação Fatura${descNumero} | Despachante: ${despachante.nome_razao}`;
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
 * Registra lançamento direto a prazo na conta-corrente de um despachante a partir do Balcão CRVA.
 * FONTE ÚNICA DA VERDADE:
 * - Cria sempre um registro individual por atendimento com `status: 'ABERTA'` e `numero_recibo` imutável.
 * - Grava explicitamente `itens`, `subtotal`, `issqn`, `valor_total` e os campos opcionais de auditoria
 *   (`cliente_final_nome`, `cliente_final_cpf_cnpj`, `placa_veiculo`) tanto nas colunas da tabela quanto
 *   em JSON estruturado de redundância (`dados_auditoria` e marcador embutido na `descricao`).
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

  // 2. Itens exatos deste atendimento e apuração fiscal estrita em centavos: Subtotal + ISSQN (2,00%) = Valor Total
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
      : `fat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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

  // 3. Se o despachante estava com saldo_devedor <= 0 antes deste novo lançamento,
  //    limpa/encerra quaisquer ordens anteriores dele para impedir contaminação de itens ou recibos antigos.
  const saldoAnterior = Number(despachante.saldo_devedor) || 0;
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

  // 4. Atualizar atomicamente o saldo devedor do despachante no banco
  const novoSaldo = deCentavos(Math.max(0, paraCentavos(saldoAnterior)) + totalCent);
  const { error: errSaldo } = await supabase
    .from('despachantes')
    .update({ saldo_devedor: novoSaldo })
    .eq('id', despachante.id);

  if (errSaldo) {
    throw new Error(`Falha ao atualizar o saldo devedor do despachante no banco de dados: ${errSaldo.message}`);
  }

  // 5. Payload individual da ordem (status: 'ABERTA') com itens exatos e vínculo de auditoria
  const itensOrdem = itensNormalizados.map((it) => ({
    codigo: it.codigo,
    descricao: it.servico,
    servico: it.servico,
    quantidade: it.quantidade,
    valor_unitario: it.valor_unitario,
    subtotal: it.subtotal,
    numero_recibo: numeroRecibo,
    cliente_final_nome: clienteFinalNomeLimpo,
    cliente_final_cpf_cnpj: clienteFinalDocLimpo,
    placa_veiculo: placaVeiculoLimpa,
  }));

  const metadadosAuditoria = {
    id: idGerado,
    numero_recibo: numeroRecibo,
    protocolo_recibo: numeroRecibo,
    status: 'ABERTA',
    fatura_liquidada: false,
    despachante_id: despachante.id,
    despachante_nome: despachante.nome_razao,
    despachante_documento: despachante.documento,
    cliente_final_nome: clienteFinalNomeLimpo,
    cliente_final_cpf_cnpj: clienteFinalDocLimpo,
    placa_veiculo: placaVeiculoLimpa,
    veiculo_modelo: veiculoModelo,
    itens: itensOrdem,
    servicos: itensOrdem,
    subtotal,
    issqn: valorIssqn,
    valor_issqn: valorIssqn,
    valor_total: valorTotal,
    atendente_nome: atendenteNome,
    atendente_id: atendenteId,
    hash_autenticidade: hashAutenticidade,
    criado_em: dataHora,
  };

  // 5.1 Grava na tabela dedicada `ordens_despachante` (quando existente no Supabase)
  try {
    const { error: errOrd } = await supabase.from(TABELA_ORDENS).insert({
      id: idGerado,
      numero_recibo: numeroRecibo,
      despachante_id: despachante.id,
      status: 'ABERTA',
      itens: itensOrdem,
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
    if (errOrd && !ehErroTabelaInexistente(errOrd)) {
      console.warn('[lancarFaturaDespachanteBalcao] Aviso ao gravar em ordens_despachante:', errOrd.message);
    }
  } catch { }

  // 5.2 Grava em `movimentacoes_caixa` com o JSON da ordem embutido em `descricao`
  //     (garante persistência de numero_recibo, itens e auditoria mesmo se colunas extras não existirem)
  const resumoServicos = itensNormalizados.map((i) => `${i.quantidade}x ${i.servico}`).join(', ');
  const horaFormatada = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const partesDescVisivel = [
    resumoServicos.slice(0, 120),
    `Despachante: ${despachante.nome_razao}`,
    `Recibo: ${numeroRecibo}`,
    clienteFinalNomeLimpo ? `Cliente: ${clienteFinalNomeLimpo}` : null,
    clienteFinalDocLimpo ? `Doc: ${clienteFinalDocLimpo}` : null,
    placaVeiculoLimpa ? `Placa: ${placaVeiculoLimpa}` : null,
  ].filter(Boolean);
  const descricaoCompleta = `${partesDescVisivel.join(' | ')} ${MARCADOR_JSON_DESCRICAO}${JSON.stringify(metadadosAuditoria)}`;

  const payloadMov: Record<string, any> = {
    id: idGerado,
    caixa_id: null,
    operador_id: atendenteId || null,
    operador_nome: atendenteNome || 'Atendente Balcão CRVA',
    tipo: 'faturamento_despachante',
    forma_pagamento: 'faturamento',
    status: 'ABERTA',
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
    itens: itensOrdem,
    servicos: itensOrdem,
    dados_auditoria: metadadosAuditoria,
    snapshot_ata: metadadosAuditoria,
    descricao: descricaoCompleta,
    subtotal,
    issqn: valorIssqn,
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
      await inserirMovimentacaoResiliente({
        ...payloadMov,
        tipo: 'venda',
        forma_pagamento: 'faturamento',
      });
    }
  } catch (e: any) {
    console.warn('[lancarFaturaDespachanteBalcao] Aviso ao gravar em movimentacoes_caixa:', e?.message);
  }

  // 5.3 Salva registro individual completo no cache local imediato (com descricao limpa para UI e dados_auditoria completos)
  salvarFaturaBalcaoLocal({
    ...payloadMov,
    descricao: partesDescVisivel.join(' | '),
    status: 'ABERTA',
    fatura_liquidada: false,
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
