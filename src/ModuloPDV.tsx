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
  abrirCaixa,
  buscarCaixaAberto,
  calcularSaldoEsperado,
  fecharCaixa,
  formatarBRL,
  listarMovimentacoes,
  obterOperadorId,
  registrarMovimentacao,
  type ResultadoFechamento
} from './lib/pdvCaixa';
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
  faturamento: 'FATURAMENTO B2B'
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

  // ---- Ciclo de vida do caixa (RF001 / RF004) ----
  const [carregando, setCarregando] = useState(true);
  const [operadorId, setOperadorId] = useState<string | null>(null);
  const [caixa, setCaixa] = useState<CaixaDiario | null>(null);
  const [erroCaixa, setErroCaixa] = useState('');
  const [movs, setMovs] = useState<MovimentacaoCaixa[]>([]);
  const [modalMov, setModalMov] = useState<'suprimento' | 'sangria' | null>(null);
  const [modalFechamento, setModalFechamento] = useState(false);
  const [comprovante, setComprovante] = useState<ResultadoFechamento | null>(null);

  // ---- Troca Rápida de Operador (sem fechar o caixa) ----
  const [modalTroca, setModalTroca] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // O usuário inicial define a consulta de caixa no carregamento; trocas posteriores não recarregam a tela
  const usuarioInicialRef = useRef(usuario);

  // ---- Seção Conta-Corrente Despachantes (B2B) ----
  const [modalContaCorrente, setModalContaCorrente] = useState(false);
  const [despachantesLista, setDespachantesLista] = useState<Despachante[]>([]);

  const carregarDespachantes = useCallback(async () => {
    try {
      const lista = await buscarDespachantes();
      setDespachantesLista(lista);
    } catch (e) {
      console.warn('Erro ao carregar lista de despachantes:', e);
    }
  }, []);

  const carregarEstado = useCallback(async () => {
    setCarregando(true);
    setErroCaixa('');
    try {
      const uid = await obterOperadorId(usuarioInicialRef.current);
      setOperadorId(uid);
      if (!uid) {
        setCaixa(null);
        setErroCaixa('Sessão Supabase não encontrada. Caso deseje, clique em "Encerrar Sessão / Sair" e faça login novamente.');
        return;
      }
      const aberto = await buscarCaixaAberto(uid);
      setCaixa(aberto);
      setMovs(aberto ? await listarMovimentacoes(aberto.id) : []);
    } catch (err: any) {
      setCaixa(null);
      setErroCaixa(err.message || 'Falha ao consultar o caixa.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarEstado();
    carregarDespachantes();
  }, [carregarEstado, carregarDespachantes]);

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
    if (!operadorId) throw new Error('Operador não identificado.');
    const novo = await abrirCaixa(operadorId, valor);
    setCaixa(novo);
    setMovs([]);
    setErroCaixa('');
    setModoSupervisao(false);
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
  };

  const handleFechar = async (valorInformado: number) => {
    if (!caixa) return;
    const res = await fecharCaixa(caixa, valorInformado);
    setModalFechamento(false);
    setComprovante(res);
  };

  const handleConcluirFechamento = () => {
    setComprovante(null);
    setCaixa(null);
    setMovs([]);
  };

  const vendas = movs.filter(m => m.tipo === 'venda');
  const totalArrecadado = vendas.reduce((acc, t) => acc + Number(t.valor), 0);
  const totalPix = vendas.filter(t => t.forma_pagamento === 'pix').reduce((acc, t) => acc + Number(t.valor), 0);
  const totalCartao = vendas.filter(t => t.forma_pagamento.startsWith('cartao')).reduce((acc, t) => acc + Number(t.valor), 0);
  const totalFaturado = vendas.filter(t => t.forma_pagamento === 'faturamento').reduce((acc, t) => acc + Number(t.valor), 0);
  const totalDinheiroVendas = vendas.filter(t => t.forma_pagamento === 'dinheiro').reduce((acc, t) => acc + Number(t.valor), 0);

  // Total devedor geral dos despachantes
  const totalDevedorGeral = despachantesLista.reduce((acc, d) => acc + (Number(d.saldo_devedor) || 0), 0);

  const handleVendaRegistrada = useCallback((mov: MovimentacaoCaixa) => {
    setMovs(prev => [mov, ...prev]);
    carregarDespachantes();
  }, [carregarDespachantes]);

  const handleDespachanteAtualizado = (dAtualizado: Despachante) => {
    setDespachantesLista(prev => prev.map(d => d.id === dAtualizado.id ? dAtualizado : d));
    // Recarrega movimentações do caixa caso tenha havido entrada em dinheiro
    if (caixa) {
      listarMovimentacoes(caixa.id).then(setMovs).catch(() => {});
    }
  };

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
                  Frente de Caixa & B2B
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
            className="px-4 py-2.5 bg-slate-900/90 hover:bg-slate-800 border border-emerald-500/40 text-emerald-400 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-md shadow-slate-950/50 disabled:opacity-40"
          >
            <ArrowDownCircle size={16} /> Suprimento (Entrada em Dinheiro)
          </button>

          <button
            type="button"
            id="btn-sangria"
            disabled={bloqueado}
            onClick={() => setModalMov('sangria')}
            className="px-4 py-2.5 bg-slate-900/90 hover:bg-slate-800 border border-rose-500/40 text-rose-400 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-md shadow-slate-950/50 disabled:opacity-40"
          >
            <ArrowUpCircle size={16} /> Sangria (Retirada / Cofre)
          </button>

          {/* NOVO: Ação de Conta-Corrente de Despachantes */}
          <button
            type="button"
            id="btn-conta-corrente-despachantes"
            onClick={() => setModalContaCorrente(true)}
            className="px-4 py-2.5 bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-500/40 text-indigo-300 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-md shadow-indigo-950/40"
          >
            <Building2 size={16} className="text-indigo-400" />
            <span>Conta-Corrente Despachantes</span>
            {totalDevedorGeral > 0 && (
              <span className="ml-1 px-2 py-0.2 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono">
                {formatarBRL(totalDevedorGeral)}
              </span>
            )}
          </button>

          {podeAcessarDashboard && (
            <button
              type="button"
              id="btn-abrir-dashboard-pdv"
              onClick={() => setExibindoDashboard(true)}
              className="px-4 py-2.5 bg-purple-950/50 hover:bg-purple-900/60 border border-purple-500/40 text-purple-300 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-md shadow-purple-950/40"
            >
              <BarChart3 size={16} className="text-purple-400" />
              <span>Dashboard Realtime</span>
            </button>
          )}

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

        {/* CARDS E INDICADORES ESTRATÉGICOS DO TURNO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Faturamento Bruto Hoje</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <DollarSign size={18} />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-white tracking-tight tabular-nums">
              {formatarBRL(totalArrecadado)}
            </div>
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 mt-1 font-mono">
              <TrendingUp size={12} /> Caixa Aberto e Operacional
            </span>
          </div>

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Recebimentos via PIX</span>
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <QrCode size={18} />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-white tracking-tight tabular-nums">
              {formatarBRL(totalPix)}
            </div>
            <span className="text-[11px] text-slate-400 font-semibold mt-1 block">
              Liquidação eletrônica instantânea
            </span>
          </div>

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Cartões (Débito/Crédito)</span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <CreditCard size={18} />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-white tracking-tight tabular-nums">
              {formatarBRL(totalCartao)}
            </div>
            <span className="text-[11px] text-slate-400 font-semibold mt-1 block">
              Terminal TEF Integrado
            </span>
          </div>

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Faturamento B2B a Prazo</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Building2 size={18} />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-indigo-300 tracking-tight tabular-nums">
              {formatarBRL(totalFaturado)}
            </div>
            <span className="text-[11px] text-indigo-400 font-semibold mt-1 block">
              Lançado na conta dos despachantes
            </span>
          </div>
        </div>

        {/* FRENTE DE CAIXA ÁGIL (RF002 / RF003) */}
        <FrenteCaixa
          caixa={caixa}
          operadorNome={operadorNome}
          operadorId={operadorId}
          bloqueado={bloqueado}
          modalExternoAberto={!!modalMov || modalFechamento || !!comprovante || modalContaCorrente || modalTroca}
          onVendaRegistrada={handleVendaRegistrada}
        />

        {/* TABELA DE MOVIMENTAÇÕES DO TURNO */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Receipt size={20} className="text-emerald-400" />
              <h3 className="font-bold text-white text-base">Movimentações Auditadas do Caixa</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Terminal Conectado · {movs.length} registros
            </span>
          </div>

          <div className="overflow-x-auto flex-1">
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
                            : t.tipo === 'liquidacao_fatura'
                            ? 'Liquidação de Fatura B2B'
                            : 'Suprimento de Troco',
                          t.descricao || '-'
                        ];
                  const saida = t.tipo === 'sangria';
                  return (
                    <tr key={t.id} className="hover:bg-slate-850/60 transition-colors">
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
                      <td className={`p-3 text-right font-mono font-black tabular-nums ${saida ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {saida ? '- ' : ''}{formatarBRL(Number(t.valor))}
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-800/60">
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
            <span className="font-bold text-white">
              Total Faturado no Turno: {formatarBRL(totalArrecadado)}
              {totalFaturado > 0 && (
                <span className="ml-3 text-indigo-400 font-semibold">
                  (Faturado B2B: {formatarBRL(totalFaturado)} — a receber)
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
