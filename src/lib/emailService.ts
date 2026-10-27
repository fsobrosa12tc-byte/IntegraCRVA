import { 
  formatarTextoEmailCredenciais, 
  gerarLinkMailtoCredenciais,
  formatarTextoEmailRedefinicaoSenha,
  gerarLinkMailtoRedefinicaoSenha
} from '../utils/userSecurity';
import { supabase } from './supabase';

export interface EnvioEmailParams {
  nome: string;
  emailContato: string;
  emailLogin: string;
  senha: string;
  role: string;
}

export interface EnvioEmailResultado {
  sucesso: boolean;
  metodo: 'backend' | 'edge_function' | 'mailto';
  mensagem: string;
  statusHttp?: number;
  motivoErro?: string;
  precisaConfiguracaoSmtp?: boolean;
}

/**
 * Aciona o cliente nativo de e-mail do sistema operacional através de window.location.href
 * conforme a especificação do fallback funcional
 */
export function acionarClienteNativoMailto(emailContato: string, assunto: string, corpoMensagem: string): void {
  const mailtoUrl = `mailto:${emailContato}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpoMensagem)}`;
  try {
    console.warn('[emailService] Acionando fallback funcional via mailto nativo:', { emailContato, assunto });
    window.location.href = mailtoUrl;
  } catch (err) {
    console.error('[emailService] Erro ao redirecionar para mailto:', err);
  }
}

/**
 * Tenta disparar e-mail via Supabase Edge Function se configurada
 */
async function tentarEnvioEdgeFunctionSupabase(
  params: EnvioEmailParams,
  assunto: string,
  corpoTexto: string
): Promise<{ executado: boolean; sucesso: boolean; resposta?: any; erro?: string }> {
  try {
    if (supabase && typeof (supabase as any).functions?.invoke === 'function') {
      const serviceRoleKey = (import.meta as any).env?.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
      const headers: Record<string, string> = {};
      if (serviceRoleKey) {
        headers['Authorization'] = `Bearer ${serviceRoleKey}`;
      }

      console.info('[emailService] Tentando invocar Edge Function do Supabase (enviar_email_credenciais)...');
      const { data, error } = await (supabase as any).functions.invoke('enviar_email_credenciais', {
        headers,
        body: {
          destinatario: params.emailContato,
          assunto,
          nome: params.nome,
          login: params.emailLogin,
          senha: params.senha,
          role: params.role,
          corpoTexto
        }
      });

      if (!error && data?.sucesso) {
        console.info('[emailService] E-mail enviado com sucesso via Supabase Edge Function:', data);
        return { executado: true, sucesso: true, resposta: data };
      }

      if (error) {
        console.error('[emailService] Edge Function do Supabase retornou erro:', error);
        return { executado: true, sucesso: false, erro: error.message || String(error) };
      }
    }
  } catch (edgeErr: any) {
    console.error('[emailService] Exceção ao tentar invocar Edge Function do Supabase:', edgeErr);
    return { executado: true, sucesso: false, erro: edgeErr.message || 'Erro ao invocar Edge Function' };
  }

  return { executado: false, sucesso: false };
}

/**
 * Dispara o envio de credenciais institucionais por e-mail com diagnósticos detalhados,
 * tratamento de status HTTP e acionamento de fallback funcional via mailto:.
 */
export async function enviarCredenciaisEmail(params: EnvioEmailParams): Promise<EnvioEmailResultado> {
  const { nome, emailContato, emailLogin, senha, role } = params;

  if (!emailContato || !emailContato.includes('@')) {
    const msgErro = 'E-mail de contato do colaborador não foi informado ou é inválido.';
    console.error('[emailService] Erro de validação:', msgErro, { emailContato });
    return {
      sucesso: false,
      metodo: 'mailto',
      mensagem: msgErro,
      motivoErro: msgErro
    };
  }

  const { assunto, corpoTexto, corpoHtml } = formatarTextoEmailCredenciais(
    nome,
    emailLogin,
    senha,
    role
  );

  // 1. Tenta envio através de Edge Function do Supabase (caso configurada)
  const edgeRes = await tentarEnvioEdgeFunctionSupabase(params, assunto, corpoTexto);
  if (edgeRes.executado && edgeRes.sucesso) {
    return {
      sucesso: true,
      metodo: 'edge_function',
      mensagem: 'E-mail de credenciais enviado com sucesso!'
    };
  }

  // 2. Disparo via API do backend local (/api/enviar_email_credenciais)
  try {
    console.info('[emailService] Disparando requisição para /api/enviar_email_credenciais...', {
      destinatario: emailContato,
      emailLogin
    });

    const resposta = await fetch('/api/enviar_email_credenciais', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        destinatario: emailContato,
        nomeCompleto: nome,
        emailLogin,
        senhaGerada: senha,
        roleMapeada: role,
        assunto,
        corpoTexto,
        corpoHtml
      })
    });

    if (resposta.status === 200) {
      const data = await resposta.json().catch(() => null);
      if (data && data.sucesso) {
        console.info('[emailService] E-mail enviado com sucesso via servidor:', data);
        return {
          sucesso: true,
          metodo: 'backend',
          mensagem: 'E-mail de credenciais enviado com sucesso!'
        };
      }
    }

    // Se a resposta tiver status != 200, diagnostica o erro retornado
    let motivoErro = `Status ${resposta.status} (${resposta.statusText})`;
    try {
      const dataErro = await resposta.json();
      motivoErro = dataErro.erro || dataErro.mensagem || motivoErro;
    } catch {
      const textoErro = await resposta.text().catch(() => '');
      if (textoErro) motivoErro = textoErro;
    }

    console.error('[emailService] Falha na resposta da API de e-mail (status != 200):', {
      statusHttp: resposta.status,
      motivo: motivoErro,
      destinatario: emailContato
    });

    // Aciona fallback funcional imediato via mailto:
    acionarClienteNativoMailto(emailContato, assunto, corpoTexto);

    return {
      sucesso: false,
      metodo: 'mailto',
      statusHttp: resposta.status,
      motivoErro,
      precisaConfiguracaoSmtp: resposta.status === 503 || resposta.status === 501 || motivoErro.includes('SMTP') || motivoErro.includes('Resend'),
      mensagem: 'O serviço SMTP precisa de configuração no painel do Supabase.'
    };
  } catch (err: any) {
    console.error('[emailService] Exceção inesperada na requisição de e-mail:', err);

    // Aciona fallback funcional imediato via mailto:
    acionarClienteNativoMailto(emailContato, assunto, corpoTexto);

    return {
      sucesso: false,
      metodo: 'mailto',
      motivoErro: err.message || 'Falha de conexão com o servidor',
      precisaConfiguracaoSmtp: true,
      mensagem: 'O serviço SMTP precisa de configuração no painel do Supabase.'
    };
  }
}

