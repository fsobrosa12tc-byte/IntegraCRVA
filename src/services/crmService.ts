/**
 * ============================================================================
 * MARKS SYSTEMS · CRM-INTEGRA · SERVIÇO DE TRIAGEM IA & KANBAN WHATSAPP
 * ============================================================================
 * Gerencia conversas oriundas do WhatsApp, classificação automática de intenções
 * por IA, separação estrita entre Particulares (B2C) e Despachantes (B2B),
 * e fila exclusiva de transbordo para solicitações de "Débitos / CRLV-e".
 * ============================================================================
 */

import { supabase } from '../lib/supabase';
import { enviarTextoDireto } from './evolutionApi';

export type TipoClienteCrm = 'particular' | 'despachante';

export type EtapaKanbanCrm =
  | 'triagem_ia'
  | 'transbordo_crlve'
  | 'em_atendimento'
  | 'aguardando_cliente'
  | 'concluido';

export type IntencaoIaCrm =
  | 'debitos_crlve'
  | 'vistoria_veicular'
  | 'transferencia_atpve'
  | 'primeiro_emplacamento'
  | 'segunda_via_placa'
  | 'baixa_comunicado'
  | 'faturamento_b2b'
  | 'duvida_geral';

export type PrioridadeCrm = 'baixa' | 'normal' | 'alta' | 'urgente';

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

export interface AtendimentoCrm {
  id: string;
  protocolo: string;
  cliente_nome: string;
  cliente_telefone: string;
  cliente_documento?: string | null;
  tipo_cliente: TipoClienteCrm;
  despachante_nome?: string | null;
  veiculo_placa?: string | null;
  veiculo_modelo?: string | null;
  veiculo_renavam?: string | null;
  intencao_ia: IntencaoIaCrm;
  intencao_rotulo: string;
  confianca_ia: number;
  resumo_ia: string;
  etapa_kanban: EtapaKanbanCrm;
  fila_transbordo_crlve: boolean;
  prioridade: PrioridadeCrm;
  valor_debitos?: number;
  status_emissao_crlve?: StatusEmissaoCrlve;
  atendente_nome?: string | null;
  ultima_mensagem: string;
  ultima_interacao_em: string;
  historico_mensagens: MensagemChatCrm[];
  criado_em: string;
  atualizado_em: string;
}

export interface ResultadoClassificacaoIA {
  intencao_ia: IntencaoIaCrm;
  intencao_rotulo: string;
  confianca_ia: number;
  resumo_ia: string;
  etapa_sugerida: EtapaKanbanCrm;
  fila_transbordo_crlve: boolean;
  prioridade_sugerida: PrioridadeCrm;
  placa_extraida?: string | null;
  renavam_extraido?: string | null;
  resposta_automatica_ia: string;
}

const STORAGE_KEY_CRM = 'marks_crm_integra_atendimentos_v1';

export const METADADOS_INTENCOES_IA: Record<
  IntencaoIaCrm,
  { rotulo: string; corBadge: string; icone: string }
> = {
  debitos_crlve: {
    rotulo: 'Débitos / Emissão CRLV-e',
    corBadge: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    icone: '📄',
  },
  vistoria_veicular: {
    rotulo: 'Vistoria de Identificação',
    corBadge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    icone: '🚗',
  },
  transferencia_atpve: {
    rotulo: 'Transferência / ATPV-e',
    corBadge: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
    icone: '🔄',
  },
  primeiro_emplacamento: {
    rotulo: 'Primeiro Emplacamento 0km',
    corBadge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
    icone: '✨',
  },
  segunda_via_placa: {
    rotulo: '2ª Via / Placa Mercosul',
    corBadge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
    icone: '🔢',
  },
  baixa_comunicado: {
    rotulo: 'Comunicado de Venda / Baixa',
    corBadge: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
    icone: '📋',
  },
  faturamento_b2b: {
    rotulo: 'Lote / Faturamento B2B',
    corBadge: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
    icone: '🏢',
  },
  duvida_geral: {
    rotulo: 'Dúvida Informativa (IA Respondeu)',
    corBadge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    icone: '🤖',
  },
};

/**
 * Motor NLP de Triagem IA para mensagens recebidas via WhatsApp
 * - Dúvidas informativas (horários, documentos necessários, taxas) -> IA responde automaticamente.
 * - Solicitação de CRLV-e ou Consulta de Débitos -> Movido automaticamente para a fila "📄 Fila: Débitos & CRLV-e" aguardando operador.
 */
