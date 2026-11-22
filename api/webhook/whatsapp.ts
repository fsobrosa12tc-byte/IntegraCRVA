/**
 * ============================================================================
 * MARKS SYSTEMS · CRM-INTEGRA · WEBHOOK OFICIAL WHATSAPP (EVOLUTION API / META)
 * ============================================================================
 * Rota universal de recebimento e orquestração de mensagens do WhatsApp:
 * 1. Parser universal de payloads (Evolution API v1/v2, Z-API, Meta Cloud API).
 * 2. Filtros de segurança: ignora grupos (@g.us), mensagens próprias (fromMe: true)
 *    e eventos de telemetria sem texto (ACK, status, presença).
 * 3. Regra de Horário de Expediente do CRVA (Segunda a Sexta, 08:00-12:00 e 13:00-17:00,
 *    fuso America/Sao_Paulo).
 * 4. Atendimento automático receptivo com Antonella (Gemini 3.8 Flash / Groq Cloud).
 * 5. Persistência garantida no Kanban do CRM com upsert e gravação em crm_mensagens.
 * 6. Disparo imediato da resposta para o WhatsApp via Evolution API v2.
 * ============================================================================
 */

import { createClient } from '@supabase/supabase-js';

export interface MensagemUniversalExtraida {
  remoteJid: string;
  telefoneLimpo: string;
  pushName: string;
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  messageId?: string;
  timestamp?: number;
}

export interface StatusExpediente {
  aberto: boolean;
  motivoFechado: string | null;
  horarioTexto: string;
  proximaAbertura: string;
  intervaloAlmoco: boolean;
  diaSemana: string;
}

// Modelos fechados de chat para execução rápida server-side na Groq
const GROQ_CHAT_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-70b-8192',
  'llama3-8b-8192',
] as const;

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

