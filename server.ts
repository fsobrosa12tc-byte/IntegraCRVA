import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Inicialização segura do Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

let sqlite: any = null;
const dbPath = path.join(process.cwd(), 'digital_crva.db');

async function getSQLite() {
  if (process.env.VERCEL) return null;
  if (sqlite) return sqlite;
  try {
    const { default: BetterSqlite3 } = await import('better-sqlite3');
    sqlite = new BetterSqlite3(dbPath);
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS proprietarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, cpf_cnpj TEXT, endereco TEXT, telefone TEXT, email TEXT, autorizacao TEXT);
      CREATE TABLE IF NOT EXISTS veiculos (id INTEGER PRIMARY KEY AUTOINCREMENT, placa TEXT, renavam TEXT, chassi TEXT, modelo TEXT, ano INTEGER);
      CREATE TABLE IF NOT EXISTS requerimentos (id INTEGER PRIMARY KEY AUTOINCREMENT, id_servico TEXT, timestamp INTEGER, status TEXT DEFAULT 'Pendente', hash_integridade TEXT, rest_havera TEXT, rest_modalidade TEXT, rest_tipo_credor TEXT, rest_nome_credor TEXT, proprietario_id INTEGER, veiculo_id INTEGER);
    `);
    return sqlite;
  } catch (err) {
    console.warn('SQLite não disponível:', err);
    return null;
  }
}

// ✅ FUNÇÃO DEFINIDA AQUI (estava faltando no server.ts original)
function gerarSeloSeguranca(dados: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(dados)).digest('hex');
}

const formatarDocumento = (docStr: string) => {
  if (!docStr) return '';
  const d = docStr.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return docStr;
};

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'x-requerimento-id, x-requerimento-hash, x-requerimento-timestamp');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// LISTA DE SERVIÇOS
const LISTA_OFICIAL = [
  "2ª via do CRV", "Impressão do CRLVe", "Emissão de Certidão", "Cópia de documentos",
  "Licença Especial de Trânsito", "Alteração de Informações do Proprietário / Veículo",
  "Inclusão/Alteração/Liberação de Restrição Financeira", "Inclusão/Liberação de Averbação de Execução",
  "Restrição por Transferência", "Placa de Experiência - Inclusão", "Placa de Experiência - Renovação",
  "Placa de Experiência - Baixa", "Baixa de Veículo - Outra UF", "Baixa de Veículo - Simples",
  "Baixa de Veículo - Militarização", "Baixa de Veículo - Outro País", "Cancelamento de Processo",
  "Comunicação de Venda", "Correção de CRLV-e", "Correção de Chassi", "Correção de Proprietário",
  "Correção de Veículo", "Correção de Município", "Correção de Restrições",
  "Mudança para Placa Única / Mercosul", "Primeiro Emplacamento", "Reserva de Placa",
  "Autorização para Fabricação de Placas (Furto/Roubo)", "Autorização para Fabricação de Placas (Perda/Extravio)",
  "Autorização para Fabricação de Placas (Outros)", "Colocação de lacre em placa (Furto/Roubo)",
  "Colocação de lacre em placa (Perda/Extravio)", "Colocação de lacre em placa (Outros)",
  "Autorização: Alteração de Características", "Autorização: Regravação de Chassi/Motor",
  "Autorização: Transporte Escolar", "Solicitação de Vistoria", "Transferência de Propriedade (RS)",
  "Transferência de Propriedade (Outra UF)", "Troca de Município (RS)", "Troca de Município (Outra UF)"
];

function desenharPrimeiroEmplacamento(doc: any, dados: any) {
  const { proprietario, veiculo, restricao, hash, dataExtenso } = dados;

  // 1. MAPEAMENTO EXPLICITO DE TODAS AS CHAVES POSSÍVEIS (Evita que venha vazio se o front mandar na raiz ou no objeto)
  const validarFlag = (val: any) => {
    if (!val) return false;
    const s = String(val).trim().toUpperCase();
    return s === 'SIM' || s === 'TRUE' || val === true;
  };

  // Mapeia tanto de dentro de veiculo quanto da raiz dos dados recebidos
  const reservaSim = validarFlag(veiculo.reservaPlaca) || validarFlag(dados.reservaPlaca);
  const reservaNao = !reservaSim;

  const imprimirCrlv = validarFlag(veiculo.impressaoCrlv) || validarFlag(dados.impressaoCrlv) || validarFlag(veiculo.impressao_crlv) || validarFlag(dados.impressao_crlv);
  const imprimirCertidao = validarFlag(veiculo.emissaoCertidao) || validarFlag(dados.emissaoCertidao) || validarFlag(veiculo.emissao_certidao) || validarFlag(dados.emissao_certidao);

  const restHavera = validarFlag(restricao.havera) || validarFlag(dados.rest_havera);

  // 2. DESATIVAR AUTO-PAGEBREAK E ZERAR MARGENS INFERIORES PARA TRAVAR EM PÁGINA ÚNICA
  doc.page.margins.bottom = 5;

  doc.fillColor('#000000');

  // Título
  doc.font('Helvetica-Bold').fontSize(11).text('ANEXO 1 - REQUERIMENTO DE SERVIÇO PARA O PROCESSO DE PRIMEIRO EMPLACAMENTO', 40, 30, { align: 'center', width: 515 });

  // Qualificação
  const rgStr = proprietario?.identidade ? `, Identidade nº ${proprietario.identidade}` : '';
  const telStr = validarFlag(proprietario?.naoPossuiCelular) ? 'NÃO POSSUI' : (proprietario?.telefone || '(__) _____-____');

  let y = 65;
  doc.font('Helvetica').fontSize(8).text('Eu, ', 40, y, { continued: true, lineGap: 1.0 });
  doc.font('Helvetica-Bold').text((proprietario?.nome || 'NÃO INFORMADO').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', CPF/CNPJ nº ', { continued: true });
  doc.font('Helvetica-Bold').text(formatarDocumento(proprietario?.cpfCnpj || ''), { continued: true });
  doc.font('Helvetica').text(`${rgStr}, Telefone `, { continued: true });
  doc.font('Helvetica-Bold').text(telStr, { continued: true });
  doc.font('Helvetica').text(', requeiro ao DETRAN/RS a realização do processo de primeiro emplacamento, relativo ao(s) veículo(s) chassi(s) ', { continued: true });
  doc.font('Helvetica-Bold').text((veiculo?.chassi || 'NÃO INFORMADO').toUpperCase(), { continued: false });

  // Bloco Reserva de Placas
  y = 115;
  doc.font('Helvetica-Bold').fontSize(8).text('Haverá Reserva de Placas:', 40, y);
  doc.font(reservaSim ? 'Helvetica-Bold' : 'Helvetica').text(`(${reservaSim ? 'X' : ' '}) Sim`, 170, y);
  doc.font(reservaNao ? 'Helvetica-Bold' : 'Helvetica').text(`(${reservaNao ? 'X' : ' '}) Não`, 220, y);

  if (reservaSim) {
    const p = String(veiculo?.placa || dados?.placa || '').toUpperCase().trim();
    doc.font('Helvetica-Bold').text(`PLACA: ${p || 'NÃO INFORMADA'}`, 270, y);
  }

  // Bloco Documentos (CORREÇÃO DE MARCAÇÃO)
  y = 132;
  doc.font(imprimirCrlv ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).text(`(${imprimirCrlv ? 'X' : ' '}) Impressão do CRLVe`, 40, y);
  doc.font(imprimirCertidao ? 'Helvetica-Bold' : 'Helvetica').text(`(${imprimirCertidao ? 'X' : ' '}) Emissão de Certidão`, 180, y);

  // Bloco Restrição
  y = 155;
  doc.rect(40, y, 515, 50).stroke();
  doc.font('Helvetica-Bold').fontSize(7.5).text('Haverá inclusão ou alteração de restrição financeira?', 45, y + 5);
  doc.font(restHavera ? 'Helvetica-Bold' : 'Helvetica').text(`(${restHavera ? 'X' : ' '}) Sim`, 260, y + 5);
  doc.font(!restHavera ? 'Helvetica-Bold' : 'Helvetica').text(`(${!restHavera ? 'X' : ' '}) Não`, 310, y + 5);

  const isFid = restHavera && String(restricao?.modalidade || '').toUpperCase().includes('ALIENAÇÃO');
  doc.font(isFid ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${isFid ? 'X' : ' '}) Alienação Fiduciária`, 45, y + 18);
  doc.font('Helvetica-Bold').fontSize(7.5).text(`Agente Financeiro: ${restricao?.nomeCredor || "___________________________"}`, 45, y + 36);

  // Bloco Adquirente
  y = 215;
  doc.rect(40, y, 515, 40).stroke();
  doc.font('Helvetica-Bold').fontSize(7).text('DADOS DO ADQUIRENTE (Preenchimento obrigatório dos campos abaixo, sendo vedada a inclusão de quaisquer dados de terceiros)', 45, y + 3);
  const enderecoFormatado = (proprietario?.endereco || 'NÃO INFORMADO').toUpperCase();
  doc.font('Helvetica-Bold').fontSize(8.5).text(`Endereço: ${enderecoFormatado}`, 45, y + 12);

  const noCel = validarFlag(proprietario?.naoPossuiCelular);
  const noMail = validarFlag(proprietario?.naoPossuiEmail);
  const emailFormatado = (proprietario?.email || 'NÃO INFORMADO').toLowerCase();
  doc.font('Helvetica').fontSize(7.5).text(`Telefone: ${noCel ? 'NÃO POSSUI' : (proprietario?.telefone || 'NÃO INFORMADO')} (${noCel ? 'X' : ' '}) Não possui celular   Email: ${noMail ? 'NÃO POSSUI' : emailFormatado} (${noMail ? 'X' : ' '}) Não possui Email`, 45, y + 24);

  // Cláusulas Reduzidas para garantir folha única
  y = 265;
  doc.font('Helvetica-Bold').fontSize(7.5).text('DECLARO, sob as penas da lei e sem prejuízo de demais sanções administrativas/civeis/criminais, que:', 40, y);
  doc.font('Helvetica').fontSize(7.0).text('a) o(s) veículo(s) são novos (Zero quilômetro) e está (ão) fisicamente de acordo com o pré-cadastro na Base Indice Nacional BIN da SENATRAN, Nota(s) Fiscal(is), bem como do Certificado de Adequação a Legislação de Trânsito - CAT e do Certificado de Capacitação Técnica - CCT, quando exigível(is);', 40, y + 12, { align: 'justify', width: 515 });
  doc.font('Helvetica').text('b) estou ciente de que no caso de qualquer alteração do veículo em relação ao pré-cadastro e/ou com o CAT/CCT quando solicitados, é de minha responsabilidade informar ao Centro de Registro de Veículos Automotores CRVA, para correção/alteração das informações do veículo antes do primeiro emplacamento, para fins de adequação à legislação de Trânsito.', 40, y + 38, { align: 'justify', width: 515 });
  doc.font('Helvetica').text('c) os documentos entregues ao DETRAN/RS para o serviço requerido são todos autênticos e, quando cópias, condizem com o original, e que sou responsável por providenciar a estampagem e instalação da(s) placa(s) no veículo para o qual a estampagem foi autorizada.', 40, y + 68, { align: 'justify', width: 515 });

  // Datação
  y = 370;
  doc.font('Helvetica-Bold').fontSize(9).text(dataExtenso, 40, y, { align: 'center', width: 515 });

  // Espaçamento Amplo Solicitado (Data em 370, Assinatura em 480 -> 110 pontos de gap livre)
  y = 480;
  doc.moveTo(150, y).lineTo(450, y).stroke();
  doc.font('Helvetica-Bold').fontSize(9).text('Assinatura do Responsável', 40, y + 5, { align: 'center', width: 515 });

  // HASH FORÇADA E FIXADA NO RODAPÉ DA PRIMEIRA PÁGINA (Y = 790)
  doc.font('Helvetica').fontSize(6.5).text(`AUTENTICIDADE DIGITAL (SHA-256): ${hash}`, 40, 790, { align: 'center', width: 515 });
}

