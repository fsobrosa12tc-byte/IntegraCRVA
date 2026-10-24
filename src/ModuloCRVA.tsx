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

const UFS = [
  'RS', 'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ',
  'RN', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO'
];

const formatarCPF = (v: string) => {
  v = v.replace(/\D/g, '');
  if (v.length <= 11) {
    return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").substring(0, 14);
  }
  return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5").substring(0, 18);
};

const formatarCEP = (v: string) => {
  const clean = v.replace(/\D/g, '').substring(0, 8);
  if (clean.length > 5) {
    return clean.replace(/(\d{5})(\d{1,3})/, '$1-$2');
  }
  return clean;
};

const formatarTelefone = (valor: string) => {
  const v = valor.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) {
    return v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1)$2-$3');
  } else if (v.length > 5) {
    return v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1)$2-$3');
  } else if (v.length > 2) {
    return v.replace(/^(\d{2})(\d{0,5})$/, '($1)$2');
  } else {
    return v.length ? `(${v}` : '';
  }
};

interface SegundaViaCrvData {
  tipoSolicitacao: 'SEGUNDA_VIA' | 'VALIDACAO';
  numeroCrvValidacao: string;
  dataEmissaoAnterior: string;
  justificativa: 'NAO_RECEBIDO' | 'INUTILIZADO' | 'EXTRAVIADO' | 'FURTADO';
}

const estadoInicialSegundaVia: SegundaViaCrvData = {
  tipoSolicitacao: 'SEGUNDA_VIA',
  numeroCrvValidacao: '',
  dataEmissaoAnterior: '',
  justificativa: 'NAO_RECEBIDO'
};

export type MotivoBaixaDefinitiva = 'IRRECUPERAVEL' | 'DESMONTADO' | 'SINISTRADO_PT' | 'SUCATA' | 'OUTRO_PAIS';

export interface BaixaDefinitivaData {
  motivo: MotivoBaixaDefinitiva;
  extravios: {
    crv: boolean;
    placas: boolean;
    plaquetas: boolean;
    lacre: boolean;
  };
}

const estadoInicialBaixaDefinitiva: BaixaDefinitivaData = {
  motivo: 'IRRECUPERAVEL',
  extravios: {
    crv: false,
    placas: false,
    plaquetas: false,
    lacre: false
  }
};

const formatarData = (val: string) => {
  const digits = val.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  } else if (digits.length > 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits;
};

interface ModuloCRVAProps {
  usuario: any;
  onLogout: () => void;
}

