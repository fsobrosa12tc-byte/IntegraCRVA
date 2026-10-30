import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
  Search,
  CreditCard,
  QrCode,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  X,
  Printer,
  FileText,
  Receipt,
  Loader2,
  CheckSquare,
  Square,
  Wallet,
  ShieldCheck,
  Scissors,
  ChevronDown,
  ChevronUp,
  Phone,
  Clock,
  RefreshCw,
  Zap,
} from 'lucide-react';
import type { Despachante, FaturaDespachantePendente } from '../../types/pdv';
import { formatarBRL, deCentavos, paraCentavos } from '../../lib/pdvCaixa';
import {
  buscarContasCorrentesDespachantes,
  inscreverFaturasDespachantesRealtime,
  liquidarFaturaDespachante,
  type ContaCorrenteDespachanteConsolidada,
  type ComprovanteLiquidacao,
} from '../../lib/pdvContaCorrente';
import { somenteDigitos } from '../../utils/documento';

export interface ContaCorrenteModalProps {
  despachantes: Despachante[];
  caixaId: string | null;
  operadorNome: string;
  operadorId?: string | null;
  despachanteInicial?: Despachante | null;
  onClose: () => void;
  onDespachanteAtualizado: (d: Despachante) => void;
  onMovimentacaoCriada?: () => void;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default function ContaCorrenteDespachantesModal({
  caixaId,
  operadorNome,
  operadorId,
  onClose,
  onDespachanteAtualizado,
  onMovimentacaoCriada,
}: ContaCorrenteModalProps) {
  const [contas, setContas] = useState<ContaCorrenteDespachanteConsolidada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroRapido, setFiltroRapido] = useState('');

  // Controle de sanfonas abertas por despachanteId (por padrão abre todas ou ao clicar)
  const [sanfonasAbertas, setSanfonasAbertas] = useState<Record<string, boolean>>({});

  // Controle de ordens selecionadas por despachanteId: Record<despachanteId, string[]>
  const [ordensSelecionadasPorDesp, setOrdensSelecionadasPorDesp] = useState<Record<string, string[]>>({});

  // Modal de confirmação de pagamento
  const [alvoLiquidacao, setAlvoLiquidacao] = useState<{
    conta: ContaCorrenteDespachanteConsolidada;
    modo: 'completa' | 'selecionadas';
    ordensIds: string[];
    valorTotal: number;
    resumoNumeros: string;
  } | null>(null);

  const [formaLiquidacao, setFormaLiquidacao] = useState<'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito'>('pix');
  const [liquidando, setLiquidando] = useState(false);
  const [erroLiquidacao, setErroLiquidacao] = useState('');
  const [comprovante, setComprovante] = useState<ComprovanteLiquidacao | null>(null);

  const carregarEsteira = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await buscarContasCorrentesDespachantes();
      setContas(lista);

      // Inicializa seleção de todas as ordens por padrão para cada parceiro
      setOrdensSelecionadasPorDesp((prev) => {
        const novo: Record<string, string[]> = {};
        for (const c of lista) {
          const existentes = prev[c.despachanteId];
          const idsValidos = c.ordens.map((o) => o.id);
          if (existentes && existentes.length > 0) {
            const filtrados = existentes.filter((id) => idsValidos.includes(id));
            novo[c.despachanteId] = filtrados.length > 0 ? filtrados : idsValidos;
          } else {
            novo[c.despachanteId] = idsValidos;
          }
        }
        return novo;
      });