export function classificarIntencaoWhatsApp(
  mensagem: string,
  tipoCliente: TipoClienteCrm,
  clienteNome: string
): ResultadoClassificacaoIA {
  const txt = (mensagem || '').toLowerCase();

  // Extração automática de Placa (Mercosul ou Antiga)
  const matchPlaca = mensagem
    .toUpperCase()
    .match(/\b([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})\b/);
  const placaExtraida = matchPlaca ? matchPlaca[1].replace(/[-\s]/g, '') : null;

  // Extração automática de RENAVAM (9 a 11 dígitos)
  const matchRenavam = mensagem.match(/\b(\d{9,11})\b/);
  const renavamExtraido = matchRenavam ? matchRenavam[1] : null;

  // 1. Detecção prioritária: Solicitação de CRLV-e ou Consulta de Débitos -> Movido automaticamente para "📄 Fila: Débitos & CRLV-e"
  if (
    /crlv|debito|débito|licenciamento|ipva|gad-e|gade|documento 202|emitir doc|boleto doc|guia de pagamento|imprimir documento|consultar debito|consultar débito/i.test(
      txt
    )
  ) {
    return {
      intencao_ia: 'debitos_crlve',
      intencao_rotulo: 'Débitos / Emissão CRLV-e',
      confianca_ia: 99.1,
      resumo_ia: `Solicitação de CRLV-e / Consulta de Débitos${
        placaExtraida ? ` para a placa ${placaExtraida}` : ''
      }. Movido automaticamente pela IA para a fila "📄 Fila: Débitos & CRLV-e" aguardando operador.`,
      etapa_sugerida: 'transbordo_crlve',
      fila_transbordo_crlve: true,
      prioridade_sugerida: 'alta',
      placa_extraida: placaExtraida,
      renavam_extraido: renavamExtraido,
      resposta_automatica_ia: `Olá, ${clienteNome}! 🤖 Identifiquei que você precisa de *Consulta de Débitos / Emissão de CRLV-e*${
        placaExtraida ? ` do veículo placa *${placaExtraida}*` : ''
      }. Já movi seu atendimento automaticamente para a nossa *📄 Fila: Débitos & CRLV-e* e um operador do CRVA já irá lhe atender!`,
    };
  }

  // 2. Dúvidas informativas (horários, documentos necessários, taxas) -> IA responde automaticamente
  if (
    /horário|horario|abre|fecha|funcionamento|documento necessário|documentos necessarios|quais documentos|precisa levar|qual o valor|quanto custa|taxa|endereço|endereco|onde fica/i.test(
      txt
    )
  ) {
    return {
      intencao_ia: 'duvida_geral',
      intencao_rotulo: 'Dúvida Informativa (IA Respondeu)',
      confianca_ia: 98.5,
      resumo_ia:
        'Dúvida informativa sobre horários, documentos necessários ou taxas tabuladas — Respondida automaticamente pela IA no WhatsApp.',
      etapa_sugerida: 'triagem_ia',
      fila_transbordo_crlve: false,
      prioridade_sugerida: 'baixa',
      placa_extraida: placaExtraida,
      renavam_extraido: renavamExtraido,
      resposta_automatica_ia: `Olá, ${clienteNome}! 🤖 Seguem as informações oficiais do CRVA:\n• *Horário de Atendimento*: Segunda a Sexta, das 08h30 às 17h00 (sem fechar ao meio-dia).\n• *Documentos Necessários*: CNH ou RG/CPF original, comprovante de residência e documento do veículo (CRV/ATPV-e).\n• *Taxa de Vistoria Veicular*: R$ 111,08 (com ISS incluso).\nSe precisar emitir CRLV-e ou consultar débitos, basta enviar a *Placa* por aqui!`,
    };
  }

  // 2. Vistoria Veicular
  if (/vistoria|laudo|box|ficha digital|agendar vistoria|reprovou|pátio|patio/i.test(txt)) {
    return {
      intencao_ia: 'vistoria_veicular',
      intencao_rotulo: 'Vistoria de Identificação',
      confianca_ia: 97.4,
      resumo_ia: `Atendimento sobre Vistoria Veicular de Identificação${
        placaExtraida ? ` (Placa ${placaExtraida})` : ''
      }.`,
      etapa_sugerida: 'triagem_ia',
      fila_transbordo_crlve: false,
      prioridade_sugerida: 'normal',
      placa_extraida: placaExtraida,
      renavam_extraido: renavamExtraido,
      resposta_automatica_ia: `Olá, ${clienteNome}! Recebemos sua solicitação sobre *Vistoria Veicular*${
        placaExtraida ? ` para a placa *${placaExtraida}*` : ''
      }. Por favor, confirme se já possui a guia GAD-E quitada ou se deseja gerar o atendimento completo no balcão.`,
    };
  }

  // 3. Transferência / ATPV-e / CRV
  if (/transfer|atpv|compra e venda|passar pro meu nome|propriedade|crv|reconhecer firma/i.test(txt)) {
    return {
      intencao_ia: 'transferencia_atpve',
      intencao_rotulo: 'Transferência / ATPV-e',
      confianca_ia: 96.8,
      resumo_ia: `Processo de Transferência de Propriedade / Intenção de Venda (ATPV-e)${
        placaExtraida ? ` — Placa ${placaExtraida}` : ''
      }.`,
      etapa_sugerida: 'em_atendimento',
      fila_transbordo_crlve: false,
      prioridade_sugerida: 'normal',
      placa_extraida: placaExtraida,
      renavam_extraido: renavamExtraido,
      resposta_automatica_ia: `Olá, ${clienteNome}! Para *Transferência de Propriedade / ATPV-e*, nossa IA já iniciou sua pré-triagem. Envie foto do documento de identificação e informe a placa para agilizarmos sua Ficha Digital.`,
    };
  }

  // 4. Primeiro Emplacamento 0km
  if (/0km|zero km|nota fiscal|primeiro emplacamento|veiculo novo|veículo novo/i.test(txt)) {
    return {
      intencao_ia: 'primeiro_emplacamento',
      intencao_rotulo: 'Primeiro Emplacamento 0km',
      confianca_ia: 98.0,
      resumo_ia: 'Solicitação de abertura de processo de Primeiro Emplacamento com Nota Fiscal.',
      etapa_sugerida: 'em_atendimento',
      fila_transbordo_crlve: false,
      prioridade_sugerida: 'normal',
      placa_extraida: placaExtraida,
      renavam_extraido: renavamExtraido,
      resposta_automatica_ia: `Olá, ${clienteNome}! Para *Primeiro Emplacamento 0km*, envie o XML/PDF da Nota Fiscal da concessionária e o documento do proprietário.`,
    };
  }

  // 5. Segunda via / Placa Mercosul
  if (/mercosul|estampador|perdi a placa|segunda via de placa|placa caiu|autorizacao de placa/i.test(txt)) {
    return {
      intencao_ia: 'segunda_via_placa',
      intencao_rotulo: '2ª Via / Placa Mercosul',
      confianca_ia: 95.5,
      resumo_ia: `Pedido de autorização de estampagem / conversão para Placa Mercosul${
        placaExtraida ? ` (${placaExtraida})` : ''
      }.`,
      etapa_sugerida: 'triagem_ia',
      fila_transbordo_crlve: false,
      prioridade_sugerida: 'normal',
      placa_extraida: placaExtraida,
      renavam_extraido: renavamExtraido,
      resposta_automatica_ia: `Olá, ${clienteNome}! Identifiquei sua solicitação de *Autorização de Placa Mercosul*. Vamos verificar a necessidade de vistoria prévia para liberação.`,
    };
  }

  // 6. Despachante Faturamento / Lote B2B
  if (tipoCliente === 'despachante' && /lote|fatura|conta corrente|borderô|bordero|processos/i.test(txt)) {
    return {
      intencao_ia: 'faturamento_b2b',
      intencao_rotulo: 'Lote / Faturamento B2B',
      confianca_ia: 97.2,
      resumo_ia: 'Demanda corporativa de Despachante referente a lote de processos ou conta-corrente.',
      etapa_sugerida: 'em_atendimento',
      fila_transbordo_crlve: false,
      prioridade_sugerida: 'alta',
      placa_extraida: placaExtraida,
      renavam_extraido: renavamExtraido,
      resposta_automatica_ia: `Olá, parceiro ${clienteNome}! Sua solicitação de lote B2B foi priorizada na bancada de Despachantes.`,
    };
  }

  // Fallback: Triagem Geral
  return {
    intencao_ia: 'duvida_geral',
    intencao_rotulo: 'Orientação / Triagem Geral',
    confianca_ia: 91.0,
    resumo_ia: `Atendimento inicial em qualificação pela IA no canal ${
      tipoCliente === 'despachante' ? 'Despachantes B2B' : 'Particulares B2C'
    }.`,
    etapa_sugerida: 'triagem_ia',
    fila_transbordo_crlve: false,
    prioridade_sugerida: 'normal',
    placa_extraida: placaExtraida,
    renavam_extraido: renavamExtraido,
    resposta_automatica_ia: `Olá, ${clienteNome}! Bem-vindo ao atendimento inteligente do *CRVA*. Por gentileza, informe a *Placa do veículo* e se deseja *Emissão de CRLV-e/Débitos*, *Transferência* ou *Vistoria*.`,
  };
}

