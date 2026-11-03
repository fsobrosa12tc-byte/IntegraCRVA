import React, { useEffect, useState } from 'react';
import {
  X,
  Wallet,
  QrCode,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileText,
} from 'lucide-react';
import type { Despachante, FaturaDespachantePendente, ItemFaturamentoDespachante } from '../../types/pdv';
import { formatarBRL } from '../../lib/pdvCaixa';
import {
  liquidarFaturaDespachante,
  recuperarServicosOrdensLiquidadas,
  type ComprovanteLiquidacao,
} from '../../lib/pdvContaCorrente';
import ReciboQuitacaoDespachante from './ReciboQuitacaoDespachante';

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
  const [carregandoServicos, setCarregandoServicos] = useState(false);
  const [erro, setErro] = useState('');
  const [comprovante, setComprovante] = useState<ComprovanteLiquidacao | null>(null);
  const [servicosFatura, setServicosFatura] = useState<ItemFaturamentoDespachante[]>(
    fatura.servicos && fatura.servicos.length > 0 ? fatura.servicos : []
  );

  // Carrega e consolida todos os serviços vinculados às ordens a liquidar
  useEffect(() => {
    let montado = true;
    const carregar = async () => {
      if (fatura.servicos && fatura.servicos.length > 0) {
        setServicosFatura(fatura.servicos);
        return;
      }
      setCarregandoServicos(true);
      try {
        const itens = await recuperarServicosOrdensLiquidadas({
          faturasIds: faturasIds && faturasIds.length > 0 ? faturasIds : [fatura.id],
          resumoFallback: fatura.resumoServicos,
          valorTotalFallback: fatura.valorTotal,
        });
        if (montado && itens.length > 0) {
          setServicosFatura(itens);
        }
      } catch (e) {
        console.warn('Erro ao carregar serviços detalhados das ordens:', e);
      } finally {
        if (montado) setCarregandoServicos(false);
      }
    };

    carregar();
    return () => {
      montado = false;
    };
  }, [fatura.id, fatura.servicos, fatura.resumoServicos, fatura.valorTotal, faturasIds]);

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
        servicos: servicosFatura,
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
      {/* 1. SE COMPROVANTE GERADO: EXIBE RECIBO OFICIAL DE QUITAÇÃO EM 2 VIAS */}
      {comprovante ? (
        <ReciboQuitacaoDespachante
          comprovante={comprovante}
          servicos={servicosFatura}
          onFechar={onClose}
        />
      ) : (
        /* 2. FORMULÁRIO DE ESCOLHA DO MEIO DE LIQUIDAÇÃO COM DISCRIMINAÇÃO PRÉVIA */
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-slate-100 space-y-4 my-auto animate-in fade-in zoom-in-95 duration-200">
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
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2.5">
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

            {/* ITENS / SERVIÇOS DETALHADOS A LIQUIDAR */}
            <div className="pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between pb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Serviços Vinculados ({servicosFatura.length})
                </span>
                {carregandoServicos && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                    <Loader2 size={10} className="animate-spin" /> Carregando itens...
                  </span>
                )}
              </div>

              {servicosFatura.length > 0 ? (
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1 font-mono text-xs">
                  {servicosFatura.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-900 border border-slate-800/80 text-[11px]"
                    >
                      <div className="flex items-center gap-1.5 truncate max-w-[280px]">
                        <span className="text-slate-500 font-semibold">{item.codigo}</span>
                        <span className="text-slate-200 truncate">{item.servico}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-400">{item.quantidade}x</span>
                        <span className="font-bold text-emerald-400">{formatarBRL(item.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-300 font-medium line-clamp-2">{fatura.resumoServicos}</p>
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between font-mono">
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
            <div className="grid grid-cols-2 gap-2 text-xs">
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
                    className={`rounded-xl border py-2.5 px-3 transition-all duration-200 shadow-sm flex items-center justify-center gap-2 cursor-pointer font-medium ${
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
              <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-[11px] text-emerald-300 flex items-start gap-2">
                <Banknote size={15} className="shrink-0 mt-0.5 text-emerald-400" />
                <span>
                  <strong>Entrada Física de Espécie:</strong> O valor de {formatarBRL(fatura.valorTotal)} será somado na gaveta física do caixa diário ativo.
                </span>
              </div>
            ) : (
              <div className="p-2.5 bg-sky-950/30 border border-sky-800/50 rounded-xl text-[11px] text-sky-300 flex items-start gap-2">
                <QrCode size={15} className="shrink-0 mt-0.5 text-sky-400" />
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
          <div className="flex gap-2.5 pt-1">
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
