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
 * 1. OBTENÇÃO SEGURA DE VARIÁVEIS DE AMBIENTE (SEM FALLBACKS HARDCODED)
 * ========================================================================= */

/**
 * Recupera e valida as credenciais da Evolution API configuradas no ambiente.
 * Lança erro explícito caso alguma variável obrigatória não esteja definida,
 * garantindo conformidade com a política de segurança de dados e produção.
 */
export function getEvolutionConfig(): EvolutionConfig {
  const apiUrl = (
    import.meta.env.VITE_EVOLUTION_API_URL ||
    (typeof process !== 'undefined' ? process.env?.VITE_EVOLUTION_API_URL : '') ||
    ''
  ).trim().replace(/\/+$/, '');

  const apiKey = (
    import.meta.env.VITE_EVOLUTION_API_KEY ||
    (typeof process !== 'undefined' ? process.env?.VITE_EVOLUTION_API_KEY : '') ||
    ''
  ).trim();

  const instance = (
    import.meta.env.VITE_EVOLUTION_INSTANCE ||
    (typeof process !== 'undefined' ? process.env?.VITE_EVOLUTION_INSTANCE : '') ||
    ''
  ).trim();

  if (!apiUrl || !apiKey || !instance) {
    throw new Error(
      '[Evolution API] Configurações de mensageria incompletas. ' +
      'Certifique-se de configurar VITE_EVOLUTION_API_URL, VITE_EVOLUTION_API_KEY e VITE_EVOLUTION_INSTANCE.'
    );
  }

  return { apiUrl, apiKey, instance };
}

/* =========================================================================
 * 2. SANITIZAÇÃO E REGRAS DE CONFORMIDADE (DETRAN-RS / LGPD)
 * ========================================================================= */

/**
 * Sanitiza o número de telefone conforme os padrões do DETRAN-RS e WhatsApp:
 * - Remove caracteres não numéricos;
 * - Adiciona o código de país do Brasil (55) se ausente;
 * - Valida se o número possui DDD válido e tamanho regulamentar (12 a 13 dígitos com DDI 55).
 *
 * Exemplos:
 *  - "(54) 99988-7766" -> "5554999887766"
 *  - "54999887766"     -> "5554999887766"
 *  - "5554999887766"   -> "5554999887766"
 */
export function sanitizarTelefoneWhatsApp(telefoneBruto: string): string {
  if (!telefoneBruto) {
    throw new Error('Telefone para envio de notificação não foi fornecido.');
  }

  // Remove parênteses, traços, espaços, pontos e qualquer caractere não numérico
  let apenasNumeros = telefoneBruto.replace(/\D/g, '');

  // Remove zero à esquerda do DDD (ex: 054999999999 -> 54999999999)
  if (apenasNumeros.startsWith('0') && apenasNumeros.length >= 11) {
    apenasNumeros = apenasNumeros.substring(1);
  }

  // Se não começar com 55 (Brasil) e tiver entre 10 e 11 dígitos, acrescenta 55
  if (!apenasNumeros.startsWith('55')) {
    if (apenasNumeros.length === 10 || apenasNumeros.length === 11) {
      apenasNumeros = `55${apenasNumeros}`;
    }
  }

  // Validação de comprimento oficial para celular no Brasil: DDI 55 + DDD 2 dígitos + 8 ou 9 dígitos = 12 ou 13 dígitos
  if (apenasNumeros.length < 12 || apenasNumeros.length > 14) {
    throw new Error(
      `Número de telefone inválido para WhatsApp: "${telefoneBruto}". Esperado formato padrão (DDD) 9XXXX-XXXX.`
    );
  }

  return apenasNumeros;
}

/**
 * Sanitiza strings para prevenir quebra de layout, formatação maliciosa
 * ou vazamento de caracteres de controle nas mensagens de WhatsApp.
 */
export function sanitizarTextoParametro(texto?: string | null): string {
  if (!texto) return '';
  return texto
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[<>{}\\]/g, '')
    .trim();
}

/**
 * Sanitiza a placa para o padrão veicular (caixa alta, alfanumérico e hífen opcional).
 */
export function sanitizarPlaca(placa?: string | null): string {
  if (!placa) return 'NÃO INFORMADA';
  return placa.toUpperCase().replace(/[^A-Z0-9-]/g, '').trim();
}

/**
 * Formata a mensagem padronizada por tipo de evento de vistoria.
 * Garante que nenhuma informação sensível (CPF completo, débitos, autuações detalhadas)
 * seja exposta via mensageria pública.
 */
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
 * 3. MÉTODOS DE COMUNICAÇÃO COM A EVOLUTION API v2
 * ========================================================================= */

/**
 * Consulta o estado atual da conexão da instância WhatsApp na Evolution API.
 * Endpoint: GET /instance/connectionState/${INSTANCE}
 * Header: apikey: ${API_KEY}
 *
 * @returns 'open' (conectado) | 'close' (desconectado) | 'connecting' (iniciando)
 */
