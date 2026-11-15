import React, { useRef } from 'react';
import { Printer, X, Receipt, CheckCircle2, Scissors, Building2 } from 'lucide-react';
import { formatarBRL } from '../../lib/pdvCaixa';
import { mascararDocumento } from '../../utils/documento';

export interface ItemReciboDuasVias {
  codigo?: string;
  descricao: string;
  quantidade?: number;
  valorUnitario?: number;
  subtotal?: number;
}

export interface DadosReciboDuasVias {
  numeroRecibo: string;
  dataHora: string;
  tomadorNome: string;
  tomadorDocumento?: string | null;
  veiculoPlaca?: string | null;
  clienteFinalNome?: string | null;
  clienteFinalDocumento?: string | null;
  clienteFinalPlaca?: string | null;
  atendenteNome?: string | null;
  operadorNome: string;
  itens: ItemReciboDuasVias[];
  subtotalServicos: number;
  valorIssqn: number;
  valorTotal: number;
  formaPagamento: string;
  valorRecebido?: number | null;
  troco?: number | null;
  hashAutenticidade?: string | null;
}

export interface ReciboDuasViasModalProps {
  isOpen: boolean;
  onClose: () => void;
  recibo: DadosReciboDuasVias | null;
}

export default function ReciboDuasViasModal({
  isOpen,
  onClose,
  recibo,
}: ReciboDuasViasModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !recibo) return null;

  const handleImprimir = () => {
    window.print();
  };

  const hashSeguranca =
    recibo.hashAutenticidade ||
    `MS-CRVA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // Componente que desenha cada uma das duas vias
  const RenderVia = ({ tipoVia }: { tipoVia: 'cliente' | 'controle' }) => {
    const isCliente = tipoVia === 'cliente';

    return (
      <div className="bg-white text-slate-900 p-5 rounded-xl border border-slate-300 shadow-sm print:border-none print:shadow-none print:p-0 print:m-0 text-xs font-sans leading-relaxed">
        {/* Topo da Via: Badge e Identificação */}
        <div className="flex items-start justify-between border-b border-slate-300 pb-3 mb-3 gap-2">
          <div>
            <div className="flex items-center gap-1.5 font-black text-slate-900 tracking-tight text-sm">
              <span>MARKS SYSTEMS</span>
              <span className="text-slate-400 font-normal">•</span>
              <span className="text-emerald-700">CRVA DETRAN/RS</span>
            </div>
            <div className="text-[11px] font-bold text-slate-700 mt-0.5">
              Recibo de Quitação de Emolumentos e Serviços Notariais
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              Emissão: {recibo.dataHora} • Turno Caixa
            </div>
          </div>

          <div className="text-right shrink-0">
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                isCliente
                  ? 'bg-slate-100 text-slate-800 border-slate-400'
                  : 'bg-indigo-50 text-indigo-900 border-indigo-400'
              }`}
            >
              {isCliente
                ? '1ª VIA — COMPROVANTE DO CLIENTE / DESPACHANTE'
                : '2ª VIA — CONTROLE INTERNO / CAIXA CRVA'}
            </span>
            <div className="font-mono font-bold text-slate-900 text-xs mt-1">
              {recibo.numeroRecibo}
            </div>
          </div>
        </div>

        {/* Tomador e Dados do Veículo / Cliente Final */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-3 text-[11px]">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
              Tomador / Requerente
            </span>
            <strong className="text-slate-900 block truncate" title={recibo.tomadorNome}>
              {recibo.tomadorNome}
            </strong>
            <span className="text-slate-600 font-mono">
              {recibo.tomadorDocumento ? mascararDocumento(recibo.tomadorDocumento) : 'CPF/CNPJ: Não informado'}
            </span>
            {recibo.veiculoPlaca && (
              <span className="ml-2 inline-block font-mono font-bold text-slate-800 bg-slate-200 px-1.5 py-0.2 rounded text-[10px]">
                Placa: {recibo.veiculoPlaca}
              </span>
            )}
          </div>

          <div>
            {recibo.clienteFinalNome ? (
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-700 block">
                  Cliente Final Vinculado (Auditoria)
                </span>
                <strong className="text-slate-900 block truncate" title={recibo.clienteFinalNome}>
                  {recibo.clienteFinalNome}
                </strong>
                <span className="text-slate-600 font-mono">
                  {recibo.clienteFinalDocumento
                    ? mascararDocumento(recibo.clienteFinalDocumento)
                    : 'CPF/CNPJ: N/I'}
                </span>
                {recibo.clienteFinalPlaca && (
                  <span className="ml-2 inline-block font-mono font-bold text-slate-800 bg-indigo-100 px-1.5 py-0.2 rounded text-[10px]">
                    Placa: {recibo.clienteFinalPlaca}
                  </span>
                )}
              </div>
            ) : (
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                  Atendimento
                </span>
                <span className="text-slate-700">
                  Atendente: <strong>{recibo.atendenteNome || 'Balcão CRVA'}</strong>
                </span>
                <div className="text-slate-700">
                  Operador Caixa: <strong>{recibo.operadorNome}</strong>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabela de Discriminação dos Atos Quitados */}
        <div className="mb-3">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-slate-300 text-slate-500 font-bold uppercase text-[9px]">
                <th className="py-1">Cód.</th>
                <th className="py-1">Descrição do Ato / Emolumento</th>
                <th className="py-1 text-center">Qtd</th>
                <th className="py-1 text-right">Unitário</th>
                <th className="py-1 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {recibo.itens && recibo.itens.length > 0 ? (
                recibo.itens.map((it, idx) => {
                  const qtd = it.quantidade || 1;
                  const unit = it.valorUnitario || (it.subtotal ? it.subtotal / qtd : 0);
                  const sub = it.subtotal || unit * qtd;

                  return (
                    <tr key={idx} className="text-slate-800">
                      <td className="py-1 text-slate-500 text-[10px]">{it.codigo || `AT-${idx + 1}`}</td>
                      <td className="py-1 font-sans text-slate-900">{it.descricao}</td>
                      <td className="py-1 text-center">{qtd}</td>
                      <td className="py-1 text-right">{formatarBRL(unit)}</td>
                      <td className="py-1 text-right font-bold">{formatarBRL(sub)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-2 text-center text-slate-500 font-sans">
                    Atos e emolumentos oficiais de balcão CRVA
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Resumo Financeiro e Forma de Pagamento */}
        <div className="border-t border-slate-300 pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-lg border">
          <div className="text-[11px] space-y-0.5">
            <div>
              Forma de Pagamento: <strong className="text-slate-900 uppercase">{recibo.formaPagamento}</strong>
            </div>
            {recibo.valorRecebido && recibo.valorRecebido > recibo.valorTotal && (
              <div className="text-slate-600 font-mono text-[10px]">
                Recebido: {formatarBRL(recibo.valorRecebido)} | Troco: {formatarBRL(recibo.troco || 0)}
              </div>
            )}
            <div className="text-slate-500 text-[10px] font-mono">
              Autenticação: {hashSeguranca}
            </div>
          </div>

          <div className="text-right w-full sm:w-auto font-mono shrink-0">
            <div className="text-[10px] text-slate-600">
              Subtotal: <span>{formatarBRL(recibo.subtotalServicos)}</span> | ISSQN (2%): <span>+{formatarBRL(recibo.valorIssqn)}</span>
            </div>
            <div className="text-sm font-black text-slate-950 mt-0.5">
              TOTAL PAGO: <span className="text-emerald-700 text-base">{formatarBRL(recibo.valorTotal)}</span>
            </div>
          </div>
        </div>

        {/* Linha de Conferência / Assinatura */}
        <div className="mt-4 pt-4 border-t border-dashed border-slate-300 flex items-end justify-between text-[10px] text-slate-500">
          <div>
            <span>Autenticação digital Marks Systems • Conforme provimento e normas vigentes</span>
          </div>
          <div className="text-center w-64 border-t border-slate-400 pt-1">
            <span className="font-bold text-slate-700 block">
              {isCliente ? 'Assinatura / Rubrica do Tomador' : 'Rubrica Operador de Caixa CRVA'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[150] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0 print:m-0">
      <div
        ref={containerRef}
        className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col my-6 overflow-hidden print:border-none print:shadow-none print:bg-white print:m-0 print:max-w-none print:w-full"
      >
        {/* Barra Superior de Ações (Oculta na Impressão) */}
        <div className="px-6 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <Receipt size={16} />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Comprovante de Quitação Fiscal (Duas Vias)</h3>
              <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 size={12} /> Transação liquidada e auditada com sucesso
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-imprimir-recibo-duas-vias"
              onClick={handleImprimir}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-950/40 cursor-pointer transition-all border-0"
              title="Imprimir as duas vias em folha A4 ou bobina térmica"
            >
              <Printer size={14} />
              <span>Imprimir 2 Vias</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer border-0 bg-transparent"
              title="Fechar Comprovante"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Área Reta das Duas Vias */}
        <div className="p-6 overflow-y-auto max-h-[82vh] space-y-6 print:p-0 print:m-0 print:max-h-none print:overflow-visible print:space-y-4">
          
          {/* 1ª VIA: CLIENTE / DESPACHANTE */}
          <RenderVia tipoVia="cliente" />

          {/* LINHA DE CORTE SERRILHADA */}
          <div className="relative my-4 flex items-center justify-center print:my-2">
            <div className="w-full border-t-2 border-dashed border-slate-600 print:border-gray-400" />
            <span className="absolute bg-slate-900 print:bg-white px-3 text-[10px] font-mono text-slate-400 print:text-gray-600 flex items-center gap-1.5">
              <Scissors size={12} />
              <span>Corte aqui • 2ª Via Arquivo Caixa</span>
            </span>
          </div>

          {/* 2ª VIA: CONTROLE INTERNO / CAIXA CRVA */}
          <RenderVia tipoVia="controle" />

        </div>

        {/* Rodapé do Modal (Oculto na Impressão) */}
        <div className="px-6 py-3 bg-slate-950/70 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0 print:hidden">
          <span className="font-mono text-[11px]">
            {recibo.numeroRecibo} • Registrado no banco de dados e caixa ativo
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold cursor-pointer border border-slate-700"
          >
            Concluir e Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
