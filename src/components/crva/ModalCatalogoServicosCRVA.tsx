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
  FileText,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Sparkles,
  ShieldCheck,
  Tag,
  Loader2
} from 'lucide-react';
import { buscarServicos, type ServicoCatalogo } from '../../lib/pdvVendas';
import { formatarBRL, calcularISSQN, paraCentavos, deCentavos } from '../../lib/pdvCaixa';
import { criarComandaBalcao } from '../../lib/comandasBalcaoService';
import type { ItemComandaBalcao } from '../../types/pdv';

interface ModalCatalogoServicosCRVAProps {
  clienteNome: string;
  clienteDocumento: string;
  servicoInicialNome?: string;
  usuarioLogado: any;
  onFechar: () => void;
  onSucesso: (comandaId: string) => void;
}

interface ItemSelecionado {
  servico: ServicoCatalogo;
  quantidade: number;
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function ModalCatalogoServicosCRVA({
  clienteNome,
  clienteDocumento,
  servicoInicialNome,
  usuarioLogado,
  onFechar,
  onSucesso,
}: ModalCatalogoServicosCRVAProps) {
  const [servicos, setServicos] = useState<ServicoCatalogo[]>([]);
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState<ItemSelecionado[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [toastSucesso, setToastSucesso] = useState(false);

  // Carrega os serviços oficiais
  useEffect(() => {
    buscarServicos().then((lista) => {
      setServicos(lista);

      // Se houver um serviço inicial do requerimento, já adiciona à comanda
      if (servicoInicialNome) {
        const normInicial = normalizar(servicoInicialNome);
        const match = lista.find(
          (s) =>
            normalizar(s.nome).includes(normInicial) ||
            normInicial.includes(normalizar(s.nome.split(':')[0]))
        );
        if (match) {
          setItens([{ servico: match, quantidade: 1 }]);
        } else if (lista.length > 0) {
          // Cria serviço representativo do formulário se não estiver no catálogo
          const itemDinamico: ServicoCatalogo = {
            id: `req-${Date.now()}`,
            codigo: 'SRV-REQ',
            nome: servicoInicialNome,
            valor: 65.00,
          };
          setItens([{ servico: itemDinamico, quantidade: 1 }]);
        }
      }
    });
  }, [servicoInicialNome]);

  const servicosFiltrados = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return servicos;
    return servicos.filter(
      (s) => normalizar(s.nome).includes(q) || normalizar(s.codigo).includes(q)
    );
  }, [servicos, busca]);

