/**
 * ============================================================================
 * MARKS SYSTEMS · CRM-INTEGRA · WEBHOOK OFICIAL WHATSAPP (EVOLUTION API / META)
 * ============================================================================
 * Rota universal de recebimento e orquestração de mensagens do WhatsApp:
 * 1. Parser universal de payloads (Evolution API v1/v2, Z-API, Meta Cloud API).
 * 2. Memória de conversa: recupera as últimas 8 mensagens em crm_mensagens para
 *    contexto contínuo (user/assistant) sem perda de assunto entre turnos.
 * 3. Apresentação única: Antonella só se apresenta no primeiro contato (últimas 12h);
 *    nos turnos seguintes, responde direto sem saudações redundantes.
 * 4. Linguagem 100% natural: sem termos técnicos ou rótulos ("Observação de contexto").
 * 5. Transbordo para fila_humana imediato ao informar Placa ou Renavam para consulta,
 *    gravando a placa no card do Kanban.
 * 6. Suporte multimodal completo: áudio (transcrição) e texto com resposta padrão.
 * 7. Persistência garantida com colunas reais no Supabase.
 * ============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export interface MensagemUniversalExtraida {
  remoteJid: string;
  telefoneLimpo: string;
  pushName: string;
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  messageId?: string;
  timestamp?: number;
  isAudio: boolean;
  audioBase64?: string;
  audioMimetype?: string;
  rawItem?: any;
}

export interface StatusExpediente {
  aberto: boolean;
  motivoFechado: string | null;
  horarioTexto: string;
  proximaAbertura: string;
  intervaloAlmoco: boolean;
  diaSemana: string;
}

// Modelos oficiais de chat para fallback na Groq Cloud (sem modelos obsoletos ou prompt-guard)
const GROQ_CHAT_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
] as const;

// Cache em memória de idempotência (LRU com TTL de 10 minutos) para evitar requisições concorrentes duplicadas
const processedWaMessageIds = new Map<string, number>();
function limparIdsExpirados() {
  const agora = Date.now();
  for (const [id, ts] of processedWaMessageIds.entries()) {
    if (agora - ts > 10 * 60 * 1000) {
      processedWaMessageIds.delete(id);
    }
  }
}

// Diretriz obrigatória de grounding estrito e concisão (anti-alucinação de valores e estilo WhatsApp direto)
export const DIRETRIZ_GROUNDING_ESTRITO = `CONSULTA OBRIGATÓRIA À BASE OFICIAL E REGRAS DE CONCISÃO:
1. Sempre que o usuário perguntar valores, taxas ou serviços, localize a linha exata na Tabela de Valores GAD-e / Base de Conhecimento Oficial fornecida abaixo e informe o valor exato em reais (R$). Nunca diga que 'os valores variam' se o serviço constar na tabela.
2. REGRA DE CONCISÃO E ESTILO WHATSAPP (MÁXIMO 3 A 5 LINHAS CURTAS):
- Seja ultra-direta, simpática e objetiva. NUNCA envie textões explicativos ou listas desnecessárias.
- Se o usuário perguntou APENAS o valor, responda APENAS o valor e adicione no máximo 1 linha perguntando se deseja a lista de documentos ou enviar placa/renavam.
- NUNCA repita parágrafos fixos sobre expediente fechado ou rodapés repetitivos.
- Responda em português natural, sem jargões de sistema.`;

// Prompt Base da Antonella (CRVA / Detran-RS)
const PROMPT_ANTONELLA_PADRAO = `# PAPEL E PERSONA
Você é Antonella, a atendente virtual oficial via WhatsApp de um CRVA (Centro de Registro de Veículos Automotores) credenciado ao Detran/RS.
Sua missão é prestar orientações humanizadas, acolhedoras, claras e objetivas a proprietários, compradores e despachantes sobre processos e regularizações de VEÍCULOS.

# REGRAS INVIOLÁVEIS DE ATIVAÇÃO E CANAIS (CONTROLE ESTRITO)
1. MODO EXCLUSIVAMENTE RECEPTIVO: Você atua estritamente respondendo às dúvidas enviadas pelo cidadão ou despachante no chat individual.
2. BLOQUEIO TOTAL EM GRUPOS: Você JAMAIS deve responder ou interagir em grupos de WhatsApp (chats com @g.us ou múltiplos participantes).
3. ASSUNTO ESTRITO AO CRVA / DETRAN-RS: Responda única e exclusivamente assuntos relacionados aos serviços registrais de veículos do CRVA / Detran-RS. Caso perguntem sobre habilitação/CNH, oriente com gentileza a procurar um CFC ou a Central do Detran/RS.
4. PROIBIÇÃO TEXTUAL: NUNCA mencione siglas operacionais internas como "POP", "POP 02" ou "Procedimento Operacional Padrão". NUNCA use termos de sistema ou rótulos artificiais como "Observação de contexto:".

# HORÁRIOS DE FUNCIONAMENTO, SENHAS E PISTA DE VISTORIA
1. Horário Geral de Expediente: Segunda a Sexta-feira, das 08:00 às 12:00 e das 13:00 às 17:00.
2. Atendimento no Balcão (Corte de Senhas): Turno da manhã encerra rigorosamente às 11:30. Turno da tarde encerra rigorosamente às 16:30.
3. Pista de Vistoria Veicular: A abertura de novas vistorias encerra rigorosamente às 11:30 (manhã) e às 16:30 (tarde).`;

/**
 * Verifica o status de expediente ativo do CRVA com base no fuso America/Sao_Paulo:
 * Segunda a Sexta-feira, das 08:00 às 12:00 e das 13:00 às 17:00.
 */
export function verificarHorarioExpediente(dataReferencia: Date = new Date()): StatusExpediente {
  const formatoSp = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatoSp.formatToParts(dataReferencia);
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const totalMinutos = hour * 60 + minute;

  // Dias úteis: Mon, Tue, Wed, Thu, Fri (Segunda a Sexta)
  const ehDiaUtil = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekdayStr);

  const turnoManha = totalMinutos >= 480 && totalMinutos < 720; // 08:00 às 12:00
  const turnoTarde = totalMinutos >= 780 && totalMinutos < 1020; // 13:00 às 17:00
  const intervaloAlmoco = ehDiaUtil && totalMinutos >= 720 && totalMinutos < 780;

  const aberto = ehDiaUtil && (turnoManha || turnoTarde);

  let motivoFechado: string | null = null;
  let proximaAbertura = 'no próximo dia útil às 08:00';

  if (!ehDiaUtil) {
    motivoFechado = 'Final de semana';
    proximaAbertura = 'na próxima segunda-feira às 08:00';
  } else if (intervaloAlmoco) {
    motivoFechado = 'Intervalo do almoço';
    proximaAbertura = 'hoje às 13:00';
  } else if (totalMinutos < 480) {
    motivoFechado = 'Antes do início do expediente matutino';
    proximaAbertura = 'hoje às 08:00';
  } else if (totalMinutos >= 1020) {
    motivoFechado = 'Após o término do expediente vespertino';
    proximaAbertura = weekdayStr === 'Fri' ? 'na próxima segunda-feira às 08:00' : 'no próximo dia útil às 08:00';
  }

  const horaFormatada = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return {
    aberto,
    motivoFechado,
    horarioTexto: horaFormatada,
    proximaAbertura,
    intervaloAlmoco,
    diaSemana: weekdayStr,
  };
}

/**
 * Detecta se a mensagem exige ação humana real:
 * - Informar Placa ou Renavam para consulta, verificação ou preparação de processo
 * - Pedido explícito de falar com atendente humano
 * - Casos jurídicos críticos (óbito, inventário, leilão, bloqueio judicial / RENAJUD, suspeita de adulteração)
 */
