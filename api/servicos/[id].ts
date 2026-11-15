import servicosHandler from '../servicos';

export default async function handler(req: any, res: any) {
  // Encaminha requisições dinâmicas /api/servicos/[id] para o handler central de serviços
  if (!req.query) req.query = {};
  return servicosHandler(req, res);
}
