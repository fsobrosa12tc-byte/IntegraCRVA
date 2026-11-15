import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Minus, Trash2, Banknote, QrCode, CreditCard, FileText, UserPlus, X,
  Printer, CheckCircle2, Loader2, AlertTriangle, Keyboard, Building2, ShoppingBasket,
  ArrowRight, ShieldCheck, Sparkles, Tag, ShoppingBag, Bell, Lock, Edit3
} from 'lucide-react';
import type { CaixaDiario, Despachante, FormaPagamento, MovimentacaoCaixa, ComandaBalcao } from '../../types/pdv';
import type { UserRole } from '../../types/auth';
import { formatarBRL, paraCentavos, deCentavos, registrarMovimentacao, registrarMovimentacaoCaixa, calcularISSQN } from '../../lib/pdvCaixa';
import {
  buscarDespachantes, buscarServicos, cadastrarDespachante, cadastrarServicoCatalogo,
  editarServicoCatalogo, inscreverCatalogoRealtime, type ServicoCatalogo,
} from '../../lib/pdvVendas';
import {
  listarComandasAguardandoPagamento, liquidarComandaNoCaixa, inscreverComandasRealtime,
} from '../../lib/comandasBalcaoService';
import {
  mascararDocumento, mascararTelefone, somenteDigitos, validarDocumento,
} from '../../utils/documento';
import CupomFiscalModal from './CupomFiscal';
import ReciboDuasViasModal, { type DadosReciboDuasVias } from './ReciboDuasViasModal';
import PainelComandasPendentes from './PainelComandasPendentes';
import ModalCheckoutPagamento, {
  type FormaPagamento as FormaPagamentoCheckout,
  type DadosCheckout,
  type ItemComanda,
} from '../ModalCheckoutPagamento';

interface ItemCarrinho {
  servico: ServicoCatalogo;
  qtd: number;
}

interface CupomDados {
  numero: string;
  protocoloRecibo?: string | null;
  data: string;
  operador: string;
  atendenteNome?: string | null;
  clienteNome?: string | null;
  clienteDocumento?: string | null;
  veiculoPlaca?: string | null;
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
  const [clienteNomeManual, setClienteNomeManual] = useState('');
  const [clienteDocManual, setClienteDocManual] = useState('');

  const [despachantes, setDespachantes] = useState<Despachante[]>([]);
  const [despBusca, setDespBusca] = useState('');
  const [despSel, setDespSel] = useState<Despachante | null>(null);
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [idxSug, setIdxSug] = useState(0);
  const [modalNovoDesp, setModalNovoDesp] = useState(false);
  const [modalNovoServico, setModalNovoServico] = useState(false);
  const [servicoParaEditar, setServicoParaEditar] = useState<ServicoCatalogo | null>(null);

  const [cupom, setCupom] = useState<CupomDados | null>(null);
  const [reciboDuasVias, setReciboDuasVias] = useState<DadosReciboDuasVias | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [erro, setErro] = useState('');

  // Comandas do Balcão CRVA (Fila de Atendimento Integrada)
  const [comandasAguardando, setComandasAguardando] = useState<ComandaBalcao[]>([]);
  const [comandaAtiva, setComandaAtiva] = useState<ComandaBalcao | null>(null);
  const [carregandoComandas, setCarregandoComandas] = useState(false);
  const [checkoutComanda, setCheckoutComanda] = useState<ComandaBalcao | null>(null);

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

  const carregarComandas = useCallback(async (silencioso = false) => {
    try {
      if (!silencioso) setCarregandoComandas(true);
      const lista = await listarComandasAguardandoPagamento();
      setComandasAguardando(lista);
    } catch (e) {
      console.warn('Falha ao listar comandas aguardando pagamento:', e);
    } finally {
      if (!silencioso) setCarregandoComandas(false);
    }
  }, []);

