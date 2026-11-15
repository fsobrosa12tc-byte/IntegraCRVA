import { 
  TerminalLiquidacaoModal,
  type TerminalLiquidacaoModalProps as ModalCheckoutPagamentoProps,
  type FormaPagamento,
  type ItemComanda,
  type DadosCheckout
} from './pdv/TerminalLiquidacaoModal';

export type { FormaPagamento, ItemComanda, DadosCheckout, ModalCheckoutPagamentoProps };
export const ModalCheckoutPagamento = TerminalLiquidacaoModal;
export default ModalCheckoutPagamento;
