/**
 * ============================================================================
 * MARKS SYSTEMS · CRM-INTEGRA · SINCRONIZAÇÃO AUTOMÁTICA DE WEBHOOK EVOLUTION
 * ============================================================================
 * Configura o webhook oficial na Evolution API v2 para a instância ativa.
 * ============================================================================
 */

export async function handleSetWebhook(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }

  const evolutionUrl = (
    process.env.VITE_EVOLUTION_API_URL ||
    process.env.EVOLUTION_API_URL ||
    'https://evolution-api-production-9bdd.up.railway.app'
  ).replace(/\/$/, '');

  const evolutionKey = (
    process.env.VITE_EVOLUTION_API_KEY ||
    process.env.EVOLUTION_API_KEY ||
    'IntegraCRVA_SecretKey_2026_xYz'
  ).trim();

  const evolutionInstance = (
    process.env.VITE_EVOLUTION_INSTANCE ||
    process.env.EVOLUTION_INSTANCE ||
    'crva-principal'
  ).trim();

  const webhookUrl =
    req.body?.webhookUrl ||
    (process.env.APP_URL ? `${process.env.APP_URL}/api/webhook/whatsapp` : 'https://integracrva-teste.vercel.app/api/webhook/whatsapp');

  console.log(`[WHATSAPP WEBHOOK] 🔄 Sincronizando Webhook na Evolution API (${evolutionInstance}) para: ${webhookUrl}`);

  try {
    // Configura o webhook na Evolution API v2
    const endpoint = `${evolutionUrl}/webhook/set/${encodeURIComponent(evolutionInstance)}`;
    const payload = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
        ],
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (response.ok) {
      console.log(`[WHATSAPP WEBHOOK] ✅ Webhook sincronizado com sucesso na Evolution API.`);
      return res.status(200).json({
        sucesso: true,
        mensagem: 'Webhook configurado e ativado com sucesso na Evolution API.',
        webhookUrl,
        detalhes: data,
      });
    }

    console.warn(`[WHATSAPP WEBHOOK] ⚠️ Evolution API retornou HTTP ${response.status}:`, data);
    return res.status(response.status).json({
      sucesso: false,
      erro: data?.message || data?.error || `Erro HTTP ${response.status} ao configurar webhook.`,
      detalhes: data,
    });
  } catch (err: any) {
    console.error('[WHATSAPP WEBHOOK] ❌ Erro ao conectar com Evolution API para sincronizar webhook:', err);
    return res.status(500).json({
      sucesso: false,
      erro: err?.message || 'Falha de comunicação com o servidor WhatsApp Gateway.',
    });
  }
}

export default async function handler(req: any, res: any) {
  return handleSetWebhook(req, res);
}
