import React, { useState } from 'react';

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
  const [mostrarSenha, setMostrarSenha] = useState(false); // Estado do Olhinho

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    const emailLimpo = email.trim();
    const senhaLimpa = senha.trim();

    if (!emailLimpo || !senhaLimpa) {
      setErro('Por favor, preencha todos os campos.');
      return;
    }

    setCarregando(true);

    // CONTINGÊNCIA CORPORATIVA BLINDADA CONTRA TRAVAMENTOS DO IDE
    setTimeout(() => {
      setCarregando(false);

      // 1. Conta Oficial Master de Testes
      if (emailLimpo === 'fsobrosa.12tc@gmail.com' && senhaLimpa === 'Antonio2@26') {
        const usuarioMaster = {
          id: '1',
          nome: 'Antonio Sobrosa',
          email: emailLimpo,
          funcao: 'Master'
        };

        // Salva na sessão para persistência após F5
        sessionStorage.setItem('user', JSON.stringify(usuarioMaster));
        onLoginSucesso(usuarioMaster);
        window.location.href = "/"; // Força o reload para limpar o cache do React
        return;
      }

      // 2. REGRA DE SEGURANÇA: Simulação de usuário sem permissão (ex: Operador Comum)
      if (emailLimpo.includes('comum') || senhaLimpa === '123456') {
        setErro('Acesso Negado: Seu perfil corporativo não possui permissão para o Módulo Balcão CRVA.');
        return;
      }

      // 3. Se não cair em nenhuma das opções acima (Usuário não cadastrado)
      setErro('Usuário ou senha inválidos no sistema unificado.');
    }, 800);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4" style={{ fontFamily: 'sans-serif' }}>
      <button onClick={onVoltar} className="absolute top-6 left-6 text-sm text-slate-500 hover:text-slate-900 bg-transparent border-0 cursor-pointer font-medium transition-colors">
        ← Voltar ao Gateway
      </button>

      <div className="w-full max-w-md bg-white p-10 rounded-2xl border border-slate-100 shadow-xl" style={{ boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
        <h2 className="text-2xl font-black text-center text-slate-900 mb-1 tracking-tight" style={{ fontSize: '24px', textAlign: 'center', marginBottom: '8px', color: '#0f172a' }}>AUTENTICAÇÃO CORPORATIVA</h2>
        <p className="text-sm text-center text-slate-500 mb-8" style={{ textAlign: 'center', color: '#64748b', marginBottom: '32px' }}>
          Módulo: <span className="font-bold text-slate-900" style={{ color: '#0f172a', fontWeight: 'bold' }}>{modulo === 'CRVA' ? 'Atendimento Balcão (Integra CRVA)' : 'PDV (Integra PDV)'}</span>
        </p>

        {erro && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg font-medium" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #fecaca', fontSize: '14px' }}>
            {erro}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', letterSpacing: '0.025em' }}>E-mail de Acesso</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all text-slate-900"
              style={{ width: '100%', padding: '14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box', outline: 'none' }}
              placeholder="seu.email@provedor.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', letterSpacing: '0.025em' }}>Senha Corporativa</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all text-slate-900"
                style={{ width: '100%', padding: '14px', paddingRight: '45px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box', outline: 'none' }}
                placeholder="********"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                style={{ position: 'absolute', right: '14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}
                title={mostrarSenha ? "Esconder senha" : "Mostrar senha"}
              >
                {mostrarSenha ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full p-4 mt-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors shadow-md disabled:opacity-70 disabled:cursor-not-allowed font-bold"
            style={{ width: '100%', padding: '16px', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
          >
            {carregando ? 'Verificando Perfil...' : 'Acessar Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
}