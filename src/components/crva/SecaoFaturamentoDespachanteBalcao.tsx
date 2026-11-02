import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  FileText,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Send,
  User,
  Car,
  Tag,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buscarServicos, type ServicoCatalogo } from '../../lib/pdvVendas';
import { formatarBRL } from '../../lib/pdvCaixa';
import {
  lancarFaturaDespachanteBalcao,
} from '../../lib/pdvContaCorrente';
import type {
  Despachante,
  ItemFaturamentoDespachante,
  ReciboFaturamentoDespachante,
} from '../../types/pdv';
import { mascararDocumento, mascararTelefone } from '../../utils/documento';
import ModalReciboFaturamentoDespachante from './ModalReciboFaturamentoDespachante';

interface SecaoFaturamentoDespachanteBalcaoProps {
  clienteNome?: string | null;
  clienteDocumento?: string | null;
  clienteId?: string | null;
  veiculoId?: string | null;
  veiculoPlaca?: string | null;
  veiculoModelo?: string | null;
  servicoSugeridoNome?: string | null;
  usuarioLogado: any;
  onFaturaLancada?: (recibo: ReciboFaturamentoDespachante) => void;
}

export default function SecaoFaturamentoDespachanteBalcao({
  clienteNome,
  clienteDocumento,
  clienteId,
  veiculoId,
  veiculoPlaca,
  veiculoModelo,
  servicoSugeridoNome,
  usuarioLogado,
  onFaturaLancada,
}: SecaoFaturamentoDespachanteBalcaoProps) {
  // Despachantes
  const [despachantes, setDespachantes] = useState<Despachante[]>([]);
  const [carregandoDespachantes, setCarregandoDespachantes] = useState(true);
  const [despachanteIdSelecionado, setDespachanteIdSelecionado] = useState<string>('');
  const [buscaDespachante, setBuscaDespachante] = useState('');
  const [menuDespachanteAberto, setMenuDespachanteAberto] = useState(false);

  // Serviços e Comanda a Prazo
  const [catalogoServicos, setCatalogoServicos] = useState<ServicoCatalogo[]>([]);
  const [itensFaturamento, setItensFaturamento] = useState<ItemFaturamentoDespachante[]>([]);
  const [modalCatalogoAberto, setModalCatalogoAberto] = useState(false);
  const [buscaServico, setBuscaServico] = useState('');

  // Estados de Transação
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [reciboEmitido, setReciboEmitido] = useState<ReciboFaturamentoDespachante | null>(null);

  // Carrega lista de despachantes credenciados
  const carregarDespachantes = async () => {
    setCarregandoDespachantes(true);
    try {
      const { data, error } = await supabase
        .from('despachantes')
        .select('*')
        .order('nome_razao', { ascending: true });

      if (error) {
        console.warn('Erro ao carregar despachantes:', error.message);
        return;
      }

      const lista: Despachante[] = ((data as any[]) || []).map((d) => ({
        id: d.id,
        nome_razao: d.nome_razao || d.razao_social || 'Despachante Parceiro',
        documento: d.documento || d.cnpj || '',
        telefone: d.telefone || '',
        email: d.email || '',
        saldo_devedor: Number(d.saldo_devedor) || 0,
        criado_em: d.criado_em || new Date().toISOString(),
      }));

      setDespachantes(lista);
    } catch (e: any) {
      console.warn('Falha inesperada ao listar despachantes:', e);
    } finally {
      setCarregandoDespachantes(false);
    }
  };

  useEffect(() => {
    carregarDespachantes();
    buscarServicos().then((srvs) => setCatalogoServicos(srvs));
  }, []);

  // Despachante atualmente selecionado
  const despachanteSelecionado = useMemo(() => {
    return despachantes.find((d) => d.id === despachanteIdSelecionado) || null;
  }, [despachantes, despachanteIdSelecionado]);

  // Filtro de despachantes no Combobox
  const despachantesFiltrados = useMemo(() => {
    const q = buscaDespachante.toLowerCase().trim();
    if (!q) return despachantes;
    return despachantes.filter(
      (d) =>
        d.nome_razao.toLowerCase().includes(q) ||
        d.documento.includes(q) ||
        (d.telefone && d.telefone.includes(q))
    );
  }, [despachantes, buscaDespachante]);

  // Filtro no modal de serviços
  const servicosFiltrados = useMemo(() => {
    const q = buscaServico.toLowerCase().trim();
    if (!q) return catalogoServicos;
    return catalogoServicos.filter(
      (s) => s.nome.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)
    );
  }, [catalogoServicos, buscaServico]);

  // Manipulação dos itens da comanda do despachante
  const handleAdicionarServico = (srv: ServicoCatalogo) => {
    setErro(null);
    setItensFaturamento((prev) => {
      const idx = prev.findIndex((i) => i.codigo === srv.codigo);
      if (idx >= 0) {
        const copy = [...prev];
        const novaQtd = copy[idx].quantidade + 1;
        copy[idx] = {
          ...copy[idx],
          quantidade: novaQtd,
          subtotal: Math.round(novaQtd * copy[idx].valor_unitario * 100) / 100,
        };
        return copy;
      }
      return [
        ...prev,
        {
          codigo: srv.codigo,
          servico: srv.nome,
          quantidade: 1,
          valor_unitario: srv.valor,
          subtotal: srv.valor,
        },
      ];
    });
  };

  const handleAlterarQuantidade = (codigo: string, delta: number) => {
    setItensFaturamento((prev) =>
      prev.map((item) => {
        if (item.codigo === codigo) {
          const novaQtd = Math.max(1, item.quantidade + delta);
          return {
            ...item,
            quantidade: novaQtd,
            subtotal: Math.round(novaQtd * item.valor_unitario * 100) / 100,
          };
        }
        return item;
      })
    );
  };

  const handleRemoverItem = (codigo: string) => {
    setItensFaturamento((prev) => prev.filter((i) => i.codigo !== codigo));
  };

  // Cálculos fiscais e totais
  const subtotalServicos = useMemo(() => {
    return Math.round(
      itensFaturamento.reduce((acc, i) => acc + i.subtotal, 0) * 100
    ) / 100;
  }, [itensFaturamento]);

  const valorIssqn = useMemo(() => {
    if (subtotalServicos === 0) return 0;
    return Math.round((subtotalServicos * 0.02) * 100) / 100;
  }, [subtotalServicos]);

  const valorTotalFaturado = useMemo(() => {
    if (subtotalServicos === 0) return 0;
    return Math.round((subtotalServicos + valorIssqn) * 100) / 100;
  }, [subtotalServicos, valorIssqn]);

  // Se houver serviço solicitado preenchido no balcão e lista de faturamento vazia, sugere adicionar
  const podeAdicionarSugerido = useMemo(() => {
    if (!servicoSugeridoNome) return false;
    const jaTem = itensFaturamento.some((i) => i.servico.toLowerCase().includes(servicoSugeridoNome.toLowerCase()));
    return !jaTem;
  }, [servicoSugeridoNome, itensFaturamento]);

  const handleIncluirServicoSugerido = () => {
    if (!servicoSugeridoNome) return;
    const srv = catalogoServicos.find((s) => s.nome.toLowerCase().includes(servicoSugeridoNome.toLowerCase())) || {
      id: 'srv-sug',
      codigo: 'SRV-DETR',
      nome: servicoSugeridoNome,
      valor: 85.00,
    };
    handleAdicionarServico(srv);
  };

  // Gravação do Faturamento no Banco
  const handleConfirmarLancamento = async () => {
    setErro(null);

    if (!despachanteIdSelecionado) {
      setErro('Por favor, selecione o Despachante Parceiro que assumirá a fatura.');
      return;
    }

    if (itensFaturamento.length === 0) {
      setErro('Adicione ao menos um serviço à comanda para confirmar o faturamento.');
      return;
    }

    setGravando(true);

    try {
      const atendenteNome =
        usuarioLogado?.nome || usuarioLogado?.login || usuarioLogado?.email || 'Atendente Balcão CRVA';
      const atendenteId = usuarioLogado?.id || null;

      const recibo = await lancarFaturaDespachanteBalcao({
        despachanteId: despachanteIdSelecionado,
        itens: itensFaturamento,
        atendenteId,
        atendenteNome,
        clienteId: clienteId || null,
        clienteNome: clienteNome || null,
        clienteDocumento: clienteDocumento || null,
        veiculoId: veiculoId || null,
        veiculoPlaca: veiculoPlaca || null,
        veiculoModelo: veiculoModelo || null,
      });

      setReciboEmitido(recibo);
      setItensFaturamento([]);
      if (onFaturaLancada) {
        onFaturaLancada(recibo);
      }

      // Atualiza o saldo localmente para o despachante
      setDespachantes((prev) =>
        prev.map((d) => (d.id === recibo.despachante.id ? recibo.despachante : d))
      );
    } catch (err: any) {
      console.error('Erro ao efetuar lançamento em conta de despachante:', err);
      setErro(err?.message || 'Falha ao registrar fatura do despachante.');
    } finally {
      setGravando(false);
    }
  };

  return (
    <section className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md mb-6 transition-all hover:border-slate-700/60">
      
      {/* =====================================================================
       *  CABEÇALHO DA SEÇÃO: PADRÃO FINTECH DARK
       * ===================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <Building2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-bold text-slate-100 tracking-tight">
                Conta-Corrente de Despachante · Faturamento Direto a Prazo
              </h2>
              <span className="bg-violet-950/60 text-violet-300 border border-violet-500/30 text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                MODO BALCÃO · APENAS A PRAZO
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Lançamento de serviços diretamente na fatura do despachante (independe de operador de caixa ativo).
            </p>
          </div>
        </div>

        {/* Indicador de Segregação */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] font-mono text-slate-400">
          <ShieldCheck size={14} className="text-violet-400" />
          <span>Segregação Auditada</span>
        </div>
      </div>

      {/* Alerta de Erro */}
      {erro && (
        <div className="mb-4 p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-400 shrink-0" />
            <span>{erro}</span>
          </div>
          <button
            type="button"
            onClick={() => setErro(null)}
            className="text-rose-400 hover:text-white bg-transparent border-0 cursor-pointer p-0.5"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* =====================================================================
       *  1. SELEÇÃO DO DESPACHANTE PARCEIRO (COMBOBOX REATIVO)
       * ===================================================================== */}
      <div className="mb-5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
          1. Despachante Parceiro Responsável:
        </label>

        <div className="relative">
          <div
            onClick={() => setMenuDespachanteAberto(!menuDespachanteAberto)}
            className={`w-full bg-slate-950/80 border rounded-xl px-4 py-3 text-sm flex items-center justify-between cursor-pointer transition-all ${
              despachanteSelecionado
                ? 'border-violet-500/50 bg-slate-950 text-white'
                : 'border-slate-700/80 text-slate-400 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Building2 size={16} className={despachanteSelecionado ? 'text-violet-400' : 'text-slate-500'} />
              {despachanteSelecionado ? (
                <div className="truncate">
                  <span className="font-bold text-white mr-2">{despachanteSelecionado.nome_razao}</span>
                  <span className="text-xs font-mono text-slate-400 mr-2">
                    ({mascararDocumento(despachanteSelecionado.documento)})
                  </span>
                  <span className="text-xs font-mono font-semibold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
                    Saldo: {formatarBRL(despachanteSelecionado.saldo_devedor)}
                  </span>
                </div>
              ) : (
                <span className="text-slate-400">
                  {carregandoDespachantes ? 'Carregando despachantes...' : 'Clique para selecionar o despachante parceiro...'}
                </span>
              )}
            </div>
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${menuDespachanteAberto ? 'rotate-180' : ''}`} />
          </div>

          {/* Dropdown Flutuante de Busca */}
          {menuDespachanteAberto && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-3 backdrop-blur-xl animate-fadeIn">
              <div className="relative mb-2">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={buscaDespachante}
                  onChange={(e) => setBuscaDespachante(e.target.value)}
                  placeholder="Pesquisar por nome, CNPJ ou telefone..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  autoFocus
                />
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-slate-700 pr-1">
                {despachantesFiltrados.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    Nenhum despachante encontrado para "{buscaDespachante}".
                  </div>
                ) : (
                  despachantesFiltrados.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => {
                        setDespachanteIdSelecionado(d.id);
                        setMenuDespachanteAberto(false);
                        setBuscaDespachante('');
                        setErro(null);
                      }}
                      className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between text-xs ${
                        despachanteIdSelecionado === d.id
                          ? 'bg-violet-950/60 border border-violet-500/40 text-white'
                          : 'hover:bg-slate-900 text-slate-300'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <strong className="block text-slate-100 font-bold truncate">{d.nome_razao}</strong>
                        <span className="text-[11px] font-mono text-slate-400">
                          {mascararDocumento(d.documento)} {d.telefone ? `· ${mascararTelefone(d.telefone)}` : ''}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-500 block">Saldo Devedor</span>
                        <span className="font-mono font-semibold text-amber-400">
                          {formatarBRL(d.saldo_devedor)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Card Informativo do Despachante Selecionado */}
        {despachanteSelecionado && (
          <div className="mt-2.5 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 font-semibold uppercase text-[10px]">Credenciamento:</span>
              <span className="text-slate-200 font-mono">{mascararDocumento(despachanteSelecionado.documento)}</span>
              {despachanteSelecionado.telefone && (
                <span className="text-slate-400 font-mono hidden sm:inline">
                  {mascararTelefone(despachanteSelecionado.telefone)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Saldo Devedor Atual:</span>
              <strong className="font-mono text-amber-400 font-bold">
                {formatarBRL(despachanteSelecionado.saldo_devedor)}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
       *  2. ITENS DA FATURA & CATÁLOGO CRVA
       * ===================================================================== */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
            2. Atos e Serviços do Catálogo CRVA a Faturar:
          </label>
          <button
            type="button"
            onClick={() => setModalCatalogoAberto(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/40 hover:border-violet-500/60 text-xs font-semibold transition-all cursor-pointer shadow-sm"
          >
            <Plus size={14} className="text-violet-400" />
            <span>+ Adicionar Serviços do Catálogo CRVA</span>
          </button>
        </div>

        {/* Sugestão de serviço oriundo do formulário de atendimento */}
        {podeAdicionarSugerido && servicoSugeridoNome && (
          <div className="mb-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Tag size={14} className="text-emerald-400 shrink-0" />
              <span className="text-slate-300 truncate">
                Serviço selecionado no balcão: <strong className="text-white">{servicoSugeridoNome}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={handleIncluirServicoSugerido}
              className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-semibold text-xs whitespace-nowrap cursor-pointer transition-colors"
            >
              + Incluir nesta Fatura
            </button>
          </div>
        )}

        {/* Lista de Serviços Selecionados */}
        {itensFaturamento.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-center text-slate-500 text-xs">
            <FileText size={22} className="mx-auto mb-2 text-slate-600" />
            <p>Nenhum serviço adicionado à fatura ainda.</p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Clique no botão acima para escolher os atos notariais e certidões no catálogo.
            </p>
          </div>
        ) : (
          <div className="space-y-2 border border-slate-800 rounded-xl p-2.5 bg-slate-950/40">
            {itensFaturamento.map((item) => (
              <div
                key={item.codigo}
                className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs hover:border-slate-700/80 transition-all"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                      {item.codigo}
                    </span>
                    <strong className="text-slate-200 font-semibold truncate">{item.servico}</strong>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Unitário: {formatarBRL(item.valor_unitario)}
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Controles de Quantidade */}
                  <div className="inline-flex items-center bg-slate-900 border border-slate-700/80 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => handleAlterarQuantidade(item.codigo, -1)}
                      className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors border-0 cursor-pointer"
                      title="Diminuir"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="w-6 text-center font-mono font-bold text-white text-xs">
                      {item.quantidade}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAlterarQuantidade(item.codigo, 1)}
                      className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors border-0 cursor-pointer"
                      title="Aumentar"
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  {/* Subtotal do Item */}
                  <span className="font-mono font-bold text-slate-200 w-20 text-right">
                    {formatarBRL(item.subtotal)}
                  </span>

                  {/* Remover Item */}
                  <button
                    type="button"
                    onClick={() => handleRemoverItem(item.codigo)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border-0 bg-transparent cursor-pointer"
                    title="Remover serviço"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =====================================================================
       *  3. APURAÇÃO FISCAL OBRIGATÓRIA (SUBTOTAL + ISSQN 2% = TOTAL FATURADO)
       * ===================================================================== */}
      <div className="mb-6 p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs font-mono">
        <div className="flex justify-between items-center text-slate-400">
          <span>Subtotal dos Serviços:</span>
          <span className="font-semibold text-slate-200">{formatarBRL(subtotalServicos)}</span>
        </div>
        <div className="flex justify-between items-center text-amber-400/90">
          <span>(+) ISSQN Municipal (2,00%):</span>
          <span className="font-semibold">{formatarBRL(valorIssqn)}</span>
        </div>
        <div className="border-t border-slate-800 my-2" />
        <div className="flex justify-between items-baseline pt-0.5">
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
            VALOR TOTAL FATURADO A PRAZO:
          </span>
          <span className="text-lg font-black text-violet-400 font-mono tracking-tight">
            {formatarBRL(valorTotalFaturado)}
          </span>
        </div>
      </div>

      {/* =====================================================================
       *  4. BOTÃO DE GRAVAÇÃO DIRETA
       * ===================================================================== */}
      <button
        type="button"
        disabled={gravando || !despachanteIdSelecionado || itensFaturamento.length === 0}
        onClick={handleConfirmarLancamento}
        className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-violet-950/50 transition-all flex items-center justify-center gap-2 border border-violet-400/30 text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {gravando ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span>Gravando Fatura e Atualizando Saldo...</span>
          </>
        ) : (
          <>
            <FileText size={16} />
            <span>📄 Confirmar Lançamento na Conta do Despachante</span>
          </>
        )}
      </button>

      {/* =====================================================================
       *  MODAL: SELEÇÃO DE SERVIÇOS DO CATÁLOGO CRVA
       * ===================================================================== */}
      {modalCatalogoAberto && (
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-hidden animate-fadeIn">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Topo do Modal de Catálogo */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Tag size={18} className="text-violet-400" />
                <h3 className="text-sm font-bold text-white">Catálogo de Serviços CRVA · DETRAN-RS</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalCatalogoAberto(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 bg-transparent border-0 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Busca */}
            <div className="p-3 border-b border-slate-800 bg-slate-950/50">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={buscaServico}
                  onChange={(e) => setBuscaServico(e.target.value)}
                  placeholder="Pesquisar por código ou descrição do serviço..."
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  autoFocus
                />
              </div>
            </div>

            {/* Lista de Serviços */}
            <div className="p-3 overflow-y-auto space-y-2 flex-1 scrollbar-thin scrollbar-thumb-slate-700">
              {servicosFiltrados.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Nenhum serviço localizado para "{buscaServico}".
                </div>
              ) : (
                servicosFiltrados.map((s) => {
                  const jaAdicionado = itensFaturamento.some((i) => i.codigo === s.codigo);
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleAdicionarServico(s)}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        jaAdicionado
                          ? 'bg-violet-950/30 border-violet-500/40 hover:border-violet-500/60'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                            {s.codigo}
                          </span>
                          {jaAdicionado && (
                            <span className="text-[10px] font-semibold text-violet-300 bg-violet-900/40 px-1.5 py-0.5 rounded">
                              Na comanda
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-medium text-slate-200 leading-snug break-words">
                          {s.nome}
                        </h4>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono font-bold text-violet-400">
                          {formatarBRL(s.valor)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdicionarServico(s);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs flex items-center gap-1 shadow-sm border-0 cursor-pointer"
                        >
                          <Plus size={12} />
                          <span>Adicionar</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Rodapé do Modal de Catálogo */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">
                {itensFaturamento.length} {itensFaturamento.length === 1 ? 'item selecionado' : 'itens selecionados'}
              </span>
              <button
                type="button"
                onClick={() => setModalCatalogoAberto(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 cursor-pointer"
              >
                Concluir Seleção
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =====================================================================
       *  MODAL: RECIBO OFICIAL DE LANÇAMENTO A PRAZO
       * ===================================================================== */}
      {reciboEmitido && (
        <ModalReciboFaturamentoDespachante
          recibo={reciboEmitido}
          onFechar={() => setReciboEmitido(null)}
        />
      )}

    </section>
  );
}