export function exigeAcaoHumanaReal(
  texto: string,
  placaDetectada: string | null,
  renavamDetectado: string | null
): { exige: boolean; motivo: string | null } {
  if (!texto) return { exige: false, motivo: null };
  const t = texto.toLowerCase();

  // 1. Envio de Placa ou Renavam para consulta ou andamento de serviço
  if (placaDetectada || renavamDetectado) {
    const ident = placaDetectada ? `placa ${placaDetectada}` : `Renavam ${renavamDetectado}`;
    return {
      exige: true,
      motivo: `Consulta e verificação veicular da ${ident}`,
    };
  }

  // 2. Pedido expresso de atendente humano
  if (
    t.includes('falar com atendente') ||
    t.includes('falar com humano') ||
    t.includes('atendente humano') ||
    t.includes('falar com alguem') ||
    t.includes('falar com alguém') ||
    t.includes('pessoa real') ||
    t.includes('operador humano')
  ) {
    return { exige: true, motivo: 'Solicitação expressa de atendente humano' };
  }

  // 3. Demandas jurídicas críticas
  if (
    t.includes('óbito') ||
    t.includes('obito') ||
    t.includes('inventário') ||
    t.includes('inventario') ||
    t.includes('herdeiro') ||
    t.includes('renajud') ||
    t.includes('bloqueio judicial') ||
    t.includes('leilão') ||
    t.includes('leilao') ||
    t.includes('adulterad') ||
    t.includes('perícia') ||
    t.includes('pericia')
  ) {
    return { exige: true, motivo: 'Demanda jurídica complexa (óbito/inventário/bloqueio judicial/leilão)' };
  }

  // 4. Solicitação de emissão de guia/documento
  if (
    t.includes('emitir guia') ||
    t.includes('gerar guia') ||
    t.includes('puxar crlv') ||
    t.includes('imprimir crlv') ||
    t.includes('segunda via crlv')
  ) {
    return { exige: true, motivo: 'Solicitação de emissão de documento ou guia' };
  }

  return { exige: false, motivo: null };
}

/**
 * Inicializa cliente Supabase no servidor com Service Role (evita bloqueios de RLS)
 */
export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL || 'https://hyphsoqjyrqpbplwcotk.supabase.co';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cGhzb3FqeXJxcGJwbHdjb3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MzM5MTcsImV4cCI6MjA5NzMwOTkxN30.8eEVUKB7UHs1ReBZBZSkRePZXxW4TVIStXWTBPv_ngY';

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Parser universal para suportar Evolution API v1/v2, Z-API e Meta Cloud API
 * com detecção nativa de áudio (audioMessage).
 */
export function extrairMensagemUniversal(body: any): MensagemUniversalExtraida | null {
  if (!body || typeof body !== 'object') return null;

  let item = body;
  if (Array.isArray(body) && body.length > 0) {
    item = body[0];
  } else if (body.data) {
    if (Array.isArray(body.data) && body.data.length > 0) {
      item = body.data[0];
    } else {
      item = body.data;
    }
  } else if (body.entry && Array.isArray(body.entry)) {
    const change = body.entry[0]?.changes?.[0]?.value;
    if (change?.messages?.[0]) {
      const msg = change.messages[0];
      const contact = change.contacts?.[0];
      const from = String(msg.from || '').replace(/\D/g, '');
      const isAud = msg.type === 'audio' || Boolean(msg.audio);
      return {
        remoteJid: `${from}@s.whatsapp.net`,
        telefoneLimpo: from,
        pushName: contact?.profile?.name || 'Cliente WhatsApp',
        text: String(msg.text?.body || msg.caption || '').trim(),
        fromMe: false,
        isGroup: false,
        messageId: msg.id,
        timestamp: Number(msg.timestamp) ? Number(msg.timestamp) * 1000 : Date.now(),
        isAudio: isAud,
        audioMimetype: msg.audio?.mime_type || 'audio/ogg',
        rawItem: item,
      };
    }
  }

  const key = item.key || body.key || body.data?.key || {};
  const remoteJid: string = String(
    key.remoteJid ||
    item.remoteJid ||
    body.remoteJid ||
    body.data?.key?.remoteJid ||
    item.phone ||
    body.phone ||
    item.from ||
    body.from ||
    ''
  ).trim();

  const fromMe: boolean = Boolean(
    key.fromMe ??
    item.fromMe ??
    body.fromMe ??
    body.data?.key?.fromMe ??
    false
  );

  const isGroup: boolean = Boolean(
    remoteJid.endsWith('@g.us') ||
    item.isGroup ||
    body.isGroup ||
    body.data?.isGroup ||
    (remoteJid.includes('-') && remoteJid.includes('@g.us'))
  );

  const pushName: string = String(
    item.pushName ||
    body.pushName ||
    body.data?.pushName ||
    item.senderName ||
    body.senderName ||
    item.name ||
    body.name ||
    'Cliente WhatsApp'
  ).trim();

  const msgRaw = item.message || body.message || body.data?.message || item;
  let text = '';
  let isAudio = false;
  let audioBase64 = '';
  let audioMimetype = 'audio/ogg';

  // Desempacota mensagens aninhadas (Ephemeral, ViewOnce, DocumentWithCaption)
  let msgObj = msgRaw;
  if (msgObj?.ephemeralMessage?.message) msgObj = msgObj.ephemeralMessage.message;
  if (msgObj?.viewOnceMessage?.message) msgObj = msgObj.viewOnceMessage.message;
  if (msgObj?.viewOnceMessageV2?.message) msgObj = msgObj.viewOnceMessageV2.message;
  if (msgObj?.documentWithCaptionMessage?.message) msgObj = msgObj.documentWithCaptionMessage.message;

  // Detecção abrangente de áudio / notas de voz (audioMessage / pttMessage / voice)
  const messageType =
    item.messageType ||
    body.messageType ||
    body.data?.messageType ||
    item.type ||
    '';

  const audioPayload =
    msgObj?.audioMessage ||
    msgObj?.pttMessage ||
    msgRaw?.audioMessage ||
    msgRaw?.pttMessage ||
    item?.audioMessage ||
    item?.pttMessage ||
    body.data?.message?.audioMessage ||
    body.data?.message?.pttMessage ||
    body.data?.audioMessage ||
    body.data?.pttMessage ||
    null;

  const hasAudio =
    Boolean(audioPayload) ||
    messageType === 'audioMessage' ||
    messageType === 'pttMessage' ||
    messageType === 'audio' ||
    item.type === 'audio' ||
    msgObj?.type === 'audio';

  if (hasAudio) {
    isAudio = true;
    const audioData = audioPayload || {};
    audioMimetype =
      audioData.mimetype ||
      msgObj?.mimetype ||
      msgRaw?.mimetype ||
      item.mimetype ||
      'audio/ogg; codecs=opus';

    // 1. Tenta extrair o Base64 diretamente do payload recebido (dupla via parte 1)
    const possiveisBase64 = [
      body?.data?.message?.base64,
      body?.data?.base64,
      body?.base64,
      msgObj?.base64,
      msgRaw?.base64,
      item?.base64,
      audioData?.base64,
      item?.message?.base64,
      body?.data?.message?.audioMessage?.base64,
      body?.data?.message?.pttMessage?.base64,
    ];
    for (const b of possiveisBase64) {
      if (typeof b === 'string' && b.trim().length > 50) {
        audioBase64 = b.replace(/^data:[^;]+;base64,/, '').trim();
        break;
      }
    }
  }

  if (typeof msgObj === 'string') {
    text = msgObj;
  } else if (msgObj && typeof msgObj === 'object') {
    text =
      msgObj.conversation ||
      msgObj.extendedTextMessage?.text ||
      msgObj.imageMessage?.caption ||
      msgObj.videoMessage?.caption ||
      msgObj.documentMessage?.caption ||
      msgObj.documentWithCaptionMessage?.message?.documentMessage?.caption ||
      msgObj.buttonsResponseMessage?.selectedDisplayText ||
      msgObj.listResponseMessage?.title ||
      msgObj.templateButtonReplyMessage?.selectedDisplayText ||
      msgObj.text?.message ||
      msgObj.text ||
      '';
  }

  const telefoneLimpo = remoteJid.replace(/@s\.whatsapp\.net|@c\.us|@g\.us/g, '').replace(/\D/g, '');

  return {
    remoteJid,
    telefoneLimpo,
    pushName: pushName || 'Cliente WhatsApp',
    text: String(text).trim(),
    fromMe,
    isGroup,
    messageId: key.id || item.id || body.id,
    timestamp: item.messageTimestamp || body.messageTimestamp || Date.now(),
    isAudio,
    audioBase64,
    audioMimetype,
    rawItem: item,
  };
}

