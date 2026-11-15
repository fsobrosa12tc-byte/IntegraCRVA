import React, { useState, useRef, useMemo } from 'react';
import { 
  X, 
  CreditCard, 
  QrCode, 
  Banknote, 
  CheckCircle2, 
  Wallet, 
  Loader2,
  Receipt,
  Car
} from 'lucide-react';
import { desmascararMoeda, formatarBRL, formatarMoeda, mascararMoeda } from '../../lib/pdvCaixa';

export type FormaPagamento = 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'DINHEIRO';

export interface ItemComanda {
  descricao: string;
  quantidade?: number;
  valor: number;
}

export interface DadosCheckout {
  id: string;
  tipo: 'particular' | 'despachante';
  tomadorNome: string;
  tomadorDocumento: string;
  placa?: string | null;
  veiculoPlaca?: string | null;
  atendenteNome?: string;
  itens: ItemComanda[] | string[];
  valorTotal: number;
  issValor?: number;
}

export interface TerminalLiquidacaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  dados: DadosCheckout | null;
  onConfirmarPagamento: (id: string, formaPagamento: FormaPagamento, valorTotal: number) => Promise<void>;
}

export const TerminalLiquidacaoModal: React.FC<TerminalLiquidacaoModalProps> = ({
  isOpen,
  onClose,
  dados,
  onConfirmarPagamento
}) => {
  const [formaSelecionada, setFormaSelecionada] = useState<FormaPagamento>('PIX');
  const [valorRecebidoStr, setValorRecebidoStr] = useState<string>('');
  const [processando, setProcessando] = useState(false);
  const executandoRef = useRef(false);

  // Calcula valores fiscais e de troco
  const subtotalSemIss = useMemo(() => {
    if (!dados) return 0;
    const iss = dados.issValor !== undefined && dados.issValor > 0 
      ? dados.issValor 
      : Math.round(dados.valorTotal * 2) / 102; // Alíquota nominal 2%
    return Math.max(0, dados.valorTotal - iss);
  }, [dados]);

  const valorIssqn = useMemo(() => {
    if (!dados) return 0;
    return dados.issValor !== undefined && dados.issValor > 0
      ? dados.issValor
      : Math.round(subtotalSemIss * 2) / 100;
  }, [dados, subtotalSemIss]);

  const valorRecebidoNum = desmascararMoeda(valorRecebidoStr);
  const trocoCalculado = dados ? Math.max(0, valorRecebidoNum - dados.valorTotal) : 0;

  if (!isOpen || !dados) return null;

  const placaVeiculo = dados.placa || dados.veiculoPlaca || '';

  const opcoesPagamento: { id: FormaPagamento; label: string; icon: any }[] = [
    {
      id: 'PIX',
      label: 'PIX (Instantâneo)',
      icon: QrCode
    },
    {
      id: 'CARTAO_DEBITO',
      label: 'Cartão de Débito',
      icon: CreditCard
    },
    {
      id: 'CARTAO_CREDITO',
      label: 'Cartão de Crédito',
      icon: CreditCard
    },
    {
      id: 'DINHEIRO',
      label: 'Dinheiro / Espécie',
      icon: Banknote
    }
  ];

  const handleFinalizar = async () => {
    // Blindagem síncrona imediata contra cliques múltiplos rápidos
    if (executandoRef.current || processando) return;
    executandoRef.current = true;
    setProcessando(true);

    try {
      await onConfirmarPagamento(dados.id, formaSelecionada, dados.valorTotal);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Falha ao processar quitação. Tente novamente.');
    } finally {
      executandoRef.current = false;
      setProcessando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Container Principal do Modal Flutuante Executivo em Duas Colunas */}
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Cabeçalho Compacto e Executivo */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/95 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-bold text-slate-100 tracking-tight">
                Terminal de Liquidação e Pagamento
              </h3>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/70">
                {dados.tipo === 'particular' ? 'ATENDIMENTO BALCÃO CRVA' : 'CONTA-CORRENTE DESPACHANTE'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer border-0 bg-transparent"
            title="Fechar Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal em Duas Colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
          
          {/* ===================================================================
           * COLUNA ESQUERDA: RESUMO DO ATENDIMENTO E ATOS (5 COLUNAS)
           * =================================================================== */}
          <div className="lg:col-span-5 flex flex-col justify-between bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
            <div>
              {/* Bloco do Tomador / Requerente */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
                  TOMADOR DO SERVIÇO
                </span>
                <h4 className="text-sm font-bold text-slate-100 mt-0.5 line-clamp-1" title={dados.tomadorNome}>
                  {dados.tomadorNome}
                </h4>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono mt-1">
                  <span>{dados.tomadorDocumento ? `Doc: ${dados.tomadorDocumento}` : 'CPF/CNPJ: Não informado'}</span>
                  {placaVeiculo && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-bold">
                      <Car size={11} className="text-emerald-400" />
                      {placaVeiculo}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-[11px] text-slate-500 font-medium">
                  Atendente: <span className="text-slate-300">{dados.atendenteNome || 'Antonio Sobrosa'}</span>
                </div>
              </div>

              {/* Discriminação dos Atos */}
              <div className="my-4 border-y border-slate-800/80 py-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 block">
                  ITENS / ATOS DO ATENDIMENTO
                </span>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                  {dados.itens && dados.itens.length > 0 ? (
                    dados.itens.map((item, idx) => {
                      if (typeof item === 'string') {
                        return (
                          <div key={idx} className="flex items-start justify-between gap-2 text-xs">
                            <span className="text-slate-300">{item}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="flex items-start justify-between gap-2 text-xs">
                          <span className="text-slate-300 leading-tight">
                            {item.quantidade && item.quantidade > 1 && (
                              <span className="text-emerald-400 font-bold font-mono mr-1">{item.quantidade}x</span>
                            )}
                            {item.descricao}
                          </span>
                          <span className="text-slate-200 font-mono whitespace-nowrap shrink-0">
                            {formatarMoeda(Number(item.valor) || 0)}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-slate-500 italic py-2">
                      Serviço padrão de balcão CRVA
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Composição Tributária (Rodapé da Coluna Esquerda) */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800/80 text-xs text-slate-400 font-mono">
              <div className="flex justify-between items-center">
                <span>Subtotal dos Atos:</span>
                <span className="font-semibold text-slate-200">
                  {formatarMoeda(subtotalSemIss)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>(+) ISSQN Municipal (2%):</span>
                <span className="font-semibold text-slate-300">
                  + {formatarMoeda(valorIssqn)}
                </span>
              </div>
            </div>
          </div>

          {/* ===================================================================
           * COLUNA DIREITA: MEIO DE PAGAMENTO E QUITAÇÃO (7 COLUNAS)
           * =================================================================== */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-5">
            <div>
              {/* Seleção de Forma de Pagamento */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5 block">
                  SELECIONE A FORMA DE PAGAMENTO
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {opcoesPagamento.map((opcao) => {
                    const Icone = opcao.icon;
                    const estaSelecionado = formaSelecionada === opcao.id;

                    return (
                      <button
                        key={opcao.id}
                        type="button"
                        disabled={processando}
                        onClick={() => setFormaSelecionada(opcao.id)}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border text-xs transition-all text-left ${
                          processando ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                        } ${
                          estaSelecionado
                            ? 'bg-emerald-950/30 border-emerald-500/70 text-emerald-300 ring-1 ring-emerald-500/30 font-semibold shadow-inner'
                            : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700 font-medium'
                        }`}
                      >
                        <Icone className={`w-4 h-4 shrink-0 ${estaSelecionado ? 'text-emerald-400 scale-110' : 'text-slate-400'}`} />
                        <span>{opcao.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Calculadora Rápida de Troco (Condicional para Dinheiro / Espécie) */}
              {formaSelecionada === 'DINHEIRO' && (
                <div className="mt-4 grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 animate-in fade-in duration-150">
                  <div>
                    <label htmlFor="valor-recebido" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 block">
                      VALOR RECEBIDO (R$)
                    </label>
                    <input
                      id="valor-recebido"
                      type="text"
                      inputMode="numeric"
                      value={valorRecebidoStr}
                      onChange={(e) => setValorRecebidoStr(mascararMoeda(e.target.value))}
                      placeholder="R$ 0,00"
                      autoFocus
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 block">
                      TROCO A DEVOLVER (R$)
                    </span>
                    <div className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm font-bold font-mono text-emerald-400">
                      {formatarMoeda(trocoCalculado)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Destaque do Total a Cobrar e Botões de Ação */}
            <div className="space-y-4">
              {/* Box Limpo de Total a Cobrar */}
              <div className="p-4 rounded-xl bg-emerald-950/15 border border-emerald-800/40 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                    TOTAL A COBRAR
                  </span>
                  <span className="text-[11px] text-emerald-400/80 font-medium">
                    Quitação imediata no caixa
                  </span>
                </div>
                <div className="text-2xl font-bold text-emerald-400 tracking-tight font-mono">
                  {formatarMoeda(dados.valorTotal)}
                </div>
              </div>

              {/* Botões de Ação no Rodapé da Coluna Direita */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={processando}
                  className="px-5 py-3.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleFinalizar}
                  disabled={processando}
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition-all cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processando ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Processando Quitação...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Confirmar e Quitar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

export default TerminalLiquidacaoModal;
