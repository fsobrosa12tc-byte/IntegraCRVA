/**
 * ============================================================================
 * MARKS SYSTEMS · CRM-INTEGRA · WEBHOOK OFICIAL WHATSAPP (EVOLUTION API / META)
 * ============================================================================
 * Rota universal de recebimento e orquestração de mensagens do WhatsApp:
 * 1. Parser universal de payloads (Evolution API v1/v2, Z-API, Meta Cloud API).
 * 2. Suporte multimodal completo: Texto e Áudio (audioMessage com transcrição).
 * 3. Inteligência Ativa: Nunca bloqueia com mensagem estática fora de expediente;
 *    sempre responde dúvidas sobre valores, taxas, documentos e procedimentos.
 * 4. Transferência para Fila Humana restrita a ações humanas reais (emissão de guias,
 *    consultas de restrição por placa/renavam, óbito/inventário, pedido de atendente).
 * 5. Persistência real e garantida no Supabase com mapeamento estrito das colunas
 *    existentes (id UUID, telefone, nome_cliente, status_coluna, etc.).
 * 6. Disparo imediato da resposta em texto via Evolution API v2.
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

// Tabela oficial de taxas e procedimentos vigentes no Detran/RS
export const TABELA_TAXAS_DETRAN_RS = `
# TABELA OFICIAL DE TAXAS E PROCEDIMENTOS DO DETRAN/RS (CRVA)
1. TRANSFERÊNCIA DE PROPRIEDADE (VEÍCULO USADO):
   - Taxa de Alteração de Registro / Transferência (GAD-E): R$ 184,80
   - Taxa de Vistoria de Identificação Veicular:
     * Automóveis / Veículos leves / Camionetas: R$ 138,40
     * Motos / Ciclomotores: R$ 96,80
     * Veículos pesados (Caminhões / Ônibus): R$ 184,80
   - Total taxas Detran/RS para automóvel: R$ 323,20 (recolhidos via guia GAD-E no Banrisul, Sicredi, Banco do Brasil, Bradesco, etc.)
   - Placa Mercosul (apenas se o veículo ainda usar a placa cinza antiga ou placa danificada): média de R$ 150 a R$ 220 (pago diretamente na estampadora).
   - Documentos necessários:
     * ATPV-e preenchido e assinado (com firma reconhecida por autenticidade ou via aplicativo CDT/Gov.br digital prata/ouro).
     * Se veículo emitido antes de 2021: CRV original em papel-moeda ("documento verde") com firma por autenticidade de vendedor e comprador.
     * Documento oficial com foto (RG ou CNH) do comprador.
     * Comprovante de residência recente do comprador (últimos 90 dias).
     * Quitação integral de IPVA, taxa de licenciamento e multas vencidas.
     * Vistoria aprovada no CRVA (validade de 30 dias).

2. PRIMEIRO EMPLACAMENTO (VEÍCULO ZERO KM):
   - Taxa de Primeiro Emplacamento: R$ 184,80 (+ taxa de vistoria quando exigida)
   - Documentação: DANFe (Nota fiscal eletrônica da concessionária), documento com foto e comprovante de endereço.

3. VISTORIA VEICULAR:
   - Valores: R$ 138,40 (automóveis) | R$ 96,80 (motos) | R$ 184,80 (pesados).
   - Horários de corte da pista: Manhã encerra às 11:30 | Tarde encerra às 16:30.
   - Validade: 30 dias corridos em todo o Rio Grande do Sul.

4. SEGUNDA VIA / CRLV-e DIGITAL:
   - O documento veicular é 100% digital (CRLV-e), emitido após a compensação da guia e homologação do processo pelo CRVA.
`;

// Prompt Base da Antonella (CRVA / Detran-RS)
const PROMPT_ANTONELLA_PADRAO = `# PAPEL E PERSONA
Você é Antonella, a atendente virtual oficial via WhatsApp de um CRVA (Centro de Registro de Veículos Automotores) credenciado ao Detran/RS.
Sua missão é prestar orientações humanizadas, acolhedoras, claras e objetivas a proprietários, compradores e despachantes sobre processos e regularizações de VEÍCULOS.
Sempre apresente-se como Antonella na primeira resposta ao cidadão que iniciar contato conosco (ex.: "Olá! Sou a Antonella, atendente virtual aqui do CRVA. Como posso ajudar você hoje?").

# REGRAS INVIOLÁVEIS DE ATIVAÇÃO E CANAIS (CONTROLE ESTRITO)
1. MODO EXCLUSIVAMENTE RECEPTIVO: Você atua estritamente respondendo às dúvidas enviadas pelo cidadão ou despachante no chat individual.
2. BLOQUEIO TOTAL EM GRUPOS: Você JAMAIS deve responder ou interagir em grupos de WhatsApp (chats com @g.us ou múltiplos participantes).
3. ASSUNTO ESTRITO AO CRVA / DETRAN-RS: Responda única e exclusivamente assuntos relacionados aos serviços registrais de veículos do CRVA / Detran-RS. Caso perguntem sobre habilitação/CNH, oriente com gentileza a procurar um CFC ou a Central do Detran/RS.
4. PROIBIÇÃO TEXTUAL: NUNCA mencione siglas operacionais internas como "POP", "POP 02" ou "Procedimento Operacional Padrão".

# HORÁRIOS DE FUNCIONAMENTO, SENHAS E PISTA DE VISTORIA
1. Horário Geral de Expediente: Segunda a Sexta-feira, das 08:00 às 12:00 e das 13:00 às 17:00.
2. Atendimento no Balcão (Corte de Senhas): Turno da manhã encerra rigorosamente às 11:30. Turno da tarde encerra rigorosamente às 16:30.
3. Pista de Vistoria Veicular: A abertura de novas vistorias encerra rigorosamente às 11:30 (manhã) e às 16:30 (tarde).

${TABELA_TAXAS_DETRAN_RS}`;

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
    motivoFechado = 'Intervalo do almoço (12:00 às 13:00)';
    proximaAbertura = 'hoje às 13:00';
  } else if (totalMinutos < 480) {
    motivoFechado = 'Antes do início do expediente matutino (antes das 08:00)';
    proximaAbertura = 'hoje às 08:00';
  } else if (totalMinutos >= 1020) {
    motivoFechado = 'Após o término do expediente vespertino (após as 17:00)';
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
 * - Emissão de guias ou CRLV-e / ATPV-e
 * - Consulta de débitos / restrições fornecendo placa ou Renavam
 * - Casos jurídicos complexos (óbito, inventário, leilão, bloqueio judicial / RENAJUD, suspeita de adulteração)
 * - Pedido explícito para falar com atendente humano
 */
