import React, { useState, useEffect } from 'react';
import Gateway from './Gateway';
import Login from './Login';
import ModuloCRVA from './ModuloCRVA';
import ModuloPDV from './ModuloPDV';

// Supabase client importado com segurança
import { supabase } from './lib/supabase';

type AppState = 'gateway' | 'login' | 'crva' | 'pdv';

class SimpleErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    const self = this as any;
    if (self.state.hasError) {
      return (
        <div className="p-4 m-4 bg-red-50 border border-red-200 rounded-lg">
          <h2 className="text-red-600 font-bold mb-2">Erro ao carregar o módulo</h2>
          <pre className="text-xs text-red-500 overflow-auto">{self.state.error?.toString()}</pre>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded font-medium cursor-pointer"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return self.props.children;
  }
}

export default function App() {
  const [currentView, setCurrentView] = useState<AppState>('gateway');
  const [selectedModule, setSelectedModule] = useState<'crva' | 'pdv' | null>(null);
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);

  useEffect(() => {
    document.title = 'Integra CRVA';
  }, [currentView]);

  useEffect(() => {
    try {
      const storedUser = sessionStorage.getItem('integra_usuario') || 
                         localStorage.getItem('integra_usuario') ||
                         sessionStorage.getItem('user') || 
                         localStorage.getItem('user');
      const storedModule = (sessionStorage.getItem('integra_module') || localStorage.getItem('integra_module')) as 'crva' | 'pdv' | null;
      
      if (storedUser && storedModule) {
        setUsuarioLogado(JSON.parse(storedUser));
        setSelectedModule(storedModule);
        setCurrentView(storedModule);
      }
    } catch (err) {
      console.error('Falha ao restaurar sessão:', err);
      setCurrentView('gateway');
      sessionStorage.clear();
      localStorage.clear();
    }
  }, []);

  const handleSelectModule = (modulo: 'crva' | 'pdv') => {
    setSelectedModule(modulo);
    setCurrentView('login');
  };

  const handleBackToGateway = () => {
    setSelectedModule(null);
    setCurrentView('gateway');
  };

  const handleSwitchModule = (modulo: 'crva' | 'pdv') => {
    setSelectedModule(modulo);
    sessionStorage.setItem('integra_module', modulo);
    localStorage.setItem('integra_module', modulo);
    setCurrentView(modulo);
  };

  // Troca Rápida de Operador: o novo operador passa a ser o usuário da sessão
  const handleUsuarioAlterado = (usuario: any) => {
    setUsuarioLogado(usuario);
    const serializado = JSON.stringify(usuario);
    sessionStorage.setItem('integra_usuario', serializado);
    sessionStorage.setItem('user', serializado);
    sessionStorage.setItem('session', serializado);
    localStorage.setItem('integra_usuario', serializado);
    localStorage.setItem('user', serializado);
    localStorage.setItem('session', serializado);
  };

  const handleLoginSuccess = (usuario: any) => {
    setUsuarioLogado(usuario);
    
    // Salva o usuario nas chaves oficiais
    sessionStorage.setItem('integra_usuario', JSON.stringify(usuario));
    sessionStorage.setItem('integra_module', selectedModule!);
    localStorage.setItem('integra_usuario', JSON.stringify(usuario));
    localStorage.setItem('integra_module', selectedModule!);
    
    // Chaves de compatibilidade legado que o CRVA antigo / Supabase Auth possam ler
    sessionStorage.setItem('user', JSON.stringify(usuario));
    sessionStorage.setItem('session', JSON.stringify(usuario));
    localStorage.setItem('user', JSON.stringify(usuario));
    localStorage.setItem('session', JSON.stringify(usuario));

    // Mock completo de sessão do Supabase (OAuth Google)
    const supabaseSessionMock = {
      access_token: "mock-access-token",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "mock-refresh-token",
      user: {
        id: usuario.id,
        aud: "authenticated",
        role: "authenticated",
        email: usuario.email,
        email_confirmed_at: new Date().toISOString(),
        phone: "",
        confirmed_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        app_metadata: {
          provider: "google",
          providers: ["google"]
        },
        user_metadata: {
          avatar_url: "",
          email: usuario.email,
          email_verified: true,
          full_name: usuario.nome,
          iss: "https://accounts.google.com",
          name: usuario.nome,
          phone_verified: false,
          picture: "",
          provider_id: "123456789",
          sub: "123456789"
        }
      }
    };
    
    const mockString = JSON.stringify(supabaseSessionMock);
    localStorage.setItem('sb-fuopvnzmpsgmidaooxug-auth-token', mockString);
    sessionStorage.setItem('sb-fuopvnzmpsgmidaooxug-auth-token', mockString);
    
    setCurrentView(selectedModule!);
  };

  const handleLogout = async () => {
    setUsuarioLogado(null);
    setSelectedModule(null);
    setCurrentView('gateway');
    
    sessionStorage.removeItem('integra_usuario');
    sessionStorage.removeItem('integra_module');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('session');
    sessionStorage.removeItem('sb-fuopvnzmpsgmidaooxug-auth-token');
    
    localStorage.removeItem('integra_usuario');
    localStorage.removeItem('integra_module');
    localStorage.removeItem('user');
    localStorage.removeItem('session');
    localStorage.removeItem('sb-fuopvnzmpsgmidaooxug-auth-token');
    
    try {
      if (supabase && supabase.auth) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.warn("Erro ao fazer sign out do supabase:", e);
    }
    
    window.location.href = "/";
  };

  // Garante que o usuarioLogado seja fornecido ou lido diretamente do storage se necessário
  const usuarioSafe = usuarioLogado || (() => {
    try {
      const stor = sessionStorage.getItem('integra_usuario') || 
                   sessionStorage.getItem('user') || 
                   localStorage.getItem('user');
      return stor ? JSON.parse(stor) : null;
    } catch { return null; }
  })();

  return (
    <>
      {currentView === 'gateway' && <Gateway onSelectModule={handleSelectModule} />}
      
      {currentView === 'login' && selectedModule && (
        <Login 
          modulo={selectedModule === 'crva' ? 'CRVA' : 'PDV'}
          onVoltar={handleBackToGateway}
          onLoginSucesso={handleLoginSuccess}
        />
      )}

      {currentView === 'crva' && (
        <SimpleErrorBoundary>
          <ModuloCRVA 
            usuario={usuarioSafe} 
            onLogout={handleLogout}
            onSwitchModule={handleSwitchModule}
            onVoltarGateway={handleBackToGateway}
          />
        </SimpleErrorBoundary>
      )}

      {currentView === 'pdv' && (
        <SimpleErrorBoundary>
          <ModuloPDV 
            usuario={usuarioSafe} 
            onLogout={handleLogout}
            onSwitchModule={handleSwitchModule}
            onVoltarGateway={handleBackToGateway}
            onUsuarioAlterado={handleUsuarioAlterado}
          />
        </SimpleErrorBoundary>
      )}
    </>
  );
}
