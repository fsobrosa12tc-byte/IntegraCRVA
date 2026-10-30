import React, { useState } from 'react';
import {
  Bell,
  Clock,
  User,
  BadgeDollarSign,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserCheck,
  RefreshCw,
  ShoppingBag
} from 'lucide-react';
import type { ComandaBalcao } from '../../types/pdv';
import { formatarBRL } from '../../lib/pdvCaixa';

interface PainelComandasPendentesProps {
  comandas: ComandaBalcao[];
  comandaAtivaId?: string | null;
  bloqueado: boolean;
  carregando?: boolean;
  onCarregarComanda: (comanda: ComandaBalcao) => void;
  onAtualizar?: () => void;
}

export default function PainelComandasPendentes({
  comandas,
  comandaAtivaId,
  bloqueado,
  carregando,
  onCarregarComanda,
  onAtualizar,
}: PainelComandasPendentesProps) {
  const [expandido, setExpandido] = useState(true);

  const qtdPendentes = comandas.length;

  return (
    <div className="mb-5 bg-slate-900/70 backdrop-blur-md border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden transition-all">
      {/* Barra de Cabeçalho / Gaveta com Alerta Reativo */}
      <div
        onClick={() => setExpandido(!expandido)}
        className="px-5 py-3.5 bg-gradient-to-r from-slate-900/90 via-slate-850/80 to-slate-900/90 flex items-center justify-between cursor-pointer select-none hover:bg-slate-800/60 transition-colors border-b border-slate-800/80"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold transition-all ${
                qtdPendentes > 0
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Bell size={18} className={qtdPendentes > 0 ? 'animate-bounce' : ''} />
            </div>
            {qtdPendentes > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-white tracking-tight">
                Atendimentos Aguardando Pagamento (Balcão CRVA)
              </h3>
              {qtdPendentes > 0 ? (
                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-full text-[11px] font-bold font-mono">
                  {qtdPendentes} {qtdPendentes === 1 ? 'comanda' : 'comandas'}
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-bold">
                  Fila Limpa
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {qtdPendentes > 0
                ? 'Ordens de serviço emitidas pelos atendentes prontas para cobrança e emissão fiscal'
                : 'Nenhuma ordem de serviço pendente de pagamento no momento (Sincronização Realtime ativa)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onAtualizar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAtualizar();
              }}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border-0 bg-transparent cursor-pointer"
              title="Atualizar fila de comandas"
            >
              <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
            </button>
          )}

          <div className="p-1 text-slate-400 hover:text-white">
            {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </div>

      {/* Corpo com a Fila de Comandas */}
      {expandido && (
        <div className="p-4 bg-slate-950/60">
          {qtdPendentes === 0 ? (
            <div className="py-6 px-4 text-center rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs flex flex-col items-center justify-center gap-1.5">
              <CheckCircle2 size={24} className="text-emerald-500/80 mb-0.5" />
              <p className="font-semibold text-slate-300">
                Fila de cobrança do balcão em dia
              </p>
              <p className="text-[11px] text-slate-400">
                Assim que um atendente concluir um atendimento no Balcão CRVA e enviar ao caixa, o card surgirá aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {comandas.map((c) => {
                const ativa = comandaAtivaId === c.id;
                const horario = new Date(c.criado_em).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const totalItens = c.itens.reduce((acc, i) => acc + i.quantidade, 0);

                return (
                  <div
                    key={c.id}
                    onClick={() => !bloqueado && onCarregarComanda(c)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between relative group ${
                      ativa
                        ? 'bg-emerald-950/40 border-emerald-500 shadow-xl shadow-emerald-950/40 ring-1 ring-emerald-500'
                        : 'bg-slate-900/70 backdrop-blur-md border-slate-700/60 hover:border-slate-600 hover:bg-slate-800/80 shadow-md'
                    }`}
                  >
                    {/* Badge de Ativa */}
                    {ativa && (
                      <div className="absolute -top-2.5 right-4 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-md uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        Carregada no Caixa
                      </div>
                    )}

                    <div>
                      {/* Topo do Card: Horário e Status */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                        <span className="flex items-center gap-1 font-mono bg-slate-950/80 px-2 py-0.5 rounded-lg border border-slate-750">
                          <Clock size={12} className="text-slate-400" />
                          {horario}
                        </span>
                        <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                          Aguardando Quitação
                        </span>
                      </div>

                      {/* Cliente */}
                      <div className="mb-2">
                        <p className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-1">
                          {c.cliente_nome}
                        </p>
                        {c.cliente_documento && (
                          <p className="text-[11px] font-mono font-semibold tracking-tight text-slate-400">
                            CPF/CNPJ: {c.cliente_documento}
                          </p>
                        )}
                      </div>

                      {/* Atendente de Origem */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-3 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800/80">
                        <UserCheck size={13} className="text-sky-400 flex-shrink-0" />
                        <span className="truncate">
                          Atendente: <strong className="text-slate-200">{c.atendente_nome}</strong>
                        </span>
                      </div>

                      {/* Lista de itens (resumo) */}
                      <div className="text-[11px] text-slate-400 mb-3 line-clamp-2">
                        {c.itens.map((it) => `${it.quantidade}x ${it.servico}`).join(' · ')}
                      </div>
                    </div>

                    {/* Rodapé: Total e Botão de Cobrança */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 mt-1">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Total a Pagar ({totalItens} {totalItens === 1 ? 'item' : 'itens'})
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-base font-semibold font-mono tracking-tight text-emerald-400 tabular-nums">
                            {formatarBRL(c.valor_total)}
                          </span>
                          <span className="text-[9px] text-emerald-400/80 font-mono">
                            (+ISS 2%)
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={bloqueado}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCarregarComanda(c);
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer border-0 ${
                          ativa
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white group-hover:scale-105'
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        <ShoppingBag size={14} />
                        <span>{ativa ? 'Selecionada' : 'Cobrar'}</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
