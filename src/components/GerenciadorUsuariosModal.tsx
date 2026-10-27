import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Shield, 
  ShieldAlert, 
  UserPlus, 
  Trash2, 
  CheckCircle2, 
  Lock, 
  UserCheck, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Power, 
  Check, 
  Ban,
  Copy,
  RefreshCw,
  KeyRound,
  Mail,
  Phone,
  CreditCard,
  Sparkles,
  Info,
  MessageSquare,
  Send,
  Pencil
} from 'lucide-react';
import { 
  UserAccount, 
  UserRole, 
  ROLE_LABELS, 
  ROLE_BADGE_COLORS, 
  canManageUsers, 
  getAllowedCreationRoles, 
  canDeleteUser,
  canToggleStatusUser,
  canEditUser
} from '../types/auth';
import { 
  buscarUsuariosSupabase, 
  autenticarSupervisorSupabase, 
  cadastrarUsuarioSupabase, 
  excluirUsuarioSupabase,
  alternarStatusUsuarioSupabase,
  redefinirSenhaUsuarioSupabase,
  sincronizarUsuariosExistentesSupabase
} from '../lib/authStorage';
import { 
  gerarLoginMarks, 
  gerarSenhaAlfanumerica, 
  formatarCPF, 
  validarCPF, 
  formatarTelefone,
  gerarLinkWhatsAppCredenciais,
  sanitizarTelefoneWhatsApp,
  gerarLinkWhatsAppRedefinicaoSenha
} from '../utils/userSecurity';
import { enviarCredenciaisEmail, enviarEmailCredenciais, enviarRedefinicaoSenhaEmail } from '../lib/emailService';

interface GerenciadorUsuariosModalProps {
  aberto: boolean;
  onFechar: () => void;
}

interface CredencialResumo {
  nome: string;
  cpf: string;
  funcao: string;
  login: string;
  senhaInicial: string;
  telefone: string;
  emailContato: string;
  roleOriginal: UserRole;
}

