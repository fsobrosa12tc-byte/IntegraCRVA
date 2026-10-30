import React, { useRef } from 'react';
import { 
  Printer, 
  Download, 
  X, 
  Building2, 
  FileCheck, 
  ShieldCheck,
  Receipt
} from 'lucide-react';
import type { Despachante, FormaPagamento } from '../../types/pdv';
import { formatarBRL, deCentavos, paraCentavos } from '../../lib/pdvCaixa';

export interface ItemVendaCupom {
  codigo: string;
  nome: string;
  qtd: number;
  valorUnitario: number;
}

export interface CupomFiscalProps {
  numeroCupom: string;
  dataEmissao: string;
  operadorNome: string;
  atendenteNome?: string | null;
  clienteNome?: string | null;
  itens: ItemVendaCupom[];
  totalCent: number;
  subtotalServicosProp?: number;
  valorIssqnProp?: number;
  valorTotalCobradoProp?: number;
  formaPagamento: FormaPagamento | string;
  despachante?: Despachante | null;
  cpfConsumidor?: string | null;
  saldoAposFatura?: number | null;
  valorRecebido?: number | null;
  troco?: number | null;
  onFechar: () => void;
}

const ROTULO_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro (Em Espécie)',
  pix: 'PIX (Liquidação Instantânea)',
  cartao_debito: 'Cartão de Débito',
  cartao_credito: 'Cartão de Crédito',
  faturamento: 'Faturado a Prazo - Débito Despachante'
};

