import React, { useEffect, useState } from 'react';
import {
  Lock, Unlock, Clock, ArrowDownCircle, ArrowUpCircle, EyeOff, X, Printer,
  AlertTriangle, CheckCircle2, Loader2, Search,
} from 'lucide-react';
import type { CaixaDiario } from '../../types/pdv';
import type { ResultadoFechamento } from '../../lib/pdvCaixa';
import { desmascararMoeda, formatarBRL, mascararMoeda } from '../../lib/pdvCaixa';

const inputBase =
  'w-full p-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-500';

function MensagemErro({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-semibold flex items-start gap-2">
      <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-400" /> <span>{msg}</span>
    </div>
  );
}

/* ----------------------- 1. Abertura de turno (RF001) ---------------------- */

export function AberturaCaixa({
  operadorNome,
  erroInicial,
  onAbrir,
  onVoltarGateway,
  onLogout,
  onSupervisionar,
  onAbrirDashboard,
}: {
  operadorNome: string;
  erroInicial?: string;
  onAbrir: (valor: number) => Promise<void>;
  onVoltarGateway?: () => void;
  onLogout?: () => void;
  /** Presente apenas para master/gerente/financeiro: permite seguir sem abrir caixa. */
  onSupervisionar?: () => void;
  onAbrirDashboard?: () => void;
}) {
  const [agora, setAgora] = useState(new Date());
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState(erroInicial || '');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setErro(erroInicial || ''), [erroInicial]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valor) return setErro('Informe o Fundo de Troco Operacional.');
    setSalvando(true);
    setErro('');
    try {
      await onAbrir(desmascararMoeda(valor));
    } catch (err: any) {
      setErro(err.message || 'Falha ao abrir o caixa.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-8 relative text-slate-100">
        {/* Botão X para fechar e voltar ao Gateway */}
        {onVoltarGateway && (
          <button
            type="button"
            onClick={onVoltarGateway}
            className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer border-0 bg-transparent"
            title="Fechar e Voltar ao Início"
          >
            <X size={20} />
          </button>
        )}

        <form onSubmit={submit} className="space-y-5">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-inner">
              <Lock size={28} />
            </div>
            <h2 className="text-xl font-black text-white">Caixa Fechado</h2>
            <p className="text-xs text-slate-400">
              Abra o turno para liberar a frente de caixa, <strong className="text-slate-200">{operadorNome}</strong>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Data e Hora da Abertura (automático)</label>
            <div className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono font-bold text-slate-300 select-none">
              <Clock size={15} className="text-slate-500" />
              {agora.toLocaleDateString('pt-BR')} às {agora.toLocaleTimeString('pt-BR')}
              <span className="ml-auto text-[10px] uppercase text-slate-500">somente leitura</span>
            </div>
          </div>

          <div>
            <label htmlFor="fundo-troco" className="block text-xs font-bold text-slate-300 mb-1">
              Fundo de Troco Operacional (R$) *
            </label>
            <input
              id="fundo-troco"
              inputMode="numeric"
              value={valor}
              onChange={(e) => setValor(mascararMoeda(e.target.value))}
              placeholder="R$ 0,00"
              className={inputBase}
              autoFocus
              required
            />
          </div>

          <MensagemErro msg={erro} />

          <button
            type="submit"
            id="btn-abrir-caixa"
            disabled={salvando}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 border-0 cursor-pointer shadow-lg shadow-emerald-950/50 transition-all"
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
            Abrir Caixa
          </button>
        </form>

        {onSupervisionar && (
          <div className="mt-5 p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <p className="text-[11px] font-black uppercase text-slate-400">Acesso de Supervisão</p>
            <p className="text-[11px] text-slate-500">
              Acima você pode operar um caixa próprio (teste/emergência). Ou apenas supervisione sem abrir caixa.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                id="btn-apenas-supervisionar"
                onClick={onSupervisionar}
                className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 cursor-pointer"
              >
                Apenas Supervisionar
              </button>
              {onAbrirDashboard && (
                <button
                  type="button"
                  id="btn-supervisao-dashboard"
                  onClick={onAbrirDashboard}
                  className="flex-1 py-2.5 px-3 bg-purple-950/50 hover:bg-purple-900/60 text-purple-300 rounded-xl text-xs font-bold border border-purple-500/40 cursor-pointer"
                >
                  Dashboard / Relatórios
                </button>
              )}
            </div>
          </div>
        )}

        {/* BOTÕES DE ESCAPE E NAVEGAÇÃO */}
        <div className="mt-6 pt-5 border-t border-slate-800 flex items-center justify-between gap-3">
          {onVoltarGateway && (
            <button
              type="button"
              onClick={onVoltarGateway}
              className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 cursor-pointer transition-colors text-center"
            >
              Voltar ao Início
            </button>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="flex-1 py-2.5 px-3 bg-red-950/40 hover:bg-red-900/40 text-red-300 hover:text-red-200 border border-red-800/60 rounded-xl text-xs font-bold cursor-pointer transition-colors text-center"
            >
              Encerrar Sessão
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------- 2. Sangria / Suprimento --------------------------- */

export function MovimentoModal({
  tipo,
  onClose,
  onConfirmar,
}: {
  tipo: 'suprimento' | 'sangria';
  onClose: () => void;
  onConfirmar: (valor: number, descricao: string) => Promise<void>;
}) {
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ehSangria = tipo === 'sangria';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = desmascararMoeda(valor);
    if (v <= 0) return setErro('Informe um valor maior que zero.');
    if (descricao.trim().length < 5) return setErro('Informe uma justificativa (mín. 5 caracteres).');
    setSalvando(true);
    setErro('');
    try {
      await onConfirmar(v, descricao.trim());
    } catch (err: any) {
      setErro(err.message || 'Falha ao registrar.');
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-6 space-y-4 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-black text-white flex items-center gap-2">
            {ehSangria ? <ArrowUpCircle className="text-rose-400" size={20} /> : <ArrowDownCircle className="text-emerald-400" size={20} />}
            {ehSangria ? 'Sangria (Retirada de Gaveta / Cofre)' : 'Suprimento (Entrada de Dinheiro)'}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">Valor (R$) *</label>
          <input inputMode="numeric" value={valor} onChange={(e) => setValor(mascararMoeda(e.target.value))} placeholder="R$ 0,00" className={inputBase} autoFocus />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">Justificativa / Descrição *</label>
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder="Ex.: Recolhimento ao cofre central / Reforço de troco da manhã" className={inputBase + ' font-sans font-medium'} />
        </div>
        <MensagemErro msg={erro} />
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className={`flex-1 py-3 text-white rounded-xl text-xs font-bold border-0 cursor-pointer shadow-lg disabled:opacity-60 ${
              ehSangria ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/50' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50'
            }`}
          >
            {salvando ? 'Registrando...' : `Confirmar ${ehSangria ? 'Sangria' : 'Suprimento'}`}
          </button>
        </div>
      </form>
    </div>
  );
}

/* --------------------- 3. Fechamento cego (RF004) -------------------------- */

export function FechamentoCegoModal({
  onClose,
  onConfirmar,
}: {
  onClose: () => void;
  onConfirmar: (valorInformado: number) => Promise<void>;
}) {
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valor) return setErro('Informe o valor físico apurado na gaveta (use R$ 0,00 se vazia).');
    setSalvando(true);
    setErro('');
    try {
      await onConfirmar(desmascararMoeda(valor));
    } catch (err: any) {
      setErro(err.message || 'Falha ao encerrar o turno.');
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-6 space-y-4 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-black text-white flex items-center gap-2">
            <EyeOff size={20} className="text-amber-400" /> Conferência Cega de Caixa
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Conte todo o dinheiro físico na gaveta e digite o total. Por segurança algorítmica, o saldo esperado pelo sistema permanece oculto.
        </p>
        <div>
          <label htmlFor="valor-fisico" className="block text-xs font-bold text-slate-300 mb-1">
            Valor Físico em Dinheiro Apurado na Gaveta *
          </label>
          <input id="valor-fisico" inputMode="numeric" value={valor} onChange={(e) => setValor(mascararMoeda(e.target.value))} placeholder="R$ 0,00" className={inputBase} autoFocus />
        </div>
        <MensagemErro msg={erro} />
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            id="btn-confirmar-fechamento"
            disabled={salvando}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white rounded-xl text-xs font-bold border-0 cursor-pointer shadow-lg shadow-rose-950/50"
          >
            {salvando ? 'Encerrando...' : 'Confirmar e Fechar'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------------- 4. Comprovante de encerramento --------------------- */

const ROTULO_CONF: Record<string, string> = {
  exato: 'Caixa conferido (Sem divergência)',
  quebra_caixa: 'Quebra de caixa (Falta)',
  sobra_caixa: 'Sobra de caixa (Excesso)',
};

export function ComprovanteFechamento({
  resultado,
  operadorNome,
  podeVerDivergencia,
  onConcluir,
}: {
  resultado: ResultadoFechamento;
  operadorNome: string;
  podeVerDivergencia: boolean;
  onConcluir: () => void;
}) {
  const c: CaixaDiario = resultado.caixa;
  const quebra = resultado.status_conferencia === 'quebra_caixa';
  const sobra = resultado.status_conferencia === 'sobra_caixa';
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR') : '-');

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div id="comprovante-fechamento" className="print-area w-full max-w-md bg-white text-slate-900 rounded-3xl shadow-2xl p-6 space-y-4 my-8">
        <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
          <CheckCircle2 className="mx-auto text-emerald-600" size={36} />
          <h3 className="font-black text-slate-900 text-base uppercase">Comprovante de Fechamento de Turno</h3>
          <p className="text-[11px] text-slate-500 font-mono">Caixa #{c.id.slice(0, 8).toUpperCase()}</p>
        </div>

        <dl className="text-xs space-y-1.5 py-3 border-b border-dashed border-slate-300">
          <Linha k="Operador" v={operadorNome} />
          <Linha k="Abertura" v={fmt(c.data_abertura)} />
          <Linha k="Fechamento" v={fmt(c.data_fechamento)} />
          <Linha k="Fundo de Troco Inicial" v={formatarBRL(Number(c.valor_abertura))} />
          <Linha k="Total Apurado na Gaveta" v={formatarBRL(resultado.informado)} />
          {podeVerDivergencia && (
            <>
              <Linha k="Saldo Esperado no Sistema" v={formatarBRL(resultado.esperado)} />
              <Linha k="Diferença de Conferência" v={formatarBRL(resultado.diferenca)} />
            </>
          )}
          <Linha k="Resultado" v={ROTULO_CONF[resultado.status_conferencia]} />
        </dl>

        {quebra && podeVerDivergencia && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-xl text-xs font-bold flex items-center gap-2">
            <AlertTriangle size={16} /> ALERTA: quebra de caixa de {formatarBRL(Math.abs(resultado.diferenca))} — requer apuração do Master.
          </div>
        )}
        {sobra && podeVerDivergencia && (
          <div className="p-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-2">
            <Search size={16} /> Sobra de {formatarBRL(resultado.diferenca)} — investigar trocos concedidos.
          </div>
        )}
        {!podeVerDivergencia && resultado.status_conferencia !== 'exato' && (
          <div className="p-3 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold">
            Divergência registrada e encaminhada ao Master para auditoria.
          </div>
        )}

        <div className="flex gap-2 print:hidden pt-2">
          <button type="button" onClick={() => window.print()} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border-0 cursor-pointer flex items-center justify-center gap-2">
            <Printer size={15} /> Imprimir
          </button>
          <button type="button" id="btn-concluir-fechamento" onClick={onConcluir} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold border-0 cursor-pointer">
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}

function Linha({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500 font-medium">{k}</dt>
      <dd className="font-bold text-slate-900 font-mono text-right">{v}</dd>
    </div>
  );
}
