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

export type AiProvider = 'gemini' | 'groq';

export interface AiConfig {
  activeProvider: AiProvider;
  geminiApiKey: string;
  groqApiKey: string;
  autoFallback: boolean;
  geminiModel: string;
  groqModel: string;
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

  const inicioMs = Date.now();

  // 1. Tentativa no Provedor Principal
  try {
    if (primaryProvider === 'gemini') {
      const result = await callGeminiApi(config.geminiApiKey, config.geminiModel, params);
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
      const result = await callGroqApi(config.groqApiKey, config.groqModel, params);
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
        const result = await callGeminiApi(config.geminiApiKey, config.geminiModel, params);
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
        const result = await callGroqApi(config.groqApiKey, config.groqModel, params);
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