/**
 * Dados iniciais realistas para popular o CRM imediatamente
 */
const ATENDIMENTOS_INICIAIS_SEED: AtendimentoCrm[] = [
  {
    id: 'crm-seed-1',
    protocolo: '#CRM-P101',
    cliente_nome: 'Carlos Eduardo Menezes',
    cliente_telefone: '(51) 99812-4410',
    cliente_documento: '024.881.920-15',
    tipo_cliente: 'particular',
    despachante_nome: null,
    veiculo_placa: 'IJK4E56',
    veiculo_modelo: 'VW T-Cross Highline 2024',
    veiculo_renavam: '01298451203',
    intencao_ia: 'debitos_crlve',
    intencao_rotulo: 'Débitos / Emissão CRLV-e',
    confianca_ia: 99.4,
    resumo_ia:
      'Cliente particular solicita levantamento de débitos 2026 (IPVA + Licenciamento) e emissão imediata do PDF do CRLV-e para viagem.',
    etapa_kanban: 'transbordo_crlve',
    fila_transbordo_crlve: true,
    prioridade: 'urgente',
    valor_debitos: 142.85,
    status_emissao_crlve: 'consultando_detran',
    atendente_nome: 'Patrícia Balcão',
    ultima_mensagem: 'Preciso quitar a taxa de licenciamento e receber o CRLV-e atualizado da placa IJK4E56.',
    ultima_interacao_em: new Date(Date.now() - 4 * 60000).toISOString(),
    historico_mensagens: [
      {
        id: 'm1',
        remetente: 'cliente',
        autor_nome: 'Carlos Eduardo Menezes',
        texto: 'Bom dia! Preciso quitar a taxa de licenciamento e receber o CRLV-e atualizado da placa IJK4E56, RENAVAM 01298451203.',
        horario: '09:12',
      },
      {
        id: 'm2',
        remetente: 'ia',
        autor_nome: 'Agente IA Integra',
        texto: 'Olá, Carlos Eduardo! 🤖 Identifiquei sua solicitação de *Débitos / Emissão de CRLV-e* para o veículo *VW T-Cross (IJK4E56)*. Já transferi seu atendimento para nossa *Fila Exclusiva de Emissão Digital*!',
        horario: '09:12',
      },
    ],
    criado_em: new Date(Date.now() - 15 * 60000).toISOString(),
    atualizado_em: new Date(Date.now() - 4 * 60000).toISOString(),
  },
  {
    id: 'crm-seed-2',
    protocolo: '#CRM-P102',
    cliente_nome: 'Fernanda Siqueira Dorneles',
    cliente_telefone: '(51) 99145-8821',
    cliente_documento: '031.552.710-88',
    tipo_cliente: 'particular',
    despachante_nome: null,
    veiculo_placa: 'JBC9A12',
    veiculo_modelo: 'Chevrolet Onix Plus Premier',
    veiculo_renavam: '01187423901',
    intencao_ia: 'debitos_crlve',
    intencao_rotulo: 'Débitos / Emissão CRLV-e',
    confianca_ia: 98.9,
    resumo_ia:
      'Proprietária já efetuou pagamento do IPVA via PIX e solicita conferência de baixa bancária e envio do CRLV-e 2026.',
    etapa_kanban: 'transbordo_crlve',
    fila_transbordo_crlve: true,
    prioridade: 'alta',
    valor_debitos: 98.40,
    status_emissao_crlve: 'guia_enviada',
    atendente_nome: 'Patrícia Balcão',
    ultima_mensagem: 'Acabei de pagar a guia pelo app do banco, conseguem emitir meu CRLV-e?',
    ultima_interacao_em: new Date(Date.now() - 9 * 60000).toISOString(),
    historico_mensagens: [
      {
        id: 'm2-1',
        remetente: 'cliente',
        autor_nome: 'Fernanda Siqueira Dorneles',
        texto: 'Olá! Acabei de pagar a guia pelo app do banco da placa JBC9A12, conseguem emitir meu CRLV-e?',
        horario: '09:20',
      },
      {
        id: 'm2-2',
        remetente: 'ia',
        autor_nome: 'Agente IA Integra',
        texto: 'Perfeito, Fernanda! Encaminhei sua placa *JBC9A12* para a fila prioritária de *Débitos / CRLV-e* para validação da baixa no Detran-RS.',
        horario: '09:20',
      },
    ],
    criado_em: new Date(Date.now() - 25 * 60000).toISOString(),
    atualizado_em: new Date(Date.now() - 9 * 60000).toISOString(),
  },
  {
    id: 'crm-seed-3',
    protocolo: '#CRM-P103',
    cliente_nome: 'Roberto Vasconcelos',
    cliente_telefone: '(55) 98118-2341',
    cliente_documento: '784.112.390-04',
    tipo_cliente: 'particular',
    despachante_nome: null,
    veiculo_placa: 'IRS7G88',
    veiculo_modelo: 'Toyota Hilux SRX 4x4',
    veiculo_renavam: '01349012844',
    intencao_ia: 'transferencia_atpve',
    intencao_rotulo: 'Transferência / ATPV-e',
    confianca_ia: 97.5,
    resumo_ia:
      'Comprador particular com ATPV-e assinada digitalmente no Gov.br aguardando geração de Ficha Digital para vistoria.',
    etapa_kanban: 'em_atendimento',
    fila_transbordo_crlve: false,
    prioridade: 'normal',
    valor_debitos: 294.60,
    status_emissao_crlve: 'pendente',
    atendente_nome: 'Patrícia Balcão',
    ultima_mensagem: 'Já assinei a ATPV-e no aplicativo da Carteira Digital. Posso levar a caminhonete hoje?',
    ultima_interacao_em: new Date(Date.now() - 18 * 60000).toISOString(),
    historico_mensagens: [
      {
        id: 'm3-1',
        remetente: 'cliente',
        autor_nome: 'Roberto Vasconcelos',
        texto: 'Já assinei a ATPV-e no aplicativo da Carteira Digital da Hilux placa IRS7G88. Posso levar a caminhonete hoje?',
        horario: '08:55',
      },
      {
        id: 'm3-2',
        remetente: 'ia',
        autor_nome: 'Agente IA Integra',
        texto: 'Olá, Roberto! Triagem concluída para *Transferência de Propriedade (IRS7G88)*. Nosso atendente já está gerando sua Ficha Digital de Vistoria.',
        horario: '08:55',
      },
    ],
    criado_em: new Date(Date.now() - 40 * 60000).toISOString(),
    atualizado_em: new Date(Date.now() - 18 * 60000).toISOString(),
  },
  {
    id: 'crm-seed-4',
    protocolo: '#CRM-P104',
    cliente_nome: 'Juliana Martins Costa',
    cliente_telefone: '(51) 99604-1190',
    cliente_documento: '019.443.810-72',
    tipo_cliente: 'particular',
    despachante_nome: null,
    veiculo_placa: 'IWT2C19',
    veiculo_modelo: 'Jeep Compass Longitude',
    veiculo_renavam: '01200491823',
    intencao_ia: 'vistoria_veicular',
    intencao_rotulo: 'Vistoria de Identificação',
    confianca_ia: 96.2,
    resumo_ia: 'Cliente em qualificação pela IA consultando horário de funcionamento do pátio de vistorias.',
    etapa_kanban: 'triagem_ia',
    fila_transbordo_crlve: false,
    prioridade: 'normal',
    valor_debitos: 111.08,
    status_emissao_crlve: 'pendente',
    atendente_nome: null,
    ultima_mensagem: 'Qual o valor da vistoria para regularizar alteração de característica da placa IWT2C19?',
    ultima_interacao_em: new Date(Date.now() - 2 * 60000).toISOString(),
    historico_mensagens: [
      {
        id: 'm4-1',
        remetente: 'cliente',
        autor_nome: 'Juliana Martins Costa',
        texto: 'Qual o valor da vistoria para regularizar alteração de característica da placa IWT2C19?',
        horario: '09:30',
      },
      {
        id: 'm4-2',
        remetente: 'ia',
        autor_nome: 'Agente IA Integra',
        texto: 'Olá, Juliana! Identifiquei o veículo placa *IWT2C19*. Estou validando os requisitos para *Vistoria de Identificação*. Deseja iniciar a abertura da sua Ficha Digital?',
        horario: '09:30',
      },
    ],
    criado_em: new Date(Date.now() - 10 * 60000).toISOString(),
    atualizado_em: new Date(Date.now() - 2 * 60000).toISOString(),
  },
  {
    id: 'crm-seed-5',
    protocolo: '#CRM-D201',
    cliente_nome: 'Despachante Central Ltda',
    cliente_telefone: '(51) 99988-7766',
    cliente_documento: '12.345.678/0001-90',
    tipo_cliente: 'despachante',
    despachante_nome: 'Despachante Central Ltda',
    veiculo_placa: 'JDP8H44',
    veiculo_modelo: 'Scania R450 A6x2 (Frota)',
    veiculo_renavam: '01488291044',
    intencao_ia: 'debitos_crlve',
    intencao_rotulo: 'Débitos / Emissão CRLV-e',
    confianca_ia: 99.6,
    resumo_ia:
      'Escritório Despachante Central solicita emissão urgente de CRLV-e e espelho de débitos de caminhão retido em barreira fiscal.',
    etapa_kanban: 'transbordo_crlve',
    fila_transbordo_crlve: true,
    prioridade: 'urgente',
    valor_debitos: 385.20,
    status_emissao_crlve: 'consultando_detran',
    atendente_nome: 'Patrícia Balcão',
    ultima_mensagem: 'Prioridade B2B: precisamos da emissão do CRLV-e 2026 da carreta placa JDP8H44 urgente.',
    ultima_interacao_em: new Date(Date.now() - 3 * 60000).toISOString(),
    historico_mensagens: [
      {
        id: 'm5-1',
        remetente: 'cliente',
        autor_nome: 'Despachante Central Ltda',
        texto: 'Bom dia equipe CRVA! Prioridade B2B: precisamos da emissão do CRLV-e 2026 da carreta placa JDP8H44 (RENAVAM 01488291044) urgente.',
        horario: '09:25',
      },
      {
        id: 'm5-2',
        remetente: 'ia',
        autor_nome: 'Agente IA Integra',
        texto: 'Olá, *Despachante Central*! 🤖 Demanda B2B classificada como *Urgente — Emissão de CRLV-e (Placa JDP8H44)*. Alocada no topo da Fila Exclusiva de Transbordo.',
        horario: '09:25',
      },
    ],
    criado_em: new Date(Date.now() - 12 * 60000).toISOString(),
    atualizado_em: new Date(Date.now() - 3 * 60000).toISOString(),
  },
  {
    id: 'crm-seed-6',
    protocolo: '#CRM-D202',
    cliente_nome: 'Despachante Rápido Sul',
    cliente_telefone: '(51) 99711-3090',
    cliente_documento: '98.765.432/0001-10',
    tipo_cliente: 'despachante',
    despachante_nome: 'Despachante Rápido Sul',
    veiculo_placa: 'IVM3B71',
    veiculo_modelo: 'Fiat Strada Freedom CD',
    veiculo_renavam: '01311928374',
    intencao_ia: 'faturamento_b2b',
    intencao_rotulo: 'Lote / Faturamento B2B',
    confianca_ia: 98.2,
    resumo_ia:
      'Despachante parceiro enviando lote com 3 processos de transferência + vistoria para lançamento a prazo na conta-corrente.',
    etapa_kanban: 'em_atendimento',
    fila_transbordo_crlve: false,
    prioridade: 'alta',
    valor_debitos: 333.24,
    status_emissao_crlve: 'pendente',
    atendente_nome: 'Patrícia Balcão',
    ultima_mensagem: 'Encaminhando documentação da Strada IVM3B71 para lançar na nossa conta-corrente B2B.',
    ultima_interacao_em: new Date(Date.now() - 22 * 60000).toISOString(),
    historico_mensagens: [
      {
        id: 'm6-1',
        remetente: 'cliente',
        autor_nome: 'Despachante Rápido Sul',
        texto: 'Encaminhando documentação da Strada IVM3B71 para lançar na nossa conta-corrente B2B.',
        horario: '08:40',
      },
      {
        id: 'm6-2',
        remetente: 'ia',
        autor_nome: 'Agente IA Integra',
        texto: 'Recebido, *Despachante Rápido Sul*! Processo vinculado à bancada exclusiva de Despachantes.',
        horario: '08:40',
      },
    ],
    criado_em: new Date(Date.now() - 50 * 60000).toISOString(),
    atualizado_em: new Date(Date.now() - 22 * 60000).toISOString(),
  },
];

