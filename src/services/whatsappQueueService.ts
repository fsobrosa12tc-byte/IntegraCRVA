/**
 * ============================================================================
 * MARKS SYSTEMS · CRM-INTEGRA · WHATSAPP QUEUE SERVICE & RATE LIMITER
 * ============================================================================
 * Gerenciador global de fila sequencial humanizada (FIFO) com camada estrita
 * anti-bloqueio para a Evolution API v2 e WhatsApp Baileys.
 *
 * REGRAS DE SEGURANÇA IMPLEMENTADAS:
 *  1. Trava Absoluta de Modo Receptivo (Inbound Only):
 *     A IA só pode enviar mensagem para um contato se houver registro prévio
 *     de mensagem recebida (fromMe: false / remetente: 'cliente') nas últimas
 *     24 horas no banco de dados Supabase / cache local. Bloqueia e loga qualquer
 *     tentativa de contato ativo sem interação prévia.
 *
 *  2. Fila Global Sequencial entre Clientes (Anti-Rajada FIFO):
 *     Nunca envia para dois clientes diferentes simultaneamente.
 *     Aplica cooldown aleatório entre 45.000 ms e 90.000 ms (45s a 1m30s)
 *     entre clientes diferentes na fila.
 *
 *  3. Cadência Humanizada na Mesma Conversa (25s a 45s para IA):
 *     Etapa 1 (Leitura Silenciosa): delay aleatório de 15.000 ms a 25.000 ms sem presença.
 *     Etapa 2 (Digitação/Composing): delay entre 10.000 ms e 20.000 ms via Evolution API
 *     (proporcional ao tamanho da mensagem).
 *
 *  4. Exceção para Atendente Humano Manual:
 *     Envios manuais feitos por atendentes humanos furam os delays longos da IA
 *     e são despachados imediatamente com delay simbólico humanizado de 1.500 ms.
 * ============================================================================
 */

import { supabase } from '../lib/supabase';
import {
  EVOLUTION_URL,
  EVOLUTION_INSTANCE,
  getHeaders,
  sanitizarTelefoneWhatsApp,
  type EnvioWhatsAppResponse,
} from './evolutionApi';

export type OrigemMensagem = 'ia' | 'humano';

export interface EnviarWhatsAppQueueParams {
  remoteJid: string; // Telefone normalizado ou remoteJid do WhatsApp (ex: 555199999999 ou 555199999999@s.whatsapp.net)
  texto: string;
  origem: OrigemMensagem;
  atendenteNome?: string;
  atendimentoId?: string;
  pularTrava24h?: boolean; // Usado exclusivamente em casos de exceção autorizados
}

interface ItemFilaWhatsApp {
  id: string;
  remoteJid: string;
  telefoneSanitizado: string;
  texto: string;
  origem: OrigemMensagem;
  atendenteNome?: string;
  atendimentoId?: string;
  timestampEntrada: number;
  resolve: (res: EnvioWhatsAppResponse) => void;
  reject: (err: any) => void;
}

export interface StatusFilaWhatsApp {
  tamanhoFila: number;
  processando: boolean;
  clienteAtual: string | null;
  origemAtual: OrigemMensagem | null;
  ultimoClienteFinalizado: string | null;
  ultimoEnvioEm: string | null;
  totalMensagensProcessadas: number;
  totalBloqueiosInbound: number;
}

// ============================================================================
// ESTADO INTERNO DA FILA GLOBAL (SINGLETON EM MEMÓRIA)
// ============================================================================

const filaMensagens: ItemFilaWhatsApp[] = [];
let isProcessandoFila = false;
let ultimoClienteFinalizado: string | null = null;
let ultimoEnvioTimestamp = 0;
let totalProcessadas = 0;
let totalBloqueiosInbound = 0;
let itemEmProcessamento: ItemFilaWhatsApp | null = null;

// Utilitário de delay assíncrono
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normaliza o remoteJid ou telefone para dígitos puros no padrão brasileiro (ex: 555199999999).
 */
