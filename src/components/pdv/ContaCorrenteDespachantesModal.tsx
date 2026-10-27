import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Building2, 
  Search, 
  CreditCard, 
  DollarSign, 
  QrCode, 
  Banknote, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Printer, 
  Calendar, 
  FileText, 
  Receipt, 
  Loader2,
  CheckSquare,
  Square,
  Sparkles,
  Wallet,
  ShieldCheck
} from 'lucide-react';
import type { Despachante, FormaPagamento } from '../../types/pdv';
import { formatarBRL, deCentavos, paraCentavos } from '../../lib/pdvCaixa';
import { 
  buscarLancamentosDespachante, 
  liquidarFaturaDespachante, 
  type LancamentoFaturamento, 
  type ComprovanteLiquidacao 
} from '../../lib/pdvContaCorrente';
import { somenteDigitos } from '../../utils/documento';

interface ContaCorrenteModalProps {
  despachantes: Despachante[];
  caixaId: string | null;
  operadorNome: string;
  operadorId?: string | null;
  despachanteInicial?: Despachante | null;
  onClose: () => void;
  onDespachanteAtualizado: (d: Despachante) => void;
  onMovimentacaoCriada?: () => void;
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function ContaCorrenteDespachantesModal({
  despachantes,
  caixaId,
  operadorNome,
  operadorId,
  despachanteInicial,
  onClose,
  onDespachanteAtualizado,
  onMovimentacaoCriada
}: ContaCorrenteModalProps) {
  const [termoBusca, setTermoBusca] = useState('');
  const [despSelecionado, setDespSelecionado] = useState<Despachante | null>(despachanteInicial || null);
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [carregandoLancamentos, setCarregandoLancamentos] = useState(false);
  const [lancamentos, setLancamentos] = useState<LancamentoFaturamento[]>([]);
  
  // Itens selecionados para quitação parcial ou total
  const [selecionadosIds, setSelecionadosIds] = useState<string[]>([]);
  
  // Fluxo de Liquidação
  const [modalPagamentoAberto, setModalPagamentoAberto] = useState(false);
  const [formaLiquidacao, setFormaLiquidacao] = useState<'dinheiro' | 'pix' | 'cartao_debito' | 'transferencia'>('pix');
  const [valorCustomizado, setValorCustomizado] = useState<string>('');
  const [liquidando, setLiquidando] = useState(false);
  const [erroLiquidacao, setErroLiquidacao] = useState('');
  const [comprovante, setComprovante] = useState<ComprovanteLiquidacao | null>(null);

  const buscaRef = useRef<HTMLInputElement>(null);

  // Filtro de autocomplete
  const despFiltrados = useMemo(() => {
    const q = norm(termoBusca.trim());
    const dig = somenteDigitos(termoBusca);
    if (!q) return despachantes.slice(0, 8);
    return despachantes
      .filter((d) => norm(d.nome_razao).includes(q) || (dig.length > 0 && somenteDigitos(d.documento).includes(dig)))
      .slice(0, 8);
  }, [despachantes, termoBusca]);

  // Carregar lançamentos quando o despachante for selecionado
  useEffect(() => {
    if (despSelecionado) {
      setCarregandoLancamentos(true);
      buscarLancamentosDespachante(despSelecionado.id)
        .then((dados) => {
          setLancamentos(dados);
          // Por padrão, se houver saldo e lançamentos, marca todos para quitação
          setSelecionadosIds(dados.map(l => l.id));
        })
        .catch((err) => {
          console.error('Erro ao buscar lançamentos:', err);
          setLancamentos([]);
        })
        .finally(() => setCarregandoLancamentos(false));
    } else {
      setLancamentos([]);
      setSelecionadosIds([]);
    }
  }, [despSelecionado]);

  // Cálculo do total a liquidar
  const saldoDevedorTotal = despSelecionado ? Number(despSelecionado.saldo_devedor) || 0 : 0;

  const totalSelecionado = useMemo(() => {
    if (!despSelecionado) return 0;
    if (selecionadosIds.length === 0) return saldoDevedorTotal; // fallback para o saldo total se nenhum avulso marcado
    const somaItens = lancamentos
      .filter((l) => selecionadosIds.includes(l.id))
      .reduce((acc, l) => acc + l.valor, 0);
    return Math.min(saldoDevedorTotal, somaItens > 0 ? somaItens : saldoDevedorTotal);
  }, [despSelecionado, selecionadosIds, lancamentos, saldoDevedorTotal]);

  const alternarSelecaoItem = (id: string) => {
    setSelecionadosIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selecionarTodos = () => {
    if (selecionadosIds.length === lancamentos.length) {
      setSelecionadosIds([]);
    } else {
      setSelecionadosIds(lancamentos.map((l) => l.id));
    }
  };

  const abrirModalLiquidacao = () => {
    setValorCustomizado(totalSelecionado.toFixed(2));
    setErroLiquidacao('');
    setModalPagamentoAberto(true);
  };

  const executarLiquidacao = async () => {
    if (!despSelecionado) return;
    const valor = parseFloat(valorCustomizado.replace(',', '.'));
    if (isNaN(valor) || valor <= 0) {
      setErroLiquidacao('Informe um valor de liquidação válido maior que zero.');
      return;
    }
    if (valor > saldoDevedorTotal + 0.01) {
      setErroLiquidacao(`O valor informado (R$ ${valor.toFixed(2)}) supera o saldo devedor de R$ ${saldoDevedorTotal.toFixed(2)}.`);
      return;
    }

    setLiquidando(true);
    setErroLiquidacao('');
    try {
      const comp = await liquidarFaturaDespachante({
        despachante: despSelecionado,
        valorPago: valor,
        formaPagamento: formaLiquidacao,
        caixaId,
        operadorNome,
        operadorId,
        itensQuitadosCount: selecionadosIds.length || 1
      });

      setComprovante(comp);
      setModalPagamentoAberto(false);
      setDespSelecionado(comp.despachante);
      onDespachanteAtualizado(comp.despachante);
      if (onMovimentacaoCriada) onMovimentacaoCriada();

      // Recarregar lançamentos
      buscarLancamentosDespachante(comp.despachante.id)
        .then((dados) => setLancamentos(dados))
        .catch(() => {});
    } catch (err: any) {
      setErroLiquidacao(err.message || 'Falha ao processar quitação da fatura.');
    } finally {
      setLiquidando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col my-auto max-h-[92vh]">
        
        {/* Topo do Modal */}
        <div className="p-5 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-inner">
              <Building2 size={22} />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight flex items-center gap-2">
                Conta-Corrente de Despachantes (B2B)
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase tracking-wider">
                  Liquidação Financeira
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Auditoria de saldos a receber, detalhamento de ordens de serviço e baixa com integração de gaveta.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border-0 bg-transparent"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo do Modal com Painel Duplo */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* 1. SELETOR DE CLIENTE / DESPACHANTE COM AUTOCOMPLETE */}
          <div className="relative">
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wide">
              Localizar Despachante / Parceiro B2B
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
              <input
                ref={buscaRef}
                value={termoBusca}
                onChange={(e) => {
                  setTermoBusca(e.target.value);
                  setSugestoesAbertas(true);
                }}
                onFocus={() => setSugestoesAbertas(true)}
                placeholder="Digite a Razão Social, Nome Fantasia ou CPF/CNPJ..."
                className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
              />
              {termoBusca && (
                <button
                  type="button"
                  onClick={() => {
                    setTermoBusca('');
                    setSugestoesAbertas(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 bg-transparent border-0 cursor-pointer"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Menu Dropdown de Autocomplete */}
            {sugestoesAbertas && despFiltrados.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-800">
                {despFiltrados.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setDespSelecionado(d);
                      setTermoBusca(d.nome_razao);
                      setSugestoesAbertas(false);
                    }}
                    className="w-full text-left p-3 hover:bg-slate-800 transition-colors flex items-center justify-between cursor-pointer border-0 bg-transparent"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-100">{d.nome_razao}</div>
                      <div className="text-xs font-mono text-slate-400">
                        {d.documento} {d.telefone && `· ${d.telefone}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Saldo Devedor</div>
                      <div className={`text-sm font-black font-mono ${Number(d.saldo_devedor) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {formatarBRL(Number(d.saldo_devedor))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. CARD DE RESUMO DO DESPACHANTE SELECIONADO */}
          {despSelecionado ? (
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-indigo-400" />
                  <span className="text-base font-black text-white">{despSelecionado.nome_razao}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    ID: {despSelecionado.id.slice(0, 8)}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono flex flex-wrap items-center gap-3">
                  <span>Documento: <strong className="text-slate-200">{despSelecionado.documento}</strong></span>
                  {despSelecionado.telefone && (
                    <span>Telefone: <strong className="text-slate-200">{despSelecionado.telefone}</strong></span>
                  )}
                  <span>Status: <strong className="text-emerald-400">Cadastro Ativo</strong></span>
                </div>
              </div>

              {/* Destaque do Saldo Devedor */}
              <div className="w-full md:w-auto p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between md:justify-end gap-5">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Saldo Devedor Atual
                  </div>
                  <div className={`text-2xl font-black font-mono tabular-nums ${saldoDevedorTotal > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatarBRL(saldoDevedorTotal)}
                  </div>
                </div>

                {saldoDevedorTotal > 0 ? (
                  <button
                    type="button"
                    onClick={abrirModalLiquidacao}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-950/50 flex items-center gap-2 cursor-pointer border-0 shrink-0"
                  >
                    <Wallet size={15} />
                    <span>Baixar / Quitar</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/40 px-3 py-2 rounded-lg border border-emerald-800/50">
                    <CheckCircle2 size={16} />
                    <span>Conta em Dia</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl">
              <Building2 className="mx-auto text-slate-600 mb-2" size={32} />
              <p className="text-sm font-bold text-slate-400">Nenhum despachante selecionado</p>
              <p className="text-xs text-slate-500 mt-1">
                Utilize o campo de busca acima para carregar o extrato de faturas e saldos em aberto.
              </p>
            </div>
          )}

          {/* 3. TABELA DE LANÇAMENTOS E ORDENS DE SERVIÇO EM ABERTO */}
          {despSelecionado && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-slate-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Extrato de Movimentações Faturadas ({lancamentos.length})
                  </h3>
                </div>

                {lancamentos.length > 0 && (
                  <button
                    type="button"
                    onClick={selecionarTodos}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold bg-transparent border-0 cursor-pointer flex items-center gap-1"
                  >
                    {selecionadosIds.length === lancamentos.length ? (
                      <>
                        <CheckSquare size={14} /> Desmarcar Todos
                      </>
                    ) : (
                      <>
                        <Square size={14} /> Selecionar Todos
                      </>
                    )}
                  </button>
                )}
              </div>

              {carregandoLancamentos ? (
                <div className="p-10 text-center text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin" size={18} /> Carregando lançamentos...
                </div>
              ) : lancamentos.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/50 border border-slate-800 rounded-2xl text-slate-500 text-xs font-medium">
                  Nenhum lançamento faturado registrado no histórico recente deste despachante.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/70">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold text-[11px]">
                        <th className="p-3 w-10 text-center">Sel.</th>
                        <th className="p-3">Data / Hora</th>
                        <th className="p-3">Nº O.S.</th>
                        <th className="p-3">Descrição do Serviço</th>
                        <th className="p-3 text-right">Valor Original</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {lancamentos.map((l) => {
                        const selecionado = selecionadosIds.includes(l.id);
                        return (
                          <tr
                            key={l.id}
                            onClick={() => alternarSelecaoItem(l.id)}
                            className={`transition-colors cursor-pointer ${
                              selecionado ? 'bg-indigo-950/30 text-slate-100' : 'hover:bg-slate-900/60 text-slate-300'
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={selecionado}
                                onChange={() => {}} // controlado pelo onClick da tr
                                className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                              {new Date(l.data).toLocaleString('pt-BR')}
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-300">
                              {l.numero_os}
                            </td>
                            <td className="p-3 font-medium text-slate-200">
                              {l.descricao}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-slate-100 whitespace-nowrap">
                              {formatarBRL(l.valor)}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/50 text-amber-400 border border-amber-800/60 uppercase">
                                Em Aberto
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé da Tela Principal da Conta-Corrente */}
        <div className="p-4 bg-slate-850 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-400 flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-500" />
            <span>Auditoria contínua conectada com Supabase PostgreSQL</span>
          </div>

          <div className="flex items-center gap-3">
            {despSelecionado && saldoDevedorTotal > 0 && (
              <button
                type="button"
                onClick={abrirModalLiquidacao}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow cursor-pointer border-0 flex items-center gap-2"
              >
                <DollarSign size={15} />
                <span>Liquidar Selecionados ({formatarBRL(totalSelecionado)})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-700"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
       *  MODAL SECUNDÁRIO: CONFIRMAÇÃO DO MEIO DE LIQUIDAÇÃO
       * ========================================================================= */}
      {modalPagamentoAberto && despSelecionado && (
        <div className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-6 space-y-5 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Wallet className="text-emerald-400" size={20} />
                Quitação de Fatura B2B
              </h3>
              <button
                type="button"
                onClick={() => setModalPagamentoAberto(false)}
                className="p-1 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
              <div className="text-xs text-slate-400">Cliente Despachante:</div>
              <div className="text-sm font-bold text-white">{despSelecionado.nome_razao}</div>
              <div className="text-xs font-mono text-slate-400">{despSelecionado.documento}</div>
            </div>

            {/* Input do Valor a Baixar */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Valor da Liquidação (R$) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-500">
                  R$
                </span>
                <input
                  type="text"
                  value={valorCustomizado}
                  onChange={(e) => setValorCustomizado(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-lg font-black text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 mt-1 font-mono">
                <span>Saldo Atual: {formatarBRL(saldoDevedorTotal)}</span>
                <button
                  type="button"
                  onClick={() => setValorCustomizado(saldoDevedorTotal.toFixed(2))}
                  className="text-indigo-400 hover:text-indigo-300 underline font-semibold bg-transparent border-0 cursor-pointer"
                >
                  Usar Saldo Total
                </button>
              </div>
            </div>

            {/* Seletor de Meio de Pagamento */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                Meio de Liquidação do Despachante:
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setFormaLiquidacao('dinheiro')}
                  className={`p-3 rounded-xl border font-bold flex items-center gap-2 cursor-pointer transition-all ${
                    formaLiquidacao === 'dinheiro'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Banknote size={16} />
                  <span>Dinheiro (Espécie)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormaLiquidacao('pix')}
                  className={`p-3 rounded-xl border font-bold flex items-center gap-2 cursor-pointer transition-all ${
                    formaLiquidacao === 'pix'
                      ? 'bg-sky-600 text-white border-sky-500 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <QrCode size={16} />
                  <span>PIX Instantâneo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormaLiquidacao('cartao_debito')}
                  className={`p-3 rounded-xl border font-bold flex items-center gap-2 cursor-pointer transition-all ${
                    formaLiquidacao === 'cartao_debito'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <CreditCard size={16} />
                  <span>Cartão Débito</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormaLiquidacao('transferencia')}
                  className={`p-3 rounded-xl border font-bold flex items-center gap-2 cursor-pointer transition-all ${
                    formaLiquidacao === 'transferencia'
                      ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Building2 size={16} />
                  <span>Transferência/TED</span>
                </button>
              </div>

              {formaLiquidacao === 'dinheiro' && (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-[11px] text-emerald-300 flex items-start gap-2">
                  <Banknote size={15} className="shrink-0 mt-0.5 text-emerald-400" />
                  <span>
                    <strong>Entrada Física de Dinheiro:</strong> O valor será computado automaticamente na gaveta do caixa diário do operador.
                  </span>
                </div>
              )}
            </div>

            {erroLiquidacao && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-semibold flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-400" />
                <span>{erroLiquidacao}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalPagamentoAberto(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={liquidando}
                onClick={executarLiquidacao}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer border-0"
              >
                {liquidando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                <span>Confirmar Baixa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
       *  MODAL TERCIÁRIO: RECIBO DE QUITAÇÃO DA FATURA (COMPROVANTE)
       * ========================================================================= */}
      {comprovante && (
        <div className="fixed inset-0 z-[130] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl shadow-2xl p-6 space-y-4 my-auto">
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
              <CheckCircle2 className="mx-auto text-emerald-600" size={36} />
              <h3 className="text-base font-black text-slate-900 uppercase">
                Recibo de Quitação de Fatura B2B
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                Protocolo: {comprovante.protocolo}
              </p>
              <p className="text-[10px] text-slate-500">
                {new Date(comprovante.dataHora).toLocaleString('pt-BR')}
              </p>
            </div>

            <div className="text-xs space-y-1.5 py-2 border-b border-dashed border-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Despachante:</span>
                <span className="font-bold text-slate-800">{comprovante.despachante.nome_razao}</span>
              </div>
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-slate-500">CPF/CNPJ:</span>
                <span className="text-slate-700">{comprovante.despachante.documento}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Meio de Pagamento:</span>
                <span className="font-bold text-emerald-700 uppercase">{comprovante.meioPagamento}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Operador:</span>
                <span className="text-slate-700">{comprovante.operadorNome}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs">
              <div className="flex justify-between font-mono">
                <span className="text-slate-600">Saldo Anterior:</span>
                <span className="text-slate-700">{formatarBRL(comprovante.saldoAnterior)}</span>
              </div>
              <div className="flex justify-between font-mono text-sm font-bold text-emerald-700 border-t border-slate-200 pt-1">
                <span>Valor Quitado:</span>
                <span>{formatarBRL(comprovante.valorLiquidado)}</span>
              </div>
              <div className="flex justify-between font-mono text-xs font-black text-slate-900 border-t border-slate-200 pt-1">
                <span>Saldo Devedor Restante:</span>
                <span>{formatarBRL(comprovante.saldoRestante)}</span>
              </div>
            </div>

            <div className="pt-2 text-center text-[9px] font-mono text-slate-400">
              Autenticação: {comprovante.hashAutenticidade}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border-0"
              >
                <Printer size={15} />
                <span>Imprimir Recibo</span>
              </button>
              <button
                type="button"
                onClick={() => setComprovante(null)}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border-0"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
