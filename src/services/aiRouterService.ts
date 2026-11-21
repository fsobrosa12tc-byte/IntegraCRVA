/**
 * ============================================================================
 * MARKS SYSTEMS · CRM-INTEGRA · AI ROUTER SERVICE (MULTI-MODELO)
 * ============================================================================
 * Roteador unificado de Inteligência Artificial para o CRM-Integra do CRVA.
 * Suporta dois provedores gratuitos de altíssima performance:
 *  1. Google Gemini (Google AI Studio) - Modelo padrão: gemini-2.5-flash
 *  2. Groq Cloud (API compatível OpenAI) - Modelo padrão: llama-3.3-70b-versatile
 *
 * Características:
 *  - Alternância de provedor sem reinício ou alteração de código.
 *  - Failover automático: se o provedor principal falhar ou atingir cota (HTTP 429),
 *    o roteador tenta instantaneamente o provedor secundário.
 *  - Relatório padronizado de tokens consumidos, latência e provedor real utilizado.
 *  - Persistência híbrida: Supabase + LocalStorage com fallback robusto.
 * ============================================================================
 */

import { supabase } from '../lib/supabase';
import { montarContextoBaseConhecimento } from './aiKnowledgeService';

export type AiProvider = 'gemini' | 'groq';

export interface AiConfig {
  activeProvider: AiProvider;
  geminiApiKey: string;
  groqApiKey: string;
  autoFallback: boolean;
  geminiModel: string;
  groqModel: string;
  systemPrompt?: string;
  crvaNomeCodigo?: string;
  horariosAtendimento?: string;
}

export interface AiPromptParams {
  systemPrompt?: string;
  userMessage: string;
  historico?: { role: 'user' | 'assistant'; content: string }[];
  forcedProvider?: AiProvider;
  temperature?: number;
  maxTokens?: number;
}

export interface AiResponseResult {
  text: string;
  providerUsed: AiProvider;
  modeloUsado: string;
  tokensInput: number;
  tokensOutput: number;
  latenciaMs: number;
  fallbackAcionado?: boolean;
}

export interface TesteConexaoResult {
  sucesso: boolean;
  provider: AiProvider;
  modelo: string;
  latenciaMs: number;
  resposta?: string;
  erro?: string;
}

// Configurações padrão e fallbacks de ambiente
const STORAGE_KEY = 'crm_ai_config_v1';

