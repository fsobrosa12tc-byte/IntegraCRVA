import { supabase } from './supabase';
import type { ComandaBalcao, ItemComandaBalcao } from '../types/pdv';
import { calcularISSQN, paraCentavos, deCentavos } from './pdvCaixa';

const STORAGE_KEY_FALLBACK = 'integra_comandas_balcao_fallback';

function lerComandasFallback(): ComandaBalcao[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FALLBACK);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function salvarComandasFallback(comandas: ComandaBalcao[]) {
  try {
    localStorage.setItem(STORAGE_KEY_FALLBACK, JSON.stringify(comandas));
  } catch (e) {
    console.warn('Falha ao salvar comanda no storage local:', e);
  }
}

/**
 * Cria uma nova comanda de balcão CRVA aguardando liquidação no caixa.
 * O ISSQN de 2% é segregado em centavos para exatidão contábil e fiscal.
 */
export async function criarComandaBalcao(params: {
  cliente_nome: string;
  cliente_documento?: string | null;
  atendente_id: string;
  atendente_nome: string;
  itens: ItemComandaBalcao[];
}): Promise<ComandaBalcao> {
  const { cliente_nome, cliente_documento, atendente_id, atendente_nome, itens } = params;

  if (!itens || itens.length === 0) {
    throw new Error('A comanda deve conter pelo menos um serviço do catálogo CRVA.');
  }

  // 1. Subtotal dos Serviços prestados
  const subtotalServicos = itens.reduce((acc, item) => {
    return acc + (item.quantidade * item.valor_unitario);
  }, 0);
  const subtotalLimpo = Math.round(subtotalServicos * 100) / 100;

  // 2. Cálculo do ISSQN (2,00%)
  const aliquota_issqn = 2.00;
  const valor_issqn = Math.round((subtotalLimpo * 0.02) * 100) / 100;

  // 3. Total Final Obrigatório (COM O ISSQN SOMADO)
  const valor_total = Math.round((subtotalLimpo + valor_issqn) * 100) / 100;

  const payload = {
    cliente_nome: cliente_nome.trim() || 'Consumidor Balcão CRVA',
    cliente_documento: cliente_documento?.trim() || null,
    atendente_id,
    atendente_nome: atendente_nome.trim() || 'Atendente CRVA',
    itens,
    subtotal_servicos: subtotalLimpo,
    valor_total, // Total cobrado do cliente com o ISSQN somado
    aliquota_issqn,
    valor_issqn,
    status: 'aguardando_pagamento' as const,
  };

  try {
    let { data, error } = await supabase
      .from('comandas_balcao')
      .insert(payload)
      .select('*')
      .single();

    // Se o banco ainda não tiver a coluna subtotal_servicos, faz retry sem ela
    if (error && /subtotal_servicos/i.test(error.message)) {
      const { subtotal_servicos: _ignorar, ...payloadLegado } = payload;
      const retry = await supabase
        .from('comandas_balcao')
        .insert(payloadLegado)
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn('Supabase comandas_balcao retornou erro, acionando contingência local:', error.message);
      // Se a tabela ainda não existe no Supabase, salva no fallback local
      const fallbackComanda: ComandaBalcao = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...payload,
        caixa_id: null,
        operador_caixa_id: null,
        forma_pagamento: null,
        criado_em: new Date().toISOString(),
        pago_em: null,
      };
      const existentes = lerComandasFallback();
      salvarComandasFallback([fallbackComanda, ...existentes]);
      return fallbackComanda;
    }

    return data as ComandaBalcao;
  } catch (err: any) {
    console.warn('Exceção ao inserir em comandas_balcao:', err);
    const fallbackComanda: ComandaBalcao = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...payload,
      caixa_id: null,
      operador_caixa_id: null,
      forma_pagamento: null,
      criado_em: new Date().toISOString(),
      pago_em: null,
    };
    const existentes = lerComandasFallback();
    salvarComandasFallback([fallbackComanda, ...existentes]);
    return fallbackComanda;
  }
}

/**
 * Lista as comandas abertas que aguardam pagamento na Frente de Caixa.
 */
export async function listarComandasAguardandoPagamento(): Promise<ComandaBalcao[]> {
  try {
    const { data, error } = await supabase
      .from('comandas_balcao')
      .select('*')
      .eq('status', 'aguardando_pagamento')
      .order('criado_em', { ascending: false });

    if (error) {
      const locais = lerComandasFallback().filter(c => c.status === 'aguardando_pagamento');
      return locais;
    }

    const remotas = (data as ComandaBalcao[]) || [];
    // Mescla eventuais comandas locais de contingência não sincronizadas
    const locais = lerComandasFallback().filter(c => c.status === 'aguardando_pagamento');
    const idsRemotos = new Set(remotas.map(r => r.id));
    const locaisPendentes = locais.filter(l => !idsRemotos.has(l.id));

    return [...remotas, ...locaisPendentes].sort(
      (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
    );
  } catch {
    return lerComandasFallback().filter(c => c.status === 'aguardando_pagamento');
  }
}

/**
 * Liquida a comanda no caixa, vinculando o operador, o caixa e o meio de pagamento.
 */
export async function liquidarComandaNoCaixa(params: {
  comandaId: string;
  caixaId: string;
  operadorCaixaId?: string | null;
  formaPagamento: string;
}): Promise<void> {
  const { comandaId, caixaId, operadorCaixaId, formaPagamento } = params;
  const pago_em = new Date().toISOString();

  // Se for comanda local
  if (comandaId.startsWith('local-')) {
    const locais = lerComandasFallback();
    const idx = locais.findIndex(c => c.id === comandaId);
    if (idx !== -1) {
      locais[idx] = {
        ...locais[idx],
        status: 'pago',
        caixa_id: caixaId,
        operador_caixa_id: operadorCaixaId || null,
        forma_pagamento: formaPagamento,
        pago_em,
      };
      salvarComandasFallback(locais);
    }
    return;
  }

  try {
    const { error } = await supabase
      .from('comandas_balcao')
      .update({
        status: 'pago',
        caixa_id: caixaId,
        operador_caixa_id: operadorCaixaId || null,
        forma_pagamento: formaPagamento,
        pago_em,
      })
      .eq('id', comandaId);

    if (error) {
      console.warn('Erro ao atualizar status da comanda no Supabase:', error.message);
    }
  } catch (e) {
    console.warn('Exceção ao liquidar comanda:', e);
  }
}

/**
 * Cancela uma comanda de balcão (caso o cliente desista ou erro de digitação).
 */
export async function cancelarComandaBalcao(comandaId: string): Promise<void> {
  if (comandaId.startsWith('local-')) {
    const locais = lerComandasFallback();
    const idx = locais.findIndex(c => c.id === comandaId);
    if (idx !== -1) {
      locais[idx].status = 'cancelado';
      salvarComandasFallback(locais);
    }
    return;
  }

  try {
    await supabase
      .from('comandas_balcao')
      .update({ status: 'cancelado' })
      .eq('id', comandaId);
  } catch (e) {
    console.warn('Exceção ao cancelar comanda:', e);
  }
}

/**
 * Inscrição reativa Supabase Realtime para a tabela `comandas_balcao`.
 */
export function inscreverComandasRealtime(onAtualizacao: () => void): () => void {
  try {
    const canal = supabase
      .channel('canal-comandas-balcao-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
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