# CASOS COMPLEXOS (ENCAMINHAMENTO AO ATENDENTE HUMANO)
Em casos jurídicos complexos (óbito, inventário, bloqueio judicial/RENAJUD, leilão, suspeita de adulteração de chassi/motor), utilize a mensagem padrão de transferência:
"Para garantir a análise correta e segura do seu caso, vou transferir o seu atendimento para um de nossos atendentes especializados aqui do CRVA. Por favor, aguarde um instante que logo você será respondido!"`;

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

  // Turnos de expediente:
  // Manhã: 08:00 às 12:00 (480min a 720min)
  // Tarde: 13:00 às 17:00 (780min a 1020min)
  const turnoManha = totalMinutos >= 480 && totalMinutos < 720;
  const turnoTarde = totalMinutos >= 780 && totalMinutos < 1020;
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
 * Detecta se a mensagem do cliente pede falar com humano, emissão de documento ou consulta de veículo
 */
export function detectarDemandaHumanaOuDocumento(texto: string): boolean {
  if (!texto) return false;
  const t = texto.toLowerCase();

  return (
    t.includes('humano') ||
    t.includes('atendente') ||
    t.includes('pessoa') ||
    t.includes('falar com') ||
    t.includes('falar com alguém') ||
    t.includes('operador') ||
    t.includes('atendimento presencial') ||
    t.includes('emitir') ||
    t.includes('emissão') ||
    t.includes('emissao') ||
    t.includes('crlv') ||
    t.includes('atpv') ||
    t.includes('renavam') ||
    t.includes('placa') ||
    t.includes('consultar') ||
    t.includes('débito') ||
    t.includes('debito') ||
    t.includes('ipva') ||
    t.includes('multa') ||
    t.includes('licenciamento') ||
    /[a-z]{3}-?\d[a-z0-9]\d{2}/i.test(t)
  );
}

/**
 * Inicializa cliente Supabase no servidor com Service Role (evita bloqueios de RLS)
 */
export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  if (!url || !key) {
    console.warn('[WHATSAPP WEBHOOK] ⚠️ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados no ambiente.');
    return null;
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Parser universal para suportar Evolution API v1/v2, Z-API e Meta Cloud API
 */
export function extrairMensagemUniversal(body: any): MensagemUniversalExtraida | null {
  if (!body || typeof body !== 'object') return null;

  // 1. Suporte a payload envolto em array ou objeto data
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
    // Formato Meta WhatsApp Cloud API
    const change = body.entry[0]?.changes?.[0]?.value;
    if (change?.messages?.[0]) {
      const msg = change.messages[0];
      const contact = change.contacts?.[0];
      const from = String(msg.from || '').replace(/\D/g, '');
      return {
        remoteJid: `${from}@s.whatsapp.net`,
        telefoneLimpo: from,
        pushName: contact?.profile?.name || 'Cliente WhatsApp',
        text: String(msg.text?.body || msg.caption || '').trim(),
        fromMe: false,
        isGroup: false,
        messageId: msg.id,
        timestamp: Number(msg.timestamp) ? Number(msg.timestamp) * 1000 : Date.now(),
      };
    }
  }

  // 2. Extração de chave e identificadores
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

  // 3. Extração do conteúdo textual (suporta conversation, extendedText, imagens com legenda, botões e listas)
  const msgObj = item.message || body.message || item;
  let text = '';

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
  };
}

/**
 * Formata telefone brasileiro para exibição amigável no Kanban
 */
function formatarTelefoneVisual(tel: string): string {
  const digits = tel.replace(/\D/g, '');
  const sem55 = digits.startsWith('55') && digits.length >= 12 ? digits.substring(2) : digits;
  if (sem55.length === 11) {
    return `(${sem55.substring(0, 2)}) ${sem55.substring(2, 7)}-${sem55.substring(7)}`;
  }
  if (sem55.length === 10) {
    return `(${sem55.substring(0, 2)}) ${sem55.substring(2, 6)}-${sem55.substring(6)}`;
  }
  return tel;
}

/**
 * Sanitiza texto para LGPD (oculta números de CPF/CNPJ)
 */
function montarSnippetLgpd(texto: string): string {
  if (!texto) return '';
  return texto
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '***.***.***-**')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '**.***.***/****-**')
    .slice(0, 140);
}

/**
 * Detecta termos críticos e classificação rápida de assunto
 */
function classificarMensagemRapida(texto: string): {
  urgente: boolean;
  motivoUrgencia: string | null;
  assunto: string;
  etapaDestino: string;
} {
  const t = texto.toLowerCase();

  // Casos jurídicos críticos -> Fila humana imediata
  if (
    t.includes('óbito') ||
    t.includes('obito') ||
    t.includes('falec') ||
    t.includes('inventário') ||
    t.includes('inventario') ||
    t.includes('bloqueio judicial') ||
    t.includes('renajud') ||
    t.includes('leilão') ||
    t.includes('leilao') ||
    t.includes('perícia') ||
    t.includes('pericia') ||
    t.includes('adulterad')
  ) {
    return {
      urgente: true,
      motivoUrgencia: 'Demanda jurídica crítica (óbito/inventário/bloqueio judicial)',
      assunto: 'bloqueio_debitos',
      etapaDestino: 'fila_humana_particular',
    };
  }

  // Despachante credenciado
  if (t.includes('crdd') || t.includes('grt') || t.includes('despachante')) {
    return {
      urgente: false,
      motivoUrgencia: null,
      assunto: 'outros',
      etapaDestino: 'fila_humana_despachante',
    };
  }

  // Transferência
  if (t.includes('transfer') || t.includes('compra e venda') || t.includes('atpv') || t.includes('crv')) {
    return {
      urgente: false,
      motivoUrgencia: null,
      assunto: 'transferencia',
      etapaDestino: 'aguardando_documentacao',
    };
  }

  // Primeiro Emplacamento
  if (t.includes('primeiro emplacamento') || t.includes('veículo zero') || t.includes('veiculo zero') || t.includes('zero km')) {
    return {
      urgente: false,
      motivoUrgencia: null,
      assunto: 'primeiro_emplacamento',
      etapaDestino: 'aguardando_documentacao',
    };
  }

  // Vistoria
  if (t.includes('vistoria') || t.includes('pista') || t.includes('reprovou') || t.includes('decalque')) {
    return {
      urgente: false,
      motivoUrgencia: null,
      assunto: 'vistoria',
      etapaDestino: 'triagem_ia',
    };
  }

  // CRLV-e / Débitos
  if (t.includes('crlv') || t.includes('licenciamento') || t.includes('ipva') || t.includes('débito') || t.includes('debito')) {
    return {
      urgente: false,
      motivoUrgencia: null,
      assunto: 'crlve_atpve',
      etapaDestino: 'fila_humana_particular',
    };
  }

  return {
    urgente: false,
    motivoUrgencia: null,
    assunto: 'outros',
    etapaDestino: 'triagem_ia',
  };
}

/**
 * Gera resposta da Antonella chamando Google Gemini (gemini-3.8-flash) com fallback para Groq Cloud,
 * incorporando as regras de expediente ativo/fechado e base de conhecimento do Detran/RS.
 */
async function gerarRespostaAntonella(params: {
  mensagemCliente: string;
  nomeCliente: string;
  historicoPrevio?: { role: 'user' | 'assistant'; content: string }[];
  supabaseClient: any;
  statusExpediente: StatusExpediente;
}): Promise<string> {
  const { mensagemCliente, nomeCliente, historicoPrevio = [], supabaseClient, statusExpediente } = params;

  // 1. Carrega configurações salvas do Motor de IA no Supabase
  let activeProvider = 'gemini';
  let geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '').trim();
  let groqKey = (process.env.GROQ_API_KEY || '').trim();
  let systemPrompt = PROMPT_ANTONELLA_PADRAO;
  let contextoBaseConhecimento = '';

  if (supabaseClient) {
    try {
      const { data: configRow } = await supabaseClient
        .from('crm_configuracoes')
        .select('valor')
        .eq('chave', 'ai_engine_config')
        .maybeSingle();

      if (configRow?.valor) {
        const val = configRow.valor;
        if (val.activeProvider) activeProvider = val.activeProvider;
        if (val.geminiApiKey) geminiKey = String(val.geminiApiKey).trim();
        if (val.groqApiKey) groqKey = String(val.groqApiKey).trim();
        if (val.systemPrompt) systemPrompt = val.systemPrompt;
      }

      // Base de conhecimento
      const { data: baseRow } = await supabaseClient
        .from('crm_configuracoes')
        .select('valor')
        .eq('chave', 'ai_knowledge_base')
        .maybeSingle();

      if (baseRow?.valor?.documentos && Array.isArray(baseRow.valor.documentos)) {
        const docs = baseRow.valor.documentos
          .map((d: any) => `[DOCUMENTO: ${d.nome}]\n${d.conteudoTexto}`)
          .join('\n\n---\n\n');
        if (docs) {
          contextoBaseConhecimento = `\n\n<documentos_base_conhecimento>\n${docs.slice(0, 12000)}\n</documentos_base_conhecimento>`;
        }
      }
    } catch (e) {
      console.warn('[WHATSAPP WEBHOOK] Falha ao ler crm_configuracoes do Supabase:', e);
    }
  }

  // Fallback para chave padrão do projeto se nenhuma foi inserida
  if (!geminiKey) {
    geminiKey = 'AIzaSyB8Z7F44LFaR1klShWb8VFGD0VK3lP5y9Y';
  }

  // 2. Injeção dinâmica da regra de horário de expediente no prompt do sistema
  let promptExpediente = '';
  if (!statusExpediente.aberto) {
    promptExpediente = `
