/**
 * Módulo de Validação Estrita (Domain Logic)
 * Atende aos critérios do Senac RS e normas do Detran-RS.
 */

/**
 * Validação de Chassi (ISO 3779)
 * Deve possuir exatamente 17 caracteres e não conter as letras I, O e Q.
 */
export function validarChassi(chassi: string): boolean {
  const regex = /^[A-HJ-NPR-Z0-9]{17}$/;
  return regex.test(chassi.toUpperCase());
}

/**
 * Validação de Placas (Formatos Antigo e Mercosul)
 * Antigo: AAA-1111
 * Mercosul: AAA1A11
 */
export function validarPlaca(placa: string): boolean {
  const placaLimpa = placa.replace('-', '').toUpperCase();
  const regexAntigo = /^[A-Z]{3}[0-9]{4}$/;
  const regexMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
  return regexAntigo.test(placaLimpa) || regexMercosul.test(placaLimpa);
}

/**
 * Validação de Renavam
 * Deve possuir 11 dígitos numéricos.
 */
export function validarRenavam(renavam: string): boolean {
  return /^\d{11}$/.test(renavam);
}

/**
 * Máscara e Validação básica de CPF/CNPJ
 */
export function validarDocumento(doc: string): boolean {
  const cleanDoc = doc.replace(/\D/g, '');
  return cleanDoc.length === 11 || cleanDoc.length === 14;
}

/**
 * Formatação de CPF/CNPJ para exibição
 */
export function formatarDocumento(doc: string): string {
  const cleanDoc = doc.replace(/\D/g, '');
  if (cleanDoc.length === 11) {
    return cleanDoc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  } else if (cleanDoc.length === 14) {
    return cleanDoc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return doc;
}
