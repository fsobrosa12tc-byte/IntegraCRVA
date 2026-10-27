import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Minus, Trash2, Banknote, QrCode, CreditCard, FileText, UserPlus, X,
  Printer, CheckCircle2, Loader2, AlertTriangle, Keyboard, Building2, ShoppingBasket,
  ArrowRight, ShieldCheck, Sparkles, Tag, ShoppingBag, Bell
} from 'lucide-react';
import type { CaixaDiario, Despachante, FormaPagamento, MovimentacaoCaixa, ComandaBalcao } from '../../types/pdv';
import { formatarBRL, paraCentavos, deCentavos, registrarMovimentacao, calcularISSQN } from '../../lib/pdvCaixa';
import {
  buscarDespachantes, buscarServicos, cadastrarDespachante, type ServicoCatalogo,
} from '../../lib/pdvVendas';
import {
  listarComandasAguardandoPagamento, liquidarComandaNoCaixa, inscreverComandasRealtime,
} from '../../lib/comandasBalcaoService';
import {
  mascararDocumento, mascararTelefone, somenteDigitos, validarDocumento,
} from '../../utils/documento';
import CupomFiscalModal from './CupomFiscal';
import PainelComandasPendentes from './PainelComandasPendentes';

interface ItemCarrinho {
  servico: ServicoCatalogo;
  qtd: number;
}

interface CupomDados {
  numero: string;
  data: string;
  operador: string;
  atendenteNome?: string | null;
  clienteNome?: string | null;
  clienteDocumento?: string | null;
  itens: ItemCarrinho[];
  subtotalServicos: number;
  valorIssqn: number;
  valorTotalCobrado: number;
  totalCent: number;
  forma: FormaPagamento;
  despachante: Despachante | null;
  saldoAposFatura: number | null;
}


const FORMAS: { id: FormaPagamento; label: string; icon: any; corAtiva: string; borderAtiva: string }[] = [
  { id: 'dinheiro', label: 'Dinheiro', icon: Banknote, corAtiva: 'bg-emerald-600 text-white', borderAtiva: 'border-emerald-500' },
  { id: 'pix', label: 'PIX Instantâneo', icon: QrCode, corAtiva: 'bg-sky-600 text-white', borderAtiva: 'border-sky-500' },
  { id: 'cartao_debito', label: 'Cartão Débito', icon: CreditCard, corAtiva: 'bg-blue-600 text-white', borderAtiva: 'border-blue-500' },
  { id: 'cartao_credito', label: 'Cartão Crédito', icon: CreditCard, corAtiva: 'bg-indigo-600 text-white', borderAtiva: 'border-indigo-500' },
  { id: 'faturamento', label: 'Faturamento B2B (A Prazo)', icon: FileText, corAtiva: 'bg-indigo-600 text-white', borderAtiva: 'border-indigo-500' },
];

const ROTULO: Record<string, string> = Object.fromEntries(FORMAS.map((f) => [f.id, f.label]));

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const nomeCurto = (nome: string) => nome.split(':')[0].trim();

const ehCampoTexto = (el: EventTarget | null) => {
  const t = (el as HTMLElement | null)?.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || t === 'BUTTON';
};

/* =========================================================================
 *  FRENTE DE CAIXA ÁGIL (RF002 / RF003) - DARK SLATE CORPORATIVO
 * ========================================================================= */

