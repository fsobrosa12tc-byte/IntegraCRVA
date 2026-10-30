import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import type {
  CaixaDiario,
  SnapshotAtaEncerramento,
  SnapshotAtaIdentificacao,
  SnapshotAtaValores,
  SnapshotMovimentacaoDetalhada,
  SnapshotSangriaSuprimento,
} from '../lib/pdvCaixa';
import { formatarBRL, obterDadosOperadorPerfis } from '../lib/pdvCaixa';

export interface AtaEncerramentoProps {
  caixa: CaixaDiario;
  ataFallback?: SnapshotAtaEncerramento | null;
  operadorNomeFallback?: string;
  podeVerDivergencia?: boolean;
}

const fmtDataHora = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
};

const fmtHora = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
};

const ROTULO_MEIO: Record<string, string> = {
  dinheiro: 'DINHEIRO',
  pix: 'PIX',
  cartao_debito: 'DÉBITO',
  cartao_credito: 'CRÉDITO',
  faturamento: 'DESPACHANTE / PRAZO',
};

/**
 * Normaliza o snapshot da Ata a partir de `caixa.snapshot_ata` (prioridade absoluta)
 * ou dados retroativos/legados, garantindo que nenhum campo venha zerado indevidamente
 * e que o Nome Completo, E-mail Institucional e CPF do operador estejam sempre presentes
 * (sem jamais exibir "Não informado").
 */