/**
 * Alias de compatibilidade com a assinatura mencionada nas diretrizes
 */
export const enviarEmailCredenciais = enviarCredenciaisEmail;

/**
 * Dispara o envio do e-mail específico de redefinição de senha com diagnóstico e fallback
 */
export async function enviarRedefinicaoSenhaEmail(params: EnvioEmailParams): Promise<EnvioEmailResultado> {
  const { nome, emailContato, emailLogin, senha, role } = params;

  if (!emailContato || !emailContato.includes('@')) {
    const msgErro = 'E-mail de contato do colaborador não foi informado ou é inválido.';
    console.error('[emailService] Erro de validação:', msgErro, { emailContato });
    return {
      sucesso: false,
      metodo: 'mailto',
      mensagem: msgErro,
      motivoErro: msgErro
    };
  }

  const { assunto, corpoTexto, corpoHtml } = formatarTextoEmailRedefinicaoSenha(
    nome,
    emailLogin,
    senha,
    role
  );

  // 1. Tenta Edge Function
  const edgeRes = await tentarEnvioEdgeFunctionSupabase(params, assunto, corpoTexto);
  if (edgeRes.executado && edgeRes.sucesso) {
    return {
      sucesso: true,
      metodo: 'edge_function',
      mensagem: 'E-mail de credenciais enviado com sucesso!'
    };
  }

  // 2. Disparo via backend
  try {
    console.info('[emailService] Disparando redefinição para /api/enviar_email_credenciais...', {
      destinatario: emailContato,
      emailLogin
    });

    const resposta = await fetch('/api/enviar_email_credenciais', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        destinatario: emailContato,
        nomeCompleto: nome,
        emailLogin,
        senhaGerada: senha,
        roleMapeada: role,
        assunto,
        corpoTexto,
        corpoHtml
      })
    });

    if (resposta.status === 200) {
      const data = await resposta.json().catch(() => null);
      if (data && data.sucesso) {
        console.info('[emailService] E-mail de redefinição enviado com sucesso via servidor:', data);
        return {
          sucesso: true,
          metodo: 'backend',
          mensagem: 'E-mail de credenciais enviado com sucesso!'
        };
      }
    }

    // Se status != 200, diagnostica o erro
    let motivoErro = `Status ${resposta.status} (${resposta.statusText})`;
    try {
      const dataErro = await resposta.json();
      motivoErro = dataErro.erro || dataErro.mensagem || motivoErro;
    } catch {
      const textoErro = await resposta.text().catch(() => '');
      if (textoErro) motivoErro = textoErro;
    }

    console.error('[emailService] Falha na resposta de redefinição de e-mail (status != 200):', {
      statusHttp: resposta.status,
      motivo: motivoErro,
      destinatario: emailContato
    });

    // Aciona fallback funcional imediato via mailto:
    acionarClienteNativoMailto(emailContato, assunto, corpoTexto);

    return {
      sucesso: false,
      metodo: 'mailto',
      statusHttp: resposta.status,
      motivoErro,
      precisaConfiguracaoSmtp: resposta.status === 503 || resposta.status === 501 || motivoErro.includes('SMTP') || motivoErro.includes('Resend'),
      mensagem: 'O serviço SMTP precisa de configuração no painel do Supabase.'
    };
  } catch (err: any) {
    console.error('[emailService] Exceção inesperada na redefinição de senha por e-mail:', err);

    acionarClienteNativoMailto(emailContato, assunto, corpoTexto);

    return {
      sucesso: false,
      metodo: 'mailto',
      motivoErro: err.message || 'Falha de conexão com o servidor',
      precisaConfiguracaoSmtp: true,
      mensagem: 'O serviço SMTP precisa de configuração no painel do Supabase.'
    };
  }
}

/**
 * Aciona diretamente o cliente de e-mail com modelo de credenciais iniciais
 */
export function abrirClienteEmail(params: EnvioEmailParams): void {
  const { assunto, corpoTexto } = formatarTextoEmailCredenciais(
    params.nome,
    params.emailLogin,
    params.senha,
    params.role
  );
  acionarClienteNativoMailto(params.emailContato, assunto, corpoTexto);
}

/**
 * Aciona diretamente o cliente de e-mail com modelo de redefinição de senha
 */
export function abrirClienteEmailRedefinicaoSenha(params: EnvioEmailParams): void {
  const { assunto, corpoTexto } = formatarTextoEmailRedefinicaoSenha(
    params.nome,
    params.emailLogin,
    params.senha,
    params.role
  );
  acionarClienteNativoMailto(params.emailContato, assunto, corpoTexto);
}
