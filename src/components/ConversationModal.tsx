import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  Phone,
  ShieldCheck,
  Send,
  Sparkles,
  Zap,
  Car,
  Receipt,
  CheckCircle2,
  UserCheck,
  Building2,
  User,
} from 'lucide-react';
import {
  METADADOS_ASSUNTO,
  validarMovimento,
  type AtendimentoCrm,
  type EtapaKanbanCrm,
  type StatusEmissaoCrlve,
} from '../services/crmService';

interface ColunaOption {
  id: EtapaKanbanCrm;
  titulo: string;
}

interface ConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  atendimento: AtendimentoCrm | null;
  colunas: ColunaOption[];
  usuarioNome: string;
  onMoverEtapa: (card: AtendimentoCrm, destino: EtapaKanbanCrm) => Promise<void>;
  onEnviarMensagem: (textoCustom?: string, novoStatus?: StatusEmissaoCrlve) => Promise<void>;
  onSimularMensagem: (texto: string) => Promise<void>;
}

export default function ConversationModal({
  isOpen,
  onClose,
  atendimento,
  colunas,
  usuarioNome,
  onMoverEtapa,
  onEnviarMensagem,
  onSimularMensagem,
}: ConversationModalProps) {
  const [textoMensagem, setTextoMensagem] = useState('');
  const [textoSimulado, setTextoSimulado] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [valorDebitos, setValorDebitos] = useState('');
  const [statusCrlve, setStatusCrlve] = useState<StatusEmissaoCrlve>('pendente');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Sincroniza dados auxiliares quando o atendimento muda
  useEffect(() => {
    if (atendimento) {
      setValorDebitos(atendimento.valor_debitos ? String(atendimento.valor_debitos) : '');
      setStatusCrlve(atendimento.status_emissao_crlve || 'pendente');
    }
  }, [atendimento]);

  // Rola suavemente até o final das mensagens
  useEffect(() => {
    if (isOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, atendimento?.historico_mensagens]);

  // Atalho do teclado: ESC fecha o modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !atendimento) return null;

  const ehDespachante = atendimento.tipo_cliente === 'despachante';
  const metaAssunto = METADADOS_ASSUNTO[atendimento.assunto];
  const mostrarPainelCrlve =
    atendimento.assunto === 'crlve_atpve' || atendimento.assunto === 'bloqueio_debitos';

  const handleSubmitMensagem = async () => {
    const msg = textoMensagem.trim();
    if (!msg || enviando) return;
    setEnviando(true);
    try {
      await onEnviarMensagem(msg);
      setTextoMensagem('');
    } finally {
      setEnviando(false);
    }
  };

  const handleSimular = async () => {
    const msg = textoSimulado.trim();
    if (!msg) return;
    await onSimularMensagem(msg);
    setTextoSimulado('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-conversa-titulo"
    >
      {/* Container Centralizado com transição suave de entrada */}
      <div
        className="max-w-4xl w-full h-[85vh] max-h-[800px] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-200 scale-100 opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================== */}
        {/* CABEÇALHO DO MODAL                                                 */}
        {/* ================================================================== */}
        <header className="px-6 py-4 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                {atendimento.protocolo}
              </span>

              {/* Badge de Perfil */}
              {ehDespachante ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  Despachante Credenciado{atendimento.registro_crdd ? ` • ${atendimento.registro_crdd}` : ''}
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  Particular
                </span>
              )}

              {/* Tag de Assunto */}
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60">
                {metaAssunto?.tag || '#Atendimento'}
              </span>

              {/* Tag LGPD Ativa */}
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> LGPD Ativa
              </span>

              {atendimento.urgente && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  Urgente: {atendimento.motivo_urgencia || 'Requer atenção'}
                </span>
              )}
            </div>

            <h2 id="modal-conversa-titulo" className="text-lg font-semibold text-slate-100 truncate tracking-tight">
              {atendimento.cliente_nome}
            </h2>

            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span className="flex items-center gap-1 text-slate-300">
                <Phone className="w-3 h-3 text-emerald-400" />
                {atendimento.cliente_telefone}
              </span>
              {atendimento.grt_numero && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-amber-400 font-mono text-[11px]">GRT: {atendimento.grt_numero}</span>
                </>
              )}
            </div>
          </div>

          {/* Botão de Fechar */}
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white rounded-lg p-2 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Fechar conversa (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* ================================================================== */}
        {/* FAIXA DE DADOS RÁPIDOS DO VEÍCULO (BARRA FIXA)                     */}
        {/* ================================================================== */}
        <section className="px-6 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Dados do Veículo */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60">
              <Car className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-slate-400 text-[11px]">Placa:</span>
              <span className="font-mono font-bold text-sky-300">
                {atendimento.veiculo_placa || 'NÃO INFORMADA'}
              </span>
            </div>

            {atendimento.veiculo_renavam && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <span className="text-slate-400 text-[11px]">RENAVAM:</span>
                <span className="font-mono text-slate-200 font-medium">{atendimento.veiculo_renavam}</span>
              </div>
            )}

            {atendimento.veiculo_modelo && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <span className="text-slate-400 text-[11px]">Modelo:</span>
                <span className="text-slate-200 font-medium truncate max-w-[180px]">
                  {atendimento.veiculo_modelo}
                </span>
              </div>
            )}
          </div>

          {/* Alteração rápida de etapa / coluna */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">Etapa:</span>
            <select
              value={atendimento.etapa_kanban}
              onChange={(e) => onMoverEtapa(atendimento, e.target.value as EtapaKanbanCrm)}
              className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {colunas
                .filter((c) => c.id === atendimento.etapa_kanban || !validarMovimento(atendimento, c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titulo}
                  </option>
                ))}
            </select>
          </div>
        </section>

        {/* ================================================================== */}
        {/* ÁREA CENTRAL: HISTÓRICO DO CHAT & DIAGNÓSTICO IA                   */}
        {/* ================================================================== */}
        <main className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-thin scrollbar-thumb-slate-700 bg-slate-950/40">
          {/* Card compacto com diagnóstico da IA */}
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sky-400 flex items-center gap-1.5 text-[11px]">
                <Sparkles className="w-3.5 h-3.5" /> Triagem IA: {atendimento.confianca_ia.toFixed(0)}% Confiança
                • {metaAssunto?.rotulo || 'Geral'}
              </span>
              <span className="text-[10px] text-slate-400">
                {atendimento.responsavel_tipo === 'ia' ? 'Responsável: Agente IA' : `Atendente: ${atendimento.atendente_nome || usuarioNome}`}
              </span>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">{atendimento.resumo_ia}</p>
          </div>

          {/* Painel opcional de Débitos / CRLV-e */}
          {mostrarPainelCrlve && (
            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 space-y-2 text-xs">
              <div className="flex items-center justify-between text-purple-300 font-semibold text-xs">
                <span className="flex items-center gap-1.5">
                  <Receipt className="w-4 h-4" /> Emissão de CRLV-e & Consulta de Débitos
                </span>
                <span className="text-[11px] font-mono text-purple-200">
                  Status: {statusCrlve}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={valorDebitos}
                  onChange={(e) => setValorDebitos(e.target.value)}
                  placeholder="Total de débitos (ex: 142.85)"
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-purple-500/40 text-xs text-white font-mono focus:outline-none"
                />
                <select
                  value={statusCrlve}
                  onChange={(e) => setStatusCrlve(e.target.value as StatusEmissaoCrlve)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-purple-500/40 text-xs text-white focus:outline-none"
                >
                  <option value="pendente">Pendente de consulta</option>
                  <option value="consultando_detran">Consultando Detran</option>
                  <option value="guia_enviada">Guia enviada ao cliente</option>
                  <option value="pago_aguardando_emissao">Pago — emitindo CRLV-e</option>
                  <option value="crlve_enviado">CRLV-e emitido e enviado</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onEnviarMensagem(
                      `Olá, ${atendimento.cliente_nome}! Débitos/taxas apurados para o veículo ${
                        atendimento.veiculo_placa ? `placa *${atendimento.veiculo_placa}*` : ''
                      }: R$ ${valorDebitos || '0,00'}. Após a confirmação, prosseguiremos com a emissão do documento.`,
                      'guia_enviada'
                    )
                  }
                  className="px-2.5 py-1 rounded-md bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 text-[11px] font-medium cursor-pointer"
                >
                  Enviar resumo de débitos
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onEnviarMensagem(
                      `Parabéns, ${atendimento.cliente_nome}! ✅ O CRLV-e do veículo ${
                        atendimento.veiculo_placa ? `placa *${atendimento.veiculo_placa}*` : ''
                      } foi emitido com sucesso e já está disponível.`,
                      'crlve_enviado'
                    );
                    await onMoverEtapa(atendimento, 'concluido');
                  }}
                  className="px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-medium cursor-pointer"
                >
                  Emitir e Concluir
                </button>
              </div>
            </div>
          )}

          {/* Lista de Mensagens */}
          <div className="space-y-3 pt-2">
            {atendimento.historico_mensagens.map((msg) => {
              const ehCliente = msg.remetente === 'cliente';
              const ehIA = msg.remetente === 'ia';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${ehCliente ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`p-3 max-w-[75%] leading-relaxed text-xs shadow-sm ${
                      ehCliente
                        ? 'bg-slate-800 text-slate-200 rounded-2xl rounded-tl-sm border border-slate-700/50'
                        : 'bg-emerald-950/60 border border-emerald-800/50 text-emerald-100 rounded-2xl rounded-tr-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1 text-[10px] opacity-75 font-medium">
                      <span>
                        {ehCliente ? msg.autor_nome : ehIA ? '🤖 Agente IA' : `👨‍💼 ${msg.autor_nome}`}
                      </span>
                      <span>{msg.horario}</span>
                    </div>
                    <p className="whitespace-pre-line text-xs font-normal">{msg.texto}</p>
                  </div>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>
        </main>

        {/* ================================================================== */}
        {/* RODAPÉ DO MODAL (INPUT DE RESPOSTA & AÇÕES RÁPIDAS)                 */}
        {/* ================================================================== */}
        <footer className="p-4 bg-slate-950 border-t border-slate-800 space-y-2.5 shrink-0">
          {/* Barra de Ações Rápidas */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              {atendimento.etapa_kanban !== 'fila_humana_particular' &&
                atendimento.etapa_kanban !== 'fila_humana_despachante' && (
                  <button
                    type="button"
                    onClick={() =>
                      onMoverEtapa(
                        atendimento,
                        ehDespachante ? 'fila_humana_despachante' : 'fila_humana_particular'
                      )
                    }
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700/60 transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                    <span>Transferir para Fila Humana</span>
                  </button>
                )}

              {atendimento.etapa_kanban !== 'concluido' && (
                <button
                  type="button"
                  onClick={() => onMoverEtapa(atendimento, 'concluido')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[11px] font-medium border border-slate-700/60 transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Finalizar e Arquivar</span>
                </button>
              )}
            </div>

            {/* Simulador rápido de resposta do cliente */}
            <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
              <Zap className="w-3 h-3 text-amber-400 shrink-0" />
              <input
                type="text"
                value={textoSimulado}
                onChange={(e) => setTextoSimulado(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSimular()}
                placeholder="Simular resposta do cliente..."
                className="bg-transparent text-[11px] text-slate-300 placeholder-slate-500 focus:outline-none w-48"
              />
              <button
                type="button"
                onClick={handleSimular}
                className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer"
              >
                Simular
              </button>
            </div>
          </div>

          {/* Campo de Envio de Mensagem */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={textoMensagem}
              onChange={(e) => setTextoMensagem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitMensagem();
                }
              }}
              placeholder="Digite a resposta para o WhatsApp do cliente..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
            />
            <button
              type="button"
              disabled={enviando || !textoMensagem.trim()}
              onClick={handleSubmitMensagem}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{enviando ? 'Enviando...' : 'Enviar'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
