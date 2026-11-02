import React, { useState } from 'react';
import {
  FileText,
  LineChart,
  ScrollText,
  ArrowLeft,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import RelatoriosPDV from '../components/pdv/RelatoriosPDV';

interface RelatoriosProps {
  usuario?: any;
  onVoltar?: () => void;
}

type AbaRelatorios = 'vendas' | 'atas';

export default function Relatorios({ usuario, onVoltar }: RelatoriosProps) {
  const [abaAtiva, setAbaAtiva] = useState<AbaRelatorios>('vendas');

  const operadorNome =
    usuario?.nome || usuario?.nome_completo || usuario?.email || 'Auditor / Gestor';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Cabeçalho Corporativo Fixo */}
      <header className="sticky top-0 z-40 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-xl px-4 sm:px-8 py-4 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onVoltar && (
              <button
                type="button"
                onClick={onVoltar}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-all cursor-pointer shadow-sm"
                title="Voltar"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-sm">
              <FileText size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white">
                  Integra CRVA · Controladoria & Relatórios
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                  Auditoria Fiscal
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Emissão de 2ª via de cupons, volumetria por catálogo de serviços e atas auditadas
              </p>
            </div>
          </div>

          {/* Abas e Perfil */}
          <div className="flex items-center gap-3">
            {/* Seletor de Abas Corporativo */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950/90 border border-slate-800 rounded-2xl shadow-inner">
              <button
                type="button"
                onClick={() => setAbaAtiva('vendas')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                  abaAtiva === 'vendas'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                    : 'bg-transparent text-slate-400 hover:text-white'
                }`}
              >
                <LineChart size={14} />
                <span>Vendas & Catálogo</span>
              </button>

              <button
                type="button"
                onClick={() => setAbaAtiva('atas')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                  abaAtiva === 'atas'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                    : 'bg-transparent text-slate-400 hover:text-white'
                }`}
              >
                <ScrollText size={14} />
                <span>Atas de Encerramento</span>
              </button>
            </div>

            {/* Identificação do Usuário */}
            <div className="hidden md:flex items-center gap-2.5 pl-3 border-l border-slate-800 text-xs">
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center font-bold text-emerald-400 text-xs">
                {operadorNome.charAt(0).toUpperCase()}
              </div>
              <div className="leading-tight">
                <p className="font-bold text-slate-200 truncate max-w-[140px]">{operadorNome}</p>
                <span className="text-[10px] text-slate-500 font-mono">Controladoria</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        <RelatoriosPDV aba={abaAtiva} />
      </main>

      {/* Rodapé Corporativo */}
      <footer className="border-t border-slate-900 bg-slate-950/90 py-4 px-6 text-center text-xs text-slate-500 no-print">
        <p>
          Integra CRVA · Módulo de Controladoria, PDV & Auditoria Contábil · Alíquota ISSQN 2% Detran-RS
        </p>
      </footer>
    </div>
  );
}

