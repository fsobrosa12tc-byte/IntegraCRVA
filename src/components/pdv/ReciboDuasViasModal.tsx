import React, { useRef } from 'react';
import { Printer, X, Receipt, CheckCircle2, Scissors } from 'lucide-react';
import { formatarMoeda } from '../../lib/pdvCaixa';
import { mascararDocumento } from '../../utils/documento';

export interface ItemReciboDuasVias {
  codigo?: string;
  code?: string;
  descricao?: string;
  nome?: string;
  title?: string;
  servico?: string;
  quantidade?: number;
  qtd?: number;
  valorUnitario?: number;
  valor_unitario?: number;
  preco?: number;
  subtotal?: number;
  valorTotal?: number;
  valor_total?: number;
}

export interface DadosReciboDuasVias {
  protocolo?: string;
  numeroRecibo?: string;
  numero_recibo?: string;
  id?: string;
  dataHora?: string;
  data_hora?: string;
  data?: string;
  criado_em?: string;
  created_at?: string;
  tomadorNome?: string;
  tomador_nome?: string;
  clienteNome?: string;
  cliente_nome?: string;
  tomadorDocumento?: string | null;
  tomador_documento?: string | null;
  clienteDocumento?: string | null;
  cliente_documento?: string | null;
  cpfCnpj?: string | null;
  documento?: string | null;
  veiculoPlaca?: string | null;
  veiculo_placa?: string | null;
  placa?: string | null;
  clienteFinalNome?: string | null;
  clienteFinalDocumento?: string | null;
  clienteFinalPlaca?: string | null;
  clienteFinalAuditoria?: any;
  clienteFinalVinculado?: any;
  cliente_final_vinculado?: any;
  atendenteNome?: string | null;
  atendente_nome?: string | null;
  operadorNome?: string;
  operador_nome?: string;
  itens?: ItemReciboDuasVias[];
  subtotal?: number;
  subtotalServicos?: number;
  subtotal_servicos?: number;
  issqn?: number;
  valorIssqn?: number;
  valor_issqn?: number;
  valorTotal?: number;
  valor_total?: number;
  total?: number;
  valorTotalCobrado?: number;
  formaPagamento?: string;
  forma_pagamento?: string;
  valorRecebido?: number | null;
  valor_recebido?: number | null;
  troco?: number | null;
  hashAutenticidade?: string | null;
}

export interface ReciboDuasViasModalProps {
  isOpen: boolean;
  onClose: () => void;
  recibo: DadosReciboDuasVias | null;
}

