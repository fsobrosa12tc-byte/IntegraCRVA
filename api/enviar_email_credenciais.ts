export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }

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
        return res.status(200).json({ sucesso: true, id: data.id, metodo: 'resend' });
      } else {
        const errData = await emailRes.text();
        console.error('Erro ao disparar via Resend (Vercel):', errData);
        return res.status(502).json({
          sucesso: false,
          erro: `Falha no provedor Resend: ${errData}`,
          detalhe: 'Verifique a validade da RESEND_API_KEY e o domínio remetente.'
        });
      }
    }

    // Caso não haja chave configurada, retorna status 503 com diagnóstico
    return res.status(503).json({
      sucesso: false,
      smtpConfigurado: false,
      erro: 'Serviço SMTP/Resend não configurado no backend. O serviço SMTP precisa de configuração no painel do Supabase ou variáveis de ambiente.'
    });
  } catch (err: any) {
    console.error('Erro na serverless function de envio de e-mail:', err);
    return res.status(500).json({ sucesso: false, erro: err.message || 'Erro interno na função serverless de envio de e-mail' });
  }
}
