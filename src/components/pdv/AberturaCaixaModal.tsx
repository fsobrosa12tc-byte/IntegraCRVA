import React, { useEffect, useState } from 'react';
import {
  Lock,
  Unlock,
  Clock,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  BarChart3,
  ArrowLeft,
  LogOut
} from 'lucide-react';
import { desmascararMoeda, mascararMoeda } from '../../lib/pdvCaixa';

export interface AberturaCaixaModalProps {
  operadorNome: string;
  erroInicial?: string;
  onAbrir: (valor: number) => Promise<void>;
  onVoltarGateway?: () => void;
  onLogout?: () => void;
  /** Presente apenas para master/gerente/financeiro: permite seguir sem abrir caixa */
  onSupervisionar?: () => void;
  onAbrirDashboard?: () => void;
}

export default function AberturaCaixaModal({
  operadorNome,
  erroInicial,
  onAbrir,
  onVoltarGateway,
  onLogout,
  onSupervisionar,
  onAbrirDashboard,
}: AberturaCaixaModalProps) {
  const [agora, setAgora] = useState(new Date());
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState(erroInicial || '');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setErro(erroInicial || '');
  }, [erroInicial]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valor) {
      setErro('Informe o Fundo de Troco Operacional.');
      return;
    }

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

  const dataHoraFormatada = `${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR')}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      {/* Card Principal Centralizado Executivo */}
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho Compacto: Marca & Status */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-800/80 flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-400">
            MARKS SYSTEMS • INTEGRA PDV
          </span>
          <div className="bg-amber-950/50 border border-amber-800/50 text-amber-400 text-[11px] px-2.5 py-0.5 rounded-full flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Turno Fechado</span>
          </div>
        </div>

        {/* Área de Título e Contexto */}
        <div className="px-6 pt-5 pb-2 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shadow-inner">
            <Lock size={22} />
          </div>
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">Caixa Fechado</h2>
          <p className="text-xs text-slate-400 mt-1">
            Abra o turno para liberar a frente de caixa,{' '}
            <span className="text-slate-200 font-semibold">{operadorNome}</span>.
          </p>
        </div>

        {/* Formulário de Abertura */}
        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Campo 1: Data e Hora da Abertura */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              DATA E HORA DA ABERTURA
            </label>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm text-slate-300 font-mono select-none">
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-slate-500 shrink-0" />
                <span>{dataHoraFormatada}</span>
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                AUTOMÁTICO
              </span>
            </div>
          </div>

          {/* Campo 2: Fundo de Troco Operacional */}
          <div>
            <label htmlFor="fundo-troco" className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              FUNDO DE TROCO OPERACIONAL (R$)
            </label>
            <input
              id="fundo-troco"
              type="text"
              inputMode="numeric"
              value={valor}
              onChange={(e) => setValor(mascararMoeda(e.target.value))}
              placeholder="R$ 0,00"
              autoFocus
              required
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-4 py-3 text-lg font-bold text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono placeholder:text-slate-600"
            />
          </div>

          {/* Alerta de Erro */}
          {erro && (
            <div className="bg-rose-950/50 border border-rose-800/60 text-rose-300 rounded-xl px-3.5 py-2.5 text-xs font-medium flex items-center gap-2 animate-in fade-in duration-150">
              <AlertTriangle size={15} className="text-rose-400 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* Botão Primário de Abertura */}
          <button
            type="submit"
            id="btn-abrir-caixa"
            disabled={salvando}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition-all mt-2 cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Registrando Abertura...</span>
              </>
            ) : (
              <>
                <Unlock size={16} />
                <span>Abrir Caixa e Iniciar Turno</span>
              </>
            )}
          </button>

          {/* Seção de Supervisão e Gestão */}
          {(onSupervisionar || onAbrirDashboard) && (
            <div className="border-t border-slate-800/80 pt-4 mt-5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2.5 block text-center sm:text-left">
                ACESSO DE SUPERVISÃO & GESTÃO
              </span>
              <div className="grid grid-cols-2 gap-3">
                {onSupervisionar && (
                  <button
                    type="button"
                    id="btn-apenas-supervisionar"
                    onClick={onSupervisionar}
                    className="py-2.5 px-3 bg-slate-800/70 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Acessar o terminal apenas para consulta e supervisão"
                  >
                    <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
                    <span>Apenas Supervisionar</span>
                  </button>
                )}

                {onAbrirDashboard && (
                  <button
                    type="button"
                    id="btn-supervisao-dashboard"
                    onClick={onAbrirDashboard}
                    className="py-2.5 px-3 bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-300 border border-indigo-800/50 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Visualizar relatórios e dashboard financeiro em tempo real"
                  >
                    <BarChart3 size={14} className="text-indigo-400 shrink-0" />
                    <span>Dashboard / Relatórios</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </form>

        {/* Rodapé Discreto com Links de Escape */}
        <div className="px-6 py-3.5 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between">
          {onVoltarGateway ? (
            <button
              type="button"
              onClick={onVoltarGateway}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer bg-transparent border-0"
              title="Voltar ao Gateway de Módulos"
            >
              <ArrowLeft size={13} />
              <span>← Voltar ao Hub</span>
            </button>
          ) : (
            <div />
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="text-xs text-red-400/80 hover:text-red-400 transition-colors flex items-center gap-1.5 cursor-pointer bg-transparent border-0"
              title="Encerrar Sessão do Usuário"
            >
              <LogOut size={13} />
              <span>Encerrar Sessão</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