export const DEFAULT_SYSTEM_PROMPT = `# PAPEL E PERSONA
Você é Antonella, a atendente virtual oficial via WhatsApp de um CRVA (Centro de Registro de Veículos Automotores) credenciado ao Detran/RS.
Sua missão é prestar orientações humanizadas, acolhedoras, claras e objetivas a proprietários, compradores e despachantes sobre processos e regularizações de VEÍCULOS.
Sempre apresente-se como Antonella na primeira resposta ao cidadão que iniciar contato conosco (ex.: "Olá! Sou a Antonella, atendente virtual aqui do CRVA. Como posso ajudar você hoje?").

# REGRAS INVIOLÁVEIS DE ATIVAÇÃO E CANAIS (CONTROLE ESTRITO)
1. MODO EXCLUSIVAMENTE RECEPTIVO (NUNCA INICIAR CONVERSA):
   - Você JAMAIS, em hipótese alguma, deve iniciar uma conversa ativa ou enviar mensagens espontâneas sem que o usuário tenha enviado uma mensagem primeiro.
   - Atue estritamente respondendo às dúvidas enviadas pelo cidadão ou despachante no chat individual.
2. BLOQUEIO TOTAL EM GRUPOS DE WHATSAPP:
   - Você JAMAIS deve responder, comentar ou interagir em grupos de WhatsApp (chats com @g.us ou múltiplos participantes), mesmo que seja mencionada ou marcada. Sua atuação é restrita exclusivamente a conversas individuais (1 para 1).
3. ASSUNTO ESTRITO AO CRVA / DETRAN-RS:
   - Responda única e exclusivamente assuntos relacionados aos serviços registrais de veículos do CRVA / Detran-RS.
   - Caso o usuário envie mensagens sobre qualquer outro assunto fora do escopo (política, entretenimento, vendas diversas, suporte de outros órgãos, bate-papo genérico), recuse educadamente em uma frase curta informando que este canal é exclusivo para atendimento de serviços veiculares do CRVA / Detran-RS.

# HORÁRIOS DE FUNCIONAMENTO, SENHAS E PISTA DE VISTORIA
Sempre informe e respeite rigorosamente os horários abaixo quando o usuário perguntar sobre atendimento presencial ou vistorias:
1. Horário Geral de Funcionamento:
   - Segunda a Sexta-feira, das 08:00 às 12:00 (fechando ao meio-dia para intervalo) e das 13:00 às 17:00.
2. Atendimento no Balcão (Corte de Fichas/Senhas):
   - Turno da manhã: A retirada de novas fichas/senhas encerra-se às 11:30. Após esse horário, são atendidos exclusivamente os usuários que já retiraram senha e estão aguardando no local.
   - Turno da tarde: A retirada de novas fichas/senhas encerra-se às 16:30. Após esse horário, são atendidos exclusivamente os usuários que já retiraram senha e estão aguardando no local.
3. Pista de Vistoria Veicular:
   - A abertura de novas vistorias segue exatamente os mesmos horários de corte do balcão (até às 11:30 no turno da manhã e até às 16:30 no turno da tarde), garantindo tempo hábil para a conclusão técnica antes do fechamento às 12:00 e às 17:00.

# ESCOPO DE SERVIÇOS (EXCLUSIVO VEÍCULOS)
1. Você responde EXCLUSIVAMENTE sobre serviços registrais de VEÍCULOS (Transferência de propriedade, Primeiro Emplacamento, Vistorias, Emissão de CRLV-e, ATPV-e, Alteração de características, Restrições/Gravames, Baixa de veículos, etc.).
2. HABILITAÇÃO / CNH: Se o usuário perguntar sobre habilitação (primeira habilitação, renovação de CNH, reciclagem, pontuação do condutor):
   - Esclareça com gentileza que o CRVA atende exclusivamente questões cadastrais e documentais de VEÍCULOS, orientando o usuário a procurar um CFC (Centro de Formação de Condutores) ou a Central de Serviços do Detran/RS.

# DIRETRIZES DE COMUNICAÇÃO E TOM DE VOZ
- Tom de voz: Empático, seguro, profissional, acolhedor e resolutivo.
- Linguagem: Clara e acessível. Traduza exigências burocráticas em instruções práticas.
- Proibições textuais: NUNCA mencione siglas operacionais internas ou códigos de procedimentos como "POP", "POP 02", "POP 07", "Procedimento Operacional Padrão".
- Formato no WhatsApp: Utilize parágrafos curtos, mensagens diretas e tópicos com marcadores simples (-) para listas de documentos ou etapas.

# PRIVACIDADE E LGPD (LEI GERAL DE PROTEÇÃO DE DADOS)
1. Não solicite dados excessivos. No canal aberto de mensagens, NUNCA exija fotos de cartões bancários, senhas do Gov.br ou documentos com dados sensíveis não necessários à consulta preliminar.
2. Consultas de dados de veículos (situação, débitos, pendências ou restrições) só devem ser informadas mediante fornecimento da Placa e Renavam pelo interessado legítimo.
3. Não exponha dados de proprietários anteriores ou de terceiros.

# DIRETRIZES TÉCNICAS E REGRAS OPERACIONAIS DE VEÍCULOS (BASE DETRAN/RS)
1. Documentos Pessoais, Residência e Despachantes:
   - Identificação aceita: RG, CNH (inclusive vencida), carteiras de identidade profissional válidas e documento digital com validação por QR-Code (VIO/Gov.br).
   - Não são aceitas: Carteira de Trabalho digital sem foto ou documentos digitais impressos em papel.
   - Comprovante de endereço recente (emitido nos últimos 90 dias) ou declaração de residência preenchida sob as penas da lei.
   - Pessoa Jurídica (PJ): comprovante do CNPJ e contrato social com poderes de administração.
   - Despachante Documentalista (DDT): credencial válida do CRDD e GRT (física ou eletrônica) assinada pelo cliente.
2. Transferência de Propriedade:
   - Prazo legal de 30 dias corridos após a compra para evitar multa de averbação.
   - Veículo "verde" (papel-moeda anterior a 2021): CRV original físico preenchido, com reconhecimento de firma por autenticidade de vendedor e comprador.
   - Veículo "branco" (digital/CRLV-e a partir de 2021): ATPV-e com assinatura física (firma reconhecida por autenticidade) ou assinatura digital (Carteira Digital de Trânsito / Gov.br prata ou ouro) — vedada assinatura híbrida.
   - Vistoria veicular prévia obrigatória e quitação integral de IPVA corrente, taxa GAD-E e multas vencidas.
3. Primeiro Emplacamento (Veículo Zero Km):
   - Exige DANFe, documentos do comprador e comprovante de endereço; pré-cadastro completo e NF emitida há no máximo 30 dias dispensam vistoria (mantidas características originais).
4. Vistoria de Identificação Veicular:
   - Abertura até 11:30 (manhã) e 16:30 (tarde). Validade de 30 dias corridos. Reprovação por itens sanáveis dá direito a reapresentação no mesmo CRVA em até 30 dias sem nova taxa.
5. Emissão e Liberação de Documento:
   - Documento vigente é o CRLV-e digital, liberado após compensação das taxas (GAD-E/licenciamento), validação de vistoria e conclusão do processo.

# CRITÉRIOS PARA ENCAMINHAMENTO AO ATENDIMENTO HUMANO
Transfira o atendimento imediatamente para a equipe humana nas seguintes situações:
1. Casos Jurídicos Complexos (óbito/inventário, herdeiros múltiplos, alvará ou determinação judicial, leilão judicial ou Receita Federal).
2. Irregularidades ou Bloqueios Graves (divergência de chassi/motor, furto/roubo, bloqueios policiais/RENAJUD, suspeita de clonagem).
3. Falhas Sistêmicas, Emissão de Documentos, Consultas de Débitos/Situação ou Pedido Expresso para falar com atendente humano.

Mensagem padrão de transferência humana:
"Para garantir a análise correta e segura do seu caso, vou transferir o seu atendimento para um de nossos atendentes especializados aqui do CRVA. Por favor, aguarde um instante que logo você será respondido!"

# FLUXO DA RESPOSTA PADRÃO
1. Saudação acolhedora e identificação como Antonella, atendente virtual do CRVA (apenas quando o cidadão iniciar contato).
2. Identificação precisa da dúvida sobre o veículo.
3. Resposta direta: etapas simples, documentos necessários, taxas (GAD-E) e horários de atendimento/vistoria, quando pertinente.
4. Próximo passo claro ou encaminhamento humano, se necessário.`;

