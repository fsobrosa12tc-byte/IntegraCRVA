import React from 'react';
import {
  X,
  Printer,
  CheckCircle2,
  Building2,
  FileText,
  User,
  Car,
  ShieldCheck,
} from 'lucide-react';
import type { ReciboFaturamentoDespachante } from '../../types/pdv';
import { formatarBRL } from '../../lib/pdvCaixa';
import { mascararDocumento, mascararTelefone } from '../../utils/documento';

interface ModalReciboFaturamentoDespachanteProps {
  recibo: ReciboFaturamentoDespachante;
  onFechar: () => void;
}

export default function ModalReciboFaturamentoDespachante({
  recibo,
  onFechar,
}: ModalReciboFaturamentoDespachanteProps) {
  const handlePrint = () => {
    window.print();
  };

  const dataFormatada = new Date(recibo.dataHora).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      {/* Container do Recibo */}
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100 my-auto">
        
        {/* Cabeçalho da Janela (não impresso) */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                Recibo Oficial de Lançamento a Prazo
              </h3>
              <p className="text-[11px] text-slate-400">
                Protocolo: <span className="font-mono text-violet-300 font-bold">{recibo.numeroRecibo}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-colors shadow cursor-pointer border-0"
              title="Imprimir Recibo"
            >
              <Printer size={14} />
              <span>Imprimir</span>
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

        {/* Corpo do Documento (área imprimível) */}
        <div className="p-6 sm:p-8 space-y-6 print:p-0 print:text-black print:bg-white text-xs">
          
          {/* Topo Institucional */}
          <div className="text-center pb-4 border-b border-slate-800 print:border-slate-300">
            <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-violet-500/10 text-violet-400 mb-2 print:text-violet-700">
              <Building2 size={24} />
            </div>
            <h1 className="text-lg font-black tracking-tight text-white print:text-slate-900 uppercase">
              Integra CRVA · Comprovante de Lançamento em Conta
            </h1>
            <p className="text-slate-400 print:text-slate-600 text-[11px] mt-0.5">
              Registro Transacional de Faturamento a Prazo · Segregação de Funções (Balcão)
            </p>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 print:bg-slate-100 print:text-slate-800">
              <span>Recibo: <strong>{recibo.numeroRecibo}</strong></span>
              <span>·</span>
              <span>Emissão: <strong>{dataFormatada}</strong></span>
            </div>
          </div>

          {/* Dados do Despachante Parceiro */}
          <div className="bg-slate-950/60 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 print:border-slate-300">
              <span className="font-bold text-slate-300 print:text-slate-700 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Building2 size={13} className="text-violet-400" />
                Despachante Credenciado (Sacado)
              </span>
              <span className="font-mono text-[11px] text-violet-400 print:text-violet-700 font-semibold">
                Conta-Corrente B2B
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-slate-200 print:text-slate-800">
              <div>
                <span className="text-slate-500 text-[10px] block">Razão Social / Nome:</span>
                <strong className="text-white print:text-slate-900 text-sm">{recibo.despachante.nome_razao}</strong>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">CNPJ / CPF:</span>
                <strong className="font-mono">{mascararDocumento(recibo.despachante.documento)}</strong>
              </div>
              {recibo.despachante.telefone && (
                <div>
                  <span className="text-slate-500 text-[10px] block">Telefone:</span>
                  <span>{mascararTelefone(recibo.despachante.telefone)}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500 text-[10px] block">Novo Saldo Devedor Consolidado:</span>
                <strong className="font-mono text-amber-400 print:text-amber-700">{formatarBRL(recibo.despachante.saldo_devedor)}</strong>
              </div>
            </div>
          </div>

          {/* Dados de Vínculo: Cliente / Requerente & Veículo (se informados) */}
          {(recibo.clienteNome || recibo.veiculoPlaca) && (
            <div className="bg-slate-950/40 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-slate-300 print:text-slate-700 text-xs">
              {recibo.clienteNome && (
                <div className="flex items-center gap-2">
                  <User size={14} className="text-slate-400" />
                  <span>Requerente: <strong className="text-white print:text-slate-900">{recibo.clienteNome}</strong></span>
                  {recibo.clienteDocumento && (
                    <span className="font-mono text-[11px] text-slate-400">({recibo.clienteDocumento})</span>
                  )}
                </div>
              )}
              {recibo.veiculoPlaca && (
                <div className="flex items-center gap-2 font-mono">
                  <Car size={14} className="text-sky-400" />
                  <span>Placa: <strong className="text-white print:text-slate-900">{recibo.veiculoPlaca.toUpperCase()}</strong></span>
                  {recibo.veiculoModelo && <span className="text-slate-400">({recibo.veiculoModelo})</span>}
                </div>
              )}
            </div>
          )}

          {/* Tabela de Serviços Faturados */}
          <div>
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Discriminação dos Atos Notariais / Serviços Faturados
            </h4>
            <div className="overflow-hidden border border-slate-800 print:border-slate-300 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 print:bg-slate-100 text-slate-400 print:text-slate-700 border-b border-slate-800 print:border-slate-300 text-[10px] uppercase font-bold">
                    <th className="p-2.5">Cód</th>
                    <th className="p-2.5">Descrição do Serviço</th>
                    <th className="p-2.5 text-center">Qtd</th>
                    <th className="p-2.5 text-right">Unitário</th>
                    <th className="p-2.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 print:divide-slate-200">
                  {recibo.itens.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 print:hover:bg-transparent">
                      <td className="p-2.5 font-mono text-[11px] text-slate-400">{item.codigo}</td>
                      <td className="p-2.5 text-slate-200 print:text-slate-900 font-medium">{item.servico}</td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-300">{item.quantidade}</td>
                      <td className="p-2.5 text-right font-mono text-slate-300">{formatarBRL(item.valor_unitario)}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-white print:text-slate-900">{formatarBRL(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quadro Resumo Financeiro & Fiscal */}
          <div className="bg-slate-950/80 print:bg-slate-100 border border-slate-800 print:border-slate-300 rounded-2xl p-4 ml-auto max-w-sm space-y-1.5 font-mono text-xs">
            <div className="flex justify-between items-center text-slate-400 print:text-slate-600">
              <span>Subtotal dos Serviços:</span>
              <span className="font-semibold text-slate-200 print:text-slate-800">{formatarBRL(recibo.subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-amber-400/90 print:text-amber-800">
              <span>(+) ISSQN Municipal (2,00%):</span>
              <span className="font-semibold">{formatarBRL(recibo.valorIssqn)}</span>
            </div>
            <div className="border-t border-slate-800 print:border-slate-300 my-2" />
            <div className="flex justify-between items-baseline pt-0.5">
              <span className="text-sm font-bold text-white print:text-slate-900 uppercase">
                TOTAL FATURADO:
              </span>
              <span className="text-xl font-black text-violet-400 print:text-violet-700">
                {formatarBRL(recibo.valorTotal)}
              </span>
            </div>
          </div>

          {/* Selo de Autenticidade e Assinatura */}
          <div className="pt-4 border-t border-slate-800 print:border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
              <ShieldCheck size={16} className="text-emerald-400 print:text-emerald-700 shrink-0" />
              <div>
                <span>Autenticação: </span>
                <span className="font-bold text-slate-400 select-all">{recibo.hashAutenticidade}</span>
              </div>
            </div>

            <div className="text-right text-[11px]">
              <span className="text-slate-500 block text-[10px]">Atendente Responsável:</span>
              <strong className="text-white print:text-slate-900 font-medium">{recibo.atendenteNome}</strong>
            </div>
          </div>

        </div>

        {/* Rodapé da Janela (não impresso) */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
            <CheckCircle2 size={16} />
            <span>Lançamento gravado com sucesso na conta do parceiro!</span>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer border border-slate-700/60"
          >
            Concluir / Fechar
          </button>
        </div>

      </div>
    </div>
  );
}