/**
 * Obtém o Base64 do áudio da Evolution API caso não tenha vindo no payload (dupla via garantida)
 */
async function extrairAudioBase64(params: {
  parsed: MensagemUniversalExtraida;
  bodyPayload?: any;
  evolutionUrl: string;
  evolutionKey: string;
  evolutionInstance: string;
}): Promise<{ base64: string; mimetype: string } | null> {
  const { parsed, bodyPayload, evolutionUrl, evolutionKey, evolutionInstance } = params;

  // 1. Primeira via: Base64 já disponível no payload
  if (parsed.audioBase64 && parsed.audioBase64.trim().length > 50) {
    const limpo = parsed.audioBase64.replace(/^data:[^;]+;base64,/, '').trim();
    console.log(`[WHATSAPP WEBHOOK] 📦 Áudio Base64 lido diretamente do payload (${limpo.length} chars).`);
    return {
      base64: limpo,
      mimetype: parsed.audioMimetype || 'audio/ogg',
    };
  }

  // 2. Segunda via: Download sob demanda da mídia descriptografada via Evolution API v2
  const itemKey =
    parsed.rawItem?.key ||
    parsed.rawItem?.data?.key ||
    bodyPayload?.data?.key ||
    bodyPayload?.key ||
    bodyPayload?.data?.message?.key ||
    (parsed.messageId
      ? {
          remoteJid: parsed.remoteJid,
          fromMe: parsed.fromMe,
          id: parsed.messageId,
        }
      : null);

  if (!itemKey) {
    console.warn('[WHATSAPP WEBHOOK] ⚠️ Não foi possível identificar a key da mensagem de áudio para download na Evolution API.');
    return null;
  }

  try {
    const endpoint = `${evolutionUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(evolutionInstance)}`;
    console.log(`[WHATSAPP WEBHOOK] 🌐 Baixando áudio descriptografado via POST ${endpoint}...`);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({
        message: { key: itemKey },
        convertToMp4: false,
      }),
    });

    if (res.ok) {
      const resData = await res.json();
      const rawBase64 = resData?.base64 || resData?.data || resData?.media?.base64 || '';
      if (rawBase64 && typeof rawBase64 === 'string' && rawBase64.trim().length > 50) {
        const limpo = rawBase64.replace(/^data:[^;]+;base64,/, '').trim();
        console.log(`[WHATSAPP WEBHOOK] ✅ Áudio baixado e descriptografado com sucesso da Evolution API (${limpo.length} chars).`);
        return {
          base64: limpo,
          mimetype: resData?.mimetype || parsed.audioMimetype || 'audio/ogg',
        };
      } else {
        console.warn('[WHATSAPP WEBHOOK] ⚠️ Evolution API retornou 200 mas sem campo base64 válido:', Object.keys(resData || {}));
      }
    } else {
      const errBody = await res.text().catch(() => '');
      console.warn(`[WHATSAPP WEBHOOK] ⚠️ Falha ao baixar mídia na Evolution API HTTP ${res.status}:`, errBody);
    }
  } catch (errBuscaAudio: any) {
    console.error('[WHATSAPP WEBHOOK] ❌ Erro de conexão ao baixar áudio da Evolution API:', errBuscaAudio?.message || errBuscaAudio);
  }

  return null;
}

/**
 * Transcreve áudio do cliente utilizando prioritariamente Groq Whisper (whisper-large-v3-turbo)
 * com fallback para Google Gemini Multimodal (gemini-2.5-flash, etc.).
 */
async function transcreverAudioCliente(params: {
  base64: string;
  mimetype: string;
  geminiKey: string;
  groqKey: string;
}): Promise<string | null> {
  const { base64, mimetype, geminiKey, groqKey } = params;
  const base64Clean = base64.replace(/^data:[^;]+;base64,/, '').trim();
  const mimeLimpo = (mimetype || 'audio/ogg').split(';')[0].trim().toLowerCase() || 'audio/ogg';

  let erroGroq: any = null;
  let erroGemini: any = null;

  // =========================================================================
  // MÉTODO 1 (PRIORITÁRIO): GROQ WHISPER (whisper-large-v3-turbo)
  // Mais rápido, robusto e nativo para áudio .ogg do WhatsApp
  // =========================================================================
  if (groqKey) {
    try {
      console.log('[WHATSAPP WEBHOOK] 🎙️ Iniciando transcrição prioritária com Groq Whisper (whisper-large-v3-turbo)...');
      const endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';
      const buffer = Buffer.from(base64Clean, 'base64');
      const blob = new Blob([buffer], { type: 'audio/ogg' });

      const formData = new FormData();
      formData.append('file', blob, 'audio.ogg');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'pt');
      formData.append('response_format', 'json');

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData,
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const data = await res.json();
        const transcricao = data?.text?.trim();
        if (transcricao) {
          console.log(`[WHATSAPP WEBHOOK] 🎤 [Groq Whisper] Áudio transcrito com sucesso: "${transcricao.substring(0, 100)}"`);
          return transcricao;
        }
      } else {
        const errText = await res.text().catch(() => '');
        erroGroq = `HTTP ${res.status}: ${errText}`;
        console.error('[IA] falha no modelo', 'whisper-large-v3-turbo', { status: res.status, body: errText });
      }
    } catch (err: any) {
      erroGroq = err?.message || err;
      console.error('[IA] falha no modelo', 'whisper-large-v3-turbo', err);
    }
  } else {
    erroGroq = 'Chave GROQ_API_KEY não configurada';
  }

  // =========================================================================
  // MÉTODO 2 (FALLBACK): GOOGLE GEMINI MULTIMODAL
  // =========================================================================
  if (geminiKey) {
    console.log('[WHATSAPP WEBHOOK] 🎙️ Acionando fallback multimodal via Google Gemini...');
    const modelosGemini = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-flash-latest',
      'gemini-3-flash-preview',
      'gemini-1.5-flash',
    ];
    if (geminiKey.startsWith('AQ.')) {
      modelosGemini.push('gemini-3.8-flash');
    }

    for (const model of modelosGemini) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const body = {
          contents: [
            {
              parts: [
                { inlineData: { mimeType: 'audio/ogg', data: base64Clean } },
                { text: 'Transcreva fielmente o que o cliente disse neste áudio em português, sem comentários adicionais.' },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
        };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data = await res.json();
          const transcricao = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (transcricao) {
            console.log(`[WHATSAPP WEBHOOK] 🎤 [Gemini ${model}] Áudio transcrito com sucesso: "${transcricao.substring(0, 100)}"`);
            return transcricao;
          }
        } else {
          const errText = await res.text().catch(() => '');
          erroGemini = `HTTP ${res.status} (${model}): ${errText}`;
          console.error('[IA] falha no modelo', model, { status: res.status, body: errText });
        }
      } catch (err: any) {
        erroGemini = err?.message || err;
        console.error('[IA] falha no modelo', model, err);
      }
    }
  } else {
    erroGemini = 'Chave GEMINI_API_KEY não configurada';
  }

  console.error('[AUDIO TRANSCRIPTION ERROR]', {
    erroGroq,
    erroGemini,
    tamanhoBase64: base64Clean.length,
    temGroqKey: Boolean(groqKey),
    temGeminiKey: Boolean(geminiKey),
  });

  return null;
}

/**
 * Mensagem de fallback de contingência caso todos os modelos de IA falhem.
 * Mantém padrão estrito de concisão (máximo 2 linhas) e aciona a equipe humana.
 */
function gerarMensagemFallbackContingencia(nomeCliente?: string): string {
  const saudacao = nomeCliente ? `Olá, ${nomeCliente}!` : 'Olá!';
  return `${saudacao} No momento estou com uma instabilidade técnica momentânea. Já encaminhei sua dúvida para nossa equipe de atendimento que responderá você em breve!`;
}

/**
 * Carrega a Base de Conhecimento Oficial (documentos ativos, tabelas e taxas)
 * e o System Prompt configurado para a Antonella a partir do Supabase (fonte única da verdade).
 */