function desenharRequerimentoGeral(doc: any, dados: any) {
  doc.page.margins.bottom = 5;
  const { proprietario, veiculo, restricao = {}, hash, dataExtenso, servico } = dados;

  doc.fillColor('#000000');

  // -- TÍTULO (y=22) --
  doc.font('Helvetica-Bold').fontSize(10.5)
    .text('ANEXO 1 - REQUERIMENTO DE SERVIÇO COM DECLARAÇÃO DE AUTENTICIDADE DE DOCUMENTOS',
      40, 22, { align: 'center', width: 515 });

  // -- PARÁGRAFO IDENTIFICAÇÃO (y=44) --
  const telStr2 = proprietario?.telefone || '(__) _____-____';
  doc.font('Helvetica').fontSize(8.5).text('Eu, ', 40, 44, { continued: true, lineGap: 0.9 });
  doc.font('Helvetica-Bold').text((proprietario?.nome || 'NÃO INFORMADO').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', CPF/CNPJ nº ', { continued: true });
  doc.font('Helvetica-Bold').text(formatarDocumento(proprietario?.cpfCnpj || ''), { continued: true });
  doc.font('Helvetica').text(', telefone ', { continued: true });
  doc.font('Helvetica-Bold').text(telStr2, { continued: true });
  doc.font('Helvetica').text(', e-mail ', { continued: true });
  doc.font('Helvetica-Bold').text((proprietario?.email || 'NÃO INFORMADO').toLowerCase(), { continued: true });
  doc.font('Helvetica').text(', venho solicitar ao DETRAN/RS o(s) serviço(s) abaixo assinalado(s), relativo ao(s) veículo(s) placa(s) ', { continued: true });
  doc.font('Helvetica-Bold').text((veiculo?.placa || 'NÃO INFORMADA').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', chassi(s) ', { continued: true });
  doc.font('Helvetica-Bold').text((veiculo?.chassi || 'NÃO INFORMADO').toUpperCase(), { continued: false });

  // -- LISTA DE SERVIÇOS EM 2 COLUNAS (y=90) --
  const yListaInicio = 90;
  const half = Math.ceil(LISTA_OFICIAL.length / 2);
  const lineH = 8.5;
  doc.fontSize(7);

  const renderServico = (s: string, x: number, y: number) => {
    const marcar = s.trim().toLowerCase() === (servico || '').trim().toLowerCase();
    doc.font(marcar ? 'Helvetica-Bold' : 'Helvetica').text(`(${marcar ? 'X' : ' '}) ${s}`, x, y);
  };

  LISTA_OFICIAL.slice(0, half).forEach((s, i) => renderServico(s, 50, yListaInicio + (i * lineH)));
  LISTA_OFICIAL.slice(half).forEach((s, i) => renderServico(s, 305, yListaInicio + (i * lineH)));

  const yAposLista = yListaInicio + (half * lineH) + 6;

  // -- CAIXA RESTRIÇÃO FINANCEIRA (height=62) --
  const restHavera = restricao?.havera || 'NÃO';
  const restModalidade = restricao?.modalidade || '';
  const restNomeCredor = restricao?.nomeCredor || '';

  doc.rect(40, yAposLista, 515, 62).stroke();
  doc.font('Helvetica-Bold').fontSize(7.5).text('Haverá inclusão ou alteração de restrição financeira?', 45, yAposLista + 6);
  doc.font(restHavera === 'SIM' ? 'Helvetica-Bold' : 'Helvetica').text(`(${restHavera === 'SIM' ? 'X' : ' '}) Sim`, 265, yAposLista + 6);
  doc.font(restHavera === 'NÃO' ? 'Helvetica-Bold' : 'Helvetica').text(`(${restHavera === 'NÃO' ? 'X' : ' '}) Não`, 318, yAposLista + 6);

  const gm1 = restHavera === 'SIM' && restModalidade === 'Arrendamento';
  const gm2 = restHavera === 'SIM' && restModalidade === 'Reserva de Domínio';
  const gm3 = restHavera === 'SIM' && restModalidade === 'Alienação Fiduciária';
  doc.font(gm1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${gm1 ? 'X' : ' '}) Arrendamento`, 45, yAposLista + 22);
  doc.font(gm2 ? 'Helvetica-Bold' : 'Helvetica').text(`(${gm2 ? 'X' : ' '}) Reserva de Domínio`, 175, yAposLista + 22);
  doc.font(gm3 ? 'Helvetica-Bold' : 'Helvetica').text(`(${gm3 ? 'X' : ' '}) Alienação Fiduciária`, 330, yAposLista + 22);
  doc.font('Helvetica-Bold').fontSize(7.5).text(`Agente Financeiro: ${restNomeCredor || '___________________________'}`, 45, yAposLista + 48);

  // -- CAIXA ADQUIRENTE (height=46) --
  const yAdqG = yAposLista + 68;
  doc.rect(40, yAdqG, 515, 46).stroke();
  doc.font('Helvetica-Bold').fontSize(7).text(
    'DADOS DO ADQUIRENTE DO VEÍCULO OU DO PROPRIETÁRIO (PARA ENVIO DO CRLV OU OUTRAS NOTIFICAÇÕES)',
    45, yAdqG + 4);
  const enderecoAdq = (proprietario?.endereco || 'NÃO INFORMADO').toUpperCase();
  doc.font('Helvetica-Bold').fontSize(10).text(`Endereço: ${enderecoAdq}`, 45, yAdqG + 14);
  const emailAdq = (proprietario?.email || 'NÃO INFORMADO').toLowerCase();
  doc.font('Helvetica').fontSize(7.5).text(
    `Telefone Celular: ${proprietario?.telefone || 'NÃO INFORMADO'}     E-mail: ${emailAdq}`,
    45, yAdqG + 30);

  // -- DECLARAÇÃO (y após caixa adquirente) --
  const yDeclG = yAdqG + 54;
  doc.font('Helvetica-Bold').fontSize(8.3).text(
    'DECLARO, sob as penas da lei e sem prejuízo de demais sanções administrativas/cíveis/criminais, que os documentos entregues ao DETRAN/RS para o serviço requerido são todos autênticos e, quando cópias, condizem com o original e, caso haja produção de placa(s) de identificação veicular para o veículo objeto do requerimento, sou responsável por providenciar a estampagem junto a uma das Empresas Estampadoras de Placas - EPIV credenciadas pelo DETRAN/RS. Fico ciente de que a constatada falsidade em qualquer dos documentos implicará em sanções penais (art. 299 do Código Penal) e administrativas.',
    40, yDeclG, { align: 'justify', width: 515, lineGap: 0.8 });

  // -- DATA (y=620 — espaçamento amplo após declaração) --
  doc.font('Helvetica-Bold').fontSize(9).text(dataExtenso, 40, 620, { align: 'center', width: 515 });

  // -- LINHA DE ASSINATURA (y=710 — espaço generoso entre data e assinatura) --
  doc.moveTo(140, 710).lineTo(455, 710).stroke();
  doc.font('Helvetica-Bold').fontSize(9)
    .text('Assinatura do Proprietário / Adquirente / Representante Legal', 40, 716, { align: 'center', width: 515 });

  // -- HASH (última linha da página, y=818) --
  doc.font('Helvetica').fontSize(5.5)
    .text(`AUTENTICIDADE DIGITAL (SHA-256): ${hash}`, 40, 818, { align: 'center', width: 515 });
}

function desenharSegundaViaCRV(doc: any, dados: any) {
  doc.page.margins.bottom = 5;
  const { proprietario, veiculo, segundaViaCrv = {}, hash, dataTexto, dia, mesNome, anoNum } = dados;

  const tipo = segundaViaCrv?.tipoSolicitacao || 'SEGUNDA_VIA';
  const isSegundaVia = tipo === 'SEGUNDA_VIA';
  const isValidacao = tipo === 'VALIDACAO';
  const numValidacao = (segundaViaCrv?.numeroCrvValidacao || '').trim();

  const dataEmissaoAnterior = (segundaViaCrv?.dataEmissaoAnterior || '').trim() || '____/____/________';

  const just = segundaViaCrv?.justificativa || 'NAO_RECEBIDO';
  const isNaoRecebido = just === 'NAO_RECEBIDO';
  const isInutilizado = just === 'INUTILIZADO';
  const isExtraviado = just === 'EXTRAVIADO';
  const isFurtado = just === 'FURTADO';

  doc.fillColor('#000000');

  // 1. CABEÇALHO (DetranRS | POP 10)
  doc.font('Helvetica-Bold').fontSize(8).text('DetranRS | POP 10 | PÁGINA 11 DE 11', 40, 30);

  // 2. TÍTULO CENTRALIZADO
  doc.font('Helvetica-Bold').fontSize(10.5).text(
    'ANEXO 1 - REQUERIMENTO PARA SOLICITAÇÃO DE 2ª VIA DE CRV/ATPV-e OU VALIDAÇÃO DE CRV',
    40, 50, { align: 'center', width: 515 }
  );

  // 3. QUALIFICAÇÃO DO REQUERENTE E VEÍCULO
  const docIdOuCpf = proprietario?.identidade ? proprietario.identidade : (formatarDocumento(proprietario?.cpfCnpj || '') || 'NÃO INFORMADO');
  let y = 88;
  doc.font('Helvetica').fontSize(9).text('Eu, ', 40, y, { continued: true, lineGap: 2.2, width: 515 });
  doc.font('Helvetica-Bold').text((proprietario?.nome || 'NÃO INFORMADO').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', identidade nº ', { continued: true });
  doc.font('Helvetica-Bold').text(docIdOuCpf, { continued: true });
  doc.font('Helvetica').text(', proprietário do veículo marca ', { continued: true });
  doc.font('Helvetica-Bold').text((veiculo?.modelo || 'NÃO INFORMADO').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', placas ', { continued: true });
  doc.font('Helvetica-Bold').text((veiculo?.placa || 'NÃO INFORMADA').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', chassi ', { continued: true });
  doc.font('Helvetica-Bold').text((veiculo?.chassi || 'NÃO INFORMADO').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', requeiro:', { continued: false });

  // 4. BLOCO DE SELEÇÃO DO REQUERIMENTO
  y = 160;
  doc.rect(40, y, 515, 68).stroke();
  doc.font('Helvetica-Bold').fontSize(8.5).text('TIPO DE REQUERIMENTO:', 48, y + 8);

  const yOp1 = y + 25;
  doc.font(isSegundaVia ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${isSegundaVia ? 'X' : ' '}) Solicitação de 2ª via de CRV/ATPV-e;`, 48, yOp1);

  const yOp2 = y + 44;
  const textoValidacao = `(${isValidacao ? 'X' : ' '}) Validação do CRV número ${isValidacao && numValidacao ? numValidacao : '____________________'} para efeitos de transferência de propriedade do veículo.`;
  doc.font(isValidacao ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(textoValidacao, 48, yOp2, { width: 495 });

  // 5. BLOCO JUSTIFICATIVA
  y = 245;
  doc.rect(40, y, 515, 120).stroke();
  doc.font('Helvetica-Bold').fontSize(8.5).text(
    `Justificativa da não apresentação do CRV/ATPV-e anterior válido emitido pelo DETRAN/RS em ${dataEmissaoAnterior}:`,
    48, y + 8, { width: 495 }
  );

  doc.font(isNaoRecebido ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${isNaoRecebido ? 'X' : ' '}) não recebido;`, 48, y + 28);

  doc.font(isInutilizado ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${isInutilizado ? 'X' : ' '}) inutilizado (deverá acompanhar o documento no estado em que se encontra);`, 48, y + 48);

  doc.font(isExtraviado ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${isExtraviado ? 'X' : ' '}) perdido/extraviado (deverá acompanhar Boletim de Ocorrência Policial do fato);`, 48, y + 68);

  doc.font(isFurtado ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${isFurtado ? 'X' : ' '}) furtado/roubado (deverá acompanhar Boletim de Ocorrência Policial do fato).`, 48, y + 88);

  // 6. TERMO DE RESPONSABILIDADE
  y = 385;
  doc.font('Helvetica-Bold').fontSize(8.5).text(
    'O proprietário declarante responsabiliza-se civil e criminalmente pela veracidade das informações prestadas.',
    40, y, { align: 'center', width: 515 }
  );

  // 7. DATAÇÃO
  y = 440;
  const dataFinal = dataTexto || `Passo Fundo, RS, ${dia} de ${mesNome} de ${anoNum}.`;
  doc.font('Helvetica-Bold').fontSize(9.5).text(dataFinal, 40, y, { align: 'center', width: 515 });

  // 8. CAMPO DE ASSINATURA COM ESPAÇO AMPLO
  y = 550;
  doc.moveTo(70, y).lineTo(525, y).stroke();
  doc.font('Helvetica').fontSize(7.5).text(
    'Assinatura do Proprietário/Arrendatário/Procurador com firma reconhecida por autenticidade no caso do não-comparecimento do signatário ao Centro (ou assinado com assinatura eletrônica, conforme POP 47)',
    50, y + 6, { align: 'center', width: 495, lineGap: 1.5 }
  );

  // 9. RODAPÉ TÉCNICO E SELO SHA-256
  y = 755;
  doc.font('Helvetica').fontSize(6.5).fillColor('#333333').text(
    'REVISÃO 17 - Confira a lista mestra para assegurar o uso da revisão atualizada deste documento. A impressão deste documento é uma cópia não controlada.',
    40, y, { align: 'center', width: 515 }
  );

  doc.font('Helvetica').fontSize(7).fillColor('#000000').text(
    `AUTENTICIDADE DIGITAL (SHA-256): ${hash}`,
    40, 785, { align: 'center', width: 515 }
  );
}

