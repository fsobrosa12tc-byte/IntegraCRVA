import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Send,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tag,
  Car
} from 'lucide-react';
import { buscarServicos, inscreverCatalogoRealtime, type ServicoCatalogo } from '../../lib/pdvVendas';
import { formatarBRL, paraCentavos, deCentavos } from '../../lib/pdvCaixa';
import { criarComandaBalcao } from '../../lib/comandasBalcaoService';
import type { ItemComandaBalcao } from '../../types/pdv';

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
  onSucesso: (comandaId: string) => void;
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function ModalCatalogoServicosCRVA({
  clienteNome,
  clienteDocumento,
  clienteId,
  veiculoId,
  veiculoPlaca,
  veiculoModelo,
  protocolo,
  usuarioLogado,
  onFechar,
  onSucesso,
}: ModalCatalogoServicosCRVAProps) {
  const [servicos, setServicos] = useState<ServicoCatalogo[]>([]);
  const [busca, setBusca] = useState('');
  const [itensComanda, setItensComanda] = useState<ItemComanda[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [toastSucesso, setToastSucesso] = useState(false);

  // Carrega catálogo oficial de serviços e sincroniza via Realtime
  useEffect(() => {
    let ativo = true;
    const carregar = () => {
      buscarServicos().then((lista) => {
        if (ativo) {
          setServicos(lista);
        }
      }).catch(() => {});
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

  const servicosFiltrados = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return servicos;
    return servicos.filter(
      (s) => normalizar(s.nome).includes(q) || normalizar(s.codigo).includes(q)
    );
  }, [servicos, busca]);

  const adicionarServico = (srv: ServicoCatalogo) => {
    setErro('');
    setItensComanda((prev) => {
      const idx = prev.findIndex((i) => i.servico.id === srv.id || i.servico.codigo === srv.codigo);
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
    const qtdSegura = Math.max(1, Math.min(99, isNaN(valor) ? 1 : valor));
    setItensComanda((prev) =>
      prev.map((item) => (item.servico.id === id ? { ...item, quantidade: qtdSegura } : item))
    );
  };

  const removerServico = (id: string) => {
    setItensComanda((prev) => prev.filter((i) => i.servico.id !== id));
  };

  // 1. Subtotal dos Serviços
  const subtotalServicos = useMemo(() => {
    if (itensComanda.length === 0) return 0;
    return itensComanda.reduce((acc, i) => acc + (i.quantidade * i.servico.valor), 0);
  }, [itensComanda]);

  // 2. ISSQN Municipal (2,00%)
  const valorIssqn = useMemo(() => {
    if (subtotalServicos === 0) return 0;
    return Math.round((subtotalServicos * 0.02) * 100) / 100;
  }, [subtotalServicos]);

  // 3. Total Cobrado com ISSQN somado
  const valorTotalCobrado = useMemo(() => {
    if (subtotalServicos === 0) return 0;
    return Math.round((subtotalServicos + valorIssqn) * 100) / 100;
  }, [subtotalServicos, valorIssqn]);

  const totalQuantidadeItens = useMemo(() => {
    return itensComanda.reduce((acc, i) => acc + i.quantidade, 0);
  }, [itensComanda]);

  const handleEnviarParaCaixa = async () => {
    if (itensComanda.length === 0) {
      setErro('Adicione ao menos um serviço para enviar a comanda ao caixa.');
      return;
    }

    setEnviando(true);
    setErro('');

    try {
      const atendenteId =
        usuarioLogado?.id ||
        (usuarioLogado?.email_login ? '00000000-0000-0000-0000-000000000001' : '00000000-0000-0000-0000-000000000001');
      const atendenteNome =
        usuarioLogado?.nome || usuarioLogado?.login || usuarioLogado?.email || 'Atendente CRVA';

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

      const comanda = await criarComandaBalcao({
        protocolo: protocolo || null,
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
      setTimeout(() => {
        onSucesso(comanda.id);
      }, 900);
    } catch (err: any) {
      const msgErro = err?.message || 'Falha ao transmitir a comanda para a Frente de Caixa.';
      setErro(`Erro ao enviar comanda ao caixa: ${msgErro}`);
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-hidden animate-fadeIn">
      {/* Toast Flutuante de Sucesso */}
      {toastSucesso && (
        <div
          role="status"
          className="fixed top-6 right-6 z-[120] bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400 font-bold text-sm animate-bounce"
        >
          <CheckCircle2 size={22} className="text-white shrink-0" />
          <span>Comanda enviada com sucesso para a fila do caixa!</span>
        </div>
      )}

      {/* Toast Flutuante de Erro */}
      {erro && (
        <div
          role="alert"
          className="fixed top-6 right-6 z-[120] max-w-md bg-rose-600 text-white px-5 py-4 rounded-2xl shadow-2xl flex items-start gap-3 border border-rose-400 font-bold text-xs animate-fadeIn"
        >
          <AlertCircle size={20} className="text-white shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-black uppercase tracking-wide mb-0.5">Falha no Envio da Comanda</p>
            <p className="font-medium leading-relaxed text-rose-50 break-words">{erro}</p>
          </div>
          <button
            type="button"
            onClick={() => setErro('')}
            className="text-rose-200 hover:text-white bg-transparent border-0 cursor-pointer p-1"
            title="Fechar alerta"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* CONTAINER PRINCIPAL DO MODAL */}
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl text-slate-100">
        
        {/* =====================================================================
         *  1. CABEÇALHO CORPORATIVO FIXO
         * ===================================================================== */}
        <header className="p-5 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
              <ShoppingCart size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-100 tracking-tight truncate">
                  Catálogo de Serviços CRVA · Lançamento de Comanda
                </h2>
                <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-2.5 py-0.5 rounded-full shrink-0 uppercase tracking-wider">
                  SEGREGAÇÃO DE FUNÇÕES · BALCÃO CRVA
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:block text-right">
              <span className="block text-[10px] uppercase font-bold text-slate-500">Atendente Logado</span>
              <span className="text-xs font-semibold text-slate-300">
                {usuarioLogado?.nome || usuarioLogado?.login || 'Atendente CRVA'}
              </span>
            </div>
            <button
              type="button"
              onClick={onFechar}
              disabled={enviando}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all cursor-pointer border-0 bg-transparent disabled:opacity-40"
              title="Fechar Modal (ESC)"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* =====================================================================
         *  FAIXA DE IDENTIFICAÇÃO DO CLIENTE / REQUERENTE
         * ===================================================================== */}
        <section className="px-6 py-2.5 bg-slate-900/50 border-b border-slate-800/60 flex items-center justify-between text-xs text-slate-300 shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <User size={15} className="text-slate-400 shrink-0" />
            <span className="text-slate-400 font-semibold uppercase tracking-wider shrink-0">REQUERENTE:</span>
            <strong className="text-white font-bold truncate">
              {clienteNome || 'Consumidor Balcão CRVA'}
            </strong>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {veiculoPlaca && (
              <span className="font-mono text-xs text-sky-300 bg-sky-950/40 px-2.5 py-1 rounded-md border border-sky-800/50 flex items-center gap-1.5">
                <Car size={13} className="text-sky-400" />
                <span>PLACA: <strong>{veiculoPlaca.toUpperCase()}</strong></span>
              </span>
            )}
            {clienteDocumento ? (
              <span className="font-mono text-slate-200 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
                CPF/CNPJ: <strong className="text-white">{clienteDocumento}</strong>
              </span>
            ) : (
              <span className="font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                Doc não informado
              </span>
            )}
          </div>
        </section>

        {/* =====================================================================
         *  2. GRID PRINCIPAL (DIVISÃO 60/40 - lg:col-span-7 / lg:col-span-5)
         * ===================================================================== */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden min-h-0">
          
          {/* -------------------------------------------------------------------
           *  A. COLUNA ESQUERDA: CATÁLOGO DE SERVIÇOS (lg:col-span-7)
           * ------------------------------------------------------------------- */}
          <div className="lg:col-span-7 flex flex-col h-full overflow-hidden bg-slate-900/40 border border-slate-800/70 rounded-xl p-4 min-h-0">
            {/* Topo da coluna */}
            <div className="mb-3 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Tag size={16} className="text-emerald-400" />
                  Serviços Oficiais DETRAN / CRVA
                </h3>
                <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-950/80 px-2.5 py-0.5 rounded-full border border-slate-700/60">
                  {servicosFiltrados.length} {servicosFiltrados.length === 1 ? 'serviço' : 'serviços'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Selecione os atos e certidões solicitados pelo cliente.
              </p>
            </div>

            {/* Campo de Busca Integrado */}
            <div className="relative mb-3 shrink-0">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por código ou descrição do serviço..."
                className="w-full bg-slate-950/80 border border-slate-700/70 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                autoFocus
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 bg-transparent border-0 cursor-pointer p-0.5"
                  title="Limpar busca"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Lista de Serviços com Scroll Fino */}
            <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 min-h-0 space-y-2">
              {servicosFiltrados.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
                  Nenhum serviço localizado para "{busca}".
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
                      className={`flex items-center justify-between p-3.5 bg-slate-950/50 hover:bg-slate-900 border rounded-xl transition-all duration-150 gap-3 group cursor-pointer ${
                        jaAdicionado
                          ? 'border-emerald-500/40 bg-emerald-950/15 hover:border-emerald-500/60'
                          : 'border-slate-800/80 hover:border-slate-700/90'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded shrink-0">
                            {s.codigo}
                          </span>
                          {jaAdicionado && (
                            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                              Na comanda
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-medium text-slate-200 leading-snug break-words whitespace-normal group-hover:text-white transition-colors">
                          {s.nome}
                        </h4>
                      </div>

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
                          className="bg-emerald-600/90 hover:bg-emerald-500 text-white font-medium text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition-all whitespace-nowrap cursor-pointer border-0"
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
           *  B. COLUNA DIREITA: ITENS DA COMANDA E RESUMO FINANCEIRO (lg:col-span-5)
           * ------------------------------------------------------------------- */}
          <div className="lg:col-span-5 flex flex-col h-full bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 justify-between min-h-0">
            {/* Topo da Comanda */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ShoppingCart size={16} className="text-emerald-400" />
                Itens Selecionados na Comanda
              </h3>
              <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-950 px-2.5 py-0.5 rounded-md border border-slate-800">
                {totalQuantidadeItens} {totalQuantidadeItens === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {/* Lista Rolante de Itens Adicionados */}
            <div className="max-h-[380px] overflow-y-auto pr-2 space-y-2.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent my-3 min-h-0 flex-1">
              {itensComanda.length === 0 ? (
                <div className="py-12 px-6 text-center rounded-xl border border-dashed border-slate-800 bg-slate-950/40 flex flex-col items-center justify-center space-y-2 text-slate-500 my-auto">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-slate-500 flex items-center justify-center border border-slate-800">
                    <ShoppingCart size={18} />
                  </div>
                  <p className="text-xs font-medium max-w-xs leading-relaxed text-slate-400">
                    Nenhum serviço selecionado ainda. Clique em <strong>[+ Adicionar]</strong> no catálogo ao lado para incluir na comanda.
                  </p>
                </div>
              ) : (
                itensComanda.map((item) => {
                  const subtotalItem = deCentavos(paraCentavos(item.servico.valor) * item.quantidade);
                  return (
                    <div
                      key={item.servico.id}
                      className="p-4 bg-slate-950/70 border border-slate-800/90 rounded-xl mb-3 flex flex-col gap-2.5 shadow-sm hover:border-slate-700/80 transition-all"
                    >
                      {/* Linha 1 (Superior): Nome completo com quebra fluida + Subtotal em destaque + Lixeira */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-100 leading-snug flex-1 pr-2 break-words whitespace-normal">
                          {item.servico.nome}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-sm font-bold font-mono text-emerald-400 whitespace-nowrap">
                            {formatarBRL(subtotalItem)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removerServico(item.servico.id)}
                            className="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition-colors ml-2 cursor-pointer border-0 bg-transparent"
                            title="Remover serviço"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Linha 2 (Inferior - Controle Operacional): Indicador Unitário + Controle de Quantidade */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                        <span className="text-xs text-slate-400 font-mono">
                          Unit: {formatarBRL(item.servico.valor)}
                        </span>

                        <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/70 rounded-lg p-0.5 shadow-inner">
                          <button
                            type="button"
                            onClick={() => alterarQuantidade(item.servico.id, -1)}
                            disabled={item.quantidade <= 1}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition-all disabled:opacity-40 cursor-pointer border-0"
                            title="Reduzir quantidade"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="w-9 text-center font-mono font-bold text-slate-100 text-sm select-none">
                            {item.quantidade}
                          </span>
                          <button
                            type="button"
                            onClick={() => alterarQuantidade(item.servico.id, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition-all cursor-pointer border-0"
                            title="Aumentar quantidade"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ===================================================================
             *  3. BLOCO FINANCEIRO AUDITADO & BOTÕES DE AÇÃO (RODAPÉ FIXO)
             * =================================================================== */}
            <div className="pt-2 border-t border-slate-800 shrink-0">
              {/* Quadro de Apuração Fiscal */}
              <div className="p-3.5 bg-slate-950/90 border border-slate-800/90 rounded-xl space-y-1.5">
                <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
                  <span>Subtotal Serviços:</span>
                  <span className="text-slate-200 font-semibold">{formatarBRL(subtotalServicos)}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-amber-400/90 font-mono">
                  <span>(+) ISSQN Municipal (2,00%):</span>
                  <span className="font-semibold">{formatarBRL(valorIssqn)}</span>
                </div>
                <div className="border-t border-slate-800 my-2" />
                <div className="flex justify-between items-baseline pt-0.5">
                  <span className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                    TOTAL DA COMANDA:
                  </span>
                  <span className="text-xl font-extrabold text-emerald-400 font-mono tabular-nums tracking-tight">
                    {formatarBRL(valorTotalCobrado)}
                  </span>
                </div>
              </div>

              {/* Botão de Ação Principal */}
              <button
                type="button"
                onClick={handleEnviarParaCaixa}
                disabled={enviando || itensComanda.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-emerald-950/60 transition-all flex items-center justify-center gap-2 border border-emerald-400/30 text-sm mt-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {enviando ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Transmitindo para o Caixa...</span>
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    <span>ENVIAR PARA PAGAMENTO NO CAIXA (PDV)</span>
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
