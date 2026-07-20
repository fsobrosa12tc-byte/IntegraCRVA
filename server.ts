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
  const rgStr = proprietario.identidade ? `, Identidade nº ${proprietario.identidade}` : '';
  const telStr = validarFlag(proprietario.naoPossuiCelular) ? 'NÃO POSSUI' : (proprietario.telefone || '(__) _____-____');

  let y = 65;
  doc.font('Helvetica').fontSize(8).text('Eu, ', 40, y, { continued: true, lineGap: 1.0 });
  doc.font('Helvetica-Bold').text(proprietario.nome.toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', CPF/CNPJ nº ', { continued: true });
  doc.font('Helvetica-Bold').text(formatarDocumento(proprietario.cpfCnpj), { continued: true });
  doc.font('Helvetica').text(`${rgStr}, Telefone `, { continued: true });
  doc.font('Helvetica-Bold').text(telStr, { continued: true });
  doc.font('Helvetica').text(', requeiro ao DETRAN/RS a realização do processo de primeiro emplacamento, relativo ao(s) veículo(s) chassi(s) ', { continued: true });
  doc.font('Helvetica-Bold').text(veiculo.chassi.toUpperCase(), { continued: false });

  // Bloco Reserva de Placas
  y = 115;
  doc.font('Helvetica-Bold').fontSize(8).text('Haverá Reserva de Placas:', 40, y);
  doc.font(reservaSim ? 'Helvetica-Bold' : 'Helvetica').text(`(${reservaSim ? 'X' : ' '}) Sim`, 170, y);
  doc.font(reservaNao ? 'Helvetica-Bold' : 'Helvetica').text(`(${reservaNao ? 'X' : ' '}) Não`, 220, y);

  if (reservaSim) {
    const p = String(veiculo.placa || dados?.placa || '').toUpperCase().trim();
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

  const isFid = restHavera && String(restricao.modalidade).toUpperCase().includes('ALIENAÇÃO');
  doc.font(isFid ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${isFid ? 'X' : ' '}) Alienação Fiduciária`, 45, y + 18);
  doc.font('Helvetica-Bold').fontSize(7.5).text(`Agente Financeiro: ${restricao.nomeCredor || "___________________________"}`, 45, y + 36);

  // Bloco Adquirente
  y = 215;
  doc.rect(40, y, 515, 40).stroke();
  doc.font('Helvetica-Bold').fontSize(7).text('DADOS DO ADQUIRENTE (Preenchimento obrigatório dos campos abaixo, sendo vedada a inclusão de quaisquer dados de terceiros)', 45, y + 3);
  doc.font('Helvetica-Bold').fontSize(8.5).text(`Endereço: ${proprietario.endereco.toUpperCase()}`, 45, y + 12);

  const noCel = validarFlag(proprietario.naoPossuiCelular);
  const noMail = validarFlag(proprietario.naoPossuiEmail);
  doc.font('Helvetica').fontSize(7.5).text(`Telefone: ${noCel ? 'NÃO POSSUI' : proprietario.telefone} (${noCel ? 'X' : ' '}) Não possui celular   Email: ${noMail ? 'NÃO POSSUI' : proprietario.email.toLowerCase()} (${noMail ? 'X' : ' '}) Não possui Email`, 45, y + 24);

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

// ==============================================================================
// ENDPOINT POST — Gerar PDF
// ==============================================================================
app.post('/api/gerar_pdf', async (req, res) => {
  const dbLocal = await getSQLite();
  try {
    const proprietarioOriginal = req.body.proprietario || {};
    const veiculoOriginal = req.body.veiculo || {};
    const restricaoFinanceiraOriginal = req.body.restricaoFinanceira || {};
    const servico = req.body.servico || 'Serviço Não Informado';

    const proprietario = {
      nome: proprietarioOriginal.nome || 'NÃO INFORMADO',
      cpfCnpj: proprietarioOriginal.cpfCnpj || '',
      identidade: proprietarioOriginal.identidade || '',
      endereco: proprietarioOriginal.endereco || 'NÃO INFORMADO',
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

    const dadosParaHash = { proprietario, veiculo, servico, restricao, timestamp: Date.now() };
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

    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 0, left: 40, right: 40 }, layout: 'portrait', autoFirstPage: true, autoPageBreak: false });
    doc.pipe(res);

    const agora = new Date();
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const dataBrasilia = new Date(agora.getTime() - (3 * 60 * 60 * 1000));
    const dia = dataBrasilia.getUTCDate().toString().padStart(2, '0');
    const mesNome = meses[dataBrasilia.getUTCMonth()];
    const anoNum = dataBrasilia.getUTCFullYear();
    const dataTexto = `Município: Passo Fundo, RS, ${dia} de ${mesNome} de ${anoNum}.`;

    if (servico === "Primeiro Emplacamento") {
      // ====== TEMPLATE PRIMEIRO EMPLACAMENTO (UMA ÚNICA PÁGINA) ======
      // Layout A4: 595×842pt. Margens: 40pt. Área útil: 515×762pt (y=25..807)
      // Hash fixo em y=820 (última linha). Assinatura em y=730. Data em y=680.

      desenharPrimeiroEmplacamento(doc, { proprietario, veiculo, restricao, hash, dataExtenso: dataTexto });

    } else {
      // ====== TEMPLATE REQUERIMENTO GERAL (UMA ÚNICA PÁGINA) ======
      // Layout A4 535×842pt. Lista de serviços em 2 colunas com espaçamento de 8.5pt por item.
      doc.fillColor('#000000');

      // -- TÍTULO (y=22) --
      doc.font('Helvetica-Bold').fontSize(10.5)
        .text('ANEXO 1 - REQUERIMENTO DE SERVIÇO COM DECLARAÇÃO DE AUTENTICIDADE DE DOCUMENTOS',
          40, 22, { align: 'center', width: 515 });

      // -- PARÁGRAFO IDENTIFICAÇÃO (y=44) --
      const telStr2 = proprietario.telefone || '(__) _____-____';
      doc.font('Helvetica').fontSize(8.5).text('Eu, ', 40, 44, { continued: true, lineGap: 0.9 });
      doc.font('Helvetica-Bold').text(proprietario.nome.toUpperCase(), { continued: true });
      doc.font('Helvetica').text(', CPF/CNPJ nº ', { continued: true });
      doc.font('Helvetica-Bold').text(formatarDocumento(proprietario.cpfCnpj), { continued: true });
      doc.font('Helvetica').text(', telefone ', { continued: true });
      doc.font('Helvetica-Bold').text(telStr2, { continued: true });
      doc.font('Helvetica').text(', e-mail ', { continued: true });
      doc.font('Helvetica-Bold').text(proprietario.email.toLowerCase(), { continued: true });
      doc.font('Helvetica').text(', venho solicitar ao DETRAN/RS o(s) serviço(s) abaixo assinalado(s), relativo ao(s) veículo(s) placa(s) ', { continued: true });
      doc.font('Helvetica-Bold').text(veiculo.placa.toUpperCase(), { continued: true });
      doc.font('Helvetica').text(', chassi(s) ', { continued: true });
      doc.font('Helvetica-Bold').text(veiculo.chassi.toUpperCase(), { continued: false });

      // -- LISTA DE SERVIÇOS EM 2 COLUNAS (y=90) --
      const yListaInicio = 90;
      const half = Math.ceil(LISTA_OFICIAL.length / 2);
      const lineH = 8.5;
      doc.fontSize(7);

      const renderServico = (s: string, x: number, y: number) => {
        const marcar = s.trim().toLowerCase() === servico.trim().toLowerCase();
        doc.font(marcar ? 'Helvetica-Bold' : 'Helvetica').text(`(${marcar ? 'X' : ' '}) ${s}`, x, y);
      };

      LISTA_OFICIAL.slice(0, half).forEach((s, i) => renderServico(s, 50, yListaInicio + (i * lineH)));
      LISTA_OFICIAL.slice(half).forEach((s, i) => renderServico(s, 305, yListaInicio + (i * lineH)));

      const yAposLista = yListaInicio + (half * lineH) + 6;

      // -- CAIXA RESTRIÇÃO FINANCEIRA (height=62) --
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
      doc.font('Helvetica-Bold').fontSize(10).text(`Endereço: ${proprietario.endereco.toUpperCase()}`, 45, yAdqG + 14);
      doc.font('Helvetica').fontSize(7.5).text(
        `Telefone Celular: ${proprietario.telefone}     E-mail: ${proprietario.email.toLowerCase()}`,
        45, yAdqG + 30);

      // -- DECLARAÇÃO (y após caixa adquirente) --
      const yDeclG = yAdqG + 54;
      doc.font('Helvetica-Bold').fontSize(8.3).text(
        'DECLARO, sob as penas da lei e sem prejuízo de demais sanções administrativas/cíveis/criminais, que os documentos entregues ao DETRAN/RS para o serviço requerido são todos autênticos e, quando cópias, condizem com o original e, caso haja produção de placa(s) de identificação veicular para o veículo objeto do requerimento, sou responsável por providenciar a estampagem junto a uma das Empresas Estampadoras de Placas - EPIV credenciadas pelo DETRAN/RS. Fico ciente de que a constatada falsidade em qualquer dos documentos implicará em sanções penais (art. 299 do Código Penal) e administrativas.',
        40, yDeclG, { align: 'justify', width: 515, lineGap: 0.8 });

      // -- DATA (y=620 — espaçamento amplo após declaração) --
      doc.font('Helvetica-Bold').fontSize(9).text(dataTexto, 40, 620, { align: 'center', width: 515 });

      // -- LINHA DE ASSINATURA (y=710 — espaço generoso entre data e assinatura) --
      doc.moveTo(140, 710).lineTo(455, 710).stroke();
      doc.font('Helvetica-Bold').fontSize(9)
        .text('Assinatura do Proprietário / Adquirente / Representante Legal', 40, 716, { align: 'center', width: 515 });

      // -- HASH (última linha da página, y=818) --
      doc.font('Helvetica').fontSize(5.5)
        .text(`AUTENTICIDADE DIGITAL (SHA-256): ${hash}`, 40, 818, { align: 'center', width: 515 });
    }

    doc.end();

  } catch (err: any) {
    console.error('Fatal API Error:', err);
    if (!res.headersSent) { res.status(500).send('Erro interno ao processar PDF'); }
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