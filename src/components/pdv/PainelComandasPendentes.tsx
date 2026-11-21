import React, { useState, useMemo } from 'react';
import {
  Bell,
  Search,
  CheckCircle2,
  ArrowRight,
  Clock,
} from 'lucide-react';
import type { ComandaBalcao } from '../../types/pdv';
import { formatarBRL } from '../../lib/pdvCaixa';

interface PainelComandasPendentesProps {
  comandas: ComandaBalcao[];
  comandaAtivaId?: string | null;
  bloqueado: boolean;
  carregando?: boolean;
  onCarregarComanda: (comanda: ComandaBalcao) => void;
  onCobrarComanda?: (comanda: ComandaBalcao) => void;
  onAtualizar?: () => void;
}

/** Formata o número do recibo/protocolo de forma padronizada (#REC-000124). */
export function formatarBadgeRecibo(item: {
  numero_recibo?: string | null;
  protocolo?: string | null;
  id: string;
}): string {
  const raw = (item.numero_recibo || item.protocolo || item.id.replace(/-/g, '').slice(0, 6).toUpperCase()).trim();
  const semHash = raw.replace(/^#+/, '');
  return `#${semHash}`;
}

/** Normaliza texto para busca ignorando '#', espaços, acentos e caixa alta/baixa. */
function normalizarBusca(texto?: string | null): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[#\s-]+/g, '')
    .toLowerCase();
}

export default function PainelComandasPendentes({
  comandas,
  comandaAtivaId,
  bloqueado,
  onCarregarComanda,
  onCobrarComanda,
}: PainelComandasPendentesProps) {
  const [busca, setBusca] = useState('');

  const comandasFiltradas = useMemo(() => {
    const qNorm = normalizarBusca(busca);
    const qTexto = busca.trim().toLowerCase();
    if (!qNorm && !qTexto) return comandas;

    return comandas.filter((c) => {
      const placa = normalizarBusca(c.veiculo_placa);
      const recibo = normalizarBusca(formatarBadgeRecibo(c));
      const protocolo = normalizarBusca(c.protocolo);
      const numRecibo = normalizarBusca(c.numero_recibo);
      const id = normalizarBusca(c.id);
      const nomeNorm = normalizarBusca(c.cliente_nome);
      const nomeLower = (c.cliente_nome || '').toLowerCase();

      return (
        placa.includes(qNorm) ||
        recibo.includes(qNorm) ||
        protocolo.includes(qNorm) ||
        numRecibo.includes(qNorm) ||
        id.includes(qNorm) ||
        nomeNorm.includes(qNorm) ||
        nomeLower.includes(qTexto)
      );
    });
  }, [comandas, busca]);

  const qtdPendentes = comandas.length;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl transition-all">
      {/* Cabeçalho da Faixa */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <Bell size={18} className={qtdPendentes > 0 ? 'animate-bounce' : ''} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100 tracking-tight">
                Atendimentos Aguardando Pagamento (Balcão CRVA)
              </h3>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  qtdPendentes > 0
                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}
              >
                {qtdPendentes === 0 ? '0 pendentes' : `${qtdPendentes} pendente${qtdPendentes > 1 ? 's' : ''}`}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Ordens de serviço emitidas no balcão prontas para quitação no caixa
            </p>
          </div>
        </div>

        {/* Campo de Busca Rápida por Placa, Requerente ou Recibo/Protocolo */}
        {qtdPendentes > 0 && (
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar placa, requerente ou recibo..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}
      </div>

      {/* Estado Vazio (Empty State) Discreto e Horizontal */}
      {qtdPendentes === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>Nenhum atendimento aguardando pagamento no momento. Fila limpa e sincronizada em tempo real.</span>
        </div>
      ) : comandasFiltradas.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400">
          Nenhum atendimento encontrado para <strong className="text-slate-200">"{busca}"</strong>.
        </div>
      ) : (
        /* Cards Compactos Lado a Lado */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
          {comandasFiltradas.map((c) => {
            const isAtiva = comandaAtivaId === c.id;
            const reciboBadge = formatarBadgeRecibo(c);

            return (
              <div
                key={c.id}
                className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 transition-all ${
                  isAtiva
                    ? 'bg-emerald-950/30 border-emerald-500/60 ring-1 ring-emerald-500/30'
                    : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                {/* Topo do Card: Placa + Badge Recibo/Protocolo + Horário + Valor */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center flex-wrap gap-1.5 min-w-0">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 uppercase">
                      {c.veiculo_placa || 'PLACA S/N'}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-amber-300 font-mono text-[11px] font-semibold tracking-wide"
                      title={`Recibo / Protocolo: ${reciboBadge}`}
                    >
                      {reciboBadge}
                    </span>
                    {c.criado_em && (
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-0.5">
                        <Clock size={11} />
                        {new Date(c.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold font-mono text-emerald-400 shrink-0 tabular-nums">
                    {formatarBRL(c.valor_total)}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate" title={c.cliente_nome || 'Consumidor Balcão'}>
                    {c.cliente_nome || 'Consumidor Balcão'}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {c.itens?.length || 1} ato(s) • Atendente: {c.atendente_nome?.split(' ')[0] || 'Balcão'}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                  <button
                    type="button"
                    disabled={bloqueado}
                    onClick={() => {
                      if (onCobrarComanda) onCobrarComanda(c);
                      else onCarregarComanda(c);
                    }}
                    className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    <span>Receber Agora</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
