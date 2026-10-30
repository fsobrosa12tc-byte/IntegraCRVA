import { supabase } from './supabase';
import type { Despachante } from '../types/pdv';
import { somenteDigitos } from '../utils/documento';

export interface ServicoCatalogo {
  id: string;
  codigo: string;
  nome: string;
  valor: number;
}

/** Catálogo oficial de contingência com serviços DETRAN-RS / CRVA. */
const CATALOGO_FALLBACK: ServicoCatalogo[] = [
  { id: 'fb-vistoria', codigo: 'SRV-VIST', nome: 'Vistoria: Solicitação e Identificação Veicular', valor: 98.40 },
  { id: 'fb-transf-rs', codigo: 'SRV-TRRS', nome: 'Transferência: Transferência de Propriedade (RS)', valor: 142.60 },
  { id: 'fb-transf-uf', codigo: 'SRV-TRUF', nome: 'Transferência: Transferência de Propriedade (Outra UF)', valor: 168.90 },
  { id: 'fb-alt-dados', codigo: 'SRV-ALTD', nome: 'Alteração: Alteração de Informações do Proprietário / Veículo', valor: 85.30 },
  { id: 'fb-reconhec', codigo: 'SRV-RECF', nome: 'Reconhecimento: Reconhecimento de Firma / Autenticação ATPV-e', valor: 12.80 },
  { id: 'fb-2via-crv', codigo: 'SRV-2CRV', nome: 'Documento: 2ª via do CRV / ATPV-e', valor: 76.50 },
  { id: 'fb-crlve', codigo: 'SRV-CRLV', nome: 'Impressão: Impressão do CRLV-e Oficial', valor: 18.50 },
  { id: 'fb-certidao', codigo: 'SRV-CERT', nome: 'Certidão: Emissão de Certidão de Registro de Veículo', valor: 24.20 },
  { id: 'fb-emplacamento', codigo: 'SRV-EMPL', nome: 'Emplacamento: Primeiro Emplacamento', valor: 154.00 },
  { id: 'fb-reserva-placa', codigo: 'SRV-RPLA', nome: 'Placa: Reserva de Placa Especial', valor: 65.00 },
  { id: 'fb-baixa-veic', codigo: 'SRV-BAIX', nome: 'Baixa: Baixa Definitiva de Veículo - Simples', valor: 88.00 },
  { id: 'fb-comunic-venda', codigo: 'SRV-CVEN', nome: 'Comunicação: Comunicação de Venda de Veículo', valor: 35.00 },
  { id: 'fb-copia-doc', codigo: 'SRV-CDOC', nome: 'Cópia: Busca e fornecimento de cópias de processos', valor: 15.00 },
  { id: 'fb-lacre-placa', codigo: 'SRV-LACR', nome: 'Placa: Colocação / Substituição de Lacre ou Placa Mercosul', valor: 42.00 },
];

export async function buscarServicos(): Promise<ServicoCatalogo[]> {
  try {
    const { data, error } = await supabase
      .from('servicos')
      .select('id, name, base_value')
      .order('name', { ascending: true });
    if (error || !data || data.length === 0) return CATALOGO_FALLBACK;
    return data.map((s: any) => ({
      id: s.id,
      codigo: `SRV-${String(s.id).replace(/-/g, '').slice(0, 4).toUpperCase()}`,
      nome: s.name,
      valor: Number(s.base_value) || 0,
    }));
  } catch {
    return CATALOGO_FALLBACK;
  }
}

export interface CadastrarDespachanteInput {
  nome_razao: string;
  documento: string;
  telefone: string;
  email?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
}

export async function cadastrarServicoCatalogo(input: {
  nome: string;
  valor: number;
}): Promise<ServicoCatalogo> {
  const payload = {
    name: input.nome.trim(),
    base_value: Number(input.valor) || 0,
  };

  const { data, error } = await supabase
    .from('servicos')
    .insert(payload)
    .select('id, name, base_value')
    .single();

  if (error) {
    console.warn('Erro ao inserir em servicos no Supabase; usando objeto em memória:', error.message);
    const idTemp = `srv-${Date.now()}`;
    return {
      id: idTemp,
      codigo: `SRV-${idTemp.slice(-4).toUpperCase()}`,
      nome: input.nome.trim(),
      valor: Number(input.valor) || 0,
    };
  }

  return {
    id: data.id,
    codigo: `SRV-${String(data.id).replace(/-/g, '').slice(0, 4).toUpperCase()}`,
    nome: data.name,
    valor: Number(data.base_value) || 0,
  };
}

