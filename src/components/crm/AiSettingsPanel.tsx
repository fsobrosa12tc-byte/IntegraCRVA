import React, { useState, useEffect, useRef } from 'react';
import {
  Cpu,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Loader2,
  Check,
  UploadCloud,
  FileText,
  FileCode,
  Trash2,
  RotateCcw,
  X,
  Plus,
  Clock,
  Building,
} from 'lucide-react';
import {
  getAiConfig,
  saveAiConfig,
  testarConexaoAi,
  testarTodosProvedores,
  sanitizarChaveApi,
  DEFAULT_SYSTEM_PROMPT,
  type AiConfig,
  type TesteConexaoResult,
  type StatusTesteProvedores,
} from '../../services/aiRouterService';
import {
  getKnowledgeDocuments,
  uploadKnowledgeDocument,
  deleteKnowledgeDocument,
  type KnowledgeDocument,
} from '../../services/aiKnowledgeService';

interface AiSettingsPanelProps {
  onSalvo?: (config: AiConfig) => void;
  onFechar?: () => void;
}

export default function AiSettingsPanel({ onSalvo, onFechar }: AiSettingsPanelProps) {
  const [config, setConfig] = useState<AiConfig>(getAiConfig());

  // Visibilidade de chaves de API
  const [mostrarKeyGemini, setMostrarKeyGemini] = useState(false);
  const [mostrarKeyGroq, setMostrarKeyGroq] = useState(false);

  // Estados de execução e status
  const [testando, setTestando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [statusMultiProvedor, setStatusMultiProvedor] = useState<StatusTesteProvedores | null>(null);
  const [feedbackSucesso, setFeedbackSucesso] = useState<string | null>(null);

  // Estados da Base de Conhecimento (RAG)
  const [documentos, setDocumentos] = useState<KnowledgeDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [statusUploadTexto, setStatusUploadTexto] = useState<string>('Extraindo conteúdo do documento via IA...');
  const [isDragging, setIsDragging] = useState(false);
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setConfig(getAiConfig());
    setDocumentos(getKnowledgeDocuments());
  }, []);

  // Processamento de upload de arquivos para a base de conhecimento
  const processarArquivos = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setErroUpload(null);

    const lista = Array.from(files);
    let adicionados = 0;
    let ultimoErro = '';

    for (const file of lista) {
      try {
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        setStatusUploadTexto(isPdf ? 'Extraindo conteúdo do documento via IA...' : 'Lendo e indexando arquivo de texto...');
        await uploadKnowledgeDocument(file, (msg) => setStatusUploadTexto(msg));
        adicionados++;
      } catch (err: any) {
        console.error('Erro no upload de documento:', err);
        ultimoErro = err?.message || 'Falha ao processar arquivo.';
      }
    }

    setDocumentos(getKnowledgeDocuments());
    setUploading(false);

    if (ultimoErro && adicionados === 0) {
      setErroUpload(ultimoErro);
    } else if (adicionados > 0) {
      setFeedbackSucesso(`${adicionados} documento(s) indexado(s) com sucesso na Base de Conhecimento!`);
      setTimeout(() => setFeedbackSucesso(null), 3500);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processarArquivos(e.dataTransfer.files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processarArquivos(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoverDocumento = async (id: string) => {
    try {
      const atualizados = await deleteKnowledgeDocument(id);
      setDocumentos(atualizados);
    } catch (err: any) {
      alert(`Falha ao remover documento: ${err?.message || err}`);
    }
  };

  const handleSalvar = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSalvando(true);
    try {
      const atualizado = await saveAiConfig(config);
      setConfig(atualizado);
      setFeedbackSucesso('Configurações do Motor de IA salvas com sucesso!');
      if (onSalvo) onSalvo(atualizado);
      setTimeout(() => setFeedbackSucesso(null), 3500);
    } catch (err: any) {
      alert(`Erro ao salvar configurações: ${err?.message || err}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleTestarConexao = async () => {
    setTestando(true);
    setStatusMultiProvedor(null);
    try {
      const res = await testarTodosProvedores({
        geminiKey: config.geminiApiKey,
        groqKey: config.groqApiKey,
      });
      setStatusMultiProvedor(res);

      // Se a Groq ou o Gemini atualizaram seus modelos ativos, sincroniza no estado
      if (res.groq.sucesso && res.groq.modelo && res.groq.modelo !== config.groqModel) {
        setConfig((prev) => ({ ...prev, groqModel: res.groq.modelo }));
      }
      if (res.gemini.sucesso && res.gemini.modelo && res.gemini.modelo !== config.geminiModel) {
        setConfig((prev) => ({ ...prev, geminiModel: res.gemini.modelo }));
      }
    } catch (err: any) {
      console.error('[AiSettingsPanel] Erro ao testar provedores:', err);
    } finally {
      setTestando(false);
    }
  };

  const ehGemini = config.activeProvider === 'gemini';
  const textoPrompt = config.systemPrompt || '';
  const contagemCaracteres = textoPrompt.length;
  const estimativaTokens = Math.ceil(contagemCaracteres / 4);

  return (
    <div className="max-w-6xl w-full h-[86vh] max-h-[820px] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 select-none animate-in fade-in zoom-in-95 duration-200">
      
      {/* ==================================================================== */}
      {/* 1. CABEÇALHO EXECUTIVO FIXO                                          */}
      {/* ==================================================================== */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/95 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-100 tracking-tight leading-none">
                Motor de Inteligência Artificial
              </h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                MARKS SYSTEMS AI ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-none">
              Orquestração cognitiva, regras registrais Detran/RS e base documental do atendimento.
            </p>
          </div>
        </div>

        {/* Indicador pulsante do motor ativo & Botão Fechar */}
        <div className="flex items-center gap-3">
          <div className="bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 text-xs px-3 py-1 rounded-full flex items-center gap-2 font-medium shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              Ativo: <strong className="text-white font-semibold">{ehGemini ? `Google Gemini (${config.geminiModel || 'gemini-3.8-flash'})` : `Groq Cloud (${config.groqModel || 'llama-3.3-70b'})`}</strong>
            </span>
          </div>

          {onFechar && (
            <button
              type="button"
              onClick={onFechar}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border-0 bg-transparent"
              title="Fechar painel"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Banner de feedback de sucesso se houver */}
      {feedbackSucesso && (
        <div className="px-6 py-2.5 bg-emerald-950/70 border-b border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2 shrink-0 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackSucesso}</span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. CORPO EM DUAS COLUNAS (SPLIT-SCREEN)                              */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 flex-1 overflow-y-auto">
        
        {/* ================================================================== */}
        {/* COLUNA ESQUERDA — INFRAESTRUTURA, CREDENCIAIS E CONTINGÊNCIA      */}
        {/* ================================================================== */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* 1. Seleção de Provedor Principal */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 block">
              1. Seleção do Provedor Neural
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Opção 1: Google Gemini */}
              <div
                onClick={() => setConfig({ ...config, activeProvider: 'gemini' })}
                className={`relative rounded-xl p-3.5 border transition-all cursor-pointer flex flex-col justify-between ${
                  ehGemini
                    ? 'bg-emerald-950/20 border-emerald-500/60 ring-1 ring-emerald-500/30 shadow-md shadow-emerald-950/30'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-950/80 text-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-white leading-tight">Google Gemini</span>
                    </div>
                    <div
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        ehGemini ? 'border-emerald-400 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900'
                      }`}
                    >
                      {ehGemini && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                      Recomendado
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400/90 truncate">
                      {config.geminiModel}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug mt-1">
                  Janela ampla de contexto para o regulamento do Detran/RS.
                </p>
              </div>

              {/* Opção 2: Groq Cloud */}
              <div
                onClick={() => setConfig({ ...config, activeProvider: 'groq' })}
                className={`relative rounded-xl p-3.5 border transition-all cursor-pointer flex flex-col justify-between ${
                  !ehGemini
                    ? 'bg-emerald-950/20 border-emerald-500/60 ring-1 ring-emerald-500/30 shadow-md shadow-emerald-950/30'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-950/80 text-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                        <Zap className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-white leading-tight">Groq Cloud</span>
                    </div>
                    <div
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        !ehGemini ? 'border-emerald-400 bg-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900'
                      }`}
                    >
                      {!ehGemini && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                      Ultra Rápido
                    </span>
                    <span className="text-[10px] font-mono text-blue-400/90 truncate">
                      {config.groqModel.replace('-versatile', '')}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug mt-1">
                  Inferência em tempo recorde com arquitetura LPUs Groq.
                </p>
              </div>
            </div>
          </div>

          {/* 2. Credenciais de API (Chaves Seguras) */}
          <div className="space-y-3.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              2. Credenciais de Autenticação (API Keys)
            </label>

            {/* Chave Google Gemini */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <span>GOOGLE_GEMINI_API_KEY</span>
                  {ehGemini && (
                    <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.2 rounded">
                      Ativa
                    </span>
                  )}
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <span>Obter no AI Studio</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="relative">
                <input
                  type={mostrarKeyGemini ? 'text' : 'password'}
                  value={config.geminiApiKey}
                  onChange={(e) => setConfig({ ...config, geminiApiKey: sanitizarChaveApi(e.target.value) })}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setMostrarKeyGemini(!mostrarKeyGemini)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer bg-transparent border-0"
                  title={mostrarKeyGemini ? 'Ocultar chave' : 'Exibir chave'}
                >
                  {mostrarKeyGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Chave Groq Cloud */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <span>GROQ_API_KEY</span>
                  {!ehGemini && (
                    <span className="text-[9px] font-semibold text-blue-400 bg-blue-950/80 border border-blue-800 px-1.5 py-0.2 rounded">
                      Ativa
                    </span>
                  )}
                </span>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <span>Obter no Groq Console</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="relative">
                <input
                  type={mostrarKeyGroq ? 'text' : 'password'}
                  value={config.groqApiKey}
                  onChange={(e) => setConfig({ ...config, groqApiKey: sanitizarChaveApi(e.target.value) })}
                  placeholder="gsk_..."
                  className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setMostrarKeyGroq(!mostrarKeyGroq)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer bg-transparent border-0"
                  title={mostrarKeyGroq ? 'Ocultar chave' : 'Exibir chave'}
                >
                  {mostrarKeyGroq ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* 3. Card de Contingência (Fallback Automático) */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-0.5 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">
                  Troca Automática (Fallback)
                </h4>
                <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                  Alterna automaticamente para o motor secundário caso o principal atinja o limite de cota.
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={config.autoFallback}
                onChange={(e) => setConfig({ ...config, autoFallback: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          {/* 4. Parâmetros Rápidos da Unidade (Injeção de Identificação) */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 block">
              <Building className="w-3.5 h-3.5 text-emerald-400" />
              <span>Parâmetros Operacionais da Unidade</span>
            </label>

            <div className="space-y-2">
              <div>
                <span className="text-[10px] text-slate-400 font-medium block mb-1">
                  Nome / Código do CRVA:
                </span>
                <input
                  type="text"
                  value={config.crvaNomeCodigo || ''}
                  onChange={(e) => setConfig({ ...config, crvaNomeCodigo: e.target.value })}
                  placeholder="CRVA 0123 • Porto Alegre / RS"
                  className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 block mb-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>Horários de Atendimento e Vistoria:</span>
                </span>
                <input
                  type="text"
                  value={config.horariosAtendimento || ''}
                  onChange={(e) => setConfig({ ...config, horariosAtendimento: e.target.value })}
                  placeholder="Segunda a Sexta: 08:00 às 12:00 e 13:00 às 17:00 (Senhas e Vistoria até 11:30 e 16:30)"
                  className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

        </div>

        {/* ================================================================== */}
        {/* COLUNA DIREITA — CÉREBRO DO AGENTE & BASE DE CONHECIMENTO          */}
        {/* ================================================================== */}
        <div className="lg:col-span-7 flex flex-col space-y-5">
          
          {/* 1. Editor Profissional de Instruções (System Prompt) */}
          <div className="flex-1 flex flex-col bg-slate-950/50 border border-slate-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <h4 className="text-xs font-bold text-slate-200">
                  Instruções Operacionais da Antonella (System Prompt)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Persona oficial da Antonella, regras invioláveis e triagem de veículos Detran/RS.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-md">
                  {contagemCaracteres} caracteres • ~{estimativaTokens} tokens
                </span>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, systemPrompt: DEFAULT_SYSTEM_PROMPT })}
                  className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-0"
                  title="Restaurar o prompt oficial da Antonella (CRVA / Detran-RS)"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restaurar Padrão Antonella</span>
                </button>
              </div>
            </div>

            <textarea
              value={config.systemPrompt || ''}
              onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
              placeholder="Digite as instruções e diretrizes para o Agente de IA..."
              className="flex-1 min-h-[220px] lg:min-h-[260px] w-full bg-slate-950/80 border border-slate-700/80 rounded-xl p-4 font-mono text-xs text-slate-200 leading-relaxed focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none shadow-inner"
            />
          </div>

          {/* 2. Base de Conhecimento (Documentos de Referência RAG) */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <span>Base de Conhecimento (PDF, TXT, MD • Máx. 5MB)</span>
                  <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                    RAG LEVE
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Tabelas de emolumentos, portarias e manuais lidos automaticamente pelo agente.
                </p>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Anexar Documento</span>
              </button>
            </div>

            {/* Dropzone horizontal compacta */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-xl py-3 px-4 flex items-center justify-center gap-3 cursor-pointer bg-slate-900/40 transition-all ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-950/20'
                  : 'border-slate-700 hover:border-emerald-500/60'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".txt,.md,.pdf"
                multiple
                className="hidden"
              />
              {uploading ? (
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                  <span>{statusUploadTexto}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <UploadCloud className="w-4 h-4 text-emerald-400" />
                  <span>
                    Arraste arquivos aqui ou <span className="text-emerald-400 underline">clique para selecionar</span>
                  </span>
                </div>
              )}
            </div>

            {/* Alerta de erro de upload */}
            {erroUpload && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{erroUpload}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErroUpload(null)}
                  className="text-rose-400 hover:text-white p-0.5 cursor-pointer bg-transparent border-0"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Lista limpa de documentos anexados */}
            {documentos.length > 0 ? (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {documentos.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                        {doc.tipo === 'pdf' ? (
                          <FileText className="w-3.5 h-3.5 text-rose-400" />
                        ) : (
                          <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>
                      <span className="text-xs font-medium text-slate-200 truncate">
                        {doc.nome}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        ({doc.tamanhoFormatado})
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 hidden sm:inline">
                        • {doc.conteudoTexto?.length ? `~${doc.conteudoTexto.length.toLocaleString('pt-BR')} carac.` : '0 carac.'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 font-semibold">
                        Indexado
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoverDocumento(doc.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer bg-transparent border-0"
                        title="Remover documento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-1 text-[11px] text-slate-500">
                Nenhum documento de apoio anexado no momento.
              </div>
            )}
          </div>

        </div>

      </div>

      {/* ==================================================================== */}
      {/* 3. RODAPÉ FIXO DE AÇÕES E VALIDAÇÃO                                  */}
      {/* ==================================================================== */}
      <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between shrink-0">
        
        {/* Esquerda: Feedback visual do status da conexão independente de ambos os provedores */}
        <div className="flex items-center gap-2 flex-wrap">
          {testando ? (
            <div className="flex items-center gap-2 text-xs text-blue-400 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Validando conectividade dos motores neurais (Gemini e Groq)...</span>
            </div>
          ) : statusMultiProvedor ? (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Badge Google Gemini */}
              {statusMultiProvedor.gemini.sucesso ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-lg shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    Gemini: <strong>Conectado</strong> ({statusMultiProvedor.gemini.latenciaMs}ms)
                  </span>
                </div>
              ) : (
                <div
                  className="flex items-center gap-1.5 text-xs text-rose-400 font-medium bg-rose-950/60 border border-rose-800/60 px-2.5 py-1 rounded-lg max-w-[260px] truncate shadow-sm"
                  title={statusMultiProvedor.gemini.erro}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="truncate">Gemini: {statusMultiProvedor.gemini.erro}</span>
                </div>
              )}

              {/* Badge Groq Cloud */}
              {statusMultiProvedor.groq.sucesso ? (
                <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium bg-blue-950/60 border border-blue-800/60 px-2.5 py-1 rounded-lg shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>
                    Groq: <strong>Conectado</strong> ({statusMultiProvedor.groq.latenciaMs}ms • {statusMultiProvedor.groq.modelo})
                  </span>
                </div>
              ) : (
                <div
                  className="flex items-center gap-1.5 text-xs text-amber-400 font-medium bg-amber-950/60 border border-amber-800/60 px-2.5 py-1 rounded-lg max-w-[260px] truncate shadow-sm"
                  title={statusMultiProvedor.groq.erro}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">Groq: {statusMultiProvedor.groq.erro}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-600" />
              <span>Pronto para validação de conectividade</span>
            </div>
          )}
        </div>

        {/* Direita: Botões Alinhados */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTestarConexao}
            disabled={testando || salvando}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {testando ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span>Testar Conexão API</span>
          </button>

          <button
            type="button"
            onClick={() => handleSalvar()}
            disabled={salvando || testando}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950/40 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 active:scale-[0.99]"
          >
            {salvando ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>Salvar Configurações do Motor</span>
          </button>
        </div>

      </div>

    </div>
  );
}
