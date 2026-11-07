import React from 'react';
import { MessageSquare } from 'lucide-react';
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
 * quando online e indicador discreto quando desconectado.
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
      className={`relative inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/40 text-slate-200 hover:text-white text-xs font-medium transition-all duration-200 shadow-sm hover:shadow-emerald-500/10 cursor-pointer group select-none ${className}`}
      title={
        isOnline
          ? 'WhatsApp Gateway: Conectado e Operacional'
          : isConnecting
            ? 'WhatsApp Gateway: Sincronizando conexão...'
            : 'WhatsApp Gateway: Desconectado (Clique para parear com QR Code)'
      }
    >
      {/* Ponto de status com anel pulsante dinâmico */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {isOnline && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 duration-1000" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2.5 w-2.5 transition-colors duration-300 ${
            isOnline
              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
              : isConnecting
                ? 'bg-amber-400 animate-pulse'
                : 'bg-slate-500'
          }`}
        />
      </span>

      {/* Ícone de Mensagem */}
      <MessageSquare
        className={`w-4 h-4 transition-transform duration-200 group-hover:scale-105 shrink-0 ${
          isOnline
            ? 'text-emerald-400'
            : isConnecting
              ? 'text-amber-400'
              : 'text-slate-400 group-hover:text-slate-300'
        }`}
      />

      {/* Rótulo */}
      <span className={exibirRotuloResponsivo ? 'hidden sm:inline font-medium tracking-tight' : 'font-medium tracking-tight'}>
        WhatsApp Gateway
      </span>

      {/* Micro-badge de estado online para visual executivo */}
      {isOnline && (
        <span className="hidden lg:inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          Live
        </span>
      )}
    </button>
  );
}

