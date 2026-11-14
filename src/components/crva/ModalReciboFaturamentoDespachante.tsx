import React from 'react';
import {
  X,
  Printer,
  CheckCircle2,
  Building2,
  FileText,
  Car,
} from 'lucide-react';
import type { ReciboFaturamentoDespachante } from '../../types/pdv';
import { formatarBRL } from '../../lib/pdvCaixa';
import { mascararDocumento, mascararTelefone } from '../../utils/documento';

interface ModalReciboFaturamentoDespachanteProps {
  recibo: ReciboFaturamentoDespachante;
  onFechar: () => void;
}

export default function ModalReciboFaturamentoDespachante({
  recibo,
  onFechar,
}: ModalReciboFaturamentoDespachanteProps) {
  const dataFormatada = new Date(recibo.dataHora).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const protocoloFormatado = recibo.numeroRecibo.startsWith('#')
    ? recibo.numeroRecibo
    : `#${recibo.numeroRecibo}`;

  const temVinculoAuditoria = Boolean(
    (recibo.clienteNome && recibo.clienteNome.trim()) ||
    (recibo.clienteDocumento && recibo.clienteDocumento.trim()) ||
    (recibo.veiculoPlaca && recibo.veiculoPlaca.trim())
  );

  /**
   * Mecanismo de impressão isolado via iframe oculto para evitar
   * páginas em branco e garantir layout econômico P&B perfeito para impressoras.
   */
  const handleImprimirRecibo = () => {
    const reciboElement = document.getElementById('recibo-lancamento-prazo-print');
    if (!reciboElement) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>CRVA DETRAN/RS • Comprovante de Faturamento a Prazo - ${protocoloFormatado}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm 12mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
              margin: 0;
              padding: 0;
              font-size: 11px;
              line-height: 1.35;
            }
            .recibo-container {
              max-width: 720px;
              margin: 0 auto;
              border: 1px solid #94a3b8;
              padding: 16px 20px;
              border-radius: 4px;
              background: #ffffff !important;
            }
            .recibo-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 8px;
              margin-bottom: 12px;
            }
            .recibo-title-box {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .recibo-title {
              font-size: 13px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              margin: 0;
              color: #0f172a;
            }
            .recibo-sub {
              font-size: 10px;
              color: #475569;
              margin: 2px 0 0 0;
            }
            .recibo-meta {
              text-align: right;
              font-family: monospace;
              font-size: 10px;
              color: #334155;
            }
            .section-label {
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #475569;
              margin-bottom: 4px;
            }
            .box-card {
              border: 1px solid #cbd5e1;
              background: #f8fafc;
              padding: 8px 10px;
              border-radius: 4px;
              margin-bottom: 10px;
            }
            .grid-3 {
              display: grid;
              grid-template-columns: 2fr 1.5fr 1.5fr;
              gap: 8px;
            }
            .grid-field label {
              display: block;
              font-size: 8.5px;
              color: #64748b;
              text-transform: uppercase;
            }
            .grid-field span {
              font-size: 10.5px;
              font-weight: 600;
              color: #0f172a;
            }
            .auditoria-badge {
              background: #f1f5f9;
              border: 1px solid #cbd5e1;
              padding: 6px 10px;
              border-radius: 4px;
              margin-bottom: 10px;
              font-size: 10px;
              color: #1e293b;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 10px;
            }
            th {
              background: #f1f5f9;
              color: #334155;
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              text-align: left;
              padding: 5px 8px;
              border-top: 1px solid #cbd5e1;
              border-bottom: 1px solid #cbd5e1;
            }
            td {
              padding: 5px 8px;
              border-bottom: 1px solid #e2e8f0;
              font-size: 10px;
              color: #0f172a;
            }
            .total-bar {
              display: flex;
              justify-content: space-between;
              align-items: center;
              background: #f8fafc;
              padding: 6px 10px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              font-size: 11px;
              font-weight: 600;
              margin-bottom: 10px;
            }
            .termo-legal {
              font-size: 8.5px;
              color: #64748b;
              border-left: 2px solid #94a3b8;
              padding-left: 8px;
              margin-bottom: 16px;
              text-align: justify;
            }
            .assinaturas-box {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 24px;
              margin-top: 24px;
            }
            .linha-assinatura {
              border-top: 1px solid #0f172a;
              padding-top: 4px;
              text-align: center;
              font-size: 9px;
              color: #1e293b;
            }
          </style>
        </head>
        <body>
          <div class="recibo-container">
            <!-- Cabeçalho Enxuto e Horizontal -->
            <div class="recibo-header">
              <div class="recibo-title-box">
                <div>
                  <h1 class="recibo-title">CRVA DETRAN/RS • Faturamento a Prazo</h1>
                  <p class="recibo-sub">Conta-Corrente de Despachante Documentalista</p>
                </div>
              </div>
              <div class="recibo-meta">
                <div><strong>Protocolo:</strong> ${protocoloFormatado}</div>
                <div><strong>Emissão:</strong> ${dataFormatada}</div>
              </div>
            </div>

            <!-- Dados do Despachante -->
            <div class="section-label">Despachante Parceiro</div>
            <div class="box-card grid-3">
              <div class="grid-field">
                <label>Razão Social / Nome</label>
                <span>${recibo.despachante.nome_razao}</span>
              </div>
              <div class="grid-field">
                <label>CNPJ / CRDD</label>
                <span>${mascararDocumento(recibo.despachante.documento)}</span>
              </div>
              <div class="grid-field">
                <label>Novo Saldo Devedor</label>
                <span>${formatarBRL(recibo.despachante.saldo_devedor)}</span>
              </div>
            </div>

            <!-- Vínculo Opcional de Auditoria -->
            ${
              temVinculoAuditoria
                ? `
                <div class="auditoria-badge">
                  <strong>Vínculo de Auditoria:</strong>
                  ${recibo.clienteNome ? ` Cliente: <strong>${recibo.clienteNome}</strong>` : ''}
                  ${recibo.clienteDocumento ? ` • CPF/CNPJ: <strong>${mascararDocumento(recibo.clienteDocumento)}</strong>` : ''}
                  ${recibo.veiculoPlaca ? ` • Placa: <strong>${recibo.veiculoPlaca.toUpperCase()}</strong>` : ''}
                  ${recibo.veiculoModelo ? ` • Modelo: <strong>${recibo.veiculoModelo}</strong>` : ''}
                </div>
              `
                : ''
            }

            <!-- Tabela de Serviços -->
            <div class="section-label">Discriminação dos Serviços</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 50px;">Cód.</th>
                  <th>Descrição do Serviço</th>
                  <th style="width: 40px; text-align: center;">Qtd</th>
                  <th style="width: 80px; text-align: right;">Unitário</th>
                  <th style="width: 85px; text-align: right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${recibo.itens
                  .map(
                    (item) => `
                  <tr>
                    <td style="font-family: monospace;">${item.codigo}</td>
                    <td>${item.servico}</td>
                    <td style="text-align: center; font-weight: bold;">${item.quantidade}</td>
                    <td style="text-align: right; font-family: monospace;">${formatarBRL(item.valor_unitario)}</td>
                    <td style="text-align: right; font-family: monospace; font-weight: bold;">${formatarBRL(item.subtotal)}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>

            <!-- Totais -->
            <div class="total-bar">
              <div>
                Subtotal: <strong>${formatarBRL(recibo.subtotal)}</strong>
                &nbsp;&nbsp;•&nbsp;&nbsp;
                ISSQN (2%): <strong>${formatarBRL(recibo.valorIssqn)}</strong>
              </div>
              <div style="font-size: 12px; font-weight: 800;">
                TOTAL FATURADO: <span style="color: #047857; margin-left: 6px;">${formatarBRL(recibo.valorTotal)}</span>
              </div>
            </div>

            <!-- Termo e Autenticação -->
            <div class="termo-legal">
              Declaro que os serviços acima discriminados foram devidamente conferidos e lançados a débito na conta-corrente conveniada do despachante credenciado, com autorização expressa para faturamento nos termos do convênio operacional estabelecido com o CRVA.
              <br>
              <strong>Autenticação Digital:</strong> ${recibo.hashAutenticidade || 'AUTENTICADO'}
            </div>

            <!-- Assinaturas -->
            <div class="assinaturas-box">
              <div class="linha-assinatura">
                <strong>${recibo.despachante.nome_razao}</strong><br>
                Despachante Credenciado / Responsável
              </div>
              <div class="linha-assinatura">
                <strong>${recibo.atendenteNome || 'Atendente Responsável'}</strong><br>
                Operador / Balcão CRVA • Detran/RS
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }, 350);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn print:p-0 print:bg-white">
      {/* Container Principal do Modal */}
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 my-auto print:border-none print:shadow-none print:max-w-none print:w-full print:bg-white print:text-black">
        
        {/* 1. BARRA SUPERIOR DO MODAL (AÇÕES DE TELA - NÃO IMPRESSA) */}
        <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 print:hidden">
          <span className="text-xs font-medium text-slate-400">
            Visualização de Comprovante
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleImprimirRecibo}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border-0 shadow-sm shadow-indigo-600/30"
              title="Imprimir Comprovante de Faturamento"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Comprovante</span>
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer border-0 bg-transparent"
              title="Fechar Janela"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2 & 3. CORPO COMPACTO DO COMPROVANTE */}
        <div
          id="recibo-lancamento-prazo-print"
          className="p-5 sm:p-6 text-xs text-slate-100 print:p-0 print:bg-white print:text-black space-y-4"
        >
          <div className="recibo-container bg-slate-950/60 p-5 rounded-xl border border-slate-800 space-y-3.5 print:bg-white print:border-slate-300 print:p-4 print:text-black">
            
            {/* CABEÇALHO ENXUTO DO COMPROVANTE (HORIZONTAL) */}
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3 print:border-slate-800">
              {/* Lado Esquerdo: Logo pequena + Título e Subtítulo */}
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 print:hidden">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-sm font-bold text-slate-100 tracking-tight leading-tight print:text-black">
                    CRVA DETRAN/RS • Faturamento a Prazo
                  </h1>
                  <p className="text-[11px] text-slate-400 print:text-slate-600 leading-tight mt-0.5">
                    Conta-Corrente de Despachante Documentalista
                  </p>
                </div>
              </div>

              {/* Lado Direito: Metadados Compactos */}
              <div className="text-right text-[11px] text-slate-300 font-mono space-y-0.5 shrink-0 print:text-black">
                <div>
                  Protocolo: <strong className="text-indigo-400 font-bold print:text-black">{protocoloFormatado}</strong>
                </div>
                <div className="text-slate-400 print:text-slate-600">
                  Emissão: <span className="text-slate-200 print:text-black">{dataFormatada}</span>
                </div>
              </div>
            </div>

            {/* BLOCO DO DESPACHANTE (COMPACTO) */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 flex items-center gap-1.5 print:text-slate-700">
                <Building2 className="w-3 h-3 text-indigo-400 print:hidden" />
                <span>Despachante Parceiro</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 py-2.5 px-3 bg-slate-950/60 rounded-lg border border-slate-800/80 print:bg-slate-50 print:border-slate-300 print:text-black">
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block print:text-slate-600">Razão Social / Nome:</span>
                  <span className="text-xs font-semibold text-white truncate block print:text-black">{recibo.despachante.nome_razao}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block print:text-slate-600">CNPJ / CRDD:</span>
                  <span className="text-xs font-mono text-slate-200 block print:text-black">{mascararDocumento(recibo.despachante.documento)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block print:text-slate-600">Saldo Devedor Atualizado:</span>
                  <span className="text-xs font-mono font-bold text-amber-400 block print:text-black">{formatarBRL(recibo.despachante.saldo_devedor)}</span>
                </div>
              </div>
            </div>

            {/* BLOCO OPCIONAL DE AUDITORIA (EXIBIR APENAS SE PREENCHIDO) */}
            {temVinculoAuditoria && (
              <div className="py-2 px-3 bg-indigo-950/30 border border-indigo-800/40 rounded-lg text-xs flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300 print:bg-slate-100 print:border-slate-300 print:text-black">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1 print:text-slate-700">
                  <Car className="w-3 h-3 print:hidden" /> Vínculo Auditoria:
                </span>
                {recibo.clienteNome && (
                  <span>
                    Cliente: <strong className="text-white font-medium print:text-black">{recibo.clienteNome}</strong>
                  </span>
                )}
                {recibo.clienteDocumento && (
                  <span>
                    • CPF/CNPJ: <span className="font-mono text-slate-200 print:text-black">{mascararDocumento(recibo.clienteDocumento)}</span>
                  </span>
                )}
                {recibo.veiculoPlaca && (
                  <span>
                    • Placa: <span className="font-mono font-bold text-emerald-400 uppercase print:text-black">{recibo.veiculoPlaca.toUpperCase()}</span>
                  </span>
                )}
                {recibo.veiculoModelo && (
                  <span>
                    • Modelo: <span className="text-slate-300 print:text-black">{recibo.veiculoModelo}</span>
                  </span>
                )}
              </div>
            )}

            {/* TABELA DE SERVIÇOS FATURADOS */}
            <div>
              <h4 className="text-[11px] font-semibold uppercase text-slate-400 mb-1.5 print:text-slate-700">
                Discriminação dos Serviços
              </h4>
              <div className="overflow-hidden border border-slate-800 rounded-lg print:border-slate-300">
                <table className="w-full text-left border-collapse text-xs print:text-black">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-bold print:bg-slate-100 print:text-slate-800 print:border-slate-300">
                      <th className="py-1.5 px-2.5 w-16">Cód.</th>
                      <th className="py-1.5 px-2.5">Descrição do Serviço</th>
                      <th className="py-1.5 px-2.5 text-center w-12">Qtd</th>
                      <th className="py-1.5 px-2.5 text-right w-24">Unitário</th>
                      <th className="py-1.5 px-2.5 text-right w-24">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 print:bg-white print:divide-slate-200">
                    {recibo.itens.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/20 print:hover:bg-transparent">
                        <td className="py-1.5 px-2.5 font-mono text-[11px] text-indigo-300 print:text-black">{item.codigo}</td>
                        <td className="py-1.5 px-2.5 text-slate-200 font-medium print:text-black">{item.servico}</td>
                        <td className="py-1.5 px-2.5 text-center font-mono font-bold text-slate-300 print:text-black">{item.quantidade}</td>
                        <td className="py-1.5 px-2.5 text-right font-mono text-slate-300 print:text-black">{formatarBRL(item.valor_unitario)}</td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold text-white print:text-black">{formatarBRL(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* QUADRO TOTALIZADOR */}
            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 flex flex-wrap justify-between items-center gap-3 text-xs font-mono print:bg-slate-50 print:border-slate-300 print:text-black">
              <div className="flex items-center gap-3 text-slate-400 print:text-slate-600">
                <span>Subtotal: <strong className="text-slate-200 print:text-black">{formatarBRL(recibo.subtotal)}</strong></span>
                <span>•</span>
                <span>ISSQN (2%): <strong className="text-amber-400 print:text-black">{formatarBRL(recibo.valorIssqn)}</strong></span>
              </div>
              <div className="text-xs font-semibold text-slate-300 print:text-black">
                TOTAL FATURADO: <span className="text-sm font-bold text-indigo-400 font-mono ml-1.5 print:text-black">{formatarBRL(recibo.valorTotal)}</span>
              </div>
            </div>

            {/* TERMO DE ANUÊNCIA E AUTENTICAÇÃO */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="text-[10px] text-slate-400 leading-relaxed border-l-2 border-slate-700/80 pl-2.5 print:text-slate-600 print:border-slate-400">
                Declaro que os serviços acima discriminados foram devidamente conferidos e lançados a débito na conta-corrente conveniada do despachante credenciado, com autorização expressa para faturamento nos termos do convênio operacional estabelecido com o CRVA.
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono pt-1 print:text-slate-600">
                <span>Autenticação Digital: <strong className="text-emerald-400 font-bold print:text-black">{recibo.hashAutenticidade || 'AUTENTICADO'}</strong></span>
              </div>
            </div>

            {/* ASSINATURAS COMPACTAS */}
            <div className="grid grid-cols-2 gap-6 pt-3">
              <div className="border-t border-slate-700/80 pt-1.5 text-center text-xs print:border-slate-800">
                <strong className="block text-white text-[11px] truncate print:text-black">{recibo.despachante.nome_razao}</strong>
                <span className="text-[10px] text-slate-400 block print:text-slate-600">Despachante Credenciado / Responsável</span>
              </div>
              <div className="border-t border-slate-700/80 pt-1.5 text-center text-xs print:border-slate-800">
                <strong className="block text-white text-[11px] truncate print:text-black">{recibo.atendenteNome || 'Atendente Responsável'}</strong>
                <span className="text-[10px] text-slate-400 block print:text-slate-600">Operador / Balcão CRVA • Detran/RS</span>
              </div>
            </div>

          </div>
        </div>

        {/* 4. RODAPÉ DA JANELA (NÃO IMPRESSO) */}
        <div className="p-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
            <CheckCircle2 size={15} />
            <span>Lançamento gravado com sucesso na conta do parceiro!</span>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer border border-slate-700/60"
          >
            Concluir / Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