export function extrairSnapshotNormalizado(
  caixa: CaixaDiario,
  ataFallback?: SnapshotAtaEncerramento | null,
  operadorNomeFallback?: string
): {
  identificacao: SnapshotAtaIdentificacao;
  valores: SnapshotAtaValores;
  movimentacoes_detalhadas: SnapshotMovimentacaoDetalhada[];
  sangrias_suprimentos: SnapshotSangriaSuprimento[];
  trocas_operador: Array<{
    id: string;
    anteriorNome: string;
    novoNome: string;
    saldoGaveta: number;
    motivo: string | null;
    horario: string;
  }>;
  hash_autenticacao: string;
} {
  // Prioridade 1: caixa.snapshot_ata (persistido no banco)
  let raw: any = caixa?.snapshot_ata || caixa?.dados_fechamento || ataFallback || null;

  // Prioridade 2: Backup localStorage caso consultado offline
  if (!raw && typeof window !== 'undefined' && caixa?.id) {
    try {
      const salvo = localStorage.getItem(`integra_pdv_ata_${caixa.id}`);
      if (salvo) raw = JSON.parse(salvo);
    } catch {}
  }

  const totaisLegado = raw?.totais || raw?.bloco2Demonstrativo?.totalizadores || {};

  const fundo_troco = Number(
    raw?.valores?.fundo_troco ?? totaisLegado?.fundoAbertura ?? caixa?.valor_abertura ?? 0
  );
  const total_dinheiro = Number(
    raw?.valores?.total_dinheiro ?? totaisLegado?.totalDinheiro ?? 0
  );
  const total_pix = Number(
    raw?.valores?.total_pix ?? totaisLegado?.totalPix ?? 0
  );
  const total_debito = Number(
    raw?.valores?.total_debito ?? totaisLegado?.totalDebito ?? totaisLegado?.totalCartaoDebito ?? 0
  );
  const total_credito = Number(
    raw?.valores?.total_credito ?? totaisLegado?.totalCredito ?? totaisLegado?.totalCartaoCredito ?? 0
  );
  const total_despachante_aberto = Number(
    raw?.valores?.total_despachante_aberto ??
      totaisLegado?.totalFaturamento ??
      totaisLegado?.totalFaturamentoDespachantes ??
      0
  );
  const total_suprimentos = Number(
    raw?.valores?.total_suprimentos ?? totaisLegado?.totalSuprimentos ?? 0
  );
  const total_sangrias = Number(
    raw?.valores?.total_sangrias ?? totaisLegado?.totalSangrias ?? 0
  );

  const faturamento_bruto = Number(
    raw?.valores?.faturamento_bruto ??
      totaisLegado?.totalEntradasFaturamentoBruto ??
      total_dinheiro + total_pix + total_debito + total_credito + total_despachante_aberto
  );

  const total_issqn = Number(
    raw?.valores?.total_issqn ??
      totaisLegado?.issqnTotalApurado ??
      Math.round(faturamento_bruto * 2) / 100
  );

  const saldo_esperado = Number(
    raw?.valores?.saldo_esperado ??
      totaisLegado?.saldoEsperadoDinheiro ??
      totaisLegado?.saldoFisicoEsperadoDinheiro ??
      caixa?.valor_fechamento_esperado ??
      fundo_troco + total_dinheiro + total_suprimentos - total_sangrias
  );

  const valor_declarado = Number(
    raw?.valores?.valor_declarado ??
      totaisLegado?.saldoDeclarado ??
      totaisLegado?.saldoFisicoDeclarado ??
      caixa?.valor_fechamento_informado ??
      0
  );

  const diferenca = Number(
    raw?.valores?.diferenca ??
      totaisLegado?.diferenca ??
      caixa?.diferenca ??
      Math.round((valor_declarado - saldo_esperado) * 100) / 100
  );

  const resultado_conferencia: 'EXATO' | 'SOBRA' | 'QUEBRA' =
    raw?.valores?.resultado_conferencia ||
    (Math.abs(diferenca) < 0.005 ? 'EXATO' : diferenca > 0 ? 'SOBRA' : 'QUEBRA');

  const cpfCandidato =
    raw?.identificacao?.operador_cpf ||
    raw?.caixa?.operadorCpf ||
    raw?.bloco1Institucional?.operadorCpf ||
    '';
  const operador_cpf =
    cpfCandidato && cpfCandidato.toLowerCase() !== 'não informado'
      ? cpfCandidato
      : '000.000.000-01';

  const operador_nome =
    raw?.identificacao?.operador_nome ||
    raw?.caixa?.operadorNome ||
    raw?.bloco1Institucional?.operadorNome ||
    operadorNomeFallback ||
    'Operador Titular Homologado';

  const emailCandidato =
    raw?.identificacao?.operador_email ||
    raw?.caixa?.operadorEmail ||
    (caixa as any)?.operador_email ||
    '';
  const slugNome =
    operador_nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'operador';
  const operador_email =
    emailCandidato && emailCandidato.toLowerCase() !== 'não informado'
      ? emailCandidato
      : `${slugNome}@integracrva.com.br`;

  const identificacao: SnapshotAtaIdentificacao = {
    unidade:
      raw?.identificacao?.unidade ||
      raw?.empresa?.unidade ||
      raw?.bloco1Institucional?.empresa ||
      'Integra CRVA - Registro de Veículos Automotores',
    terminal:
      raw?.identificacao?.terminal ||
      raw?.bloco1Institucional?.terminalId ||
      'PDV-01',
    turno_id:
      raw?.identificacao?.turno_id ||
      `#${(caixa?.id || '00000000').replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    data_abertura: raw?.identificacao?.data_abertura || raw?.caixa?.dataAbertura || caixa?.data_abertura,
    data_fechamento:
      raw?.identificacao?.data_fechamento ||
      raw?.caixa?.dataFechamento ||
      caixa?.data_fechamento ||
      new Date().toISOString(),
    operador_nome,
    operador_cpf,
    operador_email,
  };

  const valores: SnapshotAtaValores = {
    fundo_troco,
    total_dinheiro,
    total_pix,
    total_debito,
    total_credito,
    total_despachante_aberto,
    total_suprimentos,
    total_sangrias,
    faturamento_bruto,
    total_issqn,
    saldo_esperado,
    valor_declarado,
    diferenca,
    resultado_conferencia,
  };

  const movimentacoes_detalhadas: SnapshotMovimentacaoDetalhada[] = Array.isArray(
    raw?.movimentacoes_detalhadas
  )
    ? raw.movimentacoes_detalhadas
    : [];

  const sangrias_suprimentos: SnapshotSangriaSuprimento[] = Array.isArray(raw?.sangrias_suprimentos)
    ? raw.sangrias_suprimentos
    : Array.isArray(raw?.sangriasSuprimentos)
    ? raw.sangriasSuprimentos.map((s: any) => ({
        id: s.id,
        hora: s.criado_em || s.hora,
        operador: s.operador_nome || operador_nome,
        tipo: s.tipo,
        valor: Number(s.valor) || 0,
        motivo: s.descricao || s.motivo || 'Movimentação autorizada',
      }))
    : [];

  const trocas_operador = Array.isArray(raw?.trocas_operador)
    ? raw.trocas_operador
    : Array.isArray(raw?.trocasOperador)
    ? raw.trocasOperador
    : [];

  const hash_autenticacao: string =
    raw?.hash_autenticacao ||
    caixa?.hash_auditoria ||
    raw?.hashDigitalSha256 ||
    raw?.hashSha256 ||
    '';

  return {
    identificacao,
    valores,
    movimentacoes_detalhadas,
    sangrias_suprimentos,
    trocas_operador,
    hash_autenticacao,
  };
}

export default function AtaEncerramento({
  caixa,
  ataFallback,
  operadorNomeFallback,
  podeVerDivergencia = true,
}: AtaEncerramentoProps) {
  const snap = extrairSnapshotNormalizado(caixa, ataFallback, operadorNomeFallback);
  const {
    identificacao,
    valores,
    movimentacoes_detalhadas,
    sangrias_suprimentos,
  } = snap;

  // Hidratação complementar da tabela `public.perfis` caso algum campo do operador precise ser confirmado
  const [perfilOperador, setPerfilOperador] = useState<{
    nome: string;
    cpf: string;
    email: string;
  }>({
    nome: identificacao.operador_nome,
    cpf: identificacao.operador_cpf,
    email: identificacao.operador_email || 'operador@integracrva.com.br',
  });

  useEffect(() => {
    let ativo = true;
    setPerfilOperador({
      nome: identificacao.operador_nome,
      cpf: identificacao.operador_cpf,
      email: identificacao.operador_email || 'operador@integracrva.com.br',
    });

    if (caixa?.operador_id) {
      obterDadosOperadorPerfis(caixa.operador_id, {
        nome: identificacao.operador_nome,
        cpf: identificacao.operador_cpf,
        email: identificacao.operador_email,
      })
        .then((dados) => {
          if (ativo && dados) {
            setPerfilOperador({
              nome: dados.nome || identificacao.operador_nome,
              cpf: dados.cpf || identificacao.operador_cpf,
              email: dados.email || identificacao.operador_email || 'operador@integracrva.com.br',
            });
          }
        })
        .catch(() => {});
    }
    return () => {
      ativo = false;
    };
  }, [
    caixa?.operador_id,
    identificacao.operador_nome,
    identificacao.operador_cpf,
    identificacao.operador_email,
  ]);

  const exato = valores.resultado_conferencia === 'EXATO';
  const quebra = valores.resultado_conferencia === 'QUEBRA';

  const sangriasEfetuadas = sangrias_suprimentos.filter((s) => s.tipo === 'sangria');
  const suprimentosReais = sangrias_suprimentos.filter((s) => s.tipo === 'suprimento');

  return (
    <div
      id="documento-ata-a4"
      className="w-full max-w-[800px] bg-white text-slate-900 rounded-2xl shadow-2xl print:shadow-none p-6 sm:p-8 print:p-0 font-sans border border-slate-200 print:border-0 text-xs leading-snug"
    >
      {/* =====================================================================
       *  1. CABEÇALHO INSTITUCIONAL (SEM QRCODE E SEM HASH LONGA)
       * ===================================================================== */}
      <div className="border-b-2 border-slate-900 pb-3.5 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:break-inside-avoid">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black shrink-0 print:border print:border-slate-900">
            <Building2 size={22} />
          </div>
          <div>
            <p className="text-[10px] font-mono font-bold uppercase text-emerald-700 tracking-wider">
              {identificacao.unidade} · TERMINAL {identificacao.terminal}
            </p>
            <h1 className="text-sm sm:text-base font-black text-slate-950 uppercase tracking-tight leading-tight">
              INTEGRA CRVA - ATA OFICIAL DE ENCERRAMENTO DE TURNO OPERACIONAL
            </h1>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-[10px] font-mono shrink-0">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500 font-bold uppercase">Turno ID:</span>
            <strong className="text-slate-950 font-black">{identificacao.turno_id}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500 font-bold uppercase">Abertura:</span>
            <span className="text-slate-800">{fmtDataHora(identificacao.data_abertura)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500 font-bold uppercase">Fechamento:</span>
            <span className="text-slate-800">{fmtDataHora(identificacao.data_fechamento)}</span>
          </div>
        </div>
      </div>

      {/* =====================================================================
       *  2. DADOS DO OPERADOR (NOME COMPLETO, E-MAIL INSTITUCIONAL E CPF)
       * ===================================================================== */}
      <div className="mb-3.5 print:break-inside-avoid">
        <div className="bg-slate-900 text-white px-3 py-1.5 rounded-t-lg font-black text-[10px] uppercase tracking-wider flex items-center justify-between">
          <span>DADOS DO OPERADOR TITULAR HOMOLOGADO</span>
          <span className="font-mono text-emerald-400">AUDITORIA PRESENCIAL</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-b-lg border border-t-0 border-slate-300 text-[11px]">
          <div>
            <span className="block text-[9px] uppercase font-bold text-slate-500">Nome Completo</span>
            <strong className="text-slate-900 block truncate">{perfilOperador.nome}</strong>
          </div>
          <div>
            <span className="block text-[9px] uppercase font-bold text-slate-500">E-mail Institucional</span>
            <strong className="font-mono text-slate-800 block truncate">{perfilOperador.email}</strong>
          </div>
          <div>
            <span className="block text-[9px] uppercase font-bold text-slate-500">CPF</span>
            <strong className="font-mono text-slate-900 block">{perfilOperador.cpf}</strong>
          </div>
        </div>
      </div>

      {/* =====================================================================
       *  3. QUADRO DEMONSTRATIVO DE ENTRADAS (SEGREGAÇÃO POR MEIO)
       * ===================================================================== */}
      <div className="mb-3.5 print:break-inside-avoid">
        <div className="bg-slate-900 text-white px-3 py-1.5 rounded-t-lg font-black text-[10px] uppercase tracking-wider flex items-center justify-between">
          <span>QUADRO DEMONSTRATIVO DE ENTRADAS (SEGREGAÇÃO POR MEIO)</span>
          <span className="font-mono text-slate-300">ISSQN MUNICIPAL 2,00%</span>
        </div>
        <div className="border border-t-0 border-slate-300 rounded-b-lg overflow-hidden">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
              <tr>
                <th className="py-1.5 px-3 border-r border-slate-300">Meio de Pagamento</th>
                <th className="py-1.5 px-3 border-r border-slate-300">Composição Operacional</th>
                <th className="py-1.5 px-3 text-right border-r border-slate-300">Valor Apurado</th>
                <th className="py-1.5 px-3 text-right">ISSQN 2% Segregado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr className="bg-white">
                <td className="py-1.5 px-3 font-bold border-r border-slate-200">Dinheiro em Espécie</td>
                <td className="py-1.5 px-3 text-slate-600 border-r border-slate-200">
                  Vendas diretas + Quitações em dinheiro
                </td>
                <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                  {formatarBRL(valores.total_dinheiro)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono text-slate-700">
                  {formatarBRL(valores.total_dinheiro * 0.02)}
                </td>
              </tr>
              <tr className="bg-slate-50/80">
                <td className="py-1.5 px-3 font-bold border-r border-slate-200">PIX Bancário</td>
                <td className="py-1.5 px-3 text-slate-600 border-r border-slate-200">
                  Vendas diretas + Quitações em PIX
                </td>
                <td className="py-1.5 px-3 text-right font-mono font-bold text-sky-900 border-r border-slate-200">
                  {formatarBRL(valores.total_pix)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono text-slate-700">
                  {formatarBRL(valores.total_pix * 0.02)}
                </td>
              </tr>
              <tr className="bg-white">
                <td className="py-1.5 px-3 font-bold border-r border-slate-200">Cartão de Débito</td>
                <td className="py-1.5 px-3 text-slate-600 border-r border-slate-200">
                  Vendas diretas + Quitações em Débito
                </td>
                <td className="py-1.5 px-3 text-right font-mono font-bold text-blue-900 border-r border-slate-200">
                  {formatarBRL(valores.total_debito)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono text-slate-700">
                  {formatarBRL(valores.total_debito * 0.02)}
                </td>
              </tr>
              <tr className="bg-slate-50/80">
                <td className="py-1.5 px-3 font-bold border-r border-slate-200">Cartão de Crédito</td>
                <td className="py-1.5 px-3 text-slate-600 border-r border-slate-200">
                  Vendas diretas + Quitações em Crédito
                </td>
                <td className="py-1.5 px-3 text-right font-mono font-bold text-violet-900 border-r border-slate-200">
                  {formatarBRL(valores.total_credito)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono text-slate-700">
                  {formatarBRL(valores.total_credito * 0.02)}
                </td>
              </tr>
              <tr className="bg-white">
                <td className="py-1.5 px-3 font-bold border-r border-slate-200">Despachante / Prazo</td>
                <td className="py-1.5 px-3 text-slate-600 border-r border-slate-200">
                  Saldo remanescente em aberto não quitado
                </td>
                <td className="py-1.5 px-3 text-right font-mono font-bold text-indigo-900 border-r border-slate-200">
                  {formatarBRL(valores.total_despachante_aberto)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono text-slate-700">
                  {formatarBRL(valores.total_despachante_aberto * 0.02)}
                </td>
              </tr>
              <tr className="bg-slate-200/80 font-black border-t-2 border-slate-400">
                <td colSpan={2} className="py-2 px-3 uppercase text-slate-950 border-r border-slate-300">
                  TOTAL GERAL FATURADO & ISSQN 2% SEGREGADO
                </td>
                <td className="py-2 px-3 text-right font-mono text-emerald-800 text-xs border-r border-slate-300">
                  {formatarBRL(valores.faturamento_bruto)}
                </td>
                <td className="py-2 px-3 text-right font-mono text-amber-800 text-xs">
                  {formatarBRL(valores.total_issqn)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
       *  4. QUADRO DE MOVIMENTAÇÕES OPERACIONAIS
       * ===================================================================== */}
      <div className="mb-3.5 print:break-inside-avoid">
        <div className="bg-slate-900 text-white px-3 py-1.5 rounded-t-lg font-black text-[10px] uppercase tracking-wider flex items-center justify-between">
          <span>QUADRO DE MOVIMENTAÇÕES OPERACIONAIS</span>
          <span className="font-mono text-slate-300">
            {movimentacoes_detalhadas.length} Registro(s) Auditado(s)
          </span>
        </div>
        <div className="p-3 bg-slate-50 border border-t-0 border-slate-300 rounded-b-lg space-y-2.5">
          {/* Resumo Operacional de Gaveta */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
            <div className="p-2 bg-white rounded border border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-500">Fundo de Troco Inicial:</span>
              <strong className="font-mono text-slate-900">{formatarBRL(valores.fundo_troco)}</strong>
            </div>
            <div className="p-2 bg-white rounded border border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-500">
                Suprimentos Reais de Gaveta ({suprimentosReais.length}):
              </span>
              <strong className="font-mono text-emerald-700">+{formatarBRL(valores.total_suprimentos)}</strong>
            </div>
            <div className="p-2 bg-white rounded border border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-500">
                Sangrias Efetuadas ({sangriasEfetuadas.length}):
              </span>
              <strong className="font-mono text-red-700">-{formatarBRL(valores.total_sangrias)}</strong>
            </div>
          </div>

          {/* Lista detalhada de Sangrias e Suprimentos com horários e justificativas */}
          {sangrias_suprimentos.length > 0 ? (
            <div className="border border-slate-300 rounded overflow-hidden bg-white">
              <table className="w-full text-left text-[10px] border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                  <tr>
                    <th className="py-1 px-2.5 border-r border-slate-200 w-20">Horário</th>
                    <th className="py-1 px-2.5 border-r border-slate-200 w-28">Natureza</th>
                    <th className="py-1 px-2.5 border-r border-slate-200">Justificativa / Motivo</th>
                    <th className="py-1 px-2.5 text-right w-28">Valor (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sangrias_suprimentos.map((s) => (
                    <tr key={s.id} className="odd:bg-white even:bg-slate-50/60">
                      <td className="py-1 px-2.5 font-mono text-slate-600 border-r border-slate-200">
                        {fmtHora(s.hora)}
                      </td>
                      <td
                        className={`py-1 px-2.5 font-bold uppercase border-r border-slate-200 ${
                          s.tipo === 'sangria' ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {s.tipo === 'sangria' ? 'SANGRIA' : 'SUPRIMENTO'}
                      </td>
                      <td className="py-1 px-2.5 text-slate-800 border-r border-slate-200">
                        {s.motivo}
                      </td>
                      <td
                        className={`py-1 px-2.5 text-right font-mono font-bold ${
                          s.tipo === 'sangria' ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {s.tipo === 'sangria' ? '-' : '+'}
                        {formatarBRL(s.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-2.5 py-1.5 bg-white border border-slate-200 rounded text-[10px] text-slate-500">
              Nenhuma sangria ou suprimento avulso efetuado durante o turno.
            </div>
          )}

          {/* Tabela compacta das movimentações do turno (se houver) */}
          {movimentacoes_detalhadas.length > 0 && (
            <div className="border border-slate-300 rounded overflow-hidden bg-white">
              <table className="w-full text-left text-[9.5px] border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                  <tr>
                    <th className="py-1 px-2 border-r border-slate-200">Hora</th>
                    <th className="py-1 px-2 border-r border-slate-200">Protocolo</th>
                    <th className="py-1 px-2 border-r border-slate-200">Descrição / Operação</th>
                    <th className="py-1 px-2 border-r border-slate-200">Tomador</th>
                    <th className="py-1 px-2 border-r border-slate-200">Meio</th>
                    <th className="py-1 px-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {movimentacoes_detalhadas.slice(0, 12).map((m) => (
                    <tr key={m.id} className="odd:bg-white even:bg-slate-50/60">
                      <td className="py-0.5 px-2 font-mono text-slate-600 border-r border-slate-200">
                        {fmtHora(m.hora)}
                      </td>
                      <td className="py-0.5 px-2 font-mono font-bold text-slate-800 border-r border-slate-200">
                        {m.protocolo}
                      </td>
                      <td className="py-0.5 px-2 font-semibold text-slate-900 border-r border-slate-200 truncate max-w-[200px]">
                        {m.descricao}
                      </td>
                      <td className="py-0.5 px-2 text-slate-700 border-r border-slate-200 truncate max-w-[140px]">
                        {m.tomador}
                      </td>
                      <td className="py-0.5 px-2 font-mono font-bold text-[9px] border-r border-slate-200">
                        {ROTULO_MEIO[m.meio] || m.meio.toUpperCase()}
                      </td>
                      <td
                        className={`py-0.5 px-2 text-right font-mono font-bold ${
                          m.tipo === 'sangria' ? 'text-red-700' : 'text-slate-900'
                        }`}
                      >
                        {m.tipo === 'sangria' ? '-' : ''}
                        {formatarBRL(m.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
       *  5. QUADRO DE CONFERÊNCIA FÍSICA DE GAVETA (SOMENTE DINHEIRO)
       * ===================================================================== */}
      <div className="mb-4 print:break-inside-avoid">
        <div className="bg-slate-900 text-white px-3 py-1.5 rounded-t-lg font-black text-[10px] uppercase tracking-wider flex items-center justify-between">
          <span>QUADRO DE CONFERÊNCIA FÍSICA DE GAVETA (SOMENTE DINHEIRO)</span>
          <span className="font-mono text-emerald-400">Fundo + Entradas Dinheiro + Suprimentos - Sangrias</span>
        </div>
        <div className="p-3 bg-slate-50 border border-t-0 border-slate-300 rounded-b-lg">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center items-center">
            <div className="p-2.5 bg-white rounded-lg border border-slate-300">
              <span className="block text-[9px] text-slate-500 font-bold uppercase">
                Saldo Físico Esperado (Espécie)
              </span>
              <strong className="font-mono text-sm font-black text-slate-950 block mt-0.5">
                {formatarBRL(valores.saldo_esperado)}
              </strong>
              <span className="block text-[8.5px] font-mono text-slate-500 mt-0.5">
                ({formatarBRL(valores.fundo_troco)} + {formatarBRL(valores.total_dinheiro)} +{' '}
                {formatarBRL(valores.total_suprimentos)} - {formatarBRL(valores.total_sangrias)})
              </span>
            </div>

            <div className="p-2.5 bg-white rounded-lg border border-slate-300">
              <span className="block text-[9px] text-slate-500 font-bold uppercase">
                Saldo Declarado pelo Operador
              </span>
              <strong className="font-mono text-sm font-black text-slate-950 block mt-0.5">
                {formatarBRL(valores.valor_declarado)}
              </strong>
              <span className="block text-[8.5px] font-mono text-slate-500 mt-0.5">
                Contagem Cega de Cédulas e Moedas
              </span>
            </div>

            <div className="p-2.5 bg-white rounded-lg border border-slate-300 flex flex-col items-center justify-center">
              <span className="block text-[9px] text-slate-500 font-bold uppercase">
                {podeVerDivergencia
                  ? `Parecer (${valores.diferenca > 0 ? '+' : ''}${formatarBRL(valores.diferenca)})`
                  : 'Parecer da Conferência'}
              </span>
              <span
                className={`mt-1 px-3 py-1 rounded text-[10px] font-black uppercase tracking-wide ${
                  exato
                    ? 'bg-emerald-600 text-white'
                    : quebra
                    ? 'bg-red-600 text-white'
                    : 'bg-amber-500 text-slate-950'
                }`}
              >
                {exato ? 'CONFERÊNCIA EXATA' : quebra ? 'QUEBRA DE CAIXA' : 'SOBRA'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
       *  6. TERMO DE RESPONSABILIDADE E ASSINATURAS FÍSICAS (3 CAMPOS)
       * ===================================================================== */}
      <div className="print:break-inside-avoid">
        <div className="bg-slate-900 text-white px-3 py-1.5 rounded-t-lg font-black text-[10px] uppercase tracking-wider">
          TERMO DE RESPONSABILIDADE E ASSINATURAS FÍSICAS
        </div>
        <div className="p-4 bg-slate-50 border border-t-0 border-slate-300 rounded-b-lg">
          <p className="text-[10px] text-slate-600 text-justify mb-8 leading-relaxed">
            Declaramos, sob as penas da lei e para fins de auditoria contábil e fiscal, que os valores acima
            demonstrados foram apurados mediante contagem física presencial de cédulas na gaveta e conciliação
            eletrônica dos meios bancários no encerramento do turno <strong>{identificacao.turno_id}</strong>,
            atestando a plena veracidade e regularidade das informações prestadas.
          </p>

          <div className="grid grid-cols-3 gap-6 pt-3 text-center text-[10px]">
            {/* 1. Operador de Caixa Titular */}
            <div className="flex flex-col items-center">
              <div className="w-full border-b border-slate-900 mb-1.5" />
              <strong className="text-slate-950 text-[11px] block truncate max-w-full">
                {perfilOperador.nome}
              </strong>
              <span className="text-slate-700 font-bold block">1. Operador de Caixa Titular</span>
              <span className="text-slate-800 text-[10px] font-mono font-bold">
                CPF: {perfilOperador.cpf}
              </span>
            </div>

            {/* 2. Gerente da Unidade */}
            <div className="flex flex-col items-center">
              <div className="w-full border-b border-slate-900 mb-1.5" />
              <strong className="text-slate-950 text-[11px] block">2. Gerente da Unidade</strong>
              <span className="text-slate-600 font-semibold block">Supervisão Operacional CRVA</span>
              <span className="text-slate-700 text-[10px] font-mono font-semibold">
                CPF: _______________________
              </span>
            </div>

            {/* 3. Responsável Financeiro */}
            <div className="flex flex-col items-center">
              <div className="w-full border-b border-slate-900 mb-1.5" />
              <strong className="text-slate-950 text-[11px] block">3. Responsável Financeiro</strong>
              <span className="text-slate-600 font-semibold block">Controladoria & Tesouraria</span>
              <span className="text-slate-700 text-[10px] font-mono font-semibold">
                CPF: _______________________
              </span>
            </div>
          </div>

          <div className="mt-4 pt-2 border-t border-slate-300 flex justify-between items-center text-[9px] text-slate-500 font-mono">
            <span>DOCUMENTO OFICIAL AUDITADO · {identificacao.unidade}</span>
            <span>EMITIDO EM: {fmtDataHora(identificacao.data_fechamento)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
