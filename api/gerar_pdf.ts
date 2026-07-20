import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import path from 'path';

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
    return sqlite;
  } catch (err) { return null; }
}

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

function desenharPrimeiroEmplacamento(doc: any, dados: any) {
  const { proprietario, veiculo, restricao, hash, dataExtenso } = dados;

  const checarSim = (campo: any) => {
    if (!campo) return false;
    const s = String(campo).trim().toUpperCase();
    return s === 'SIM' || s === 'TRUE' || campo === true;
  };

  // CAPTURA E VALIDAÇÃO RADICAL DAS VARIÁVEIS DO CORPO DA REQUISIÇÃO
  const reservaSim = checarSim(veiculo.reservaPlaca) || checarSim(dados.reservaPlaca) || checarSim(veiculo.reserva_placa);
  const reservaNao = !reservaSim;

  const imprimirCrlv = checarSim(veiculo.impressaoCrlv) || checarSim(dados.impressaoCrlv) || checarSim(veiculo.impressao_crlv) || checarSim(dados.impressaoCrlv);
  const imprimirCertidao = checarSim(veiculo.emissaoCertidao) || checarSim(dados.emissaoCertidao) || checarSim(veiculo.emissao_certidao) || checarSim(dados.emissaoCertidao);
  const restHavera = checarSim(restricao.havera) || checarSim(dados.rest_havera);

  doc.fillColor('#000000');

  // 1. TÍTULO PRINCIPAL
  doc.font('Helvetica-Bold').fontSize(11).text('ANEXO 1 - REQUERIMENTO DE SERVIÇO PARA O PROCESSO DE PRIMEIRO EMPLACAMENTO', 40, 30, { align: 'center', width: 515 });

  // 2. CORPO DE QUALIFICAÇÃO COM A PLACA INJETADA EM CAIXA ALTA E NEGRITO
  const rgStr = proprietario.identidade ? `, Identidade nº ${proprietario.identidade}` : '';
  const telStr = checarSim(proprietario.naoPossuiCelular) ? 'NÃO POSSUI' : (proprietario.telefone || '(__) _____-____');

  let y = 65;
  doc.font('Helvetica').fontSize(8.5).text('Eu, ', 40, y, { continued: true, lineGap: 1.1 });
  doc.font('Helvetica-Bold').text(proprietario.nome.toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', CPF/CNPJ nº ', { continued: true });
  doc.font('Helvetica-Bold').text(formatarDocumento(proprietario.cpfCnpj), { continued: true });
  doc.font('Helvetica').text(`${rgStr}, Telefone `, { continued: true });
  doc.font('Helvetica-Bold').text(telStr, { continued: true });
  doc.font('Helvetica').text(', requeiro ao DETRAN/RS a realização do processo de primeiro emplacamento, relativo ao(s) veículo(s) chassi(s) ', { continued: true });
  doc.font('Helvetica-Bold').text(veiculo.chassi.toUpperCase(), { continued: false });

  // 3. SEÇÃO DE OPÇÕES (RESERVA DE PLACAS)
  y = 125;
  doc.font('Helvetica-Bold').fontSize(8.5).text('Haverá Reserva de Placas:', 40, y);
  doc.font(reservaSim ? 'Helvetica-Bold' : 'Helvetica').text(`(${reservaSim ? 'X' : ' '}) Sim`, 175, y);
  doc.font(reservaNao ? 'Helvetica-Bold' : 'Helvetica').text(`(${reservaNao ? 'X' : ' '}) Não`, 225, y);

  if (reservaSim) {
    const p = String(veiculo.placa || dados.placa || '').toUpperCase().trim();
    doc.font('Helvetica-Bold').text(`PLACA: ${p || 'NÃO INFORMADA'}`, 280, y);
  }

  // 3.1. SEÇÃO DE OPÇÕES (CRLV E CERTIDÃO)
  y = 138;
  doc.font(imprimirCrlv ? 'Helvetica-Bold' : 'Helvetica').text(`(${imprimirCrlv ? 'X' : ' '}) Impressão do CRLVe`, 40, y);
  doc.font(imprimirCertidao ? 'Helvetica-Bold' : 'Helvetica').text(`(${imprimirCertidao ? 'X' : ' '}) Emissão de Certidão`, 180, y);

  // 4. RESTRIÇÃO FINANCEIRA
  y = 150;
  doc.rect(40, y, 515, 50).stroke();
  doc.font('Helvetica-Bold').fontSize(8).text('Haverá inclusão ou alteração de restrição financeira?', 45, y + 5);
  doc.font(restHavera ? 'Helvetica-Bold' : 'Helvetica').text(`(${restHavera ? 'X' : ' '}) Sim`, 280, y + 5);
  doc.font(!restHavera ? 'Helvetica-Bold' : 'Helvetica').text(`(${!restHavera ? 'X' : ' '}) Não`, 330, y + 5);

  const isFid = restHavera && String(restricao.modalidade).toUpperCase().includes('ALIENAÇÃO');
  doc.font(isFid ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).text(`(${isFid ? 'X' : ' '}) Alienação Fiduciária`, 45, y + 20);
  doc.font('Helvetica-Bold').fontSize(8).text(`Agente Financeiro: ${restricao.nomeCredor || "___________________________"}`, 45, y + 35);

  // 5. DADOS DO ADQUIRENTE
  y = 210;
  doc.rect(40, y, 515, 42).stroke();
  doc.font('Helvetica-Bold').fontSize(7.5).text('DADOS DO ADQUIRENTE (Preenchimento obrigatório dos campos abaixo, sendo vedada a inclusão de quaisquer dados de terceiros)', 45, y + 3);
  doc.font('Helvetica-Bold').fontSize(9).text(`Endereço: ${proprietario.endereco.toUpperCase()}`, 45, y + 13);

  const noCel = checarSim(proprietario.naoPossuiCelular);
  const noMail = checarSim(proprietario.naoPossuiEmail);
  doc.font('Helvetica').fontSize(8).text(`Telefone: ${noCel ? 'NÃO POSSUI' : proprietario.telefone} (${noCel ? 'X' : ' '}) Não possui celular   Email: ${noMail ? 'NÃO POSSUI' : proprietario.email.toLowerCase()} (${noMail ? 'X' : ' '}) Não possui Email`, 45, y + 26);

  // 6. TERMOS DECLARATÓRIOS MUNICIPAIS
  y = 265;
  doc.font('Helvetica-Bold').fontSize(8).text('DECLARO, sob as penas da lei e sem prejuízo de demais sanções administrativas/civeis/criminais, que:', 40, y);
  doc.font('Helvetica').fontSize(7.5).text('a) o(s) veículo(s) são novos (Zero quilômetro) e está (ão) fisicamente de acordo com o pré-cadastro na Base Indice Nacional BIN da SENATRAN, Nota(s) Fiscal(is), bem como do Certificado de Adequação a Legislação de Trânsito - CAT e do Certificado de Capacitação Técnica - CCT, quando exigível(is);', 40, y + 14, { align: 'justify', width: 515 });
  doc.font('Helvetica').text('b) estou ciente de que no caso de qualquer alteração do veículo em relação ao pré-cadastro e/ou com o CAT/CCT quando solicitados, é de minha responsabilidade informar ao Centro de Registro de Veículos Automotores CRVA, para correção/alteração das informações do veículo antes do primeiro emplacamento, para fins de adequação à legislação de Trânsito.', 40, y + 42, { align: 'justify', width: 515 });
  doc.font('Helvetica').text('c) os documentos entregues ao DETRAN/RS para o serviço requerido são todos autênticos e, quando cópias, condizem com o original, e que sou responsável por providenciar a estampagem e instalação da(s) placa(s) no veículo para o qual a estampagem foi autorizada.', 40, y + 74, { align: 'justify', width: 515 });

  // 7. DATAÇÃO MUNICÍPIO
  y = 385;
  doc.font('Helvetica-Bold').fontSize(9.5).text(dataExtenso, 40, y, { align: 'center', width: 515 });

  // 8. ASSINATURA DO RESPONSÁVEL (Aumentado para Y = 520, garantindo um gap enorme e limpo entre a data e a linha)
  y = 520;
  doc.moveTo(150, y).lineTo(450, y).stroke();
  doc.font('Helvetica-Bold').fontSize(9.5).text('Assinatura do Responsável', 40, y + 6, { align: 'center', width: 515 });

  // 9. HASH FIXADA E SECIONADA EXCLUSIVAMENTE NO RODAPÉ DA PRIMEIRA PÁGINA (Y = 775)
  doc.font('Helvetica').fontSize(7).text(`AUTENTICIDADE DIGITAL (SHA-256): ${hash}`, 40, 775, { align: 'center', width: 515 });
}