  const adicionarServico = (srv: ServicoCatalogo) => {
    setErro('');
    setItens((prev) => {
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
    setItens((prev) =>
      prev
        .map((item) => {
          if (item.servico.id === id) {
            const novaQtd = item.quantidade + delta;
            return novaQtd > 0 ? { ...item, quantidade: novaQtd } : null;
          }
          return item;
        })
        .filter(Boolean) as ItemSelecionado[]
    );
  };

  const removerServico = (id: string) => {
    setItens((prev) => prev.filter((i) => i.servico.id !== id));
  };

  // 1. Subtotal dos Serviços prestados
  const subtotalServicos = useMemo(() => {
    return itens.reduce((acc, i) => acc + (i.quantidade * i.servico.valor), 0);
  }, [itens]);

  // 2. Cálculo do ISSQN (2,00%)
  const valorIssqn = useMemo(() => {
    return Math.round((subtotalServicos * 0.02) * 100) / 100;
  }, [subtotalServicos]);

  // 3. Total Final Obrigatório (COM O ISSQN SOMADO)
  const valorTotalCobrado = useMemo(() => {
    return Math.round((subtotalServicos + valorIssqn) * 100) / 100;
  }, [subtotalServicos, valorIssqn]);

  const handleEnviarParaCaixa = async () => {
    if (itens.length === 0) {
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

      const itensComanda: ItemComandaBalcao[] = itens.map((item) => {
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
        cliente_nome: clienteNome || 'Consumidor Balcão CRVA',
        cliente_documento: clienteDocumento || null,
        atendente_id: atendenteId,
        atendente_nome: atendenteNome,
        itens: itensComanda,
      });

      setToastSucesso(true);
      setTimeout(() => {
        onSucesso(comanda.id);
      }, 1200);
    } catch (err: any) {
      setErro(err?.message || 'Falha ao transmitir a comanda para a Frente de Caixa.');
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      {/* Toast de Sucesso */}
      {toastSucesso && (
        <div className="fixed top-8 right-8 z-[110] bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400 font-bold text-sm animate-bounce">
          <CheckCircle2 size={22} className="text-white" />
          <span>Comanda enviada com sucesso para a Frente de Caixa!</span>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-100">
        {/* Cabeçalho do Modal Restrito */}
        <div className="p-5 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-lg shadow-emerald-950/60 font-black">
              <ShoppingCart size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
                  Segregação de Funções · Balcão CRVA
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">|</span>
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                  Atendente: <strong className="text-slate-200">{usuarioLogado?.nome || usuarioLogado?.login || 'Atendente'}</strong>
                </span>
              </div>
              <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
                Catálogo de Serviços CRVA · Lançamento de Comanda
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={enviando}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border-0 bg-transparent disabled:opacity-40"
            title="Fechar Modal"
          >
            <X size={22} />
          </button>
        </div>

        {/* Identificação do Cliente (Somente Leitura) */}
        <div className="px-6 py-3.5 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
              <User size={16} />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Cliente / Requerente Vinculado (Somente Leitura):
              </span>
              <p className="text-sm font-black text-white">
                {clienteNome || 'Consumidor Balcão CRVA'}
              </p>
            </div>
          </div>
          {clienteDocumento && (
            <div className="flex items-center gap-2 bg-slate-850 px-3 py-1.5 rounded-xl border border-slate-800">
              <FileText size={14} className="text-slate-400" />
              <span className="text-xs text-slate-400">CPF/CNPJ:</span>
              <span className="text-xs font-mono font-bold text-slate-200">{clienteDocumento}</span>
            </div>
          )}
        </div>

        {/* Corpo: Duas Colunas (Esquerda: Catálogo / Direita: Comanda Montada) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          {/* COLUNA ESQUERDA: Busca e Listagem de Serviços Oficiais */}
          <div className="lg:col-span-7 p-5 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Tag size={16} className="text-emerald-400" />
                  Serviços Oficiais DETRAN / CRVA
                </h3>
                <p className="text-xs text-slate-400">
                  Clique para adicionar à ordem de serviço do cliente.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {servicosFiltrados.length} disponíveis
              </span>
            </div>

            {/* Input de Busca */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por código ou descrição do serviço..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                autoFocus
              />
            </div>

            {/* Lista com Rolagem */}
            <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2 pr-1 custom-scrollbar">
              {servicosFiltrados.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-dashed border-slate-800 text-slate-500 text-xs">
                  Nenhum serviço encontrado para o termo pesquisado.
                </div>
              ) : (
                servicosFiltrados.map((s) => {
                  const jaAdicionado = itens.some((i) => i.servico.id === s.id || i.servico.codigo === s.codigo);
                  return (
                    <div
                      key={s.id}
                      onClick={() => adicionarServico(s)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                        jaAdicionado
                          ? 'bg-emerald-950/20 border-emerald-600/40 hover:border-emerald-500'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                      }`}
                    >
                      <div className="flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                            {s.codigo}
                          </span>
                          <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors">
                            {s.nome}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-xs text-emerald-400 whitespace-nowrap">
                          {formatarBRL(s.valor)}
                        </span>
                        <button
                          type="button"
                          className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-transform active:scale-95 border-0 cursor-pointer shadow-sm"
                          title="Adicionar à Comanda"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* COLUNA DIREITA: Comanda de Atendimento Montada */}
          <div className="lg:col-span-5 p-5 bg-slate-950/50 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Receipt size={16} className="text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Serviços da Comanda</h3>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-400">
                  {itens.length} {itens.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              {/* Lista dos Itens Selecionados */}
              <div className="overflow-y-auto max-h-[260px] space-y-2 pr-1 custom-scrollbar">
                {itens.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-dashed border-slate-800 text-slate-500 text-xs">
                    Nenhum serviço incluído na comanda ainda. Selecione os serviços à esquerda.
                  </div>
                ) : (
                  itens.map((item) => {
                    const subtotal = deCentavos(paraCentavos(item.servico.valor) * item.quantidade);
                    return (
                      <div
                        key={item.servico.id}
                        className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-200 truncate">
                            {item.servico.nome}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400">
                            Unitário: {formatarBRL(item.servico.valor)}
                          </p>
                        </div>

                        {/* Controles de Quantidade */}
                        <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
                          <button
                            type="button"
                            onClick={() => alterarQuantidade(item.servico.id, -1)}
                            className="text-slate-400 hover:text-white p-0.5 transition-colors border-0 bg-transparent cursor-pointer"
                            title="Diminuir"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="font-mono text-xs font-bold text-white px-1">
                            {item.quantidade}
                          </span>
                          <button
                            type="button"
                            onClick={() => alterarQuantidade(item.servico.id, 1)}
                            className="text-slate-400 hover:text-white p-0.5 transition-colors border-0 bg-transparent cursor-pointer"
                            title="Aumentar"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        {/* Subtotal e Remover */}
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-white whitespace-nowrap">
                            {formatarBRL(subtotal)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removerServico(item.servico.id)}
                            className="text-slate-500 hover:text-rose-400 p-1 transition-colors border-0 bg-transparent cursor-pointer"
                            title="Remover serviço"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bloco de Totais e Alerta de Segregação de Funções */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              {/* Segregação de Funções Informativo */}
              <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-3 text-[11px] text-blue-300 flex items-start gap-2.5">
                <ShieldCheck size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Segregação Atendente / Caixa:</strong> O recebimento financeiro, troco e emissão de cupom são de competência exclusiva do Operador de Caixa no PDV.
                </span>
              </div>

              {/* Detalhamento do ISSQN e Total da Comanda em três linhas consecutivas */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span>Subtotal dos Serviços:</span>
                  <span className="font-mono font-bold text-slate-200">R$ {subtotalServicos.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-emerald-400 font-semibold border-b border-slate-800/80 pb-2">
                  <span className="flex items-center gap-1">
                    <Sparkles size={11} />
                    (+) ISSQN Municipal (2,00%):
                  </span>
                  <span className="font-mono font-bold">R$ {valorIssqn.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-baseline pt-1">
                  <span className="text-xs font-black uppercase text-slate-200 tracking-wide">TOTAL A PAGAR:</span>
                  <span className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                    R$ {valorTotalCobrado.toFixed(2)}
                  </span>
                </div>
              </div>

              {erro && (
                <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl p-3 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle size={15} className="flex-shrink-0 text-rose-400" />
                  <span>{erro}</span>
                </div>
              )}

              {/* Botão de Envio para a Frente de Caixa */}
              <button
                type="button"
                onClick={handleEnviarParaCaixa}
                disabled={enviando || itens.length === 0}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl font-bold text-sm shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2.5 transition-all transform active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed border-0 cursor-pointer"
              >
                {enviando ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Transmitindo Comanda para a Frente de Caixa...</span>
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Enviar para Pagamento no Caixa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
