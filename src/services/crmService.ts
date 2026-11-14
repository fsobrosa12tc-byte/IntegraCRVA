/**
 * ============================================================================
 * MARKS SYSTEMS · CRM-INTEGRA · MOTOR DE TRIAGEM, ROTEAMENTO E KANBAN (CRVA/RS)
 * ============================================================================
 * Fluxo de conversas do WhatsApp para a operação de um CRVA credenciado ao
 * Detran/RS, com dois perfis:
 *  - DESPACHANTE CREDENCIADO (CRDD / GRT / lotes)
 *  - PARTICULAR (cidadão, proprietário, comprador)
 *
 * Regras centrais:
 *  1. Menção a CRDD ou GRT => perfil DESPACHANTE e fila humana de despachantes.
 *  2. Termos críticos (inventário, óbito, bloqueio judicial, leilão,
 *     falsificação/perícia) => Fila Humana imediata com alerta de urgência.
 *  3. LGPD: CPF/CNPJ/dados bancários nunca aparecem no resumo/snippet do card.
 * ============================================================================
 */

import { supabase } from '../lib/supabase';
import { enviarTextoDireto } from './evolutionApi';
import { sendWhatsAppMessage } from './whatsappQueueService';
import { generateAiResponse, type AiResponseResult } from './aiRouterService';

// ============================================================================
// TIPOS
// ============================================================================

export type TipoClienteCrm = 'particular' | 'despachante';

export type EtapaKanbanCrm =
  | 'triagem_ia'
  | 'aguardando_documentacao'
  | 'fila_humana_particular'
  | 'fila_humana_despachante'
  | 'analise_vistoria'
  | 'concluido';

export type AssuntoCrm =
  | 'transferencia'
  | 'primeiro_emplacamento'
  | 'vistoria'
  | 'crlve_atpve'
  | 'bloqueio_debitos'
  | 'outros';

export type ResponsavelTipo = 'ia' | 'humano';

export type StatusEmissaoCrlve =
  | 'pendente'
  | 'consultando_detran'
  | 'guia_enviada'
  | 'pago_aguardando_emissao'
  | 'crlve_enviado';

export interface MensagemChatCrm {
  id: string;
  remetente: 'cliente' | 'ia' | 'atendente';
  autor_nome: string;
  texto: string;
  horario: string;
  enviado_whatsapp?: boolean;
}

export interface TransicaoCrm {
  de: EtapaKanbanCrm | null;
  para: EtapaKanbanCrm;
  motivo: string;
  origem: 'ia' | 'operador' | 'sistema';
  em: string;
}

export interface AtendimentoCrm {
  id: string;
  protocolo: string;

  // Canal / perfil
  tipo_cliente: TipoClienteCrm;
  registro_crdd?: string | null;
  grt_numero?: string | null;
  mencionou_crdd: boolean;
  mencionou_grt: boolean;

  // Identificação (dados pessoais NUNCA exibidos no card)
  cliente_nome: string;
  cliente_telefone: string;
  cliente_documento?: string | null;
  despachante_nome?: string | null;

  // Veículo (único dado exibido quando consultado)
  veiculo_placa?: string | null;
  veiculo_renavam?: string | null;
  veiculo_modelo?: string | null;

  // Triagem IA
  assunto: AssuntoCrm;
  confianca_ia: number;
  resumo_ia: string;
  regra_aplicada: string;

  // Kanban
  etapa_kanban: EtapaKanbanCrm;
  urgente: boolean;
  motivo_urgencia?: string | null;
  termos_criticos: string[];

  // Responsável
  responsavel_tipo: ResponsavelTipo;
  atendente_nome?: string | null;

  // Última interação (já sanitizada para LGPD)
  ultima_mensagem: string;
  snippet_lgpd: string;
  ultima_interacao_em: string;

  // Emissão CRLV-e / débitos
  valor_debitos?: number;
  status_emissao_crlve?: StatusEmissaoCrlve;

  historico_mensagens: MensagemChatCrm[];
  transicoes: TransicaoCrm[];
  criado_em: string;
  atualizado_em: string;
}

export interface ResultadoTriagem {
  tipo_cliente: TipoClienteCrm;
  mencionou_crdd: boolean;
  mencionou_grt: boolean;
  registro_crdd: string | null;
  grt_numero: string | null;
  assunto: AssuntoCrm;
  confianca_ia: number;
  etapa_destino: EtapaKanbanCrm;
  urgente: boolean;
  motivo_urgencia: string | null;
  termos_criticos: string[];
  ia_responde: boolean;
  responsavel_tipo: ResponsavelTipo;
  regra_aplicada: string;
  resumo_ia: string;
  placa: string | null;
  renavam: string | null;
  resposta_ia: string;
}

// ============================================================================
// CONFIGURAÇÃO DE RESPOSTAS INFORMATIVAS (ajuste conforme o seu CRVA)
// ============================================================================

export const CRM_INFO_CRVA = {
  horario: 'Segunda a Sexta, das 08h30 às 17h00',
  taxas:
    'Os valores seguem a tabela oficial vigente do Detran/RS; o atendente confirma o valor exato do seu serviço.',
};

const DOCUMENTOS_POR_ASSUNTO: Partial<Record<AssuntoCrm, string>> = {
  transferencia:
    'CRV/ATPV-e preenchido, documento oficial com foto do comprador e do vendedor, comprovante de residência do comprador e, se exigida, a vistoria.',
  primeiro_emplacamento:
    'Nota fiscal do veículo 0km, documento oficial com foto do proprietário e comprovante de residência.',
  vistoria:
    'Documento do veículo (CRV/CRLV), documento oficial com foto e a guia de vistoria quitada.',
  crlve_atpve: 'Placa/RENAVAM do veículo e documento oficial com foto do proprietário.',
  bloqueio_debitos: 'Placa/RENAVAM do veículo para consulta de débitos e restrições.',
};

// ============================================================================
// METADADOS VISUAIS (tags de assunto)
// ============================================================================

