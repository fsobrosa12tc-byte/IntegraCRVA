import { useState, useEffect, useCallback } from 'react';
import {
  getStatus,
  getQrCode,
  logout,
  type WhatsAppConnectionState,
  type QrCodeResponse,
} from '../services/evolutionApi';

export interface UseEvolutionWhatsAppReturn {
  status: WhatsAppConnectionState;
  carregando: boolean;
  carregandoQr: boolean;
  qrCodeData: QrCodeResponse | null;
  erro: string | null;
  atualizarStatus: () => Promise<WhatsAppConnectionState>;
  gerarNovoQrCode: () => Promise<void>;
  desconectar: () => Promise<boolean>;
}

/**
 * Hook customizado para monitoramento e controle do Gateway WhatsApp Evolution API v2.
 */
export function useEvolutionWhatsApp(pollIntervalMs: number = 10000): UseEvolutionWhatsAppReturn {
  const [status, setStatus] = useState<WhatsAppConnectionState>('close');
  const [carregando, setCarregando] = useState(true);
  const [carregandoQr, setCarregandoQr] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<QrCodeResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const atualizarStatus = useCallback(async (): Promise<WhatsAppConnectionState> => {
    try {
      setErro(null);
      const st = await getStatus();
      setStatus(st);
      if (st === 'open') {
        setQrCodeData(null); // Limpa QR code se já estiver conectado
      }
      return st;
    } catch (e: any) {
      setErro(e.message || 'Falha ao consultar status');
      setStatus('close');
      return 'close';
    } finally {
      setCarregando(false);
    }
  }, []);

  const gerarNovoQrCode = useCallback(async () => {
    try {
      setCarregandoQr(true);
      setErro(null);
      const res = await getQrCode();
      setQrCodeData(res);
      if (!res.sucesso && res.erro) {
        setErro(res.erro);
      }
    } catch (e: any) {
      setErro(e.message || 'Erro ao gerar QR Code');
    } finally {
      setCarregandoQr(false);
    }
  }, []);

  const desconectar = useCallback(async (): Promise<boolean> => {
    try {
      setCarregando(true);
      const ok = await logout();
      if (ok) {
        setStatus('close');
        setQrCodeData(null);
      }
      return ok;
    } catch (e: any) {
      setErro(e.message || 'Erro ao desconectar');
      return false;
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    atualizarStatus();

    // Polling periódico para manter a saúde do gateway sincronizada
    if (pollIntervalMs > 0) {
      const timer = setInterval(() => {
        atualizarStatus();
      }, pollIntervalMs);
      return () => clearInterval(timer);
    }
  }, [atualizarStatus, pollIntervalMs]);

  return {
    status,
    carregando,
    carregandoQr,
    qrCodeData,
    erro,
    atualizarStatus,
    gerarNovoQrCode,
    desconectar,
  };
}