export default function ModuloCRVA({ usuario, onLogout }: ModuloCRVAProps) {
  const logado = JSON.parse(sessionStorage.getItem('user') || '{}');

  const [formData, setFormData] = useState({
    proprietario: {
      nome: '',
      cpfCnpj: '',
      identidade: '',
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: 'RS',
      endereco: '',
      telefone: '',
      email: '',
      autorizacao: 'NÃO',
      naoPossuiCelular: 'NÃO',
      naoPossuiEmail: 'NÃO'
    },
    veiculo: { placa: '', renavam: '', chassi: '', modelo: '', ano: new Date().getFullYear(), reservaPlaca: 'NÃO' },
    restricaoFinanceira: { havera: 'NÃO', modalidade: '', tipoCredor: '', nomeCredor: '' },
    servico: ''
  });

  // Estado e Modal da 2ª Via do CRV (POP 10 - Anexo 1)
  const [segundaViaCrv, setSegundaViaCrv] = useState<SegundaViaCrvData>(estadoInicialSegundaVia);
  const [isModalSegundaViaAberto, setIsModalSegundaViaAberto] = useState(false);

  // Estado e Modal da Baixa Definitiva (POP 25 - Anexo 1)
  const [baixaDefinitiva, setBaixaDefinitiva] = useState<BaixaDefinitivaData>(estadoInicialBaixaDefinitiva);
  const [isModalBaixaDefinitivaAberto, setIsModalBaixaDefinitivaAberto] = useState(false);

  const [buscandoCep, setBuscandoCep] = useState(false);

  const buscarCep = async (cepInput: string) => {
    const cepLimpo = cepInput.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    try {
      setBuscandoCep(true);
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          proprietario: {
            ...prev.proprietario,
            logradouro: data.logradouro || prev.proprietario.logradouro,
            bairro: data.bairro || prev.proprietario.bairro,
            cidade: data.localidade || prev.proprietario.cidade,
            uf: data.uf || prev.proprietario.uf || 'RS',
            complemento: data.complemento || prev.proprietario.complemento
          }
        }));
      }
    } catch (err) {
      console.error('Erro ao consultar ViaCEP:', err);
    } finally {
      setBuscandoCep(false);
    }
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = formatarCEP(e.target.value);
    setFormData(prev => ({
      ...prev,
      proprietario: { ...prev.proprietario, cep: masked }
    }));
    const cepNumeros = masked.replace(/\D/g, '');
    if (cepNumeros.length === 8) {
      buscarCep(cepNumeros);
    }
  };

  const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = formatarTelefone(e.target.value);
    setFormData(prev => ({
      ...prev,
      proprietario: { ...prev.proprietario, telefone: masked }
    }));
  };

  const clearForm = () => {
    setFormData({
      proprietario: {
        nome: '',
        cpfCnpj: '',
        identidade: '',
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        uf: 'RS',
        endereco: '',
        telefone: '',
        email: '',
        autorizacao: 'NÃO',
        naoPossuiCelular: 'NÃO',
        naoPossuiEmail: 'NÃO'
      },
      veiculo: { placa: '', renavam: '', chassi: '', modelo: '', ano: new Date().getFullYear(), reservaPlaca: 'NÃO' },
      restricaoFinanceira: { havera: 'NÃO', modalidade: '', tipoCredor: '', nomeCredor: '' },
      servico: ''
    });
    setSegundaViaCrv(estadoInicialSegundaVia);
    setIsModalSegundaViaAberto(false);
    setBaixaDefinitiva(estadoInicialBaixaDefinitiva);
    setIsModalBaixaDefinitivaAberto(false);
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

    if (!formData.servico) {
      setError('Por favor, selecione o Serviço Solicitado antes de gerar o requerimento.');
      setLoading(false);
      return;
    }

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
      const { logradouro, numero, complemento, bairro, cidade, uf, cep } = formData.proprietario;
      const enderecoCompleto = [
        logradouro,
        numero ? `nº ${numero}` : '',
        complemento,
        bairro,
        cidade && uf ? `${cidade} - ${uf}` : cidade,
        cep ? `CEP ${cep}` : ''
      ].filter(Boolean).join(', ');

      const dadosEnvio = {
        ...formData,
        proprietario: {
          ...formData.proprietario,
          endereco: enderecoCompleto || 'NÃO INFORMADO'
        },
        veiculo: {
          ...formData.veiculo,
          placa: formData.veiculo.placa || placaReservadaInput.trim().toUpperCase(),
          reservaPlaca: reservaPlaca === 'SIM' ? 'SIM' : 'NÃO',
          impressaoCrlv: impressaoCrlv === 'SIM' ? 'SIM' : 'NÃO',
          emissaoCertidao: emissaoCertidao === 'SIM' ? 'SIM' : 'NÃO'
        },
        segundaViaCrv: formData.servico === '2ª via do CRV' ? segundaViaCrv : undefined,
        baixaDefinitiva: formData.servico === 'Baixa de Veículo - Simples' ? baixaDefinitiva : undefined,
        operador: {
          nome: getUsuarioIdentificador(),
          email: usuario?.email || '',
          funcao: usuario?.funcao || 'Operador'
        }
      };

      const urlDestino = '/api/gerar_pdf';
      console.log('Disparando requisição para:', urlDestino);

      const response = await fetch(urlDestino, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosEnvio)
      });

      if (!response.ok) {
        console.error(`Erro na requisição /api/gerar_pdf: Status ${response.status}`);
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || errorJson.message || `Falha ao gerar requerimento e PDF (Status ${response.status})`);
        } catch {
          throw new Error(`Falha ao gerar requerimento e PDF (Erro no Servidor ${response.status})`);
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

                    {/* 1. Seção: Proprietário / Requerente */}
                    <div className="mb-5">
                      <h5 className="border-bottom border-slate-100 pb-2 mb-4 flex items-center text-slate-700 font-semibold">
                        <User size={18} className="me-2 text-[#2C3E50]" /> Dados do Proprietário / Requerente
                      </h5>
                      <div className="row g-3">
                        <div className="col-md-7">
                          <label className="form-label font-medium text-slate-700">Nome Completo / Razão Social</label>
                          <input type="text" className="form-control rounded-xl" required value={formData.proprietario.nome} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, nome: e.target.value } })} />
                        </div>
                        <div className="col-md-5">
                          <label className="form-label font-medium text-slate-700">CPF / CNPJ</label>
                          <input type="text" className="form-control rounded-xl" placeholder="000.000.000-00" required value={formData.proprietario.cpfCnpj} onChange={handleCpfChange} />
                        </div>

                        {/* Campos Granulares de Endereço */}
                        <div className="col-md-3">
                          <label className="form-label font-medium text-slate-700">CEP</label>
                          <div className="relative">
                            <input
                              type="text"
                              className="form-control rounded-xl"
                              placeholder="00000-000"
                              maxLength={9}
                              required
                              value={formData.proprietario.cep}
                              onChange={handleCepChange}
                              onBlur={() => buscarCep(formData.proprietario.cep)}
                            />
                            {buscandoCep && (
                              <span className="absolute right-3 top-2.5 text-xs text-blue-600 font-semibold animate-pulse">
                                Buscando...
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label font-medium text-slate-700">Logradouro / Endereço Completo</label>
                          <input
                            type="text"
                            className="form-control rounded-xl"
                            placeholder="Ex: Rua, Avenida, Travessa"
                            required
                            value={formData.proprietario.logradouro}
                            onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, logradouro: e.target.value } })}
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label font-medium text-slate-700">Número</label>
                          <input
                            type="text"
                            className="form-control rounded-xl"
                            placeholder="Ex: 123 ou S/N"
                            required
                            value={formData.proprietario.numero}
                            onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, numero: e.target.value } })}
                          />
                        </div>

                        <div className="col-md-4">
                          <label className="form-label font-medium text-slate-700">Complemento (Opcional)</label>
                          <input
                            type="text"
                            className="form-control rounded-xl"
                            placeholder="Apto, Sala, Bloco..."
                            value={formData.proprietario.complemento}
                            onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, complemento: e.target.value } })}
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label font-medium text-slate-700">Bairro</label>
                          <input
                            type="text"
                            className="form-control rounded-xl"
                            placeholder="Ex: Centro"
                            required
                            value={formData.proprietario.bairro}
                            onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, bairro: e.target.value } })}
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label font-medium text-slate-700">Cidade / Município</label>
                          <input
                            type="text"
                            className="form-control rounded-xl"
                            placeholder="Ex: Porto Alegre"
                            required
                            value={formData.proprietario.cidade}
                            onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, cidade: e.target.value } })}
                          />
                        </div>
                        <div className="col-md-2">
                          <label className="form-label font-medium text-slate-700">UF</label>
                          <select
                            className="form-select rounded-xl"
                            value={formData.proprietario.uf}
                            onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, uf: e.target.value } })}
                          >
                            {UFS.map(uf => (
                              <option key={uf} value={uf}>{uf}</option>
                            ))}
                          </select>
                        </div>

                        <div className="col-md-6">
                          <label className="form-label font-medium text-slate-700">Telefone Celular</label>
                          <div className="input-group">
                            <input
                              type="text"
                              className="form-control rounded-l-xl"
                              placeholder="(99)99999-9999"
                              disabled={formData.proprietario.naoPossuiCelular === 'SIM'}
                              required={formData.proprietario.naoPossuiCelular === 'NÃO'}
                              value={formData.proprietario.telefone}
                              onChange={handleTelefoneChange}
                            />
                            <div className="input-group-text gap-1 rounded-r-xl">
                              <input
                                type="checkbox"
                                id="no-cel"
                                checked={formData.proprietario.naoPossuiCelular === 'SIM'}
                                onChange={e => setFormData({
                                  ...formData,
                                  proprietario: {
                                    ...formData.proprietario,
                                    naoPossuiCelular: e.target.checked ? 'SIM' : 'NÃO',
                                    telefone: e.target.checked ? '' : formData.proprietario.telefone
                                  }
                                })}
                              />
                              <label htmlFor="no-cel" className="mb-0 text-xs select-none">Não possui</label>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label font-medium text-slate-700">E-mail</label>
                          <div className="input-group">
                            <input type="email" className="form-control rounded-l-xl" placeholder="contato@exemplo.com" disabled={formData.proprietario.naoPossuiEmail === 'SIM'} required={formData.proprietario.naoPossuiEmail === 'NÃO'} value={formData.proprietario.email} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, email: e.target.value } })} />
                            <div className="input-group-text gap-1 rounded-r-xl">
                              <input type="checkbox" id="no-mail" checked={formData.proprietario.naoPossuiEmail === 'SIM'} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, naoPossuiEmail: e.target.checked ? 'SIM' : 'NÃO', email: e.target.checked ? '' : formData.proprietario.email } })} />
                              <label htmlFor="no-mail" className="mb-0 text-xs select-none">Não possui</label>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label font-medium text-slate-700">Autoriza Comunicação DETRAN?</label>
                          <select className="form-select rounded-xl" value={formData.proprietario.autorizacao} onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, autorizacao: e.target.value } })}>
                            <option value="SIM">SIM</option>
                            <option value="NÃO">NÃO</option>
                          </select>
                        </div>
                        {formData.servico === 'Primeiro Emplacamento' && (
                          <div className="col-md-4">
                            <label className="form-label font-medium text-slate-700">Haverá Reserva de Placas?</label>
                            <select className="form-select rounded-xl" value={formData.veiculo.reservaPlaca} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, reservaPlaca: e.target.value } })}>
                              <option value="NÃO">Não</option>
                              <option value="SIM">Sim</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 2. Seção: Veículo */}
                    <div className="mb-5">
                      <h5 className="border-bottom border-slate-100 pb-2 mb-4 flex items-center text-slate-700 font-semibold">
                        <Car size={18} className="me-2 text-[#2C3E50]" /> Dados do Veículo
                      </h5>
                      <div className="row g-3">
                        {formData.servico !== 'Primeiro Emplacamento' && (
                          <div className="col-md-4">
                            <label className="form-label font-medium text-slate-700">Placa</label>
                            <input type="text" className="form-control rounded-xl text-uppercase" placeholder="ABC-1234" required value={formData.veiculo.placa} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, placa: e.target.value } })} />
                          </div>
                        )}
                        <div className="col-md-4">
                          <label className="form-label font-medium text-slate-700">Renavam</label>
                          <input type="text" className="form-control rounded-xl" placeholder={formData.servico === 'Primeiro Emplacamento' ? "Opcional (Zero KM)" : "Obrigatório"} required={formData.servico !== 'Primeiro Emplacamento'} value={formData.veiculo.renavam} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, renavam: e.target.value } })} />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label font-medium text-slate-700">Chassi</label>
                          <input type="text" className="form-control rounded-xl text-uppercase" maxLength={17} required value={formData.veiculo.chassi} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, chassi: e.target.value } })} />
                        </div>
                        <div className="col-md-8">
                          <label className="form-label font-medium text-slate-700">Marca / Modelo</label>
                          <input type="text" className="form-control rounded-xl" required value={formData.veiculo.modelo} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, modelo: e.target.value } })} />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label font-medium text-slate-700">Ano</label>
                          <input type="number" className="form-control rounded-xl" required value={formData.veiculo.ano} onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, ano: parseInt(e.target.value) } })} />
                        </div>
                      </div>
                    </div>

                    {/* 3. Seção: Restrição Financeira */}
                    <div className="mb-5">
                      <h5 className="border-bottom border-slate-100 pb-2 mb-4 flex items-center text-slate-700 font-semibold">
                        <Shield size={18} className="me-2 text-[#2C3E50]" /> Restrição Financeira
                      </h5>
                      <div className="row g-3">
                        <div className="col-md-4">
                          <label className="form-label font-medium text-slate-700">Haverá Restrição?</label>
                          <select className="form-select rounded-xl" value={formData.restricaoFinanceira.havera} onChange={e => {
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
                              <select className="form-select rounded-xl" value={formData.restricaoFinanceira.modalidade} onChange={e => setFormData({ ...formData, restricaoFinanceira: { ...formData.restricaoFinanceira, modalidade: e.target.value } })} required>
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
                              <label className="form-label font-medium text-slate-700">Tipo de Credor</label>
                              <select className="form-select rounded-xl" value={formData.restricaoFinanceira.tipoCredor} onChange={e => setFormData({ ...formData, restricaoFinanceira: { ...formData.restricaoFinanceira, tipoCredor: e.target.value } })} required>
                                <option value="">Selecione...</option>
                                <option value="Pessoa Física">Pessoa Física</option>
                                <option value="Pessoa Jurídica">Pessoa Jurídica</option>
                              </select>
                            </div>
                            <div className="col-12 mt-3">
                              <label className="form-label font-medium text-slate-700">Agente Financeiro:</label>
                              <input type="text" className="form-control rounded-xl" placeholder="Digite o nome ou documento do credor" required value={formData.restricaoFinanceira.nomeCredor || ''} onChange={e => setFormData({ ...formData, restricaoFinanceira: { ...formData.restricaoFinanceira, nomeCredor: e.target.value } })} />
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 4. Seção: Serviço Solicitado (Posicionado ao final do fluxo) */}
                    <div className="mb-5 relative">
                      <h5 className="border-bottom border-slate-100 pb-2 mb-4 flex items-center text-slate-700 font-semibold">
                        <FileText size={18} className="me-2 text-[#2C3E50]" /> Serviço Solicitado
                      </h5>
                      <div className="bg-white p-4 border border-slate-200 rounded-xl flex flex-col gap-3 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                          <button type="button" onClick={() => { setIsModalAberto(true); setSearchTerm(''); }} className="bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 px-6 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap w-auto min-w-max cursor-pointer">📄 Escolha o Serviço</button>
                        </div>

                        {formData.servico === '2ª via do CRV' && (
                          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 bg-blue-50/70 p-3 rounded-lg border border-blue-100">
                            <div>
                              <span className="font-bold text-blue-900">Anexo 1 (POP 10):</span>{' '}
                              <span>{segundaViaCrv.tipoSolicitacao === 'SEGUNDA_VIA' ? 'Solicitação de 2ª via de CRV/ATPV-e' : `Validação do CRV nº ${segundaViaCrv.numeroCrvValidacao || 'não informado'}`}</span>
                              <span className="mx-1.5 text-slate-400">•</span>
                              <span>
                                Justificativa:{' '}
                                {segundaViaCrv.justificativa === 'NAO_RECEBIDO' && 'Não recebido'}
                                {segundaViaCrv.justificativa === 'INUTILIZADO' && 'Inutilizado'}
                                {segundaViaCrv.justificativa === 'EXTRAVIADO' && 'Perdido/extraviado'}
                                {segundaViaCrv.justificativa === 'FURTADO' && 'Furtado/roubado'}
                              </span>
                              {segundaViaCrv.dataEmissaoAnterior && (
                                <>
                                  <span className="mx-1.5 text-slate-400">•</span>
                                  <span>Data anterior: {segundaViaCrv.dataEmissaoAnterior}</span>
                                </>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsModalSegundaViaAberto(true)}
                              className="text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer text-xs flex-shrink-0"
                            >
                              Configurar opções POP 10
                            </button>
                          </div>
                        )}

                        {formData.servico === 'Baixa de Veículo - Simples' && (
                          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 bg-amber-50/70 p-3 rounded-lg border border-amber-200">
                            <div>
                              <span className="font-bold text-amber-900">Anexo 1 (POP 25):</span>{' '}
                              <span className="font-medium text-slate-800">
                                {baixaDefinitiva.motivo === 'IRRECUPERAVEL' && 'Veículo irrecuperável'}
                                {baixaDefinitiva.motivo === 'DESMONTADO' && 'Veículo definitivamente desmontado'}
                                {baixaDefinitiva.motivo === 'SINISTRADO_PT' && 'Veículo sinistrado com perda total'}
                                {baixaDefinitiva.motivo === 'SUCATA' && 'Vendido/leiloado como sucata'}
                                {baixaDefinitiva.motivo === 'OUTRO_PAIS' && 'Baixa para outro País'}
                              </span>
                              <span className="mx-1.5 text-slate-400">•</span>
                              <span>
                                Extravios:{' '}
                                {[
                                  baixaDefinitiva.extravios.crv && 'CRV',
                                  baixaDefinitiva.extravios.placas && 'Placas',
                                  baixaDefinitiva.extravios.plaquetas && 'Plaquetas',
                                  baixaDefinitiva.extravios.lacre && 'Lacre'
                                ].filter(Boolean).join(', ') || 'Nenhum'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsModalBaixaDefinitivaAberto(true)}
                              className="text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer text-xs flex-shrink-0"
                            >
                              Configurar opções POP 25
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {error && <div className="alert alert-danger d-flex align-items-center mb-4"><AlertTriangle size={20} className="me-2 flex-shrink-0" />{error}</div>}

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
                    } else if (s === '2ª via do CRV') {
                      setFormData({
                        ...formData,
                        servico: s,
                        veiculo: {
                          ...formData.veiculo,
                          reservaPlaca: 'NÃO',
                          impressaoCrlv: 'NÃO',
                          emissaoCertidao: 'NÃO'
                        }
                      });
                      setIsModalSegundaViaAberto(true);
                    } else if (s === 'Baixa de Veículo - Simples') {
                      setFormData({
                        ...formData,
                        servico: s,
                        veiculo: {
                          ...formData.veiculo,
                          reservaPlaca: 'NÃO',
                          impressaoCrlv: 'NÃO',
                          emissaoCertidao: 'NÃO'
                        }
                      });
                      setIsModalBaixaDefinitivaAberto(true);
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

      {/* ============================================
          MODAL: 2ª VIA DO CRV / VALIDAÇÃO (POP 10)
      ============================================ */}
      {isModalSegundaViaAberto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-md">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fadeIn">
            {/* Cabeçalho */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xl font-bold">
                  📄
                </div>
                <div>
                  <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">DetranRS • POP 10 (Anexo 1 - Página 11)</p>
                  <h3 className="text-slate-900 font-bold text-lg leading-tight">Requerimento de 2ª Via de CRV/ATPV-e ou Validação</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalSegundaViaAberto(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-light leading-none p-1 transition-colors"
                title="Fechar"
              >
                &times;
              </button>
            </div>

            {/* Corpo com Scroll */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* 1. Tipo de Requerimento */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">
                  1. Tipo de Requerimento (Selecione uma opção):
                </label>
                <div className="space-y-3">
                  {/* Opção: 2ª Via */}
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      segundaViaCrv.tipoSolicitacao === 'SEGUNDA_VIA'
                        ? 'border-blue-600 bg-blue-50/50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tipoSolicitacao"
                      value="SEGUNDA_VIA"
                      checked={segundaViaCrv.tipoSolicitacao === 'SEGUNDA_VIA'}
                      onChange={() => setSegundaViaCrv(prev => ({ ...prev, tipoSolicitacao: 'SEGUNDA_VIA' }))}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 text-sm">Solicitação de 2ª via de CRV/ATPV-e</span>
                      <p className="text-xs text-slate-500">Emissão de novo documento CRV/ATPV-e pelo DETRAN/RS</p>
                    </div>
                  </label>

                  {/* Opção: Validação */}
                  <div
                    className={`p-3.5 rounded-xl border-2 transition-all ${
                      segundaViaCrv.tipoSolicitacao === 'VALIDACAO'
                        ? 'border-blue-600 bg-blue-50/50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="tipoSolicitacao"
                        value="VALIDACAO"
                        checked={segundaViaCrv.tipoSolicitacao === 'VALIDACAO'}
                        onChange={() => setSegundaViaCrv(prev => ({ ...prev, tipoSolicitacao: 'VALIDACAO' }))}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                      />
                      <div className="flex-1">
                        <span className="font-semibold text-slate-800 text-sm">Validação do CRV número</span>
                        <p className="text-xs text-slate-500">Para efeitos de transferência de propriedade do veículo</p>
                      </div>
                    </label>

                    {segundaViaCrv.tipoSolicitacao === 'VALIDACAO' && (
                      <div className="mt-3 pl-7">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Número do CRV a ser validado:
                        </label>
                        <input
                          type="text"
                          placeholder="Digite o número do CRV"
                          value={segundaViaCrv.numeroCrvValidacao}
                          onChange={e => setSegundaViaCrv(prev => ({ ...prev, numeroCrvValidacao: e.target.value }))}
                          className="w-full text-sm font-medium border border-slate-300 rounded-lg px-3 py-2 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Data de emissão do documento anterior */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  2. Data de emissão do documento anterior pelo DETRAN/RS:
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Informe a data do CRV/ATPV-e anterior válido (deixe em branco se não souber):
                </p>
                <input
                  type="text"
                  placeholder="DD/MM/AAAA (ex: 15/05/2020)"
                  maxLength={10}
                  value={segundaViaCrv.dataEmissaoAnterior}
                  onChange={e => setSegundaViaCrv(prev => ({ ...prev, dataEmissaoAnterior: formatarData(e.target.value) }))}
                  className="w-full sm:w-64 text-sm font-medium border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* 3. Motivo / Justificativa da não apresentação */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">
                  3. Motivo / Justificativa da não apresentação (Obrigatório):
                </label>
                <div className="space-y-2.5">
                  {[
                    { id: 'NAO_RECEBIDO', label: 'Não recebido' },
                    { id: 'INUTILIZADO', label: 'Inutilizado (deverá acompanhar o documento no estado em que se encontra)' },
                    { id: 'EXTRAVIADO', label: 'Perdido/extraviado (deverá acompanhar Boletim de Ocorrência Policial do fato)' },
                    { id: 'FURTADO', label: 'Furtado/roubado (deverá acompanhar Boletim de Ocorrência Policial do fato)' }
                  ].map(item => (
                    <label
                      key={item.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        segundaViaCrv.justificativa === item.id
                          ? 'border-blue-600 bg-blue-50/60 font-medium'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="justificativa"
                        value={item.id}
                        checked={segundaViaCrv.justificativa === item.id}
                        onChange={() => setSegundaViaCrv(prev => ({ ...prev, justificativa: item.id as any }))}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                      />
                      <span className="text-sm text-slate-800 leading-snug">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Rodapé de Ações */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalSegundaViaAberto(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-sm transition-colors"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormData(prev => ({ ...prev, servico: '2ª via do CRV' }));
                  setIsModalSegundaViaAberto(false);
                }}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all"
              >
                Confirmar Opções
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ============================================
          MODAL: BAIXA DEFINITIVA (POP 25 - ANEXO 1)
      ============================================ */}
      {isModalBaixaDefinitivaAberto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-md">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fadeIn">
            {/* Cabeçalho */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xl font-bold">
                  ⚠️
                </div>
                <div>
                  <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">DetranRS • POP 25 (Anexo 1 - Página 7)</p>
                  <h3 className="text-slate-900 font-bold text-lg leading-tight">Requerimento para Baixa Definitiva (Res. CONTRAN 967/22)</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalBaixaDefinitivaAberto(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-light leading-none p-1 transition-colors"
                title="Fechar"
              >
                &times;
              </button>
            </div>

            {/* Corpo com Scroll */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* 1. Motivo da Baixa Definitiva */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">
                  1. Motivo da Baixa Definitiva (Seleção obrigatória):
                </label>
                <div className="space-y-2.5">
                  {[
                    { id: 'IRRECUPERAVEL', label: 'Veículo irrecuperável', desc: 'Inapto a transitar ou sem condições de recuperação' },
                    { id: 'DESMONTADO', label: 'Veículo definitivamente desmontado', desc: 'Desmontagem completa da estrutura veicular' },
                    { id: 'SINISTRADO_PT', label: 'Veículo sinistrado com laudo de perda total', desc: 'Sinistro com laudo técnico pericial de perda total' },
                    { id: 'SUCATA', label: 'Veículo vendido ou leiloado como sucata', desc: 'Destinação exclusiva para reciclagem ou desmanche credenciado' },
                    { id: 'OUTRO_PAIS', label: 'Baixa de Veículo para outro País conforme decalque ou fotografia da gravação do número do chassi, em anexo.', desc: 'Exportação / transferência definitiva internacional' }
                  ].map(item => (
                    <label
                      key={item.id}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                        baixaDefinitiva.motivo === item.id
                          ? 'border-amber-600 bg-amber-50/60 font-medium'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="motivoBaixa"
                        value={item.id}
                        checked={baixaDefinitiva.motivo === item.id}
                        onChange={() => setBaixaDefinitiva(prev => ({ ...prev, motivo: item.id as any }))}
                        className="mt-1 h-4 w-4 text-amber-600 focus:ring-amber-500 border-slate-300"
                      />
                      <div>
                        <span className="text-sm text-slate-800 font-semibold leading-snug">{item.label}</span>
                        <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 2. Declaração de Perda / Extravio */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">
                  2. Declaração de Perda / Extravio de Elementos:
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  Marque os documentos ou elementos que foram perdidos ou extraviados (se houver):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: 'crv', label: 'CRV (se veículo verde)', desc: 'Certificado de Registro de Veículo em papel-moeda' },
                    { key: 'placas', label: 'Placas', desc: 'Dianteira e/ou traseira extraviadas' },
                    { key: 'plaquetas', label: 'Plaquetas', desc: 'Plaquetas identificadoras de identificação' },
                    { key: 'lacre', label: 'Lacre', desc: 'Lacre da placa rompido ou extraviado' }
                  ].map(ext => (
                    <label
                      key={ext.key}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        baixaDefinitiva.extravios[ext.key as keyof typeof baixaDefinitiva.extravios]
                          ? 'border-amber-600 bg-amber-50/60'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={baixaDefinitiva.extravios[ext.key as keyof typeof baixaDefinitiva.extravios]}
                        onChange={e => {
                          const checked = e.target.checked;
                          setBaixaDefinitiva(prev => ({
                            ...prev,
                            extravios: {
                              ...prev.extravios,
                              [ext.key]: checked
                            }
                          }));
                        }}
                        className="mt-1 h-4 w-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
                      />
                      <div>
                        <span className="text-sm font-semibold text-slate-800">{ext.label}</span>
                        <p className="text-xs text-slate-500">{ext.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Rodapé de Ações */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalBaixaDefinitivaAberto(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-sm transition-colors"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormData(prev => ({ ...prev, servico: 'Baixa de Veículo - Simples' }));
                  setIsModalBaixaDefinitivaAberto(false);
                }}
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all"
              >
                Confirmar Opções
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}