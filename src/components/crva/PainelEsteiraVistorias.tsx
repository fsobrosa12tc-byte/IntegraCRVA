import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Car,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Plus,
  RefreshCw,
  Send,
  MessageSquare,
  Radio,
  X,
  Phone,
  ArrowLeft,
  Sparkles,
  Tag,
  FileText,
  User,
  Building2,
  Hash,
  Clock,
  Check
} from 'lucide-react';
import {
  listarVistoriasPatio,
  cadastrarVistoriaPatio,
  atualizarStatusVistoria,
  vincularFichaDigitalVistoria,
  gerarEAtribuirFichaDigital,
  chamarVeiculoParaVistoria,
  reenviarNotificacaoWhatsApp,
  inscreverVistoriasPatioRealtime,
  mascararCpfVistoria,
  type VistoriaPatio,
  type StatusVistoria,
  type TipoAtendimentoVistoria
} from '../../services/vistoriaService';
import { useEvolutionWhatsApp } from '../../hooks/useEvolutionWhatsApp';
import { WHATSAPP_TEMPLATES } from '../../config/whatsappTemplates';

export interface DadosAtendimentoBalcao {
  placa?: string;
  modelo?: string;
  chassi?: string;
  clienteNome?: string;
  clienteCpf?: string;
  clienteTelefone?: string;
}

interface PainelEsteiraVistoriasProps {
  onVoltar?: () => void;
  usuarioNome?: string;
  modoModal?: boolean;
  rotuloVoltar?: string;
  dadosAtendimentoAtual?: DadosAtendimentoBalcao;
}

