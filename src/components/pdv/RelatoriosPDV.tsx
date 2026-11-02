import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Printer,
  ShieldCheck,
  X,
  Search,
  Filter,
  PieChart as PieChartIcon,
  Table as TableIcon,
  Receipt,
  User,
  Calendar,
  CreditCard,
  Building2,
  Car,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { formatarBRL } from '../../lib/pdvCaixa';
import AtaEncerramento from '../AtaEncerramento';
import ModalReimpressaoCupom from './ModalReimpressaoCupom';
import { buscarServicos, type ServicoCatalogo } from '../../lib/pdvVendas';
import {
  calcularTotaisVendas,
  carregarRelatorios,
  consolidarPorCatalogo,
  filtrosIniciais,
  gerarHashAta,
  listarSangriasSuprimentos,
  resolverPeriodo,
  type AtaFechamento,
  type DadosRelatorios,
  type FiltroMeioPagamento,
  type FiltroStatusAta,
  type FiltrosRelatorio,
  type ItemCatalogoRelatorio,
  type PeriodoRapido,
  type VendaRelatorio,
} from '../../lib/relatoriosPdvService';
import { mascararDocumento } from '../../utils/documento';
import type { FormaPagamento, MovimentacaoCaixa, StatusConferencia } from '../../types/pdv';

/* ------------------------------ Constantes ------------------------------- */

const ROTULO_FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  faturamento: 'Despachante / Prazo',
};

const PERIODOS: { id: PeriodoRapido; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'turno', rotulo: 'Turno Atual' },
  { id: '7dias', rotulo: 'Últimos 7 Dias' },
  { id: 'mes', rotulo: 'Mês Vigente' },
  { id: 'personalizado', rotulo: 'Personalizado' },
];

const MEIOS_BOTOES: { id: FiltroMeioPagamento; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'dinheiro', rotulo: 'Dinheiro' },
  { id: 'pix', rotulo: 'PIX' },
  { id: 'cartao_debito', rotulo: 'Débito' },
  { id: 'cartao_credito', rotulo: 'Crédito' },
  { id: 'faturamento', rotulo: 'Despachante / Prazo' },
];

const STATUS_ATA: { id: FiltroStatusAta; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos os Status' },
  { id: 'divergentes', rotulo: 'Apenas Quebras / Sobras' },
  { id: 'exatos', rotulo: 'Apenas Exatos' },
];

const CORES_PALETA = [
  '#10b981', // esmeralda
  '#0ea5e9', // azul sky
  '#8b5cf6', // violeta
  '#f59e0b', // âmbar
  '#6366f1', // índigo
  '#14b8a6', // teal
  '#f43f5e', // rose
  '#ec4899', // rosa
  '#06b6d4', // ciano
  '#84cc16', // verde lima
];

const selectBase =
  'w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]';

const fmtData = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

/** Dispara a impressão isolando apenas a área marcada com `.print-area-<alvo>`. */
function imprimirArea(alvo: 'ata' | 'vendas'): void {
  document.body.dataset.print = alvo;
  const limpar = () => {
    delete document.body.dataset.print;
    window.removeEventListener('afterprint', limpar);
  };
  window.addEventListener('afterprint', limpar);
  window.print();
}

/* ------------------------------- Badges ---------------------------------- */

function BadgeFormaPagamento({ forma }: { forma: FormaPagamento | string }) {
  if (forma === 'pix') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-700/70 shadow-sm">
        PIX
      </span>
    );
  }
  if (forma === 'dinheiro') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-950/70 text-teal-300 border border-teal-700/70 shadow-sm">
        Dinheiro
      </span>
    );
  }
  if (forma === 'cartao_debito') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-950/70 text-sky-300 border border-sky-700/70 shadow-sm">
        Débito
      </span>
    );
  }
  if (forma === 'cartao_credito') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/70 text-purple-300 border border-purple-700/70 shadow-sm">
        Crédito
      </span>
    );
  }
  if (forma === 'faturamento') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/70 text-amber-300 border border-amber-700/70 shadow-sm">
        Despachante / Prazo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
      {ROTULO_FORMA[forma] || forma}
    </span>
  );
}

