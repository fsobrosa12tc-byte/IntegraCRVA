import React, { useEffect, useState } from 'react';
import { Printer, Receipt, FileText, CheckCircle2, X, Settings } from 'lucide-react';
import {
  PDV_PRINT_PROFILE_LIST,
  usePdvPrintFormat,
  type PdvPrintFormat,
} from '../../lib/pdvPrint';

interface ConfiguracoesImpressaoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ConfiguracoesImpressaoModal({
  isOpen,
  onClose,
}: ConfiguracoesImpressaoModalProps) {
  const [format, setFormat] = usePdvPrintFormat();
  const [salvoFeedback, setSalvoFeedback] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelect = (nextFormat: PdvPrintFormat) => {
    setFormat(nextFormat);
    setSalvoFeedback(true);
    setTimeout(() => setSalvoFeedback(false), 2200);
  };

  const renderIcon = (id: PdvPrintFormat, ativo: boolean) => {
    const colorClass = ativo ? 'text-emerald-400' : 'text-slate-400';
    if (id === 'thermal_80mm') return <Receipt size={20} className={colorClass} />;
    if (id === 'thermal_58mm') return <Printer size={20} className={colorClass} />;
    return <FileText size={20} className={colorClass} />;
  };

  return (
    <div
      className="fixed inset-0 z-[140] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center shrink-0">
              <Settings size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Configurações de Impressão do Terminal
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Escolha o perfil da impressora padrão para emissão de cupons e recibos fiscais.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border-0 bg-transparent"
            title="Fechar Configurações"
          >
            <X size={18} />
          </button>
        </div>

        {/* 3 Opções Selecionáveis (Cards Interativos) */}
        <div className="space-y-2.5">
          {PDV_PRINT_PROFILE_LIST.map((profile) => {
            const ativo = format === profile.id;
            return (
              <button
                key={profile.id}
                type="button"
                id={`btn-print-format-${profile.id}`}
                onClick={() => handleSelect(profile.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between gap-4 cursor-pointer ${
                  ativo
                    ? 'bg-emerald-950/25 border-emerald-500/60 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/30'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      ativo
                        ? 'bg-emerald-500/15 border-emerald-500/40'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    {renderIcon(profile.id, ativo)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{profile.title}</span>
                      {ativo && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Padrão Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                      {profile.subtitle}
                    </p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                    ativo
                      ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                      : 'border-slate-700 bg-slate-900'
                  }`}
                >
                  {ativo && <CheckCircle2 size={14} />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Rodapé */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            {salvoFeedback ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                Preferência salva neste terminal!
              </span>
            ) : (
              <span>Salvo automaticamente neste terminal (`pdv_print_format`).</span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer border-0 shadow-md"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
