import React, { useEffect } from 'react';
import {
  QrCode,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  X,
  Smartphone,
  ShieldCheck,
  Radio,
  Clock
} from 'lucide-react';
import { useEvolutionWhatsApp } from '../../hooks/useEvolutionWhatsApp';

interface ModalConexaoWhatsAppProps {
  aberto: boolean;
  onFechar: () => void;
}

export default function ModalConexaoWhatsApp({ aberto, onFechar }: ModalConexaoWhatsAppProps) {
  const {
    status,
    carregando,
    carregandoQr,
    qrCodeData,
    erro,
    atualizarStatus,
    gerarNovoQrCode,
    desconectar,
  } = useEvolutionWhatsApp(5000);

  useEffect(() => {
    if (aberto && status !== 'open' && !qrCodeData) {
      gerarNovoQrCode();
    }
  }, [aberto, status, qrCodeData, gerarNovoQrCode]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        {/* Cabeçalho */}
        <div className="p-5 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Smartphone size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>WhatsApp Gateway</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Evolution API v2
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Gerenciamento da conexão para envio de notificações da esteira de vistorias.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-6 space-y-6">
          {/* Card de Status da Conexão */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Radio
                  size={24}
                  className={
                    status === 'open'
                      ? 'text-emerald-400 animate-pulse'
                      : status === 'connecting'
                        ? 'text-amber-400 animate-spin'
                        : 'text-slate-500'
                  }
                />
                <span
                  className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${
                    status === 'open'
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                      : status === 'connecting'
                        ? 'bg-amber-400'
                        : 'bg-rose-500'
                  }`}
                />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Estado da Conexão
                </span>
                <div className="text-sm font-black flex items-center gap-2">
                  {status === 'open' && (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={16} /> CONECTADO (Pronto para disparos)
                    </span>
                  )}
                  {status === 'connecting' && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <Clock size={16} /> SINCRONIZANDO APARELHO...
                    </span>
                  )}
                  {status === 'close' && (
                    <span className="text-rose-400 flex items-center gap-1">
                      <AlertTriangle size={16} /> DESCONECTADO (Offline)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => atualizarStatus()}
              disabled={carregando}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
              title="Atualizar Status"
            >
              <RefreshCw size={16} className={carregando ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Área do QR Code quando desconectado */}
          {status !== 'open' && (
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 text-center space-y-4">
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center justify-center gap-1.5">
                  <QrCode size={16} className="text-emerald-400" />
                  <span>Escaneie com o WhatsApp do CRVA</span>
                </h3>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Abra o WhatsApp no aparelho celular oficial do cartório, acesse <strong>Aparelhos Conectados</strong> e aponte para o código abaixo:
                </p>
              </div>

              {/* Renderização do QR Code */}
              <div className="flex items-center justify-center p-3 bg-white rounded-2xl w-56 h-56 mx-auto shadow-xl">
                {carregandoQr ? (
                  <div className="flex flex-col items-center justify-center text-slate-800 gap-2">
                    <RefreshCw size={28} className="animate-spin text-emerald-600" />
                    <span className="text-xs font-bold">Gerando QR Code...</span>
                  </div>
                ) : qrCodeData?.base64 ? (
                  <img
                    src={
                      qrCodeData.base64.startsWith('data:')
                        ? qrCodeData.base64
                        : `data:image/png;base64,${qrCodeData.base64}`
                    }
                    alt="QR Code WhatsApp"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500 gap-2 text-xs">
                    <AlertTriangle size={24} className="text-amber-500" />
                    <span>Nenhum QR Code ativo</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={gerarNovoQrCode}
                  disabled={carregandoQr}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50"
                >
                  <RefreshCw size={14} className={carregandoQr ? 'animate-spin' : ''} />
                  <span>Atualizar QR Code</span>
                </button>
              </div>
            </div>
          )}

          {/* Área quando conectado */}
          {status === 'open' && (
            <div className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                <ShieldCheck size={28} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-emerald-300">Gateway WhatsApp Operacional</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  As notificações de <strong>Chamada de Box</strong>, <strong>Aprovação</strong> e <strong>Pendências</strong> estão sendo disparadas automaticamente em segundo plano.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={desconectar}
                  disabled={carregando}
                  className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-2 mx-auto cursor-pointer"
                >
                  <LogOut size={14} />
                  <span>Desconectar / Trocar Aparelho</span>
                </button>
              </div>
            </div>
          )}

          {/* Exibição de mensagens de erro se houver */}
          {erro && (
            <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-rose-400" />
              <span>{erro}</span>
            </div>
          )}

          {/* Dica de Segurança e LGPD */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400 flex items-start gap-2">
            <ShieldCheck size={14} className="text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>DETRAN-RS / LGPD:</strong> Os disparos utilizam delay humano e sanitização de dados, sem exibição pública de débitos ou informações sensíveis de proprietários.
            </p>
          </div>
        </div>

        {/* Rodapé */}
        <div className="p-4 bg-slate-850 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onFechar}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

