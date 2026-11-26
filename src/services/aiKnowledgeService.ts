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
  file_name?: string;
  tamanhoFormatado: string;
  tamanhoBytes: number;
  tipo: 'pdf' | 'txt' | 'md' | 'csv' | 'outro';
  file_type?: string;
  storage_path?: string;
  conteudoTexto: string;
  content_text?: string;
  active: boolean;
  status?: 'indexado' | 'ativo' | 'inativo';
  criadoEm: string;
  created_at?: string;
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
    }).catch(() => { });
  } catch { }

  // Sincronização persistente com o Supabase (fonte única de verdade)
  try {
    const payloadDocs = {
      totalDocumentos: docs.length,
      documentos: docs.map((d) => ({
        id: d.id,
        nome: d.nome || d.file_name || 'documento',
        file_name: d.file_name || d.nome,
        tamanhoFormatado: d.tamanhoFormatado,
        tamanhoBytes: d.tamanhoBytes,
        tipo: d.tipo || d.file_type || 'txt',
        file_type: d.file_type || d.tipo,
        storage_path: d.storage_path,
        conteudoTexto: d.conteudoTexto || d.content_text,
        content_text: d.content_text || d.conteudoTexto,
        active: d.active ?? true,
        status: (d.active ?? true) ? 'ativo' : 'inativo',
        criadoEm: d.criadoEm || d.created_at,
        created_at: d.created_at || d.criadoEm,
      })),
      atualizado_em: new Date().toISOString(),
    };

    // Tenta atualizar/inserir em public.ai_knowledge_docs
    try {
      for (const d of docs) {
        const isUuid = typeof d.id === 'string' && d.id.includes('-') && d.id.length === 36;
        await supabase.from('ai_knowledge_docs').upsert({
          ...(isUuid ? { id: d.id } : {}),
          file_name: d.nome || d.file_name || 'documento',
          file_type: d.tipo || d.file_type || 'txt',
          storage_path: d.storage_path || null,
          content_text: d.conteudoTexto || d.content_text || '',
          active: d.active ?? true,
        });
      }
    } catch { }

    // Tenta crm_configuracoes
    try {
      await supabase.from('crm_configuracoes').upsert({
        chave: 'ai_knowledge_base',
        valor: payloadDocs,
        atualizado_em: new Date().toISOString(),
      });
    } catch { }

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
 * Prioridade: 1. public.ai_knowledge_docs -> 2. __SYS_AI_KB__ -> 3. crm_configuracoes
 */
export async function carregarKnowledgeDocumentsDoSupabase(): Promise<KnowledgeDocument[]> {
  try {
    // 1. Tenta consulta oficial na tabela public.ai_knowledge_docs
    const { data: dbRows, error: dbErr } = await supabase
      .from('ai_knowledge_docs')
      .select('*')
      .order('created_at', { ascending: false });

    if (!dbErr && Array.isArray(dbRows) && dbRows.length > 0) {
      const docsMapeados: KnowledgeDocument[] = dbRows.map((r: any) => ({
        id: r.id,
        nome: r.file_name || 'Documento',
        file_name: r.file_name,
        tamanhoFormatado: formatarTamanhoBytes(r.content_text?.length || 0),
        tamanhoBytes: r.content_text?.length || 0,
        tipo: (r.file_type || 'txt') as any,
        file_type: r.file_type,
        storage_path: r.storage_path,
        conteudoTexto: r.content_text || '',
        content_text: r.content_text || '',
        active: r.active ?? true,
        status: (r.active ?? true) ? 'ativo' : 'inativo',
        criadoEm: r.created_at || new Date().toISOString(),
        created_at: r.created_at,
      }));
      memoryDocsCache = docsMapeados;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(docsMapeados));
      return docsMapeados;
    }

    // 2. Tenta crm_atendimentos (__SYS_AI_KB__)
    const { data: sysRow } = await supabase
      .from('crm_atendimentos')
      .select('ultima_mensagem')
      .eq('telefone', '__SYS_AI_KB__')
      .maybeSingle();

    if (sysRow?.ultima_mensagem) {
      const parsed = JSON.parse(sysRow.ultima_mensagem);
      if (Array.isArray(parsed?.documentos) && parsed.documentos.length > 0) {
        const mapeados: KnowledgeDocument[] = parsed.documentos.map((d: any) => ({
          ...d,
          active: d.active ?? d.status !== 'inativo',
          status: (d.active ?? d.status !== 'inativo') ? 'ativo' : 'inativo',
        }));
        memoryDocsCache = mapeados;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mapeados));
        return [...memoryDocsCache];
      }
    }

    // 3. Tenta crm_configuracoes
    const { data: cfgRow } = await supabase
      .from('crm_configuracoes')
      .select('valor')
      .eq('chave', 'ai_knowledge_base')
      .maybeSingle();

    if (Array.isArray(cfgRow?.valor?.documentos)) {
      const mapeados: KnowledgeDocument[] = cfgRow.valor.documentos.map((d: any) => ({
        ...d,
        active: d.active ?? d.status !== 'inativo',
        status: (d.active ?? d.status !== 'inativo') ? 'ativo' : 'inativo',
      }));
      memoryDocsCache = mapeados;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryDocsCache));
      return [...memoryDocsCache];
    }
  } catch (err) {
    console.warn('[aiKnowledgeService] Falha ao carregar documentos do Supabase:', err);
  }

  return getKnowledgeDocuments();
}

