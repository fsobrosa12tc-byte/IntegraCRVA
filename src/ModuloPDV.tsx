import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  ShoppingCart, 
  ArrowLeft,
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
  UserCheck,
  Clock
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
import ModalLiquidacaoFatura from './components/pdv/ModalLiquidacaoFatura';
import { 
  buscarFaturasDespachantesAguardandoQuitacao, 
  inscreverFaturasDespachantesRealtime 
} from './lib/pdvContaCorrente';
import type { FaturaDespachantePendente } from './types/pdv';
import { buscarDespachantes } from './lib/pdvVendas';
import { useEvolutionWhatsApp } from './hooks/useEvolutionWhatsApp';

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
  const { isOnline: isWhatsAppOnline } = useEvolutionWhatsApp({ pollIntervalMs: 25000, autoPolling: true });
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
  const [despachanteParaLiquidar, setDespachanteParaLiquidar] = useState<Despachante | null>(null);

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comandas_balcao' },
        () => {
          setUltimaAtualizacao(new Date());
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

  const pertenceAoTurno = (m: MovimentacaoCaixa) => {
    return !m.caixa_id || (caixa && m.caixa_id === caixa.id);
  };

  const formaLower = (f?: string | null) => (f || '').toLowerCase();

  // 1. 'DINHEIRO': soma das movimentações do turno com forma_pagamento === 'dinheiro' (vendas + quitações em dinheiro)
  // NÃO deduz sangria (sangria afeta apenas o saldo físico de gaveta)
  // NÃO soma suprimento (suprimento é aporte de fundo de troco, não receita de faturamento)
  const totalDinheiroCent = temCaixaAtivo
    ? movs
        .filter(
          m =>
            pertenceAoTurno(m) &&
            formaLower(m.forma_pagamento).includes('dinheiro') &&
            (m.tipo === 'venda' || ehLiquidacaoFatura(m) || m.status === 'liquidado') &&
            m.tipo !== 'sangria' &&
            !ehSuprimentoRealGaveta(m)
        )
        .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
    : 0;
  const totalDinheiro = deCentavos(totalDinheiroCent);
  const entradasLiquidasEspecieTurno = totalDinheiro;

  // 2. 'PIX': soma das movimentações do turno com forma_pagamento === 'pix' (vendas + quitações via pix)
  const totalPixCent = temCaixaAtivo
    ? movs
        .filter(
          m =>
            pertenceAoTurno(m) &&
            formaLower(m.forma_pagamento).includes('pix') &&
            (m.tipo === 'venda' || ehLiquidacaoFatura(m) || m.status === 'liquidado')
        )
        .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
    : 0;
  const totalPix = deCentavos(totalPixCent);

  // 3. 'DÉBITO': soma das movimentações do turno com forma_pagamento de débito (vendas + quitações via débito)
  const totalDebitoCent = temCaixaAtivo
    ? movs
        .filter(
          m =>
            pertenceAoTurno(m) &&
            (formaLower(m.forma_pagamento).includes('debito') || formaLower(m.forma_pagamento).includes('débito')) &&
            (m.tipo === 'venda' || ehLiquidacaoFatura(m) || m.status === 'liquidado')
        )
        .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
    : 0;
  const totalDebito = deCentavos(totalDebitoCent);

  // 4. 'CRÉDITO': soma das movimentações do turno com forma_pagamento de crédito (vendas + quitações via crédito)
  const totalCreditoCent = temCaixaAtivo
    ? movs
        .filter(
          m =>
            pertenceAoTurno(m) &&
            (formaLower(m.forma_pagamento).includes('credito') || formaLower(m.forma_pagamento).includes('crédito')) &&
            (m.tipo === 'venda' || ehLiquidacaoFatura(m) || m.status === 'liquidado')
        )
        .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
    : 0;
  const totalCredito = deCentavos(totalCreditoCent);

  // 5. 'DESPACHANTE / PRAZO': montante total de lançamentos a prazo em aberto aguardando quitação
  // (somatório de 'movimentacoes_caixa' a prazo em aberto ou 'saldo_devedor' dos despachantes ativos)
  const totalFaturasPendentesCent = faturasPendentes.reduce(
    (acc, f) => acc + paraCentavos(Number(f.valorTotal) || 0),
    0
  );
  const totalDevedorGeralCent = despachantesLista.reduce(
    (acc, d) => acc + paraCentavos(Number(d.saldo_devedor) || 0),
    0
  );
  const movsPrazoCent = movs
    .filter(
      m =>
        pertenceAoTurno(m) &&
        (m.tipo === 'faturamento_despachante' ||
          formaLower(m.forma_pagamento).includes('prazo') ||
          formaLower(m.forma_pagamento).includes('faturad') ||
          m.status === 'a_receber') &&
        m.status !== 'liquidado' &&
        !m.fatura_liquidada
    )
    .reduce((acc, m) => acc + paraCentavos(Number(m.valor || 0)), 0);

  const totalDespachantePrazoCent = temCaixaAtivo
    ? Math.max(movsPrazoCent, totalDevedorGeralCent, totalFaturasPendentesCent)
    : 0;
  const totalDespachantePrazo = deCentavos(totalDespachantePrazoCent);

  // 6. 'FATURAMENTO BRUTO': total de receitas realizadas no turno (vendas diretas + faturas de despachantes quitadas)
  // Faturamento a prazo só passa a compor o faturamento bruto quando houver quitação no caixa.
  const faturamentoBrutoCent =
    totalDinheiroCent + totalPixCent + totalDebitoCent + totalCreditoCent;
  const faturamentoBruto = deCentavos(faturamentoBrutoCent);
  const faturamentoBrutoDia = faturamentoBruto;

  // Total faturado no turno atual para auditoria da tabela
  const vendasTurno = temCaixaAtivo ? movs.filter(m => m.tipo === 'venda') : [];
  const totalArrecadadoTurno = vendasTurno.reduce((acc, t) => acc + Number(t.valor), 0);
  const totalFaturadoTurno = totalDespachantePrazo;

  // Total devedor geral dos despachantes
  const totalDevedorGeral = despachantesLista.reduce((acc, d) => acc + (Number(d.saldo_devedor) || 0), 0);

  // 5 KPIs Específicos do Turno Ativo
  const fundoTrocoInicial = caixa ? Number(caixa.valor_abertura) || 0 : 0;
  const recebimentosPixCartao = totalPix + totalDebito + totalCredito;
  const dinheiroEspecie = totalDinheiro;
  const sangriasSaidas = temCaixaAtivo ? movs.filter(m => m.tipo === 'sangria').reduce((acc, m) => acc + (Number(m.valor) || 0), 0) : 0;

  const handleAbrirLiquidacaoDespachante = (desp: Despachante) => {
    setDespachanteParaLiquidar(desp);
  };

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
  const horaAtual = new Date().getHours();
  const turnoNome = horaAtual < 12 ? 'Turno Manhã' : horaAtual < 18 ? 'Turno Tarde' : 'Turno Noite';

  if (exibindoDashboard) {
    return (
      <DashboardPDV 
        usuario={usuario} 
        onVoltar={() => setExibindoDashboard(false)} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 selection:bg-emerald-500/30 selection:text-white">
      {/* =====================================================================
       *  NAVBAR SUPERIOR EXECUTIVA (FULL WIDTH)
       * ===================================================================== */}
      <header className="w-full h-16 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-40 shadow-xl">
        {/* Lado Esquerdo: Voltar / Marca / Título */}
        <div className="flex items-center gap-3">
          {onVoltarGateway && (
            <button
              type="button"
              onClick={onVoltarGateway}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-700/80"
              title="Voltar ao Gateway de Módulos"
            >
              <ArrowLeft size={18} />
            </button>
          )}

          <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-black shadow-lg shadow-emerald-950/50">
            <ShoppingCart size={20} />
          </div>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="font-bold text-base text-white tracking-tight">Integra PDV</span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Frente de Caixa CRVA
            </span>
          </div>
        </div>

        {/* Centro: Status Operacional em Pílula Limpa */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-950/80 border border-slate-800 text-xs shadow-inner">
            <span className="relative flex h-2 w-2">
              {temCaixaAtivo && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${temCaixaAtivo ? 'bg-emerald-500' : 'bg-slate-600'}`} />
            </span>
            <span className="font-semibold text-slate-200">
              {temCaixaAtivo ? `Caixa Aberto • ${turnoNome}` : 'Caixa Fechado'}
            </span>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5 text-slate-400">
              <User size={13} className="text-emerald-400" />
              <span>Operador:</span>
              <span className="text-white font-bold">{operadorNome}</span>
            </div>
          </div>
        </div>

        {/* Lado Direito: Ações Rápidas sem Poluição */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Seletor Rápido de Módulo (CRVA <-> PDV) */}
          {podeTrocarModulo && onSwitchModule && (
            <button
              type="button"
              onClick={() => onSwitchModule('crva')}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-sky-400 hover:bg-slate-800 border border-slate-800 transition-all cursor-pointer"
              title="Ir para o Módulo de Atendimento Balcão CRVA"
            >
              <ArrowLeftRight size={13} className="text-sky-400" />
              <span>Módulo CRVA</span>
            </button>
          )}

          {podeAcessarDashboard && (
            <button
              type="button"
              id="btn-abrir-dashboard-pdv"
              onClick={() => setExibindoDashboard(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/30 hover:bg-purple-900/40 text-purple-300 border border-purple-500/30 transition-all text-xs font-semibold cursor-pointer"
              title="Dashboard Financeiro em Tempo Real"
            >
              <BarChart3 size={14} className="text-purple-400" />
              <span>Dashboard</span>
            </button>
          )}

          {/* Troca Rápida de Operador */}
          {caixa && (
            <button
              type="button"
              onClick={() => setModalTroca(true)}
              className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all text-xs font-semibold cursor-pointer"
              title="Troca rápida de operador sem fechar o caixa"
            >
              <UserCheck size={14} />
              <span>Trocar Operador</span>
            </button>
          )}

          {/* Sangria / Reforço */}
          <button
            type="button"
            id="btn-suprimento-sangria"
            disabled={bloqueado}
            onClick={() => setModalMov('sangria')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700/80 transition-all text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Lançar Sangria ou Reforço de Gaveta"
          >
            <ArrowUpCircle size={14} className="text-amber-400" />
            <span className="hidden sm:inline">Sangria / Reforço</span>
          </button>

          {/* Fechar Caixa */}
          <button
            type="button"
            id="btn-encerrar-turno"
            disabled={bloqueado}
            onClick={() => setModalFechamento(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:border-rose-400/50 transition-all text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Encerrar Turno e Conferência Cega"
          >
            <Lock size={13} />
            <span>Fechar Caixa</span>
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer border-0 bg-transparent"
            title="Encerrar Sessão"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* =====================================================================
       *  CONTEÚDO PRINCIPAL DO PDV (CONTAINER LARGO 1440px)
       * ===================================================================== */}
      <main className="max-w-[1440px] w-full mx-auto px-6 pt-6 pb-12">
        {/* =====================================================================
         *  BANNER INFORMATIVO: RECUPERAÇÃO DO ESTADO DO CAIXA (CRASH RECOVERY)
         * ===================================================================== */}
        {caixaRecuperado && caixa && bannerRecuperadoVisivel && (
          <div
            id="banner-caixa-ativo-recuperado"
            className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 shadow-lg backdrop-blur-md flex items-center justify-between mb-6 flex-wrap gap-3 animate-in fade-in slide-in-from-top-2 duration-300"
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
              className="px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-medium transition-all cursor-pointer"
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

        {/* =====================================================================
         *  FAIXA DE KPIS FINANCEIROS DO TURNO (5 CARDS CLEAN)
         * ===================================================================== */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {/* Card 1: Fundo de Troco (Inicial) */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Fundo de Troco (Inicial)
              </span>
              <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
                <Wallet size={14} />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-white tracking-tight tabular-nums my-1">
              {formatarBRL(fundoTrocoInicial)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Abertura de gaveta</span>
          </div>

          {/* Card 2: Recebimentos PIX / Cartão */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Recebimentos PIX / Cartão
              </span>
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center">
                <QrCode size={14} />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-sky-400 tracking-tight tabular-nums my-1">
              {formatarBRL(recebimentosPixCartao)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">PIX + Débito + Crédito</span>
          </div>

          {/* Card 3: Dinheiro em Espécie */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Dinheiro em Espécie
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <Banknote size={14} />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 tracking-tight tabular-nums my-1">
              {formatarBRL(dinheiroEspecie)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Entradas em notas/moedas</span>
          </div>

          {/* Card 4: Sangrias / Saídas */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Sangrias / Saídas
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                <ArrowUpCircle size={14} />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-rose-400 tracking-tight tabular-nums my-1">
              {formatarBRL(sangriasSaidas)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Retiradas para cofre</span>
          </div>

          {/* Card 5: Saldo Líquido em Gaveta (Destaque Esmeralda) */}
          <div className="bg-slate-900/90 border border-emerald-800/60 bg-emerald-950/10 rounded-2xl p-4 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                Saldo Líquido em Gaveta
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
                <TrendingUp size={14} />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-emerald-300 tracking-tight tabular-nums my-1">
              {formatarBRL(saldoGavetaAgora)}
            </div>
            <div className="flex items-center justify-between text-[10px] text-emerald-400/80 font-medium">
              <span>Fundo + Dinheiro - Sangrias</span>
              <span className="flex items-center gap-1 font-semibold text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
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
          modalExternoAberto={!!modalMov || modalFechamento || !!comprovante || modalContaCorrente || modalTroca || !!despachanteParaLiquidar}
          onVendaRegistrada={handleVendaRegistrada}
        />

        {/* =====================================================================
         *  SEÇÃO CONTA-CORRENTE DE DESPACHANTES (FATURAMENTO A PRAZO / QUITAÇÃO)
         * ===================================================================== */}
        <div className="mb-8 mt-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                <Building2 size={16} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Conta-Corrente de Despachantes • Parceiros B2B</h3>
                <p className="text-xs text-slate-400">Controle de faturamento a prazo e quitação direta no PDV</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setModalContaCorrente(true)}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <FileText size={14} />
              <span>Gerenciar Contas-Correntes</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {despachantesLista.length === 0 ? (
              <div className="col-span-3 p-8 bg-slate-900/60 border border-slate-800 rounded-2xl text-center text-slate-400 text-xs">
                Nenhum despachante cadastrado no sistema.
              </div>
            ) : (
              despachantesLista.slice(0, 6).map((desp) => {
                const saldoDev = Number(desp.saldo_devedor) || 0;
                const temSaldo = saldoDev > 0;

                return (
                  <div
                    key={desp.id}
                    className="bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/40 rounded-2xl p-4 shadow-xl flex flex-col justify-between transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h4 className="font-bold text-white text-sm line-clamp-1" title={desp.nome}>
                            {desp.nome}
                          </h4>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {desp.cnpj || desp.crdd ? (desp.cnpj ? `CNPJ: ${desp.cnpj}` : `CRDD: ${desp.crdd}`) : 'Documento N/I'}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 shrink-0">
                          CONTA ATIVA
                        </span>
                      </div>

                      <div className="my-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                        <span className="text-xs text-slate-400">Saldo Devedor:</span>
                        <span className={`text-base font-bold font-mono ${temSaldo ? 'text-indigo-300' : 'text-slate-400'}`}>
                          {formatarBRL(saldoDev)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => setModalContaCorrente(true)}
                        className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-semibold transition-all cursor-pointer text-center"
                      >
                        Lançar a Prazo
                      </button>

                      <button
                        type="button"
                        disabled={!temSaldo || bloqueado}
                        onClick={() => handleAbrirLiquidacaoDespachante(desp)}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-1 ${
                          temSaldo && !bloqueado
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40'
                            : 'bg-slate-800/60 text-slate-500 border border-slate-800 cursor-not-allowed opacity-50'
                        }`}
                        title={temSaldo ? 'Quitar fatura deste despachante' : 'Sem faturas em aberto'}
                      >
                        <CheckCircle2 size={13} />
                        <span>Quitar Fatura</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

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
                  const servico =
                    t.servico_operacao ||
                    (t.tipo === 'venda'
                      ? partes[0] || 'Venda de Balcão'
                      : t.tipo === 'faturamento_despachante'
                      ? 'Lançamento a Prazo Despachante'
                      : t.tipo === 'sangria'
                      ? 'Sangria de Gaveta'
                      : ehLiquidacaoFatura(t)
                      ? 'Liquidação de Fatura de Despachante'
                      : 'Suprimento de Troco');

                  const cliente =
                    t.tomador_cliente ||
                    (t.tipo === 'venda' ? partes[1] || 'Consumidor' : t.descricao || '-');

                  const idTransacao =
                    t.id_transacao ||
                    t.protocolo_recibo ||
                    t.numero_recibo ||
                    (t.id ? `#${t.id.slice(0, 8).toUpperCase()}` : '#REC');

                  const horarioFormatado =
                    t.horario ||
                    (t.criado_em || t.created_at
                      ? (() => {
                          try {
                            const d = new Date(t.criado_em || t.created_at!);
                            return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                          } catch {
                            return '--:--';
                          }
                        })()
                      : '--:--');

                  const formaLowerStr = (t.forma_pagamento || '').toLowerCase();
                  const isPrazo =
                    formaLowerStr.includes('prazo') ||
                    formaLowerStr.includes('faturad') ||
                    t.tipo === 'faturamento_despachante';
                  const isDinheiro = formaLowerStr.includes('dinheiro');
                  const isPix = formaLowerStr.includes('pix');
                  const isDebito = formaLowerStr.includes('debito') || formaLowerStr.includes('débito');
                  const isCredito = formaLowerStr.includes('credito') || formaLowerStr.includes('crédito');

                  const rotuloForma = isPrazo
                    ? 'Faturado a Prazo (B2B)'
                    : isPix
                    ? 'PIX'
                    : isDebito
                    ? 'Cartão Débito'
                    : isCredito
                    ? 'Cartão Crédito'
                    : isDinheiro
                    ? 'Dinheiro'
                    : ROTULO_FORMA[t.forma_pagamento] || t.forma_pagamento;

                  const isAReceber =
                    t.status === 'a_receber' ||
                    t.status === 'aguardando_liquidacao' ||
                    (isPrazo && t.status !== 'liquidado');

                  const saida = t.tipo === 'sangria';

                  return (
                    <tr key={t.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 text-slate-400 font-mono">
                        {horarioFormatado}
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-300">
                        {idTransacao}
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
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border font-mono ${
                          isPrazo
                            ? 'bg-indigo-950/60 text-indigo-300 border-indigo-700/60'
                            : isPix
                            ? 'bg-cyan-950/60 text-cyan-300 border-cyan-700/60'
                            : isDinheiro
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                            : isDebito
                            ? 'bg-blue-950/60 text-blue-300 border-blue-700/60'
                            : isCredito
                            ? 'bg-purple-950/60 text-purple-300 border-purple-700/60'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          {rotuloForma}
                        </span>
                      </td>
                      <td className={`p-3 text-right font-mono font-semibold tracking-tight tabular-nums ${saida ? 'text-rose-400' : isAReceber ? 'text-indigo-400' : 'text-emerald-400'}`}>
                        {saida ? '- ' : ''}{formatarBRL(Number(t.valor))}
                      </td>
                      <td className="p-3 text-center">
                        {isAReceber ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-950/50 px-2.5 py-0.5 rounded-full border border-amber-800/60 font-mono">
                            <Clock size={11} /> A Receber
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-800/60 font-mono">
                            <CheckCircle2 size={11} /> Liquidado
                          </span>
                        )}
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
              Total Faturado no Turno: <span className="text-emerald-400 font-semibold">{formatarBRL(faturamentoBruto)}</span>
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

      {/* MODAL DE QUITAÇÃO DIRETA DE FATURA DO DESPACHANTE */}
      {despachanteParaLiquidar && caixa && (() => {
        const faturaDoDespachante: FaturaDespachantePendente = faturasPendentes.find(f => f.despachanteId === despachanteParaLiquidar.id) || {
          id: `fat-sintetica-${despachanteParaLiquidar.id}`,
          numeroRecibo: `#FT-${despachanteParaLiquidar.id.slice(0, 6).toUpperCase()}`,
          dataHora: new Date().toISOString(),
          despachanteId: despachanteParaLiquidar.id,
          despachanteNome: despachanteParaLiquidar.nome_razao,
          despachanteDocumento: despachanteParaLiquidar.documento || '',
          resumoServicos: 'Saldo devedor consolidado em conta-corrente',
          valorTotal: Number(despachanteParaLiquidar.saldo_devedor) || 0,
          valorBruto: Number(despachanteParaLiquidar.saldo_devedor) || 0,
          valorIssqn: Math.round((Number(despachanteParaLiquidar.saldo_devedor) || 0) * 2) / 100,
          caixaId: caixa.id,
        };

        return (
          <ModalLiquidacaoFatura
            fatura={faturaDoDespachante}
            despachante={despachanteParaLiquidar}
            caixaId={caixa.id}
            operadorNome={operadorNome}
            operadorId={operadorId}
            onClose={() => setDespachanteParaLiquidar(null)}
            onConcluido={() => {
              setDespachanteParaLiquidar(null);
              handleFaturaLiquidada();
            }}
          />
        );
      })()}

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