function lerCacheLocal(): AtendimentoCrm[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CRM);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_CRM, JSON.stringify(ATENDIMENTOS_INICIAIS_SEED));
      return ATENDIMENTOS_INICIAIS_SEED;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return ATENDIMENTOS_INICIAIS_SEED;
  } catch {
    return ATENDIMENTOS_INICIAIS_SEED;
  }
}

function salvarCacheLocal(lista: AtendimentoCrm[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CRM, JSON.stringify(lista));
  } catch {
    // ignora quota
  }
}

/**
 * Lista todos os atendimentos do CRM (Supabase + fallback resiliente)
 */
export async function listarAtendimentosCrm(): Promise<AtendimentoCrm[]> {
  try {
    const { data, error } = await supabase
      .from('crm_atendimentos')
      .select('*')
      .order('ultima_interacao_em', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      const normalizados: AtendimentoCrm[] = data.map((row: any) => ({
        id: row.id,
        protocolo: row.protocolo || '#CRM-100',
        cliente_nome: row.cliente_nome,
        cliente_telefone: row.cliente_telefone,
        cliente_documento: row.cliente_documento || null,
        tipo_cliente: row.tipo_cliente === 'despachante' ? 'despachante' : 'particular',
        despachante_nome: row.despachante_nome || null,
        veiculo_placa: row.veiculo_placa || null,
        veiculo_modelo: row.veiculo_modelo || null,
        veiculo_renavam: row.veiculo_renavam || null,
        intencao_ia: row.intencao_ia || 'duvida_geral',
        intencao_rotulo:
          row.intencao_rotulo ||
          METADADOS_INTENCOES_IA[(row.intencao_ia as IntencaoIaCrm) || 'duvida_geral']?.rotulo ||
          'Triagem Geral',
        confianca_ia: Number(row.confianca_ia || 95),
        resumo_ia: row.resumo_ia || '',
        etapa_kanban: row.etapa_kanban || 'triagem_ia',
        fila_transbordo_crlve: Boolean(
          row.fila_transbordo_crlve || row.intencao_ia === 'debitos_crlve' || row.etapa_kanban === 'transbordo_crlve'
        ),
        prioridade: row.prioridade || 'normal',
        valor_debitos: Number(row.valor_debitos || 0),
        status_emissao_crlve: row.status_emissao_crlve || 'pendente',
        atendente_nome: row.atendente_nome || null,
        ultima_mensagem: row.ultima_mensagem || '',
        ultima_interacao_em: row.ultima_interacao_em || row.criado_em || new Date().toISOString(),
        historico_mensagens: Array.isArray(row.historico_mensagens) ? row.historico_mensagens : [],
        criado_em: row.criado_em || new Date().toISOString(),
        atualizado_em: row.atualizado_em || new Date().toISOString(),
      }));
      salvarCacheLocal(normalizados);
      return normalizados;
    }
  } catch (err) {
    console.warn('[crmService] Usando cache operacional para CRM-Integra:', err);
  }

  return lerCacheLocal();
}

