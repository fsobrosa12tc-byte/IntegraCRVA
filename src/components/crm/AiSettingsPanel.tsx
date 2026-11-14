import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
  getAiConfig,
  saveAiConfig,
  testarConexaoAi,
  type AiConfig,
  type AiProvider,
  type TesteConexaoResult,
} from '../../services/aiRouterService';

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

  useEffect(() => {
    setConfig(getAiConfig());
  }, []);

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
      {/* 4. TOGGLE DE FAILOVER AUTOMÁTICO                                      */}
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