export const METADADOS_ASSUNTO: Record<
  AssuntoCrm,
  { tag: string; rotulo: string; cor: string }
> = {
  transferencia: {
    tag: '#Transferência',
    rotulo: 'Transferência',
    cor: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  },
  primeiro_emplacamento: {
    tag: '#PrimeiroEmplacamento',
    rotulo: 'Primeiro Emplacamento',
    cor: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  },
  vistoria: {
    tag: '#Vistoria',
    rotulo: 'Vistoria',
    cor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  },
  crlve_atpve: {
    tag: '#CRLV-e / ATPV-e',
    rotulo: 'CRLV-e / ATPV-e',
    cor: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  },
  bloqueio_debitos: {
    tag: '#Bloqueio / Débitos',
    rotulo: 'Bloqueio / Débitos',
    cor: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  },
  outros: {
    tag: '#Outros',
    rotulo: 'Outros',
    cor: 'bg-slate-700/60 text-slate-300 border-slate-600',
  },
};

export const ORDEM_ASSUNTOS: AssuntoCrm[] = [
  'transferencia',
  'primeiro_emplacamento',
  'vistoria',
  'crlve_atpve',
  'bloqueio_debitos',
  'outros',
];

// ============================================================================
// LGPD
// ============================================================================

/**
 * Oculta CPF, CNPJ, dados bancários, cartões, chaves PIX e e-mails.
 * Preserva placa e RENAVAM (dados do veículo).
 */
export function ocultarDadosSensiveis(texto: string): string {
  if (!texto) return '';

  // Protege o RENAVAM informado com a palavra-chave (11 dígitos se parece com CPF sem máscara)
  const protegidos: string[] = [];
  let saida = texto.replace(/(renavam\D{0,6})(\d{9,11})/gi, (_m, prefixo: string, numero: string) => {
    protegidos.push(`${prefixo}${numero}`);
    return `\u0001${protegidos.length - 1}\u0001`;
  });

  saida = saida
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ oculto]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF oculto]')
    .replace(/\b(ag[eê]ncia|ag\.?|conta(?: corrente)?|c\/c|cc)\s*[:\-]?\s*[\d.\-]{3,}/gi, '[dado bancário oculto]')
    .replace(/chave\s*pix\s*[:\-]?\s*\S+/gi, '[chave PIX oculta]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[cartão oculto]')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[e-mail oculto]');

  return saida.replace(/\u0001(\d+)\u0001/g, (_m, idx: string) => protegidos[Number(idx)] || '');
}

export function montarSnippetLgpd(texto: string, limite = 140): string {
  const limpo = ocultarDadosSensiveis(texto).replace(/\s+/g, ' ').trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
}

// ============================================================================
// MOTOR DE TRIAGEM IA (REGRAS DE ROTEAMENTO)
// ============================================================================

const semAcento = (s: string): string =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const TERMOS_CRITICOS: { rotulo: string; regex: RegExp }[] = [
  { rotulo: 'Inventário', regex: /inventario/ },
  { rotulo: 'Óbito', regex: /obito|falecid|faleceu|falecimento/ },
  { rotulo: 'Bloqueio judicial', regex: /bloqueio judicial|ordem judicial|restricao judicial|renajud/ },
  { rotulo: 'Leilão', regex: /leilao|arremat/ },
  { rotulo: 'Falsificação / Perícia', regex: /falsifica|pericia|adulterac|adulterad|clonad|numeracao (raspada|remarcada)/ },
];

const PADROES_ASSUNTO: [Exclude<AssuntoCrm, 'outros'>, RegExp][] = [
  ['bloqueio_debitos', /bloqueio|debito|ipva|multa|gravame|restricao|quitar|quitacao/],
  ['crlve_atpve', /crlv|atpv|licenciamento|documento digital|emitir (o )?documento/],
  ['vistoria', /vistoria|laudo|pista|ecv|reprovad|reprovou|ficha digital|pendencia de vistoria/],
  ['transferencia', /transferenc|compra e venda|comprei|vendi|passar (pro|para) (o )?meu nome|troca de proprietario/],
  ['primeiro_emplacamento', /0 ?km|zero km|primeiro emplacamento|emplacar|nota fiscal|nf-?e/],
];

const PERGUNTA_INFORMATIVA =
  /horario|que horas|funcionamento|endereco|onde fica|quais documentos|documentos? necessarios?|o que (preciso|precisa) levar|quanto custa|qual (o )?valor|qual a taxa|valor da taxa|preco/;

const ENVIO_DE_PROCESSO = /segue|anexo|enviei|enviando|em lote|lote de|encaminhando/;

const REGEX_PENDENCIA_VISTORIA = /reprovou|reprovad|pendencia|regulariz|pista|fui na vistoria/;

export function filaHumanaPorTipo(tipo: TipoClienteCrm): EtapaKanbanCrm {
  return tipo === 'despachante' ? 'fila_humana_despachante' : 'fila_humana_particular';
}

function respostaInformativa(nome: string, assunto: AssuntoCrm, t: string): string {
  const blocos: string[] = [];
  if (/horario|que horas|funcionamento|abre|fecha/.test(t)) {
    blocos.push(`• *Horário de atendimento:* ${CRM_INFO_CRVA.horario}.`);
  }
  if (/documento|levar/.test(t) || DOCUMENTOS_POR_ASSUNTO[assunto]) {
    const docs = DOCUMENTOS_POR_ASSUNTO[assunto];
    if (docs) blocos.push(`• *Documentos (orientativo):* ${docs}`);
  }
  if (/valor|custa|taxa|preco/.test(t)) {
    blocos.push(`• *Taxas:* ${CRM_INFO_CRVA.taxas}`);
  }
  if (blocos.length === 0) {
    blocos.push(`• *Horário:* ${CRM_INFO_CRVA.horario}.`);
    blocos.push(`• *Taxas:* ${CRM_INFO_CRVA.taxas}`);
  }
  return `Olá, ${nome}! 🤖 Seguem as informações do CRVA:\n${blocos.join('\n')}\nSe precisar de um atendente, é só informar a *placa* do veículo e o serviço desejado.`;
}