/**
 * Cria um novo atendimento com triagem automática da IA e registra o log de intenção no Supabase
 */
export async function criarAtendimentoTriagemIA(input: {
  cliente_nome: string;
  cliente_telefone: string;
  cliente_documento?: string;
  tipo_cliente: TipoClienteCrm;
  despachante_nome?: string;
  veiculo_placa?: string;
  veiculo_modelo?: string;
  veiculo_renavam?: string;
  mensagem_inicial: string;
  forcar_fila_crlve?: boolean;
  disparar_boas_vindas_whatsapp?: boolean;
}): Promise<AtendimentoCrm> {
  const atuais = lerCacheLocal();
  const analise = classificarIntencaoWhatsApp(
    input.mensagem_inicial,
    input.tipo_cliente,
    input.cliente_nome
  );

  const ehFilaCrlve = Boolean(input.forcar_fila_crlve || analise.fila_transbordo_crlve);
  const intencaoFinal: IntencaoIaCrm = ehFilaCrlve ? 'debitos_crlve' : analise.intencao_ia;
  const etapaFinal: EtapaKanbanCrm = ehFilaCrlve ? 'transbordo_crlve' : analise.etapa_sugerida;

  // Cálculo sequencial do protocolo (#CRM-P105 ou #CRM-D203)
  const prefixo = input.tipo_cliente === 'despachante' ? '#CRM-D' : '#CRM-P';
  const baseNum = input.tipo_cliente === 'despachante' ? 200 : 100;
  let maior = baseNum;
  for (const item of atuais) {
    if (item.protocolo.startsWith(prefixo)) {
      const n = parseInt(item.protocolo.replace(prefixo, ''), 10);
      if (!isNaN(n) && n > maior) maior = n;
    }
  }
  const novoProtocolo = `${prefixo}${maior + 1}`;

  const agoraIso = new Date().toISOString();
  const horarioCurto = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const placaFinal =
    (input.veiculo_placa || analise.placa_extraida || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '') || null;

  const renavamFinal = input.veiculo_renavam || analise.renavam_extraido || null;

  const mensagensIniciais: MensagemChatCrm[] = [
    {
      id: `msg-${Date.now()}-1`,
      remetente: 'cliente',
      autor_nome: input.cliente_nome,
      texto: input.mensagem_inicial,
      horario: horarioCurto,
    },
    {
      id: `msg-${Date.now()}-2`,
      remetente: 'ia',
      autor_nome: 'Agente IA Integra',
      texto: analise.resposta_automatica_ia,
      horario: horarioCurto,
    },
  ];

  const novoAtendimento: AtendimentoCrm = {
    id: crypto.randomUUID ? crypto.randomUUID() : `crm-${Date.now()}`,
    protocolo: novoProtocolo,
    cliente_nome: input.cliente_nome.trim(),
    cliente_telefone: input.cliente_telefone.trim(),
    cliente_documento: input.cliente_documento?.trim() || null,
    tipo_cliente: input.tipo_cliente,
    despachante_nome:
      input.tipo_cliente === 'despachante'
        ? input.despachante_nome?.trim() || input.cliente_nome.trim()
        : null,
    veiculo_placa: placaFinal,
    veiculo_modelo: input.veiculo_modelo?.trim() || null,
    veiculo_renavam: renavamFinal,
    intencao_ia: intencaoFinal,
    intencao_rotulo: METADADOS_INTENCOES_IA[intencaoFinal].rotulo,
    confianca_ia: analise.confianca_ia,
    resumo_ia: analise.resumo_ia,
    etapa_kanban: etapaFinal,
    fila_transbordo_crlve: ehFilaCrlve,
    prioridade: ehFilaCrlve ? 'alta' : analise.prioridade_sugerida,
    valor_debitos: 0,
    status_emissao_crlve: ehFilaCrlve ? 'consultando_detran' : 'pendente',
    atendente_nome: null,
    ultima_mensagem: input.mensagem_inicial.trim(),
    ultima_interacao_em: agoraIso,
    historico_mensagens: mensagensIniciais,
    criado_em: agoraIso,
    atualizado_em: agoraIso,
  };

  // Persistência no Supabase (Tabela crm_atendimentos + crm_intencoes_ia_log)
  try {
    const { data, error } = await supabase
      .from('crm_atendimentos')
      .insert([novoAtendimento])
      .select('*')
      .maybeSingle();

    if (!error && data?.id) {
      novoAtendimento.id = data.id;
    }

    await supabase.from('crm_intencoes_ia_log').insert([
      {
        atendimento_id: novoAtendimento.id,
        telefone_origem: novoAtendimento.cliente_telefone,
        tipo_cliente: novoAtendimento.tipo_cliente,
        mensagem_recebida: input.mensagem_inicial,
        intencao_identificada: novoAtendimento.intencao_ia,
        confianca_ia: novoAtendimento.confianca_ia,
        entidades_extraidas: {
          placa: placaFinal,
          renavam: renavamFinal,
          protocolo: novoProtocolo,
        },
        transbordo_automatico_crlve: ehFilaCrlve,
      },
    ]);
  } catch (err) {
    console.warn('[crmService] Salvo em cache operacional local:', err);
  }

  // Disparo opcional da resposta de triagem via Evolution API WhatsApp
  if (input.disparar_boas_vindas_whatsapp && input.cliente_telefone) {
    try {
      await enviarTextoDireto(input.cliente_telefone, analise.resposta_automatica_ia);
    } catch (e) {
      console.warn('[crmService] Aviso ao enviar boas-vindas WhatsApp:', e);
    }
  }

  const novaLista = [novoAtendimento, ...atuais];
  salvarCacheLocal(novaLista);
  return novoAtendimento;
}

