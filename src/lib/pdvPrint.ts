import { useState, useEffect, useCallback } from 'react';
import { formatarMoeda } from './pdvCaixa';
import { mascararDocumento } from '../utils/documento';

export type PdvPrintFormat = 'thermal_80mm' | 'thermal_58mm' | 'a4_standard';

export const PDV_PRINT_FORMAT_KEY = 'pdv_print_format';
const PRINT_FORMAT_EVENT = 'pdv-print-format-changed';

export interface PdvPrintProfileMeta {
  id: PdvPrintFormat;
  title: string;
  shortLabel: string;
  subtitle: string;
  badgeText: string;
}

export const PDV_PRINT_PROFILES: Record<PdvPrintFormat, PdvPrintProfileMeta> = {
  thermal_80mm: {
    id: 'thermal_80mm',
    title: 'Impressora Térmica 80mm',
    shortLabel: 'Térmica 80mm',
    subtitle: 'Bobina padrão PDV (largura 80mm • fonte condensada)',
    badgeText: 'Formato: Térmica 80mm',
  },
  thermal_58mm: {
    id: 'thermal_58mm',
    title: 'Impressora Térmica 58mm',
    shortLabel: 'Térmica 58mm',
    subtitle: 'Mini bobina compacta (largura 58mm • layout estreito)',
    badgeText: 'Formato: Térmica 58mm',
  },
  a4_standard: {
    id: 'a4_standard',
    title: 'Impressão Normal • Folha A4',
    shortLabel: 'Folha A4',
    subtitle: 'Impressora comum laser/jato de tinta (2 vias na mesma folha A4)',
    badgeText: 'Formato: Folha A4',
  },
};

export const PDV_PRINT_PROFILE_LIST: PdvPrintProfileMeta[] = [
  PDV_PRINT_PROFILES.thermal_80mm,
  PDV_PRINT_PROFILES.thermal_58mm,
  PDV_PRINT_PROFILES.a4_standard,
];

function isValidPrintFormat(value: unknown): value is PdvPrintFormat {
  return value === 'thermal_80mm' || value === 'thermal_58mm' || value === 'a4_standard';
}

export function getPdvPrintFormat(): PdvPrintFormat {
  if (typeof window === 'undefined') return 'thermal_80mm';
  try {
    const saved = window.localStorage.getItem(PDV_PRINT_FORMAT_KEY);
    if (isValidPrintFormat(saved)) return saved;
  } catch {
    // Fallback seguro se localStorage estiver bloqueado
  }
  return 'thermal_80mm';
}

export function setPdvPrintFormat(format: PdvPrintFormat): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PDV_PRINT_FORMAT_KEY, format);
    window.dispatchEvent(new CustomEvent<PdvPrintFormat>(PRINT_FORMAT_EVENT, { detail: format }));
  } catch {
    // Ignora falha silenciosa de storage
  }
}

