import React from 'react';
import {
  X,
  Printer,
  CheckCircle2,
  Building2,
  FileText,
  User,
  Car,
  ShieldCheck,
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
  /**
   * Mecanismo de impressão isolado via iframe oculto para evitar
   * páginas em branco geradas por overflow/fixed do modal.
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
          <title>Recibo Oficial de Lançamento a Prazo - ${recibo.numeroRecibo}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 15mm;
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
              line-height: 1.4;
            }
            .recibo-container {
              max-width: 720px;
              margin: 0 auto;
              border: 1px solid #cbd5e1;
              padding: 24px;
              border-radius: 4px;
            }
            .header-box {
              text-align: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 16px;
            }
            .header-title {
              font-size: 15px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin: 0 0 4px 0;
              color: #0f172a;
            }
            .header-sub {
              font-size: 10px;
              color: #475569;
              margin: 0;
            }
            .protocolo-bar {
              display: flex;
              justify-content: space-between;
              background: #f1f5f9;
              padding: 6px 12px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: 600;
              margin-bottom: 16px;
              border: 1px solid #e2e8f0;
            }
            .grid-info {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin-bottom: 16px;
            }
            .info-card {
              border: 1px solid #e2e8f0;
              padding: 10px 12px;
              border-radius: 4px;
              background: #fafafa;
            }
            .info-card h4 {
              margin: 0 0 6px 0;
              font-size: 10px;
              text-transform: uppercase;
              color: #64748b;
              font-weight: 700;
            }
            .info-line {
              display: flex;
              justify-content: space-between;
              margin-bottom: 3px;
            }
            .info-label {
              color: #64748b;
            }
            .info-value {
              font-weight: 600;
              color: #0f172a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 16px;
            }
            th {
              background: #f8fafc;
              color: #475569;
              font-size: 9px;
              text-transform: uppercase;
              text-align: left;
              padding: 6px 8px;
              border-top: 1px solid #cbd5e1;
              border-bottom: 1px solid #cbd5e1;
            }
            td {
              padding: 7px 8px;
              border-bottom: 1px solid #f1f5f9;
              font-size: 10px;
            }
            .total-box {
              display: flex;
              justify-content: flex-end;
              gap: 20px;
              background: #f8fafc;
              padding: 8px 12px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              font-size: 12px;
              font-weight: 700;
              margin-bottom: 24px;
            }
            .total-value {
              color: #047857;
              font-size: 14px;
            }
            .termo {
              font-size: 9px;
              color: #64748b;
              text-align: justify;
              margin-bottom: 28px;
              border-left: 2px solid #cbd5e1;
              padding-left: 8px;
            }
            .signatures {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 32px;
              margin-top: 36px;
            }
            .sig-line {
              border-top: 1px solid #0f172a;
              padding-top: 4px;
              text-align: center;
              font-size: 9px;
              color: #334155;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          ${reciboElement.innerHTML}
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

  const dataFormatada = new Date(recibo.dataHora).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      {/* Container Principal do Modal */}
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100 my-auto">
        
        {/* Cabeçalho da Janela de Ações */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                Recibo Oficial de Lançamento a Prazo
              </h3>
              <p className="text-[11px] text-slate-400">
                Protocolo: <span className="font-mono text-violet-300 font-bold">{recibo.numeroRecibo}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleImprimirRecibo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-colors shadow cursor-pointer border-0"
              title="Imprimir Recibo sem páginas em branco"
            >
              <Printer size={14} />
              <span>Imprimir</span>
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border-0 bg-transparent"
              title="Fechar Janela"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corpo do Documento com o ID isolado para extração via Iframe */}
        <div id="recibo-lancamento-prazo-print" className="p-6 sm:p-8 space-y-6 text-xs text-slate-100">
          <div className="recibo-container bg-slate-950/60 p-6 rounded-2xl border border-slate-800 space-y-5">
            
            {/* Topo Institucional */}
            <div className="header-box text-center pb-3 border-b border-slate-800">
              <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-violet-500/10 text-violet-400 mb-2">
                <Building2 size={24} />
              </div>
              <h1 className="header-title text-base sm:text-lg font-black tracking-tight text-white uppercase">
                Integra CRVA · Comprovante de Lançamento em Conta
              </h1>
              <p className="header-sub text-slate-400 text-[11px] mt-0.5">
                REGISTRO OFICIAL DE FATURAMENTO A PRAZO · SEGREGAÇÃO DE FUNÇÕES (BALCÃO / DETRAN-RS)
              </p>
            </div>

            {/* Barra de Protocolo e Emissão */}
            <div className="protocolo-bar flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300">
              <div>Protocolo: <strong className="text-violet-400 font-bold">{recibo.numeroRecibo}</strong></div>
              <div>Emissão: <strong className="text-white">{dataFormatada}</strong></div>
              <div>Autenticação: <strong className="text-emerald-400 font-bold">{recibo.hashAutenticidade || 'AUTENTICADO'}</strong></div>
            </div>

            {/* Dados do Despachante & Vínculo de Atendimento */}
            <div className="grid-info grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Card Despachante */}
              <div className="info-card bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <h4 className="text-[10px] font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 size={12} />
                  Despachante Credenciado (Sacado)
                </h4>
                <div className="info-line flex justify-between gap-2 text-xs">
                  <span className="info-label text-slate-400">Razão Social / Nome:</span>
                  <span className="info-value font-bold text-white text-right">{recibo.despachante.nome_razao}</span>
                </div>
                <div className="info-line flex justify-between gap-2 text-xs">
                  <span className="info-label text-slate-400">CNPJ / CPF:</span>
                  <span className="info-value font-mono text-slate-200">{mascararDocumento(recibo.despachante.documento)}</span>
                </div>
                {recibo.despachante.telefone && (
                  <div className="info-line flex justify-between gap-2 text-xs">
                    <span className="info-label text-slate-400">Telefone:</span>
                    <span className="info-value font-mono text-slate-300">{mascararTelefone(recibo.despachante.telefone)}</span>
                  </div>
                )}
                <div className="info-line flex justify-between gap-2 text-xs pt-1 border-t border-slate-800/80">
                  <span className="info-label text-slate-400">Novo Saldo Devedor:</span>
                  <span className="info-value font-mono font-bold text-amber-400">{formatarBRL(recibo.despachante.saldo_devedor)}</span>
                </div>
              </div>

              {/* Card Vínculo: Cliente / Requerente & Veículo */}
              <div className="info-card bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <h4 className="text-[10px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Car size={12} />
                  Vínculo de Atendimento / Veículo
                </h4>
                <div className="info-line flex justify-between gap-2 text-xs">
                  <span className="info-label text-slate-400">Cliente / Requerente:</span>
                  <span className="info-value font-bold text-white text-right">{recibo.clienteNome || 'Não informado'}</span>
                </div>
                {recibo.clienteDocumento && (
                  <div className="info-line flex justify-between gap-2 text-xs">
                    <span className="info-label text-slate-400">CPF / Doc:</span>
                    <span className="info-value font-mono text-slate-300">{recibo.clienteDocumento}</span>
                  </div>
                )}
                <div className="info-line flex justify-between gap-2 text-xs">
                  <span className="info-label text-slate-400">Placa do Veículo:</span>
                  <span className="info-value font-mono font-black text-white">{recibo.veiculoPlaca?.toUpperCase() || 'NÃO INFORMADA'}</span>
                </div>
                {recibo.veiculoModelo && (
                  <div className="info-line flex justify-between gap-2 text-xs">
                    <span className="info-label text-slate-400">Modelo:</span>
                    <span className="info-value text-slate-300 text-right">{recibo.veiculoModelo}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tabela de Serviços Faturados */}
            <div className="space-y-1.5">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Discriminação dos Atos Notariais / Serviços Faturados
              </h4>
              <div className="overflow-hidden border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-bold">
                      <th className="p-2.5">Cód</th>
                      <th className="p-2.5">Descrição do Serviço</th>
                      <th className="p-2.5 text-center">Qtd</th>
                      <th className="p-2.5 text-right">Unitário</th>
                      <th className="p-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {recibo.itens.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="p-2.5 font-mono text-[11px] text-slate-400">{item.codigo}</td>
                        <td className="p-2.5 text-slate-200 font-medium">{item.servico}</td>
                        <td className="p-2.5 text-center font-mono font-bold text-slate-300">{item.quantidade}</td>
                        <td className="p-2.5 text-right font-mono text-slate-300">{formatarBRL(item.valor_unitario)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-white">{formatarBRL(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quadro Totalizador */}
            <div className="total-box bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-wrap justify-between items-center gap-3 text-xs font-mono">
              <div className="flex items-center gap-3 text-slate-400">
                <span>Subtotal: <strong className="text-slate-200">{formatarBRL(recibo.subtotal)}</strong></span>
                <span>·</span>
                <span>ISSQN (2%): <strong className="text-amber-400">{formatarBRL(recibo.valorIssqn)}</strong></span>
              </div>
              <div className="text-sm font-bold text-white">
                TOTAL FATURADO: <span className="total-value text-base font-black text-emerald-400 ml-2">{formatarBRL(recibo.valorTotal)}</span>
              </div>
            </div>

            {/* Termo de Anuência e Faturamento */}
            <div className="termo text-[10px] text-slate-400 border-l-2 border-slate-700 pl-3 leading-relaxed">
              Declaro que os serviços acima discriminados foram devidamente conferidos e lançados a débito na conta-corrente conveniada do despachante credenciado, com autorização expressa para faturamento quinzenal/mensal nos termos do convênio operacional estabelecido com o CRVA.
            </div>

            {/* Assinaturas */}
            <div className="signatures grid grid-cols-2 gap-8 pt-4">
              <div className="sig-line border-t border-slate-700 pt-2 text-center text-xs">
                <strong className="block text-white text-[11px]">{recibo.despachante.nome_razao}</strong>
                <span className="text-[10px] text-slate-400">Assinatura do Despachante Credenciado / Responsável</span>
              </div>
              <div className="sig-line border-t border-slate-700 pt-2 text-center text-xs">
                <strong className="block text-white text-[11px]">{recibo.atendenteNome || 'Atendente Responsável'}</strong>
                <span className="text-[10px] text-slate-400">Operador / Balcão CRVA · Integração DETRAN-RS</span>
              </div>
            </div>

          </div>
        </div>

        {/* Rodapé da Janela (não impresso) */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
            <CheckCircle2 size={16} />
            <span>Lançamento gravado com sucesso na conta do parceiro!</span>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer border border-slate-700/60"
          >
            Concluir / Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
