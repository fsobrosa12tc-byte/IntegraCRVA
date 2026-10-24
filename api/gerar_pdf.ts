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
  const rgStr = proprietario?.identidade ? `, Identidade nº ${proprietario.identidade}` : '';
  const telStr = checarSim(proprietario?.naoPossuiCelular) ? 'NÃO POSSUI' : (proprietario?.telefone || '(__) _____-____');

  let y = 65;
  doc.font('Helvetica').fontSize(8.5).text('Eu, ', 40, y, { continued: true, lineGap: 1.1 });
  doc.font('Helvetica-Bold').text((proprietario?.nome || 'NÃO INFORMADO').toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', CPF/CNPJ nº ', { continued: true });
  doc.font('Helvetica-Bold').text(formatarDocumento(proprietario?.cpfCnpj || ''), { continued: true });
  doc.font('Helvetica').text(`${rgStr}, Telefone `, { continued: true });
  doc.font('Helvetica-Bold').text(telStr, { continued: true });
  doc.font('Helvetica').text(', requeiro ao DETRAN/RS a realização do processo de primeiro emplacamento, relativo ao(s) veículo(s) chassi(s) ', { continued: true });
  doc.font('Helvetica-Bold').text((veiculo?.chassi || 'NÃO INFORMADO').toUpperCase(), { continued: false });

  // 3. SEÇÃO DE OPÇÕES (RESERVA DE PLACAS)
  y = 125;
  doc.font('Helvetica-Bold').fontSize(8.5).text('Haverá Reserva de Placas:', 40, y);
  doc.font(reservaSim ? 'Helvetica-Bold' : 'Helvetica').text(`(${reservaSim ? 'X' : ' '}) Sim`, 175, y);
  doc.font(reservaNao ? 'Helvetica-Bold' : 'Helvetica').text(`(${reservaNao ? 'X' : ' '}) Não`, 225, y);

  if (reservaSim) {
    const p = String(veiculo?.placa || dados?.placa || '').toUpperCase().trim();
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

  const isFid = restHavera && String(restricao?.modalidade || '').toUpperCase().includes('ALIENAÇÃO');
  doc.font(isFid ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).text(`(${isFid ? 'X' : ' '}) Alienação Fiduciária`, 45, y + 20);
  doc.font('Helvetica-Bold').fontSize(8).text(`Agente Financeiro: ${restricao?.nomeCredor || "___________________________"}`, 45, y + 35);

  // 5. DADOS DO ADQUIRENTE
  y = 210;
  doc.rect(40, y, 515, 42).stroke();
  doc.font('Helvetica-Bold').fontSize(7.5).text('DADOS DO ADQUIRENTE (Preenchimento obrigatório dos campos abaixo, sendo vedada a inclusão de quaisquer dados de terceiros)', 45, y + 3);
  const enderecoFormatado = (proprietario?.endereco || 'NÃO INFORMADO').toUpperCase();
  doc.font('Helvetica-Bold').fontSize(8.5).text(`Endereço: ${enderecoFormatado}`, 45, y + 13);

  const noCel = checarSim(proprietario?.naoPossuiCelular);
  const noMail = checarSim(proprietario?.naoPossuiEmail);
  const emailFormatado = (proprietario?.email || 'NÃO INFORMADO').toLowerCase();
  doc.font('Helvetica').fontSize(8).text(`Telefone: ${noCel ? 'NÃO POSSUI' : (proprietario?.telefone || 'NÃO INFORMADO')} (${noCel ? 'X' : ' '}) Não possui celular   Email: ${noMail ? 'NÃO POSSUI' : emailFormatado} (${noMail ? 'X' : ' '}) Não possui Email`, 45, y + 26);

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

      const dadosParaHash = { proprietario, veiculo, servico, restricao, segundaViaCrv, baixaDefinitiva, timestamp: Date.now() };
      const hash = gerarSeloSeguranca(dadosParaHash);

      res.setHeader('Content-Type', 'application/pdf');

      // BLOQUEIO TOTAL CONTRA OVERFLOW DE PÁGINAS AUTOMÁTICO NA INSTANCIAÇÃO
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 0, left: 40, right: 40 },
        layout: 'portrait',
        autoFirstPage: true
      });
      doc.pipe(res);

      const agora = new Date();
      const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
      const dataBrasilia = new Date(agora.getTime() - (3 * 60 * 60 * 1000));
      const dia = dataBrasilia.getUTCDate().toString().padStart(2, '0');
      const mesNome = meses[dataBrasilia.getUTCMonth()];
      const anoNum = dataBrasilia.getUTCFullYear();
      const dataExtenso = `Município: Passo Fundo, RS, ${dia} de ${mesNome} de ${anoNum}.`;
      const dataTexto = `Passo Fundo, RS, ${dia} de ${mesNome} de ${anoNum}.`;

      const servicoNormalizado = (servico || '').trim().toLowerCase();

      if (servicoNormalizado === 'primeiro emplacamento') {
        desenharPrimeiroEmplacamento(doc, { proprietario, veiculo, restricao, hash, dataExtenso });
      } else if (servicoNormalizado === '2ª via do crv' || servicoNormalizado === 'segunda via do crv') {
        desenharRequerimentoGeral(doc, { proprietario, veiculo, restricao, hash, dataExtenso, servico });
        doc.addPage({ size: 'A4', margins: { top: 40, bottom: 0, left: 40, right: 40 }, layout: 'portrait' });
        desenharSegundaViaCRV(doc, { proprietario, veiculo, segundaViaCrv, hash, dataTexto, dia, mesNome, anoNum });
      } else if (servicoNormalizado === 'baixa de veículo - simples' || servicoNormalizado === 'baixa de veiculo - simples') {
        desenharRequerimentoGeral(doc, { proprietario, veiculo, restricao, hash, dataExtenso, servico });
        doc.addPage({ size: 'A4', margins: { top: 40, bottom: 0, left: 40, right: 40 }, layout: 'portrait' });
        desenharBaixaDefinitiva(doc, { proprietario, veiculo, baixaDefinitiva, hash, dataTexto, dia, mesNome, anoNum });
      } else {
        desenharRequerimentoGeral(doc, { proprietario, veiculo, restricao, hash, dataExtenso, servico });
      }
      doc.end();
    } catch (err: any) {
      console.error('Fatal API Error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || 'Erro interno ao processar PDF' });
      }
    }
  }
}