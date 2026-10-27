import React, { useEffect, useState, useCallback, useRef } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Vault, 
  FileText, 
  MonitorCheck, 
  AlertOctagon, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Users, 
  ShieldAlert, 
  Building2, 
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  BarChart3,
  ScrollText,
  LineChart
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  Legend 
} from 'recharts';
import { supabase } from '../lib/supabase';
import { formatarBRL } from '../lib/pdvCaixa';
import { 
  carregarDadosDashboard, 
  type ResumoDashboard, 
  type MeioPagamentoResumo, 
  type DespachanteRanking, 
  type CaixaAuditoria 
} from '../lib/dashboardPdvService';
import RelatoriosPDV from '../components/pdv/RelatoriosPDV';

type AbaDashboard = 'dashboard' | 'atas' | 'vendas';

const ABAS: { id: AbaDashboard; rotulo: string; icone: React.ReactNode }[] = [
  { id: 'dashboard', rotulo: 'Dashboard Realtime', icone: <BarChart3 size={15} /> },
  { id: 'atas', rotulo: 'Atas de Encerramento', icone: <ScrollText size={15} /> },
  { id: 'vendas', rotulo: 'Relatório de Vendas & Faturamento', icone: <LineChart size={15} /> }
];

interface DashboardPDVProps {
  usuario: any;
  onVoltar: () => void;
}

