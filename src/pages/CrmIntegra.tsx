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
  CheckCircle2,
  Trash2,
  X,
  Zap,
  Bot,
  Receipt,
  AlertTriangle,
  Clock,
  ShieldCheck,
  History,
  SlidersHorizontal,
} from 'lucide-react';
import {
  listarAtendimentosCrm,
  criarAtendimentoTriagemIA,
  moverEtapaKanbanCrm,
  enviarMensagemAtendenteCrm,
  registrarMensagemRecebida,
  excluirAtendimentoCrm,
  triarMensagem,
  validarMovimento,
  METADADOS_ASSUNTO,
  ORDEM_ASSUNTOS,
  type AtendimentoCrm,
  type AssuntoCrm,
  type TipoClienteCrm,
  type EtapaKanbanCrm,
  type StatusEmissaoCrlve,
} from '../services/crmService';
import { useEvolutionWhatsApp } from '../hooks/useEvolutionWhatsApp';
import ConversationModal from '../components/ConversationModal';
import AiSettingsPanel from '../components/crm/AiSettingsPanel';
import { getAiConfig, type AiConfig } from '../services/aiRouterService';

interface CrmIntegraProps {
  onVoltar?: () => void;
  usuarioNome?: string;
}

// ============================================================================
// COLUNAS KANBAN (DESIGN CORPORATIVO MINIMALISTA)
// ============================================================================
const COLUNAS_KANBAN: {
  id: EtapaKanbanCrm;
  titulo: string;
  subtitulo: string;
  pontoCor: string;
}[] = [
  {
    id: 'triagem_ia',
    titulo: 'Triagem (IA Ativa)',
    subtitulo: 'Novas mensagens em atendimento automático',
    pontoCor: 'bg-sky-400',
  },
  {
    id: 'aguardando_documentacao',
    titulo: 'Aguardando Documentação',
    subtitulo: 'Pendência de fotos, certidões ou ATPV-e',
    pontoCor: 'bg-purple-400',
  },
  {
    id: 'fila_humana_particular',
    titulo: 'Fila Humana (Particular)',
    subtitulo: 'Cidadãos aguardando operador / IVD',
    pontoCor: 'bg-blue-400',
  },
  {
    id: 'fila_humana_despachante',
    titulo: 'Fila Humana (Despachante)',
    subtitulo: 'Demandas técnicas com CRDD / GRT',
    pontoCor: 'bg-amber-400',
  },
  {
    id: 'analise_vistoria',
    titulo: 'Em Análise / Vistoria',
    subtitulo: 'Em pista de vistoria ou pendência técnica',
    pontoCor: 'bg-emerald-400',
  },
  {
    id: 'concluido',
    titulo: 'Concluídos',
    subtitulo: 'Serviço finalizado ou CRLV-e emitido',
    pontoCor: 'bg-slate-500',
  },
];

type FiltroPerfil = 'todos' | TipoClienteCrm;
type FiltroPeriodo = 'todos' | '30min' | '1h' | 'hoje' | 'ontem' | '7d';
type FiltroResponsavel = 'todos' | 'ia' | 'humano';

const ROTULO_PERIODO: Record<FiltroPeriodo, string> = {
  todos: 'Qualquer data/hora',
  '30min': 'Últimos 30 min',
  '1h': 'Última 1 hora',
  hoje: 'Hoje',
  ontem: 'Ontem',
  '7d': 'Últimos 7 dias',
};

function dentroDoPeriodo(iso: string, periodo: FiltroPeriodo): boolean {
  if (periodo === 'todos') return true;
  const instante = new Date(iso).getTime();
  const agora = Date.now();
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const ini = inicioHoje.getTime();
  switch (periodo) {
    case '30min':
      return instante >= agora - 30 * 60000;
    case '1h':
      return instante >= agora - 60 * 60000;
    case 'hoje':
      return instante >= ini;
    case 'ontem':
      return instante >= ini - 86400000 && instante < ini;
    case '7d':
      return instante >= agora - 7 * 86400000;
    default:
      return true;
  }
}

