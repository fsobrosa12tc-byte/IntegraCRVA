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

export async function buscarDespachantes(): Promise<Despachante[]> {
  const { data, error } = await supabase
    .from('despachantes')
    .select('id, nome_razao, documento, telefone, saldo_devedor, criado_em')
    .order('nome_razao', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map((d) => ({
    ...d,
    nome_razao: d.nome_razao ?? '',
    documento: d.documento ?? '',
    telefone: d.telefone ?? '',
    saldo_devedor: Number(d.saldo_devedor) || 0,
  }));
}

export async function cadastrarDespachante(input: {
  nome_razao: string;
  documento: string;
  telefone: string;
}): Promise<Despachante> {
  // Duplicidade por dígitos (o banco compara a string mascarada)
  const existentes = await buscarDespachantes();
  const dig = somenteDigitos(input.documento);
  if (existentes.some((d) => somenteDigitos(d.documento) === dig)) {
    throw new Error('Já existe um despachante cadastrado com este CPF/CNPJ.');
  }
  const { data, error } = await supabase
    .from('despachantes')
    .insert(input)
    .select('id, nome_razao, documento, telefone, saldo_devedor, criado_em')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Já existe um despachante cadastrado com este CPF/CNPJ.');
    throw new Error(error.message);
  }
  return { ...(data as any), saldo_devedor: Number((data as any).saldo_devedor) || 0 };
}
