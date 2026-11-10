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
  Car,
  Trash2,
  X,
  Zap,
  Bot,
  Receipt,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Filter,
  History,
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

interface CrmIntegraProps {
  onVoltar?: () => void;
  usuarioNome?: string;
}

// ============================================================================
// COLUNAS DO KANBAN (6 STATUS OPERACIONAIS)
// ============================================================================
const COLUNAS_KANBAN: {
  id: EtapaKanbanCrm;
  titulo: string;
  subtitulo: string;
  borda: string;
  header: string;
  badge: string;
}[] = [
  {
    id: 'triagem_ia',
    titulo: '🤖 Triagem / IA Ativa',
    subtitulo: 'Mensagens novas: a IA interage e identifica a demanda',
    borda: 'border-sky-500/30',
    header: 'bg-sky-950/30 border-sky-500/30',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  },
  {
    id: 'aguardando_documentacao',
    titulo: '📎 Aguardando Documentação / Cidadão',
    subtitulo: 'Pendente de comprovantes, certidões ou fotos',
    borda: 'border-purple-500/30',
    header: 'bg-purple-950/30 border-purple-500/30',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  {
    id: 'fila_humana_particular',
    titulo: '👤 Fila Humana — Particular',
    subtitulo: 'Transferidos pela IA para conferência do atendente/IVD',
    borda: 'border-blue-500/40',
    header: 'bg-blue-950/40 border-blue-500/40',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  },
  {
    id: 'fila_humana_despachante',
    titulo: '🏢 Fila Humana — Despachante',
    subtitulo: 'Atendimento prioritário/técnico com controle de GRT',
    borda: 'border-orange-500/40',
    header: 'bg-orange-950/40 border-orange-500/40',
    badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  },
  {
    id: 'analise_vistoria',
    titulo: '🔍 Em Análise / Pista de Vistoria',
    subtitulo: 'Andamento físico ou pendência de regularização',
    borda: 'border-emerald-500/30',
    header: 'bg-emerald-950/30 border-emerald-500/30',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    id: 'concluido',
    titulo: '✅ Concluídos / Arquivados',
    subtitulo: 'Orientação prestada ou CRLV-e emitido',
    borda: 'border-slate-700',
    header: 'bg-slate-900 border-slate-700',
    badge: 'bg-slate-700/60 text-slate-300 border-slate-600',
  },
];

type FiltroPerfil = 'todos' | TipoClienteCrm;
type FiltroPeriodo = 'todos' | '30min' | '1h' | 'hoje' | 'ontem' | '7d';
type FiltroResponsavel = 'todos' | 'ia' | 'humano';

const ROTULO_PERIODO: Record<FiltroPeriodo, string> = {
  todos: 'Qualquer data/hora',
  '30min': 'Últimos 30 minutos',
  '1h': 'Última hora',
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
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
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

  const [toast, setToast] = useState<string | null>(null);

  const { isOnline: isWhatsAppOnline } = useEvolutionWhatsApp({
    pollIntervalMs: 25000,
    autoPolling: true,
  });

  const exibirToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
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

  // ==========================================================================
  // FILTRAGEM + ORDENAÇÃO (urgentes no topo, depois mais recente)
  // ==========================================================================
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

  // ==========================================================================
  // AÇÕES
  // ==========================================================================
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
    if (!window.confirm(`Remover o atendimento concluído ${card.protocolo} do quadro?`)) return;
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
          enviadoWhatsApp ? 'Mensagem entregue no WhatsApp do cliente.' : 'Mensagem registrada no histórico.'
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
          ? `Trigger IA: movido para ${rotuloEtapa(atualizado.etapa_kanban)}`
          : 'Mensagem do cliente registrada.'
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
      alert('Preencha Nome, Telefone WhatsApp e a Mensagem recebida.');
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
      exibirToast(`${criado.protocolo} triado: ${METADADOS_ASSUNTO[criado.assunto].tag} → ${rotuloEtapa(criado.etapa_kanban)}`);
    } finally {
      setSalvandoNovo(false);
    }
  };

  // ==========================================================================
  // CARD
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
        className={`rounded-2xl border p-3 space-y-2.5 cursor-pointer transition-all group ${
          arrastandoId === card.id ? 'opacity-40' : ''
        } ${
          card.urgente
            ? 'bg-red-950/30 border-red-500/60 hover:border-red-400 shadow-lg shadow-red-950/30'
            : 'bg-slate-950/80 border-slate-800 hover:border-slate-600'
        }`}
      >
        {card.urgente && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-extrabold uppercase tracking-wide animate-pulse">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate">Urgente • {card.motivo_urgencia}</span>
          </div>
        )}

        {/* Canal + protocolo */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              ehDesp
                ? 'bg-orange-500/15 text-orange-300 border-orange-500/50'
                : 'bg-blue-500/15 text-blue-300 border-blue-500/50'
            }`}
          >
            {ehDesp ? 'Despachante Credenciado' : 'Particular'}
          </span>
          <span className="font-mono text-[10px] text-slate-500">{card.protocolo}</span>
        </div>

        <h3 className="text-xs font-bold text-white truncate group-hover:text-sky-300 transition-colors">
          {card.cliente_nome}
        </h3>

        {/* Assunto detectado + selos */}
        <div className="flex flex-wrap items-center gap-1">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${meta.cor}`}>{meta.tag}</span>
          {card.mencionou_crdd && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-orange-500/40 text-orange-300 bg-orange-500/10">
              CRDD{card.registro_crdd ? ` ${card.registro_crdd}` : ''}
            </span>
          )}
          {card.mencionou_grt && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-orange-500/40 text-orange-300 bg-orange-500/10">
              GRT{card.grt_numero ? ` ${card.grt_numero}` : ''}
            </span>
          )}
        </div>

        {/* Veículo (único dado consultado exibido) */}
        {(card.veiculo_placa || card.veiculo_renavam) && (
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-1.5 min-w-0">
              <Car className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-[11px] text-slate-300 truncate">
                {card.veiculo_renavam ? `RENAVAM ${card.veiculo_renavam}` : card.veiculo_modelo || 'Veículo'}
              </span>
            </div>
            {card.veiculo_placa && (
              <span className="font-mono text-[11px] font-black px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 shrink-0">
                {card.veiculo_placa}
              </span>
            )}
          </div>
        )}

        {/* Snippet LGPD */}
        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-900/60 p-2 rounded-xl border border-slate-800/70">
          “{card.snippet_lgpd}”
        </p>

        {/* Rodapé: responsável + data/hora */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {ehIA ? (
              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/30">
                <Bot className="w-3 h-3" /> Agente IA
              </span>
            ) : (
              <>
                <span className="w-5 h-5 rounded-full bg-slate-700 text-[9px] font-bold text-white flex items-center justify-center shrink-0">
                  {iniciais(card.atendente_nome || '')}
                </span>
                <span className="text-[10px] text-slate-300 truncate">{card.atendente_nome}</span>
              </>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-slate-300 font-medium">{dataHoraCurta(card.ultima_interacao_em)}</div>
            <div className="text-[9px] text-slate-500">{tempoRelativo(card.ultima_interacao_em)}</div>
          </div>
        </div>

        {card.etapa_kanban === 'concluido' && (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => handleExcluir(card)}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg p-1.5 text-xs flex items-center gap-1 cursor-pointer"
              title="Remover atendimento concluído"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const mostrarPainelCrlve =
    atendimentoAtivo && (atendimentoAtivo.assunto === 'crlve_atpve' || atendimentoAtivo.assunto === 'bloqueio_debitos');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500/30 selection:text-white">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] max-w-sm flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900 border border-sky-500/40 text-sky-300 text-xs font-semibold shadow-2xl">
          <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-6 py-3.5">
        <div className="max-w-[1800px] mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
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
              <div className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-white">CRM-Integra</h1>
                <p className="text-xs text-slate-400">Painel operacional WhatsApp • CRVA Detran/RS</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <span className={`w-2 h-2 rounded-full ${isWhatsAppOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-slate-400">WhatsApp:</span>
              <span className={isWhatsAppOnline ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {isWhatsAppOnline ? 'CONECTADO' : 'CONTINGÊNCIA'}
              </span>
            </div>
            <button
              type="button"
              onClick={carregarDados}
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
              title="Atualizar"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin text-sky-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setModalNovoAberto(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-950/50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo / Simular WhatsApp</span>
            </button>
          </div>
        </div>
      </header>

      {/* BARRA DE FILTROS */}
      <section className="max-w-[1800px] w-full mx-auto px-6 pt-4 pb-3 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Conversas</span>
            <div className="text-xl font-black text-white">{metricas.total}</div>
          </div>
          <div className={`p-3 rounded-2xl border ${metricas.urgentes ? 'bg-red-950/30 border-red-500/40' : 'bg-slate-900/80 border-slate-800'}`}>
            <span className="text-[10px] uppercase tracking-wider text-red-300 font-bold">Urgentes</span>
            <div className="text-xl font-black text-red-300">{metricas.urgentes}</div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] uppercase tracking-wider text-sky-300 font-bold">IA ativa</span>
            <div className="text-xl font-black text-sky-300">{metricas.iaAtiva}</div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-blue-500/30">
            <span className="text-[10px] uppercase tracking-wider text-blue-300 font-bold">Particulares</span>
            <div className="text-xl font-black text-blue-300">{metricas.particulares}</div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-orange-500/30">
            <span className="text-[10px] uppercase tracking-wider text-orange-300 font-bold">Despachantes</span>
            <div className="text-xl font-black text-orange-300">{metricas.despachantes}</div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, placa, RENAVAM, GRT, protocolo ou #assunto..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-sky-500/50 focus:outline-none text-xs text-white placeholder-slate-500"
              />
            </div>

            {/* Perfil */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800">
              {([
                ['todos', 'Todos'],
                ['particular', 'Particular'],
                ['despachante', 'Despachante'],
              ] as [FiltroPerfil, string][]).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setFiltroPerfil(valor)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                    filtroPerfil === valor
                      ? valor === 'particular'
                        ? 'bg-blue-600 text-white'
                        : valor === 'despachante'
                        ? 'bg-orange-500 text-slate-950'
                        : 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            <select
              value={filtroPeriodo}
              onChange={(e) => setFiltroPeriodo(e.target.value as FiltroPeriodo)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"
              title="Filtro por data/hora da última mensagem"
            >
              {(Object.keys(ROTULO_PERIODO) as FiltroPeriodo[]).map((k) => (
                <option key={k} value={k}>
                  🕒 {ROTULO_PERIODO[k]}
                </option>
              ))}
            </select>

            <select
              value={filtroResponsavel}
              onChange={(e) => setFiltroResponsavel(e.target.value as FiltroResponsavel)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"
            >
              <option value="todos">👥 Qualquer responsável</option>
              <option value="ia">🤖 Agente IA</option>
              <option value="humano">👨‍💼 Atendente humano</option>
            </select>

            <button
              type="button"
              onClick={() => setSomenteUrgentes((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                somenteUrgentes
                  ? 'bg-red-500/20 border-red-500/60 text-red-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Somente urgentes
            </button>

            {filtrosAtivos && (
              <button
                type="button"
                onClick={limparFiltros}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Limpar
              </button>
            )}
          </div>

          {/* Chips de assunto */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-slate-500 mr-1">
              <Filter className="w-3 h-3" /> Assunto
            </span>
            {ORDEM_ASSUNTOS.map((a) => {
              const ativo = filtroAssuntos.includes(a);
              const qtd = atendimentos.filter((x) => x.assunto === a).length;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => alternarAssunto(a)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${
                    ativo ? METADADOS_ASSUNTO[a].cor + ' ring-1 ring-white/20' : 'border-slate-800 text-slate-400 hover:text-white bg-slate-950'
                  }`}
                >
                  {METADADOS_ASSUNTO[a].tag} <span className="opacity-60 font-mono">({qtd})</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* KANBAN */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-6 pb-8 overflow-x-auto">
        <div className="grid grid-cols-6 gap-3 min-w-[1500px]">
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
                className={`rounded-2xl border flex flex-col h-[calc(100vh-330px)] min-h-[480px] bg-slate-900/50 transition-all ${coluna.borda} ${
                  alvo ? 'ring-2 ring-sky-400/60 bg-slate-900' : ''
                }`}
              >
                <div className={`p-3 border-b rounded-t-2xl ${coluna.header}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-xs font-extrabold text-white leading-snug">{coluna.titulo}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${coluna.badge}`}>
                      {cards.length}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug mt-1">{coluna.subtitulo}</p>
                </div>
                <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto">
                  {cards.length === 0 ? (
                    <div className="h-32 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-600 text-center p-3">
                      <Bot className="w-5 h-5 mb-1.5 opacity-40" />
                      <span className="text-[11px]">Nenhuma conversa</span>
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

      {/* COCKPIT LATERAL */}
      {atendimentoAtivo && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAtivoId(null);
          }}
        >
          <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700">
                    {atendimentoAtivo.protocolo}
                  </span>
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                      atendimentoAtivo.tipo_cliente === 'despachante'
                        ? 'bg-orange-500/15 text-orange-300 border-orange-500/50'
                        : 'bg-blue-500/15 text-blue-300 border-blue-500/50'
                    }`}
                  >
                    {atendimentoAtivo.tipo_cliente === 'despachante' ? 'Despachante Credenciado' : 'Particular'}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${METADADOS_ASSUNTO[atendimentoAtivo.assunto].cor}`}>
                    {METADADOS_ASSUNTO[atendimentoAtivo.assunto].tag}
                  </span>
                  {atendimentoAtivo.urgente && (
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/50">
                      🚨 Urgente • {atendimentoAtivo.motivo_urgencia}
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-white truncate">{atendimentoAtivo.cliente_nome}</h2>
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  WhatsApp: {atendimentoAtivo.cliente_telefone}
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="w-3 h-3" /> CPF/CNPJ protegido (LGPD)
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAtivoId(null)}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Diagnóstico IA + movimentação */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Triagem IA ({atendimentoAtivo.confianca_ia.toFixed(0)}%)
                  </span>
                  <select
                    value={atendimentoAtivo.etapa_kanban}
                    onChange={(e) => handleMover(atendimentoAtivo, e.target.value as EtapaKanbanCrm)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-semibold max-w-[260px]"
                  >
                    {COLUNAS_KANBAN.filter(
                      (c) => c.id === atendimentoAtivo.etapa_kanban || !validarMovimento(atendimentoAtivo, c.id)
                    ).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.titulo}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-900 p-3 rounded-xl border border-slate-800">
                  {atendimentoAtivo.resumo_ia}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Placa</span>
                    <span className="font-mono text-xs font-bold text-sky-300">{atendimentoAtivo.veiculo_placa || '—'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">RENAVAM</span>
                    <span className="font-mono text-xs font-bold text-slate-200">{atendimentoAtivo.veiculo_renavam || '—'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Veículo</span>
                    <span className="text-xs font-semibold text-slate-200 truncate block">{atendimentoAtivo.veiculo_modelo || '—'}</span>
                  </div>
                </div>
                {(atendimentoAtivo.registro_crdd || atendimentoAtivo.grt_numero) && (
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {atendimentoAtivo.registro_crdd && (
                      <span className="px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-300 font-semibold">
                        CRDD {atendimentoAtivo.registro_crdd}
                      </span>
                    )}
                    {atendimentoAtivo.grt_numero && (
                      <span className="px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-300 font-semibold">
                        GRT {atendimentoAtivo.grt_numero}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Painel CRLV-e / Débitos */}
              {mostrarPainelCrlve && (
                <div className="p-4 rounded-2xl bg-violet-950/20 border border-violet-500/30 space-y-3">
                  <span className="text-xs font-extrabold text-violet-300 flex items-center gap-2">
                    <Receipt className="w-4 h-4" /> Emissão CRLV-e / Consulta de Débitos
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Total de débitos/taxas (R$)</label>
                      <input
                        type="text"
                        value={valorDebitosInput}
                        onChange={(e) => setValorDebitosInput(e.target.value)}
                        placeholder="Ex: 142.85"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Status da emissão</label>
                      <select
                        value={statusCrlveInput}
                        onChange={(e) => setStatusCrlveInput(e.target.value as StatusEmissaoCrlve)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      >
                        <option value="pendente">Pendente de consulta</option>
                        <option value="consultando_detran">Consultando débitos no Detran</option>
                        <option value="guia_enviada">Guia/PIX enviado ao cliente</option>
                        <option value="pago_aguardando_emissao">Pago — gerando CRLV-e</option>
                        <option value="crlve_enviado">CRLV-e emitido e enviado</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleEnviarMensagem(
                          `Olá, ${atendimentoAtivo.cliente_nome}! Levantamento concluído${
                            atendimentoAtivo.veiculo_placa ? ` para a placa *${atendimentoAtivo.veiculo_placa}*` : ''
                          }: total de débitos/taxas *R$ ${valorDebitosInput || '0,00'}*. Após a confirmação do pagamento emitimos e enviamos o documento por aqui.`,
                          'guia_enviada'
                        )
                      }
                      className="px-3 py-1.5 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-violet-200 text-[11px] font-bold cursor-pointer"
                    >
                      📤 Enviar resumo de débitos
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await handleEnviarMensagem(
                          `Ótima notícia, ${atendimentoAtivo.cliente_nome}! ✅ O CRLV-e do veículo${
                            atendimentoAtivo.veiculo_placa ? ` placa *${atendimentoAtivo.veiculo_placa}*` : ''
                          } foi emitido e já está disponível no aplicativo da CNH Digital.`,
                          'crlve_enviado'
                        );
                        await handleMover(atendimentoAtivo, 'concluido');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold cursor-pointer"
                    >
                      ✅ Confirmar emissão e concluir
                    </button>
                  </div>
                </div>
              )}

              {/* Conversa */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Conversa WhatsApp</h4>
                <div className="space-y-2.5 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 max-h-72 overflow-y-auto">
                  {atendimentoAtivo.historico_mensagens.map((msg) => {
                    const cliente = msg.remetente === 'cliente';
                    const ia = msg.remetente === 'ia';
                    return (
                      <div key={msg.id} className={`flex flex-col ${cliente ? 'items-start' : 'items-end'}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed border ${
                            cliente
                              ? 'bg-slate-900 border-slate-800 text-slate-200'
                              : ia
                              ? 'bg-sky-950/50 border-sky-500/30 text-sky-100'
                              : 'bg-emerald-950/50 border-emerald-500/30 text-emerald-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-1 text-[10px] font-bold opacity-75">
                            <span>{cliente ? `👤 ${msg.autor_nome}` : ia ? '🤖 Agente IA' : `👨‍💼 ${msg.autor_nome}`}</span>
                            <span>{msg.horario}</span>
                          </div>
                          <p className="whitespace-pre-line">{msg.texto}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Simulação de mensagem recebida (aciona os triggers da IA) */}
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-dashed border-slate-700">
                  <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                  <input
                    type="text"
                    value={textoSimulado}
                    onChange={(e) => setTextoSimulado(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSimularRecebida()}
                    placeholder="Simular nova mensagem do cliente (aciona a triagem/transição automática)..."
                    className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSimularRecebida}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] font-bold cursor-pointer"
                  >
                    Simular
                  </button>
                </div>
              </div>

              {/* Histórico de transições */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> Histórico de transições
                </h4>
                <ol className="space-y-1.5">
                  {[...atendimentoAtivo.transicoes].reverse().map((t, i) => (
                    <li key={i} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {t.de ? `${rotuloEtapa(t.de)} → ` : 'Entrada → '}
                          {rotuloEtapa(t.para)}
                        </span>
                        <span className="flex items-center gap-1 text-slate-500 shrink-0">
                          <Clock className="w-3 h-3" /> {dataHoraCurta(t.em)}
                        </span>
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {t.origem === 'ia' ? '🤖 IA' : t.origem === 'operador' ? '👨‍💼 Operador' : '⚙️ Sistema'} — {t.motivo}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-2.5">
              <input
                type="text"
                value={textoMensagem}
                onChange={(e) => setTextoMensagem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleEnviarMensagem();
                  }
                }}
                placeholder="Mensagem para o WhatsApp do cliente..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 focus:border-sky-500 text-xs text-white placeholder-slate-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={enviandoMsg || !textoMensagem.trim()}
                onClick={() => handleEnviarMensagem()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{enviandoMsg ? 'Enviando...' : 'Enviar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVO / SIMULAR */}
      {modalNovoAberto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] overflow-y-auto">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Registrar / simular entrada de WhatsApp</h3>
                  <p className="text-[11px] text-slate-400">A IA define perfil, assunto, urgência e coluna de destino</p>
                </div>
              </div>
              <button type="button" onClick={() => setModalNovoAberto(false)} className="p-1.5 text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCriar} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setFormTipo('particular')}
                  className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer ${
                    formTipo === 'particular' ? 'border-blue-500 bg-blue-500/15 text-blue-300' : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  <User className="w-4 h-4" /> Particular
                </button>
                <button
                  type="button"
                  onClick={() => setFormTipo('despachante')}
                  className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer ${
                    formTipo === 'despachante' ? 'border-orange-500 bg-orange-500/15 text-orange-300' : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  <Building2 className="w-4 h-4" /> Despachante
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  required
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder={formTipo === 'despachante' ? 'Razão social / nome *' : 'Nome do cliente *'}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
                <input
                  required
                  value={formTelefone}
                  onChange={(e) => setFormTelefone(e.target.value)}
                  placeholder="WhatsApp com DDD *"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  value={formPlaca}
                  onChange={(e) => setFormPlaca(e.target.value.toUpperCase())}
                  placeholder="Placa"
                  maxLength={8}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono uppercase"
                />
                <input
                  value={formModelo}
                  onChange={(e) => setFormModelo(e.target.value)}
                  placeholder="Modelo"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
                <input
                  value={formRenavam}
                  onChange={(e) => setFormRenavam(e.target.value)}
                  placeholder="RENAVAM"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                />
              </div>
              <input
                value={formDocumento}
                onChange={(e) => setFormDocumento(e.target.value)}
                placeholder="CPF/CNPJ (armazenado, nunca exibido no card)"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
              />
              <textarea
                rows={3}
                required
                value={formMensagem}
                onChange={(e) => setFormMensagem(e.target.value)}
                placeholder="Mensagem recebida no WhatsApp *  (ex.: Segue GRT 4482913, CRDD 1022 / Meu pai faleceu, carro em inventário / Quero emitir o CRLV-e da placa ABC1D23)"
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white resize-none"
              />

              {previewTriagem && (
                <div className={`p-3.5 rounded-2xl border space-y-1.5 ${previewTriagem.urgente ? 'bg-red-950/30 border-red-500/50' : 'bg-slate-950 border-sky-500/30'}`}>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`font-bold px-2 py-0.5 rounded-md border ${METADADOS_ASSUNTO[previewTriagem.assunto].cor}`}>
                      {METADADOS_ASSUNTO[previewTriagem.assunto].tag}
                    </span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded-full border ${
                        previewTriagem.tipo_cliente === 'despachante'
                          ? 'bg-orange-500/15 text-orange-300 border-orange-500/50'
                          : 'bg-blue-500/15 text-blue-300 border-blue-500/50'
                      }`}
                    >
                      {previewTriagem.tipo_cliente === 'despachante' ? 'Despachante Credenciado' : 'Particular'}
                    </span>
                    {previewTriagem.urgente && (
                      <span className="font-bold text-red-300">🚨 Urgente • {previewTriagem.motivo_urgencia}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300">
                    <strong>Destino:</strong> {rotuloEtapa(previewTriagem.etapa_destino)}
                  </p>
                  <p className="text-[11px] text-slate-500">{previewTriagem.regra_aplicada}</p>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formDispararWhats}
                  onChange={(e) => setFormDispararWhats(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950"
                />
                <span>Enviar a resposta da IA para este número via Evolution API</span>
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
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {salvandoNovo ? 'Processando...' : 'Triar e inserir no Kanban'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
