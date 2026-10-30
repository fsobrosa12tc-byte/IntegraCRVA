import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  ShoppingCart, 
  ArrowLeftRight, 
  User, 
  LogOut, 
  Home, 
  DollarSign, 
  TrendingUp, 
  CreditCard, 
  QrCode, 
  Banknote, 
  Receipt, 
  Search, 
  PlusCircle, 
  CheckCircle2, 
  ShieldCheck,
  ArrowDownCircle,
  ArrowUpCircle,
  Lock,
  Loader2,
  Building2,
  Wallet,
  Sparkles,
  BarChart3,
  FileText,
  UserCheck
} from 'lucide-react';
import { canSwitchModules, UserRole } from './types/auth';
import type { CaixaDiario, Despachante, FormaPagamento, MovimentacaoCaixa } from './types/pdv';
import {
  calcularSaldoEsperado,
  deCentavos,
  ehLiquidacaoFatura,
  ehSuprimentoRealGaveta,
  formatarBRL,
  listarMovimentacoes,
  listarMovimentacoesDoDia,
  paraCentavos,
  registrarMovimentacao,
  type ResultadoFechamento
} from './lib/pdvCaixa';
import { useCaixa, format } from './hooks/useCaixa';
import { supabase } from './lib/supabase';
import { autenticarNovoOperador, executarTrocaOperador } from './lib/pdvTrocaOperador';
import TrocaOperadorModal from './components/pdv/TrocaOperadorModal';
import {
  AberturaCaixa,
  ComprovanteFechamento,
  FechamentoCegoModal,
  MovimentoModal
} from './components/pdv/CaixaModais';
import FrenteCaixa from './components/pdv/FrenteCaixa';
import DashboardPDV from './pages/DashboardPDV';
import ContaCorrenteDespachantesModal from './components/pdv/ContaCorrenteDespachantesModal';
import PainelFaturasDespachantes from './components/pdv/PainelFaturasDespachantes';
import { 
  buscarFaturasDespachantesAguardandoQuitacao, 
  inscreverFaturasDespachantesRealtime 
} from './lib/pdvContaCorrente';
import type { FaturaDespachantePendente } from './types/pdv';
import { buscarDespachantes } from './lib/pdvVendas';

interface ModuloPDVProps {
  usuario: any;
  onLogout: () => void;
  onSwitchModule?: (modulo: 'crva' | 'pdv') => void;
  onVoltarGateway?: () => void;
  /** Notifica o App quando outro operador assume o terminal (persistência da sessão). */
  onUsuarioAlterado?: (usuario: any) => void;
}

const ROTULO_FORMA: Record<string, string> = {
  pix: 'PIX',
  cartao_debito: 'CARTÃO DÉBITO',
  cartao_credito: 'CARTÃO CRÉDITO',
  dinheiro: 'DINHEIRO',
  faturamento: 'DESPACHANTE / PRAZO'
};

