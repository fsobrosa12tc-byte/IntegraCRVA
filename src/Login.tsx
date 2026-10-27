import React, { useState } from 'react';
import { Shield, Eye, EyeOff, Lock, Users, ArrowLeft, AlertCircle } from 'lucide-react';
import { autenticarUsuario } from './lib/authStorage';
import { hasModuleAccess, ROLE_LABELS } from './types/auth';
import GerenciadorUsuariosModal from './components/GerenciadorUsuariosModal';
import { supabase } from './lib/supabase';

interface LoginProps {
  modulo: 'CRVA' | 'PDV';
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
          password: senhaLimpa
        });

        if (error) {
          // Log detalhado e diagnóstico da mensagem exata do Supabase no console
          console.error('[Supabase Auth Error]:', error.message, error);
        } else if (data?.user) {
          // 2. Consulta à role e perfil na tabela public.perfis
          let role: any = (data.user.user_metadata?.role) || 'atendente';
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
              // Tenta por email_login caso o ID tenha sido gerado em momento anterior
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
            funcao: ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role
          };
        }
      }

      // 3. Fallback resiliente na base unificada local
      if (!usuarioAutenticado) {
        const local = autenticarUsuario(emailLimpo, senhaLimpa);
        if (local) {
          console.info('[Login] Autenticado com sucesso via base unificada local:', emailLimpo);
          usuarioAutenticado = {
            id: local.id,
            nome: local.nome || local.nome_completo,
            email: local.email || local.email_login,
            role: local.role,
            funcao: ROLE_LABELS[local.role] || local.role
          };
        }
      }

      if (!usuarioAutenticado) {
        setErro('Credenciais inválidas. Verifique seu e-mail institucional e senha.');
        setCarregando(false);
        return;
      }

      // 4. Validação de Permissão de Acesso ao Módulo Solicitado
      // CRVA: Atendente, Master, Gerente, Financeiro | PDV: Caixa, Master, Gerente, Financeiro
      const permissao = hasModuleAccess(usuarioAutenticado.role, modulo);
      if (!permissao.permitido) {
        setErro(permissao.motivo || `Acesso Negado: O perfil '${ROLE_LABELS[usuarioAutenticado.role as keyof typeof ROLE_LABELS]}' não tem acesso a este módulo.`);
        setCarregando(false);
        return;
      }

      // 5. Salva na sessão e libera navegação direta para o módulo correspondente
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 relative font-sans">
      <button
        onClick={onVoltar}
        className="absolute top-6 left-6 text-sm text-slate-500 hover:text-slate-900 bg-transparent border-0 cursor-pointer font-medium transition-colors flex items-center gap-2"
      >
        <ArrowLeft size={16} />
        Voltar ao Gateway
      </button>

      <div
        className="w-full max-w-md bg-white p-8 sm:p-10 rounded-2xl border border-slate-100 shadow-xl"
        style={{ boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}
      >
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-md">
            <Lock size={22} />
          </div>
        </div>

        <h2 className="text-2xl font-black text-center text-slate-900 mb-1 tracking-tight">
          AUTENTICAÇÃO CORPORATIVA
        </h2>
        <p className="text-sm text-center text-slate-500 mb-6">
          Módulo:{' '}
          <span className="font-bold text-slate-900">
            {modulo === 'CRVA' ? 'Atendimento Balcão (Integra CRVA)' : 'Frente de Caixa (Integra PDV)'}
          </span>
        </p>

        {erro && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl font-medium flex items-start gap-3">
            <AlertCircle size={20} className="shrink-0 mt-0.5 text-red-600" />
            <div>{erro}</div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              E-mail de Acesso
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all text-slate-900 text-sm"
              placeholder="seu.email@crva.com.br"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
              Senha Corporativa
            </label>
            <div className="relative flex items-center">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all text-slate-900 text-sm pr-12"
                placeholder="********"
                required
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                className="absolute right-3.5 bg-transparent border-0 cursor-pointer text-slate-400 hover:text-slate-700 transition-colors p-1"
                title={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full py-4 mt-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed font-bold text-sm cursor-pointer border-0"
          >
            {carregando ? 'Verificando Perfil e Acessos...' : 'Acessar Sistema'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => setModalUsuariosAberto(true)}
            className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-200 flex items-center justify-center gap-2"
          >
            <Shield size={16} className="text-blue-600" />
            <Users size={16} className="text-slate-600" />
            Gerenciar Usuários e Acessos
          </button>

          <p className="text-[11px] text-slate-400 text-center">
            Gestão permitida para perfis Master, Gerente e Financeiro.
          </p>
        </div>
      </div>

      {/* Modal de Gestão de Usuários e Acessos */}
      <GerenciadorUsuariosModal
        aberto={modalUsuariosAberto}
        onFechar={() => setModalUsuariosAberto(false)}
      />
    </div>
  );
}