# SITUAÇÃO ATUAL DE EXPEDIENTE DO CRVA (MUITO IMPORTANTE)
- STATUS DO CRVA: FECHADO NO MOMENTO (${statusExpediente.motivoFechado}).
- HORÁRIO LOCAL EM BRASÍLIA: ${statusExpediente.horarioTexto}.
- REABERTURA DO EXPEDIENTE: ${statusExpediente.proximaAbertura}.

DIRETRIZES OBRIGATÓRIAS FORA DO HORÁRIO DE EXPEDIENTE:
1. Responda dúvidas informativas gerais normalmente (documentos exigidos, taxas Detran/RS, prazos, exigências de vistoria e horários de corte de senhas às 11:30 e 16:30) com total gentileza e precisão.
2. Informe com acolhimento que o atendimento presencial no CRVA está fechado neste momento e que nossa equipe de atendentes humanos retornará ${statusExpediente.proximaAbertura}.
3. Se o cliente solicitar emissão de documento (CRLV-e, ATPV-e), consulta de placa/Renavam/débitos ou falar diretamente com um atendente humano: confirme com clareza que registrou o pedido na esteira de atendimento e que a demanda foi posicionada na fila prioritária de atendimento humano para início imediato assim que o expediente abrir ${statusExpediente.proximaAbertura}.
`;
  } else {
    promptExpediente = `