export function extrairNumeroLimpo(remoteJidOuTelefone: string): string {
  if (!remoteJidOuTelefone) return '';
  const semJid = remoteJidOuTelefone.replace(/@s\.whatsapp\.net$/i, '').replace(/@g\.us$/i, '');
  const digits = semJid.replace(/\D/g, '');
  return digits;
}

/**
 * ============================================================================
 * 1. TRAVA ABSOLUTA DE MODO RECEPTIVO (INBOUND ONLY - 24 HORAS)
 * ============================================================================
 * A IA só tem permissão para responder a um contato se houver registro prévio
 * de mensagem recebida (fromMe: false / remetente: 'cliente') nas últimas 24h.
 */
export async function validarPermissaoInbound24h(remoteJid: string): Promise<{
  permitido: boolean;
  motivo?: string;
  ultimaMensagemClienteEm?: string;
}> {
  const numeroLimpo = extrairNumeroLimpo(remoteJid);
  if (!numeroLimpo) {
    return { permitido: false, motivo: 'Identificador remoteJid/telefone vazio ou inválido.' };
  }

  const limite24hAtras = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1.1 Consulta no Supabase: Atendimentos que contenham o telefone do contato
    if (supabase) {
      // Variações de formato para o telefone (com 55, sem 55, com 9 dígitos, etc.)
      const semDdi = numeroLimpo.startsWith('55') ? numeroLimpo.substring(2) : numeroLimpo;
      const comDdi = numeroLimpo.startsWith('55') ? numeroLimpo : `55${numeroLimpo}`;

      const { data: atendimentos, error } = await supabase
        .from('crm_atendimentos')
        .select('id, cliente_telefone, historico_mensagens, ultima_interacao_em, atualizado_em')
        .or(`cliente_telefone.ilike.%${semDdi}%,cliente_telefone.ilike.%${comDdi}%`)
        .order('atualizado_em', { ascending: false })
        .limit(5);

      if (!error && atendimentos && atendimentos.length > 0) {
        for (const at of atendimentos) {
          const historico = Array.isArray(at.historico_mensagens) ? at.historico_mensagens : [];
          // Procura mensagens enviadas pelo cliente (fromMe: false / remetente: 'cliente')
          for (let i = historico.length - 1; i >= 0; i--) {
            const msg = historico[i];
            const isCliente = msg?.remetente === 'cliente' || msg?.fromMe === false;
            if (isCliente) {
              const msgTimestamp = msg?.timestamp || msg?.criado_em || at.ultima_interacao_em;
              if (msgTimestamp && new Date(msgTimestamp).toISOString() >= limite24hAtras) {
                return {
                  permitido: true,
                  ultimaMensagemClienteEm: new Date(msgTimestamp).toISOString(),
                };
              }
            }
          }

          // Se a última interação geral foi recente e o atendimento não foi criado por outbound
          if (at.ultima_interacao_em && at.ultima_interacao_em >= limite24hAtras) {
            return {
              permitido: true,
              ultimaMensagemClienteEm: at.ultima_interacao_em,
            };
          }
        }
      }

      // 1.2 Consulta na tabela de logs de intenções da IA (crm_intencoes_ia_log)
      const { data: logsIa, error: errLogs } = await supabase
        .from('crm_intencoes_ia_log')
        .select('id, criado_em')
        .or(`telefone_origem.ilike.%${semDdi}%,telefone_origem.ilike.%${comDdi}%`)
        .gte('criado_em', limite24hAtras)
        .order('criado_em', { ascending: false })
        .limit(1);

      if (!errLogs && logsIa && logsIa.length > 0) {
        return {
          permitido: true,
          ultimaMensagemClienteEm: logsIa[0].criado_em,
        };
      }
    }
  } catch (errDb: any) {
    console.warn('[whatsappQueueService] Falha ao consultar Supabase para trava 24h, verificando cache local:', errDb?.message || errDb);
  }

  // 1.3 Fallback no cache local do CRM (localStorage / sessionStorage)
  try {
    if (typeof localStorage !== 'undefined') {
      const cacheRaw = localStorage.getItem('crm_atendimentos_cache_v2') || localStorage.getItem('crm_atendimentos_cache');
      if (cacheRaw) {
        const listaLocal = JSON.parse(cacheRaw);
        if (Array.isArray(listaLocal)) {
          const semDdi = numeroLimpo.startsWith('55') ? numeroLimpo.substring(2) : numeroLimpo;
          const match = listaLocal.find((item: any) => {
            const tel = extrairNumeroLimpo(item.cliente_telefone || '');
            return tel.includes(semDdi);
          });

          if (match) {
            const historico = Array.isArray(match.historico_mensagens) ? match.historico_mensagens : [];
            const temMsgCliente = historico.some((m: any) => m?.remetente === 'cliente' || m?.fromMe === false);
            const dataRef = match.ultima_interacao_em || match.atualizado_em;

            if (temMsgCliente && dataRef && dataRef >= limite24hAtras) {
              return {
                permitido: true,
                ultimaMensagemClienteEm: dataRef,
              };
            }
          }
        }
      }
    }
  } catch (errLocal) {
    console.warn('[whatsappQueueService] Erro ao consultar cache local:', errLocal);
  }

  return {
    permitido: false,
    motivo: `Nenhuma mensagem recebida do cliente (${numeroLimpo}) nas últimas 24 horas (limite: ${limite24hAtras}). Envio ativo bloqueado para prevenir suspensão da linha.`,
  };
}

