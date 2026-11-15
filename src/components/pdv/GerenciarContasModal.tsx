import React, { useState, useMemo } from 'react';
import {
  X,
  Building2,
  PlusCircle,
  Users,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Edit2
} from 'lucide-react';
import type { Despachante } from '../../types/pdv';
import { supabase } from '../../lib/supabase';
import { cadastrarDespachante } from '../../lib/pdvVendas';
import { formatarBRL, mascararMoeda, desmascararMoeda } from '../../lib/pdvCaixa';
import { mascararDocumento, mascararTelefone, somenteDigitos } from '../../utils/documento';

export interface GerenciarContasModalProps {
  isOpen: boolean;
  onClose: () => void;
  despachantes: Despachante[];
  onDespachantesAtualizados: () => void;
}

export default function GerenciarContasModal({
  isOpen,
  onClose,
  despachantes,
  onDespachantesAtualizados,
}: GerenciarContasModalProps) {
  const [abaAtiva, setAbaAtiva] = useState<'cadastro' | 'lista'>('lista');
  const [busca, setBusca] = useState('');
  
  // Estado do formulário de novo despachante
  const [nomeRazao, setNomeRazao] = useState('');
  const [documento, setDocumento] = useState('');
  const [crdd, setCrdd] = useState('');
  const [telefone, setTelefone] = useState('');
  const [limiteCredito, setLimiteCredito] = useState('');
  
  const [salvando, setSalvando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState('');
  const [erro, setErro] = useState('');

  // Estado para edição rápida
  const [despEditando, setDespEditando] = useState<Despachante | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editDoc, setEditDoc] = useState('');
  const [editTel, setEditTel] = useState('');
  const [editCrdd, setEditCrdd] = useState('');
  const [editLimite, setEditLimite] = useState('');
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  // Filtro de despachantes cadastrados
  const despachantesFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return despachantes;
    return despachantes.filter((d) => {
      const nome = (d.nome_razao || (d as any).nome || '').toLowerCase();
      const doc = (d.documento || (d as any).cnpj || (d as any).cpf || '').toLowerCase();
      const numCrdd = String((d as any).crdd || (d as any).numero_credenciamento || '').toLowerCase();
      return nome.includes(q) || doc.includes(q) || numCrdd.includes(q);
    });
  }, [despachantes, busca]);

  if (!isOpen) return null;

  const handleCadastrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setMensagemSucesso('');

    const nomeTrim = nomeRazao.trim();
    const docLimpo = somenteDigitos(documento);

    if (!nomeTrim) {
      setErro('Informe o Nome ou Razão Social do despachante.');
      return;
    }
    if (!docLimpo || (docLimpo.length !== 11 && docLimpo.length !== 14)) {
      setErro('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
      return;
    }

    setSalvando(true);
    try {
      const novo = await cadastrarDespachante({
        nome_razao: nomeTrim,
        documento: docLimpo,
        telefone: telefone.trim(),
      });

      if (crdd.trim() || limiteCredito.trim()) {
        try {
          const payloadExtra: any = {};
          if (crdd.trim()) payloadExtra.crdd = crdd.trim();
          if (limiteCredito.trim()) payloadExtra.limite_credito = desmascararMoeda(limiteCredito);

          await supabase
            .from('despachantes')
            .update(payloadExtra)
            .eq('id', novo.id);
        } catch {
          // Fallback silencioso
        }
      }

      setMensagemSucesso(`Despachante "${nomeTrim}" cadastrado com sucesso!`);
      setNomeRazao('');
      setDocumento('');
      setCrdd('');
      setTelefone('');
      setLimiteCredito('');
      
      onDespachantesAtualizados();

      setTimeout(() => {
        setAbaAtiva('lista');
        setMensagemSucesso('');
      }, 1400);
    } catch (err: any) {
      setErro(err?.message || 'Falha ao cadastrar despachante.');
    } finally {
      setSalvando(false);
    }
  };

  const iniciarEdicao = (d: Despachante) => {
    setDespEditando(d);
    setEditNome(d.nome_razao || (d as any).nome || '');
    setEditDoc(mascararDocumento(d.documento || (d as any).cnpj || (d as any).cpf || ''));
    setEditTel(mascararTelefone(d.telefone || ''));
    setEditCrdd((d as any).crdd || (d as any).numero_credenciamento || '');
    const lim = (d as any).limite_credito;
    setEditLimite(lim ? formatarBRL(Number(lim)) : '');
  };

  const salvarEdicao = async () => {
    if (!despEditando) return;
    setSalvandoEdit(true);
    setErro('');

    try {
      const updateData: any = {
        nome_razao: editNome.trim(),
        documento: somenteDigitos(editDoc),
        telefone: editTel.trim(),
      };
      if (editCrdd.trim()) updateData.crdd = editCrdd.trim();
      if (editLimite.trim()) updateData.limite_credito = desmascararMoeda(editLimite);

      const { error: errUpdate } = await supabase
        .from('despachantes')
        .update(updateData)
        .eq('id', despEditando.id);

      if (errUpdate) {
        await supabase
          .from('despachantes')
          .update({
            nome_razao: editNome.trim(),
            documento: somenteDigitos(editDoc),
            telefone: editTel.trim(),
          })
          .eq('id', despEditando.id);
      }

      setDespEditando(null);
      onDespachantesAtualizados();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao atualizar despachante.');
    } finally {
      setSalvandoEdit(false);
    }
  };

  const alternarStatusDespachante = async (d: Despachante) => {
    const statusAtual = (d as any).status || 'ativa';
    const novoStatus = statusAtual === 'ativa' ? 'bloqueada' : 'ativa';

    try {
      await supabase
        .from('despachantes')
        .update({ status: novoStatus })
        .eq('id', d.id);
      onDespachantesAtualizados();
    } catch {
      // Silencioso se coluna status não existir
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/95 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100 tracking-tight">
                  Gerenciar Contas-Correntes (Despachantes B2B)
                </h3>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  MÓDULO B2B
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Gestão de parceiros credenciados, cadastro de contas e controle de faturamento
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer border-0 bg-transparent"
            title="Fechar Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navegador de Abas */}
        <div className="px-6 pt-3 border-b border-slate-800 bg-slate-950/40 flex items-center gap-4 shrink-0">
          <button
            type="button"
            onClick={() => setAbaAtiva('lista')}
            className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer bg-transparent border-0 ${
              abaAtiva === 'lista'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={14} />
            <span>Contas Cadastradas ({despachantes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('cadastro')}
            className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer bg-transparent border-0 ${
              abaAtiva === 'cadastro'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <PlusCircle size={14} />
            <span>Cadastrar Novo Despachante Parceiro</span>
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto flex-1">
          {erro && (
            <div className="mb-4 bg-rose-950/50 border border-rose-800/60 text-rose-300 rounded-xl px-4 py-3 text-xs font-medium flex items-center gap-2">
              <AlertTriangle size={15} className="text-rose-400 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {mensagemSucesso && (
            <div className="mb-4 bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 rounded-xl px-4 py-3 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <span>{mensagemSucesso}</span>
            </div>
          )}

          {/* ===================================================================
           * ABA 1: CADASTRAR NOVO DESPACHANTE PARCEIRO
           * =================================================================== */}
          {abaAtiva === 'cadastro' && (
            <form onSubmit={handleCadastrar} className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 mb-2">
                <span className="text-xs font-bold text-slate-200 block mb-1">
                  Novo Credenciamento B2B
                </span>
                <p className="text-[11px] text-slate-400">
                  Preencha os dados oficiais do escritório do despachante parceiro para liberar o faturamento a prazo.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Campo 1: Razão Social / Nome */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                    Nome / Razão Social do Escritório *
                  </label>
                  <input
                    type="text"
                    required
                    value={nomeRazao}
                    onChange={(e) => setNomeRazao(e.target.value)}
                    placeholder="Ex: Despachante Central & Assessoria Notarial"
                    className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                  />
                </div>

                {/* Campo 2: CNPJ ou CPF */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                    CNPJ ou CPF *
                  </label>
                  <input
                    type="text"
                    required
                    value={documento}
                    onChange={(e) => setDocumento(mascararDocumento(e.target.value))}
                    placeholder="00.000.000/0000-00 ou 000.000.000-00"
                    className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                </div>

                {/* Campo 3: Número de Credenciamento (CRDD) */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                    Número de Credenciamento (CRDD)
                  </label>
                  <input
                    type="text"
                    value={crdd}
                    onChange={(e) => setCrdd(e.target.value)}
                    placeholder="Ex: CRDD-RS 1022"
                    className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                </div>

                {/* Campo 4: Telefone / WhatsApp */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                    Telefone / WhatsApp de Contato
                  </label>
                  <input
                    type="text"
                    value={telefone}
                    onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                </div>

                {/* Campo 5: Limite de Crédito a Prazo */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                    Limite de Crédito a Prazo (R$) <span className="text-slate-500">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={limiteCredito}
                    onChange={(e) => setLimiteCredito(mascararMoeda(e.target.value))}
                    placeholder="R$ 5.000,00"
                    className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAbaAtiva('lista')}
                  className="px-5 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={salvando}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-950/40 flex items-center gap-2 transition-all cursor-pointer border-0"
                >
                  {salvando ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Cadastrando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Cadastrar Conta-Corrente</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ===================================================================
           * ABA 2: CONTAS CADASTRADAS (LISTA TABULAR E EDIÇÃO)
           * =================================================================== */}
          {abaAtiva === 'lista' && (
            <div className="space-y-4">
              {/* Barra de Busca e Ações Rápidas */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome, CNPJ/CPF ou CRDD..."
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setAbaAtiva('cadastro')}
                  className="px-3.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <PlusCircle size={14} />
                  <span>Novo Despachante</span>
                </button>
              </div>

              {/* Tabela de Contas Cadastradas */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-900/80 border-b border-slate-800 text-[11px] font-bold text-slate-400">
                        <th className="py-3 px-4">Escritório / Parceiro</th>
                        <th className="py-3 px-4">Documento & CRDD</th>
                        <th className="py-3 px-4">Contato</th>
                        <th className="py-3 px-4 text-right">Saldo Devedor</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {despachantesFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            Nenhum parceiro despachante encontrado com os termos pesquisados.
                          </td>
                        </tr>
                      ) : (
                        despachantesFiltrados.map((desp) => {
                          const nome = desp.nome_razao || (desp as any).nome || 'Despachante Parceiro';
                          const doc = desp.documento || (desp as any).cnpj || (desp as any).cpf || '';
                          const numCrdd = (desp as any).crdd || (desp as any).numero_credenciamento || '';
                          const tel = desp.telefone || '';
                          const saldoDev = Number(desp.saldo_devedor) || 0;
                          const status = (desp as any).status || 'ativa';
                          const isAtiva = status === 'ativa';

                          return (
                            <tr key={desp.id} className="hover:bg-slate-900/40 transition-colors">
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-200">{nome}</div>
                                <div className="text-[10px] text-slate-500 font-mono">ID: {desp.id.slice(0, 8)}...</div>
                              </td>

                              <td className="py-3 px-4 font-mono text-slate-300">
                                <div>{doc ? mascararDocumento(doc) : 'Não informado'}</div>
                                {numCrdd && (
                                  <div className="text-[10px] text-indigo-400 font-semibold">CRDD: {numCrdd}</div>
                                )}
                              </td>

                              <td className="py-3 px-4 text-slate-400 font-mono">
                                {tel ? mascararTelefone(tel) : '-'}
                              </td>

                              <td className="py-3 px-4 text-right font-mono font-bold">
                                <span className={saldoDev > 0 ? 'text-indigo-300' : 'text-slate-400'}>
                                  {formatarBRL(saldoDev)}
                                </span>
                              </td>

                              <td className="py-3 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => alternarStatusDespachante(desp)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider cursor-pointer border transition-all ${
                                    isAtiva
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                                  }`}
                                  title="Clique para alternar o status"
                                >
                                  {isAtiva ? 'Ativa' : 'Bloqueada'}
                                </button>
                              </td>

                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => iniciarEdicao(desp)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-all cursor-pointer border-0 bg-transparent"
                                  title="Editar Dados do Despachante"
                                >
                                  <Edit2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Modal Overlay de Edição Rápida de Despachante */}
          {despEditando && (
            <div className="fixed inset-0 z-[130] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h4 className="font-bold text-white text-sm">Editar Conta de Despachante</h4>
                  <button
                    type="button"
                    onClick={() => setDespEditando(null)}
                    className="p-1 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 block">
                      Nome / Razão Social
                    </label>
                    <input
                      type="text"
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 block">
                        CNPJ ou CPF
                      </label>
                      <input
                        type="text"
                        value={editDoc}
                        onChange={(e) => setEditDoc(mascararDocumento(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 block">
                        CRDD
                      </label>
                      <input
                        type="text"
                        value={editCrdd}
                        onChange={(e) => setEditCrdd(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 block">
                        Telefone
                      </label>
                      <input
                        type="text"
                        value={editTel}
                        onChange={(e) => setEditTel(mascararTelefone(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 block">
                        Limite de Crédito
                      </label>
                      <input
                        type="text"
                        value={editLimite}
                        onChange={(e) => setEditLimite(mascararMoeda(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDespEditando(null)}
                    className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={salvandoEdit}
                    onClick={salvarEdicao}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    {salvandoEdit ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    <span>Salvar Alterações</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="px-6 py-3.5 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 font-mono">
            Sincronização em tempo real com Marks Systems • PostgreSQL
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-all cursor-pointer border border-slate-700"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
