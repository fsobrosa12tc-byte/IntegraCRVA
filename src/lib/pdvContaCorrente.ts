import { supabase } from './supabase';
import type { Despachante, FormaPagamento, MovimentacaoCaixa } from '../types/pdv';
import { deCentavos, paraCentavos, registrarMovimentacao } from './pdvCaixa';

export interface LancamentoFaturamento {
  id: string;
  data: string;
  descricao: string;
  numero_os: string;
  valor: number;
  despachante_id: string;
  caixa_id: string;
  liquidado?: boolean;
}

export interface ComprovanteLiquidacao {
  protocolo: string;
  dataHora: string;
  despachante: Despachante;
  valorLiquidado: number;
  meioPagamento: FormaPagamento | 'transferencia';
  saldoAnterior: number;
  saldoRestante: number;
  operadorNome: string;
  itensQuitadosCount: number;
  hashAutenticidade: string;
}

/**
 * Busca todas as movimentações faturadas a prazo vinculadas ao despachante.
 */
export async function buscarLancamentosDespachante(despachanteId: string): Promise<LancamentoFaturamento[]> {
  const { data, error } = await supabase
    .from('movimentacoes_caixa')
    .select('id, caixa_id, descricao, valor, forma_pagamento, despachante_id, criado_em')
    .eq('despachante_id', despachanteId)
    .eq('forma_pagamento', 'faturamento')
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('Erro ao buscar lançamentos do despachante:', error);
    throw new Error(error.message || 'Falha ao buscar movimentações do despachante.');
  }

  return ((data as any[]) || []).map((m) => {
    const partes = (m.descricao || '').split(' | ');
    const desc = partes[0] || 'Serviço Faturado';
    return {
      id: m.id,
      data: m.criado_em,
      descricao: desc,
      numero_os: m.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
      valor: Number(m.valor) || 0,
      despachante_id: m.despachante_id,
      caixa_id: m.caixa_id,
      liquidado: false
    };
  });
}

/**
 * Executa a liquidação/quitação parcial ou total de fatura do Despachante.
 */
export async function liquidarFaturaDespachante(params: {
  despachante: Despachante;
  valorPago: number;
  formaPagamento: 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'transferencia';
  caixaId: string | null;
  operadorNome: string;
  operadorId?: string | null;
  itensQuitadosCount?: number;
}): Promise<ComprovanteLiquidacao> {
  const { despachante, valorPago, formaPagamento, caixaId, operadorNome, operadorId = null, itensQuitadosCount = 1 } = params;

  if (valorPago <= 0) {
    throw new Error('O valor do pagamento deve ser superior a zero.');
  }

  const saldoAnterior = Number(despachante.saldo_devedor) || 0;
  const saldoAntCent = paraCentavos(saldoAnterior);
  const pagoCent = paraCentavos(valorPago);
  const novoSaldoCent = Math.max(0, saldoAntCent - pagoCent);
  const saldoRestante = deCentavos(novoSaldoCent);

  // 1. Atualizar atomicamente o saldo devedor do despachante
  const { error: errSaldo } = await supabase
    .from('despachantes')
    .update({ saldo_devedor: saldoRestante })
    .eq('id', despachante.id);

  if (errSaldo) {
    throw new Error(`Falha ao abater saldo do despachante: ${errSaldo.message}`);
  }

  // 2. Se for dinheiro, precisa obrigatoriamente estar vinculado ao caixa aberto para somar na gaveta física
  if (formaPagamento === 'dinheiro') {
    if (!caixaId) {
      throw new Error('Para liquidação em dinheiro, é necessário um caixa aberto na sessão atual.');
    }

    try {
      await registrarMovimentacao({
        caixa_id: caixaId,
        tipo: 'liquidacao_fatura',
        valor: valorPago,
        forma_pagamento: 'dinheiro',
        despachante_id: despachante.id,
        operador_id: operadorId,
        operador_nome: operadorNome,
        descricao: `Recebimento Fatura B2B em Espécie | Despachante: ${despachante.nome_razao}`
      });
    } catch (errMov) {
      console.warn('Aviso ao registrar entrada em dinheiro no caixa:', errMov);
    }
  } else {
    // 3. Se for PIX, Cartão ou Transferência Bancária, audita no fluxo de caixa e movimentações
    try {
      await supabase
        .from('fluxo_caixa')
        .insert({
          tipo: 'entrada',
          categoria: `Recebimento B2B (${formaPagamento.toUpperCase()})`,
          valor: valorPago,
          origem_id: despachante.id,
          data_movimentacao: new Date().toISOString()
        });
    } catch (e) {
      console.warn('Registro no fluxo_caixa (opcional):', e);
    }

    // Se houver caixa aberto, audita como liquidação de fatura (não soma na gaveta física)
    if (caixaId) {
      try {
        const formaPdv: FormaPagamento = 
          formaPagamento === 'transferencia' ? 'pix' : formaPagamento;

        await registrarMovimentacao({
          caixa_id: caixaId,
          tipo: 'liquidacao_fatura',
          valor: valorPago,
          forma_pagamento: formaPdv,
          despachante_id: despachante.id,
          operador_id: operadorId,
          operador_nome: operadorNome,
          descricao: `Recebimento Fatura B2B (${formaPagamento.toUpperCase()}) | Despachante: ${despachante.nome_razao}`
        });
      } catch (e) {
        console.warn('Auditoria de movimentação não-dinheiro:', e);
      }
    }
  }

  // 4. Gerar hash de autenticidade único para auditoria
  const timestamp = Date.now();
  const rawHash = `${despachante.id}-${timestamp}-${valorPago.toFixed(2)}`;
  const hashAutenticidade = Array.from(rawHash)
    .reduce((hash, char) => 0 | (31 * hash + char.charCodeAt(0)), 0)
    .toString(16)
    .toUpperCase()
    .replace('-', '')
    .padStart(8, '0');

  const protocolo = `FAT-${new Date().getFullYear()}-${hashAutenticidade.slice(0, 6)}`;

  return {
    protocolo,
    dataHora: new Date().toISOString(),
    despachante: {
      ...despachante,
      saldo_devedor: saldoRestante
    },
    valorLiquidado: valorPago,
    meioPagamento: formaPagamento,
    saldoAnterior,
    saldoRestante,
    operadorNome,
    itensQuitadosCount,
    hashAutenticidade: `LIQ-${hashAutenticidade}-${timestamp.toString().slice(-4)}`
  };
}