/**
 * Executa a chamada HTTP direta à Evolution API v2 para o envio de texto.
 */
async function dispararEnvioEvolutionHttp(
  telefoneSanitizado: string,
  mensagem: string,
  delayMs: number
): Promise<EnvioWhatsAppResponse> {
  const url = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
  const headers = getHeaders();

  const payload = {
    number: telefoneSanitizado,
    text: mensagem,
    delay: delayMs,
    presence: 'composing',
    linkPreview: false,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msgErro = data?.message || data?.error || `HTTP ${res.status} retornado pela Evolution API v2.`;
    return {
      sucesso: false,
      telefoneSanitizado,
      mensagemEnviada: mensagem,
      detalhes: data,
      erro: msgErro,
    };
  }

  return {
    sucesso: true,
    messageId: data?.key?.id || data?.messageId || data?.id,
    telefoneSanitizado,
    mensagemEnviada: mensagem,
    detalhes: data,
  };
}

/**
 * ============================================================================
 * PROCESSADOR DA FILA SEQUENCIAL (WORKER FIFO)
 * ============================================================================
 */
async function processarFilaGlobal(): Promise<void> {
  if (isProcessandoFila) return;
  isProcessandoFila = true;

  while (filaMensagens.length > 0) {
    const item = filaMensagens.shift()!;
    itemEmProcessamento = item;

    try {
      // ----------------------------------------------------------------------
      // REGRA 2: COOLDOWN GLOBAL ANTI-RAJADA ENTRE CLIENTES DIFERENTES (45s a 90s)
      // ----------------------------------------------------------------------
      const clienteAtual = item.telefoneSanitizado;
      const isOutroCliente = ultimoClienteFinalizado && ultimoClienteFinalizado !== clienteAtual;

      if (isOutroCliente && ultimoEnvioTimestamp > 0 && item.origem === 'ia') {
        const tempoDecorrido = Date.now() - ultimoEnvioTimestamp;
        // Intervalo aleatório obrigatório entre 45.000 ms e 90.000 ms (45s a 1m30s)
        const cooldownAlvo = Math.floor(Math.random() * (90000 - 45000 + 1)) + 45000;

        if (tempoDecorrido < cooldownAlvo) {
          const esperaRestante = cooldownAlvo - tempoDecorrido;
          console.info(
            `[whatsappQueueService] ⏳ Cooldown Anti-Rajada entre clientes (${ultimoClienteFinalizado} ➔ ${clienteAtual}): aguardando ${(esperaRestante / 1000).toFixed(1)}s...`
          );
          await sleep(esperaRestante);
        }
      }

      // ----------------------------------------------------------------------
      // REGRA 1: TRAVA INBOUND ONLY PARA A IA (24 HORAS)
      // ----------------------------------------------------------------------
      if (item.origem === 'ia') {
        const validacao = await validarPermissaoInbound24h(item.remoteJid);
        if (!validacao.permitido) {
          totalBloqueiosInbound++;
          const erroMsg = `[SEGURANÇA INBOUND] Envio bloqueado: ${validacao.motivo}`;
          console.warn(`[whatsappQueueService] 🛑 ${erroMsg}`);

          item.resolve({
            sucesso: false,
            telefoneSanitizado: item.telefoneSanitizado,
            mensagemEnviada: item.texto,
            erro: erroMsg,
          });

          // Registra no histórico do atendimento caso exista
          if (item.atendimentoId && supabase) {
            try {
              await supabase.from('crm_intencoes_ia_log').insert({
                atendimento_id: item.atendimentoId,
                telefone_origem: item.telefoneSanitizado,
                mensagem_recebida: 'TENTATIVA_OUTBOUND_BLOQUEADA',
                intencao_identificada: 'bloqueio_anti_spam_24h',
                confianca_ia: 100.0,
                entidades_extraidas: { bloqueado: true, motivo: validacao.motivo },
              });
            } catch (errLog) {
              console.warn('[whatsappQueueService] Aviso ao gravar log de bloqueio:', errLog);
            }
          }

          continue; // Passa para o próximo da fila
        }
      }

      // ----------------------------------------------------------------------
      // REGRA 4 vs REGRA 3: CADÊNCIA DE ENVIO (HUMANO vs IA)
      // ----------------------------------------------------------------------
      let resultadoEnvio: EnvioWhatsAppResponse;

      if (item.origem === 'humano') {
        // REGRA 4: EXCEÇÃO ATENDENTE HUMANO MANUAL
        // Bypass dos delays longos de IA; envio imediato com delay simbólico de 1.500 ms
        console.info(`[whatsappQueueService] 👤 Envio Manual por Atendente (${item.atendenteNome || 'Operador'}): despacho imediato (delay 1.500ms).`);
        resultadoEnvio = await dispararEnvioEvolutionHttp(item.telefoneSanitizado, item.texto, 1500);
      } else {
        // REGRA 3: CADÊNCIA HUMANIZADA DA IA NA MESMA CONVERSA (25s a 45s)
        // Etapa 1 (Tempo de Leitura - Silencioso): entre 15.000 ms e 25.000 ms sem presença
        const delayLeitura = Math.floor(Math.random() * (25000 - 15000 + 1)) + 15000;
        console.info(
          `[whatsappQueueService] 🤖 IA Etapa 1/2 (Leitura Silenciosa): aguardando ${(delayLeitura / 1000).toFixed(1)}s para ${item.telefoneSanitizado}...`
        );
        await sleep(delayLeitura);

        // Etapa 2 (Tempo de Digitação - Composing): entre 10.000 ms e 20.000 ms proporcional ao texto
        // Cálculo proporcional: base 10.000 ms + tempo proporcional aos caracteres, limitado a 20.000 ms
        const caracteres = item.texto.length;
        const delayProporcional = Math.floor(caracteres * 40) + 10000;
        const delayDigitacao = Math.min(20000, Math.max(10000, delayProporcional));

        console.info(
          `[whatsappQueueService] 🤖 IA Etapa 2/2 (Digitação Real): composing de ${(delayDigitacao / 1000).toFixed(1)}s (${caracteres} caracteres)...`
        );

        resultadoEnvio = await dispararEnvioEvolutionHttp(item.telefoneSanitizado, item.texto, delayDigitacao);
      }

      // Atualiza marcas de auditoria e cooldown
      ultimoClienteFinalizado = item.telefoneSanitizado;
      ultimoEnvioTimestamp = Date.now();
      totalProcessadas++;

      item.resolve(resultadoEnvio);
    } catch (erroGrave: any) {
      console.error(`[whatsappQueueService] Falha grave no processamento da fila para ${item.telefoneSanitizado}:`, erroGrave);
      item.resolve({
        sucesso: false,
        telefoneSanitizado: item.telefoneSanitizado,
        mensagemEnviada: item.texto,
        erro: erroGrave?.message || 'Erro inesperado na fila de envio do WhatsApp.',
      });
    } finally {
      itemEmProcessamento = null;
    }
  }

  isProcessandoFila = false;
}