export default function PainelEsteiraVistorias({
  onVoltar,
  usuarioNome = 'Operador',
  modoModal = false,
  rotuloVoltar = 'Voltar ao Atendimento',
  dadosAtendimentoAtual,
}: PainelEsteiraVistoriasProps) {
  const [vistorias, setVistorias] = useState<VistoriaPatio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroAba, setFiltroAba] = useState<
    'todos' | 'aguardando_ficha' | 'aguardando_vistoria' | 'em_vistoria' | 'concluidos'
  >('todos');

  // Card selecionado para o Painel de Ações do Vistoriador
  const [vistoriaSelecionada, setVistoriaSelecionada] = useState<VistoriaPatio | null>(null);

  const [salvandoFichaId, setSalvandoFichaId] = useState<string | null>(null);
  const [chamandoVistoriaId, setChamandoVistoriaId] = useState<string | null>(null);

  // Modais de Ação
  const [modalNovaVistoria, setModalNovaVistoria] = useState(false);
  const [vistoriaParaReprovar, setVistoriaParaReprovar] = useState<VistoriaPatio | null>(null);
  const [motivoReprovacao, setMotivoReprovacao] = useState('');
  const [processandoAcao, setProcessandoAcao] = useState(false);
  const [toastMensagem, setToastMensagem] = useState<string | null>(null);

  // Formulário de Nova Vistoria Manual
  const [formTipo, setFormTipo] = useState<TipoAtendimentoVistoria>('particular');
  const [formPlaca, setFormPlaca] = useState('');
  const [formModelo, setFormModelo] = useState('');
  const [formChassi, setFormChassi] = useState('');
  const [formCliente, setFormCliente] = useState('');
  const [formCpf, setFormCpf] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formFichaDigital, setFormFichaDigital] = useState('');

  // Status da Conexão WhatsApp (Somente Leitura para Operador)
  const { isOnline: isWhatsAppOnline } = useEvolutionWhatsApp({
    pollIntervalMs: 25000,
    autoPolling: true,
  });

  const exibirToast = (msg: string) => {
    setToastMensagem(msg);
    setTimeout(() => setToastMensagem(null), 5000);
  };

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true);
      const dados = await listarVistoriasPatio();
      setVistorias(dados);
      setVistoriaSelecionada((atual) => {
        if (!atual) return null;
        return dados.find((d) => d.id === atual.id) || atual;
      });
    } catch (e: any) {
      console.error('Falha ao carregar vistorias:', e);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();

    const desinscrever = inscreverVistoriasPatioRealtime(() => {
      carregarDados();
    });

    return () => {
      desinscrever();
    };
  }, [carregarDados]);

  // Atalho de teclado ESC para fechar sub-modais ou retornar ao atendimento
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      if (vistoriaParaReprovar) {
        e.stopPropagation();
        setVistoriaParaReprovar(null);
        return;
      }
      if (vistoriaSelecionada) {
        e.stopPropagation();
        setVistoriaSelecionada(null);
        return;
      }
      if (modalNovaVistoria) {
        e.stopPropagation();
        setModalNovaVistoria(false);
        return;
      }
      if (onVoltar) {
        e.stopPropagation();
        onVoltar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [vistoriaParaReprovar, vistoriaSelecionada, modalNovaVistoria, onVoltar]);

  const abrirModalNovaVistoria = () => {
    if (dadosAtendimentoAtual) {
      if (dadosAtendimentoAtual.placa && !formPlaca) {
        setFormPlaca(dadosAtendimentoAtual.placa.toUpperCase());
      }
      if (dadosAtendimentoAtual.modelo && !formModelo) {
        setFormModelo(dadosAtendimentoAtual.modelo);
      }
      if (dadosAtendimentoAtual.chassi && !formChassi) {
        setFormChassi(dadosAtendimentoAtual.chassi.toUpperCase());
      }
      if (dadosAtendimentoAtual.clienteNome && !formCliente) {
        setFormCliente(dadosAtendimentoAtual.clienteNome);
      }
      if (dadosAtendimentoAtual.clienteCpf && !formCpf) {
        setFormCpf(dadosAtendimentoAtual.clienteCpf);
      }
      if (dadosAtendimentoAtual.clienteTelefone && !formTelefone) {
        setFormTelefone(dadosAtendimentoAtual.clienteTelefone);
      }
    }
    setModalNovaVistoria(true);
  };

  // Ação Automatizada: "Gerar Ficha Digital" (P-xxx / D-xxx sequencial) + Disparo no WhatsApp
  const handleGerarFichaAutomatica = async (vistoria: VistoriaPatio) => {
    setSalvandoFichaId(vistoria.id);
    try {
      const resultado = await gerarEAtribuirFichaDigital(vistoria.id);
      exibirToast(resultado.envioWhatsApp.mensagem);
      await carregarDados();
    } catch (e: any) {
      alert(`Erro ao gerar Ficha Digital: ${e.message}`);
    } finally {
      setSalvandoFichaId(null);
    }
  };

  // Botão "Chamar para vistoria" -> Muda para 'em_vistoria' (Em Atendimento / Pátio) e dispara Mensagem 2
  const handleChamarParaVistoria = async (vistoria: VistoriaPatio) => {
    setChamandoVistoriaId(vistoria.id);
    try {
      const resultado = await chamarVeiculoParaVistoria(vistoria.id, {
        operadorNome: usuarioNome,
      });
      exibirToast(resultado.envioWhatsApp.mensagem);
      await carregarDados();
    } catch (e: any) {
      alert(`Erro ao chamar veículo: ${e.message}`);
    } finally {
      setChamandoVistoriaId(null);
    }
  };

  const handleAprovar = async (v: VistoriaPatio) => {
    if (!confirm(`Confirmar APROVAÇÃO da vistoria do veículo ${v.placa}?`)) return;
    try {
      await atualizarStatusVistoria(v.id, 'aprovado', {
        operadorNome: usuarioNome,
      });
      exibirToast(`Vistoria do veículo ${v.placa} APROVADA com sucesso!`);
      setVistoriaSelecionada(null);
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
      const nova = await cadastrarVistoriaPatio({
        tipo_atendimento: formTipo,
        ficha_digital: formFichaDigital.trim() || null,
        placa: formPlaca,
        veiculo_modelo: formModelo,
        veiculo_chassi: formTipo === 'particular' ? formChassi : null,
        cliente_nome: formCliente,
        cliente_cpf: formTipo === 'particular' ? formCpf : null,
        cliente_telefone: formTelefone,
      });
      exibirToast(
        nova.ficha_digital
          ? `Vistoria ${nova.placa} cadastrada com Ficha Digital ${nova.ficha_digital} e Mensagem 1 disparada!`
          : `Rascunho de vistoria (${nova.placa}) inserido na fila! Insira a Ficha Digital quando gerada.`
      );
      setFormPlaca('');
      setFormModelo('');
      setFormChassi('');
      setFormCliente('');
      setFormCpf('');
      setFormTelefone('');
      setFormFichaDigital('');
      setModalNovaVistoria(false);
      await carregarDados();
    } catch (err: any) {
      alert(`Erro ao cadastrar: ${err.message}`);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const handleReenviarMsg = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const res = await reenviarNotificacaoWhatsApp(id);
    exibirToast(res.mensagem);
    await carregarDados();
  };

  // Filtragem mantendo Ordem Crescente de Chegada
  const vistoriasFiltradas = useMemo(() => {
    return vistorias.filter((v) => {
      if (filtroAba === 'aguardando_ficha' && v.status !== 'aguardando_ficha') return false;
      if (
        filtroAba === 'aguardando_vistoria' &&
        v.status !== 'aguardando_vistoria' &&
        v.status !== 'aguardando_box'
      ) {
        return false;
      }
      if (filtroAba === 'em_vistoria' && v.status !== 'em_vistoria') return false;
      if (filtroAba === 'concluidos' && v.status !== 'aprovado' && v.status !== 'reprovado') {
        return false;
      }

      if (busca) {
        const termo = busca.toUpperCase();
        return (
          v.placa.toUpperCase().includes(termo) ||
          (v.cliente_nome && v.cliente_nome.toUpperCase().includes(termo)) ||
          (v.veiculo_modelo && v.veiculo_modelo.toUpperCase().includes(termo)) ||
          (v.ficha_digital && v.ficha_digital.toUpperCase().includes(termo)) ||
          (v.protocolo && v.protocolo.toUpperCase().includes(termo))
        );
      }
      return true;
    });
  }, [vistorias, filtroAba, busca]);

  const contadores = useMemo(() => {
    return {
      aguardandoFicha: vistorias.filter((v) => v.status === 'aguardando_ficha').length,
      aguardandoVistoria: vistorias.filter(
        (v) => v.status === 'aguardando_vistoria' || v.status === 'aguardando_box'
      ).length,
      emVistoria: vistorias.filter((v) => v.status === 'em_vistoria').length,
      concluidos: vistorias.filter((v) => v.status === 'aprovado' || v.status === 'reprovado').length,
      total: vistorias.length,
    };
  }, [vistorias]);

  return (
    <div
      className={`${
        modoModal ? 'h-full overflow-y-auto' : 'min-h-screen'
      } bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-white`}
    >
      {/* Barra Superior Corporativa */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
            <Car size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Esteira Operacional de Vistorias</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                Ordem Crescente de Chegada
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Vinculação de Ficha Digital DETRAN/RS e chamada automática de pátio via WhatsApp
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Status de Conexão WhatsApp - Somente Leitura */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs select-none">
            <span className="relative flex h-2 w-2">
              {isWhatsAppOnline && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isWhatsAppOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </span>
            <span className={`font-medium ${isWhatsAppOnline ? 'text-emerald-400' : 'text-slate-400'}`}>
              WhatsApp {isWhatsAppOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <button
            type="button"
            onClick={abrirModalNovaVistoria}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-950/50 flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Nova Vistoria</span>
          </button>

          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 hover:border-slate-600 text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
              title={`${rotuloVoltar} (Atalho: ESC)`}
            >
              <ArrowLeft size={15} className="text-emerald-400" />
              <span>{rotuloVoltar}</span>
              <kbd className="hidden md:inline-block ml-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-slate-950 text-slate-400 border border-slate-700 rounded">
                ESC
              </kbd>
            </button>
          )}
        </div>
      </header>

      {/* Conteúdo Principal */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Legenda Visual Rápida (Particular vs Despachante) + Barra de Filtros */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setFiltroAba('todos')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroAba === 'todos'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Fila Completa</span>
              <span className="px-1.5 py-0.2 rounded-md bg-slate-700 text-[10px]">
                {contadores.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroAba('aguardando_ficha')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroAba === 'aguardando_ficha'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Aguardando Ficha Digital</span>
              <span className="px-1.5 py-0.2 rounded-md bg-purple-500/20 text-purple-300 text-[10px]">
                {contadores.aguardandoFicha}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroAba('aguardando_vistoria')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroAba === 'aguardando_vistoria'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Aguardando Vistoria</span>
              <span className="px-1.5 py-0.2 rounded-md bg-sky-500/20 text-sky-300 text-[10px]">
                {contadores.aguardandoVistoria}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroAba('em_vistoria')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroAba === 'em_vistoria'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Em Atendimento / Pátio</span>
              <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px]">
                {contadores.emVistoria}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroAba('concluidos')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroAba === 'concluidos'
                  ? 'bg-slate-800 text-slate-200 border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Concluídos</span>
              <span className="px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-300 text-[10px]">
                {contadores.concluidos}
              </span>
            </button>
          </div>

          {/* Campo de Busca e Atualização */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
              <input
                type="text"
                placeholder="Buscar placa, ficha digital, cliente ou despachante..."
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
              title="Atualizar fila"
            >
              <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Grade de Cards em Ordem Crescente de Chegada */}
        {carregando && vistorias.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <RefreshCw size={28} className="animate-spin text-emerald-500" />
            <p className="text-xs">Sincronizando fila de vistorias...</p>
          </div>
        ) : vistoriasFiltradas.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900/50 border border-slate-800/80 text-slate-400 space-y-2">
            <Car size={32} className="mx-auto text-slate-600 mb-2" />
            <h3 className="text-sm font-bold text-slate-200">Nenhum veículo nesta etapa da fila</h3>
            <p className="text-xs text-slate-500">
              {busca ? 'Nenhum resultado corresponde à sua busca.' : 'A fila de vistorias está livre no momento.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vistoriasFiltradas.map((v, idx) => {
              const ehDespachante =
                v.tipo_atendimento === 'despachante' ||
                Boolean(v.protocolo && v.protocolo.toUpperCase().startsWith('D-'));
              const ehParticular = !ehDespachante;

              const ehAguardandoFicha = v.status === 'aguardando_ficha';
              const ehAguardandoVistoria =
                v.status === 'aguardando_vistoria' || v.status === 'aguardando_box';
              const ehEmVistoria = v.status === 'em_vistoria';
              const ehAprovado = v.status === 'aprovado';
              const ehReprovado = v.status === 'reprovado';

              const horaChegada = new Date(v.criado_em).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={v.id}
                  onClick={() => setVistoriaSelecionada(v)}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 cursor-pointer relative overflow-hidden group ${
                    ehParticular
                      ? 'border-sky-500/40 bg-slate-900/90 hover:border-sky-400/80 shadow-lg shadow-sky-950/15'
                      : 'border-amber-500/40 bg-slate-900/90 hover:border-amber-400/80 shadow-lg shadow-amber-950/15'
                  }`}
                >
                  {/* Barra lateral indicadora de cor (Azul/Ciano p/ Particular, Âmbar/Laranja p/ Despachante) */}
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1 ${
                      ehParticular ? 'bg-sky-500' : 'bg-amber-500'
                    }`}
                  />

                  <div className="space-y-3.5 pl-1">
                    {/* Topo do Card: Ordem na Fila + Badge PARTICULAR / DESPACHANTE + Status */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[10px] font-mono font-bold text-slate-400 flex items-center gap-1">
                          <Clock size={10} /> #{idx + 1} · {horaChegada}
                        </span>

                        {ehParticular ? (
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/40 flex items-center gap-1">
                            <User size={10} /> PARTICULAR
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/40 flex items-center gap-1">
                            <Building2 size={10} /> DESPACHANTE
                          </span>
                        )}
                      </div>

                      {/* Badge de Estado Operacional */}
                      <div>
                        {ehAguardandoFicha && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            Aguardando Ficha
                          </span>
                        )}
                        {ehAguardandoVistoria && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/30">
                            Fila de Vistoria
                          </span>
                        )}
                        {ehEmVistoria && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                            Em Atendimento / Pátio
                          </span>
                        )}
                        {ehAprovado && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 size={11} /> Aprovado
                          </span>
                        )}
                        {ehReprovado && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <XCircle size={11} /> Pendências
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Placa, Marca/Modelo e Ficha Digital */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg font-mono font-black text-sm text-white tracking-widest shadow-inner">
                            {v.placa}
                          </span>
                          {v.ficha_digital && (
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${
                                ehParticular
                                  ? 'bg-sky-950/80 text-sky-300 border-sky-500/40'
                                  : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                              }`}
                            >
                              Ficha: {v.ficha_digital}
                            </span>
                          )}
                        </div>
                        <span className="block text-xs font-bold text-slate-200 mt-1.5">
                          {v.veiculo_modelo || 'Modelo não informado'}
                        </span>
                      </div>
                    </div>

                    {/* Campos Específicos conforme Tipo: PARTICULAR vs DESPACHANTE */}
                    {ehParticular ? (
                      <div className="space-y-1 text-xs bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                        <div className="truncate">
                          <span className="text-slate-500">Cliente: </span>
                          <strong className="text-sky-300">{v.cliente_nome || 'Não informado'}</strong>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-500">CPF: </span>
                            <span className="font-mono text-slate-300">
                              {mascararCpfVistoria(v.cliente_cpf)}
                            </span>
                          </div>
                          {v.cliente_telefone && (
                            <div className="flex items-center gap-1 text-sky-400 font-mono">
                              <Phone size={11} />
                              <span>{v.cliente_telefone}</span>
                            </div>
                          )}
                        </div>
                        <div className="text-[11px] pt-0.5 border-t border-slate-800/60">
                          <span className="text-slate-500">Chassi: </span>
                          <span className="font-mono text-slate-300">
                            {v.veiculo_chassi || 'Não informado'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1 text-xs bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                        <div className="truncate">
                          <span className="text-slate-500">Despachante: </span>
                          <strong className="text-amber-300">
                            {v.cliente_nome || 'Despachante Credenciado'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-1 text-amber-400 font-mono">
                            <Phone size={11} />
                            <span>{v.cliente_telefone || 'Sem telefone'}</span>
                          </div>
                          {v.protocolo && (
                            <span className="font-mono text-slate-400">Comanda: {v.protocolo}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Seção Automatizada da Ficha Digital (P-xxx / D-xxx) */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="pt-1"
                    >
                      {!v.ficha_digital ? (
                        <button
                          type="button"
                          disabled={salvandoFichaId === v.id}
                          onClick={() => handleGerarFichaAutomatica(v)}
                          className={`w-full py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 active:scale-95 ${
                            ehParticular
                              ? 'bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white shadow-sky-950/40 border border-sky-400/40'
                              : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-slate-950 font-black shadow-amber-950/40 border border-amber-400/40'
                          }`}
                          title={`Gerar Ficha Digital automática (${ehParticular ? 'P-xxx' : 'D-xxx'}) e disparar no WhatsApp`}
                        >
                          {salvandoFichaId === v.id ? (
                            <>
                              <RefreshCw size={14} className="animate-spin" />
                              <span>Gerando e Notificando...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              <span>Gerar Ficha Digital ({ehParticular ? 'P-xxx' : 'D-xxx'})</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="flex items-center gap-2">
                            <div
                              className={`p-1.5 rounded-lg ${
                                ehParticular ? 'bg-sky-500/20 text-sky-400' : 'bg-amber-500/20 text-amber-400'
                              }`}
                            >
                              <FileText size={14} />
                            </div>
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Ficha Digital Atribuída
                              </span>
                              <span
                                className={`text-xs font-black font-mono tracking-wider ${
                                  ehParticular ? 'text-sky-300' : 'text-amber-300'
                                }`}
                              >
                                {v.ficha_digital}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={salvandoFichaId === v.id}
                            onClick={() => handleGerarFichaAutomatica(v)}
                            className="text-[10px] font-bold text-slate-400 hover:text-white underline cursor-pointer bg-transparent border-0 p-1"
                            title="Regerar próxima numeração se necessário"
                          >
                            {salvandoFichaId === v.id ? 'Gerando...' : 'Regerar'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Status da Notificação WhatsApp */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <MessageSquare
                          size={13}
                          className={
                            v.notificacao_whatsapp_status === 'enviado'
                              ? 'text-emerald-400'
                              : 'text-slate-500'
                          }
                        />
                        <span className="text-slate-400">WhatsApp:</span>
                        <span className="font-semibold capitalize text-slate-300">
                          {v.notificacao_whatsapp_status === 'enviado'
                            ? 'Enviado'
                            : v.notificacao_whatsapp_status === 'falha'
                              ? 'Falhou'
                              : 'Pendente'}
                        </span>
                      </div>

                      {v.cliente_telefone && (
                        <button
                          type="button"
                          onClick={(e) => handleReenviarMsg(v.id, e)}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer bg-transparent border-0 p-0"
                        >
                          Reenviar WhatsApp
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rodapé de Ação do Card (Chamar para vistoria / Aprovar / Reprovar) */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="pt-2 flex items-center gap-2 pl-1"
                  >
                    {(ehAguardandoFicha || ehAguardandoVistoria) && (
                      <button
                        type="button"
                        disabled={chamandoVistoriaId === v.id}
                        onClick={() => handleChamarParaVistoria(v)}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 ${
                          ehParticular
                            ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-950/50'
                            : 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-black shadow-amber-950/50'
                        }`}
                      >
                        <Radio size={14} />
                        <span>
                          {chamandoVistoriaId === v.id
                            ? 'Disparando Chamada...'
                            : 'Chamar para vistoria'}
                        </span>
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
                          <span>Pendência</span>
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

      {/* =====================================================================
          PAINEL DE AÇÕES DO VISTORIADOR (Ao selecionar um card da fila)
      ===================================================================== */}
      {vistoriaSelecionada && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setVistoriaSelecionada(null);
          }}
        >
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold border ${
                    vistoriaSelecionada.tipo_atendimento === 'despachante'
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                      : 'bg-sky-500/15 text-sky-400 border-sky-500/40'
                  }`}
                >
                  <Car size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">
                      Painel do Vistoriador · {vistoriaSelecionada.placa}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        vistoriaSelecionada.tipo_atendimento === 'despachante'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      }`}
                    >
                      {vistoriaSelecionada.tipo_atendimento === 'despachante'
                        ? 'DESPACHANTE'
                        : 'PARTICULAR'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {vistoriaSelecionada.veiculo_modelo || 'Veículo em fila de vistoria'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVistoriaSelecionada(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Resumo Completo do Veículo e da Ficha */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Ficha Digital DETRAN/RS:</span>
                {vistoriaSelecionada.ficha_digital ? (
                  <span className="font-mono font-bold text-emerald-400">
                    {vistoriaSelecionada.ficha_digital}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={salvandoFichaId === vistoriaSelecionada.id}
                    onClick={() => handleGerarFichaAutomatica(vistoriaSelecionada)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles size={12} />
                    <span>Gerar Ficha Digital</span>
                  </button>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {vistoriaSelecionada.tipo_atendimento === 'despachante'
                    ? 'Despachante:'
                    : 'Nome do Cliente:'}
                </span>
                <strong className="text-slate-200">
                  {vistoriaSelecionada.cliente_nome || 'Não informado'}
                </strong>
              </div>
              {vistoriaSelecionada.tipo_atendimento !== 'despachante' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">CPF:</span>
                    <span className="font-mono text-slate-300">
                      {mascararCpfVistoria(vistoriaSelecionada.cliente_cpf)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Chassi:</span>
                    <span className="font-mono text-slate-300">
                      {vistoriaSelecionada.veiculo_chassi || 'Não informado'}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">WhatsApp Cadastrado:</span>
                <span className="font-mono text-emerald-400">
                  {vistoriaSelecionada.cliente_telefone || 'Sem telefone'}
                </span>
              </div>
            </div>

            {/* Prévia da Mensagem 2 que será enviada */}
            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <MessageSquare size={12} /> Mensagem Automática de Chamada de Box:
              </span>
              <p className="text-xs text-slate-300 italic leading-relaxed">
                "
                {WHATSAPP_TEMPLATES.CHAMAR_BOX(
                  vistoriaSelecionada.cliente_nome || 'Cliente',
                  vistoriaSelecionada.veiculo_modelo || 'Veículo',
                  vistoriaSelecionada.placa
                )}
                "
              </p>
            </div>

            {/* Botão de Destaque: Chamar para vistoria */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={chamandoVistoriaId === vistoriaSelecionada.id}
                onClick={async () => {
                  await handleChamarParaVistoria(vistoriaSelecionada);
                  setVistoriaSelecionada(null);
                }}
                className="w-full py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/60 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Radio size={16} />
                <span>Chamar para vistoria</span>
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
              Descreva as não-conformidades encontradas no veículo <strong>{vistoriaParaReprovar.placa}</strong>. O cliente será notificado via WhatsApp.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Motivos da Pendência / Reprovação:</label>
              <textarea
                rows={4}
                value={motivoReprovacao}
                onChange={(e) => setMotivoReprovacao(e.target.value)}
                placeholder="Ex: Pneu dianteiro desgastado; numeração do motor inacessível..."
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

      {/* Modal: Nova Vistoria Manual */}
      {modalNovaVistoria && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Car size={16} className="text-emerald-400" />
                <span>Incluir Veículo na Fila de Vistoria</span>
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
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Modalidade do Atendimento</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormTipo('particular')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      formTipo === 'particular'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <User size={13} />
                    <span>Particular</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormTipo('despachante')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      formTipo === 'despachante'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <Building2 size={13} />
                    <span>Despachante</span>
                  </button>
                </div>
              </div>

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
                  <label className="text-[11px] font-semibold text-slate-400">Marca / Modelo *</label>
                  <input
                    type="text"
                    required
                    placeholder="VW Nivus 200 TSI"
                    value={formModelo}
                    onChange={(e) => setFormModelo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {formTipo === 'particular' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">CPF do Cliente</label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={formCpf}
                      onChange={(e) => setFormCpf(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">Chassi</label>
                    <input
                      type="text"
                      placeholder="9BW..."
                      value={formChassi}
                      onChange={(e) => setFormChassi(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">
                  {formTipo === 'despachante' ? 'Nome / Razão do Despachante *' : 'Nome do Cliente *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={formTipo === 'despachante' ? 'Despachante Central...' : 'Nome completo...'}
                  value={formCliente}
                  onChange={(e) => setFormCliente(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Telefone / WhatsApp *</label>
                  <input
                    type="text"
                    required
                    placeholder="(54) 99999-8888"
                    value={formTelefone}
                    onChange={(e) => setFormTelefone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Nº Ficha Digital (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: 202600123"
                    value={formFichaDigital}
                    onChange={(e) => setFormFichaDigital(e.target.value.toUpperCase())}
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
                  Inserir na Fila
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Flutuante de Feedback */}
      {toastMensagem && (
        <div className="fixed bottom-6 right-6 z-[120] px-4 py-3 bg-slate-900 border border-emerald-500/50 text-emerald-200 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2.5 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <Sparkles size={16} className="text-emerald-400 shrink-0" />
          <span>{toastMensagem}</span>
        </div>
      )}
    </div>
  );
}
