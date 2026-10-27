import React, { useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, UserCheck, X } from 'lucide-react';
import { formatarBRL } from '../../lib/pdvCaixa';
import { listarOperadoresPDV } from '../../lib/pdvTrocaOperador';

const inputBase =
  'w-full p-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-slate-500';

export default function TrocaOperadorModal({
  operadorAtualNome,
  saldoGaveta,
  onClose,
  onConfirmar,
}: {
  operadorAtualNome: string;
  /** Saldo contábil em dinheiro na gaveta neste instante. */
  saldoGaveta: number;
  onClose: () => void;
  onConfirmar: (login: string, senha: string, motivo: string) => Promise<void>;
}) {
  const operadores = listarOperadoresPDV();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro('');
    try {
      await onConfirmar(login, senha, motivo);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao assumir o terminal.');
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-6 space-y-4 text-slate-100"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-black text-white flex items-center gap-2">
            <UserCheck className="text-amber-400" size={20} /> Assumir Terminal em Andamento
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer"
            title="Cancelar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Entregando o terminal</span>
            <strong className="text-slate-100">{operadorAtualNome}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Saldo em dinheiro na gaveta</span>
            <strong className="font-mono text-emerald-400">{formatarBRL(saldoGaveta)}</strong>
          </div>
          <p className="text-[10px] text-slate-500 pt-1">
            O caixa não será fechado e a venda em andamento é preservada. A transição será auditada.
          </p>
        </div>

        <div>
          <label htmlFor="troca-login" className="block text-xs font-bold text-slate-300 mb-1">
            Operador que assume (selecione ou digite o login institucional) *
          </label>
          <input
            id="troca-login"
            list="troca-operadores"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="nome.funcao@marks.com"
            className={inputBase}
            autoComplete="username"
            autoFocus
            required
          />
          <datalist id="troca-operadores">
            {operadores.map((o) => (
              <option key={o.login} value={o.login}>
                {o.nome}
              </option>
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="troca-senha" className="block text-xs font-bold text-slate-300 mb-1">
            Senha / PIN *
          </label>
          <input
            id="troca-senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
            className={inputBase}
            autoComplete="current-password"
            required
          />
        </div>

        <div>
          <label htmlFor="troca-motivo" className="block text-xs font-bold text-slate-300 mb-1">
            Motivo da troca (opcional)
          </label>
          <input
            id="troca-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Troca rápida de turno / Emergência"
            className={inputBase}
          />
        </div>

        {erro && (
          <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-semibold flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-400" /> <span>{erro}</span>
          </div>
        )}

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
            id="btn-confirmar-troca-operador"
            disabled={salvando}
            className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white rounded-xl text-xs font-bold border-0 cursor-pointer flex items-center justify-center gap-2"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Validar e Assumir Terminal
          </button>
        </div>
      </form>
    </div>
  );
}