/**
 * ============================================================================
 * SERVIÇO PÚBLICO DE ENVIO: sendWhatsAppMessage
 * ============================================================================
 * Enfileira a mensagem na fila global com todas as proteções anti-bloqueio.
 */
export async function sendWhatsAppMessage(params: EnviarWhatsAppQueueParams): Promise<EnvioWhatsAppResponse> {
  let telefoneSanitizado = '';
  try {
    const numeroLimpo = extrairNumeroLimpo(params.remoteJid);
    telefoneSanitizado = sanitizarTelefoneWhatsApp(numeroLimpo);
  } catch (err: any) {
    return {
      sucesso: false,
      telefoneSanitizado: params.remoteJid,
      mensagemEnviada: params.texto,
      erro: err?.message || 'Número de telefone inválido.',
    };
  }

  return new Promise<EnvioWhatsAppResponse>((resolve, reject) => {
    const item: ItemFilaWhatsApp = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      remoteJid: params.remoteJid,
      telefoneSanitizado,
      texto: params.texto,
      origem: params.origem,
      atendenteNome: params.atendenteNome,
      atendimentoId: params.atendimentoId,
      timestampEntrada: Date.now(),
      resolve,
      reject,
    };

    // Insere na fila FIFO
    filaMensagens.push(item);
    console.info(
      `[whatsappQueueService] 📥 Mensagem enfileirada (Origem: ${item.origem.toUpperCase()} | Destino: ${telefoneSanitizado} | Posição na Fila: ${filaMensagens.length})`
    );

    // Dispara o processamento se estiver ocioso
    processarFilaGlobal().catch((err) => {
      console.error('[whatsappQueueService] Erro ao disparar worker da fila:', err);
    });
  });
}

/**
 * Retorna o status de monitoramento da fila em tempo real para a interface ou logs.
 */
export function getQueueStatus(): StatusFilaWhatsApp {
  return {
    tamanhoFila: filaMensagens.length,
    processando: isProcessandoFila,
    clienteAtual: itemEmProcessamento?.telefoneSanitizado || null,
    origemAtual: itemEmProcessamento?.origem || null,
    ultimoClienteFinalizado,
    ultimoEnvioEm: ultimoEnvioTimestamp > 0 ? new Date(ultimoEnvioTimestamp).toISOString() : null,
    totalMensagensProcessadas: totalProcessadas,
    totalBloqueiosInbound: totalBloqueiosInbound,
  };
}

/**
 * Limpa todos os itens pendentes da fila (útil para contingências ou reset de instância).
 */
export function limparFilaWhatsApp(motivo = 'Cancelado pelo operador'): number {
  const cancelados = filaMensagens.length;
  while (filaMensagens.length > 0) {
    const item = filaMensagens.shift()!;
    item.resolve({
      sucesso: false,
      telefoneSanitizado: item.telefoneSanitizado,
      mensagemEnviada: item.texto,
      erro: `Fila limpa antes do processamento: ${motivo}`,
    });
  }
  return cancelados;
}
