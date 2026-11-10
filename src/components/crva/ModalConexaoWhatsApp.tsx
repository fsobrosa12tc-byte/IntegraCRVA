import React, { useState, useEffect, useCallback } from 'react';
import {
  QrCode,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  X,
  ShieldCheck,
  Radio,
  Server,
  Smartphone
} from 'lucide-react';
import {
  evolutionService,
  desconectarWhatsApp,
  EVOLUTION_INSTANCE,
  EVOLUTION_URL,
  type WhatsAppConnectionState
} from '../../services/evolutionApi';

interface ModalConexaoWhatsAppProps {
  aberto: boolean;
  onFechar: () => void;
}

export default function ModalConexaoWhatsApp({ aberto, onFechar }: ModalConexaoWhatsAppProps) {
  const [status, setStatus] = useState<WhatsAppConnectionState>('close');
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [carregandoStatus, setCarregandoStatus] = useState(false);
  const [carregandoQr, setCarregandoQr] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const isOnline = status === 'open';
  const hostLimpo = EVOLUTION_URL.replace(/^https?:\/\//, '').split('/')[0];

  const checarStatus = useCallback(async () => {
    setCarregandoStatus(true);
    try {
      const estado = await evolutionService.getStatus();
      setStatus(estado);
      if (estado === 'open') {
        setQrCodeBase64(null);
        setErro(null);
      }
      return estado;
    } catch (e: any) {
      setErro(e?.message || 'Erro ao verificar status da instância.');
      return 'close';
    } finally {
      setCarregandoStatus(false);
    }
  }, []);

  const carregarQrCode = useCallback(async () => {
    setCarregandoQr(true);
    setErro(null);
    try {
      const estadoAtual = await evolutionService.getStatus();
      setStatus(estadoAtual);
      if (estadoAtual === 'open') {
        setQrCodeBase64(null);
        return;
      }

      const qr = await evolutionService.getQrCode();
      setQrCodeBase64(qr);
      if (!qr) {
        setErro('A Evolution API não retornou imagem de QR Code neste momento. Tente atualizar.');
      }
    } catch (e: any) {
      setErro(e?.message || 'Falha ao obter QR Code da Evolution API.');
    } finally {
      setCarregandoQr(false);
    }
  }, []);

  const handleDesconectar = async () => {
    setCarregandoStatus(true);
    setErro(null);
    try {
      await desconectarWhatsApp(EVOLUTION_INSTANCE);
      setStatus('close');
      setQrCodeBase64(null);

      // Aguarda 1s para o servidor da Evolution API sincronizar o desligamento do socket
      await new Promise((r) => setTimeout(r, 1000));

      // Revalida o estado real da instância e gera novo QR Code se estiver desconectada
      await carregarQrCode();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao desconectar aparelho.');
    } finally {
      setCarregandoStatus(false);
    }
  };

  // Ao abrir o modal, verifica status e busca QR Code se desconectado
  useEffect(() => {
    if (!aberto) return;

    carregarQrCode();

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        checarStatus();
      }
    }, 6000);

    return () => clearInterval(timer);
  }, [aberto, carregarQrCode, checarStatus]);

  // Fecha com tecla ESC
  useEffect(() => {
    if (!aberto) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-whatsapp"
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100 my-auto">
        {/* Cabeçalho Executivo Amplo */}
        <div className="px-6 py-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.669-.699c.969.541 1.761.82 2.79.82h.001c3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.766-5.768-5.766zm9.969 5.828c0 5.523-4.477 10-10 10-1.745 0-3.385-.45-4.819-1.238l-7.181 1.881 1.905-6.969c-.848-1.477-1.336-3.195-1.336-5.024 0-5.523 4.477-10 10-10s10 4.477 10 10z"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 id="titulo-modal-whatsapp" className="text-lg font-bold text-white tracking-tight m-0">
                  WhatsApp Gateway
                </h2>
                <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Evolution API v2
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 mb-0">
                Central de pareamento e disparos automáticos da Esteira de Vistorias CRVA
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onFechar}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Fechar (ESC)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo Principal Espaçoso */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Barra Superior de Status */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span className="relative flex h-3.5 w-3.5 shrink-0">
                {isOnline && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                    isOnline
                      ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                      : status === 'connecting'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-amber-500'
                  }`}
                />
              </span>

              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-semibold">
                  Instância: <strong className="text-slate-200">{EVOLUTION_INSTANCE}</strong>
                </span>
                <div className="text-sm font-bold tracking-tight mt-0.5">
                  {isOnline && (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={16} /> CONECTADO E OPERACIONAL
                    </span>
                  )}
                  {status === 'connecting' && (
                    <span className="text-amber-400 flex items-center gap-1.5">
                      <Radio size={16} className="animate-spin" /> SINCRONIZANDO SESSÃO...
                    </span>
                  )}
                  {status === 'close' && (
                    <span className="text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle size={16} /> AGUARDANDO LEITURA DO QR CODE
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={checarStatus}
              disabled={carregandoStatus}
              className="px-3.5 py-2 text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              <RefreshCw size={14} className={carregandoStatus ? 'animate-spin text-emerald-400' : ''} />
              <span>Atualizar Status</span>
            </button>
          </div>

          {/* Se desconectado: Grid de 2 Colunas (Instruções + QR Code amplo) */}
          {!isOnline && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center bg-slate-950/60 border border-slate-800/90 rounded-2xl p-6">
              {/* Coluna Esquerda: Instruções de Pareamento */}
              <div className="md:col-span-7 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                  <Smartphone size={14} />
                  <span>Como conectar o WhatsApp do CRVA</span>
                </div>

                <ol className="space-y-3 text-xs text-slate-300 list-none p-0 m-0">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      1
                    </span>
                    <span>Abra o <strong>WhatsApp</strong> no celular oficial do cartório/CRVA.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      2
                    </span>
                    <span>Toque em <strong>Mais opções (⋮)</strong> ou <strong>Configurações</strong> e selecione <strong>Aparelhos conectados</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      3
                    </span>
                    <span>Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para o QR Code ao lado.</span>
                  </li>
                </ol>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={carregarQrCode}
                    disabled={carregandoQr}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={carregandoQr ? 'animate-spin' : ''} />
                    <span>{carregandoQr ? 'Gerando QR Code...' : 'Gerar Novo QR Code'}</span>
                  </button>
                </div>
              </div>

              {/* Coluna Direita: Moldura do QR Code */}
              <div className="md:col-span-5 flex flex-col items-center justify-center">
                <div className="w-60 h-60 p-4 bg-white rounded-2xl shadow-2xl border-4 border-slate-800 flex items-center justify-center">
                  {carregandoQr ? (
                    <div className="flex flex-col items-center justify-center text-slate-800 gap-3">
                      <RefreshCw size={32} className="animate-spin text-emerald-600" />
                      <span className="text-xs font-bold text-slate-700">Carregando QR Code...</span>
                    </div>
                  ) : qrCodeBase64 ? (
                    <img
                      src={qrCodeBase64}
                      alt="QR Code de Conexão WhatsApp"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500 gap-2 text-xs text-center p-4">
                      <QrCode size={36} className="text-slate-400" />
                      <span className="font-semibold text-slate-600">QR Code indisponível</span>
                      <span className="text-[11px] text-slate-400">Clique em "Gerar Novo QR Code"</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Se conectado: Painel de Sessão Ativa */}
          {isOnline && (
            <div className="p-6 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck size={28} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white m-0">
                    Gateway WhatsApp Ativo e Pronto para Disparos
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed m-0 max-w-md">
                    As notificações de <strong>Chamada de Box</strong>, <strong>Vistoria Aprovada</strong> e <strong>Pendências</strong> estão sendo enviadas automaticamente em segundo plano com delay humano de 1,2s.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDesconectar}
                disabled={carregandoStatus}
                className="px-4 py-2.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
              >
                <LogOut size={14} />
                <span>Desconectar Aparelho</span>
              </button>
            </div>
          )}

          {/* Alerta de Erro caso ocorra */}
          {erro && (
            <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-2xl text-xs text-rose-200 flex items-start gap-3">
              <AlertTriangle size={18} className="shrink-0 text-rose-400 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block text-rose-100">Aviso de Comunicação com o Gateway</span>
                <span className="block text-rose-300/90 font-mono text-[11px] break-all">{erro}</span>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé Executivo */}
        <div className="px-6 py-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <Server size={13} className="text-emerald-400" />
            <span>Servidor: {hostLimpo}</span>
          </div>

          <button
            type="button"
            onClick={onFechar}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            Fechar Painel
          </button>
        </div>
      </div>
    </div>
  );
}
