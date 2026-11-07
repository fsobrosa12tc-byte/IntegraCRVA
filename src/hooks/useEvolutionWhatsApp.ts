import { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import {
  getStatus,
  getQrCode,
  logout,
  type WhatsAppConnectionState,
  type QrCodeResponse,
} from '../services/evolutionApi';

export interface UseEvolutionWhatsAppOptions {
  pollIntervalMs?: number;
  autoPolling?: boolean;
}

export interface UseEvolutionWhatsAppReturn {
  status: WhatsAppConnectionState;
  isOnline: boolean;
  carregando: boolean;
  carregandoQr: boolean;
  qrCodeData: QrCodeResponse | null;
  erro: string | null;
  atualizarStatus: () => Promise<WhatsAppConnectionState>;
  gerarNovoQrCode: () => Promise<void>;
  desconectar: () => Promise<boolean>;
}

/**
 * Hook de alto desempenho para monitoramento e controle do Gateway WhatsApp Evolution API v2.
 * Otimizado para não bloquear a thread principal (zero impacto em métricas INP/FID):
 * - Usa AbortController com timeout para evitar requisições zumbis;
 * - Pausa polling automaticamente se a janela/aba estiver oculta;
 * - Atualiza estados não urgentes via startTransition;
 * - Previne rajadas concorrentes de fetch na rede.
 */
export function useEvolutionWhatsApp(
  optionsOrInterval: number | UseEvolutionWhatsAppOptions = 20000
): UseEvolutionWhatsAppReturn {
  const options: UseEvolutionWhatsAppOptions =
    typeof optionsOrInterval === 'number'
      ? { pollIntervalMs: optionsOrInterval, autoPolling: true }
      : { pollIntervalMs: 20000, autoPolling: true, ...optionsOrInterval };

  const { pollIntervalMs = 20000, autoPolling = true } = options;

  const [status, setStatus] = useState<WhatsAppConnectionState>('close');
  const [carregando, setCarregando] = useState<boolean>(false);
  const [carregandoQr, setCarregandoQr] = useState<boolean>(false);
  const [qrCodeData, setQrCodeData] = useState<QrCodeResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  const isMountedRef = useRef<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const atualizarStatus = useCallback(async (): Promise<WhatsAppConnectionState> => {
    if (isFetchingRef.current) {
      return status;
    }

    isFetchingRef.current = true;

    // Cancela requisição anterior se ainda estiver em voo
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const st = await getStatus(controller.signal);
      clearTimeout(timeoutId);

      if (!isMountedRef.current) return st;

      startTransition(() => {
        setStatus(st);
        setErro(null);
        if (st === 'open') {
          setQrCodeData(null); // Limpa QR code da memória se já estiver online
        }
      });

      return st;
    } catch (e: any) {
      if (!isMountedRef.current) return 'close';
      if (e?.name !== 'AbortError') {
        startTransition(() => {
          setErro(e.message || 'Falha ao consultar status do WhatsApp');
        });
      }
      return 'close';
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) {
        setCarregando(false);
      }
    }
  }, [status]);

  const gerarNovoQrCode = useCallback(async () => {
    setCarregandoQr(true);
    setErro(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await getQrCode(controller.signal);
      clearTimeout(timeoutId);

      if (!isMountedRef.current) return;

      startTransition(() => {
        setQrCodeData(res);
        if (!res.sucesso && res.erro) {
          setErro(res.erro);
        }
      });
    } catch (e: any) {
      if (!isMountedRef.current) return;
      if (e?.name !== 'AbortError') {
        startTransition(() => {
          setErro(e.message || 'Erro ao gerar QR Code');
        });
      }
    } finally {
      if (isMountedRef.current) {
        setCarregandoQr(false);
      }
    }
  }, []);

  const desconectar = useCallback(async (): Promise<boolean> => {
    setCarregando(true);
    const controller = new AbortController();

    try {
      const ok = await logout(controller.signal);
      if (!isMountedRef.current) return ok;

      if (ok) {
        startTransition(() => {
          setStatus('close');
          setQrCodeData(null);
        });
      }
      return ok;
    } catch (e: any) {
      if (!isMountedRef.current) return false;
      startTransition(() => {
        setErro(e.message || 'Erro ao desconectar');
      });
      return false;
    } finally {
      if (isMountedRef.current) {
        setCarregando(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    // Disparo inicial não-bloqueante
    atualizarStatus();

    if (!autoPolling || pollIntervalMs <= 0) {
      return () => {
        isMountedRef.current = false;
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      };
    }

    // Polling inteligente com verificação de visibilidade
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return; // Pausa se aba estiver oculta para economizar CPU e rede
      }
      atualizarStatus();
    }, pollIntervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        atualizarStatus();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [atualizarStatus, autoPolling, pollIntervalMs]);

  return {
    status,
    isOnline: status === 'open',
    carregando,
    carregandoQr,
    qrCodeData,
    erro,
    atualizarStatus,
    gerarNovoQrCode,
    desconectar,
  };
}
