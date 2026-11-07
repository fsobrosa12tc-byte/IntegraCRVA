/**
 * ============================================================================
 * INTEGRA CRVA · SERVIÇO DE GESTÃO DA ESTEIRA DE VISTORIAS VEICULARES
 * ============================================================================
 * Orquestração do fluxo integrado Balcão -> Ficha Digital -> Pátio de Vistorias
 * com automação de notificações via WhatsApp (Evolution API v2) e persistência
 * híbrida resiliente no Supabase + Cache Operacional.
 * ============================================================================
 */

import { supabase } from '../lib/supabase';
import {
  enviarNotificacaoVistoria,
  enviarTextoDireto,
  getStatus,
  sanitizarPlaca,
  type NotificacaoVistoriaParams,
  type TipoNotificacaoVistoria,
  type WhatsAppConnectionState,
} from './evolutionApi';
import { WHATSAPP_TEMPLATES } from '../config/whatsappTemplates';

export type TipoAtendimentoVistoria = 'particular' | 'despachante';

export type StatusVistoria =
  | 'aguardando_ficha'
  | 'aguardando_vistoria'
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
  tipo_atendimento: TipoAtendimentoVistoria;
  ficha_digital?: string | null;
  comanda_id?: string | null;
  protocolo?: string | null;
  placa: string;
  veiculo_placa?: string;
  veiculo_modelo?: string | null;
  veiculo_chassi?: string | null;
  cliente_nome?: string | null;
  cliente_cpf?: string | null;
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
  tipo_atendimento?: TipoAtendimentoVistoria;
  ficha_digital?: string | null;
  comanda_id?: string | null;
  protocolo?: string | null;
  placa: string;
  veiculo_modelo?: string | null;
  veiculo_chassi?: string | null;
  cliente_nome?: string | null;
  cliente_cpf?: string | null;
  cliente_telefone?: string | null;
  status?: StatusVistoria;
  box?: string | null;
}

export interface AtualizarStatusOptions {
  box?: string | null;
  ficha_digital?: string | null;
  motivos?: string | string[] | null;
  operadorId?: string | null;
  operadorNome?: string | null;
}

const CACHE_KEY_VISTORIAS = 'integra_vistorias_patio_cache_v2';

const VISTORIAS_CONTINGENCIA_INICIAL: VistoriaPatio[] = [
  {
    id: 'vist-p101',
    tipo_atendimento: 'particular',
    ficha_digital: 'FD-2026-8841',
    protocolo: 'P-101',
    placa: 'IJK4E56',
    veiculo_placa: 'IJK4E56',
    veiculo_modelo: 'VW NIVUS HIGHLINE 200 TSI',
    veiculo_chassi: '9BWAA45U8P0123456',
    cliente_nome: 'CARLOS EDUARDO MENDES',
    cliente_cpf: '024.689.130-45',
    cliente_telefone: '(54) 99912-3456',
    status: 'aguardando_vistoria',
    box: null,
    notificacao_whatsapp_status: 'enviado',
    criado_em: new Date(Date.now() - 25 * 60000).toISOString(),
  },
  {
    id: 'vist-d100',
    tipo_atendimento: 'despachante',
    ficha_digital: 'FD-2026-8849',
    protocolo: 'D-100',
    placa: 'QWE9A12',
    veiculo_placa: 'QWE9A12',
    veiculo_modelo: 'TOYOTA HILUX CD SRX 4X4',
    veiculo_chassi: null,
    cliente_nome: 'DESPACHANTE CENTRAL SUL',
    cliente_cpf: null,
    cliente_telefone: '(54) 99145-7890',
    status: 'aguardando_vistoria',
    box: null,
    notificacao_whatsapp_status: 'enviado',
    criado_em: new Date(Date.now() - 12 * 60000).toISOString(),
  },
];

function lerCacheLocalVistorias(): VistoriaPatio[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY_VISTORIAS);
    if (!raw) {
      localStorage.setItem(CACHE_KEY_VISTORIAS, JSON.stringify(VISTORIAS_CONTINGENCIA_INICIAL));
      return [...VISTORIAS_CONTINGENCIA_INICIAL];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...VISTORIAS_CONTINGENCIA_INICIAL];
  } catch {
    return [...VISTORIAS_CONTINGENCIA_INICIAL];
  }
}

