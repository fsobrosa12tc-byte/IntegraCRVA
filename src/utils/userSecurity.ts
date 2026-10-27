/**
 * Utilitários de Segurança e Padronização Corporativa de Credenciais
 */

/**
 * Remove acentos e caracteres não-alfanuméricos, retornando apenas letras minúsculas
 */
function normalizarTexto(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9]/g, '')   // remove caracteres especiais e espaços
    .toLowerCase();
}

/**
 * Gera o login corporativo padrão da Marks Systems
 * Formato: ${primeiroNome}.${roleMapeada}@marks.com
 * Exemplo: "João Vitor" (caixa) -> "joao.caixa@marks.com"
 */
export function gerarLoginMarks(nomeCompleto: string, role: string): string {
  if (!nomeCompleto || !nomeCompleto.trim()) {
    return '';
  }

  const partes = nomeCompleto.trim().split(/\s+/);
  const primeiroNome = normalizarTexto(partes[0] || 'usuario');

  const roleLimpa = role.trim().toLowerCase();
  let roleMapeada = 'colaborador';

  switch (roleLimpa) {
    case 'master':
      roleMapeada = 'master';
      break;
    case 'gerente':
      roleMapeada = 'gerente';
      break;
    case 'financeiro':
      roleMapeada = 'financeiro';
      break;
    case 'caixa':
      roleMapeada = 'caixa';
      break;
    case 'atendente':
      roleMapeada = 'atendente';
      break;
    default:
      roleMapeada = normalizarTexto(role) || 'colaborador';
      break;
  }

  return `${primeiroNome}.${roleMapeada}@marks.com`;
}

/**
 * Gera senha alfanumérica criptograficamente segura de tamanho configurável (padrão: 8 caracteres).
 * Mistura [A-Z], [a-z] e [0-9], excluindo caracteres visualmente ambíguos:
 * Excluídos: 'l', '1', 'I', 'O', '0', 'o'.
 */
export function gerarSenhaAlfanumerica(tamanho: number = 8): string {
  const maiusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I, O
  const minusculas = 'abcdefghijkmnpqrstuvwxyz'; // sem l, o
  const numeros = '23456789';                   // sem 1, 0
  const todos = maiusculas + minusculas + numeros;

  const array = new Uint8Array(tamanho);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < tamanho; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }

  let senha = '';
  // Garante ao menos 1 maiúscula, 1 minúscula e 1 número
  senha += maiusculas[array[0] % maiusculas.length];
  senha += minusculas[array[1] % minusculas.length];
  senha += numeros[array[2] % numeros.length];

  for (let i = 3; i < tamanho; i++) {
    senha += todos[array[i] % todos.length];
  }

  // Embaralha para que as posições iniciais não sejam fixas
  return senha
    .split('')
    .sort(() => (Math.random() > 0.5 ? 1 : -1))
    .join('');
}

/**
 * Aplica máscara de CPF: 000.000.000-00
 */
