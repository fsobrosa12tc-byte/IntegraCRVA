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
} from 'lucide-react';
import { formatarBRL } from '../../lib/pdvCaixa';
import {
  calcularTotaisVendas,
  carregarRelatorios,
  filtrosIniciais,
  gerarHashAta,
  listarSangriasSuprimentos,
  resolverPeriodo,
  type AtaFechamento,
  type DadosRelatorios,
  type FiltroMeioPagamento,
  type FiltroStatusAta,
  type FiltrosRelatorio,
  type PeriodoRapido,
  type VendaRelatorio,
} from '../../lib/relatoriosPdvService';
import type { FormaPagamento, MovimentacaoCaixa, StatusConferencia } from '../../types/pdv';

/* ------------------------------ Constantes ------------------------------- */

const ROTULO_FORMA: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  faturamento: 'Faturamento B2B',
};

const PERIODOS: { id: PeriodoRapido; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7dias', rotulo: 'Últimos 7 Dias' },
  { id: 'mes', rotulo: 'Mês Atual' },
  { id: 'personalizado', rotulo: 'Personalizado' },
];

const MEIOS: { id: FiltroMeioPagamento; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'dinheiro', rotulo: 'Dinheiro' },
  { id: 'pix', rotulo: 'PIX' },
  { id: 'cartoes', rotulo: 'Cartões' },
  { id: 'faturamento', rotulo: 'Faturamento B2B' },
];

const STATUS_ATA: { id: FiltroStatusAta; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'divergentes', rotulo: 'Apenas Quebras/Sobras' },
  { id: 'exatos', rotulo: 'Exatos' },
];

const selectBase =
  'w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]';

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

const rotuloParecer = (s: StatusConferencia): string =>
  s === 'exato' ? 'EXATO' : s === 'quebra_caixa' ? 'QUEBRA DE CAIXA' : 'SOBRA DE CAIXA';

/* ------------------------------ Modal da Ata ----------------------------- */

