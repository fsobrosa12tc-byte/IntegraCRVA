import React, { useState, useRef } from 'react';
import { 
  X, 
  CreditCard, 
  QrCode, 
  Banknote, 
  CheckCircle2, 
  ShieldCheck, 
  AlertCircle 
} from 'lucide-react';

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
  atendenteNome?: string;
  itens: ItemComanda[] | string[];
  valorTotal: number;
  issValor?: number;
}

export interface ModalCheckoutPagamentoProps {
  isOpen: boolean;
  onClose: () => void;
  dados: DadosCheckout | null;
  onConfirmarPagamento: (id: string, formaPagamento: FormaPagamento, valorTotal: number) => Promise<void>;
}

export const ModalCheckoutPagamento: React.FC<ModalCheckoutPagamentoProps> = ({
  isOpen,
  onClose,
  dados,
  onConfirmarPagamento
}) => {
  const [formaSelecionada, setFormaSelecionada] = useState<FormaPagamento>('PIX');
  const [processando, setProcessando] = useState(false);
  const executandoRef = useRef(false);

  if (!isOpen || !dados) return null;

  const opcoesPagamento: { id: FormaPagamento; label: string; icon: any; corAtiva: string }[] = [
    {
      id: 'PIX',
      label: 'PIX (Instantâneo)',
      icon: QrCode,
      corAtiva: 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-2 ring-emerald-500/40'
    },
    {
      id: 'CARTAO_DEBITO',
      label: 'Cartão de Débito',
      icon: CreditCard,
      corAtiva: 'border-cyan-500 bg-cyan-500/15 text-cyan-300 ring-2 ring-cyan-500/40'
    },
    {
      id: 'CARTAO_CREDITO',
      label: 'Cartão de Crédito',
      icon: CreditCard,
      corAtiva: 'border-indigo-500 bg-indigo-500/15 text-indigo-300 ring-2 ring-indigo-500/40'
    },
    {
      id: 'DINHEIRO',
      label: 'Dinheiro / Espécie',
      icon: Banknote,
      corAtiva: 'border-amber-500 bg-amber-500/15 text-amber-300 ring-2 ring-amber-500/40'
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

  const subtotalSemIss =
    dados.issValor !== undefined && dados.issValor > 0
      ? Math.max(0, dados.valorTotal - dados.issValor)
      : dados.valorTotal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5"/>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Terminal de Liquidação e Pagamento
              </h3>
              <p className="text-[11px] text-slate-400">
                {dados.tipo === 'particular' ? 'Atendimento Balcão CRVA' : 'Conta-Corrente de Despachante'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          
          {/* Card Resumo do Tomador */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block mb-0.5">
                Tomador do Serviço
              </span>
              <h4 className="text-sm font-bold text-white">{dados.tomadorNome}</h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                CPF/CNPJ: {dados.tomadorDocumento || 'Não informado'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block mb-0.5">
                Atendente
              </span>
              <span className="text-xs font-medium text-slate-300">
                {dados.atendenteNome || 'Patrícia Atendente Balcão'}
              </span>
            </div>
          </div>

          {/* Resumo dos Itens / Serviços */}
          {dados.itens && dados.itens.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/80">
              <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block mb-2">
                Itens / Atos do Atendimento
              </span>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 text-xs scrollbar-thin scrollbar-thumb-slate-800">
                {dados.itens.map((item, idx) => {
                  if (typeof item === 'string') {
                    return (
                      <div key={idx} className="flex justify-between items-center text-slate-300">
                        <span className="truncate">{item}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className="flex justify-between items-center text-slate-300">
                      <span className="truncate">
                        {item.quantidade && item.quantidade > 1 ? `${item.quantidade}x ` : ''}
                        {item.descricao}
                      </span>
                      <span className="font-mono text-slate-400 shrink-0 ml-2">
                        R$ {Number(item.valor).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seleção de Formas de Pagamento com Feedback de Cores */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-2.5">
              Selecione a Forma de Pagamento:
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {opcoesPagamento.map((opcao) => {
                const Icone = opcao.icon;
                const estaSelecionado = formaSelecionada === opcao.id;

                return (
                  <button
                    key={opcao.id}
                    type="button"
                    disabled={processando}
                    onClick={() => setFormaSelecionada(opcao.id)}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border text-xs font-semibold transition-all text-left ${
                      processando ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      estaSelecionado
                        ? opcao.corAtiva
                        : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <Icone className={`w-4 h-4 flex-shrink-0 ${estaSelecionado ? 'scale-110' : ''}`} />
                    <span>{opcao.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Discriminação de Valores */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Subtotal dos Atos:</span>
              <span className="font-semibold text-slate-200">
                R$ {subtotalSemIss.toFixed(2)}
              </span>
            </div>
            {dados.issValor !== undefined && dados.issValor > 0 && (
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>ISSQN Municipal (2%):</span>
                <span className="font-semibold text-slate-300">
                  + R$ {dados.issValor.toFixed(2)}
                </span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                Total a Cobrar:
              </span>
              <span className="text-2xl font-black text-emerald-400 tracking-tight">
                R$ {dados.valorTotal.toFixed(2)}
              </span>
            </div>
          </div>

        </div>

        {/* Rodapé de Ações */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={processando}
            className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleFinalizar}
            disabled={processando}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4"/>
            <span>{processando ? 'Liquidando Transação...' : 'Confirmar e Quitar'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};

export default ModalCheckoutPagamento;

