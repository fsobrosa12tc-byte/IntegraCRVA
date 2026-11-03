import React from 'react';
import { CheckCircle2, Printer, Scissors, X, Building2, User } from 'lucide-react';
import type { ComprovanteLiquidacao } from '../../lib/pdvContaCorrente';
import type { ItemFaturamentoDespachante } from '../../types/pdv';
import { formatarBRL } from '../../lib/pdvCaixa';

export interface ReciboQuitacaoDespachanteProps {
  comprovante: ComprovanteLiquidacao;
  servicos?: ItemFaturamentoDespachante[];
  onFechar?: () => void;
}

export default function ReciboQuitacaoDespachante({
  comprovante,
  servicos,
  onFechar,
}: ReciboQuitacaoDespachanteProps) {
  // Itens consolidados de serviços
  const listaServicos: ItemFaturamentoDespachante[] =
    comprovante.servicos && comprovante.servicos.length > 0
      ? comprovante.servicos
      : servicos && servicos.length > 0
      ? servicos
      : [
          {
            codigo: 'SRV-0001',
            servico: 'Serviços Notariais / Balcão CRVA',
            quantidade: 1,
            valor_unitario: Math.round((comprovante.valorLiquidado / 1.02) * 100) / 100,
            subtotal: Math.round((comprovante.valorLiquidado / 1.02) * 100) / 100,
          },
        ];

  const subtotalServicos =
    comprovante.subtotalServicos !== undefined
      ? comprovante.subtotalServicos
      : Math.round(
          listaServicos.reduce((acc, i) => acc + Number(i.subtotal || 0), 0) * 100
        ) / 100;

  const valorIssqn = comprovante.valorIssqnSegregado;
  const totalLiquidado = comprovante.valorLiquidado;
  const dataFormatada = new Date(comprovante.dataHora).toLocaleString('pt-BR');

  const rotuloForma = (forma: string): string => {
    const f = forma.toLowerCase();
    if (f === 'pix') return 'PIX';
    if (f === 'dinheiro') return 'Dinheiro';
    if (f === 'cartao_debito' || f === 'debito') return 'Cartão de Débito';
    if (f === 'cartao_credito' || f === 'credito') return 'Cartão de Crédito';
    if (f === 'transferencia') return 'Transferência Bancária';
    return forma.toUpperCase();
  };

  /**
   * Renderiza uma das vias do recibo (1ª Via: Caixa/CRVA ou 2ª Via: Despachante)
   */
  const renderizarVia = (tipoVia: 'caixa' | 'despachante') => {
    const ehCaixa = tipoVia === 'caixa';
    const tituloVia = ehCaixa ? '1ª VIA · CAIXA / CRVA' : '2ª VIA · DESPACHANTE';
    const badgeBg = ehCaixa ? 'bg-slate-900 text-white' : 'bg-emerald-700 text-white';
    const tituloDoc = ehCaixa
      ? 'RECIBO DE QUITAÇÃO DE CONTA-CORRENTE'
      : 'COMPROVANTE DE QUITAÇÃO DE CONTA-CORRENTE';
    const labelAssinatura = ehCaixa
      ? 'Assinatura do Despachante'
      : 'Autenticação do Caixa do CRVA';

    return (
      <div className="p-4 sm:p-5 bg-white text-slate-900 rounded-2xl border border-slate-300 shadow-sm space-y-2.5 font-sans leading-tight">
        {/* Topo do Recibo */}
        <div className="flex items-start justify-between border-b border-dashed border-slate-300 pb-2">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
              INTEGRA CRVA · REGISTRO VEICULAR
            </div>
            <h4 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
              {tituloDoc}
            </h4>
            <div className="text-[10px] font-mono text-slate-600">
              Protocolo: <strong className="text-slate-950 font-bold">{comprovante.protocolo}</strong>
            </div>
          </div>
          <div className="text-right">
            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${badgeBg}`}>
              {tituloVia}
            </span>
            <div className="text-[10px] text-slate-500 font-mono mt-1">
              {dataFormatada}
            </div>
          </div>
        </div>

        {/* Identificação do Parceiro / Despachante */}
        <div className="grid grid-cols-2 gap-2 text-xs py-1 border-b border-dashed border-slate-300 font-mono">
          <div>
            <span className="text-slate-500 block text-[9px] uppercase">Despachante:</span>
            <strong className="text-slate-900 text-[11px] leading-tight block truncate">
              {comprovante.despachante.nome_razao}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[9px] uppercase">CPF / CNPJ:</span>
            <strong className="text-slate-900 text-[11px]">
              {comprovante.despachante.documento}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[9px] uppercase">Fatura(s) Liquidada(s):</span>
            <strong className="text-indigo-700 text-[11px] block truncate">
              {comprovante.faturaNumeroOriginal || 'Fatura Balcão'}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[9px] uppercase">Meio de Pagamento:</span>
            <strong className="text-emerald-700 text-[11px] uppercase">
              {rotuloForma(comprovante.meioPagamento)}
            </strong>
          </div>
        </div>

        {/* 1. SEÇÃO: DISCRIMINAÇÃO DOS ATOS NOTARIAIS / SERVIÇOS QUITADOS */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700 pb-1">
            DISCRIMINAÇÃO DOS ATOS NOTARIAIS / SERVIÇOS QUITADOS
          </div>

          {/* 2. TABELA ANALÍTICA COMPACTA E FORMATADA PARA IMPRESSÃO */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] font-mono border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300 text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase">
                  <th className="py-1 px-1 w-16 text-left">CÓD</th>
                  <th className="py-1 px-1 text-left font-sans">DESCRIÇÃO DO SERVIÇO</th>
                  <th className="py-1 px-1 w-12 text-center">QTD</th>
                  <th className="py-1 px-1 w-20 text-right">UNITÁRIO</th>
                  <th className="py-1 px-1 w-20 text-right">SUBTOTAL</th>
                </tr>
              </thead>
              <tbody>
                {listaServicos.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-200 text-black">
                    <td className="py-1 px-1 text-slate-600 font-semibold align-top">{item.codigo}</td>
                    <td className="py-1 px-1 font-sans text-slate-900 font-medium text-[11px] leading-tight align-top">
                      {item.servico}
                    </td>
                    <td className="py-1 px-1 text-center font-bold text-slate-800 align-top">{item.quantidade}x</td>
                    <td className="py-1 px-1 text-right text-slate-700 align-top">{formatarBRL(item.valor_unitario)}</td>
                    <td className="py-1 px-1 text-right font-bold text-slate-950 align-top">{formatarBRL(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. QUADRO DE TOTAIS LOGO ABAIXO DA TABELA */}
        <div className="bg-slate-50 p-2 sm:p-2.5 rounded-xl border border-slate-200 text-xs font-mono space-y-1">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal dos Serviços:</span>
            <span className="font-semibold text-slate-800">{formatarBRL(subtotalServicos)}</span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-600">
            <span>(+) ISSQN Municipal (2,00%):</span>
            <span className="font-semibold text-slate-800">{formatarBRL(valorIssqn)}</span>
          </div>
          <div className="flex justify-between text-xs sm:text-sm font-black text-emerald-800 border-t border-slate-300 pt-1">
            <span>TOTAL LIQUIDADO:</span>
            <span>{formatarBRL(totalLiquidado)}</span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 border-t border-dashed border-slate-200 pt-1">
            <span>Saldo Anterior em Conta:</span>
            <span>{formatarBRL(comprovante.saldoAnterior)}</span>
          </div>
          <div className="flex justify-between text-[11px] font-bold text-slate-900">
            <span>Saldo Devedor Restante:</span>
            <span className="text-amber-800 font-black">{formatarBRL(comprovante.saldoRestante)}</span>
          </div>
        </div>

        {/* Rodapé e Assinaturas */}
        <div className="pt-1 text-[9px] text-slate-500 flex justify-between items-center font-mono">
          <span>Operador: {comprovante.operadorNome}</span>
          <span>{comprovante.itensQuitadosCount} ordem(ns) baixada(s)</span>
        </div>

        <div className="pt-3 border-t border-slate-200 text-center">
          <div className="w-48 mx-auto border-t border-slate-400 mt-1"></div>
          <span className="text-[9px] uppercase font-bold text-slate-500">
            {labelAssinatura}
          </span>
        </div>

        {/* Hash de Segurança */}
        <div className="text-[8px] text-center font-mono text-slate-400 pt-0.5">
          Hash de Conformidade: {comprovante.hashAutenticidade}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-5 sm:p-6 text-slate-100 space-y-4 my-auto max-h-[92vh] overflow-y-auto print:bg-white print:text-black print:p-0 print:border-none print:shadow-none">
      {/* Barra de Ações Superior (Oculta na Impressão) */}
      <div className="no-print flex items-center justify-between pb-3 border-b border-slate-800 print:hidden">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 size={22} />
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-tight">
              Quitação Confirmada com Sucesso
            </h3>
            <p className="text-[11px] text-slate-400">
              Protocolo: <span className="font-mono text-emerald-400 font-bold">{comprovante.protocolo}</span>
            </p>
          </div>
        </div>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg border-0 cursor-pointer transition-colors"
            title="Fechar Janela"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* ÁREA DE IMPRESSÃO DAS 2 VIAS (ISOLADA PARA O MOTOR DE IMPRESSÃO CSS) */}
      <div
        id="recibo-quitacao-duas-vias"
        className="printable-content space-y-4 print:space-y-4 print:p-0"
        style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
      >
        {/* 1ª VIA: VIA DO CAIXA / ESTABELECIMENTO */}
        {renderizarVia('caixa')}

        {/* LINHA DE CORTE PONTILHADA (DIVISÃO DE VIAS) */}
        <div className="flex items-center justify-center gap-2 text-slate-400 font-mono text-[10px] select-none my-2 print:my-2">
          <Scissors size={14} className="text-slate-400" />
          <div className="border-t border-dashed border-slate-400 flex-1"></div>
          <span className="font-bold text-[9px] tracking-wider uppercase text-slate-500">
            CORTE AQUI (DIVISÃO DE VIAS)
          </span>
          <div className="border-t border-dashed border-slate-400 flex-1"></div>
        </div>

        {/* 2ª VIA: VIA DO CLIENTE / DESPACHANTE */}
        {renderizarVia('despachante')}
      </div>

      {/* BOTÕES DE AÇÃO DO RECIBO (OCULTOS NA IMPRESSÃO) */}
      <div className="no-print flex items-center gap-3 pt-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-700 shadow-sm"
        >
          <Printer size={16} className="text-emerald-400" />
          <span>Imprimir Recibo (2 Vias)</span>
        </button>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border-0 shadow-lg shadow-emerald-950/50"
          >
            Concluir
          </button>
        )}
      </div>
    </div>
  );
}