function salvarCacheLocalVistorias(lista: VistoriaPatio[]): void {
  try {
    localStorage.setItem(CACHE_KEY_VISTORIAS, JSON.stringify(lista));
  } catch {}
}

/**
 * Mascara o CPF para exibição visual segura nos cards (ex: ***.689.130-** ou formato completo).
 */
export function mascararCpfVistoria(cpf?: string | null): string {
  if (!cpf) return 'Não informado';
  const digitos = cpf.replace(/\D/g, '');
  if (digitos.length === 11) {
    return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9, 11)}`;
  }
  return cpf;
}

/**
 * Consulta a última ficha gerada para o tipo ('particular' ou 'despachante')
 * e calcula sequencialmente o próximo número:
 * - Particular: P-101, P-102... (inicia em P-101 se nenhuma existir)
 * - Despachante: D-100, D-101... (inicia em D-100 se nenhuma existir)
 */
export async function gerarProximaFicha(tipo: 'particular' | 'despachante'): Promise<string> {
  const prefixo = tipo === 'particular' ? 'P' : 'D';
  const baseInicial = tipo === 'particular' ? 101 : 100;

  const fichasEncontradas: string[] = [];

  // 1. Busca fichas existentes no Supabase
  try {
    const { data } = await supabase
      .from('vistorias_patio')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(100);

    if (data && data.length > 0) {
      data.forEach((item: any) => {
        if (item.numero_ficha) fichasEncontradas.push(String(item.numero_ficha));
        if (item.ficha_digital) fichasEncontradas.push(String(item.ficha_digital));
        if (item.protocolo) fichasEncontradas.push(String(item.protocolo));
      });
    }
  } catch (err) {
    console.warn('[VistoriaService] Fallback de consulta no banco para sequencial:', err);
  }

  // 2. Mescla com o cache local para contingência total
  try {
    const cacheLocal = lerCacheLocalVistorias();
    cacheLocal.forEach((item) => {
      if (item.ficha_digital) fichasEncontradas.push(String(item.ficha_digital));
      if (item.protocolo) fichasEncontradas.push(String(item.protocolo));
    });
  } catch {}

  // 3. Extrai os números e obtém o maior sequencial
  const regex = new RegExp(`^${prefixo}-(\\d+)`, 'i');
  const numeros = fichasEncontradas
    .map((str) => {
      const match = str ? str.trim().match(regex) : null;
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n) && n > 0);

  const maiorNumero = numeros.length > 0 ? Math.max(...numeros) : baseInicial - 1;
  const proximoNumero = Math.max(maiorNumero + 1, baseInicial);

  return `${prefixo}-${proximoNumero}`;
}

/**
 * Normaliza os dados retornados pelo Supabase mesclando metadados estendidos.
 */
function normalizarVistoria(item: any, cacheExistente?: VistoriaPatio): VistoriaPatio {
  const placa = item.placa || item.veiculo_placa || cacheExistente?.placa || 'N/A';
  const metaExtra = item.notificacao_whatsapp_detalhes?.meta_vistoria || {};
  const protocolo = item.protocolo ?? item.numero_ficha ?? metaExtra.protocolo ?? cacheExistente?.protocolo ?? null;
  const fichaDigital = item.ficha_digital ?? item.numero_ficha ?? metaExtra.ficha_digital ?? cacheExistente?.ficha_digital ?? null;
  const tipoInferido: TipoAtendimentoVistoria =
    item.tipo_atendimento ||
    metaExtra.tipo_atendimento ||
    cacheExistente?.tipo_atendimento ||
    (protocolo && String(protocolo).toUpperCase().startsWith('D-') ? 'despachante' : 'particular');

  return {
    id: String(item.id),
    tipo_atendimento: tipoInferido,
    ficha_digital: fichaDigital,
    comanda_id: item.comanda_id ?? cacheExistente?.comanda_id ?? null,
    protocolo,
    placa,
    veiculo_placa: placa,
    veiculo_modelo: item.veiculo_modelo ?? metaExtra.veiculo_modelo ?? cacheExistente?.veiculo_modelo ?? null,
    veiculo_chassi: item.veiculo_chassi ?? metaExtra.veiculo_chassi ?? cacheExistente?.veiculo_chassi ?? null,
    cliente_nome: item.cliente_nome ?? metaExtra.cliente_nome ?? cacheExistente?.cliente_nome ?? null,
    cliente_cpf: item.cliente_cpf ?? metaExtra.cliente_cpf ?? cacheExistente?.cliente_cpf ?? null,
    cliente_telefone: item.cliente_telefone ?? metaExtra.cliente_telefone ?? cacheExistente?.cliente_telefone ?? null,
    status: (item.status || cacheExistente?.status || 'aguardando_ficha') as StatusVistoria,
    box: item.box ?? item.box_atendimento ?? cacheExistente?.box ?? null,
    motivos_pendencia: item.motivos_pendencia ?? item.motivo_pendencia ?? item.motivos ?? cacheExistente?.motivos_pendencia ?? null,
    notificacao_whatsapp_status: item.notificacao_whatsapp_status ?? cacheExistente?.notificacao_whatsapp_status ?? 'pendente',
    notificacao_whatsapp_enviada_em: item.notificacao_whatsapp_enviada_em ?? cacheExistente?.notificacao_whatsapp_enviada_em ?? null,
    notificacao_whatsapp_detalhes: item.notificacao_whatsapp_detalhes ?? cacheExistente?.notificacao_whatsapp_detalhes ?? null,
    criado_em: item.criado_em || item.created_at || cacheExistente?.criado_em || new Date().toISOString(),
    atualizado_em: item.atualizado_em || item.updated_at || cacheExistente?.atualizado_em || null,
  };
}

/**
 * Ordena em ordem crescente de chegada (cronológica: mais antigos primeiro na fila).
 */
function ordenarCrescentePorChegada(lista: VistoriaPatio[]): VistoriaPatio[] {
  return [...lista].sort(
    (a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()
  );
}

/**
 * Lista as vistorias cadastradas no pátio em ordem crescente de chegada.
 */
export async function listarVistoriasPatio(filtros?: {
  status?: StatusVistoria | StatusVistoria[];
  busca?: string;
}): Promise<VistoriaPatio[]> {
  const cacheAtual = lerCacheLocalVistorias();
  const mapaCache = new Map(cacheAtual.map((v) => [v.id, v]));

  let query = supabase
    .from('vistorias_patio')
    .select('*')
    .order('criado_em', { ascending: true });

  if (filtros?.status) {
    if (Array.isArray(filtros.status)) {
      query = query.in('status', filtros.status);
    } else {
      query = query.eq('status', filtros.status);
    }
  }

  const { data, error } = await query;
  let lista: VistoriaPatio[];

  if (error) {
    console.warn('[VistoriaService] Usando cache operacional para vistorias_patio:', error.message);
    lista = cacheAtual;
    if (filtros?.status) {
      const st = Array.isArray(filtros.status) ? filtros.status : [filtros.status];
      lista = lista.filter((v) => st.includes(v.status));
    }
  } else {
    const doBanco = (data || []).map((row: any) =>
      normalizarVistoria(row, mapaCache.get(String(row.id)))
    );
    // Preserva itens criados apenas localmente em contingência caso o banco esteja vazio ou sem permissão
    const idsBanco = new Set(doBanco.map((v) => v.id));
    const locaisPendentes = cacheAtual.filter((v) => !idsBanco.has(v.id));
    lista = [...doBanco, ...locaisPendentes];
    salvarCacheLocalVistorias(lista);
  }

  lista = ordenarCrescentePorChegada(lista);

  if (filtros?.busca) {
    const termo = filtros.busca.trim().toUpperCase();
    lista = lista.filter(
      (v) =>
        v.placa.toUpperCase().includes(termo) ||
        (v.cliente_nome && v.cliente_nome.toUpperCase().includes(termo)) ||
        (v.protocolo && v.protocolo.toUpperCase().includes(termo)) ||
        (v.ficha_digital && v.ficha_digital.toUpperCase().includes(termo)) ||
        (v.veiculo_modelo && v.veiculo_modelo.toUpperCase().includes(termo))
    );
  }

  return lista;
}

/**
 * Busca uma vistoria específica pelo ID.
 */
export async function buscarVistoriaPorId(id: string): Promise<VistoriaPatio | null> {
  const cache = lerCacheLocalVistorias();
  const itemCache = cache.find((v) => v.id === id);

  const { data, error } = await supabase
    .from('vistorias_patio')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return itemCache || null;
  }

  return normalizarVistoria(data, itemCache);
}

/**
 * Cadastra uma nova vistoria (rascunho do balcão ou lançamento direto).
 * Se não possuir ficha_digital, inicia como 'aguardando_ficha'; se já possuir, inicia como 'aguardando_vistoria'.
 */
export async function cadastrarVistoriaPatio(input: CadastrarVistoriaInput): Promise<VistoriaPatio> {
  const placaLimpa = sanitizarPlaca(input.placa);
  const tipo: TipoAtendimentoVistoria =
    input.tipo_atendimento ||
    (input.protocolo && input.protocolo.toUpperCase().startsWith('D-') ? 'despachante' : 'particular');

  const prefixoProtocolo = tipo === 'despachante' ? 'D' : 'P';
  const protocoloGerado =
    input.protocolo?.trim() || `${prefixoProtocolo}-${Math.floor(100 + Math.random() * 900)}`;

  const statusInicial: StatusVistoria =
    input.status || (input.ficha_digital?.trim() ? 'aguardando_vistoria' : 'aguardando_ficha');

  const metaVistoria = {
    tipo_atendimento: tipo,
    ficha_digital: input.ficha_digital?.trim() || null,
    protocolo: protocoloGerado,
    veiculo_modelo: input.veiculo_modelo?.trim() || null,
    veiculo_chassi: input.veiculo_chassi?.trim() || null,
    cliente_nome: input.cliente_nome?.trim() || null,
    cliente_cpf: input.cliente_cpf?.trim() || null,
    cliente_telefone: input.cliente_telefone?.trim() || null,
  };

  const payloadBase: Record<string, any> = {
    placa: placaLimpa,
    veiculo_placa: placaLimpa,
    veiculo_modelo: metaVistoria.veiculo_modelo,
    cliente_nome: metaVistoria.cliente_nome,
    cliente_telefone: metaVistoria.cliente_telefone,
    status: statusInicial,
    box: input.box ?? null,
    comanda_id: input.comanda_id ?? null,
    protocolo: protocoloGerado,
    notificacao_whatsapp_detalhes: { meta_vistoria: metaVistoria },
  };

  let { data, error } = await supabase
    .from('vistorias_patio')
    .insert(payloadBase)
    .select('*')
    .single();

  if (error && /column|schema cache/i.test(error.message)) {
    const payloadReduzido = {
      veiculo_placa: placaLimpa,
      veiculo_modelo: metaVistoria.veiculo_modelo,
      cliente_nome: metaVistoria.cliente_nome,
      cliente_telefone: metaVistoria.cliente_telefone,
      status: statusInicial,
    };
    const retry = await supabase
      .from('vistorias_patio')
      .insert(payloadReduzido)
      .select('*')
      .single();

    data = retry.data;
    error = retry.error;
  }

  const itemLocalBase: VistoriaPatio = {
    id: data?.id ? String(data.id) : `vist-local-${Date.now()}`,
    tipo_atendimento: tipo,
    ficha_digital: metaVistoria.ficha_digital,
    comanda_id: input.comanda_id ?? null,
    protocolo: protocoloGerado,
    placa: placaLimpa,
    veiculo_placa: placaLimpa,
    veiculo_modelo: metaVistoria.veiculo_modelo,
    veiculo_chassi: metaVistoria.veiculo_chassi,
    cliente_nome: metaVistoria.cliente_nome,
    cliente_cpf: metaVistoria.cliente_cpf,
    cliente_telefone: metaVistoria.cliente_telefone,
    status: statusInicial,
    box: input.box ?? null,
    notificacao_whatsapp_status: 'pendente',
    notificacao_whatsapp_detalhes: { meta_vistoria: metaVistoria },
    criado_em: data?.criado_em || data?.created_at || new Date().toISOString(),
  };

  const cache = lerCacheLocalVistorias();
  salvarCacheLocalVistorias([...cache.filter((v) => v.id !== itemLocalBase.id), itemLocalBase]);

  // Se já nasceu com Ficha Digital preenchida, dispara a Mensagem 1 em background
  if (metaVistoria.ficha_digital) {
    void dispararMensagemFichaDigital(itemLocalBase, metaVistoria.ficha_digital);
  }

  return itemLocalBase;
}

/**
 * Lançamento da Ficha Digital gerada no DETRAN/RS:
 * 1. Atualiza o status da vistoria para 'aguardando_vistoria'.
 * 2. Dispara automaticamente a Mensagem 1 (WHATSAPP_TEMPLATES.FICHA_DIGITAL) no WhatsApp cadastrado.
 */
export async function vincularFichaDigitalVistoria(
  id: string,
  numeroFicha: string
): Promise<{ vistoria: VistoriaPatio; envioWhatsApp: { sucesso: boolean; mensagem: string } }> {
  const fichaLimpa = numeroFicha.trim().toUpperCase();
  if (!fichaLimpa) {
    throw new Error('Informe o Número da Ficha Digital de Vistoria.');
  }

  const vistoriaAtual = await buscarVistoriaPorId(id);
  if (!vistoriaAtual) {
    throw new Error('Atendimento de vistoria não encontrado na fila.');
  }

  const metaAtualizada = {
    ...(vistoriaAtual.notificacao_whatsapp_detalhes?.meta_vistoria || {}),
    tipo_atendimento: vistoriaAtual.tipo_atendimento,
    ficha_digital: fichaLimpa,
    protocolo: vistoriaAtual.protocolo,
    veiculo_modelo: vistoriaAtual.veiculo_modelo,
    veiculo_chassi: vistoriaAtual.veiculo_chassi,
    cliente_nome: vistoriaAtual.cliente_nome,
    cliente_cpf: vistoriaAtual.cliente_cpf,
    cliente_telefone: vistoriaAtual.cliente_telefone,
  };

  const vistoriaAtualizada: VistoriaPatio = {
    ...vistoriaAtual,
    ficha_digital: fichaLimpa,
    status: 'aguardando_vistoria',
    atualizado_em: new Date().toISOString(),
    notificacao_whatsapp_detalhes: {
      ...(vistoriaAtual.notificacao_whatsapp_detalhes || {}),
      meta_vistoria: metaAtualizada,
    },
  };

  // Atualiza cache local imediatamente
  const cache = lerCacheLocalVistorias();
  salvarCacheLocalVistorias(cache.map((v) => (v.id === id ? vistoriaAtualizada : v)));

  // Tenta persistir no Supabase (colunas numero_ficha, ficha_digital e protocolo)
  try {
    await supabase
      .from('vistorias_patio')
      .update({
        status: 'aguardando_vistoria',
        numero_ficha: fichaLimpa,
        ficha_digital: fichaLimpa,
        protocolo: fichaLimpa,
        notificacao_whatsapp_detalhes: vistoriaAtualizada.notificacao_whatsapp_detalhes,
        atualizado_em: vistoriaAtualizada.atualizado_em,
      })
      .eq('id', id);
  } catch (err) {
    console.warn('[VistoriaService] Aviso ao atualizar ficha digital no Supabase:', err);
  }

  // Dispara Mensagem 1 (FICHA_DIGITAL)
  const envioWhatsApp = await dispararMensagemFichaDigital(vistoriaAtualizada, fichaLimpa);

  return {
    vistoria: {
      ...vistoriaAtualizada,
      notificacao_whatsapp_status: envioWhatsApp.sucesso ? 'enviado' : 'falha',
    },
    envioWhatsApp,
  };
}

/**
 * Automatiza a geração da Ficha Digital sequencial (P-xxx / D-xxx) e o envio no WhatsApp:
 * 1. Calcula a próxima numeração (P-101... ou D-100...).
 * 2. Atualiza a vistoria para 'aguardando_vistoria' com a nova ficha.
 * 3. Dispara a Mensagem 1 no WhatsApp imediatamente.
 */
export async function gerarEAtribuirFichaDigital(
  id: string
): Promise<{ vistoria: VistoriaPatio; envioWhatsApp: { sucesso: boolean; mensagem: string }; numeroFicha: string }> {
  const vistoriaAtual = await buscarVistoriaPorId(id);
  if (!vistoriaAtual) {
    throw new Error('Atendimento de vistoria não encontrado na fila.');
  }

  const tipo = vistoriaAtual.tipo_atendimento || 'particular';
  const proximaFicha = await gerarProximaFicha(tipo);

  const resultado = await vincularFichaDigitalVistoria(id, proximaFicha);

  return {
    ...resultado,
    numeroFicha: proximaFicha,
  };
}

/**
 * Dispara a Mensagem 1 (FICHA_DIGITAL) usando WHATSAPP_TEMPLATES.FICHA_DIGITAL.
 */
async function dispararMensagemFichaDigital(
  vistoria: VistoriaPatio,
  numeroFicha: string
): Promise<{ sucesso: boolean; mensagem: string }> {
  const telefone = vistoria.cliente_telefone?.trim();
  if (!telefone) {
    await registrarAuditoriaNotificacao(vistoria.id, {
      status: 'sem_telefone',
      detalhes: { aviso: 'Sem telefone cadastrado para envio da Ficha Digital.' },
    });
    return { sucesso: false, mensagem: 'Ficha salva! (Sem telefone cadastrado para WhatsApp)' };
  }

  const nome = vistoria.cliente_nome || 'Cliente';
  const modelo = vistoria.veiculo_modelo || 'Veículo';
  const placa = vistoria.placa;
  const texto = WHATSAPP_TEMPLATES.FICHA_DIGITAL(nome, numeroFicha, modelo, placa);

  const res = await enviarTextoDireto(telefone, texto);
  await registrarAuditoriaNotificacao(vistoria.id, {
    status: res.sucesso ? 'enviado' : 'falha',
    mensagem: texto,
    messageId: res.messageId,
    detalhes: res.detalhes || { erro: res.erro },
  });

  return {
    sucesso: res.sucesso,
    mensagem: res.sucesso
      ? `Ficha Digital *${numeroFicha}* ativada e enviada via WhatsApp para ${nome}!`
      : `Ficha Digital *${numeroFicha}* salva na fila! (Aviso WhatsApp: ${res.erro || 'Gateway offline'})`,
  };
}

/**
 * Ação do Vistoriador: "Chamar para vistoria"
 * 1. Muda estado do card para 'em_vistoria' (Em Atendimento / Pátio).
 * 2. Dispara automaticamente a Mensagem 2 (WHATSAPP_TEMPLATES.CHAMAR_BOX).
 * 3. Atualiza status no banco e retorna resultado para o Toast.
 */
export async function chamarVeiculoParaVistoria(
  id: string,
  opcoes?: { box?: string | null; operadorNome?: string | null }
): Promise<{ vistoria: VistoriaPatio; envioWhatsApp: { sucesso: boolean; mensagem: string } }> {
  const vistoriaAtual = await buscarVistoriaPorId(id);
  if (!vistoriaAtual) {
    throw new Error('Vistoria não encontrada.');
  }

  const vistoriaAtualizada: VistoriaPatio = {
    ...vistoriaAtual,
    status: 'em_vistoria',
    box: opcoes?.box || vistoriaAtual.box || 'Pátio',
    atualizado_em: new Date().toISOString(),
  };

  // Atualiza cache imediatamente
  const cache = lerCacheLocalVistorias();
  salvarCacheLocalVistorias(cache.map((v) => (v.id === id ? vistoriaAtualizada : v)));

  // Atualiza no Supabase
  try {
    await supabase
      .from('vistorias_patio')
      .update({
        status: 'em_vistoria',
        atualizado_em: vistoriaAtualizada.atualizado_em,
      })
      .eq('id', id);
  } catch (err) {
    console.warn('[VistoriaService] Aviso ao atualizar chamada no Supabase:', err);
  }

  const telefone = vistoriaAtualizada.cliente_telefone?.trim();
  if (!telefone) {
    await registrarAuditoriaNotificacao(id, {
      status: 'sem_telefone',
      detalhes: { aviso: 'Sem telefone cadastrado.' },
    });
    return {
      vistoria: vistoriaAtualizada,
      envioWhatsApp: {
        sucesso: false,
        mensagem: `Veículo ${vistoriaAtualizada.placa} em atendimento no pátio (sem telefone cadastrado).`,
      },
    };
  }

  const nome = vistoriaAtualizada.cliente_nome || 'Cliente';
  const modelo = vistoriaAtualizada.veiculo_modelo || 'Veículo';
  const placa = vistoriaAtualizada.placa;
  const texto = WHATSAPP_TEMPLATES.CHAMAR_BOX(nome, modelo, placa);

  const res = await enviarTextoDireto(telefone, texto);
  await registrarAuditoriaNotificacao(id, {
    status: res.sucesso ? 'enviado' : 'falha',
    mensagem: texto,
    messageId: res.messageId,
    detalhes: res.detalhes || { erro: res.erro },
  });

  return {
    vistoria: {
      ...vistoriaAtualizada,
      notificacao_whatsapp_status: res.sucesso ? 'enviado' : 'falha',
    },
    envioWhatsApp: {
      sucesso: res.sucesso,
      mensagem: res.sucesso
        ? `Chamada enviada com sucesso via WhatsApp para ${nome} (${placa})!`
        : `Veículo ${placa} chamado para o pátio! (Aviso WhatsApp: ${res.erro || 'Não enviado'})`,
    },
  };
}

/**
 * Atualiza o status da vistoria (aprovação, reprovação, etc.) e dispara notificação.
 */
export async function atualizarStatusVistoria(
  id: string,
  novoStatus: StatusVistoria,
  opcoes?: AtualizarStatusOptions
): Promise<VistoriaPatio> {
  if (novoStatus === 'em_vistoria') {
    const res = await chamarVeiculoParaVistoria(id, {
      box: opcoes?.box,
      operadorNome: opcoes?.operadorNome,
    });
    return res.vistoria;
  }

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

  let { data, error } = await supabase
    .from('vistorias_patio')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();

  if (error && /column|schema cache/i.test(error.message)) {
    const fallbackUpdate = { status: novoStatus };
    const retry = await supabase
      .from('vistorias_patio')
      .update(fallbackUpdate)
      .eq('id', id)
      .select('*')
      .single();

    data = retry.data;
    error = retry.error;
  }

  const vistoriaAtualizada: VistoriaPatio = {
    ...vistoriaAtual,
    status: novoStatus,
    box: opcoes?.box !== undefined ? opcoes.box : vistoriaAtual.box,
    motivos_pendencia: motivosTexto !== null ? motivosTexto : vistoriaAtual.motivos_pendencia,
    atualizado_em: new Date().toISOString(),
  };

  const cache = lerCacheLocalVistorias();
  salvarCacheLocalVistorias(cache.map((v) => (v.id === id ? vistoriaAtualizada : v)));

  void dispararNotificacaoSilenciosa({
    vistoria: vistoriaAtualizada,
    novoStatus,
    boxInformado: opcoes?.box || vistoriaAtualizada.box,
    motivosInformados: motivosTexto || vistoriaAtualizada.motivos_pendencia,
  });

  return vistoriaAtualizada;
}

interface DisparoSilenciosoParams {
  vistoria: VistoriaPatio;
  novoStatus: StatusVistoria;
  boxInformado?: string | null;
  motivosInformados?: string | null;
}

async function dispararNotificacaoSilenciosa({
  vistoria,
  novoStatus,
  boxInformado,
  motivosInformados,
}: DisparoSilenciosoParams): Promise<void> {
  const acionaNotificacao =
    novoStatus === 'em_vistoria' ||
    novoStatus === 'aprovado' ||
    novoStatus === 'reprovado';

  if (!acionaNotificacao) return;

  const telefone = vistoria.cliente_telefone?.trim();
  if (!telefone) {
    await registrarAuditoriaNotificacao(vistoria.id, {
      status: 'sem_telefone',
      detalhes: { aviso: 'Cliente não possui telefone celular informado.' },
    });
    return;
  }

  let tipoNotificacao: TipoNotificacaoVistoria;
  if (novoStatus === 'em_vistoria') {
    tipoNotificacao = 'chamada_box';
  } else if (novoStatus === 'aprovado') {
    tipoNotificacao = 'aprovacao';
  } else {
    tipoNotificacao = 'reprovacao';
  }

  try {
    const params: NotificacaoVistoriaParams = {
      tipo: tipoNotificacao,
      telefone,
      placa: vistoria.placa,
      nome: vistoria.cliente_nome,
      modelo: vistoria.veiculo_modelo,
      fichaDigital: vistoria.ficha_digital,
      comanda: vistoria.protocolo || vistoria.comanda_id,
      box: boxInformado,
      motivos: motivosInformados,
    };

    const resultado = await enviarNotificacaoVistoria(params);
    await registrarAuditoriaNotificacao(vistoria.id, {
      status: resultado.sucesso ? 'enviado' : 'falha',
      mensagem: resultado.mensagemEnviada,
      messageId: resultado.messageId,
      detalhes: resultado.detalhes || { erro: resultado.erro },
    });
  } catch (envioError: any) {
    await registrarAuditoriaNotificacao(vistoria.id, {
      status: 'falha',
      detalhes: { erro: envioError?.message || 'Erro inesperado de infraestrutura.' },
    });
  }
}

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
    const cache = lerCacheLocalVistorias();
    salvarCacheLocalVistorias(
      cache.map((v) =>
        v.id === vistoriaId
          ? {
              ...v,
              notificacao_whatsapp_status: dados.status,
              notificacao_whatsapp_enviada_em:
                dados.status === 'enviado' ? new Date().toISOString() : v.notificacao_whatsapp_enviada_em,
            }
          : v
      )
    );
  } catch {}

  try {
    await supabase
      .from('vistorias_patio')
      .update({
        notificacao_whatsapp_status: dados.status,
        notificacao_whatsapp_enviada_em: dados.status === 'enviado' ? new Date().toISOString() : null,
      })
      .eq('id', vistoriaId);
  } catch {}
}

export async function reenviarNotificacaoWhatsApp(
  vistoriaId: string
): Promise<{ sucesso: boolean; mensagem: string }> {
  const vistoria = await buscarVistoriaPorId(vistoriaId);
  if (!vistoria) {
    return { sucesso: false, mensagem: 'Vistoria não encontrada.' };
  }

  if (!vistoria.cliente_telefone) {
    return { sucesso: false, mensagem: 'Esta vistoria não possui número de telefone cadastrado.' };
  }

  const nome = vistoria.cliente_nome || 'Cliente';
  const modelo = vistoria.veiculo_modelo || 'Veículo';
  const placa = vistoria.placa;

  const texto =
    vistoria.status === 'em_vistoria'
      ? WHATSAPP_TEMPLATES.CHAMAR_BOX(nome, modelo, placa)
      : WHATSAPP_TEMPLATES.FICHA_DIGITAL(
          nome,
          vistoria.ficha_digital || vistoria.protocolo || 'PENDENTE',
          modelo,
          placa
        );

  const resultado = await enviarTextoDireto(vistoria.cliente_telefone, texto);

  await registrarAuditoriaNotificacao(vistoriaId, {
    status: resultado.sucesso ? 'enviado' : 'falha',
    mensagem: resultado.mensagemEnviada,
    messageId: resultado.messageId,
    detalhes: resultado.detalhes,
  });

  return {
    sucesso: resultado.sucesso,
    mensagem: resultado.sucesso
      ? `Mensagem WhatsApp enviada com sucesso para ${nome} (${resultado.telefoneSanitizado})!`
      : `Falha ao enviar WhatsApp: ${resultado.erro || 'Erro desconhecido'}`,
  };
}

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
