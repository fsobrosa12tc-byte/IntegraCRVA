import React, { useEffect } from 'react';
import { Printer, X, Receipt } from 'lucide-react';
import {
  PDV_PRINT_PROFILES,
  imprimirComprovanteIsolado,
  usePdvPrintFormat,
  type DadosCupomImpressao,
} from '../../lib/pdvPrint';
import ComprovantePreviewBody from './ComprovantePreviewBody';

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
  const [printFormat] = usePdvPrintFormat();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !recibo) return null;

  const r = normalizarDadosReciboDuasVias(recibo);
  const profile = PDV_PRINT_PROFILES[printFormat];

  const dadosImpressao: DadosCupomImpressao = {
    tituloDocumento: 'Comprovante de Quitação Fiscal',
    numeroRecibo: r.numeroRecibo,
    dataHora: r.dataHora,
    tomadorLabel: 'Tomador / Requerente',
    tomadorNome: r.tomadorNome,
    tomadorDocumento: r.tomadorDocumento,
    veiculoPlaca: r.veiculoPlaca,
    clienteFinalNome: r.clienteFinalNome,
    clienteFinalDocumento: r.clienteFinalDocumento,
    clienteFinalPlaca: r.clienteFinalPlaca,
    atendenteNome: r.atendenteNome,
    operadorNome: r.operadorNome,
    formaPagamento: r.formaPagamento,
    itens: r.itens,
    subtotal: r.subtotal,
    issqn: r.issqn,
    valorTotal: r.valorTotal,
    valorRecebido: r.valorRecebido,
    troco: r.troco,
    hashAutenticidade: r.hashAutenticidade,
    labelVia1: '1ª VIA — COMPROVANTE DO CLIENTE / DESPACHANTE',
    labelVia2: '2ª VIA — CONTROLE INTERNO / CAIXA CRVA',
    assinaturaVia1: 'Assinatura / Rubrica do Tomador',
    assinaturaVia2: 'Rubrica Operador de Caixa CRVA',
  };

  const handleImprimir = () => {
    imprimirComprovanteIsolado(dadosImpressao, printFormat);
  };

  return (
    <div className="fixed inset-0 z-[150] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Cabeçalho Compacto */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <Receipt size={17} />
            </div>
            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
              <h3 className="font-bold text-white text-sm sm:text-base tracking-tight truncate">
                Comprovante de Quitação Fiscal
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700/80 whitespace-nowrap">
                {profile.badgeText}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              id="btn-imprimir-recibo-duas-vias"
              onClick={handleImprimir}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg cursor-pointer transition-all border-0"
              title={`Imprimir no perfil ${profile.shortLabel}`}
            >
              <Printer size={14} />
              <span>Imprimir Cupom Fiscal</span>
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

        {/* Área de Pré-Visualização Centralizada */}
        <div className="bg-slate-950/70 p-6 flex justify-center overflow-y-auto max-h-[72vh]">
          <ComprovantePreviewBody dados={dadosImpressao} format={printFormat} />
        </div>

        {/* Rodapé Discreto */}
        <div className="px-6 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span className="font-mono text-[11px] truncate">
            {r.numeroRecibo} • Quitação auditada no terminal PDV
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer border border-slate-700 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
