import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tag,
  Car,
  Receipt,
  CreditCard,
  FileText,
} from 'lucide-react';
import { buscarServicos, inscreverCatalogoRealtime, type ServicoCatalogo } from '../../lib/pdvVendas';
import { formatarBRL, paraCentavos, deCentavos } from '../../lib/pdvCaixa';
import { criarComandaBalcao } from '../../lib/comandasBalcaoService';
import type { ComandaBalcao, ItemComandaBalcao } from '../../types/pdv';

export interface ItemComanda {
  servico: ServicoCatalogo;
  quantidade: number;
}

interface ModalCatalogoServicosCRVAProps {
  clienteNome: string;
  clienteDocumento: string;
  clienteId?: string | null;
  veiculoId?: string | null;
  veiculoPlaca?: string | null;
  veiculoModelo?: string | null;
  protocolo?: string | null;
  servicoInicialNome?: string;
  usuarioLogado: any;
  onFechar: () => void;
  onConfirmar?: (comanda: ComandaBalcao, numeroRecibo: string) => Promise<void> | void;
  onSucesso?: (comandaId: string, numeroRecibo?: string) => void;
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const GRUPOS_FILTRO = ['Todos', 'Certidões', 'Digitalização', 'Alterações', 'Autorizações'] as const;
type GrupoFiltro = (typeof GRUPOS_FILTRO)[number];

export default function ModalCatalogoServicosCRVA({
  clienteNome,
  clienteDocumento,
  clienteId,
  veiculoId,
  veiculoPlaca,
  veiculoModelo,
  protocolo,
  usuarioLogado,
  servicoInicialNome,
  onFechar,
  onConfirmar,
  onSucesso,
}: ModalCatalogoServicosCRVAProps) {
  const [servicos, setServicos] = useState<ServicoCatalogo[]>([]);
  const [busca, setBusca] = useState('');
  const [grupoAtivo, setGrupoAtivo] = useState<GrupoFiltro>('Todos');
  const [itensComanda, setItensComanda] = useState<ItemComanda[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [toastSucesso, setToastSucesso] = useState(false);

  // Carrega catálogo oficial de serviços e sincroniza via Realtime
  useEffect(() => {
    let ativo = true;
    const carregar = () => {
      buscarServicos()
        .then((lista) => {
          if (ativo) {
            setServicos(lista);
          }
        })
        .catch(() => {});
    };

    carregar();
    const cancelarRealtime = inscreverCatalogoRealtime(() => {
      carregar();
    });

    return () => {
      ativo = false;
      cancelarRealtime();
    };
  }, []);

  // Pré-seleciona automaticamente o ato inicial escolhido no balcão
  useEffect(() => {
    if (servicoInicialNome && servicos.length > 0 && itensComanda.length === 0) {
      const match = servicos.find((s) => {
        const nSrv = normalizar(s.nome);
        const nBusca = normalizar(servicoInicialNome);
        return nSrv.includes(nBusca) || nBusca.includes(nSrv);
      });
      if (match) {
        setItensComanda([{ servico: match, quantidade: 1 }]);
      }
    }
  }, [servicos, servicoInicialNome]);

  // Função classificadora por grupo rápido
  const pertenceAoGrupo = (s: ServicoCatalogo, grupo: GrupoFiltro) => {
    if (grupo === 'Todos') return true;
    const n = normalizar(s.nome);
    if (grupo === 'Certidões') {
      return (
        n.includes('certid') ||
        n.includes('2ª via') ||
        n.includes('segunda via') ||
        n.includes('crlv') ||
        n.includes('crv') ||
        n.includes('cert')
      );
    }
    if (grupo === 'Digitalização') {
      return (
        n.includes('digitaliz') ||
        n.includes('copia') ||
        n.includes('cópia') ||
        n.includes('fotocopia') ||
        n.includes('fotocópia') ||
        n.includes('folha') ||
        n.includes('documento')
      );
    }
    if (grupo === 'Alterações') {
      return (
        n.includes('altera') ||
        n.includes('inclusao') ||
        n.includes('inclusão') ||
        n.includes('liberacao') ||
        n.includes('liberação') ||
        n.includes('mudanca') ||
        n.includes('mudança') ||
        n.includes('baixa') ||
        n.includes('gravame') ||
        n.includes('transferencia') ||
        n.includes('transferência')
      );
    }
    if (grupo === 'Autorizações') {
      return (
        n.includes('autoriz') ||
        n.includes('licenca') ||
        n.includes('licença') ||
        n.includes('experiencia') ||
        n.includes('experiência') ||
        n.includes('placa') ||
        n.includes('comunicacao') ||
        n.includes('comunicação') ||
        n.includes('vistoria') ||
        n.includes('emplac')
      );
    }
    return true;
  };

  const servicosFiltrados = useMemo(() => {
    const q = normalizar(busca.trim());
    return servicos.filter((s) => {
      const matchTexto =
        !q || normalizar(s.nome).includes(q) || normalizar(s.codigo).includes(q);
      const matchGrupo = pertenceAoGrupo(s, grupoAtivo);
      return matchTexto && matchGrupo;
    });
  }, [servicos, busca, grupoAtivo]);

  const adicionarServico = (srv: ServicoCatalogo) => {
    setErro('');
    setItensComanda((prev) => {
      const idx = prev.findIndex(
        (i) => i.servico.id === srv.id || i.servico.codigo === srv.codigo
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantidade: copy[idx].quantidade + 1 };
        return copy;
      }
      return [...prev, { servico: srv, quantidade: 1 }];
    });
  };

  const alterarQuantidade = (id: string, delta: number) => {
    setItensComanda((prev) =>
      prev.map((item) => {
        if (item.servico.id === id) {
          const novaQtd = Math.max(1, item.quantidade + delta);
          return { ...item, quantidade: novaQtd };
        }
        return item;
      })
    );
  };

  const definirQuantidade = (id: string, valor: number) => {
    const qtdSegura = Math.max(1, Math.min(999, isNaN(valor) ? 1 : valor));
    setItensComanda((prev) =>
      prev.map((item) =>
        item.servico.id === id ? { ...item, quantidade: qtdSegura } : item
      )
    );
  };

  const removerServico = (id: string) => {
    setItensComanda((prev) => prev.filter((i) => i.servico.id !== id));
  };

  // 1. Subtotal dos Serviços
  const subtotalServicos = useMemo(() => {
    if (itensComanda.length === 0) return 0;
    return itensComanda.reduce((acc, i) => acc + i.quantidade * i.servico.valor, 0);
  }, [itensComanda]);

  // 2. ISSQN Municipal (2,00%)
  const valorIssqn = useMemo(() => {
    if (subtotalServicos === 0) return 0;
    return Math.round(subtotalServicos * 0.02 * 100) / 100;
  }, [subtotalServicos]);

  // 3. Total Cobrado com ISSQN somado
  const valorTotalCobrado = useMemo(() => {
    if (subtotalServicos === 0) return 0;
    return Math.round((subtotalServicos + valorIssqn) * 100) / 100;
  }, [subtotalServicos, valorIssqn]);

  const totalQuantidadeItens = useMemo(() => {
    return itensComanda.reduce((acc, i) => acc + i.quantidade, 0);
  }, [itensComanda]);

  const handleConfirmarLancamento = async () => {
    if (itensComanda.length === 0) {
      setErro('Adicione ao menos um serviço para confirmar o lançamento da comanda.');
      return;
    }

    setEnviando(true);
    setErro('');

    try {
      const atendenteId =
        usuarioLogado?.id ||
        (usuarioLogado?.email_login
          ? '00000000-0000-0000-0000-000000000001'
          : '00000000-0000-0000-0000-000000000001');
      const atendenteNome =
        usuarioLogado?.nome ||
        usuarioLogado?.login ||
        usuarioLogado?.email ||
        'Atendente CRVA';

      // 1. Gera número oficial e exclusivo de recibo / protocolo (REC-2026-XXXXX)
      const anoAtual = new Date().getFullYear();
      const aleatorio = Math.floor(10000 + Math.random() * 90000);
      const numeroReciboGerado =
        protocolo && protocolo.startsWith('REC-')
          ? protocolo
          : `REC-${anoAtual}-${aleatorio}`;

      const itensPayload: ItemComandaBalcao[] = itensComanda.map((item) => {
        const subtotal = deCentavos(paraCentavos(item.servico.valor) * item.quantidade);
        return {
          codigo: item.servico.codigo,
          servico: item.servico.nome,
          quantidade: item.quantidade,
          valor_unitario: item.servico.valor,
          subtotal,
        };
      });

      // 2. Gravação atômica na tabela public.comandas_balcao
      const comanda = await criarComandaBalcao({
        protocolo: numeroReciboGerado,
        cliente_nome: clienteNome || 'Consumidor Balcão CRVA',
        cliente_documento: clienteDocumento || null,
        cliente_id: clienteId || null,
        veiculo_id: veiculoId || null,
        veiculo_placa: veiculoPlaca || null,
        veiculo_modelo: veiculoModelo || null,
        atendente_id: atendenteId,
        atendente_nome: atendenteNome,
        itens: itensPayload,
      });

      setItensComanda([]);
      setToastSucesso(true);

      // 3. Aciona o callback de emissão com o número oficial do recibo gerado
      if (onConfirmar) {
        await onConfirmar(comanda, numeroReciboGerado);
      } else if (onSucesso) {
        onSucesso(comanda.id, numeroReciboGerado);
      }
    } catch (err: any) {
      const msgErro =
        err?.message || 'Falha ao transmitir a comanda para a Frente de Caixa.';
      setErro(`Erro ao gravar comanda no PDV: ${msgErro}`);
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in select-none">
      {/* Toast Flutuante de Sucesso */}
      {toastSucesso && (
        <div
          role="status"
          className="fixed top-6 right-6 z-[120] bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400 font-bold text-sm animate-bounce"
        >
          <CheckCircle2 size={20} className="text-white shrink-0" />
          <span>Comanda lançada com sucesso no PDV!</span>
        </div>
      )}

      {/* Toast Flutuante de Erro */}
      {erro && (
        <div
          role="alert"
          className="fixed top-6 right-6 z-[120] max-w-md bg-rose-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-start gap-3 border border-rose-400 font-bold text-xs animate-fadeIn"
        >
          <AlertCircle size={18} className="text-white shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-wide mb-0.5">
              Falha no Lançamento da Comanda
            </p>
            <p className="font-medium leading-relaxed text-rose-50 break-words">{erro}</p>
          </div>
          <button
            type="button"
            onClick={() => setErro('')}
            className="text-rose-200 hover:text-white bg-transparent border-0 cursor-pointer p-1"
            title="Fechar alerta"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* =====================================================================
       *  CONTAINER PRINCIPAL EXPANDIDO (MAX-W-7XL • H-[88VH])
       * ===================================================================== */}
      <div className="max-w-7xl w-full mx-auto h-[88vh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* =====================================================================
         *  1. BARRA SUPERIOR COMPACTA E INTEGRADA
         * ===================================================================== */}
        <header className="px-5 py-3 border-b border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Identidade do Modal */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
              <Receipt size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight truncate flex items-center gap-2">
                <span>Lançamento Obrigatório de Comanda • PDV</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse hidden sm:inline-block" />
              </h2>
            </div>
          </div>

          {/* Chips de Identificação do Atendimento (Alinhados Horizontalmente) */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Requerente */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <User size={13} className="text-slate-400 shrink-0" />
              <span className="text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                Requerente:
              </span>
              <strong className="text-slate-100 font-bold truncate max-w-[140px] sm:max-w-[200px]">
                {clienteNome || 'Consumidor Balcão CRVA'}
              </strong>
            </div>

            {/* Placa */}
            {veiculoPlaca && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-950/40 border border-sky-800/40 text-xs font-mono text-sky-300">
                <Car size={13} className="text-sky-400 shrink-0" />
                <span>
                  PLACA: <strong>{veiculoPlaca.toUpperCase()}</strong>
                </span>
              </div>
            )}

            {/* CPF / CNPJ */}
            {clienteDocumento && (
              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
                <span>CPF/CNPJ: <strong>{clienteDocumento}</strong></span>
              </div>
            )}

            {/* Atendente Logado */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-slate-400 text-[11px]">Operador:</span>
              <span className="font-medium truncate max-w-[120px]">
                {usuarioLogado?.nome || usuarioLogado?.login || 'Atendente CRVA'}
              </span>
            </div>
          </div>

          {/* Botão Fechar */}
          <button
            type="button"
            onClick={onFechar}
            disabled={enviando}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all cursor-pointer border-0 bg-transparent disabled:opacity-40"
            title="Fechar Modal (ESC)"
          >
            <X size={18} />
          </button>
        </header>

        {/* =====================================================================
         *  2. GRID PRINCIPAL (7 COLUNAS CATÁLOGO / 5 COLUNAS COMANDA)
         * ===================================================================== */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 flex-1 overflow-hidden min-h-0 bg-slate-900">
          
          {/* -------------------------------------------------------------------
           *  LADO ESQUERDO — CATÁLOGO DE SERVIÇOS (lg:col-span-7)
           * ------------------------------------------------------------------- */}
          <div className="lg:col-span-7 flex flex-col h-full overflow-hidden min-h-0">
            {/* Topo: Busca + Pílulas de Filtro Rápido */}
            <div className="mb-3 space-y-2.5 shrink-0">
              {/* Campo de Busca Rápida */}
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por código ou descrição do serviço..."
                  className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-10 pr-9 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                  autoFocus
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 bg-transparent border-0 cursor-pointer p-0.5"
                    title="Limpar busca"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Pílulas de Filtro Rápido por Grupo */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {GRUPOS_FILTRO.map((grupo) => {
                  const ativo = grupoAtivo === grupo;
                  return (
                    <button
                      key={grupo}
                      type="button"
                      onClick={() => setGrupoAtivo(grupo)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                        ativo
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {grupo}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lista Densa e Ampla de Serviços (Linhas Horizontais Compactas) */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-700 min-h-0">
              {servicosFiltrados.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
                  Nenhum serviço localizado no catálogo com os filtros atuais.
                </div>
              ) : (
                servicosFiltrados.map((s) => {
                  const jaAdicionado = itensComanda.some(
                    (i) => i.servico.id === s.id || i.servico.codigo === s.codigo
                  );

                  return (
                    <div
                      key={s.id}
                      onClick={() => adicionarServico(s)}
                      className={`flex items-center justify-between gap-3 p-3 bg-slate-950/60 hover:bg-slate-800/80 border rounded-xl transition-all duration-150 group cursor-pointer ${
                        jaAdicionado
                          ? 'border-emerald-500/40 bg-emerald-950/15 hover:border-emerald-500/60'
                          : 'border-slate-800/80 hover:border-slate-700/90'
                      }`}
                    >
                      {/* Esquerda: Código + Descrição */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-1">
                        <span className="text-[11px] font-mono text-slate-400 bg-slate-900 border border-slate-700/70 px-2 py-0.5 rounded shrink-0">
                          {s.codigo || 'SRV-CRVA'}
                        </span>
                        <h4 className="text-sm font-medium text-slate-100 line-clamp-2 leading-tight group-hover:text-white transition-colors">
                          {s.nome}
                        </h4>
                      </div>

                      {/* Direita: Valor Unitário + Botão Adicionar */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold text-emerald-400 font-mono whitespace-nowrap">
                          {formatarBRL(s.valor)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            adicionarServico(s);
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg whitespace-nowrap flex items-center gap-1 shadow-sm transition-all cursor-pointer border-0 active:scale-95"
                          title="Adicionar à ordem de serviço"
                        >
                          <Plus size={13} />
                          <span>Adicionar</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* -------------------------------------------------------------------
           *  LADO DIREITO — ITENS SELECIONADOS NA COMANDA (lg:col-span-5)
           * ------------------------------------------------------------------- */}
          <div className="lg:col-span-5 flex flex-col h-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 min-h-0 justify-between">
            {/* Topo da Comanda */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ShoppingCart size={16} className="text-emerald-400" />
                <span>Itens Selecionados na Comanda</span>
              </h3>
              <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-900 px-2.5 py-0.5 rounded-md border border-slate-800">
                {totalQuantidadeItens} {totalQuantidadeItens === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {/* Lista Rolante de Itens Adicionados com Controle de Quantidade */}
            <div className="flex-1 overflow-y-auto space-y-2.5 my-3 pr-1 scrollbar-thin scrollbar-thumb-slate-800 min-h-0">
              {itensComanda.length === 0 ? (
                <div className="py-12 px-6 text-center rounded-xl border border-dashed border-slate-800/80 bg-slate-950/40 flex flex-col items-center justify-center space-y-2 text-slate-500 my-auto">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-slate-500 flex items-center justify-center border border-slate-800">
                    <ShoppingCart size={18} />
                  </div>
                  <p className="text-xs font-medium max-w-xs leading-relaxed text-slate-400">
                    Nenhum serviço selecionado ainda. Clique em <strong>[+ Adicionar]</strong> no catálogo ao lado para incluir na comanda.
                  </p>
                </div>
              ) : (
                itensComanda.map((item) => {
                  const subtotalItem = deCentavos(
                    paraCentavos(item.servico.valor) * item.quantidade
                  );

                  return (
                    <div
                      key={item.servico.id}
                      className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-2 shadow-sm hover:border-slate-700 transition-all"
                    >
                      {/* Linha 1: Nome do serviço e Subtotal */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 pr-2">
                          <h4 className="text-sm font-medium text-slate-100 line-clamp-2 leading-tight">
                            {item.servico.nome}
                          </h4>
                          <span className="text-xs text-slate-400 font-mono mt-0.5 block">
                            Unitário: {formatarBRL(item.servico.valor)}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-slate-100 font-mono whitespace-nowrap pt-0.5">
                          {formatarBRL(subtotalItem)}
                        </span>
                      </div>

                      {/* Linha 2: Controle de Quantidade Interativo e Lixeira */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/70">
                        <div className="flex items-center gap-1 bg-slate-950 border border-slate-700/80 rounded-lg p-0.5 shadow-inner">
                          <button
                            type="button"
                            onClick={() => alterarQuantidade(item.servico.id, -1)}
                            disabled={item.quantidade <= 1}
                            className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all disabled:opacity-30 cursor-pointer border-0"
                            title="Reduzir quantidade"
                          >
                            <Minus size={13} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max="999"
                            value={item.quantidade}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              definirQuantidade(item.servico.id, isNaN(v) ? 1 : v);
                            }}
                            className="w-12 text-center font-mono font-bold text-slate-100 text-xs bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            title="Editar quantidade diretamente"
                          />
                          <button
                            type="button"
                            onClick={() => alterarQuantidade(item.servico.id, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer border-0"
                            title="Aumentar quantidade"
                          >
                            <Plus size={13} />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removerServico(item.servico.id)}
                          className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer border-0 bg-transparent flex items-center gap-1 text-xs"
                          title="Remover serviço da comanda"
                        >
                          <Trash2 size={14} />
                          <span className="text-[11px] hidden sm:inline">Excluir</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ===================================================================
             *  RODAPÉ FIXO DE FECHAMENTO FINANCEIRO
             * =================================================================== */}
            <div className="pt-2 border-t border-slate-800 shrink-0">
              {/* Resumo Financeiro Compacto */}
              <div className="p-3.5 bg-slate-950/90 border border-slate-800/90 rounded-xl space-y-1.5">
                <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
                  <span>Subtotal Serviços:</span>
                  <span className="text-slate-200 font-semibold">{formatarBRL(subtotalServicos)}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-amber-400/90 font-mono">
                  <span>(+) ISSQN Municipal (2,00%):</span>
                  <span className="font-semibold">{formatarBRL(valorIssqn)}</span>
                </div>
                <div className="border-t border-slate-800 my-1.5" />
                <div className="flex justify-between items-baseline pt-0.5">
                  <span className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                    TOTAL DA COMANDA:
                  </span>
                  <span className="text-lg font-bold text-emerald-400 font-mono tabular-nums tracking-tight">
                    {formatarBRL(valorTotalCobrado)}
                  </span>
                </div>
              </div>

              {/* Botão Primário de Destaque */}
              <button
                type="button"
                onClick={handleConfirmarLancamento}
                disabled={enviando || itensComanda.length === 0}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 font-semibold text-white rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm mt-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-0 active:scale-[0.99]"
              >
                {enviando ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Confirmando no PDV & Emitindo Requerimento...</span>
                  </>
                ) : (
                  <>
                    <CreditCard size={16} />
                    <span>Confirmar Lançamento no PDV & Emitir Requerimento</span>
                  </>
                )}
              </button>
            </div>

          </div>

        </main>
      </div>
    </div>
  );
}