export default function FrenteCaixa({
  caixa,
  operadorNome,
  operadorId,
  bloqueado,
  modalExternoAberto,
  onVendaRegistrada,
}: {
  caixa: CaixaDiario | null;
  operadorNome: string;
  operadorId?: string | null;
  bloqueado: boolean;
  modalExternoAberto: boolean;
  onVendaRegistrada: (mov: MovimentacaoCaixa) => void;
}) {
  const [servicos, setServicos] = useState<ServicoCatalogo[]>([]);
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [forma, setForma] = useState<FormaPagamento | null>(null);

  const [despachantes, setDespachantes] = useState<Despachante[]>([]);
  const [despBusca, setDespBusca] = useState('');
  const [despSel, setDespSel] = useState<Despachante | null>(null);
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [idxSug, setIdxSug] = useState(0);
  const [modalNovoDesp, setModalNovoDesp] = useState(false);

  const [cupom, setCupom] = useState<CupomDados | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [erro, setErro] = useState('');

  // Comandas do Balcão CRVA (Fila de Atendimento Integrada)
  const [comandasAguardando, setComandasAguardando] = useState<ComandaBalcao[]>([]);
  const [comandaAtiva, setComandaAtiva] = useState<ComandaBalcao | null>(null);
  const [carregandoComandas, setCarregandoComandas] = useState(false);

  const buscaRef = useRef<HTMLInputElement>(null);
  const despRef = useRef<HTMLInputElement>(null);

  const carregarComandas = useCallback(async () => {
    try {
      setCarregandoComandas(true);
      const lista = await listarComandasAguardandoPagamento();
      setComandasAguardando(lista);
    } catch (e) {
      console.warn('Falha ao listar comandas aguardando pagamento:', e);
    } finally {
      setCarregandoComandas(false);
    }
  }, []);

  useEffect(() => {
    buscarServicos().then(setServicos);
    buscarDespachantes().then(setDespachantes).catch(() => setDespachantes([]));
    carregarComandas();

    // Inscrição reativa Supabase Realtime para a tabela comandas_balcao
    const cancelarRealtime = inscreverComandasRealtime(() => {
      carregarComandas();
    });

    return () => {
      cancelarRealtime();
    };
  }, [carregarComandas]);

  /* ----------------------------- Derivados ------------------------------ */

  const servicosFiltrados = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return servicos;
    return servicos.filter((s) => norm(s.nome).includes(q) || norm(s.codigo).includes(q));
  }, [servicos, busca]);

  const despFiltrados = useMemo(() => {
    const q = norm(despBusca.trim());
    const dig = somenteDigitos(despBusca);
    if (!q) return despachantes.slice(0, 6);
    return despachantes
      .filter((d) => norm(d.nome_razao).includes(q) || (dig.length > 0 && somenteDigitos(d.documento).includes(dig)))
      .slice(0, 6);
  }, [despachantes, despBusca]);

  // 1. Subtotal dos Serviços:
  const subtotalServicos = useMemo(() => {
    return itens.reduce((acc, i) => acc + (i.servico.valor * i.qtd), 0);
  }, [itens]);
  const subtotalCent = Math.round(subtotalServicos * 100);

  // 2. Cálculo do ISSQN (2,00%):
  const valorIssqn = useMemo(() => {
    return Math.round((subtotalServicos * 0.02) * 100) / 100;
  }, [subtotalServicos]);

  // 3. Total Final Obrigatório (COM O ISSQN SOMADO):
  const valorTotalCobrado = useMemo(() => {
    return Math.round((subtotalServicos + valorIssqn) * 100) / 100;
  }, [subtotalServicos, valorIssqn]);
  const totalCent = Math.round(valorTotalCobrado * 100);

  const totalItens = itens.reduce((acc, i) => acc + i.qtd, 0);

  /* ------------------------------ Carrinho ------------------------------ */

  const adicionar = (s: ServicoCatalogo) => {
    setErro('');
    setItens((prev) => {
      const ex = prev.find((i) => i.servico.id === s.id);
      if (ex) return prev.map((i) => (i.servico.id === s.id ? { ...i, qtd: i.qtd + 1 } : i));
      return [...prev, { servico: s, qtd: 1 }];
    });
  };

  const alterarQtd = (id: string, delta: number) =>
    setItens((prev) =>
      prev
        .map((i) => (i.servico.id === id ? { ...i, qtd: i.qtd + delta } : i))
        .filter((i) => i.qtd > 0)
    );

  const definirQtd = (id: string, qtd: number) =>
    setItens((prev) =>
      prev.map((i) => (i.servico.id === id ? { ...i, qtd: Math.max(1, Math.min(999, qtd || 1)) } : i))
    );

  const remover = (id: string) => setItens((prev) => prev.filter((i) => i.servico.id !== id));

  const limparComanda = useCallback(() => {
    setItens([]);
    setForma(null);
    setDespSel(null);
    setDespBusca('');
    setBusca('');
    setErro('');
    setComandaAtiva(null);
  }, []);

  const handleCarregarComanda = useCallback((comanda: ComandaBalcao) => {
    setErro('');
    setComandaAtiva(comanda);

    // Mapeia os itens da comanda para os itens do carrinho do PDV
    const itensMapeados: ItemCarrinho[] = comanda.itens.map((it) => {
      const match = servicos.find(
        (s) => s.codigo === it.codigo || norm(s.nome) === norm(it.servico)
      );

      const servico: ServicoCatalogo = match || {
        id: `comanda-srv-${it.codigo}`,
        codigo: it.codigo,
        nome: it.servico,
        valor: it.valor_unitario,
      };

      return {
        servico,
        qtd: it.quantidade,
      };
    });

    setItens(itensMapeados);

    // Se o documento pertencer a algum despachante cadastrado, seleciona automaticamente
    if (comanda.cliente_documento) {
      const dig = somenteDigitos(comanda.cliente_documento);
      const achado = despachantes.find((d) => somenteDigitos(d.documento) === dig);
      if (achado) {
        setDespSel(achado);
      }
    }
  }, [servicos, despachantes]);

  /* ----------------------------- Pagamento ------------------------------ */

  const selecionarForma = (f: FormaPagamento) => {
    if (f === 'faturamento' && !despSel) {
      setErro('Faturamento A Prazo exige um Despachante vinculado à venda.');
      despRef.current?.focus();
      return;
    }
    setErro('');
    setForma(f);
  };

  const selecionarDespachante = (d: Despachante) => {
    setDespSel(d);
    setDespBusca('');
    setSugestoesAbertas(false);
    setErro('');
  };

  const limparDespachante = () => {
    setDespSel(null);
    if (forma === 'faturamento') setForma(null);
  };

  /* ----------------------------- Finalização ---------------------------- */

  const finalizar = useCallback(async () => {
    if (finalizando || !caixa) return;
    if (itens.length === 0) return setErro('Adicione ao menos um serviço à comanda.');
    if (!forma) return setErro('Selecione o meio de pagamento (F4).');
    if (forma === 'faturamento' && !despSel)
      return setErro('Faturamento A Prazo exige um Despachante vinculado à venda.');

    setFinalizando(true);
    setErro('');
    try {
      const resumo = itens.map((i) => `${i.qtd}x ${nomeCurto(i.servico.nome)}`).join('; ');
      const clienteDesc = comandaAtiva
        ? `${comandaAtiva.cliente_nome}${comandaAtiva.cliente_documento ? ` (${comandaAtiva.cliente_documento})` : ''}`
        : (despSel ? despSel.nome_razao : 'Consumidor');

      const mov = await registrarMovimentacao({
        caixa_id: caixa.id,
        tipo: 'venda',
        valor: valorTotalCobrado, // Total Cobrado com ISSQN somado que entra na gaveta ou no faturamento
        forma_pagamento: forma,
        descricao: `${resumo} | ${clienteDesc}`,
        despachante_id: forma === 'faturamento' ? despSel!.id : despSel?.id ?? null,
        operador_id: operadorId ?? null,
        operador_nome: operadorNome,
        valor_bruto: subtotalServicos, // Subtotal dos serviços
        aliquota_issqn: 2.00,
        valor_issqn: valorIssqn,
      });
      onVendaRegistrada(mov);

      // Se havia comanda de balcão vinculada, atualiza status para 'pago'
      if (comandaAtiva) {
        try {
          await liquidarComandaNoCaixa({
            comandaId: comandaAtiva.id,
            caixaId: caixa.id,
            operadorCaixaId: operadorId || null,
            formaPagamento: forma,
          });
          carregarComandas();
        } catch (e) {
          console.warn('Erro ao liquidar comanda vinculada:', e);
        }
      }

      let saldo: number | null = null;
      let atualizado = despSel;
      if (forma === 'faturamento' && despSel) {
        try {
          const lista = await buscarDespachantes();
          setDespachantes(lista);
          atualizado = lista.find((d) => d.id === despSel.id) ?? despSel;
          saldo = atualizado.saldo_devedor;
        } catch {
          // mantém
        }
      }

      setCupom({
        numero: mov.id.slice(0, 8).toUpperCase(),
        data: mov.criado_em,
        operador: operadorNome,
        atendenteNome: comandaAtiva?.atendente_nome || null,
        clienteNome: comandaAtiva?.cliente_nome || (despSel?.nome_razao ?? null),
        clienteDocumento: comandaAtiva?.cliente_documento || (despSel?.documento ?? null),
        itens,
        subtotalServicos,
        valorIssqn,
        valorTotalCobrado,
        totalCent,
        forma,
        despachante: atualizado,
        saldoAposFatura: saldo,
      });
      limparComanda();
    } catch (e: any) {
      setErro(e.message || 'Falha ao registrar a venda.');
    } finally {
      setFinalizando(false);
    }
  }, [
    finalizando,
    caixa,
    itens,
    forma,
    despSel,
    totalCent,
    operadorNome,
    operadorId,
    comandaAtiva,
    carregarComandas,
    onVendaRegistrada,
    limparComanda,
  ]);

  /* --------------------------- Teclas de atalho ------------------------- */

  const travado = bloqueado || modalExternoAberto || modalNovoDesp;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (cupom) {
        if ((e.key === 'Enter' || e.key === 'Escape') && !e.repeat) {
          e.preventDefault();
          setCupom(null);
          setTimeout(() => buscaRef.current?.focus(), 0);
        }
        return;
      }
      if (travado) return;

      if (e.key === 'F2') {
        e.preventDefault();
        buscaRef.current?.focus();
        buscaRef.current?.select();
      } else if (e.key === 'F3') {
        e.preventDefault();
        despRef.current?.focus();
        despRef.current?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setForma((prev) => {
          const idx = FORMAS.findIndex((f) => f.id === prev);
          const prox = FORMAS[(idx + 1) % FORMAS.length].id;
          if (prox === 'faturamento' && !despSel) return FORMAS[0].id;
          return prox;
        });
      } else if (e.key === 'F8') {
        e.preventDefault();
        limparComanda();
      } else if (e.key === 'F9') {
        e.preventDefault();
        setModalNovoDesp(true);
      } else if (e.key === 'Enter') {
        if (sugestoesAbertas && despFiltrados.length > 0) {
          e.preventDefault();
          selecionarDespachante(despFiltrados[idxSug] ?? despFiltrados[0]);
          return;
        }
        if (!ehCampoTexto(e.target) && itens.length > 0 && forma) {
          e.preventDefault();
          finalizar();
        }
      } else if (e.key === 'Escape') {
        if (sugestoesAbertas) {
          e.preventDefault();
          setSugestoesAbertas(false);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cupom, travado, sugestoesAbertas, despFiltrados, idxSug, itens.length, forma, despSel, finalizar, limparComanda]);

  return (
    <>
      {/* PAINEL DE COMANDAS PENDENTES DO BALCÃO CRVA (Fila Integrada com WebSocket Realtime) */}
      <PainelComandasPendentes
        comandas={comandasAguardando}
        comandaAtivaId={comandaAtiva?.id}
        bloqueado={bloqueado}
        carregando={carregandoComandas}
        onCarregarComanda={handleCarregarComanda}
        onAtualizar={carregarComandas}
      />

      {/* Grade Principal da Frente de Caixa */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6 text-slate-100">
        
        {/* ===================================================================
         *  PAINEL ESQUERDO: CATÁLOGO DE SERVIÇOS (7 COLUNAS)
         * =================================================================== */}
        <section className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl p-5 flex flex-col">
          {/* Cabeçalho do Catálogo */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <Tag size={17} className="text-emerald-400" />
                Catálogo de Serviços CRVA / Notariais
              </h2>
              <p className="text-xs text-slate-400">
                Pressione <strong>F2</strong> para buscar por nome ou código
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
              {servicosFiltrados.length} disponíveis
            </span>
          </div>

          {/* Campo de Busca Rápida de Serviços */}
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
            <input
              ref={buscaRef}
              type="text"
              id="busca-servicos"
              disabled={bloqueado}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar serviço por nome ou código... (Atalho: F2)"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 bg-transparent border-0 cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Lista de Cards de Serviços */}
          <div className="flex-1 overflow-y-auto max-h-[460px] pr-1 space-y-2">
            {servicosFiltrados.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
                Nenhum serviço localizado para "{busca}".
              </div>
            ) : (
              servicosFiltrados.map((s) => (
                <div
                  key={s.id}
                  onClick={() => !bloqueado && adicionar(s)}
                  className="p-3 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                      {s.codigo}
                    </span>
                    <h4 className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors leading-snug">
                      {s.nome}
                    </h4>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-black font-mono text-emerald-400 tabular-nums">
                      {formatarBRL(s.valor)}
                    </div>
                    <button
                      type="button"
                      disabled={bloqueado}
                      className="mt-1 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-[10px] font-bold transition-all border border-emerald-500/30 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={11} /> Adicionar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Barra de Rodapé do Catálogo */}
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between font-mono">
            <span>Terminal: Integração Instantânea</span>
            <span>Atalho Rápido: Tecla [F2]</span>
          </div>
        </section>

        {/* ===================================================================
         *  PAINEL DIREITO: COMANDA & FECHAMENTO DA VENDA (5 COLUNAS)
         * =================================================================== */}
        <section className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl p-5 flex flex-col justify-between">
          <div>
            {/* Cabeçalho da Comanda */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingBasket size={18} className="text-emerald-400" />
                <h3 className="text-sm font-black text-white">Comanda Atual</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                  {totalItens} {totalItens === 1 ? 'item' : 'itens'}
                </span>
                {itens.length > 0 && (
                  <button
                    type="button"
                    onClick={limparComanda}
                    className="p-1 text-slate-500 hover:text-rose-400 bg-transparent border-0 cursor-pointer"
                    title="Limpar Comanda (F8)"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Banner de Comanda do Balcão Vinculada */}
            {comandaAtiva && (
              <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-500/50 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-md animate-fadeIn">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold flex-shrink-0">
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">Comanda Balcão Vinculada</span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md font-mono border border-emerald-500/30">
                        Atendente: {comandaAtiva.atendente_nome}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 truncate mt-0.5">
                      Cliente: <strong className="text-white">{comandaAtiva.cliente_nome}</strong>
                      {comandaAtiva.cliente_documento && ` · CPF/CNPJ: ${comandaAtiva.cliente_documento}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setComandaAtiva(null)}
                  className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-700 cursor-pointer flex-shrink-0"
                  title="Desvincular esta comanda do balcão e manter venda avulsa"
                >
                  Desvincular
                </button>
              </div>
            )}

            {/* SELEÇÃO DO TOMADOR / DESPACHANTE (RF003) */}
            <div className="mb-4 p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <Building2 size={14} className="text-indigo-400" />
                  Tomador / Despachante:
                </span>
                <button
                  type="button"
                  onClick={() => setModalNovoDesp(true)}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold bg-transparent border-0 cursor-pointer flex items-center gap-1"
                >
                  <UserPlus size={13} /> + Novo (F9)
                </button>
              </div>

              {despSel ? (
                <div className="p-2.5 bg-indigo-950/30 border border-indigo-700/60 rounded-xl flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-black text-indigo-200">{despSel.nome_razao}</div>
                    <div className="text-[10px] font-mono text-indigo-300">
                      CPF/CNPJ: {despSel.documento} · Saldo Devedor:{' '}
                      <strong className="text-rose-400">{formatarBRL(Number(despSel.saldo_devedor))}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={limparDespachante}
                    className="p-1 text-slate-400 hover:text-rose-400 bg-transparent border-0 cursor-pointer"
                    title="Remover Despachante"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    ref={despRef}
                    value={despBusca}
                    onChange={(e) => {
                      setDespBusca(e.target.value);
                      setSugestoesAbertas(true);
                      setIdxSug(0);
                    }}
                    onFocus={() => setSugestoesAbertas(true)}
                    placeholder="Buscar despachante por nome ou CNPJ... (F3)"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                  />

                  {/* Dropdown de Autocomplete do Despachante */}
                  {sugestoesAbertas && despFiltrados.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-800">
                      {despFiltrados.map((d, idx) => (
                        <div
                          key={d.id}
                          onClick={() => selecionarDespachante(d)}
                          className={`p-2.5 text-xs cursor-pointer flex items-center justify-between ${
                            idx === idxSug ? 'bg-indigo-950/60 text-white' : 'hover:bg-slate-800 text-slate-200'
                          }`}
                        >
                          <div>
                            <div className="font-bold">{d.nome_razao}</div>
                            <div className="text-[10px] font-mono text-slate-400">{d.documento}</div>
                          </div>
                          <div className="text-[10px] font-mono text-rose-400 font-bold">
                            {formatarBRL(Number(d.saldo_devedor))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Itens do Carrinho */}
            <div className="overflow-y-auto max-h-[190px] space-y-2 mb-4 pr-1">
              {itens.length === 0 ? (
                <div className="p-6 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
                  A comanda está vazia. Adicione serviços do catálogo ao lado.
                </div>
              ) : (
                itens.map((item) => (
                  <div
                    key={item.servico.id}
                    className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 max-w-[55%]">
                      <div className="text-xs font-bold text-slate-200 truncate">
                        {item.servico.nome}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {formatarBRL(item.servico.valor)} un.
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => alterarQtd(item.servico.id, -1)}
                        className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border-0 cursor-pointer"
                      >
                        <Minus size={11} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={item.qtd}
                        onChange={(e) => definirQtd(item.servico.id, parseInt(e.target.value, 10))}
                        className="w-9 py-0.5 text-center bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono font-bold text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => alterarQtd(item.servico.id, 1)}
                        className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border-0 cursor-pointer"
                      >
                        <Plus size={11} />
                      </button>

                      <div className="w-16 text-right font-mono font-black text-xs text-emerald-400 tabular-nums">
                        {formatarBRL(deCentavos(paraCentavos(item.servico.valor) * item.qtd))}
                      </div>

                      <button
                        type="button"
                        onClick={() => remover(item.servico.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 bg-transparent border-0 cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* SELETOR DE MEIOS DE PAGAMENTO */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">Forma de Pagamento (F4):</span>
                {forma && (
                  <span className="text-[11px] font-bold text-emerald-400 uppercase font-mono">
                    {ROTULO[forma]}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FORMAS.map((f) => {
                  const Icon = f.icon;
                  const ativa = forma === f.id;
                  const desab = f.id === 'faturamento' && !despSel;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={desab}
                      onClick={() => selecionarForma(f.id)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        ativa
                          ? `${f.corAtiva} ${f.borderAtiva} shadow-lg`
                          : desab
                          ? 'bg-slate-950/40 border-slate-800 text-slate-600 opacity-50 cursor-not-allowed'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                      }`}
                      title={desab ? 'Exige selecionar um despachante' : f.label}
                    >
                      <Icon size={14} />
                      <span className="truncate">{f.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TOTALIZADOR E BOTÃO DE FINALIZAÇÃO */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Subtotal dos Serviços:</span>
                <span className="font-mono font-bold text-slate-200">R$ {subtotalServicos.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold border-b border-slate-800/80 pb-2">
                <span>(+) ISSQN Municipal (2,00%):</span>
                <span className="font-mono font-bold">R$ {valorIssqn.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-xs uppercase font-black tracking-wide text-slate-200">TOTAL A PAGAR:</span>
                <span className="text-3xl font-black font-mono text-emerald-400 tabular-nums font-bold">
                  R$ {valorTotalCobrado.toFixed(2)}
                </span>
              </div>
            </div>

            {erro && (
              <div className="p-2.5 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-semibold flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-400" />
                <span>{erro}</span>
              </div>
            )}

            <button
              type="button"
              id="btn-finalizar-venda"
              disabled={finalizando || itens.length === 0 || !forma}
              onClick={finalizar}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl text-sm font-black transition-all shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 cursor-pointer border-0"
            >
              {finalizando ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <CheckCircle2 size={18} />
              )}
              <span>Finalizar Venda & Emitir Cupom (Enter)</span>
            </button>
          </div>
        </section>
      </div>

      {/* MODAL DE CADASTRO RÁPIDO DE DESPACHANTE */}
      {modalNovoDesp && (
        <NovoDespachanteModal
          onClose={() => setModalNovoDesp(false)}
          onCriado={(d) => {
            setDespachantes((prev) => [...prev, d].sort((a, b) => a.nome_razao.localeCompare(b.nome_razao)));
            selecionarDespachante(d);
            setModalNovoDesp(false);
          }}
        />
      )}

      {/* MODAL DO CUPOM FISCAL / RECIBO DE SERVIÇOS (COM ISSQN 2% E IMPRESSÃO) */}
      {cupom && (
        <CupomFiscalModal
          numeroCupom={cupom.numero}
          dataEmissao={cupom.data}
          operadorNome={cupom.operador}
          atendenteNome={cupom.atendenteNome}
          clienteNome={cupom.clienteNome}
          cpfConsumidor={cupom.clienteDocumento || cupom.despachante?.documento}
          itens={cupom.itens.map((i) => ({
            codigo: i.servico.codigo,
            nome: i.servico.nome,
            qtd: i.qtd,
            valorUnitario: i.servico.valor,
          }))}
          totalCent={cupom.totalCent}
          subtotalServicosProp={cupom.subtotalServicos}
          valorIssqnProp={cupom.valorIssqn}
          valorTotalCobradoProp={cupom.valorTotalCobrado}
          formaPagamento={cupom.forma}
          despachante={cupom.despachante}
          saldoAposFatura={cupom.saldoAposFatura}
          onFechar={() => {
            setCupom(null);
            setTimeout(() => buscaRef.current?.focus(), 0);
          }}
        />

      )}
    </>
  );
}

/* =========================================================================
 *  Cadastro rápido de despachante (popup de balcão) - DARK SLATE
 * ========================================================================= */

function NovoDespachanteModal({
  onClose,
  onCriado,
}: {
  onClose: () => void;
  onCriado: (d: Despachante) => void;
}) {
  const [nome, setNome] = useState('');
  const [doc, setDoc] = useState('');
  const [tel, setTel] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 3) return setErro('Informe o Nome / Razão Social.');
    if (!validarDocumento(doc)) return setErro('CPF/CNPJ inválido. Confira os dígitos.');
    if (somenteDigitos(tel).length < 10) return setErro('Informe um telefone válido com DDD.');
    setSalvando(true);
    setErro('');
    try {
      const d = await cadastrarDespachante({ nome_razao: nome.trim(), documento: doc, telefone: tel });
      onCriado(d);
    } catch (err: any) {
      setErro(err.message || 'Falha ao cadastrar o despachante.');
      setSalvando(false);
    }
  };

  const docDigitos = somenteDigitos(doc).length;
  const docInvalido = (docDigitos === 11 || docDigitos === 14) && !validarDocumento(doc);

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-6 space-y-4 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-black text-white flex items-center gap-2">
            <UserPlus size={20} className="text-indigo-400" /> Novo Despachante B2B
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">Nome / Razão Social *</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
            maxLength={255}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">CPF / CNPJ *</label>
          <input
            value={doc}
            onChange={(e) => setDoc(mascararDocumento(e.target.value))}
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            inputMode="numeric"
            className={`w-full p-2.5 bg-slate-950 border rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              docInvalido ? 'border-red-500' : 'border-slate-700'
            }`}
          />
          {docInvalido && <p className="mt-1 text-[11px] text-red-400 font-semibold">Documento inválido.</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">Telefone *</label>
          <input
            value={tel}
            onChange={(e) => setTel(mascararTelefone(e.target.value))}
            placeholder="(54) 99999-9999"
            inputMode="tel"
            className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {erro && (
          <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-semibold flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {erro}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-bold border-0 cursor-pointer shadow-lg shadow-indigo-950/50"
          >
            {salvando ? 'Cadastrando...' : 'Cadastrar e Vincular'}
          </button>
        </div>
      </form>
    </div>
  );
}