const DEFAULT_CONFIG: AiConfig = {
  activeProvider: 'gemini',
  geminiApiKey: (
    import.meta.env.VITE_GEMINI_API_KEY ||
    import.meta.env.GEMINI_API_KEY ||
    'AIzaSyB8Z7F44LFaR1klShWb8VFGD0VK3lP5y9Y'
  ).trim(),
  groqApiKey: (
    import.meta.env.VITE_GROQ_API_KEY ||
    import.meta.env.GROQ_API_KEY ||
    ''
  ).trim(),
  autoFallback: true,
  geminiModel: 'gemini-2.5-flash',
  groqModel: 'llama-3.3-70b-versatile',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  crvaNomeCodigo: 'CRVA Credenciado • Detran/RS',
  horariosAtendimento: 'Segunda a Sexta: 08:00 às 12:00 e 13:00 às 17:00 (Senhas e Vistoria até 11:30 e 16:30)',
};

// Cache em memória
let configCache: AiConfig | null = null;

/**
 * Carrega as configurações ativas do Motor de IA.
 */
export function getAiConfig(): AiConfig {
  if (configCache) return { ...configCache };

  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    if (salvo) {
      const parsed = JSON.parse(salvo);
      configCache = {
        ...DEFAULT_CONFIG,
        ...parsed,
        // Garante que se a chave do storage estiver vazia, usa a do env se houver
        geminiApiKey: parsed.geminiApiKey || DEFAULT_CONFIG.geminiApiKey,
        groqApiKey: parsed.groqApiKey || DEFAULT_CONFIG.groqApiKey,
      };
      return { ...configCache };
    }
  } catch (e) {
    console.warn('[aiRouterService] Falha ao ler localStorage:', e);
  }

  configCache = { ...DEFAULT_CONFIG };
  return { ...configCache };
}