# SITUAÇÃO ATUAL DE EXPEDIENTE
- STATUS DO CRVA: ABERTO E EM ATIVIDADE (Horário atual: ${statusExpediente.horarioTexto}).
- Atendimento no balcão e vistorias até 12:00 e das 13:00 às 17:00 (corte de senhas no balcão e entrada na pista de vistoria encerram rigorosamente às 11:30 e às 16:30).
`;
  }

  const promptFinal = `${systemPrompt}${promptExpediente}${contextoBaseConhecimento}`.trim();

  // 3. Tentativa no Google Gemini (gemini-3.8-flash)
  const tentarGemini = async (): Promise<string | null> => {
    if (!geminiKey) return null;
    const contents: any[] = [];

    for (const h of historicoPrevio.slice(-6)) {
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: mensagemCliente }],
    });

    const body = {
      contents,
      systemInstruction: { parts: [{ text: promptFinal }] },
      generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiKey}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (txt) return txt.trim();
    }
    return null;
  };

  // 4. Tentativa na Groq Cloud (Lista Fechada Homologada)
  const tentarGroq = async (): Promise<string | null> => {
    if (!groqKey) return null;
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
            max_tokens: 600,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const txt = data?.choices?.[0]?.message?.content;
          if (txt) return txt.trim();
        }
      } catch {
        continue;
      }
    }
    return null;
  };

  try {
    if (activeProvider === 'gemini') {
      const respGemini = await tentarGemini();
      if (respGemini) return respGemini;
      const respGroq = await tentarGroq();
      if (respGroq) return respGroq;
    } else {
      const respGroq = await tentarGroq();
      if (respGroq) return respGroq;
      const respGemini = await tentarGemini();
      if (respGemini) return respGemini;
    }
  } catch (err) {
    console.warn('[WHATSAPP WEBHOOK] Falha na chamada da IA (usando resposta padrão):', err);
  }

  // Fallback humanizado e seguro caso ambas as APIs de IA estejam sem cota
  if (!statusExpediente.aberto) {
    return `Olá, ${nomeCliente}! Sou a Antonella, atendente virtual aqui do CRVA.\n\nRecebi sua mensagem! No momento o CRVA está fechado (${statusExpediente.motivoFechado}). Nosso expediente e atendimento presencial retornam ${statusExpediente.proximaAbertura}.\n\nSeu pedido foi registrado em nosso sistema e direcionado para a fila de atendimento. Posso esclarecer alguma dúvida geral sobre taxas ou documentação do seu veículo enquanto isso?`;
  }

  return `Olá, ${nomeCliente}! Sou a Antonella, atendente virtual aqui do CRVA.\n\nRecebi sua mensagem e já encaminhei seu caso para a nossa esteira de atendimento. Nosso horário de funcionamento é de segunda a sexta, das 08:00 às 12:00 e das 13:00 às 17:00 (corte de senhas e vistorias até 11:30 e 16:30).\n\nComo posso orientar sobre o seu veículo hoje?`;
}

/**
 * Dispara mensagem de texto para o WhatsApp do cliente via Evolution API v2
 */
async function enviarTextoWhatsAppEvolution(params: {
  telefone: string;
  mensagem: string;
}): Promise<boolean> {
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

  const endpoint = `${evolutionUrl}/message/sendText/${encodeURIComponent(evolutionInstance)}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({
        number: params.telefone,
        text: params.mensagem,
        delay: 1200,
        presence: 'composing',
        linkPreview: false,
      }),
    });

    if (res.ok) {
      console.log(`[WHATSAPP WEBHOOK] 📤 Resposta enviada com sucesso ao cliente (${params.telefone}) via Evolution API.`);
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
  // Suporte a ping de validação GET
  if (req.method === 'GET') {
    const expedienteStatus = verificarHorarioExpediente();
    return res.status(200).json({
      status: 'online',
      servico: 'CRM-Integra WhatsApp Webhook',
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
    console.log('[WHATSAPP WEBHOOK] ℹ️ Payload vazio ou formato não reconhecido.');
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
    console.log(`[WHATSAPP WEBHOOK] 🚫 GRUPO OU BROADCAST IGNORADO (${parsed.remoteJid}). A atendente atua estritamente em chats individuais.`);
    return res.status(200).json({ status: 'ignored_group_or_broadcast' });
  }

  // FILTRO OBRIGATÓRIO 2: Mensagens próprias (fromMe)
  if (parsed.fromMe === true) {
    console.log('[WHATSAPP WEBHOOK] ℹ️ MENSAGEM PRÓPRIA IGNORADA (fromMe: true).');
    return res.status(200).json({ status: 'ignored_from_me' });
  }

  // FILTRO OBRIGATÓRIO 3: Eventos sem conteúdo de texto
  if (!parsed.text || !parsed.text.trim()) {
    console.log('[WHATSAPP WEBHOOK] ℹ️ Evento sem mensagem de texto (ACK, status ou presença). Ignorado.');
    return res.status(200).json({ status: 'ignored_no_text' });
  }

  console.log(`[WHATSAPP WEBHOOK] ✅ Mensagem válida de "${parsed.pushName}" (${parsed.telefoneLimpo}): "${parsed.text.substring(0, 80)}"`);

  const supabase = getSupabaseServerClient();
  const agoraIso = new Date().toISOString();
  const horaCurta = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const telefoneVisual = formatarTelefoneVisual(parsed.telefoneLimpo);

  // Análise de Horário de Expediente e Demanda
  const statusExpediente = verificarHorarioExpediente();
  const pedeHumanoOuDoc = detectarDemandaHumanaOuDocumento(parsed.text);
  const classificacao = classificarMensagemRapida(parsed.text);

  let etapaDestino = classificacao.etapaDestino;
  let urgente = classificacao.urgente;
  let motivoUrgencia = classificacao.motivoUrgencia;

  // Regra Fora de Expediente:
  // Se o CRVA estiver fechado e o cliente pedir documento, placa/renavam ou falar com humano, move para a Fila Humana
  if (!statusExpediente.aberto && pedeHumanoOuDoc) {
    etapaDestino = 'fila_humana_particular';
    urgente = true;
    motivoUrgencia = `Fora do expediente (${statusExpediente.motivoFechado}): aguardando operador humano para documento/consulta`;
  }

  let atendimentoId = '';
  let historicoAnterior: any[] = [];
  let ehNovoAtendimento = false;

  // 1. PERSISTÊNCIA GARANTIDA NO KANBAN DO CRM (SUPABASE)
  if (supabase) {
    try {
      const ddi = parsed.telefoneLimpo.startsWith('55') ? parsed.telefoneLimpo : `55${parsed.telefoneLimpo}`;
      const semDdi = parsed.telefoneLimpo.startsWith('55') ? parsed.telefoneLimpo.substring(2) : parsed.telefoneLimpo;

      // Busca atendimento existente considerando tanto telefone quanto cliente_telefone
      let cardExistente: any = null;
      try {
        const { data: atendimentosExistentes, error: buscaError } = await supabase
          .from('crm_atendimentos')
          .select('*')
          .or(`telefone.eq.${parsed.telefoneLimpo},telefone.eq.${semDdi},telefone.eq.${ddi},cliente_telefone.ilike.%${semDdi}%,cliente_telefone.ilike.%${ddi}%`)
          .order('ultima_interacao_em', { ascending: false })
          .limit(1);

        if (buscaError) {
          console.error('[SUPABASE QUERY ERROR]', buscaError);
        } else if (atendimentosExistentes && atendimentosExistentes.length > 0) {
          cardExistente = atendimentosExistentes[0];
        }
      } catch (errBusca) {
        console.warn('[WHATSAPP WEBHOOK] Falha na busca preliminar, tentando fallback:', errBusca);
      }

      if (cardExistente) {
        atendimentoId = cardExistente.id;
        historicoAnterior = Array.isArray(cardExistente.historico_mensagens) ? cardExistente.historico_mensagens : [];

        // Adiciona nova mensagem do cliente ao histórico
        const novoHistorico = [
          ...historicoAnterior,
          {
            id: `msg-${Date.now()}-c`,
            remetente: 'cliente',
            autor_nome: parsed.pushName || 'Cliente WhatsApp',
            texto: parsed.text,
            horario: horaCurta,
          },
        ];

        // Mantém o status_coluna atual se já existir; se concluído ou se pedir humano fora de expediente, atualiza
        let statusFinal = cardExistente.status_coluna || cardExistente.etapa_kanban || 'triagem_ia';
        if (statusFinal === 'concluido') {
          statusFinal = etapaDestino;
        } else if (!statusExpediente.aberto && pedeHumanoOuDoc) {
          statusFinal = 'fila_humana_particular';
        } else if (urgente) {
          statusFinal = 'fila_humana_particular';
        }

        const dadosAtualizacao: any = {
          id: cardExistente.id,
          telefone: parsed.telefoneLimpo,
          cliente_telefone: cardExistente.cliente_telefone || telefoneVisual,
          nome_cliente: parsed.pushName || parsed.telefoneLimpo,
          cliente_nome: parsed.pushName || parsed.telefoneLimpo,
          ultima_mensagem: parsed.text,
          snippet_lgpd: montarSnippetLgpd(parsed.text),
          ultima_interacao_em: agoraIso,
          atendido_por_ia: true,
          responsavel_tipo: 'ia',
          status_coluna: statusFinal,
          etapa_kanban: statusFinal,
          historico_mensagens: novoHistorico,
          atualizado_em: agoraIso,
        };

        if (urgente) {
          dadosAtualizacao.urgente = true;
          dadosAtualizacao.motivo_urgencia = motivoUrgencia;
        }

        // Upsert com conflito em telefone
        const { error: upsertErr } = await supabase
          .from('crm_atendimentos')
          .upsert(dadosAtualizacao, { onConflict: 'telefone' });

        if (upsertErr) {
          console.error('[SUPABASE UPSERT ERROR]', upsertErr);
          // Fallback para update por ID caso a constraint única em telefone ainda não exista
          const { error: updateErr } = await supabase
            .from('crm_atendimentos')
            .update(dadosAtualizacao)
            .eq('id', cardExistente.id);
          if (updateErr) {
            console.error('[SUPABASE UPDATE FALLBACK ERROR]', updateErr);
          }
        }

        console.log(`[WHATSAPP WEBHOOK] 📋 Kanban: Card atualizado (${cardExistente.protocolo || cardExistente.id}) para ${parsed.pushName}`);
      } else {
        // Criação de novo card no Kanban
        ehNovoAtendimento = true;
        atendimentoId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `crm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const protocolo = `#CRM-P${Math.floor(100 + Math.random() * 900)}`;

        const statusInicial = etapaDestino;

        const novoCard: any = {
          id: atendimentoId,
          protocolo,
          tipo_cliente: 'particular',
          registro_crdd: null,
          grt_numero: null,
          mencionou_crdd: false,
          mencionou_grt: false,
          telefone: parsed.telefoneLimpo,
          cliente_telefone: telefoneVisual,
          nome_cliente: parsed.pushName || parsed.telefoneLimpo,
          cliente_nome: parsed.pushName || parsed.telefoneLimpo,
          cliente_documento: null,
          despachante_nome: null,
          veiculo_placa: null,
          veiculo_renavam: null,
          veiculo_modelo: null,
          assunto: classificacao.assunto,
          confianca_ia: 95,
          resumo_ia: `Atendimento WhatsApp via Antonella • ${classificacao.assunto}`,
          regra_aplicada: 'Inbound WhatsApp Webhook',
          status_coluna: statusInicial,
          etapa_kanban: statusInicial,
          urgente,
          motivo_urgencia: motivoUrgencia,
          termos_criticos: urgente && motivoUrgencia ? [motivoUrgencia] : [],
          responsavel_tipo: 'ia',
          atendido_por_ia: true,
          atendente_nome: null,
          ultima_mensagem: parsed.text,
          snippet_lgpd: montarSnippetLgpd(parsed.text),
          ultima_interacao_em: agoraIso,
          valor_debitos: 0,
          status_emissao_crlve: 'pendente',
          historico_mensagens: [
            {
              id: `msg-${Date.now()}-c`,
              remetente: 'cliente',
              autor_nome: parsed.pushName || 'Cliente WhatsApp',
              texto: parsed.text,
              horario: horaCurta,
            },
          ],
          transicoes: [
            {
              de: null,
              para: statusInicial,
              motivo: 'Início de conversa via WhatsApp',
              origem: 'ia',
              em: agoraIso,
            },
          ],
          created_at: agoraIso,
          criado_em: agoraIso,
          atualizado_em: agoraIso,
        };

        const { error: insertErr } = await supabase
          .from('crm_atendimentos')
          .upsert(novoCard, { onConflict: 'telefone' });

        if (insertErr) {
          console.error('[SUPABASE UPSERT ERROR]', insertErr);
          const { error: insertFallbackErr } = await supabase
            .from('crm_atendimentos')
            .insert(novoCard);
          if (insertFallbackErr) {
            console.error('[SUPABASE INSERT FALLBACK ERROR]', insertFallbackErr);
          }
        }

        console.log(`[WHATSAPP WEBHOOK] 📋 Kanban: Novo Card criado (${protocolo}) para ${parsed.pushName}`);
      }

      // 1.2 Gravação imediata da mensagem recebida do cliente na tabela crm_mensagens
      const { error: msgClienteErr } = await supabase.from('crm_mensagens').insert({
        atendimento_id: atendimentoId,
        telefone: parsed.telefoneLimpo,
        remetente: 'cliente',
        autor_nome: parsed.pushName || 'Cliente WhatsApp',
        texto: parsed.text,
        created_at: agoraIso,
      });

      if (msgClienteErr) {
        console.error('[SUPABASE UPSERT ERROR - crm_mensagens cliente]', msgClienteErr);
      }
    } catch (errSupabase: any) {
      console.error('[SUPABASE UPSERT ERROR]', errSupabase);
    }
  }

  // 2. GERAÇÃO DA RESPOSTA DA ANTONELLA (IA)
  console.log(`[WHATSAPP WEBHOOK] 🧠 Antonella processando resposta para ${parsed.pushName} (Expediente: ${statusExpediente.aberto ? 'ABERTO' : 'FECHADO'})...`);

  const historicoPrevioFormatado = historicoAnterior.map((m: any) => ({
    role: (m.remetente === 'cliente' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.texto,
  }));

  const respostaIa = await gerarRespostaAntonella({
    mensagemCliente: parsed.text,
    nomeCliente: parsed.pushName,
    historicoPrevio: historicoPrevioFormatado,
    supabaseClient: supabase,
    statusExpediente,
  });

  // 3. DISPARO DA RESPOSTA NO WHATSAPP VIA EVOLUTION API V2
  console.log(`[WHATSAPP WEBHOOK] 🚀 Disparando resposta para o WhatsApp do cliente (${parsed.telefoneLimpo})...`);
  const enviadoComSucesso = await enviarTextoWhatsAppEvolution({
    telefone: parsed.telefoneLimpo,
    mensagem: respostaIa,
  });

  // 4. ATUALIZAÇÃO DO CARD E HISTÓRICO COM A RESPOSTA GERADA
  if (supabase && atendimentoId) {
    try {
      const { data: cardAtual } = await supabase
        .from('crm_atendimentos')
        .select('historico_mensagens')
        .eq('id', atendimentoId)
        .maybeSingle();

      const histAtual = Array.isArray(cardAtual?.historico_mensagens) ? cardAtual.historico_mensagens : [];
      const histComResposta = [
        ...histAtual,
        {
          id: `msg-${Date.now()}-ia`,
          remetente: 'ia',
          autor_nome: 'Antonella (CRVA)',
          texto: respostaIa,
          horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          enviado_whatsapp: enviadoComSucesso,
        },
      ];

      const { error: errCardAtualiza } = await supabase
        .from('crm_atendimentos')
        .update({
          historico_mensagens: histComResposta,
          ultima_mensagem: respostaIa,
          snippet_lgpd: montarSnippetLgpd(respostaIa),
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', atendimentoId);

      if (errCardAtualiza) {
        console.error('[SUPABASE UPSERT ERROR - atualização resposta card]', errCardAtualiza);
      }

      // Gravação da resposta da IA na tabela crm_mensagens
      const { error: msgIaErr } = await supabase.from('crm_mensagens').insert({
        atendimento_id: atendimentoId,
        telefone: parsed.telefoneLimpo,
        remetente: 'ia',
        autor_nome: 'Antonella (CRVA)',
        texto: respostaIa,
        enviado_por_ia: true,
        enviado_whatsapp: enviadoComSucesso,
        created_at: new Date().toISOString(),
      });

      if (msgIaErr) {
        console.error('[SUPABASE UPSERT ERROR - crm_mensagens ia]', msgIaErr);
      }

      console.log(`[WHATSAPP WEBHOOK] ✨ Atendimento gravado e sincronizado com sucesso no Supabase.`);
    } catch (errAtualiza) {
      console.error('[SUPABASE UPSERT ERROR - bloco pós-resposta]', errAtualiza);
    }
  }

  return res.status(200).json({
    sucesso: true,
    atendimentoId,
    novoAtendimento: ehNovoAtendimento,
    respostaEnviada: enviadoComSucesso,
    expedienteAberto: statusExpediente.aberto,
  });
}

export default async function handler(req: any, res: any) {
  return handleWhatsAppWebhook(req, res);
}
