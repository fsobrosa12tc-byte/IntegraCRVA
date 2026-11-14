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

  try {
    await supabase.from('crm_configuracoes').upsert({
      chave: 'ai_knowledge_base',
      valor: {
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
      },
      atualizado_em: new Date().toISOString(),
    });
  } catch (e) {
    console.debug('[aiKnowledgeService] Aviso ao sincronizar com Supabase:', e);
  }

  return [...docs];
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
 * Realiza o upload, extração textual no backend (ou fallback local) e salva na base.
 */
export async function uploadKnowledgeDocument(file: File): Promise<KnowledgeDocument> {
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

  // 1. Tenta extrair pelo backend Express (/api/ai/knowledge-base)
  try {
    const base64 = await fileToBase64(file);
    let textoLocal = '';
    if (ext === 'txt' || ext === 'md') {
      textoLocal = await file.text();
    }

    const res = await fetch('/api/ai/knowledge-base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: nomeArquivo,
        tipo: ext,
        tamanhoBytes: file.size,
        base64,
        texto: textoLocal,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.sucesso && data.documento?.conteudoTexto) {
        conteudoTexto = data.documento.conteudoTexto;
      }
    }
  } catch (err) {
    console.warn('[aiKnowledgeService] Backend não respondeu, tentando fallback local...', err);
  }

  // 2. Fallback local para .txt e .md caso o backend esteja indisponível
  if (!conteudoTexto && (ext === 'txt' || ext === 'md')) {
    conteudoTexto = await file.text();
  }

  if (!conteudoTexto.trim()) {
    throw new Error(
      `Não foi possível extrair o texto de "${nomeArquivo}". Verifique se o arquivo não está corrompido ou protegido.`
    );
  }

  // Limpeza de espaços excessivos
  conteudoTexto = conteudoTexto
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
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