function ModalAta({ ata, onClose }: { ata: AtaFechamento; onClose: () => void }) {
  const [hash, setHash] = useState('Calculando...');
  const [movs, setMovs] = useState<MovimentacaoCaixa[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    gerarHashAta(ata)
      .then((h) => ativo && setHash(h))
      .catch(() => ativo && setHash('Indisponível neste contexto (HTTPS necessário)'));
    listarSangriasSuprimentos(ata.id)
      .then((m) => ativo && setMovs(m))
      .catch(() => ativo && setMovs([]))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [ata]);

  const dif = Number(ata.diferenca) || 0;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="print-area print-area-ata w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-8 my-6 text-slate-100">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <p className="text-[10px] uppercase font-black tracking-widest text-emerald-400">
              Integra PDV · Documento Auditado
            </p>
            <h2 className="text-xl font-black text-white">Ata Oficial de Encerramento de Caixa</h2>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Turno #{ata.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="no-print p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full border-0 bg-transparent cursor-pointer"
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs py-5">
          <div>
            <dt className="text-slate-500 font-bold uppercase text-[10px]">Operador</dt>
            <dd className="font-bold text-slate-100">{ata.operador_nome}</dd>
            <dd className="text-slate-500 text-[11px]">{ata.operador_email}</dd>
          </div>
          <div>
            <dt className="text-slate-500 font-bold uppercase text-[10px]">Parecer da Auditoria</dt>
            <dd className="mt-0.5">
              <BadgeParecer status={ata.status_conferencia_efetivo} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 font-bold uppercase text-[10px]">Abertura</dt>
            <dd className="font-mono text-slate-200">{fmtData(ata.data_abertura)}</dd>
          </div>
          <div>
            <dt className="text-slate-500 font-bold uppercase text-[10px]">Fechamento</dt>
            <dd className="font-mono text-slate-200">{fmtData(ata.data_fechamento)}</dd>
          </div>
        </dl>

        <table className="w-full text-xs border-collapse mb-5">
          <tbody className="divide-y divide-slate-800">
            <tr>
              <td className="py-2 text-slate-400">Fundo Inicial (Troco)</td>
              <td className="py-2 text-right font-mono font-bold">{formatarBRL(Number(ata.valor_abertura))}</td>
            </tr>
            <tr>
              <td className="py-2 text-slate-400">Saldo Esperado pelo Sistema</td>
              <td className="py-2 text-right font-mono font-bold">
                {ata.valor_fechamento_esperado !== null ? formatarBRL(Number(ata.valor_fechamento_esperado)) : '-'}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-slate-400">Valor Informado pelo Operador</td>
              <td className="py-2 text-right font-mono font-bold">
                {ata.valor_fechamento_informado !== null ? formatarBRL(Number(ata.valor_fechamento_informado)) : '-'}
              </td>
            </tr>
            <tr>
              <td className="py-2 font-bold text-slate-200">Diferença apurada</td>
              <td
                className={`py-2 text-right font-mono font-black ${
                  dif < 0 ? 'text-red-400' : dif > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {dif > 0 ? `+${formatarBRL(dif)}` : formatarBRL(dif)} ({rotuloParecer(ata.status_conferencia_efetivo)})
              </td>
            </tr>
          </tbody>
        </table>

        <h3 className="text-xs font-black uppercase text-slate-300 mb-2">Sangrias e Suprimentos do Turno</h3>
        <table className="w-full text-xs border-collapse mb-6">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800 text-left">
              <th className="py-2">Horário</th>
              <th className="py-2">Tipo</th>
              <th className="py-2">Descrição</th>
              <th className="py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {carregando ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-500">
                  <Loader2 size={14} className="inline animate-spin mr-1" /> Carregando...
                </td>
              </tr>
            ) : movs.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-500">
                  Nenhuma sangria ou suprimento neste turno.
                </td>
              </tr>
            ) : (
              movs.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 font-mono text-slate-400">{fmtData(m.criado_em)}</td>
                  <td className={`py-2 font-bold ${m.tipo === 'sangria' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {m.tipo === 'sangria' ? 'Sangria' : 'Suprimento'}
                  </td>
                  <td className="py-2 text-slate-300">{m.descricao || '-'}</td>
                  <td className="py-2 text-right font-mono font-bold">
                    {m.tipo === 'sangria' ? '- ' : '+ '}
                    {formatarBRL(Number(m.valor))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase text-emerald-400">
            <ShieldCheck size={14} /> Assinatura Digital do Sistema (SHA-256)
          </p>
          <p className="font-mono text-[10px] text-slate-400 break-all mt-1">{hash}</p>
          <p className="text-[10px] text-slate-500 mt-2">
            Emitida em {new Date().toLocaleString('pt-BR')} · Documento gerado eletronicamente; qualquer
            alteração nos valores invalida o hash.
          </p>
        </div>

        <div className="no-print flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => imprimirArea('ata')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 border-0 cursor-pointer"
          >
            <Printer size={14} /> Imprimir Ata
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Barra de filtros ------------------------- */

function BarraFiltros({
  filtros,
  setFiltros,
  operadores,
  mostrarMeio,
  mostrarStatus,
}: {
  filtros: FiltrosRelatorio;
  setFiltros: React.Dispatch<React.SetStateAction<FiltrosRelatorio>>;
  operadores: { id: string; nome: string }[];
  mostrarMeio: boolean;
  mostrarStatus: boolean;
}) {
  const escolherPeriodo = (p: PeriodoRapido) =>
    setFiltros((f) => ({ ...f, periodo: p, ...resolverPeriodo(p, f) }));

  return (
    <div className="no-print bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-lg space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Período</label>
          <div className="flex flex-wrap gap-1.5">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => escolherPeriodo(p.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                  filtros.periodo === p.id
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="rel-data-ini" className="block text-[10px] font-black uppercase text-slate-500 mb-1">
            Data Inicial
          </label>
          <input
            id="rel-data-ini"
            type="date"
            value={filtros.dataInicial}
            max={filtros.dataFinal}
            onChange={(e) => setFiltros((f) => ({ ...f, periodo: 'personalizado', dataInicial: e.target.value }))}
            className={selectBase}
          />
        </div>
        <div>
          <label htmlFor="rel-data-fim" className="block text-[10px] font-black uppercase text-slate-500 mb-1">
            Data Final
          </label>
          <input
            id="rel-data-fim"
            type="date"
            value={filtros.dataFinal}
            min={filtros.dataInicial}
            onChange={(e) => setFiltros((f) => ({ ...f, periodo: 'personalizado', dataFinal: e.target.value }))}
            className={selectBase}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="rel-operador" className="block text-[10px] font-black uppercase text-slate-500 mb-1">
            Operador
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
        {mostrarMeio && (
          <div>
            <label htmlFor="rel-meio" className="block text-[10px] font-black uppercase text-slate-500 mb-1">
              Meio de Pagamento
            </label>
            <select
              id="rel-meio"
              value={filtros.meioPagamento}
              onChange={(e) => setFiltros((f) => ({ ...f, meioPagamento: e.target.value as FiltroMeioPagamento }))}
              className={selectBase}
            >
              {MEIOS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </div>
        )}
        {mostrarStatus && (
          <div>
            <label htmlFor="rel-status" className="block text-[10px] font-black uppercase text-slate-500 mb-1">
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
  );
}

/* ----------------------------- Exportação CSV ---------------------------- */

/* ----------------------------- Exportação CSV ---------------------------- */

function exportarCSV(vendas: VendaRelatorio[]): void {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const num = (n: number) => n.toFixed(2).replace('.', ',');
  const linhas = [
    [
      'Data/Hora',
      'Protocolo',
      'Auditado por (Lancamento)',
      'Titular Caixa',
      'Cliente/Despachante',
      'Servico',
      'Meio de Pagamento',
      'Valor Bruto',
      'ISSQN 2%',
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
        esc(v.servico),
        esc(ROTULO_FORMA[v.forma_pagamento] ?? v.forma_pagamento),
        num(v.valor),
        num(v.issqn),
      ].join(';')
    ),
  ];
  const blob = new Blob(['\uFEFF' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-vendas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  const [subAbaAta, setSubAbaAta] = useState<'atas' | 'transicoes'>('atas');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ataAberta, setAtaAberta] = useState<AtaFechamento | null>(null);

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
      <BarraFiltros
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
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 cursor-pointer"
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
            /* TABELA DE AUDITORIA: HISTÓRICO DE TRANSIÇÕES DE OPERADOR (logs_troca_operador) */
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

      {aba === 'vendas' && (
        <div className="print-area print-area-vendas space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cardsTotais.map((c) => (
              <div key={c.rotulo} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{c.rotulo}</span>
                <div className={`text-2xl font-black tracking-tight mt-2 ${c.cor}`}>{c.valor}</div>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base">
                Relatório Analítico de Vendas e Serviços
                <span className="hidden print-only text-xs font-normal">
                  {' '}
                  — {filtros.dataInicial} a {filtros.dataFinal}
                </span>
              </h3>
              <div className="no-print flex gap-2">
                <button
                  type="button"
                  disabled={dados.vendas.length === 0}
                  onClick={() => exportarCSV(dados.vendas)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 cursor-pointer"
                >
                  <Download size={14} /> Exportar Relatório
                </button>
                <button
                  type="button"
                  onClick={() => imprimirArea('vendas')}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 border-0 cursor-pointer"
                >
                  <Printer size={14} /> Imprimir Relatório Sintético
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400 font-bold border-b border-slate-800">
                    <th className="py-3 px-3">Data/Hora</th>
                    <th className="py-3 px-3">Protocolo/Cupom</th>
                    <th className="py-3 px-3">Auditado por</th>
                    <th className="py-3 px-3">Titular Caixa</th>
                    <th className="py-3 px-3">Cliente/Despachante</th>
                    <th className="py-3 px-3">Serviço</th>
                    <th className="py-3 px-3">Meio de Pagamento</th>
                    <th className="py-3 px-3 text-right">Valor Bruto</th>
                    <th className="py-3 px-3 text-right">ISSQN 2%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {carregando ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        <Loader2 size={14} className="inline animate-spin mr-1" /> Carregando...
                      </td>
                    </tr>
                  ) : dados.vendas.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        Nenhuma venda encontrada para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    dados.vendas.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{fmtData(v.criado_em)}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-300">{v.protocolo}</td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-emerald-300 block">{v.operador_auditado_nome}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-400">{v.operador_nome}</td>
                        <td className="py-3 px-3 text-slate-200 font-semibold">{v.cliente}</td>
                        <td className="py-3 px-3 text-slate-300">{v.servico}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              v.forma_pagamento === 'faturamento'
                                ? 'bg-amber-950/50 text-amber-300 border-amber-700/50'
                                : v.forma_pagamento === 'dinheiro'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {ROTULO_FORMA[v.forma_pagamento] ?? v.forma_pagamento}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-400">
                          {formatarBRL(v.valor)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-amber-400">
                          {formatarBRL(v.issqn)}
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

      {ataAberta && <ModalAta ata={ataAberta} onClose={() => setAtaAberta(null)} />}
    </div>
  );
}
