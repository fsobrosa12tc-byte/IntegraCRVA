import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import path from 'path';

// Inicialização segura do Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Inicialização dinâmica do SQLite apenas fora da Vercel
let sqlite: any = null;
const dbPath = path.join(process.cwd(), 'digital_crva.db');

async function getSQLite() {
  if (process.env.VERCEL) return null;
  if (sqlite) return sqlite;
  try {
    const { default: BetterSqlite3 } = await import('better-sqlite3');
    sqlite = new BetterSqlite3(dbPath);
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS proprietarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cpf_cnpj TEXT NOT NULL,
        endereco TEXT NOT NULL,
        telefone TEXT,
        email TEXT,
        autorizacao TEXT
      );
      CREATE TABLE IF NOT EXISTS veiculos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        placa TEXT NOT NULL,
        renavam TEXT NOT NULL,
        chassi TEXT NOT NULL,
        modelo TEXT NOT NULL,
        ano INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS requerimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_servico TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pendente',
        hash_integridade TEXT NOT NULL,
        rest_havera TEXT,
        rest_modalidade TEXT,
        rest_tipo_credor TEXT,
        proprietario_id INTEGER REFERENCES proprietarios(id),
        veiculo_id INTEGER REFERENCES veiculos(id)
      );
    `);
    return sqlite;
  } catch (err) {
    console.warn('SQLite não pôde ser carregado localmente:', err);
    return null;
  }
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

export default async function handler(req: any, res: any) {
  // Configuração de Cabeçalhos CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'x-requerimento-id, x-requerimento-hash, x-requerimento-timestamp');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const dbLocal = await getSQLite();

  if (req.method === 'POST') {
    try {
      const proprietarioOriginal = req.body.proprietario || {};
      const veiculoOriginal = req.body.veiculo || {};
      const restricaoFinanceiraOriginal = req.body.restricaoFinanceira || {};
      const servico = req.body.servico || 'Serviço Não Informado';

      // Fallbacks e blindagem conforme especificado
      const proprietario = {
        nome: proprietarioOriginal.nome || 'NÃO INFORMADO',
        cpfCnpj: proprietarioOriginal.cpfCnpj || '',
        endereco: proprietarioOriginal.endereco || 'NÃO INFORMADO',
        telefone: proprietarioOriginal.telefone || '(__) _____-____',
        email: proprietarioOriginal.email || '',
        autorizacao: proprietarioOriginal.autorizacao || 'NÃO'
      };

      const veiculo = {
        placa: veiculoOriginal.placa || '',
        renavam: veiculoOriginal.renavam || '',
        chassi: veiculoOriginal.chassi || '',
        modelo: veiculoOriginal.modelo || 'NÃO INFORMADO',
        ano: Number(veiculoOriginal.ano || new Date().getFullYear())
      };

      const restHavera = restricaoFinanceiraOriginal.havera || req.body.rest_havera || 'NÃO';
      const restModalidade = (restHavera === 'SIM' ? (restricaoFinanceiraOriginal.modalidade || req.body.modalidade_restricao || req.body.rest_modalidade || '') : '') || '';
      const restTipoCredor = (restHavera === 'SIM' ? (restricaoFinanceiraOriginal.tipoCredor || req.body.tipo_credor || req.body.rest_tipo_credor || '') : '') || '';

      const restricaoFinanceira = {
        havera: restHavera,
        modalidade: restModalidade,
        tipoCredor: restTipoCredor
      };

      const dadosParaHash = {
        proprietario,
        veiculo,
        servico,
        restricaoFinanceira,
        timestamp: Date.now()
      };

      const hash = gerarSeloSeguranca(dadosParaHash);
      let returnId: string | number | bigint = 'OFFLINE_' + Date.now();

      // Blindagem em modo contingência
      try {
        if (supabase) {
          console.log('SUPABASE: Gravando dados na nuvem...');
          const { data: propData, error: propError } = await supabase
            .from('proprietarios')
            .insert([{
              nome: proprietario.nome,
              cpf_cnpj: proprietario.cpfCnpj,
              endereco: proprietario.endereco,
              telefone: proprietario.telefone,
              email: proprietario.email,
              autorizacao: proprietario.autorizacao
            }])
            .select('id')
            .single();

          if (propError) throw propError;
          const propId = propData.id;

          const { data: veicData, error: veicError } = await supabase
            .from('veiculos')
            .insert([{
              placa: veiculo.placa,
              renavam: veiculo.renavam,
              chassi: veiculo.chassi,
              modelo: veiculo.modelo,
              ano: veiculo.ano
            }])
            .select('id')
            .single();

          if (veicError) throw veicError;
          const veicId = veicData.id;

          const { data: reqData, error: reqError } = await supabase
            .from('requerimentos')
            .insert([{
              id_servico: servico,
              timestamp: dadosParaHash.timestamp,
              hash_integridade: hash,
              rest_havera: restHavera,
              rest_modalidade: restModalidade,
              rest_tipo_credor: restTipoCredor,
              proprietario_id: propId,
              veiculo_id: veicId
            }])
            .select('id')
            .single();

          if (reqError) throw reqError;
          returnId = reqData.id;
        } else if (dbLocal) {
          console.log('SQLITE: Salvando localmente...');
          const propResult = dbLocal.prepare('INSERT INTO proprietarios (nome, cpf_cnpj, endereco, telefone, email, autorizacao) VALUES (?, ?, ?, ?, ?, ?)').run(
            proprietario.nome, proprietario.cpfCnpj, proprietario.endereco, proprietario.telefone, proprietario.email, proprietario.autorizacao
          );
          const propId = propResult.lastInsertRowid;

          const veicResult = dbLocal.prepare('INSERT INTO veiculos (placa, renavam, chassi, modelo, ano) VALUES (?, ?, ?, ?, ?)').run(
            veiculo.placa, veiculo.renavam, veiculo.chassi, veiculo.modelo, veiculo.ano
          );
          const veicId = veicResult.lastInsertRowid;

          const reqResult = dbLocal.prepare(`
            INSERT INTO requerimentos (id_servico, timestamp, hash_integridade, rest_havera, rest_modalidade, rest_tipo_credor, proprietario_id, veiculo_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            servico,
            dadosParaHash.timestamp,
            hash,
            restHavera,
            restModalidade,
            restTipoCredor,
            propId,
            veicId
          );
          returnId = reqResult.lastInsertRowid;
        }
      } catch (dbError) {
        console.error('SUPABASE/SQLITE FAILED (Modo contingência ativo):', dbError);
      }

      // Configurar Cabeçalhos HTTP para envio de arquivo binário e metadados expostos
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=requerimento_${returnId}.pdf`);
      res.setHeader('x-requerimento-id', returnId.toString());
      res.setHeader('x-requerimento-hash', hash);
      res.setHeader('x-requerimento-timestamp', dadosParaHash.timestamp.toString());

      // Renderização do PDFKit em memória
      const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: true });
      doc.pipe(res);

      doc.fillColor('#000000');
      doc.font('Helvetica-Bold').fontSize(11).text('ANEXO 1 - REQUERIMENTO DE SERVIÇO COM DECLARAÇÃO DE AUTENTICIDADE DE DOCUMENTOS', 40, 25, { align: 'center', width: 515 });
      doc.moveDown(2);

      const telStr = proprietario.telefone || '(__) _____-____';
      doc.font('Helvetica').fontSize(8).text('Eu, ', 40, Math.ceil(doc.y), { continued: true, lineGap: 1.1 });
      doc.font('Helvetica-Bold').text(proprietario.nome.toUpperCase(), { continued: true });
      doc.font('Helvetica').text(', CPF/CNPJ nº ', { continued: true });
      doc.font('Helvetica-Bold').text(formatarDocumento(proprietario.cpfCnpj), { continued: true });
      doc.font('Helvetica').text(', endereço ', { continued: true });
      doc.font('Helvetica-Bold').text(proprietario.endereco.toUpperCase(), { continued: true });
      doc.font('Helvetica').text(', telefone ', { continued: true });
      doc.font('Helvetica-Bold').text(telStr, { continued: true });
      doc.font('Helvetica').text(', e-mail ', { continued: true });
      doc.font('Helvetica-Bold').text(proprietario.email.toLowerCase(), { continued: true });
      doc.font('Helvetica').text(', venho solicitar ao DETRAN/RS o(s) serviço(s) abaixo assinalado(s), relativo ao(s) veículo(s) placa(s) ', { continued: true });
      doc.font('Helvetica-Bold').text(veiculo.placa.toUpperCase(), { continued: true });
      doc.font('Helvetica').text(', chassi(s) ', { continued: true });
      doc.font('Helvetica-Bold').text(veiculo.chassi.toUpperCase(), { continued: false });

      doc.moveDown(2);
      let yPosList = Math.ceil(doc.y);

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

      const servicoSelecionado = servico.trim().toLowerCase();
      const half = Math.ceil(LISTA_OFICIAL.length / 2);
      doc.fontSize(7);

      const renderServico = (s: string, x: number, y: number) => {
        const marcar = s.trim().toLowerCase() === servicoSelecionado;
        doc.font(marcar ? 'Helvetica-Bold' : 'Helvetica').text(`(${marcar ? 'X' : ' '}) ${s}`, x, y);
      };

      LISTA_OFICIAL.slice(0, half).forEach((s, i) => renderServico(s, 55, yPosList + (i * 9)));
      LISTA_OFICIAL.slice(half).forEach((s, i) => renderServico(s, 315, yPosList + (i * 9)));

      let yPosAfterList = yPosList + (half * 9) + 4;

      doc.rect(40, yPosAfterList, 515, 52).stroke();
      doc.font('Helvetica-Bold').fontSize(7.5).text('Haverá inclusão ou alteração de restrição financeira?', 45, yPosAfterList + 5);
      
      const haveraSim = restHavera === 'SIM';
      const haveraNao = restHavera === 'NÃO';
      
      doc.font(haveraSim ? 'Helvetica-Bold' : 'Helvetica').text(`(${haveraSim ? 'X' : ' '}) Sim`, 260, yPosAfterList + 5);
      doc.font(haveraNao ? 'Helvetica-Bold' : 'Helvetica').text(`(${haveraNao ? 'X' : ' '}) Não`, 310, yPosAfterList + 5);
      
      const opt1 = 'Arrendamento';
      const opt2 = 'Reserva de Domínio';
      const opt3 = 'Alienação Fiduciária';
      const m1 = haveraSim && restModalidade === opt1;
      const m2 = haveraSim && restModalidade === opt2;
      const m3 = haveraSim && restModalidade === opt3;

      doc.font(m1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m1 ? 'X' : ' '}) ${opt1}`, 45, yPosAfterList + 17);
      doc.font(m2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m2 ? 'X' : ' '}) ${opt2}`, 180, yPosAfterList + 17);
      doc.font(m3 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m3 ? 'X' : ' '}) ${opt3}`, 340, yPosAfterList + 17);

      const opt4 = 'Penhor';
      const opt5 = 'Comodato';
      const opt6 = 'Locação';
      const m4 = haveraSim && restModalidade === opt4;
      const m5 = haveraSim && restModalidade === opt5;
      const m6 = haveraSim && restModalidade === opt6;

      doc.font(m4 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m4 ? 'X' : ' '}) ${opt4}`, 45, yPosAfterList + 29);
      doc.font(m5 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m5 ? 'X' : ' '}) ${opt5}`, 180, yPosAfterList + 29);
      doc.font(m6 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m6 ? 'X' : ' '}) ${opt6}`, 340, yPosAfterList + 29);

      doc.font('Helvetica').fontSize(7).text('O credor é:', 45, yPosAfterList + 41);
      const isPF = haveraSim && restTipoCredor === 'Pessoa Física';
      const isPJ = haveraSim && restTipoCredor === 'Pessoa Jurídica';
      doc.font(isPF ? 'Helvetica-Bold' : 'Helvetica').text(`(${isPF ? 'X' : ' '}) Pessoa Física`, 100, yPosAfterList + 41);
      doc.font(isPJ ? 'Helvetica-Bold' : 'Helvetica').text(`(${isPJ ? 'X' : ' '}) Pessoa Jurídica`, 200, yPosAfterList + 41);

      yPosAfterList += 58;

      doc.rect(40, yPosAfterList, 515, 38).stroke();
      doc.font('Helvetica-Bold').fontSize(7).text('DADOS DO ADQUIRENTE DO VEÍCULO OU DO PROPRIETÁRIO (PARA ENVIO DO CRLV OU OUTRAS NOTIFICAÇÕES)', 45, yPosAfterList + 3);
      
      doc.font('Helvetica').fontSize(7.5).text('Endereço: ', 45, yPosAfterList + 12, { continued: true });
      doc.font('Helvetica-Bold').text(proprietario.endereco.toUpperCase());
      
      doc.font('Helvetica').text('Telefone Celular: ', 45, yPosAfterList + 20, { continued: true });
      doc.font('Helvetica-Bold').text(proprietario.telefone, { continued: true });
      doc.font('Helvetica').text('    Email: ', { continued: true });
      doc.font('Helvetica-Bold').text(proprietario.email.toLowerCase());
      
      const aut = proprietario.autorizacao === 'SIM';
      doc.font('Helvetica').fontSize(7).text('Autorizo o DETRAN/RS a enviar por email ou telefone celular informações de interesse junto a este órgão: ', 45, yPosAfterList + 28, { continued: true });
      doc.font('Helvetica-Bold').text(`SIM (${aut ? 'X' : ' '})   NÃO (${!aut ? 'X' : ' '})`);

      yPosAfterList += 46;
      doc.y = yPosAfterList;
      doc.moveDown(2);
      yPosAfterList = doc.y;

      const agora = new Date();
      const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
      const dataBrasilia = new Date(agora.getTime() - (3 * 60 * 60 * 1000));
      const dia = dataBrasilia.getUTCDate().toString().padStart(2, '0');
      const mesNome = meses[dataBrasilia.getUTCMonth()];
      const anoNum = dataBrasilia.getUTCFullYear();

      doc.font('Helvetica-Bold').fontSize(8.5).text('DECLARO, sob as penas da lei e sem prejuízo de demais sanções administrativas/cíveis/criminais, que os documentos entregues ao DETRAN/RS para o serviço requerido são todos autênticos e, quando cópias, condizem com o original e, caso haja produção de placa(s) de identificação veicular para o veículo objeto do requerimento, sou responsável por providenciar a estampagem junto a uma das Empresas Estampadoras de Placas de Identificação Veicular - EPIV, credenciadas pelo DETRAN/RS. Fico ciente de que a constatada falsidade em qualquer dos documentos ou nas declarações implicará em sanções penais (artigo 299 do Código Penal) e administrativas.', 40, yPosAfterList, { align: 'justify', width: 515, lineGap: 0.8 });
      
      doc.moveDown(2);
      yPosAfterList = doc.y; 
      const dataExtenso = `Município: Passo Fundo, RS, ${dia} de ${mesNome} de ${anoNum}.`;
      doc.font('Helvetica-Bold').fontSize(9).text(dataExtenso, 40, yPosAfterList, { align: 'center', width: 515 });
      
      doc.moveDown(4);
      yPosAfterList = doc.y; 
      doc.moveTo(150, yPosAfterList).lineTo(450, yPosAfterList).stroke();
      doc.font('Helvetica-Bold').fontSize(9).text('Assinatura do Proprietário / Adquirente / Representante Legal', 40, yPosAfterList + 5, { align: 'center', width: 515 });

      doc.font('Helvetica').fontSize(6).text(`AUTENTICIDADE DIGITAL (SHA-256): ${hash}`, 40, 790, { align: 'center', width: 515 });

      doc.end();
    } catch (err: any) {
      console.error('Fatal API Error:', err);
      if (!res.headersSent) {
        res.status(500).send('Erro interno ao processar PDF');
      }
    }
  } else if (req.method === 'GET') {
    // Tratamento para requisição GET (/api/gerar_pdf/:id ou /api/gerar_pdf?id=:id)
    try {
      const urlParts = req.url.split('/');
      let id = urlParts[urlParts.length - 1];
      if (id.includes('?')) {
        id = id.split('?')[0];
      }
      // Se o ID for o nome do endpoint, tentar obter da query
      if (id === 'gerar_pdf' && req.query.id) {
        id = req.query.id;
      }

      let requerimento: any = null;

      try {
        if (supabase) {
          console.log(`SUPABASE: Buscando requerimento ID ${id}...`);
          const { data, error } = await supabase
            .from('requerimentos')
            .select(`
              *,
              proprietarios (
                nome, cpf_cnpj, endereco, telefone, email, autorizacao
              ),
              veiculos (
                placa, renavam, chassi, modelo, ano
              )
            `)
            .eq('id', id)
            .maybeSingle();

          if (error) throw error;
          if (data) {
            requerimento = {
              id: data.id,
              id_servico: data.id_servico,
              hash_integridade: data.hash_integridade,
              rest_havera: data.rest_havera,
              rest_modalidade: data.rest_modalidade,
              rest_tipo_credor: data.rest_tipo_credor,
              nome: data.proprietarios?.nome,
              cpf_cnpj: data.proprietarios?.cpf_cnpj,
              endereco: data.proprietarios?.endereco,
              telefone: data.proprietarios?.telefone,
              email: data.proprietarios?.email,
              autorizacao: data.proprietarios?.autorizacao,
              placa: data.veiculos?.placa,
              renavam: data.veiculos?.renavam,
              chassi: data.veiculos?.chassi,
              modelo: data.veiculos?.modelo,
              ano: data.veiculos?.ano
            };
          }
        } else if (dbLocal) {
          console.log(`SQLITE: Buscando requerimento ID ${id}...`);
          requerimento = dbLocal.prepare(`
            SELECT r.*, p.nome, p.cpf_cnpj, p.endereco, p.telefone, p.email, p.autorizacao,
                   v.placa, v.renavam, v.chassi, v.modelo, v.ano
            FROM requerimentos r
            JOIN proprietarios p ON r.proprietario_id = p.id
            JOIN veiculos v ON r.veiculo_id = v.id
            WHERE r.id = ?
          `).get(id);
        }
      } catch (dbError) {
        console.error('Database fetch error (fallback ativo):', dbError);
      }

      const dados = requerimento ? {
        id: requerimento.id,
        servico: requerimento.id_servico,
        hash: requerimento.hash_integridade,
        restricao: {
          havera: requerimento.rest_havera || 'NÃO',
          modalidade: requerimento.rest_modalidade || '',
          tipoCredor: requerimento.rest_tipo_credor || ''
        },
        proprietario: {
          nome: requerimento.nome,
          cpfCnpj: formatarDocumento(requerimento.cpf_cnpj),
          endereco: requerimento.endereco,
          telefone: requerimento.telefone || '',
          email: requerimento.email || '',
          autorizacao: requerimento.autorizacao || 'NÃO'
        },
        veiculo: {
          placa: requerimento.placa,
          renavam: requerimento.renavam,
          chassi: requerimento.chassi,
          modelo: requerimento.modelo,
          ano: requerimento.ano
        }
      } : {
        id: id,
        servico: 'Transferência de Propriedade',
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        restricao: { havera: 'NÃO', modalidade: '', tipoCredor: '' },
        proprietario: { nome: 'DADOS NÃO ENCONTRADOS', cpfCnpj: '000.000.000-00', endereco: '', telefone: '', email: '', autorizacao: 'NÃO' },
        veiculo: { placa: 'ABC-1234', renavam: '0', chassi: '0', modelo: 'NI', ano: 2024 }
      };

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=requerimento_${id}.pdf`);

      const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: true });
      doc.pipe(res);

      doc.fillColor('#000000');
      doc.font('Helvetica-Bold').fontSize(11).text('ANEXO 1 - REQUERIMENTO DE SERVIÇO COM DECLARAÇÃO DE AUTENTICIDADE DE DOCUMENTOS', 40, 25, { align: 'center', width: 515 });
      doc.moveDown(2);

      const telStr = dados.proprietario.telefone || '(__) _____-____';
      doc.font('Helvetica').fontSize(8).text('Eu, ', 40, Math.ceil(doc.y), { continued: true, lineGap: 1.1 });
      doc.font('Helvetica-Bold').text(dados.proprietario.nome.toUpperCase(), { continued: true });
      doc.font('Helvetica').text(', CPF/CNPJ nº ', { continued: true });
      doc.font('Helvetica-Bold').text(dados.proprietario.cpfCnpj, { continued: true });
      doc.font('Helvetica').text(', endereço ', { continued: true });
      doc.font('Helvetica-Bold').text(dados.proprietario.endereco.toUpperCase(), { continued: true });
      doc.font('Helvetica').text(', telefone ', { continued: true });
      doc.font('Helvetica-Bold').text(telStr, { continued: true });
      doc.font('Helvetica').text(', e-mail ', { continued: true });
      doc.font('Helvetica-Bold').text(dados.proprietario.email.toLowerCase(), { continued: true });
      doc.font('Helvetica').text(', venho solicitar ao DETRAN/RS o(s) serviço(s) abaixo assinalado(s), relativo ao(s) veículo(s) placa(s) ', { continued: true });
      doc.font('Helvetica-Bold').text(dados.veiculo.placa.toUpperCase(), { continued: true });
      doc.font('Helvetica').text(', chassi(s) ', { continued: true });
      doc.font('Helvetica-Bold').text(dados.veiculo.chassi.toUpperCase(), { continued: false });

      doc.moveDown(2);
      let yPosList = Math.ceil(doc.y);

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

      const servicoSelecionado = dados.servico.trim().toLowerCase();
      const half = Math.ceil(LISTA_OFICIAL.length / 2);
      doc.fontSize(7);

      const renderServico = (s: string, x: number, y: number) => {
        const marcar = s.trim().toLowerCase() === servicoSelecionado;
        doc.font(marcar ? 'Helvetica-Bold' : 'Helvetica').text(`(${marcar ? 'X' : ' '}) ${s}`, x, y);
      };

      LISTA_OFICIAL.slice(0, half).forEach((s, i) => renderServico(s, 55, yPosList + (i * 9)));
      LISTA_OFICIAL.slice(half).forEach((s, i) => renderServico(s, 315, yPosList + (i * 9)));

      let yPosAfterList = yPosList + (half * 9) + 4;

      doc.rect(40, yPosAfterList, 515, 52).stroke();
      doc.font('Helvetica-Bold').fontSize(7.5).text('Haverá inclusão ou alteração de restrição financeira?', 45, yPosAfterList + 5);

      const haveraSim = dados.restricao.havera === 'SIM';
      const haveraNao = dados.restricao.havera === 'NÃO';

      doc.font(haveraSim ? 'Helvetica-Bold' : 'Helvetica').text(`(${haveraSim ? 'X' : ' '}) Sim`, 260, yPosAfterList + 5);
      doc.font(haveraNao ? 'Helvetica-Bold' : 'Helvetica').text(`(${haveraNao ? 'X' : ' '}) Não`, 310, yPosAfterList + 5);

      const opt1 = 'Arrendamento';
      const opt2 = 'Reserva de Domínio';
      const opt3 = 'Alienação Fiduciária';
      const m1 = haveraSim && dados.restricao.modalidade === opt1;
      const m2 = haveraSim && dados.restricao.modalidade === opt2;
      const m3 = haveraSim && dados.restricao.modalidade === opt3;

      doc.font(m1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m1 ? 'X' : ' '}) ${opt1}`, 45, yPosAfterList + 17);
      doc.font(m2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m2 ? 'X' : ' '}) ${opt2}`, 180, yPosAfterList + 17);
      doc.font(m3 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m3 ? 'X' : ' '}) ${opt3}`, 340, yPosAfterList + 17);

      const opt4 = 'Penhor';
      const opt5 = 'Comodato';
      const opt6 = 'Locação';
      const m4 = haveraSim && dados.restricao.modalidade === opt4;
      const m5 = haveraSim && dados.restricao.modalidade === opt5;
      const m6 = haveraSim && dados.restricao.modalidade === opt6;

      doc.font(m4 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m4 ? 'X' : ' '}) ${opt4}`, 45, yPosAfterList + 29);
      doc.font(m5 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m5 ? 'X' : ' '}) ${opt5}`, 180, yPosAfterList + 29);
      doc.font(m6 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(`(${m6 ? 'X' : ' '}) ${opt6}`, 340, yPosAfterList + 29);

      doc.font('Helvetica').fontSize(7).text('O credor é:', 45, yPosAfterList + 41);
      const isPF = haveraSim && dados.restricao.tipoCredor === 'Pessoa Física';
      const isPJ = haveraSim && dados.restricao.tipoCredor === 'Pessoa Jurídica';
      doc.font(isPF ? 'Helvetica-Bold' : 'Helvetica').text(`(${isPF ? 'X' : ' '}) Pessoa Física`, 100, yPosAfterList + 41);
      doc.font(isPJ ? 'Helvetica-Bold' : 'Helvetica').text(`(${isPJ ? 'X' : ' '}) Pessoa Jurídica`, 200, yPosAfterList + 41);

      yPosAfterList += 58;

      doc.rect(40, yPosAfterList, 515, 38).stroke();
      doc.font('Helvetica-Bold').fontSize(7).text('DADOS DO ADQUIRENTE DO VEÍCULO OU DO PROPRIETÁRIO (PARA ENVIO DO CRLV OU OUTRAS NOTIFICAÇÕES)', 45, yPosAfterList + 3);

      doc.font('Helvetica').fontSize(7.5).text('Endereço: ', 45, yPosAfterList + 12, { continued: true });
      doc.font('Helvetica-Bold').text(dados.proprietario.endereco.toUpperCase());

      doc.font('Helvetica').text('Telefone Celular: ', 45, yPosAfterList + 20, { continued: true });
      doc.font('Helvetica-Bold').text(dados.proprietario.telefone, { continued: true });
      doc.font('Helvetica').text('    Email: ', { continued: true });
      doc.font('Helvetica-Bold').text(dados.proprietario.email.toLowerCase());

      const aut = dados.proprietario.autorizacao === 'SIM';
      doc.font('Helvetica').fontSize(7).text('Autorizo o DETRAN/RS a enviar por email ou telefone celular informações de interesse junto a este órgão: ', 45, yPosAfterList + 28, { continued: true });
      doc.font('Helvetica-Bold').text(`SIM (${aut ? 'X' : ' '})   NÃO (${!aut ? 'X' : ' '})`);

      yPosAfterList += 46;
      doc.y = yPosAfterList;
      doc.moveDown(2);
      yPosAfterList = doc.y;

      const agora = new Date();
      const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
      const dataBrasilia = new Date(agora.getTime() - (3 * 60 * 60 * 1000));
      const dia = dataBrasilia.getUTCDate().toString().padStart(2, '0');
      const mesNome = meses[dataBrasilia.getUTCMonth()];
      const ano = dataBrasilia.getUTCFullYear();

      doc.font('Helvetica-Bold').fontSize(8.5).text('DECLARO, sob as penas da lei e sem prejuízo de demais sanções administrativas/cíveis/criminais, que os documentos entregues ao DETRAN/RS para o serviço requerido são todos autênticos e, quando cópias, condizem com o original e, caso haja produção de placa(s) de identificação veicular para o veículo objeto do requerimento, sou responsável por providenciar a estampagem junto a uma das Empresas Estampadoras de Placas de Identificação Veicular - EPIV, credenciadas pelo DETRAN/RS. Fico ciente de que a constatada falsidade em qualquer dos documentos ou nas declarações implicará em sanções penais (artigo 299 do Código Penal) e administrativas.', 40, yPosAfterList, { align: 'justify', width: 515, lineGap: 0.8 });

      doc.moveDown(2);
      yPosAfterList = doc.y;
      const dataExtenso = `Município: Passo Fundo, RS, ${dia} de ${mesNome} de ${ano}.`;
      doc.font('Helvetica-Bold').fontSize(9).text(dataExtenso, 40, yPosAfterList, { align: 'center', width: 515 });

      doc.moveDown(4);
      yPosAfterList = doc.y;
      doc.moveTo(150, yPosAfterList).lineTo(450, yPosAfterList).stroke();
      doc.font('Helvetica-Bold').fontSize(9).text('Assinatura do Proprietário / Adquirente / Representante Legal', 40, yPosAfterList + 5, { align: 'center', width: 515 });

      doc.font('Helvetica').fontSize(6).text(`AUTENTICIDADE DIGITAL (SHA-256): ${dados.hash}`, 40, 790, { align: 'center', width: 515 });

      doc.end();
    } catch (err: any) {
      console.error('Fatal API GET Error:', err);
      if (!res.headersSent) {
        res.status(500).send('Erro ao buscar PDF');
      }
    }
  } else {
    res.status(405).send('Método não permitido');
  }
}
