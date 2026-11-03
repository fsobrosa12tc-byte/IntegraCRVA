import React from 'react';
import {
  Printer,
  X,
  Building2,
  FileText,
  User,
  Car,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { VendaRelatorio } from '../../lib/relatoriosPdvService';
import { formatarBRL } from '../../lib/pdvCaixa';
import { mascararDocumento } from '../../utils/documento';

interface ModalReimpressaoCupomProps {
  venda: VendaRelatorio;
  onFechar: () => void;
}

const ROTULO_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro (Em Espécie)',
  pix: 'PIX (Liquidação Instantânea)',
  cartao_debito: 'Cartão de Débito',
  cartao_credito: 'Cartão de Crédito',
  faturamento: 'Faturado a Prazo (Conta Despachante)',
};

export default function ModalReimpressaoCupom({
  venda,
  onFechar,
}: ModalReimpressaoCupomProps) {
  const handlePrint = () => {
    window.print();
  };

  const dataHoraOriginal = new Date(venda.criado_em).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const subtotal = venda.subtotal !== undefined ? venda.subtotal : Math.max(0, venda.valor - venda.issqn);
  const total = venda.valor;
  const issqn = venda.issqn;

  // Itens para exibição
  const itens =
    venda.servicos_detalhados && venda.servicos_detalhados.length > 0
      ? venda.servicos_detalhados
      : [
          {
            codigo: 'SRV-0001',
            servico: venda.servico || 'Serviço Notarial / Balcão CRVA',
            quantidade: 1,
            valor_unitario: subtotal,
            subtotal: subtotal,
          },
        ];

  return (
    <div className="fixed inset-0 z-[130] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      {/* Container Principal do Recibo */}
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100 my-auto">
        
        {/* Barra Superior de Ações (Oculta na Impressão) */}
        <div className="no-print p-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Printer size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                Reimpressão Oficial de Comprovante
              </h3>
              <p className="text-[11px] text-slate-400">
                Protocolo: <span className="font-mono text-amber-300 font-bold">{venda.protocolo}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow cursor-pointer border-0"
              title="Disparar Impressão (Térmica 80mm ou A4)"
            >
              <Printer size={14} />
              <span>Imprimir 2ª Via</span>
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border-0 bg-transparent"
              title="Fechar Janela"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* =====================================================================
         *  ÁREA IMPRIMÍVEL DO RECIBO / CUPOM FISCAL (TÉRMICA 80MM / A4)
         * ===================================================================== */}
        <div
          className="printable-content p-6 sm:p-8 space-y-5 print:p-2 print:text-black print:bg-white text-xs font-sans"
          style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
        >
          
          {/* 1. Cabeçalho Oficial */}
          <div className="text-center pb-4 border-b border-slate-800 print:border-slate-300">
            <div className="font-black text-base sm:text-lg tracking-wider text-white print:text-slate-900 uppercase">
              INTEGRA CRVA - COMPROVANTE FISCAL DE PRESTAÇÃO DE SERVIÇOS
            </div>
            <p className="text-[11px] text-slate-400 print:text-slate-600 mt-0.5">
              CRVA Credenciado DETRAN-RS · Sistema Oficial de Auditoria Contábil
            </p>

            {/* Tarja em destaque: "REIMPRESSÃO / SEGUNDA VIA DE RECIBO" */}
            <div className="mt-3 inline-block px-4 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 print:bg-amber-100 print:text-amber-900 print:border-amber-400 font-black text-xs uppercase tracking-widest shadow-sm">
              ⚠️ REIMPRESSÃO / SEGUNDA VIA DE RECIBO
            </div>
            <p className="text-[10px] text-slate-400 print:text-slate-600 italic mt-1">
              Documento emitido para fins de conferência. Não constitui nova exigência de pagamento.
            </p>
          </div>

          {/* 2. Metadados da Transação */}
          <div className="bg-slate-950/70 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-3.5 space-y-1.5 text-xs">
            <div className="flex justify-between items-center text-slate-300 print:text-slate-800">
              <span className="text-slate-500 print:text-slate-600">Protocolo / Recibo:</span>
              <strong className="font-mono text-emerald-400 print:text-emerald-700 font-bold">{venda.protocolo}</strong>
            </div>
            <div className="flex justify-between items-center text-slate-300 print:text-slate-800">
              <span className="text-slate-500 print:text-slate-600">Data / Hora Original:</span>
              <span className="font-mono">{dataHoraOriginal}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300 print:text-slate-800">
              <span className="text-slate-500 print:text-slate-600">Forma de Pagamento:</span>
              <strong className="text-white print:text-slate-900">{ROTULO_PAGAMENTO[venda.forma_pagamento] || venda.forma_pagamento}</strong>
            </div>
            <div className="flex justify-between items-center text-slate-300 print:text-slate-800">
              <span className="text-slate-500 print:text-slate-600">Atendente / Operador:</span>
              <span>{venda.operador_auditado_nome || venda.operador_nome || 'Operador Balcão'}</span>
            </div>
          </div>

          {/* 3. Identificação do Requerente / Tomador / Veículo */}
          <div className="bg-slate-950/40 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-3.5 space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <User size={13} className="text-slate-400 print:text-slate-600 shrink-0" />
              <span className="text-slate-400 print:text-slate-600">Tomador:</span>
              <strong className="text-white print:text-slate-900 truncate">{venda.cliente}</strong>
            </div>
            {venda.cliente_documento && (
              <div className="text-[11px] font-mono text-slate-400 pl-5">
                CPF / CNPJ: {mascararDocumento(venda.cliente_documento)}
              </div>
            )}
            {venda.veiculo_placa && (
              <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-sky-400 print:text-sky-800">
                <Car size={13} className="shrink-0" />
                <span>Placa: <strong>{venda.veiculo_placa.toUpperCase()}</strong></span>
                {venda.veiculo_modelo && <span className="text-slate-400">({venda.veiculo_modelo})</span>}
              </div>
            )}
          </div>

          {/* 4. Discriminação dos Serviços Prestados */}
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 print:text-slate-700 tracking-wider mb-1.5">
              Discriminação dos Serviços Realizados
            </div>
            <div className="border border-slate-800 print:border-slate-300 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 print:bg-slate-100 text-slate-400 print:text-slate-700 text-[10px] uppercase font-bold border-b border-slate-800 print:border-slate-300">
                    <th className="p-2">Item / Ato</th>
                    <th className="p-2 text-center w-12">Qtd</th>
                    <th className="p-2 text-right w-20">Unit</th>
                    <th className="p-2 text-right w-24">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 print:divide-slate-200">
                  {itens.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2">
                        <span className="font-mono text-[10px] text-slate-400 mr-1.5">{it.codigo}</span>
                        <span className="text-slate-200 print:text-slate-900 font-medium">{it.servico}</span>
                      </td>
                      <td className="p-2 text-center font-mono font-bold text-slate-300 print:text-slate-800">
                        {it.quantidade}
                      </td>
                      <td className="p-2 text-right font-mono text-slate-300 print:text-slate-800">
                        {formatarBRL(it.valor_unitario)}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-white print:text-slate-900">
                        {formatarBRL(it.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. Quadro Resumo Financeiro & Fiscal */}
          <div className="bg-slate-950/90 print:bg-slate-100 border border-slate-800 print:border-slate-300 rounded-2xl p-4 space-y-1.5 font-mono text-xs max-w-sm ml-auto">
            <div className="flex justify-between items-center text-slate-400 print:text-slate-600">
              <span>Subtotal dos Serviços:</span>
              <span className="font-semibold text-slate-200 print:text-slate-900">{formatarBRL(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-amber-400/90 print:text-amber-800">
              <span>(+) ISSQN Municipal (2,00%):</span>
              <span className="font-semibold">{formatarBRL(issqn)}</span>
            </div>
            <div className="border-t border-slate-800 print:border-slate-300 my-2" />
            <div className="flex justify-between items-baseline pt-0.5">
              <span className="text-xs font-bold text-white print:text-slate-900 uppercase">
                TOTAL PAGO:
              </span>
              <span className="text-xl font-black text-emerald-400 print:text-emerald-700">
                {formatarBRL(total)}
              </span>
            </div>
          </div>

          {/* 6. Selo de Auditoria e Rodapé */}
          <div className="pt-3 border-t border-slate-800 print:border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-400 print:text-emerald-700 shrink-0" />
              <span>Autenticação: <strong>AUD-{venda.id.slice(0, 12).toUpperCase()}</strong></span>
            </div>
            <span>Integra CRVA · 2ª Via Emitida</span>
          </div>

        </div>

        {/* Rodapé da Janela (Oculto na Impressão) */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3 print:hidden">
          <button
            type="button"
            onClick={onFechar}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer border border-slate-700"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/60 cursor-pointer border-0"
          >
            <Printer size={15} />
            <span>Imprimir 2ª Via</span>
          </button>
        </div>

      </div>
    </div>
  );
}

