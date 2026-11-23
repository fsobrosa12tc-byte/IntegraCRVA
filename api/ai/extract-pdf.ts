/**
 * ============================================================================
 * MARKS SYSTEMS · CRM-INTEGRA · EXTRAÇÃO DE TEXTO DE PDF
 * ============================================================================
 * Endpoint serverless para extração de texto de PDFs enviados à Base de Conhecimento.
 * 1. Tenta extração via pdf-parse (rápida, determinística e local);
 * 2. Fallback para Google Gemini Multimodal se o PDF for escaneado/imagem ou pdf-parse falhar.
 * ============================================================================
 */

import * as pdfParseModule from 'pdf-parse';
const parsePdf: any = (pdfParseModule as any).PDFParse || (pdfParseModule as any).default || pdfParseModule;

export default async function handler(req: any, res: any) {
  // Configuração de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido. Use POST.' });
  }

  try {
    const { base64, fileName = 'documento.pdf', geminiApiKey } = req.body || {};

    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({
        sucesso: false,
        erro: 'O parâmetro "base64" do arquivo PDF é obrigatório.',
      });
    }

    const base64Limpo = base64.replace(/^data:application\/pdf;base64,/, '').trim();
    const buffer = Buffer.from(base64Limpo, 'base64');

    if (buffer.length === 0) {
      return res.status(400).json({ sucesso: false, erro: 'Arquivo PDF corrompido ou vazio.' });
    }

    let textoExtraido = '';
    let metodoUsado = 'pdf-parse';

    // 1. Tenta extração direta via pdf-parse
    try {
      const dataPdf = await parsePdf(buffer);
      if (dataPdf && typeof dataPdf.text === 'string' && dataPdf.text.trim().length > 30) {
        textoExtraido = dataPdf.text.trim();
        metodoUsado = 'pdf-parse';
      }
    } catch (errPdfParse) {
      console.warn('[EXTRACT-PDF] Falha no pdf-parse, acionando fallback Gemini:', errPdfParse);
    }

    // 2. Se pdf-parse gerou texto insuficiente (ex.: PDF escaneado/imagem), recorre ao Gemini
    if (!textoExtraido || textoExtraido.length < 30) {
      const apiKey = (
        geminiApiKey ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GEMINI_API_KEY ||
        process.env.VITE_GEMINI_API_KEY ||
        ''
      ).trim();

      if (apiKey) {
        for (const modelo of ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
          try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        inlineData: {
                          mimeType: 'application/pdf',
                          data: base64Limpo,
                        },
                      },
                      {
                        text: `Você é um extrator técnico do Marks Systems. Transcreva de forma integral, estruturada e fiel todo o conteúdo textual legível deste documento PDF "${fileName}" (incluindo títulos, artigos, tabelas de valores, taxas GAD-E, prazos, emolumentos e observações). Não faça resumos, não omita seções e não invente dados. Retorne exclusivamente o texto extraído do documento.`,
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 8192,
                },
              }),
              signal: AbortSignal.timeout(20000),
            });

            if (response.ok) {
              const resJson = await response.json();
              const txtGemini = resJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
              if (txtGemini && txtGemini.length > 20) {
                textoExtraido = txtGemini;
                metodoUsado = `gemini-multimodal (${modelo})`;
                break;
              }
            }
          } catch (errGemini) {
            console.warn(`[EXTRACT-PDF] Falha no modelo ${modelo}:`, errGemini);
          }
        }
      }
    }

    if (!textoExtraido || textoExtraido.trim().length === 0) {
      return res.status(422).json({
        sucesso: false,
        erro: 'Não foi possível extrair conteúdo textual legível do arquivo PDF.',
      });
    }

    // Sanitização e normalização de quebras de linha
    const textoLimpo = textoExtraido
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .trim();

    return res.status(200).json({
      sucesso: true,
      fileName,
      caracteres: textoLimpo.length,
      metodo: metodoUsado,
      text: textoLimpo,
    });
  } catch (error: any) {
    console.error('[EXTRACT-PDF FATAL]', error);
    return res.status(500).json({
      sucesso: false,
      erro: error?.message || 'Erro inesperado na extração do arquivo PDF.',
    });
  }
}