/**
 * Triagem da mensagem recebida. Ordem de precedência das regras:
 *  R1 despachante (CRDD/GRT) > R2 termos críticos > R3 dúvida informativa
 *  > R4 demanda de despachante > R5 roteamento por assunto.
 */
export function triarMensagem(
  mensagem: string,
  tipoHint: TipoClienteCrm,
  nome: string
): ResultadoTriagem {
  const t = semAcento(mensagem);

  const placaMatch = (mensagem || '').toUpperCase().match(/\b([A-Z]{3}-?\d[A-Z0-9]\d{2})\b/);
  const placa = placaMatch ? placaMatch[1].replace('-', '') : null;
  const renavamMatch = (mensagem || '').match(/renavam\D{0,6}(\d{9,11})/i);
  const renavam = renavamMatch ? renavamMatch[1] : null;

  // R1 — Identificação de Despachante Credenciado
  const mencionouCrdd = /\bcrdd\b/.test(t);
  const mencionouGrt = /\bgrt\b/.test(t);
  const registroCrdd = t.match(/crdd\D{0,8}(\d{3,8})/)?.[1] || null;
  const grtNumero = t.match(/grt\D{0,8}(\d{4,12})/)?.[1] || null;
  const forcaDespachante = mencionouCrdd || mencionouGrt;
  const tipo: TipoClienteCrm = forcaDespachante ? 'despachante' : tipoHint;

  // Assunto detectado
  let assunto: AssuntoCrm = 'outros';
  for (const [chave, regex] of PADROES_ASSUNTO) {
    if (regex.test(t)) {
      assunto = chave;
      break;
    }
  }
  const confianca = assunto === 'outros' ? 78.0 : 96.5;

  // R2 — Termos críticos
  const termosCriticos = TERMOS_CRITICOS.filter((x) => x.regex.test(t)).map((x) => x.rotulo);
  const urgente = termosCriticos.length > 0;

  const base = {
    tipo_cliente: tipo,
    mencionou_crdd: mencionouCrdd,
    mencionou_grt: mencionouGrt,
    registro_crdd: registroCrdd,
    grt_numero: grtNumero,
    assunto,
    confianca_ia: confianca,
    termos_criticos: termosCriticos,
    placa,
    renavam,
  };

  const tag = METADADOS_ASSUNTO[assunto].tag;
  const canal = tipo === 'despachante' ? 'Despachante' : 'Particular';
  const sufixoVeiculo = placa ? ` • Placa ${placa}` : '';

  if (urgente) {
    return {
      ...base,
      etapa_destino: filaHumanaPorTipo(tipo),
      urgente: true,
      motivo_urgencia: termosCriticos.join(', '),
      ia_responde: false,
      responsavel_tipo: 'ia',
      regra_aplicada: 'R2 · Termo crítico → Fila Humana (urgente)',
      resumo_ia: `🚨 URGENTE (${termosCriticos.join(', ')}) • ${tag} • ${canal}${sufixoVeiculo}`,
      resposta_ia: `Olá, ${nome}! 🤖 Seu caso exige análise especializada. Já o encaminhei com *prioridade* para um atendente humano do CRVA, que falará com você em seguida.`,
    };
  }

  const envio = ENVIO_DE_PROCESSO.test(t);

  // R3 — Dúvida informativa respondida pela IA
  if (PERGUNTA_INFORMATIVA.test(t) && !envio) {
    return {
      ...base,
      etapa_destino: 'triagem_ia',
      urgente: false,
      motivo_urgencia: null,
      ia_responde: true,
      responsavel_tipo: 'ia',
      regra_aplicada: 'R3 · Dúvida informativa → IA responde',
      resumo_ia: `Dúvida informativa • ${tag} • ${canal}${sufixoVeiculo}`,
      resposta_ia: respostaInformativa(nome, assunto, t),
    };
  }

  // R4 — Demanda técnica de despachante
  if (tipo === 'despachante') {
    return {
      ...base,
      etapa_destino: 'fila_humana_despachante',
      urgente: false,
      motivo_urgencia: null,
      ia_responde: false,
      responsavel_tipo: 'ia',
      regra_aplicada: forcaDespachante
        ? 'R1 · CRDD/GRT → Fila Humana Despachante'
        : 'R4 · Perfil Despachante → Fila Humana Despachante',
      resumo_ia: `${tag} • Despachante credenciado${grtNumero ? ` • GRT ${grtNumero}` : ''}${sufixoVeiculo}`,
      resposta_ia: `Olá, ${nome}! 🤖 Identifiquei sua demanda como *Despachante Credenciado*${
        grtNumero ? ` (GRT ${grtNumero})` : ''
      }. Encaminhei para a *Fila Humana — Despachante* para atendimento técnico.`,
    };
  }

  // R5 — Roteamento por assunto (Particular)
  let etapa: EtapaKanbanCrm = 'triagem_ia';
  let regra = 'R5 · Assunto indefinido → permanece em Triagem IA';
  let resposta = `Olá, ${nome}! 🤖 Para agilizar, informe a *placa do veículo* e o serviço desejado (transferência, vistoria, CRLV-e ou débitos).`;

  if (assunto === 'bloqueio_debitos' || assunto === 'crlve_atpve') {
    etapa = 'fila_humana_particular';
    regra = 'R5 · CRLV-e / Débitos → Fila Humana Particular';
    resposta = `Olá, ${nome}! 🤖 Identifiquei *${METADADOS_ASSUNTO[assunto].rotulo}*${
      placa ? ` do veículo *${placa}*` : ''
    }. Encaminhei para a *Fila Humana — Particular*; um atendente fará a conferência e retorna por aqui.`;
  } else if (assunto === 'vistoria') {
    if (REGEX_PENDENCIA_VISTORIA.test(t)) {
      etapa = 'analise_vistoria';
      regra = 'R5 · Pendência de vistoria → Em Análise / Pista';
      resposta = `Olá, ${nome}! 🤖 Registrei a pendência de vistoria${
        placa ? ` do veículo *${placa}*` : ''
      } e movi seu caso para *Análise / Pista de Vistoria*.`;
    } else {
      etapa = 'triagem_ia';
      regra = 'R5 · Vistoria sem pendência → IA orienta';
      resposta = `Olá, ${nome}! 🤖 Sobre *vistoria*, você precisa de: ${DOCUMENTOS_POR_ASSUNTO.vistoria}`;
    }
  } else if (assunto === 'transferencia' || assunto === 'primeiro_emplacamento') {
    etapa = 'aguardando_documentacao';
    regra = 'R5 · Transferência/Emplacamento → Aguardando Documentação';
    resposta = `Olá, ${nome}! 🤖 Para *${METADADOS_ASSUNTO[assunto].rotulo}*, envie por aqui: ${DOCUMENTOS_POR_ASSUNTO[assunto]} Assim que recebermos, um atendente fará a conferência.`;
  }

  return {
    ...base,
    etapa_destino: etapa,
    urgente: false,
    motivo_urgencia: null,
    ia_responde: etapa === 'triagem_ia' || etapa === 'aguardando_documentacao',
    responsavel_tipo: 'ia',
    regra_aplicada: regra,
    resumo_ia: `${tag} • ${canal}${sufixoVeiculo}`,
    resposta_ia: resposta,
  };
}