export default function DashboardPDV({ usuario, onVoltar }: DashboardPDVProps) {
  const [aba, setAba] = useState<AbaDashboard>('dashboard');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [conectadoRealtime, setConectadoRealtime] = useState(false);
  const [animandoAtualizacao, setAnimandoAtualizacao] = useState(false);

  // Estados dos Indicadores e Listas
  const [resumo, setResumo] = useState<ResumoDashboard>({
    faturamentoBrutoDia: 0,
    entradasFisicasGaveta: 0,
    totalFaturadoB2B: 0,
    terminaisAbertos: 0,
    operadoresAtivos: [],
    totalTerminaisHoje: 0
  });

  const [formasGrafico, setFormasGrafico] = useState<MeioPagamentoResumo[]>([]);
  const [rankingDespachantes, setRankingDespachantes] = useState<DespachanteRanking[]>([]);
  const [caixasFechados, setCaixasFechados] = useState<CaixaAuditoria[]>([]);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date>(new Date());
  const [alertaQuebraRecente, setAlertaQuebraRecente] = useState<{
    operador: string;
    diferenca: number;
    horario: string;
  } | null>(null);

  const debounceTimerRef = useRef<any>(null);

  // Função para carregar e recalcular dados
  const atualizarDashboard = useCallback(async (isRealtimeTrigger = false) => {
    try {
      if (isRealtimeTrigger) {
        setAnimandoAtualizacao(true);
      }
      const dados = await carregarDadosDashboard();
      setResumo(dados.resumo);
      setFormasGrafico(dados.formasGrafico);
      setRankingDespachantes(dados.rankingDespachantes);
      setCaixasFechados(dados.caixasFechados);
      setUltimaAtualizacao(dados.ultimaAtualizacao);
      setErro(null);

      // Checa se o fechamento mais recente é uma quebra de caixa
      if (dados.caixasFechados.length > 0) {
        const maisRecente = dados.caixasFechados[0];
        if (maisRecente.status_conferencia === 'quebra_caixa' && maisRecente.diferenca) {
          setAlertaQuebraRecente({
            operador: maisRecente.operador_nome || 'Operador',
            diferenca: Math.abs(maisRecente.diferenca),
            horario: maisRecente.data_fechamento ? new Date(maisRecente.data_fechamento).toLocaleTimeString('pt-BR') : ''
          });
        }
      }
    } catch (err: any) {
      console.error('Erro ao atualizar Dashboard PDV:', err);
      setErro(err.message || 'Falha ao sincronizar dados do painel.');
    } finally {
      setCarregando(false);
      if (isRealtimeTrigger) {
        setTimeout(() => setAnimandoAtualizacao(false), 800);
      }
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    atualizarDashboard(false);
  }, [atualizarDashboard]);

  // CONFIGURAÇÃO DO SUPABASE REALTIME (RF005)
  useEffect(() => {
    const triggerDebounced = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        atualizarDashboard(true);
      }, 300); // 300ms de debouncing para resposta ultra rápida (< 1s)
    };

    const channel = supabase
      .channel('realtime_dashboard_pdv')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'caixas_diarios' },
        (payload) => {
          console.log('[Realtime] Mudança em caixas_diarios:', payload.eventType);
          triggerDebounced();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'movimentacoes_caixa' },
        (payload) => {
          console.log('[Realtime] Nova movimentação:', payload.eventType);
          triggerDebounced();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'despachantes' },
        (payload) => {
          console.log('[Realtime] Atualização em despachantes:', payload.eventType);
          triggerDebounced();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConectadoRealtime(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConectadoRealtime(false);
        }
      });

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [atualizarDashboard]);

  const temVendasHoje = formasGrafico.some(f => f.valor > 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 sm:p-6 lg:p-8">
      {/* HEADER / TOPO */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <button
              onClick={onVoltar}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-colors cursor-pointer flex items-center gap-2 text-xs font-bold"
              title="Voltar ao Terminal de Operação"
            >
              <ArrowLeft size={16} />
              <span>Voltar ao PDV</span>
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Dashboard Financeiro & Auditoria
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  Master & Governança
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Monitoramento consolidado dos terminais, conciliação e faturamento em tempo real.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {/* Indicador Realtime */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${
              conectadoRealtime 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {conectadoRealtime ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <Wifi size={14} />
                  <span>Realtime Ativo</span>
                </>
              ) : (
                <>
                  <WifiOff size={14} />
                  <span>Reconectando...</span>
                </>
              )}
            </div>

            {/* Botão de Refresh manual */}
            <button
              onClick={() => atualizarDashboard(true)}
              className={`p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-all cursor-pointer ${
                animandoAtualizacao ? 'rotate-180 text-emerald-400' : ''
              }`}
              title="Atualizar dados agora"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* ALERTA IMEDIATO DE QUEBRA DE CAIXA SE IDENTIFICADO */}
        {alertaQuebraRecente && (
          <div className="mt-4 p-4 bg-red-950/60 border border-red-500/40 text-red-200 rounded-2xl flex items-center justify-between animate-bounce">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600/30 border border-red-500 flex items-center justify-center shrink-0 text-red-400">
                <ShieldAlert size={22} />
              </div>
              <div>
                <strong className="block text-sm font-bold text-red-100">
                  ALERTA DE AUDITORIA: Quebra de Caixa Registrada!
                </strong>
                <p className="text-xs text-red-300">
                  O operador <strong>{alertaQuebraRecente.operador}</strong> encerrou o turno às {alertaQuebraRecente.horario} com divergência faltante de{' '}
                  <span className="font-black text-red-200 underline">{formatarBRL(alertaQuebraRecente.diferenca)}</span>.
                </p>
              </div>
            </div>
            <button
              onClick={() => setAlertaQuebraRecente(null)}
              className="text-xs font-bold text-red-400 hover:text-red-200 underline cursor-pointer bg-transparent border-0"
            >
              Dispensar
            </button>
          </div>
        )}

        {/* NAVEGAÇÃO POR ABAS */}
        <div className="mt-6 flex flex-wrap gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl w-fit" role="tablist">
          {ABAS.map((a) => (
            <button
              key={a.id}
              id={`aba-${a.id}`}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border cursor-pointer transition-all ${
                aba === a.id
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/50'
                  : 'bg-transparent text-slate-400 border-transparent hover:text-white hover:bg-slate-800'
              }`}
            >
              {a.icone}
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>

      {aba !== 'dashboard' && (
        <div className="max-w-7xl mx-auto">
          <RelatoriosPDV aba={aba} />
        </div>
      )}

      <div className={`max-w-7xl mx-auto space-y-8 ${aba === 'dashboard' ? '' : 'hidden'}`}>
        {/* CARDS DE INDICADORES (KPIs) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Faturamento Bruto do Dia */}
          <div className={`p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg relative overflow-hidden transition-all duration-500 ${
            animandoAtualizacao ? 'ring-2 ring-emerald-500/50 scale-[1.02]' : ''
          }`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Faturamento Bruto (Hoje)
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <TrendingUp size={18} />
              </div>
            </div>
            <div className="text-3xl font-black text-white tracking-tight">
              {formatarBRL(resumo.faturamentoBrutoDia)}
            </div>
            <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1 font-medium">
              <Clock size={12} /> Atualizado às {ultimaAtualizacao.toLocaleTimeString('pt-BR')}
            </p>
          </div>

          {/* Card 2: Entradas Físicas em Gaveta */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Dinheiro Físico (Gaveta)
              </span>
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center">
                <Vault size={18} />
              </div>
            </div>
            <div className="text-3xl font-black text-emerald-400 tracking-tight">
              {formatarBRL(resumo.entradasFisicasGaveta)}
            </div>
            <p className="text-[11px] text-slate-500 mt-2 font-medium">
              Abertura + Entradas em espécie - Sangrias
            </p>
          </div>

          {/* Card 3: Total Faturado B2B */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Faturado B2B (A Prazo)
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                <FileText size={18} />
              </div>
            </div>
            <div className="text-3xl font-black text-amber-400 tracking-tight">
              {formatarBRL(resumo.totalFaturadoB2B)}
            </div>
            <p className="text-[11px] text-slate-500 mt-2 font-medium">
              A receber de despachantes parceiros
            </p>
          </div>

          {/* Card 4: Status dos Terminais */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Terminais Operando
              </span>
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
                <MonitorCheck size={18} />
              </div>
            </div>
            <div className="text-3xl font-black text-white tracking-tight flex items-baseline gap-2">
              <span>{resumo.terminaisAbertos}</span>
              <span className="text-xs text-slate-400 font-semibold">
                de {resumo.totalTerminaisHoje || 1} hoje
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-2 truncate font-medium">
              {resumo.operadoresAtivos.length > 0 
                ? `Operadores: ${resumo.operadoresAtivos.join(', ')}` 
                : 'Nenhum caixa aberto neste momento'}
            </div>
          </div>
        </div>

        {/* SEÇÃO 2: GRÁFICO DONUT & TOP 10 DESPACHANTES */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* GRÁFICO DONUT: MEIOS DE PAGAMENTO */}
          <div className="lg:col-span-5 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <DollarSign size={18} className="text-emerald-400" />
                Meios de Pagamento (Hoje)
              </h3>
              <span className="text-xs text-slate-500 font-medium">Mix de Liquidação</span>
            </div>

            {temVendasHoje ? (
              <div className="flex-1 flex flex-col justify-center items-center">
                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={formasGrafico.filter(f => f.valor > 0)}
                        dataKey="valor"
                        nameKey="rotulo"
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {formasGrafico.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.cor} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          color: '#fff',
                          fontSize: '12px'
                        }}
                        formatter={(value: any) => [formatarBRL(Number(value)), 'Total']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legenda Customizada com Percentuais */}
                <div className="w-full grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-800/80">
                  {formasGrafico.map((item) => (
                    <div key={item.forma} className="flex items-center gap-2 text-xs">
                      <span 
                        className="w-3 h-3 rounded-full shrink-0" 
                        style={{ backgroundColor: item.cor }} 
                      />
                      <span className="text-slate-400 truncate flex-1">{item.rotulo}:</span>
                      <span className="font-bold text-white">{item.percentual}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 text-xs">
                <p>Nenhuma venda registrada no dia corrente.</p>
                <p className="text-[11px] mt-1 text-slate-600">O gráfico atualizará automaticamente via Supabase Realtime.</p>
              </div>
            )}
          </div>

          {/* TOP 10 DESPACHANTES NO MÊS */}
          <div className="lg:col-span-7 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Building2 size={18} className="text-amber-400" />
                Top 10 Despachantes (Consumo do Mês)
              </h3>
              <span className="text-xs text-slate-500 font-medium">B2B & Convênios</span>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400 font-bold border-b border-slate-800">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Despachante / Razão Social</th>
                    <th className="py-2.5 px-3">Documento</th>
                    <th className="py-2.5 px-3 text-right">Consumo Mês</th>
                    <th className="py-2.5 px-3 text-right">Saldo Devedor Atual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {rankingDespachantes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        Nenhum despachante cadastrado ou com movimentação.
                      </td>
                    </tr>
                  ) : (
                    rankingDespachantes.map((d, idx) => (
                      <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-500">
                          {idx + 1}º
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-200">
                          {d.nome_razao}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                          {d.documento || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-400">
                          {formatarBRL(d.total_consumido_mes)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-black ${
                          d.saldo_devedor_atual > 0 ? 'text-amber-400' : 'text-slate-400'
                        }`}>
                          {formatarBRL(d.saldo_devedor_atual)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* SEÇÃO 3: PAINEL DE AUDITORIA DE FECHAMENTOS (CONFÊRENCIA CEGA) */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <ShieldAlert size={18} className="text-purple-400" />
                Painel de Auditoria de Fechamentos Recentes
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Validação de integridade entre valores apurados na gaveta e saldos algorítmicos.
              </p>
            </div>
            <span className="text-xs text-slate-500 font-medium">Últimos 15 turnos fechados</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-slate-400 font-bold border-b border-slate-800">
                  <th className="py-3 px-3">Caixa / ID</th>
                  <th className="py-3 px-3">Operador</th>
                  <th className="py-3 px-3">Abertura</th>
                  <th className="py-3 px-3">Fechamento</th>
                  <th className="py-3 px-3 text-right">Fundo Abertura</th>
                  <th className="py-3 px-3 text-right">Saldo Esperado</th>
                  <th className="py-3 px-3 text-right">Valor Informado</th>
                  <th className="py-3 px-3 text-right">Divergência</th>
                  <th className="py-3 px-3 text-center">Status Auditoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {caixasFechados.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Nenhum fechamento de turno registrado até o momento.
                    </td>
                  </tr>
                ) : (
                  caixasFechados.map((c) => {
                    const dif = Number(c.diferenca) || 0;
                    const status = c.status_conferencia || (dif === 0 ? 'exato' : dif < 0 ? 'quebra_caixa' : 'sobra_caixa');

                    return (
                      <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-slate-400">
                          #{c.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-slate-200 block">{c.operador_nome}</span>
                          <span className="text-[10px] text-slate-500">{c.operador_email}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                          {new Date(c.data_abertura).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                          {c.data_fechamento ? new Date(c.data_fechamento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300 font-semibold">
                          {formatarBRL(Number(c.valor_abertura))}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300 font-semibold">
                          {c.valor_fechamento_esperado !== null ? formatarBRL(Number(c.valor_fechamento_esperado)) : '-'}
                        </td>
                        <td className="py-3 px-3 text-right text-white font-bold">
                          {c.valor_fechamento_informado !== null ? formatarBRL(Number(c.valor_fechamento_informado)) : '-'}
                        </td>
                        <td className={`py-3 px-3 text-right font-black ${
                          status === 'quebra_caixa' 
                            ? 'text-red-400' 
                            : status === 'sobra_caixa' 
                              ? 'text-amber-400' 
                              : 'text-emerald-400'
                        }`}>
                          {dif > 0 ? `+${formatarBRL(dif)}` : formatarBRL(dif)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {status === 'exato' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 size={12} /> Exato
                            </span>
                          )}
                          {status === 'quebra_caixa' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/40">
                              <AlertOctagon size={12} /> Quebra de Caixa
                            </span>
                          )}
                          {status === 'sobra_caixa' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/40">
                              <AlertTriangle size={12} /> Sobra de Caixa
                            </span>
                          )}
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
    </div>
  );
}