export default function CupomFiscalModal({
  numeroCupom,
  dataEmissao,
  operadorNome,
  atendenteNome,
  clienteNome,
  itens,
  totalCent,
  subtotalServicosProp,
  valorIssqnProp,
  valorTotalCobradoProp,
  formaPagamento,
  despachante,
  cpfConsumidor,
  saldoAposFatura,
  valorRecebido,
  troco,
  onFechar
}: CupomFiscalProps) {
  const cupomRef = useRef<HTMLDivElement>(null);

  // 1. Subtotal dos Serviços:
  const subtotalServicos = (() => {
    if (subtotalServicosProp !== undefined && subtotalServicosProp !== null) return subtotalServicosProp;
    if (itens && itens.length > 0) {
      return itens.reduce((acc, item) => acc + (item.qtd * item.valorUnitario), 0);
    }
    return deCentavos(totalCent);
  })();

  // 2. Cálculo do ISSQN (2,00%):
  const valorIssqn = (() => {
    if (valorIssqnProp !== undefined && valorIssqnProp !== null) return valorIssqnProp;
    return Math.round((subtotalServicos * 0.02) * 100) / 100;
  })();

  // 3. Total Final Obrigatório (com ISSQN somado):
  const valorTotalCobrado = (() => {
    if (valorTotalCobradoProp !== undefined && valorTotalCobradoProp !== null) return valorTotalCobradoProp;
    return Math.round((subtotalServicos + valorIssqn) * 100) / 100;
  })();

  const faturadoB2B = formaPagamento === 'faturamento' && !!despachante;

  // Gerador de hash de autenticidade fiscal
  const hashFiscal = `MS-${numeroCupom.replace(/\D/g, '') || '001'}-${Math.abs(
    Array.from(dataEmissao + operadorNome).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0)
  ).toString(16).toUpperCase().padStart(8, '0')}`;

  const handlePrint = () => {
    window.print();
  };

  /**
   * Renderiza uma via completa do documento fiscal (1ª Via Estabelecimento / 2ª Via Cliente)
   */
  const renderViaCupom = (tituloVia: string, subtituloVia?: string) => (
    <div className="via-cupom-bloco p-5 bg-white text-slate-900 font-sans text-xs">
      {/* 0. IDENTIFICAÇÃO DA VIA */}
      <div className="text-center font-mono font-black text-[11px] tracking-wider py-1 border-b border-dashed border-slate-400 bg-slate-100 text-slate-800 mb-2.5 uppercase rounded-sm">
        {tituloVia}
      </div>

      {/* 1. CABEÇALHO INSTITUCIONAL */}
      <div className="text-center pb-3 border-b border-dashed border-slate-400 space-y-1">
        <h1 className="text-base font-black tracking-tight text-slate-900 uppercase">
          MARKS SYSTEMS · INTEGRA CRVA / PDV
        </h1>
        <p className="text-[11px] font-bold text-slate-700">
          CRVA 0012 · REGISTRO E SERVIÇOS VEICULARES
        </p>
        <p className="text-[10px] text-slate-600 font-mono">
          CNPJ: 92.123.456/0001-78 · IE: ISENTO · IM: 45.892/001
        </p>
        <p className="text-[10px] text-slate-600">
          Av. Central dos Registros, 1000 — Passo Fundo / RS
        </p>
        <div className="pt-1 flex items-center justify-between text-[10px] font-mono text-slate-700 border-t border-slate-200 mt-2">
          <span>Emissão: {new Date(dataEmissao).toLocaleString('pt-BR')}</span>
          <span>Cupom: <strong>{numeroCupom}</strong></span>
        </div>
        <div className="text-left text-[10px] text-slate-600 flex flex-wrap justify-between gap-1">
          <span>Operador Caixa: <strong>{operadorNome}</strong></span>
          {atendenteNome && (
            <span>Atendente Balcão: <strong>{atendenteNome}</strong></span>
          )}
        </div>
      </div>

      {/* 2. IDENTIFICAÇÃO DO TOMADOR / CLIENTE */}
      <div className="py-2.5 border-b border-dashed border-slate-400 text-[11px] space-y-0.5">
        <div className="font-bold uppercase text-slate-500 text-[10px] tracking-wider">
          Tomador do Serviço / Cliente
        </div>
        {despachante ? (
          <div className="space-y-0.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Building2 size={12} className="text-indigo-600 print:hidden" />
              <span>{despachante.nome_razao}</span>
            </div>
            <div className="font-mono text-[10px] text-slate-700">
              CPF/CNPJ: {despachante.documento} {despachante.telefone && `· Tel: ${despachante.telefone}`}
            </div>
          </div>
        ) : clienteNome ? (
          <div className="text-slate-800 space-y-0.5">
            <div className="font-bold">{clienteNome}</div>
            {cpfConsumidor && (
              <div className="font-mono text-[10px] text-slate-600">CPF/CNPJ: {cpfConsumidor}</div>
            )}
          </div>
        ) : (
          <div className="text-slate-800">
            <span className="font-bold">Consumidor Final</span>
            {cpfConsumidor && (
              <span className="font-mono text-slate-600 ml-2">CPF: {cpfConsumidor}</span>
            )}
          </div>
        )}
      </div>

      {/* 3. DISCRIMINAÇÃO DOS ITENS / SERVIÇOS */}
      <div className="py-2.5 border-b border-dashed border-slate-400">
        <div className="font-bold uppercase text-slate-500 text-[10px] tracking-wider mb-1.5">
          Discriminação dos Serviços Prestados
        </div>
        <table className="w-full text-left text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-slate-300 text-slate-600 text-[10px] font-bold">
              <th className="py-1">Cód.</th>
              <th className="py-1">Descrição</th>
              <th className="py-1 text-center">Qtd</th>
              <th className="py-1 text-right">Unit. (R$)</th>
              <th className="py-1 text-right">Total (R$)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {itens.map((item, idx) => {
              const subtotalItem = deCentavos(paraCentavos(item.valorUnitario) * item.qtd);
              return (
                <tr key={idx} className="align-top font-sans">
                  <td className="py-1.5 font-mono text-[10px] text-slate-500 pr-1">{item.codigo}</td>
                  <td className="py-1.5 pr-2 font-medium text-slate-800 leading-tight">
                    {item.nome}
                  </td>
                  <td className="py-1.5 text-center font-mono">{item.qtd}</td>
                  <td className="py-1.5 text-right font-mono text-slate-600 whitespace-nowrap">
                    {item.valorUnitario.toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                    {subtotalItem.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 4. RESUMO CONTÁBIL LIMPO E DIRETO (SEM TEXTOS REDUNDANTES) */}
      <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-600">Subtotal dos Serviços:</span>
          <span className="font-mono font-bold text-slate-800">R$ {subtotalServicos.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-center text-xs text-emerald-800 font-semibold">
          <span>(+) ISSQN Municipal (2,00%):</span>
          <span className="font-mono font-bold">R$ {valorIssqn.toFixed(2)}</span>
        </div>

        {/* Total Final Obrigatório */}
        <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-300">
          <span className="text-sm font-black text-slate-900 uppercase tracking-tight">TOTAL A PAGAR:</span>
          <span className="text-xl font-black font-mono text-slate-900 tracking-tight">
            R$ {valorTotalCobrado.toFixed(2)}
          </span>
        </div>

        {/* Meio de Pagamento */}
        <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200">
          <span className="text-slate-600 font-medium">Forma de Pagamento:</span>
          <span className={`font-bold uppercase text-[11px] ${faturadoB2B ? 'text-indigo-700' : 'text-slate-900'}`}>
            {ROTULO_PAGAMENTO[formaPagamento] || formaPagamento}
          </span>
        </div>

        {/* Detalhamento de Dinheiro (Valor Recebido e Troco) se aplicável */}
        {formaPagamento === 'dinheiro' && valorRecebido !== undefined && valorRecebido !== null && valorRecebido > 0 && (
          <div className="pt-1 mt-1 border-t border-dashed border-slate-200 space-y-0.5 text-xs">
            <div className="flex justify-between items-center text-slate-600">
              <span>Valor Recebido:</span>
              <span className="font-mono font-semibold text-slate-800">{formatarBRL(valorRecebido)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-900 font-bold">
              <span>Troco:</span>
              <span className="font-mono text-emerald-700">{formatarBRL(troco ?? Math.max(0, valorRecebido - valorTotalCobrado))}</span>
            </div>
          </div>
        )}
      </div>

      {/* 5. TERMO DE ACEITE EM CASO DE FATURAMENTO B2B */}
      {faturadoB2B && (
        <div className="py-2.5 border-b border-dashed border-slate-400 space-y-2 text-[10px] text-slate-700">
          <div className="font-bold uppercase text-slate-900 flex items-center gap-1">
            <FileCheck size={12} className="text-indigo-600" />
            <span>Termo de Reconhecimento e Faturamento a Prazo</span>
          </div>
          <p className="leading-relaxed text-justify">
            Declaro que reconheço os serviços descritos neste cupom fiscal no montante de{' '}
            <strong>R$ {valorTotalCobrado.toFixed(2)}</strong> vinculados à O.S./Protocolo{' '}
            <strong>{numeroCupom}</strong>, autorizando o débito na conta-corrente de{' '}
            <strong>{despachante!.nome_razao}</strong> (CNPJ/CPF: {despachante!.documento}).
          </p>
          {saldoAposFatura !== null && saldoAposFatura !== undefined && (
            <div className="flex justify-between items-center p-2 bg-indigo-50/80 border border-indigo-200 rounded font-mono text-[10px]">
              <span className="text-indigo-950 font-bold">Saldo Devedor Atualizado:</span>
              <span className="font-black text-indigo-900">{formatarBRL(saldoAposFatura)}</span>
            </div>
          )}
          <div className="pt-5">
            <div className="border-t border-slate-500 text-center text-[9px] text-slate-600 pt-1 uppercase">
              Assinatura do Despachante / Responsável Legal
            </div>
          </div>
        </div>
      )}

      {/* 6. RODAPÉ DE AUTENTICIDADE FISCAL */}
      <div className="pt-2 text-center space-y-0.5 text-[9px] text-slate-500 font-mono">
        <div className="flex items-center justify-center gap-1 font-bold text-slate-700">
          <ShieldCheck size={11} className="text-emerald-600" />
          <span>AUTENTICAÇÃO FISCAL ELETRÔNICA</span>
        </div>
        <p className="tracking-widest font-black text-slate-800">{hashFiscal}</p>
        <p className="text-[8px] text-slate-400">
          Documento auxiliar de prestação de serviços CRVA / DETRAN-RS.
        </p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/85 backdrop-blur-sm flex items-start justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn">
      {/* Estilos embutidos para @media print: bobina 80mm e folha A4 contínua */}
      <style>{`
        @media print {
          @page {
            margin: 4mm;
            size: auto;
          }
          body {
            background: white !important;
            color: black !important;
          }
          /* Oculta tudo que não for a área do cupom */
          body * {
            visibility: hidden;
          }
          #area-cupom-fiscal, #area-cupom-fiscal * {
            visibility: visible;
          }
          #area-cupom-fiscal {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .via-cupom-bloco {
            page-break-inside: avoid;
            break-inside: avoid;
            padding: 2mm 0 !important;
          }
          .linha-corte-print {
            page-break-inside: avoid;
            break-inside: avoid;
            margin: 4mm 0 !important;
          }
        }
      `}</style>

      {/* Container Principal do Modal */}
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl my-4 sm:my-8 overflow-hidden text-slate-100 flex flex-col">
        {/* Barra Superior de Controle */}
        <div className="p-4 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Receipt size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                {faturadoB2B ? 'Comprovante Fiscal Despachante (Duas Vias)' : 'Cupom Fiscal de Serviços (Duas Vias)'}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">Protocolo: {numeroCupom}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors cursor-pointer border-0 bg-transparent"
            title="Fechar Visualização"
          >
            <X size={20} />
          </button>
        </div>

        {/* ÁREA DO CUPOM IMPRESSO: DUAS VIAS SEQUENCIAIS COM LINHA DE CORTE */}
        <div 
          ref={cupomRef}
          id="area-cupom-fiscal" 
          className="print-area bg-white text-slate-900 selection:bg-slate-200 print:p-0 print:m-0 print:w-full print:max-w-none print:shadow-none"
        >
          {/* ===================================================================
           *  1ª VIA: ESTABELECIMENTO / CAIXA
           * =================================================================== */}
          {renderViaCupom('--- 1ª VIA: ESTABELECIMENTO / CAIXA ---')}

          {/* ===================================================================
           *  SEPARADOR DE CORTE ESTILIZADO COM TESOURA
           * =================================================================== */}
          <div className="linha-corte-print my-4 px-4 flex items-center justify-center gap-2 text-slate-400 font-mono text-xs select-none">
            <span className="flex-1 border-b-2 border-dashed border-slate-400"></span>
            <span className="flex items-center gap-1.5 px-3 py-0.5 bg-slate-100 border border-slate-300 rounded text-slate-700 font-bold text-[10px] uppercase tracking-wider">
              <span>✂</span>
              <span>CORTAR AQUI</span>
              <span>✂</span>
            </span>
            <span className="flex-1 border-b-2 border-dashed border-slate-400"></span>
          </div>

          {/* ===================================================================
           *  2ª VIA: CLIENTE / TOMADOR
           * =================================================================== */}
          {renderViaCupom('--- 2ª VIA: CLIENTE / TOMADOR ---')}
        </div>

        {/* ===================================================================
         *  BOTÕES DE AÇÃO NA PARTE INFERIOR (DARK FINTECH)
         * =================================================================== */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center gap-3 print:hidden">
          {/* 1. Botão Imprimir Cupom */}
          <button
            type="button"
            onClick={handlePrint}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center gap-2 border border-emerald-400/30 cursor-pointer"
          >
            <Printer size={16} />
            <span>Imprimir Cupom</span>
          </button>

          {/* 2. Botão Salvar em PDF */}
          <button
            type="button"
            onClick={handlePrint}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-5 py-2.5 rounded-xl border border-slate-700 shadow-md transition-all flex items-center gap-2 hover:text-white cursor-pointer"
            title="Utiliza a impressora do sistema para salvar como PDF"
          >
            <Download size={16} />
            <span>Salvar em PDF</span>
          </button>

          {/* 3. Botão Fechar */}
          <button
            type="button"
            onClick={onFechar}
            className="ml-auto bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-medium px-5 py-2.5 rounded-xl border border-slate-700/80 transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
