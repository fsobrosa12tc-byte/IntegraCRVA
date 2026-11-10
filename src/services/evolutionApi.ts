/**
 * ============================================================================
 * INTEGRA CRVA · SERVIÇO DE INTEGRAÇÃO COM WHATSAPP (EVOLUTION API v2)
 * ============================================================================
 */

import { WHATSAPP_TEMPLATES } from '../config/whatsappTemplates';

export type WhatsAppConnectionState = 'open' | 'close' | 'connecting';

export type TipoNotificacaoVistoria = 'ficha_digital' | 'chamada_box' | 'aprovacao' | 'reprovacao';

export interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instance: string;
}

export interface NotificacaoVistoriaParams {
  tipo: TipoNotificacaoVistoria;
  telefone: string;
  placa: string;
  nome?: string | null;
  modelo?: string | null;
  fichaDigital?: string | null;
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

/**
 * Normaliza e valida qualquer telefone brasileiro para o formato aceito pela Evolution API (55 + DDD + 9 dígitos)
 */
export function sanitizarNumeroWhatsApp(telefoneOriginal: string): string | null {
  if (!telefoneOriginal) return null;

  // 1. Remove qualquer caractere que não seja número
  let digits = telefoneOriginal.replace(/\D/g, '');

  // 2. Se começou com zero à esquerda (ex: 051...), remove
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  // 3. Trata prefixo do Brasil (55)
  // Caso tenha 12 ou 13 dígitos e comece com 55 (ex: 5551981182341 ou 555181182341)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    // Já possui o 55
  } else if (digits.length === 10 || digits.length === 11) {
    // Tem DDD + Número (sem o 55) -> adiciona 55 na frente
    digits = `55${digits}`;
  } else if (digits.length === 8 || digits.length === 9) {
    // Falta DDD -> fallback padrão DETRAN-RS (DDD 51)
    digits = `5551${digits}`;
  } else {
    // Número fora do padrão mínimo
    console.warn('Número fora do padrão:', telefoneOriginal);
    return null;
  }

  return digits;
}

export function sanitizarTelefoneWhatsApp(telefoneBruto: string): string {
  if (!telefoneBruto) {
    throw new Error('Telefone para envio de notificação não foi fornecido.');
  }

  const sanitizado = sanitizarNumeroWhatsApp(telefoneBruto);
  if (!sanitizado) {
    throw new Error(
      `Número de telefone inválido para WhatsApp: "${telefoneBruto}". Esperado formato padrão (DDD) 9XXXX-XXXX.`
    );
  }

  return sanitizado;
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
  const nome = sanitizarTextoParametro(params.nome) || 'Cliente';
  const modelo = sanitizarTextoParametro(params.modelo) || 'Veículo';
  const ficha = sanitizarTextoParametro(params.fichaDigital) || comanda;

  switch (params.tipo) {
    case 'ficha_digital': {
      return WHATSAPP_TEMPLATES.FICHA_DIGITAL(nome, ficha, modelo, placa);
    }
    case 'chamada_box': {
      return WHATSAPP_TEMPLATES.CHAMAR_BOX(nome, modelo, placa);
    }
    case 'aprovacao': {
      return WHATSAPP_TEMPLATES.LAUDO_APROVADO(nome, modelo, placa);
    }
    case 'reprovacao': {
      let motivosTexto = '';
      if (Array.isArray(params.motivos)) {
        motivosTexto = params.motivos.map(sanitizarTextoParametro).filter(Boolean).join('\n- ');
        if (motivosTexto) motivosTexto = `- ${motivosTexto}`;
      } else {
        motivosTexto = sanitizarTextoParametro(params.motivos);
      }
      if (!motivosTexto) {
        motivosTexto = 'Pendência documental / estrutural a regularizar';
      }
      return WHATSAPP_TEMPLATES.LAUDO_REPROVADO(nome, placa, motivosTexto);
    }
    default:
      throw new Error(`Tipo de notificação desconhecido: ${(params as any).tipo}`);
  }
}

export interface ResultadoDesconexaoWhatsApp {
  success: boolean;
  message: string;
  /** true somente quando a Evolution API confirmou o logout/restart (HTTP 2xx). */
  confirmadoNoServidor: boolean;
}

/**
 * Desconecta a sessão WhatsApp de forma resiliente na Evolution API v2:
 * 1ª tentativa: DELETE /instance/logout/:instance
 * Fallback (500/404/instância já desvinculada): PUT /instance/restart/:instance
 * Em falha total/rede, libera a interface localmente (o status real é revalidado
 * pelo getStatus logo após a desconexão).
 * Usa a URL, a chave e a instância já configuradas em EVOLUTION_URL/KEY/INSTANCE.
 */
export async function desconectarWhatsApp(
  instancia: string = EVOLUTION_INSTANCE,
  signal?: AbortSignal
): Promise<ResultadoDesconexaoWhatsApp> {
  const headers = getHeaders();
  const nomeInstancia = encodeURIComponent(instancia);

  try {
    // 1ª Tentativa: endpoint oficial de logout da Evolution API v2
    const responseLogout = await fetch(`${EVOLUTION_URL}/instance/logout/${nomeInstancia}`, {
      method: 'DELETE',
      headers,
      signal,
    });

    if (responseLogout.ok) {
      return { success: true, message: 'Sessão desconectada com sucesso.', confirmadoNoServidor: true };
    }

    // Instância já desvinculada ou erro 500/404: executa restart seguro
    console.warn(
      `[evolutionApi] Logout respondeu HTTP ${responseLogout.status}. Tentando fallback de desconexão segura...`
    );
    const responseRestart = await fetch(`${EVOLUTION_URL}/instance/restart/${nomeInstancia}`, {
      method: 'PUT',
      headers,
      signal,
    });

    if (responseRestart.ok) {
      return { success: true, message: 'Instância reiniciada e desconectada.', confirmadoNoServidor: true };
    }

    console.warn(`[evolutionApi] Restart respondeu HTTP ${responseRestart.status}. Liberando sessão no painel.`);
    return { success: true, message: 'Sessão liberada no painel.', confirmadoNoServidor: false };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { success: false, message: 'Operação cancelada.', confirmadoNoServidor: false };
    }
    console.error('[evolutionApi] Erro ao desconectar WhatsApp:', error);
    // Erro de rede ou socket fechado: permite que a interface limpe o status localmente
    return { success: true, message: 'Sessão desconectada localmente.', confirmadoNoServidor: false };
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
    const resultado = await desconectarWhatsApp(EVOLUTION_INSTANCE, signal);
    return resultado.success;
  },

  async enviarTextoDireto(telefone: string, mensagem: string): Promise<EnvioWhatsAppResponse> {
    let telefoneSanitizado = '';
    try {
      telefoneSanitizado = sanitizarTelefoneWhatsApp(telefone);
    } catch (err: any) {
      return {
        sucesso: false,
        telefoneSanitizado: telefone,
        mensagemEnviada: mensagem,
        erro: err?.message || 'Telefone inválido.',
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
        return {
          sucesso: false,
          telefoneSanitizado,
          mensagemEnviada: mensagem,
          detalhes: data,
          erro: data?.message || data?.error || `HTTP ${res.status} ao enviar mensagem WhatsApp.`,
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
export const enviarTextoDireto = evolutionService.enviarTextoDireto;

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