export function formatarCPF(valor: string): string {
  const digits = valor.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Validação rigorosa do algoritmo de verificação de CPF (dígitos verificadores)
 */
export function validarCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;

  // Rejeita padrões com todos os dígitos iguais (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  const digito1 = resto >= 10 ? 0 : resto;
  if (digito1 !== parseInt(clean.charAt(9), 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  resto = 11 - (soma % 11);
  const digito2 = resto >= 10 ? 0 : resto;

  return digito2 === parseInt(clean.charAt(10), 10);
}

/**
 * Aplica máscara de telefone: (00) 00000-0000 ou (00) 0000-0000
 */
export function formatarTelefone(valor: string): string {
  const v = valor.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) {
    return v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  } else if (v.length > 6) {
    return v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
  } else if (v.length > 2) {
    return v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
  } else if (v.length > 0) {
    return `(${v}`;
  }
  return '';
}

/**
 * Sanitiza o telefone garantindo o prefixo DDI do Brasil (55).
 * Exemplo: "(51) 99999-9999" -> "5551999999999"
 */
export function sanitizarTelefoneWhatsApp(telefone: string): string {
  const numeros = telefone.replace(/\D/g, '');
  if (!numeros) return '';
  if (numeros.startsWith('55') && (numeros.length === 12 || numeros.length === 13)) {
    return numeros;
  }
  return `55${numeros}`;
}

/**
 * Gera a URL oficial da API do WhatsApp com mensagem codificada para envio de credenciais
 */
export function gerarLinkWhatsAppCredenciais(
  nome: string,
  emailLogin: string,
  senhaInicial: string,
  telefone: string
): string {
  const telefoneSanitizado = sanitizarTelefoneWhatsApp(telefone);
  const mensagem = `Olá, *${nome}*! 👋\n\nSeu acesso ao sistema *INTEGRA* foi gerado com sucesso.\n\n👤 *Login:* ${emailLogin}\n🔑 *Senha Inicial:* ${senhaInicial}\n\n⚠️ *Atenção:* Guarde esta senha em local seguro. Caso perca o acesso, solicite a redefinição à supervisão/gestão responsável.`;
  const mensagemCodificada = encodeURIComponent(mensagem);
  return `https://api.whatsapp.com/send?phone=${telefoneSanitizado}&text=${mensagemCodificada}`;
}

/**
 * Gera o texto oficial formatado e o HTML para envio de credenciais por e-mail
 */
export function formatarTextoEmailCredenciais(
  nomeCompleto: string,
  emailLogin: string,
  senhaGerada: string,
  roleMapeada: string
): { assunto: string; corpoTexto: string; corpoHtml: string } {
  const assunto = 'Sistema INTEGRA — Credenciais de Acesso Institucional';
  
  const corpoTexto = `Olá, ${nomeCompleto}!

Seu cadastro no sistema INTEGRA foi concluído com sucesso.
Abaixo estão as suas credenciais de acesso:

👤 Login Institucional: ${emailLogin}
🔑 Senha de Acesso: ${senhaGerada}
💼 Nível / Função: ${roleMapeada}

⚠️ Guarde esta senha em local seguro. Em caso de perda, solicite a redefinição à supervisão/gestão responsável.`;

  const corpoHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h2 style="color: #0f172a; margin: 0 0 4px 0; font-size: 22px; font-weight: 800;">MARKS SYSTEMS — INTEGRA</h2>
    <p style="color: #64748b; margin: 0; font-size: 13px;">Credenciais de Acesso Corporativo Institucional</p>
  </div>
  
  <p style="font-size: 15px; line-height: 1.5;">Olá, <strong>${nomeCompleto}</strong>!</p>
  <p style="font-size: 14px; line-height: 1.5; color: #475569;">Seu cadastro no sistema <strong>INTEGRA</strong> foi concluído com sucesso. Abaixo estão as suas credenciais de acesso:</p>
  
  <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>👤 Login Institucional:</strong> <code style="background-color: #ffffff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: bold;">${emailLogin}</code></p>
    <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>🔑 Senha de Acesso:</strong> <code style="background-color: #ffffff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0; color: #047857; font-weight: bold; letter-spacing: 1px;">${senhaGerada}</code></p>
    <p style="margin: 0; font-size: 14px;"><strong>💼 Nível / Função:</strong> <span style="display: inline-block; padding: 2px 8px; background-color: #e0e7ff; color: #3730a3; border-radius: 4px; font-weight: bold; font-size: 12px;">${roleMapeada}</span></p>
  </div>

  <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 6px; margin-bottom: 24px;">
    <p style="margin: 0; font-size: 13px; color: #b45309; line-height: 1.4;">
      ⚠️ <strong>Atenção:</strong> Guarde esta senha em local seguro. Em caso de perda, solicite a redefinição à supervisão/gestão responsável.
    </p>
  </div>

  <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">Marks Systems • Plataforma Unificada de Gestão Corporativa</p>
</div>`;

  return { assunto, corpoTexto, corpoHtml };
}

/**
 * Gera URL mailto: para acionamento direto do cliente de e-mail do supervisor
 */
export function gerarLinkMailtoCredenciais(
  nomeCompleto: string,
  emailContato: string,
  emailLogin: string,
  senhaGerada: string,
  roleMapeada: string
): string {
  const { assunto, corpoTexto } = formatarTextoEmailCredenciais(
    nomeCompleto,
    emailLogin,
    senhaGerada,
    roleMapeada
  );
  return `mailto:${emailContato}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpoTexto)}`;
}

/**
 * Gera o link do WhatsApp para notificação de redefinição de senha
 */
export function gerarLinkWhatsAppRedefinicaoSenha(
  nome: string,
  emailLogin: string,
  novaSenha: string,
  telefone: string
): string {
  const telefoneSanitizado = sanitizarTelefoneWhatsApp(telefone);
  const mensagem = `Olá, *${nome}*! 👋\n\nSua senha de acesso ao sistema *INTEGRA* foi redefinida pela supervisão.\n\n👤 *Login:* ${emailLogin}\n🔑 *Nova Senha:* ${novaSenha}\n\n⚠️ Guarde esta senha em local seguro.`;
  const mensagemCodificada = encodeURIComponent(mensagem);
  return `https://api.whatsapp.com/send?phone=${telefoneSanitizado}&text=${mensagemCodificada}`;
}

