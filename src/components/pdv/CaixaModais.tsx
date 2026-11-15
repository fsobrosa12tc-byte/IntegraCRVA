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

import AberturaCaixaModal, { type AberturaCaixaModalProps } from './AberturaCaixaModal';
export { AberturaCaixaModal };
export const AberturaCaixa = AberturaCaixaModal;

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

import { VisualizadorEncerramento, ModalFechamentoCaixa } from '../ModalFechamentoCaixa';
export { VisualizadorEncerramento, ModalFechamentoCaixa };

export function ComprovanteFechamento({
  resultado,
  operadorNome,
  podeVerDivergencia = true,
  onConcluir,
}: {
  resultado: ResultadoFechamento;
  operadorNome: string;
  podeVerDivergencia?: boolean;
  onConcluir: () => void;
}) {
  return (
    <VisualizadorEncerramento
      resultado={resultado}
      operadorNome={operadorNome}
      podeVerDivergencia={podeVerDivergencia}
      onConcluir={onConcluir}
    />
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