      setSanfonasAbertas((prev) => {
        const novo = { ...prev };
        for (const c of lista) {
          if (novo[c.despachanteId] === undefined) {
            novo[c.despachanteId] = true;
          }
        }
        return novo;
      });
    } catch (err) {
      console.error('Erro ao carregar esteira de contas-correntes:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarEsteira();
    const cancelarRealtime = inscreverFaturasDespachantesRealtime(() => {
      carregarEsteira();
    });
    return () => {
      cancelarRealtime();
    };
  }, [carregarEsteira]);

  // Fechar com tecla ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (comprovante) setComprovante(null);
        else if (alvoLiquidacao) setAlvoLiquidacao(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [comprovante, alvoLiquidacao, onClose]);

  const contasFiltradas = useMemo(() => {
    const q = norm(filtroRapido.trim());
    const dig = somenteDigitos(filtroRapido);
    if (!q) return contas;
    return contas.filter(
      (c) =>
        norm(c.nomeRazao).includes(q) ||
        (dig.length > 0 && somenteDigitos(c.documentoMascarado).includes(dig)) ||
        c.ordens.some((o) => norm(o.numeroRecibo).includes(q) || norm(o.resumoServicos).includes(q))
    );
  }, [contas, filtroRapido]);

  const saldoTotalEsteira = useMemo(
    () => contas.reduce((acc, c) => acc + c.saldoDevedorConsolidado, 0),
    [contas]
  );

  const totalOrdensEsteira = useMemo(
    () => contas.reduce((acc, c) => acc + c.quantidadeOrdens, 0),
    [contas]
  );

  const alternarSanfona = (despId: string) => {
    setSanfonasAbertas((prev) => ({ ...prev, [despId]: !prev[despId] }));
  };

  const alternarOrdem = (despId: string, ordemId: string) => {
    setOrdensSelecionadasPorDesp((prev) => {
      const atuais = prev[despId] || [];
      const jaMarcada = atuais.includes(ordemId);
      return {
        ...prev,
        [despId]: jaMarcada ? atuais.filter((id) => id !== ordemId) : [...atuais, ordemId],
      };
    });
  };

  const alternarTodasOrdensParceiro = (conta: ContaCorrenteDespachanteConsolidada) => {
    const todosIds = conta.ordens.map((o) => o.id);
    const atuais = ordensSelecionadasPorDesp[conta.despachanteId] || [];
    setOrdensSelecionadasPorDesp((prev) => ({
      ...prev,
      [conta.despachanteId]: atuais.length === todosIds.length ? [] : todosIds,
    }));
  };

  const iniciarLiquidacaoCompleta = (conta: ContaCorrenteDespachanteConsolidada) => {
    setErroLiquidacao('');
    setFormaLiquidacao('pix');
    setAlvoLiquidacao({
      conta,
      modo: 'completa',
      ordensIds: conta.ordens.map((o) => o.id),
      valorTotal: conta.saldoDevedorConsolidado,
      resumoNumeros: conta.ordens.map((o) => o.numeroRecibo).join(', '),
    });
  };

  const iniciarLiquidacaoSelecionadas = (conta: ContaCorrenteDespachanteConsolidada) => {
    const selecionadas = ordensSelecionadasPorDesp[conta.despachanteId] || [];
    const ordensAlvo = conta.ordens.filter((o) => selecionadas.includes(o.id));
    if (ordensAlvo.length === 0) return;

    const somaCent = ordensAlvo.reduce((acc, o) => acc + paraCentavos(o.valorTotal), 0);
    const valorCalculado = Math.min(conta.saldoDevedorConsolidado, deCentavos(somaCent));

    setErroLiquidacao('');
    setFormaLiquidacao('pix');
    setAlvoLiquidacao({
      conta,
      modo: ordensAlvo.length === conta.ordens.length ? 'completa' : 'selecionadas',
      ordensIds: ordensAlvo.map((o) => o.id),
      valorTotal: valorCalculado,
      resumoNumeros: ordensAlvo.map((o) => o.numeroRecibo).join(', '),
    });
  };

  const confirmarLiquidacao = async () => {
    if (!alvoLiquidacao) return;
    if (!caixaId) {
      setErroLiquidacao('É necessário estar com o turno de caixa aberto para liquidar faturas.');
      return;
    }

    setLiquidando(true);
    setErroLiquidacao('');
    try {
      const comp = await liquidarFaturaDespachante({
        despachante: alvoLiquidacao.conta.despachante,
        valorPago: alvoLiquidacao.valorTotal,
        formaPagamento: formaLiquidacao,
        caixaId,
        operadorNome,
        operadorId,
        itensQuitadosCount: alvoLiquidacao.ordensIds.length || 1,
        faturasIds: alvoLiquidacao.ordensIds,
        faturaNumero: alvoLiquidacao.resumoNumeros,
      });

      setComprovante(comp);
      setAlvoLiquidacao(null);
      onDespachanteAtualizado(comp.despachante);
      if (onMovimentacaoCriada) onMovimentacaoCriada();
      await carregarEsteira();
    } catch (err: any) {
      setErroLiquidacao(err.message || 'Falha ao processar a liquidação da conta-corrente.');
    } finally {
      setLiquidando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800/80 bg-slate-900/95 backdrop-blur-md shadow-2xl overflow-hidden text-slate-100 flex flex-col my-auto max-h-[92vh]">
        {/* Cabeçalho do Modal */}
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-inner">
              <Building2 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Conta-Corrente de Despachantes
                </h2>
                {contas.length > 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    {contas.length} {contas.length === 1 ? 'parceiro' : 'parceiros'} · {totalOrdensEsteira}{' '}
                    {totalOrdensEsteira === 1 ? 'ordem' : 'ordens'} · {formatarBRL(saldoTotalEsteira)}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Contas Liquidadas
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Esteira reativa de faturas a prazo agrupadas por parceiro com baixa imediata no caixa ativo.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={carregarEsteira}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border border-slate-800 bg-slate-950/60"
              title="Atualizar esteira"
            >
              <RefreshCw size={16} className={carregando ? 'animate-spin text-indigo-400' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border-0 bg-transparent"
              title="Fechar (ESC)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Corpo da Esteira Reativa por Parceiro */}
        <div className="p-5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 space-y-4 flex-1 bg-slate-950/50">
          {/* Filtro rápido discreto quando há contas em aberto */}
          {contas.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                value={filtroRapido}
                onChange={(e) => setFiltroRapido(e.target.value)}
                placeholder="Filtrar esteira por nome do despachante, CNPJ/CPF ou protocolo #FT..."
                className="w-full pl-10 pr-9 py-2.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
              />
              {filtroRapido && (
                <button
                  type="button"
                  onClick={() => setFiltroRapido('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 bg-transparent border-0 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {carregando && contas.length === 0 ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <Loader2 className="animate-spin text-indigo-400" size={26} />
              <span className="text-xs font-semibold">Sincronizando contas-correntes de despachantes...</span>
            </div>
          ) : contasFiltradas.length === 0 ? (
            /* Card Comemorativo Elegante quando não há saldo pendente */
            <div className="py-10 px-6 text-center rounded-2xl border border-emerald-500/30 bg-emerald-950/15 backdrop-blur-md shadow-xl flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
                <CheckCircle2 size={26} />
              </div>
              <p className="text-sm sm:text-base font-bold text-emerald-300">
                ✅ Todas as contas-correntes de despachantes estão liquidadas. Nenhuma fatura em aberto.
              </p>
              <p className="text-xs text-slate-400 max-w-md">
                Novos faturamentos a prazo emitidos no PDV aparecerão automaticamente nesta esteira consolidados por parceiro.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {contasFiltradas.map((conta) => {
                const aberta = !!sanfonasAbertas[conta.despachanteId];
                const selecionadasIds = ordensSelecionadasPorDesp[conta.despachanteId] || [];
                const ordensSelecionadas = conta.ordens.filter((o) => selecionadasIds.includes(o.id));
                const somaSelecionadasCent = ordensSelecionadas.reduce(
                  (acc, o) => acc + paraCentavos(o.valorTotal),
                  0
                );
                const valorSelecionadas = Math.min(
                  conta.saldoDevedorConsolidado,
                  deCentavos(somaSelecionadasCent)
                );
                const todasMarcadas =
                  conta.ordens.length > 0 && selecionadasIds.length === conta.ordens.length;

                return (
                  <div
                    key={conta.despachanteId}
                    className="rounded-2xl border border-slate-800/80 bg-slate-900/80 backdrop-blur-md shadow-xl overflow-hidden transition-all hover:border-slate-700"
                  >
                    {/* Cabeçalho Consolidado do Despachante */}
                    <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
                            <Building2 size={16} />
                          </div>
                          <h3 className="text-base font-black text-white tracking-tight">
                            {conta.nomeRazao}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            {conta.quantidadeOrdens}{' '}
                            {conta.quantidadeOrdens === 1 ? 'ordem em aberto' : 'ordens em aberto'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 font-mono pl-1">
                          <span>
                            CNPJ/CPF: <strong className="text-slate-200">{conta.documentoMascarado}</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone size={12} className="text-slate-500" />
                            <strong className="text-slate-300">{conta.telefoneMascarado}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Saldo Total Devedor Consolidado & Botões de Ação */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 lg:gap-4 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/90">
                        <div className="sm:text-right pr-2">
                          <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
                            Saldo Total Devedor Consolidado
                          </span>
                          <span className="text-xl sm:text-2xl font-mono font-black text-rose-400 tabular-nums">
                            {formatarBRL(conta.saldoDevedorConsolidado)}
                          </span>
                          <span className="block text-[10px] font-mono text-slate-400">
                            ISSQN 2% Segregado: {formatarBRL(conta.totalIssqnConsolidado)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => iniciarLiquidacaoCompleta(conta)}
                            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 transition-all flex items-center gap-1.5 cursor-pointer border-0"
                          >
                            <Zap size={14} className="text-amber-300" />
                            <span>⚡ Liquidar Conta Completa</span>
                          </button>

                          {conta.ordens.length > 1 && (
                            <button
                              type="button"
                              disabled={ordensSelecionadas.length === 0}
                              onClick={() => iniciarLiquidacaoSelecionadas(conta)}
                              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 font-semibold text-xs border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <CheckSquare size={14} className="text-indigo-400" />
                              <span>
                                Liquidar Ordens Selecionadas ({ordensSelecionadas.length} ·{' '}
                                {formatarBRL(valorSelecionadas)})
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Barra da Sanfona / Dropdown de Ordens Discriminadas */}
                    <div className="px-4 py-2.5 bg-slate-950/40 flex items-center justify-between text-xs border-b border-slate-800/50">
                      <button
                        type="button"
                        onClick={() => alternarSanfona(conta.despachanteId)}
                        className="flex items-center gap-2 text-slate-300 hover:text-white font-bold bg-transparent border-0 cursor-pointer"
                      >
                        <Receipt size={14} className="text-indigo-400" />
                        <span>
                          Ordens e Cupons Discriminados ({conta.ordens.length})
                        </span>
                        {aberta ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>

                      {aberta && conta.ordens.length > 1 && (
                        <button
                          type="button"
                          onClick={() => alternarTodasOrdensParceiro(conta)}
                          className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-transparent border-0 cursor-pointer"
                        >
                          {todasMarcadas ? (
                            <>
                              <CheckSquare size={13} /> Desmarcar Todas
                            </>
                          ) : (
                            <>
                              <Square size={13} /> Selecionar Todas
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Lista Discriminada Interna (Sanfona) */}
                    {aberta && (
                      <div className="p-3 sm:p-4 bg-slate-950/60 divide-y divide-slate-800/70 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
                        {conta.ordens.map((ordem) => {
                          const marcada = selecionadasIds.includes(ordem.id);
                          return (
                            <div
                              key={ordem.id}
                              onClick={() => alternarOrdem(conta.despachanteId, ordem.id)}
                              className={`py-2.5 px-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors cursor-pointer ${
                                marcada ? 'bg-indigo-950/25 text-slate-100' : 'hover:bg-slate-900/60 text-slate-300'
                              }`}
                            >
                              <div className="flex items-start sm:items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={marcada}
                                  onChange={() => {}}
                                  className="mt-0.5 sm:mt-0 w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 cursor-pointer shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-xs text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50">
                                      {ordem.numeroRecibo}
                                    </span>
                                    <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                                      <Clock size={11} className="text-slate-500" />
                                      {new Date(ordem.dataHora).toLocaleString('pt-BR', {
                                        dateStyle: 'short',
                                        timeStyle: 'short',
                                      })}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-200 font-medium mt-1 truncate">
                                    {ordem.resumoServicos}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-4 pl-7 sm:pl-0 shrink-0 font-mono">
                                <div className="text-right">
                                  <span className="block text-[10px] text-slate-500">
                                    ISSQN 2%: {formatarBRL(ordem.valorIssqn)}
                                  </span>
                                  <span className="text-sm font-black text-emerald-400 tabular-nums">
                                    {formatarBRL(ordem.valorTotal)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-400 flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-500" />
            <span>
              Contabilidade Estrita: Quitações registram <strong>liquidacao_fatura</strong> no meio real escolhido.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-100 py-2.5 px-5 font-medium transition-all cursor-pointer border border-slate-700"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* =========================================================================
       *  MODAL SECUNDÁRIO: ESCOLHA DO MEIO DE PAGAMENTO PARA LIQUIDAÇÃO
       * ========================================================================= */}
      {alvoLiquidacao && (
        <div className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                  <Wallet size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    {alvoLiquidacao.modo === 'completa'
                      ? 'Liquidar Conta Completa'
                      : 'Liquidar Ordens Selecionadas'}
                  </h3>
                  <span className="text-[11px] font-mono text-indigo-300">
                    {alvoLiquidacao.ordensIds.length}{' '}
                    {alvoLiquidacao.ordensIds.length === 1 ? 'ordem selecionada' : 'ordens selecionadas'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAlvoLiquidacao(null)}
                className="p-1 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Despachante Parceiro
                </span>
                <div className="text-sm font-bold text-white">{alvoLiquidacao.conta.nomeRazao}</div>
                <div className="text-xs font-mono text-slate-400">
                  {alvoLiquidacao.conta.documentoMascarado} · {alvoLiquidacao.conta.telefoneMascarado}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block">ISSQN 2% Segregado</span>
                  <span className="text-xs font-semibold text-slate-300">
                    {formatarBRL(Math.round(alvoLiquidacao.valorTotal * 2) / 100)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Total a Liquidar
                  </span>
                  <span className="text-xl font-black text-emerald-400 tabular-nums">
                    {formatarBRL(alvoLiquidacao.valorTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Seletor de Forma de Pagamento Moderno */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Selecione o Meio de Pagamento Real:
              </label>
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                {[
                  { id: 'dinheiro' as const, rotulo: '💵 Dinheiro' },
                  { id: 'pix' as const, rotulo: '⚡ PIX' },
                  { id: 'cartao_debito' as const, rotulo: '💳 Débito' },
                  { id: 'cartao_credito' as const, rotulo: '💳 Crédito' },
                ].map((op) => {
                  const ativo = formaLiquidacao === op.id;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => setFormaLiquidacao(op.id)}
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

              {formaLiquidacao === 'dinheiro' ? (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-[11px] text-emerald-300 flex items-start gap-2">
                  <Banknote size={15} className="shrink-0 mt-0.5 text-emerald-400" />
                  <span>
                    <strong>Entrada Física em Espécie:</strong> Soma no card DINHEIRO e no saldo físico esperado da gaveta do operador.
                  </span>
                </div>
              ) : (
                <div className="p-2.5 bg-sky-950/30 border border-sky-800/50 rounded-xl text-[11px] text-sky-300 flex items-start gap-2">
                  <QrCode size={15} className="shrink-0 mt-0.5 text-sky-400" />
                  <span>
                    <strong>Liquidação Eletrônica:</strong> Soma exclusivamente no meio eletrônico selecionado e <strong>não</strong> altera a contagem física de cédulas da gaveta.
                  </span>
                </div>
              )}
            </div>

            {erroLiquidacao && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-semibold flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-400" />
                <span>{erroLiquidacao}</span>
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                disabled={liquidando}
                onClick={() => setAlvoLiquidacao(null)}
                className="flex-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-100 py-3 px-4 font-medium text-xs transition-all cursor-pointer border border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={liquidando}
                onClick={confirmarLiquidacao}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer border-0"
              >
                {liquidando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                <span>Confirmar Liquidação</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
       *  MODAL TERCIÁRIO: RECIBO DE QUITAÇÃO DA FATURA (2 VIAS)
       * ========================================================================= */}
      {comprovante && (
        <div className="fixed inset-0 z-[130] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto text-slate-100 print:bg-white print:text-black print:p-0 print:border-none print:shadow-none">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 print:hidden">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 size={22} />
                <h3 className="text-sm font-black text-white uppercase tracking-tight">
                  Quitação Confirmada com Sucesso
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setComprovante(null)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg border-0 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* 1ª VIA: VIA DO CAIXA / CRVA */}
              <div className="p-4 bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-sm space-y-2.5 font-sans">
                <div className="flex items-start justify-between border-b border-dashed border-slate-300 pb-2">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                      INTEGRA CRVA · REGISTRO VEICULAR
                    </div>
                    <h4 className="text-xs font-black text-slate-900">
                      RECIBO DE QUITAÇÃO DE CONTA-CORRENTE
                    </h4>
                    <div className="text-[10px] font-mono text-slate-500">
                      Protocolo: <strong className="text-slate-800">{comprovante.protocolo}</strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-slate-900 text-white uppercase tracking-wider">
                      1ª VIA · CAIXA / CRVA
                    </span>
                    <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                      {new Date(comprovante.dataHora).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] py-1 border-b border-dashed border-slate-300 font-mono">
                  <div>
                    <span className="text-slate-500 block text-[9px]">Despachante:</span>
                    <strong className="text-slate-900">{comprovante.despachante.nome_razao}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">CPF / CNPJ:</span>
                    <strong className="text-slate-900">{comprovante.despachante.documento}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Meio de Pagamento:</span>
                    <strong className="text-emerald-700 uppercase">{comprovante.meioPagamento}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Operador:</span>
                    <strong className="text-slate-700">{comprovante.operadorNome}</strong>
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

                <div className="pt-3 border-t border-slate-200 text-center">
                  <div className="w-40 mx-auto border-t border-slate-400 mt-2"></div>
                  <span className="text-[8px] uppercase font-bold text-slate-400">
                    Assinatura do Despachante
                  </span>
                </div>
              </div>

              {/* LINHA DE CORTE */}
              <div className="flex items-center justify-center gap-2 text-slate-400 font-mono text-[9px] select-none my-1">
                <Scissors size={12} className="text-slate-400" />
                <div className="border-t border-dashed border-slate-500 flex-1"></div>
                <span>CORTE AQUI (DIVISÃO DE VIAS)</span>
                <div className="border-t border-dashed border-slate-500 flex-1"></div>
              </div>

              {/* 2ª VIA: VIA DO DESPACHANTE */}
              <div className="p-4 bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-sm space-y-2.5 font-sans">
                <div className="flex items-start justify-between border-b border-dashed border-slate-300 pb-2">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                      INTEGRA CRVA · REGISTRO VEICULAR
                    </div>
                    <h4 className="text-xs font-black text-slate-900">
                      COMPROVANTE DE QUITAÇÃO DE CONTA-CORRENTE
                    </h4>
                    <div className="text-[10px] font-mono text-slate-500">
                      Protocolo: <strong className="text-slate-800">{comprovante.protocolo}</strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-700 text-white uppercase tracking-wider">
                      2ª VIA · DESPACHANTE
                    </span>
                    <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                      {new Date(comprovante.dataHora).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] py-1 border-b border-dashed border-slate-300 font-mono">
                  <div>
                    <span className="text-slate-500 block text-[9px]">Despachante:</span>
                    <strong className="text-slate-900">{comprovante.despachante.nome_razao}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">CPF / CNPJ:</span>
                    <strong className="text-slate-900">{comprovante.despachante.documento}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Meio de Pagamento:</span>
                    <strong className="text-emerald-700 uppercase">{comprovante.meioPagamento}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Operador do Caixa:</span>
                    <strong className="text-slate-700">{comprovante.operadorNome}</strong>
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

                <div className="pt-3 border-t border-slate-200 text-center">
                  <div className="w-40 mx-auto border-t border-slate-400 mt-2"></div>
                  <span className="text-[8px] uppercase font-bold text-slate-400">
                    Autenticação do Caixa CRVA
                  </span>
                </div>
              </div>
            </div>

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
                onClick={() => setComprovante(null)}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border-0 shadow-lg shadow-emerald-950/50"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
