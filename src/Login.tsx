import React, { useState } from 'react';
import { Shield, Eye, EyeOff, Users, ArrowLeft, AlertCircle, LogIn } from 'lucide-react';
import { autenticarUsuario } from './lib/authStorage';
import { hasModuleAccess, ROLE_LABELS } from './types/auth';
import GerenciadorUsuariosModal from './components/GerenciadorUsuariosModal';
import { supabase } from './lib/supabase';

interface LoginProps {
  modulo: 'CRVA' | 'PDV' | 'CRM';
  onVoltar: () => void;
  onLoginSucesso: (user: any) => void;
}

export default function Login({ modulo, onVoltar, onLoginSucesso }: LoginProps) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [modalUsuariosAberto, setModalUsuariosAberto] = useState(false);

  const rotuloModulo =
    modulo === 'CRVA'
      ? 'Atendimento Balcão (Integra CRVA)'
      : modulo === 'PDV'
      ? 'Frente de Caixa (Integra PDV)'
      : 'CRM-Integra (Triagem IA & WhatsApp)';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    const emailLimpo = email.trim().toLowerCase();
    const senhaLimpa = senha.trim();

    if (!emailLimpo || !senhaLimpa) {
      setErro('Por favor, preencha todos os campos.');
      return;
    }

    setCarregando(true);

    try {
      let usuarioAutenticado: any = null;

      // 1. Autenticação primária oficial via Supabase Auth
      if (supabase && supabase.auth) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailLimpo,
          password: senhaLimpa,
        });

        if (error) {
          console.error('[Supabase Auth Error]:', error.message, error);
        } else if (data?.user) {
          let role: any = data.user.user_metadata?.role || 'atendente';
          let nomeCompleto =
            data.user.user_metadata?.nome_completo ||
            data.user.user_metadata?.full_name ||
            emailLimpo.split('@')[0];

          try {
            const { data: perfil, error: errPerfil } = await supabase
              .from('perfis')
              .select('*')
              .eq('id', data.user.id)
              .maybeSingle();

            if (errPerfil) {
              console.warn('[Login] Consulta de perfil por ID:', errPerfil.message);
            }

            if (perfil) {
              role = perfil.role || role;
              nomeCompleto = perfil.nome_completo || nomeCompleto;
            } else {
              const { data: perfilEmail } = await supabase
                .from('perfis')
                .select('*')
                .ilike('email_login', emailLimpo)
                .maybeSingle();

              if (perfilEmail) {
                role = perfilEmail.role || role;
                nomeCompleto = perfilEmail.nome_completo || nomeCompleto;
              }
            }
          } catch (pErr) {
            console.warn('[Login] Exceção ao consultar tabela perfis:', pErr);
          }

          usuarioAutenticado = {
            id: data.user.id,
            nome: nomeCompleto,
            email: emailLimpo,
            role,
            funcao: ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role,
          };
        }
      }

      // 2. Fallback resiliente na base unificada local
      if (!usuarioAutenticado) {
        const local = autenticarUsuario(emailLimpo, senhaLimpa);
        if (local) {
          console.info('[Login] Autenticado com sucesso via base unificada local:', emailLimpo);
          usuarioAutenticado = {
            id: local.id,
            nome: local.nome || local.nome_completo,
            email: local.email || local.email_login,
            role: local.role,
            funcao: ROLE_LABELS[local.role] || local.role,
          };
        }
      }

      if (!usuarioAutenticado) {
        setErro('Credenciais inválidas. Verifique seu e-mail institucional e senha.');
        setCarregando(false);
        return;
      }

      // 3. Validação de Permissão de Acesso ao Módulo Solicitado
      const permissao = hasModuleAccess(usuarioAutenticado.role, modulo);
      if (!permissao.permitido) {
        setErro(
          permissao.motivo ||
            `Acesso Negado: O perfil '${ROLE_LABELS[usuarioAutenticado.role as keyof typeof ROLE_LABELS]}' não tem acesso a este módulo.`
        );
        setCarregando(false);
        return;
      }

      // 4. Salva na sessão e libera navegação
      sessionStorage.setItem('integra_usuario', JSON.stringify(usuarioAutenticado));
      sessionStorage.setItem('user', JSON.stringify(usuarioAutenticado));
      localStorage.setItem('user', JSON.stringify(usuarioAutenticado));

      onLoginSucesso(usuarioAutenticado);
    } catch (err: any) {
      console.error('[Login] Erro durante o fluxo de autenticação:', err);
      setErro(err.message || 'Erro durante a autenticação.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0F19] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans select-none">
      {/* Efeito de Iluminação de Fundo Dark Mode */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Navegação de Topo (Voltar) */}
      <button
        type="button"
        onClick={onVoltar}
        className="absolute top-6 left-6 z-20 flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors py-2 px-3 rounded-lg hover:bg-slate-900/60 cursor-pointer border border-transparent hover:border-slate-800"
      >
        <ArrowLeft size={15} />
        <span>Voltar ao Gateway</span>
      </button>

      {/* Card de Login Corporativo */}
      <div className="w-full max-w-md p-8 bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-2xl relative z-10">
        {/* Bloco de Marca e Identidade */}
        <div className="text-center mb-6">
          <img
            src="/logo-marks.png"
            alt="Marks Systems"
            className="w-16 h-16 mx-auto mb-4 object-contain drop-shadow-md"
          />
          <h1 className="text-xl font-bold tracking-tight text-slate-100">
            MARKS SYSTEMS
          </h1>
          <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mt-0.5">
            AUTENTICAÇÃO CORPORATIVA
          </p>

          {/* Badge do Módulo Ativo */}
          <div className="mt-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
              Módulo: {rotuloModulo}
            </span>
          </div>
        </div>

        {/* Alerta de Erro */}
        {erro && (
          <div className="mb-5 p-3.5 bg-red-950/40 border border-red-500/40 text-red-300 text-xs rounded-xl font-medium flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
            <span className="leading-relaxed">{erro}</span>
          </div>
        )}

        {/* Formulário de Acesso */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase mb-1.5 block">
              E-mail de Acesso
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@crva.com.br"
              required
              className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase block">
                Senha Corporativa
              </label>
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                className="text-slate-400 hover:text-slate-200 transition-colors text-xs flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0"
                title={mostrarSenha ? 'Ocultar senha' : 'Ver senha'}
              >
                {mostrarSenha ? <EyeOff size={14} /> : <Eye size={14} />}
                <span className="text-[10px]">{mostrarSenha ? 'Ocultar' : 'Visualizar'}</span>
              </button>
            </div>
            <div className="relative flex items-center">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all pr-10"
              />
            </div>
          </div>

          {/* Botão Primário */}
          <button
            type="submit"
            disabled={carregando}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-emerald-900/20 transition-all duration-200 mt-2 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <LogIn size={16} />
            <span>{carregando ? 'Verificando acessos...' : 'Acessar Sistema'}</span>
          </button>
        </form>

        {/* Divisória e Acesso Administrativo */}
        <div className="border-t border-slate-800/80 my-6" />

        <button
          type="button"
          onClick={() => setModalUsuariosAberto(true)}
          className="w-full py-2 px-3 border border-slate-700/70 hover:bg-slate-800/50 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer bg-transparent"
        >
          <Shield size={14} className="text-indigo-400" />
          <Users size={14} className="text-slate-400" />
          <span>Gerenciar Usuários e Acessos</span>
        </button>

        <p className="text-[11px] text-center text-slate-400 mt-4 block">
          Gestão permitida para perfis Master, Gerente e Financeiro.
        </p>
      </div>

      {/* Modal de Gestão de Usuários e Acessos */}
      <GerenciadorUsuariosModal
        aberto={modalUsuariosAberto}
        onFechar={() => setModalUsuariosAberto(false)}
      />
    </div>
  );
}
