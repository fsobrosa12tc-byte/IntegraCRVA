import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Car,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Plus,
  RefreshCw,
  Send,
  MessageSquare,
  ShieldAlert,
  Radio,
  X,
  Phone,
  ArrowRight,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import {
  listarVistoriasPatio,
  cadastrarVistoriaPatio,
  atualizarStatusVistoria,
  reenviarNotificacaoWhatsApp,
  inscreverVistoriasPatioRealtime,
  type VistoriaPatio,
  type StatusVistoria
} from '../../services/vistoriaService';
import BotaoWhatsAppGateway from './BotaoWhatsAppGateway';
import ModalConexaoWhatsApp from './ModalConexaoWhatsApp';
import { useEvolutionWhatsApp } from '../../hooks/useEvolutionWhatsApp';

interface PainelEsteiraVistoriasProps {
  onVoltar?: () => void;
  usuarioNome?: string;
}

export default function PainelEsteiraVistorias({ onVoltar, usuarioNome = 'Operador' }: PainelEsteiraVistoriasProps) {
  const [vistorias, setVistorias] = useState<VistoriaPatio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroAba, setFiltroAba] = useState<StatusVistoria | 'todos'>('todos');

  // Modais de Ação
  const [modalWhatsAppAberto, setModalWhatsAppAberto] = useState(false);
  const [modalNovaVistoria, setModalNovaVistoria] = useState(false);
  const [vistoriaParaBox, setVistoriaParaBox] = useState<VistoriaPatio | null>(null);
  const [boxSelecionado, setBoxSelecionado] = useState('01');
  const [vistoriaParaReprovar, setVistoriaParaReprovar] = useState<VistoriaPatio | null>(null);
  const [motivoReprovacao, setMotivoReprovacao] = useState('');
  const [processandoAcao, setProcessandoAcao] = useState(false);
  const [toastMensagem, setToastMensagem] = useState<string | null>(null);

  // Formulário de Nova Vistoria
  const [formPlaca, setFormPlaca] = useState('');
  const [formModelo, setFormModelo] = useState('');
  const [formCliente, setFormCliente] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formComanda, setFormComanda] = useState('');

  // Status da Conexão WhatsApp
  const { isOnline, status } = useEvolutionWhatsApp({
    pollIntervalMs: 25000,
    autoPolling: true,
  });

  const exibirToast = (msg: string) => {
    setToastMensagem(msg);
    setTimeout(() => setToastMensagem(null), 4000);
  };

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true);
      const dados = await listarVistoriasPatio();
      setVistorias(dados);
    } catch (e: any) {
      console.error('Falha ao carregar vistorias:', e);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();

    // Inscrição Realtime no Supabase
    const desinscrever = inscreverVistoriasPatioRealtime(() => {
      carregarDados();
    });

    return () => {
      desinscrever();
    };
  }, [carregarDados]);

  // Ações da Esteira
  const handleChamarBox = async () => {
    if (!vistoriaParaBox) return;
    setProcessandoAcao(true);
    try {
      await atualizarStatusVistoria(vistoriaParaBox.id, 'em_vistoria', {
        box: boxSelecionado,
        operadorNome: usuarioNome,
      });
      exibirToast(`Veículo ${vistoriaParaBox.placa} chamado para o Box ${boxSelecionado}! Notificação disparada.`);
      setVistoriaParaBox(null);
      await carregarDados();
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const handleAprovar = async (v: VistoriaPatio) => {
    if (!confirm(`Confirmar APROVAÇÃO da vistoria do veículo ${v.placa}?`)) return;
    try {
      await atualizarStatusVistoria(v.id, 'aprovado', {
        operadorNome: usuarioNome,
      });
      exibirToast(`Vistoria do veículo ${v.placa} APROVADA com sucesso! Notificação enviada.`);
      await carregarDados();
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  const handleReprovar = async () => {
    if (!vistoriaParaReprovar) return;
    if (!motivoReprovacao.trim()) {
      alert('Informe os motivos da pendência/reprovação.');
      return;
    }
    setProcessandoAcao(true);
    try {
      await atualizarStatusVistoria(vistoriaParaReprovar.id, 'reprovado', {
        motivos: motivoReprovacao,
        operadorNome: usuarioNome,
      });
      exibirToast(`Pendências registradas para o veículo ${vistoriaParaReprovar.placa}.`);
      setVistoriaParaReprovar(null);
      setMotivoReprovacao('');
      await carregarDados();
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const handleCadastrarVistoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPlaca.trim()) {
      alert('A placa do veículo é obrigatória.');
      return;
    }
    setProcessandoAcao(true);
    try {
      await cadastrarVistoriaPatio({
        placa: formPlaca,
        veiculo_modelo: formModelo,
        cliente_nome: formCliente,
        cliente_telefone: formTelefone,
        protocolo: formComanda,
      });
      exibirToast(`Vistoria da placa ${formPlaca.toUpperCase()} cadastrada na esteira!`);
      setFormPlaca('');
      setFormModelo('');
      setFormCliente('');
      setFormTelefone('');
      setFormComanda('');
      setModalNovaVistoria(false);
      await carregarDados();
    } catch (err: any) {
      alert(`Erro ao cadastrar: ${err.message}`);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const handleReenviarMsg = async (id: string) => {
    const res = await reenviarNotificacaoWhatsApp(id);
    exibirToast(res.mensagem);
    await carregarDados();
  };

  // Filtragem
  const vistoriasFiltradas = useMemo(() => {
    return vistorias.filter((v) => {
      if (filtroAba !== 'todos' && v.status !== filtroAba) return false;
      if (busca) {
        const termo = busca.toUpperCase();
        return (
          v.placa.toUpperCase().includes(termo) ||
          (v.cliente_nome && v.cliente_nome.toUpperCase().includes(termo)) ||
          (v.veiculo_modelo && v.veiculo_modelo.toUpperCase().includes(termo)) ||
          (v.protocolo && v.protocolo.toUpperCase().includes(termo))
        );
      }
      return true;
    });
  }, [vistorias, filtroAba, busca]);

  const contadores = useMemo(() => {
    return {
      aguardando: vistorias.filter((v) => v.status === 'aguardando_box').length,
      emVistoria: vistorias.filter((v) => v.status === 'em_vistoria').length,
      aprovados: vistorias.filter((v) => v.status === 'aprovado').length,
      reprovados: vistorias.filter((v) => v.status === 'reprovado').length,
      total: vistorias.length,
    };
  }, [vistorias]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-white">
      {/* Barra Superior Corporativa */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer mr-1"
              title="Voltar ao Menu Principal"
            >
              <ArrowRight size={18} className="rotate-180" />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
            <Car size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Esteira Operacional de Vistorias</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                Pátio CRVA
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Controle de fluxo de boxes e chamadas automáticas via WhatsApp Gateway
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Botão de Monitoramento do WhatsApp Gateway */}
          <BotaoWhatsAppGateway
            onClick={() => setModalWhatsAppAberto(true)}
            status={status}
            isOnline={isOnline}
          />

          <button
            type="button"
            onClick={() => setModalNovaVistoria(true)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-950/50 flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Nova Vistoria</span>
          </button>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Abas com Contadores */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto text-xs">
            <button
              type="button"
              onClick={() => setFiltroAba('todos')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroAba === 'todos'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Todos</span>
              <span className="px-1.5 py-0.2 rounded-md bg-slate-700 text-[10px]">
                {contadores.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroAba('aguardando_box')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroAba === 'aguardando_box'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Aguardando Box</span>
              <span className="px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 text-[10px]">
                {contadores.aguardando}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroAba('em_vistoria')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroAba === 'em_vistoria'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Em Vistoria</span>
              <span className="px-1.5 py-0.2 rounded-md bg-sky-500/20 text-sky-300 text-[10px]">
                {contadores.emVistoria}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroAba('aprovado')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroAba === 'aprovado'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Aprovados</span>
              <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px]">
                {contadores.aprovados}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroAba('reprovado')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroAba === 'reprovado'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Pendências</span>
              <span className="px-1.5 py-0.2 rounded-md bg-rose-500/20 text-rose-300 text-[10px]">
                {contadores.reprovados}
              </span>
            </button>
          </div>

          {/* Campo de Busca e Atualização */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
              <input
                type="text"
                placeholder="Buscar placa, cliente ou comanda..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={carregarDados}
              disabled={carregando}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded-xl transition-all cursor-pointer"
              title="Atualizar lista"
            >
              <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Grade de Vistorias */}
        {carregando && vistorias.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <RefreshCw size={28} className="animate-spin text-emerald-500" />
            <p className="text-xs">Sincronizando esteira de vistorias...</p>
          </div>
        ) : vistoriasFiltradas.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900/50 border border-slate-800/80 text-slate-400 space-y-2">
            <Car size={32} className="mx-auto text-slate-600 mb-2" />
            <h3 className="text-sm font-bold text-slate-200">Nenhum veículo encontrado nesta etapa</h3>
            <p className="text-xs text-slate-500">
              {busca ? 'Nenhum resultado corresponde à sua busca.' : 'A fila de atendimento está livre no momento.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vistoriasFiltradas.map((v) => {
              const ehAguardando = v.status === 'aguardando_box';
              const ehEmVistoria = v.status === 'em_vistoria';
              const ehAprovado = v.status === 'aprovado';
              const ehReprovado = v.status === 'reprovado';

              return (
                <div
                  key={v.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 ${
                    ehAprovado
                      ? 'bg-slate-900/70 border-emerald-500/30 hover:border-emerald-500/50'
                      : ehReprovado
                        ? 'bg-slate-900/70 border-rose-500/30 hover:border-rose-500/50'
                        : ehEmVistoria
                          ? 'bg-slate-900/70 border-sky-500/40 hover:border-sky-500/60 shadow-lg shadow-sky-950/20'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header do Card com Placa e Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="inline-block px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-md font-mono font-black text-sm text-white tracking-widest shadow-inner">
                          {v.placa}
                        </div>
                        {v.veiculo_modelo && (
                          <span className="block text-xs text-slate-400 font-medium mt-1">
                            {v.veiculo_modelo}
                          </span>
                        )}
                      </div>

                      {/* Badge de Status */}
                      <div>
                        {ehAguardando && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            Aguardando Box
                          </span>
                        )}
                        {ehEmVistoria && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/30 animate-pulse">
                            Box {v.box || '01'}
                          </span>
                        )}
                        {ehAprovado && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 size={11} /> Aprovado
                          </span>
                        )}
                        {ehReprovado && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <XCircle size={11} /> Pendências
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dados do Cliente e Protocolo */}
                    <div className="space-y-1 text-xs text-slate-300">
                      {v.cliente_nome && (
                        <div className="truncate">
                          <span className="text-slate-500">Cliente: </span>
                          <strong className="text-slate-200">{v.cliente_nome}</strong>
                        </div>
                      )}
                      {v.cliente_telefone && (
                        <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                          <Phone size={12} className="text-emerald-400" />
                          <span>{v.cliente_telefone}</span>
                        </div>
                      )}
                      {v.protocolo && (
                        <div className="text-[11px] text-slate-500 font-mono">
                          Comanda: {v.protocolo}
                        </div>
                      )}
                    </div>

                    {/* Exibição de Pendências se Reprovado */}
                    {ehReprovado && v.motivos_pendencia && (
                      <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 space-y-1">
                        <span className="font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider">
                          <AlertTriangle size={12} /> Motivos da Pendência:
                        </span>
                        <p className="text-[11px] leading-relaxed text-rose-200/90">
                          {v.motivos_pendencia}
                        </p>
                      </div>
                    )}

                    {/* Status da Notificação WhatsApp */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare size={13} className={v.notificacao_whatsapp_status === 'enviado' ? 'text-emerald-400' : 'text-slate-500'} />
                        <span className="text-slate-400">Notificação:</span>
                        <span className="font-semibold capitalize text-slate-300">
                          {v.notificacao_whatsapp_status === 'enviado'
                            ? 'Enviada'
                            : v.notificacao_whatsapp_status === 'falha'
                              ? 'Falhou'
                              : v.notificacao_whatsapp_status === 'ignorado_offline'
                                ? 'Offline'
                                : 'Pendente'}
                        </span>
                      </div>

                      {v.cliente_telefone && (
                        <button
                          type="button"
                          onClick={() => handleReenviarMsg(v.id)}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer bg-transparent border-0 p-0"
                          title="Reenviar WhatsApp manualmente"
                        >
                          Reenviar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Ações Rápidas por Status */}
                  <div className="pt-2 flex items-center gap-2">
                    {ehAguardando && (
                      <button
                        type="button"
                        onClick={() => {
                          setVistoriaParaBox(v);
                          setBoxSelecionado('01');
                        }}
                        className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-sky-950/50"
                      >
                        <Radio size={14} />
                        <span>Chamar p/ Box</span>
                      </button>
                    )}

                    {ehEmVistoria && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAprovar(v)}
                          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-950/50"
                        >
                          <CheckCircle2 size={14} />
                          <span>Aprovar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setVistoriaParaReprovar(v);
                            setMotivoReprovacao('');
                          }}
                          className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-rose-950/50"
                        >
                          <XCircle size={14} />
                          <span>Reprovar</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Chamar para Box */}
      {vistoriaParaBox && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Radio size={16} className="text-sky-400" />
                <span>Chamar Veículo para Box</span>
              </h3>
              <button
                type="button"
                onClick={() => setVistoriaParaBox(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              O veículo <strong>{vistoriaParaBox.placa}</strong> receberá uma notificação instantânea no WhatsApp orientando o comparecimento imediato ao box selecionado.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Selecione o Box:</label>
              <div className="grid grid-cols-4 gap-2">
                {['01', '02', '03', '04'].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBoxSelecionado(b)}
                    className={`py-2.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                      boxSelecionado === b
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-950/50 border border-sky-400'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Box {b}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVistoriaParaBox(null)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleChamarBox}
                disabled={processandoAcao}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send size={13} />
                <span>Disparar Chamada</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Reprovação / Pendências */}
      {vistoriaParaReprovar && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-400" />
                <span>Registrar Pendências na Vistoria</span>
              </h3>
              <button
                type="button"
                onClick={() => setVistoriaParaReprovar(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Descreva as não-conformidades encontradas no veículo <strong>{vistoriaParaReprovar.placa}</strong>. O cliente será notificado via WhatsApp para comparecer ao atendimento.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Motivos da Pendência / Reprovação:</label>
              <textarea
                rows={4}
                value={motivoReprovacao}
                onChange={(e) => setMotivoReprovacao(e.target.value)}
                placeholder="Ex: Pneu dianteiro desgastado; numeração do motor inacessível; lâmpada de freio inoperante..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVistoriaParaReprovar(null)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReprovar}
                disabled={processandoAcao}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <XCircle size={13} />
                <span>Confirmar Pendência</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nova Vistoria */}
      {modalNovaVistoria && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Car size={16} className="text-emerald-400" />
                <span>Nova Vistoria na Esteira</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalNovaVistoria(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCadastrarVistoria} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Placa *</label>
                  <input
                    type="text"
                    required
                    placeholder="ABC1D23"
                    value={formPlaca}
                    onChange={(e) => setFormPlaca(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Modelo / Marca</label>
                  <input
                    type="text"
                    placeholder="Fiat Palio 1.0"
                    value={formModelo}
                    onChange={(e) => setFormModelo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Proprietário / Requerente</label>
                <input
                  type="text"
                  placeholder="Nome do cliente..."
                  value={formCliente}
                  onChange={(e) => setFormCliente(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Celular / WhatsApp *</label>
                  <input
                    type="text"
                    placeholder="(54) 99999-8888"
                    value={formTelefone}
                    onChange={(e) => setFormTelefone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Comanda / Protocolo</label>
                  <input
                    type="text"
                    placeholder="REC-2026-..."
                    value={formComanda}
                    onChange={(e) => setFormComanda(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalNovaVistoria(false)}
                  className="px-3.5 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={processandoAcao}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  Cadastrar no Pátio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: WhatsApp Gateway */}
      <ModalConexaoWhatsApp
        aberto={modalWhatsAppAberto}
        onFechar={() => setModalWhatsAppAberto(false)}
      />

      {/* Toast Flutuante de Feedback */}
      {toastMensagem && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-slate-900 border border-emerald-500/50 text-emerald-200 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2.5 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <Sparkles size={16} className="text-emerald-400" />
          <span>{toastMensagem}</span>
        </div>
      )}
    </div>
  );
}