async function carregarBaseConhecimentoEConfiguracoes(supabaseClient: any): Promise<{
  systemPromptBase: string;
  blocoBaseConhecimento: string;
  geminiKeyConfig?: string;
  groqKeyConfig?: string;
  provedorAtivo?: 'gemini' | 'groq';
  fallbackHabilitado?: boolean;
}> {
  let systemPromptBase = PROMPT_ANTONELLA_PADRAO;
  let documentosBase: any[] = [];
  let textoKnowledgeBaseDireto = '';
  let textoDocumentosTreinamentoOficiais = '';
  let geminiKeyConfig = '';
  let groqKeyConfig = '';
  let provedorAtivo: 'gemini' | 'groq' = 'gemini';
  let fallbackHabilitado = true;

  // 1. Consulta prioritária no Supabase (fonte única da verdade em tempo real)
  if (supabaseClient) {
    try {
      // 1.0 Tenta ler da tabela única oficial: public.ai_config (id = 'default')
      const { data: aiCfgRow } = await supabaseClient
        .from('ai_config')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (aiCfgRow) {
        if (aiCfgRow.system_prompt && aiCfgRow.system_prompt.trim()) {
          systemPromptBase = aiCfgRow.system_prompt.trim();
        }
        if (aiCfgRow.knowledge_base && aiCfgRow.knowledge_base.trim()) {
          textoKnowledgeBaseDireto = aiCfgRow.knowledge_base.trim();
        }
        if (aiCfgRow.provider) provedorAtivo = aiCfgRow.provider;
        if (aiCfgRow.gemini_api_key) geminiKeyConfig = aiCfgRow.gemini_api_key.trim();
        if (aiCfgRow.groq_api_key) groqKeyConfig = aiCfgRow.groq_api_key.trim();
        if (typeof aiCfgRow.fallback_enabled === 'boolean') fallbackHabilitado = aiCfgRow.fallback_enabled;
      }

      // 1.1 Consulta prioritária nos documentos ativos da tabela oficial public.ai_knowledge_docs
      const { data: knowledgeDocsDb } = await supabaseClient
        .from('ai_knowledge_docs')
        .select('file_name, file_type, content_text')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (Array.isArray(knowledgeDocsDb) && knowledgeDocsDb.length > 0) {
        const textoDocsTreinamento = knowledgeDocsDb
          .map(
            (d: any, idx: number) =>
              `=== [ARQUIVO DE TREINAMENTO ${idx + 1}: ${d.file_name} (.${d.file_type})] ===\n${d.content_text}`
          )
          .join('\n\n');

        if (textoDocsTreinamento.trim()) {
          textoDocumentosTreinamentoOficiais = textoDocsTreinamento.trim();
        }
      }

      // 1.2 Se não encontrou ai_config, tenta registro garantido em crm_atendimentos (__SYS_AI_CFG__)
      if (!textoKnowledgeBaseDireto || systemPromptBase === PROMPT_ANTONELLA_PADRAO) {
        const { data: sysRows } = await supabaseClient
          .from('crm_atendimentos')
          .select('telefone, ultima_mensagem')
          .in('telefone', ['__SYS_AI_CFG__', '__SYS_AI_KB__']);

        if (sysRows && Array.isArray(sysRows)) {
          for (const sr of sysRows) {
            if (sr.telefone === '__SYS_AI_CFG__' && sr.ultima_mensagem) {
              try {
                const p = JSON.parse(sr.ultima_mensagem);
                const sPrompt = p.system_prompt || p.systemPrompt;
                if (sPrompt && sPrompt.trim()) systemPromptBase = sPrompt.trim();
                const kb = p.knowledge_base || p.knowledgeBase;
                if (kb && kb.trim()) textoKnowledgeBaseDireto = kb.trim();
                if (p.provider || p.activeProvider) provedorAtivo = p.provider || p.activeProvider;
                if (p.gemini_api_key || p.geminiApiKey) geminiKeyConfig = (p.gemini_api_key || p.geminiApiKey).trim();
                if (p.groq_api_key || p.groqApiKey) groqKeyConfig = (p.groq_api_key || p.groqApiKey).trim();
                if (typeof (p.fallback_enabled ?? p.autoFallback) === 'boolean') {
                  fallbackHabilitado = p.fallback_enabled ?? p.autoFallback;
                }
              } catch { }
            }
            if (sr.telefone === '__SYS_AI_KB__' && sr.ultima_mensagem) {
              try {
                const p = JSON.parse(sr.ultima_mensagem);
                if (Array.isArray(p.documentos) && p.documentos.length > 0) {
                  documentosBase = p.documentos;
                }
              } catch { }
            }
          }
        }
      }

      // 1.3 Tenta crm_configuracoes como fallback
      if (!textoKnowledgeBaseDireto && documentosBase.length === 0) {
        const { data: configs } = await supabaseClient
          .from('crm_configuracoes')
          .select('chave, valor')
          .in('chave', ['ai_knowledge_base', 'ai_engine_config']);

        if (configs && Array.isArray(configs)) {
          for (const cfg of configs) {
            if (cfg.chave === 'ai_knowledge_base' && Array.isArray(cfg.valor?.documentos)) {
              documentosBase = cfg.valor.documentos;
            }
            if (cfg.chave === 'ai_engine_config') {
              const v = cfg.valor;
              const sp = v?.system_prompt || v?.systemPrompt;
              if (sp && sp.trim()) systemPromptBase = sp.trim();
              const kb = v?.knowledge_base || v?.knowledgeBase;
              if (kb && kb.trim()) textoKnowledgeBaseDireto = kb.trim();
              if (v?.gemini_api_key || v?.geminiApiKey) geminiKeyConfig = (v.gemini_api_key || v.geminiApiKey).trim();
              if (v?.groq_api_key || v?.groqApiKey) groqKeyConfig = (v.groq_api_key || v.groqApiKey).trim();
            }
          }
        }
      }
    } catch (errSupabase) {
      console.warn('[WHATSAPP WEBHOOK] Falha ao consultar Supabase para config de IA:', errSupabase);
    }
  }

  // 2. Se documentosBase ainda estiver vazio e não houver texto direto, tenta carregar de data/ (se existir)
  if (!textoDocumentosTreinamentoOficiais && !textoKnowledgeBaseDireto && documentosBase.length === 0) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const arqKb = path.join(process.cwd(), 'data', 'crm_knowledge_base.json');
      const conteudoKb = await fs.readFile(arqKb, 'utf-8');
      const parsedKb = JSON.parse(conteudoKb);
      if (Array.isArray(parsedKb?.documentos)) {
        documentosBase = parsedKb.documentos;
      }
    } catch { }
  }

  // 3. Monta o conteúdo textual de todos os documentos ativos anexados
  const docsAtivos = documentosBase.filter(
    (d: any) => d && d.status !== 'inativo' && (d.conteudoTexto || d.texto)
  );
  let textoDocumentosAnexados = '';

  if (docsAtivos.length > 0) {
    textoDocumentosAnexados = docsAtivos
      .map(
        (d: any, idx: number) =>
          `=== [DOCUMENTO DE TREINAMENTO OFICIAL ${idx + 1}: ${d.titulo || d.nome || 'Manual Oficial'}] ===\n${d.conteudoTexto || d.texto}`
      )
      .join('\n\n');
  }

  // 4. Injeção explícita da Base de Conhecimento Oficial como fonte única de verdade
  const conteudoFinalKb =
    textoDocumentosTreinamentoOficiais ||
    textoKnowledgeBaseDireto ||
    textoDocumentosAnexados;

  const blocoBaseConhecimento = `
=== BASE DE CONHECIMENTO OFICIAL (ARQUIVOS DE TREINAMENTO DO CRVA) ===
${conteudoFinalKb || 'Nenhum documento adicional de taxas anexado na Base de Conhecimento. Se o usuário perguntar por valores específicos que não constem no System Prompt, informe que o valor exato será confirmado pela equipe do CRVA na emissão da guia GAD-e.'}
`.trim();

  return {
    systemPromptBase,
    blocoBaseConhecimento,
    geminiKeyConfig,
    groqKeyConfig,
    provedorAtivo,
    fallbackHabilitado,
  };
}