/**
 * Valida movimentos manuais (separação estrita Particular × Despachante).
 * Retorna a mensagem de erro, ou null se permitido.
 */
export function validarMovimento(card: AtendimentoCrm, destino: EtapaKanbanCrm): string | null {
  if (destino === 'fila_humana_particular' && card.tipo_cliente === 'despachante') {
    return 'Atendimento de Despachante só pode ir para a "Fila Humana — Despachante".';
  }
  if (destino === 'fila_humana_despachante' && card.tipo_cliente === 'particular') {
    return 'Atendimento Particular só pode ir para a "Fila Humana — Particular".';
  }
  return null;
}

// ============================================================================
// DADOS INICIAIS (DEMONSTRAÇÃO)
// ============================================================================

const minutosAtras = (min: number): string => new Date(Date.now() - min * 60000).toISOString();
const horaCurta = (iso: string): string =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function montarSeed(p: {
  id: string;
  protocolo: string;
  tipo: TipoClienteCrm;
  nome: string;
  telefone: string;
  documento?: string;
  placa?: string;
  renavam?: string;
  modelo?: string;
  mensagem: string;
  minutos: number;
  etapa: EtapaKanbanCrm;
  atendente?: string;
  valorDebitos?: number;
  statusCrlve?: StatusEmissaoCrlve;
}): AtendimentoCrm {
  const tri = triarMensagem(p.mensagem, p.tipo, p.nome);
  const instante = minutosAtras(p.minutos);
  const humano = Boolean(p.atendente);
  return {
    id: p.id,
    protocolo: p.protocolo,
    tipo_cliente: tri.tipo_cliente,
    registro_crdd: tri.registro_crdd,
    grt_numero: tri.grt_numero,
    mencionou_crdd: tri.mencionou_crdd,
    mencionou_grt: tri.mencionou_grt,
    cliente_nome: p.nome,
    cliente_telefone: p.telefone,
    cliente_documento: p.documento || null,
    despachante_nome: tri.tipo_cliente === 'despachante' ? p.nome : null,
    veiculo_placa: p.placa || tri.placa,
    veiculo_renavam: p.renavam || tri.renavam,
    veiculo_modelo: p.modelo || null,
    assunto: tri.assunto,
    confianca_ia: tri.confianca_ia,
    resumo_ia: tri.resumo_ia,
    regra_aplicada: tri.regra_aplicada,
    etapa_kanban: p.etapa,
    urgente: tri.urgente,
    motivo_urgencia: tri.motivo_urgencia,
    termos_criticos: tri.termos_criticos,
    responsavel_tipo: humano ? 'humano' : 'ia',
    atendente_nome: p.atendente || null,
    ultima_mensagem: p.mensagem,
    snippet_lgpd: montarSnippetLgpd(p.mensagem),
    ultima_interacao_em: instante,
    valor_debitos: p.valorDebitos || 0,
    status_emissao_crlve: p.statusCrlve || 'pendente',
    historico_mensagens: [
      {
        id: `${p.id}-m1`,
        remetente: 'cliente',
        autor_nome: p.nome,
        texto: p.mensagem,
        horario: horaCurta(instante),
      },
      {
        id: `${p.id}-m2`,
        remetente: 'ia',
        autor_nome: 'Agente IA Integra',
        texto: tri.resposta_ia,
        horario: horaCurta(instante),
      },
    ],
    transicoes: [
      {
        de: null,
        para: p.etapa,
        motivo: tri.regra_aplicada,
        origem: 'ia',
        em: instante,
      },
    ],
    criado_em: minutosAtras(p.minutos + 5),
    atualizado_em: instante,
  };
}

