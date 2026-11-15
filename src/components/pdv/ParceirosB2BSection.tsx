import React, { useState, useMemo } from 'react';
import {
  Building2,
  FileText,
  CheckCircle2,
  Phone,
  AlertCircle
} from 'lucide-react';
import type { Despachante, FaturaDespachantePendente } from '../../types/pdv';
import { formatarBRL, paraCentavos, deCentavos } from '../../lib/pdvCaixa';
import { mascararDocumento } from '../../utils/documento';
import GerenciarContasModal from './GerenciarContasModal';

export interface ParceirosB2BSectionProps {
  despachantes: Despachante[];
  faturasPendentes?: FaturaDespachantePendente[];
  bloqueado?: boolean;
  onLancarPrazo: (despachante: Despachante) => void;
  onQuitarFatura: (despachante: Despachante) => void;
  onAtualizarDespachantes: () => void;
}

export default function ParceirosB2BSection({
  despachantes,
  faturasPendentes = [],
  bloqueado = false,
  onLancarPrazo,
  onQuitarFatura,
  onAtualizarDespachantes,
}: ParceirosB2BSectionProps) {
  const [modalGerenciarAberto, setModalGerenciarAberto] = useState(false);

  // Calcula o saldo consolidado real por despachante considerando o cadastro e faturas pendentes
  const saldosConsolidados = useMemo(() => {
    const mapa = new Map<string, number>();

    // Soma das faturas pendentes na esteira
    for (const f of faturasPendentes) {
      const atualCent = mapa.get(f.despachanteId) || 0;
      mapa.set(f.despachanteId, atualCent + paraCentavos(f.valorTotal));
    }

    const mapaFinal = new Map<string, number>();
    for (const d of despachantes) {
      const somaFaturasCent = mapa.get(d.id) || 0;
      const saldoCadastroCent = paraCentavos(d.saldo_devedor || 0);
      // O saldo efetivo reflete o maior entre as faturas pendentes da esteira e o cadastro devedor
      const efetivoCent = Math.max(saldoCadastroCent, somaFaturasCent);
      mapaFinal.set(d.id, deCentavos(efetivoCent));
    }

    return mapaFinal;
  }, [despachantes, faturasPendentes]);

  return (
    <div className="mb-8 mt-2">
      {/* Cabeçalho da Seção Superior */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
            <Building2 size={16} />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">
              Conta-Corrente de Despachantes • Parceiros B2B
            </h3>
            <p className="text-xs text-slate-400">
              Controle de faturamento a prazo e quitação direta no PDV
            </p>
          </div>
        </div>

        {/* Botão de Gestão de Contas-Correntes B2B */}
        <button
          type="button"
          id="btn-gerenciar-contas-correntes"
          onClick={() => setModalGerenciarAberto(true)}
          className="px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow-indigo-950/40"
          title="Abrir Central de Gestão e Cadastro de Parceiros B2B"
        >
          <FileText size={14} />
          <span>Gerenciar Contas-Correntes</span>
        </button>
      </div>

      {/* Grade dos Cards Superiores (Mapeamento com Dados Reais) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {despachantes.length === 0 ? (
          <div className="col-span-3 p-8 bg-slate-900/60 border border-slate-800 rounded-2xl text-center text-slate-400 text-xs">
            Nenhum despachante cadastrado no sistema. Clique em &quot;Gerenciar Contas-Correntes&quot; para cadastrar.
          </div>
        ) : (
          despachantes.slice(0, 6).map((desp) => {
            // Mapeamento resiliente dos dados reais do despachante
            const nomeExibicao = desp.nome_razao || (desp as any).nome || 'Despachante Parceiro';
            const docBruto = desp.documento || (desp as any).cnpj || (desp as any).cpf || '';
            const crdd = (desp as any).crdd || (desp as any).numero_credenciamento || '';
            const status = (desp as any).status || 'ativa';
            const isAtiva = status === 'ativa';

            const docFormatado = docBruto ? mascararDocumento(docBruto) : '';
            const subtituloDocumento = docFormatado
              ? `CNPJ/CPF: ${docFormatado}${crdd ? ` • CRDD: ${crdd}` : ''}`
              : crdd
              ? `CRDD: ${crdd}`
              : 'Documento: Não informado';

            const saldoConsolidado = saldosConsolidados.get(desp.id) ?? (Number(desp.saldo_devedor) || 0);
            const temSaldo = saldoConsolidado > 0;

            return (
              <div
                key={desp.id}
                className="bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/40 rounded-2xl p-4 shadow-xl flex flex-col justify-between transition-all"
              >
                <div>
                  {/* Topo do Card: Nome e Badge */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <h4
                        className="font-bold text-slate-100 text-base line-clamp-1 leading-snug"
                        title={nomeExibicao}
                      >
                        {nomeExibicao}
                      </h4>
                      <p className="text-xs text-slate-400 font-mono mt-0.5 truncate" title={subtituloDocumento}>
                        {subtituloDocumento}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 border ${
                        isAtiva
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {isAtiva ? 'CONTA ATIVA' : 'BLOQUEADA'}
                    </span>
                  </div>

                  {/* Bloco de Saldo Devedor Consolidado */}
                  <div className="my-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Saldo Devedor:</span>
                    <span
                      className={`text-base font-bold font-mono tabular-nums ${
                        temSaldo ? 'text-indigo-300' : 'text-slate-400'
                      }`}
                    >
                      {formatarBRL(saldoConsolidado)}
                    </span>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => onLancarPrazo(desp)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-semibold transition-all cursor-pointer text-center"
                    title={`Lançar faturamento a prazo para ${nomeExibicao}`}
                  >
                    Lançar a Prazo
                  </button>

                  <button
                    type="button"
                    disabled={!temSaldo || bloqueado}
                    onClick={() => onQuitarFatura(desp)}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-1 ${
                      temSaldo && !bloqueado
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40'
                        : 'bg-slate-800/60 text-slate-500 border border-slate-800 cursor-not-allowed opacity-50'
                    }`}
                    title={
                      temSaldo
                        ? `Quitar saldo devedor de ${nomeExibicao} (${formatarBRL(saldoConsolidado)})`
                        : 'Sem faturas em aberto para quitação'
                    }
                  >
                    <CheckCircle2 size={13} />
                    <span>Quitar Fatura</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Executivo de Gestão de Contas B2B */}
      {modalGerenciarAberto && (
        <GerenciarContasModal
          isOpen={modalGerenciarAberto}
          onClose={() => setModalGerenciarAberto(false)}
          despachantes={despachantes}
          onDespachantesAtualizados={() => {
            onAtualizarDespachantes();
          }}
        />
      )}
    </div>
  );
}