/**
 * Gera resposta da Antonella consultando Gemini / Groq com histórico real da conversa.
 * Se ambas as APIs falharem, aciona a Heurística Especialista com continuidade e linguagem natural.
 */
async function gerarRespostaAntonella(params: {
  mensagemCliente: string;
  nomeCliente: string;
  historicoPrevio?: { role: 'user' | 'assistant'; content: string }[];
  jaTeveInteracaoRecente: boolean;
  supabaseClient: any;
  statusExpediente: StatusExpediente;
  geminiKeyPrevia?: string;
  groqKeyPrevia?: string;
}): Promise<string> {
  const {
    mensagemCliente,
    nomeCliente,
    historicoPrevio = [],
    jaTeveInteracaoRecente,
    supabaseClient,
    statusExpediente,
    geminiKeyPrevia = '',
    groqKeyPrevia = '',
  } = params;

  // Carrega Base de Conhecimento ativa, System Prompt e credenciais salvas
  const {
    systemPromptBase,
    blocoBaseConhecimento,
    geminiKeyConfig,
    groqKeyConfig,
    provedorAtivo = 'gemini',
    fallbackHabilitado = true,
  } = await carregarBaseConhecimentoEConfiguracoes(supabaseClient);

  let geminiKey = (
    geminiKeyConfig ||
    geminiKeyPrevia ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();

  let groqKey = (
    groqKeyConfig ||
    groqKeyPrevia ||
    process.env.GROQ_API_KEY ||
    ''
  ).trim();

  // Instrução de apresentação e continuidade no diálogo
  const instrucaoApresentacao = jaTeveInteracaoRecente
    ? `REGRA DE CONTINUIDADE (CRÍTICA): Você JÁ ESTÁ conversando com este cliente. NUNCA repita "Olá, sou a Antonella" ou saudações de abertura. Responda diretamente e objetivamente à pergunta.`
    : `Apresente-se com gentileza nesta primeira mensagem (ex.: "Olá, ${nomeCliente}! Sou a Antonella do CRVA. 😊").`;

  // Instrução de horário de expediente com concisão (SEM PARÁGRAFOS GIGANTES REPETITIVOS)
  let instrucaoExpediente = '';
  if (!statusExpediente.aberto) {
    instrucaoExpediente = `SITUAÇÃO DO CRVA: Atendimento presencial fechado (${statusExpediente.motivoFechado}), retornando ${statusExpediente.proximaAbertura}. Responda normalmente à dúvida com precisão e concisão. NÃO adicione blocos repetitivos sobre horário se a pergunta for apenas sobre valores ou documentos.`;
  } else {
    instrucaoExpediente = `SITUAÇÃO DO CRVA: Aberto em horário de expediente normal. Responda diretamente com cortesia e concisão.`;
  }

  // Composição unificada do System Prompt + Base de Conhecimento Oficial + Regras de Diálogo + Grounding Estrito
  const promptFinal = `${DIRETRIZ_GROUNDING_ESTRITO}\n\n${systemPromptBase}\n\n${blocoBaseConhecimento}\n\n${instrucaoApresentacao}\n\n${instrucaoExpediente}\n\n${DIRETRIZ_GROUNDING_ESTRITO}`.trim();

  // Executores modulares para Gemini e Groq
  const executarGemini = async (): Promise<string | null> => {
    if (!geminiKey) return null;

    // Modelos oficiais ativos da API REST v1beta: gemini-2.5-flash (primário), gemini-2.0-flash (secundário)
    const modelosParaTestar = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-flash-latest',
      'gemini-3-flash-preview',
      'gemini-1.5-flash',
    ];

    // Se chave for preview (AQ.), inclui gemini-3.8-flash como contingência ao final
    if (geminiKey.startsWith('AQ.')) {
      modelosParaTestar.push('gemini-3.8-flash');
    }

    for (const model of modelosParaTestar) {
      try {
        const contents: any[] = [];
        for (const h of historicoPrevio.slice(-8)) {
          contents.push({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
          });
        }
        contents.push({ role: 'user', parts: [{ text: mensagemCliente }] });

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: promptFinal }] },
            generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data = await res.json();
          const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (txt) {
            return txt
              .replace(/observa[çc][ãa]o de contexto\s*:\s*/gi, '')
              .replace(/observa[çc][ãa]o\s*:\s*/gi, '')
              .trim();
          }
        } else {
          const errText = await res.text().catch(() => '');
          console.error('[IA] falha no modelo Gemini', model, { status: res.status, body: errText });

          // Se a chave for inválida ou não autorizada (401/403), ou se chave AQ. der erro crítico, aciona Groq de imediato
          if (res.status === 401 || res.status === 403 || (geminiKey.startsWith('AQ.') && res.status === 404 && model === 'gemini-3.8-flash')) {
            console.warn(`[IA] Chave Gemini com erro ${res.status}. Acionando fallback Groq imediatamente.`);
            break;
          }
        }
      } catch (err) {
        console.error('[IA] falha no modelo Gemini', model, err);
      }
    }
    return null;
  };

  const executarGroq = async (): Promise<string | null> => {
    if (!groqKey) return null;
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const messages: any[] = [{ role: 'system', content: promptFinal }];
    for (const h of historicoPrevio.slice(-8)) {
      messages.push({ role: h.role, content: h.content });
    }
    messages.push({ role: 'user', content: mensagemCliente });

    // Modelos oficiais ativos da Groq Cloud: llama-3.3-70b-versatile (primário), llama-3.1-8b-instant (secundário)
    for (const modelo of GROQ_CHAT_MODELS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: modelo,
            messages,
            temperature: 0.1,
            max_tokens: 600,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data = await res.json();
          const txt = data?.choices?.[0]?.message?.content?.trim();
          if (txt) {
            return txt
              .replace(/observa[çc][ãa]o de contexto\s*:\s*/gi, '')
              .replace(/observa[çc][ãa]o\s*:\s*/gi, '')
              .trim();
          }
        } else {
          const errText = await res.text().catch(() => '');
          console.error('[IA] falha no modelo Groq', modelo, { status: res.status, body: errText });
        }
      } catch (err) {
        console.error('[IA] falha no modelo Groq', modelo, err);
      }
    }
    return null;
  };

  // Orquestração de Provedor Principal e Fallback
  let respostaFinal: string | null = null;
  if (provedorAtivo === 'groq') {
    respostaFinal = await executarGroq();
    if (!respostaFinal && fallbackHabilitado) {
      respostaFinal = await executarGemini();
    }
  } else {
    respostaFinal = await executarGemini();
    if (!respostaFinal && fallbackHabilitado) {
      respostaFinal = await executarGroq();
    }
  }

  if (respostaFinal) {
    return respostaFinal;
  }

  // Contingência se ambos falharem: registra erro e retorna mensagem curta de transbordo humano
  console.error('[IA FATAL] Gemini e Groq falharam para responder a dúvida do cliente:', {
    cliente: nomeCliente,
    temGeminiKey: Boolean(geminiKey),
    temGroqKey: Boolean(groqKey),
    provedorAtivo,
  });

  return gerarMensagemFallbackContingencia(nomeCliente);
}

/**
 * Dispara mensagem de texto para o WhatsApp do cliente via Evolution API v2
 */
