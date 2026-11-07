/**
 * ============================================================================
 * INTEGRA CRVA · SERVIÇO DE INTEGRAÇÃO COM WHATSAPP (EVOLUTION API v2)
 * ============================================================================
 */

export type WhatsAppConnectionState = 'open' | 'close' | 'connecting';

export type TipoNotificacaoVistoria = 'chamada_box' | 'aprovacao' | 'reprovacao';

export interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instance: string;
}

export interface NotificacaoVistoriaParams {
  tipo: TipoNotificacaoVistoria;
  telefone: string;
  placa: string;
  comanda?: string | null;
  box?: string | null;
  motivos?: string | string[] | null;
}

export interface EnvioWhatsAppResponse {
  sucesso: boolean;
  state?: WhatsAppConnectionState;
  messageId?: string;
  detalhes?: any;
  erro?: string;
  telefoneSanitizado: string;
  mensagemEnviada: string;
}

export interface QrCodeResponse {
  sucesso: boolean;
  base64?: string;
  code?: string;
  pairingCode?: string;
  erro?: string;
}

// Fallbacks diretos para garantir que nunca vá vazio, undefined ou com placeholder antigo
const rawEnvUrl = (import.meta.env.VITE_EVOLUTION_API_URL || '').trim().replace(/^["']|["']$/g, '');
const rawEnvKey = (import.meta.env.VITE_EVOLUTION_API_KEY || '').trim().replace(/^["']|["']$/g, '');
const rawEnvInstance = (import.meta.env.VITE_EVOLUTION_INSTANCE || '').trim().replace(/^["']|["']$/g, '');

export const EVOLUTION_URL = (
  rawEnvUrl && !rawEnvUrl.includes('sua-evolution-api')
    ? rawEnvUrl
    : 'https://evolution-api-production-9bdd.up.railway.app'
).replace(/\/$/, '');

export const EVOLUTION_KEY =
  rawEnvKey && rawEnvKey !== 'SUA_CHAVE_API_GLOBAL_OU_INSTANCIA'
    ? rawEnvKey
    : 'IntegraCRVA_SecretKey_2026_xYz';

export const EVOLUTION_INSTANCE =
  rawEnvInstance && rawEnvInstance !== 'integra_crva_001'
    ? rawEnvInstance
    : 'crva-principal';

export function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'apikey': EVOLUTION_KEY
  };
}

export function getEvolutionConfig(): EvolutionConfig {
  return {
    apiUrl: EVOLUTION_URL,
    apiKey: EVOLUTION_KEY,
    instance: EVOLUTION_INSTANCE,
  };
}

export function sanitizarTelefoneWhatsApp(telefoneBruto: string): string {
  if (!telefoneBruto) {
    throw new Error('Telefone para envio de notificação não foi fornecido.');
  }

  let apenasNumeros = telefoneBruto.replace(/\D/g, '');

  if (apenasNumeros.startsWith('0') && apenasNumeros.length >= 11) {
    apenasNumeros = apenasNumeros.substring(1);
  }

  if (!apenasNumeros.startsWith('55')) {
    if (apenasNumeros.length === 10 || apenasNumeros.length === 11) {
      apenasNumeros = `55${apenasNumeros}`;
    }
  }

  if (apenasNumeros.length < 12 || apenasNumeros.length > 14) {
    throw new Error(
      `Número de telefone inválido para WhatsApp: "${telefoneBruto}". Esperado formato padrão (DDD) 9XXXX-XXXX.`
    );
  }

  return apenasNumeros;
}

export function sanitizarTextoParametro(texto?: string | null): string {
  if (!texto) return '';
  return texto
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[<>{}\\]/g, '')
    .trim();
}

export function sanitizarPlaca(placa?: string | null): string {
  if (!placa) return 'NÃO INFORMADA';
  return placa.toUpperCase().replace(/[^A-Z0-9-]/g, '').trim();
}

export function formatarMensagemVistoria(params: NotificacaoVistoriaParams): string {
  const placa = sanitizarPlaca(params.placa);
  const comanda = sanitizarTextoParametro(params.comanda) || 'BALCÃO';

  switch (params.tipo) {
    case 'chamada_box': {
      const box = sanitizarTextoParametro(params.box) || '01';
      return `CRVA Alerta: Veículo placa ${placa}, comanda ${comanda}, favor dirigir-se imediatamente ao Box ${box} para vistoria.`;
    }
    case 'aprovacao': {
      return `CRVA Notificação: Vistoria do veículo ${placa} (Comanda ${comanda}) concluída com SUCESSO. Dirija-se ao balcão para finalização do processo.`;
    }
    case 'reprovacao': {
      let motivosTexto = '';
      if (Array.isArray(params.motivos)) {
        motivosTexto = params.motivos.map(sanitizarTextoParametro).filter(Boolean).join('; ');
      } else {
        motivosTexto = sanitizarTextoParametro(params.motivos);
      }
      if (!motivosTexto) {
        motivosTexto = 'Pendência documental / estrutural a regularizar';
      }
      return `CRVA Notificação: A vistoria do veículo ${placa} identificou pendências: ${motivosTexto}. Compareça ao atendimento para orientações de saneamento.`;
    }
    default:
      throw new Error(`Tipo de notificação desconhecido: ${(params as any).tipo}`);
  }
}

export const evolutionService = {
  async getStatus(signal?: AbortSignal): Promise<WhatsAppConnectionState> {
    try {
      const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`, {
        method: 'GET',
        signal,
        headers: getHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rawState = (data?.instance?.state || data?.state || 'close').toLowerCase();
      if (rawState === 'open') return 'open';
      if (rawState === 'connecting') return 'connecting';
      return 'close';
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Falha ao checar status:', e);
      }
      return 'close';
    }
  },

  async getQrCode(signal?: AbortSignal): Promise<string | null> {
    try {
      const res = await fetch(`${EVOLUTION_URL}/instance/connect/${EVOLUTION_INSTANCE}`, {
        method: 'GET',
        signal,
        headers: getHeaders()
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(`HTTP ${res.status}: ${JSON.stringify(errJson)}`);
      }
      const data = await res.json();
      // Trata os diferentes formatos retornados pela Evolution API v2
      const rawBase64 = data?.base64 || data?.qrcode?.base64 || data?.code || null;
      if (!rawBase64) return null;
      return rawBase64.startsWith('data:') ? rawBase64 : `data:image/png;base64,${rawBase64}`;
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Erro getQrCode:', e);
      }
      throw e;
    }
  },

  async logout(signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await fetch(`${EVOLUTION_URL}/instance/logout/${EVOLUTION_INSTANCE}`, {
        method: 'DELETE',
        signal,
        headers: getHeaders()
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async enviarNotificacaoVistoria(params: NotificacaoVistoriaParams): Promise<EnvioWhatsAppResponse> {
    let telefoneSanitizado = '';
    let mensagem = '';

    try {
      telefoneSanitizado = sanitizarTelefoneWhatsApp(params.telefone);
      mensagem = formatarMensagemVistoria(params);
    } catch (sanitizacaoError: any) {
      return {
        sucesso: false,
        telefoneSanitizado: telefoneSanitizado || params.telefone,
        mensagemEnviada: mensagem,
        erro: sanitizacaoError?.message || 'Falha na validação dos parâmetros da mensagem.',
      };
    }

    try {
      const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          number: telefoneSanitizado,
          text: mensagem,
          delay: 1200,
          presence: 'composing',
          linkPreview: false,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const mensagemErro =
          data?.message ||
          data?.error ||
          `HTTP ${res.status} ao enviar notificação WhatsApp.`;
        return {
          sucesso: false,
          telefoneSanitizado,
          mensagemEnviada: mensagem,
          detalhes: data,
          erro: mensagemErro,
        };
      }

      return {
        sucesso: true,
        messageId: data?.key?.id || data?.messageId || data?.id,
        telefoneSanitizado,
        mensagemEnviada: mensagem,
        detalhes: data,
      };
    } catch (error: any) {
      return {
        sucesso: false,
        telefoneSanitizado,
        mensagemEnviada: mensagem,
        erro: error?.message || 'Falha de comunicação com o servidor WhatsApp Gateway.',
      };
    }
  }
};

export const getStatus = evolutionService.getStatus;
export const logout = evolutionService.logout;
export const enviarNotificacaoVistoria = evolutionService.enviarNotificacaoVistoria;

export async function getQrCode(signal?: AbortSignal): Promise<QrCodeResponse> {
  try {
    const base64 = await evolutionService.getQrCode(signal);
    return {
      sucesso: !!base64,
      base64: base64 || '',
    };
  } catch (error: any) {
    return {
      sucesso: false,
      erro: error?.message || 'Erro ao gerar QR Code.',
    };
  }
}

export async function isWhatsAppDisponivel(): Promise<boolean> {
  try {
    const status = await evolutionService.getStatus();
    return status === 'open';
  } catch {
    return false;
  }
}
