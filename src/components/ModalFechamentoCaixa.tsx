import React, { useState, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  FileText,
  Printer,
  Receipt,
  X,
} from 'lucide-react';
import type { CaixaDiario, ResultadoFechamento, SnapshotAtaEncerramento } from '../lib/pdvCaixa';
import { formatarBRL } from '../lib/pdvCaixa';
import AtaEncerramento, { extrairSnapshotNormalizado } from './AtaEncerramento';

/* ------------------------------- Utilitários ------------------------------- */

function mascararMoeda(valor: string): string {
  const digits = valor.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function desmascararMoeda(valor: string): number {
  if (!valor) return 0;
  const digits = valor.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

const fmtDataHora = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
};

/* ---------------------- Modal de Fechamento Cego --------------------------- */

export interface ModalFechamentoCaixaProps {
  onClose: () => void;
  onConfirmar: (valorInformado: number) => Promise<void>;
  caixaId?: string;
  operadorNome?: string;
}

export function ModalFechamentoCaixa({
  onClose,
  onConfirmar,
  caixaId,
  operadorNome,
}: ModalFechamentoCaixaProps) {
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valor) {
      setErro('Informe o valor físico em dinheiro apurado na gaveta (digite R$ 0,00 se estiver vazia).');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const v = desmascararMoeda(valor);
      await onConfirmar(v);
    } catch (err: any) {
      setErro(err?.message || 'Falha ao processar o encerramento do turno.');
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-6 space-y-4 text-slate-100 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
              <EyeOff size={18} />
            </div>
            <div>
              <h3 className="font-black text-white text-base">Fechamento Cego de Caixa</h3>
              <p className="text-[11px] text-slate-400">
                Turno #{caixaId ? caixaId.slice(0, 8).toUpperCase() : 'ATIVO'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 border-0 bg-transparent cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-300 space-y-1.5">
          <p className="font-semibold text-slate-200">
            Operador Responsável: <strong className="text-emerald-400">{operadorNome || 'Operador'}</strong>
          </p>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            Realize a contagem física das cédulas e moedas presentes na gaveta. Por integridade algorítmica e conformidade contábil, o saldo esperado do sistema permanece oculto até a confirmação.
          </p>
        </div>

        <div>
          <label htmlFor="valor-gaveta" className="block text-xs font-bold text-slate-300 mb-1.5">
            Valor Físico Declarado em Espécie (Gaveta) *
          </label>
          <div className="relative">
            <input
              id="valor-gaveta"
              type="text"
              inputMode="numeric"
              value={valor}
              onChange={(e) => setValor(mascararMoeda(e.target.value))}
              placeholder="R$ 0,00"
              autoFocus
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-2xl text-xl font-mono font-black text-emerald-400 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {erro && (
          <div className="p-3 bg-red-950/60 border border-red-500/40 text-red-300 rounded-xl text-xs font-medium flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-red-400" />
            <span>{erro}</span>
          </div>
        )}

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 cursor-pointer transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            id="btn-confirmar-fechamento-cego"
            disabled={salvando}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white rounded-xl text-xs font-bold border-0 cursor-pointer shadow-lg shadow-rose-950/50 flex items-center justify-center gap-1.5 transition-all"
          >
            {salvando ? (
              <span>Gravando Encerramento...</span>
            ) : (
              <>
                <CheckCircle2 size={15} />
                <span>Confirmar e Encerrar</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ----------------- Visualizador de Documentos Oficiais --------------------- */

type ModoDocumento = 'ataA4' | 'cupom80';

export interface VisualizadorEncerramentoProps {
  resultado: ResultadoFechamento;
  operadorNome: string;
  podeVerDivergencia?: boolean;
  onConcluir: () => void;
}

export function VisualizadorEncerramento({
  resultado,
  operadorNome,
  podeVerDivergencia = true,
  onConcluir,
}: VisualizadorEncerramentoProps) {
  // Padrão abre direto na Ata Oficial A4 Corporativa
  const [modo, setModo] = useState<ModoDocumento>('ataA4');
  const printContainerRef = useRef<HTMLDivElement>(null);

  const c: CaixaDiario = resultado.caixa;
  const ata: SnapshotAtaEncerramento = resultado.ata;

  // Extrai o snapshot imutável normalizado (sem risco de valores zerados)
  const snap = extrairSnapshotNormalizado(c, ata, operadorNome);
  const { identificacao, valores, hash_autenticacao } = snap;

  const exato = valores.resultado_conferencia === 'EXATO';
  const quebra = valores.resultado_conferencia === 'QUEBRA';

  const rotuloStatus = exato
    ? 'CONFERÊNCIA EXATA'
    : quebra
    ? 'QUEBRA DE CAIXA'
    : 'SOBRA DE CAIXA';

  const imprimirDocumento = () => {
    window.print();
  };

  return (
    <div className="modal-encerramento-wrapper fixed inset-0 z-[130] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible print:block">
      {/* Estilos dedicados de controle de página sem duplicidades ou folhas em branco */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          /* Oculta o conteúdo da tela principal do PDV atrás do modal */
          header, main, .no-print {
            display: none !important;
          }
          .modal-encerramento-wrapper,
          .modal-encerramento-card,
          .modal-encerramento-scroll {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            background: #ffffff !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          #documento-ata-a4 {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          #documento-cupom-80mm {
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 2mm !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="modal-encerramento-card w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh] text-slate-100">
        
        {/* Barra de Ferramentas Superior (Oculta na impressão) */}
        <div className="no-print p-4 sm:p-5 bg-slate-850 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-black">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white">Turno Oficialmente Encerrado</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wide">
                  Snapshot Auditado
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Turno {identificacao.turno_id} · Fechado em {fmtDataHora(identificacao.data_fechamento)}
              </p>
            </div>
          </div>

          {/* Seletor de Formato de Documento */}
          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setModo('ataA4')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border-0 ${
                modo === 'ataA4'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-transparent text-slate-400 hover:text-white'
              }`}
            >
              <FileText size={14} />
              <span>Ata Oficial A4</span>
            </button>
            <button
              type="button"
              onClick={() => setModo('cupom80')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border-0 ${
                modo === 'cupom80'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Receipt size={14} />
              <span>Cupom 80mm</span>
            </button>
          </div>

          {/* Ações Rápidas */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={imprimirDocumento}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-2 cursor-pointer transition-all shadow-sm"
            >
              <Printer size={15} className="text-emerald-400" />
              <span>Imprimir {modo === 'ataA4' ? 'Ata Oficial' : 'Cupom'}</span>
            </button>
            <button
              type="button"
              id="btn-concluir-fechamento-pdv"
              onClick={onConcluir}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold border-0 cursor-pointer transition-all shadow-md shadow-emerald-950/50"
            >
              Concluir e Resetar PDV
            </button>
          </div>
        </div>

        {/* Área Visualizadora dos Documentos */}
        <div
          ref={printContainerRef}
          className="modal-encerramento-scroll p-4 sm:p-8 overflow-y-auto bg-slate-950 flex justify-center items-start"
        >
          {/* 1. ATA OFICIAL DE ENCERRAMENTO E AUDITORIA (FOLHA A4 CORPORATIVA) */}
          {modo === 'ataA4' && (
            <AtaEncerramento
              caixa={c}
              ataFallback={ata}
              operadorNomeFallback={operadorNome}
              podeVerDivergencia={podeVerDivergencia}
            />
          )}

          {/* 2. CUPOM DE ENCERRAMENTO DE TURNO (PADRÃO TÉRMICO 80MM) */}
          {modo === 'cupom80' && (
            <div
              id="documento-cupom-80mm"
              className="w-full max-w-[340px] bg-white text-slate-900 rounded-2xl shadow-2xl p-5 font-mono text-xs border border-slate-200"
            >
              {/* Cabeçalho */}
              <div className="text-center space-y-1 pb-3 border-b-2 border-dashed border-slate-400">
                <p className="font-black text-sm uppercase tracking-tight">INTEGRA CRVA · GESTÃO PDV</p>
                <p className="text-[10px] text-slate-600 font-semibold uppercase">
                  {identificacao.unidade}
                </p>
                <p className="font-bold text-xs uppercase pt-1 text-slate-800">
                  CUPOM DE ENCERRAMENTO DE TURNO
                </p>
                <p className="text-[10px] text-slate-600">
                  TURNO: {identificacao.turno_id}
                </p>
              </div>

              {/* Dados do Turno e Operador */}
              <div className="py-2.5 border-b border-dashed border-slate-300 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">OPERADOR:</span>
                  <span className="font-bold text-right truncate max-w-[170px]">{identificacao.operador_nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">CPF:</span>
                  <span className="font-bold">{identificacao.operador_cpf}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">TERMINAL:</span>
                  <span className="font-bold">{identificacao.terminal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">ABERTURA:</span>
                  <span>{fmtDataHora(identificacao.data_abertura)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">FECHAMENTO:</span>
                  <span>{fmtDataHora(identificacao.data_fechamento)}</span>
                </div>
              </div>

              {/* Totalizadores Finais Segregados */}
              <div className="py-2.5 border-b-2 border-dashed border-slate-400 text-[11px] space-y-1">
                <p className="font-bold text-center uppercase tracking-wide text-slate-700 pb-1">
                  TOTALIZADORES DO TURNO
                </p>

                <ItemCupom rotulo="Fundo de Troco Inicial" valor={formatarBRL(valores.fundo_troco)} />
                <ItemCupom rotulo="Total em Dinheiro" valor={formatarBRL(valores.total_dinheiro)} />
                <ItemCupom rotulo="Total em PIX" valor={formatarBRL(valores.total_pix)} destaque />
                <ItemCupom rotulo="Total Cartão Débito" valor={formatarBRL(valores.total_debito)} />
                <ItemCupom rotulo="Total Cartão Crédito" valor={formatarBRL(valores.total_credito)} />
                <ItemCupom rotulo="Total Despachantes (Prazo)" valor={formatarBRL(valores.total_despachante_aberto)} />

                <div className="my-1.5 border-t border-dashed border-slate-300" />
                <ItemCupom
                  rotulo="Faturamento Bruto Turno"
                  valor={formatarBRL(valores.faturamento_bruto)}
                  negrito
                />
                <ItemCupom rotulo="ISSQN Apurado (2%)" valor={formatarBRL(valores.total_issqn)} />

                <div className="my-1.5 border-t border-dashed border-slate-300" />
                <ItemCupom rotulo="Total Sangrias (-)" valor={formatarBRL(valores.total_sangrias)} />
                <ItemCupom rotulo="Total Suprimentos (+)" valor={formatarBRL(valores.total_suprimentos)} />

                <div className="my-1.5 border-t-2 border-slate-400 pt-1" />
                <ItemCupom
                  rotulo="Saldo Esperado (Espécie)"
                  valor={formatarBRL(valores.saldo_esperado)}
                />
                <ItemCupom
                  rotulo="Saldo Declarado Gaveta"
                  valor={formatarBRL(valores.valor_declarado)}
                  negrito
                />
                {podeVerDivergencia && (
                  <ItemCupom
                    rotulo="Divergência Apurada"
                    valor={`${valores.diferenca > 0 ? '+' : ''}${formatarBRL(valores.diferenca)}`}
                    negrito
                  />
                )}
              </div>

              {/* Parecer Final */}
              <div className="py-2 text-center">
                <span
                  className={`inline-block px-2.5 py-1 text-[10px] font-black uppercase rounded ${
                    exato
                      ? 'bg-emerald-100 text-emerald-800'
                      : quebra
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {rotuloStatus}
                </span>
              </div>

              {/* Rodapé Limpo */}
              <div className="pt-2 border-t border-dashed border-slate-300 text-center space-y-1">
                <p className="text-[8px] text-slate-500 pt-1">
                  DOCUMENTO GERADO ELETRONICAMENTE · INTEGRA CRVA
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------ Subcomponente Auxiliar de Linha ------------------------ */

function ItemCupom({
  rotulo,
  valor,
  negrito = false,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  negrito?: boolean;
  destaque?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center gap-2 ${negrito ? 'font-black text-slate-950' : 'text-slate-800'}`}>
      <span className="truncate">{rotulo}:</span>
      <span className={`font-mono text-right shrink-0 ${destaque ? 'font-bold' : ''}`}>
        {valor}
      </span>
    </div>
  );
}

export default ModalFechamentoCaixa;