function gerarSeeds(): AtendimentoCrm[] {
  return [
    montarSeed({
      id: 'crm-v2-1',
      protocolo: '#CRM-P101',
      tipo: 'particular',
      nome: 'Carlos Eduardo Menezes',
      telefone: '(51) 99812-4410',
      mensagem: 'Boa tarde! Qual o horário de funcionamento e quais documentos preciso levar para a vistoria?',
      minutos: 3,
      etapa: 'triagem_ia',
    }),
    montarSeed({
      id: 'crm-v2-2',
      protocolo: '#CRM-P102',
      tipo: 'particular',
      nome: 'Juliana Martins Costa',
      telefone: '(51) 99604-1190',
      documento: '019.443.810-72',
      placa: 'IWT2C19',
      modelo: 'Jeep Compass Longitude',
      mensagem: 'Comprei o Compass e quero fazer a transferência. Vou enviar o comprovante de residência amanhã.',
      minutos: 42,
      etapa: 'aguardando_documentacao',
    }),
    montarSeed({
      id: 'crm-v2-3',
      protocolo: '#CRM-P103',
      tipo: 'particular',
      nome: 'Fernanda Siqueira Dorneles',
      telefone: '(51) 99145-8821',
      documento: '031.552.710-88',
      placa: 'JBC9A12',
      renavam: '01187423901',
      modelo: 'Chevrolet Onix Plus Premier',
      mensagem:
        'Paguei o licenciamento pelo app do banco, conseguem emitir meu CRLV-e? CPF 031.552.710-88 RENAVAM 01187423901 placa JBC9A12',
      minutos: 9,
      etapa: 'fila_humana_particular',
      atendente: 'Patrícia Balcão',
      valorDebitos: 98.4,
      statusCrlve: 'consultando_detran',
    }),
    montarSeed({
      id: 'crm-v2-4',
      protocolo: '#CRM-P104',
      tipo: 'particular',
      nome: 'Marcos Antônio Pereira',
      telefone: '(51) 99777-2034',
      documento: '555.222.111-09',
      placa: 'IRT5F20',
      modelo: 'Fiat Argo Drive',
      mensagem: 'Meu pai faleceu e o carro está em inventário. Como faço para transferir o veículo?',
      minutos: 6,
      etapa: 'fila_humana_particular',
    }),
    montarSeed({
      id: 'crm-v2-5',
      protocolo: '#CRM-D201',
      tipo: 'despachante',
      nome: 'Despachante Central Ltda',
      telefone: '(51) 99988-7766',
      documento: '12.345.678/0001-90',
      placa: 'JDP8H44',
      modelo: 'Scania R450 A6x2',
      mensagem: 'Bom dia! Segue GRT 4482913 do lote de 4 transferências, registro no CRDD 1022.',
      minutos: 14,
      etapa: 'fila_humana_despachante',
      atendente: 'Patrícia Balcão',
    }),
    montarSeed({
      id: 'crm-v2-6',
      protocolo: '#CRM-D202',
      tipo: 'despachante',
      nome: 'Despachante Rápido Sul',
      telefone: '(51) 99711-3090',
      documento: '98.765.432/0001-10',
      placa: 'IVM3B71',
      modelo: 'Fiat Strada Freedom CD',
      mensagem: 'Esse veículo veio de leilão, precisamos checar bloqueio antes da GRT.',
      minutos: 2,
      etapa: 'fila_humana_despachante',
    }),
    montarSeed({
      id: 'crm-v2-7',
      protocolo: '#CRM-P105',
      tipo: 'particular',
      nome: 'Roberto Vasconcelos',
      telefone: '(55) 98118-2341',
      documento: '784.112.390-04',
      placa: 'IRS7G88',
      modelo: 'Toyota Hilux SRX 4x4',
      mensagem: 'A vistoria reprovou por pendência na numeração do motor, vou regularizar na pista.',
      minutos: 95,
      etapa: 'analise_vistoria',
      atendente: 'Patrícia Balcão',
    }),
    montarSeed({
      id: 'crm-v2-8',
      protocolo: '#CRM-P106',
      tipo: 'particular',
      nome: 'Ana Paula Ribeiro',
      telefone: '(51) 99320-5511',
      placa: 'JAB1C23',
      modelo: 'Hyundai HB20 Vision',
      mensagem: 'Recebi o CRLV-e certinho, muito obrigada pelo atendimento!',
      minutos: 240,
      etapa: 'concluido',
      atendente: 'Patrícia Balcão',
      statusCrlve: 'crlve_enviado',
    }),
  ];
}

// ============================================================================
// PERSISTÊNCIA (Supabase + cache local resiliente)
// ============================================================================

const STORAGE_KEY_CRM = 'marks_crm_integra_atendimentos_v2';

function lerCacheLocal(): AtendimentoCrm[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CRM);
    if (!raw) {
      const seeds = gerarSeeds();
      localStorage.setItem(STORAGE_KEY_CRM, JSON.stringify(seeds));
      return seeds;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : gerarSeeds();
  } catch {
    return gerarSeeds();
  }
}

function salvarCacheLocal(lista: AtendimentoCrm[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CRM, JSON.stringify(lista));
  } catch {
    // ignora estouro de quota
  }
}

function paraLinhaBanco(a: AtendimentoCrm): Record<string, any> {
  return {
    id: a.id,
    protocolo: a.protocolo,
    tipo_cliente: a.tipo_cliente,
    registro_crdd: a.registro_crdd || null,
    grt_numero: a.grt_numero || null,
    mencionou_crdd: a.mencionou_crdd,
    mencionou_grt: a.mencionou_grt,
    cliente_nome: a.cliente_nome,
    cliente_telefone: a.cliente_telefone,
    cliente_documento: a.cliente_documento || null,
    despachante_nome: a.despachante_nome || null,
    veiculo_placa: a.veiculo_placa || null,
    veiculo_renavam: a.veiculo_renavam || null,
    veiculo_modelo: a.veiculo_modelo || null,
    assunto: a.assunto,
    confianca_ia: a.confianca_ia,
    resumo_ia: a.resumo_ia,
    regra_aplicada: a.regra_aplicada,
    etapa_kanban: a.etapa_kanban,
    urgente: a.urgente,
    motivo_urgencia: a.motivo_urgencia || null,
    termos_criticos: a.termos_criticos,
    responsavel_tipo: a.responsavel_tipo,
    atendente_nome: a.atendente_nome || null,
    ultima_mensagem: a.ultima_mensagem,
    snippet_lgpd: a.snippet_lgpd,
    ultima_interacao_em: a.ultima_interacao_em,
    valor_debitos: a.valor_debitos || 0,
    status_emissao_crlve: a.status_emissao_crlve || 'pendente',
    historico_mensagens: a.historico_mensagens,
    transicoes: a.transicoes,
    criado_em: a.criado_em,
    atualizado_em: a.atualizado_em,
  };
}

const ETAPAS_VALIDAS: EtapaKanbanCrm[] = [
  'triagem_ia',
  'aguardando_documentacao',
  'fila_humana_particular',
  'fila_humana_despachante',
  'analise_vistoria',
  'concluido',
];

