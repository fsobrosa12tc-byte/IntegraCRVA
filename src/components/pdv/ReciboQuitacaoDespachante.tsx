import React, { useEffect } from 'react';
import { Printer, Receipt, X } from 'lucide-react';
import type { ComprovanteLiquidacao } from '../../lib/pdvContaCorrente';
import type { ItemFaturamentoDespachante } from '../../types/pdv';
import {
  PDV_PRINT_PROFILES,
  imprimirComprovanteIsolado,
  usePdvPrintFormat,
  type DadosCupomImpressao,
} from '../../lib/pdvPrint';
import ComprovantePreviewBody from './ComprovantePreviewBody';

export interface ReciboQuitacaoDespachanteProps {
  comprovante: ComprovanteLiquidacao;
  servicos?: ItemFaturamentoDespachante[];
  clienteNome?: string | null;
  clienteDocumento?: string | null;
  veiculoPlaca?: string | null;
  onFechar?: () => void;
}

export default function ReciboQuitacaoDespachante({
  comprovante,
  servicos,
  clienteNome,
  clienteDocumento,
  veiculoPlaca,
  onFechar,
}: ReciboQuitacaoDespachanteProps) {
  const [printFormat] = usePdvPrintFormat();
  const profile = PDV_PRINT_PROFILES[printFormat];

  useEffect(() => {
    if (!onFechar) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onFechar]);

  const cliNome = comprovante.clienteNome || clienteNome || null;
  const cliDoc = comprovante.clienteDocumento || clienteDocumento || null;
  const veicPlaca = comprovante.veiculoPlaca || veiculoPlaca || null;

  const listaServicos: ItemFaturamentoDespachante[] =
    comprovante.servicos && comprovante.servicos.length > 0
      ? comprovante.servicos
      : servicos && servicos.length > 0
      ? servicos
      : [
          {
            codigo: 'SRV-0001',
            servico: 'Serviços Notariais / Balcão CRVA',
            quantidade: 1,
            valor_unitario: Math.round((comprovante.valorLiquidado / 1.02) * 100) / 100,
            subtotal: Math.round((comprovante.valorLiquidado / 1.02) * 100) / 100,
          },
        ];

  const subtotalServicos =
    comprovante.subtotalServicos !== undefined
      ? comprovante.subtotalServicos
      : Math.round(
          listaServicos.reduce((acc, i) => acc + Number(i.subtotal || 0), 0) * 100
        ) / 100;

  const dataFormatada = new Date(comprovante.dataHora).toLocaleString('pt-BR');

  const rotuloForma = (forma: string): string => {
    const f = (forma || '').toLowerCase();
    if (f === 'pix') return 'PIX';
    if (f === 'dinheiro') return 'DINHEIRO';
    if (f === 'cartao_debito' || f === 'debito') return 'CARTÃO DE DÉBITO';
    if (f === 'cartao_credito' || f === 'credito') return 'CARTÃO DE CRÉDITO';
    if (f === 'transferencia') return 'TRANSFERÊNCIA BANCÁRIA';
    return (forma || 'PIX').toUpperCase();
  };

  const numeroReciboCabecalho =
    comprovante.faturaNumeroOriginal && !comprovante.faturaNumeroOriginal.includes('ordens')
      ? `#${comprovante.faturaNumeroOriginal.trim().replace(/^#+/, '')}`
      : comprovante.protocolo;

  const dadosImpressao: DadosCupomImpressao = {
    tituloDocumento: 'Comprovante de Quitação de Conta-Corrente',
    numeroRecibo: numeroReciboCabecalho,
    dataHora: dataFormatada,
    tomadorLabel: 'Despachante / Parceiro B2B',
    tomadorNome: comprovante.despachante.nome_razao,
    tomadorDocumento: comprovante.despachante.documento,
    faturaReferencia: comprovante.faturaNumeroOriginal || 'Fatura Balcão',
    clienteFinalNome: cliNome,
    clienteFinalDocumento: cliDoc,
    clienteFinalPlaca: veicPlaca,
    operadorNome: comprovante.operadorNome,
    formaPagamento: rotuloForma(comprovante.meioPagamento),
    itens: listaServicos.map((it) => ({
      codigo: it.codigo || 'SRV',
      descricao: it.servico,
      quantidade: Number(it.quantidade || 1),
      valorUnitario: Number(it.valor_unitario || 0),
      subtotal: Number(it.subtotal || 0),
    })),
    subtotal: subtotalServicos,
    issqn: comprovante.valorIssqnSegregado,
    valorTotal: comprovante.valorLiquidado,
    saldoAnterior: comprovante.saldoAnterior,
    saldoRestante: comprovante.saldoRestante,
    itensQuitadosCount: comprovante.itensQuitadosCount,
    hashAutenticidade: comprovante.hashAutenticidade,
    labelVia1: '1ª VIA — COMPROVANTE DO DESPACHANTE',
    labelVia2: '2ª VIA — CONTROLE INTERNO / CAIXA CRVA',
    assinaturaVia1: 'Autenticação do Caixa do CRVA',
    assinaturaVia2: 'Assinatura / Rubrica do Despachante',
  };

  const handleImprimir = () => {
    imprimirComprovanteIsolado(dadosImpressao, printFormat);
  };

  return (
    <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 my-auto">
      {/* Cabeçalho Compacto */}
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <Receipt size={17} />
          </div>
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <h3 className="font-bold text-white text-sm sm:text-base tracking-tight truncate">
              Comprovante de Quitação Fiscal
            </h3>
            <span className="px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-amber-300 font-mono text-[11px] font-semibold tracking-wide whitespace-nowrap">
              {numeroReciboCabecalho}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700/80 whitespace-nowrap">
              {profile.badgeText}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleImprimir}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg cursor-pointer transition-all border-0"
            title={`Imprimir no perfil ${profile.shortLabel}`}
          >
            <Printer size={14} />
            <span>Imprimir Cupom Fiscal</span>
          </button>

          {onFechar && (
            <button
              type="button"
              onClick={onFechar}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer border-0 bg-transparent"
              title="Fechar Comprovante"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Área de Pré-Visualização Centralizada */}
      <div className="bg-slate-950/70 p-6 flex justify-center overflow-y-auto max-h-[72vh]">
        <ComprovantePreviewBody dados={dadosImpressao} format={printFormat} />
      </div>

      {/* Rodapé Discreto */}
      <div className="px-6 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <span className="font-mono text-[11px] truncate">
          Protocolo {comprovante.protocolo} • {comprovante.itensQuitadosCount} ordem(ns) liquidada(s)
        </span>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer border border-slate-700 transition-colors"
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  );
}
