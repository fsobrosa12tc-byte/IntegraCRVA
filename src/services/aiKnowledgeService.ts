/**
 * ============================================================================
 * MARKS SYSTEMS · CRM-INTEGRA · AI KNOWLEDGE BASE SERVICE
 * ============================================================================
 * Serviço de gerenciamento e injeção da Base de Conhecimento do Agente de IA.
 * Permite o upload de arquivos (.txt, .md, .pdf), extração textual e injeção
 * automática no contexto do sistema sob a tag <documentos_referencia>.
 * ============================================================================
 */

import { supabase } from '../lib/supabase';
import { getAiConfig } from './aiRouterService';

export interface KnowledgeDocument {
  id: string;
  nome: string;
  tamanhoFormatado: string;
  tamanhoBytes: number;
  tipo: 'pdf' | 'txt' | 'md' | 'outro';
  conteudoTexto: string;
  status: 'indexado' | 'ativo';
  criadoEm: string;
}

const STORAGE_KEY = 'crm_ai_knowledge_docs_v1';
const LIMITE_CARACTERES_CONTEXTO = 14000; // ~3.500 tokens de segurança

let memoryDocsCache: KnowledgeDocument[] | null = null;

export function formatarTamanhoBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Retorna os documentos anexados à Base de Conhecimento do Agente.
 */
export function getKnowledgeDocuments(): KnowledgeDocument[] {
  if (memoryDocsCache) return [...memoryDocsCache];

  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    if (salvo) {
      const parsed: KnowledgeDocument[] = JSON.parse(salvo);
      if (Array.isArray(parsed)) {
        memoryDocsCache = parsed;
        return [...memoryDocsCache];
      }
    }
  } catch (e) {
    console.warn('[aiKnowledgeService] Falha ao ler localStorage:', e);
  }

  memoryDocsCache = [];
  return [];
}

/**
 * Salva a lista de documentos no localStorage e no Supabase.
 */
export async function persistirDocumentos(docs: KnowledgeDocument[]): Promise<KnowledgeDocument[]> {
  memoryDocsCache = docs;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  } catch (e) {
    console.warn('[aiKnowledgeService] Falha ao persistir no localStorage:', e);
  }

  // Sincroniza com o backend do webhook (/api/ai/knowledge-base/sync)
  try {
    fetch('/api/ai/knowledge-base/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalDocumentos: docs.length,
        documentos: docs,
        atualizado_em: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {}

  // Sincronização persistente com o Supabase (fonte única de verdade)
  try {
    const payloadDocs = {
      totalDocumentos: docs.length,
      documentos: docs.map((d) => ({
        id: d.id,
        nome: d.nome,
        tamanhoFormatado: d.tamanhoFormatado,
        tamanhoBytes: d.tamanhoBytes,
        tipo: d.tipo,
        conteudoTexto: d.conteudoTexto,
        status: d.status,
        criadoEm: d.criadoEm,
      })),
      atualizado_em: new Date().toISOString(),
    };

    // Tenta crm_configuracoes
    try {
      await supabase.from('crm_configuracoes').upsert({
        chave: 'ai_knowledge_base',
        valor: payloadDocs,
        atualizado_em: new Date().toISOString(),
      });
    } catch {
      // Ignora se tabela crm_configuracoes não existir
    }

    // Garante persistência em crm_atendimentos como registro de sistema imutável
    await supabase.from('crm_atendimentos').upsert({
      id: '00000000-0000-0000-0000-000000000002',
      telefone: '__SYS_AI_KB__',
      nome_cliente: 'Base Conhecimento Antonella',
      status_coluna: 'sistema',
      ultima_mensagem: JSON.stringify(payloadDocs),
      categoria: 'sistema',
      ultima_interacao_em: new Date().toISOString(),
    }, { onConflict: 'telefone' });
  } catch (e) {
    console.warn('[aiKnowledgeService] Aviso ao sincronizar com Supabase:', e);
  }

  return [...docs];
}

/**
 * Carrega os documentos mais recentes da Base de Conhecimento do Supabase.
 */
export async function carregarKnowledgeDocumentsDoSupabase(): Promise<KnowledgeDocument[]> {
  try {
    // 1. Tenta crm_configuracoes
    const { data: cfgRow } = await supabase
      .from('crm_configuracoes')
      .select('valor')
      .eq('chave', 'ai_knowledge_base')
      .maybeSingle();

    if (Array.isArray(cfgRow?.valor?.documentos)) {
      memoryDocsCache = cfgRow.valor.documentos;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryDocsCache));
      return [...memoryDocsCache];
    }

    // 2. Tenta crm_atendimentos (__SYS_AI_KB__)
    const { data: sysRow } = await supabase
      .from('crm_atendimentos')
      .select('ultima_mensagem')
      .eq('telefone', '__SYS_AI_KB__')
      .maybeSingle();

    if (sysRow?.ultima_mensagem) {
      const parsed = JSON.parse(sysRow.ultima_mensagem);
      if (Array.isArray(parsed?.documentos)) {
        memoryDocsCache = parsed.documentos;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryDocsCache));
        return [...memoryDocsCache];
      }
    }
  } catch (err) {
    console.warn('[aiKnowledgeService] Falha ao carregar documentos do Supabase:', err);
  }

  // Se não havia registros no Supabase, promove os documentos locais existentes para o Supabase
  const docsLocais = getKnowledgeDocuments();
  if (docsLocais && docsLocais.length > 0) {
    persistirDocumentos(docsLocais).catch(() => {});
  }

  return docsLocais;
}