function deLinhaBanco(row: any): AtendimentoCrm {
  const tipo: TipoClienteCrm = row.tipo_cliente === 'despachante' ? 'despachante' : 'particular';

  // Compatibilidade com etapas da versão anterior do CRM
  let etapa = row.etapa_kanban as string;
  if (etapa === 'transbordo_crlve' || etapa === 'em_atendimento') etapa = filaHumanaPorTipo(tipo);
  if (etapa === 'aguardando_cliente') etapa = 'aguardando_documentacao';
  if (!ETAPAS_VALIDAS.includes(etapa as EtapaKanbanCrm)) etapa = 'triagem_ia';

  const mapaIntencaoLegado: Record<string, AssuntoCrm> = {
    debitos_crlve: 'crlve_atpve',
    vistoria_veicular: 'vistoria',
    transferencia_atpve: 'transferencia',
    primeiro_emplacamento: 'primeiro_emplacamento',
  };
  const assunto: AssuntoCrm =
    (row.assunto as AssuntoCrm) || mapaIntencaoLegado[row.intencao_ia as string] || 'outros';

  const ultima = row.ultima_mensagem || '';
  return {
    id: row.id,
    protocolo: row.protocolo || '#CRM-100',
    tipo_cliente: tipo,
    registro_crdd: row.registro_crdd || null,
    grt_numero: row.grt_numero || null,
    mencionou_crdd: Boolean(row.mencionou_crdd),
    mencionou_grt: Boolean(row.mencionou_grt),
    cliente_nome: row.cliente_nome,
    cliente_telefone: row.cliente_telefone,
    cliente_documento: row.cliente_documento || null,
    despachante_nome: row.despachante_nome || null,
    veiculo_placa: row.veiculo_placa || null,
    veiculo_renavam: row.veiculo_renavam || null,
    veiculo_modelo: row.veiculo_modelo || null,
    assunto,
    confianca_ia: Number(row.confianca_ia || 90),
    resumo_ia: row.resumo_ia || '',
    regra_aplicada: row.regra_aplicada || 'Registro importado',
    etapa_kanban: etapa as EtapaKanbanCrm,
    urgente: Boolean(row.urgente),
    motivo_urgencia: row.motivo_urgencia || null,
    termos_criticos: Array.isArray(row.termos_criticos) ? row.termos_criticos : [],
    responsavel_tipo: row.atendente_nome ? 'humano' : 'ia',
    atendente_nome: row.atendente_nome || null,
    ultima_mensagem: ultima,
    snippet_lgpd: row.snippet_lgpd || montarSnippetLgpd(ultima),
    ultima_interacao_em: row.ultima_interacao_em || row.criado_em || new Date().toISOString(),
    valor_debitos: Number(row.valor_debitos || 0),
    status_emissao_crlve: row.status_emissao_crlve || 'pendente',
    historico_mensagens: Array.isArray(row.historico_mensagens) ? row.historico_mensagens : [],
    transicoes: Array.isArray(row.transicoes) ? row.transicoes : [],
    criado_em: row.criado_em || new Date().toISOString(),
    atualizado_em: row.atualizado_em || new Date().toISOString(),
  };
}

async function sincronizarSupabase(a: AtendimentoCrm): Promise<void> {
  try {
    const { error } = await supabase.from('crm_atendimentos').upsert(paraLinhaBanco(a));
    if (error) {
      console.warn('[crmService] Supabase indisponível/estrutura desatualizada (usando cache local):', error.message);
    }
  } catch (err) {
    console.warn('[crmService] Falha ao sincronizar com Supabase:', err);
  }
}

function registrarTransicao(
  atual: AtendimentoCrm,
  para: EtapaKanbanCrm,
  motivo: string,
  origem: TransicaoCrm['origem']
): TransicaoCrm[] {
  if (atual.etapa_kanban === para) return atual.transicoes;
  return [
    ...atual.transicoes,
    { de: atual.etapa_kanban, para, motivo, origem, em: new Date().toISOString() },
  ];
}

export async function listarAtendimentosCrm(): Promise<AtendimentoCrm[]> {
  try {
    const { data, error } = await supabase
      .from('crm_atendimentos')
      .select('*')
      .order('ultima_interacao_em', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      const normalizados = data.map(deLinhaBanco);
      salvarCacheLocal(normalizados);
      return normalizados;
    }
  } catch (err) {
    console.warn('[crmService] Usando cache operacional do CRM:', err);
  }
  return lerCacheLocal();
}

// ============================================================================
// OPERAÇÕES
// ============================================================================

