import React, { useState, useEffect } from 'react';
import { X, Tag, Edit3, CheckCircle2, AlertTriangle, Loader2, DollarSign, Layers } from 'lucide-react';
import type { ServicoCatalogo } from '../../lib/pdvVendas';
import { cadastrarServicoCatalogo, editarServicoCatalogo } from '../../lib/pdvVendas';

export interface ServicoFormModalProps {
  isOpen: boolean;
  servicoParaEditar?: ServicoCatalogo | null;
  userRole?: string;
  onClose: () => void;
  onSalvar: (servico: ServicoCatalogo) => void;
}

const CATEGORIAS_PADRAO = [
  'Geral',
  'Certidões',
  'Digitalização',
  'Alterações',
  'Autorizações',
  'Vistoria',
  'Transferência',
  'Emplacamento',
  'Documentos',
];

export default function ServicoFormModal({
  isOpen,
  servicoParaEditar,
  onClose,
  onSalvar,
}: ServicoFormModalProps) {
  const isEdicao = Boolean(servicoParaEditar);

  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('Geral');
  const [valorStr, setValorStr] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (servicoParaEditar) {
      setCodigo(servicoParaEditar.codigo || '');
      setNome(servicoParaEditar.nome || '');
      setCategoria(servicoParaEditar.categoria || 'Geral');
      setValorStr(
        servicoParaEditar.valor !== undefined && servicoParaEditar.valor !== null
          ? servicoParaEditar.valor.toFixed(2).replace('.', ',')
          : ''
      );
      setAtivo(servicoParaEditar.ativo !== false);
    } else {
      setCodigo(`SRV-${Math.floor(1000 + Math.random() * 9000)}`);
      setNome('');
      setCategoria('Geral');
      setValorStr('');
      setAtivo(true);
    }
    setErro('');
  }, [isOpen, servicoParaEditar]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !salvando) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, salvando, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nomeLimpo = nome.trim();
    if (!nomeLimpo || nomeLimpo.length < 3) {
      setErro('A descrição do serviço deve ter ao menos 3 caracteres.');
      return;
    }

    const valorNumerico = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      setErro('Informe um valor monetário válido maior que zero (ex: 98,40).');
      return;
    }

    setSalvando(true);
    setErro('');

    try {
      let servicoSalvo: ServicoCatalogo;

      if (isEdicao && servicoParaEditar?.id) {
        servicoSalvo = await editarServicoCatalogo({
          id: servicoParaEditar.id,
          codigo: codigo.trim() || undefined,
          nome: nomeLimpo,
          valor: valorNumerico,
          categoria: categoria.trim() || 'Geral',
          ativo,
        });
      } else {
        servicoSalvo = await cadastrarServicoCatalogo({
          codigo: codigo.trim() || undefined,
          nome: nomeLimpo,
          valor: valorNumerico,
          categoria: categoria.trim() || 'Geral',
          ativo,
        });
      }

      onSalvar(servicoSalvo);
      onClose();
    } catch (err: any) {
      console.error('[ServicoFormModal] Erro ao salvar serviço:', err);
      setErro(err?.message || 'Falha ao salvar serviço no catálogo oficial.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[160] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-4 text-slate-100 animate-in zoom-in-95 duration-150"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                isEdicao
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {isEdicao ? <Edit3 size={18} /> : <Tag size={18} />}
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                {isEdicao ? 'Editar Serviço do Catálogo' : 'Novo Serviço CRVA / Notarial'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isEdicao
                  ? 'Atualização de código, descrição, emolumento e disponibilidade'
                  : 'Cadastro global compartilhado com todas as contas de Atendimento e PDV'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl bg-transparent border-0 cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Campos */}
        <div className="space-y-3.5">
          {/* Código e Categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Código do Ato / Serviço
              </label>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="Ex: SRV-VIST"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono font-bold text-emerald-400 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Categoria / Grupo
              </label>
              <div className="relative">
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  {CATEGORIAS_PADRAO.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Descrição do Serviço */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Descrição Completa do Serviço / Ato <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={2}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Vistoria: Solicitação e Identificação Veicular Notarial"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none font-medium"
              autoFocus
            />
          </div>

          {/* Valor Monetário e Status Ativo/Inativo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Valor Base do Emolumento (R$) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">
                  R$
                </span>
                <input
                  type="text"
                  value={valorStr}
                  onChange={(e) => setValorStr(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono font-bold text-emerald-400 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Status Ativo/Inativo */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-300 block">
                  Status do Serviço
                </span>
                <span
                  className={`text-[10px] font-semibold ${
                    ativo ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {ativo ? 'Ativo no Balcão e PDV' : 'Inativo (Oculto)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAtivo(!ativo)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all border ${
                  ativo
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                }`}
              >
                {ativo ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          </div>
        </div>

        {/* Alerta de Erro */}
        {erro && (
          <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-semibold flex items-start gap-2 animate-fadeIn">
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{erro}</span>
          </div>
        )}

        {/* Rodapé de Ações */}
        <div className="flex gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 cursor-pointer transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className={`flex-1 py-2.5 text-white rounded-xl text-xs font-bold border-0 cursor-pointer shadow-lg flex items-center justify-center gap-2 transition-all ${
              isEdicao
                ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-950/50'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50'
            }`}
          >
            {salvando ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Gravando no Banco...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                <span>{isEdicao ? 'Salvar Alterações' : 'Cadastrar no Catálogo'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
