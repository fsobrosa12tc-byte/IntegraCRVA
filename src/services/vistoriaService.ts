/**
 * ============================================================================
 * INTEGRA CRVA · SERVIÇO DE GESTÃO DA ESTEIRA DE VISTORIAS VEICULARES
 * ============================================================================
 * Orquestração do fluxo de pátio (box, aprovação, pendências) com automação
 * de notificações em segundo plano via WhatsApp (Evolution API v2) e
 * persistência auditada no banco de dados Supabase.
 * ============================================================================
 */

import { supabase } from '../lib/supabase';
import {
  enviarNotificacaoVistoria,
  getStatus,
  sanitizarPlaca,
  type NotificacaoVistoriaParams,
  type TipoNotificacaoVistoria,
  type WhatsAppConnectionState,
} from './evolutionApi';

export type StatusVistoria =
  | 'aguardando_box'
  | 'em_vistoria'
  | 'aprovado'
  | 'reprovado'
  | 'cancelado';

export type StatusNotificacaoWhatsApp =
  | 'pendente'
  | 'enviado'
  | 'falha'
  | 'ignorado_offline'
  | 'sem_telefone';

export interface VistoriaPatio {
  id: string;
  comanda_id?: string | null;
  protocolo?: string | null;
  placa: string;
  veiculo_placa?: string;
  veiculo_modelo?: string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  status: StatusVistoria;
  box?: string | null;
  motivos_pendencia?: string | null;
  notificacao_whatsapp_status?: StatusNotificacaoWhatsApp;
  notificacao_whatsapp_enviada_em?: string | null;
  notificacao_whatsapp_detalhes?: any;
  criado_em: string;
  atualizado_em?: string | null;
}

export interface CadastrarVistoriaInput {
  comanda_id?: string | null;
  protocolo?: string | null;
  placa: string;
  veiculo_modelo?: string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  box?: string | null;
}

export interface AtualizarStatusOptions {
  box?: string | null;
  motivos?: string | string[] | null;
  operadorId?: string | null;
  operadorNome?: string | null;
}

/* =========================================================================
 * 1. CRUD E CONSULTA DE VISTORIAS NO SUPABASE
 * ========================================================================= */

/**
 * Normaliza os dados retornados pelo Supabase para lidar com esquemas legados
 * e modernos da tabela 'vistorias_patio' (placa vs veiculo_placa).
 */
function normalizarVistoria(item: any): VistoriaPatio {
  const placa = item.placa || item.veiculo_placa || 'N/A';
  return {
    id: item.id,
    comanda_id: item.comanda_id ?? null,
    protocolo: item.protocolo ?? null,
    placa,
    veiculo_placa: placa,
    veiculo_modelo: item.veiculo_modelo ?? null,
    cliente_nome: item.cliente_nome ?? null,
    cliente_telefone: item.cliente_telefone ?? null,
    status: item.status as StatusVistoria,
    box: item.box ?? item.box_atendimento ?? null,
    motivos_pendencia: item.motivos_pendencia ?? item.motivo_pendencia ?? item.motivos ?? null,
    notificacao_whatsapp_status: item.notificacao_whatsapp_status ?? 'pendente',
    notificacao_whatsapp_enviada_em: item.notificacao_whatsapp_enviada_em ?? null,
    notificacao_whatsapp_detalhes: item.notificacao_whatsapp_detalhes ?? null,
    criado_em: item.criado_em || item.created_at || new Date().toISOString(),
    atualizado_em: item.atualizado_em || item.updated_at || null,
  };
}

/**
 * Lista as vistorias cadastradas no pátio com suporte a filtros de status e busca textual.
 */