  useEffect(() => {
    const recarregarServicos = () => {
      buscarServicos().then(setServicos).catch(() => {});
    };

    recarregarServicos();
    buscarDespachantes().then(setDespachantes).catch(() => setDespachantes([]));
    carregarComandas();

    // 1. Inscrição reativa Supabase Realtime (INSERT, UPDATE e DELETE na tabela comandas_balcao)
    const cancelarRealtime = inscreverComandasRealtime(() => {
      carregarComandas(true);
    });

    // 2. Inscrição reativa Supabase Realtime para o Catálogo de Serviços
    const cancelarRealtimeCatalogo = inscreverCatalogoRealtime(() => {
      recarregarServicos();
    });

    // 3. Polling de segurança a cada 8 segundos para garantir entrega imediata mesmo em oscilações de WebSocket
    const intervalPolling = window.setInterval(() => {
      carregarComandas(true);
    }, 8000);

    return () => {
      cancelarRealtime();
      cancelarRealtimeCatalogo();
      window.clearInterval(intervalPolling);
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
    setClienteNomeManual('');
    setClienteDocManual('');
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
    setClienteNomeManual(comanda.cliente_nome || '');
    setClienteDocManual(comanda.cliente_documento || '');

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

  const dadosCheckoutComanda: DadosCheckout | null = useMemo(() => {
    if (!checkoutComanda) return null;

    const itensFormatados: ItemComanda[] = checkoutComanda.itens.map((it) => {
      const subtotal = it.subtotal || it.valor_unitario * it.quantidade;
      return {
        descricao: it.servico,
        quantidade: it.quantidade,
        valor: subtotal,
      };
    });

    const subtotalTotal = itensFormatados.reduce((acc, i) => acc + i.valor, 0);
    const issValor = Math.round(subtotalTotal * 2) / 100;

    return {
      id: checkoutComanda.id,
      tipo: 'particular',
      tomadorNome: checkoutComanda.cliente_nome || 'Consumidor Balcão CRVA',
      tomadorDocumento: checkoutComanda.cliente_documento || '',
      placa: checkoutComanda.veiculo_placa || '',
      atendenteNome: checkoutComanda.atendente_nome || 'Patrícia Atendente Balcão',
      itens: itensFormatados,
      valorTotal: checkoutComanda.valor_total,
      issValor,
    };
  }, [checkoutComanda]);

  const handleConfirmarPagamentoCheckout = async (
    id: string,
    forma: FormaPagamentoCheckout,
    valorTotal: number
  ) => {
    const comanda = checkoutComanda || comandasAguardando.find((c) => c.id === id);
    if (!comanda) return;

    const formaNormalizadaTexto: Record<FormaPagamentoCheckout, string> = {
      PIX: 'PIX',
      CARTAO_DEBITO: 'Cartão Débito',
      CARTAO_CREDITO: 'Cartão Crédito',
      DINHEIRO: 'Dinheiro',
    };

    const formaNormalizadaBanco: Record<FormaPagamentoCheckout, FormaPagamento> = {
      PIX: 'pix',
      CARTAO_DEBITO: 'cartao_debito',
      CARTAO_CREDITO: 'cartao_credito',
      DINHEIRO: 'dinheiro',
    };

    const formaTexto = formaNormalizadaTexto[forma] || 'PIX';
    const formaBanco = formaNormalizadaBanco[forma] || 'pix';

    // 1. Atualizar comanda no banco para 'liquidado'
    await liquidarComandaNoCaixa({
      comandaId: comanda.id,
      caixaId: caixa?.id || '',
      operadorCaixaId: operadorId || null,
      formaPagamento: formaTexto,
    });

    // 2. Registrar na tabela movimentacoes_caixa
    const resumoServicos = comanda.itens.map((i) => `${i.quantidade}x ${i.servico}`).join(', ');
    const numRecibo = comanda.protocolo || `#REC-${Date.now().toString().slice(-6)}`;

    let movCriada: MovimentacaoCaixa;
    if (caixa) {
      movCriada = await registrarMovimentacao({
        caixa_id: caixa.id,
        tipo: 'venda',
        valor: valorTotal,
        forma_pagamento: formaBanco,
        descricao: `${resumoServicos} | ${comanda.cliente_nome} | Protocolo: ${numRecibo}`,
        operador_id: operadorId || null,
        operador_nome: operadorNome,
        protocolo_recibo: numRecibo,
        cliente_id: comanda.cliente_id || null,
        veiculo_id: comanda.veiculo_id || null,
      });
    } else {
      movCriada = (await registrarMovimentacaoCaixa({
        id_transacao: numRecibo,
        servico: resumoServicos || 'Atendimento Balcão CRVA',
        tomador_nome: comanda.cliente_nome,
        tipo_tomador: 'particular',
        forma_pagamento: formaTexto,
        valor: valorTotal,
        status: 'liquidado',
        operador_id: operadorId || undefined,
        operador_nome: operadorNome,
      })) as any;
    }

    // 3. Atualizar esteira sem reload
    setComandasAguardando((prev) => prev.filter((c) => c.id !== comanda.id));
    if (comandaAtiva?.id === comanda.id) {
      limparComanda();
    }

    // 4. Abastecer a esteira de auditoria imediatamente
    if (onVendaRegistrada && movCriada) {
      onVendaRegistrada(movCriada);
    }

    // 5. Emissão Obrigatória do Recibo Oficial em Duas Vias (1ª Via Cliente • 2ª Via Controle Interno)
    const itensRecibo = (comanda.itens && comanda.itens.length > 0)
      ? comanda.itens.map((it) => {
          const qtd = it.quantidade || 1;
          const valUnit = it.valor_unitario || (it.subtotal ? it.subtotal / qtd : valorTotal);
          const totalLinha = it.subtotal || valUnit * qtd;
          return {
            descricao: it.servico,
            quantidade: qtd,
            valorUnitario: valUnit,
            valorTotal: totalLinha,
          };
        })
      : [
          {
            descricao: resumoServicos || 'Atendimento Balcão CRVA',
            quantidade: 1,
            valorUnitario: valorTotal / 1.02,
            valorTotal: valorTotal / 1.02,
          },
        ];

    const subtotalCalculado = itensRecibo.reduce((acc, it) => acc + it.valorTotal, 0);
    const issqnCalculado = Math.round(subtotalCalculado * 2) / 100;

    const dadosReciboNormalizado: DadosReciboDuasVias = {
      protocolo: numRecibo,
      numeroRecibo: numRecibo,
      dataHora: new Date().toLocaleString('pt-BR'),
      tomadorNome: comanda.cliente_nome || 'Cliente Balcão CRVA',
      tomadorDocumento: comanda.cliente_documento || null,
      veiculoPlaca: (comanda as any).veiculo_placa || (comanda as any).placa || null,
      clienteFinalAuditoria: (comanda as any).cliente_final_vinculado || (comanda as any).clienteFinal || null,
      formaPagamento: formaTexto,
      operadorNome: operadorNome || 'Operador de Caixa',
      subtotal: Number(subtotalCalculado || 0),
      subtotalServicos: Number(subtotalCalculado || 0),
      issqn: Number(issqnCalculado || 0),
      valorIssqn: Number(issqnCalculado || 0),
      valorTotal: Number(valorTotal || 0),
      itens: itensRecibo,
    };

    setReciboDuasVias(dadosReciboNormalizado);

    setCheckoutComanda(null);
  };

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
        : clienteNomeManual.trim()
        ? `${clienteNomeManual.trim()}${clienteDocManual.trim() ? ` (${clienteDocManual.trim()})` : ''}`
        : (despSel ? despSel.nome_razao : 'Consumidor');

      const anoAtual = new Date().getFullYear();
      const protocoloReciboFinal =
        comandaAtiva?.protocolo?.trim() ||
        `REC-${anoAtual}-${Math.floor(10000 + Math.random() * 90000)}`;

      const mov = await registrarMovimentacao({
        caixa_id: caixa.id,
        tipo: 'venda',
        valor: valorTotalCobrado, // Total Cobrado com ISSQN somado que entra na gaveta ou no faturamento
        forma_pagamento: forma,
        descricao: `${resumo} | ${clienteDesc} | Protocolo: ${protocoloReciboFinal}`,
        despachante_id: forma === 'faturamento' ? despSel!.id : despSel?.id ?? null,
        operador_id: operadorId ?? null,
        operador_nome: operadorNome,
        valor_bruto: subtotalServicos, // Subtotal dos serviços
        aliquota_issqn: 2.00,
        valor_issqn: valorIssqn,
        cliente_id: comandaAtiva?.cliente_id ?? null,
        veiculo_id: comandaAtiva?.veiculo_id ?? null,
        protocolo_recibo: protocoloReciboFinal,
      });
      onVendaRegistrada(mov);

      // Se havia comanda de balcão vinculada, atualiza status para 'pago' e remove imediatamente da esteira
      if (comandaAtiva) {
        const idLiquidado = comandaAtiva.id;
        setComandasAguardando((prev) => prev.filter((c) => c.id !== idLiquidado));
        try {
          await liquidarComandaNoCaixa({
            comandaId: idLiquidado,
            caixaId: caixa.id,
            operadorCaixaId: operadorId || null,
            formaPagamento: forma,
          });
          await carregarComandas(true);
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
        numero: protocoloReciboFinal,
        protocoloRecibo: protocoloReciboFinal,
        veiculoPlaca: (comandaAtiva as any)?.veiculo_placa || null,
        data: mov.criado_em,
        operador: operadorNome,
        atendenteNome: comandaAtiva?.atendente_nome || null,
        clienteNome: comandaAtiva?.cliente_nome || clienteNomeManual.trim() || (despSel?.nome_razao ?? null),
        clienteDocumento: comandaAtiva?.cliente_documento || clienteDocManual.trim() || (despSel?.documento ?? null),
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

      // Emissão Obrigatória do Recibo Oficial em Duas Vias (1ª Via Cliente • 2ª Via Controle Interno)
      const formaDescricao: Record<string, string> = {
        pix: 'PIX',
        dinheiro: 'Dinheiro',
        cartao_debito: 'Cartão de Débito',
        cartao_credito: 'Cartão de Crédito',
        faturamento: 'Faturamento A Prazo (Conta-Corrente)',
      };

      const dadosReciboNormalizado: DadosReciboDuasVias = {
        protocolo: protocoloReciboFinal,
        numeroRecibo: protocoloReciboFinal,
        dataHora: new Date().toLocaleString('pt-BR'),
        tomadorNome: comandaAtiva?.cliente_nome || clienteNomeManual.trim() || (despSel?.nome_razao ?? 'Cliente Balcão CRVA'),
        tomadorDocumento: comandaAtiva?.cliente_documento || clienteDocManual.trim() || (despSel?.documento ?? null),
        veiculoPlaca: (comandaAtiva as any)?.veiculo_placa || null,
        clienteFinalAuditoria: (comandaAtiva as any)?.cliente_final_vinculado || null,
        formaPagamento: formaDescricao[forma] || String(forma).toUpperCase(),
        operadorNome: operadorNome || 'Operador de Caixa',
        subtotal: Number(subtotalServicos || 0),
        subtotalServicos: Number(subtotalServicos || 0),
        issqn: Number(valorIssqn || 0),
        valorIssqn: Number(valorIssqn || 0),
        valorTotal: Number(valorTotalCobrado || 0),
        valorRecebido: forma === 'dinheiro' && dinheiroRecebidoNum > 0 ? dinheiroRecebidoNum : valorTotalCobrado,
        troco: forma === 'dinheiro' ? trocoCalculado : null,
        itens: itens.map((i) => ({
          codigo: i.servico.codigo || '-',
          descricao: i.servico.nome || 'Serviço CRVA',
          quantidade: Number(i.qtd || 1),
          valorUnitario: Number(i.servico.valor || 0),
          subtotal: Number((i.servico.valor || 0) * (i.qtd || 1)),
        })),
      };

      setReciboDuasVias(dadosReciboNormalizado);

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
        onCobrarComanda={(c) => setCheckoutComanda(c)}
        onAtualizar={carregarComandas}
      />

      {/* Grade Principal da Frente de Caixa (Split-Screen Amplo) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6 text-slate-100">

        {/* ===================================================================
         *  LADO ESQUERDO: CATÁLOGO DE SERVIÇOS CRVA / NOTARIAIS (7 COLUNAS)
         * =================================================================== */}
        <section className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col h-[540px] shadow-xl">
          {/* Topo do Card */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <Tag size={18} className="text-emerald-400" />
              <h2 className="text-sm font-bold text-slate-100">
                Catálogo de Serviços CRVA / Notariais
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {podeGerenciar ? (
                <button
                  type="button"
                  id="btn-novo-servico-catalogo"
                  onClick={() => setModalNovoServico(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors bg-transparent border-0 cursor-pointer flex items-center gap-1"
                >
                  <Plus size={13} />
                  <span>+ Novo Serviço Avulso</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Campo de Busca Rápida com AutoFocus */}
          <div className="relative mt-3 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
            <input
              ref={buscaRef}
              type="text"
              autoFocus
              id="busca-servicos"
              disabled={bloqueado}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código ou descrição do ato..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 bg-transparent border-0 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Lista Densa e Legível (Linhas Horizontais Compactas) */}
          <div className="flex-1 overflow-y-auto space-y-2 mt-4 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
            {servicosFiltrados.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Nenhum serviço localizado para "{busca}".
              </div>
            ) : (
              servicosFiltrados.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 p-3 bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800/80 rounded-xl transition-all"
                >
                  {/* Esquerda: Badge do código + Descrição */}
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700/60 shrink-0">
                      {s.codigo}
                    </span>
                    <span className="text-sm font-medium text-slate-100 truncate" title={s.nome}>
                      {s.nome}
                    </span>
                  </div>

                  {/* Direita: Valor unitário + Botão + Adicionar */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-emerald-400 whitespace-nowrap font-mono">
                      {formatarBRL(s.valor)}
                    </span>
                    <button
                      type="button"
                      disabled={bloqueado}
                      onClick={() => adicionar(s)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Plus size={13} />
                      <span>Adicionar</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ===================================================================
         *  LADO DIREITO: COMANDA ATUAL & FECHAMENTO (5 COLUNAS)
         * =================================================================== */}
        <section className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col h-[540px] shadow-xl justify-between">
          <div className="flex flex-col flex-1 min-h-0">
            
            {/* 1. Identificação do Pagador (Topo Compacto) */}
            <div className="grid grid-cols-2 gap-3 mb-3 pb-3 border-b border-slate-800/80 shrink-0">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Nome do Cliente / Pagador
                </label>
                <input
                  type="text"
                  value={clienteNomeManual}
                  onChange={(e) => setClienteNomeManual(e.target.value)}
                  placeholder="Consumidor Balcão"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  CPF/CNPJ (Opcional)
                </label>
                <input
                  type="text"
                  value={clienteDocManual}
                  onChange={(e) => setClienteDocManual(mascararDocumento(e.target.value))}
                  placeholder="000.000.000-00"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Banner se houver comanda vinculada */}
            {comandaAtiva && (
              <div className="mb-2 px-3 py-1.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs shrink-0">
                <span className="text-emerald-300 font-medium truncate">
                  Comanda #{comandaAtiva.protocolo || comandaAtiva.id.slice(0, 6)} ({comandaAtiva.cliente_nome})
                </span>
                <button
                  type="button"
                  onClick={() => setComandaAtiva(null)}
                  className="text-xs text-slate-400 hover:text-white ml-2 bg-transparent border-0 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* 2. Itens Selecionados (Lista com Quantidade e Exclusão) */}
            <div className="flex-1 overflow-y-auto space-y-2 my-2 border-y border-slate-800/80 py-2.5 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
              {itens.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center text-slate-500 text-xs">
                  <ShoppingBasket size={22} className="text-slate-600 mb-1.5 stroke-[1.5]" />
                  <p className="text-slate-400 font-medium">Nenhum item na comanda. Selecione os serviços ao lado.</p>
                </div>
              ) : (
                itens.map((item) => (
                  <div
                    key={item.servico.id}
                    className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3 hover:border-slate-700 transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-200 truncate" title={item.servico.nome}>
                        {item.servico.nome}
                      </p>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Unit: {formatarBRL(item.servico.valor)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/70 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => alterarQtd(item.servico.id, -1)}
                          disabled={item.qtd <= 1}
                          className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold disabled:opacity-30 cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="999"
                          value={item.qtd}
                          onChange={(e) => definirQtd(item.servico.id, parseInt(e.target.value, 10))}
                          className="w-8 text-center font-mono font-bold text-slate-100 text-xs bg-transparent border-0 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => alterarQtd(item.servico.id, 1)}
                          className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <span className="text-xs font-bold font-mono text-emerald-400 w-16 text-right">
                        {formatarBRL(item.servico.valor * item.qtd)}
                      </span>

                      <button
                        type="button"
                        onClick={() => remover(item.servico.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors bg-transparent border-0 cursor-pointer"
                        title="Remover serviço"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 3. Forma de Pagamento (Grid 4 Botões Limpos) */}
            <div className="mb-2 shrink-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                Forma de Pagamento
              </span>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'pix', label: 'PIX', icon: QrCode },
                  { id: 'cartao_debito', label: 'Débito', icon: CreditCard },
                  { id: 'cartao_credito', label: 'Crédito', icon: CreditCard },
                  { id: 'dinheiro', label: 'Dinheiro', icon: Banknote },
                ].map((f) => {
                  const ativa = forma === f.id;
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setForma(f.id as FormaPagamento)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border ${
                        ativa
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon size={14} className={ativa ? 'text-white' : 'text-slate-400'} />
                      <span className="text-[11px] font-semibold">{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* 4. Rodapé de Totais e Ação */}
          <div className="pt-2.5 border-t border-slate-800 space-y-2 shrink-0">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal ({totalItens} atos):</span>
                <span className="font-mono text-slate-200">{formatarBRL(subtotalServicos)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>(+) ISSQN (2,00%):</span>
                <span className="font-mono text-slate-300">{formatarBRL(valorIssqn)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-100 pt-1 border-t border-slate-800">
                <span>TOTAL A COBRAR:</span>
                <span className="text-xl font-bold text-emerald-400 font-mono">{formatarBRL(valorTotalCobrado)}</span>
              </div>
            </div>

            {erro && (
              <div className="p-2 bg-red-950/60 border border-red-800 text-red-300 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                <AlertTriangle size={13} className="shrink-0 text-red-400" />
                <span>{erro}</span>
              </div>
            )}

            <button
              type="button"
              id="btn-finalizar-venda"
              disabled={finalizando || itens.length === 0 || !forma}
              onClick={finalizar}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer border-0"
            >
              {finalizando ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              <span>Efetuar Recebimento & Emitir Recibo</span>
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

      {/* MODAL DE EDIÇÃO DE SERVIÇO NO CATÁLOGO */}
      {servicoParaEditar && (
        <EditarServicoModal
          servico={servicoParaEditar}
          onClose={() => setServicoParaEditar(null)}
          onAtualizado={(atualizado) => {
            setServicos((prev) =>
              prev.map((s) => (s.id === atualizado.id ? atualizado : s)).sort((a, b) => a.nome.localeCompare(b.nome))
            );
            setItens((prev) =>
              prev.map((it) => (it.servico.id === atualizado.id ? { ...it, servico: atualizado } : it))
            );
            setServicoParaEditar(null);
          }}
        />
      )}

      {/* MODAL DO CUPOM FISCAL / RECIBO DE SERVIÇOS (COM ISSQN 2% E IMPRESSÃO) */}
      {cupom && (
        <CupomFiscalModal
          numeroCupom={cupom.numero}
          protocoloRecibo={cupom.protocoloRecibo}
          veiculoPlaca={cupom.veiculoPlaca}
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

      {/* MODAL POPUP EXECUTIVO DE PAGAMENTO (CHECKOUT BALCÃO) */}
      <ModalCheckoutPagamento
        isOpen={!!checkoutComanda}
        onClose={() => setCheckoutComanda(null)}
        dados={dadosCheckoutComanda}
        onConfirmarPagamento={handleConfirmarPagamentoCheckout}
      />

      {/* RECIBO EM DUAS VIAS OFICIAL (1ª VIA CLIENTE / 2ª VIA CONTROLE INTERNO CRVA) */}
      <ReciboDuasViasModal
        isOpen={!!reciboDuasVias}
        onClose={() => {
          setReciboDuasVias(null);
          setTimeout(() => buscaRef.current?.focus(), 0);
        }}
        recibo={reciboDuasVias}
      />

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

/* =========================================================================
 *  MODAL DE EDIÇÃO DE SERVIÇO NO CATÁLOGO (RF002 / ADMIN / SUPERVISÃO)
 * ========================================================================= */

function EditarServicoModal({
  servico,
  onClose,
  onAtualizado,
}: {
  servico: ServicoCatalogo;
  onClose: () => void;
  onAtualizado: (s: ServicoCatalogo) => void;
}) {
  const [codigo, setCodigo] = useState(servico.codigo || '');
  const [nome, setNome] = useState(servico.nome || '');
  const [valorStr, setValorStr] = useState(
    servico.valor ? servico.valor.toFixed(2).replace('.', ',') : ''
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      return setErro('Informe a descrição ou ato do serviço.');
    }
    const valNumerico = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(valNumerico) || valNumerico <= 0) {
      return setErro('Informe um valor monetário válido maior que zero.');
    }

    setSalvando(true);
    setErro('');
    try {
      const atualizado = await editarServicoCatalogo({
        id: servico.id,
        codigo: codigo.trim() || undefined,
        nome: nome.trim(),
        valor: valNumerico,
      });
      onAtualizado(atualizado);
    } catch (err: any) {
      setErro(err.message || 'Falha ao atualizar serviço no catálogo.');
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
              <Edit3 size={18} />
            </div>
            <div>
              <h3 className="font-black text-white text-base">Editar Serviço CRVA</h3>
              <p className="text-[11px] text-slate-400">Atualização de código, descrição e tabela de emolumentos</p>
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
              Código Oficial do Serviço
            </label>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="Ex: SRV-0010"
              className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono font-bold text-emerald-400 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
              maxLength={20}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Descrição do Ato Notarial / Serviço <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Transferência de Propriedade de Veículo"
              className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none leading-relaxed"
              maxLength={255}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Valor Base / Emolumento (R$) <span className="text-rose-400">*</span>
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
                <span>Atualizando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                <span>Salvar Alterações</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