function desenharRequerimentoGeral(doc: any, dados: any) {
  const { hash } = dados;
  doc.font('Helvetica-Bold').fontSize(11).text('REQUERIMENTO GERAL', 40, 25);
  doc.font('Helvetica').fontSize(7).text(`AUTENTICIDADE DIGITAL (SHA-256): ${hash}`, 40, 775, { align: 'center', width: 515 });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
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
        placa: veiculoOriginal.placa || req.body.placa || req.body.veiculo?.placa || '',
        renavam: veiculoOriginal.renavam || '',
        chassi: veiculoOriginal.chassi || '',
        modelo: veiculoOriginal.modelo || 'NÃO INFORMADO',
        ano: Number(veiculoOriginal.ano || 2026),
        reservaPlaca: veiculoOriginal.reservaPlaca || req.body.reservaPlaca || req.body.veiculo?.reservaPlaca || 'NÃO',
        impressaoCrlv: veiculoOriginal.impressaoCrlv || req.body.impressaoCrlv || req.body.veiculo?.impressaoCrlv || 'NÃO',
        emissaoCertidao: veiculoOriginal.emissaoCertidao || req.body.emissaoCertidao || req.body.veiculo?.emissaoCertidao || 'NÃO'
      };

      const restHavera = restricaoFinanceiraOriginal.havera || 'NÃO';
      const restricao = {
        havera: restHavera,
        modalidade: restricaoFinanceiraOriginal.modalidade || '',
        nomeCredor: req.body.nome_credor || req.body.rest_nome_credor || restricaoFinanceiraOriginal.nomeCredor || ''
      };

      const dadosParaHash = { proprietario, veiculo, servico, restricao, timestamp: Date.now() };
      const hash = gerarSeloSeguranca(dadosParaHash);

      res.setHeader('Content-Type', 'application/pdf');

      // BLOQUEIO TOTAL CONTRA OVERFLOW DE PÁGINAS AUTOMÁTICO NA INSTANCIAÇÃO
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 0, left: 40, right: 40 },
        layout: 'portrait',
        autoFirstPage: true,
        autoPageBreak: false
      });
      doc.pipe(res);

      const agora = new Date();
      const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
      const dataExtenso = `Município: Passo Fundo, RS, ${agora.getDate().toString().padStart(2, '0')} de ${meses[agora.getMonth()]} de ${agora.getFullYear()}.`;

      if (servico === "Primeiro Emplacamento") {
        desenharPrimeiroEmplacamento(doc, { proprietario, veiculo, restricao, hash, dataExtenso });
      } else {
        desenharRequerimentoGeral(doc, { proprietario, veiculo, restricao, hash, dataExtenso, servico });
      }
      doc.end();
    } catch (err) { res.status(500).send('Erro'); }
  }
}