export async function listarVistoriasPatio(filtros?: {
  status?: StatusVistoria | StatusVistoria[];
  busca?: string;
}): Promise<VistoriaPatio[]> {
  let query = supabase
    .from('vistorias_patio')
    .select('*')
    .order('criado_em', { ascending: false });

  if (filtros?.status) {
    if (Array.isArray(filtros.status)) {
      query = query.in('status', filtros.status);
    } else {
      query = query.eq('status', filtros.status);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error('[VistoriaService] Erro ao listar vistorias do pátio:', error.message);
    throw new Error(`Falha ao listar vistorias: ${error.message}`);
  }

  let lista = (data || []).map(normalizarVistoria);

  if (filtros?.busca) {
    const termo = filtros.busca.trim().toUpperCase();
    lista = lista.filter((v) =>
      v.placa.toUpperCase().includes(termo) ||
      (v.cliente_nome && v.cliente_nome.toUpperCase().includes(termo)) ||
      (v.protocolo && v.protocolo.toUpperCase().includes(termo)) ||
      (v.veiculo_modelo && v.veiculo_modelo.toUpperCase().includes(termo))
    );
  }

  return lista;
}

/**
 * Busca uma vistoria específica pelo ID.
 */
export async function buscarVistoriaPorId(id: string): Promise<VistoriaPatio | null> {
  const { data, error } = await supabase
    .from('vistorias_patio')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return normalizarVistoria(data);
}

/**
 * Cadastra uma nova vistoria na esteira de atendimento do CRVA.
 * Status inicial: 'aguardando_box'.
 */
export async function cadastrarVistoriaPatio(input: CadastrarVistoriaInput): Promise<VistoriaPatio> {
  const placaLimpa = sanitizarPlaca(input.placa);
  const payloadBase: Record<string, any> = {
    placa: placaLimpa,
    veiculo_placa: placaLimpa,
    veiculo_modelo: input.veiculo_modelo ?? null,
    cliente_nome: input.cliente_nome ?? null,
    cliente_telefone: input.cliente_telefone ?? null,
    status: 'aguardando_box',
    box: input.box ?? null,
    comanda_id: input.comanda_id ?? null,
    protocolo: input.protocolo ?? null,
  };

  // Tentativa com payload completo
  let { data, error } = await supabase
    .from('vistorias_patio')
    .insert(payloadBase)
    .select('*')
    .single();

  // Fallback caso a tabela ainda não contenha colunas estendidas (comanda_id / protocolo / box)
  if (error && /column|schema cache/i.test(error.message)) {
    console.warn('[VistoriaService] Schema reduzido detectado; gravando colunas essenciais:', error.message);
    const payloadReduzido = {
      veiculo_placa: placaLimpa,
      veiculo_modelo: input.veiculo_modelo ?? null,
      cliente_nome: input.cliente_nome ?? null,
      cliente_telefone: input.cliente_telefone ?? null,
      status: 'aguardando_box',
    };
    const retry = await supabase
      .from('vistorias_patio')
      .insert(payloadReduzido)
      .select('*')
      .single();

    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('[VistoriaService] Falha ao cadastrar vistoria:', error.message);
    throw new Error(`Falha ao criar registro de vistoria: ${error.message}`);
  }

  return normalizarVistoria(data);
}

/* =========================================================================
 * 2. TRANSIÇÃO DE STATUS E DISPARO DESACOPLADO DE NOTIFICAÇÃO
 * ========================================================================= */

/**
 * Atualiza o status da vistoria no banco de dados e dispara em segundo plano
 * (de forma assíncrona e desacoplada) a respectiva notificação no WhatsApp.
 *
 * Transições monitoradas com WhatsApp:
 * - aguardando_box -> em_vistoria: Dispara 'chamada_box' informando o Box de atendimento.
 * - em_vistoria    -> aprovado:    Dispara 'aprovacao' (Card verde / balcão).
 * - em_vistoria    -> reprovado:   Dispara 'reprovacao' (Card vermelho / pendências).
 *
 * @param id Identificador da vistoria.
 * @param novoStatus Novo estado no fluxo de pátio.
 * @param opcoes Box, motivos de pendência ou dados do operador.
 */
export async function atualizarStatusVistoria(
  id: string,
  novoStatus: StatusVistoria,
  opcoes?: AtualizarStatusOptions
): Promise<VistoriaPatio> {
  const vistoriaAtual = await buscarVistoriaPorId(id);
  if (!vistoriaAtual) {
    throw new Error(`Vistoria com ID "${id}" não encontrada.`);
  }

  const motivosTexto = Array.isArray(opcoes?.motivos)
    ? opcoes?.motivos.filter(Boolean).join('; ')
    : opcoes?.motivos || null;

  const updatePayload: Record<string, any> = {
    status: novoStatus,
    atualizado_em: new Date().toISOString(),
  };

  if (opcoes?.box !== undefined) {
    updatePayload.box = opcoes.box;
  }
  if (motivosTexto !== null && motivosTexto !== undefined) {
    updatePayload.motivos_pendencia = motivosTexto;
  }

  // 1. Atualização imediata no Supabase (garante agilidade visual na interface)
  let { data, error } = await supabase
    .from('vistorias_patio')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();

  // Fallback caso colunas opcionais (box, motivos_pendencia) ainda não existam no banco
  if (error && /column|schema cache/i.test(error.message)) {
    const fallbackUpdate = {
      status: novoStatus,
    };
    const retry = await supabase
      .from('vistorias_patio')
      .update(fallbackUpdate)
      .eq('id', id)
      .select('*')
      .single();

    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error(`[VistoriaService] Erro ao atualizar vistoria ${id}:`, error.message);
    throw new Error(`Erro ao atualizar vistoria: ${error.message}`);
  }

  const vistoriaAtualizada = normalizarVistoria(data);

  // 2. DISPARO DESACOPLADO E ASSÍNCRONO DA NOTIFICAÇÃO (NÃO BLOQUEIA A UI)
  // Executado em background via Promise sem await no retorno principal.
  void dispararNotificacaoSilenciosa({
    vistoria: vistoriaAtualizada,
    novoStatus,
    boxInformado: opcoes?.box || vistoriaAtualizada.box,
    motivosInformados: motivosTexto || vistoriaAtualizada.motivos_pendencia,
  });

  return vistoriaAtualizada;
}

/* =========================================================================
 * 3. EXECUTOR DE SEGUNDO PLANO: ENVIO DE WHATSAPP COM AUDITORIA
 * ========================================================================= */

interface DisparoSilenciosoParams {
  vistoria: VistoriaPatio;
  novoStatus: StatusVistoria;
  boxInformado?: string | null;
  motivosInformados?: string | null;
}

/**
 * Função executada em segundo plano.
 * Valida a conexão, monta o template e registra a auditoria fiscal/operacional no Supabase.
 */
async function dispararNotificacaoSilenciosa({
  vistoria,
  novoStatus,
  boxInformado,
  motivosInformados,
}: DisparoSilenciosoParams): Promise<void> {
  // Apenas certos status acionam notificações para o proprietário do veículo
  const acionaNotificacao =
    novoStatus === 'em_vistoria' ||
    novoStatus === 'aprovado' ||
    novoStatus === 'reprovado';

  if (!acionaNotificacao) {
    return;
  }

  const telefone = vistoria.cliente_telefone?.trim();

  // 1. Validação de Telefone: Se não houver telefone, registra auditoria e aborta sem erro
  if (!telefone) {
    console.warn(`[VistoriaService] Vistoria ${vistoria.id} (${vistoria.placa}) não possui telefone para notificação.`);
    await registrarAuditoriaNotificacao(vistoria.id, {
      status: 'sem_telefone',
      detalhes: { aviso: 'Cliente não possui telefone celular informado na comanda/vistoria.' },
    });
    return;
  }

  // 2. Mapeamento do Tipo de Evento
  let tipoNotificacao: TipoNotificacaoVistoria;
  if (novoStatus === 'em_vistoria') {
    tipoNotificacao = 'chamada_box';
  } else if (novoStatus === 'aprovado') {
    tipoNotificacao = 'aprovacao';
  } else {
    tipoNotificacao = 'reprovacao';
  }

  // 3. Monitoramento Prévio da Conexão do WhatsApp Gateway
  let estadoConexao: WhatsAppConnectionState = 'close';
  try {
    estadoConexao = await getStatus();
  } catch (err: any) {
    console.error('[VistoriaService] Falha ao verificar status do WhatsApp:', err?.message || err);
    estadoConexao = 'close';
  }

  // 4. Tratamento de Conexão Offline ('state !== open'):
  // Não quebra a esteira nem exibe alerta bloqueante; registra fallback no log de auditoria
  if (estadoConexao !== 'open') {
    console.warn(
      `[VistoriaService] WhatsApp Gateway desconectado (state: "${estadoConexao}"). ` +
      `Notificação da vistoria ${vistoria.placa} ignorada silenciosamente.`
    );
    await registrarAuditoriaNotificacao(vistoria.id, {
      status: 'ignorado_offline',
      detalhes: {
        motivo: `Gateway WhatsApp não está pronto para envio (estado: ${estadoConexao}).`,
        tentativa_em: new Date().toISOString(),
      },
    });
    return;
  }

  // 5. Disparo da Notificação via Evolution API v2
  try {
    const params: NotificacaoVistoriaParams = {
      tipo: tipoNotificacao,
      telefone,
      placa: vistoria.placa,
      comanda: vistoria.protocolo || vistoria.comanda_id,
      box: boxInformado,
      motivos: motivosInformados,
    };

    const resultado = await enviarNotificacaoVistoria(params);

    if (resultado.sucesso) {
      console.log(`[VistoriaService] WhatsApp enviado com SUCESSO para ${resultado.telefoneSanitizado} (${vistoria.placa}).`);
      await registrarAuditoriaNotificacao(vistoria.id, {
        status: 'enviado',
        mensagem: resultado.mensagemEnviada,
        messageId: resultado.messageId,
        detalhes: resultado.detalhes,
      });
    } else {
      console.error(`[VistoriaService] Falha no envio WhatsApp para ${vistoria.placa}:`, resultado.erro);
      await registrarAuditoriaNotificacao(vistoria.id, {
        status: 'falha',
        mensagem: resultado.mensagemEnviada,
        detalhes: { erro: resultado.erro, detalhes: resultado.detalhes },
      });
    }
  } catch (envioError: any) {
    console.error('[VistoriaService] Exceção inesperada no envio de notificação:', envioError?.message || envioError);
    await registrarAuditoriaNotificacao(vistoria.id, {
      status: 'falha',
      detalhes: { erro: envioError?.message || 'Erro inesperado de infraestrutura.' },
    });
  }
}

/**
 * Registra o resultado da tentativa de envio na auditoria do banco de dados Supabase.
 */
async function registrarAuditoriaNotificacao(
  vistoriaId: string,
  dados: {
    status: StatusNotificacaoWhatsApp;
    mensagem?: string;
    messageId?: string;
    detalhes?: any;
  }
): Promise<void> {
  try {
    // 1. Atualiza colunas de notificação na própria tabela 'vistorias_patio' (se existirem)
    await supabase
      .from('vistorias_patio')
      .update({
        notificacao_whatsapp_status: dados.status,
        notificacao_whatsapp_enviada_em: dados.status === 'enviado' ? new Date().toISOString() : null,
        notificacao_whatsapp_detalhes: dados.detalhes || null,
      })
      .eq('id', vistoriaId);

    // 2. Insere na tabela analítica de log de auditoria 'vistorias_notificacoes_log'
    try {
      await supabase
        .from('vistorias_notificacoes_log')
        .insert({
          vistoria_id: vistoriaId,
          status: dados.status,
          mensagem: dados.mensagem ?? null,
          message_id: dados.messageId ?? null,
          detalhes: dados.detalhes ?? null,
        });
    } catch {
      // Silencioso se a tabela auxiliar de log não existir
    }
  } catch (err: any) {
    console.warn('[VistoriaService] Aviso ao salvar log de auditoria no Supabase:', err?.message || err);
  }
}

/* =========================================================================
 * 4. REENVIO MANUAL & REALTIME SUBSCRIPTION
 * ========================================================================= */

/**
 * Permite que o operador do box ou do balcão reenvie a notificação manualmente
 * caso o cliente solicite ou tenha atualizado o número de telefone.
 */
export async function reenviarNotificacaoWhatsApp(
  vistoriaId: string,
  tipoManual?: TipoNotificacaoVistoria
): Promise<{ sucesso: boolean; mensagem: string }> {
  const vistoria = await buscarVistoriaPorId(vistoriaId);
  if (!vistoria) {
    return { sucesso: false, mensagem: 'Vistoria não encontrada.' };
  }

  if (!vistoria.cliente_telefone) {
    return { sucesso: false, mensagem: 'Esta vistoria não possui número de telefone cadastrado.' };
  }

  const estado = await getStatus();
  if (estado !== 'open') {
    return {
      sucesso: false,
      mensagem: `O gateway do WhatsApp está desconectado (status: ${estado}). Não foi possível enviar.`,
    };
  }

  const tipo: TipoNotificacaoVistoria =
    tipoManual ||
    (vistoria.status === 'aprovado'
      ? 'aprovacao'
      : vistoria.status === 'reprovado'
        ? 'reprovacao'
        : 'chamada_box');

  const resultado = await enviarNotificacaoVistoria({
    tipo,
    telefone: vistoria.cliente_telefone,
    placa: vistoria.placa,
    comanda: vistoria.protocolo || vistoria.comanda_id,
    box: vistoria.box,
    motivos: vistoria.motivos_pendencia,
  });

  await registrarAuditoriaNotificacao(vistoriaId, {
    status: resultado.sucesso ? 'enviado' : 'falha',
    mensagem: resultado.mensagemEnviada,
    messageId: resultado.messageId,
    detalhes: resultado.detalhes,
  });

  return {
    sucesso: resultado.sucesso,
    mensagem: resultado.sucesso
      ? `Notificação enviada com sucesso para ${resultado.telefoneSanitizado}!`
      : `Falha ao enviar: ${resultado.erro || 'Erro desconhecido'}`,
  };
}

/**
 * Cria uma subscrição Supabase Realtime para que a esteira de vistorias
 * no pátio e nas televisões/painéis de atendimento seja atualizada em tempo real.
 */
export function inscreverVistoriasPatioRealtime(
  onAtualizacao: (payload: { eventType: string; vistoria: VistoriaPatio }) => void
): () => void {
  const canal = supabase
    .channel('realtime_vistorias_patio')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'vistorias_patio',
      },
      (payload) => {
        if (payload.new && (payload.new as any).id) {
          onAtualizacao({
            eventType: payload.eventType,
            vistoria: normalizarVistoria(payload.new),
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(canal);
  };
}