function BadgeParecer({ status }: { status: StatusConferencia }) {
  if (status === 'exato')
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
        <CheckCircle2 size={12} /> Exato
      </span>
    );
  if (status === 'quebra_caixa')
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/40">
        <AlertOctagon size={12} /> Quebra de Caixa
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/40">
      <AlertTriangle size={12} /> Sobra de Caixa
    </span>
  );
}

/* ------------------------------ Modal da Ata ----------------------------- */

function ModalAta({ ata, onClose }: { ata: AtaFechamento; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:static print:bg-white print:p-0">
      <div className="print-area print-area-ata w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-6 my-6 text-slate-100 print:bg-white print:border-0 print:shadow-none print:p-0 print:my-0">
        <div className="no-print flex items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
          <div>
            <p className="text-[10px] uppercase font-black tracking-widest text-emerald-400">
              Integra CRVA · Documento Auditado
            </p>
            <h2 className="text-lg font-black text-white">
              Visualização de Ata Oficial de Encerramento
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => imprimirArea('ata')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 border-0 cursor-pointer shadow-sm transition-all"
            >
              <Printer size={14} /> Imprimir Ata A4
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full border-0 bg-transparent cursor-pointer transition-all"
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex justify-center">
          <AtaEncerramento
            caixa={ata as any}
            operadorNomeFallback={ata.operador_nome}
            podeVerDivergencia={true}
          />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Barra de Filtros -------------------------- */

interface BarraFiltrosProps {
  filtros: FiltrosRelatorio;
  setFiltros: React.Dispatch<React.SetStateAction<FiltrosRelatorio>>;
  operadores: { id: string; nome: string }[];
  mostrarMeio: boolean;
  mostrarStatus: boolean;
}

function BarraFiltrosSuperiores({
  filtros,
  setFiltros,
  operadores,
  mostrarMeio,
  mostrarStatus,
}: BarraFiltrosProps) {
  const escolherPeriodo = (p: PeriodoRapido) =>
    setFiltros((f) => ({ ...f, periodo: p, ...resolverPeriodo(p, f) }));

  return (
    <div className="no-print rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md space-y-4">
      {/* 1. Linha Superior: Botões de Atalho de Período e Seletores de Data */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Calendar size={13} className="text-emerald-400" />
            Filtro de Período
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => escolherPeriodo(p.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                  filtros.periodo === p.id
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                    : 'bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-600 hover:text-white'
                }`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* Inputs de Data (Personalizado ou Fixos) */}
        <div className="flex items-center gap-3">
          <div>
            <label htmlFor="rel-data-ini" className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              De:
            </label>
            <input
              id="rel-data-ini"
              type="date"
              value={filtros.dataInicial}
              max={filtros.dataFinal}
              onChange={(e) => setFiltros((f) => ({ ...f, periodo: 'personalizado', dataInicial: e.target.value }))}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="rel-data-fim" className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Até:
            </label>
            <input
              id="rel-data-fim"
              type="date"
              value={filtros.dataFinal}
              min={filtros.dataInicial}
              onChange={(e) => setFiltros((f) => ({ ...f, periodo: 'personalizado', dataFinal: e.target.value }))}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* 2. Linha Inferior: Formas de Pagamento, Busca Textual e Operadores */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Filtro Rápido de Forma de Pagamento */}
        {mostrarMeio && (
          <div className="flex-1 min-w-[280px]">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <CreditCard size={13} className="text-sky-400" />
              Forma de Pagamento
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MEIOS_BOTOES.map((m) => {
                const ativo = filtros.meioPagamento === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setFiltros((f) => ({ ...f, meioPagamento: m.id }))}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                      ativo
                        ? 'bg-sky-600 text-white border-sky-500 shadow-md shadow-sky-950/40'
                        : 'bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    {m.rotulo}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Barra de Pesquisa Rápida */}
        <div className="w-full md:w-80">
          <label htmlFor="rel-busca" className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Search size={13} className="text-amber-400" />
            Busca Rápida
          </label>
          <div className="relative">
            <input
              id="rel-busca"
              type="text"
              placeholder="Protocolo, CPF/CNPJ, Cliente, Placa..."
              value={filtros.termoBusca || ''}
              onChange={(e) => setFiltros((f) => ({ ...f, termoBusca: e.target.value }))}
              className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500 pointer-events-none" />
            {filtros.termoBusca && (
              <button
                type="button"
                onClick={() => setFiltros((f) => ({ ...f, termoBusca: '' }))}
                className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white cursor-pointer bg-transparent border-0"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Dropdowns Adicionais: Operador e Status */}
        <div className="flex items-center gap-3">
          <div className="w-48">
            <label htmlFor="rel-operador" className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              Operador / Atendente
            </label>
            <select
              id="rel-operador"
              value={filtros.operadorId}
              onChange={(e) => setFiltros((f) => ({ ...f, operadorId: e.target.value }))}
              className={selectBase}
            >
              <option value="">Todos os operadores</option>
              {operadores.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </div>

          {mostrarStatus && (
            <div className="w-48">
              <label htmlFor="rel-status" className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                Status da Ata
              </label>
              <select
                id="rel-status"
                value={filtros.statusAta}
                onChange={(e) => setFiltros((f) => ({ ...f, statusAta: e.target.value as FiltroStatusAta }))}
                className={selectBase}
              >
                {STATUS_ATA.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Exportação CSV ---------------------------- */

function exportarCSV(vendas: VendaRelatorio[]): void {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const num = (n: number) => n.toFixed(2).replace('.', ',');
  const linhas = [
    [
      'Data/Hora',
      'Protocolo/Recibo',
      'Auditado por (Lancamento)',
      'Titular do Caixa',
      'Cliente / Tomador',
      'Documento (CPF/CNPJ)',
      'Placa / Veículo',
      'Serviços Prestados',
      'Forma de Pagamento',
      'Subtotal',
      'ISSQN 2%',
      'Total Pago',
    ]
      .map(esc)
      .join(';'),
    ...vendas.map((v) =>
      [
        esc(fmtData(v.criado_em)),
        esc(v.protocolo),
        esc(v.operador_auditado_nome || v.operador_nome),
        esc(v.operador_nome),
        esc(v.cliente),
        esc(v.cliente_documento || ''),
        esc(v.veiculo_placa ? `${v.veiculo_placa} - ${v.veiculo_modelo || ''}` : ''),
        esc(
          v.servicos_detalhados && v.servicos_detalhados.length > 0
            ? v.servicos_detalhados.map((s) => `${s.quantidade}x ${s.servico}`).join(' | ')
            : v.servico
        ),
        esc(ROTULO_FORMA[v.forma_pagamento] ?? v.forma_pagamento),
        num(v.subtotal),
        num(v.issqn),
        num(v.valor),
      ].join(';')
    ),
  ];
  const blob = new Blob(['\uFEFF' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-vendas-integra-crva-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------- Custom Tooltip para o Recharts ---------------------- */

function CustomTooltipGrafico({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950/95 border border-slate-700/80 p-3.5 rounded-2xl shadow-2xl backdrop-blur-md max-w-xs text-left">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="w-3 h-3 rounded-full shrink-0 shadow-sm"
            style={{ backgroundColor: payload[0].fill }}
          />
          <p className="text-xs font-bold text-white leading-snug line-clamp-2">
            {data.nome}
          </p>
        </div>
        <div className="space-y-1 pt-1.5 border-t border-slate-800 text-[11px]">
          <div className="flex justify-between items-center text-slate-300">
            <span>Demanda:</span>
            <span className="font-bold text-white font-mono">{data.quantidade} ordens</span>
          </div>
          <div className="flex justify-between items-center text-slate-300">
            <span>Arrecadação:</span>
            <span className="font-bold text-emerald-400 font-mono">{formatarBRL(data.valorTotalArrecadado)}</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Participação:</span>
            <span className="font-bold text-sky-400 font-mono">{data.percentualFaturamento}%</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

/* ------------------------------ Componente ------------------------------- */

export default function RelatoriosPDV({ aba }: { aba: 'atas' | 'vendas' }) {
  const [filtros, setFiltros] = useState<FiltrosRelatorio>(filtrosIniciais);
  const [dados, setDados] = useState<DadosRelatorios>({
    operadores: [],
    atas: [],
    vendas: [],
    transicoes: [],
  });
  const [catalogoOficial, setCatalogoOficial] = useState<ServicoCatalogo[]>([]);
  const [subAbaAta, setSubAbaAta] = useState<'atas' | 'transicoes'>('atas');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  
  // Modais
  const [ataAberta, setAtaAberta] = useState<AtaFechamento | null>(null);
  const [vendaParaReimpressao, setVendaParaReimpressao] = useState<VendaRelatorio | null>(null);

  // Carregar catálogo de serviços para correlacionar códigos oficiais
  useEffect(() => {
    let ativo = true;
    buscarServicos().then((servs) => {
      if (ativo) setCatalogoOficial(servs);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const carregar = useCallback(async () => {
    if (!filtros.dataInicial || !filtros.dataFinal || filtros.dataInicial > filtros.dataFinal) return;
    setCarregando(true);
    try {
      setDados(await carregarRelatorios(filtros));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar relatórios.');
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const totais = useMemo(() => calcularTotaisVendas(dados.vendas), [dados.vendas]);

  // Consolidação analítica do Catálogo de Serviços
  const consolidadoCatalogo = useMemo(() => {
    return consolidarPorCatalogo(dados.vendas, catalogoOficial);
  }, [dados.vendas, catalogoOficial]);

  const cardsTotais: { rotulo: string; valor: string; cor: string }[] = [
    { rotulo: 'Total Faturado no Período', valor: formatarBRL(totais.totalFaturado), cor: 'text-emerald-400' },
    {
      rotulo: 'Volume de Transações',
      valor: `${totais.quantidade} ${totais.quantidade === 1 ? 'venda' : 'vendas'}`,
      cor: 'text-white',
    },
    { rotulo: 'Total ISSQN Apurado (2%)', valor: formatarBRL(totais.totalISSQN), cor: 'text-amber-400' },
    { rotulo: 'Ticket Médio', valor: formatarBRL(totais.ticketMedio), cor: 'text-sky-400' },
  ];

  return (
    <div className="space-y-6">
      {/* 1. SELEÇÃO DE PERÍODO & FILTROS SUPERIORES */}
      <BarraFiltrosSuperiores
        filtros={filtros}
        setFiltros={setFiltros}
        operadores={dados.operadores}
        mostrarMeio={aba === 'vendas'}
        mostrarStatus={aba === 'atas' && subAbaAta === 'atas'}
      />

      {filtros.dataInicial > filtros.dataFinal && (
        <div className="p-3 bg-amber-950/50 border border-amber-700/50 text-amber-300 rounded-xl text-xs font-semibold">
          A data inicial não pode ser posterior à data final.
        </div>
      )}
      {erro && (
        <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-semibold">
          {erro}
        </div>
      )}

      {/* ===================================================================
       * ABA 1: ATAS DE ENCERRAMENTO & TRANSIÇÕES DE OPERADOR
       * =================================================================== */}
      {aba === 'atas' && (
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            {/* Sub-abas de Auditoria: Fechamentos vs Trocas Rápidas */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setSubAbaAta('atas')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-0 ${
                  subAbaAta === 'atas'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-transparent text-slate-400 hover:text-white'
                }`}
              >
                Atas de Encerramento ({dados.atas.length})
              </button>
              <button
                type="button"
                onClick={() => setSubAbaAta('transicoes')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-0 ${
                  subAbaAta === 'transicoes'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-transparent text-slate-400 hover:text-white'
                }`}
              >
                Histórico de Transições de Operador ({dados.transicoes.length})
              </button>
            </div>

            <span className="text-xs text-slate-500 font-medium">
              {carregando
                ? 'Carregando auditoria...'
                : subAbaAta === 'atas'
                ? `${dados.atas.length} turno(s) fechado(s)`
                : `${dados.transicoes.length} transição(ões) registrada(s)`}
            </span>
          </div>

          {subAbaAta === 'atas' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400 font-bold border-b border-slate-800">
                    <th className="py-3 px-3">ID do Turno</th>
                    <th className="py-3 px-3">Operador</th>
                    <th className="py-3 px-3">Abertura</th>
                    <th className="py-3 px-3">Fechamento</th>
                    <th className="py-3 px-3 text-right">Fundo Inicial</th>
                    <th className="py-3 px-3 text-right">Saldo Esperado</th>
                    <th className="py-3 px-3 text-right">Valor Informado</th>
                    <th className="py-3 px-3 text-right">Diferença (R$)</th>
                    <th className="py-3 px-3 text-center">Parecer</th>
                    <th className="py-3 px-3 text-center">Ata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {dados.atas.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-500">
                        Nenhuma ata encontrada para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    dados.atas.map((a) => {
                      const dif = Number(a.diferenca) || 0;
                      return (
                        <tr key={a.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-slate-400">
                            #{a.id.slice(0, 8).toUpperCase()}
                          </td>
                          <td className="py-3 px-3 font-bold text-slate-200">{a.operador_nome}</td>
                          <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{fmtData(a.data_abertura)}</td>
                          <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{fmtData(a.data_fechamento)}</td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {formatarBRL(Number(a.valor_abertura))}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {a.valor_fechamento_esperado !== null
                              ? formatarBRL(Number(a.valor_fechamento_esperado))
                              : '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-white">
                            {a.valor_fechamento_informado !== null
                              ? formatarBRL(Number(a.valor_fechamento_informado))
                              : '-'}
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono font-black ${
                              dif < 0 ? 'text-red-400' : dif > 0 ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {dif > 0 ? `+${formatarBRL(dif)}` : formatarBRL(dif)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <BadgeParecer status={a.status_conferencia_efetivo} />
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => setAtaAberta(a)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 cursor-pointer transition-all"
                            >
                              <Eye size={12} /> Visualizar Ata
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400 font-bold border-b border-slate-800">
                    <th className="py-3 px-3">Data/Hora</th>
                    <th className="py-3 px-3">Caixa ID</th>
                    <th className="py-3 px-3">Entregou o Turno</th>
                    <th className="py-3 px-3">Assumiu o Terminal</th>
                    <th className="py-3 px-3 text-right">Saldo Gaveta no Momento</th>
                    <th className="py-3 px-3">Motivo / Justificativa</th>
                    <th className="py-3 px-3 text-center">Auditoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {dados.transicoes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Nenhuma transição de operador registrada no período.
                      </td>
                    </tr>
                  ) : (
                    dados.transicoes.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{fmtData(t.trocado_em)}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-400">
                          #{t.caixa_id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-slate-300 block">{t.operador_anterior_nome}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            ID: {t.operador_anterior_id.slice(0, 8)}...
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-amber-300 block">{t.operador_novo_nome}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            ID: {t.operador_novo_id.slice(0, 8)}...
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-400">
                          {formatarBRL(Number(t.saldo_gaveta_momento))}
                        </td>
                        <td className="py-3 px-3 text-slate-300 max-w-xs truncate">
                          {t.motivo_troca || 'Troca rápida de turno / Emergência'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <ShieldCheck size={12} /> Auditado
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================
       * ABA 2: VENDAS, SERVIÇOS DO CATÁLOGO & LIVRO-RAZÃO
       * =================================================================== */}
      {aba === 'vendas' && (
        <div className="print-area print-area-vendas space-y-6">
          {/* KPIs Consolidados do Período */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cardsTotais.map((c) => (
              <div key={c.rotulo} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{c.rotulo}</span>
                <div className={`text-2xl font-black tracking-tight mt-2 ${c.cor}`}>{c.valor}</div>
              </div>
            ))}
          </div>

          {/* 2. PAINEL ANALÍTICO: GRÁFICO EM PIZZA E TABELA DO CATÁLOGO DE SERVIÇOS (GRID 50/50) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* COLUNA ESQUERDA: GRÁFICO EM PIZZA (DONUT CHART - RECHARTS) */}
            <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      <PieChartIcon size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Volumetria de Serviços</h4>
                      <p className="text-[11px] text-slate-400">Distribuição percentual da demanda no período</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    {consolidadoCatalogo.totalGeralServicos} atos
                  </span>
                </div>

                {consolidadoCatalogo.itens.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <PieChartIcon size={36} className="text-slate-600 mb-2 stroke-[1.5]" />
                    <p className="text-xs font-semibold">Nenhum serviço registrado no período selecionado.</p>
                  </div>
                ) : (
                  <div className="h-64 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={consolidadoCatalogo.itens}
                          dataKey="valorTotalArrecadado"
                          nameKey="nome"
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={105}
                          paddingAngle={3}
                        >
                          {consolidadoCatalogo.itens.map((entry, index) => (
                            <Cell
                              key={`cell-${entry.codigo}-${index}`}
                              fill={CORES_PALETA[index % CORES_PALETA.length]}
                              stroke="#0f172a"
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltipGrafico />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Legenda dos Serviços Mais Demandados */}
              {consolidadoCatalogo.itens.length > 0 && (
                <div className="pt-4 border-t border-slate-800/80">
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-wider">
                    Serviços Mais Demandados (Top Itens)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {consolidadoCatalogo.itens.slice(0, 4).map((item, idx) => (
                      <div
                        key={item.codigo}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: CORES_PALETA[idx % CORES_PALETA.length] }}
                        />
                        <span className="truncate max-w-[130px] font-medium" title={item.nome}>
                          {item.nome}
                        </span>
                        <span className="font-mono font-bold text-emerald-400 ml-1">
                          {item.percentualFaturamento}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* COLUNA DIREITA: TABELA DO CATÁLOGO DE SERVIÇOS CRVA COM TOTAIS */}
            <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                      <TableIcon size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Catálogo de Serviços CRVA · Arrecadação</h4>
                      <p className="text-[11px] text-slate-400">
                        Consolidação por item com alíquota de ISSQN (2%) inclusa
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-500/30">
                    {consolidadoCatalogo.itens.length} itens ativos
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[290px] overflow-y-auto pr-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
                      <tr className="text-slate-400 font-bold border-b border-slate-800">
                        <th className="py-2.5 px-3">Código</th>
                        <th className="py-2.5 px-3">Descrição do Serviço</th>
                        <th className="py-2.5 px-3 text-right">Qtd.</th>
                        <th className="py-2.5 px-3 text-right">Total Arrecadado</th>
                        <th className="py-2.5 px-3 text-right">% Part.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {consolidadoCatalogo.itens.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            Nenhum item do catálogo faturado no período.
                          </td>
                        </tr>
                      ) : (
                        consolidadoCatalogo.itens.map((item) => (
                          <tr key={item.codigo} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-emerald-400">
                                {item.codigo}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-200">
                              {item.nome}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                              {item.quantidade}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-400">
                              {formatarBRL(item.valorTotalArrecadado)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-sky-400 font-bold">
                              {item.percentualFaturamento}%
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Rodapé com Total Geral do Catálogo */}
              <div className="pt-3 mt-3 border-t border-slate-800/90 flex items-center justify-between bg-slate-950/60 px-4 py-2.5 rounded-xl">
                <span className="text-xs font-bold uppercase text-slate-400">Total Geral do Catálogo:</span>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase block">Qtd. Realizada</span>
                    <span className="font-mono font-bold text-white text-xs">
                      {consolidadoCatalogo.totalGeralServicos} atos
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase block">Total Arrecadado</span>
                    <span className="font-mono font-black text-emerald-400 text-sm">
                      {formatarBRL(consolidadoCatalogo.totalGeralFaturado)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase block">Participação</span>
                    <span className="font-mono font-bold text-sky-400 text-xs">100%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. RELATÓRIO ANALÍTICO DE VENDAS & LIVRO-RAZÃO */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                  <Receipt size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Livro-Razão & Relatório Analítico de Vendas
                    <span className="hidden print-only text-xs font-normal">
                      {' '}
                      — {filtros.dataInicial} a {filtros.dataFinal}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Registro sequencial e auditado de todas as liquidações e faturamentos com emissão de 2ª via
                  </p>
                </div>
              </div>

              <div className="no-print flex items-center gap-2">
                <button
                  type="button"
                  disabled={dados.vendas.length === 0}
                  onClick={() => exportarCSV(dados.vendas)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 cursor-pointer transition-all shadow-sm"
                >
                  <Download size={14} /> Exportar CSV
                </button>
                <button
                  type="button"
                  onClick={() => imprimirArea('vendas')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 border-0 cursor-pointer transition-all shadow-md shadow-emerald-950/40"
                >
                  <Printer size={14} /> Imprimir Sintético
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400 font-bold border-b border-slate-800">
                    <th className="py-3 px-3">Data/Hora</th>
                    <th className="py-3 px-3">Recibo / Protocolo</th>
                    <th className="py-3 px-3">Tomador / Cliente</th>
                    <th className="py-3 px-3">Atendente / Caixa</th>
                    <th className="py-3 px-3">Forma de Pagamento</th>
                    <th className="py-3 px-3 text-right">Subtotal</th>
                    <th className="py-3 px-3 text-right">ISSQN 2%</th>
                    <th className="py-3 px-3 text-right">Total Pago</th>
                    <th className="py-3 px-3 text-center no-print">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {carregando ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        <Loader2 size={16} className="inline animate-spin mr-2 text-emerald-400" />
                        Carregando vendas e faturamentos...
                      </td>
                    </tr>
                  ) : dados.vendas.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        Nenhuma venda ou lançamento encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    dados.vendas.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-800/40 transition-colors">
                        {/* Data / Hora */}
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                          {fmtData(v.criado_em)}
                        </td>

                        {/* Protocolo */}
                        <td className="py-3 px-3 font-mono font-bold text-slate-300">
                          {v.protocolo}
                        </td>

                        {/* Tomador / Cliente */}
                        <td className="py-3 px-3 max-w-xs">
                          <span className="font-bold text-slate-200 block truncate" title={v.cliente}>
                            {v.cliente}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            {v.cliente_documento && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                {mascararDocumento(v.cliente_documento)}
                              </span>
                            )}
                            {v.veiculo_placa && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono text-slate-300">
                                <Car size={10} className="text-slate-400" />
                                {v.veiculo_placa}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Atendente / Caixa */}
                        <td className="py-3 px-3">
                          <span className="font-bold text-emerald-300 block">
                            {v.operador_auditado_nome || v.operador_nome}
                          </span>
                          {v.operador_auditado_nome && v.operador_auditado_nome !== v.operador_nome && (
                            <span className="text-[10px] text-slate-400 block">
                              Caixa: {v.operador_nome}
                            </span>
                          )}
                        </td>

                        {/* Forma de Pagamento */}
                        <td className="py-3 px-3">
                          <BadgeFormaPagamento forma={v.forma_pagamento} />
                        </td>

                        {/* Subtotal */}
                        <td className="py-3 px-3 text-right font-mono text-slate-300">
                          {formatarBRL(v.subtotal)}
                        </td>

                        {/* ISSQN 2% */}
                        <td className="py-3 px-3 text-right font-mono text-amber-400">
                          {formatarBRL(v.issqn)}
                        </td>

                        {/* Total Pago */}
                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-400">
                          {formatarBRL(v.valor)}
                        </td>

                        {/* Botão de Ação: 2ª Via / Reimprimir */}
                        <td className="py-3 px-3 text-center no-print">
                          <button
                            type="button"
                            onClick={() => setVendaParaReimpressao(v)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-950/60 hover:text-emerald-300 text-slate-200 border border-slate-700 hover:border-emerald-500/50 text-[11px] font-bold shadow-sm transition-all cursor-pointer"
                            title="Emitir Segunda Via Oficial de Recibo"
                          >
                            <Printer size={13} className="text-emerald-400" />
                            <span>2ª Via</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal da Ata de Fechamento */}
      {ataAberta && <ModalAta ata={ataAberta} onClose={() => setAtaAberta(null)} />}

      {/* 4. MODAL DE REIMPRESSÃO DO RECIBO / CUPOM FISCAL */}
      {vendaParaReimpressao && (
        <ModalReimpressaoCupom
          venda={vendaParaReimpressao}
          onFechar={() => setVendaParaReimpressao(null)}
        />
      )}
    </div>
  );
}