/**
 * Remove um documento da Base de Conhecimento pelo ID.
 */
export async function deleteKnowledgeDocument(id: string): Promise<KnowledgeDocument[]> {
  const atuais = getKnowledgeDocuments();
  const filtrados = atuais.filter((d) => d.id !== id);

  // Notifica o backend se disponível
  try {
    await fetch(`/api/ai/knowledge-base/${id}`, { method: 'DELETE' });
  } catch {}

  return await persistirDocumentos(filtrados);
}

/**
 * Converte um arquivo File em string Base64.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove o cabeçalho data:...;base64,
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Extração de texto de PDF diretamente via Google Gemini 2.5 Flash (multimodal com application/pdf).
 * Transcreve com fidelidade absoluta todo o conteúdo legível sem resumos ou omissões.
 */
export async function extrairTextoPdfViaGemini(
  base64: string,
  nomeArquivo: string
): Promise<string> {
  const aiConfig = getAiConfig();
  const apiKey = (
    aiConfig.geminiApiKey ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    import.meta.env.GEMINI_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    throw new Error(
      'Chave de API do Google Gemini não encontrada para processar o PDF. Configure sua chave no painel do Motor de IA.'
    );
  }

  const modelosTentar = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let ultimoErro: any = null;

  for (const mod of modelosTentar) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${mod}:generateContent?key=${apiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: base64,
                  },
                },
                {
                  text: `Você é um extrator técnico do Marks Systems. Transcreva de forma integral, estruturada e fiel todo o conteúdo textual legível deste documento PDF "${nomeArquivo}" (incluindo títulos, artigos, tabelas de valores, regras, taxas e observações). Não faça resumos, não omita seções e não invente dados. Retorne exclusivamente o texto extraído do documento.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (texto.trim()) return texto.trim();
      }

      const errorText = await response.text().catch(() => '');
      let msg = `Erro HTTP ${response.status} na API do Gemini (${mod})`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {}

      if (response.status === 404 || msg.includes('no longer available') || msg.includes('not found')) {
        ultimoErro = new Error(msg);
        continue;
      }

      throw new Error(`Falha na extração com Gemini: ${msg}`);
    } catch (err: any) {
      ultimoErro = err;
      if (err?.message?.includes('no longer available') || err?.message?.includes('404')) {
        continue;
      }
      throw err;
    }
  }

  throw ultimoErro || new Error('Não foi possível extrair PDF via Gemini.');
}

/**
 * Realiza o upload, extração textual nativa (Gemini para PDF, direto para TXT/MD) e salva na base.
 */
export async function uploadKnowledgeDocument(
  file: File,
  onStatusChange?: (status: string) => void
): Promise<KnowledgeDocument> {
  const maxBytes = 5 * 1024 * 1024; // 5MB
  if (file.size > maxBytes) {
    throw new Error(`O arquivo excede o limite máximo permitido de 5MB (${formatarTamanhoBytes(file.size)}).`);
  }

  const nomeArquivo = file.name;
  const ext = nomeArquivo.split('.').pop()?.toLowerCase() || '';

  if (!['txt', 'md', 'pdf'].includes(ext)) {
    throw new Error('Formato não suportado. Utilize apenas arquivos .TXT, .MD ou .PDF.');
  }

  let conteudoTexto = '';

  // 1. Arquivos .TXT ou .MD: Leitura instantânea no frontend sem latência
  if (ext === 'txt' || ext === 'md') {
    if (onStatusChange) onStatusChange('Lendo arquivo de texto...');
    conteudoTexto = await file.text();
  }

  // 2. Arquivos .PDF: Extração nativa com IA (Google Gemini 2.5 Flash via Server-side com fallback client-side)
  if (ext === 'pdf') {
    if (onStatusChange) onStatusChange('Extraindo conteúdo do documento via IA...');
    const base64 = await fileToBase64(file);

    // 2.1 Tenta rota backend Express /api/ai/extract-document (ou /api/ai/knowledge-base)
    try {
      const aiConfig = getAiConfig();
      const res = await fetch('/api/ai/extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nomeArquivo,
          tipo: 'pdf',
          tamanhoBytes: file.size,
          base64,
          geminiApiKey: aiConfig.geminiApiKey,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.sucesso && (data.textoExtraido || data.documento?.conteudoTexto)) {
          conteudoTexto = data.textoExtraido || data.documento.conteudoTexto;
        }
      }
    } catch (errBackend) {
      console.warn('[aiKnowledgeService] Rota backend indisponível, acionando Gemini direto no cliente...', errBackend);
    }

    // 2.2 Fallback: Extração nativa com Google Gemini 2.5 Flash no cliente (inlineData application/pdf)
    if (!conteudoTexto || !conteudoTexto.trim()) {
      if (onStatusChange) onStatusChange('Transcrevendo documento via Google Gemini...');
      try {
        conteudoTexto = await extrairTextoPdfViaGemini(base64, nomeArquivo);
      } catch (errGemini: any) {
        console.error('[aiKnowledgeService] Erro ao extrair PDF via Gemini:', errGemini);
        throw new Error(
          `Falha ao extrair texto de "${nomeArquivo}": ${errGemini?.message || 'Arquivo corrompido, protegido ou erro de conexão com o Gemini.'}`
        );
      }
    }
  }

  if (!conteudoTexto || !conteudoTexto.trim()) {
    throw new Error(
      `Não foi possível extrair o texto de "${nomeArquivo}". Verifique se o arquivo não está corrompido ou protegido.`
    );
  }

  // Limpeza de espaços excessivos e caracteres de controle
  conteudoTexto = conteudoTexto
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim();

  const novoDoc: KnowledgeDocument = {
    id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    nome: nomeArquivo,
    tamanhoFormatado: formatarTamanhoBytes(file.size),
    tamanhoBytes: file.size,
    tipo: ext as any,
    conteudoTexto,
    status: 'ativo',
    criadoEm: new Date().toISOString(),
  };

  const atuais = getKnowledgeDocuments();
  const atualizados = [novoDoc, ...atuais];
  await persistirDocumentos(atualizados);

  return novoDoc;
}

/**
 * Concatena os documentos ativos sob a tag oficial <documentos_referencia>.
 * Mantém limite seguro de tokens para não estourar a cota gratuita da IA.
 */
export function montarContextoBaseConhecimento(maxCaracteres: number = LIMITE_CARACTERES_CONTEXTO): string {
  const docs = getKnowledgeDocuments().filter((d) => d.status === 'ativo' && d.conteudoTexto.trim());
  if (docs.length === 0) return '';

  let acumulado = '';
  let totalUsado = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const cabecalho = `\n--- [DOCUMENTO DE APOIO ${i + 1}: ${doc.nome}] ---\n`;
    const espacoRestante = maxCaracteres - totalUsado - cabecalho.length;

    if (espacoRestante <= 100) break;

    const textoDoc = doc.conteudoTexto.length > espacoRestante
      ? doc.conteudoTexto.slice(0, espacoRestante) + '\n... [Conteúdo truncado por limite de tokens]'
      : doc.conteudoTexto;

    acumulado += cabecalho + textoDoc + '\n';
    totalUsado += cabecalho.length + textoDoc.length;

    if (totalUsado >= maxCaracteres) break;
  }

  if (!acumulado.trim()) return '';

  return `\n<documentos_referencia>\nAbaixo estão tabelas oficiais, comunicados e manuais de apoio anexados pela gestão do CRVA. Utilize estas informações com prioridade para sanar dúvidas operacionais:\n${acumulado.trim()}\n</documentos_referencia>\n`;
}