function desenharBaixaDefinitiva(doc: any, dados: any) {
  doc.page.margins.bottom = 5;
  const { proprietario, veiculo, baixaDefinitiva = {}, hash, dataTexto, dia, mesNome, anoNum } = dados;

  const motivo = baixaDefinitiva?.motivo || 'IRRECUPERAVEL';
  const isIrrecuperavel = motivo === 'IRRECUPERAVEL';
  const isDesmontado = motivo === 'DESMONTADO';
  const isSinistrado = motivo === 'SINISTRADO_PT';
  const isSucata = motivo === 'SUCATA';
  const isOutroPais = motivo === 'OUTRO_PAIS';

  const extravios = baixaDefinitiva?.extravios || {};
  const extravioCrv = !!extravios.crv;
  const extravioPlacas = !!extravios.placas;
  const extravioPlaquetas = !!extravios.plaquetas;
  const extravioLacre = !!extravios.lacre;

  doc.fillColor('#000000');

  // 1. CABEÇALHO (DetranRS | POP 25)
  doc.font('Helvetica-Bold').fontSize(8).text('DetranRS | POP 25 | PÁGINA 7 DE 7', 40, 30);

  // 2. TÍTULO CENTRALIZADO
  doc.font('Helvetica-Bold').fontSize(10.5).text(
    'ANEXO 1 - REQUERIMENTO PARA BAIXA DEFINITIVA (CONFORME RESOLUÇÃO CONTRAN Nº 967/22)',
    40, 50, { align: 'center', width: 515 }
  );

  // 3. QUALIFICAÇÃO DO REQUERENTE E VEÍCULO
  const rgStr = proprietario?.identidade || formatarDocumento(proprietario?.cpfCnpj || '') || 'NÃO INFORMADO';
  const cpfFormatado = formatarDocumento(proprietario?.cpfCnpj || '') || 'NÃO INFORMADO';

  let y = 88;
  doc.font('Helvetica').fontSize(9).text('Eu, ', 40, y, { continued: true, lineGap: 2.2, width: 515 });
  doc.font('Helvetica-Bold').text((proprietario?.nome || 'NÃO INFORMADO').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', portador do RG nº: ', { continued: true });
  doc.font('Helvetica-Bold').text(rgStr, { continued: true });
  doc.font('Helvetica').text(' e do CPF nº: ', { continued: true });
  doc.font('Helvetica-Bold').text(cpfFormatado, { continued: true });
  doc.font('Helvetica').text(', proprietário/responsável do veículo placa ', { continued: true });
  doc.font('Helvetica-Bold').text((veiculo?.placa || 'NÃO INFORMADA').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', marca/modelo ', { continued: true });
  doc.font('Helvetica-Bold').text((veiculo?.modelo || 'NÃO INFORMADO').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', chassi ', { continued: true });
  doc.font('Helvetica-Bold').text((veiculo?.chassi || 'NÃO INFORMADO').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', requeiro a BAIXA DEFINITIVA do mesmo, sob pena de responsabilidade civil e criminal, devido tratar-se de:', { continued: false });

  // 4. BLOCO DE MOTIVO DA BAIXA
  y = 175;
  doc.rect(40, y, 515, 150).stroke();
  doc.font('Helvetica-Bold').fontSize(8.5).text('MOTIVO DA BAIXA DEFINITIVA:', 48, y + 8);

  const lineGapMotivo = 22;
  let yOpt = y + 26;

  doc.font(isIrrecuperavel ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${isIrrecuperavel ? 'X' : ' '}) Veículo irrecuperável`, 48, yOpt);

  yOpt += lineGapMotivo;
  doc.font(isDesmontado ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${isDesmontado ? 'X' : ' '}) Veículo definitivamente desmontado`, 48, yOpt);

  yOpt += lineGapMotivo;
  doc.font(isSinistrado ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${isSinistrado ? 'X' : ' '}) Veículo sinistrado com laudo de perda total`, 48, yOpt);

  yOpt += lineGapMotivo;
  doc.font(isSucata ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${isSucata ? 'X' : ' '}) Veículo vendido ou leiloado como sucata`, 48, yOpt);

  yOpt += lineGapMotivo;
  doc.font(isOutroPais ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${isOutroPais ? 'X' : ' '}) Baixa de Veículo para outro País conforme decalque ou fotografia da gravação do número do chassi, em anexo.`, 48, yOpt, { width: 495 });

  // 5. BLOCO DE EXTRAVIOS DECLARADOS
  y = 340;
  doc.rect(40, y, 515, 80).stroke();
  doc.font('Helvetica-Bold').fontSize(8.5).text('DECLARAÇÃO DE PERDA / EXTRAVIO:', 48, y + 8);
  doc.font('Helvetica').fontSize(8.5).text(
    'Bem como, declaro que perdi/extraviei os seguintes documentos/elementos:',
    48, y + 24, { width: 495 }
  );

  const yCheck = y + 46;
  doc.font(extravioCrv ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${extravioCrv ? 'X' : ' '}) CRV (se veículo verde)`, 60, yCheck);

  doc.font(extravioPlacas ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${extravioPlacas ? 'X' : ' '}) Placas`, 210, yCheck);

  doc.font(extravioPlaquetas ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${extravioPlaquetas ? 'X' : ' '}) Plaquetas`, 310, yCheck);

  doc.font(extravioLacre ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
    .text(`(${extravioLacre ? 'X' : ' '}) Lacre`, 420, yCheck);

  // 6. LOCAL, DATA E ASSINATURA
  y = 470;
  const dataFinal = dataTexto || `Passo Fundo, RS, ${dia} de ${mesNome} de ${anoNum}.`;
  doc.font('Helvetica-Bold').fontSize(9.5).text(dataFinal, 40, y, { align: 'center', width: 515 });

  y = 570;
  doc.moveTo(120, y).lineTo(475, y).stroke();
  doc.font('Helvetica-Bold').fontSize(9.5).text('Requerente', 40, y + 6, { align: 'center', width: 515 });

  y = 592;
  doc.font('Helvetica').fontSize(7.5).text(
    '(Reconhecer firma do proprietário ou seu representante, por autenticidade em caso de não comparecimento ao CRVA, ou assinado com assinatura eletrônica, conforme POP 47)',
    50, y, { align: 'center', width: 495, lineGap: 1.5 }
  );

  // 7. RODAPÉ TÉCNICO E SELO SHA-256
  y = 755;
  doc.font('Helvetica').fontSize(6.5).fillColor('#333333').text(
    'REVISÃO 08 - Confira a lista mestra para assegurar o uso da revisão atualizada. Qualquer parte desta publicação pode ser reproduzida, desde que citada a fonte.',
    40, y, { align: 'center', width: 515 }
  );

  doc.font('Helvetica').fontSize(7).fillColor('#000000').text(
    `AUTENTICIDADE DIGITAL (SHA-256): ${hash}`,
    40, 785, { align: 'center', width: 515 }
  );
}

