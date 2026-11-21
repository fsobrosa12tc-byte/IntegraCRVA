import React from 'react';
import ReciboQuitacaoDespachante, {
  type ReciboQuitacaoDespachanteProps as ComprovanteQuitacaoModalProps,
} from './ReciboQuitacaoDespachante';

export type { ComprovanteQuitacaoModalProps };

/**
 * Modal Executivo do Comprovante de Quitação Fiscal em Duas Vias
 * (1ª Via Cliente/Despachante • 2ª Via Controle Interno Caixa CRVA).
 *
 * // REGRA DE AUDITORIA FISCAL CRVA - NÃO ALTERAR
 * Renderiza fielmente o número do recibo (#REC-...), itens/atos discriminados
 * e o bloco condicional de Vínculo de Auditoria (Cliente Final).
 */
export const ComprovanteQuitacaoModal: React.FC<ComprovanteQuitacaoModalProps> = (props) => {
  return <ReciboQuitacaoDespachante {...props} />;
};

export default ComprovanteQuitacaoModal;