/**
 * Salva as configurações atualizadas no localStorage e no Supabase.
 */
export async function saveAiConfig(novosDados: Partial<AiConfig>): Promise<AiConfig> {
  const atual = getAiConfig();
  const atualizado: AiConfig = {
    ...atual,
    ...novosDados,
  };

  configCache = atualizado;

  // 1. Salva no localStorage para disponibilidade instantânea
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(atualizado));
  } catch (e) {
    console.warn('[aiRouterService] Falha ao gravar no localStorage:', e);
  }

  // 2. Sincroniza de forma assíncrona com o Supabase (tabela crm_configuracoes)
  try {
    await supabase.from('crm_configuracoes').upsert({
      chave: 'ai_engine_config',
      valor: {
        activeProvider: atualizado.activeProvider,
        autoFallback: atualizado.autoFallback,
        geminiModel: atualizado.geminiModel,
        groqModel: atualizado.groqModel,
        systemPrompt: atualizado.systemPrompt,
        crvaNomeCodigo: atualizado.crvaNomeCodigo,
        horariosAtendimento: atualizado.horariosAtendimento,
        // Chaves parciais salvas para compartilhamento entre terminais (ou chave completa se configurado)
        temGeminiKey: !!atualizado.geminiApiKey,
        temGroqKey: !!atualizado.groqApiKey,
        atualizado_em: new Date().toISOString(),
      },
      atualizado_em: new Date().toISOString(),
    });
  } catch (e) {
    // Falha silenciosa no Supabase para não travar uso local
    console.debug('[aiRouterService] Aviso ao persistir no Supabase:', e);
  }

  return { ...atualizado };
}

// ============================================================================
// ADAPTER GOOGLE GEMINI (API OFICIAL GOOGLE AI STUDIO)
// ============================================================================
async function callGeminiApi(
  apiKey: string,
  model: string,
  params: AiPromptParams
): Promise<{ text: string; tokensInput: number; tokensOutput: number }> {
  if (!apiKey) {
    throw new Error('Chave de API do Google Gemini não configurada.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Monta histórico de mensagens
  const contents: any[] = [];

  if (params.historico && params.historico.length > 0) {
    for (const h of params.historico) {
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      });
    }
  }

  contents.push({
    role: 'user',
    parts: [{ text: params.userMessage }],
  });

  const body: any = {
    contents,
    generationConfig: {
      temperature: params.temperature ?? 0.3,
      maxOutputTokens: params.maxTokens ?? 1024,
    },
  };

  if (params.systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: params.systemPrompt }],
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msgErro = `Gemini API erro (${response.status}): ${response.statusText}`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) {
        msgErro = `Gemini: ${parsed.error.message}`;
      }
    } catch {
      // Ignora erro de parse
    }
    throw new Error(msgErro);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokensInput = data?.usageMetadata?.promptTokenCount || Math.ceil(params.userMessage.length / 4);
  const tokensOutput = data?.usageMetadata?.candidatesTokenCount || Math.ceil(text.length / 4);

  return { text, tokensInput, tokensOutput };
}

