/**
 * Tipos do módulo Integra PDV (Supabase / PostgreSQL).
 * NUMERIC(10,2) é retornado pelo PostgREST como number (ou string, conforme config);
 * UUID e TIMESTAMPTZ são strings (ISO 8601).
 */

export type StatusCaixa = 'aberto' | 'fechado';
export type StatusConferencia = 'exato' | 'quebra_caixa' | 'sobra_caixa';
export type TipoMovimentacao = 'venda' | 'sangria' | 'suprimento' | 'liquidacao_fatura';
export type FormaPagamento =
  | 'dinheiro'
  | 'pix'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'faturamento';
export type TipoFluxo = 'entrada' | 'saida';

export interface Despachante {
  id: string;
  nome_razao: string;
  documento: string;
  telefone: string;
  saldo_devedor: number;
  criado_em: string;
}

export interface CaixaDiario {
  id: string;
  operador_id: string;
  data_abertura: string;
  data_fechamento: string | null;
  valor_abertura: number;
  valor_fechamento_esperado: number | null;
  valor_fechamento_informado: number | null;
  diferenca: number | null;
  status: StatusCaixa;
  status_conferencia: StatusConferencia | null;
}

export interface MovimentacaoCaixa {
  id: string;
  caixa_id: string;
  tipo: TipoMovimentacao;
  descricao: string | null;
  valor: number;
  forma_pagamento: FormaPagamento;
  despachante_id: string | null;
  criado_em: string;
  // Auditoria [Onde, Quem, Quando] e ISSQN (opcionais até a migração ser aplicada)
  operador_id?: string | null;
  operador_nome?: string | null;
  valor_bruto?: number | null;
  aliquota_issqn?: number | null;
  valor_issqn?: number | null;
  valor_liquido?: number | null;
  justificativa_motivo?: string | null;
}

export interface LogTrocaOperador {
  id: string;
  caixa_id: string;
  operador_anterior_id: string;
  operador_anterior_nome: string;
  operador_novo_id: string;
  operador_novo_nome: string;
  saldo_gaveta_momento: number;
  motivo_troca: string | null;
  trocado_em: string;
}

export interface FluxoCaixa {
  id: string;
  data_movimentacao: string;
  tipo: TipoFluxo;
  categoria: string;
  valor: number;
  origem_id: string | null;
  criado_em: string;
}

// ---------------------------------------------------------------------------
// COMANDAS BALCÃO CRVA -> FRENTE DE CAIXA PDV
// ---------------------------------------------------------------------------

export type StatusComandaBalcao = 'aguardando_pagamento' | 'pago' | 'cancelado';

export interface ItemComandaBalcao {
  codigo: string;
  servico: string;
  quantidade: number;
  valor_unitario: number;
  subtotal: number;
}

export interface ComandaBalcao {
  id: string;
  cliente_nome: string;
  cliente_documento: string | null;
  atendente_id: string;
  atendente_nome: string;
  itens: ItemComandaBalcao[];
  subtotal_servicos?: number;
  valor_total: number;
  aliquota_issqn: number;
  valor_issqn: number;
  status: StatusComandaBalcao;
  caixa_id: string | null;
  operador_caixa_id: string | null;
  forma_pagamento: string | null;
  criado_em: string;
  pago_em: string | null;
}

export type ComandaBalcaoInsert = Omit<ComandaBalcao, 'id' | 'criado_em' | 'pago_em' | 'caixa_id' | 'operador_caixa_id' | 'forma_pagamento'> &
  Partial<Pick<ComandaBalcao, 'id' | 'caixa_id' | 'operador_caixa_id' | 'forma_pagamento' | 'criado_em' | 'pago_em'>>;

export type ComandaBalcaoUpdate = Partial<ComandaBalcao>;

// Helpers de Insert/Update (campos com DEFAULT são opcionais)
export type DespachanteInsert = Omit<Despachante, 'id' | 'saldo_devedor' | 'criado_em'> &
  Partial<Pick<Despachante, 'id' | 'saldo_devedor' | 'criado_em'>>;
export type DespachanteUpdate = Partial<DespachanteInsert>;

export type CaixaDiarioInsert = Pick<CaixaDiario, 'operador_id'> &
  Partial<Omit<CaixaDiario, 'operador_id'>>;
export type CaixaDiarioUpdate = Partial<CaixaDiario>;

export type MovimentacaoCaixaInsert = Pick<
  MovimentacaoCaixa,
  'caixa_id' | 'tipo' | 'valor' | 'forma_pagamento'
> &
  Partial<Omit<MovimentacaoCaixa, 'caixa_id' | 'tipo' | 'valor' | 'forma_pagamento'>>;

export type FluxoCaixaInsert = Pick<FluxoCaixa, 'tipo' | 'categoria' | 'valor'> &
  Partial<Pick<FluxoCaixa, 'id' | 'data_movimentacao' | 'origem_id' | 'criado_em'>>;

/** Tipo `Database` compatível com createClient<Database>() do supabase-js. */
export interface Database {
  public: {
    Tables: {
      despachantes: {
        Row: Despachante;
        Insert: DespachanteInsert;
        Update: DespachanteUpdate;
        Relationships: [];
      };
      caixas_diarios: {
        Row: CaixaDiario;
        Insert: CaixaDiarioInsert;
        Update: CaixaDiarioUpdate;
        Relationships: [];
      };
      movimentacoes_caixa: {
        Row: MovimentacaoCaixa;
        Insert: MovimentacaoCaixaInsert;
        Update: Partial<MovimentacaoCaixaInsert>;
        Relationships: [
          {
            foreignKeyName: 'movimentacoes_caixa_caixa_id_fkey';
            columns: ['caixa_id'];
            referencedRelation: 'caixas_diarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'movimentacoes_caixa_despachante_id_fkey';
            columns: ['despachante_id'];
            referencedRelation: 'despachantes';
            referencedColumns: ['id'];
          },
        ];
      };
      comandas_balcao: {
        Row: ComandaBalcao;
        Insert: ComandaBalcaoInsert;
        Update: ComandaBalcaoUpdate;
        Relationships: [];
      };
      fluxo_caixa: {
        Row: FluxoCaixa;
        Insert: FluxoCaixaInsert;
        Update: Partial<FluxoCaixaInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

