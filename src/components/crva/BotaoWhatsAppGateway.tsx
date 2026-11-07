import React from 'react';
import type { WhatsAppConnectionState } from '../../services/evolutionApi';

interface BotaoWhatsAppGatewayProps {
  onClick: () => void;
  status?: WhatsAppConnectionState;
  isOnline?: boolean;
  className?: string;
  exibirRotuloResponsivo?: boolean;
}

/**
 * Botão Header de Alto Padrão Executivo (Fintech Dark):
 * Exibe o status da conexão WhatsApp em tempo real com pulso dinâmico (animate-ping)
 * quando online e indicador âmbar quando desconectado/conectando.
 */
export default function BotaoWhatsAppGateway({
  onClick,
  status,
  isOnline: isOnlineProp,
  className = '',
  exibirRotuloResponsivo = true,
}: BotaoWhatsAppGatewayProps) {
  const isOnline = isOnlineProp !== undefined ? isOnlineProp : status === 'open';
  const isConnecting = status === 'connecting';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-slate-200 hover:text-white text-xs font-semibold transition-all shadow-sm cursor-pointer ${className}`}
      title={
        isOnline
          ? 'WhatsApp Gateway: Conectado e Operacional'
          : isConnecting
            ? 'WhatsApp Gateway: Sincronizando conexão...'
            : 'WhatsApp Gateway: Desconectado (Clique para parear com QR Code)'
      }
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {isOnline && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
            isOnline ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />
      </span>

      <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.669-.699c.969.541 1.761.82 2.79.82h.001c3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.766-5.768-5.766zm9.969 5.828c0 5.523-4.477 10-10 10-1.745 0-3.385-.45-4.819-1.238l-7.181 1.881 1.905-6.969c-.848-1.477-1.336-3.195-1.336-5.024 0-5.523 4.477-10 10-10s10 4.477 10 10z"/>
      </svg>

      <span className={exibirRotuloResponsivo ? 'hidden sm:inline' : ''}>
        WhatsApp Gateway
      </span>
    </button>
  );
}