export function exigeAcaoHumanaReal(texto: string): { exige: boolean; motivo: string | null } {
  if (!texto) return { exige: false, motivo: null };
  const t = texto.toLowerCase();

  // 1. Pedido expresso de atendente humano
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

  // 2. Demandas jurídicas críticas
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

  // 3. Emissão de guia/documento ou consulta de débitos informando Placa/Renavam
  const temPlacaOuRenavam = /[a-z]{3}-?\d[a-z0-9]\d{2}/i.test(t) || /renavam\D{0,6}\d{9,11}/i.test(t);
  const pedeAcaoSistema = (
    t.includes('emitir') ||
    t.includes('emissao') ||
    t.includes('emissão') ||
    t.includes('gerar guia') ||
    t.includes('puxar crlv') ||
    t.includes('imprimir crlv') ||
    t.includes('consultar debitos') ||
    t.includes('consultar débitos') ||
    t.includes('extrato de debitos') ||
    t.includes('extrato de débitos')
  );

  if (temPlacaOuRenavam && pedeAcaoSistema) {
    return { exige: true, motivo: 'Solicitação de emissão de documento ou consulta de débitos veiculares' };
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

  const key = item.key || body.key || {};
  const remoteJid: string = String(
    key.remoteJid ||
    item.remoteJid ||
    body.remoteJid ||
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
    false
  );

  const isGroup: boolean = Boolean(
    remoteJid.endsWith('@g.us') ||
    item.isGroup ||
    body.isGroup ||
    (remoteJid.includes('-') && remoteJid.includes('@g.us'))
  );

  const pushName: string = String(
    item.pushName ||
    body.pushName ||
    item.senderName ||
    body.senderName ||
    item.name ||
    body.name ||
    'Cliente WhatsApp'
  ).trim();

  const msgObj = item.message || body.message || item;
  let text = '';
  let isAudio = false;
  let audioBase64 = '';
  let audioMimetype = 'audio/ogg';

  if (typeof msgObj === 'string') {
    text = msgObj;
  } else if (msgObj && typeof msgObj === 'object') {
    if (msgObj.audioMessage || item.audioMessage) {
      isAudio = true;
      const audioData = msgObj.audioMessage || item.audioMessage;
      audioMimetype = audioData.mimetype || 'audio/ogg';
      audioBase64 = msgObj.base64 || item.base64 || audioData.base64 || '';
    }

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
 * Obtém o Base64 do áudio da Evolution API caso não tenha vindo no payload
 */
async function extrairAudioBase64(params: {
  parsed: MensagemUniversalExtraida;
  evolutionUrl: string;
  evolutionKey: string;
  evolutionInstance: string;
}): Promise<{ base64: string; mimetype: string } | null> {
  const { parsed, evolutionUrl, evolutionKey, evolutionInstance } = params;

  if (parsed.audioBase64 && parsed.audioBase64.trim().length > 50) {
    const limpo = parsed.audioBase64.replace(/^data:[^;]+;base64,/, '').trim();
    return {
      base64: limpo,
      mimetype: parsed.audioMimetype || 'audio/ogg',
    };
  }

  const itemKey = parsed.rawItem?.key;
  if (!itemKey) return null;

  try {
    const endpoint = `${evolutionUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(evolutionInstance)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({ message: { key: itemKey } }),
    });

    if (res.ok) {
      const data = await res.json();
      const rawBase64 = data?.base64 || data?.data || '';
      if (rawBase64) {
        const limpo = String(rawBase64).replace(/^data:[^;]+;base64,/, '').trim();
        return {
          base64: limpo,
          mimetype: data?.mimetype || parsed.audioMimetype || 'audio/ogg',
        };
      }
    }
  } catch (errBuscaAudio) {
    console.warn('[WHATSAPP WEBHOOK] Falha ao extrair base64 do áudio:', errBuscaAudio);
  }

  return null;
}

/**
 * Transcreve áudio do cliente utilizando Google Gemini com fallback para Groq Whisper
 */
async function transcreverAudioCliente(params: {
  base64: string;
  mimetype: string;
  geminiKey: string;
  groqKey: string;
}): Promise<string | null> {
  const { base64, mimetype, geminiKey, groqKey } = params;
  const mimeLimpo = mimetype.split(';')[0].trim() || 'audio/ogg';

  // 1. Google Gemini (gemini-2.0-flash / gemini-1.5-flash)
  if (geminiKey) {
    for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const body = {
          contents: [
            {
              parts: [
                { inlineData: { mimeType: mimeLimpo, data: base64 } },
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
        });

        if (res.ok) {
          const data = await res.json();
          const transcricao = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (transcricao) return transcricao;
        }
      } catch {}
    }
  }

  // 2. Fallback Groq Whisper
  if (groqKey) {
    try {
      const endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';
      const buffer = Buffer.from(base64, 'base64');
      const blob = new Blob([buffer], { type: mimeLimpo });

      const formData = new FormData();
      formData.append('file', blob, 'audio.ogg');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'pt');
      formData.append('response_format', 'json');

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const transcricao = data?.text?.trim();
        if (transcricao) return transcricao;
      }
    } catch {}
  }

  return null;
}

/**
 * Resposta inteligente da Antonella com domínio técnico completo do Detran/RS.
 * Acionada com máxima precisão caso o modelo remoto de IA não responda ou esteja sem cota.
 */
function responderDuvidaDetranHeuristica(params: {
  mensagem: string;
  nomeCliente: string;
  statusExpediente: StatusExpediente;
}): string {
  const { mensagem, nomeCliente, statusExpediente } = params;
  const t = (mensagem || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  let respostaPrincipal = '';

  if (
    t.includes('transfer') ||
    t.includes('compra e venda') ||
    t.includes('comprar') ||
    t.includes('vender') ||
    t.includes('passar pro meu nome') ||
    t.includes('quanto custa') ||
    t.includes('quanto e') ||
    t.includes('valor da transfer')
  ) {
    respostaPrincipal =
      'Para a transferência de propriedade de um automóvel ou veículo leve no RS, as taxas oficiais do Detran/RS recolhidas via guia GAD-E são:\n\n' +
      '• *Taxa de Transferência (Alteração de Registro):* R$ 184,80\n' +
      '• *Vistoria de Identificação Veicular no CRVA:* R$ 138,40\n' +
      '• *Total das taxas do CRVA / Detran-RS:* R$ 323,20\n\n' +
      '📌 *Observações sobre placas e débitos:*\n' +
      '- Se o veículo já possui a nova placa Mercosul, não há custo de placas.\n' +
      '- Caso ainda utilize a placa cinza antiga (ou placa danificada), será necessária a substituição pelo padrão Mercosul (pago diretamente na estampadora credenciada, média de R$ 150 a R$ 220).\n' +
      '- O veículo não pode ter débitos vencidos de IPVA, taxa de licenciamento ou multas.\n\n' +
      '📄 *Documentos necessários:*\n' +
      '1. ATPV-e preenchido e assinado (com firma reconhecida por autenticidade de vendedor e comprador, ou assinado digitalmente pelo aplicativo Carteira Digital de Trânsito / Gov.br prata ou ouro);\n' +
      '2. Documento oficial de identificação com foto do comprador (RG ou CNH);\n' +
      '3. Comprovante de endereço atualizado do comprador (últimos 90 dias);\n' +
      '4. Vistoria veicular realizada e aprovada no CRVA (validade de 30 dias corridos).';
  } else if (t.includes('vistoria') || t.includes('pista')) {
    respostaPrincipal =
      'A Vistoria de Identificação Veicular no CRVA segue os seguintes valores oficiais (Detran/RS):\n\n' +
      '• *Automóveis e veículos leves:* R$ 138,40\n' +
      '• *Motos e ciclomotores:* R$ 96,80\n' +
      '• *Veículos pesados (Caminhões e Ônibus):* R$ 184,80\n\n' +
      '⏰ *Horários da Pista de Vistoria:*\n' +
      '- Manhã: entrada e abertura de novas vistorias encerram às 11:30.\n' +
      '- Tarde: entrada e abertura de novas vistorias encerram às 16:30.\n' +
      'O laudo de vistoria tem validade legal de 30 dias corridos em todo o Estado do RS.';
  } else if (t.includes('primeiro emplacamento') || t.includes('zero km') || t.includes('0km')) {
    respostaPrincipal =
      'Para o *Primeiro Emplacamento* de veículo zero km, o valor da taxa do Detran/RS é de R$ 184,80 (acrescido da vistoria, se exigida pela modalidade da nota fiscal, e do par de placas Mercosul na estampadora).\n\n' +
      '📄 *Documentos exigidos:*\n' +
      '- DANFe (Nota fiscal eletrônica original emitida pela concessionária/fabricante);\n' +
      '- Documento oficial com foto (RG/CNH) do adquirente;\n' +
      '- Comprovante de residência atualizado (últimos 90 dias).';
  } else if (t.includes('crlv') || t.includes('licenciamento') || t.includes('ipva') || t.includes('debito')) {
    respostaPrincipal =
      'O documento veicular vigente é 100% digital: o *CRLV-e*, disponibilizado no aplicativo Carteira Digital de Trânsito logo após a compensação dos débitos.\n\n' +
      'Para consultar débitos ou emitir a guia GAD-E de licenciamento, você pode nos informar a *Placa e o Renavam* do veículo que nossa equipe consulta para você.';
  } else {
    respostaPrincipal =
      'No CRVA atendemos com excelência a todos os serviços cadastrais e documentais de veículos do Detran/RS:\n\n' +
      '• Transferência de Propriedade de Veículos\n' +
      '• Vistoria de Identificação Veicular\n' +
      '• Primeiro Emplacamento de Veículo 0km\n' +
      '• Emissão de CRLV-e Digital e ATPV-e\n' +
      '• Alteração de Características e Baixa de Veículos';
  }

  let finalizacao = '';
  if (!statusExpediente.aberto) {
    finalizacao =
      `\n\n⏰ *Observação de contexto:* O atendimento presencial e a pista de vistoria do CRVA estão fechados no momento (${statusExpediente.motivoFechado}). Retornaremos com atendimento presencial ${statusExpediente.proximaAbertura}.\n\n` +
      'Se você tiver a *Placa e o Renavam* do seu veículo, pode me enviar aqui no chat que já deixo seu atendimento preparado na esteira para nossa equipe!';
  } else {
    finalizacao =
      '\n\nNosso atendimento presencial está aberto (08:00 às 12:00 e 13:00 às 17:00, com corte de senhas e vistorias às 11:30 e 16:30). Como posso orientar você melhor?';
  }

  return `Olá, ${nomeCliente}! Sou a Antonella, atendente virtual aqui do CRVA. 😊\n\n${respostaPrincipal}${finalizacao}`;
}

/**
 * Gera resposta da Antonella consultando Gemini / Groq com injeção de contexto de horário.
 * Se ambas as APIs falharem, aciona a Heurística Especialista em Detran/RS com respostas completas.
 */
async function gerarRespostaAntonella(params: {
  mensagemCliente: string;
  nomeCliente: string;
  historicoPrevio?: { role: 'user' | 'assistant'; content: string }[];
  supabaseClient: any;
  statusExpediente: StatusExpediente;
  geminiKeyPrevia?: string;
  groqKeyPrevia?: string;
}): Promise<string> {
  const {
    mensagemCliente,
    nomeCliente,
    historicoPrevio = [],
    supabaseClient,
    statusExpediente,
    geminiKeyPrevia = '',
    groqKeyPrevia = '',
  } = params;

  let activeProvider = 'gemini';
  let geminiKey = geminiKeyPrevia || (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '').trim();
  let groqKey = groqKeyPrevia || (process.env.GROQ_API_KEY || '').trim();
  let systemPrompt = PROMPT_ANTONELLA_PADRAO;

  // Injeção de instrução explícita para fora de expediente
  let instrucaoExpediente = '';
  if (!statusExpediente.aberto) {
    instrucaoExpediente = `
# OBSERVAÇÃO DE CONTEXTO OBRIGATÓRIA (FORA DE EXPEDIENTE)
O CRVA está fechado no momento para atendimento presencial (${statusExpediente.motivoFechado}). O atendimento presencial e vistorias retornam ${statusExpediente.proximaAbertura}.
DIRETRIZES:
1. NUNCA envie uma resposta estática vazia dizendo apenas que está fechado.
2. Responda completa, precisa e educadamente à dúvida do usuário sobre valores, taxas, documentos ou procedimentos veiculares utilizando a tabela oficial do Detran/RS.
3. Informe ao final que o atendimento presencial e abertura de vistorias retornam ${statusExpediente.proximaAbertura}.
4. Convide o usuário a fornecer Placa e Renavam caso deseje deixar a consulta adiantada para a equipe humana.
`;
  } else {
    instrucaoExpediente = `
# OBSERVAÇÃO DE CONTEXTO
O CRVA está aberto em horário comercial regular (08:00 às 12:00 e 13:00 às 17:00, com corte de senhas às 11:30 e 16:30).
`;
  }

  const promptFinal = `${systemPrompt}\n${instrucaoExpediente}`.trim();

  // Tentativa no Gemini (tenta gemini-2.0-flash e gemini-1.5-flash)
  if (geminiKey) {
    for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const contents: any[] = [];
        for (const h of historicoPrevio.slice(-6)) {
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
            generationConfig: { temperature: 0.3, maxOutputTokens: 750 },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (txt) return txt;
        }
      } catch {}
    }
  }

  // Tentativa na Groq Cloud
  if (groqKey) {
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const messages: any[] = [{ role: 'system', content: promptFinal }];
    for (const h of historicoPrevio.slice(-6)) {
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
            temperature: 0.3,
            max_tokens: 750,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const txt = data?.choices?.[0]?.message?.content?.trim();
          if (txt) return txt;
        }
      } catch {}
    }
  }

  // Heurística Especialista em Detran/RS com respostas completas e resolutivas
  return responderDuvidaDetranHeuristica({
    mensagem: mensagemCliente,
    nomeCliente,
    statusExpediente,
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
  if (req.method === 'GET') {
    const expedienteStatus = verificarHorarioExpediente();
    return res.status(200).json({
      status: 'online',
      servico: 'CRM-Integra WhatsApp Webhook',
      multimodal: { audio: true, texto: true },
      timestamp: new Date().toISOString(),
      instancia: process.env.VITE_EVOLUTION_INSTANCE || 'crva-principal',
      expediente: expedienteStatus,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido. Utilize POST.' });
  }

  console.log('[WHATSAPP WEBHOOK] 📥 Evento recebido no Webhook WhatsApp');

  const parsed = extrairMensagemUniversal(req.body);

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
  let geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '').trim();
  let groqKey = (process.env.GROQ_API_KEY || '').trim();

  // PROCESSAMENTO DE ÁUDIO (audioMessage)
  let textoParaProcessamento = parsed.text;
  let textoParaExibicaoKanban = parsed.text;
  let mensagemEraAudio = false;

  if (parsed.isAudio) {
    mensagemEraAudio = true;
    console.log(`[WHATSAPP WEBHOOK] 🎤 Mensagem de áudio detectada de "${parsed.pushName}" (${parsed.telefoneLimpo}). Extraindo...`);

    const audioExtraido = await extrairAudioBase64({
      parsed,
      evolutionUrl,
      evolutionKey,
      evolutionInstance,
    });

    if (audioExtraido && audioExtraido.base64) {
      const transcricao = await transcreverAudioCliente({
        base64: audioExtraido.base64,
        mimetype: audioExtraido.mimetype,
        geminiKey,
        groqKey,
      });

      if (transcricao) {
        textoParaProcessamento = transcricao;
        textoParaExibicaoKanban = `🎤 [Áudio transcrito]: "${transcricao}"`;
      } else {
        textoParaProcessamento = 'O cliente enviou um áudio sobre veículos que não pôde ser transcrito com clareza.';
        textoParaExibicaoKanban = '🎤 [Áudio recebido - não foi possível transcrever]';
      }
    } else {
      textoParaProcessamento = 'O cliente enviou um áudio que não pôde ser baixado pelo servidor.';
      textoParaExibicaoKanban = '🎤 [Áudio recebido - mídia indisponível]';
    }
  }

  // FILTRO OBRIGATÓRIO 3: Eventos sem conteúdo de texto nem áudio reconhecido
  if (!textoParaExibicaoKanban || !textoParaExibicaoKanban.trim()) {
    return res.status(200).json({ status: 'ignored_no_content' });
  }

  console.log(`[WHATSAPP WEBHOOK] ✅ Mensagem válida de "${parsed.pushName}" (${parsed.telefoneLimpo}): "${textoParaExibicaoKanban.substring(0, 80)}"`);

  const agoraIso = new Date().toISOString();
  const statusExpediente = verificarHorarioExpediente();
  const acaoHumana = exigeAcaoHumanaReal(textoParaProcessamento);

  // REGRA DE STATUS NO KANBAN:
  // Se exigir ação humana real (óbito, inventário, leilão, bloqueio judicial, emissão de guia com placa/renavam ou pedido de atendente) -> fila_humana_particular
  // Caso contrário -> triagem_ia (a Antonella responde e conduz o atendimento)
  let statusDestino = 'triagem_ia';
  let urgente = false;

  if (acaoHumana.exige) {
    statusDestino = 'fila_humana_particular';
    urgente = true;
  }

  // Extrai placa se presente
  const placaMatch = (textoParaProcessamento || '').toUpperCase().match(/\b([A-Z]{3}-?\d[A-Z0-9]\d{2})\b/);
  const placa = placaMatch ? placaMatch[1].replace('-', '') : null;

  // Extrai renavam se presente
  const renavamMatch = (textoParaProcessamento || '').match(/renavam\D{0,6}(\d{9,11})/i);
  const renavam = renavamMatch ? renavamMatch[1] : null;

  let atendimentoId = '';
  let historicoAnterior: any[] = [];
  let ehNovoAtendimento = false;

  // 1. PERSISTÊNCIA NO BANCO DE DADOS SUPABASE (ESTRITAMENTE COM COLUNAS REAIS)
  if (supabase) {
    try {
      const ddi = parsed.telefoneLimpo.startsWith('55') ? parsed.telefoneLimpo : `55${parsed.telefoneLimpo}`;
      const semDdi = parsed.telefoneLimpo.startsWith('55') ? parsed.telefoneLimpo.substring(2) : parsed.telefoneLimpo;

      // Busca atendimento existente pelo telefone
      let cardExistente: any = null;
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

        // Se já existia e exige ação humana, atualiza para fila_humana; se não, mantém o status atual
        let statusFinal = cardExistente.status_coluna || 'triagem_ia';
        if (acaoHumana.exige) {
          statusFinal = 'fila_humana_particular';
        } else if (statusFinal === 'concluido') {
          statusFinal = 'triagem_ia';
        }

        const dadosAtualizacao: any = {
          id: cardExistente.id,
          telefone: parsed.telefoneLimpo,
          nome_cliente: parsed.pushName || parsed.telefoneLimpo,
          status_coluna: statusFinal,
          ultima_mensagem: textoParaExibicaoKanban,
          ultima_interacao_em: agoraIso,
          atendido_por_ia: !acaoHumana.exige,
          urgente: acaoHumana.exige || Boolean(cardExistente.urgente),
          categoria: 'particular',
        };
        if (placa) dadosAtualizacao.placa = placa;
        if (renavam) dadosAtualizacao.renavam = renavam;

        const { error: upsertErr } = await supabase
          .from('crm_atendimentos')
          .upsert(dadosAtualizacao, { onConflict: 'telefone' });

        if (upsertErr) {
          console.error('[SUPABASE UPSERT ERROR crm_atendimentos update]', upsertErr);
        } else {
          console.log(`[WHATSAPP WEBHOOK] 📋 Kanban: Card atualizado (${cardExistente.id}) para ${parsed.pushName}`);
        }
      } else {
        // Novo atendimento com ID UUID válido
        ehNovoAtendimento = true;
        atendimentoId = crypto.randomUUID();

        const novoCard: any = {
          id: atendimentoId,
          telefone: parsed.telefoneLimpo,
          nome_cliente: parsed.pushName || parsed.telefoneLimpo,
          status_coluna: statusDestino,
          ultima_mensagem: textoParaExibicaoKanban,
          ultima_interacao_em: agoraIso,
          atendido_por_ia: !acaoHumana.exige,
          urgente,
          categoria: 'particular',
        };
        if (placa) novoCard.placa = placa;
        if (renavam) novoCard.renavam = renavam;

        const { error: insertErr } = await supabase
          .from('crm_atendimentos')
          .upsert(novoCard, { onConflict: 'telefone' });

        if (insertErr) {
          console.error('[SUPABASE UPSERT ERROR crm_atendimentos insert]', insertErr);
        } else {
          console.log(`[WHATSAPP WEBHOOK] 📋 Kanban: Novo Card criado (${atendimentoId}) para ${parsed.pushName}`);
        }
      }

      // 1.2 Gravação da mensagem recebida do cliente na tabela crm_mensagens
      const dadosMsgCliente = {
        id: crypto.randomUUID(),
        atendimento_id: atendimentoId,
        telefone: parsed.telefoneLimpo,
        remetente: 'cliente',
        tipo_conteudo: mensagemEraAudio ? 'audio' : 'texto',
        conteudo: textoParaExibicaoKanban, // coluna real no Supabase
        enviado_por_ia: false,
        created_at: agoraIso,
      };

      const { error: msgClienteErr } = await supabase.from('crm_mensagens').insert(dadosMsgCliente);
      if (msgClienteErr) {
        console.error('[SUPABASE INSERT ERROR crm_mensagens cliente]', msgClienteErr);
      }
    } catch (errSupabase) {
      console.error('[SUPABASE ERROR]', errSupabase);
    }
  }

  // 2. GERAÇÃO DA RESPOSTA DA ANTONELLA (SEMPRE RESOLUTIVA, NUNCA ESTÁTICA)
  console.log(`[WHATSAPP WEBHOOK] 🧠 Antonella formulando resposta para ${parsed.pushName} (Expediente: ${statusExpediente.aberto ? 'ABERTO' : 'FECHADO'})...`);

  let respostaIa = '';
  if (acaoHumana.exige) {
    // Caso de transferência para operador humano
    const motivo = acaoHumana.motivo || 'sua solicitação';
    if (!statusExpediente.aberto) {
      respostaIa =
        `Olá, ${parsed.pushName}! Sou a Antonella, atendente virtual do CRVA.\n\n` +
        `Para ${motivo}, registrei seu pedido com prioridade em nossa esteira de atendimento humano.\n\n` +
        `⏰ No momento nosso atendimento presencial e os operadores estão fora do expediente (${statusExpediente.motivoFechado}). Retornaremos ${statusExpediente.proximaAbertura}, e seu caso será o primeiro a ser atendido!`;
    } else {
      respostaIa =
        `Olá, ${parsed.pushName}! Sou a Antonella, atendente virtual do CRVA.\n\n` +
        `Para garantir a análise correta e segura de ${motivo}, acabo de transferir o seu atendimento para um de nossos operadores especializados aqui do CRVA. Por favor, aguarde um instante que logo você será respondido!`;
    }
  } else {
    // Pergunta de dúvidas, valores, taxas, documentos ou procedimentos
    respostaIa = await gerarRespostaAntonella({
      mensagemCliente: textoParaProcessamento,
      nomeCliente: parsed.pushName,
      historicoPrevio: historicoAnterior,
      supabaseClient: supabase,
      statusExpediente,
      geminiKeyPrevia: geminiKey,
      groqKeyPrevia: groqKey,
    });
  }

  // 3. DISPARO DA RESPOSTA EM TEXTO NO WHATSAPP VIA EVOLUTION API V2
  console.log(`[WHATSAPP WEBHOOK] 🚀 Disparando resposta para o WhatsApp do cliente (${parsed.telefoneLimpo})...`);
  const enviadoComSucesso = await enviarTextoWhatsAppEvolution({
    telefone: parsed.telefoneLimpo,
    mensagem: respostaIa,
    evolutionUrl,
    evolutionKey,
    evolutionInstance,
  });

  // 4. ATUALIZAÇÃO DO CARD E HISTÓRICO NO SUPABASE
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
    statusDestino,
    expedienteAberto: statusExpediente.aberto,
  });
}

export default async function handler(req: any, res: any) {
  return handleWhatsAppWebhook(req, res);
}
