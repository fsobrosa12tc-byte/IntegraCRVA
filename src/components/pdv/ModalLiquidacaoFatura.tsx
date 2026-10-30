import React, { useState } from 'react';
import {
  X,
  Wallet,
  QrCode,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Printer,
  Scissors,
} from 'lucide-react';
import type { Despachante, FaturaDespachantePendente } from '../../types/pdv';
import { formatarBRL } from '../../lib/pdvCaixa';
import { liquidarFaturaDespachante, type ComprovanteLiquidacao } from '../../lib/pdvContaCorrente';

interface ModalLiquidacaoFaturaProps {
  fatura: FaturaDespachantePendente;
  despachante: Despachante;
  faturasIds?: string[];
  itensQuitadosCount?: number;
  caixaId: string | null;
  operadorNome: string;
  operadorId?: string | null;
  onClose: () => void;
  onConcluido: (comprovante: ComprovanteLiquidacao) => void;
}

export default function ModalLiquidacaoFatura({
  fatura,
  despachante,
  faturasIds,
  itensQuitadosCount = 1,
  caixaId,
  operadorNome,
  operadorId,
  onClose,
  onConcluido,
}: ModalLiquidacaoFaturaProps) {
  const [forma, setForma] = useState<'pix' | 'dinheiro' | 'cartao_debito' | 'cartao_credito'>('pix');
  const [liquidando, setLiquidando] = useState(false);
  const [erro, setErro] = useState('');
  const [comprovante, setComprovante] = useState<ComprovanteLiquidacao | null>(null);

  const handleConfirmar = async () => {
    if (!caixaId) {
      setErro('É necessário ter um turno de caixa aberto no terminal para processar a liquidação.');
      return;
    }

    setLiquidando(true);
    setErro('');

    try {
      const comp = await liquidarFaturaDespachante({
        despachante,
        valorPago: fatura.valorTotal,
        formaPagamento: forma,
        caixaId,
        operadorNome,
        operadorId,
        faturaId: fatura.id,
        faturasIds: faturasIds && faturasIds.length > 0 ? faturasIds : [fatura.id],
        itensQuitadosCount,
        faturaNumero: fatura.numeroRecibo,
      });

      setComprovante(comp);
      onConcluido(comp);
    } catch (err: any) {
      setErro(err.message || 'Falha ao processar a liquidação da fatura.');
    } finally {
      setLiquidando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* 1. SE COMPROVANTE GERADO: EXIBE RECIBO DE QUITAÇÃO EM 2 VIAS */}
      {comprovante ? (
        <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-6 text-slate-100 space-y-5 my-auto max-h-[92vh] overflow-y-auto print:bg-white print:text-black print:p-0 print:border-none print:shadow-none">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 print:hidden">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 size={24} />
              <h3 className="text-base font-black text-white uppercase tracking-tight">
                Quitação Confirmada com Sucesso
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg border-0 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* ÁREA DE IMPRESSÃO DAS 2 VIAS */}
          <div id="recibo-quitacao-duas-vias" className="space-y-6">
            {/* 1ª VIA: VIA DO CAIXA / ESTABELECIMENTO */}
            <div className="p-5 bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-sm space-y-3 font-sans">
              <div className="flex items-start justify-between border-b border-dashed border-slate-300 pb-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    INTEGRA CRVA · REGISTRO VEICULAR
                  </div>
                  <h4 className="text-sm font-black text-slate-900">
                    RECIBO DE QUITAÇÃO DE CONTA-CORRENTE
                  </h4>
                  <div className="text-[11px] font-mono text-slate-500">
                    Protocolo: <strong className="text-slate-800">{comprovante.protocolo}</strong>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-900 text-white uppercase tracking-wider">
                    1ª VIA · CAIXA / CRVA
                  </span>
                  <div className="text-[10px] text-slate-500 font-mono mt-1">
                    {new Date(comprovante.dataHora).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs py-1 border-b border-dashed border-slate-300 font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">Despachante:</span>
                  <strong className="text-slate-900 text-[11px]">{comprovante.despachante.nome_razao}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">CPF / CNPJ:</span>
                  <strong className="text-slate-900 text-[11px]">{comprovante.despachante.documento}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Fatura(s) Liquidada(s):</span>
                  <strong className="text-indigo-700 text-[11px]">
                    {comprovante.faturaNumeroOriginal || fatura.numeroRecibo}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Meio de Pagamento:</span>
                  <strong className="text-emerald-700 text-[11px] uppercase">{comprovante.meioPagamento}</strong>
                </div>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs font-mono space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Saldo Anterior:</span>
                  <span>{formatarBRL(comprovante.saldoAnterior)}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-emerald-700 border-t border-slate-200 pt-1">
                  <span>Valor Quitado:</span>
                  <span>{formatarBRL(comprovante.valorLiquidado)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>ISSQN Retido (2,00%):</span>
                  <span>{formatarBRL(comprovante.valorIssqnSegregado)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-slate-900 border-t border-slate-200 pt-1">
                  <span>Saldo Devedor Restante:</span>
                  <span>{formatarBRL(comprovante.saldoRestante)}</span>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-slate-500 flex justify-between items-center font-mono">
                <span>Operador: {comprovante.operadorNome}</span>
                <span>{comprovante.itensQuitadosCount} ordem(ns) baixada(s)</span>
              </div>

              <div className="pt-4 border-t border-slate-200 text-center">
                <div className="w-48 mx-auto border-t border-slate-400 mt-2"></div>
                <span className="text-[9px] uppercase font-bold text-slate-400">Assinatura do Despachante</span>
              </div>
            </div>

            {/* LINHA DE CORTE PONTILHADA */}
            <div className="flex items-center justify-center gap-2 text-slate-400 font-mono text-[10px] select-none my-2">
              <Scissors size={14} className="text-slate-400" />
              <div className="border-t border-dashed border-slate-500 flex-1"></div>
              <span>CORTE AQUI (DIVISÃO DE VIAS)</span>
              <div className="border-t border-dashed border-slate-500 flex-1"></div>
            </div>

            {/* 2ª VIA: VIA DO CLIENTE / DESPACHANTE */}
            <div className="p-5 bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-sm space-y-3 font-sans">
              <div className="flex items-start justify-between border-b border-dashed border-slate-300 pb-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    INTEGRA CRVA · REGISTRO VEICULAR
                  </div>
                  <h4 className="text-sm font-black text-slate-900">
                    COMPROVANTE DE QUITAÇÃO DE CONTA-CORRENTE
                  </h4>
                  <div className="text-[11px] font-mono text-slate-500">
                    Protocolo: <strong className="text-slate-800">{comprovante.protocolo}</strong>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-700 text-white uppercase tracking-wider">
                    2ª VIA · DESPACHANTE
                  </span>
                  <div className="text-[10px] text-slate-500 font-mono mt-1">
                    {new Date(comprovante.dataHora).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs py-1 border-b border-dashed border-slate-300 font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">Despachante:</span>
                  <strong className="text-slate-900 text-[11px]">{comprovante.despachante.nome_razao}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">CPF / CNPJ:</span>
                  <strong className="text-slate-900 text-[11px]">{comprovante.despachante.documento}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Fatura(s) Liquidada(s):</span>
                  <strong className="text-indigo-700 text-[11px]">
                    {comprovante.faturaNumeroOriginal || fatura.numeroRecibo}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Meio de Pagamento:</span>
                  <strong className="text-emerald-700 text-[11px] uppercase">{comprovante.meioPagamento}</strong>
                </div>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs font-mono space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Saldo Anterior:</span>
                  <span>{formatarBRL(comprovante.saldoAnterior)}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-emerald-700 border-t border-slate-200 pt-1">
                  <span>Valor Quitado:</span>
                  <span>{formatarBRL(comprovante.valorLiquidado)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>ISSQN Retido (2,00%):</span>
                  <span>{formatarBRL(comprovante.valorIssqnSegregado)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-slate-900 border-t border-slate-200 pt-1">
                  <span>Saldo Devedor Restante:</span>
                  <span>{formatarBRL(comprovante.saldoRestante)}</span>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-slate-500 flex justify-between items-center font-mono">
                <span>Operador do Caixa: {comprovante.operadorNome}</span>
                <span>{comprovante.itensQuitadosCount} ordem(ns) baixada(s)</span>
              </div>

              <div className="pt-4 border-t border-slate-200 text-center">
                <div className="w-48 mx-auto border-t border-slate-400 mt-2"></div>
                <span className="text-[9px] uppercase font-bold text-slate-400">
                  Autenticação do Caixa do CRVA
                </span>
              </div>
            </div>
          </div>

          {/* BOTÕES DE AÇÃO DO RECIBO */}
          <div className="flex items-center gap-3 pt-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
            >
              <Printer size={16} />
              <span>Imprimir Recibo (2 Vias)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border-0 shadow-lg shadow-emerald-950/50"
            >
              Concluir
            </button>
          </div>
        </div>
      ) : (
        /* 2. FORMULÁRIO DE ESCOLHA DO MEIO DE LIQUIDAÇÃO */
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-slate-100 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                <Wallet size={18} />
              </div>
              <div>
                <h3 className="text-base font-black text-white tracking-tight">
                  Liquidar Conta de Despachante
                </h3>
                <span className="text-xs font-mono font-bold text-indigo-400">
                  {fatura.numeroRecibo}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 rounded-lg border-0 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* DETALHES DA FATURA */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Despachante
                </span>
                <span className="text-sm font-bold text-white block">{fatura.despachanteNome}</span>
                <span className="text-xs font-mono text-slate-400">{fatura.despachanteDocumento}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Ordens
                </span>
                <span className="text-xs font-mono text-slate-300">
                  {itensQuitadosCount} {itensQuitadosCount === 1 ? 'ordem' : 'ordens'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-850">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Serviços Faturados
              </span>
              <p className="text-xs text-slate-300 font-medium line-clamp-2">{fatura.resumoServicos}</p>
            </div>

            <div className="pt-2 border-t border-slate-850 flex items-center justify-between font-mono">
              <div>
                <span className="text-[10px] text-slate-400 block">ISSQN Retido (2,00%)</span>
                <span className="text-xs text-slate-300 font-semibold">{formatarBRL(fatura.valorIssqn)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">
                  Valor Total a Liquidar
                </span>
                <span className="text-xl font-black text-emerald-400 tabular-nums">
                  {formatarBRL(fatura.valorTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* SELEÇÃO DO MEIO DE PAGAMENTO */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Selecione o Meio de Pagamento:
            </label>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              {[
                { id: 'dinheiro' as const, rotulo: '💵 Dinheiro' },
                { id: 'pix' as const, rotulo: '⚡ PIX' },
                { id: 'cartao_debito' as const, rotulo: '💳 Débito' },
                { id: 'cartao_credito' as const, rotulo: '💳 Crédito' },
              ].map((op) => {
                const ativo = forma === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setForma(op.id)}
                    className={`rounded-xl border py-3 px-4 transition-all duration-200 shadow-sm flex items-center justify-center gap-2 cursor-pointer font-medium ${
                      ativo
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-500/50 shadow-emerald-950/30'
                        : 'border-slate-700/80 bg-slate-900/60 hover:bg-slate-800 text-slate-200'
                    }`}
                  >
                    <span>{op.rotulo}</span>
                  </button>
                );
              })}
            </div>

            {forma === 'dinheiro' ? (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-[11px] text-emerald-300 flex items-start gap-2">
                <Banknote size={16} className="shrink-0 mt-0.5 text-emerald-400" />
                <span>
                  <strong>Entrada Física de Espécie:</strong> O valor de {formatarBRL(fatura.valorTotal)} será somado na gaveta física do caixa diário ativo.
                </span>
              </div>
            ) : (
              <div className="p-3 bg-sky-950/30 border border-sky-800/50 rounded-xl text-[11px] text-sky-300 flex items-start gap-2">
                <QrCode size={16} className="shrink-0 mt-0.5 text-sky-400" />
                <span>
                  <strong>Liquidação Eletrônica:</strong> Soma exclusivamente no card do meio selecionado e não altera a gaveta física.
                </span>
              </div>
            )}
          </div>

          {erro && (
            <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-semibold flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-400" />
              <span>{erro}</span>
            </div>
          )}

          {/* AÇÕES */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={liquidando}
              className="flex-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-100 py-3 px-4 font-medium text-xs transition-all cursor-pointer border border-slate-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={liquidando}
              onClick={handleConfirmar}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer border-0"
            >
              {liquidando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              <span>Confirmar Quitação</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
