import React, { useState } from 'react';
import { Shield, Car, User, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

// Importação da Logo Oficial
const logoOficial = '/Logo Digital CRVA.jpg';

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

interface ModuloCRVAProps {
  usuario: any;
  onLogout: () => void;
}

export default function ModuloCRVA({ usuario, onLogout }: ModuloCRVAProps) {
  const logado = JSON.parse(sessionStorage.getItem('user') || '{}');

  const [formData, setFormData] = useState({
    proprietario: { nome: '', cpfCnpj: '', identidade: '', endereco: '', telefone: '', email: '', autorizacao: 'NÃO', naoPossuiCelular: 'NÃO', naoPossuiEmail: 'NÃO' },
    veiculo: { placa: '', renavam: '', chassi: '', modelo: '', ano: new Date().getFullYear(), reservaPlaca: 'NÃO' },
    restricaoFinanceira: { havera: 'NÃO', modalidade: '', tipoCredor: '', nomeCredor: '' },
    servico: ''
  });

  const clearForm = () => {
    setFormData({
      proprietario: { nome: '', cpfCnpj: '', identidade: '', endereco: '', telefone: '', email: '', autorizacao: 'NÃO', naoPossuiCelular: 'NÃO', naoPossuiEmail: 'NÃO' },
      veiculo: { placa: '', renavam: '', chassi: '', modelo: '', ano: new Date().getFullYear(), reservaPlaca: 'NÃO' },
      restricaoFinanceira: { havera: 'NÃO', modalidade: '', tipoCredor: '', nomeCredor: '' },
      servico: ''
    });
    setSearchTerm('');
    setIsModalAberto(false);
    setError(null);
    setResult(null);
    setPdfUrl(null);
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = formatarCPF(e.target.value);
    setFormData({ ...formData, proprietario: { ...formData.proprietario, cpfCnpj: masked } });
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalAberto, setIsModalAberto] = useState(false);

  // ============================================================
  // MODAIS SEQUENCIAIS — Primeiro Emplacamento
  // ============================================================
  type ModalEtapa = 'fechado' | 'reservaPlaca' | 'digitarPlaca' | 'opcoesDocumento';
  const [modalEtapa, setModalInstancia] = useState<ModalEtapa>('fechado');
  const [reservaPlaca, setReservaPlaca] = useState<'SIM' | 'NÃO'>('NÃO');
  const [impressaoCrlv, setImpressaoCrlv] = useState<'SIM' | 'NÃO'>('NÃO');
  const [emissaoCertidao, setEmissaoCertidao] = useState<'SIM' | 'NÃO'>('NÃO');
  const [placaReservadaInput, setPlacaReservadaInput] = useState('');

  // Handler: usuário respondeu se haverá reserva
  const handleRespostaReserva = (havera: boolean) => {
    if (havera) {
      setReservaPlaca('SIM');
      setModalInstancia('digitarPlaca');
    } else {
      setReservaPlaca('NÃO');
      setPlacaReservadaInput('');
      setModalInstancia('opcoesDocumento');
    }
  };

  // Handler: usuário confirmou a placa reservada
  const handleConfirmarPlaca = () => {
    const placaLimpa = placaReservadaInput.trim().toUpperCase();
    if (!placaLimpa) return;
    // Salva a placa no formData e avança para o próximo modal
    setFormData(prev => ({ ...prev, veiculo: { ...prev.veiculo, placa: placaLimpa } }));
    setModalInstancia('opcoesDocumento');
  };

  // Handler: usuário confirmou as opções de documento e fecha tudo
  const handleConfirmarOpcoes = () => {
    setFormData(prev => ({
      ...prev,
      servico: 'Primeiro Emplacamento',
      veiculo: {
        ...prev.veiculo,
        reservaPlaca,
        impressaoCrlv,
        emissaoCertidao
      }
    }));
    setModalInstancia('fechado');
  };

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

    if (!validarChassi(formData.veiculo.chassi)) {
      setError('Chassi inválido (17 caracteres, sem I, O, Q)');
      setLoading(false);
      return;
    }

    if (formData.servico !== 'Primeiro Emplacamento' && !validarPlaca(formData.veiculo.placa)) {
      setError('Placa inválida (Formato AAA-1111 ou Mercosul)');
      setLoading(false);
      return;
    }

    try {
      const dadosEnvio = {
        ...formData,
        veiculo: {
          ...formData.veiculo,
          placa: formData.veiculo.placa || placaReservadaInput.trim().toUpperCase(),
          reservaPlaca: reservaPlaca === 'SIM' ? 'SIM' : 'NÃO',
          impressaoCrlv: impressaoCrlv === 'SIM' ? 'SIM' : 'NÃO',
          emissaoCertidao: emissaoCertidao === 'SIM' ? 'SIM' : 'NÃO'
        },
        operador: {
          nome: getUsuarioIdentificador(),
          email: usuario?.email || '',
          funcao: usuario?.funcao || 'Operador'
        }
      };

      const response = await fetch('/api/gerar_pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosEnvio)
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

      const blob = await response.blob();
      const fileURL = URL.createObjectURL(blob);
      setPdfUrl(fileURL);

      window.open(fileURL, '_blank');

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
    return usuario?.nome || usuario?.email || 'Usuário Local';
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pt-20 pb-8">
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 no-print" style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.02)' }}>
        <div className="container max-w-6xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="font-black text-slate-900 tracking-tight text-lg" style={{ color: '#0f172a' }}>INTEGRA CRVA</span>
            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-xs font-bold uppercase tracking-wider">
              Módulo Balcão
            </span>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                <User size={16} />
              </div>
              <div className="text-sm font-medium text-slate-600">
                Operador: <span className="font-bold text-slate-800">{getUsuarioIdentificador()}</span>
                <span className="text-slate-300 mx-2">|</span>
                <span className="uppercase text-slate-500 font-bold" style={{ fontSize: '11px', letterSpacing: '0.05em' }}>{usuario?.funcao || 'OPERADOR'}</span>
              </div>
            </div>
            <div className="h-5 w-px bg-slate-200"></div>
            <button onClick={onLogout} className="text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors cursor-pointer bg-transparent border-0 p-0">Sair</button>
          </div>
        </div>
      </header>

      <div className="container max-w-4xl mx-auto px-4">
        <header className="mb-8 text-center no-print">
          <div className="flex justify-center mb-4">
            <img
              src={logoOficial}
              alt="Digital CRVA Logo"
              className="h-auto max-h-[110px] object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => { const target = e.target as HTMLImageElement; target.style.display = 'none'; }}
            />
          </div>
          <div className="text-left mt-2 mb-2">
            <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Atendimento</h2>
            <p className="text-sm text-slate-500 font-medium mt-1">Plataforma INTEGRA — Emissão de Requerimentos Oficiais</p>
          </div>
        </header>

        <div className="flex justify-center">
          <div className="w-full">
            {!result ? (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
                <div className="card-body p-4 p-md-5">
                  <form onSubmit={handleSubmit}>

                    {/* Seção: Serviço Obrigatório Primeiro */}
                    <div className="mb-5 relative">
                      <h5 className="border-bottom border-slate-100 pb-2 mb-4 flex items-center text-slate-700 font-semibold">
                        <FileText size={18} className="me-2 text-[#2C3E50]" /> Serviço Solicitado
                      </h5>
                      <div className="bg-white p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                        <div className="flex-1">
                          {formData.servico ? (
                            <div className="flex items-center gap-2 text-slate-800 font-bold text-lg">
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-sm"></span>
                              {formData.servico}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Nenhum serviço selecionado</span>
                          )}
                        </div>
                        <button type="button" onClick={() => { setIsModalAberto(true); setSearchTerm(''); }} className="bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 px-6 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap w-auto min-w-max">📄 Escolha o Serviço</button>
                      </div>
                    </div>

                    {/* Seção: Proprietário */}
                    <div className="mb-4">
                      <h5 className="border-bottom border-slate-100 pb-2 mb-4 flex items-center text-slate-700 font-semibold">
                        <User size={18} className="me-2 text-[#2C3E50]" /> Dados do Proprietário / Requerente
                      </h5>
                      <div className="row g-3">
                        <div className="col-md-5">
                          <label className="form-label">Nome Completo / Razão Social</label>
                          <input type="text" className="form-control" required value={formData.proprietario.nome} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, nome: e.target.value } })} />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">CPF / CNPJ</label>
                          <input type="text" className="form-control" placeholder="000.000.000-00" required value={formData.proprietario.cpfCnpj} onChange={handleCpfChange} />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">Identidade (RG) - Opcional</label>
                          <input type="text" className="form-control" placeholder="Nº de RG" value={formData.proprietario.identidade} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, identidade: e.target.value } })} />
                        </div>
                        <div className="col-12">
                          <label className="form-label">Endereço Completo</label>
                          <input type="text" className="form-control" required value={formData.proprietario.endereco} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, address: e.target.value, endereco: e.target.value } })} />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">Telefone Celular</label>
                          <div className="input-group">
                            <input type="text" className="form-control" placeholder="(54) 99999-9999" disabled={formData.proprietario.naoPossuiCelular === 'SIM'} required={formData.proprietario.naoPossuiCelular === 'NÃO'} value={formData.proprietario.telefone} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, telefone: e.target.value } })} />
                            <div className="input-group-text gap-1">
                              <input type="checkbox" id="no-cel" checked={formData.proprietario.naoPossuiCelular === 'SIM'} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, naoPossuiCelular: e.target.checked ? 'SIM' : 'NÃO', telefone: e.target.checked ? '' : formData.proprietario.telefone } })} />
                              <label htmlFor="no-cel" className="mb-0 text-xs select-none">Não possui</label>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">E-mail</label>
                          <div className="input-group">
                            <input type="email" className="form-control" placeholder="contato@exemplo.com" disabled={formData.proprietario.naoPossuiEmail === 'SIM'} required={formData.proprietario.naoPossuiEmail === 'NÃO'} value={formData.proprietario.email} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, email: e.target.value } })} />
                            <div className="input-group-text gap-1">
                              <input type="checkbox" id="no-mail" checked={formData.proprietario.naoPossuiEmail === 'SIM'} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, naoPossuiEmail: e.target.checked ? 'SIM' : 'NÃO', email: e.target.checked ? '' : formData.proprietario.email } })} />
                              <label htmlFor="no-mail" className="mb-0 text-xs select-none">Não possui</label>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Autoriza Comunicação DETRAN?</label>
                          <select className="form-select" value={formData.proprietario.autorizacao} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, autorizacao: e.target.value } })}>
                            <option value="SIM">SIM</option>
                            <option value="NÃO">NÃO</option>
                          </select>
                        </div>
                        {formData.servico === 'Primeiro Emplacamento' && (
                          <div className="col-md-4">
                            <label className="form-label">Haverá Reserva de Placas?</label>
                            <select className="form-select" value={formData.veiculo.reservaPlaca} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, reservaPlaca: e.target.value } })}>
                              <option value="NÃO">Não</option>
                              <option value="SIM">Sim</option>
                            </select>
                          </div>
                        )}
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
                          <select className="form-select" value={formData.restricaoFinanceira.havera} onChange={e => {
                            const havera = e.target.value;
                            setFormData({
                              ...formData,
                              restricaoFinanceira: {
                                havera,
                                modalidade: havera === 'NÃO' ? '' : formData.restricaoFinanceira.modalidade,
                                tipoCredor: havera === 'NÃO' ? '' : formData.restricaoFinanceira.tipoCredor,
                                nomeCredor: havera === 'NÃO' ? '' : formData.restricaoFinanceira.nomeCredor
                              }
                            });
                          }}>
                            <option value="NÃO">Não</option>
                            <option value="SIM">Sim</option>
                          </select>
                        </div>
                        {formData.restricaoFinanceira.havera === 'SIM' && (
                          <>
                            <div className="col-md-4">
                              <label className="block text-sm font-medium text-slate-700 mb-1">Modalidade/Tipo</label>
                              <select className="form-select" value={formData.restricaoFinanceira.modalidade} onChange={e => setFormData({ ...formData, restricaoFinanceira: { ...formData.restricaoFinanceira, modalidade: e.target.value } })} required>
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
                              <select className="form-select" value={formData.restricaoFinanceira.tipoCredor} onChange={e => setFormData({ ...formData, restricaoFinanceira: { ...formData.restricaoFinanceira, tipoCredor: e.target.value } })} required>
                                <option value="">Selecione...</option>
                                <option value="Pessoa Física">Pessoa Física</option>
                                <option value="Pessoa Jurídica">Pessoa Jurídica</option>
                              </select>
                            </div>
                            <div className="col-12 mt-3">
                              <label className="form-label">Agente Financeiro:</label>
                              <input type="text" className="form-control" placeholder="Digite o nome ou documento do credor" required value={formData.restricaoFinanceira.nomeCredor || ''} onChange={e => setFormData({ ...formData, restricaoFinanceira: { ...formData.restricaoFinanceira, nomeCredor: e.target.value } })} />
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
                        {formData.servico !== 'Primeiro Emplacamento' && (
                          <div className="col-md-4">
                            <label className="form-label">Placa</label>
                            <input type="text" className="form-control text-uppercase" placeholder="ABC-1234" required value={formData.veiculo.placa} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, placa: e.target.value } })} />
                          </div>
                        )}
                        <div className="col-md-4">
                          <label className="form-label">Renavam</label>
                          <input type="text" className="form-control" placeholder={formData.servico === 'Primeiro Emplacamento' ? "Opcional (Zero KM)" : "Obrigatório"} required={formData.servico !== 'Primeiro Emplacamento'} value={formData.veiculo.renavam} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, renavam: e.target.value } })} />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Chassi</label>
                          <input type="text" className="form-control text-uppercase" maxLength={17} required value={formData.veiculo.chassi} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, chassi: e.target.value } })} />
                        </div>
                        <div className="col-md-8">
                          <label className="form-label">Marca / Modelo</label>
                          <input type="text" className="form-control" required value={formData.veiculo.modelo} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, modelo: e.target.value } })} />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Ano</label>
                          <input type="number" className="form-control" required value={formData.veiculo.ano} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, ano: parseInt(e.target.value) } })} />
                        </div>
                      </div>
                    </div>

                    {error && <div className="alert alert-danger d-flex align-items-center"><AlertTriangle size={20} className="me-2" />{error}</div>}

                    <div className="mt-8 flex gap-3">
                      <button type="submit" className="btn btn-primary flex-1 py-3.5 text-lg font-bold shadow-md hover:shadow-lg transition-all" disabled={loading}>
                        {loading ? 'Processando...' : 'Gerar Requerimento Digital'}
                      </button>
                      <button type="button" className="btn btn-outline-secondary px-4 py-3.5 font-semibold transition-all" onClick={clearForm} disabled={loading}>Limpar</button>
                    </div>
                  </form>
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card shadow border-0 text-center p-5">
                <CheckCircle size={80} className="text-success mx-auto mb-4" />
                <h2 className="fw-bold mb-3">Requerimento Gerado!</h2>
                <div className="bg-light p-4 rounded mb-4 text-start">
                  <p className="mb-1 small text-uppercase fw-bold text-muted">Selo de Segurança (SHA-256):</p>
                  <code className="text-break d-block bg-white p-2 border rounded">{result.hash}</code>
                </div>
                <div className="d-flex gap-3 justify-content-center">
                  <button className="btn btn-outline-primary px-4" onClick={() => window.open(pdfUrl || `/api/gerar_pdf/${result.id}`, '_blank')}>Visualizar PDF</button>
                  <button className="btn btn-primary px-4" onClick={() => clearForm()}>Novo Atendimento</button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================
          MODAL DE SELEÇÃO DE SERVIÇOS
      ============================================ */}
      {isModalAberto && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">Selecione o Serviço do Balcão</h3>
              <button onClick={() => setIsModalAberto(false)} className="text-slate-400 text-3xl">&times;</button>
            </div>
            <div className="p-3 bg-white border-b">
              <input type="text" placeholder="Buscar serviço..." className="w-full p-3 bg-slate-50 border rounded-lg" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus />
            </div>
            <div className="overflow-y-auto p-4 bg-slate-50/50 flex-1">
              <div className="grid grid-cols-1 gap-2">
                {filteredServicos.map((s, i) => (
                  <button key={i} type="button" onClick={() => {
                    setIsModalAberto(false);
                    if (s === 'Primeiro Emplacamento') {
                      // Inicia sequência de modais premium
                      setReservaPlaca('NÃO');
                      setImpressaoCrlv('NÃO');
                      setEmissaoCertidao('NÃO');
                      setPlacaReservadaInput('');
                      setModalInstancia('reservaPlaca');
                    } else {
                      setFormData({
                        ...formData, servico: s,
                        veiculo: {
                          ...formData.veiculo, reservaPlaca: 'NÃO',
                          impressaoCrlv: 'NÃO', emissaoCertidao: 'NÃO'
                        }
                      });
                    }
                  }} className={`text-left p-3 rounded-lg border bg-white transition-colors ${formData.servico === s
                    ? 'border-blue-500 bg-blue-50 text-blue-900 font-bold'
                    : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                    }`}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================
          MODAIS SEQUENCIAIS — PRIMEIRO EMPLACAMENTO
      ============================================ */}
      {modalEtapa !== 'fechado' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">

          {/* ---- MODAL 1A: Pergunta Reserva de Placa ---- */}
          {modalEtapa === 'reservaPlaca' && (
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
              <div className="px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xl">🚗</div>
                  <div>
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Primeiro Emplacamento</p>
                    <h3 className="text-slate-900 font-bold text-lg tracking-tight">Reserva de Placas</h3>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <p className="text-slate-800 font-semibold text-base mb-1">Haverá Reserva de Placas?</p>
                <p className="text-slate-500 text-sm mb-7 leading-relaxed">
                  Informe se o cliente realizou uma reserva de placa específica para este veículo no sistema do DETRAN/RS.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleRespostaReserva(true)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
                  >
                    <span className="text-2xl">✅</span>
                    <span className="font-bold text-slate-800 group-hover:text-indigo-700">Sim</span>
                    <span className="text-xs text-slate-400 group-hover:text-indigo-500">Digitar a placa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespostaReserva(false)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 transition-all group"
                  >
                    <span className="text-2xl">❌</span>
                    <span className="font-bold text-slate-600 group-hover:text-slate-800">Não</span>
                    <span className="text-xs text-slate-400">Seguir adiante</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ---- MODAL 1B: Digitar Placa Reservada ---- */}
          {modalEtapa === 'digitarPlaca' && (
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xl">🔢</div>
                  <div>
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Primeiro Emplacamento</p>
                    <h3 className="text-slate-900 font-bold text-lg tracking-tight">Placa Reservada</h3>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <p className="text-slate-800 font-semibold mb-1">Informe a placa reservada:</p>
                <p className="text-slate-500 text-sm mb-5">A placa será impressa no requerimento como placa reservada pelo cliente.</p>
                <input
                  type="text"
                  autoFocus
                  maxLength={8}
                  placeholder="Ex: ABC-1234 ou ABC1D23"
                  value={placaReservadaInput}
                  onChange={e => setPlacaReservadaInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && placaReservadaInput.trim()) handleConfirmarPlaca(); }}
                  className="w-full border-2 border-slate-200 focus:border-indigo-500 rounded-xl px-4 py-3.5 text-2xl font-bold text-center tracking-[0.25em] outline-none transition-colors mb-5 uppercase"
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setModalInstancia('reservaPlaca')}
                    className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold transition-colors text-sm"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    disabled={!placaReservadaInput.trim()}
                    onClick={handleConfirmarPlaca}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl shadow-md shadow-indigo-600/10 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Confirmar e Avançar →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ---- MODAL 2: Opções de Documento Adicionais ---- */}
          {modalEtapa === 'opcoesDocumento' && (
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xl">📄</div>
                  <div>
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Passo Final</p>
                    <h3 className="text-slate-900 font-bold text-lg tracking-tight">Documentos Adicionais</h3>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <p className="text-slate-800 font-semibold mb-1">O cliente solicita algum documento adicional?</p>
                <p className="text-slate-500 text-sm mb-6">Marque os documentos que deverão ser emitidos junto ao processo de emplacamento.</p>

                {/* Checkbox Premium: CRLVe */}
                <label
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all mb-3 ${impressaoCrlv === 'SIM'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                >
                  <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0 ${impressaoCrlv === 'SIM' ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                    }`}>
                    {impressaoCrlv === 'SIM' && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800 text-sm">Impressão do CRLV-e</p>
                    <p className="text-slate-500 text-xs">Certif. de Registro e Licenciamento do Veículo (digital)</p>
                  </div>
                  <input type="checkbox" className="sr-only" checked={impressaoCrlv === 'SIM'}
                    onChange={e => setImpressaoCrlv(e.target.checked ? 'SIM' : 'NÃO')} />
                </label>

                {/* Checkbox Premium: Certidão */}
                <label
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all mb-7 ${emissaoCertidao === 'SIM'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                >
                  <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0 ${emissaoCertidao === 'SIM' ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                    }`}>
                    {emissaoCertidao === 'SIM' && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800 text-sm">Emissão de Certidão de Registro</p>
                    <p className="text-slate-500 text-xs">Certidão oficial emitida pelo DETRAN/RS</p>
                  </div>
                  <input type="checkbox" className="sr-only" checked={emissaoCertidao === 'SIM'}
                    onChange={e => setEmissaoCertidao(e.target.checked ? 'SIM' : 'NÃO')} />
                </label>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setModalInstancia(reservaPlaca === 'SIM' ? 'digitarPlaca' : 'reservaPlaca')}
                    className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold transition-colors text-sm"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmarOpcoes}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl shadow-md shadow-indigo-600/10 transition-all duration-200"
                  >
                    Confirmar e Aplicar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}