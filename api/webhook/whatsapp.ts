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

// Modelos fechados de chat para fallback rápido na Groq Cloud
const GROQ_CHAT_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-70b-8192',
  'llama3-8b-8192',
] as const;

// Diretriz obrigatória de grounding estrito (anti-alucinação de valores)
export const DIRETRIZ_GROUNDING_ESTRITO = `REGRA INVIOLÁVEL DE VALORES E PROCEDIMENTOS: Responda EXCLUSIVAMENTE com base no System Prompt e na Base de Conhecimento Oficial fornecidos abaixo. Nunca utilize valores de taxas, emolumentos ou regras da internet/memória prévia. Se um valor específico não constar expressamente na Base de Conhecimento abaixo, informe que o valor exato será confirmado pela equipe do CRVA na emissão da guia GAD-e.`;

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
 * com fallback para Google Gemini Multimodal (gemini-3.8-flash, etc.).
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
    const modelosGemini = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

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
 * Resposta inteligente da Antonella com domínio técnico completo do Detran/RS.
 * Considera se já houve mensagens anteriores da IA para não repetir apresentações formais
 * e remove qualquer menção a termos técnicos ("Observação de contexto").
 */
function responderDuvidaDetranHeuristica(params: {
  mensagem: string;
  nomeCliente: string;
  statusExpediente: StatusExpediente;
  jaTeveInteracaoRecente: boolean;
  historicoPrevio?: { role: 'user' | 'assistant'; content: string }[];
}): string {
  const { mensagem, nomeCliente, statusExpediente, jaTeveInteracaoRecente, historicoPrevio = [] } = params;

  // Analisa o texto atual somado ao contexto das últimas mensagens do histórico
  const contextoAcumulado = historicoPrevio.map((h) => h.content).join(' ');
  const t = `${contextoAcumulado} ${mensagem}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tAtual = (mensagem || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  let respostaPrincipal = '';

  // 1. Dúvida específica de documentos necessários
  if (
    tAtual.includes('documentos') ||
    tAtual.includes('documento') ||
    tAtual.includes('o que levar') ||
    tAtual.includes('que precisa levar') ||
    tAtual.includes('o que precisa')
  ) {
    if (t.includes('vistoria')) {
      respostaPrincipal =
        'Para realizar a *Vistoria de Identificação Veicular* no CRVA, você precisa apresentar:\n\n' +
        '1. Documento do veículo (CRLV-e impresso ou digital, ou o CRV verde anterior a 2021);\n' +
        '2. Documento oficial com foto de quem estiver conduzindo o veículo à pista (RG ou CNH);\n' +
        '3. Guia de vistoria quitada (pode ser gerada e recolhida aqui no balcão do CRVA).\n\n' +
        '📌 *Importante sobre a pista de vistoria:* a entrada encerra-se às 11:30 pela manhã e às 16:30 à tarde.';
    } else if (t.includes('primeiro emplacamento') || t.includes('zero km')) {
      respostaPrincipal =
        'Para o *Primeiro Emplacamento* (veículo 0km), os documentos exigidos são:\n\n' +
        '1. DANFe original (Nota Fiscal eletrônica emitida pela concessionária ou montadora);\n' +
        '2. Documento oficial de identificação com foto do adquirente (RG ou CNH);\n' +
        '3. Comprovante de endereço recente (emitido nos últimos 90 dias).';
    } else {
      // Padrão Transferência de Propriedade
      respostaPrincipal =
        'Para a *Transferência de Propriedade* do veículo, você precisará apresentar:\n\n' +
        '1. ATPV-e preenchido e assinado (com firma reconhecida por autenticidade de vendedor e comprador, ou assinado digitalmente pelo aplicativo Carteira Digital de Trânsito / Gov.br prata ou ouro);\n' +
        '   • Caso o veículo possua documento emitido até 2020: o CRV original em papel-moeda ("documento verde") preenchido e com reconhecimento de firma por autenticidade;\n' +
        '2. Documento de identificação com foto do comprador (RG ou CNH);\n' +
        '3. Comprovante de endereço recente do comprador (últimos 90 dias);\n' +
        '4. Vistoria veicular realizada e aprovada no CRVA (validade de 30 dias corridos).';
    }
  } else if (
    tAtual.includes('transfer') ||
    tAtual.includes('compra e venda') ||
    tAtual.includes('comprar') ||
    tAtual.includes('vender') ||
    tAtual.includes('passar pro meu nome') ||
    tAtual.includes('quanto custa') ||
    tAtual.includes('quanto e') ||
    tAtual.includes('valor da transfer')
  ) {
    respostaPrincipal =
      'Para a *Transferência de Propriedade* de veículo no RS, o processo envolve a emissão da guia GAD-E (taxa de alteração de registro) e a realização da vistoria de identificação veicular no CRVA.\n\n' +
      '📌 *Observação sobre valores:* Os valores exatos das taxas variam conforme a categoria do veículo e os serviços exigidos, sendo calculados estritamente na emissão da guia oficial GAD-E no sistema do Detran/RS. Se desejar, envie a *Placa e o Renavam* do veículo que nossa equipe verifica para você!\n\n' +
      '📄 *Documentos necessários:*\n' +
      '1. ATPV-e preenchido e assinado (com firma reconhecida por autenticidade ou via aplicativo CDT/Gov.br digital);\n' +
      '2. Documento oficial com foto do comprador (RG ou CNH);\n' +
      '3. Comprovante de residência atualizado do comprador (últimos 90 dias);\n' +
      '4. Vistoria veicular realizada e aprovada no CRVA (validade de 30 dias corridos).';
  } else if (tAtual.includes('vistoria') || tAtual.includes('pista')) {
    respostaPrincipal =
      'A *Vistoria de Identificação Veicular* no CRVA é realizada na pista com emissão de laudo técnico oficial do Detran/RS.\n\n' +
      '📌 *Valores e Guia:* O valor exato da vistoria varia por categoria do veículo e será confirmado na emissão da guia oficial GAD-e aqui no CRVA.\n\n' +
      '⏰ *Horários da Pista de Vistoria:*\n' +
      '- Manhã: entrada e abertura de novas vistorias encerram às 11:30.\n' +
      '- Tarde: entrada e abertura de novas vistorias encerram às 16:30.\n' +
      'O laudo de vistoria tem validade legal de 30 dias corridos em todo o Estado do RS.';
  } else if (tAtual.includes('primeiro emplacamento') || tAtual.includes('zero km') || tAtual.includes('0km')) {
    respostaPrincipal =
      'Para o *Primeiro Emplacamento* de veículo zero km, o processo requer a emissão da taxa do Detran/RS (e vistoria/placas conforme a modalidade da nota fiscal).\n\n' +
      '📌 *Valores:* O valor exato da guia será confirmado pela equipe do CRVA na emissão da guia GAD-e.\n\n' +
      '📄 *Documentos exigidos:*\n' +
      '- DANFe (Nota fiscal eletrônica original emitida pela concessionária/fabricante);\n' +
      '- Documento oficial com foto (RG/CNH) do adquirente;\n' +
      '- Comprovante de residência atualizado (últimos 90 dias).';
  } else if (tAtual.includes('crlv') || tAtual.includes('licenciamento') || tAtual.includes('ipva') || tAtual.includes('debito')) {
    respostaPrincipal =
      'O documento veicular vigente é 100% digital: o *CRLV-e*, disponibilizado no aplicativo Carteira Digital de Trânsito logo após a compensação dos débitos.\n\n' +
      'Para consultar débitos ou emitir a guia GAD-E de licenciamento, você pode nos informar a *Placa e o Renavam* do veículo que nossa equipe faz a verificação para você.';
  } else {
    respostaPrincipal =
      'No CRVA atendemos a todos os serviços cadastrais e documentais de veículos do Detran/RS:\n\n' +
      '• Transferência de Propriedade de Veículos\n' +
      '• Vistoria de Identificação Veicular\n' +
      '• Primeiro Emplacamento de Veículo 0km\n' +
      '• Emissão de CRLV-e Digital e ATPV-e\n' +
      '• Alteração de Características e Baixa de Veículos';
  }

  // Saudação: se já estava conversando nas últimas 12h, vai direto ao ponto sem se apresentar de novo
  let saudacao = `Olá, ${nomeCliente}! Sou a Antonella, atendente virtual aqui do CRVA. 😊\n\n`;
  if (jaTeveInteracaoRecente) {
    saudacao = `Perfeito, ${nomeCliente}! `;
  }

  // Fechamento natural sem usar o rótulo "Observação de contexto:"
  let fechamento = '';
  if (!statusExpediente.aberto) {
    fechamento =
      `\n\nLembrando que no momento nosso atendimento presencial e pista de vistoria estão fechados (${statusExpediente.motivoFechado}), retornando ${statusExpediente.proximaAbertura}.\n\n` +
      'Se você tiver a *Placa e o Renavam* do veículo, pode me enviar aqui que já deixo seu atendimento anotado na esteira para nossa equipe!';
  } else {
    fechamento =
      '\n\nNosso atendimento presencial está aberto (08:00 às 12:00 e 13:00 às 17:00, com corte de senhas e vistorias às 11:30 e 16:30). Posso ajudar você com mais alguma dúvida?';
  }

  return `${saudacao}${respostaPrincipal}${fechamento}`;
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

      // 1.1 Se não encontrou ai_config, tenta registro garantido em crm_atendimentos (__SYS_AI_CFG__)
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

      // 1.2 Tenta crm_configuracoes como fallback
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
  if (!textoKnowledgeBaseDireto && documentosBase.length === 0) {
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
  const conteudoFinalKb = textoKnowledgeBaseDireto || textoDocumentosAnexados;
  const blocoBaseConhecimento = `
# BASE DE CONHECIMENTO / TREINAMENTO OFICIAL CADASTRADO NO CRM (FONTE ÚNICA DE VERDADE):
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

  let geminiKey =
    geminiKeyPrevia ||
    geminiKeyConfig ||
    (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '').trim();

  let groqKey =
    groqKeyPrevia ||
    groqKeyConfig ||
    (process.env.GROQ_API_KEY || '').trim();

  // Instrução de apresentação e continuidade no diálogo
  const instrucaoApresentacao = jaTeveInteracaoRecente
    ? `REGRA DE CONTINUIDADE (IMPORTANTE):
Você JÁ ESTÁ CONVERSANDO com este cliente no chat (houve mensagens anteriores recentes).
NÃO SE APRESENTE NOVAMENTE ("Olá, sou a Antonella...") e NÃO repita saudações formais de abertura.
Vá DIRETAMENTE à resposta técnica da dúvida do cliente de forma educada, acolhedora e objetiva.`
    : `Apresente-se cordialmente como Antonella nesta primeira mensagem ao cidadão (ex.: "Olá, ${nomeCliente}! Sou a Antonella, atendente virtual do CRVA. Como posso ajudar com seu veículo hoje?").`;

  // Instrução de horário de expediente com linguagem estritamente natural (SEM RÓTULOS TÉCNICOS)
  let instrucaoExpediente = '';
  if (!statusExpediente.aberto) {
    instrucaoExpediente = `
SITUAÇÃO DO CRVA: FECHADO NO MOMENTO (${statusExpediente.motivoFechado}). Retorno presencial: ${statusExpediente.proximaAbertura}.
DIRETRIZES DE ESTILO:
1. Responda completa, precisa e educadamente à dúvida do cidadão sobre valores, taxas, documentos ou procedimentos veiculares.
2. NUNCA use termos de sistema ou rótulos artificiais como "Observação de contexto:" ou "Observação:".
3. Escreva com naturalidade amigável no final da resposta informando sobre o retorno do atendimento presencial (ex.: "Lembrando que no momento nosso atendimento presencial está fechado, retornando ${statusExpediente.proximaAbertura}.").
4. Convide o usuário a enviar Placa e Renavam caso deseje deixar a consulta ou preparação de processo adiantada para a equipe humana.
`;
  } else {
    instrucaoExpediente = `
SITUAÇÃO DO CRVA: ABERTO E EM ATIVIDADE (08:00 às 12:00 e 13:00 às 17:00, corte de senhas e vistorias às 11:30 e 16:30).
Responda diretamente com cortesia e clareza.
`;
  }

  // Composição unificada do System Prompt + Base de Conhecimento Oficial + Regras de Diálogo + Grounding Estrito
  const promptFinal = `${DIRETRIZ_GROUNDING_ESTRITO}\n\n${systemPromptBase}\n\n${blocoBaseConhecimento}\n\n${instrucaoApresentacao}\n\n${instrucaoExpediente}\n\n${DIRETRIZ_GROUNDING_ESTRITO}`.trim();

  // Executores modulares para Gemini e Groq
  const executarGemini = async (): Promise<string | null> => {
    if (!geminiKey) return null;
    for (const model of ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
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
            generationConfig: { temperature: 0.2, maxOutputTokens: 850 },
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
          console.error('[IA] falha no modelo', model, { status: res.status, body: errText });
        }
      } catch (err) {
        console.error('[IA] falha no modelo', model, err);
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
            temperature: 0.2,
            max_tokens: 850,
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
          console.error('[IA] falha no modelo', modelo, { status: res.status, body: errText });
        }
      } catch (err) {
        console.error('[IA] falha no modelo', modelo, err);
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

  // 3. Heurística Especialista em Detran/RS com contexto contínuo
  return responderDuvidaDetranHeuristica({
    mensagem: mensagemCliente,
    nomeCliente,
    statusExpediente,
    jaTeveInteracaoRecente,
    historicoPrevio,
  });
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
    (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '').trim() ||
    configIaCarregada.geminiKeyConfig ||
    'AIzaSyB8Z7F44LFaR1klShWb8VFGD0VK3lP5y9Y';

  let groqKey =
    (process.env.GROQ_API_KEY || '').trim() ||
    configIaCarregada.groqKeyConfig ||
    '';

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

      // Gravação imediata da mensagem recebida do cliente na tabela crm_mensagens
      const dadosMsgCliente = {
        id: mensagemClienteId,
        atendimento_id: atendimentoId,
        telefone: parsed.telefoneLimpo,
        remetente: 'cliente',
        tipo_conteudo: mensagemEraAudio ? 'audio' : 'texto',
        conteudo: textoParaExibicaoKanban,
        enviado_por_ia: false,
        created_at: agoraIso,
      };

      const { error: msgClienteErr } = await supabase.from('crm_mensagens').insert(dadosMsgCliente);
      if (msgClienteErr) {
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
    const saudacao = jaTeveInteracaoIaRecente ? `Perfeito, ${parsed.pushName}!` : `Olá, ${parsed.pushName}! Sou a Antonella, atendente virtual do CRVA.`;

    if (placa) {
      if (!statusExpediente.aberto) {
        respostaIa =
          `${saudacao}\n\n` +
          `Registrei a placa *${placa}* em nosso sistema e direcionei o seu atendimento para a nossa equipe de operadores.\n\n` +
          `Lembrando que no momento nosso atendimento presencial está fechado (${statusExpediente.motivoFechado}), retornando ${statusExpediente.proximaAbertura}. Assim que o expediente iniciar, um atendente fará a verificação oficial no sistema do Detran/RS e responderá você por aqui!`;
      } else {
        respostaIa =
          `${saudacao}\n\n` +
          `Registrei a placa *${placa}* em nosso sistema e direcionei sua solicitação para um de nossos operadores realizar a verificação no Detran/RS. Por favor, aguarde um instante que logo você será respondido!`;
      }
    } else {
      const motivo = acaoHumana.motivo || 'sua solicitação';
      if (!statusExpediente.aberto) {
        respostaIa =
          `${saudacao}\n\n` +
          `Para ${motivo}, registrei seu pedido com prioridade em nossa esteira de atendimento humano.\n\n` +
          `Lembrando que no momento nosso atendimento presencial está fechado (${statusExpediente.motivoFechado}), retornando ${statusExpediente.proximaAbertura}, e seu caso será atendido pela equipe assim que o expediente reiniciar!`;
      } else {
        respostaIa =
          `${saudacao}\n\n` +
          `Para garantir a análise correta e segura de ${motivo}, transferi o seu atendimento para um de nossos operadores especializados aqui do CRVA. Por favor, aguarde um instante que logo você será respondido!`;
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