// ============================================================================
// ADAPTER GROQ CLOUD (API COMPATÍVEL OPENAI)
// ============================================================================
async function callGroqApi(
  apiKey: string,
  model: string,
  params: AiPromptParams
): Promise<{ text: string; tokensInput: number; tokensOutput: number }> {
  if (!apiKey) {
    throw new Error('Chave de API da Groq Cloud não configurada.');
  }

  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  const messages: { role: string; content: string }[] = [];

  if (params.systemPrompt) {
    messages.push({ role: 'system', content: params.systemPrompt });
  }

  if (params.historico && params.historico.length > 0) {
    for (const h of params.historico) {
      messages.push({ role: h.role, content: h.content });
    }
  }

  messages.push({ role: 'user', content: params.userMessage });

  const body = {
    model: model || 'llama-3.3-70b-versatile',
    messages,
    temperature: params.temperature ?? 0.3,
    max_tokens: params.maxTokens ?? 1024,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msgErro = `Groq API erro (${response.status}): ${response.statusText}`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) {
        msgErro = `Groq: ${parsed.error.message}`;
      }
    } catch {
      // Ignora erro de parse
    }
    throw new Error(msgErro);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || '';
  const tokensInput = data?.usage?.prompt_tokens || Math.ceil(params.userMessage.length / 4);
  const tokensOutput = data?.usage?.completion_tokens || Math.ceil(text.length / 4);

  return { text, tokensInput, tokensOutput };
}

// ============================================================================
// MOTOR CENTRAL DE ROTEAMENTO COM FAILOVER AUTOMÁTICO
// ============================================================================
/**
 * Executa a inferência de IA roteando para o provedor ativo configurado.
 * Em caso de falha de cota (429) ou erro de servidor, aciona automaticamente
 * o motor de contingência (fallback) se habilitado.
 */
