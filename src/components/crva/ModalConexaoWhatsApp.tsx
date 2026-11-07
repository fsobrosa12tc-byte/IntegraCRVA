import React, { useEffect, useCallback, useRef } from 'react';
import {
  QrCode,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  X,
  MessageSquare,
  ShieldCheck,
  Radio,
  Server,
  ExternalLink,
  Info
} from 'lucide-react';
import { useEvolutionWhatsApp } from '../../hooks/useEvolutionWhatsApp';
import { getEvolutionConfig } from '../../services/evolutionApi';

interface ModalConexaoWhatsAppProps {
  aberto: boolean;
  onFechar: () => void;
}

export default function ModalConexaoWhatsApp({ aberto, onFechar }: ModalConexaoWhatsAppProps) {
  // O hook executa polling a cada 8 segundos somente enquanto o modal estiver aberto
  const {
    status,
    isOnline,
    carregando,
    carregandoQr,
    qrCodeData,
    erro,
    atualizarStatus,
    gerarNovoQrCode,
    desconectar,
  } = useEvolutionWhatsApp({
    autoPolling: aberto,
    pollIntervalMs: 8000,
  });

  const modalRef = useRef<HTMLDivElement>(null);

  // Recupera as credenciais públicas para exibição institucional (sem segredos)
  const infoInstancia = React.useMemo(() => {
    try {
      const cfg = getEvolutionConfig();
      return {
        instancia: cfg.instance,
        servidor: cfg.apiUrl.replace(/^https?:\/\//, '').split('/')[0],
      };
    } catch {
      return {
        instancia: 'integra_crva',
        servidor: 'evolution-api.railway.app',
      };
    }
  }, []);

  // Busca QR Code automaticamente ao abrir se não estiver conectado
  useEffect(() => {
    if (aberto && !isOnline && !qrCodeData && !carregandoQr) {
      gerarNovoQrCode();
    }
  }, [aberto, isOnline, qrCodeData, carregandoQr, gerarNovoQrCode]);

  // Fecha no ESC
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onFechar();
      }
    },
    [onFechar]
  );

  useEffect(() => {
    if (aberto) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [aberto, handleKeyDown]);

  if (!aberto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-whatsapp"
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-slate-900 border border-slate-750/90 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col text-slate-100 my-auto animate-in zoom-in-95 duration-200"
      >
        {/* Cabeçalho Executivo Fintech Dark */}
        <div className="px-6 py-4.5 bg-slate-850/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <MessageSquare size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="titulo-modal-whatsapp" className="text-sm font-bold text-white tracking-tight">
                  WhatsApp Gateway
                </h2>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Evolution API v2
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Infraestrutura de notificações em segundo plano para esteira de vistorias
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer border-0 bg-transparent"
            title="Fechar (ESC)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-5">
          {/* Card de Status da Conexão em Tempo Real */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-3">
              <div className="relative flex h-3 w-3 shrink-0">
                {isOnline && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 duration-1000" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 transition-colors ${
                    isOnline
                      ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.9)]'
                      : status === 'connecting'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-rose-500'
                  }`}
                />
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-semibold">
                  Status do Servidor / Gateway
                </span>
                <div className="text-xs font-bold tracking-tight mt-0.5">
                  {isOnline && (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> INSTÂNCIA ATIVA · CONECTADA
                    </span>
                  )}
                  {status === 'connecting' && (
                    <span className="text-amber-400 flex items-center gap-1.5">
                      <Radio size={14} className="animate-spin" /> SINCRONIZANDO APARELHO...
                    </span>
                  )}
                  {status === 'close' && (
                    <span className="text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle size={14} /> DESCONECTADO (Offline)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => atualizarStatus()}
              disabled={carregando}
              className="px-3 py-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700/70 rounded-lg text-xs font-medium transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
              title="Verificar integridade da conexão agora"
            >
              <RefreshCw size={12} className={carregando ? 'animate-spin text-emerald-400' : ''} />
              <span>Verificar</span>
            </button>
          </div>

          {/* Área 1: QR Code para pareamento (quando não conectado) */}
          {!isOnline && (
            <div className="p-5 rounded-xl bg-slate-950/80 border border-slate-800 text-center space-y-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                  <QrCode size={14} />
                  <span>Pareamento com WhatsApp Oficial</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto pt-1">
                  Acesse <strong>Aparelhos Conectados</strong> no WhatsApp do celular do cartório e escaneie o código:
                </p>
              </div>

              {/* Moldura do QR Code */}
              <div className="flex items-center justify-center p-3.5 bg-white rounded-xl w-52 h-52 mx-auto shadow-2xl border-4 border-slate-800">
                {carregandoQr ? (
                  <div className="flex flex-col items-center justify-center text-slate-800 gap-2">
                    <RefreshCw size={26} className="animate-spin text-emerald-600" />
                    <span className="text-xs font-bold font-mono">Gerando QR Code...</span>
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
                  <div className="flex flex-col items-center justify-center text-slate-500 gap-2 text-xs p-2">
                    <AlertTriangle size={24} className="text-amber-500" />
                    <span className="font-medium text-center">Código expirado ou indisponível</span>
                  </div>
                )}
              </div>

              {/* Botão de Atualizar QR Code */}
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={gerarNovoQrCode}
                  disabled={carregandoQr}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-950/60 active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={carregandoQr ? 'animate-spin' : ''} />
                  <span>Atualizar QR Code</span>
                </button>
              </div>
            </div>
          )}

          {/* Área 2: Detalhes da Conexão Ativa (quando conectado) */}
          {isOnline && (
            <div className="p-5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
                <ShieldCheck size={26} />
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white tracking-tight">
                  Serviço de Mensageria 100% Operacional
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  As notificações de <strong>Chamada de Box</strong>, <strong>Aprovação</strong> e <strong>Pendências</strong> são disparadas em segundo plano para os proprietários.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 text-left">
                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px]">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Instância Railway</span>
                  <span className="font-mono text-emerald-400 font-semibold truncate block">
                    {infoInstancia.instancia}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px]">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Protocolo / Gateway</span>
                  <span className="font-mono text-slate-200 font-semibold truncate block">
                    Baileys + Redis
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={desconectar}
                  disabled={carregando}
                  className="px-3.5 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Desvincular aparelho celular conectado"
                >
                  <LogOut size={13} />
                  <span>Desconectar Aparelho</span>
                </button>
              </div>
            </div>
          )}

          {/* Alerta de Erro de Conexão com Diagnóstico 401 */}
          {erro && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-start gap-2.5">
              <AlertTriangle size={16} className="shrink-0 text-rose-400 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block text-rose-200">Falha de Comunicação com a Evolution API</span>
                <span className="leading-relaxed block text-[11px] text-rose-300/90">{erro}</span>
                {erro.includes('401') && (
                  <span className="block text-[10px] text-amber-300 font-mono pt-1">
                    Dica: Verifique se a variável VITE_EVOLUTION_API_KEY confere exatamente com a apikey cadastrada na sua instância do Railway.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Dica de Conformidade DETRAN-RS / LGPD */}
          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 flex items-start gap-2.5">
            <Info size={14} className="text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Regras DETRAN-RS:</strong> Envios com delay humano de 1,2s, presença <em>typing</em> e sanitização DDI 55. Não há exibição pública de CPF completo ou débitos fiscais.
            </p>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3.5 bg-slate-850/80 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
            <Server size={11} className="text-slate-400" />
            <span>Host: {infoInstancia.servidor}</span>
          </div>

          <button
            type="button"
            onClick={onFechar}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700/70 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
