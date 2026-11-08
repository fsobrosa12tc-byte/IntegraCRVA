export const WHATSAPP_TEMPLATES = {
  // Mensagem 1: Disparo imediato ao gerar a Ficha Digital
  FICHA_DIGITAL: (nome: string, ficha: string, modelo: string, placa: string) =>
    `Olá, ${nome}! Seu atendimento no CRVA foi iniciado com sucesso. Segue sua Ficha Digital de Vistoria: *${ficha}* vinculada ao veículo *${modelo}*, Placa *${placa}*. Acompanhe por aqui as atualizações do seu atendimento.`,

  // Mensagem 2: Chamada do vistoriador para o pátio
  CHAMAR_BOX: (nome: string, modelo: string, placa: string) =>
    `Olá, ${nome}! Por gentileza, prepare o seu veículo *${modelo}*, Placa *${placa}*, e posicione-o em qualquer um dos boxes vazios no pátio de vistorias. Nosso vistoriador já irá lhe atender.`,

  // Mensagem 3A: Vistoria Aprovada
  LAUDO_APROVADO: (nome: string, modelo: string, placa: string) =>
    `Ótima notícia, ${nome}! A vistoria do veículo *${modelo}* (Placa *${placa}*) foi *APROVADA*. Seu documento Digital (CRLV-e/CRV-e) estará disponível em até 24hr no seu aplicativo da CNH Digital, qualquer dúvida pode entrar em contato conosco. Abraço.`,

  // Mensagem 3B: Vistoria com Pendência / Reprovada
  LAUDO_REPROVADO: (nome: string, placa: string, motivos: string) =>
    `Atenção, ${nome}: A vistoria do seu veículo (Placa *${placa}*) reprovou pelos seguintes motivos:\n\n${motivos}\n\nSeu prazo de 30 dias da transferência do veiculo ainda seguem contando, para regularização da pendencia você tem 30 dias a contar da vistoria, assim que regularizar basta reapresentar seu veiculo no CRVA novamente para tira as fotos.`
};
