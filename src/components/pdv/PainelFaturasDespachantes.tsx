import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Zap,
  RefreshCw,
  Wallet,
  Receipt,
  Phone,
  CheckSquare,
  Square,
} from 'lucide-react';
import type { Despachante, FaturaDespachantePendente } from '../../types/pdv';
import { formatarBRL, deCentavos, paraCentavos } from '../../lib/pdvCaixa';
import ModalLiquidacaoFatura from './ModalLiquidacaoFatura';
import { mascararDocumento, mascararTelefone } from '../../utils/documento';

interface PainelFaturasDespachantesProps {
  faturas: FaturaDespachantePendente[];
  despachantes: Despachante[];
  caixaId: string | null;
  operadorNome: string;
  operadorId?: string | null;
  bloqueado?: boolean;
  carregando?: boolean;
  onAtualizar?: () => void;
  onFaturaLiquidada: () => void;
}

interface ParceiroConsolidado {
  despachante: Despachante;
  despachanteId: string;
  nomeRazao: string;
  documentoMascarado: string;
  telefoneMascarado: string;
  saldoConsolidado: number;
  issqnConsolidado: number;
  ordens: FaturaDespachantePendente[];
}

export default function PainelFaturasDespachantes({
  faturas,
  despachantes,
  caixaId,
  operadorNome,
  operadorId,
  bloqueado = false,
  carregando = false,
  onAtualizar,
  onFaturaLiquidada,
}: PainelFaturasDespachantesProps) {
  const [expandido, setExpandido] = useState(true);
  const [sanfonasParceiros, setSanfonasParceiros] = useState<Record<string, boolean>>({});
  const [selecionadasPorParceiro, setSelecionadasPorParceiro] = useState<Record<string, string[]>>({});
  const [liquidacaoAtiva, setLiquidacaoAtiva] = useState<{
    faturaSintetica: FaturaDespachantePendente;
    despachante: Despachante;
    faturasIds: string[];
    itensQuitadosCount: number;
  } | null>(null);

  // Agrupa todas as faturas pendentes por Despachante em um Card Consolidado por Parceiro
  const parceirosConsolidados = useMemo<ParceiroConsolidado[]>(() => {
    const mapa = new Map<string, FaturaDespachantePendente[]>();
    for (const f of faturas) {
      const lista = mapa.get(f.despachanteId) || [];
      lista.push(f);
      mapa.set(f.despachanteId, lista);
    }

    const resultado: ParceiroConsolidado[] = [];
    mapa.forEach((ordens, despachanteId) => {
      const despCadastro = despachantes.find((d) => d.id === despachanteId);
      const somaOrdensCent = ordens.reduce((acc, o) => acc + paraCentavos(o.valorTotal), 0);
      const saldoCadastroCent = despCadastro ? paraCentavos(despCadastro.saldo_devedor) : somaOrdensCent;
      const saldoEfetivo = deCentavos(saldoCadastroCent > 0 ? saldoCadastroCent : somaOrdensCent);

      if (paraCentavos(saldoEfetivo) <= 0) return;

      const despObj: Despachante = despCadastro || {
        id: despachanteId,
        nome_razao: ordens[0]?.despachanteNome || 'Despachante Parceiro',
        documento: ordens[0]?.despachanteDocumento || '',
        telefone: '',
        saldo_devedor: saldoEfetivo,
        criado_em: new Date().toISOString(),
      };

      resultado.push({
        despachante: despObj,
        despachanteId,
        nomeRazao: despObj.nome_razao,
        documentoMascarado: mascararDocumento(despObj.documento || ordens[0]?.despachanteDocumento || ''),
        telefoneMascarado: despObj.telefone ? mascararTelefone(despObj.telefone) : 'Não informado',
        saldoConsolidado: saldoEfetivo,
        issqnConsolidado: Math.round(saldoEfetivo * 2) / 100,
        ordens,
      });
    });

    return resultado;
  }, [faturas, despachantes]);

  // Sincroniza seleção inicial de ordens por parceiro
  useEffect(() => {
    setSelecionadasPorParceiro((prev) => {
      const novo: Record<string, string[]> = {};
      for (const p of parceirosConsolidados) {
        const todosIds = p.ordens.map((o) => o.id);
        const atuais = prev[p.despachanteId];
        if (atuais && atuais.length > 0) {
          const validos = atuais.filter((id) => todosIds.includes(id));
          novo[p.despachanteId] = validos.length > 0 ? validos : todosIds;
        } else {
          novo[p.despachanteId] = todosIds;
        }
      }
      return novo;
    });
  }, [parceirosConsolidados]);

  const qtdParceiros = parceirosConsolidados.length;
  const qtdOrdensTotal = parceirosConsolidados.reduce((acc, p) => acc + p.ordens.length, 0);
  const totalPendente = parceirosConsolidados.reduce((acc, p) => acc + p.saldoConsolidado, 0);

  const toggleSanfonaParceiro = (despId: string) => {
    setSanfonasParceiros((prev) => ({ ...prev, [despId]: !prev[despId] }));
  };

  const toggleOrdemSelecionada = (despId: string, ordemId: string) => {
    setSelecionadasPorParceiro((prev) => {
      const atuais = prev[despId] || [];
      return {
        ...prev,
        [despId]: atuais.includes(ordemId)
          ? atuais.filter((id) => id !== ordemId)
          : [...atuais, ordemId],
      };
    });
  };

  const toggleTodasOrdens = (p: ParceiroConsolidado) => {
    const todosIds = p.ordens.map((o) => o.id);
    const atuais = selecionadasPorParceiro[p.despachanteId] || [];
    setSelecionadasPorParceiro((prev) => ({
      ...prev,
      [p.despachanteId]: atuais.length === todosIds.length ? [] : todosIds,
    }));
  };

  const handleLiquidarContaCompleta = (p: ParceiroConsolidado) => {
    const numeros = p.ordens.map((o) => o.numeroRecibo).join(', ');
    const servicos = p.ordens.map((o) => o.resumoServicos).join(' | ');
    setLiquidacaoAtiva({
      despachante: p.despachante,
      faturasIds: p.ordens.map((o) => o.id),
      itensQuitadosCount: p.ordens.length,
      faturaSintetica: {
        id: p.ordens[0]?.id || p.despachanteId,
        numeroRecibo: numeros,
        dataHora: p.ordens[0]?.dataHora || new Date().toISOString(),
        despachanteId: p.despachanteId,
        despachanteNome: p.nomeRazao,
        despachanteDocumento: p.documentoMascarado,
        resumoServicos: servicos,
        valorTotal: p.saldoConsolidado,
        valorBruto: p.saldoConsolidado,
        valorIssqn: p.issqnConsolidado,
        caixaId: caixaId || '',
      },
    });
  };

  const handleLiquidarSelecionadas = (p: ParceiroConsolidado) => {
    const idsSel = selecionadasPorParceiro[p.despachanteId] || [];
    const ordensSel = p.ordens.filter((o) => idsSel.includes(o.id));
    if (ordensSel.length === 0) return;

    const somaCent = ordensSel.reduce((acc, o) => acc + paraCentavos(o.valorTotal), 0);
    const valorTotal = Math.min(p.saldoConsolidado, deCentavos(somaCent));
    const valorIssqn = Math.round(valorTotal * 2) / 100;

    setLiquidacaoAtiva({
      despachante: p.despachante,
      faturasIds: ordensSel.map((o) => o.id),
      itensQuitadosCount: ordensSel.length,
      faturaSintetica: {
        id: ordensSel[0].id,
        numeroRecibo: ordensSel.map((o) => o.numeroRecibo).join(', '),
        dataHora: ordensSel[0].dataHora,
        despachanteId: p.despachanteId,
        despachanteNome: p.nomeRazao,
        despachanteDocumento: p.documentoMascarado,
        resumoServicos: ordensSel.map((o) => o.resumoServicos).join(' | '),
        valorTotal,
        valorBruto: valorTotal,
        valorIssqn,
        caixaId: caixaId || '',
      },
    });
  };

  return (
    <>
      <div className="mb-6 rounded-2xl border border-slate-800/80 bg-slate-900/80 backdrop-blur-md shadow-xl overflow-hidden transition-all">
        {/* Cabeçalho do Painel Retrátil */}
        <div
          onClick={() => setExpandido(!expandido)}
          className="px-5 py-3.5 bg-gradient-to-r from-slate-900/90 via-slate-850/80 to-slate-900/90 flex items-center justify-between cursor-pointer select-none hover:bg-slate-800/60 transition-colors border-b border-slate-800/80"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold transition-all ${
                  qtdParceiros > 0
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-inner'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Wallet size={18} className={qtdParceiros > 0 ? 'text-indigo-400' : ''} />
              </div>
              {qtdParceiros > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-black text-white tracking-tight">
                  Conta-Corrente de Despachantes
                </h3>
                {qtdParceiros > 0 ? (
                  <span className="px-2.5 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded-full text-[11px] font-bold font-mono">
                    {qtdParceiros} {qtdParceiros === 1 ? 'parceiro' : 'parceiros'} ({qtdOrdensTotal}{' '}
                    {qtdOrdensTotal === 1 ? 'ordem' : 'ordens'}) · {formatarBRL(totalPendente)}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-bold">
                    Contas Liquidadas
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {qtdParceiros > 0
                  ? 'Esteira reativa consolidada por despachante com detalhamento de ordens e quitação imediata'
                  : 'Todas as contas-correntes de despachantes estão liquidadas no momento'}
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
                title="Atualizar esteira de contas-correntes"
              >
                <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
              </button>
            )}

            <div className="p-1 text-slate-400 hover:text-white">
              {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </div>
        </div>

        {/* Corpo com a Esteira Consolidada por Parceiro */}
        {expandido && (
          <div className="p-4 bg-slate-950/60">
            {qtdParceiros === 0 ? (
              <div className="py-6 px-4 text-center rounded-2xl border border-emerald-500/25 bg-emerald-950/10 text-slate-300 text-xs flex flex-col items-center justify-center gap-2">
                <CheckCircle2 size={24} className="text-emerald-400" />
                <p className="font-bold text-emerald-300 text-sm">
                  ✅ Todas as contas-correntes de despachantes estão liquidadas. Nenhuma fatura em aberto.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {parceirosConsolidados.map((p) => {
                  const sanfonaAberta = !!sanfonasParceiros[p.despachanteId];
                  const idsSel = selecionadasPorParceiro[p.despachanteId] || [];
                  const ordensSel = p.ordens.filter((o) => idsSel.includes(o.id));
                  const somaSelCent = ordensSel.reduce((acc, o) => acc + paraCentavos(o.valorTotal), 0);
                  const valorSel = Math.min(p.saldoConsolidado, deCentavos(somaSelCent));
                  const todasMarcadas = p.ordens.length > 0 && idsSel.length === p.ordens.length;

                  return (
                    <div
                      key={p.despachanteId}
                      className="p-4 bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-2xl transition-all shadow-lg flex flex-col justify-between"
                    >
                      <div>
                        {/* Cabeçalho do Card Consolidado */}
                        <div className="flex items-start justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Building2 size={15} className="text-indigo-400 shrink-0" />
                              <h4
                                className="font-black text-sm text-white truncate"
                                title={p.nomeRazao}
                              >
                                {p.nomeRazao}
                              </h4>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 mt-1">
                              <span>CNPJ/CPF: {p.documentoMascarado}</span>
                              <span className="flex items-center gap-1">
                                <Phone size={11} className="text-slate-500" />
                                {p.telefoneMascarado}
                              </span>
                            </div>
                          </div>

                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                            {p.ordens.length} {p.ordens.length === 1 ? 'ordem em aberto' : 'ordens em aberto'}
                          </span>
                        </div>

                        {/* Botão Sanfona / Dropdown Limpo de Ordens Discriminadas */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800/90">
                            <button
                              type="button"
                              onClick={() => toggleSanfonaParceiro(p.despachanteId)}
                              className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white bg-transparent border-0 cursor-pointer"
                            >
                              <Receipt size={13} className="text-indigo-400" />
                              <span>
                                {sanfonaAberta ? 'Ocultar ordens discriminadas' : `Ver ${p.ordens.length} ordem(ns) discriminada(s)`}
                              </span>
                              {sanfonaAberta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {sanfonaAberta && p.ordens.length > 1 && (
                              <button
                                type="button"
                                onClick={() => toggleTodasOrdens(p)}
                                className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-transparent border-0 cursor-pointer"
                              >
                                {todasMarcadas ? (
                                  <>
                                    <CheckSquare size={12} /> Desmarcar
                                  </>
                                ) : (
                                  <>
                                    <Square size={12} /> Todas
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          {/* Lista Interna da Sanfona */}
                          {sanfonaAberta && (
                            <div className="mt-2 p-2 bg-slate-950/90 border border-slate-800 rounded-xl divide-y divide-slate-800/70 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
                              {p.ordens.map((ordem) => {
                                const marcada = idsSel.includes(ordem.id);
                                return (
                                  <div
                                    key={ordem.id}
                                    onClick={() => toggleOrdemSelecionada(p.despachanteId, ordem.id)}
                                    className={`py-2 px-2.5 flex items-center justify-between gap-2 text-xs cursor-pointer rounded-lg transition-colors ${
                                      marcada ? 'bg-indigo-950/30 text-white' : 'hover:bg-slate-900 text-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2.5 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={marcada}
                                        onChange={() => {}}
                                        className="mt-0.5 w-3.5 h-3.5 rounded text-indigo-600 bg-slate-900 border-slate-700 cursor-pointer shrink-0"
                                      />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 font-mono text-[11px]">
                                          <strong className="text-indigo-300">{ordem.numeroRecibo}</strong>
                                          <span className="text-slate-500 flex items-center gap-0.5">
                                            <Clock size={10} />
                                            {new Date(ordem.dataHora).toLocaleString('pt-BR', {
                                              dateStyle: 'short',
                                              timeStyle: 'short',
                                            })}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-300 truncate mt-0.5">
                                          {ordem.resumoServicos}
                                        </p>
                                      </div>
                                    </div>
                                    <span className="font-mono font-bold text-xs text-emerald-400 shrink-0 tabular-nums">
                                      {formatarBRL(ordem.valorTotal)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Rodapé: Saldo Consolidado e Botões de Ação */}
                      <div>
                        <div className="pt-2.5 border-t border-slate-800 flex items-end justify-between mb-3 font-mono">
                          <div>
                            <span className="text-[10px] text-slate-400 block">ISSQN 2% Consolidado:</span>
                            <span className="text-xs text-slate-300 font-semibold">
                              {formatarBRL(p.issqnConsolidado)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              Saldo Devedor Consolidado:
                            </span>
                            <span className="text-lg font-black text-emerald-400 tabular-nums">
                              {formatarBRL(p.saldoConsolidado)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            type="button"
                            disabled={bloqueado}
                            onClick={() => handleLiquidarContaCompleta(p)}
                            className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-950/50 flex items-center justify-center gap-1.5 cursor-pointer border-0"
                          >
                            <Zap size={14} className="text-amber-300" />
                            <span>⚡ Liquidar Conta Completa</span>
                          </button>

                          {p.ordens.length > 1 && (
                            <button
                              type="button"
                              disabled={bloqueado || ordensSel.length === 0}
                              onClick={() => handleLiquidarSelecionadas(p)}
                              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 rounded-xl text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <CheckSquare size={13} className="text-indigo-400" />
                              <span>
                                Liquidar Ordens Selecionadas ({ordensSel.length} · {formatarBRL(valorSel)})
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Liquidação e Emissão de Recibo em 2 Vias */}
      {liquidacaoAtiva && (
        <ModalLiquidacaoFatura
          fatura={liquidacaoAtiva.faturaSintetica}
          despachante={liquidacaoAtiva.despachante}
          faturasIds={liquidacaoAtiva.faturasIds}
          itensQuitadosCount={liquidacaoAtiva.itensQuitadosCount}
          caixaId={caixaId}
          operadorNome={operadorNome}
          operadorId={operadorId}
          onClose={() => setLiquidacaoAtiva(null)}
          onConcluido={() => {
            onFaturaLiquidada();
          }}
        />
      )}
    </>
  );
}