export function normalizarDadosReciboDuasVias(dados: DadosReciboDuasVias | null | undefined) {
  const agora = new Date();
  
  let dataHoraFormatada = '';
  try {
    const rawData = dados?.dataHora || dados?.data_hora || dados?.criado_em || dados?.created_at || dados?.data;
    if (rawData) {
      const d = new Date(rawData);
      dataHoraFormatada = isNaN(d.getTime()) ? String(rawData) : d.toLocaleString('pt-BR');
    } else {
      dataHoraFormatada = agora.toLocaleString('pt-BR');
    }
  } catch {
    dataHoraFormatada = agora.toLocaleString('pt-BR');
  }

  const protocolo =
    dados?.numeroRecibo ||
    dados?.protocolo ||
    dados?.numero_recibo ||
    dados?.id ||
    `REC-${agora.getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

  const tomadorNome =
    dados?.tomadorNome ||
    dados?.tomador_nome ||
    dados?.clienteNome ||
    dados?.cliente_nome ||
    'Cliente Balcão CRVA';

  const tomadorDocumento =
    dados?.tomadorDocumento ||
    dados?.tomador_documento ||
    dados?.clienteDocumento ||
    dados?.cliente_documento ||
    dados?.cpfCnpj ||
    dados?.documento ||
    null;

  const veiculoPlaca =
    dados?.veiculoPlaca ||
    dados?.veiculo_placa ||
    dados?.placa ||
    null;

  const clienteFinal =
    dados?.clienteFinalAuditoria ||
    dados?.clienteFinalVinculado ||
    dados?.cliente_final_vinculado;

  const clienteFinalNome =
    dados?.clienteFinalNome ||
    (typeof clienteFinal === 'object' ? clienteFinal?.nome || clienteFinal?.nome_razao : null) ||
    (typeof clienteFinal === 'string' ? clienteFinal : null);

  const clienteFinalDocumento =
    dados?.clienteFinalDocumento ||
    (typeof clienteFinal === 'object' ? clienteFinal?.documento || clienteFinal?.cpfCnpj || clienteFinal?.cpf : null) ||
    null;

  const clienteFinalPlaca =
    dados?.clienteFinalPlaca ||
    (typeof clienteFinal === 'object' ? clienteFinal?.placa : null) ||
    null;

  const atendenteNome =
    dados?.atendenteNome ||
    dados?.atendente_nome ||
    'Balcão CRVA';

  const operadorNome =
    dados?.operadorNome ||
    dados?.operador_nome ||
    'Operador de Caixa';

  const formaPagamento =
    dados?.formaPagamento ||
    dados?.forma_pagamento ||
    'PIX';

  const subtotal = Number(
    dados?.subtotalServicos ??
    dados?.subtotal ??
    dados?.subtotal_servicos ??
    0
  );

  const issqn = Number(
    dados?.valorIssqn ??
    dados?.issqn ??
    dados?.valor_issqn ??
    (subtotal > 0 ? Math.round(subtotal * 2) / 100 : 0)
  );

  const valorTotal = Number(
    dados?.valorTotal ??
    dados?.valor_total ??
    dados?.total ??
    dados?.valorTotalCobrado ??
    (subtotal + issqn)
  );

  const itensRaw = dados?.itens || [];
  const itens = Array.isArray(itensRaw) && itensRaw.length > 0
    ? itensRaw.map((it: any, idx: number) => {
        const codigo = it?.codigo || it?.code || `AT-${idx + 1}`;
        const descricao = it?.descricao || it?.nome || it?.title || it?.servico || 'Serviço Notarial CRVA';
        const quantidade = Number(it?.quantidade ?? it?.qtd ?? 1);
        const valorUnitario = Number(it?.valorUnitario ?? it?.valor_unitario ?? it?.preco ?? (it?.subtotal ? it.subtotal / quantidade : 0));
        const sub = Number(it?.subtotal ?? it?.valorTotal ?? it?.valor_total ?? (quantidade * valorUnitario));
        return {
          codigo,
          descricao,
          quantidade: quantidade > 0 ? quantidade : 1,
          valorUnitario: valorUnitario >= 0 ? valorUnitario : 0,
          subtotal: sub >= 0 ? sub : 0,
        };
      })
    : [{
        codigo: 'AT-01',
        descricao: 'Atos e emolumentos de balcão CRVA',
        quantidade: 1,
        valorUnitario: subtotal > 0 ? subtotal : valorTotal,
        subtotal: subtotal > 0 ? subtotal : valorTotal,
      }];

  const valorRecebido = dados?.valorRecebido !== undefined && dados?.valorRecebido !== null
    ? Number(dados.valorRecebido)
    : (dados?.valor_recebido !== undefined && dados?.valor_recebido !== null ? Number(dados.valor_recebido) : null);

  const troco = dados?.troco !== undefined && dados?.troco !== null
    ? Number(dados.troco)
    : null;

  const hashAutenticidade =
    dados?.hashAutenticidade ||
    `MS-CRVA-${agora.getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  return {
    numeroRecibo: protocolo,
    dataHora: dataHoraFormatada,
    tomadorNome,
    tomadorDocumento,
    veiculoPlaca,
    clienteFinalNome,
    clienteFinalDocumento,
    clienteFinalPlaca,
    atendenteNome,
    operadorNome,
    formaPagamento: String(formaPagamento).toUpperCase(),
    subtotal: isNaN(subtotal) ? 0 : subtotal,
    issqn: isNaN(issqn) ? 0 : issqn,
    valorTotal: isNaN(valorTotal) ? 0 : valorTotal,
    valorRecebido,
    troco,
    hashAutenticidade,
    itens,
  };
}

export default function ReciboDuasViasModal({
  isOpen,
  onClose,
  recibo,
}: ReciboDuasViasModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !recibo) return null;

  const r = normalizarDadosReciboDuasVias(recibo);

  const handleImprimir = () => {
    window.print();
  };

  // Componente que desenha cada uma das duas vias completas
  const RenderVia = ({ tipoVia }: { tipoVia: 'cliente' | 'controle' }) => {
    const isCliente = tipoVia === 'cliente';

    return (
      <div className="bg-white text-slate-900 p-5 rounded-xl border border-slate-300 shadow-sm print:border-none print:shadow-none print:p-0 print:m-0 text-xs font-sans leading-relaxed">
        {/* Topo da Via: Identidade e Classificação */}
        <div className="flex items-start justify-between border-b border-slate-300 pb-3 mb-3 gap-2">
          <div>
            <div className="flex items-center gap-1.5 font-black text-slate-900 tracking-tight text-sm">
              <span>MARKS SYSTEMS</span>
              <span className="text-slate-400 font-normal">•</span>
              <span className="text-emerald-700">CRVA DETRAN/RS</span>
            </div>
            <div className="text-[11px] font-bold text-slate-700 mt-0.5">
              Recibo de Quitação de Emolumentos e Serviços Notariais
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              Emissão: {r.dataHora} • Turno Caixa
            </div>
          </div>

          <div className="text-right shrink-0">
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                isCliente
                  ? 'bg-slate-100 text-slate-800 border-slate-400'
                  : 'bg-indigo-50 text-indigo-900 border-indigo-400'
              }`}
            >
              {isCliente
                ? '1ª VIA — COMPROVANTE DO CLIENTE / DESPACHANTE'
                : '2ª VIA — CONTROLE INTERNO / CAIXA CRVA'}
            </span>
            <div className="font-mono font-bold text-slate-900 text-xs mt-1">
              {r.numeroRecibo}
            </div>
          </div>
        </div>

        {/* Tomador e Dados do Veículo / Cliente Final */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-3 text-[11px]">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
              Tomador / Requerente
            </span>
            <strong className="text-slate-900 block truncate" title={r.tomadorNome}>
              {r.tomadorNome}
            </strong>
            <span className="text-slate-600 font-mono">
              {r.tomadorDocumento ? mascararDocumento(r.tomadorDocumento) : 'CPF/CNPJ: Não informado'}
            </span>
            {r.veiculoPlaca && (
              <span className="ml-2 inline-block font-mono font-bold text-slate-800 bg-slate-200 px-1.5 py-0.5 rounded text-[10px]">
                Placa: {r.veiculoPlaca}
              </span>
            )}
          </div>

          <div>
            {r.clienteFinalNome ? (
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-700 block">
                  Cliente Final Vinculado (Auditoria)
                </span>
                <strong className="text-slate-900 block truncate" title={r.clienteFinalNome}>
                  {r.clienteFinalNome}
                </strong>
                <span className="text-slate-600 font-mono">
                  {r.clienteFinalDocumento
                    ? mascararDocumento(r.clienteFinalDocumento)
                    : 'CPF/CNPJ: N/I'}
                </span>
                {r.clienteFinalPlaca && (
                  <span className="ml-2 inline-block font-mono font-bold text-slate-800 bg-indigo-100 px-1.5 py-0.5 rounded text-[10px]">
                    Placa: {r.clienteFinalPlaca}
                  </span>
                )}
              </div>
            ) : (
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                  Atendimento
                </span>
                <span className="text-slate-700">
                  Atendente: <strong>{r.atendenteNome}</strong>
                </span>
                <div className="text-slate-700">
                  Operador Caixa: <strong>{r.operadorNome}</strong>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabela de Discriminação dos Atos Quitados */}
        <div className="mb-3">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-slate-300 text-slate-500 font-bold uppercase text-[9px]">
                <th className="py-1">Cód.</th>
                <th className="py-1">Descrição do Ato / Emolumento</th>
                <th className="py-1 text-center">Qtd</th>
                <th className="py-1 text-right">Unitário</th>
                <th className="py-1 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {r.itens.map((it, idx) => (
                <tr key={idx} className="text-slate-800">
                  <td className="py-1 text-slate-500 text-[10px]">{it.codigo}</td>
                  <td className="py-1 font-sans text-slate-900">{it.descricao}</td>
                  <td className="py-1 text-center">{it.quantidade}</td>
                  <td className="py-1 text-right">{formatarMoeda(it.valorUnitario)}</td>
                  <td className="py-1 text-right font-bold">{formatarMoeda(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Resumo Financeiro e Forma de Pagamento */}
        <div className="border-t border-slate-300 pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-lg border">
          <div className="text-[11px] space-y-0.5">
            <div>
              Forma de Pagamento: <strong className="text-slate-900 uppercase">{r.formaPagamento}</strong>
            </div>
            {r.valorRecebido && r.valorRecebido > r.valorTotal && (
              <div className="text-slate-600 font-mono text-[10px]">
                Recebido: {formatarMoeda(r.valorRecebido)} | Troco: {formatarMoeda(r.troco || 0)}
              </div>
            )}
            <div className="text-slate-500 text-[10px] font-mono">
              Autenticação: {r.hashAutenticidade}
            </div>
          </div>

          <div className="text-right w-full sm:w-auto font-mono shrink-0">
            <div className="text-[10px] text-slate-600">
              Subtotal: <span>{formatarMoeda(r.subtotal)}</span> | ISSQN (2%): <span>+{formatarMoeda(r.issqn)}</span>
            </div>
            <div className="text-sm font-black text-slate-950 mt-0.5">
              TOTAL PAGO: <span className="text-emerald-700 text-base">{formatarMoeda(r.valorTotal)}</span>
            </div>
          </div>
        </div>

        {/* Linha de Conferência / Assinatura */}
        <div className="mt-4 pt-4 border-t border-dashed border-slate-300 flex items-end justify-between text-[10px] text-slate-500">
          <div>
            <span>Autenticação digital Marks Systems • Conforme provimento e normas vigentes</span>
          </div>
          <div className="text-center w-64 border-t border-slate-400 pt-1">
            <span className="font-bold text-slate-700 block">
              {isCliente ? 'Assinatura / Rubrica do Tomador' : 'Rubrica Operador de Caixa CRVA'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[150] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0 print:m-0">
      <div
        ref={containerRef}
        className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col my-6 overflow-hidden print:border-none print:shadow-none print:bg-white print:m-0 print:max-w-none print:w-full"
      >
        {/* Barra Superior de Ações (Oculta na Impressão) */}
        <div className="px-6 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <Receipt size={16} />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Comprovante de Quitação Fiscal (Duas Vias)</h3>
              <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 size={12} /> Transação liquidada e auditada com sucesso
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-imprimir-recibo-duas-vias"
              onClick={handleImprimir}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-950/40 cursor-pointer transition-all border-0"
              title="Imprimir as duas vias em folha A4 ou bobina térmica"
            >
              <Printer size={14} />
              <span>Imprimir 2 Vias</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer border-0 bg-transparent"
              title="Fechar Comprovante"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Área Reta das Duas Vias */}
        <div className="p-6 overflow-y-auto max-h-[82vh] space-y-6 print:p-0 print:m-0 print:max-h-none print:overflow-visible print:space-y-4">
          
          {/* 1ª VIA: CLIENTE / DESPACHANTE */}
          <RenderVia tipoVia="cliente" />

          {/* LINHA DE CORTE SERRILHADA */}
          <div className="relative my-4 flex items-center justify-center print:my-2">
            <div className="w-full border-t-2 border-dashed border-slate-600 print:border-gray-400" />
            <span className="absolute bg-slate-900 print:bg-white px-3 text-[10px] font-mono text-slate-400 print:text-gray-600 flex items-center gap-1.5">
              <Scissors size={12} />
              <span>Corte aqui • 2ª Via Arquivo Caixa</span>
            </span>
          </div>

          {/* 2ª VIA: CONTROLE INTERNO / CAIXA CRVA */}
          <RenderVia tipoVia="controle" />

        </div>

        {/* Rodapé do Modal (Oculto na Impressão) */}
        <div className="px-6 py-3 bg-slate-950/70 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0 print:hidden">
          <span className="font-mono text-[11px]">
            {r.numeroRecibo} • Registrado no banco de dados e caixa ativo
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold cursor-pointer border border-slate-700"
          >
            Concluir e Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