export async function editarServicoCatalogo(input: {
  id: string;
  nome: string;
  valor: number;
}): Promise<ServicoCatalogo> {
  const payload = {
    name: input.nome.trim(),
    base_value: Number(input.valor) || 0,
  };

  const { data, error } = await supabase
    .from('servicos')
    .update(payload)
    .eq('id', input.id)
    .select('id, name, base_value')
    .single();

  if (error) {
    console.warn('Erro ao atualizar servico no Supabase:', error.message);
    return {
      id: input.id,
      codigo: `SRV-${String(input.id).replace(/-/g, '').slice(0, 4).toUpperCase()}`,
      nome: input.nome.trim(),
      valor: Number(input.valor) || 0,
    };
  }

  return {
    id: data.id,
    codigo: `SRV-${String(data.id).replace(/-/g, '').slice(0, 4).toUpperCase()}`,
    nome: data.name,
    valor: Number(data.base_value) || 0,
  };
}

export async function buscarDespachantes(): Promise<Despachante[]> {
  try {
    const { data, error } = await supabase
      .from('despachantes')
      .select('*')
      .order('nome_razao', { ascending: true });

    if (error) throw new Error(error.message);
    return ((data as any[]) || []).map((d) => ({
      id: d.id,
      nome_razao: d.nome_razao ?? '',
      documento: d.documento ?? '',
      telefone: d.telefone ?? '',
      email: d.email ?? '',
      logradouro: d.logradouro ?? '',
      numero: d.numero ?? '',
      bairro: d.bairro ?? '',
      cidade: d.cidade ?? '',
      saldo_devedor: Number(d.saldo_devedor) || 0,
      criado_em: d.criado_em ?? new Date().toISOString(),
    }));
  } catch (err: any) {
    console.warn('Falha na busca completa de despachantes, tentando colunas básicas:', err.message);
    const { data: bData, error: bError } = await supabase
      .from('despachantes')
      .select('id, nome_razao, documento, telefone, saldo_devedor, criado_em')
      .order('nome_razao', { ascending: true });
    if (bError) throw new Error(bError.message);
    return ((bData as any[]) || []).map((d) => ({
      id: d.id,
      nome_razao: d.nome_razao ?? '',
      documento: d.documento ?? '',
      telefone: d.telefone ?? '',
      saldo_devedor: Number(d.saldo_devedor) || 0,
      criado_em: d.criado_em ?? new Date().toISOString(),
    }));
  }
}

export async function cadastrarDespachante(input: CadastrarDespachanteInput): Promise<Despachante> {
  const dig = somenteDigitos(input.documento);
  if (!dig) {
    throw new Error('Informe um CPF ou CNPJ válido.');
  }

  // 1. Validação estrita de duplicidade de CPF/CNPJ
  const existentes = await buscarDespachantes();
  const duplicado = existentes.find((d) => somenteDigitos(d.documento) === dig);
  if (duplicado) {
    throw new Error(`Já existe um despachante cadastrado com este documento: ${duplicado.nome_razao}.`);
  }

  // 2. Tenta inserção com os campos completos
  const payloadCompleto: any = {
    nome_razao: input.nome_razao.trim(),
    documento: input.documento.trim(),
    telefone: input.telefone.trim(),
    email: input.email?.trim() || null,
    logradouro: input.logradouro?.trim() || null,
    numero: input.numero?.trim() || null,
    bairro: input.bairro?.trim() || null,
    cidade: input.cidade?.trim() || null,
  };

  let { data, error } = await supabase
    .from('despachantes')
    .insert(payloadCompleto)
    .select('*')
    .single();

  // Se o banco remoto ainda não tiver todas as novas colunas migradas, efetua fallback resiliente
  if (error && /column|schema cache/i.test(error.message)) {
    console.warn('Banco de dados ainda sem colunas cadastrais extras. Gravando colunas essenciais:', error.message);
    const payloadBasico = {
      nome_razao: input.nome_razao.trim(),
      documento: input.documento.trim(),
      telefone: input.telefone.trim(),
    };
    const resLegado = await supabase
      .from('despachantes')
      .insert(payloadBasico)
      .select('id, nome_razao, documento, telefone, saldo_devedor, criado_em')
      .single();

    if (resLegado.error) {
      if (resLegado.error.code === '23505') {
        throw new Error('Já existe um despachante cadastrado com este CPF/CNPJ.');
      }
      throw new Error(resLegado.error.message);
    }

    data = {
      ...resLegado.data,
      email: input.email?.trim() || '',
      logradouro: input.logradouro?.trim() || '',
      numero: input.numero?.trim() || '',
      bairro: input.bairro?.trim() || '',
      cidade: input.cidade?.trim() || '',
    };
    error = null;
  } else if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe um despachante cadastrado com este CPF/CNPJ.');
    }
    throw new Error(error.message);
  }

  return {
    ...data,
    nome_razao: data.nome_razao ?? input.nome_razao,
    documento: data.documento ?? input.documento,
    telefone: data.telefone ?? input.telefone,
    saldo_devedor: Number(data.saldo_devedor) || 0,
    criado_em: data.criado_em ?? new Date().toISOString(),
  };
}
