export const WHATSAPP_TEMPLATES = {
  FICHA_DIGITAL: (nome: string, ficha: string, modelo: string, placa: string) =>
    `Olá, ${nome}! Seu atendimento no INTEGRA CRVA foi iniciado com sucesso. Segue sua Ficha Digital de Vistoria: *${ficha}* vinculada ao veículo *${modelo}*, Placa *${placa}*. Acompanhe por aqui as atualizações do seu atendimento.`,

  CHAMAR_BOX: (nome: string, modelo: string, placa: string) =>
    `Olá, ${nome}! Por gentileza, prepare o seu veículo *${modelo}*, Placa *${placa}*, e posicione-o em qualquer um dos boxes vazios no pátio de vistorias. Nosso vistoriador já irá lhe atender.`
};