export default function GerenciadorUsuariosModal({ aberto, onFechar }: GerenciadorUsuariosModalProps) {
  // Estado da Etapa 1: Autenticação do Supervisor
  const [gestorLogado, setGestorLogado] = useState<UserAccount | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authSenha, setAuthSenha] = useState('');
  const [mostrarAuthSenha, setMostrarAuthSenha] = useState(false);
  const [authErro, setAuthErro] = useState('');
  const [authCarregando, setAuthCarregando] = useState(false);
  const [bloqueioAutomatico, setBloqueioAutomatico] = useState(false);

  // Estado da Etapa 2: Painel e Lista de Usuários
  const [usuarios, setUsuarios] = useState<UserAccount[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  // Formulário de Cadastro de Novo Usuário
  const [formNome, setFormNome] = useState('');
  const [formCpf, setFormCpf] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formEmailContato, setFormEmailContato] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('caixa');
  const [formSenhaGerada, setFormSenhaGerada] = useState('');
  const [mostrarSenhaGerada, setMostrarSenhaGerada] = useState(false);
  const [senhaCopiada, setSenhaCopiada] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Modal de Resumo de Credenciais Criadas
  const [resumoCredenciais, setResumoCredenciais] = useState<CredencialResumo | null>(null);
  const [credenciaisCopiadas, setCredenciaisCopiadas] = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [statusEnvioEmail, setStatusEnvioEmail] = useState<{ tipo: 'sucesso' | 'info' | 'erro'; texto: string } | null>(null);

  // Estado do Modal Secundário de Edição / Redefinição de Senha
  const [usuarioEmEdicao, setUsuarioEmEdicao] = useState<UserAccount | null>(null);
  const [novaSenhaEdicao, setNovaSenhaEdicao] = useState('');
  const [mostrarNovaSenhaEdicao, setMostrarNovaSenhaEdicao] = useState(false);
  const [salvandoNovaSenha, setSalvandoNovaSenha] = useState(false);
  const [erroRedefinicao, setErroRedefinicao] = useState('');
  const [sucessoRedefinicao, setSucessoRedefinicao] = useState(false);
  const [enviandoEmailRedefinicao, setEnviandoEmailRedefinicao] = useState(false);
  const [statusEnvioRedefinicao, setStatusEnvioRedefinicao] = useState<{ tipo: 'sucesso' | 'info' | 'erro'; texto: string } | null>(null);
  const [dadosRedefinicaoCopiados, setDadosRedefinicaoCopiados] = useState(false);

  // Estado do Toast Flutuante de Notificação e Diagnóstico
  const [toastNotificacao, setToastNotificacao] = useState<{
    id: number;
    tipo: 'sucesso' | 'erro' | 'info';
    titulo?: string;
    mensagem: string;
  } | null>(null);

  const exibirToast = (tipo: 'sucesso' | 'erro' | 'info', mensagem: string, titulo?: string) => {
    setToastNotificacao({ id: Date.now(), tipo, mensagem, titulo });
  };

  useEffect(() => {
    if (toastNotificacao) {
      const timer = setTimeout(() => {
        setToastNotificacao(null);
      }, 6500);
      return () => clearTimeout(timer);
    }
  }, [toastNotificacao]);

  // Login institucional gerado dinamicamente via gerarLoginMarks
  const loginGerado = gerarLoginMarks(formNome, formRole);

  useEffect(() => {
    if (aberto) {
      carregarLista();
      setFeedbackMsg(null);
      // Gera uma senha inicial segura de 8 caracteres alfanuméricos
      setFormSenhaGerada(gerarSenhaAlfanumerica(8));
    } else {
      // Reset ao fechar modal
      setGestorLogado(null);
      setAuthEmail('');
      setAuthSenha('');
      setMostrarAuthSenha(false);
      setAuthErro('');
      setBloqueioAutomatico(false);
      setResumoCredenciais(null);
      setUsuarioEmEdicao(null);
      setNovaSenhaEdicao('');
      setErroRedefinicao('');
      setSucessoRedefinicao(false);
      setToastNotificacao(null);
      resetForm();
    }
  }, [aberto]);

  const carregarLista = async () => {
    setCarregandoLista(true);
    try {
      const dados = await buscarUsuariosSupabase();
      setUsuarios(dados);
    } catch {
      // Ignora erro de rede/fallback
    } finally {
      setCarregandoLista(false);
    }
  };

  const [sincronizandoSupabase, setSincronizandoSupabase] = useState(false);

  const handleSincronizarUsuarios = async () => {
    setSincronizandoSupabase(true);
    try {
      await sincronizarUsuariosExistentesSupabase();
      await carregarLista();
      exibirToast(
        'sucesso',
        'Contas institucionais sincronizadas e auto-confirmadas no Supabase com sucesso!',
        'Sincronização Concluída'
      );
    } catch (e: any) {
      exibirToast('erro', 'Falha ao sincronizar contas no Supabase: ' + (e?.message || ''), 'Erro de Sincronização');
    } finally {
      setSincronizandoSupabase(false);
    }
  };


  const resetForm = () => {
    setFormNome('');
    setFormCpf('');
    setFormTelefone('');
    setFormEmailContato('');
    setFormSenhaGerada(gerarSenhaAlfanumerica(8));
    setMostrarSenhaGerada(false);
    setSenhaCopiada(false);
    setEnviandoEmail(false);
    setStatusEnvioEmail(null);
    if (gestorLogado) {
      const allowed = getAllowedCreationRoles(gestorLogado.role);
      if (allowed.length > 0) setFormRole(allowed[0]);
    } else {
      setFormRole('caixa');
    }
  };

  // ============================================================
  // ETAPA 1: AUTENTICAÇÃO DO SUPERVISOR NO SUPABASE
  // ============================================================
  const handleAcessarPainel = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthErro('');
    setBloqueioAutomatico(false);

    const emailLimpo = authEmail.trim();
    const senhaLimpa = authSenha.trim();

    if (!emailLimpo || !senhaLimpa) {
      setAuthErro('Informe o E-mail do Responsável e a Senha.');
      return;
    }

    setAuthCarregando(true);

    try {
      const user = await autenticarSupervisorSupabase(emailLimpo, senhaLimpa);

      if (!user) {
        setAuthErro('Credenciais incorretas ou responsável não cadastrado.');
        setAuthCarregando(false);
        return;
      }

      // Regra: Apenas master, gerente ou financeiro podem acessar
      if (!canManageUsers(user.role)) {
        const msgBloqueio = 'Acesso negado. Nível de permissão insuficiente para gerenciar usuários.';
        setAuthErro(msgBloqueio);
        setBloqueioAutomatico(true);
        setAuthCarregando(false);

        // Encerra o modal automaticamente após exibir a mensagem
        setTimeout(() => {
          onFechar();
        }, 2200);
        return;
      }

      // Supervisor autorizado!
      setGestorLogado(user);
      const allowed = getAllowedCreationRoles(user.role);
      if (allowed.length > 0) {
        setFormRole(allowed[0]);
      }
      setFormSenhaGerada(gerarSenhaAlfanumerica(8));
      await carregarLista();
    } catch (err: any) {
      setAuthErro(err.message || 'Falha ao validar credenciais no Supabase.');
    } finally {
      setAuthCarregando(false);
    }
  };

  const handleSairGestao = () => {
    setGestorLogado(null);
    setAuthEmail('');
    setAuthSenha('');
    setAuthErro('');
    setBloqueioAutomatico(false);
    resetForm();
  };

  // ============================================================
  // ETAPA 2: CADASTRO COM REGRAS DE HIERARQUIA E AUDITORIA
  // ============================================================
  const handleCadastrarColaborador = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMsg(null);

    if (!gestorLogado) return;

    // Validações cadastrais
    if (!formNome.trim()) {
      setFeedbackMsg({ tipo: 'erro', texto: 'Informe o Nome Completo do colaborador.' });
      return;
    }

    if (!validarCPF(formCpf)) {
      setFeedbackMsg({ tipo: 'erro', texto: 'CPF informado é inválido. Verifique os 11 dígitos.' });
      return;
    }

    if (!formTelefone.trim() || formTelefone.replace(/\D/g, '').length < 10) {
      setFeedbackMsg({ tipo: 'erro', texto: 'Informe um Telefone Celular válido com DDD.' });
      return;
    }

    if (!formEmailContato.trim() || !formEmailContato.includes('@')) {
      setFeedbackMsg({ tipo: 'erro', texto: 'Informe um E-mail Pessoal / Contato válido.' });
      return;
    }

    if (!loginGerado) {
      setFeedbackMsg({ tipo: 'erro', texto: 'Não foi possível gerar o login institucional.' });
      return;
    }

    setSalvando(true);

    try {
      const supervisorId = gestorLogado.id;
      const supervisorNome = gestorLogado.nome_completo || gestorLogado.nome || gestorLogado.email;

      const res = await cadastrarUsuarioSupabase(gestorLogado.role, {
        nome_completo: formNome.trim(),
        cpf: formCpf.trim(),
        telefone: formTelefone.trim(),
        email_contato: formEmailContato.trim().toLowerCase(),
        email_login: loginGerado,
        role: formRole,
        senha: formSenhaGerada.trim(),
        criado_por_id: supervisorId,
        criado_por_nome: supervisorNome
      });

      if (!res.sucesso || !res.usuario) {
        setFeedbackMsg({ tipo: 'erro', texto: res.erro || 'Falha ao cadastrar colaborador no Supabase.' });
        return;
      }

      // Exibe Modal de Resumo de Credenciais Geradas para o supervisor repassar
      setResumoCredenciais({
        nome: res.usuario.nome_completo,
        cpf: res.usuario.cpf,
        funcao: ROLE_LABELS[res.usuario.role],
        login: res.usuario.email_login,
        senhaInicial: formSenhaGerada,
        telefone: res.usuario.telefone,
        emailContato: res.usuario.email_contato,
        roleOriginal: res.usuario.role
      });

      setFeedbackMsg({
        tipo: 'sucesso',
        texto: `Colaborador ${res.usuario.nome_completo} cadastrado com sucesso!`
      });

      await carregarLista();
      resetForm();
    } finally {
      setSalvando(false);
    }
  };

  const handleCopiarSenha = () => {
    if (!formSenhaGerada) return;
    navigator.clipboard.writeText(formSenhaGerada);
    setSenhaCopiada(true);
    setTimeout(() => setSenhaCopiada(false), 2000);
  };

  const handleGerarNovaSenha = () => {
    setFormSenhaGerada(gerarSenhaAlfanumerica(8));
    setSenhaCopiada(false);
  };

  const handleEnviarWhatsApp = () => {
    if (!resumoCredenciais) return;
    const url = gerarLinkWhatsAppCredenciais(
      resumoCredenciais.nome,
      resumoCredenciais.login,
      resumoCredenciais.senhaInicial,
      resumoCredenciais.telefone
    );
    window.open(url, '_blank');
  };

  const handleEnviarEmail = async () => {
    if (!resumoCredenciais) return;
    setEnviandoEmail(true);
    setStatusEnvioEmail(null);

    try {
      console.log('[GerenciadorUsuarios] Iniciando tentativa de envio de credenciais por e-mail...', {
        nome: resumoCredenciais.nome,
        emailContato: resumoCredenciais.emailContato,
        login: resumoCredenciais.login
      });

      const res = await enviarCredenciaisEmail({
        nome: resumoCredenciais.nome,
        emailContato: resumoCredenciais.emailContato,
        emailLogin: resumoCredenciais.login,
        senha: resumoCredenciais.senhaInicial,
        role: resumoCredenciais.funcao
      });

      console.log('[GerenciadorUsuarios] Resultado do envio de credenciais por e-mail:', res);

      if (res.sucesso) {
        exibirToast('sucesso', 'E-mail de credenciais enviado com sucesso!', 'Envio Concluído');
        setStatusEnvioEmail({
          tipo: 'sucesso',
          texto: 'E-mail de credenciais enviado com sucesso!'
        });
      } else {
        // Se houver falha na resposta (status != 200) ou necessidade de SMTP
        if (res.statusHttp && res.statusHttp !== 200) {
          const motivo = res.motivoErro || res.mensagem || `Status HTTP ${res.statusHttp}`;
          console.error('[GerenciadorUsuarios] Falha na resposta da API de e-mail (status != 200):', {
            statusHttp: res.statusHttp,
            motivo,
            destinatario: resumoCredenciais.emailContato
          });

          if (res.precisaConfiguracaoSmtp) {
            exibirToast(
              'info',
              'O serviço SMTP precisa de configuração no painel do Supabase. O cliente de e-mail nativo foi acionado com os dados preenchidos.',
              'Configuração SMTP Necessária'
            );
            setStatusEnvioEmail({
              tipo: 'info',
              texto: 'O serviço SMTP precisa de configuração no painel do Supabase. Cliente de e-mail aberto como alternativa.'
            });
          } else {
            const textoErro = `Falha no servidor (Status HTTP ${res.statusHttp}): ${motivo}`;
            exibirToast('erro', textoErro, 'Erro no Servidor de E-mail');
            setStatusEnvioEmail({
              tipo: 'erro',
              texto: textoErro
            });
          }
        } else if (res.precisaConfiguracaoSmtp) {
          exibirToast(
            'info',
            'O serviço SMTP precisa de configuração no painel do Supabase. O cliente de e-mail nativo foi acionado com os dados preenchidos.',
            'Configuração SMTP Necessária'
          );
          setStatusEnvioEmail({
            tipo: 'info',
            texto: 'O serviço SMTP precisa de configuração no painel do Supabase.'
          });
        } else {
          const motivo = res.motivoErro || res.mensagem || 'Falha ao processar envio do e-mail.';
          console.error('[GerenciadorUsuarios] Erro no envio de e-mail:', motivo);
          exibirToast('erro', motivo, 'Falha no Envio');
          setStatusEnvioEmail({
            tipo: 'erro',
            texto: motivo
          });
        }
      }
    } catch (err: any) {
      console.error('[GerenciadorUsuarios] Exceção detalhada no envio de e-mail de credenciais:', err);
      const msgErro = err.message || 'Erro inesperado ao enviar e-mail de credenciais.';
      exibirToast('erro', `Erro inesperado: ${msgErro}`, 'Falha de Conexão');
      setStatusEnvioEmail({
        tipo: 'erro',
        texto: msgErro
      });
    } finally {
      setEnviandoEmail(false);
    }
  };

  const handleCopiarCredenciaisResumo = () => {
    if (!resumoCredenciais) return;
    const texto = `Olá, *${resumoCredenciais.nome}*! 👋\n\nSeu acesso ao sistema *INTEGRA* foi gerado com sucesso.\n\n👤 *Login:* ${resumoCredenciais.login}\n🔑 *Senha Inicial:* ${resumoCredenciais.senhaInicial}\n\n⚠️ *Atenção:* Guarde esta senha em local seguro. Caso perca o acesso, solicite a redefinição à supervisão/gestão responsável.`;
    navigator.clipboard.writeText(texto);
    setCredenciaisCopiadas(true);
    setTimeout(() => setCredenciaisCopiadas(false), 2500);
  };

  const handleAlternarStatus = async (u: UserAccount) => {
    if (!gestorLogado) return;

    if (!canToggleStatusUser(gestorLogado.role, u)) {
      setFeedbackMsg({ tipo: 'erro', texto: 'Você não tem permissão para alterar o status deste usuário.' });
      return;
    }

    const res = await alternarStatusUsuarioSupabase(gestorLogado.role, u.id);
    if (!res.sucesso || !res.usuario) {
      setFeedbackMsg({ tipo: 'erro', texto: res.erro || 'Falha ao atualizar status no Supabase.' });
      return;
    }

    const statusTxt = res.usuario.ativo ? 'ativado' : 'inativado';
    setFeedbackMsg({ tipo: 'sucesso', texto: `Usuário '${res.usuario.nome_completo || res.usuario.nome}' foi ${statusTxt}.` });
    await carregarLista();
  };

  const handleExcluirUsuario = async (u: UserAccount) => {
    if (!gestorLogado) return;

    if (!canDeleteUser(gestorLogado.role, u)) {
      setFeedbackMsg({ tipo: 'erro', texto: 'Você não tem permissão para excluir este usuário.' });
      return;
    }

    const confirmou = window.confirm(
      `Confirma a exclusão definitiva do colaborador "${u.nome_completo || u.nome}" (${u.email_login || u.email})?`
    );
    if (!confirmou) return;

    const res = await excluirUsuarioSupabase(gestorLogado.role, u.id);
    if (!res.sucesso) {
      setFeedbackMsg({ tipo: 'erro', texto: res.erro || 'Falha ao excluir usuário no Supabase.' });
      return;
    }

    setFeedbackMsg({ tipo: 'sucesso', texto: `Colaborador '${u.nome_completo || u.nome}' removido com sucesso.` });
    await carregarLista();
  };

  // ============================================================
  // ETAPA 3: EDIÇÃO E REDEFINIÇÃO DE SENHA COM AUDITORIA
  // ============================================================
  const handleAbrirModalRedefinirSenha = (u: UserAccount) => {
    setUsuarioEmEdicao(u);
    setNovaSenhaEdicao(gerarSenhaAlfanumerica(8));
    setMostrarNovaSenhaEdicao(false);
    setErroRedefinicao('');
    setSucessoRedefinicao(false);
    setStatusEnvioRedefinicao(null);
    setDadosRedefinicaoCopiados(false);
  };

  const handleFecharModalRedefinirSenha = () => {
    setUsuarioEmEdicao(null);
    setNovaSenhaEdicao('');
    setErroRedefinicao('');
    setSucessoRedefinicao(false);
    setStatusEnvioRedefinicao(null);
    setDadosRedefinicaoCopiados(false);
  };

  const handleGerarNovaSenhaEdicao = () => {
    setNovaSenhaEdicao(gerarSenhaAlfanumerica(8));
  };

  const handleSalvarNovaSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroRedefinicao('');

    if (!gestorLogado || !usuarioEmEdicao) return;

    const senhaLimpa = novaSenhaEdicao.trim();
    if (senhaLimpa.length < 8) {
      setErroRedefinicao('A nova senha deve possuir no mínimo 8 caracteres.');
      return;
    }

    setSalvandoNovaSenha(true);

    try {
      const supervisorId = gestorLogado.id;
      const supervisorNome = gestorLogado.nome_completo || gestorLogado.nome || gestorLogado.email;

      const res = await redefinirSenhaUsuarioSupabase(
        gestorLogado.role,
        usuarioEmEdicao.id,
        senhaLimpa,
        supervisorId,
        supervisorNome
      );

      if (!res.sucesso || !res.usuario) {
        setErroRedefinicao(res.erro || 'Falha ao redefinir a senha do usuário.');
        return;
      }

      setSucessoRedefinicao(true);
      setFeedbackMsg({
        tipo: 'sucesso',
        texto: `Senha do usuário '${res.usuario.nome_completo || res.usuario.nome}' atualizada com sucesso!`
      });

      await carregarLista();
    } catch (err: any) {
      setErroRedefinicao(err.message || 'Erro inesperado ao salvar a nova senha.');
    } finally {
      setSalvandoNovaSenha(false);
    }
  };

  const handleEnviarWhatsAppRedefinicao = () => {
    if (!usuarioEmEdicao) return;
    const nome = usuarioEmEdicao.nome_completo || usuarioEmEdicao.nome || 'Colaborador';
    const emailLogin = usuarioEmEdicao.email_login || usuarioEmEdicao.email || '';
    const url = gerarLinkWhatsAppRedefinicaoSenha(
      nome,
      emailLogin,
      novaSenhaEdicao,
      usuarioEmEdicao.telefone || ''
    );
    window.open(url, '_blank');
  };

  const handleEnviarEmailRedefinicao = async () => {
    if (!usuarioEmEdicao) return;
    setEnviandoEmailRedefinicao(true);
    setStatusEnvioRedefinicao(null);

    const nome = usuarioEmEdicao.nome_completo || usuarioEmEdicao.nome || 'Colaborador';
    const emailLogin = usuarioEmEdicao.email_login || usuarioEmEdicao.email || '';
    const emailContato = usuarioEmEdicao.email_contato || usuarioEmEdicao.email || '';

    try {
      console.log('[GerenciadorUsuarios] Iniciando tentativa de envio de redefinição por e-mail...', {
        nome,
        emailContato,
        emailLogin
      });

      const res = await enviarRedefinicaoSenhaEmail({
        nome,
        emailContato,
        emailLogin,
        senha: novaSenhaEdicao,
        role: ROLE_LABELS[usuarioEmEdicao.role]
      });

      console.log('[GerenciadorUsuarios] Resultado do envio de e-mail de redefinição:', res);

      if (res.sucesso) {
        exibirToast('sucesso', 'E-mail de credenciais enviado com sucesso!', 'Envio Concluído');
        setStatusEnvioRedefinicao({
          tipo: 'sucesso',
          texto: 'E-mail de credenciais enviado com sucesso!'
        });
      } else {
        if (res.statusHttp && res.statusHttp !== 200) {
          const motivo = res.motivoErro || res.mensagem || `Status HTTP ${res.statusHttp}`;
          console.error('[GerenciadorUsuarios] Falha na resposta da API de e-mail de redefinição (status != 200):', {
            statusHttp: res.statusHttp,
            motivo,
            destinatario: emailContato
          });

          if (res.precisaConfiguracaoSmtp) {
            exibirToast(
              'info',
              'O serviço SMTP precisa de configuração no painel do Supabase. O cliente de e-mail nativo foi acionado com os dados preenchidos.',
              'Configuração SMTP Necessária'
            );
            setStatusEnvioRedefinicao({
              tipo: 'info',
              texto: 'O serviço SMTP precisa de configuração no painel do Supabase. Alternativa acionada via cliente nativo.'
            });
          } else {
            const textoErro = `Falha no servidor (Status HTTP ${res.statusHttp}): ${motivo}`;
            exibirToast('erro', textoErro, 'Erro no Servidor de E-mail');
            setStatusEnvioRedefinicao({
              tipo: 'erro',
              texto: textoErro
            });
          }
        } else if (res.precisaConfiguracaoSmtp) {
          exibirToast(
            'info',
            'O serviço SMTP precisa de configuração no painel do Supabase. O cliente de e-mail nativo foi acionado com os dados preenchidos.',
            'Configuração SMTP Necessária'
          );
          setStatusEnvioRedefinicao({
            tipo: 'info',
            texto: 'O serviço SMTP precisa de configuração no painel do Supabase.'
          });
        } else {
          const motivo = res.motivoErro || res.mensagem || 'Falha ao processar envio do e-mail.';
          console.error('[GerenciadorUsuarios] Erro no envio de e-mail de redefinição:', motivo);
          exibirToast('erro', motivo, 'Falha no Envio');
          setStatusEnvioRedefinicao({
            tipo: 'erro',
            texto: motivo
          });
        }
      }
    } catch (err: any) {
      console.error('[GerenciadorUsuarios] Exceção detalhada no envio de e-mail de redefinição:', err);
      const msgErro = err.message || 'Erro inesperado ao enviar e-mail de redefinição.';
      exibirToast('erro', `Erro inesperado: ${msgErro}`, 'Falha de Conexão');
      setStatusEnvioRedefinicao({
        tipo: 'erro',
        texto: msgErro
      });
    } finally {
      setEnviandoEmailRedefinicao(false);
    }
  };

  const handleCopiarDadosRedefinicao = () => {
    if (!usuarioEmEdicao) return;
    const nome = usuarioEmEdicao.nome_completo || usuarioEmEdicao.nome || 'Colaborador';
    const emailLogin = usuarioEmEdicao.email_login || usuarioEmEdicao.email || '';
    const texto = `Olá, *${nome}*! 👋\n\nSua senha de acesso ao sistema *INTEGRA* foi redefinida pela supervisão.\n\n👤 *Login:* ${emailLogin}\n🔑 *Nova Senha:* ${novaSenhaEdicao}\n\n⚠️ Guarde esta senha em local seguro.`;
    navigator.clipboard.writeText(texto);
    setDadosRedefinicaoCopiados(true);
    setTimeout(() => setDadosRedefinicaoCopiados(false), 2500);
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 overflow-y-auto">
      {/* Toast Flutuante de Diagnóstico e Notificação */}
      <AnimatePresence>
        {toastNotificacao && (
          <motion.div
            key={toastNotificacao.id}
            initial={{ opacity: 0, y: -24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.94 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] max-w-lg w-[calc(100%-2rem)] pointer-events-auto"
          >
            <div
              className={`p-4 rounded-2xl shadow-2xl border flex items-start gap-3 backdrop-blur-xl ${
                toastNotificacao.tipo === 'sucesso'
                  ? 'bg-emerald-950/95 text-emerald-100 border-emerald-500/60 shadow-emerald-950/60'
                  : toastNotificacao.tipo === 'info'
                  ? 'bg-amber-950/95 text-amber-100 border-amber-500/60 shadow-amber-950/60'
                  : 'bg-rose-950/95 text-rose-100 border-rose-500/60 shadow-rose-950/60'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {toastNotificacao.tipo === 'sucesso' && <CheckCircle2 className="text-emerald-400" size={20} />}
                {toastNotificacao.tipo === 'info' && <Info className="text-amber-400" size={20} />}
                {toastNotificacao.tipo === 'erro' && <AlertCircle className="text-rose-400" size={20} />}
              </div>
              <div className="flex-1 text-xs">
                {toastNotificacao.titulo && (
                  <strong className="block font-bold text-sm mb-1 text-white">
                    {toastNotificacao.titulo}
                  </strong>
                )}
                <p className="leading-relaxed opacity-95 text-slate-200">{toastNotificacao.mensagem}</p>
              </div>
              <button
                type="button"
                onClick={() => setToastNotificacao(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors border-0 bg-transparent cursor-pointer shrink-0"
                title="Fechar notificação"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Cabeçalho do Modal */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Shield size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight">Gestão de Usuários e Governança de Acessos</h3>
              <p className="text-xs text-slate-400">Controle de credenciais institucionais, hierarquia RBAC e trilha de auditoria</p>
            </div>
          </div>
          <button
            onClick={onFechar}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer border-0 bg-transparent"
            title="Fechar Modal"
          >
            <X size={22} />
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6">

          {/* ============================================================
              ETAPA 1: AUTENTICAÇÃO DO SUPERVISOR
             ============================================================ */}
          {!gestorLogado ? (
            <div className="max-w-md mx-auto py-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-indigo-50 border border-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-3.5 text-indigo-600 shadow-sm">
                  <Lock size={32} />
                </div>
                <h4 className="text-2xl font-black text-slate-800 tracking-tight">Autenticação do Responsável</h4>
                <p className="text-sm text-slate-500 mt-1.5">
                  Informe suas credenciais administrativas para liberar o painel de criação e governança de usuários.
                </p>
              </div>

              {authErro && (
                <div
                  className={`mb-5 p-4 rounded-2xl flex items-start gap-3 text-sm font-medium border ${
                    bloqueioAutomatico
                      ? 'bg-red-50 border-red-300 text-red-800 animate-pulse'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  <ShieldAlert size={20} className="shrink-0 mt-0.5 text-red-600" />
                  <div>
                    <strong className="block font-bold">
                      {bloqueioAutomatico ? 'Acesso Interrompido' : 'Falha de Autenticação'}
                    </strong>
                    <span>{authErro}</span>
                    {bloqueioAutomatico && (
                      <p className="text-xs text-red-600 mt-1 font-semibold">
                        Encerrando a janela de gestão automaticamente...
                      </p>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleAcessarPainel} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    E-mail do Responsável
                  </label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="ex: responsavel@crva.com.br"
                    disabled={bloqueioAutomatico || authCarregando}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm text-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    Senha
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={mostrarAuthSenha ? 'text' : 'password'}
                      value={authSenha}
                      onChange={(e) => setAuthSenha(e.target.value)}
                      placeholder="Senha corporativa do supervisor"
                      disabled={bloqueioAutomatico || authCarregando}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm text-slate-900 pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarAuthSenha(!mostrarAuthSenha)}
                      className="absolute right-3.5 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer p-1"
                      title={mostrarAuthSenha ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {mostrarAuthSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={authCarregando || bloqueioAutomatico}
                    className="w-full py-4 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer border-0"
                  >
                    {authCarregando ? (
                      'Consultando permissões no Supabase...'
                    ) : (
                      <>
                        <UserCheck size={18} />
                        Acessar Painel de Usuários
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-1 mt-4">
                  <p className="font-bold text-slate-700">Perfis com Acesso Autorizado:</p>
                  <p>• <strong>Master</strong>, <strong>Gerente</strong> ou <strong>Financeiro</strong>.</p>
                  <p className="text-red-500 font-medium">• Perfis 'Caixa' e 'Atendente' não têm autorização.</p>
                </div>
              </form>
            </div>
          ) : (
            /* ============================================================
               ETAPA 2: PAINEL DE GESTÃO, CADASTRO E LISTAGEM COM AUDITORIA
               ============================================================ */
            <div className="space-y-8">
              {/* Barra do Supervisor Autenticado */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 font-bold text-sm">
                    {(gestorLogado.nome_completo || gestorLogado.nome || 'S').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{gestorLogado.nome_completo || gestorLogado.nome}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${ROLE_BADGE_COLORS[gestorLogado.role].bg} ${ROLE_BADGE_COLORS[gestorLogado.role].text} ${ROLE_BADGE_COLORS[gestorLogado.role].border}`}>
                        {ROLE_LABELS[gestorLogado.role]}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {gestorLogado.email_login || gestorLogado.email} • Supervisor Ativo
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSairGestao}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
                >
                  Bloquear / Trocar Supervisor
                </button>
              </div>

              {/* Toast / Alerta de Feedback */}
              {feedbackMsg && (
                <div
                  className={`p-4 rounded-2xl border flex items-center gap-3 text-sm font-semibold transition-all shadow-sm ${
                    feedbackMsg.tipo === 'sucesso'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {feedbackMsg.tipo === 'sucesso' ? (
                    <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle size={20} className="text-red-600 shrink-0" />
                  )}
                  <span>{feedbackMsg.texto}</span>
                </div>
              )}

              {/* ============================================================
                  ÁREA 1: FORMULÁRIO DE CADASTRO ("Novo Usuário")
                 ============================================================ */}
              <div className="p-6 sm:p-7 bg-slate-50 border border-slate-200 rounded-3xl shadow-sm">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                    <UserPlus size={18} />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-800">Novo Colaborador Institucional</h4>
                    <p className="text-xs text-slate-500">
                      Preencha os dados cadastrais. As credenciais seguras da Marks Systems serão geradas automaticamente.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleCadastrarColaborador} className="space-y-5">
                  {/* Linha 1: Dados Cadastrais Pessoais */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nome Completo <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formNome}
                        onChange={(e) => setFormNome(e.target.value)}
                        placeholder="Ex: João Vitor Silveira"
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                        <CreditCard size={12} className="text-slate-400" />
                        CPF <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formCpf}
                        onChange={(e) => setFormCpf(formatarCPF(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                        <Phone size={12} className="text-slate-400" />
                        Telefone Celular <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formTelefone}
                        onChange={(e) => setFormTelefone(formatarTelefone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        required
                      />
                    </div>
                  </div>

                  {/* Linha 2: E-mail Pessoal e Nível de Acesso Condicionado */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                        <Mail size={12} className="text-slate-400" />
                        E-mail Pessoal / Contato <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={formEmailContato}
                        onChange={(e) => setFormEmailContato(e.target.value)}
                        placeholder="colaborador@provedor.com"
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nível de Acesso (Role) <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formRole}
                        onChange={(e) => setFormRole(e.target.value as UserRole)}
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      >
                        {getAllowedCreationRoles(gestorLogado.role).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Linha 3: Credenciais Geradas Automaticamente (Somente Leitura) */}
                  <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 mb-3">
                      <Sparkles size={14} className="text-indigo-600" />
                      <span>Credenciais Geradas Automaticamente pelo Sistema Marks</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Login Institucional Padronizado */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Login Institucional (Somente Leitura)
                        </label>
                        <input
                          type="text"
                          value={loginGerado || 'Aguardando preenchimento do nome...'}
                          disabled
                          readOnly
                          className="w-full p-3 bg-white/80 border border-indigo-200 rounded-xl text-xs font-mono font-bold text-indigo-950 cursor-not-allowed select-all"
                        />
                        <span className="text-[10px] text-slate-500 mt-1 block">
                          Formato: primeiroNome.cargo@marks.com
                        </span>
                      </div>

                      {/* Senha Inicial Alfanumérica de 8 Dígitos */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Senha Inicial Gerada (8 Caracteres Alfanuméricos)
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type={mostrarSenhaGerada ? 'text' : 'password'}
                            value={formSenhaGerada}
                            readOnly
                            disabled
                            className="w-full p-3 bg-white/80 border border-indigo-200 rounded-xl text-xs font-mono font-bold text-indigo-950 pr-24 cursor-not-allowed select-all"
                          />
                          <div className="absolute right-1.5 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setMostrarSenhaGerada(!mostrarSenhaGerada)}
                              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-white transition-colors cursor-pointer border-0 bg-transparent"
                              title={mostrarSenhaGerada ? 'Ocultar' : 'Visualizar'}
                            >
                              {mostrarSenhaGerada ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                            <button
                              type="button"
                              onClick={handleCopiarSenha}
                              className="px-2 py-1 text-[11px] font-bold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Copiar Senha"
                            >
                              {senhaCopiada ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                              <span>{senhaCopiada ? 'Copiada' : 'Copiar'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleGerarNovaSenha}
                              className="p-1.5 text-indigo-600 hover:text-indigo-800 rounded-lg hover:bg-white transition-colors cursor-pointer border-0 bg-transparent"
                              title="Gerar Outra Senha"
                            >
                              <RefreshCw size={13} />
                            </button>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1 block">
                          Criptografia aleatória segura [A-Z, a-z, 0-9] sem caracteres ambíguos.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botão de Submissão */}
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={salvando}
                      className="px-7 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg cursor-pointer border-0 flex items-center gap-2 disabled:opacity-70"
                    >
                      {salvando ? (
                        'Cadastrando e Vinculando no Supabase...'
                      ) : (
                        <>
                          <UserPlus size={15} />
                          Cadastrar Colaborador
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* ============================================================
                  ÁREA 2: TABELA DE USUÁRIOS COM AUDITORIA ("Usuários Cadastrados")
                 ============================================================ */}
              <div className="border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="bg-slate-100 px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Colaboradores e Usuários Cadastrados ({usuarios.length})
                    </h4>
                    <p className="text-xs text-slate-500">
                      Base institucional sincronizada com a tabela de perfis e trilha de auditoria
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSincronizarUsuarios}
                      disabled={sincronizandoSupabase || carregandoLista}
                      className="px-3.5 py-2 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Sincronizar e auto-confirmar todos os usuários no Supabase Auth"
                    >
                      <RefreshCw size={13} className={sincronizandoSupabase ? 'animate-spin text-indigo-600' : ''} />
                      <span>{sincronizandoSupabase ? 'Sincronizando...' : 'Sincronizar no Supabase'}</span>
                    </button>
                    {carregandoLista && (
                      <span className="text-xs font-medium text-slate-500 animate-pulse">
                        Atualizando...
                      </span>
                    )}
                  </div>
                </div>


                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="p-3.5">Colaborador / CPF</th>
                        <th className="p-3.5">Login Institucional</th>
                        <th className="p-3.5">Função / Nível</th>
                        <th className="p-3.5">Auditoria (Criado Por)</th>
                        <th className="p-3.5 text-center">Status</th>
                        <th className="p-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {usuarios.map((u) => {
                        const podeEditar = canEditUser(gestorLogado.role, u);
                        const podeExcluir = canDeleteUser(gestorLogado.role, u);
                        const podeAlternarStatus = canToggleStatusUser(gestorLogado.role, u);
                        const isMaster = u.role === 'master';

                        return (
                          <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5">
                              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                {isMaster && <Shield size={13} className="text-purple-600 shrink-0" />}
                                <span>{u.nome_completo || u.nome}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">
                                CPF: {u.cpf || 'Não informado'}
                              </span>
                            </td>

                            <td className="p-3.5">
                              <span className="font-mono text-slate-700 font-medium block">
                                {u.email_login || u.email}
                              </span>
                              {u.email_contato && u.email_contato !== (u.email_login || u.email) && (
                                <span className="text-[10px] text-slate-400 block">
                                  Pessoal: {u.email_contato}
                                </span>
                              )}
                            </td>

                            <td className="p-3.5">
                              <span
                                className={`px-2.5 py-1 rounded-full font-bold border text-[11px] ${ROLE_BADGE_COLORS[u.role].bg} ${ROLE_BADGE_COLORS[u.role].text} ${ROLE_BADGE_COLORS[u.role].border}`}
                              >
                                {ROLE_LABELS[u.role]}
                              </span>
                            </td>

                            <td className="p-3.5 text-slate-600">
                              <span className="font-medium text-slate-800 block">
                                {u.criado_por_nome || 'Sistema'}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {u.criado_em ? new Date(u.criado_em).toLocaleDateString('pt-BR') : 'Data não registrada'}
                              </span>
                            </td>

                            <td className="p-3.5 text-center">
                              {u.ativo !== false ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  <Check size={11} /> Ativo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-300">
                                  <Ban size={11} /> Inativo
                                </span>
                              )}
                            </td>

                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isMaster && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200 flex items-center gap-1">
                                    <Lock size={11} />
                                    Master Protegido
                                  </span>
                                )}

                                {!isMaster && !podeEditar && !podeExcluir && !podeAlternarStatus && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1">
                                    <Lock size={11} />
                                    Restrito
                                  </span>
                                )}

                                {/* Editar Acesso / Redefinir Senha (Lápis) */}
                                {podeEditar && (
                                  <button
                                    type="button"
                                    onClick={() => handleAbrirModalRedefinirSenha(u)}
                                    className="p-1.5 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 hover:text-amber-800 transition-colors border border-amber-200 cursor-pointer"
                                    title="Editar Acesso e Redefinir Senha"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                )}

                                {/* Alternar Status (Ativar/Inativar) */}
                                {podeAlternarStatus && (
                                  <button
                                    type="button"
                                    onClick={() => handleAlternarStatus(u)}
                                    className={`p-1.5 rounded-lg transition-colors border cursor-pointer ${
                                      u.ativo !== false
                                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                    }`}
                                    title={u.ativo !== false ? 'Inativar Usuário' : 'Ativar Usuário'}
                                  >
                                    <Power size={13} />
                                  </button>
                                )}

                                {/* Excluir Usuário */}
                                {podeExcluir && (
                                  <button
                                    type="button"
                                    onClick={() => handleExcluirUsuario(u)}
                                    className="p-1.5 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors border border-slate-200 cursor-pointer bg-white"
                                    title="Excluir Colaborador"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
          <span>Sistema Corporativo Marks Systems • Módulo de Governança e RBAC</span>
          <button
            type="button"
            onClick={onFechar}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition-colors cursor-pointer border-0"
          >
            Fechar Janela
          </button>
        </div>
      </motion.div>

      {/* ============================================================
          MODAL DE CONFIRMAÇÃO DE SUCESSO & DISPARO WHATSAPP PÓS-CADASTRO
         ============================================================ */}
      <AnimatePresence>
        {resumoCredenciais && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 sm:p-7 border border-slate-100 text-slate-900 relative"
            >
              {/* Badge visual positivo */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm shrink-0">
                  <CheckCircle2 size={26} />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Registro Concluído
                  </span>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight mt-0.5">
                    Colaborador Cadastrado!
                  </h3>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                A conta foi provisionada no <strong>Supabase Auth</strong> e vinculada à tabela de perfis com auditoria. Envie as credenciais de acesso diretamente para o WhatsApp ou E-mail institucional do colaborador:
              </p>

              {/* Resumo das Credenciais Criadas */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 text-xs font-medium mb-5">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Nome Completo</span>
                  <span className="text-slate-900 font-bold text-sm">{resumoCredenciais.nome}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Login Institucional Gerado</span>
                  <span className="font-mono font-bold text-indigo-950 select-all block bg-white p-2 rounded-lg border border-slate-200">
                    {resumoCredenciais.login}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Senha Inicial Alfanumérica (8 dígitos)</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm tracking-wider select-all block bg-white p-2 rounded-lg border border-slate-200">
                    {resumoCredenciais.senhaInicial}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">E-mail de Contato Cadastrado</span>
                  <span className="font-mono text-slate-800 font-semibold select-all block bg-white p-2 rounded-lg border border-slate-200">
                    {resumoCredenciais.emailContato || 'Não informado'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Telefone Cadastrado</span>
                  <span className="font-mono text-slate-700 font-semibold">
                    {resumoCredenciais.telefone || 'Não informado'}
                  </span>
                </div>
              </div>

              {/* Feedback visual de envio de E-mail */}
              {statusEnvioEmail && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium mb-4 flex items-start gap-2 border ${
                    statusEnvioEmail.tipo === 'sucesso'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : statusEnvioEmail.tipo === 'info'
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  <Info size={16} className="shrink-0 mt-0.5" />
                  <span>{statusEnvioEmail.texto}</span>
                </div>
              )}

              {/* Ações de Disparo WhatsApp, E-mail e Auxiliares */}
              <div className="flex flex-col gap-2">
                {/* Botão em destaque verde WhatsApp */}
                <button
                  type="button"
                  onClick={handleEnviarWhatsApp}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-emerald-200 cursor-pointer border-0 flex items-center justify-center gap-2"
                  title="Abrir WhatsApp com mensagem oficial preenchida"
                >
                  <MessageSquare size={16} />
                  Enviar Credenciais via WhatsApp
                </button>

                {/* Botão em destaque azul/índigo E-mail */}
                <button
                  type="button"
                  onClick={handleEnviarEmail}
                  disabled={enviandoEmail}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-indigo-200 cursor-pointer border-0 flex items-center justify-center gap-2"
                  title="Enviar Acesso por E-mail"
                >
                  {enviandoEmail ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Enviando E-mail...</span>
                    </>
                  ) : (
                    <>
                      <Mail size={16} />
                      <span>Enviar Acesso por E-mail</span>
                    </>
                  )}
                </button>

                {/* Botão Secundário: Copiar Dados */}
                <button
                  type="button"
                  onClick={handleCopiarCredenciaisResumo}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer border-0 flex items-center justify-center gap-2"
                >
                  {credenciaisCopiadas ? (
                    <>
                      <Check size={16} className="text-emerald-400" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copiar Dados
                    </>
                  )}
                </button>

                {/* Botão de Fechar e Limpar Formulário */}
                <button
                  type="button"
                  onClick={() => {
                    setResumoCredenciais(null);
                    setStatusEnvioEmail(null);
                    resetForm();
                  }}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border-0 mt-1"
                >
                  Fechar e Novo Cadastro
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================================
          MODAL SECUNDÁRIO: EDITAR ACESSO / REDEFINIR SENHA
         ============================================================ */}
      <AnimatePresence>
        {usuarioEmEdicao && (
          <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 sm:p-7 border border-slate-100 text-slate-900 relative"
            >
              {/* Botão de Fechar no canto superior */}
              <button
                type="button"
                onClick={handleFecharModalRedefinirSenha}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors border-0 cursor-pointer"
                title="Fechar"
              >
                <X size={18} />
              </button>

              {!sucessoRedefinicao ? (
                <div>
                  {/* Cabeçalho do Modal de Edição */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-sm shrink-0">
                      <KeyRound size={24} />
                    </div>
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
                        Governança & Acesso
                      </span>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight mt-0.5">
                        Editar Acesso / Redefinir Senha
                      </h3>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Atualize a senha de acesso institucional do colaborador. Esta ação será auditada e vinculada ao seu usuário.
                  </p>

                  {/* 1. Informações do Usuário (Somente Leitura) */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs font-medium mb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Colaborador</span>
                        <span className="text-slate-900 font-bold text-sm">
                          {usuarioEmEdicao.nome_completo || usuarioEmEdicao.nome}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold border text-[10px] ${ROLE_BADGE_COLORS[usuarioEmEdicao.role].bg} ${ROLE_BADGE_COLORS[usuarioEmEdicao.role].text} ${ROLE_BADGE_COLORS[usuarioEmEdicao.role].border}`}
                      >
                        {ROLE_LABELS[usuarioEmEdicao.role]}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Login Institucional</span>
                      <span className="font-mono text-slate-800 font-bold select-all">
                        {usuarioEmEdicao.email_login || usuarioEmEdicao.email}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/70 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Telefone</span>
                        <span className="font-mono text-slate-700 font-semibold">
                          {usuarioEmEdicao.telefone || 'Não informado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">E-mail Contato</span>
                        <span className="font-mono text-slate-700 font-semibold truncate block" title={usuarioEmEdicao.email_contato}>
                          {usuarioEmEdicao.email_contato || 'Não informado'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Campo de Nova Senha */}
                  <form onSubmit={handleSalvarNovaSenha} className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Lock size={13} className="text-indigo-600" />
                          Nova Senha de Acesso
                        </label>
                        <button
                          type="button"
                          onClick={handleGerarNovaSenhaEdicao}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer border-0 bg-transparent"
                          title="Gerar 8 caracteres alfanuméricos aleatórios"
                        >
                          <RefreshCw size={11} />
                          Gerar Aleatória
                        </button>
                      </div>

                      <div className="relative">
                        <input
                          type={mostrarNovaSenhaEdicao ? 'text' : 'password'}
                          value={novaSenhaEdicao}
                          onChange={(e) => setNovaSenhaEdicao(e.target.value)}
                          placeholder="Digite ou gere a nova senha"
                          minLength={8}
                          required
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setMostrarNovaSenhaEdicao(!mostrarNovaSenhaEdicao)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 border-0 bg-transparent cursor-pointer p-1"
                        >
                          {mostrarNovaSenhaEdicao ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Mínimo de 8 caracteres alfanuméricos recomendados.
                      </span>
                    </div>

                    {erroRedefinicao && (
                      <div className="p-3 rounded-xl text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 flex items-start gap-2">
                        <AlertCircle size={15} className="shrink-0 mt-0.5" />
                        <span>{erroRedefinicao}</span>
                      </div>
                    )}

                    {/* Botões de Ação */}
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleFecharModalRedefinirSenha}
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border-0"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={salvandoNovaSenha}
                        className="flex-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-75 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-indigo-200 cursor-pointer border-0 flex items-center justify-center gap-1.5"
                      >
                        {salvandoNovaSenha ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={14} />
                            Salvar e Atualizar Senha
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                /* ============================================================
                   TELA DE SUCESSO & DISPARO DAS NOVAS CREDENCIAIS
                   ============================================================ */
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm shrink-0">
                      <CheckCircle2 size={26} />
                    </div>
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Senha Atualizada com Sucesso!
                      </span>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight mt-0.5">
                        Acesso Redefinido
                      </h3>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    A nova credencial foi gravada no sistema. Envie os novos dados de acesso diretamente para o colaborador:
                  </p>

                  {/* Resumo da nova credencial */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs font-medium mb-4">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Colaborador</span>
                      <span className="text-slate-900 font-bold text-sm">
                        {usuarioEmEdicao.nome_completo || usuarioEmEdicao.nome}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Login Institucional</span>
                      <span className="font-mono font-bold text-slate-900 select-all block bg-white p-2 rounded-lg border border-slate-200">
                        {usuarioEmEdicao.email_login || usuarioEmEdicao.email}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Nova Senha de Acesso</span>
                      <span className="font-mono font-bold text-emerald-700 text-sm tracking-wider select-all block bg-white p-2 rounded-lg border border-slate-200">
                        {novaSenhaEdicao}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/70 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Telefone</span>
                        <span className="font-mono text-slate-700 font-semibold">
                          {usuarioEmEdicao.telefone || 'Não informado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">E-mail Contato</span>
                        <span className="font-mono text-slate-700 font-semibold truncate block" title={usuarioEmEdicao.email_contato}>
                          {usuarioEmEdicao.email_contato || 'Não informado'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Feedback visual de envio de E-mail de Redefinição */}
                  {statusEnvioRedefinicao && (
                    <div
                      className={`p-3 rounded-xl text-xs font-medium mb-4 flex items-start gap-2 border ${
                        statusEnvioRedefinicao.tipo === 'sucesso'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : statusEnvioRedefinicao.tipo === 'info'
                          ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      <Info size={16} className="shrink-0 mt-0.5" />
                      <span>{statusEnvioRedefinicao.texto}</span>
                    </div>
                  )}

                  {/* Opções de Disparo */}
                  <div className="flex flex-col gap-2">
                    {/* Botão WhatsApp */}
                    <button
                      type="button"
                      onClick={handleEnviarWhatsAppRedefinicao}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-emerald-200 cursor-pointer border-0 flex items-center justify-center gap-2"
                      title="Abrir WhatsApp com mensagem de redefinição de senha preenchida"
                    >
                      <MessageSquare size={16} />
                      Enviar Nova Senha via WhatsApp
                    </button>

                    {/* Botão E-mail */}
                    <button
                      type="button"
                      onClick={handleEnviarEmailRedefinicao}
                      disabled={enviandoEmailRedefinicao}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-indigo-200 cursor-pointer border-0 flex items-center justify-center gap-2"
                      title="Enviar Nova Senha por E-mail"
                    >
                      {enviandoEmailRedefinicao ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>Enviando E-mail...</span>
                        </>
                      ) : (
                        <>
                          <Mail size={16} />
                          <span>Enviar Nova Senha por E-mail</span>
                        </>
                      )}
                    </button>

                    {/* Botão Copiar Dados */}
                    <button
                      type="button"
                      onClick={handleCopiarDadosRedefinicao}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer border-0 flex items-center justify-center gap-2"
                    >
                      {dadosRedefinicaoCopiados ? (
                        <>
                          <Check size={16} className="text-emerald-400" />
                          Copiado!
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          Copiar Dados
                        </>
                      )}
                    </button>

                    {/* Botão Concluir e Fechar */}
                    <button
                      type="button"
                      onClick={handleFecharModalRedefinirSenha}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border-0 mt-1"
                    >
                      Concluir e Fechar
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
