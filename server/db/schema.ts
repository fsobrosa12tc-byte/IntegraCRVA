import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Tabela de Proprietários (LGPD: Dados sensíveis protegidos por acesso autenticado)
export const proprietarios = sqliteTable('proprietarios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  cpfCnpj: text('cpf_cnpj').notNull(),
  endereco: text('endereco').notNull(),
  telefone: text('telefone'),
  email: text('email'),
  autorizacao: text('autorizacao'),
});

// Tabela de Veículos
export const veiculos = sqliteTable('veiculos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  placa: text('placa').notNull(),
  renavam: text('renavam').notNull(),
  chassi: text('chassi').notNull(),
  modelo: text('modelo').notNull(),
  ano: integer('ano').notNull(),
});

// Tabela de Requerimentos (Imutabilidade garantida por Hash SHA-256)
export const requerimentos = sqliteTable('requerimentos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  idServico: text('id_servico').notNull(), // Ex: 'Transferência', '2ª Via CRV'
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  status: text('status').notNull().default('Pendente'),
  hashIntegridade: text('hash_integridade').notNull(),
  proprietarioId: integer('proprietario_id').references(() => proprietarios.id),
  veiculoId: integer('veiculo_id').references(() => veiculos.id),
});
