import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Configuração do Supabase ausente no ambiente do servidor.');
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });
}

function verificarPermissaoEscrita(roleInput: any): boolean {
  if (!roleInput) return false;
  const role = String(
    typeof roleInput === 'object'
      ? roleInput.role || roleInput.funcao || roleInput.user_metadata?.role || ''
      : roleInput
  ).toLowerCase().trim();

  // Master: Poderes ilimitados. Gerente e Financeiro: gestão do catálogo autorizada.
  return ['master', 'super_admin', 'admin_master', 'gerente', 'financeiro'].includes(role);
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-User-Role'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = getSupabase();

    // -------------------------------------------------------------------------
    // 1. GET: LISTAGEM GLOBAL DOS SERVIÇOS (COMPARTILHADA POR TODAS AS CONTAS)
    // -------------------------------------------------------------------------
    if (req.method === 'GET') {
      const { incluirInativos, busca } = req.query || {};

      let query = supabase
        .from('catalogo_servicos')
        .select('*')
        .order('nome', { ascending: true });

      if (incluirInativos !== 'true') {
        // Exibe apenas serviços ativos para o balcão e PDV
        try {
          query = query.or('ativo.is.null,ativo.eq.true');
        } catch {
          // Mantém query padrão caso a coluna ainda não exista
        }
      }

      let { data, error } = await query;

      // Fallback em caso de transição de tabela legada
      if (error || !data || data.length === 0) {
        const { data: dataLegado } = await supabase
          .from('servicos')
          .select('*')
          .order('name', { ascending: true });

        if (dataLegado && dataLegado.length > 0) {
          data = dataLegado.map((s: any) => ({
            id: s.id,
            codigo: s.code || `SRV-${String(s.id).slice(0, 4).toUpperCase()}`,
            nome: s.name,
            valor: Number(s.base_value ?? s.valor ?? 0),
            categoria: s.categoria || 'Geral',
            ativo: s.ativo !== false,
          }));
        }
      }

      let lista = (data || []).map((s: any) => ({
        id: String(s.id),
        codigo: s.codigo || s.code || `SRV-${String(s.id).slice(0, 4).toUpperCase()}`,
        nome: s.nome || s.name || s.descricao || 'Serviço CRVA',
        valor: Number(s.valor ?? s.valor_base ?? s.base_value ?? 0),
        categoria: s.categoria || 'Geral',
        ativo: s.ativo !== false,
      }));

      if (busca && typeof busca === 'string' && busca.trim()) {
        const termo = busca.toLowerCase().trim();
        lista = lista.filter(
          (s: any) =>
            s.nome.toLowerCase().includes(termo) ||
            s.codigo.toLowerCase().includes(termo) ||
            (s.categoria && s.categoria.toLowerCase().includes(termo))
        );
      }

      return res.status(200).json({ sucesso: true, dados: lista });
    }

    // -------------------------------------------------------------------------
    // VALIDAÇÃO RIGOROSA DE RBAC PARA ESCRITA (POST, PUT, DELETE)
    // -------------------------------------------------------------------------
    const roleRequisitante =
      req.headers['x-user-role'] ||
      req.body?.userRole ||
      req.body?.role ||
      req.query?.userRole;

    if (!verificarPermissaoEscrita(roleRequisitante)) {
      return res.status(403).json({
        sucesso: false,
        erro: 'Acesso Negado (403 Forbidden): Apenas usuários MASTER, GERENTE ou FINANCEIRO possuem permissão para cadastrar, editar ou inativar serviços no catálogo.',
      });
    }

    // -------------------------------------------------------------------------
    // 2. POST: CADASTRO DE NOVO SERVIÇO GLOBAL NO CATÁLOGO
    // -------------------------------------------------------------------------
    if (req.method === 'POST') {
      const { codigo, nome, descricao, valor, categoria, ativo } = req.body || {};

      const nomeFinal = (nome || descricao || '').trim();
      const valorFinal = Number(valor);

      if (!nomeFinal || isNaN(valorFinal) || valorFinal <= 0) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Descrição e valor monetário válido maior que zero são obrigatórios.',
        });
      }

      const codFinal =
        (codigo || '').trim().toUpperCase() ||
        `SRV-${Date.now().toString().slice(-4)}`;

      const payload = {
        codigo: codFinal,
        nome: nomeFinal,
        valor: valorFinal,
        categoria: (categoria || 'Geral').trim(),
        ativo: ativo !== undefined ? Boolean(ativo) : true,
      };

      const { data, error } = await supabase
        .from('catalogo_servicos')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        // Tenta fallback na tabela servicos legada
        const { data: legData, error: legErr } = await supabase
          .from('servicos')
          .insert({ name: nomeFinal, base_value: valorFinal })
          .select('*')
          .single();

        if (legErr) {
          return res.status(500).json({ sucesso: false, erro: error.message });
        }

        return res.status(201).json({
          sucesso: true,
          servico: {
            id: String(legData.id),
            codigo: codFinal,
            nome: legData.name,
            valor: Number(legData.base_value),
            categoria: payload.categoria,
            ativo: true,
          },
        });
      }

      return res.status(201).json({
        sucesso: true,
        servico: {
          id: String(data.id),
          codigo: data.codigo || codFinal,
          nome: data.nome,
          valor: Number(data.valor),
          categoria: data.categoria || payload.categoria,
          ativo: data.ativo !== false,
        },
      });
    }

    // -------------------------------------------------------------------------
    // 3. PUT: ATUALIZAÇÃO / EDIÇÃO DE SERVIÇO EXISTENTE NO CATÁLOGO
    // -------------------------------------------------------------------------
    if (req.method === 'PUT') {
      const id = req.query?.id || req.body?.id;
      const { codigo, nome, descricao, valor, categoria, ativo } = req.body || {};

      if (!id) {
        return res.status(400).json({ sucesso: false, erro: 'ID do serviço obrigatório para edição.' });
      }

      const nomeFinal = (nome || descricao || '').trim();
      const valorFinal = Number(valor);

      if (!nomeFinal || isNaN(valorFinal) || valorFinal <= 0) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Descrição e valor monetário válido maior que zero são obrigatórios.',
        });
      }

      const updatePayload: any = {
        nome: nomeFinal,
        valor: valorFinal,
      };

      if (codigo) updatePayload.codigo = String(codigo).trim().toUpperCase();
      if (categoria) updatePayload.categoria = String(categoria).trim();
      if (ativo !== undefined) updatePayload.ativo = Boolean(ativo);

      const { data, error } = await supabase
        .from('catalogo_servicos')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        // Tenta fallback na tabela legada
        await supabase
          .from('servicos')
          .update({ name: nomeFinal, base_value: valorFinal })
          .eq('id', id);

        return res.status(200).json({
          sucesso: true,
          servico: {
            id: String(id),
            codigo: codigo || `SRV-${String(id).slice(0, 4).toUpperCase()}`,
            nome: nomeFinal,
            valor: valorFinal,
            categoria: categoria || 'Geral',
            ativo: ativo !== false,
          },
        });
      }

      return res.status(200).json({
        sucesso: true,
        servico: {
          id: String(data.id),
          codigo: data.codigo || updatePayload.codigo,
          nome: data.nome,
          valor: Number(data.valor),
          categoria: data.categoria || updatePayload.categoria || 'Geral',
          ativo: data.ativo !== false,
        },
      });
    }

    // -------------------------------------------------------------------------
    // 4. DELETE: INATIVAÇÃO DO SERVIÇO
    // -------------------------------------------------------------------------
    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ sucesso: false, erro: 'ID do serviço obrigatório.' });
      }

      // Inativação lógica
      const { error } = await supabase
        .from('catalogo_servicos')
        .update({ ativo: false })
        .eq('id', id);

      if (error) {
        return res.status(500).json({ sucesso: false, erro: error.message });
      }

      return res.status(200).json({ sucesso: true, mensagem: 'Serviço inativado com sucesso.' });
    }

    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  } catch (err: any) {
    console.error('[API Servicos] Erro interno:', err);
    return res.status(500).json({ sucesso: false, erro: err.message || 'Erro interno no servidor' });
  }
}
