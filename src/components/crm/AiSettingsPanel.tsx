import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
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
  BookOpen,
  RotateCcw,
} from 'lucide-react';
import {
  getAiConfig,
  saveAiConfig,
  testarConexaoAi,
  DEFAULT_SYSTEM_PROMPT,
  type AiConfig,
  type AiProvider,
  type TesteConexaoResult,
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

  // Visibilidade de senhas
  const [mostrarKeyGemini, setMostrarKeyGemini] = useState(false);
  const [mostrarKeyGroq, setMostrarKeyGroq] = useState(false);

  // Estados de teste e salvamento
  const [testando, setTestando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<TesteConexaoResult | null>(null);
  const [feedbackSucesso, setFeedbackSucesso] = useState<string | null>(null);

  // Estados da Base de Conhecimento
  const [documentos, setDocumentos] = useState<KnowledgeDocument[]>([]);
  const [uploading, setUploading] = useState(false);
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
        await uploadKnowledgeDocument(file);
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
    setResultadoTeste(null);
    try {
      const chaveAtual = config.activeProvider === 'gemini' ? config.geminiApiKey : config.groqApiKey;
      const res = await testarConexaoAi(config.activeProvider, chaveAtual);
      setResultadoTeste(res);
    } catch (err: any) {
      setResultadoTeste({
        sucesso: false,
        provider: config.activeProvider,
        modelo: config.activeProvider === 'gemini' ? config.geminiModel : config.groqModel,
        latenciaMs: 0,
        erro: err?.message || 'Falha na comunicação com o provedor.',
      });
    } finally {
      setTestando(false);
    }
  };

  const ehGemini = config.activeProvider === 'gemini';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md text-slate-100 max-w-3xl w-full mx-auto select-none">
      {/* ==================================================================== */}
      {/* 1. CABEÇALHO COM STATUS EM TEMPO REAL                                */}
      {/* ==================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 mb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Motor de Inteligência Artificial</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </h2>
            <p className="text-xs text-slate-400">
              Gerencie os provedores neurais de triagem e resposta automática do CRM-Integra
            </p>
          </div>
        </div>

        {/* Badge de status em tempo real */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                ehGemini ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]' : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
              }`}
            />
            <span>Ativo:</span>
            <strong className="text-white">{ehGemini ? 'Google Gemini' : 'Groq Cloud'}</strong>
          </span>

          {onFechar && (
            <button
              type="button"
              onClick={onFechar}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer text-xs"
              title="Fechar painel"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Feedback de sucesso */}
      {feedbackSucesso && (
        <div className="mb-5 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackSucesso}</span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. SELETOR VISUAL DE PROVEDOR (2 CARDS LADO A LADO)                  */}
      {/* ==================================================================== */}
      <div className="mb-6">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 block">
          Selecione o Provedor Neural Primário
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Google Gemini */}
          <div
            onClick={() => setConfig({ ...config, activeProvider: 'gemini' })}
            className={`relative rounded-xl p-4 border transition-all cursor-pointer ${
              ehGemini
                ? 'bg-sky-950/40 border-sky-500/70 shadow-lg shadow-sky-950/40 ring-1 ring-sky-500/50'
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-950/80 text-slate-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                    ehGemini ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>Google Gemini</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30">
                      Recomendado
                    </span>
                  </h3>
                  <span className="text-[11px] font-mono text-sky-400 font-medium">
                    Modelo: {config.geminiModel}
                  </span>
                </div>
              </div>

              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center mt-1 ${
                  ehGemini ? 'border-sky-400 bg-sky-500 text-slate-950' : 'border-slate-700 bg-slate-900'
                }`}
              >
                {ehGemini && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mt-2">
              Alta capacidade de contexto para regras do Detran/RS. Cota gratuita via Google AI Studio.
            </p>
          </div>

          {/* Card 2: Groq Cloud */}
          <div
            onClick={() => setConfig({ ...config, activeProvider: 'groq' })}
            className={`relative rounded-xl p-4 border transition-all cursor-pointer ${
              !ehGemini
                ? 'bg-amber-950/40 border-amber-500/70 shadow-lg shadow-amber-950/40 ring-1 ring-amber-500/50'
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-950/80 text-slate-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                    !ehGemini ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>Groq Cloud</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                      Ultra Rápido
                    </span>
                  </h3>
                  <span className="text-[11px] font-mono text-amber-400 font-medium">
                    Modelo: {config.groqModel}
                  </span>
                </div>
              </div>

              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center mt-1 ${
                  !ehGemini ? 'border-amber-400 bg-amber-500 text-slate-950' : 'border-slate-700 bg-slate-900'
                }`}
              >
                {!ehGemini && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mt-2">
              Inferência de altíssima velocidade com modelos abertos. Cota gratuita via Groq Console.
            </p>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. CAMPOS DE CREDENCIAIS (CHAVES API COM MÁSCARA)                     */}
      {/* ==================================================================== */}
      <div className="space-y-4 mb-6">
        {/* Chave Google Gemini */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <span>Chave API Google Gemini</span>
              {ehGemini && (
                <span className="text-[10px] text-sky-400 bg-sky-950/80 border border-sky-800 px-1.5 py-0.2 rounded">
                  Em uso agora
                </span>
              )}
            </label>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer"
            >
              <span>Obter chave gratuita no Google AI Studio</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="relative">
            <input
              type={mostrarKeyGemini ? 'text' : 'password'}
              value={config.geminiApiKey}
              onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
              placeholder="AIzaSy..."
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 font-mono tracking-wider"
            />
            <button
              type="button"
              onClick={() => setMostrarKeyGemini(!mostrarKeyGemini)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
              title={mostrarKeyGemini ? 'Ocultar chave' : 'Exibir chave'}
            >
              {mostrarKeyGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Chave Groq Cloud */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <span>Chave API Groq Cloud</span>
              {!ehGemini && (
                <span className="text-[10px] text-amber-400 bg-amber-950/80 border border-amber-800 px-1.5 py-0.2 rounded">
                  Em uso agora
                </span>
              )}
            </label>
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer"
            >
              <span>Obter chave gratuita no Groq Console</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="relative">
            <input
              type={mostrarKeyGroq ? 'text' : 'password'}
              value={config.groqApiKey}
              onChange={(e) => setConfig({ ...config, groqApiKey: e.target.value })}
              placeholder="gsk_..."
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono tracking-wider"
            />
            <button
              type="button"
              onClick={() => setMostrarKeyGroq(!mostrarKeyGroq)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
              title={mostrarKeyGroq ? 'Ocultar chave' : 'Exibir chave'}
            >
              {mostrarKeyGroq ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. PROMPT DE SISTEMA & TREINAMENTO DO AGENTE                         */}
      {/* ==================================================================== */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>Prompt de Sistema (Instrução Central do Agente)</span>
          </label>
          <button
            type="button"
            onClick={() => setConfig({ ...config, systemPrompt: DEFAULT_SYSTEM_PROMPT })}
            className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-0"
            title="Restaurar o prompt padrão oficial do CRVA Detran/RS"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restaurar Padrão</span>
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-2">
          Defina a persona, diretrizes de atendimento e instruções de triagem que o Agente de IA executará no CRM-Integra.
        </p>
        <textarea
          rows={5}
          value={config.systemPrompt || ''}
          onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
          placeholder="Instruções e diretrizes de atendimento do agente..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono leading-relaxed"
        />

        {/* ==================================================================== */}
        {/* NOVA SEÇÃO: BASE DE CONHECIMENTO / DOCUMENTOS DE APOIO (OPCIONAL)     */}
        {/* ==================================================================== */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 mt-4">
          <div className="mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Base de Conhecimento (Documentos de Referência)</span>
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">
                OPCIONAL
              </span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Anexe arquivos (.txt, .md ou .pdf) com tabelas de valores, comunicados ou regras extras para consulta da IA.
            </p>
          </div>

          {/* Área de Upload (Drag & Drop) */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all bg-slate-900/40 ${
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
              <div className="flex flex-col items-center justify-center gap-2 py-2">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-xs font-bold text-slate-200">Processando e indexando documento...</p>
                <p className="text-[11px] text-slate-400">Extraindo conteúdo textual para o contexto da IA</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-emerald-400">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">
                    Arraste arquivos aqui ou <span className="text-emerald-400 underline">clique para selecionar</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Max. 5MB por arquivo • Formatos: .TXT, .MD, .PDF
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Alerta de erro no upload */}
          {erroUpload && (
            <div className="mt-3 p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between animate-fadeIn">
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

          {/* Lista de Documentos Anexados */}
          {documentos.length > 0 ? (
            <div className="mt-3 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Documentos Indexados ({documentos.length}):
              </span>
              {documentos.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-lg mt-2 transition-colors hover:border-slate-700 shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center shrink-0">
                      {doc.tipo === 'pdf' ? (
                        <FileText className="w-4 h-4 text-rose-400" />
                      ) : (
                        <FileCode className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate max-w-xs sm:max-w-md">
                        {doc.nome}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                        <span>{doc.tamanhoFormatado}</span>
                        <span>•</span>
                        <span className="uppercase">{doc.tipo}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                      Indexado / Ativo
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoverDocumento(doc.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer bg-transparent border-0"
                      title="Remover documento da base do agente"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-center py-2 text-[11px] text-slate-500 font-medium">
              Nenhum documento de apoio anexado no momento.
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 5. TOGGLE DE FAILOVER AUTOMÁTICO                                      */}
      {/* ==================================================================== */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 mb-6 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Ativar troca automática (Fallback de Contingência)
            </h4>
            <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
              Se o provedor principal atingir o limite gratuito diário (HTTP 429) ou apresentar indisponibilidade,
              o CRM comuta instantaneamente para o motor secundário sem interromper a triagem.
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
          <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
        </label>
      </div>

      {/* Feedback do Teste de Conexão */}
      {resultadoTeste && (
        <div
          className={`p-3.5 rounded-xl border text-xs mb-6 animate-fadeIn ${
            resultadoTeste.sucesso
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2 font-bold mb-1">
            <div className="flex items-center gap-1.5">
              {resultadoTeste.sucesso ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              )}
              <span>
                {resultadoTeste.sucesso
                  ? `Conexão bem-sucedida com ${resultadoTeste.provider === 'gemini' ? 'Google Gemini' : 'Groq Cloud'}!`
                  : `Falha ao conectar com ${resultadoTeste.provider === 'gemini' ? 'Google Gemini' : 'Groq Cloud'}`}
              </span>
            </div>
            {resultadoTeste.latenciaMs > 0 && (
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-semibold">
                Latência: {resultadoTeste.latenciaMs} ms
              </span>
            )}
          </div>
          <p className="text-[11px] opacity-90 pl-5">
            {resultadoTeste.sucesso
              ? `O modelo [${resultadoTeste.modelo}] respondeu com sucesso: "${resultadoTeste.resposta}". Motor validado e pronto para operação.`
              : `Erro: ${resultadoTeste.erro || 'Verifique sua chave de API e a conectividade com a internet.'}`}
          </p>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. BOTÕES DE AÇÃO                                                    */}
      {/* ==================================================================== */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={handleTestarConexao}
          disabled={testando || salvando}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {testando ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Validando Chave...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              <span>Testar Conexão</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSalvar()}
          disabled={salvando || testando}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.99]"
        >
          {salvando ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Gravando Configurações...</span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              <span>Salvar Configurações</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