/**
 * Gera texto e HTML para e-mail de notificação de redefinição de senha
 */
export function formatarTextoEmailRedefinicaoSenha(
  nomeCompleto: string,
  emailLogin: string,
  novaSenha: string,
  roleMapeada: string
): { assunto: string; corpoTexto: string; corpoHtml: string } {
  const assunto = 'Sistema INTEGRA — Redefinição de Senha de Acesso';

  const corpoTexto = `Olá, ${nomeCompleto}!

Sua senha de acesso ao sistema INTEGRA foi redefinida pela supervisão com sucesso.
Abaixo estão as suas novas credenciais atualizadas:

👤 Login Institucional: ${emailLogin}
🔑 Nova Senha de Acesso: ${novaSenha}
💼 Nível / Função: ${roleMapeada}

⚠️ Guarde esta senha em local seguro. Em caso de dúvidas, contate a supervisão/gestão responsável.`;

  const corpoHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h2 style="color: #0f172a; margin: 0 0 4px 0; font-size: 22px; font-weight: 800;">MARKS SYSTEMS — INTEGRA</h2>
    <p style="color: #64748b; margin: 0; font-size: 13px;">Redefinição de Senha de Acesso Corporativo</p>
  </div>
  
  <p style="font-size: 15px; line-height: 1.5;">Olá, <strong>${nomeCompleto}</strong>!</p>
  <p style="font-size: 14px; line-height: 1.5; color: #475569;">Sua senha de acesso ao sistema <strong>INTEGRA</strong> foi redefinida pela supervisão com sucesso. Abaixo estão as suas novas credenciais:</p>
  
  <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>👤 Login Institucional:</strong> <code style="background-color: #ffffff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: bold;">${emailLogin}</code></p>
    <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>🔑 Nova Senha de Acesso:</strong> <code style="background-color: #ffffff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0; color: #2563eb; font-weight: bold; letter-spacing: 1px;">${novaSenha}</code></p>
    <p style="margin: 0; font-size: 14px;"><strong>💼 Nível / Função:</strong> <span style="display: inline-block; padding: 2px 8px; background-color: #e0e7ff; color: #3730a3; border-radius: 4px; font-weight: bold; font-size: 12px;">${roleMapeada}</span></p>
  </div>

  <div style="background-color: #eff6ff; border: 1px solid #dbeafe; border-left: 4px solid #3b82f6; padding: 12px; border-radius: 6px; margin-bottom: 24px;">
    <p style="margin: 0; font-size: 13px; color: #1d4ed8; line-height: 1.4;">
      ⚠️ <strong>Atenção:</strong> Guarde esta nova senha em local seguro. Em caso de dúvidas, procure a supervisão ou gestão responsável.
    </p>
  </div>

  <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">Marks Systems • Plataforma Unificada de Gestão Corporativa</p>
</div>`;

  return { assunto, corpoTexto, corpoHtml };
}

/**
 * Gera URL mailto: para acionamento de redefinição de senha
 */
export function gerarLinkMailtoRedefinicaoSenha(
  nomeCompleto: string,
  emailContato: string,
  emailLogin: string,
  novaSenha: string,
  roleMapeada: string
): string {
  const { assunto, corpoTexto } = formatarTextoEmailRedefinicaoSenha(
    nomeCompleto,
    emailLogin,
    novaSenha,
    roleMapeada
  );
  return `mailto:${emailContato}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpoTexto)}`;
}