export default function ModuloPDV({ 
  usuario, 
  onLogout, 
  onSwitchModule, 
  onVoltarGateway,
  onUsuarioAlterado
}: ModuloPDVProps) {
  const userRole: UserRole = usuario?.role || 'caixa';
  const podeTrocarModulo = canSwitchModules(userRole);
  const operadorNome: string = usuario?.nome || usuario?.nome_completo || 'Operador';

  const podeAcessarDashboard = ['master', 'gerente', 'financeiro'].includes(userRole) || usuario?.email === 'fsobrosa.12tc@gmail.com';
  const [exibindoDashboard, setExibindoDashboard] = useState(false);
  // Supervisão (master/gerente/financeiro) pode transitar sem abrir caixa próprio
  const [modoSupervisao, setModoSupervisao] = useState(false);

  // ---- Ciclo de vida do caixa com Crash Recovery (RF001 / RF004) ----
  const {
    caixa,
    operadorId,
    carregando,
    erroCaixa,
    caixaRecuperado,
    bannerRecuperadoVisivel,
    fecharBannerRecuperado,
    movs,
    setMovs,
    carregarEstado,
    abrirCaixa: abrirCaixaHook,
    fecharCaixa: fecharCaixaHook,
    setCaixa,
    setOperadorId,
  } = useCaixa(usuario);

  const [movsDia, setMovsDia] = useState<MovimentacaoCaixa[]>([]);
  const [conectadoRealtime, setConectadoRealtime] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date>(new Date());
  const [modalMov, setModalMov] = useState<'suprimento' | 'sangria' | null>(null);
  const [modalFechamento, setModalFechamento] = useState(false);
  const [comprovante, setComprovante] = useState<ResultadoFechamento | null>(null);

  // ---- Troca Rápida de Operador (sem fechar o caixa) ----
  const [modalTroca, setModalTroca] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ---- Seção Conta-Corrente de Despachantes e Faturas em Aberto ----
  const [modalContaCorrente, setModalContaCorrente] = useState(false);
  const [despachantesLista, setDespachantesLista] = useState<Despachante[]>([]);
  const [faturasPendentes, setFaturasPendentes] = useState<FaturaDespachantePendente[]>([]);
  const [carregandoFaturas, setCarregandoFaturas] = useState(false);

  const carregarFaturasPendentes = useCallback(async () => {
    setCarregandoFaturas(true);
    try {
      const faturas = await buscarFaturasDespachantesAguardandoQuitacao();
      setFaturasPendentes(faturas);
    } catch (e) {
      console.warn('Erro ao carregar faturas pendentes de despachantes:', e);
    } finally {
      setCarregandoFaturas(false);
    }
  }, []);

  const carregarDespachantes = useCallback(async () => {
    try {
      const lista = await buscarDespachantes();
      setDespachantesLista(lista);
    } catch (e) {
      console.warn('Erro ao carregar lista de despachantes:', e);
    }
  }, []);

  const carregarDadosDoDia = useCallback(async () => {
    try {
      const listaDia = await listarMovimentacoesDoDia();
      setMovsDia(listaDia);
      setUltimaAtualizacao(new Date());
    } catch (e) {
      console.warn('Erro ao carregar movimentações do dia:', e);
    }
  }, []);

  useEffect(() => {
    carregarDespachantes();
    carregarDadosDoDia();
    carregarFaturasPendentes();

    // Sincronização Realtime da esteira de faturas de despachantes
    const cancelarRealtimeFaturas = inscreverFaturasDespachantesRealtime(() => {
      carregarFaturasPendentes();
      carregarDespachantes();
      carregarDadosDoDia();
      if (caixa?.id) {
        listarMovimentacoes(caixa.id).then(setMovs).catch(() => {});
      }
    });

    return () => {
      cancelarRealtimeFaturas();
    };
  }, [carregarDespachantes, carregarDadosDoDia, carregarFaturasPendentes, caixa?.id, setMovs]);

  // Sincronização em Tempo Real (Supabase Realtime) para movimentações e caixas
  useEffect(() => {
    const canal = supabase
      .channel('integra_pdv_realtime_feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'movimentacoes_caixa' },
        (payload) => {
          console.log('[Supabase Realtime] Movimentação detectada:', payload.eventType);
          carregarDadosDoDia();
          carregarFaturasPendentes();
          if (caixa?.id) {
            listarMovimentacoes(caixa.id).then(setMovs).catch(() => {});
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'caixas_diarios' },
        () => {
          carregarDadosDoDia();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'despachantes' },
        () => {
          carregarDespachantes();
          carregarFaturasPendentes();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConectadoRealtime(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConectadoRealtime(false);
        }
      });

    return () => {
      supabase.removeChannel(canal);
    };
  }, [caixa?.id, carregarDadosDoDia, carregarDespachantes, carregarFaturasPendentes, setMovs]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const saldoGavetaAgora = caixa ? calcularSaldoEsperado(caixa, movs) : 0;

  const handleTrocarOperador = async (login: string, senha: string, motivo: string) => {
    if (!caixa) throw new Error('Não há caixa aberto para transferir.');
    const anterior = { id: caixa.operador_id, nome: operadorNome };
    const { operador: novo, sessaoAnterior } = await autenticarNovoOperador(login, senha);
    await executarTrocaOperador({ caixa, anterior, novo, motivo, sessaoAnterior });

    // Caixa continua aberto; apenas a titularidade muda (comanda em andamento preservada)
    setCaixa({ ...caixa, operador_id: novo.id });
    setOperadorId(novo.id);
    setModoSupervisao(false);
    setModalTroca(false);
    onUsuarioAlterado?.({
      id: novo.id,
      nome: novo.nome,
      email: novo.email,
      funcao: novo.funcao,
      role: novo.role
    });
    setToast(`Terminal assumido por ${novo.nome}. Transação auditada!`);
  };

  const handleAbrirCaixa = async (valor: number) => {
    await abrirCaixaHook(valor);
    setModoSupervisao(false);
    carregarDadosDoDia();
  };

  const handleMovimento = async (tipo: 'suprimento' | 'sangria', valor: number, descricao: string) => {
    if (!caixa) return;
    const nova = await registrarMovimentacao({
      caixa_id: caixa.id,
      tipo,
      valor,
      forma_pagamento: 'dinheiro',
      descricao,
      justificativa_motivo: descricao,
      operador_id: operadorId,
      operador_nome: operadorNome
    });
    setMovs(prev => [nova, ...prev]);
    setModalMov(null);
    carregarDadosDoDia();
  };

  const handleFechar = async (valorInformado: number) => {
    const res = await fecharCaixaHook(valorInformado, {
      nome: operadorNome,
      cpf: (usuario as any)?.cpf || (usuario as any)?.documento,
      email: (usuario as any)?.email
    });
    setModalFechamento(false);
    setComprovante(res);
    setCaixa(null);
    setMovs([]);
    carregarDadosDoDia();
  };

  const handleConcluirFechamento = () => {
    setComprovante(null);
    setCaixa(null);
    setMovs([]);
    carregarDadosDoDia();
  };

  // =========================================================================
  // SEGREGAÇÃO ESTRITA DOS 6 KPIS BANCÁRIOS POR CAIXA ABERTO (RESET AO FECHAR)
  // Regra 1: Escopo Obrigatório por Turno Ativo (.eq('caixa_id', caixaAtivo.id))
  // Se o caixa estiver fechado ou não houver turno ativo, rigorosamente R$ 0,00!
  // =========================================================================
  const temCaixaAtivo = Boolean(caixa && caixa.status === 'aberto');

  // 'DINHEIRO': Apenas movimentações físicas em espécie no caixa ativo
  // (somando vendas diretas em dinheiro, liquidações de fatura em dinheiro e suprimentos reais de gaveta, e subtraindo sangrias)
  const entradasLiquidasEspecieTurno = temCaixaAtivo
    ? deCentavos(
        movs
          .filter(m => m.caixa_id === caixa.id && m.forma_pagamento === 'dinheiro')
          .reduce((acc, m) => {
            const c = paraCentavos(Number((m as any).valor_total || m.valor || 0));
            if (m.tipo === 'sangria') return acc - c;
            if (m.tipo === 'venda' || ehLiquidacaoFatura(m) || ehSuprimentoRealGaveta(m)) return acc + c;
            return acc;
          }, 0)
      )
    : 0;

  // 'PIX': Soma TODAS as entradas recebidas via PIX no caixa ativo (vendas diretas e quitações de faturas)
  const totalPix = temCaixaAtivo
    ? deCentavos(
        movs
          .filter(
            m =>
              m.caixa_id === caixa.id &&
              m.forma_pagamento === 'pix' &&
              (m.tipo === 'venda' || ehLiquidacaoFatura(m))
          )
          .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
      )
    : 0;

  // 'CRÉDITO': Transações via Cartão de Crédito no caixa ativo (vendas e liquidações)
  const totalCredito = temCaixaAtivo
    ? deCentavos(
        movs
          .filter(
            m =>
              m.caixa_id === caixa.id &&
              m.forma_pagamento === 'cartao_credito' &&
              (m.tipo === 'venda' || ehLiquidacaoFatura(m))
          )
          .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
      )
    : 0;

  // 'DÉBITO': Transações via Cartão de Débito no caixa ativo (vendas e liquidações)
  const totalDebito = temCaixaAtivo
    ? deCentavos(
        movs
          .filter(
            m =>
              m.caixa_id === caixa.id &&
              m.forma_pagamento === 'cartao_debito' &&
              (m.tipo === 'venda' || ehLiquidacaoFatura(m))
          )
          .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
      )
    : 0;

  // 'DESPACHANTE / PRAZO': Reflete o saldo líquido devedor gerado no turno:
  // Faturado a prazo em aberto menos o total de faturas liquidadas no turno.
  // Se todas as faturas forem pagas, exibe obrigatoriamente R$ 0,00.
  const totalFaturadoAbertoCent = temCaixaAtivo
    ? movs
        .filter(m => m.caixa_id === caixa.id && m.forma_pagamento === 'faturamento' && m.tipo === 'venda')
        .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
    : 0;

  const totalFaturasPagasCent = temCaixaAtivo
    ? movs
        .filter(m => m.caixa_id === caixa.id && ehLiquidacaoFatura(m))
        .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
    : 0;

  const totalDespachantePrazo = deCentavos(Math.max(0, totalFaturadoAbertoCent - totalFaturasPagasCent));

  // 'FATURAMENTO BRUTO DIA': Soma de todas as vendas do turno (ou vendas + liquidações líquidas sem dupla contagem)
  const faturamentoBrutoDia = temCaixaAtivo
    ? deCentavos(
        movs
          .filter(m => m.caixa_id === caixa.id && m.tipo === 'venda')
          .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
      )
    : 0;

  // Total faturado no turno atual para auditoria da tabela
  const vendasTurno = temCaixaAtivo ? movs.filter(m => m.tipo === 'venda') : [];
  const totalArrecadadoTurno = vendasTurno.reduce((acc, t) => acc + Number(t.valor), 0);
  const totalFaturadoTurno = totalDespachantePrazo;

  // Total devedor geral dos despachantes
  const totalDevedorGeral = despachantesLista.reduce((acc, d) => acc + (Number(d.saldo_devedor) || 0), 0);

  const handleVendaRegistrada = useCallback((mov: MovimentacaoCaixa) => {
    setMovs(prev => [mov, ...prev]);
    carregarDespachantes();
    carregarDadosDoDia();
    carregarFaturasPendentes();
  }, [carregarDespachantes, carregarDadosDoDia, carregarFaturasPendentes, setMovs]);

  const handleDespachanteAtualizado = (dAtualizado: Despachante) => {
    setDespachantesLista(prev => prev.map(d => d.id === dAtualizado.id ? dAtualizado : d));
    carregarFaturasPendentes();
    if (caixa) {
      listarMovimentacoes(caixa.id).then(setMovs).catch(() => {});
    }
    carregarDadosDoDia();
  };

  const handleFaturaLiquidada = useCallback(() => {
    carregarFaturasPendentes();
    carregarDespachantes();
    carregarDadosDoDia();
    if (caixa?.id) {
      listarMovimentacoes(caixa.id).then(setMovs).catch(() => {});
    }
    setToast('Fatura de despachante liquidada com sucesso! Recibo e auditoria registrados.');
  }, [carregarFaturasPendentes, carregarDespachantes, carregarDadosDoDia, caixa?.id, setMovs]);

  const bloqueado = !caixa;

  if (exibindoDashboard) {
    return (
      <DashboardPDV 
        usuario={usuario} 
        onVoltar={() => setExibindoDashboard(false)} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 pt-20 pb-12 selection:bg-emerald-500/30 selection:text-white">
      {/* =====================================================================
       *  HEADER UNIFICADO (DARK SLATE CORPORATIVO)
       * ===================================================================== */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-xl">
        <div className="container max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-black shadow-lg shadow-emerald-950/50">
              <ShoppingCart size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-white tracking-tight text-lg">INTEGRA PDV</span>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-md text-[10px] font-bold uppercase tracking-wider">
                  Frente de Caixa
                </span>
              </div>
            </div>
          </div>

          {/* Navegação e Ações Rápidas do Header */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Seletor Rápido de Módulo (CRVA <-> PDV) */}
            {podeTrocarModulo && onSwitchModule && (
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => onSwitchModule('crva')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-sky-400 hover:bg-slate-850 transition-all cursor-pointer border-0 flex items-center gap-1.5"
                  title="Ir para o Módulo de Atendimento Balcão CRVA"
                >
                  <ArrowLeftRight size={13} className="text-sky-400" />
                  <span>Módulo CRVA</span>
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-emerald-400 shadow-sm border border-slate-700 cursor-default flex items-center gap-1"
                >
                  <ShoppingCart size={13} className="text-emerald-400" />
                  <span>PDV (Ativo)</span>
                </button>
              </div>
            )}

            {onVoltarGateway && (
              <button
                type="button"
                onClick={onVoltarGateway}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700/80 rounded-lg transition-colors cursor-pointer"
                title="Voltar ao Gateway de Módulos"
              >
                <Home size={14} />
                <span>Gateway</span>
              </button>
            )}

            {/* Troca Rápida de Operador (mesmo caixa aberto) */}
            {caixa && (
              <button
                type="button"
                id="btn-troca-rapida-operador"
                onClick={() => setModalTroca(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-600/40 rounded-lg transition-colors cursor-pointer"
                title="Outro operador assume este terminal sem fechar o caixa"
              >
                <UserCheck size={14} />
                <span className="hidden lg:inline">Troca Rápida de Operador</span>
              </button>
            )}

            {/* Operador Autenticado */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center font-bold text-xs">
                {usuario?.nome ? usuario.nome.charAt(0).toUpperCase() : <User size={15} />}
              </div>
              <div className="hidden sm:block text-xs">
                <div className="text-[9px] uppercase font-black tracking-wider text-amber-400/90">Operador Ativo</div>
                <div className="font-bold text-white leading-tight" id="operador-ativo-nome">
                  {operadorNome}
                </div>
                <div className="text-[10px] uppercase font-bold text-emerald-400">
                  {usuario?.funcao || 'Financeiro'}
                </div>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer border-0 bg-transparent"
              title="Encerrar Sessão"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* =====================================================================
       *  CONTEÚDO PRINCIPAL DO PDV
       * ===================================================================== */}
      <main className="container max-w-7xl mx-auto px-4">

        {/* =====================================================================
         *  BANNER INFORMATIVO: RECUPERAÇÃO DO ESTADO DO CAIXA (CRASH RECOVERY)
         * ===================================================================== */}
        {caixaRecuperado && caixa && bannerRecuperadoVisivel && (
          <div
            id="banner-caixa-ativo-recuperado"
            className="mb-6 p-4 rounded-2xl bg-slate-900/90 border border-emerald-500/40 backdrop-blur-md shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-950/40">
                <ShieldCheck size={22} className="text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-emerald-400 flex items-center gap-1.5">
                    <span>🟢 Caixa Ativo Recuperado</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Crash Recovery Ativo
                  </span>
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  Turno aberto em <strong className="text-white font-mono">{format(new Date(caixa.data_abertura), 'dd/MM/yyyy HH:mm:ss')}</strong> | Operador: <strong className="text-emerald-300">{operadorNome}</strong>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={fecharBannerRecuperado}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 transition-colors cursor-pointer"
            >
              Dispensar
            </button>
          </div>
        )}

        {/* BANNER DO MODO SUPERVISÃO (sem caixa próprio aberto) */}
        {podeAcessarDashboard && bloqueado && modoSupervisao && !carregando && (
          <div className="mb-6 p-4 bg-purple-950/40 border border-purple-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-purple-200">
              <strong className="block text-sm text-purple-100">Modo Supervisão</strong>
              Você está apenas supervisionando. Vendas, sangrias e suprimentos exigem um caixa próprio aberto.
            </div>
            <button
              type="button"
              id="btn-abrir-meu-caixa"
              onClick={() => setModoSupervisao(false)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold border-0 cursor-pointer"
            >
              Abrir meu caixa
            </button>
          </div>
        )}
        
        {/* BARRA DE AÇÕES RÁPIDAS DO TERMINAL */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            id="btn-suprimento"
            disabled={bloqueado}
            onClick={() => setModalMov('suprimento')}
            className="px-4 py-2.5 bg-slate-900/70 backdrop-blur-md hover:bg-slate-800/80 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-slate-950/40 disabled:opacity-40"
          >
            <ArrowDownCircle size={16} /> Suprimento (Entrada em Dinheiro)
          </button>

          <button
            type="button"
            id="btn-sangria"
            disabled={bloqueado}
            onClick={() => setModalMov('sangria')}
            className="px-4 py-2.5 bg-slate-900/70 backdrop-blur-md hover:bg-slate-800/80 border border-rose-500/30 hover:border-rose-500/60 text-rose-400 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-slate-950/40 disabled:opacity-40"
          >
            <ArrowUpCircle size={16} /> Sangria (Retirada / Cofre)
          </button>

          {/* Ação de Conta-Corrente de Despachantes */}
          <button
            type="button"
            id="btn-conta-corrente-despachantes"
            onClick={() => setModalContaCorrente(true)}
            className="px-4 py-2.5 bg-slate-900/70 backdrop-blur-md hover:bg-slate-800/80 border border-indigo-500/30 hover:border-indigo-500/60 text-indigo-300 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-slate-950/40"
          >
            <Building2 size={16} className="text-indigo-400" />
            <span>Conta-Corrente de Despachantes</span>
            {totalDevedorGeral > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono font-semibold tracking-tight">
                {formatarBRL(totalDevedorGeral)}
              </span>
            )}
          </button>

          {podeAcessarDashboard && (
            <button
              type="button"
              id="btn-abrir-dashboard-pdv"
              onClick={() => setExibindoDashboard(true)}
              className="px-4 py-2.5 bg-slate-900/70 backdrop-blur-md hover:bg-slate-800/80 border border-purple-500/30 hover:border-purple-500/60 text-purple-300 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-slate-950/40"
            >
              <BarChart3 size={16} className="text-purple-400" />
              <span>Dashboard Realtime</span>
            </button>
          )}

          {/* Indicador de Status Supabase Realtime */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-2 bg-slate-900/70 backdrop-blur-md border border-slate-700/50 rounded-xl text-xs font-mono">
            <span className="relative flex h-2 w-2">
              {conectadoRealtime && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  conectadoRealtime ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              ></span>
            </span>
            <span className="text-[11px] text-slate-300 font-semibold">
              {conectadoRealtime ? 'Supabase Conectado' : 'Reconectando...'}
            </span>
            <span className="text-[10px] text-slate-500">
              · {ultimaAtualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <button
            type="button"
            id="btn-encerrar-turno"
            disabled={bloqueado}
            onClick={() => setModalFechamento(true)}
            className="ml-auto px-4 py-2.5 bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/80 disabled:opacity-40 text-rose-200 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-rose-950/50"
          >
            <Lock size={15} /> Encerrar Turno / Fechar Caixa
          </button>
        </div>

        {/* =====================================================================
         *  GRADE DE KPIS ESTRATÉGICOS (6 INDICADORES - FINTECH CORPORATIVA DARK)
         * ===================================================================== */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {/* Card 1: FATURAMENTO BRUTO DIA */}
          <div className="bg-slate-900/70 backdrop-blur-md border border-slate-700/50 shadow-xl rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/40 hover:-translate-y-0.5 transition-all duration-200">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 opacity-80" />
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
                FATURAMENTO BRUTO DIA
              </span>
              <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <TrendingUp size={14} />
              </div>
            </div>
            <div className="my-1">
              <div className="text-base sm:text-lg xl:text-xl font-mono font-semibold tracking-tight text-white tabular-nums">
                {formatarBRL(faturamentoBrutoDia)}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1 pt-1.5 border-t border-slate-800/80">
              <span className="text-slate-400 truncate">{temCaixaAtivo ? 'Total do Turno' : 'Caixa Fechado'}</span>
              <span className={`flex items-center gap-1 text-[9px] font-semibold shrink-0 ${temCaixaAtivo ? 'text-emerald-400' : 'text-slate-500'}`} title={temCaixaAtivo ? 'Turno ativo em tempo real' : 'Caixa encerrado (R$ 0,00)'}>
                <span className={`w-1.5 h-1.5 rounded-full ${temCaixaAtivo ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
                <span>{temCaixaAtivo ? 'Live' : 'Zerado'}</span>
              </span>
            </div>
          </div>

          {/* Card 2: DINHEIRO */}
          <div className="bg-slate-900/70 backdrop-blur-md border border-slate-700/50 shadow-xl rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/40 hover:-translate-y-0.5 transition-all duration-200">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 to-green-500 opacity-80" />
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
                DINHEIRO
              </span>
              <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Banknote size={14} />
              </div>
            </div>
            <div className="my-1">
              <div className="text-base sm:text-lg xl:text-xl font-mono font-semibold tracking-tight text-emerald-400 tabular-nums">
                {formatarBRL(entradasLiquidasEspecieTurno)}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1 pt-1.5 border-t border-slate-800/80">
              <span className="text-slate-400 truncate">{temCaixaAtivo ? 'Líquido Turno' : 'Caixa Fechado'}</span>
              <span className={`flex items-center gap-1 text-[9px] font-semibold shrink-0 ${temCaixaAtivo ? 'text-emerald-400' : 'text-slate-500'}`} title="Apenas dinheiro em espécie do turno">
                <span className={`w-1.5 h-1.5 rounded-full ${temCaixaAtivo ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
                <span>{temCaixaAtivo ? 'Live' : 'Zerado'}</span>
              </span>
            </div>
          </div>

          {/* Card 3: PIX */}
          <div className="bg-slate-900/70 backdrop-blur-md border border-slate-700/50 shadow-xl rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between relative overflow-hidden group hover:border-sky-500/40 hover:-translate-y-0.5 transition-all duration-200">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-sky-400 to-cyan-500 opacity-80" />
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
                PIX
              </span>
              <div className="w-7 h-7 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
                <QrCode size={14} />
              </div>
            </div>
            <div className="my-1">
              <div className="text-base sm:text-lg xl:text-xl font-mono font-semibold tracking-tight text-sky-400 tabular-nums">
                {formatarBRL(totalPix)}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1 pt-1.5 border-t border-slate-800/80">
              <span className="text-slate-400 truncate">{temCaixaAtivo ? 'Instantâneo Pix' : 'Caixa Fechado'}</span>
              <span className={`flex items-center gap-1 text-[9px] font-semibold shrink-0 ${temCaixaAtivo ? 'text-sky-400' : 'text-slate-500'}`} title="Apenas transações em Pix do turno">
                <span className={`w-1.5 h-1.5 rounded-full ${temCaixaAtivo ? 'bg-sky-400 animate-pulse' : 'bg-slate-600'}`}></span>
                <span>{temCaixaAtivo ? 'Live' : 'Zerado'}</span>
              </span>
            </div>
          </div>

          {/* Card 4: CRÉDITO */}
          <div className="bg-slate-900/70 backdrop-blur-md border border-slate-700/50 shadow-xl rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between relative overflow-hidden group hover:border-violet-500/40 hover:-translate-y-0.5 transition-all duration-200">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-400 to-purple-500 opacity-80" />
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
                CRÉDITO
              </span>
              <div className="w-7 h-7 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 flex items-center justify-center shrink-0">
                <CreditCard size={14} />
              </div>
            </div>
            <div className="my-1">
              <div className="text-base sm:text-lg xl:text-xl font-mono font-semibold tracking-tight text-violet-300 tabular-nums">
                {formatarBRL(totalCredito)}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1 pt-1.5 border-t border-slate-800/80">
              <span className="text-slate-400 truncate">{temCaixaAtivo ? 'Cartão Crédito' : 'Caixa Fechado'}</span>
              <span className={`flex items-center gap-1 text-[9px] font-semibold shrink-0 ${temCaixaAtivo ? 'text-violet-400' : 'text-slate-500'}`} title="Total via Cartão de Crédito do turno">
                <span className={`w-1.5 h-1.5 rounded-full ${temCaixaAtivo ? 'bg-violet-400 animate-pulse' : 'bg-slate-600'}`}></span>
                <span>{temCaixaAtivo ? 'Live' : 'Zerado'}</span>
              </span>
            </div>
          </div>

          {/* Card 5: DÉBITO */}
          <div className="bg-slate-900/70 backdrop-blur-md border border-slate-700/50 shadow-xl rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between relative overflow-hidden group hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-200">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 to-indigo-500 opacity-80" />
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
                DÉBITO
              </span>
              <div className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
                <CreditCard size={14} />
              </div>
            </div>
            <div className="my-1">
              <div className="text-base sm:text-lg xl:text-xl font-mono font-semibold tracking-tight text-blue-300 tabular-nums">
                {formatarBRL(totalDebito)}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1 pt-1.5 border-t border-slate-800/80">
              <span className="text-slate-400 truncate">{temCaixaAtivo ? 'Cartão Débito' : 'Caixa Fechado'}</span>
              <span className={`flex items-center gap-1 text-[9px] font-semibold shrink-0 ${temCaixaAtivo ? 'text-blue-400' : 'text-slate-500'}`} title="Total via Cartão de Débito do turno">
                <span className={`w-1.5 h-1.5 rounded-full ${temCaixaAtivo ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`}></span>
                <span>{temCaixaAtivo ? 'Live' : 'Zerado'}</span>
              </span>
            </div>
          </div>

          {/* Card 6: DESPACHANTE / PRAZO */}
          <div className="bg-slate-900/70 backdrop-blur-md border border-slate-700/50 shadow-xl rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between relative overflow-hidden group hover:border-indigo-500/40 hover:-translate-y-0.5 transition-all duration-200">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-400 to-violet-500 opacity-80" />
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-[10px] xl:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
                DESPACHANTE / PRAZO
              </span>
              <div className="w-7 h-7 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <Building2 size={14} />
              </div>
            </div>
            <div className="my-1">
              <div className="text-base sm:text-lg xl:text-xl font-mono font-semibold tracking-tight text-indigo-300 tabular-nums">
                {formatarBRL(totalDespachantePrazo)}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1 pt-1.5 border-t border-slate-800/80">
              <span className="text-slate-400 truncate">{temCaixaAtivo ? 'Faturado no Turno' : 'Caixa Fechado'}</span>
              <span className={`flex items-center gap-1 text-[9px] font-semibold shrink-0 ${temCaixaAtivo ? 'text-indigo-400' : 'text-slate-500'}`} title="Montante faturado a prazo para despachantes no turno ativo">
                <span className={`w-1.5 h-1.5 rounded-full ${temCaixaAtivo ? 'bg-indigo-400 animate-pulse' : 'bg-slate-600'}`}></span>
                <span>{temCaixaAtivo ? 'Live' : 'Zerado'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* FRENTE DE CAIXA ÁGIL (RF002 / RF003) */}
        <FrenteCaixa
          caixa={caixa}
          operadorNome={operadorNome}
          operadorId={operadorId}
          userRole={userRole}
          bloqueado={bloqueado}
          modalExternoAberto={!!modalMov || modalFechamento || !!comprovante || modalContaCorrente || modalTroca}
          onVendaRegistrada={handleVendaRegistrada}
        />

        {/* ESTEIRA DINÂMICA: FATURAS DE DESPACHANTES AGUARDANDO QUITAÇÃO */}
        <PainelFaturasDespachantes
          faturas={faturasPendentes}
          despachantes={despachantesLista}
          caixaId={caixa?.id ?? null}
          operadorNome={operadorNome}
          operadorId={operadorId}
          bloqueado={bloqueado}
          carregando={carregandoFaturas}
          onAtualizar={carregarFaturasPendentes}
          onFaturaLiquidada={handleFaturaLiquidada}
        />

        {/* TABELA DE MOVIMENTAÇÕES DO TURNO */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 backdrop-blur-md shadow-xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Receipt size={20} className="text-emerald-400" />
              <h3 className="font-bold text-white text-base">Movimentações Auditadas do Caixa</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Terminal Conectado · {movs.length} registros
            </span>
          </div>

          <div className="overflow-x-auto flex-1 scrollbar-thin scrollbar-thumb-slate-700">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 font-bold border-b border-slate-800 text-[11px]">
                  <th className="p-3">Horário</th>
                  <th className="p-3">ID Transação</th>
                  <th className="p-3">Serviço / Operação</th>
                  <th className="p-3">Tomador / Cliente</th>
                  <th className="p-3">Forma de Pagamento</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {movs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">
                      Nenhuma movimentação registrada no turno corrente.
                    </td>
                  </tr>
                )}
                {movs.map((t) => {
                  const partes = (t.descricao || '').split(' | ');
                  const [servico, cliente] =
                    t.tipo === 'venda'
                      ? [partes[0] || 'Venda de Balcão', partes[1] || 'Consumidor']
                      : [
                          t.tipo === 'sangria'
                            ? 'Sangria de Gaveta'
                            : ehLiquidacaoFatura(t)
                            ? 'Liquidação de Fatura de Despachante'
                            : 'Suprimento de Troco',
                          t.descricao || '-'
                        ];
                  const saida = t.tipo === 'sangria';
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 text-slate-400 font-mono">
                        {new Date(t.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-300">
                        {t.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-200 block">{servico}</span>
                        {(t.operador_nome || (t.valor_issqn ?? 0) > 0) && (
                          <span className="text-[10px] text-slate-500 block font-mono">
                            {t.operador_nome ? `Auditado por ${t.operador_nome}` : ''}
                            {t.operador_nome && (t.valor_issqn ?? 0) > 0 ? ' · ' : ''}
                            {(t.valor_issqn ?? 0) > 0 ? `ISSQN 2,00%: ${formatarBRL(Number(t.valor_issqn))}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-300 font-medium">{cliente || '-'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border font-mono ${
                          t.forma_pagamento === 'faturamento'
                            ? 'bg-indigo-950/60 text-indigo-300 border-indigo-700/60'
                            : t.forma_pagamento === 'dinheiro'
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          {ROTULO_FORMA[t.forma_pagamento] || t.forma_pagamento}
                        </span>
                      </td>
                      <td className={`p-3 text-right font-mono font-semibold tracking-tight tabular-nums ${saida ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {saida ? '- ' : ''}{formatarBRL(Number(t.valor))}
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-800/60">
                          <CheckCircle2 size={11} /> Concluído
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 font-mono">
            <span>Sessão segura autenticada via Marks Systems · PostgreSQL</span>
            <span className="font-semibold text-white">
              Total Faturado no Turno: <span className="text-emerald-400 font-semibold">{formatarBRL(totalArrecadadoTurno)}</span>
              {totalFaturadoTurno > 0 && (
                <span className="ml-3 text-indigo-400 font-semibold">
                  (Faturado Despachante: {formatarBRL(totalFaturadoTurno)} — a receber)
                </span>
              )}
            </span>
          </div>
        </div>
      </main>

      {/* MODAL DE CONTA-CORRENTE E LIQUIDAÇÃO DE DESPACHANTES */}
      {modalContaCorrente && (
        <ContaCorrenteDespachantesModal
          despachantes={despachantesLista}
          caixaId={caixa?.id ?? null}
          operadorNome={operadorNome}
          operadorId={operadorId}
          onClose={() => setModalContaCorrente(false)}
          onDespachanteAtualizado={handleDespachanteAtualizado}
          onMovimentacaoCriada={() => {
            if (caixa) listarMovimentacoes(caixa.id).then(setMovs);
          }}
        />
      )}

      {/* TRAVA OPERACIONAL (RF001): sem turno aberto o terminal fica travado */}
      {carregando && !comprovante && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 flex items-center justify-center text-white gap-3 text-sm font-bold">
          <Loader2 className="animate-spin text-emerald-500" size={24} /> Verificando turno de caixa no Supabase...
        </div>
      )}
      {!carregando && bloqueado && !comprovante && !(podeAcessarDashboard && modoSupervisao) && (
        <AberturaCaixa
          operadorNome={operadorNome}
          erroInicial={erroCaixa}
          onAbrir={handleAbrirCaixa}
          onVoltarGateway={onVoltarGateway}
          onLogout={onLogout}
          onSupervisionar={podeAcessarDashboard ? () => setModoSupervisao(true) : undefined}
          onAbrirDashboard={
            podeAcessarDashboard
              ? () => {
                  setModoSupervisao(true);
                  setExibindoDashboard(true);
                }
              : undefined
          }
        />
      )}

      {modalMov && (
        <MovimentoModal
          tipo={modalMov}
          onClose={() => setModalMov(null)}
          onConfirmar={(v, d) => handleMovimento(modalMov, v, d)}
        />
      )}

      {modalTroca && caixa && (
        <TrocaOperadorModal
          operadorAtualNome={operadorNome}
          saldoGaveta={saldoGavetaAgora}
          onClose={() => setModalTroca(false)}
          onConfirmar={handleTrocarOperador}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[130] max-w-sm px-4 py-3 bg-emerald-950/95 border border-emerald-500/50 text-emerald-200 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2"
        >
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
      {modalFechamento && (
        <FechamentoCegoModal onClose={() => setModalFechamento(false)} onConfirmar={handleFechar} />
      )}
      {comprovante && (
        <ComprovanteFechamento
          resultado={comprovante}
          operadorNome={operadorNome}
          podeVerDivergencia={userRole === 'master' || userRole === 'gerente'}
          onConcluir={handleConcluirFechamento}
        />
      )}
    </div>
  );
}