export async function criarAtendimentoTriagemIA(input: {
  cliente_nome: string;
  cliente_telefone: string;
  cliente_documento?: string;
  tipo_cliente: TipoClienteCrm;
  veiculo_placa?: string;
  veiculo_modelo?: string;
  veiculo_renavam?: string;
  mensagem_inicial: string;
  disparar_boas_vindas_whatsapp?: boolean;
}): Promise<AtendimentoCrm> {
  const atuais = lerCacheLocal();
  const tri = triarMensagem(input.mensagem_inicial, input.tipo_cliente, input.cliente_nome);

  const prefixo = tri.tipo_cliente === 'despachante' ? '#CRM-D' : '#CRM-P';
  let maior = tri.tipo_cliente === 'despachante' ? 200 : 100;
  for (const item of atuais) {
    if (item.protocolo.startsWith(prefixo)) {
      const n = parseInt(item.protocolo.replace(prefixo, ''), 10);
      if (!isNaN(n) && n > maior) maior = n;
    }
  }

  const agoraIso = new Date().toISOString();
  const placa =
    (input.veiculo_placa || tri.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;

  // Geração de resposta dinâmica pelo Motor de IA ativo (Gemini / Groq) com fallback na heurística
  let respostaIaFinal = tri.resposta_ia;
  try {
    const aiResp = await Promise.race([
      generateAiResponse({
        systemPrompt: `Você é a IA de triagem e atendimento oficial de um CRVA (Centro de Registro de Veículos Automotores) credenciado ao Detran/RS.
Cliente: ${input.cliente_nome}.
Perfil: ${input.tipo_cliente === 'despachante' ? 'DESPACHANTE CREDENCIADO (CRDD/GRT)' : 'PARTICULAR'}.
Assunto identificado: ${tri.assunto}.
Diretriz de tom: Cordial, profissional, prestativo e sucinto (máximo 2 parágrafos curtos).
Se for despachante, mencione conferência de GRT e atendimento dedicado a processos veiculares.
Se for urgência jurídica (óbito, inventário, bloqueio), informe com empatia que o processo passará por análise especializada de um identificador veicular (IVD) humano.`,
        userMessage: input.mensagem_inicial,
        temperature: 0.3,
        maxTokens: 300,
      }),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout IA')), 4000)),
    ]);
    if (aiResp && aiResp.text) {
      respostaIaFinal = aiResp.text.trim();
    }
  } catch (e) {
    console.debug('[crmService] Utilizando resposta heurística pré-formatada:', e);
  }

  const novo: AtendimentoCrm = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `crm-${Date.now()}`,
    protocolo: `${prefixo}${maior + 1}`,
    tipo_cliente: tri.tipo_cliente,
    registro_crdd: tri.registro_crdd,
    grt_numero: tri.grt_numero,
    mencionou_crdd: tri.mencionou_crdd,
    mencionou_grt: tri.mencionou_grt,
    cliente_nome: input.cliente_nome.trim(),
    cliente_telefone: input.cliente_telefone.trim(),
    cliente_documento: input.cliente_documento?.trim() || null,
    despachante_nome: tri.tipo_cliente === 'despachante' ? input.cliente_nome.trim() : null,
    veiculo_placa: placa,
    veiculo_renavam: input.veiculo_renavam?.trim() || tri.renavam,
    veiculo_modelo: input.veiculo_modelo?.trim() || null,
    assunto: tri.assunto,
    confianca_ia: tri.confianca_ia,
    resumo_ia: tri.resumo_ia,
    regra_aplicada: tri.regra_aplicada,
    etapa_kanban: tri.etapa_destino,
    urgente: tri.urgente,
    motivo_urgencia: tri.motivo_urgencia,
    termos_criticos: tri.termos_criticos,
    responsavel_tipo: 'ia',
    atendente_nome: null,
    ultima_mensagem: input.mensagem_inicial.trim(),
    snippet_lgpd: montarSnippetLgpd(input.mensagem_inicial),
    ultima_interacao_em: agoraIso,
    valor_debitos: 0,
    status_emissao_crlve: 'pendente',
    historico_mensagens: [
      {
        id: `msg-${Date.now()}-1`,
        remetente: 'cliente',
        autor_nome: input.cliente_nome,
        texto: input.mensagem_inicial.trim(),
        horario: horaCurta(agoraIso),
      },
      {
        id: `msg-${Date.now()}-2`,
        remetente: 'ia',
        autor_nome: 'Agente IA Integra',
        texto: respostaIaFinal,
        horario: horaCurta(agoraIso),
      },
    ],
    transicoes: [{ de: null, para: tri.etapa_destino, motivo: tri.regra_aplicada, origem: 'ia', em: agoraIso }],
    criado_em: agoraIso,
    atualizado_em: agoraIso,
  };

  salvarCacheLocal([novo, ...atuais]);
  await sincronizarSupabase(novo);

  if (input.disparar_boas_vindas_whatsapp && input.cliente_telefone) {
    try {
      await sendWhatsAppMessage({
        remoteJid: input.cliente_telefone,
        texto: respostaIaFinal,
        origem: 'ia',
        atendimentoId: novo.id,
      });
    } catch (e) {
      console.warn('[crmService] Aviso ao enviar resposta automática no WhatsApp via fila:', e);
    }
  }

  return novo;
}

/**
 * Move o card de coluna (manual ou automático). Retorna null se o movimento for inválido.
 */
export async function moverEtapaKanbanCrm(
  id: string,
  novaEtapa: EtapaKanbanCrm,
  atendenteNome?: string,
  origem: TransicaoCrm['origem'] = 'operador',
  motivo = 'Movido manualmente pelo operador'
): Promise<AtendimentoCrm | null> {
  const lista = lerCacheLocal();
  const idx = lista.findIndex((item) => item.id === id);
  if (idx === -1) return null;

  const atual = lista[idx];
  if (validarMovimento(atual, novaEtapa)) return null;

  const agoraIso = new Date().toISOString();
  const humanoAssume = origem === 'operador' && novaEtapa !== 'triagem_ia';
  const atualizado: AtendimentoCrm = {
    ...atual,
    etapa_kanban: novaEtapa,
    transicoes: registrarTransicao(atual, novaEtapa, motivo, origem),
    responsavel_tipo: humanoAssume ? 'humano' : atual.responsavel_tipo,
    atendente_nome: humanoAssume ? atendenteNome || atual.atendente_nome || 'Operador CRVA' : atual.atendente_nome,
    status_emissao_crlve:
      novaEtapa === 'concluido' && atual.status_emissao_crlve && atual.assunto === 'crlve_atpve'
        ? 'crlve_enviado'
        : atual.status_emissao_crlve,
    atualizado_em: agoraIso,
  };

  lista[idx] = atualizado;
  salvarCacheLocal(lista);
  await sincronizarSupabase(atualizado);
  return atualizado;
}

/**
 * Trigger de mensagem recebida: reavalia triagem e transição automática de coluna.
 *  - Termo crítico em qualquer etapa => Fila Humana + urgência.
 *  - Mensagem recebida em "Aguardando Documentação" => Fila Humana (conferência).
 *  - Mensagem em "Concluído" => reabre conforme a triagem.
 *  - CRDD/GRT detectado => migra para o perfil Despachante.
 */
