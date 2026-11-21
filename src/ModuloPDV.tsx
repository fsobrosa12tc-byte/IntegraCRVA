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
  Clock,
  Settings
} from 'lucide-react';
import { canSwitchModules, UserRole } from './types/auth';
import type { CaixaDiario, Despachante, FormaPagamento, MovimentacaoCaixa } from './types/pdv';
import {
  calcularSaldoEsperado,
  deCentavos,
  ehLiquidacaoFatura,
  ehSuprimentoRealGaveta,
  formatarBRL,
  formatarMoeda,
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
import ParceirosB2BSection from './components/pdv/ParceirosB2BSection';
import ModalLiquidacaoFatura from './components/pdv/ModalLiquidacaoFatura';
import ConfiguracoesImpressaoModal from './components/pdv/ConfiguracoesImpressaoModal';
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
  const [modalConfigImpressao, setModalConfigImpressao] = useState(false);
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
        listarMovimentacoes(caixa.id).then(setMovs).catch(() => { });
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
            listarMovimentacoes(caixa.id).then(setMovs).catch(() => { });
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

  const normalizarFormaPagamento = (forma?: string | null): 'PIX' | 'DEBITO' | 'CREDITO' | 'DINHEIRO' | 'PRAZO' | 'OUTRO' => {
    if (!forma) return 'OUTRO';
    const limpo = forma
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();

    if (limpo.includes('PIX')) return 'PIX';
    if (limpo.includes('DEBITO')) return 'DEBITO';
    if (limpo.includes('CREDITO')) return 'CREDITO';
    if (limpo.includes('DINHEIRO') || limpo.includes('ESPECIE')) return 'DINHEIRO';
    if (limpo.includes('PRAZO') || limpo.includes('FATURAD')) return 'PRAZO';
    return 'OUTRO';
  };

  const pertenceAoTurno = (m: MovimentacaoCaixa) => {
    return !m.caixa_id || (caixa && m.caixa_id === caixa.id);
  };

  /**
   * REGIME DE CAIXA EFETIVADO (100% REAL - ZERO MOCKS):
   * Apenas transações financeiras efetivamente recebidas/quitadas entram nos KPIs de receita.
   * Lançamentos a prazo na conta-corrente de despachantes (status: 'PENDENTE' / 'A_PRAZO' / 'a_receber')
   * NÃO entram no Faturamento Total nem nos meios de pagamento até o momento da quitação no PDV.
   */
  const ehTransacaoLiquidadaEfetivada = (m: MovimentacaoCaixa): boolean => {
    if (!pertenceAoTurno(m)) return false;

    // Sangrias, suprimentos de troco e lançamentos a prazo em aberto nunca são recebimentos
    if (m.tipo === 'sangria' || ehSuprimentoRealGaveta(m) || m.tipo === 'faturamento_despachante') {
      return false;
    }

    const forma = normalizarFormaPagamento(m.forma_pagamento);
    // Lançamento faturado a prazo em aberto: expressamente fora do regime de caixa
    if (forma === 'PRAZO') {
      return false;
    }

    // Validação estrita de status
    const statusNorm = (m.status || '').toUpperCase().trim();
    if (
      statusNorm === 'A_RECEBER' ||
      statusNorm === 'PENDENTE' ||
      statusNorm === 'A_PRAZO' ||
      statusNorm === 'ABERTO' ||
      statusNorm === 'ABERTA' ||
      statusNorm === 'CANCELADO' ||
      statusNorm === 'CANCELADA'
    ) {
      return false;
    }

    // Se é quitação de fatura ou status liquidado/quitado/pago
    if (
      ehLiquidacaoFatura(m) ||
      m.tipo === 'liquidacao_fatura' ||
      statusNorm === 'QUITADA' ||
      statusNorm === 'QUITADO' ||
      statusNorm === 'LIQUIDADO' ||
      statusNorm === 'LIQUIDADA' ||
      statusNorm === 'PAGO' ||
      statusNorm === 'PAGA' ||
      statusNorm === 'CONCLUIDO' ||
      statusNorm === 'CONCLUIDA'
    ) {
      return true;
    }

    // Vendas diretas de balcão quitadas no ato (PIX, DEBITO, CREDITO ou DINHEIRO)
    if (m.tipo === 'venda' && (forma === 'PIX' || forma === 'DEBITO' || forma === 'CREDITO' || forma === 'DINHEIRO')) {
      return true;
    }

    return false;
  };

  // KPI 2 — Recebimentos PIX: Quitações efetivadas via 'PIX'
  const totalPixCent = temCaixaAtivo
    ? movs
      .filter(m => ehTransacaoLiquidadaEfetivada(m) && normalizarFormaPagamento(m.forma_pagamento) === 'PIX')
      .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
    : 0;
  const totalPix = deCentavos(totalPixCent);

  // KPI 3 — Cartão de Débito: Quitações efetivadas via 'DEBITO'
  const totalDebitoCent = temCaixaAtivo
    ? movs
      .filter(m => ehTransacaoLiquidadaEfetivada(m) && normalizarFormaPagamento(m.forma_pagamento) === 'DEBITO')
      .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
    : 0;
  const totalDebito = deCentavos(totalDebitoCent);

  // KPI 4 — Cartão de Crédito: Quitações efetivadas via 'CREDITO'
  const totalCreditoCent = temCaixaAtivo
    ? movs
      .filter(m => ehTransacaoLiquidadaEfetivada(m) && normalizarFormaPagamento(m.forma_pagamento) === 'CREDITO')
      .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
    : 0;
  const totalCredito = deCentavos(totalCreditoCent);

  // KPI 5 — Dinheiro em Espécie: Quitações efetivadas via 'DINHEIRO' (sem suprimentos/sangrias)
  const totalDinheiroCent = temCaixaAtivo
    ? movs
      .filter(
        m =>
          ehTransacaoLiquidadaEfetivada(m) &&
          normalizarFormaPagamento(m.forma_pagamento) === 'DINHEIRO'
      )
      .reduce((acc, m) => acc + paraCentavos(Number((m as any).valor_total || m.valor || 0)), 0)
    : 0;
  const totalDinheiro = deCentavos(totalDinheiroCent);
  const dinheiroEspecie = totalDinheiro;
  const entradasLiquidasEspecieTurno = totalDinheiro;

  // KPI 1 — Faturamento Total (Recebido): Soma exata dos 4 meios de pagamento efetivados
  // Faturamento Total = Recebimentos PIX + Cartão de Débito + Cartão de Crédito + Dinheiro em Espécie
  const faturamentoTotalRecebidoCent =
    totalPixCent + totalDebitoCent + totalCreditoCent + totalDinheiroCent;
  const faturamentoTotalRecebido = deCentavos(faturamentoTotalRecebidoCent);

  // KPI 6 — Sangrias / Saídas: Soma real das retiradas/sangrias do turno atual
  const sangriasSaidasCent = temCaixaAtivo
    ? movs
      .filter(m => pertenceAoTurno(m) && m.tipo === 'sangria')
      .reduce((acc, m) => acc + paraCentavos(Number(m.valor || 0)), 0)
    : 0;
  const sangriasSaidas = deCentavos(sangriasSaidasCent);

  // Fundo de Troco e Saldo em Gaveta preservados no escopo interno (para TrocaOperadorModal e fechamento)
  const fundoTrocoInicial = caixa ? Number(caixa.valor_abertura) || 0 : 0;
  const saldoGavetaCalculadoCent = paraCentavos(fundoTrocoInicial) + totalDinheiroCent - sangriasSaidasCent;
  const saldoGavetaAgora = deCentavos(saldoGavetaCalculadoCent);

  // KPIs consolidados com valores padrão garantidos (0) contra undefined/NaN
  const kpisTurno = {
    faturamentoTotal: Number(faturamentoTotalRecebido) || 0,
    pix: Number(totalPix) || 0,
    debito: Number(totalDebito) || 0,
    credito: Number(totalCredito) || 0,
    dinheiro: Number(dinheiroEspecie) || 0,
    sangrias: Number(sangriasSaidas) || 0,
  };

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
          normalizarFormaPagamento(m.forma_pagamento) === 'PRAZO' ||
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
      listarMovimentacoes(caixa.id).then(setMovs).catch(() => { });
    }
    carregarDadosDoDia();
  };

  const handleFaturaLiquidada = useCallback(() => {
    carregarFaturasPendentes();
    carregarDespachantes();
    carregarDadosDoDia();
    if (caixa?.id) {
      listarMovimentacoes(caixa.id).then(setMovs).catch(() => { });
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

          {/* Configurações de Impressão */}
          <button
            type="button"
            id="btn-configuracoes-impressao"
            onClick={() => setModalConfigImpressao(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-all text-xs font-semibold cursor-pointer"
            title="Configurações de Impressão do Terminal (80mm, 58mm ou A4)"
          >
            <Settings size={14} className="text-slate-400" />
            <span className="hidden sm:inline">Configurações</span>
          </button>

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
         *  FAIXA DE KPIS FINANCEIROS DO TURNO (6 CARDS REAIS - REGIME DE CAIXA EFETIVADO)
         * ===================================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-6">
          {/* Card 1: Faturamento Total (Recebido) - Destaque Verde Esmeralda */}
          <div className="bg-slate-900/90 border border-emerald-800/60 bg-emerald-950/15 rounded-xl p-3.5 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] xl:text-[11px] font-bold text-emerald-300 uppercase tracking-wider truncate">
                FATURAMENTO TOTAL (RECEBIDO)
              </span>
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0">
                <TrendingUp size={13} />
              </div>
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400 tracking-tight tabular-nums my-0.5">
              {formatarMoeda(kpisTurno.faturamentoTotal)}
            </div>
            <div className="flex items-center justify-between text-[10px] text-emerald-400/80 font-medium truncate">
              <span>PIX + Débito + Crédito + Espécie</span>
              <span className="flex items-center gap-1 font-semibold text-emerald-300 shrink-0 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Quitado
              </span>
            </div>
          </div>

          {/* Card 2: Recebimentos PIX */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                RECEBIMENTOS PIX
              </span>
              <div className="w-6 h-6 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
                <QrCode size={13} />
              </div>
            </div>
            <div className="text-base sm:text-lg xl:text-xl font-bold font-mono text-sky-400 tracking-tight tabular-nums my-0.5">
              {formatarMoeda(kpisTurno.pix)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Instantâneo PIX</span>
          </div>

          {/* Card 3: Cartão de Débito */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                CARTÃO DE DÉBITO
              </span>
              <div className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
                <CreditCard size={13} />
              </div>
            </div>
            <div className="text-base sm:text-lg xl:text-xl font-bold font-mono text-blue-400 tracking-tight tabular-nums my-0.5">
              {formatarMoeda(kpisTurno.debito)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Cartão de Débito</span>
          </div>

          {/* Card 4: Cartão de Crédito */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                CARTÃO DE CRÉDITO
              </span>
              <div className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0">
                <CreditCard size={13} />
              </div>
            </div>
            <div className="text-base sm:text-lg xl:text-xl font-bold font-mono text-purple-300 tracking-tight tabular-nums my-0.5">
              {formatarMoeda(kpisTurno.credito)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Cartão de Crédito</span>
          </div>

          {/* Card 5: Dinheiro em Espécie */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                DINHEIRO EM ESPÉCIE
              </span>
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Banknote size={13} />
              </div>
            </div>
            <div className="text-base sm:text-lg xl:text-xl font-bold font-mono text-emerald-400 tracking-tight tabular-nums my-0.5">
              {formatarMoeda(kpisTurno.dinheiro)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Entradas em notas/moedas</span>
          </div>

          {/* Card 6: Sangrias / Saídas */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                SANGRIAS / SAÍDAS
              </span>
              <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
                <ArrowUpCircle size={13} />
              </div>
            </div>
            <div className="text-base sm:text-lg xl:text-xl font-bold font-mono text-rose-400 tracking-tight tabular-nums my-0.5">
              {formatarMoeda(kpisTurno.sangrias)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Retiradas para cofre</span>
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
         *  SEÇÃO CONTA-CORRENTE DE DESPACHANTES • PARCEIROS B2B (CARDS SUPERIORES)
         * ===================================================================== */}
        <ParceirosB2BSection
          despachantes={despachantesLista}
          faturasPendentes={faturasPendentes}
          bloqueado={bloqueado}
          onLancarPrazo={(desp) => {
            setModalContaCorrente(true);
          }}
          onQuitarFatura={handleAbrirLiquidacaoDespachante}
          onAtualizarDespachantes={() => {
            carregarDespachantes();
            carregarFaturasPendentes();
          }}
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
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border font-mono ${isPrazo
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
      <ConfiguracoesImpressaoModal
        isOpen={modalConfigImpressao}
        onClose={() => setModalConfigImpressao(false)}
      />
    </div>
  );
}
