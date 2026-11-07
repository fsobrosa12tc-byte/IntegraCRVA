/**
 * ============================================================================
 * INTEGRA CRVA · SERVIÇO DE INTEGRAÇÃO COM WHATSAPP (EVOLUTION API v2)
 * ============================================================================
 * Gateway de mensageria para notificações automatizadas da esteira de vistorias
 * veiculares em conformidade com as regras de negócio e privacidade do DETRAN-RS.
 *
 * Tecnologias: Evolution API v2 (Baileys + Redis + PostgreSQL no Railway).
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

/* =========================================================================
 * 1. CONFIGURAÇÃO ESTÁTICA COM INJEÇÃO VITE & HEADERS AUTENTICADOS
 * ========================================================================= */

export const EVOLUTION_URL = (import.meta.env.VITE_EVOLUTION_API_URL || '').replace(/\/$/, '');
export const EVOLUTION_KEY = import.meta.env.VITE_EVOLUTION_API_KEY || '';
export const EVOLUTION_INSTANCE = import.meta.env.VITE_EVOLUTION_INSTANCE || 'crva-principal';

/**
 * Retorna os cabeçalhos HTTP autenticados obrigatórios para a Evolution API.
 * Garante a presença do header 'apikey' estático com valor de import.meta.env.VITE_EVOLUTION_API_KEY.
 */
export function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'apikey': EVOLUTION_KEY,
  };
}

export function getEvolutionConfig(): EvolutionConfig {
  return {
    apiUrl: EVOLUTION_URL,
    apiKey: EVOLUTION_KEY,
    instance: EVOLUTION_INSTANCE,
  };
}

/* =========================================================================
 * 2. SANITIZAÇÃO E REGRAS DE CONFORMIDADE (DETRAN-RS / LGPD)
 * ========================================================================= */

/**
 * Sanitiza o número de telefone conforme os padrões do DETRAN-RS e WhatsApp:
 * - Remove caracteres não numéricos;
 * - Adiciona o código de país do Brasil (55) se ausente;
 * - Valida se o número possui DDD válido e tamanho regulamentar (12 a 13 dígitos com DDI 55).
 */
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

/* =========================================================================
 * 3. OBJETO EVOLUTION SERVICE (TAREFA 2 - ESPECIFICAÇÃO RIGOROSA)
 * ========================================================================= */

export const evolutionService = {
  /**
   * Consulta o estado atual da conexão da instância WhatsApp na Evolution API.
   * Endpoint: GET /instance/connectionState/${INSTANCE}
   * Headers: getHeaders() -> apikey obrigatória
   */
  async getStatus(signal?: AbortSignal): Promise<WhatsAppConnectionState> {
    try {
      if (!EVOLUTION_URL) {
        console.warn('[Evolution API] VITE_EVOLUTION_API_URL não configurada.');
        return 'close';
      }

      const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
        method: 'GET',
        signal,
        headers: getHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Status ${res.status}`);
      }

      const data = await res.json();
      const rawState = (
        data?.instance?.state ||
        data?.state ||
        data?.connectionStatus?.state ||
        data?.status ||
        ''
      ).toLowerCase();

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

  /**
   * Solicita a geração ou recuperação do QR Code de conexão para a instância.
   * Endpoint: GET /instance/connect/${INSTANCE}
   * Headers: getHeaders() -> apikey obrigatória
   */
  async getQrCode(signal?: AbortSignal): Promise<string | null> {
    try {
      if (!EVOLUTION_URL) {
        throw new Error('VITE_EVOLUTION_API_URL não definida.');
      }

      const res = await fetch(`${EVOLUTION_URL}/instance/connect/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
        method: 'GET',
        signal,
        headers: getHeaders(),
      });

      if (!res.ok) {
        const erroJson = await res.json().catch(() => ({}));
        throw new Error(`HTTP ${res.status}: ${JSON.stringify(erroJson)}`);
      }

      const data = await res.json();
      return data?.base64 || data?.qrcode?.base64 || data?.code || null;
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Erro getQrCode:', e);
      }
      throw e;
    }
  },

  /**
   * Desconecta o aparelho e encerra a sessão ativa do WhatsApp no cartório.
   * Endpoint: DELETE /instance/logout/${INSTANCE}
   * Headers: getHeaders() -> apikey obrigatória
   */
  async logout(signal?: AbortSignal): Promise<boolean> {
    try {
      if (!EVOLUTION_URL) return false;

      const res = await fetch(`${EVOLUTION_URL}/instance/logout/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
        method: 'DELETE',
        signal,
        headers: getHeaders(),
      });

      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Dispara uma notificação de vistoria padronizada para o WhatsApp do cidadão/proprietário.
   * Endpoint: POST /message/sendText/${INSTANCE}
   */
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
      if (!EVOLUTION_URL) {
        throw new Error('VITE_EVOLUTION_API_URL não configurada no ambiente.');
      }

      const url = `${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`;
      const payload = {
        number: telefoneSanitizado,
        text: mensagem,
        delay: 1200,
        presence: 'composing',
        linkPreview: false,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const mensagemErro =
          data?.message ||
          data?.error ||
          `HTTP ${response.status} ao enviar notificação WhatsApp.`;

        console.error('[Evolution API] Erro retornado pela API:', mensagemErro);
        return {
          sucesso: false,
          telefoneSanitizado,
          mensagemEnviada: mensagem,
          detalhes: data,
          erro: mensagemErro,
        };
      }

      const messageId =
        data?.key?.id ||
        data?.messageId ||
        data?.id ||
        undefined;

      return {
        sucesso: true,
        messageId,
        telefoneSanitizado,
        mensagemEnviada: mensagem,
        detalhes: data,
      };
    } catch (error: any) {
      console.error('[Evolution API] Falha de rede ao disparar mensagem para o WhatsApp:', error?.message || error);
      return {
        sucesso: false,
        telefoneSanitizado,
        mensagemEnviada: mensagem,
        erro: error?.message || 'Falha de comunicação com o servidor WhatsApp Gateway.',
      };
    }
  },
};

/* =========================================================================
 * 4. COMPATIBILIDADE RETROATIVA (MÉTODOS DIRETOS)
 * ========================================================================= */

export const getStatus = evolutionService.getStatus;
export const logout = evolutionService.logout;
export const enviarNotificacaoVistoria = evolutionService.enviarNotificacaoVistoria;

/**
 * Retorna o formato QrCodeResponse para o hook useEvolutionWhatsApp
 */
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
    const status = await getStatus();
    return status === 'open';
  } catch {
    return false;
  }
}