export async function registrarMensagemRecebida(
  id: string,
  texto: string
): Promise<AtendimentoCrm | null> {
  const lista = lerCacheLocal();
  const idx = lista.findIndex((item) => item.id === id);
  if (idx === -1) return null;

  const atual = lista[idx];
  const tri = triarMensagem(texto, atual.tipo_cliente, atual.cliente_nome);
  const tipo: TipoClienteCrm = tri.tipo_cliente === 'despachante' ? 'despachante' : atual.tipo_cliente;

  let destino: EtapaKanbanCrm = atual.etapa_kanban;
  let motivo = 'Nova mensagem recebida';

  if (tri.urgente) {
    destino = filaHumanaPorTipo(tipo);
    motivo = `Termo crítico: ${tri.motivo_urgencia}`;
  } else if (atual.etapa_kanban === 'aguardando_documentacao') {
    destino = filaHumanaPorTipo(tipo);
    motivo = 'Cidadão respondeu/enviou documentos → conferência humana';
  } else if (atual.etapa_kanban === 'concluido') {
    destino = tri.etapa_destino;
    motivo = 'Atendimento reaberto por nova mensagem';
  } else if (atual.etapa_kanban === 'triagem_ia') {
    destino = tri.etapa_destino;
    motivo = tri.regra_aplicada;
  }

  // Garante a separação Particular × Despachante nas filas humanas
  if (tipo === 'despachante' && destino === 'fila_humana_particular') destino = 'fila_humana_despachante';

  const agoraIso = new Date().toISOString();
  const mensagens: MensagemChatCrm[] = [
    ...atual.historico_mensagens,
    {
      id: `msg-${Date.now()}-c`,
      remetente: 'cliente',
      autor_nome: atual.cliente_nome,
      texto,
      horario: horaCurta(agoraIso),
    },
  ];

  if (destino === 'triagem_ia' && tri.ia_responde) {
    mensagens.push({
      id: `msg-${Date.now()}-ia`,
      remetente: 'ia',
      autor_nome: 'Agente IA Integra',
      texto: tri.resposta_ia,
      horario: horaCurta(agoraIso),
    });
  }

  const atualizado: AtendimentoCrm = {
    ...atual,
    tipo_cliente: tipo,
    despachante_nome: tipo === 'despachante' ? atual.despachante_nome || atual.cliente_nome : null,
    mencionou_crdd: atual.mencionou_crdd || tri.mencionou_crdd,
    mencionou_grt: atual.mencionou_grt || tri.mencionou_grt,
    registro_crdd: tri.registro_crdd || atual.registro_crdd,
    grt_numero: tri.grt_numero || atual.grt_numero,
    veiculo_placa: atual.veiculo_placa || tri.placa,
    veiculo_renavam: atual.veiculo_renavam || tri.renavam,
    assunto: tri.assunto !== 'outros' ? tri.assunto : atual.assunto,
    urgente: atual.urgente || tri.urgente,
    motivo_urgencia: tri.urgente ? tri.motivo_urgencia : atual.motivo_urgencia,
    termos_criticos: Array.from(new Set([...atual.termos_criticos, ...tri.termos_criticos])),
    etapa_kanban: destino,
    transicoes: registrarTransicao(atual, destino, motivo, 'ia'),
    ultima_mensagem: texto,
    snippet_lgpd: montarSnippetLgpd(texto),
    ultima_interacao_em: agoraIso,
    historico_mensagens: mensagens,
    atualizado_em: agoraIso,
  };

  lista[idx] = atualizado;
  salvarCacheLocal(lista);
  await sincronizarSupabase(atualizado);
  return atualizado;
}

export async function enviarMensagemAtendenteCrm(params: {
  atendimentoId: string;
  texto: string;
  atendenteNome: string;
  dispararWhatsApp?: boolean;
  novoStatusCrlve?: StatusEmissaoCrlve;
  valorDebitos?: number;
}): Promise<{ atendimento: AtendimentoCrm | null; enviadoWhatsApp: boolean }> {
  const lista = lerCacheLocal();
  const idx = lista.findIndex((item) => item.id === params.atendimentoId);
  if (idx === -1) return { atendimento: null, enviadoWhatsApp: false };

  const alvo = lista[idx];
  const agoraIso = new Date().toISOString();

  let enviadoWhats = false;
  if (params.dispararWhatsApp !== false && alvo.cliente_telefone) {
    try {
      const resp = await sendWhatsAppMessage({
        remoteJid: alvo.cliente_telefone,
        texto: params.texto,
        origem: 'humano',
        atendenteNome: params.atendenteNome,
        atendimentoId: alvo.id,
      });
      enviadoWhats = resp.sucesso;
    } catch {
      enviadoWhats = false;
    }
  }

  const atualizado: AtendimentoCrm = {
    ...alvo,
    responsavel_tipo: 'humano',
    atendente_nome: params.atendenteNome || alvo.atendente_nome || 'Especialista CRVA',
    status_emissao_crlve: params.novoStatusCrlve || alvo.status_emissao_crlve,
    valor_debitos: params.valorDebitos !== undefined ? params.valorDebitos : alvo.valor_debitos,
    ultima_mensagem: params.texto,
    snippet_lgpd: montarSnippetLgpd(params.texto),
    ultima_interacao_em: agoraIso,
    historico_mensagens: [
      ...alvo.historico_mensagens,
      {
        id: `msg-${Date.now()}`,
        remetente: 'atendente',
        autor_nome: params.atendenteNome || 'Especialista CRVA',
        texto: params.texto,
        horario: horaCurta(agoraIso),
        enviado_whatsapp: enviadoWhats,
      },
    ],
    atualizado_em: agoraIso,
  };

  lista[idx] = atualizado;
  salvarCacheLocal(lista);
  await sincronizarSupabase(atualizado);
  return { atendimento: atualizado, enviadoWhatsApp: enviadoWhats };
}

export async function excluirAtendimentoCrm(id: string): Promise<void> {
  salvarCacheLocal(lerCacheLocal().filter((item) => item.id !== id));
  try {
    await supabase.from('crm_atendimentos').delete().eq('id', id);
  } catch (err) {
    console.warn('[crmService] Exclusão aplicada apenas no cache local:', err);
  }
}
