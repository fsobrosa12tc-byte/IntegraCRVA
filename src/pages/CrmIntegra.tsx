import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageSquare,
  ArrowLeft,
  Search,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  User,
  Building2,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Car,
  Phone,
  ArrowRight,
  Trash2,
  X,
  ShieldCheck,
  Zap,
  Bot,
  Filter,
  Receipt,
} from 'lucide-react';
import {
  listarAtendimentosCrm,
  criarAtendimentoTriagemIA,
  moverEtapaKanbanCrm,
  enviarMensagemAtendenteCrm,
  excluirAtendimentoCrm,
  classificarIntencaoWhatsApp,
  METADADOS_INTENCOES_IA,
  type AtendimentoCrm,
  type TipoClienteCrm,
  type EtapaKanbanCrm,
  type StatusEmissaoCrlve,
} from '../services/crmService';
import { useEvolutionWhatsApp } from '../hooks/useEvolutionWhatsApp';

interface CrmIntegraProps {
  onVoltar?: () => void;
  usuarioNome?: string;
}

const COLUNAS_KANBAN: {
  id: EtapaKanbanCrm;
  titulo: string;
  subtitulo: string;
  corHeader: string;
  corBadge: string;
  destaqueTransbordo?: boolean;
}[] = [
  {
    id: 'triagem_ia',
    titulo: '🤖 Triagem IA (Dúvidas & Orientação)',
    subtitulo: 'Dúvidas informativas (horários, documentos, taxas) respondidas pela IA',
    corHeader: 'border-sky-500/40 bg-sky-950/20',
    corBadge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  },
  {
    id: 'transbordo_crlve',
    titulo: '📄 Fila: Débitos & CRLV-e',
    subtitulo: 'Solicitações de CRLV-e e consulta de débitos aguardando operador',
    corHeader: 'border-amber-500/60 bg-amber-950/30 ring-1 ring-amber-500/30',
    corBadge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    destaqueTransbordo: true,
  },
  {
    id: 'em_atendimento',
    titulo: '💬 Em Atendimento Humano',
    subtitulo: 'Operador do CRVA conduzindo o processo',
    corHeader: 'border-indigo-500/40 bg-indigo-950/20',
    corBadge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
  {
    id: 'aguardando_cliente',
    titulo: '⏳ Aguardando Pagamento / Docs',
    subtitulo: 'Guia enviada ou aguardando comprovante/ATPV-e',
    corHeader: 'border-purple-500/40 bg-purple-950/20',
    corBadge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  {
    id: 'concluido',
    titulo: '✅ Concluído / CRLV-e Enviado',
    subtitulo: 'Documento digital entregue e atendimento encerrado',
    corHeader: 'border-emerald-500/40 bg-emerald-950/20',
    corBadge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
];

const ORDEM_ETAPAS: EtapaKanbanCrm[] = [
  'triagem_ia',
  'transbordo_crlve',
  'em_atendimento',
  'aguardando_cliente',
  'concluido',
];

export default function CrmIntegra({
  onVoltar,
  usuarioNome = 'Patrícia Atendente Balcão',
}: CrmIntegraProps) {
  const [atendimentos, setAtendimentos] = useState<AtendimentoCrm[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Separação estrita: 'particular' | 'despachante' | 'fila_crlve' | 'todos'
  const [segmentoAtivo, setSegmentoAtivo] = useState<
    'particular' | 'despachante' | 'fila_crlve' | 'todos'
  >('particular');
  const [busca, setBusca] = useState('');

  // Atendimento selecionado no Cockpit / Chat Lateral
  const [atendimentoAtivo, setAtendimentoAtivo] = useState<AtendimentoCrm | null>(null);
  const [textoMensagem, setTextoMensagem] = useState('');
  const [valorDebitosInput, setValorDebitosInput] = useState<string>('');
  const [statusCrlveInput, setStatusCrlveInput] = useState<StatusEmissaoCrlve>('pendente');
  const [enviandoMsg, setEnviandoMsg] = useState(false);

  // Modal de Simulação / Entrada de Triagem IA
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [formTipoCliente, setFormTipoCliente] = useState<TipoClienteCrm>('particular');
  const [formNome, setFormNome] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formDocumento, setFormDocumento] = useState('');
  const [formPlaca, setFormPlaca] = useState('');
  const [formModelo, setFormModelo] = useState('');
  const [formRenavam, setFormRenavam] = useState('');
  const [formMensagem, setFormMensagem] = useState('');
  const [formDispararWhats, setFormDispararWhats] = useState(false);
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  const { isOnline: isWhatsAppOnline } = useEvolutionWhatsApp({
    pollIntervalMs: 25000,
    autoPolling: true,
  });

  const exibirToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const dados = await listarAtendimentosCrm();
      setAtendimentos(dados);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Atualiza campos auxiliares quando abre um card no cockpit
  useEffect(() => {
    if (atendimentoAtivo) {
      setValorDebitosInput(
        atendimentoAtivo.valor_debitos ? String(atendimentoAtivo.valor_debitos) : ''
      );
      setStatusCrlveInput(atendimentoAtivo.status_emissao_crlve || 'pendente');
    }
  }, [atendimentoAtivo]);

  // Pré-visualização em tempo real da classificação da IA no modal de Novo Atendimento
  const previewIA = useMemo(() => {
    if (!formMensagem.trim()) return null;
    return classificarIntencaoWhatsApp(
      formMensagem,
      formTipoCliente,
      formNome || 'Cliente'
    );
  }, [formMensagem, formTipoCliente, formNome]);

  // Contadores executivos por canal e fila
  const metricas = useMemo(() => {
    const totalParticulares = atendimentos.filter((a) => a.tipo_cliente === 'particular').length;
    const totalDespachantes = atendimentos.filter((a) => a.tipo_cliente === 'despachante').length;
    const totalFilaCrlve = atendimentos.filter(
      (a) =>
        a.fila_transbordo_crlve ||
        a.etapa_kanban === 'transbordo_crlve' ||
        a.intencao_ia === 'debitos_crlve'
    ).length;
    const pendentesCrlveParticular = atendimentos.filter(
      (a) =>
        a.tipo_cliente === 'particular' &&
        (a.fila_transbordo_crlve || a.etapa_kanban === 'transbordo_crlve') &&
        a.etapa_kanban !== 'concluido'
    ).length;
    const pendentesCrlveDespachante = atendimentos.filter(
      (a) =>
        a.tipo_cliente === 'despachante' &&
        (a.fila_transbordo_crlve || a.etapa_kanban === 'transbordo_crlve') &&
        a.etapa_kanban !== 'concluido'
    ).length;

    return {
      totalGeral: atendimentos.length,
      totalParticulares,
      totalDespachantes,
      totalFilaCrlve,
      pendentesCrlveParticular,
      pendentesCrlveDespachante,
    };
  }, [atendimentos]);

  // Filtragem estrita por canal (Particulares vs Despachantes vs Fila Exclusiva CRLV-e) e busca textual
  const atendimentosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return atendimentos.filter((item) => {
      if (segmentoAtivo === 'particular' && item.tipo_cliente !== 'particular') {
        return false;
      }
      if (segmentoAtivo === 'despachante' && item.tipo_cliente !== 'despachante') {
        return false;
      }
      if (
        segmentoAtivo === 'fila_crlve' &&
        !item.fila_transbordo_crlve &&
        item.etapa_kanban !== 'transbordo_crlve' &&
        item.intencao_ia !== 'debitos_crlve'
      ) {
        return false;
      }

      if (!termo) return true;

      return (
        item.cliente_nome.toLowerCase().includes(termo) ||
        item.protocolo.toLowerCase().includes(termo) ||
        (item.veiculo_placa || '').toLowerCase().includes(termo) ||
        (item.veiculo_modelo || '').toLowerCase().includes(termo) ||
        (item.veiculo_renavam || '').toLowerCase().includes(termo) ||
        item.cliente_telefone.toLowerCase().includes(termo) ||
        item.intencao_rotulo.toLowerCase().includes(termo)
      );
    });
  }, [atendimentos, segmentoAtivo, busca]);

  const handleMoverEtapa = async (card: AtendimentoCrm, novaEtapa: EtapaKanbanCrm) => {
    const atualizado = await moverEtapaKanbanCrm(card.id, novaEtapa, usuarioNome);
    if (atualizado) {
      setAtendimentos((prev) => prev.map((a) => (a.id === atualizado.id ? atualizado : a)));
      if (atendimentoAtivo?.id === atualizado.id) {
        setAtendimentoAtivo(atualizado);
      }
      exibirToast(`Atendimento ${card.protocolo} movido para "${COLUNAS_KANBAN.find((c) => c.id === novaEtapa)?.titulo}".`);
    }
  };

  const handleAvancarEtapa = async (card: AtendimentoCrm) => {
    const idxAtual = ORDEM_ETAPAS.indexOf(card.etapa_kanban);
    if (idxAtual < 0 || idxAtual >= ORDEM_ETAPAS.length - 1) return;
    const proxima = ORDEM_ETAPAS[idxAtual + 1];
    await handleMoverEtapa(card, proxima);
  };

  const handleExcluirAtendimento = async (card: AtendimentoCrm) => {
    if (
      !window.confirm(
        `Deseja realmente remover o atendimento concluído ${card.protocolo} (${card.cliente_nome}) do quadro Kanban?`
      )
    ) {
      return;
    }
    await excluirAtendimentoCrm(card.id);
    setAtendimentos((prev) => prev.filter((a) => a.id !== card.id));
    if (atendimentoAtivo?.id === card.id) {
      setAtendimentoAtivo(null);
    }
    exibirToast(`Atendimento ${card.protocolo} arquivado com sucesso.`);
  };

  const handleCriarNovoAtendimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome.trim() || !formTelefone.trim() || !formMensagem.trim()) {
      alert('Preencha Nome, Telefone WhatsApp e a Mensagem do cliente/despachante.');
      return;
    }

    setSalvandoNovo(true);
    try {
      const criado = await criarAtendimentoTriagemIA({
        cliente_nome: formNome,
        cliente_telefone: formTelefone,
        cliente_documento: formDocumento,
        tipo_cliente: formTipoCliente,
        despachante_nome: formTipoCliente === 'despachante' ? formNome : undefined,
        veiculo_placa: formPlaca,
        veiculo_modelo: formModelo,
        veiculo_renavam: formRenavam,
        mensagem_inicial: formMensagem,
        disparar_boas_vindas_whatsapp: formDispararWhats,
      });

      setAtendimentos((prev) => [criado, ...prev]);
      setSegmentoAtivo(criado.tipo_cliente);
      setModalNovoAberto(false);
      setFormNome('');
      setFormTelefone('');
      setFormDocumento('');
      setFormPlaca('');
      setFormModelo('');
      setFormRenavam('');
      setFormMensagem('');
      exibirToast(
        `Triagem IA concluída: ${criado.protocolo} classificado como "${criado.intencao_rotulo}" (${criado.confianca_ia}%).`
      );
    } finally {
      setSalvandoNovo(false);
    }
  };

  const handleEnviarMensagemChat = async (textoCustom?: string, novoStatusCrlve?: StatusEmissaoCrlve) => {
    if (!atendimentoAtivo || enviandoMsg) return;
    const msgFinal = (textoCustom ?? textoMensagem).trim();
    if (!msgFinal) return;

    setEnviandoMsg(true);
    try {
      const valorNum = valorDebitosInput ? parseFloat(valorDebitosInput.replace(',', '.')) : undefined;
      const { atendimento, enviadoWhatsApp } = await enviarMensagemAtendenteCrm({
        atendimentoId: atendimentoAtivo.id,
        texto: msgFinal,
        atendenteNome: usuarioNome,
        dispararWhatsApp: true,
        novoStatusCrlve: novoStatusCrlve || statusCrlveInput,
        valorDebitos: !isNaN(Number(valorNum)) ? Number(valorNum) : undefined,
      });

      if (atendimento) {
        setAtendimentos((prev) => prev.map((a) => (a.id === atendimento.id ? atendimento : a)));
        setAtendimentoAtivo(atendimento);
        if (!textoCustom) setTextoMensagem('');
        exibirToast(
          enviadoWhatsApp
            ? 'Mensagem enviada e entregue no WhatsApp do cliente!'
            : 'Mensagem registrada no histórico do atendimento.'
        );
      }
    } finally {
      setEnviandoMsg(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500/30 selection:text-white">
      {/* Toast Flutuante */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900 border border-sky-500/40 text-sky-300 text-xs font-semibold shadow-2xl animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* =========================================================================
       *  HEADER CORPORATIVO DO CRM-INTEGRA
       * ========================================================================= */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            {onVoltar && (
              <button
                type="button"
                onClick={onVoltar}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Hub Marks Systems</span>
              </button>
            )}

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-inner">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
                    CRM-Integra
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/30">
                    Triagem IA & WhatsApp
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Separação estrita Particulares vs Despachantes • Fila exclusiva de transbordo para Débitos / CRLV-e
                </p>
              </div>
            </div>
          </div>

          {/* Ações do Topo */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status WhatsApp Gateway */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  isWhatsAppOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="text-slate-400 font-medium">WhatsApp Gateway:</span>
              <span className={isWhatsAppOnline ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {isWhatsAppOnline ? 'CONECTADO' : 'MODO CONTINGÊNCIA'}
              </span>
            </div>

            <button
              type="button"
              onClick={carregarDados}
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Atualizar Esteira CRM"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin text-sky-400' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setModalNovoAberto(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-950/50 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Simular / Novo Atendimento WhatsApp</span>
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
       *  BARRA DE SEPARAÇÃO ESTRITA: PARTICULARES vs DESPACHANTES vs FILA CRLV-e
       * ========================================================================= */}
      <section className="max-w-[1600px] w-full mx-auto px-6 pt-5 pb-3 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          {/* Abas de Separação Estrita */}
          <div className="lg:col-span-8 flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800">
            <button
              type="button"
              onClick={() => setSegmentoAtivo('particular')}
              className={`flex-1 min-w-[180px] flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                segmentoAtivo === 'particular'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Atendimento Particulares</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-black/25 font-mono">
                {metricas.totalParticulares}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSegmentoAtivo('despachante')}
              className={`flex-1 min-w-[180px] flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                segmentoAtivo === 'despachante'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Atendimento Despachantes</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-black/25 font-mono">
                {metricas.totalDespachantes}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSegmentoAtivo('fila_crlve')}
              className={`flex-1 min-w-[210px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                segmentoAtivo === 'fila_crlve'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-950/50'
                  : 'text-amber-300/90 hover:text-amber-200 bg-amber-500/10 border border-amber-500/30'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Fila Exclusiva: Débitos / CRLV-e</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-black/25 text-white font-mono">
                {metricas.totalFilaCrlve}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSegmentoAtivo('todos')}
              className={`py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                segmentoAtivo === 'todos'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({metricas.totalGeral})
            </button>
          </div>

          {/* Busca Rápida por Placa, RENAVAM, Protocolo ou Cliente */}
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por Placa, RENAVAM, Nome, Despachante ou #Protocolo..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 focus:border-sky-500/50 focus:outline-none text-xs text-white placeholder-slate-500"
            />
          </div>
        </div>

        {/* Faixa Informativa da Fila de Transbordo de Débitos / CRLV-e */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900/90 to-slate-900/90 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Roteamento Automático IA Ativo — Transbordo Débitos & CRLV-e
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Sempre que a IA identifica intenção de <strong>Emissão de CRLV-e, IPVA, Licenciamento ou Guia GAD-E</strong> no WhatsApp, o card é alocado automaticamente na coluna exclusiva de transbordo humano.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-semibold">
              Particulares na Fila CRLV-e: <strong>{metricas.pendentesCrlveParticular}</strong>
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-semibold">
              Despachantes na Fila CRLV-e: <strong>{metricas.pendentesCrlveDespachante}</strong>
            </span>
          </div>
        </div>
      </section>

      {/* =========================================================================
       *  QUADRO KANBAN DE 5 COLUNAS
       * ========================================================================= */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 pb-8 overflow-x-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 min-w-[1150px]">
          {COLUNAS_KANBAN.map((coluna) => {
            const cardsDaColuna = atendimentosFiltrados.filter(
              (a) => a.etapa_kanban === coluna.id
            );

            return (
              <div
                key={coluna.id}
                className={`rounded-2xl border flex flex-col h-[calc(100vh-270px)] min-h-[540px] ${
                  coluna.destaqueTransbordo
                    ? 'bg-slate-900/90 border-amber-500/40 shadow-xl shadow-amber-950/20'
                    : 'bg-slate-900/60 border-slate-800/90'
                }`}
              >
                {/* Cabeçalho da Coluna Kanban */}
                <div className={`p-3.5 border-b rounded-t-2xl ${coluna.corHeader}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h2 className="text-xs font-extrabold text-white tracking-wide">
                      {coluna.titulo}
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${coluna.corBadge}`}
                    >
                      {cardsDaColuna.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">{coluna.subtitulo}</p>
                </div>

                {/* Lista de Cards da Coluna */}
                <div className="flex-1 p-3 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                  {cardsDaColuna.length === 0 ? (
                    <div className="h-44 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-center p-4 text-slate-500">
                      <Bot className="w-6 h-6 mb-2 opacity-40" />
                      <span className="text-xs font-medium">Nenhum atendimento nesta etapa</span>
                      <span className="text-[10px] text-slate-600 mt-0.5">
                        Canal filtrado:{' '}
                        {segmentoAtivo === 'particular'
                          ? 'Particulares'
                          : segmentoAtivo === 'despachante'
                          ? 'Despachantes'
                          : segmentoAtivo === 'fila_crlve'
                          ? 'Fila CRLV-e'
                          : 'Todos'}
                      </span>
                    </div>
                  ) : (
                    cardsDaColuna.map((card) => {
                      const metaIntencao =
                        METADADOS_INTENCOES_IA[card.intencao_ia] ||
                        METADADOS_INTENCOES_IA.duvida_geral;
                      const ehDesp = card.tipo_cliente === 'despachante';

                      return (
                        <div
                          key={card.id}
                          onClick={() => setAtendimentoAtivo(card)}
                          className={`rounded-2xl border p-3.5 transition-all cursor-pointer group flex flex-col justify-between gap-2.5 ${
                            card.fila_transbordo_crlve && card.etapa_kanban !== 'concluido'
                              ? 'bg-slate-950/90 border-amber-500/40 hover:border-amber-400 shadow-md'
                              : 'bg-slate-950/75 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {/* Topo do Card: Protocolo + Canal (Particular vs Despachante) */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-slate-300 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                              {card.protocolo}
                            </span>

                            <span
                              className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                ehDesp
                                  ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              {ehDesp ? '🏢 DESPACHANTE' : '👤 PARTICULAR'}
                            </span>
                          </div>

                          {/* Nome do Cliente / Escritório e Telefone */}
                          <div>
                            <h3 className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors truncate">
                              {card.cliente_nome}
                            </h3>
                            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                              <Phone className="w-3 h-3 text-slate-500" />
                              <span>{card.cliente_telefone}</span>
                            </p>
                          </div>

                          {/* Placa e Modelo do Veículo */}
                          {(card.veiculo_placa || card.veiculo_modelo) && (
                            <div className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800/90 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Car className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span className="text-[11px] text-slate-300 truncate">
                                  {card.veiculo_modelo || 'Veículo Identificado'}
                                </span>
                              </div>
                              {card.veiculo_placa && (
                                <span className="font-mono text-[11px] font-black px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 shrink-0">
                                  {card.veiculo_placa}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Badge de Intenção Identificada pela IA */}
                          <div className="flex items-center justify-between gap-1.5">
                            <span
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 truncate ${metaIntencao.corBadge}`}
                            >
                              <span>{metaIntencao.icone}</span>
                              <span className="truncate">{card.intencao_rotulo}</span>
                            </span>

                            <span
                              className="text-[10px] font-mono text-slate-400 shrink-0"
                              title="Confiança da Triagem IA"
                            >
                              IA {card.confianca_ia.toFixed(0)}%
                            </span>
                          </div>

                          {/* Resumo da IA ou Última Mensagem */}
                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-900/50 p-2 rounded-xl border border-slate-800/60">
                            “{card.ultima_mensagem}”
                          </p>

                          {/* Rodapé de Ações Rápidas do Card */}
                          <div
                            className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {card.etapa_kanban !== 'transbordo_crlve' &&
                            card.etapa_kanban !== 'concluido' ? (
                              <button
                                type="button"
                                onClick={() => handleMoverEtapa(card, 'transbordo_crlve')}
                                className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold transition-colors cursor-pointer"
                                title="Enviar para Fila Exclusiva de Débitos / CRLV-e"
                              >
                                → Fila CRLV-e
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-medium">
                                {new Date(card.ultima_interacao_em).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}

                            <div className="flex items-center gap-1.5">
                              {card.etapa_kanban !== 'concluido' && (
                                <button
                                  type="button"
                                  onClick={() => handleAvancarEtapa(card)}
                                  className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <span>Avançar</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}

                              {card.etapa_kanban === 'concluido' && (
                                <button
                                  type="button"
                                  onClick={() => handleExcluirAtendimento(card)}
                                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg p-1.5 text-xs flex items-center gap-1 cursor-pointer"
                                  title="Arquivar/Remover atendimento concluído"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* =========================================================================
       *  DRAWER / MODAL DE CHAT AO VIVO & COCKPIT DE EMISSÃO DE CRLV-E
       * ========================================================================= */}
      {atendimentoAtivo && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex justify-end animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAtendimentoAtivo(null);
          }}
        >
          <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full flex flex-col justify-between shadow-2xl overflow-hidden">
            {/* Topo do Cockpit */}
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700">
                    {atendimentoAtivo.protocolo}
                  </span>
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                      atendimentoAtivo.tipo_cliente === 'despachante'
                        ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {atendimentoAtivo.tipo_cliente === 'despachante'
                      ? '🏢 Canal Despachante B2B'
                      : '👤 Canal Particular B2C'}
                  </span>
                  {atendimentoAtivo.fila_transbordo_crlve && (
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      🚨 Fila Débitos / CRLV-e
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-white">
                  {atendimentoAtivo.cliente_nome}
                </h2>
                <p className="text-xs text-slate-400">
                  WhatsApp: {atendimentoAtivo.cliente_telefone}
                  {atendimentoAtivo.cliente_documento
                    ? ` • CPF/CNPJ: ${atendimentoAtivo.cliente_documento}`
                    : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAtendimentoAtivo(null)}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo Rolável: Diagnóstico IA + Ações CRLV-e + Histórico de Mensagens */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Card de Diagnóstico da IA & Dados do Veículo */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Diagnóstico de Intenção da IA ({atendimentoAtivo.confianca_ia}%)</span>
                  </span>
                  <span className="text-xs font-bold text-white">
                    {atendimentoAtivo.intencao_rotulo}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/90 p-3 rounded-xl border border-slate-800/80">
                  {atendimentoAtivo.resumo_ia}
                </p>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Placa</span>
                    <span className="font-mono text-xs font-bold text-sky-300">
                      {atendimentoAtivo.veiculo_placa || 'Não informada'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">RENAVAM</span>
                    <span className="font-mono text-xs font-bold text-slate-200">
                      {atendimentoAtivo.veiculo_renavam || 'Não informado'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Veículo</span>
                    <span className="text-xs font-semibold text-slate-200 truncate block">
                      {atendimentoAtivo.veiculo_modelo || 'Em identificação'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Painel Exclusivo de Transbordo: Débitos & Emissão de CRLV-e */}
              <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-amber-300 flex items-center gap-2">
                    <Receipt className="w-4 h-4" />
                    <span>Central de Transbordo: Débitos / Emissão de CRLV-e</span>
                  </span>

                  <select
                    value={atendimentoAtivo.etapa_kanban}
                    onChange={(e) =>
                      handleMoverEtapa(atendimentoAtivo, e.target.value as EtapaKanbanCrm)
                    }
                    className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-semibold"
                  >
                    {COLUNAS_KANBAN.map((c) => (
                      <option key={c.id} value={c.id}>
                        Etapa: {c.titulo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Total de Débitos / Guia GAD-E (R$)
                    </label>
                    <input
                      type="text"
                      value={valorDebitosInput}
                      onChange={(e) => setValorDebitosInput(e.target.value)}
                      placeholder="Ex: 142.85"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Status da Emissão do CRLV-e
                    </label>
                    <select
                      value={statusCrlveInput}
                      onChange={(e) => setStatusCrlveInput(e.target.value as StatusEmissaoCrlve)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      <option value="pendente">Pendente de Consulta</option>
                      <option value="consultando_detran">Consultando Débitos no Detran</option>
                      <option value="guia_enviada">Guia / PIX Enviado ao Cliente</option>
                      <option value="pago_aguardando_emissao">Pago — Gerando PDF CRLV-e</option>
                      <option value="crlve_enviado">CRLV-e Emitido e Enviado</option>
                    </select>
                  </div>
                </div>

                {/* Botões de Resposta Rápida de Transbordo CRLV-e */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      handleEnviarMensagemChat(
                        `Olá, ${atendimentoAtivo.cliente_nome}! Levantamento concluído no CRVA para o veículo placa *${
                          atendimentoAtivo.veiculo_placa || 'informada'
                        }*: o total de taxas/débitos para emissão do CRLV-e é de *R$ ${
                          valorDebitosInput || '111,08'
                        }*. Assim que confirmar o pagamento, já emitimos e enviamos seu CRLV-e Digital por aqui!`,
                        'guia_enviada'
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    📤 Enviar Resumo de Débitos
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await handleEnviarMensagemChat(
                        `Ótima notícia, ${atendimentoAtivo.cliente_nome}! ✅ O pagamento foi compensado e o *CRLV-e Digital* do veículo placa *${
                          atendimentoAtivo.veiculo_placa || ''
                        }* foi emitido com sucesso. Ele também já está disponível no aplicativo Carteira Digital de Trânsito (CDT).`,
                        'crlve_enviado'
                      );
                      await handleMoverEtapa(atendimentoAtivo, 'concluido');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    ✅ Confirmar Emissão CRLV-e e Concluir
                  </button>
                </div>
              </div>

              {/* Histórico de Conversa WhatsApp */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Histórico da Conversa (WhatsApp & Triagem IA)
                </h4>

                <div className="space-y-2.5 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 max-h-72 overflow-y-auto">
                  {atendimentoAtivo.historico_mensagens.map((msg) => {
                    const ehCliente = msg.remetente === 'cliente';
                    const ehIA = msg.remetente === 'ia';

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          ehCliente ? 'items-start' : 'items-end'
                        }`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed border ${
                            ehCliente
                              ? 'bg-slate-900 border-slate-800 text-slate-200'
                              : ehIA
                              ? 'bg-sky-950/50 border-sky-500/30 text-sky-100'
                              : 'bg-emerald-950/50 border-emerald-500/30 text-emerald-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-1 text-[10px] font-bold opacity-75">
                            <span>
                              {ehCliente
                                ? `👤 ${msg.autor_nome}`
                                : ehIA
                                ? '🤖 Triagem IA Integra'
                                : `👨‍💼 ${msg.autor_nome}`}
                            </span>
                            <span>{msg.horario}</span>
                          </div>
                          <p className="whitespace-pre-line">{msg.texto}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Caixa de Envio de Mensagem WhatsApp */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-2.5">
              <input
                type="text"
                value={textoMensagem}
                onChange={(e) => setTextoMensagem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleEnviarMensagemChat();
                  }
                }}
                placeholder="Digite a mensagem para enviar ao WhatsApp do cliente/despachante..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 focus:border-sky-500 text-xs text-white placeholder-slate-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={enviandoMsg || !textoMensagem.trim()}
                onClick={() => handleEnviarMensagemChat()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{enviandoMsg ? 'Enviando...' : 'Enviar WhatsApp'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
       *  MODAL DE SIMULAÇÃO / ENTRADA DE TRIAGEM INTELIGENTE WHATSAPP (IA)
       * ========================================================================= */}
      {modalNovoAberto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Registrar / Simular Entrada de WhatsApp (Triagem IA)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    A IA identifica automaticamente a intenção e transfere pedidos de Débitos/CRLV-e para a fila exclusiva
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalNovoAberto(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCriarNovoAtendimento} className="p-6 space-y-4">
              {/* Seleção Estrita: Particular vs Despachante */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">
                  Canal do Remetente (Separação Estrita):
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormTipoCliente('particular')}
                    className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      formTipoCliente === 'particular'
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    <span>Cliente Particular (B2C)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormTipoCliente('despachante')}
                    className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      formTipoCliente === 'despachante'
                        ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Escritório Despachante (B2B)</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    {formTipoCliente === 'despachante'
                      ? 'Razão Social / Nome do Despachante *'
                      : 'Nome do Cliente Particular *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    placeholder={
                      formTipoCliente === 'despachante'
                        ? 'Ex: Despachante Central'
                        : 'Ex: João Carlos Silva'
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    WhatsApp (com DDD) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTelefone}
                    onChange={(e) => setFormTelefone(e.target.value)}
                    placeholder="Ex: (51) 99812-3456"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Placa (Opcional)
                  </label>
                  <input
                    type="text"
                    value={formPlaca}
                    onChange={(e) => setFormPlaca(e.target.value.toUpperCase())}
                    placeholder="IJK4E56"
                    maxLength={8}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Modelo do Veículo
                  </label>
                  <input
                    type="text"
                    value={formModelo}
                    onChange={(e) => setFormModelo(e.target.value)}
                    placeholder="Ex: VW Nivus Highline"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    RENAVAM
                  </label>
                  <input
                    type="text"
                    value={formRenavam}
                    onChange={(e) => setFormRenavam(e.target.value)}
                    placeholder="01298451203"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Mensagem Recebida no WhatsApp *
                </label>
                <textarea
                  rows={3}
                  required
                  value={formMensagem}
                  onChange={(e) => setFormMensagem(e.target.value)}
                  placeholder="Ex: Bom dia, preciso ver os débitos de licenciamento e emitir o CRLV-e 2026 da placa IJK4E56..."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white resize-none"
                />
              </div>

              {/* Preview em Tempo Real da Classificação IA */}
              {previewIA && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-sky-500/30 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-sky-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Intenção Detectada pela IA: {previewIA.intencao_rotulo}</span>
                    </span>
                    <span className="font-mono text-[11px] text-emerald-400 font-bold">
                      {previewIA.confianca_ia}% confiança
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{previewIA.resumo_ia}</p>
                  {previewIA.fila_transbordo_crlve && (
                    <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 pt-1">
                      <Zap className="w-3.5 h-3.5" />
                      <span>
                        Transbordo Automático Ativado → Fila Exclusiva "Débitos / CRLV-e"
                      </span>
                    </div>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formDispararWhats}
                  onChange={(e) => setFormDispararWhats(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-sky-500"
                />
                <span>
                  Disparar resposta automática da IA via Evolution API para este número agora
                </span>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalNovoAberto(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoNovo}
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-950/50 cursor-pointer disabled:opacity-50"
                >
                  {salvandoNovo ? 'Processando IA...' : 'Classificar e Inserir no Kanban'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