function tempoRelativo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function dataHoraCurta(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function iniciais(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function rotuloEtapa(id: EtapaKanbanCrm): string {
  return COLUNAS_KANBAN.find((c) => c.id === id)?.titulo || id;
}

export default function CrmIntegra({
  onVoltar,
  usuarioNome = 'Patrícia Atendente Balcão',
}: CrmIntegraProps) {
  const [atendimentos, setAtendimentos] = useState<AtendimentoCrm[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [, setTick] = useState(0);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroPerfil, setFiltroPerfil] = useState<FiltroPerfil>('todos');
  const [filtroAssuntos, setFiltroAssuntos] = useState<AssuntoCrm[]>([]);
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>('todos');
  const [filtroResponsavel, setFiltroResponsavel] = useState<FiltroResponsavel>('todos');
  const [somenteUrgentes, setSomenteUrgentes] = useState(false);
  const [painelFiltrosAvancados, setPainelFiltrosAvancados] = useState(false);

  // Drag & drop
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<EtapaKanbanCrm | null>(null);

  // Cockpit lateral
  const [ativoId, setAtivoId] = useState<string | null>(null);
  const [textoMensagem, setTextoMensagem] = useState('');
  const [textoSimulado, setTextoSimulado] = useState('');
  const [valorDebitosInput, setValorDebitosInput] = useState('');
  const [statusCrlveInput, setStatusCrlveInput] = useState<StatusEmissaoCrlve>('pendente');
  const [enviandoMsg, setEnviandoMsg] = useState(false);

  // Novo atendimento
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [formTipo, setFormTipo] = useState<TipoClienteCrm>('particular');
  const [formNome, setFormNome] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formDocumento, setFormDocumento] = useState('');
  const [formPlaca, setFormPlaca] = useState('');
  const [formModelo, setFormModelo] = useState('');
  const [formRenavam, setFormRenavam] = useState('');
  const [formMensagem, setFormMensagem] = useState('');
  const [formDispararWhats, setFormDispararWhats] = useState(false);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [modalAiAberto, setModalAiAberto] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig>(getAiConfig());

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
      setAtendimentos(await listarAtendimentosCrm());
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Atualiza os tempos relativos a cada minuto
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(i);
  }, []);

  const atendimentoAtivo = useMemo(
    () => atendimentos.find((a) => a.id === ativoId) || null,
    [atendimentos, ativoId]
  );

  useEffect(() => {
    if (atendimentoAtivo) {
      setValorDebitosInput(atendimentoAtivo.valor_debitos ? String(atendimentoAtivo.valor_debitos) : '');
      setStatusCrlveInput(atendimentoAtivo.status_emissao_crlve || 'pendente');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativoId]);

  const substituir = (atualizado: AtendimentoCrm) =>
    setAtendimentos((prev) => prev.map((a) => (a.id === atualizado.id ? atualizado : a)));

  // Filtragem e ordenação (urgentes primeiro, depois mais recentes)
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return atendimentos.filter((a) => {
      if (filtroPerfil !== 'todos' && a.tipo_cliente !== filtroPerfil) return false;
      if (filtroAssuntos.length > 0 && !filtroAssuntos.includes(a.assunto)) return false;
      if (!dentroDoPeriodo(a.ultima_interacao_em, filtroPeriodo)) return false;
      if (filtroResponsavel !== 'todos' && a.responsavel_tipo !== filtroResponsavel) return false;
      if (somenteUrgentes && !a.urgente) return false;
      if (!termo) return true;
      return (
        a.cliente_nome.toLowerCase().includes(termo) ||
        a.protocolo.toLowerCase().includes(termo) ||
        (a.veiculo_placa || '').toLowerCase().includes(termo) ||
        (a.veiculo_renavam || '').toLowerCase().includes(termo) ||
        (a.grt_numero || '').toLowerCase().includes(termo) ||
        METADADOS_ASSUNTO[a.assunto].tag.toLowerCase().includes(termo)
      );
    });
  }, [atendimentos, busca, filtroPerfil, filtroAssuntos, filtroPeriodo, filtroResponsavel, somenteUrgentes]);

  const porColuna = useMemo(() => {
    const mapa: Record<EtapaKanbanCrm, AtendimentoCrm[]> = {
      triagem_ia: [],
      aguardando_documentacao: [],
      fila_humana_particular: [],
      fila_humana_despachante: [],
      analise_vistoria: [],
      concluido: [],
    };
    for (const a of filtrados) mapa[a.etapa_kanban]?.push(a);
    (Object.keys(mapa) as EtapaKanbanCrm[]).forEach((k) =>
      mapa[k].sort((x, y) => {
        if (x.urgente !== y.urgente) return x.urgente ? -1 : 1;
        return new Date(y.ultima_interacao_em).getTime() - new Date(x.ultima_interacao_em).getTime();
      })
    );
    return mapa;
  }, [filtrados]);

  const metricas = useMemo(
    () => ({
      total: atendimentos.length,
      urgentes: atendimentos.filter((a) => a.urgente && a.etapa_kanban !== 'concluido').length,
      iaAtiva: atendimentos.filter((a) => a.responsavel_tipo === 'ia' && a.etapa_kanban !== 'concluido').length,
      particulares: atendimentos.filter((a) => a.tipo_cliente === 'particular').length,
      despachantes: atendimentos.filter((a) => a.tipo_cliente === 'despachante').length,
    }),
    [atendimentos]
  );

  const filtrosAtivos =
    filtroPerfil !== 'todos' ||
    filtroAssuntos.length > 0 ||
    filtroPeriodo !== 'todos' ||
    filtroResponsavel !== 'todos' ||
    somenteUrgentes ||
    busca.trim() !== '';

  const limparFiltros = () => {
    setBusca('');
    setFiltroPerfil('todos');
    setFiltroAssuntos([]);
    setFiltroPeriodo('todos');
    setFiltroResponsavel('todos');
    setSomenteUrgentes(false);
  };

  const alternarAssunto = (a: AssuntoCrm) =>
    setFiltroAssuntos((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const handleMover = async (card: AtendimentoCrm, destino: EtapaKanbanCrm) => {
    if (card.etapa_kanban === destino) return;
    const erro = validarMovimento(card, destino);
    if (erro) {
      exibirToast(`⚠️ ${erro}`);
      return;
    }
    const atualizado = await moverEtapaKanbanCrm(card.id, destino, usuarioNome);
    if (atualizado) {
      substituir(atualizado);
      exibirToast(`${card.protocolo} → ${rotuloEtapa(destino)}`);
    }
  };

  const handleExcluir = async (card: AtendimentoCrm) => {
    if (!window.confirm(`Arquivar o atendimento concluído ${card.protocolo}?`)) return;
    await excluirAtendimentoCrm(card.id);
    setAtendimentos((prev) => prev.filter((a) => a.id !== card.id));
    if (ativoId === card.id) setAtivoId(null);
    exibirToast(`Atendimento ${card.protocolo} arquivado.`);
  };

  const handleEnviarMensagem = async (textoCustom?: string, novoStatus?: StatusEmissaoCrlve) => {
    if (!atendimentoAtivo || enviandoMsg) return;
    const msg = (textoCustom ?? textoMensagem).trim();
    if (!msg) return;
    setEnviandoMsg(true);
    try {
      const valor = valorDebitosInput ? parseFloat(valorDebitosInput.replace(',', '.')) : undefined;
      const { atendimento, enviadoWhatsApp } = await enviarMensagemAtendenteCrm({
        atendimentoId: atendimentoAtivo.id,
        texto: msg,
        atendenteNome: usuarioNome,
        novoStatusCrlve: novoStatus || statusCrlveInput,
        valorDebitos: valor !== undefined && !isNaN(valor) ? valor : undefined,
      });
      if (atendimento) {
        substituir(atendimento);
        if (!textoCustom) setTextoMensagem('');
        exibirToast(
          enviadoWhatsApp ? 'Mensagem enviada ao WhatsApp do cliente.' : 'Mensagem salva no histórico interno.'
        );
      }
    } finally {
      setEnviandoMsg(false);
    }
  };

  const handleSimularRecebida = async () => {
    if (!atendimentoAtivo || !textoSimulado.trim()) return;
    const antes = atendimentoAtivo.etapa_kanban;
    const atualizado = await registrarMensagemRecebida(atendimentoAtivo.id, textoSimulado.trim());
    if (atualizado) {
      substituir(atualizado);
      setTextoSimulado('');
      exibirToast(
        antes !== atualizado.etapa_kanban
          ? `IA reclassificou: ${rotuloEtapa(atualizado.etapa_kanban)}`
          : 'Nova mensagem recebida registrada.'
      );
    }
  };

  const previewTriagem = useMemo(
    () => (formMensagem.trim() ? triarMensagem(formMensagem, formTipo, formNome || 'Cliente') : null),
    [formMensagem, formTipo, formNome]
  );

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome.trim() || !formTelefone.trim() || !formMensagem.trim()) {
      alert('Preencha Nome, WhatsApp e a Mensagem recebida.');
      return;
    }
    setSalvandoNovo(true);
    try {
      const criado = await criarAtendimentoTriagemIA({
        cliente_nome: formNome,
        cliente_telefone: formTelefone,
        cliente_documento: formDocumento,
        tipo_cliente: formTipo,
        veiculo_placa: formPlaca,
        veiculo_modelo: formModelo,
        veiculo_renavam: formRenavam,
        mensagem_inicial: formMensagem,
        disparar_boas_vindas_whatsapp: formDispararWhats,
      });
      setAtendimentos((prev) => [criado, ...prev]);
      setModalNovoAberto(false);
      setFormNome('');
      setFormTelefone('');
      setFormDocumento('');
      setFormPlaca('');
      setFormModelo('');
      setFormRenavam('');
      setFormMensagem('');
      exibirToast(`${criado.protocolo} iniciado em ${rotuloEtapa(criado.etapa_kanban)}`);
    } finally {
      setSalvandoNovo(false);
    }
  };

  // ==========================================================================
  // CARD DE CONVERSA (DESIGN MINIMALISTA, ERGONÔMICO E CORPORATIVO)
  // ==========================================================================
  const renderCard = (card: AtendimentoCrm) => {
    const ehDesp = card.tipo_cliente === 'despachante';
    const meta = METADADOS_ASSUNTO[card.assunto];
    const ehIA = card.responsavel_tipo === 'ia' || !card.atendente_nome;

    return (
      <div
        key={card.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', card.id);
          e.dataTransfer.effectAllowed = 'move';
          setArrastandoId(card.id);
        }}
        onDragEnd={() => {
          setArrastandoId(null);
          setColunaAlvo(null);
        }}
        onClick={() => setAtivoId(card.id)}
        className={`relative rounded-xl p-3 cursor-pointer transition-all duration-150 select-none bg-[#1F2937] hover:bg-[#283548] shadow-sm hover:shadow-md border border-white/[0.06] ${
          arrastandoId === card.id ? 'opacity-40 scale-[0.98]' : ''
        } ${card.urgente ? 'border-l-4 border-l-red-500' : ''}`}
      >
        {/* Linha 1: Nome + Horário */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-sm font-semibold text-slate-100 truncate tracking-tight">
            {card.cliente_nome}
          </span>
          <span className="text-[11px] text-slate-400 shrink-0 font-medium">
            {tempoRelativo(card.ultima_interacao_em)}
          </span>
        </div>

        {/* Linha 2: Badges compactos (Perfil + Assunto + Urgência sutil) */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {ehDesp ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400">
              Despachante{card.registro_crdd ? ` • ${card.registro_crdd}` : ''}
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400">
              Particular
            </span>
          )}

          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-300">
            {meta.tag}
          </span>

          {card.urgente && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {card.motivo_urgencia || 'Urgente'}
            </span>
          )}
        </div>

        {/* Linha 3: Prévia da mensagem (máximo 2 linhas, sanitizado LGPD) */}
        <p className="text-xs text-slate-300 leading-relaxed line-clamp-2 mb-2.5 font-normal">
          {card.snippet_lgpd}
        </p>

        {/* Linha 4: Rodapé discreto (Veículo + Atendente / IA) */}
        <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between gap-2">
          {/* Identificador Veicular discreto */}
          <div className="flex items-center gap-1 text-[11px] text-slate-400 truncate font-mono">
            {card.veiculo_placa ? (
              <span className="px-1.5 py-0.5 rounded bg-slate-900/80 text-slate-200 border border-white/[0.06] font-semibold">
                {card.veiculo_placa}
              </span>
            ) : card.veiculo_modelo ? (
              <span className="text-slate-400 truncate">{card.veiculo_modelo}</span>
            ) : (
              <span className="text-slate-500 text-[10px]">{card.protocolo}</span>
            )}
            {card.grt_numero && (
              <span className="text-[10px] text-amber-400/90 font-sans">GRT</span>
            )}
          </div>

          {/* Atendente ou IA */}
          <div className="flex items-center gap-1.5 shrink-0">
            {ehIA ? (
              <span
                className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400"
                title="Atendimento automático por IA"
              >
                <Bot className="w-3 h-3" /> IA
              </span>
            ) : (
              <div
                className="flex items-center gap-1 text-[10px] text-slate-300"
                title={`Responsável: ${card.atendente_nome}`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-700 text-[8px] font-bold text-slate-200 flex items-center justify-center">
                  {iniciais(card.atendente_nome || 'Op')}
                </span>
                <span className="max-w-[70px] truncate text-[10px] text-slate-400">
                  {card.atendente_nome?.split(' ')[0]}
                </span>
              </div>
            )}

            {card.etapa_kanban === 'concluido' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExcluir(card);
                }}
                className="text-slate-500 hover:text-red-400 p-0.5 transition-colors cursor-pointer"
                title="Arquivar conversa"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const mostrarPainelCrlve =
    atendimentoAtivo &&
    (atendimentoAtivo.assunto === 'crlve_atpve' || atendimentoAtivo.assunto === 'bloqueio_debitos');

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0B0F19] text-slate-100 flex flex-col font-sans select-none">
      {/* Toast flutuante minimalista */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[70] flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-[#1F2937] border border-white/10 text-xs text-slate-200 shadow-2xl animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* CABEÇALHO COMPACTO E ELEGANTE (LINHA ÚNICA)                           */}
      {/* ==================================================================== */}
      <header className="h-14 shrink-0 px-4 border-b border-white/[0.06] bg-[#0D1117] flex items-center justify-between gap-3">
        {/* Lado Esquerdo: Identidade + Voltar */}
        <div className="flex items-center gap-3 shrink-0">
          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Voltar ao Hub"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
              <MessageSquare className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-white">CRM-Integra</span>
            <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-white/[0.06]">
              CRVA Detran/RS
            </span>
          </div>
        </div>

        {/* Centro: Barra de busca universal integrada + Tabs de perfil */}
        <div className="flex items-center gap-2 flex-1 max-w-2xl mx-4">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por placa, renavam, nome, protocolo... ⌘K"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-[#111827] border border-white/[0.08] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500 transition-colors"
            />
          </div>

          {/* Segment Buttons (Tabs minimalistas) */}
          <div className="flex items-center p-0.5 rounded-lg bg-[#111827] border border-white/[0.06] text-xs">
            <button
              type="button"
              onClick={() => setFiltroPerfil('todos')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                filtroPerfil === 'todos' ? 'bg-[#1F2937] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFiltroPerfil('particular')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                filtroPerfil === 'particular'
                  ? 'bg-blue-500/20 text-blue-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Particulares
            </button>
            <button
              type="button"
              onClick={() => setFiltroPerfil('despachante')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                filtroPerfil === 'despachante'
                  ? 'bg-amber-500/20 text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Despachantes
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSomenteUrgentes((v) => !v)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
              somenteUrgentes
                ? 'bg-red-500/15 border-red-500/30 text-red-400 font-semibold'
                : 'bg-[#111827] border-white/[0.06] text-slate-400 hover:text-slate-200'
            }`}
          >
            Urgentes{metricas.urgentes > 0 ? ` (${metricas.urgentes})` : ''}
          </button>

          <button
            type="button"
            onClick={() => setPainelFiltrosAvancados((v) => !v)}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              painelFiltrosAvancados || filtroAssuntos.length > 0 || filtroPeriodo !== 'todos' || filtroResponsavel !== 'todos'
                ? 'bg-[#1F2937] border-white/20 text-white'
                : 'bg-[#111827] border-white/[0.06] text-slate-400 hover:text-slate-200'
            }`}
            title="Mais filtros (Assunto, Período, Responsável)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Lado Direito: Motor IA + WhatsApp Status + Refresh + Botão Primário Esmeralda */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Botão de Configuração do Motor de IA */}
          <button
            type="button"
            onClick={() => setModalAiAberto(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111827] hover:bg-[#1f2937] border border-white/[0.06] hover:border-white/20 text-[11px] text-slate-300 transition-all cursor-pointer shadow-sm"
            title="Configurar Motor de IA (Google Gemini / Groq Cloud)"
          >
            <Bot className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400 hidden sm:inline">Motor IA:</span>
            <span className="font-semibold text-white">
              {aiConfig.activeProvider === 'gemini' ? 'Gemini Flash' : 'Groq Llama'}
            </span>
          </button>

          {/* Status WhatsApp */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111827] border border-white/[0.06] text-[11px] text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                isWhatsAppOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-400 hidden sm:inline">WhatsApp:</span>
            <span className={isWhatsAppOnline ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
              {isWhatsAppOnline ? 'Conectado' : 'Contingência'}
            </span>
          </div>

          <button
            type="button"
            onClick={carregarDados}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setModalNovoAberto(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Conversa</span>
          </button>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* BARRA DE STATUS ULTRA-COMPACTA & CHIPS DE FILTRO (SUB-BARRA)         */}
      {/* ==================================================================== */}
      <div className="shrink-0 px-4 py-1.5 bg-[#0B0F19] border-b border-white/[0.04] flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-300">{metricas.total} conversas</span>
          <span className="text-slate-600">•</span>
          <span className={metricas.urgentes > 0 ? 'text-red-400 font-medium' : 'text-slate-400'}>
            {metricas.urgentes} urgentes
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-sky-400 font-medium">{metricas.iaAtiva} com IA</span>
          <span className="text-slate-600">•</span>
          <span>{metricas.particulares} particulares</span>
          <span className="text-slate-600">•</span>
          <span>{metricas.despachantes} despachantes</span>
        </div>

        {filtrosAtivos && (
          <button
            type="button"
            onClick={limparFiltros}
            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
          >
            <X className="w-3 h-3" /> Limpar filtros
          </button>
        )}
      </div>

      {/* Painel expansível de filtros adicionais */}
      {painelFiltrosAvancados && (
        <div className="shrink-0 px-4 py-2.5 bg-[#111827] border-b border-white/[0.06] flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px]">Período:</span>
            <select
              value={filtroPeriodo}
              onChange={(e) => setFiltroPeriodo(e.target.value as FiltroPeriodo)}
              className="px-2 py-1 rounded bg-[#1F2937] border border-white/10 text-xs text-slate-200 focus:outline-none"
            >
              {(Object.keys(ROTULO_PERIODO) as FiltroPeriodo[]).map((k) => (
                <option key={k} value={k}>
                  {ROTULO_PERIODO[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px]">Responsável:</span>
            <select
              value={filtroResponsavel}
              onChange={(e) => setFiltroResponsavel(e.target.value as FiltroResponsavel)}
              className="px-2 py-1 rounded bg-[#1F2937] border border-white/10 text-xs text-slate-200 focus:outline-none"
            >
              <option value="todos">Todos</option>
              <option value="ia">Agente IA</option>
              <option value="humano">Atendente Humano</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[11px] mr-1">Assunto:</span>
            {ORDEM_ASSUNTOS.map((a) => {
              const ativo = filtroAssuntos.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => alternarAssunto(a)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    ativo
                      ? 'bg-slate-200 text-slate-900 font-semibold'
                      : 'bg-[#1F2937] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {METADADOS_ASSUNTO[a].rotulo}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ÁREA PRINCIPAL DO KANBAN (100% DA VIEWPORT VERTICAL RESTANTE)        */}
      {/* ==================================================================== */}
      <main className="flex-1 w-full overflow-x-auto overflow-y-hidden p-3 bg-[#0B0F19]">
        <div className="flex gap-3 h-full min-w-[1450px]">
          {COLUNAS_KANBAN.map((coluna) => {
            const cards = porColuna[coluna.id];
            const alvo = colunaAlvo === coluna.id;

            return (
              <div
                key={coluna.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (colunaAlvo !== coluna.id) setColunaAlvo(coluna.id);
                }}
                onDragLeave={() => setColunaAlvo((c) => (c === coluna.id ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain') || arrastandoId;
                  const card = atendimentos.find((a) => a.id === id);
                  setColunaAlvo(null);
                  setArrastandoId(null);
                  if (card) handleMover(card, coluna.id);
                }}
                className={`flex-1 min-w-[235px] max-w-[280px] h-full flex flex-col rounded-xl bg-[#111827]/75 border border-white/[0.04] transition-all ${
                  alvo ? 'ring-2 ring-emerald-400/50 bg-[#162032]' : ''
                }`}
              >
                {/* Cabeçalho refinado da coluna */}
                <div className="px-3 py-2.5 shrink-0 border-b border-white/[0.04]">
                  <div className="flex items-center justify-between gap-1.5 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${coluna.pontoCor}`} />
                      <h2 className="text-xs font-semibold text-slate-200 truncate tracking-tight">
                        {coluna.titulo}
                      </h2>
                    </div>
                    <span className="w-5 h-5 rounded-full bg-[#1F2937] text-[11px] font-semibold text-slate-300 flex items-center justify-center shrink-0">
                      {cards.length}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate leading-snug">
                    {coluna.subtitulo}
                  </p>
                </div>

                {/* Lista de cards com scrollbar customizada e sutil */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700/50 scrollbar-track-transparent">
                  {cards.length === 0 ? (
                    <div className="h-28 rounded-lg border border-dashed border-white/[0.04] flex flex-col items-center justify-center text-slate-600 text-[11px]">
                      <span>Nenhuma conversa</span>
                    </div>
                  ) : (
                    cards.map(renderCard)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ==================================================================== */}
      {/* MODAL CENTRALIZADO DE CONVERSA (LIGHTBOX IMERSIVO COM BACKDROP BLUR) */}
      {/* ==================================================================== */}
      <ConversationModal
        isOpen={Boolean(ativoId && atendimentoAtivo)}
        onClose={() => setAtivoId(null)}
        atendimento={atendimentoAtivo}
        colunas={COLUNAS_KANBAN}
        usuarioNome={usuarioNome}
        onMoverEtapa={handleMover}
        onEnviarMensagem={handleEnviarMensagem}
        onSimularMensagem={async (msg) => {
          if (!atendimentoAtivo) return;
          const antes = atendimentoAtivo.etapa_kanban;
          const atualizado = await registrarMensagemRecebida(atendimentoAtivo.id, msg);
          if (atualizado) {
            substituir(atualizado);
            exibirToast(
              antes !== atualizado.etapa_kanban
                ? `IA reclassificou: ${rotuloEtapa(atualizado.etapa_kanban)}`
                : 'Nova mensagem recebida registrada.'
            );
          }
        }}
      />

      {/* ==================================================================== */}
      {/* MODAL NOVA CONVERSA                                                  */}
      {/* ==================================================================== */}
      {modalNovoAberto && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#111827] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 bg-[#0D1117] border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-sm font-semibold text-white">Nova Conversa / Triagem</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalNovoAberto(false)}
                className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCriar} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormTipo('particular')}
                  className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    formTipo === 'particular'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-[#1F2937] text-slate-400 border border-white/[0.06]'
                  }`}
                >
                  <User className="w-3.5 h-3.5" /> Particular
                </button>
                <button
                  type="button"
                  onClick={() => setFormTipo('despachante')}
                  className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    formTipo === 'despachante'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-[#1F2937] text-slate-400 border border-white/[0.06]'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" /> Despachante
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <input
                  required
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Nome do contato *"
                  className="px-3 py-2 rounded-lg bg-[#1F2937] border border-white/10 text-xs text-white focus:outline-none"
                />
                <input
                  required
                  value={formTelefone}
                  onChange={(e) => setFormTelefone(e.target.value)}
                  placeholder="WhatsApp com DDD *"
                  className="px-3 py-2 rounded-lg bg-[#1F2937] border border-white/10 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <input
                  value={formPlaca}
                  onChange={(e) => setFormPlaca(e.target.value.toUpperCase())}
                  placeholder="Placa"
                  maxLength={8}
                  className="px-3 py-2 rounded-lg bg-[#1F2937] border border-white/10 text-xs text-white font-mono uppercase focus:outline-none"
                />
                <input
                  value={formModelo}
                  onChange={(e) => setFormModelo(e.target.value)}
                  placeholder="Modelo"
                  className="px-3 py-2 rounded-lg bg-[#1F2937] border border-white/10 text-xs text-white focus:outline-none"
                />
                <input
                  value={formRenavam}
                  onChange={(e) => setFormRenavam(e.target.value)}
                  placeholder="RENAVAM"
                  className="px-3 py-2 rounded-lg bg-[#1F2937] border border-white/10 text-xs text-white font-mono focus:outline-none"
                />
              </div>

              <textarea
                rows={3}
                required
                value={formMensagem}
                onChange={(e) => setFormMensagem(e.target.value)}
                placeholder="Mensagem recebida no WhatsApp * (A IA identifica CRDD, GRT, urgência jurídica e assunto)"
                className="w-full p-3 rounded-lg bg-[#1F2937] border border-white/10 text-xs text-white resize-none focus:outline-none"
              />

              {previewTriagem && (
                <div className="p-2.5 rounded-lg bg-[#1F2937] border border-white/10 text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-emerald-400">
                      Destino: {rotuloEtapa(previewTriagem.etapa_destino)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {METADADOS_ASSUNTO[previewTriagem.assunto].tag}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{previewTriagem.regra_aplicada}</p>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formDispararWhats}
                  onChange={(e) => setFormDispararWhats(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900"
                />
                <span>Enviar resposta automática da IA via WhatsApp</span>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalNovoAberto(false)}
                  className="px-3.5 py-2 rounded-lg text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoNovo}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {salvandoNovo ? 'Processando...' : 'Iniciar Conversa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Centralizado de Configuração do Motor de IA */}
      {modalAiAberto && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setModalAiAberto(false)}
        >
          <div
            className="relative w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <AiSettingsPanel
              onSalvo={(nova) => {
                setAiConfig(nova);
                exibirToast(`Motor de IA configurado: ${nova.activeProvider === 'gemini' ? 'Google Gemini (Flash)' : 'Groq Cloud (Llama 3.3)'}`);
              }}
              onFechar={() => setModalAiAberto(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