export function usePdvPrintFormat(): [PdvPrintFormat, (format: PdvPrintFormat) => void] {
  const [format, setFormatState] = useState<PdvPrintFormat>(() => getPdvPrintFormat());

  useEffect(() => {
    const handleCustom = (e: Event) => {
      const detail = (e as CustomEvent<PdvPrintFormat>).detail;
      if (isValidPrintFormat(detail)) {
        setFormatState(detail);
      } else {
        setFormatState(getPdvPrintFormat());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === PDV_PRINT_FORMAT_KEY && isValidPrintFormat(e.newValue)) {
        setFormatState(e.newValue);
      }
    };

    window.addEventListener(PRINT_FORMAT_EVENT, handleCustom);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(PRINT_FORMAT_EVENT, handleCustom);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const updateFormat = useCallback((next: PdvPrintFormat) => {
    setFormatState(next);
    setPdvPrintFormat(next);
  }, []);

  return [format, updateFormat];
}

/* ============================================================================
 *  MOTOR DE IMPRESSÃO ISOLADO (IFRAME OCULTO DEDICADO — ZERO TELA BRANCA)
 * ============================================================================ */

export interface ItemCupomImpressao {
  codigo: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  subtotal: number;
}

export interface DadosCupomImpressao {
  tituloDocumento?: string;
  subtituloDocumento?: string;
  numeroRecibo: string;
  dataHora: string;
  tomadorLabel?: string;
  tomadorNome: string;
  tomadorDocumento?: string | null;
  veiculoPlaca?: string | null;
  clienteFinalNome?: string | null;
  clienteFinalDocumento?: string | null;
  clienteFinalPlaca?: string | null;
  faturaReferencia?: string | null;
  atendenteNome?: string | null;
  operadorNome: string;
  formaPagamento: string;
  itens: ItemCupomImpressao[];
  subtotal: number;
  issqn: number;
  valorTotal: number;
  valorRecebido?: number | null;
  troco?: number | null;
  saldoAnterior?: number | null;
  saldoRestante?: number | null;
  itensQuitadosCount?: number | null;
  hashAutenticidade: string;
  labelVia1?: string;
  labelVia2?: string;
  assinaturaVia1?: string;
  assinaturaVia2?: string;
}

function escapeHtml(text: unknown): string {
  const s = String(text ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderViaThermalHtml(dados: DadosCupomImpressao, isVia1: boolean, compact58: boolean): string {
  const viaTag = isVia1
    ? dados.labelVia1 || '1ª VIA - CLIENTE / TOMADOR'
    : dados.labelVia2 || '2ª VIA - CONTROLE INTERNO CRVA';
  const assinatura = isVia1
    ? dados.assinaturaVia1 || 'Assinatura / Rubrica do Tomador'
    : dados.assinaturaVia2 || 'Rubrica Operador de Caixa CRVA';

  const docTomador = dados.tomadorDocumento ? mascararDocumento(dados.tomadorDocumento) : 'Não informado';
  const docCliFinal = dados.clienteFinalDocumento ? mascararDocumento(dados.clienteFinalDocumento) : '';

  const itensHtml = dados.itens
    .map((it) => {
      if (compact58) {
        return `
          <div class="item-58">
            <div class="item-name">${escapeHtml(it.codigo)} - ${escapeHtml(it.descricao)}</div>
            <div class="row">
              <span>${it.quantidade}x ${escapeHtml(formatarMoeda(it.valorUnitario))}</span>
              <span class="bold">${escapeHtml(formatarMoeda(it.subtotal))}</span>
            </div>
          </div>
        `;
      }
      return `
        <div class="item-80">
          <div class="item-name">${escapeHtml(it.codigo)} • ${escapeHtml(it.descricao)}</div>
          <div class="row">
            <span>${it.quantidade} un x ${escapeHtml(formatarMoeda(it.valorUnitario))}</span>
            <span class="bold">${escapeHtml(formatarMoeda(it.subtotal))}</span>
          </div>
        </div>
      `;
    })
    .join('');

  const saldoHtml =
    dados.saldoAnterior !== undefined && dados.saldoAnterior !== null
      ? `
        <div class="row"><span>Saldo Anterior:</span><span>${escapeHtml(formatarMoeda(dados.saldoAnterior))}</span></div>
        <div class="row bold"><span>Saldo Restante:</span><span>${escapeHtml(formatarMoeda(dados.saldoRestante ?? 0))}</span></div>
      `
      : '';

  const trocoHtml =
    dados.valorRecebido && dados.valorRecebido > dados.valorTotal
      ? `
        <div class="row"><span>Valor Recebido:</span><span>${escapeHtml(formatarMoeda(dados.valorRecebido))}</span></div>
        <div class="row"><span>Troco:</span><span>${escapeHtml(formatarMoeda(dados.troco || 0))}</span></div>
      `
      : '';

  const temClienteFinal = Boolean(dados.clienteFinalNome || docCliFinal || dados.clienteFinalPlaca);
  const clienteFinalHtml = temClienteFinal
    ? `
      <div class="sep"></div>
      <div class="sec-title">VÍNCULO DE AUDITORIA (CLIENTE FINAL)</div>
      ${dados.clienteFinalNome ? `<div class="bold">${escapeHtml(dados.clienteFinalNome)}</div>` : ''}
      ${docCliFinal ? `<div>CPF/CNPJ: ${escapeHtml(docCliFinal)}</div>` : ''}
      ${dados.clienteFinalPlaca ? `<div>Placa: <span class="bold">${escapeHtml(dados.clienteFinalPlaca.toUpperCase())}</span></div>` : ''}
    `
    : '';

  return `
    <section class="via">
      <div class="center">
        <div class="brand">MARKS SYSTEMS • CRVA DETRAN/RS</div>
        <div class="doc-title">${escapeHtml(dados.tituloDocumento || 'COMPROVANTE DE QUITAÇÃO FISCAL')}</div>
        <div class="via-badge">${escapeHtml(viaTag)}</div>
        <div class="meta">Doc: ${escapeHtml(dados.numeroRecibo)}</div>
        <div class="meta">Emissão: ${escapeHtml(dados.dataHora)}</div>
      </div>

      <div class="sep"></div>

      <div>
        <div class="sec-title">${escapeHtml(dados.tomadorLabel || 'TOMADOR / REQUERENTE')}</div>
        <div class="bold">${escapeHtml(dados.tomadorNome)}</div>
        <div>CPF/CNPJ: ${escapeHtml(docTomador)}</div>
        ${dados.veiculoPlaca ? `<div>Placa: <span class="bold">${escapeHtml(dados.veiculoPlaca.toUpperCase())}</span></div>` : ''}
        ${dados.faturaReferencia ? `<div>Ref. Recibo: <span class="bold">${escapeHtml(dados.faturaReferencia)}</span></div>` : ''}
      </div>

      ${clienteFinalHtml}

      <div class="sep"></div>
      <div class="sec-title">DISCRIMINAÇÃO DOS SERVIÇOS</div>
      ${itensHtml}

      <div class="sep"></div>
      <div class="row"><span>Subtotal Serviços:</span><span>${escapeHtml(formatarMoeda(dados.subtotal))}</span></div>
      <div class="row"><span>(+) ISSQN (2,00%):</span><span>${escapeHtml(formatarMoeda(dados.issqn))}</span></div>
      <div class="row total-row"><span>TOTAL PAGO:</span><span>${escapeHtml(formatarMoeda(dados.valorTotal))}</span></div>
      <div class="row"><span>Forma Pagamento:</span><span class="bold">${escapeHtml(dados.formaPagamento)}</span></div>
      ${trocoHtml}
      ${saldoHtml}

      <div class="sep"></div>
      <div class="meta">Operador: ${escapeHtml(dados.operadorNome)}</div>
      ${dados.atendenteNome ? `<div class="meta">Atendente: ${escapeHtml(dados.atendenteNome)}</div>` : ''}
      ${dados.itensQuitadosCount ? `<div class="meta">Ordens baixadas: ${escapeHtml(dados.itensQuitadosCount)}</div>` : ''}
      <div class="meta">Autenticação: ${escapeHtml(dados.hashAutenticidade)}</div>

      <div class="sign-box">
        <div class="sign-line"></div>
        <div class="sign-label">${escapeHtml(assinatura)}</div>
      </div>
    </section>
  `;
}

function renderViaA4Html(dados: DadosCupomImpressao, isVia1: boolean): string {
  const viaTag = isVia1
    ? dados.labelVia1 || '1ª VIA — COMPROVANTE DO CLIENTE / TOMADOR'
    : dados.labelVia2 || '2ª VIA — CONTROLE INTERNO / CAIXA CRVA';
  const assinatura = isVia1
    ? dados.assinaturaVia1 || 'Assinatura / Rubrica do Tomador'
    : dados.assinaturaVia2 || 'Rubrica Operador de Caixa CRVA';

  const docTomador = dados.tomadorDocumento ? mascararDocumento(dados.tomadorDocumento) : 'Não informado';
  const docCliFinal = dados.clienteFinalDocumento ? mascararDocumento(dados.clienteFinalDocumento) : 'N/I';

  const rowsHtml = dados.itens
    .map(
      (it) => `
      <tr>
        <td class="mono">${escapeHtml(it.codigo)}</td>
        <td>${escapeHtml(it.descricao)}</td>
        <td class="center mono">${it.quantidade}</td>
        <td class="right mono">${escapeHtml(formatarMoeda(it.valorUnitario))}</td>
        <td class="right mono bold">${escapeHtml(formatarMoeda(it.subtotal))}</td>
      </tr>
    `
    )
    .join('');

  const saldoHtml =
    dados.saldoAnterior !== undefined && dados.saldoAnterior !== null
      ? `
        <div class="fin-extra">
          Saldo Anterior: ${escapeHtml(formatarMoeda(dados.saldoAnterior))} &nbsp;|&nbsp;
          Saldo Restante: <strong>${escapeHtml(formatarMoeda(dados.saldoRestante ?? 0))}</strong>
        </div>
      `
      : '';

  const trocoHtml =
    dados.valorRecebido && dados.valorRecebido > dados.valorTotal
      ? `
        <div class="fin-extra">
          Recebido: ${escapeHtml(formatarMoeda(dados.valorRecebido))} &nbsp;|&nbsp;
          Troco: ${escapeHtml(formatarMoeda(dados.troco || 0))}
        </div>
      `
      : '';

  const blocoDireito = `
      <div class="lbl">ATENDIMENTO E CAIXA</div>
      ${dados.atendenteNome ? `<div class="val">Atendente: <strong>${escapeHtml(dados.atendenteNome)}</strong></div>` : ''}
      <div class="val">Operador Caixa: <strong>${escapeHtml(dados.operadorNome)}</strong></div>
      ${dados.faturaReferencia ? `<div class="val mono">Ref. Recibos: <strong>${escapeHtml(dados.faturaReferencia)}</strong></div>` : ''}
    `;

  const temAuditoriaA4 = Boolean(dados.clienteFinalNome || dados.clienteFinalDocumento || dados.clienteFinalPlaca);
  const blocoAuditoriaA4 = temAuditoriaA4
    ? `
      <div class="a4-audit">
        <div class="lbl">VÍNCULO DE AUDITORIA (CLIENTE FINAL)</div>
        <div class="val">
          ${dados.clienteFinalNome ? `Cliente Final Vinculado: <strong>${escapeHtml(dados.clienteFinalNome)}</strong>` : ''}
          ${dados.clienteFinalDocumento ? `${dados.clienteFinalNome ? ' &nbsp;•&nbsp; ' : ''}CPF/CNPJ: <strong class="mono">${escapeHtml(docCliFinal)}</strong>` : ''}
          ${dados.clienteFinalPlaca ? `${(dados.clienteFinalNome || dados.clienteFinalDocumento) ? ' &nbsp;•&nbsp; ' : ''}Placa: <strong class="mono">${escapeHtml(dados.clienteFinalPlaca.toUpperCase())}</strong>` : ''}
        </div>
      </div>
    `
    : '';

  return `
    <section class="a4-via">
      <div class="a4-header">
        <div>
          <div class="a4-brand">MARKS SYSTEMS • CRVA DETRAN/RS</div>
          <div class="a4-title">${escapeHtml(dados.tituloDocumento || 'Comprovante de Quitação Fiscal')}</div>
          <div class="a4-sub">Emissão: ${escapeHtml(dados.dataHora)} • Turno Caixa</div>
        </div>
        <div class="right">
          <div class="a4-badge">${escapeHtml(viaTag)}</div>
          <div class="a4-proto mono">${escapeHtml(dados.numeroRecibo)}</div>
        </div>
      </div>

      <div class="a4-grid">
        <div>
          <div class="lbl">${escapeHtml(dados.tomadorLabel || 'TOMADOR / REQUERENTE')}</div>
          <div class="val bold">${escapeHtml(dados.tomadorNome)}</div>
          <div class="val mono">CPF/CNPJ: ${escapeHtml(docTomador)}${
            dados.veiculoPlaca ? ` • Placa: <strong>${escapeHtml(dados.veiculoPlaca.toUpperCase())}</strong>` : ''
          }</div>
        </div>
        <div>
          ${blocoDireito}
        </div>
      </div>

      ${blocoAuditoriaA4}

      <table class="a4-table">
        <thead>
          <tr>
            <th style="width: 14%">Cód.</th>
            <th>Descrição do Ato / Serviço</th>
            <th class="center" style="width: 8%">Qtd</th>
            <th class="right" style="width: 17%">Unitário</th>
            <th class="right" style="width: 17%">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="a4-totals">
        <div>
          <div>Forma de Pagamento: <strong>${escapeHtml(dados.formaPagamento)}</strong></div>
          ${trocoHtml}
          ${saldoHtml}
          <div class="auth mono">Autenticação: ${escapeHtml(dados.hashAutenticidade)}</div>
        </div>
        <div class="right mono">
          <div class="subtot">Subtotal: ${escapeHtml(formatarMoeda(dados.subtotal))} &nbsp;|&nbsp; ISSQN (2%): +${escapeHtml(formatarMoeda(dados.issqn))}</div>
          <div class="total-paid">TOTAL PAGO: ${escapeHtml(formatarMoeda(dados.valorTotal))}</div>
        </div>
      </div>

      <div class="a4-footer">
        <div class="foot-note">Autenticação digital Marks Systems • Documento emitido pelo terminal Integra PDV</div>
        <div class="a4-sign">
          <div class="a4-sign-line"></div>
          <div>${escapeHtml(assinatura)}</div>
        </div>
      </div>
    </section>
  `;
}

export function buildComprovantePrintHtml(dados: DadosCupomImpressao, format: PdvPrintFormat): string {
  const title = `Cupom Fiscal ${dados.numeroRecibo} - Marks Systems`;

  if (format === 'thermal_80mm' || format === 'thermal_58mm') {
    const is58 = format === 'thermal_58mm';
    const pageWidth = is58 ? '58mm' : '80mm';
    const bodyWidth = is58 ? '54mm' : '76mm';
    const baseFont = is58 ? '9px' : '10.5px';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: ${pageWidth} auto; margin: 2mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: "Courier New", Courier, monospace;
      font-size: ${baseFont};
      line-height: 1.32;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: ${bodyWidth};
      max-width: 100%;
      margin: 0 auto;
      padding: 1mm 0;
      background: #ffffff;
      color: #000000;
    }
    .via { padding: 2mm 0; }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .brand { font-weight: 700; font-size: ${is58 ? '10px' : '11.5px'}; letter-spacing: 0.2px; }
    .doc-title { font-weight: 700; margin-top: 2px; font-size: ${is58 ? '9px' : '10.5px'}; }
    .via-badge {
      display: inline-block;
      margin: 4px 0 3px;
      padding: 2px 5px;
      border: 1px solid #000000;
      font-weight: 700;
      font-size: ${is58 ? '8px' : '9px'};
    }
    .meta { font-size: ${is58 ? '8.5px' : '9.5px'}; }
    .sec-title { font-weight: 700; text-transform: uppercase; margin-bottom: 2px; font-size: ${is58 ? '8.5px' : '9.5px'}; }
    .sep { border-top: 1px dashed #000000; margin: 5px 0; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .item-58, .item-80 { margin-bottom: 4px; }
    .item-name { word-break: break-word; font-weight: 600; }
    .total-row {
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid #000000;
      font-weight: 700;
      font-size: ${is58 ? '10.5px' : '12px'};
    }
    .sign-box { margin-top: 14px; text-align: center; }
    .sign-line { border-top: 1px solid #000000; margin: 0 8px 3px; }
    .sign-label { font-size: ${is58 ? '8px' : '9px'}; }
    .cut-line {
      margin: 8px 0;
      border-top: 1px dashed #000000;
      text-align: center;
      padding-top: 2px;
      font-size: ${is58 ? '8px' : '9px'};
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="sheet">
    ${renderViaThermalHtml(dados, true, is58)}
    <div class="cut-line">------ CORTE AQUI • 2ª VIA ------</div>
    ${renderViaThermalHtml(dados, false, is58)}
  </div>
</body>
</html>`;
  }

  // Formato Folha A4 (2 vias na mesma folha A4)
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .a4-sheet {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
      background: #ffffff;
      color: #000000;
    }
    .a4-via {
      border: 1px solid #222222;
      border-radius: 6px;
      padding: 12px 14px;
      background: #ffffff;
      page-break-inside: avoid;
    }
    .a4-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1.5px solid #222222;
      padding-bottom: 8px;
      margin-bottom: 8px;
      gap: 12px;
    }
    .a4-brand { font-weight: 800; font-size: 12.5px; letter-spacing: 0.3px; }
    .a4-title { font-weight: 700; font-size: 11px; margin-top: 2px; }
    .a4-sub { font-size: 9.5px; color: #333333; margin-top: 2px; }
    .a4-badge {
      display: inline-block;
      border: 1px solid #000000;
      padding: 2px 7px;
      border-radius: 999px;
      font-weight: 800;
      font-size: 8.5px;
      text-transform: uppercase;
    }
    .a4-proto { font-weight: 700; font-size: 11px; margin-top: 4px; }
    .a4-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      border: 1px solid #cccccc;
      background: #f8f8f8;
      border-radius: 4px;
      padding: 7px 9px;
      margin-bottom: 8px;
    }
    .a4-audit {
      border: 1px solid #888888;
      background: #f3f4f6;
      border-radius: 4px;
      padding: 6px 9px;
      margin-bottom: 8px;
    }
    .lbl { font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #444444; margin-bottom: 2px; }
    .val { font-size: 10.5px; }
    .a4-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      font-size: 10px;
    }
    .a4-table th {
      text-align: left;
      border-bottom: 1.5px solid #222222;
      padding: 4px 5px;
      font-size: 8.5px;
      text-transform: uppercase;
      color: #222222;
    }
    .a4-table td {
      border-bottom: 1px solid #dddddd;
      padding: 4px 5px;
      vertical-align: top;
    }
    .a4-totals {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid #222222;
      background: #f8f8f8;
      border-radius: 4px;
      padding: 7px 10px;
      gap: 12px;
      font-size: 10.5px;
    }
    .fin-extra { font-size: 9.5px; color: #222222; margin-top: 2px; }
    .auth { font-size: 9px; color: #444444; margin-top: 3px; }
    .subtot { font-size: 9.5px; color: #333333; }
    .total-paid { font-size: 13px; font-weight: 900; margin-top: 2px; }
    .a4-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px dashed #999999;
      gap: 12px;
    }
    .foot-note { font-size: 8.5px; color: #444444; }
    .a4-sign { text-align: center; width: 220px; font-size: 9px; font-weight: 700; }
    .a4-sign-line { border-top: 1px solid #000000; margin-bottom: 3px; }
    .a4-cut {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 0;
      font-family: "Courier New", Courier, monospace;
      font-size: 9px;
      font-weight: 700;
      color: #444444;
    }
    .a4-cut-line { flex: 1; border-top: 1.5px dashed #666666; }
    .mono { font-family: "Courier New", Courier, monospace; }
    .bold { font-weight: 700; }
    .center { text-align: center; }
    .right { text-align: right; }
  </style>
</head>
<body>
  <div class="a4-sheet">
    ${renderViaA4Html(dados, true)}
    <div class="a4-cut">
      <div class="a4-cut-line"></div>
      <span>✂ CORTE AQUI • 2ª VIA ARQUIVO CAIXA</span>
      <div class="a4-cut-line"></div>
    </div>
    ${renderViaA4Html(dados, false)}
  </div>
</body>
</html>`;
}

/**
 * Imprime o comprovante em um <iframe> oculto dedicado.
 * 100% imune a modais `fixed`, `overflow-hidden` ou tema escuro do Tailwind.
 */
export function imprimirComprovanteIsolado(
  dados: DadosCupomImpressao,
  formatOverride?: PdvPrintFormat
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const formatoAtivo = formatOverride || getPdvPrintFormat();
  const html = buildComprovantePrintHtml(dados, formatoAtivo);

  // Remove qualquer iframe residual anterior
  const antigo = document.getElementById('integra-pdv-print-frame');
  if (antigo && antigo.parentNode) {
    antigo.parentNode.removeChild(antigo);
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'integra-pdv-print-frame';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  document.body.appendChild(iframe);

  const removerIframe = () => {
    try {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    } catch {
      // ignora se já removido
    }
  };

  const acionarImpressao = () => {
    const win = iframe.contentWindow;
    if (!win) {
      removerIframe();
      return;
    }

    let limpo = false;
    const cleanup = () => {
      if (limpo) return;
      limpo = true;
      setTimeout(removerIframe, 400);
    };

    try {
      win.onafterprint = cleanup;
      win.focus();
      win.print();
    } catch (err) {
      console.error('[pdvPrint] Falha ao acionar impressão no iframe isolado:', err);
      cleanup();
    }

    // Fallback de segurança caso o navegador não dispare onafterprint
    setTimeout(cleanup, 60000);
  };

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    removerIframe();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Aguarda o layout do iframe estabilizar antes de chamar print()
  setTimeout(acionarImpressao, 150);
}
