import React, { useState, useEffect } from 'react';
import { Shield, Car, User, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Configuração da API para Produção (Render/Railway/Netlify/Vercel)
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

// Importação da Logo Oficial
const logoOficial = 'Logo Digital CRVA.jpg';

// Funções de validação (Espelhadas do backend para UX)
const validarChassi = (chassi: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(chassi.toUpperCase());
const validarPlaca = (placa: string) => {
  const p = placa.replace('-', '').toUpperCase();
  return /^[A-Z]{3}[0-9]{4}$/.test(p) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p);
};

// Lista Exaustiva de Serviços Detran-RS
const SERVICOS = [
  "2ª via do CRV",
  "Impressão do CRLVe",
  "Emissão de Certidão",
  "Cópia de documentos",
  "Licença Especial de Trânsito",
  "Alteração de Informações do Proprietário / Veículo",
  "Inclusão/Alteração/Liberação de Restrição Financeira",
  "Inclusão/Liberação de Averbação de Execução",
  "Restrição por Transferência",
  "Placa de Experiência - Inclusão",
  "Placa de Experiência - Renovação",
  "Placa de Experiência - Baixa",
  "Baixa de Veículo - Outra UF",
  "Baixa de Veículo - Simples",
  "Baixa de Veículo - Militarização",
  "Baixa de Veículo - Outro País",
  "Cancelamento de Processo",
  "Comunicação de Venda",
  "Correção de CRLV-e",
  "Correção de Chassi",
  "Correção de Proprietário",
  "Correção de Veículo",
  "Correção de Município",
  "Correção de Restrições",
  "Mudança para Placa Única / Mercosul",
  "Primeiro Emplacamento",
  "Reserva de Placa",
  "Autorização para Fabricação de Placas (Furto/Roubo)",
  "Autorização para Fabricação de Placas (Perda/Extravio)",
  "Autorização para Fabricação de Placas (Outros)",
  "Colocação de lacre em placa (Furto/Roubo)",
  "Colocação de lacre em placa (Perda/Extravio)",
  "Colocação de lacre em placa (Outros)",
  "Autorização: Alteração de Características",
  "Autorização: Regravação de Chassi/Motor",
  "Autorização: Transporte Escolar",
  "Solicitação de Vistoria",
  "Transferência de Propriedade (RS)",
  "Transferência de Propriedade (Outra UF)",
  "Troca de Município (RS)",
  "Troca de Município (Outra UF)"
];

const formatarCPF = (v: string) => {
  v = v.replace(/\D/g, '');
  if (v.length <= 11) {
    return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").substring(0, 14);
  }
  return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5").substring(0, 18);
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [isLocalAuthenticated, setIsLocalAuthenticated] = useState(() => {
    return localStorage.getItem('integra_crva_auth') === 'true';
  });
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [continuarLogado, setContinuarLogado] = useState(true);

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        
        // Garante que a aplicação permaneça na URL de origem correta
        // limpando os fragmentos de token da URL após o login bem-sucedido.
        if (_event === 'SIGNED_IN' && window.location.hash) {
          const hash = window.location.hash;
          if (hash.includes('access_token') || hash.includes('id_token') || hash.includes('error')) {
            window.history.replaceState(null, '', window.location.origin + window.location.pathname);
          }
        }
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  const isAuthenticated = !!session || isLocalAuthenticated;

  const [formData, setFormData] = useState({
    proprietario: { nome: '', cpfCnpj: '', endereco: '', telefone: '', email: '', autorizacao: 'NÃO' },
    veiculo: { placa: '', renavam: '', chassi: '', modelo: '', ano: new Date().getFullYear() },
    restricaoFinanceira: { havera: 'NÃO', modalidade: '', tipoCredor: '' },
    servico: SERVICOS[0]
  });

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLocalAuthenticated(true);
    localStorage.setItem('integra_crva_matricula', matricula);
    if (continuarLogado) {
      localStorage.setItem('integra_crva_auth', 'true');
    } else {
      localStorage.removeItem('integra_crva_auth');
    }
  };

  const handleGoogleLogin = async () => {
    if (supabase) {
      try {
        // Usa a propriedade dinâmica do navegador (window.location.origin) para
        // suportar tanto o ambiente de desenvolvimento local quanto a produção na Vercel
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin
          }
        });
      } catch (err: any) {
        alert('Erro ao tentar login com Google: ' + err.message);
      }
    } else {
      alert('Supabase não configurado.');
    }
  };

  const handleLogout = async () => {
    setIsLocalAuthenticated(false);
    localStorage.removeItem('integra_crva_auth');
    localStorage.removeItem('integra_crva_matricula');
    if (supabase) {
      await supabase.auth.signOut();
    }
    setMatricula('');
    setSenha('');
  };

  const clearForm = () => {
    setFormData({
      proprietario: { nome: '', cpfCnpj: '', endereco: '', telefone: '', email: '', autorizacao: 'NÃO' },
      veiculo: { placa: '', renavam: '', chassi: '', modelo: '', ano: new Date().getFullYear() },
      restricaoFinanceira: { havera: 'NÃO', modalidade: '', tipoCredor: '' },
      servico: SERVICOS[0]
    });
    setSearchTerm('');
    setShowDropdown(false);
    setError(null);
    setResult(null);
    setPdfUrl(null);
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = formatarCPF(e.target.value);
    setFormData({...formData, proprietario: {...formData.proprietario, cpfCnpj: masked}});
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredServicos = SERVICOS.filter(s => 
    s.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [result, setResult] = useState<{ id: number; hash: string; timestamp: number } | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validações básicas antes de enviar
    if (!validarChassi(formData.veiculo.chassi)) {
      setError('Chassi inválido (17 caracteres, sem I, O, Q)');
      setLoading(false);
      return;
    }
    if (!validarPlaca(formData.veiculo.placa)) {
      setError('Placa inválida (Formato AAA-1111 ou Mercosul)');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/gerar_pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || 'Falha ao gerar requerimento e PDF');
        } catch {
          throw new Error('Falha ao gerar requerimento e PDF (Erro no Servidor)');
        }
      }

      // Receber o arquivo PDF como blob binário
      const blob = await response.blob();
      const fileURL = URL.createObjectURL(blob);
      setPdfUrl(fileURL);

      // Abrir o PDF gerado em uma nova aba para visualização/impressão
      window.open(fileURL, '_blank');

      // Extrair metadados dos cabeçalhos da resposta expostos
      const id = Number(response.headers.get('x-requerimento-id')) || 0;
      const hash = response.headers.get('x-requerimento-hash') || '';
      const timestamp = Number(response.headers.get('x-requerimento-timestamp')) || Date.now();

      setResult({ id, hash, timestamp });
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const getUsuarioIdentificador = () => {
    if (session?.user) {
      return session.user.email || 'Usuário Google';
    }
    return localStorage.getItem('integra_crva_matricula') || matricula || 'Operador Local';
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans text-slate-900">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl border border-slate-200 shadow-xl"
        >
          <div className="text-center">
            <img 
              src={logoOficial} 
              alt="Digital CRVA Logo" 
              className="mx-auto h-20 w-auto object-contain mb-4"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
            <h2 className="text-2xl font-black text-[#2C3E50] tracking-tight">SISTEMA INTEGRA CRVA</h2>
            <p className="mt-2 text-sm text-slate-500 font-medium">
              Painel de Controle - Identificador Veicular (IVD)
            </p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleLoginSubmit}>
            <div className="rounded-md space-y-4">
              <div>
                <label className="form-label font-semibold text-slate-700">Matrícula / Usuário</label>
                <input
                  type="text"
                  required
                  className="form-control w-full"
                  placeholder="Ex: IVD-1892"
                  value={matricula}
                  onChange={(e) => setMatricula(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label font-semibold text-slate-700">Senha</label>
                <input
                  type="password"
                  required
                  className="form-control w-full"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-[#2C3E50] focus:ring-[#2C3E50] border-slate-300 rounded"
                  checked={continuarLogado}
                  onChange={(e) => setContinuarLogado(e.target.checked)}
                />
                <label htmlFor="remember-me" className="ms-2 block text-sm text-slate-700 font-medium cursor-pointer">
                  Continuar logado com o Google
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="submit"
                className="w-full btn btn-primary py-3 text-sm font-bold shadow-md hover:shadow-lg transition-all"
              >
                Entrar no Sistema
              </button>

              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-slate-200 rounded-lg bg-white text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-all"
                style={{ color: '#3c4043' }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.53-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-8.87z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.74-2.11-6.68-4.96H1.21v3.15C3.18 21.88 7.39 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.32 14.24A7.16 7.16 0 0 1 5 12c0-.79.13-1.57.32-2.34V6.51H1.21A11.94 11.94 0 0 0 0 12c0 1.92.45 3.74 1.21 5.39l4.11-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.39 0 3.18 2.12 1.21 5.39l4.11 3.15c.94-2.85 3.57-4.96 6.68-4.96z"
                  />
                </svg>
                Entrar com o Google
              </button>
            </div>
          </form>
          <div className="text-center text-xs text-slate-400 mt-4">
            <p>© 2026 Integra CRVA - Desenvolvido por Marks Systems Senac/RS para Detran/RS</p>
            <p>Em conformidade com a LGPD e Normas ISO 3779</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 font-sans text-slate-900">
      <div className="container max-w-4xl">
        <div className="flex justify-between items-center mb-6 bg-white p-3 rounded-lg border border-slate-200 shadow-sm no-print">
          <div className="flex items-center text-sm text-slate-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 me-2 animate-pulse"></span>
            Operador logado: <strong className="text-slate-800 ms-1">{getUsuarioIdentificador()}</strong>
          </div>
          <button 
            onClick={handleLogout}
            className="btn btn-sm btn-outline-danger font-semibold py-1 px-3 text-xs rounded-md shadow-sm transition-all"
          >
            Sair (Logout)
          </button>
        </div>
        <header className="mb-8 text-center no-print">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex justify-center mb-4"
          >
            <img 
              src={logoOficial} 
              alt="Digital CRVA Logo" 
              className="h-auto max-h-[110px] object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </motion.div>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-slate-50 px-4 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">
                Identificação do Sistema
              </span>
            </div>
          </div>

          <div className="mt-4">
            <h1 className="text-xl font-bold text-[#2C3E50] uppercase tracking-tight">SISTEMA INTEGRA CRVA</h1>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mt-1">ANEXO 1 - REQUERIMENTO DE SERVIÇO COM DECLARAÇÃO DE AUTENTICIDADE DE DOCUMENTOS</h2>
            <p className="text-sm text-slate-500 font-medium mt-2">Plataforma de Automação de Documentos Digitais - Revisão 15</p>
          </div>
        </header>

        <div className="flex justify-center">
          <div className="w-full">
            {!result ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50"
              >
                <div className="card-body p-4 p-md-5">
                  <form onSubmit={handleSubmit}>
                    {/* Seção: Proprietário */}
                    <div className="mb-4">
                      <h5 className="border-bottom border-slate-100 pb-2 mb-4 flex items-center text-slate-700 font-semibold">
                        <User size={18} className="me-2 text-[#2C3E50]" /> Dados do Proprietário
                      </h5>
                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label">Nome Completo / Razão Social</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            required 
                            value={formData.proprietario.nome}
                            onChange={e => setFormData({...formData, proprietario: {...formData.proprietario, nome: e.target.value}})}
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">CPF / CNPJ</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            placeholder="000.000.000-00"
                            required 
                            value={formData.proprietario.cpfCnpj}
                            onChange={handleCpfChange}
                          />
                        </div>
                        <div className="col-12">
                          <label className="form-label">Endereço Completo</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            required 
                            value={formData.proprietario.endereco}
                            onChange={e => setFormData({...formData, proprietario: {...formData.proprietario, endereco: e.target.value}})}
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Telefone Celular</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            placeholder="(54) 99999-9999"
                            required 
                            value={formData.proprietario.telefone}
                            onChange={e => setFormData({...formData, proprietario: {...formData.proprietario, telefone: e.target.value}})}
                          />
                        </div>
                        <div className="col-md-5">
                          <label className="form-label">E-mail</label>
                          <input 
                            type="email" 
                            className="form-control" 
                            placeholder="contato@exemplo.com"
                            required 
                            value={formData.proprietario.email}
                            onChange={e => setFormData({...formData, proprietario: {...formData.proprietario, email: e.target.value}})}
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">Autoriza SMS/E-mail?</label>
                          <select 
                            className="form-select" 
                            value={formData.proprietario.autorizacao}
                            onChange={e => setFormData({...formData, proprietario: {...formData.proprietario, autorizacao: e.target.value}})}
                          >
                            <option>SIM</option>
                            <option>NÃO</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Seção: Restrição Financeira */}
                    <div className="mb-4">
                      <h5 className="border-bottom border-slate-100 pb-2 mb-4 flex items-center text-slate-700 font-semibold">
                        <Shield size={18} className="me-2 text-[#2C3E50]" /> Restrição Financeira
                      </h5>
                      <div className="row g-3">
                        <div className="col-md-4">
                          <label className="form-label">Haverá Restrição?</label>
                          <select 
                            className="form-select" 
                            value={formData.restricaoFinanceira.havera}
                            onChange={e => {
                              const havera = e.target.value;
                              setFormData({
                                ...formData, 
                                restricaoFinanceira: { 
                                  havera, 
                                  modalidade: havera === 'NÃO' ? '' : formData.restricaoFinanceira.modalidade,
                                  tipoCredor: havera === 'NÃO' ? '' : formData.restricaoFinanceira.tipoCredor
                                }
                              });
                            }}
                          >
                            <option value="NÃO">Não</option>
                            <option value="SIM">Sim</option>
                          </select>
                        </div>
                        {formData.restricaoFinanceira.havera === 'SIM' && (
                          <>
                            <div className="col-md-4">
                              <label className="form-label">Modalidade</label>
                              <select 
                                className="form-select" 
                                value={formData.restricaoFinanceira.modalidade}
                                onChange={e => setFormData({...formData, restricaoFinanceira: {...formData.restricaoFinanceira, modalidade: e.target.value}})}
                                required
                              >
                                <option value="">Selecione...</option>
                                <option value="Arrendamento">Arrendamento</option>
                                <option value="Reserva de Domínio">Reserva de Domínio</option>
                                <option value="Alienação Fiduciária">Alienação Fiduciária</option>
                                <option value="Penhor">Penhor</option>
                                <option value="Comodato">Comodato</option>
                                <option value="Locação">Locação</option>
                              </select>
                            </div>
                            <div className="col-md-4">
                              <label className="form-label">Tipo de Credor</label>
                              <select 
                                className="form-select" 
                                value={formData.restricaoFinanceira.tipoCredor}
                                onChange={e => setFormData({...formData, restricaoFinanceira: {...formData.restricaoFinanceira, tipoCredor: e.target.value}})}
                                required
                              >
                                <option value="">Selecione...</option>
                                <option value="Pessoa Física">Pessoa Física</option>
                                <option value="Pessoa Jurídica">Pessoa Jurídica</option>
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Seção: Veículo */}
                    <div className="mb-4">
                      <h5 className="border-bottom border-slate-100 pb-2 mb-4 flex items-center text-slate-700 font-semibold">
                        <Car size={18} className="me-2 text-[#2C3E50]" /> Dados do Veículo
                      </h5>
                      <div className="row g-3">
                        <div className="col-md-4">
                          <label className="form-label">Placa</label>
                          <input 
                            type="text" 
                            className="form-control text-uppercase" 
                            placeholder="ABC-1234"
                            required 
                            value={formData.veiculo.placa}
                            onChange={e => setFormData({...formData, veiculo: {...formData.veiculo, placa: e.target.value}})}
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Renavam</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            maxLength={11}
                            required 
                            value={formData.veiculo.renavam}
                            onChange={e => setFormData({...formData, veiculo: {...formData.veiculo, renavam: e.target.value}})}
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Chassi</label>
                          <input 
                            type="text" 
                            className="form-control text-uppercase" 
                            maxLength={17}
                            required 
                            value={formData.veiculo.chassi}
                            onChange={e => setFormData({...formData, veiculo: {...formData.veiculo, chassi: e.target.value}})}
                          />
                        </div>
                        <div className="col-md-8">
                          <label className="form-label">Marca / Modelo</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            required 
                            value={formData.veiculo.modelo}
                            onChange={e => setFormData({...formData, veiculo: {...formData.veiculo, modelo: e.target.value}})}
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Ano</label>
                          <input 
                            type="number" 
                            className="form-control" 
                            required 
                            value={formData.veiculo.ano}
                            onChange={e => setFormData({...formData, veiculo: {...formData.veiculo, ano: parseInt(e.target.value)}})}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Seção: Serviço */}
                    <div className="mb-5 relative">
                      <h5 className="border-bottom border-slate-100 pb-2 mb-4 flex items-center text-slate-700 font-semibold">
                        <FileText size={18} className="me-2 text-[#2C3E50]" /> Tipo de Serviço
                      </h5>
                      <div className="input-group">
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="Digite para buscar o serviço..."
                          value={searchTerm || formData.servico}
                          onFocus={() => {
                            setShowDropdown(true);
                            setSearchTerm(formData.servico);
                          }}
                          onChange={e => {
                            setSearchTerm(e.target.value);
                            setShowDropdown(true);
                          }}
                        />
                        <button 
                          className="btn btn-outline-secondary" 
                          type="button"
                          onClick={() => setShowDropdown(!showDropdown)}
                        >
                          Selecionar
                        </button>
                      </div>

                      {showDropdown && (
                        <div className="position-absolute w-100 shadow bg-white rounded mt-1 overflow-auto z-3" style={{ maxHeight: '250px' }}>
                          <ul className="list-group list-group-flush">
                            {filteredServicos.length > 0 ? (
                              filteredServicos.map((s, i) => (
                                <li 
                                  key={i} 
                                  className={`list-group-item list-group-item-action cursor-pointer ${formData.servico === s ? 'active-service' : ''}`}
                                  onClick={() => {
                                    setFormData({...formData, servico: s});
                                    setSearchTerm('');
                                    setShowDropdown(false);
                                  }}
                                  style={{ 
                                    cursor: 'pointer',
                                    backgroundColor: formData.servico === s ? 'var(--primary-color)' : '',
                                    color: formData.servico === s ? 'white' : ''
                                  }}
                                >
                                  {s}
                                </li>
                              ))
                            ) : (
                              <li className="list-group-item text-muted small">Nenhum serviço encontrado</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>

                    {error && (
                      <div className="alert alert-danger d-flex align-items-center">
                        <AlertTriangle size={20} className="me-2" />
                        {error}
                      </div>
                    )}

                    <div className="mt-8 flex gap-3">
                      <button 
                        type="submit" 
                        className="btn btn-primary flex-1 py-3.5 text-lg font-bold shadow-md hover:shadow-lg transition-all"
                        disabled={loading}
                      >
                        {loading ? (
                          <span className="flex items-center justify-center">
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Processando...
                          </span>
                        ) : 'Gerar Requerimento Digital'}
                      </button>

                      <button 
                        type="button" 
                        className="btn btn-outline-secondary px-4 py-3.5 font-semibold transition-all"
                        onClick={clearForm}
                        disabled={loading}
                      >
                        Limpar Formulário
                      </button>
                    </div>
                  </form>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card shadow border-0 text-center p-5"
              >
                <CheckCircle size={80} className="text-success mx-auto mb-4" />
                <h2 className="fw-bold mb-3">Requerimento Gerado com Sucesso!</h2>
                <p className="text-muted mb-4">
                  O documento foi registrado e o selo de autenticidade foi aplicado.
                </p>
                
                <div className="bg-light p-4 rounded mb-4 text-start">
                  <p className="mb-1 small text-uppercase fw-bold text-muted">Selo de Segurança (SHA-256):</p>
                  <code className="text-break d-block bg-white p-2 border rounded">
                    {result.hash}
                  </code>
                  <p className="mt-3 mb-0 small text-muted">
                    <strong>Data de Emissão:</strong> {new Date(result.timestamp).toLocaleString('pt-BR')}
                  </p>
                </div>

                <div className="d-flex gap-3 justify-content-center">
                  <button 
                    className="btn btn-outline-primary px-4" 
                    id="btn-imprimir"
                    onClick={() => window.open(pdfUrl || `/api/gerar_pdf/${result.id}`, '_blank')}
                  >
                    Imprimir PDF (Real)
                  </button>
                  <button className="btn btn-primary px-4" onClick={() => clearForm()}>
                    Novo Requerimento
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        <footer className="mt-5 text-center text-muted small no-print">
          <p>&copy; 2026 Integra CRVA - Desenvolvido por Marks Systems Senac/RS para Detran/RS</p>
          <p>Em conformidade com a LGPD e Normas ISO 3779</p>
        </footer>
      </div>

      {/* Versão para Impressão (Apenas visível no window.print()) */}
      {result && (
        <div className="printable-document">
          <div className="doc-header d-flex align-items-center justify-content-center">
            <img 
              src={logoOficial} 
              alt="Logo" 
              style={{ height: '70px', marginRight: '20px' }}
              referrerPolicy="no-referrer"
            />
            <div>
              <h2 className="fw-bold mb-0">DETRAN-RS - CRVA 0018</h2>
              <h4 className="text-uppercase mb-0">ANEXO 1 - REQUERIMENTO DE SERVIÇO COM DECLARAÇÃO DE AUTENTICIDADE DE DOCUMENTOS</h4>
            </div>
          </div>

          <div className="doc-section">
            <div className="doc-section-title">Dados do Proprietário</div>
            <div className="doc-grid">
              <div className="doc-field">
                <span className="doc-label">Nome / Razão Social:</span>
                <span className="doc-value">{formData.proprietario.nome}</span>
              </div>
              <div className="doc-field">
                <span className="doc-label">CPF / CNPJ:</span>
                <span className="doc-value">{formData.proprietario.cpfCnpj}</span>
              </div>
              <div className="col-12 mt-2">
                <span className="doc-label">Endereço:</span>
                <span className="doc-value">{formData.proprietario.endereco}</span>
              </div>
            </div>
          </div>

          <div className="doc-section">
            <div className="doc-section-title">Dados do Veículo</div>
            <div className="doc-grid">
              <div className="doc-field">
                <span className="doc-label">Placa:</span>
                <span className="doc-value text-uppercase">{formData.veiculo.placa}</span>
              </div>
              <div className="doc-field">
                <span className="doc-label">Renavam:</span>
                <span className="doc-value">{formData.veiculo.renavam}</span>
              </div>
              <div className="doc-field">
                <span className="doc-label">Chassi:</span>
                <span className="doc-value text-uppercase">{formData.veiculo.chassi}</span>
              </div>
              <div className="doc-field">
                <span className="doc-label">Marca / Modelo:</span>
                <span className="doc-value">{formData.veiculo.modelo}</span>
              </div>
              <div className="doc-field">
                <span className="doc-label">Ano:</span>
                <span className="doc-value">{formData.veiculo.ano}</span>
              </div>
            </div>
          </div>

          <div className="doc-section">
            <div className="doc-section-title">Serviço Solicitado</div>
            <div className="doc-grid">
              <div className="doc-field">
                <span className="doc-label">Tipo de Serviço:</span>
                <span className="doc-value">{formData.servico}</span>
              </div>
              <div className="doc-field">
                <span className="doc-label">Data de Emissão:</span>
                <span className="doc-value">{new Date(result.timestamp).toLocaleString('pt-BR')}</span>
              </div>
            </div>
          </div>

          <div className="doc-footer">
            <p className="mb-2">Declaro serem verdadeiras as informações acima prestadas.</p>
            <div className="mt-5 mb-5" style={{ borderBottom: '1px solid black', width: '300px', margin: '0 auto' }}></div>
            <p className="small text-muted">Assinatura do Proprietário / Representante Legal</p>
            
            <div className="security-seal mt-5">
              <p className="fw-bold mb-1 text-uppercase" style={{ fontSize: '9px' }}>Selo de Autenticidade Digital (Integridade SHA-256)</p>
              <code>{result.hash}</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