/**
 * Altera o estado Ativo/Inativo de um documento da Base de Conhecimento.
 */
export async function toggleDocumentoAtivo(id: string, active: boolean): Promise<KnowledgeDocument[]> {
  const atuais = getKnowledgeDocuments();
  const atualizados = atuais.map((d) =>
    d.id === id ? { ...d, active, status: (active ? 'ativo' : 'inativo') as any } : d
  );

  memoryDocsCache = atualizados;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(atualizados));

  // Tenta atualizar em public.ai_knowledge_docs
  try {
    await supabase.from('ai_knowledge_docs').update({ active }).eq('id', id);
  } catch { }

  return await persistirDocumentos(atualizados);
}

/**
 * Remove um documento da Base de Conhecimento pelo ID e do Supabase Storage.
 */
export async function deleteKnowledgeDocument(id: string, storagePath?: string): Promise<KnowledgeDocument[]> {
  const atuais = getKnowledgeDocuments();
  const docAlvo = atuais.find((d) => d.id === id);
  const filtrados = atuais.filter((d) => d.id !== id);

  memoryDocsCache = filtrados;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtrados));

  // Tenta deletar no Supabase ai_knowledge_docs
  try {
    await supabase.from('ai_knowledge_docs').delete().eq('id', id);
    const pathRemover = storagePath || docAlvo?.storage_path;
    if (pathRemover && !pathRemover.startsWith('local/')) {
      await supabase.storage.from('ai-training').remove([pathRemover]);
    }
  } catch { }

  // Notifica o backend se disponível
  try {
    await fetch(`/api/ai/knowledge-base/${id}`, { method: 'DELETE' });
  } catch { }

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

  const modelosTentar = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];
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
      } catch { }

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

  if (!['txt', 'md', 'pdf', 'csv'].includes(ext)) {
    throw new Error('Formato não suportado. Utilize apenas arquivos .TXT, .MD, .PDF ou .CSV.');
  }

  let conteudoTexto = '';

  // 1. Arquivos .TXT, .MD ou .CSV: Leitura instantânea no frontend sem latência
  if (['txt', 'md', 'csv'].includes(ext)) {
    if (onStatusChange) onStatusChange('Lendo arquivo de texto/dados...');
    conteudoTexto = await file.text();
  }

  // 2. Arquivos .PDF: Extração nativa com IA (Google Gemini 2.5 Flash via Server-side com fallback client-side)
  if (ext === 'pdf') {
    if (onStatusChange) onStatusChange('Extraindo conteúdo do documento via IA...');
    const base64 = await fileToBase64(file);

    // 2.1 Tenta rota backend oficial /api/ai/extract-pdf (usando pdf-parse + Gemini multimodal)
    try {
      const aiConfig = getAiConfig();
      const res = await fetch('/api/ai/extract-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64,
          fileName: nomeArquivo,
          geminiApiKey: aiConfig.geminiApiKey,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.sucesso && data.text) {
          conteudoTexto = data.text;
        }
      }
    } catch (errBackend) {
      console.warn('[aiKnowledgeService] Rota /api/ai/extract-pdf indisponível, acionando fallback local...', errBackend);
    }

    // 2.2 Fallback: Extração nativa com Google Gemini Flash no cliente (inlineData application/pdf)
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

  // 3. Upload do arquivo binário para o bucket 'ai-training' no Supabase Storage
  if (onStatusChange) onStatusChange('Enviando arquivo para o Supabase Storage (ai-training)...');
  const safeName = nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  let storagePath = `ai-training/${Date.now()}_${safeName}`;
  try {
    const { error: upErr } = await supabase.storage
      .from('ai-training')
      .upload(storagePath, file, { upsert: true });
    if (upErr) {
      storagePath = `local/${nomeArquivo}`;
    }
  } catch {
    storagePath = `local/${nomeArquivo}`;
  }

  // 4. Registro no banco de dados Supabase na tabela public.ai_knowledge_docs
  if (onStatusChange) onStatusChange('Indexando documento no Supabase...');
  let docId = crypto.randomUUID();
  try {
    const { data: inserted, error: insErr } = await supabase
      .from('ai_knowledge_docs')
      .insert({
        file_name: nomeArquivo,
        file_type: ext,
        storage_path: storagePath,
        content_text: conteudoTexto,
        active: true,
      })
      .select()
      .single();

    if (!insErr && inserted?.id) {
      docId = inserted.id;
    }
  } catch {
    // ai_knowledge_docs pode não existir fisicamente ainda
  }

  const agoraIso = new Date().toISOString();
  const novoDoc: KnowledgeDocument = {
    id: docId,
    nome: nomeArquivo,
    file_name: nomeArquivo,
    tamanhoFormatado: formatarTamanhoBytes(file.size),
    tamanhoBytes: file.size,
    tipo: ext as any,
    file_type: ext,
    storage_path: storagePath,
    conteudoTexto,
    content_text: conteudoTexto,
    active: true,
    status: 'ativo',
    criadoEm: agoraIso,
    created_at: agoraIso,
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