export async function generateAiResponse(params: AiPromptParams): Promise<AiResponseResult> {
  const config = getAiConfig();
  const primaryProvider: AiProvider = params.forcedProvider || config.activeProvider;
  const secondaryProvider: AiProvider = primaryProvider === 'gemini' ? 'groq' : 'gemini';

  // Injeção de Contexto da Base de Conhecimento (RAG leve)
  const baseConhecimento = montarContextoBaseConhecimento();
  let promptBase = (params.systemPrompt || config.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();
  
  if (config.crvaNomeCodigo || config.horariosAtendimento) {
    const dadosUnidade = [
      '\n\n[DADOS OPERACIONAIS DA UNIDADE REGISTRAL]',
      config.crvaNomeCodigo ? `- Unidade/Posto: ${config.crvaNomeCodigo}` : null,
      config.horariosAtendimento ? `- Horário de Atendimento e Vistoria: ${config.horariosAtendimento}` : null,
    ].filter(Boolean).join('\n');
    promptBase += dadosUnidade;
  }

  const systemPromptFinal = baseConhecimento
    ? `${promptBase}\n\n${baseConhecimento}`.trim()
    : promptBase;

  const paramsEnriquecidos: AiPromptParams = {
    ...params,
    systemPrompt: systemPromptFinal,
  };

  const inicioMs = Date.now();

  // 1. Tentativa no Provedor Principal
  try {
    if (primaryProvider === 'gemini') {
      const result = await callGeminiApi(config.geminiApiKey, config.geminiModel, paramsEnriquecidos);
      const latenciaMs = Date.now() - inicioMs;
      return {
        text: result.text,
        providerUsed: 'gemini',
        modeloUsado: config.geminiModel,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        latenciaMs,
        fallbackAcionado: false,
      };
    } else {
      const result = await callGroqApi(config.groqApiKey, config.groqModel, paramsEnriquecidos);
      const latenciaMs = Date.now() - inicioMs;
      return {
        text: result.text,
        providerUsed: 'groq',
        modeloUsado: config.groqModel,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        latenciaMs,
        fallbackAcionado: false,
      };
    }
  } catch (primaryError: any) {
    console.warn(
      `[aiRouterService] ⚠️ Falha no provedor primário (${primaryProvider.toUpperCase()}):`,
      primaryError?.message || primaryError
    );

    // 2. Se o fallback estiver desativado ou não houver chave secundária, propaga o erro
    const chaveSecundaria = secondaryProvider === 'gemini' ? config.geminiApiKey : config.groqApiKey;
    if (!config.autoFallback || !chaveSecundaria) {
      throw primaryError;
    }

    console.info(
      `[aiRouterService] 🔄 Acionando Failover Automático para ${secondaryProvider.toUpperCase()}...`
    );

    // 3. Tentativa no Provedor Secundário (Fallback)
    try {
      if (secondaryProvider === 'gemini') {
        const result = await callGeminiApi(config.geminiApiKey, config.geminiModel, paramsEnriquecidos);
        const latenciaMs = Date.now() - inicioMs;
        return {
          text: result.text,
          providerUsed: 'gemini',
          modeloUsado: config.geminiModel,
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
          latenciaMs,
          fallbackAcionado: true,
        };
      } else {
        const result = await callGroqApi(config.groqApiKey, config.groqModel, paramsEnriquecidos);
        const latenciaMs = Date.now() - inicioMs;
        return {
          text: result.text,
          providerUsed: 'groq',
          modeloUsado: config.groqModel,
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
          latenciaMs,
          fallbackAcionado: true,
        };
      }
    } catch (secondaryError: any) {
      console.error(
        `[aiRouterService] ❌ Falha crítica em ambos os provedores (${primaryProvider} e ${secondaryProvider}):`,
        secondaryError
      );
      throw new Error(
        `Todos os provedores falharam. Primário (${primaryProvider}): ${primaryError?.message}. Secundário (${secondaryProvider}): ${secondaryError?.message}`
      );
    }
  }
}

// ============================================================================
// FERRAMENTA DE TESTE DE CONEXÃO EM TEMPO REAL
// ============================================================================
/**
 * Testa a conexão e credenciais de um provedor específico enviando prompt curto ("Responda apenas: OK").
 */
export async function testarConexaoAi(
  provider: AiProvider,
  apiKeyCustomizada?: string
): Promise<TesteConexaoResult> {
  const config = getAiConfig();
  const apiKey = (apiKeyCustomizada !== undefined ? apiKeyCustomizada : (provider === 'gemini' ? config.geminiApiKey : config.groqApiKey)).trim();
  const modelo = provider === 'gemini' ? config.geminiModel : config.groqModel;

  if (!apiKey) {
    return {
      sucesso: false,
      provider,
      modelo,
      latenciaMs: 0,
      erro: `Chave de API do ${provider === 'gemini' ? 'Google Gemini' : 'Groq Cloud'} não informada.`,
    };
  }

  const inicio = Date.now();
  try {
    let respostaTexto = '';
    if (provider === 'gemini') {
      const resp = await callGeminiApi(apiKey, modelo, {
        systemPrompt: 'Você é um validador de infraestrutura. Responda estritamente a palavra OK.',
        userMessage: 'Responda apenas: OK',
        temperature: 0.1,
        maxTokens: 10,
      });
      respostaTexto = resp.text.trim();
    } else {
      const resp = await callGroqApi(apiKey, modelo, {
        systemPrompt: 'Você é um validador de infraestrutura. Responda estritamente a palavra OK.',
        userMessage: 'Responda apenas: OK',
        temperature: 0.1,
        maxTokens: 10,
      });
      respostaTexto = resp.text.trim();
    }

    const latenciaMs = Date.now() - inicio;
    return {
      sucesso: true,
      provider,
      modelo,
      latenciaMs,
      resposta: respostaTexto,
    };
  } catch (error: any) {
    const latenciaMs = Date.now() - inicio;
    return {
      sucesso: false,
      provider,
      modelo,
      latenciaMs,
      erro: error?.message || 'Falha desconhecida ao conectar ao provedor.',
    };
  }
}