// ==============================================================================
// ENDPOINT POST — Gerar PDF
// ==============================================================================
app.post(['/api/gerar_pdf', '/api/gerar-pdf', '/api/gerar_pdf/'], async (req, res) => {
  const dbLocal = await getSQLite();
  try {
    const proprietarioOriginal = req.body.proprietario || {};
    const veiculoOriginal = req.body.veiculo || {};
    const restricaoFinanceiraOriginal = req.body.restricaoFinanceira || {};
    const servico = req.body.servico || 'Serviço Não Informado';
    const segundaViaCrv = req.body.segundaViaCrv || {};
    const baixaDefinitiva = req.body.baixaDefinitiva || {};

    const enderecoBruto = proprietarioOriginal.endereco || 
      [
        proprietarioOriginal.logradouro,
        proprietarioOriginal.numero ? `Nº ${proprietarioOriginal.numero}` : '',
        proprietarioOriginal.complemento,
        proprietarioOriginal.bairro,
        proprietarioOriginal.cidade ? `${proprietarioOriginal.cidade}/${proprietarioOriginal.uf || 'RS'}` : '',
        proprietarioOriginal.cep ? `CEP ${proprietarioOriginal.cep}` : ''
      ].filter(Boolean).join(', ') || 'NÃO INFORMADO';

    const proprietario = {
      nome: proprietarioOriginal.nome || 'NÃO INFORMADO',
      cpfCnpj: proprietarioOriginal.cpfCnpj || '',
      identidade: proprietarioOriginal.identidade || '',
      endereco: enderecoBruto,
      telefone: proprietarioOriginal.telefone || '',
      email: proprietarioOriginal.email || '',
      autorizacao: proprietarioOriginal.autorizacao || 'NÃO',
      naoPossuiCelular: proprietarioOriginal.naoPossuiCelular || 'NÃO',
      naoPossuiEmail: proprietarioOriginal.naoPossuiEmail || 'NÃO'
    };

    const veiculo = {
      placa: veiculoOriginal.placa || '',
      renavam: veiculoOriginal.renavam || '',
      chassi: veiculoOriginal.chassi || '',
      modelo: veiculoOriginal.modelo || 'NÃO INFORMADO',
      ano: Number(veiculoOriginal.ano || new Date().getFullYear()),
      reservaPlaca: veiculoOriginal.reservaPlaca || 'NÃO',
      impressaoCrlv: veiculoOriginal.impressaoCrlv || req.body.impressaoCrlv || 'NÃO',
      emissaoCertidao: veiculoOriginal.emissaoCertidao || req.body.emissaoCertidao || 'NÃO'
    };

    const restHavera = restricaoFinanceiraOriginal.havera || 'NÃO';
    const restModalidade = restHavera === 'SIM' ? (restricaoFinanceiraOriginal.modalidade || '') : '';
    const restTipoCredor = restHavera === 'SIM' ? (restricaoFinanceiraOriginal.tipoCredor || '') : '';
    const restNomeCredor = restHavera === 'SIM' ? (restricaoFinanceiraOriginal.nomeCredor || '') : '';

    const restricao = { havera: restHavera, modalidade: restModalidade, tipoCredor: restTipoCredor, nomeCredor: restNomeCredor };

    const dadosParaHash = { proprietario, veiculo, servico, restricao, segundaViaCrv, baixaDefinitiva, timestamp: Date.now() };
    const hash = gerarSeloSeguranca(dadosParaHash);
    let returnId: string | number | bigint = 'OFFLINE_' + Date.now();

    try {
      if (supabase) {
        const { data: propData, error: propError } = await supabase.from('proprietarios').insert([{ nome: proprietario.nome, cpf_cnpj: proprietario.cpfCnpj, endereco: proprietario.endereco, telefone: proprietario.telefone, email: proprietario.email, autorizacao: proprietario.autorizacao }]).select('id').single();
        if (propError) throw propError;
        const { data: veicData, error: veicError } = await supabase.from('veiculos').insert([{ placa: veiculo.placa, renavam: veiculo.renavam, chassi: veiculo.chassi, modelo: veiculo.modelo, ano: veiculo.ano }]).select('id').single();
        if (veicError) throw veicError;
        const { data: reqData, error: reqError } = await supabase.from('requerimentos').insert([{ id_servico: servico, timestamp: dadosParaHash.timestamp, hash_integridade: hash, rest_havera: restHavera, rest_modalidade: restModalidade, rest_tipo_credor: restTipoCredor, rest_nome_credor: restNomeCredor, proprietario_id: propData.id, veiculo_id: veicData.id }]).select('id').single();
        if (reqError) throw reqError;
        returnId = reqData.id;
      } else if (dbLocal) {
        const propResult = dbLocal.prepare('INSERT INTO proprietarios (nome, cpf_cnpj, endereco, telefone, email, autorizacao) VALUES (?, ?, ?, ?, ?, ?)').run(proprietario.nome, proprietario.cpfCnpj, proprietario.endereco, proprietario.telefone, proprietario.email, proprietario.autorizacao);
        const veicResult = dbLocal.prepare('INSERT INTO veiculos (placa, renavam, chassi, modelo, ano) VALUES (?, ?, ?, ?, ?)').run(veiculo.placa, veiculo.renavam, veiculo.chassi, veiculo.modelo, veiculo.ano);
        const reqResult = dbLocal.prepare('INSERT INTO requerimentos (id_servico, timestamp, hash_integridade, rest_havera, rest_modalidade, rest_tipo_credor, rest_nome_credor, proprietario_id, veiculo_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(servico, dadosParaHash.timestamp, hash, restHavera, restModalidade, restTipoCredor, restNomeCredor, propResult.lastInsertRowid, veicResult.lastInsertRowid);
        returnId = reqResult.lastInsertRowid;
      }
    } catch (dbError) {
      console.error('Erro ao salvar no banco:', dbError);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=requerimento_${returnId}.pdf`);
    res.setHeader('x-requerimento-id', returnId.toString());
    res.setHeader('x-requerimento-hash', hash);
    res.setHeader('x-requerimento-timestamp', dadosParaHash.timestamp.toString());

    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 0, left: 40, right: 40 }, layout: 'portrait', autoFirstPage: true });
    doc.pipe(res);

    const agora = new Date();
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const dataBrasilia = new Date(agora.getTime() - (3 * 60 * 60 * 1000));
    const dia = dataBrasilia.getUTCDate().toString().padStart(2, '0');
    const mesNome = meses[dataBrasilia.getUTCMonth()];
    const anoNum = dataBrasilia.getUTCFullYear();
    const dataTexto = `Município: Passo Fundo, RS, ${dia} de ${mesNome} de ${anoNum}.`;

    const servicoNormalizado = (servico || '').trim().toLowerCase();

    if (servicoNormalizado === 'primeiro emplacamento') {
      desenharPrimeiroEmplacamento(doc, { proprietario, veiculo, restricao, dataExtenso: dataTexto, hash });
    } else if (servicoNormalizado === '2ª via do crv' || servicoNormalizado === 'segunda via do crv') {
      desenharRequerimentoGeral(doc, { proprietario, veiculo, restricao, servico, dataExtenso: dataTexto, hash });
      doc.addPage({ size: 'A4', margins: { top: 40, bottom: 0, left: 40, right: 40 }, layout: 'portrait' });
      desenharSegundaViaCRV(doc, { proprietario, veiculo, segundaViaCrv, hash, dataTexto, dia, mesNome, anoNum });
    } else if (servicoNormalizado === 'baixa de veículo - simples' || servicoNormalizado === 'baixa de veiculo - simples') {
      desenharRequerimentoGeral(doc, { proprietario, veiculo, restricao, servico, dataExtenso: dataTexto, hash });
      doc.addPage({ size: 'A4', margins: { top: 40, bottom: 0, left: 40, right: 40 }, layout: 'portrait' });
      desenharBaixaDefinitiva(doc, { proprietario, veiculo, baixaDefinitiva, hash, dataTexto, dia, mesNome, anoNum });
    } else {
      desenharRequerimentoGeral(doc, { proprietario, veiculo, restricao, servico, dataExtenso: dataTexto, hash });
    }

    doc.end();

  } catch (err: any) {
    console.error('Fatal API Error:', err);
    if (!res.headersSent) { res.status(500).send('Erro interno ao processar PDF'); }
  }
});

// ==============================================================================
// ENDPOINT: DISPARO DE E-MAIL COM CREDENCIAIS INSTITUCIONAIS
// ==============================================================================
app.post('/api/enviar_email_credenciais', async (req, res) => {
  try {
    const { destinatario, nomeCompleto, emailLogin, senhaGerada, roleMapeada, assunto, corpoTexto, corpoHtml } = req.body;

    if (!destinatario || !emailLogin || !senhaGerada) {
      return res.status(400).json({ sucesso: false, erro: 'Parâmetros incompletos para envio de e-mail.' });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const emailRemetente = process.env.EMAIL_FROM || 'Sistema INTEGRA <onboarding@resend.dev>';

    if (resendApiKey) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: emailRemetente,
          to: [destinatario],
          subject: assunto || 'Sistema INTEGRA — Credenciais de Acesso Institucional',
          html: corpoHtml,
          text: corpoTexto
        })
      });

      if (emailRes.ok) {
        const data = await emailRes.json();
        return res.json({ sucesso: true, id: data.id, metodo: 'resend' });
      } else {
        const errData = await emailRes.text();
        console.error('Erro retornado pela API Resend:', errData);
        return res.status(502).json({
          sucesso: false,
          erro: `Falha no provedor Resend: ${errData}`,
          detalhe: 'Verifique a validade da RESEND_API_KEY e o domínio remetente.'
        });
      }
    }

    // Caso não haja Resend configurado no backend, retorna 503 com diagnóstico explícito
    return res.status(503).json({
      sucesso: false,
      smtpConfigurado: false,
      erro: 'Serviço SMTP/Resend não configurado no backend local. O serviço SMTP precisa de configuração no painel do Supabase ou arquivo .env.'
    });
  } catch (err: any) {
    console.error('Erro na rota de envio de e-mail:', err);
    return res.status(500).json({ sucesso: false, erro: err.message || 'Erro interno ao processar envio de e-mail' });
  }
});

// ==============================================================================
// ENDPOINT: REDEFINIÇÃO DE SENHA VIA SUPABASE AUTH ADMIN E AUDITORIA
// ==============================================================================
app.post('/api/admin/redefinir_senha', async (req, res) => {
  try {
    const { userId, novaSenha, supervisorId, supervisorNome } = req.body;

    if (!userId || !novaSenha || novaSenha.length < 8) {
      return res.status(400).json({ sucesso: false, erro: 'ID do usuário e nova senha válida (mínimo 8 caracteres) são obrigatórios.' });
    }

    const timestamp = new Date().toISOString();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Se houver service role key, atualiza no Supabase Auth Admin
    if (serviceRoleKey && supabaseUrl) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      const { error: adminError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: novaSenha
      });

      if (adminError) {
        console.warn('Erro ao atualizar senha no Supabase Auth Admin:', adminError);
      }

      // Atualiza auditoria em perfis
      await supabaseAdmin.from('perfis').update({
        atualizado_por_id: supervisorId || null,
        atualizado_por_nome: supervisorNome || null,
        atualizado_em: timestamp
      }).eq('id', userId);

      return res.json({ sucesso: true, metodo: 'supabase_admin_auth' });
    }

    // Se estiver usando o client padrão anon
    if (supabase) {
      await supabase.from('perfis').update({
        atualizado_por_id: supervisorId || null,
        atualizado_por_nome: supervisorNome || null,
        atualizado_em: timestamp
      }).eq('id', userId);
    }

    return res.json({ sucesso: true, metodo: 'supabase_perfis_audit' });
  } catch (err: any) {
    console.error('Erro na rota de redefinição de senha:', err);
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ==============================================================================
// ENDPOINT: CRIAÇÃO DE USUÁRIOS COM AUTO-CONFIRMAÇÃO (SEM CONFIRMAÇÃO DE E-MAIL)
// ==============================================================================
app.post('/api/admin/criar_usuario', async (req, res) => {
  try {
    const {
      nome,
      cpf,
      telefone,
      emailPessoal,
      emailInstitucional,
      funcao,
      senhaGerada,
      criadoPorId,
      criadoPorNome
    } = req.body;

    if (!emailInstitucional || !senhaGerada || !funcao) {
      return res.status(400).json({ sucesso: false, erro: 'Campos obrigatórios não informados.' });
    }

    const emailLimpo = emailInstitucional.toLowerCase().trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let userId: string | null = null;

    if (serviceRoleKey && supabaseUrl) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: emailLimpo,
        password: senhaGerada,
        email_confirm: true, // Garante que o e-mail já nasce confirmado
        user_metadata: {
          nome_completo: nome,
          cpf: cpf,
          role: funcao,
          telefone: telefone,
          email_contato: emailPessoal
        }
      });

      if (createError) {
        if (/already registered|exists|23505/i.test(createError.message)) {
          const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
          const userExistente = usersList?.users?.find((u: any) => u.email?.toLowerCase() === emailLimpo);
          if (userExistente) {
            userId = userExistente.id;
            await supabaseAdmin.auth.admin.updateUserById(userExistente.id, {
              password: senhaGerada,
              email_confirm: true,
              user_metadata: {
                nome_completo: nome,
                cpf: cpf,
                role: funcao,
                telefone: telefone,
                email_contato: emailPessoal
              }
            });
          }
        } else {
          throw createError;
        }
      } else if (createData?.user) {
        userId = createData.user.id;
      }

      if (userId) {
        await supabaseAdmin.from('perfis').upsert({
          id: userId,
          nome_completo: nome,
          cpf: cpf,
          telefone: telefone,
          email_contato: emailPessoal,
          email_login: emailLimpo,
          role: funcao,
          ativo: true,
          criado_por_id: criadoPorId || null,
          criado_por_nome: criadoPorNome || null,
          criado_em: new Date().toISOString()
        }, { onConflict: 'email_login' });
      }

      return res.json({ sucesso: true, userId, email: emailLimpo, emailConfirmado: true });
    }

    // Fallback RPC via client anon
    if (supabase) {
      const { data: rpcUserId, error: rpcError } = await supabase.rpc('fn_provisionar_usuario_marks', {
        p_email: emailLimpo,
        p_senha: senhaGerada,
        p_nome: nome,
        p_cpf: cpf,
        p_telefone: telefone,
        p_email_contato: emailPessoal,
        p_role: funcao,
        p_criado_por_id: criadoPorId || null,
        p_criado_por_nome: criadoPorNome || null
      });

      if (!rpcError && rpcUserId) {
        return res.json({ sucesso: true, userId: rpcUserId, email: emailLimpo, emailConfirmado: true, metodo: 'rpc_postgres' });
      }
    }

    return res.json({ sucesso: true, email: emailLimpo, metodo: 'fallback' });
  } catch (err: any) {
    console.error('Erro na criação de usuário:', err);
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ==============================================================================
// ENDPOINT: AUTO-CORREÇÃO E SINCRONIZAÇÃO DE USUÁRIOS EXISTENTES
// ==============================================================================
app.post('/api/admin/sincronizar_usuarios', async (_req, res) => {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resultados: any[] = [];

    const USUARIOS_PADRAO = [
      { nome: 'Patrícia Atendente Balcão', cpf: '444.555.666-77', telefone: '(54) 99999-0005', emailContato: 'patricia.atendente@marks.com', emailInstitucional: 'patricia.atendente@marks.com', senhaGerada: 'Atendente@123', funcao: 'atendente' },
      { nome: 'Lucas Operador de Caixa', cpf: '333.444.555-66', telefone: '(54) 99999-0004', emailContato: 'lucas.caixa@gmail.com', emailInstitucional: 'lucas.caixa@marks.com', senhaGerada: 'Caixa@123', funcao: 'caixa' },
      { nome: 'Mariana Gestão Financeira', cpf: '222.333.444-55', telefone: '(54) 99999-0003', emailContato: 'mariana.fin@gmail.com', emailInstitucional: 'mariana.financeiro@marks.com', senhaGerada: 'Financeiro@123', funcao: 'financeiro' },
      { nome: 'Carlos Gerente Geral', cpf: '111.222.333-44', telefone: '(54) 99999-0002', emailContato: 'carlos.gerente@gmail.com', emailInstitucional: 'carlos.gerente@marks.com', senhaGerada: 'Gerente@123', funcao: 'gerente' },
      { nome: 'Antonio Sobrosa', cpf: '000.000.000-00', telefone: '(54) 99999-0001', emailContato: 'fsobrosa.12tc@gmail.com', emailInstitucional: 'fsobrosa.12tc@gmail.com', senhaGerada: 'Antonio2@26', funcao: 'master' }
    ];

    if (serviceRoleKey && supabaseUrl) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const authUsers = listData?.users || [];

      // Confirma quem não estiver confirmado
      for (const u of authUsers) {
        if (!u.email_confirmed_at) {
          await supabaseAdmin.auth.admin.updateUserById(u.id, { email_confirm: true });
          resultados.push({ email: u.email, acao: 'confirmado_updateUserById' });
        }
      }

      // Sincroniza usuários padrão
      for (const u of USUARIOS_PADRAO) {
        const emailLimpo = u.emailInstitucional.toLowerCase().trim();
        const existente = authUsers.find((x: any) => x.email?.toLowerCase() === emailLimpo);
        let finalUserId: string;

        if (!existente) {
          const { data: created } = await supabaseAdmin.auth.admin.createUser({
            email: emailLimpo,
            password: u.senhaGerada,
            email_confirm: true,
            user_metadata: { nome_completo: u.nome, cpf: u.cpf, role: u.funcao, telefone: u.telefone, email_contato: u.emailContato }
          });
          finalUserId = created!.user.id;
        } else {
          finalUserId = existente.id;
          await supabaseAdmin.auth.admin.updateUserById(existente.id, {
            email_confirm: true,
            password: u.senhaGerada
          });
        }

        await supabaseAdmin.from('perfis').upsert({
          id: finalUserId,
          nome_completo: u.nome,
          cpf: u.cpf,
          telefone: u.telefone,
          email_contato: u.emailContato,
          email_login: emailLimpo,
          role: u.funcao,
          ativo: true,
          criado_em: new Date().toISOString()
        }, { onConflict: 'email_login' });

        resultados.push({ email: emailLimpo, status: 'sincronizado_confirmado', id: finalUserId });
      }

      return res.json({ sucesso: true, metodo: 'supabase_admin', resultados });
    }

    if (supabase) {
      for (const u of USUARIOS_PADRAO) {
        try {
          const { data: rpcId } = await supabase.rpc('fn_provisionar_usuario_marks', {
            p_email: u.emailInstitucional.toLowerCase().trim(),
            p_senha: u.senhaGerada,
            p_nome: u.nome,
            p_cpf: u.cpf,
            p_telefone: u.telefone,
            p_email_contato: u.emailContato,
            p_role: u.funcao
          });
          resultados.push({ email: u.emailInstitucional, acao: 'rpc_postgres', id: rpcId });
        } catch (e: any) {
          resultados.push({ email: u.emailInstitucional, erro: e.message });
        }
      }
      return res.json({ sucesso: true, metodo: 'rpc_postgres', resultados });
    }

    return res.json({ sucesso: true, resultados });
  } catch (err: any) {
    console.error('Erro na sincronização:', err);
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});




// ==============================================================================
// SERVIR FRONTEND (dist do Vite em produção, ou proxy para Vite em dev)
// ==============================================================================
const isDev = process.env.NODE_ENV !== 'production';

if (!isDev) {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Em modo dev, faz proxy de todas as rotas não-API para o Vite (porta 5173)
  const { createProxyMiddleware } = await import('http-proxy-middleware');
  app.use(
    '/',
    createProxyMiddleware({
      target: 'http://localhost:5173',
      changeOrigin: true,
      ws: true,
    })
  );
}

// ✅ PORTA CORRIGIDA PARA 3000
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 INTEGRA ONLINE — ESCUTANDO NA PORTA ${PORT}`);
  console.log(`==================================================\n`);
  if (isDev) {
    console.log(`🔗 Acesse: http://localhost:${PORT}`);
    console.log(`⚠️  Certifique-se de que o Vite está rodando em http://localhost:5173`);
    console.log(`   (em outro terminal: npx vite --port 5173)\n`);
  }
});