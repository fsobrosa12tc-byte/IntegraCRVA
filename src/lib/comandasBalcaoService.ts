import { supabase } from './supabase';
import type { ComandaBalcao, ItemComandaBalcao } from '../types/pdv';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizarUuid(val?: string | null): string | null {
  if (!val || typeof val !== 'string') return null;
  const limpo = val.trim();
  return UUID_REGEX.test(limpo) ? limpo : null;
}

/**
 * Normaliza qualquer linha vinda de `public.comandas_balcao` (quer utilize
 * as colunas `servicos`/`subtotal` ou `itens`/`subtotal_servicos`) para a interface `ComandaBalcao`.
 */
export function normalizarComandaBanco(row: any): ComandaBalcao {
  const listaItens: ItemComandaBalcao[] =
    Array.isArray(row?.servicos) && row.servicos.length > 0
      ? row.servicos
      : Array.isArray(row?.itens)
      ? row.itens
      : [];

  const subtotalCalculado =
    row?.subtotal !== undefined && row?.subtotal !== null
      ? Number(row.subtotal)
      : row?.subtotal_servicos !== undefined && row?.subtotal_servicos !== null
      ? Number(row.subtotal_servicos)
      : listaItens.reduce(
          (acc, i) => acc + Number(i.quantidade || 1) * Number(i.valor_unitario || 0),
          0
        );

  return {
    id: String(row.id),
    protocolo: row.protocolo || `#${String(row.id).slice(0, 8).toUpperCase()}`,
    cliente_id: row.cliente_id || null,
    veiculo_id: row.veiculo_id || null,
    cliente_nome: row.cliente_nome || 'Consumidor Balcão CRVA',
    cliente_documento: row.cliente_documento || null,
    veiculo_placa: row.veiculo_placa || null,
    veiculo_modelo: row.veiculo_modelo || null,
    atendente_id: row.atendente_id || '',
    atendente_nome: row.atendente_nome || 'Atendente CRVA',
    itens: listaItens,
    servicos: listaItens,
    subtotal: subtotalCalculado,
    subtotal_servicos: subtotalCalculado,
    aliquota_issqn: Number(row.aliquota_issqn ?? 2.0),
    valor_issqn: Number(row.valor_issqn ?? 0),
    valor_total: Number(row.valor_total ?? 0),
    status: row.status || 'aguardando_pagamento',
    caixa_id: row.caixa_id || null,
    operador_caixa_id: row.operador_caixa_id || null,
    forma_pagamento: row.forma_pagamento || null,
    criado_em: row.criado_em || new Date().toISOString(),
    pago_em: row.pago_em || null,
  };
}

/**
 * Cria uma nova comanda de balcão CRVA na tabela `public.comandas_balcao`
 * aguardando liquidação no caixa.
 * O ISSQN de 2% é segregado em centavos para exatidão contábil e fiscal.
 * Não silencia erros: qualquer falha no Supabase é propagada com `error.message`.
 */