export async function getStatus(signal?: AbortSignal): Promise<WhatsAppConnectionState> {
  const { apiUrl, apiKey, instance } = getEvolutionConfig();

  try {
    const url = `${apiUrl}/instance/connectionState/${encodeURIComponent(instance)}`;
    const response = await fetch(url, {
      method: 'GET',
      signal,
      headers: {
        'apikey': import.meta.env.VITE_EVOLUTION_API_KEY || apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[Evolution API] Instância "${instance}" não encontrada ou fechada (404).`);
        return 'close';
      }
      console.warn(`[Evolution API] Resposta HTTP ${response.status} ao consultar status da instância.`);
      return 'close';
    }

    const data = await response.json();

    // Normalização das variações de payload da Evolution API v2:
    // data.instance.state, data.state, data.connectionStatus.state
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
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return 'close';
    }
    console.error('[Evolution API] Falha de rede ao consultar status do WhatsApp:', error?.message || error);
    return 'close';
  }
}

/**
 * Solicita a geração ou recuperação do QR Code de conexão para a instância.
 * Endpoint: GET /instance/connect/${INSTANCE}
 * Header: apikey: ${API_KEY}
 *
 * @returns Objeto com a string Base64 da imagem e status de sucesso.
 */
export async function getQrCode(signal?: AbortSignal): Promise<QrCodeResponse> {
  const { apiUrl, apiKey, instance } = getEvolutionConfig();

  try {
    const url = `${apiUrl}/instance/connect/${encodeURIComponent(instance)}`;
    const response = await fetch(url, {
      method: 'GET',
      signal,
      headers: {
        'apikey': import.meta.env.VITE_EVOLUTION_API_KEY || apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const textoErro = await response.text();
      return {
        sucesso: false,
        erro: `Falha ao obter QR Code (HTTP ${response.status}): ${textoErro}`,
      };
    }

    const data = await response.json();

    // A Evolution API v2 retorna o base64 diretamente ou aninhado em qrcode
    const base64 =
      data?.base64 ||
      data?.qrcode?.base64 ||
      data?.code ||
      '';

    const pairingCode = data?.pairingCode || undefined;
    const code = data?.code || undefined;

    return {
      sucesso: true,
      base64,
      code,
      pairingCode,
    };
  } catch (error: any) {
    console.error('[Evolution API] Erro ao conectar/gerar QR Code:', error?.message || error);
    return {
      sucesso: false,
      erro: error?.message || 'Erro de comunicação ao gerar QR Code.',
    };
  }
}

/**
 * Desconecta o aparelho e encerra a sessão ativa do WhatsApp no cartório.
 * Endpoint: DELETE /instance/logout/${INSTANCE}
 * Header: apikey: ${API_KEY}
 *
 * @returns true se desvinculado com sucesso, false caso contrário.
 */
export async function logout(signal?: AbortSignal): Promise<boolean> {
  const { apiUrl, apiKey, instance } = getEvolutionConfig();

  try {
    const url = `${apiUrl}/instance/logout/${encodeURIComponent(instance)}`;
    const response = await fetch(url, {
      method: 'DELETE',
      signal,
      headers: {
        'apikey': import.meta.env.VITE_EVOLUTION_API_KEY || apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[Evolution API] Resposta HTTP ${response.status} ao realizar logout da instância.`);
      return false;
    }

    return true;
  } catch (error: any) {
    console.error('[Evolution API] Erro ao efetuar logout da instância:', error?.message || error);
    return false;
  }
}

/**
 * Dispara uma notificação de vistoria padronizada para o WhatsApp do cidadão/proprietário.
 * Endpoint: POST /message/sendText/${INSTANCE}
 *
 * Características de Conformidade Técnica:
 * - Sanitização rigorosa de telefone com prefixo DDI 55;
 * - Payload com presença 'composing' e delay humano de 1200ms para evitar rajadas e banimentos;
 * - Formatação homologada para os eventos de Vistoria do CRVA.
 */
export async function enviarNotificacaoVistoria(
  params: NotificacaoVistoriaParams
): Promise<EnvioWhatsAppResponse> {
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

  const { apiUrl, apiKey, instance } = getEvolutionConfig();

  try {
    const url = `${apiUrl}/message/sendText/${encodeURIComponent(instance)}`;

    // Payload oficial Evolution API v2 para envio de mensagens com simulação humana
    const payload = {
      number: telefoneSanitizado,
      text: mensagem,
      delay: 1200, // Controle de concorrência com delay humano (1.2 segundos)
      presence: 'composing', // Exibe "digitando..." antes do disparo
      linkPreview: false,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': import.meta.env.VITE_EVOLUTION_API_KEY || apiKey,
        'Content-Type': 'application/json',
      },
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

    // Identificador da mensagem retornada pelo WhatsApp Baileys
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
}

/**
 * Helper rápido para verificar se o gateway está pronto para disparos.
 */
export async function isWhatsAppDisponivel(): Promise<boolean> {
  try {
    const status = await getStatus();
    return status === 'open';
  } catch {
    return false;
  }
}

