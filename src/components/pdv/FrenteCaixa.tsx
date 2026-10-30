import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Minus, Trash2, Banknote, QrCode, CreditCard, FileText, UserPlus, X,
  Printer, CheckCircle2, Loader2, AlertTriangle, Keyboard, Building2, ShoppingBasket,
  ArrowRight, ShieldCheck, Sparkles, Tag, ShoppingBag, Bell, Lock, Edit3
} from 'lucide-react';
import type { CaixaDiario, Despachante, FormaPagamento, MovimentacaoCaixa, ComandaBalcao } from '../../types/pdv';
import type { UserRole } from '../../types/auth';
import { formatarBRL, paraCentavos, deCentavos, registrarMovimentacao, calcularISSQN } from '../../lib/pdvCaixa';
import {
  buscarDespachantes, buscarServicos, cadastrarDespachante, cadastrarServicoCatalogo, type ServicoCatalogo,
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
  valorRecebido?: number | null;
  troco?: number | null;
}


const FORMAS: { id: FormaPagamento; label: string; emoji: string; icon: any }[] = [
  { id: 'dinheiro', label: 'Dinheiro', emoji: '💵', icon: Banknote },
  { id: 'pix', label: 'PIX', emoji: '⚡', icon: QrCode },
  { id: 'cartao_debito', label: 'Débito', emoji: '💳', icon: CreditCard },
  { id: 'cartao_credito', label: 'Crédito', emoji: '💳', icon: CreditCard },
  { id: 'faturamento', label: 'Despachante / Prazo', emoji: '📄', icon: FileText },
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
  userRole = 'caixa',
  bloqueado,
  modalExternoAberto,
  onVendaRegistrada,
}: {
  caixa: CaixaDiario | null;
  operadorNome: string;
  operadorId?: string | null;
  userRole?: UserRole;
  bloqueado: boolean;
  modalExternoAberto: boolean;
  onVendaRegistrada: (mov: MovimentacaoCaixa) => void;
}) {
  // Matriz de Governança e Hierarquia: exclusivo para master, gerente e financeiro
  const podeGerenciar = ['master', 'gerente', 'financeiro'].includes(userRole);

  const [servicos, setServicos] = useState<ServicoCatalogo[]>([]);
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [forma, setForma] = useState<FormaPagamento | null>(null);
  const [dinheiroRecebidoStr, setDinheiroRecebidoStr] = useState('');

  const [despachantes, setDespachantes] = useState<Despachante[]>([]);
  const [despBusca, setDespBusca] = useState('');
  const [despSel, setDespSel] = useState<Despachante | null>(null);
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [idxSug, setIdxSug] = useState(0);
  const [modalNovoDesp, setModalNovoDesp] = useState(false);
  const [modalNovoServico, setModalNovoServico] = useState(false);

  const [cupom, setCupom] = useState<CupomDados | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [erro, setErro] = useState('');

  // Comandas do Balcão CRVA (Fila de Atendimento Integrada)
  const [comandasAguardando, setComandasAguardando] = useState<ComandaBalcao[]>([]);
  const [comandaAtiva, setComandaAtiva] = useState<ComandaBalcao | null>(null);
  const [carregandoComandas, setCarregandoComandas] = useState(false);

  const buscaRef = useRef<HTMLInputElement>(null);
  const despRef = useRef<HTMLInputElement>(null);
  const containerDespRef = useRef<HTMLDivElement>(null);

  // Click-Outside & ESC Listener para fechar o popover do despachante automaticamente
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerDespRef.current && !containerDespRef.current.contains(e.target as Node)) {
        setSugestoesAbertas(false);
      }
    };

    const handleKeyEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sugestoesAbertas) {
        setSugestoesAbertas(false);
      }
    };

    if (sugestoesAbertas) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyEsc);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyEsc);
    };
  }, [sugestoesAbertas]);

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

  /* ------------------- Crash Recovery: Persistência Reativa ------------------ */

  // 1. Chave de Persistência Segura por Operador
  const chaveDraft = operadorId ? `integra_pdv_draft_${operadorId}` : null;
  const [toastRecuperado, setToastRecuperado] = useState<string | null>(null);
  const restauracaoExecutadaRef = useRef<boolean>(false);

  // 2. Restauração Automática ao Montar a tela com caixa ativo
  useEffect(() => {
    if (!chaveDraft || restauracaoExecutadaRef.current || !caixa) return;
    restauracaoExecutadaRef.current = true;

    try {
      const draftSalvo = localStorage.getItem(chaveDraft);
      if (draftSalvo) {
        const parsed = JSON.parse(draftSalvo);
        if (parsed && Array.isArray(parsed.itens) && parsed.itens.length > 0) {
          // Garante a integridade matemática dos valores (numeric 10,2) e catálogo
          const itensRecuperados: ItemCarrinho[] = parsed.itens.map((it: any) => ({
            servico: {
              ...it.servico,
              valor: Number(it.servico?.valor) || 0,
            },
            qtd: Math.max(1, Number(it.qtd) || 1),
          }));

          setItens(itensRecuperados);

          if (parsed.despachante) {
            setDespSel(parsed.despachante);
          }
          if (parsed.formaPagamento) {
            setForma(parsed.formaPagamento);
          }

          setToastRecuperado(
            '⚡ Venda em andamento recuperada com sucesso após reinicialização do sistema!'
          );
        }
      }
    } catch (err) {
      console.warn('Erro ao restaurar rascunho de venda em andamento:', err);
    }
  }, [chaveDraft, caixa]);

  // 3. Auto-Save Contínuo (useEffect)
  useEffect(() => {
    if (!chaveDraft || !caixa) return;
    // Não sobrescreve o storage antes de a restauração inicial ser executada
    if (!restauracaoExecutadaRef.current) return;

    if (itens.length > 0 || despSel || forma) {
      try {
        localStorage.setItem(
          chaveDraft,
          JSON.stringify({
            itens,
            despachante: despSel,
            formaPagamento: forma,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.warn('Erro ao salvar rascunho de venda no localStorage:', err);
      }
    }
  }, [itens, despSel, forma, chaveDraft, caixa]);

  // 4. Temporizador do toast de recuperação
  useEffect(() => {
    if (!toastRecuperado) return;
    const t = setTimeout(() => setToastRecuperado(null), 5000);
    return () => clearTimeout(t);
  }, [toastRecuperado]);

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

  // 1. Subtotal dos Serviços (Garante rigor matemático de ponto flutuante):
  const subtotalServicos = useMemo(() => {
    return itens.reduce((acc, i) => acc + (Number(i.servico.valor) * Number(i.qtd)), 0);
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

  // 4. Fluxo de Pagamento em Dinheiro & Troco
  const dinheiroRecebidoNum = parseFloat(dinheiroRecebidoStr.replace(/\./g, '').replace(',', '.')) || 0;
  const trocoCalculado =
    forma === 'dinheiro' && dinheiroRecebidoNum > valorTotalCobrado
      ? Math.round((dinheiroRecebidoNum - valorTotalCobrado) * 100) / 100
      : 0;

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
    setDinheiroRecebidoStr('');
    setErro('');
    setComandaAtiva(null);
    if (chaveDraft) {
      try {
        localStorage.removeItem(chaveDraft);
      } catch (e) {
        console.warn('Erro ao limpar rascunho de venda do localStorage:', e);
      }
    }
  }, [chaveDraft]);

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
        cliente_id: comandaAtiva?.cliente_id ?? null,
        veiculo_id: comandaAtiva?.veiculo_id ?? null,
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
        valorRecebido: forma === 'dinheiro' && dinheiroRecebidoNum > 0 ? dinheiroRecebidoNum : valorTotalCobrado,
        troco: forma === 'dinheiro' ? trocoCalculado : null,
      });

      // Limpeza segura da comanda salva no localStorage pós-quitação confirmada no Supabase
      if (chaveDraft) {
        try {
          localStorage.removeItem(chaveDraft);
        } catch (e) {
          console.warn('Erro ao remover rascunho de venda pós-quitação:', e);
        }
      }

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
    dinheiroRecebidoNum,
    trocoCalculado,
    operadorNome,
    operadorId,
    comandaAtiva,
    carregarComandas,
    onVendaRegistrada,
    limparComanda,
    chaveDraft,
  ]);

  /* --------------------------- Teclas de atalho ------------------------- */

  const travado = bloqueado || modalExternoAberto || modalNovoDesp || modalNovoServico;

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
        setSugestoesAbertas(true);
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
        if (!podeGerenciar) {
          setErro('Ação restrita à supervisão/gestão.');
          return;
        }
        setModalNovoDesp(true);
      } else if (e.key === 'Enter') {
        if (sugestoesAbertas && despFiltrados.length > 0) {
          e.preventDefault();
          selecionarDespachante(despFiltrados[idxSug] ?? despFiltrados[0]);
          setSugestoesAbertas(false);
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
  }, [cupom, travado, sugestoesAbertas, despFiltrados, idxSug, itens.length, forma, despSel, podeGerenciar, finalizar, limparComanda]);

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
        <section className="lg:col-span-7 rounded-2xl border border-slate-800/80 bg-slate-900/80 backdrop-blur-md shadow-xl p-5 flex flex-col">
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
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-700/60">
                {servicosFiltrados.length} disponíveis
              </span>
              {podeGerenciar ? (
                <button
                  type="button"
                  id="btn-novo-servico-catalogo"
                  onClick={() => setModalNovoServico(true)}
                  className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-xl text-[10px] font-bold transition-all border border-emerald-500/30 flex items-center gap-1 cursor-pointer"
                  title="Cadastrar novo serviço no catálogo oficial"
                >
                  <Plus size={11} /> + Novo Serviço
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Ação restrita à supervisão/gestão"
                  className="px-2.5 py-1 bg-slate-800 text-slate-500 rounded-xl text-[10px] font-bold border border-slate-700/60 opacity-50 cursor-not-allowed flex items-center gap-1"
                >
                  <Lock size={10} /> + Novo Serviço
                </button>
              )}
            </div>
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
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/90 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/80 transition-all font-medium"
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
          <div className="flex-1 overflow-y-auto max-h-[460px] pr-1 space-y-2 scrollbar-thin scrollbar-thumb-slate-700">
            {servicosFiltrados.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
                Nenhum serviço localizado para "{busca}".
              </div>
            ) : (
              servicosFiltrados.map((s) => (
                <div
                  key={s.id}
                  onClick={() => !bloqueado && adicionar(s)}
                  className="p-3 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-800/50">
                      {s.codigo}
                    </span>
                    <h4 className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors leading-snug">
                      {s.nome}
                    </h4>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold font-mono tracking-tight text-emerald-400 tabular-nums">
                      {formatarBRL(s.valor)}
                    </div>
                    <button
                      type="button"
                      disabled={bloqueado}
                      className="mt-1 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-xl text-[10px] font-bold transition-all border border-emerald-500/30 flex items-center gap-1 cursor-pointer"
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
        <section className="lg:col-span-5 rounded-2xl border border-slate-800/80 bg-slate-900/80 backdrop-blur-md shadow-xl p-5 flex flex-col justify-between">
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
                {podeGerenciar ? (
                  <button
                    type="button"
                    onClick={() => setModalNovoDesp(true)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold bg-transparent border-0 cursor-pointer flex items-center gap-1"
                    title="Cadastrar novo despachante (F9)"
                  >
                    <UserPlus size={13} /> + Novo (F9)
                  </button>
                ) : (
                  <span
                    className="text-[11px] text-slate-500 font-medium flex items-center gap-1 cursor-not-allowed opacity-60"
                    title="Ação restrita à supervisão/gestão"
                  >
                    <Lock size={12} /> + Novo (Restrito)
                  </span>
                )}
              </div>

              {despSel ? (
                <div className="p-2.5 bg-indigo-950/30 border border-indigo-700/60 rounded-xl flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-black text-indigo-200">{despSel.nome_razao}</div>
                    <div className="text-[10px] font-mono text-indigo-300">
                      CPF/CNPJ: {mascararDocumento(despSel.documento)} · Saldo Devedor:{' '}
                      <strong className={Number(despSel.saldo_devedor) > 0 ? "text-rose-400" : "text-emerald-400"}>
                        {formatarBRL(Number(despSel.saldo_devedor))}
                      </strong>
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
                <div ref={containerDespRef} className="relative">
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

                  {/* Dropdown de Autocomplete do Despachante com click-outside e scrollbar fina */}
                  {sugestoesAbertas && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur-md max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent divide-y divide-slate-800/80">
                      {despFiltrados.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">
                          Nenhum despachante encontrado com "{despBusca}".
                        </div>
                      ) : (
                        despFiltrados.map((d, idx) => {
                          const devedor = Number(d.saldo_devedor) > 0;
                          return (
                            <div
                              key={d.id}
                              onClick={() => {
                                selecionarDespachante(d);
                                setSugestoesAbertas(false);
                              }}
                              className={`p-2.5 text-xs cursor-pointer flex items-center justify-between gap-2 transition-colors ${idx === idxSug ? 'bg-indigo-950/60 text-white' : 'hover:bg-slate-800/80 text-slate-200'
                                }`}
                            >
                              <div className="min-w-0 pr-2">
                                <div className="font-bold text-white text-xs truncate leading-snug">{d.nome_razao}</div>
                                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                  {mascararDocumento(d.documento)}
                                  {d.telefone ? ` · ${mascararTelefone(d.telefone)}` : ''}
                                </div>
                              </div>
                              <div className="shrink-0">
                                {devedor ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 whitespace-nowrap">
                                    Débito: {formatarBRL(Number(d.saldo_devedor))}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                                    Em dia
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Itens do Carrinho */}
            <div className="overflow-y-auto max-h-[190px] space-y-2 mb-4 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
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
                  const ativa = forma === f.id;
                  const desab = f.id === 'faturamento' && !despSel;
                  const ehPrazo = f.id === 'faturamento';
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={desab}
                      onClick={() => selecionarForma(f.id)}
                      className={`rounded-xl border border-slate-700/80 bg-slate-900/60 hover:bg-slate-800 text-slate-200 font-medium py-3 px-4 transition-all duration-200 shadow-sm flex items-center justify-center gap-2 text-xs cursor-pointer ${ehPrazo ? 'col-span-2 sm:col-span-2' : ''
                        } ${ativa
                          ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-500/50 shadow-emerald-950/30 font-bold'
                          : desab
                            ? 'opacity-45 cursor-not-allowed hover:bg-slate-900/60'
                            : ''
                        }`}
                      title={desab ? 'Exige selecionar um despachante' : f.label}
                    >
                      <span className="text-sm leading-none select-none">{f.emoji}</span>
                      <span className="truncate">{f.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Painel Reativo de Pagamento em Dinheiro com Cálculo de Troco */}
              {forma === 'dinheiro' && (
                <div className="mt-3 p-3 bg-slate-950/90 border border-emerald-500/40 rounded-xl space-y-2 animate-fadeIn shadow-inner">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Banknote size={14} className="text-emerald-400" />
                      Valor em Dinheiro Recebido:
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Devido: <strong className="text-white">{formatarBRL(valorTotalCobrado)}</strong>
                    </span>
                  </div>

                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-emerald-400">
                      R$
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={dinheiroRecebidoStr}
                      onChange={(e) => setDinheiroRecebidoStr(e.target.value)}
                      placeholder={valorTotalCobrado.toFixed(2).replace('.', ',')}
                      className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Atalhos Rápidos para Facilitar o Troco */}
                  <div className="flex gap-1.5 flex-wrap pt-0.5">
                    <button
                      type="button"
                      onClick={() => setDinheiroRecebidoStr(valorTotalCobrado.toFixed(2).replace('.', ','))}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] font-mono font-bold border border-slate-700 cursor-pointer transition-colors"
                    >
                      Exato ({formatarBRL(valorTotalCobrado)})
                    </button>
                    {[50, 100, 200]
                      .filter((v) => v >= valorTotalCobrado)
                      .map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setDinheiroRecebidoStr(v.toFixed(2).replace('.', ','))}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] font-mono font-bold border border-slate-700 cursor-pointer transition-colors"
                        >
                          R$ {v},00
                        </button>
                      ))}
                  </div>

                  {/* Demonstrativo em Tempo Real do Troco */}
                  {dinheiroRecebidoNum > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      {dinheiroRecebidoNum >= valorTotalCobrado ? (
                        <>
                          <span className="font-bold text-emerald-400">Troco a Devolver:</span>
                          <span className="font-mono font-black text-sm text-emerald-400 tabular-nums">
                            {formatarBRL(trocoCalculado)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-bold text-rose-400">Valor Insuficiente (Falta):</span>
                          <span className="font-mono font-bold text-xs text-rose-400 tabular-nums">
                            {formatarBRL(valorTotalCobrado - dinheiroRecebidoNum)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* TOTALIZADOR E BOTÃO DE FINALIZAÇÃO */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="bg-slate-950/80 backdrop-blur-sm border border-slate-700/60 rounded-2xl p-4 space-y-2.5 shadow-inner">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Subtotal dos Serviços:</span>
                <span className="font-mono font-semibold tracking-tight text-slate-200">{formatarBRL(subtotalServicos)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold border-b border-slate-800/80 pb-2">
                <span>(+) ISSQN Municipal (2,00%):</span>
                <span className="font-mono font-semibold tracking-tight">{formatarBRL(valorIssqn)}</span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-xs uppercase font-black tracking-wide text-slate-200">TOTAL A PAGAR:</span>
                <span className="text-3xl font-semibold font-mono tracking-tight text-emerald-400 tabular-nums">
                  {formatarBRL(valorTotalCobrado)}
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
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 cursor-pointer border-0"
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

      {/* MODAL DE NOVO SERVIÇO NO CATÁLOGO */}
      {modalNovoServico && (
        <NovoServicoModal
          onClose={() => setModalNovoServico(false)}
          onCriado={(s) => {
            setServicos((prev) => [...prev, s].sort((a, b) => a.nome.localeCompare(b.nome)));
            setModalNovoServico(false);
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
          valorRecebido={cupom.valorRecebido}
          troco={cupom.troco}
          onFechar={() => {
            setCupom(null);
            setTimeout(() => buscaRef.current?.focus(), 0);
          }}
        />
      )}

      {/* TOAST DISCRETO: RECUPERAÇÃO DE VENDA EM ANDAMENTO (CRASH RECOVERY) */}
      {toastRecuperado && (
        <div
          role="status"
          id="toast-venda-recuperada"
          className="fixed bottom-6 right-6 z-[140] max-w-md px-4 py-3 bg-slate-900/95 border border-emerald-500/50 text-emerald-200 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Sparkles size={16} className="text-emerald-400" />
          </div>
          <span className="flex-1 leading-snug">{toastRecuperado}</span>
          <button
            type="button"
            onClick={() => setToastRecuperado(null)}
            className="text-slate-400 hover:text-white p-1 rounded-md transition-colors border-0 bg-transparent cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}

/* =========================================================================
 *  Cadastro Completo de Despachante B2B (com Máscaras & Endereço)
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
  const [email, setEmail] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');

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
    if (nome.trim().length < 3) return setErro('Informe o Nome ou Razão Social completo.');
    if (!validarDocumento(doc)) return setErro('CPF ou CNPJ inválido. Confira os dígitos digitados.');
    if (somenteDigitos(tel).length < 10) return setErro('Informe um Telefone válido com DDD (mínimo 10 dígitos).');
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('Informe um E-mail de contato válido.');
    if (!logradouro.trim()) return setErro('Informe o Logradouro (Rua, Av.) do endereço.');
    if (!numero.trim()) return setErro('Informe o Número do endereço.');
    if (!bairro.trim()) return setErro('Informe o Bairro.');
    if (!cidade.trim()) return setErro('Informe a Cidade.');

    setSalvando(true);
    setErro('');
    try {
      const d = await cadastrarDespachante({
        nome_razao: nome.trim(),
        documento: doc.trim(),
        telefone: tel.trim(),
        email: email.trim(),
        logradouro: logradouro.trim(),
        numero: numero.trim(),
        bairro: bairro.trim(),
        cidade: cidade.trim(),
      });
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
      <form
        onSubmit={submit}
        className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-6 space-y-4 text-slate-100 max-h-[92vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent animate-fadeIn"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
              <UserPlus size={20} />
            </div>
            <div>
              <h3 className="font-black text-white text-base">Novo Despachante / Parceiro</h3>
              <p className="text-[11px] text-slate-400">Cadastro homologado para faturamento e vinculação de comandas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl bg-transparent border-0 cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Bloco 1: Identificação */}
        <div className="space-y-3">
          <div className="text-[11px] font-bold text-indigo-400 tracking-wider uppercase border-b border-slate-800/80 pb-1">
            1. Dados Cadastrais e Fiscais
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Nome / Razão Social <span className="text-rose-400">*</span>
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Despachante Central Ltda / João da Silva"
              className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
              maxLength={255}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                CPF ou CNPJ <span className="text-rose-400">*</span>
              </label>
              <input
                value={doc}
                onChange={(e) => setDoc(mascararDocumento(e.target.value))}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                inputMode="numeric"
                className={`w-full p-2.5 bg-slate-950 border rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${docInvalido ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-700'
                  }`}
              />
              {docInvalido && <p className="mt-1 text-[11px] text-red-400 font-semibold">Dígitos verificadores inválidos.</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Telefone de Contato <span className="text-rose-400">*</span>
              </label>
              <input
                value={tel}
                onChange={(e) => setTel(mascararTelefone(e.target.value))}
                placeholder="(54) 99999-9999"
                inputMode="tel"
                className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              E-mail Institucional / Contato <span className="text-rose-400">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contato@despachante.com.br"
              className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Bloco 2: Endereço Completo */}
        <div className="space-y-3 pt-2">
          <div className="text-[11px] font-bold text-indigo-400 tracking-wider uppercase border-b border-slate-800/80 pb-1">
            2. Endereço Completo
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Logradouro (Rua, Av.) <span className="text-rose-400">*</span>
              </label>
              <input
                value={logradouro}
                onChange={(e) => setLogradouro(e.target.value)}
                placeholder="Ex: Av. Júlio de Castilhos"
                className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Número <span className="text-rose-400">*</span>
              </label>
              <input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Ex: 1250"
                className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Bairro <span className="text-rose-400">*</span>
              </label>
              <input
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                placeholder="Ex: Centro"
                className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Cidade / UF <span className="text-rose-400">*</span>
              </label>
              <input
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Ex: Caxias do Sul / RS"
                className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {erro && (
          <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-semibold flex items-start gap-2 animate-fadeIn">
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{erro}</span>
          </div>
        )}

        <div className="flex gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 cursor-pointer transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold border-0 cursor-pointer shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 transition-all"
          >
            {salvando ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Cadastrando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                <span>Cadastrar e Vincular</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

/* =========================================================================
 *  Cadastro de Novo Serviço no Catálogo Oficial (Supervisão / Gestão)
 * ========================================================================= */

function NovoServicoModal({
  onClose,
  onCriado,
}: {
  onClose: () => void;
  onCriado: (s: ServicoCatalogo) => void;
}) {
  const [nome, setNome] = useState('');
  const [valorStr, setValorStr] = useState('');
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
    if (nome.trim().length < 3) return setErro('Informe a descrição do serviço (mínimo 3 caracteres).');

    // Normaliza valor: converte '150,50' ou '150.50' para float
    const valNumerico = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(valNumerico) || valNumerico <= 0) {
      return setErro('Informe um valor monetário válido maior que zero.');
    }

    setSalvando(true);
    setErro('');
    try {
      const s = await cadastrarServicoCatalogo({
        nome: nome.trim(),
        valor: valNumerico,
      });
      onCriado(s);
    } catch (err: any) {
      setErro(err.message || 'Falha ao incluir serviço no catálogo.');
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-6 space-y-4 text-slate-100 animate-fadeIn"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Tag size={20} />
            </div>
            <div>
              <h3 className="font-black text-white text-base">Novo Serviço CRVA</h3>
              <p className="text-[11px] text-slate-400">Adição ao catálogo oficial e terminal de vendas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl bg-transparent border-0 cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Descrição do Serviço <span className="text-rose-400">*</span>
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Vistoria Cautelar Especial / Segunda Via CRLV"
              className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
              maxLength={255}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Valor Base (R$) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-500">
                R$
              </span>
              <input
                value={valorStr}
                onChange={(e) => setValorStr(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono font-bold text-emerald-400 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Exemplo: 125,50</p>
          </div>
        </div>

        {erro && (
          <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-semibold flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{erro}</span>
          </div>
        )}

        <div className="flex gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 cursor-pointer transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold border-0 cursor-pointer shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all"
          >
            {salvando ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                <span>Salvar no Catálogo</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