/**
 * Move o card para outra coluna do Kanban ou aciona transbordo para a fila de Débitos / CRLV-e
 */
export async function moverEtapaKanbanCrm(
  id: string,
  novaEtapa: EtapaKanbanCrm,
  atendenteNome?: string
): Promise<AtendimentoCrm | null> {
  const lista = lerCacheLocal();
  const idx = lista.findIndex((item) => item.id === id);
  if (idx === -1) return null;

  const agoraIso = new Date().toISOString();
  const atualizado: AtendimentoCrm = {
    ...lista[idx],
    etapa_kanban: novaEtapa,
    fila_transbordo_crlve:
      novaEtapa === 'transbordo_crlve' ? true : lista[idx].fila_transbordo_crlve,
    atendente_nome: atendenteNome || lista[idx].atendente_nome || 'Operador CRVA',
    status_emissao_crlve:
      novaEtapa === 'concluido' && lista[idx].fila_transbordo_crlve
        ? 'crlve_enviado'
        : lista[idx].status_emissao_crlve,
    atualizado_em: agoraIso,
  };

  lista[idx] = atualizado;
  salvarCacheLocal(lista);

  try {
    await supabase
      .from('crm_atendimentos')
      .update({
        etapa_kanban: atualizado.etapa_kanban,
        fila_transbordo_crlve: atualizado.fila_transbordo_crlve,
        atendente_nome: atualizado.atendente_nome,
        status_emissao_crlve: atualizado.status_emissao_crlve,
        atualizado_em: agoraIso,
      })
      .eq('id', id);
  } catch (err) {
    console.warn('[crmService] Atualização de etapa salva localmente:', err);
  }

  return atualizado;
}