async function enviarTextoWhatsAppEvolution(params: {
  telefone: string;
  mensagem: string;
  evolutionUrl: string;
  evolutionKey: string;
  evolutionInstance: string;
}): Promise<boolean> {
  const { telefone, mensagem, evolutionUrl, evolutionKey, evolutionInstance } = params;
  const endpoint = `${evolutionUrl}/message/sendText/${encodeURIComponent(evolutionInstance)}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({
        number: telefone,
        text: mensagem,
        delay: 1200,
        presence: 'composing',
        linkPreview: false,
      }),
    });

    if (res.ok) {
      console.log(`[WHATSAPP WEBHOOK] 📤 Resposta enviada ao cliente (${telefone}) via Evolution API.`);
      return true;
    }

    const errorBody = await res.text().catch(() => '');
    console.warn(`[WHATSAPP WEBHOOK] ⚠️ Falha ao disparar resposta no WhatsApp HTTP ${res.status}:`, errorBody);
    return false;
  } catch (err: any) {
    console.error('[WHATSAPP WEBHOOK] ❌ Erro de conexão com o Gateway Evolution:', err?.message || err);
    return false;
  }
}

/**
 * Handler central do Webhook do WhatsApp (compatível com Express e Vercel Serverless)
 */
export async function handleWhatsAppWebhook(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      const expedienteStatus = verificarHorarioExpediente();
      return res.status(200).json({
        status: 'online',
        servico: 'CRM-Integra WhatsApp Webhook',
        multimodal: { audio: true, texto: true, memoriaConversa: true },
        timestamp: new Date().toISOString(),
        instancia: process.env.VITE_EVOLUTION_INSTANCE || 'crva-principal',
        expediente: expedienteStatus,
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ erro: 'Método não permitido. Utilize POST.' });
    }

    const body = req.body || {};
    console.log('[WEBHOOK IN]', JSON.stringify(body).slice(0, 500));

    // Aceitação case-insensitive do evento (messages.upsert, messages_upsert, etc.)
    const event = (body?.event || body?.data?.event || '').toLowerCase();
    const isUpsert = event.includes('upsert') || event === 'messages.upsert' || event === 'messages_upsert';
    const hasDirectKey = Boolean(body?.data?.key || body?.key || (Array.isArray(body?.data) && body?.data[0]?.key));

    // Se for outro evento de sistema (ex: connection.update, qrcode.updated, chats.update, messages.update), ignora com 200
    if (event && !isUpsert && !hasDirectKey) {
      console.log(`[WHATSAPP WEBHOOK] ℹ️ Evento '${event}' recebido e ignorado (não é nova mensagem).`);
      return res.status(200).json({ status: 'ignored_non_message_event', event });
    }

    const parsed = extrairMensagemUniversal(body);

    if (!parsed) {
      return res.status(200).json({ status: 'ignored_unrecognized' });
    }

    // FILTRO OBRIGATÓRIO 1: Grupos de WhatsApp (@g.us) e Status Broadcast
    if (
      !parsed.remoteJid ||
      parsed.isGroup ||
      parsed.remoteJid.endsWith('@g.us') ||
      parsed.remoteJid === 'status@broadcast' ||
      parsed.remoteJid.includes('broadcast')
    ) {
      console.log(`[WHATSAPP WEBHOOK] 🚫 GRUPO OU BROADCAST IGNORADO (${parsed.remoteJid}).`);
      return res.status(200).json({ status: 'ignored_group_or_broadcast' });
    }

    // FILTRO OBRIGATÓRIO 2: Mensagens próprias (fromMe)
    if (parsed.fromMe === true) {
      return res.status(200).json({ status: 'ignored_from_me' });
    }

    // REQUISITO 3: TRAVA DE IDEMPOTÊNCIA PELO wa_message_id (EVITA RESPOSTAS DUPLICADAS)
    const waMessageId = String(
      parsed.messageId ||
      body?.data?.key?.id ||
      body?.key?.id ||
      ''
    ).trim();

    if (waMessageId) {
      // 1. Verificação rápida em memória com TTL de 10 minutos (bloqueia concorrência no mesmo segundo)
      limparIdsExpirados();
      if (processedWaMessageIds.has(waMessageId)) {
        console.log(`[WHATSAPP WEBHOOK] ⚡ Idempotência em memória ativada: mensagem "${waMessageId}" já processada/em andamento. Ignorando.`);
        return res.status(200).json({ status: 'already_processed', messageId: waMessageId });
      }

      // 2. Verificação persistente no Supabase (crm_mensagens)
      const supabaseServer = getSupabaseServerClient();
      if (supabaseServer) {
        try {
          const { data: jaExisteWa, error: errWa } = await supabaseServer
            .from('crm_mensagens')
            .select('id')
            .eq('wa_message_id', waMessageId)
            .limit(1);

          if (!errWa && jaExisteWa && jaExisteWa.length > 0) {
            console.log(`[WHATSAPP WEBHOOK] ⚡ Idempotência no banco ativada (wa_message_id): mensagem "${waMessageId}" já existe. Ignorando.`);
            processedWaMessageIds.set(waMessageId, Date.now());
            return res.status(200).json({ status: 'already_processed', messageId: waMessageId });
          }

          const { data: jaExisteMedia } = await supabaseServer
            .from('crm_mensagens')
            .select('id')
            .eq('media_url', `wa_id:${waMessageId}`)
            .limit(1);

          if (jaExisteMedia && jaExisteMedia.length > 0) {
            console.log(`[WHATSAPP WEBHOOK] ⚡ Idempotência no banco ativada (media_url): mensagem "${waMessageId}" já existe. Ignorando.`);
            processedWaMessageIds.set(waMessageId, Date.now());
            return res.status(200).json({ status: 'already_processed', messageId: waMessageId });
          }
        } catch (errIdemp) {
          console.warn('[WHATSAPP WEBHOOK] Aviso ao checar idempotência:', errIdemp);
        }
      }

      processedWaMessageIds.set(waMessageId, Date.now());
    }

  const evolutionUrl = (
    process.env.VITE_EVOLUTION_API_URL ||
    process.env.EVOLUTION_API_URL ||
    'https://evolution-api-production-9bdd.up.railway.app'
  ).replace(/\/$/, '');

  const evolutionKey = (
    process.env.VITE_EVOLUTION_API_KEY ||
    process.env.EVOLUTION_API_KEY ||
    'IntegraCRVA_SecretKey_2026_xYz'
  ).trim();

  const evolutionInstance = (
    process.env.VITE_EVOLUTION_INSTANCE ||
    process.env.EVOLUTION_INSTANCE ||
    'crva-principal'
  ).trim();

  const supabase = getSupabaseServerClient();

  // Carrega Base de Conhecimento, System Prompt e Credenciais da IA antes de processar qualquer mídia
  const configIaCarregada = await carregarBaseConhecimentoEConfiguracoes(supabase);

  let geminiKey =
    configIaCarregada.geminiKeyConfig ||
    (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '').trim();

  let groqKey =
    configIaCarregada.groqKeyConfig ||
    (process.env.GROQ_API_KEY || '').trim();

  // PROCESSAMENTO INICIAL E PERSISTÊNCIA IMEDIATA NO KANBAN
  const mensagemEraAudio = Boolean(parsed.isAudio);
  let textoParaProcessamento = parsed.text || '';
  let textoParaExibicaoKanban = mensagemEraAudio ? '🎤 [Áudio recebido...]' : parsed.text;

  // FILTRO OBRIGATÓRIO 3: Eventos sem conteúdo de texto nem áudio reconhecido
  if (!mensagemEraAudio && (!textoParaExibicaoKanban || !textoParaExibicaoKanban.trim())) {
    return res.status(200).json({ status: 'ignored_no_content' });
  }

  console.log(`[WHATSAPP WEBHOOK] ✅ Mensagem válida de "${parsed.pushName}" (${parsed.telefoneLimpo}) [Áudio: ${mensagemEraAudio}]: "${textoParaExibicaoKanban.substring(0, 80)}"`);

  const agoraIso = new Date().toISOString();
  const statusExpediente = verificarHorarioExpediente();

  let atendimentoId = '';
  let ehNovoAtendimento = false;
  let cardExistente: any = null;
  const mensagemClienteId = crypto.randomUUID();

  // REQUISITO 1: PERSISTÊNCIA IMEDIATA NO KANBAN ANTES DA TRANSCRIÇÃO (SEM PERDA SILENCIOSA)
  if (supabase) {
    try {
      const ddi = parsed.telefoneLimpo.startsWith('55') ? parsed.telefoneLimpo : `55${parsed.telefoneLimpo}`;
      const semDdi = parsed.telefoneLimpo.startsWith('55') ? parsed.telefoneLimpo.substring(2) : parsed.telefoneLimpo;

      // Busca atendimento existente pelo telefone
      const { data: atendimentosExistentes, error: errBusca } = await supabase
        .from('crm_atendimentos')
        .select('*')
        .or(`telefone.eq.${parsed.telefoneLimpo},telefone.eq.${semDdi},telefone.eq.${ddi}`)
        .order('ultima_interacao_em', { ascending: false })
        .limit(1);

      if (!errBusca && atendimentosExistentes && atendimentosExistentes.length > 0) {
        cardExistente = atendimentosExistentes[0];
      }

      if (cardExistente) {
        atendimentoId = cardExistente.id;

        const dadosAtualizacao: any = {
          id: cardExistente.id,
          telefone: parsed.telefoneLimpo,
          nome_cliente: parsed.pushName || parsed.telefoneLimpo,
          ultima_mensagem: textoParaExibicaoKanban,
          ultima_interacao_em: agoraIso,
          categoria: 'particular',
        };

        const { error: upsertErr } = await supabase
          .from('crm_atendimentos')
          .upsert(dadosAtualizacao, { onConflict: 'telefone' });

        if (upsertErr) {
          console.error('[SUPABASE UPSERT ERROR crm_atendimentos update inicial]', upsertErr);
        } else {
          console.log(`[WHATSAPP WEBHOOK] 📋 Kanban: Card atualizado de imediato (${cardExistente.id})`);
        }
      } else {
        // Novo atendimento com ID UUID válido
        ehNovoAtendimento = true;
        atendimentoId = crypto.randomUUID();

        const novoCard: any = {
          id: atendimentoId,
          telefone: parsed.telefoneLimpo,
          nome_cliente: parsed.pushName || parsed.telefoneLimpo,
          status_coluna: 'triagem_ia',
          ultima_mensagem: textoParaExibicaoKanban,
          ultima_interacao_em: agoraIso,
          atendido_por_ia: true,
          urgente: false,
          categoria: 'particular',
        };

        const { error: insertErr } = await supabase
          .from('crm_atendimentos')
          .upsert(novoCard, { onConflict: 'telefone' });

        if (insertErr) {
          console.error('[SUPABASE UPSERT ERROR crm_atendimentos insert inicial]', insertErr);
        } else {
          console.log(`[WHATSAPP WEBHOOK] 📋 Kanban: Novo Card criado de imediato (${atendimentoId})`);
        }
      }

      // Gravação imediata da mensagem recebida do cliente na tabela crm_mensagens com wa_message_id para idempotência
      const dadosMsgCliente: any = {
        id: mensagemClienteId,
        atendimento_id: atendimentoId,
        telefone: parsed.telefoneLimpo,
        remetente: 'cliente',
        tipo_conteudo: mensagemEraAudio ? 'audio' : 'texto',
        conteudo: textoParaExibicaoKanban,
        enviado_por_ia: false,
        created_at: agoraIso,
        media_url: waMessageId ? `wa_id:${waMessageId}` : null,
      };

      let { error: msgClienteErr } = await supabase.from('crm_mensagens').insert({
        ...dadosMsgCliente,
        wa_message_id: waMessageId || null,
      });

      if (msgClienteErr && (msgClienteErr.code === '42703' || msgClienteErr.message?.includes('wa_message_id'))) {
        const { error: msgRetryErr } = await supabase.from('crm_mensagens').insert(dadosMsgCliente);
        if (msgRetryErr) {
          console.error('[SUPABASE INSERT ERROR crm_mensagens cliente inicial fallback]', msgRetryErr);
        }
      } else if (msgClienteErr) {
        console.error('[SUPABASE INSERT ERROR crm_mensagens cliente inicial]', msgClienteErr);
      }
    } catch (errSupabaseInicial) {
      console.error('[SUPABASE ERROR inicial]', errSupabaseInicial);
    }
  }

  // REQUISITO 2 e 3: EXTRAÇÃO E TRANSCRIÇÃO DE ÁUDIO COM GROQ WHISPER + FALLBACK GEMINI
  if (mensagemEraAudio) {
    console.log(`[WHATSAPP WEBHOOK] 🎤 Mensagem de áudio detectada de "${parsed.pushName}" (${parsed.telefoneLimpo}). Extraindo mídia...`);

    const audioExtraido = await extrairAudioBase64({
      parsed,
      bodyPayload: req.body,
      evolutionUrl,
      evolutionKey,
      evolutionInstance,
    });

    let transcricaoSucesso = false;

    if (audioExtraido && audioExtraido.base64) {
      const transcricao = await transcreverAudioCliente({
        base64: audioExtraido.base64,
        mimetype: audioExtraido.mimetype,
        geminiKey,
        groqKey,
      });

      if (transcricao && transcricao.trim().length > 0) {
        transcricaoSucesso = true;
        textoParaProcessamento = transcricao.trim();
        textoParaExibicaoKanban = `🎤 [Áudio transcrito]: "${transcricao.trim()}"`;
        console.log(`[WHATSAPP WEBHOOK] 🎤 Áudio transcrito com sucesso: "${transcricao}"`);

        // Atualiza imediatamente o card e a mensagem no Kanban
        if (supabase && atendimentoId) {
          await supabase
            .from('crm_atendimentos')
            .update({
              ultima_mensagem: textoParaExibicaoKanban,
              ultima_interacao_em: new Date().toISOString(),
            })
            .eq('id', atendimentoId);

          await supabase
            .from('crm_mensagens')
            .update({
              conteudo: textoParaExibicaoKanban,
            })
            .eq('id', mensagemClienteId);
        }
      }
    }

    // Se o áudio não pôde ser baixado ou transcrito, nunca deixe o cliente sem resposta
    if (!transcricaoSucesso) {
      console.warn(`[WHATSAPP WEBHOOK] ⚠️ Áudio inaudível de ${parsed.telefoneLimpo}. Disparando resposta cordial ao cliente.`);
      textoParaExibicaoKanban = '🎤 [Áudio recebido - não foi possível reproduzir]';

      if (supabase && atendimentoId) {
        await supabase
          .from('crm_atendimentos')
          .update({
            ultima_mensagem: textoParaExibicaoKanban,
            ultima_interacao_em: new Date().toISOString(),
          })
          .eq('id', atendimentoId);

        await supabase
          .from('crm_mensagens')
          .update({
            conteudo: textoParaExibicaoKanban,
          })
          .eq('id', mensagemClienteId);
      }

      const msgFalhaAudio = `Olá, ${parsed.pushName}! Recebemos a sua mensagem de áudio, mas infelizmente não conseguimos reproduzi-la com nitidez no momento. 🎧\n\nPoderia, por gentileza, digitar sua dúvida por aqui ou nos enviar a placa do veículo em texto? Nossa equipe ou a Antonella já te respondem em seguida!`;

      await enviarTextoWhatsAppEvolution({
        telefone: parsed.telefoneLimpo,
        mensagem: msgFalhaAudio,
        evolutionUrl,
        evolutionKey,
        evolutionInstance,
      });

      if (supabase && atendimentoId) {
        const agoraRespFalha = new Date().toISOString();
        await supabase
          .from('crm_atendimentos')
          .update({
            ultima_mensagem: msgFalhaAudio,
            ultima_interacao_em: agoraRespFalha,
          })
          .eq('id', atendimentoId);

        await supabase.from('crm_mensagens').insert({
          id: crypto.randomUUID(),
          atendimento_id: atendimentoId,
          telefone: parsed.telefoneLimpo,
          remetente: 'ia',
          tipo_conteudo: 'texto',
          conteudo: msgFalhaAudio,
          enviado_por_ia: true,
          created_at: agoraRespFalha,
        });
      }

      return res.status(200).json({
        sucesso: true,
        atendimentoId,
        motivo: 'audio_inaudivel_respondido_com_sucesso',
      });
    }
  }

  // Extrai placa do texto (Mercosul ou Antiga)
  const regexPlaca = /\b([a-zA-Z]{3}-?\d[a-zA-Z0-9]\d{2})\b/i;
  const placaMatch = (textoParaProcessamento || '').match(regexPlaca);
  const placa = placaMatch ? placaMatch[1].replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : null;

  // Extrai Renavam (9 a 11 dígitos)
  const regexRenavam = /\b(renavam\D{0,6})?(\d{9,11})\b/i;
  const renavamMatch = (textoParaProcessamento || '').match(regexRenavam);
  const renavam = renavamMatch ? (renavamMatch[2] || renavamMatch[0]).replace(/\D/g, '') : null;

  // Verifica se exige ação humana real (incluindo fornecimento de placa/renavam para consulta)
  const acaoHumana = exigeAcaoHumanaReal(textoParaProcessamento, placa, renavam);

  let statusDestino = 'triagem_ia';
  let urgente = false;

  // Transbordo automático para fila_humana ao informar Placa ou Renavam para consulta
  if (acaoHumana.exige) {
    statusDestino = 'fila_humana';
    urgente = true;
  }

  // Atualiza status do card no Supabase com base na placa / ação humana
  if (supabase && atendimentoId) {
    try {
      let statusFinal = cardExistente?.status_coluna || 'triagem_ia';
      if (acaoHumana.exige) {
        statusFinal = 'fila_humana';
      } else if (statusFinal === 'concluido') {
        statusFinal = 'triagem_ia';
      }

      const updateCard: any = {
        status_coluna: statusFinal,
        atendido_por_ia: !acaoHumana.exige,
        urgente: acaoHumana.exige || Boolean(cardExistente?.urgente),
      };

      if (placa) updateCard.placa = placa;
      else if (cardExistente?.placa) updateCard.placa = cardExistente.placa;

      if (renavam) updateCard.renavam = renavam;
      else if (cardExistente?.renavam) updateCard.renavam = cardExistente.renavam;

      await supabase.from('crm_atendimentos').update(updateCard).eq('id', atendimentoId);
    } catch (errSyncCard) {
      console.warn('[WHATSAPP WEBHOOK] Erro ao sincronizar status/placa do card:', errSyncCard);
    }
  }

  // 2. RECUPERAÇÃO DO HISTÓRICO REAL (MEMÓRIA DE CONVERSA - ÚLTIMAS 8 MENSAGENS)
  let historicoPrevioFormatado: { role: 'user' | 'assistant'; content: string }[] = [];
  let jaTeveInteracaoIaRecente = false;

  if (supabase && atendimentoId) {
    try {
      const { data: mensagensDb, error: errHist } = await supabase
        .from('crm_mensagens')
        .select('remetente, conteudo, created_at')
        .eq('atendimento_id', atendimentoId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!errHist && Array.isArray(mensagensDb) && mensagensDb.length > 0) {
        const cronologicas = [...mensagensDb].reverse();

        // Verifica se houve resposta da IA nas últimas 12 horas
        const limite12h = Date.now() - 12 * 60 * 60 * 1000;
        jaTeveInteracaoIaRecente = mensagensDb.some((m) => {
          if (m.remetente !== 'ia') return false;
          const t = m.created_at ? new Date(m.created_at).getTime() : 0;
          return t >= limite12h;
        });

        // Remove a mensagem atual do cliente que acabou de ser inserida para compor o histórico prévio
        const historicoSemAtual = cronologicas.slice(0, -1).slice(-8);

        historicoPrevioFormatado = historicoSemAtual.map((m) => ({
          role: (m.remetente === 'cliente' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.conteudo || '',
        }));

        console.log(`[WHATSAPP WEBHOOK] 🧠 Memória: ${historicoPrevioFormatado.length} mensagens prévias carregadas. Ja conversou nas 12h: ${jaTeveInteracaoIaRecente}`);
      }
    } catch (errHistCatch) {
      console.warn('[WHATSAPP WEBHOOK] Falha ao recuperar histórico de conversa:', errHistCatch);
    }
  }

  // 3. GERAÇÃO DA RESPOSTA DA ANTONELLA (COM MEMÓRIA E LINGUAGEM NATURAL)
  console.log(`[WHATSAPP WEBHOOK] 🧠 Antonella processando resposta para ${parsed.pushName} (Expediente: ${statusExpediente.aberto ? 'ABERTO' : 'FECHADO'})...`);

  let respostaIa = '';

  if (acaoHumana.exige) {
    // Caso de transbordo humano (com placa/renavam ou pedido explícito)
    const saudacao = jaTeveInteracaoIaRecente ? `Perfeito, ${parsed.pushName}!` : `Olá, ${parsed.pushName}! Sou a Antonella do CRVA.`;

    if (placa) {
      if (!statusExpediente.aberto) {
        respostaIa = `${saudacao} Registrei a placa *${placa}* para consulta. Nosso atendimento presencial retorna ${statusExpediente.proximaAbertura}, e nossa equipe responderá você aqui assim que verificar no Detran/RS!`;
      } else {
        respostaIa = `${saudacao} Registrei a placa *${placa}* para nossa equipe consultar no sistema do Detran/RS. Em instantes um de nossos operadores dará retorno por aqui!`;
      }
    } else {
      const motivo = acaoHumana.motivo || 'sua solicitação';
      if (!statusExpediente.aberto) {
        respostaIa = `${saudacao} Direcionei seu atendimento sobre ${motivo} para nossa equipe humana. Retornaremos assim que o expediente reiniciar (${statusExpediente.proximaAbertura})!`;
      } else {
        respostaIa = `${saudacao} Direcionei seu atendimento sobre ${motivo} para um de nossos operadores. Por favor, aguarde um momento que já vamos te responder!`;
      }
    }
  } else {
    // Dúvidas de valores, taxas, documentos ou procedimentos veiculares
    respostaIa = await gerarRespostaAntonella({
      mensagemCliente: textoParaProcessamento,
      nomeCliente: parsed.pushName,
      historicoPrevio: historicoPrevioFormatado,
      jaTeveInteracaoRecente: jaTeveInteracaoIaRecente,
      supabaseClient: supabase,
      statusExpediente,
      geminiKeyPrevia: geminiKey,
      groqKeyPrevia: groqKey,
    });
  }

  // 4. DISPARO DA RESPOSTA EM TEXTO NO WHATSAPP VIA EVOLUTION API V2
  console.log(`[WHATSAPP WEBHOOK] 🚀 Disparando resposta para o WhatsApp do cliente (${parsed.telefoneLimpo})...`);
  const enviadoComSucesso = await enviarTextoWhatsAppEvolution({
    telefone: parsed.telefoneLimpo,
    mensagem: respostaIa,
    evolutionUrl,
    evolutionKey,
    evolutionInstance,
  });

  // 5. ATUALIZAÇÃO DO CARD E HISTÓRICO NO SUPABASE
  if (supabase && atendimentoId) {
    try {
      const agoraResposta = new Date().toISOString();

      await supabase
        .from('crm_atendimentos')
        .update({
          ultima_mensagem: respostaIa,
          ultima_interacao_em: agoraResposta,
        })
        .eq('id', atendimentoId);

      const dadosMsgIa = {
        id: crypto.randomUUID(),
        atendimento_id: atendimentoId,
        telefone: parsed.telefoneLimpo,
        remetente: 'ia',
        tipo_conteudo: 'texto',
        conteudo: respostaIa,
        enviado_por_ia: true,
        created_at: agoraResposta,
      };

      const { error: msgIaErr } = await supabase.from('crm_mensagens').insert(dadosMsgIa);
      if (msgIaErr) {
        console.error('[SUPABASE INSERT ERROR crm_mensagens ia]', msgIaErr);
      }

      console.log(`[WHATSAPP WEBHOOK] ✨ Atendimento gravado e sincronizado com sucesso no Supabase.`);
    } catch (errAtualiza) {
      console.error('[SUPABASE ERROR pós-resposta]', errAtualiza);
    }
  }

  return res.status(200).json({
    sucesso: true,
    atendimentoId,
    novoAtendimento: ehNovoAtendimento,
    respostaEnviada: enviadoComSucesso,
    statusDestino: acaoHumana.exige ? 'fila_humana' : 'triagem_ia',
    placaIdentificada: placa || null,
    expedienteAberto: statusExpediente.aberto,
  });
  } catch (error: any) {
    console.error('[WEBHOOK FATAL]', error);
    return res.status(200).json({
      status: 'error_caught',
      erro: error?.message || 'Erro inesperado no processamento do webhook',
    });
  }
}

export default async function handler(req: any, res: any) {
  return handleWhatsAppWebhook(req, res);
}