export async function criarComandaBalcao(params: {
  protocolo?: string | null;
  cliente_nome: string;
  cliente_documento?: string | null;
  cliente_id?: string | null;
  veiculo_id?: string | null;
  veiculo_placa?: string | null;
  veiculo_modelo?: string | null;
  atendente_id: string;
  atendente_nome: string;
  itens: ItemComandaBalcao[];
}): Promise<ComandaBalcao> {
  const {
    protocolo,
    cliente_nome,
    cliente_documento,
    cliente_id,
    veiculo_id,
    veiculo_placa,
    veiculo_modelo,
    atendente_id,
    atendente_nome,
    itens,
  } = params;

  if (!itens || itens.length === 0) {
    throw new Error('A comanda deve conter pelo menos um serviço do catálogo CRVA.');
  }

  // 1. Subtotal dos Serviços prestados
  const subtotalServicos = itens.reduce((acc, item) => {
    return acc + Number(item.quantidade) * Number(item.valor_unitario);
  }, 0);
  const subtotalLimpo = Math.round(subtotalServicos * 100) / 100;

  // 2. Cálculo do ISSQN (2,00%)
  const aliquota_issqn = 2.0;
  const valor_issqn = Math.round(subtotalLimpo * 0.02 * 100) / 100;

  // 3. Total Final Obrigatório (COM O ISSQN SOMADO)
  const valor_total = Math.round((subtotalLimpo + valor_issqn) * 100) / 100;

  const protocoloGerado =
    protocolo?.trim() || `CMD-${Date.now().toString(36).toUpperCase()}`;

  // Payload padrão compatível com o schema oficial de `public.comandas_balcao`
  const payloadOficial: Record<string, any> = {
    protocolo: protocoloGerado,
    cliente_id: sanitizarUuid(cliente_id),
    veiculo_id: sanitizarUuid(veiculo_id),
    cliente_nome: cliente_nome.trim() || 'Consumidor Balcão CRVA',
    cliente_documento: cliente_documento?.trim() || null,
    veiculo_placa: veiculo_placa?.trim().toUpperCase() || null,
    veiculo_modelo: veiculo_modelo?.trim() || null,
    servicos: itens,
    subtotal: subtotalLimpo,
    aliquota_issqn,
    valor_issqn,
    valor_total,
    status: 'aguardando_pagamento',
    atendente_id: sanitizarUuid(atendente_id),
    atendente_nome: atendente_nome.trim() || 'Atendente CRVA',
  };

  let { data, error } = await supabase
    .from('comandas_balcao')
    .insert(payloadOficial)
    .select('*')
    .single();

  // Se o schema da tabela possuir colunas alternativas (ex: `itens`/`subtotal_servicos`) ou FK restrita,
  // tenta variação compatível na mesma tabela `comandas_balcao`
  if (
    error &&
    !/Could not find the table/i.test(error.message) &&
    /column|servicos|subtotal|protocolo|veiculo_placa|veiculo_modelo|foreign key/i.test(
      error.message
    )
  ) {
    const payloadAlternativo: Record<string, any> = {
      cliente_nome: payloadOficial.cliente_nome,
      cliente_documento: payloadOficial.cliente_documento,
      atendente_id: payloadOficial.atendente_id,
      atendente_nome: payloadOficial.atendente_nome,
      itens,
      subtotal_servicos: subtotalLimpo,
      aliquota_issqn,
      valor_issqn,
      valor_total,
      status: 'aguardando_pagamento',
    };

    const retry = await supabase
      .from('comandas_balcao')
      .insert(payloadAlternativo)
      .select('*')
      .single();

    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Não foi possível confirmar a gravação da comanda no banco de dados.');
  }

  return normalizarComandaBanco(data);
}

/**
 * Lista as comandas abertas na tabela `public.comandas_balcao` que aguardam pagamento na Frente de Caixa.
 */
export async function listarComandasAguardandoPagamento(): Promise<ComandaBalcao[]> {
  const { data, error } = await supabase
    .from('comandas_balcao')
    .select('*')
    .eq('status', 'aguardando_pagamento')
    .order('criado_em', { ascending: false });

  if (error) {
    console.warn('[comandas_balcao] Erro ao consultar comandas aguardando pagamento:', error.message);
    return [];
  }

  return Array.isArray(data) ? data.map(normalizarComandaBanco) : [];
}

/**
 * Liquida a comanda no caixa atualizando `status = 'pago'` em `public.comandas_balcao`.
 */
export async function liquidarComandaNoCaixa(params: {
  comandaId: string;
  caixaId: string;
  operadorCaixaId?: string | null;
  formaPagamento: string;
}): Promise<void> {
  const { comandaId, caixaId } = params;
  const pago_em = new Date().toISOString();

  const { error } = await supabase
    .from('comandas_balcao')
    .update({
      status: 'pago',
      caixa_id: sanitizarUuid(caixaId),
      pago_em,
    })
    .eq('id', comandaId);

  if (error) {
    console.warn('[comandas_balcao] Erro ao atualizar status da comanda para pago:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Cancela uma comanda de balcão (caso o cliente desista ou erro de digitação).
 */
export async function cancelarComandaBalcao(comandaId: string): Promise<void> {
  const { error } = await supabase
    .from('comandas_balcao')
    .update({ status: 'cancelado' })
    .eq('id', comandaId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Inscrição reativa Supabase Realtime para a tabela `comandas_balcao`,
 * escutando INSERT, UPDATE e DELETE.
 */
export function inscreverComandasRealtime(onAtualizacao: () => void): () => void {
  try {
    const canal = supabase
      .channel('canal-comandas-balcao-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comandas_balcao',
          filter: 'status=eq.aguardando_pagamento',
        },
        () => {
          onAtualizacao();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comandas_balcao',
        },
        () => {
          onAtualizacao();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'comandas_balcao',
        },
        () => {
          onAtualizacao();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  } catch (e) {
    console.warn('Realtime indisponível para comandas_balcao:', e);
    return () => {};
  }
}