/**
 * Envia uma mensagem do atendente no chat do CRM e dispara via WhatsApp (Evolution API)
 */
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
  const horario = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const agoraIso = new Date().toISOString();

  let enviadoWhats = false;
  if (params.dispararWhatsApp !== false && alvo.cliente_telefone) {
    try {
      const resp = await enviarTextoDireto(alvo.cliente_telefone, params.texto);
      enviadoWhats = resp.sucesso;
    } catch {
      enviadoWhats = false;
    }
  }

  const novaMsg: MensagemChatCrm = {
    id: `msg-${Date.now()}`,
    remetente: 'atendente',
    autor_nome: params.atendenteNome || 'Especialista CRVA',
    texto: params.texto,
    horario,
    enviado_whatsapp: enviadoWhats,
  };

  const novasMensagens = [...(alvo.historico_mensagens || []), novaMsg];
  const novaEtapa: EtapaKanbanCrm =
    alvo.etapa_kanban === 'triagem_ia' ? 'em_atendimento' : alvo.etapa_kanban;

  const atualizado: AtendimentoCrm = {
    ...alvo,
    etapa_kanban: novaEtapa,
    atendente_nome: params.atendenteNome || alvo.atendente_nome || 'Especialista CRVA',
    status_emissao_crlve: params.novoStatusCrlve || alvo.status_emissao_crlve,
    valor_debitos:
      params.valorDebitos !== undefined ? params.valorDebitos : alvo.valor_debitos,
    ultima_mensagem: params.texto,
    ultima_interacao_em: agoraIso,
    historico_mensagens: novasMensagens,
    atualizado_em: agoraIso,
  };

  lista[idx] = atualizado;
  salvarCacheLocal(lista);

  try {
    await supabase
      .from('crm_atendimentos')
      .update({
        etapa_kanban: atualizado.etapa_kanban,
        atendente_nome: atualizado.atendente_nome,
        status_emissao_crlve: atualizado.status_emissao_crlve,
        valor_debitos: atualizado.valor_debitos,
        ultima_mensagem: atualizado.ultima_mensagem,
        ultima_interacao_em: agoraIso,
        historico_mensagens: novasMensagens,
        atualizado_em: agoraIso,
      })
      .eq('id', params.atendimentoId);
  } catch (err) {
    console.warn('[crmService] Mensagem salva no cache local:', err);
  }

  return { atendimento: atualizado, enviadoWhatsApp: enviadoWhats };
}

/**
 * Exclui/arquiva um atendimento concluído do quadro Kanban
 */
export async function excluirAtendimentoCrm(id: string): Promise<void> {
  const lista = lerCacheLocal().filter((item) => item.id !== id);
  salvarCacheLocal(lista);
  try {
    await supabase.from('crm_atendimentos').delete().eq('id', id);
  } catch (err) {
    console.warn('[crmService] Exclusão aplicada no cache local:', err);
  }
}

