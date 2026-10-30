import React, { useState, useEffect, useRef } from 'react';
import { Shield, Car, User, FileText, CheckCircle, AlertTriangle, ShoppingCart, ArrowLeftRight, Home, CreditCard, Sparkles, Search, Loader2, FileCheck, RotateCcw, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { canSwitchModules, UserRole } from './types/auth';
import ModalCatalogoServicosCRVA from './components/crva/ModalCatalogoServicosCRVA';
import { supabase } from './lib/supabase';

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

const formatarPlaca = (valor: string) => {
  const limpo = valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  if (limpo.length > 3) {
    return `${limpo.slice(0, 3)}-${limpo.slice(3)}`;
  }
  return limpo;
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
  onSwitchModule?: (modulo: 'crva' | 'pdv') => void;
  onVoltarGateway?: () => void;
}

export default function ModuloCRVA({ 
  usuario, 
  onLogout, 
  onSwitchModule, 
  onVoltarGateway 
}: ModuloCRVAProps) {
  const userRole: UserRole = usuario?.role || (usuario?.funcao?.toLowerCase().includes('financeiro') ? 'financeiro' : (usuario?.funcao?.toLowerCase().includes('master') ? 'master' : (usuario?.funcao?.toLowerCase().includes('gerente') ? 'gerente' : 'atendente')));
  const podeTrocarModulo = canSwitchModules(userRole);
  const logado = JSON.parse(sessionStorage.getItem('user') || '{}');

  const [formData, setFormData] = useState({
    proprietario: {
      nome: '',
      cpfCnpj: '',
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
    veiculo: {
      placa: '',
      renavam: '',
      chassi: '',
      modelo: '',
      ano: new Date().getFullYear(),
      anoModelo: new Date().getFullYear(),
      cor: '',
      reservaPlaca: 'NÃO'
    },
    restricaoFinanceira: { havera: 'NÃO', modalidade: '', tipoCredor: '', nomeCredor: '' },
    servico: ''
  });

  // Estados de Entidades Independentes (Clientes por CPF e Veículos por Placa)
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [veiculoId, setVeiculoId] = useState<string | null>(null);
  const [clienteCarregado, setClienteCarregado] = useState(false);
  const [veiculoCarregado, setVeiculoCarregado] = useState(false);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [buscandoVeiculo, setBuscandoVeiculo] = useState(false);
  const cpfInputRef = useRef<HTMLInputElement>(null);
  const debounceCpfRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncePlacaRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cpfInputRef.current?.focus();
    return () => {
      if (debounceCpfRef.current) clearTimeout(debounceCpfRef.current);
      if (debouncePlacaRef.current) clearTimeout(debouncePlacaRef.current);
    };
  }, []);

  // Estado e Modal da 2ª Via do CRV (POP 10 - Anexo 1)
  const [segundaViaCrv, setSegundaViaCrv] = useState<SegundaViaCrvData>(estadoInicialSegundaVia);
  const [isModalSegundaViaAberto, setIsModalSegundaViaAberto] = useState(false);

  // Estado e Modal da Baixa Definitiva (POP 25 - Anexo 1)
  const [baixaDefinitiva, setBaixaDefinitiva] = useState<BaixaDefinitivaData>(estadoInicialBaixaDefinitiva);
  const [isModalBaixaDefinitivaAberto, setIsModalBaixaDefinitivaAberto] = useState(false);

  // Estado e Modal de Lançamento de Comanda no Caixa (Segregação de Funções)
  const [isModalComandaAberto, setIsModalComandaAberto] = useState(false);
  const [comandaEnviadaId, setComandaEnviadaId] = useState<string | null>(null);

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
      veiculo: {
        placa: '',
        renavam: '',
        chassi: '',
        modelo: '',
        ano: new Date().getFullYear(),
        anoModelo: new Date().getFullYear(),
        cor: '',
        reservaPlaca: 'NÃO'
      },
      restricaoFinanceira: { havera: 'NÃO', modalidade: '', tipoCredor: '', nomeCredor: '' },
      servico: ''
    });
    setClienteId(null);
    setVeiculoId(null);
    setClienteCarregado(false);
    setVeiculoCarregado(false);
    setSegundaViaCrv(estadoInicialSegundaVia);
    setIsModalSegundaViaAberto(false);
    setBaixaDefinitiva(estadoInicialBaixaDefinitiva);
    setIsModalBaixaDefinitivaAberto(false);
    setSearchTerm('');
    setIsModalAberto(false);
    setIsModalComandaAberto(false);
    setComandaEnviadaId(null);
    setError(null);
    setResult(null);
    setPdfUrl(null);
    setTimeout(() => cpfInputRef.current?.focus(), 50);
  };

  // Busca automática do Cliente por CPF (Entidade Independente)
  const buscarClientePorCpf = async (cpfFormatado: string) => {
    const digitos = cpfFormatado.replace(/\D/g, '');
    if (digitos.length < 11) {
      setClienteCarregado(false);
      setClienteId(null);
      return;
    }

    try {
      setBuscandoCliente(true);
      let { data: clienteExistente } = await supabase
        .from('clientes')
        .select('*')
        .eq('cpf', cpfFormatado)
        .maybeSingle();

      // Fallback para busca pelos dígitos puros caso tenha sido salvo sem máscara
      if (!clienteExistente && digitos !== cpfFormatado) {
        const resDigitos = await supabase
          .from('clientes')
          .select('*')
          .eq('cpf', digitos)
          .maybeSingle();
        clienteExistente = resDigitos.data;
      }

      // Fallback de cache local caso a tabela ainda esteja sendo migrada
      if (!clienteExistente) {
        try {
          const cacheRaw = localStorage.getItem('integra_clientes_cache');
          const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
          clienteExistente = cache[cpfFormatado] || cache[digitos] || null;
        } catch {
          // ignora erro de storage
        }
      }

      if (clienteExistente) {
        setClienteId(clienteExistente.id || null);
        setClienteCarregado(true);
        setFormData(prev => ({
          ...prev,
          proprietario: {
            ...prev.proprietario,
            cpfCnpj: cpfFormatado,
            nome: clienteExistente.nome_razao || prev.proprietario.nome,
            telefone: clienteExistente.telefone || prev.proprietario.telefone,
            email: clienteExistente.email || prev.proprietario.email,
            cep: clienteExistente.cep || prev.proprietario.cep,
            logradouro: clienteExistente.logradouro || prev.proprietario.logradouro,
            numero: clienteExistente.numero || prev.proprietario.numero,
            complemento: clienteExistente.complemento || prev.proprietario.complemento,
            bairro: clienteExistente.bairro || prev.proprietario.bairro,
            cidade: clienteExistente.cidade || prev.proprietario.cidade,
            uf: clienteExistente.uf || prev.proprietario.uf || 'RS',
            naoPossuiCelular: clienteExistente.telefone ? 'NÃO' : prev.proprietario.naoPossuiCelular,
            naoPossuiEmail: clienteExistente.email ? 'NÃO' : prev.proprietario.naoPossuiEmail,
          }
        }));
      } else {
        setClienteId(null);
        if (clienteCarregado) {
          // Limpa os dados carregados do cliente anterior mantendo o novo CPF digitado
          setFormData(prev => ({
            ...prev,
            proprietario: {
              ...prev.proprietario,
              cpfCnpj: cpfFormatado,
              nome: '',
              telefone: '',
              email: '',
              cep: '',
              logradouro: '',
              numero: '',
              complemento: '',
              bairro: '',
              cidade: '',
              uf: 'RS',
            }
          }));
        }
        setClienteCarregado(false);
      }
    } catch (err) {
      console.warn('Erro ao consultar cliente por CPF:', err);
      setClienteCarregado(false);
    } finally {
      setBuscandoCliente(false);
    }
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = formatarCPF(e.target.value);
    setFormData(prev => ({ ...prev, proprietario: { ...prev.proprietario, cpfCnpj: masked } }));

    if (debounceCpfRef.current) clearTimeout(debounceCpfRef.current);
    const digitos = masked.replace(/\D/g, '');
    if (digitos.length === 11 || digitos.length === 14) {
      debounceCpfRef.current = setTimeout(() => {
        buscarClientePorCpf(masked);
      }, 280);
    } else {
      setClienteCarregado(false);
      setClienteId(null);
    }
  };

  // Busca automática do Veículo por Placa (Entidade Independente)
  const buscarVeiculoPorPlaca = async (placaInput: string) => {
    const placaLimpa = placaInput.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (placaLimpa.length < 7) {
      setVeiculoCarregado(false);
      setVeiculoId(null);
      return;
    }

    const placaFormatada = formatarPlaca(placaLimpa);
    const placaLimpaOuFormatada = placaFormatada;

    try {
      setBuscandoVeiculo(true);
      let { data: veiculoExistente } = await supabase
        .from('veiculos')
        .select('*')
        .eq('placa', placaLimpaOuFormatada)
        .maybeSingle();

      // Tenta sem hífen caso esteja armazenado no formato contínuo AAA0A00
      if (!veiculoExistente && placaLimpa !== placaLimpaOuFormatada) {
        const resSemHifen = await supabase
          .from('veiculos')
          .select('*')
          .eq('placa', placaLimpa)
          .maybeSingle();
        veiculoExistente = resSemHifen.data;
      }

      // Fallback de cache local
      if (!veiculoExistente) {
        try {
          const cacheRaw = localStorage.getItem('integra_veiculos_cache');
          const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
          veiculoExistente = cache[placaFormatada] || cache[placaLimpa] || null;
        } catch {
          // ignora
        }
      }

      if (veiculoExistente) {
        setVeiculoId(veiculoExistente.id || null);
        setVeiculoCarregado(true);
        setFormData(prev => ({
          ...prev,
          veiculo: {
            ...prev.veiculo,
            placa: placaFormatada,
            modelo: veiculoExistente.marca_modelo || veiculoExistente.modelo || prev.veiculo.modelo,
            chassi: veiculoExistente.chassi || prev.veiculo.chassi,
            renavam: veiculoExistente.renavam || prev.veiculo.renavam,
            ano: Number(veiculoExistente.ano_fabricacao || veiculoExistente.ano || prev.veiculo.ano),
            anoModelo: Number(veiculoExistente.ano_modelo || veiculoExistente.ano_fabricacao || prev.veiculo.anoModelo),
            cor: veiculoExistente.cor || prev.veiculo.cor,
          }
        }));
      } else {
        setVeiculoId(null);
        if (veiculoCarregado) {
          setFormData(prev => ({
            ...prev,
            veiculo: {
              ...prev.veiculo,
              placa: placaFormatada,
              modelo: '',
              chassi: '',
              renavam: '',
              ano: new Date().getFullYear(),
              anoModelo: new Date().getFullYear(),
              cor: '',
            }
          }));
        }
        setVeiculoCarregado(false);
      }
    } catch (err) {
      console.warn('Erro ao consultar veículo por placa:', err);
      setVeiculoCarregado(false);
    } finally {
      setBuscandoVeiculo(false);
    }
  };

  const handlePlacaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = formatarPlaca(e.target.value);
    setFormData(prev => ({ ...prev, veiculo: { ...prev.veiculo, placa: masked } }));

    if (debouncePlacaRef.current) clearTimeout(debouncePlacaRef.current);
    const alfanum = masked.replace(/[^A-Z0-9]/g, '');
    if (alfanum.length === 7) {
      debouncePlacaRef.current = setTimeout(() => {
        buscarVeiculoPorPlaca(masked);
      }, 280);
    } else {
      setVeiculoCarregado(false);
      setVeiculoId(null);
    }
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

      // 1. Gravação Separada e Independente (Upsert) no Supabase
      const dadosCliente = {
        cpf: formData.proprietario.cpfCnpj.trim(),
        nome: formData.proprietario.nome.trim(),
        telefone: formData.proprietario.naoPossuiCelular === 'SIM' ? null : (formData.proprietario.telefone.trim() || null),
        email: formData.proprietario.naoPossuiEmail === 'SIM' ? null : (formData.proprietario.email.trim() || null),
        rg: null,
        cep: formData.proprietario.cep.trim() || null,
        logradouro: formData.proprietario.logradouro.trim() || null,
        numero: formData.proprietario.numero.trim() || null,
        complemento: formData.proprietario.complemento.trim() || null,
        bairro: formData.proprietario.bairro.trim() || null,
        cidade: formData.proprietario.cidade.trim() || null,
        uf: formData.proprietario.uf || 'RS',
      };

      const placaEfetiva = (formData.veiculo.placa || placaReservadaInput.trim()).toUpperCase();
      const dadosVeiculo = {
        placa: placaEfetiva,
        marcaModelo: formData.veiculo.modelo.trim() || null,
        chassi: formData.veiculo.chassi.trim().toUpperCase() || null,
        renavam: formData.veiculo.renavam.trim() || null,
        anoFabricacao: Number(formData.veiculo.ano) || null,
        anoModelo: Number(formData.veiculo.anoModelo || formData.veiculo.ano) || null,
        cor: formData.veiculo.cor.trim() || null,
      };

      // Upsert na tabela 'clientes' com conflito em 'cpf'
      if (dadosCliente.cpf) {
        try {
          const payloadCliente = {
            cpf: dadosCliente.cpf,
            nome_razao: dadosCliente.nome,
            tipo_pessoa: dadosCliente.cpf.replace(/\D/g, '').length > 11 ? 'PJ' : 'PF',
            telefone: dadosCliente.telefone,
            email: dadosCliente.email,
            rg_ie: dadosCliente.rg,
            cep: dadosCliente.cep,
            logradouro: dadosCliente.logradouro,
            numero: dadosCliente.numero,
            complemento: dadosCliente.complemento,
            bairro: dadosCliente.bairro,
            cidade: dadosCliente.cidade,
            uf: dadosCliente.uf,
            atualizado_em: new Date().toISOString()
          };
          const { data: cliSalvo } = await supabase
            .from('clientes')
            .upsert(payloadCliente, { onConflict: 'cpf' })
            .select('id')
            .maybeSingle();

          if (cliSalvo?.id) {
            setClienteId(cliSalvo.id);
          }

          // Atualiza cache local para contingência imediata
          const cacheRaw = localStorage.getItem('integra_clientes_cache');
          const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
          cache[dadosCliente.cpf] = { id: cliSalvo?.id || clienteId, ...payloadCliente };
          localStorage.setItem('integra_clientes_cache', JSON.stringify(cache));
        } catch (errUpsertCli) {
          console.warn('Aviso ao realizar upsert em clientes:', errUpsertCli);
        }
      }

      // Upsert na tabela 'veiculos' com conflito em 'placa' (se houver dados de veículo preenchidos)
      if (dadosVeiculo.placa) {
        try {
          const payloadVeiculo = {
            placa: dadosVeiculo.placa.toUpperCase(),
            marca_modelo: dadosVeiculo.marcaModelo,
            chassi: dadosVeiculo.chassi,
            renavam: dadosVeiculo.renavam,
            ano_fabricacao: dadosVeiculo.anoFabricacao,
            ano_modelo: dadosVeiculo.anoModelo,
            cor: dadosVeiculo.cor,
            atualizado_em: new Date().toISOString()
          };
          const { data: veiSalvo } = await supabase
            .from('veiculos')
            .upsert(payloadVeiculo, { onConflict: 'placa' })
            .select('id')
            .maybeSingle();

          if (veiSalvo?.id) {
            setVeiculoId(veiSalvo.id);
          }

          // Atualiza cache local para contingência imediata
          const cacheRaw = localStorage.getItem('integra_veiculos_cache');
          const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
          cache[dadosVeiculo.placa.toUpperCase()] = { id: veiSalvo?.id || veiculoId, ...payloadVeiculo };
          localStorage.setItem('integra_veiculos_cache', JSON.stringify(cache));
        } catch (errUpsertVei) {
          console.warn('Aviso ao realizar upsert em veiculos:', errUpsertVei);
        }
      }

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
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-4 md:px-8 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.06),rgba(255,255,255,0))] font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Top Navbar Corporativa Dark */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 no-print" style={{ boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.5)' }}>
        <div className="container max-w-5xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="font-black text-white tracking-tight text-lg">INTEGRA CRVA</span>
            <span className="px-2.5 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 rounded-md text-xs font-bold uppercase tracking-wider">
              Módulo Balcão
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {podeTrocarModulo && onSwitchModule && (
              <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60 cursor-default flex items-center gap-1.5"
                >
                  <FileText size={13} className="text-emerald-400" />
                  <span>CRVA (Ativo)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchModule('pdv')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer border-0 flex items-center gap-1.5"
                  title="Transitar para o Módulo Frente de Caixa e Financeiro (PDV)"
                >
                  <ShoppingCart size={13} className="text-emerald-500" />
                  <span>Módulo PDV</span>
                </button>
              </div>
            )}

            {onVoltarGateway && (
              <button
                type="button"
                onClick={onVoltarGateway}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Voltar ao Gateway de Módulos"
              >
                <Home size={14} />
                <span>Gateway</span>
              </button>
            )}

            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700/70 flex items-center justify-center text-slate-300">
                <User size={16} />
              </div>
              <div className="text-sm font-medium text-slate-400">
                Operador: <span className="font-bold text-slate-200">{getUsuarioIdentificador()}</span>
                <span className="text-slate-600 mx-2">|</span>
                <span className="uppercase text-emerald-400 font-bold" style={{ fontSize: '11px', letterSpacing: '0.05em' }}>{usuario?.funcao || 'OPERADOR'}</span>
              </div>
            </div>
            <div className="h-5 w-px bg-slate-800"></div>
            <button onClick={onLogout} className="text-sm font-semibold text-slate-400 hover:text-rose-400 transition-colors cursor-pointer bg-transparent border-0 p-0">Sair</button>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <div className="container max-w-5xl mx-auto px-2 sm:px-4 pt-16 pb-12">
        <header className="mb-8 text-center no-print">
          <div className="flex justify-center mb-4">
            <img
              src={logoOficial}
              alt="Integra CRVA Logo"
              className="h-auto max-h-[96px] object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] rounded-xl"
              referrerPolicy="no-referrer"
              onError={(e) => { const target = e.target as HTMLImageElement; target.style.display = 'none'; }}
            />
          </div>
          <div className="text-center sm:text-left mt-2 mb-2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 pb-4 border-b border-slate-800/80">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Atendimento Balcão CRVA</h1>
              <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">Plataforma INTEGRA — Emissão Segura de Requerimentos Oficiais DETRAN-RS</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Terminal Ativo
              </span>
            </div>
          </div>
        </header>

        <div className="w-full">
          {!result ? (
            <motion.div initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }}>
              <form onSubmit={handleSubmit} noValidate>

                {/* 1. CARD: Dados do Proprietário / Requerente */}
                <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md mb-6 transition-all hover:border-slate-700/60">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-slate-800 border border-slate-700/60 text-emerald-400">
                        <User size={18} />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-white tracking-tight">Dados do Proprietário / Requerente</h2>
                        <p className="text-xs text-slate-400">Identificação estrita por CPF e dados cadastrais</p>
                      </div>
                    </div>
                    {clienteCarregado && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 shadow-sm animate-fadeIn">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        Cliente Cadastrado - Dados Carregados
                      </span>
                    )}
                  </div>

                  {/* Linha 1: Destaque Principal (CPF 40% / Nome 60%) */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
                    <div className="md:col-span-5">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>CPF do Requerente / Cliente</span>
                        {buscandoCliente && (
                          <span className="text-[11px] text-emerald-400 font-semibold animate-pulse flex items-center gap-1 normal-case">
                            <Loader2 size={11} className="animate-spin" /> Buscando...
                          </span>
                        )}
                      </label>
                      <input
                        ref={cpfInputRef}
                        type="text"
                        autoFocus
                        className="w-full bg-slate-950/90 border border-emerald-500/40 rounded-xl px-4 py-2.5 text-emerald-300 font-mono font-bold text-base placeholder-slate-600 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 shadow-inner transition-all"
                        placeholder="000.000.000-00"
                        maxLength={18}
                        required
                        value={formData.proprietario.cpfCnpj}
                        onChange={handleCpfChange}
                        onBlur={() => buscarClientePorCpf(formData.proprietario.cpfCnpj)}
                      />
                    </div>
                    <div className="md:col-span-7">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Nome Completo / Razão Social
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                        placeholder="Nome completo do requerente"
                        required
                        value={formData.proprietario.nome}
                        onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, nome: e.target.value } })}
                      />
                    </div>
                  </div>

                  {/* Linha 2 (Endereço): CEP, Logradouro e Número */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
                    <div className="md:col-span-3">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>CEP</span>
                        {buscandoCep && (
                          <span className="text-[11px] text-emerald-400 font-semibold animate-pulse normal-case">
                            Buscando...
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm font-mono"
                        placeholder="00000-000"
                        maxLength={9}
                        required
                        value={formData.proprietario.cep}
                        onChange={handleCepChange}
                        onBlur={() => buscarCep(formData.proprietario.cep)}
                      />
                    </div>
                    <div className="md:col-span-7">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Logradouro / Endereço Completo
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                        placeholder="Ex: Rua, Avenida, Travessa"
                        required
                        value={formData.proprietario.logradouro}
                        onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, logradouro: e.target.value } })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Número
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                        placeholder="Ex: 123 ou S/N"
                        required
                        value={formData.proprietario.numero}
                        onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, numero: e.target.value } })}
                      />
                    </div>
                  </div>

                  {/* Linha 3: Complemento, Bairro, Cidade / Município e UF */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
                    <div className="md:col-span-3">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Complemento (Opcional)
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                        placeholder="Apto, Sala, Bloco..."
                        value={formData.proprietario.complemento}
                        onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, complemento: e.target.value } })}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Bairro
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                        placeholder="Ex: Centro"
                        required
                        value={formData.proprietario.bairro}
                        onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, bairro: e.target.value } })}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Cidade / Município
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                        placeholder="Ex: Porto Alegre"
                        required
                        value={formData.proprietario.cidade}
                        onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, cidade: e.target.value } })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        UF
                      </label>
                      <select
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                        value={formData.proprietario.uf}
                        onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, uf: e.target.value } })}
                      >
                        {UFS.map(uf => (
                          <option key={uf} value={uf} className="bg-slate-900 text-slate-100">{uf}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Linha 4: Telefone Celular e E-mail com Checkboxes ("Não possui") */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-5">
                    <div className="md:col-span-6">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Telefone Celular
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed font-mono"
                        placeholder="(99)99999-9999"
                        disabled={formData.proprietario.naoPossuiCelular === 'SIM'}
                        required={formData.proprietario.naoPossuiCelular === 'NÃO'}
                        value={formData.proprietario.telefone}
                        onChange={handleTelefoneChange}
                      />
                      <label className="mt-2 flex items-center gap-2 cursor-pointer select-none text-xs text-slate-400 hover:text-slate-300">
                        <input
                          type="checkbox"
                          checked={formData.proprietario.naoPossuiCelular === 'SIM'}
                          onChange={e => setFormData({
                            ...formData,
                            proprietario: {
                              ...formData.proprietario,
                              naoPossuiCelular: e.target.checked ? 'SIM' : 'NÃO',
                              telefone: e.target.checked ? '' : formData.proprietario.telefone
                            }
                          })}
                          className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-900 h-3.5 w-3.5"
                        />
                        <span>Não possui celular</span>
                      </label>
                    </div>

                    <div className="md:col-span-6">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        E-mail
                      </label>
                      <input
                        type="email"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        placeholder="contato@exemplo.com"
                        disabled={formData.proprietario.naoPossuiEmail === 'SIM'}
                        required={formData.proprietario.naoPossuiEmail === 'NÃO'}
                        value={formData.proprietario.email}
                        onChange={e => setFormData({ ...formData, proprietario: { ...formData.proprietario, email: e.target.value } })}
                      />
                      <label className="mt-2 flex items-center gap-2 cursor-pointer select-none text-xs text-slate-400 hover:text-slate-300">
                        <input
                          type="checkbox"
                          checked={formData.proprietario.naoPossuiEmail === 'SIM'}
                          onChange={e => setFormData({
                            ...formData,
                            proprietario: {
                              ...formData.proprietario,
                              naoPossuiEmail: e.target.checked ? 'SIM' : 'NÃO',
                              email: e.target.checked ? '' : formData.proprietario.email
                            }
                          })}
                          className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-900 h-3.5 w-3.5"
                        />
                        <span>Não possui e-mail</span>
                      </label>
                    </div>
                  </div>

                  {/* Linha 5: Switch/Toggle Elegante para "Autoriza Comunicação DETRAN?" */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-950/50 rounded-xl border border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-800/80 text-emerald-400 border border-slate-700/50">
                        <Sparkles size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">Autoriza Comunicação DETRAN?</p>
                        <p className="text-xs text-slate-400">Autoriza o envio de avisos e notificações oficiais de trânsito pelo DETRAN-RS</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <span className={`text-xs font-bold uppercase tracking-wider ${formData.proprietario.autorizacao === 'SIM' ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {formData.proprietario.autorizacao === 'SIM' ? 'Autorizado' : 'Não Autorizado'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={formData.proprietario.autorizacao === 'SIM'}
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          proprietario: {
                            ...prev.proprietario,
                            autorizacao: prev.proprietario.autorizacao === 'SIM' ? 'NÃO' : 'SIM'
                          }
                        }))}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                          formData.proprietario.autorizacao === 'SIM' ? 'bg-emerald-600' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            formData.proprietario.autorizacao === 'SIM' ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. CARD: Dados do Veículo */}
                <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md mb-6 transition-all hover:border-slate-700/60">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-slate-800 border border-slate-700/60 text-emerald-400">
                        <Car size={18} />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-white tracking-tight">Dados do Veículo</h2>
                        <p className="text-xs text-slate-400">Identificação estrita por placa e características veiculares</p>
                      </div>
                    </div>
                    {veiculoCarregado && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 shadow-sm animate-fadeIn">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        Veículo Cadastrado - Dados Carregados
                      </span>
                    )}
                  </div>

                  {/* Linha 1: Placa (Primeiro campo, destaque visual), Renavam e Chassi */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
                    {formData.servico !== 'Primeiro Emplacamento' && (
                      <div className="md:col-span-4">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                          <span>Placa do Veículo</span>
                          {buscandoVeiculo && (
                            <span className="text-[11px] text-emerald-400 font-semibold animate-pulse flex items-center gap-1 normal-case">
                              <Loader2 size={11} className="animate-spin" /> Buscando...
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          className="w-full bg-slate-950/90 border border-slate-700/70 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-slate-100 font-mono font-bold text-base uppercase placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all tracking-wider"
                          placeholder="AAA-0A00"
                          maxLength={8}
                          required={formData.servico !== 'Primeiro Emplacamento'}
                          value={formData.veiculo.placa}
                          onChange={handlePlacaChange}
                          onBlur={() => buscarVeiculoPorPlaca(formData.veiculo.placa)}
                        />
                      </div>
                    )}
                    <div className={formData.servico === 'Primeiro Emplacamento' ? 'md:col-span-6' : 'md:col-span-4'}>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Renavam {formData.servico === 'Primeiro Emplacamento' ? '(Opcional Zero KM)' : ''}
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm font-mono"
                        placeholder={formData.servico === 'Primeiro Emplacamento' ? "Opcional (Zero KM)" : "Obrigatório"}
                        required={formData.servico !== 'Primeiro Emplacamento'}
                        value={formData.veiculo.renavam}
                        onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, renavam: e.target.value } })}
                      />
                    </div>
                    <div className={formData.servico === 'Primeiro Emplacamento' ? 'md:col-span-6' : 'md:col-span-4'}>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Chassi (17 caracteres)
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 uppercase placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm font-mono"
                        maxLength={17}
                        required
                        placeholder="Chassi sem I, O ou Q"
                        value={formData.veiculo.chassi}
                        onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, chassi: e.target.value.toUpperCase() } })}
                      />
                    </div>
                  </div>

                  {/* Linha 2: Marca / Modelo, Ano Fab. / Ano Mod., e Cor */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-6">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Marca / Modelo
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                        placeholder="Ex: FIAT/PALIO ATTRACTIV 1.0"
                        required
                        value={formData.veiculo.modelo}
                        onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, modelo: e.target.value } })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Ano Fab.
                      </label>
                      <input
                        type="number"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm font-mono"
                        required
                        value={formData.veiculo.ano}
                        onChange={e => {
                          const val = parseInt(e.target.value) || new Date().getFullYear();
                          setFormData({ ...formData, veiculo: { ...formData.veiculo, ano: val, anoModelo: formData.veiculo.anoModelo || val } });
                        }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Ano Mod.
                      </label>
                      <input
                        type="number"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm font-mono"
                        value={formData.veiculo.anoModelo}
                        onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, anoModelo: parseInt(e.target.value) || formData.veiculo.ano } })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Cor
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                        placeholder="Ex: Prata"
                        value={formData.veiculo.cor}
                        onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, cor: e.target.value } })}
                      />
                    </div>
                  </div>

                  {formData.servico === 'Primeiro Emplacamento' && (
                    <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase text-slate-400">Haverá Reserva de Placas?</span>
                      <select
                        className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-slate-100 text-sm focus:outline-none focus:border-emerald-500 font-medium"
                        value={formData.veiculo.reservaPlaca}
                        onChange={e => setFormData({ ...formData, veiculo: { ...formData.veiculo, reservaPlaca: e.target.value } })}
                      >
                        <option value="NÃO" className="bg-slate-900">Não</option>
                        <option value="SIM" className="bg-slate-900">Sim</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* 3. CARD: Restrição Financeira */}
                <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md mb-6 transition-all hover:border-slate-700/60">
                  <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-800/80">
                    <div className="p-2 rounded-xl bg-slate-800 border border-slate-700/60 text-emerald-400">
                      <Shield size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white tracking-tight">Restrição Financeira</h2>
                      <p className="text-xs text-slate-400">Gravame, alienação fiduciária, arrendamento mercantil ou reserva de domínio</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-4">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Haverá Restrição?
                      </label>
                      <select
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                        value={formData.restricaoFinanceira.havera}
                        onChange={e => {
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
                        }}
                      >
                        <option value="NÃO" className="bg-slate-900 text-slate-100">Não</option>
                        <option value="SIM" className="bg-slate-900 text-slate-100">Sim</option>
                      </select>
                    </div>

                    {formData.restricaoFinanceira.havera === 'SIM' && (
                      <>
                        <div className="md:col-span-4">
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                            Modalidade / Tipo
                          </label>
                          <select
                            className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                            value={formData.restricaoFinanceira.modalidade}
                            onChange={e => setFormData({ ...formData, restricaoFinanceira: { ...formData.restricaoFinanceira, modalidade: e.target.value } })}
                            required
                          >
                            <option value="" className="bg-slate-900 text-slate-400">Selecione...</option>
                            <option value="Alienação Fiduciária" className="bg-slate-900 text-slate-100">Alienação Fiduciária</option>
                            <option value="Arrendamento" className="bg-slate-900 text-slate-100">Arrendamento</option>
                            <option value="Reserva de Domínio" className="bg-slate-900 text-slate-100">Reserva de Domínio</option>
                            <option value="Penhor" className="bg-slate-900 text-slate-100">Penhor</option>
                            <option value="Comodato" className="bg-slate-900 text-slate-100">Comodato</option>
                            <option value="Locação" className="bg-slate-900 text-slate-100">Locação</option>
                          </select>
                        </div>
                        <div className="md:col-span-4">
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                            Tipo de Credor
                          </label>
                          <select
                            className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                            value={formData.restricaoFinanceira.tipoCredor}
                            onChange={e => setFormData({ ...formData, restricaoFinanceira: { ...formData.restricaoFinanceira, tipoCredor: e.target.value } })}
                            required
                          >
                            <option value="" className="bg-slate-900 text-slate-400">Selecione...</option>
                            <option value="Pessoa Jurídica" className="bg-slate-900 text-slate-100">Pessoa Jurídica</option>
                            <option value="Pessoa Física" className="bg-slate-900 text-slate-100">Pessoa Física</option>
                          </select>
                        </div>
                        <div className="col-span-12 mt-1">
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                            Agente Financeiro / Credor
                          </label>
                          <input
                            type="text"
                            className="w-full bg-slate-950/70 border border-slate-700/70 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-sm"
                            placeholder="Digite o nome ou documento do credor (ex: Banco X S/A)"
                            required
                            value={formData.restricaoFinanceira.nomeCredor || ''}
                            onChange={e => setFormData({ ...formData, restricaoFinanceira: { ...formData.restricaoFinanceira, nomeCredor: e.target.value } })}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 4. CARD: Serviço Solicitado & Ações Finais */}
                <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md mb-6 transition-all hover:border-slate-700/60">
                  <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-800/80">
                    <div className="p-2 rounded-xl bg-slate-800 border border-slate-700/60 text-emerald-400">
                      <FileText size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white tracking-tight">Serviço Solicitado</h2>
                      <p className="text-xs text-slate-400">Selecione o serviço do catálogo oficial Detran-RS</p>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-inner">
                    <div className="flex-1">
                      {formData.servico ? (
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
                          <span className="text-white font-bold text-base sm:text-lg">{formData.servico}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic text-sm">Nenhum serviço selecionado</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setIsModalAberto(true); setSearchTerm(''); }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <FileText size={15} className="text-emerald-400" />
                      <span>{formData.servico ? 'Alterar Serviço' : 'Escolher o Serviço'}</span>
                    </button>
                  </div>

                  {formData.servico === '2ª via do CRV' && (
                    <div className="mt-4 p-4 rounded-xl bg-blue-950/40 border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-300">
                      <div>
                        <span className="font-bold text-blue-200">POP 10 (Anexo 1):</span>{' '}
                        <span>{segundaViaCrv.tipoSolicitacao === 'SEGUNDA_VIA' ? '2ª via de CRV/ATPV-e' : `Validação CRV nº ${segundaViaCrv.numeroCrvValidacao || 'não informado'}`}</span>
                        <span className="mx-1.5 text-blue-500">•</span>
                        <span>Motivo: {segundaViaCrv.justificativa}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsModalSegundaViaAberto(true)}
                        className="text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer text-xs flex-shrink-0"
                      >
                        Configurar opções POP 10
                      </button>
                    </div>
                  )}

                  {formData.servico === 'Baixa de Veículo - Simples' && (
                    <div className="mt-4 p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-300">
                      <div>
                        <span className="font-bold text-amber-200">POP 25 (Anexo 1):</span>{' '}
                        <span>Motivo: {baixaDefinitiva.motivo}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsModalBaixaDefinitivaAberto(true)}
                        className="text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer text-xs flex-shrink-0"
                      >
                        Configurar opções POP 25
                      </button>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="mb-6 p-4 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-sm flex items-center gap-3 animate-fadeIn">
                    <AlertTriangle size={18} className="text-rose-400 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Botões de Ação no Rodapé */}
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 border border-emerald-400/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-base"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Processando Requerimento...</span>
                      </>
                    ) : (
                      <>
                        <FileCheck size={18} />
                        <span>GERAR REQUERIMENTO DIGITAL</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={clearForm}
                    disabled={loading}
                    className="bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 px-5 py-3 rounded-xl border border-slate-700/60 transition-all font-medium cursor-pointer flex items-center justify-center gap-2 text-sm"
                  >
                    <RotateCcw size={15} />
                    <span>Limpar Formulário</span>
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-md text-center text-slate-100 max-w-2xl mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-950/50">
                <CheckCircle2 size={36} />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight mb-2">Requerimento Gerado com Sucesso!</h2>
              <p className="text-xs text-slate-400 mb-6">Documento oficial gerado e certificado com selo de autenticidade digital</p>

              <div className="bg-slate-950/90 border border-slate-800 p-4 rounded-2xl mb-6 text-left shadow-inner">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Selo de Segurança (SHA-256):</p>
                <code className="text-xs font-mono text-emerald-400 break-all select-all">{result.hash}</code>
              </div>

              {comandaEnviadaId && (
                <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 p-3.5 rounded-xl mb-6 text-xs font-semibold flex items-center justify-center gap-2">
                  <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                  <span>Ordem de serviço transmitida para a Frente de Caixa com sucesso!</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
                <button
                  type="button"
                  className="px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                  onClick={() => window.open(pdfUrl || `/api/gerar_pdf/${result.id}`, '_blank')}
                >
                  <FileText size={16} className="text-slate-300" />
                  <span>Visualizar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalComandaAberto(true)}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer border-0"
                >
                  <ShoppingCart size={16} />
                  <span>{comandaEnviadaId ? 'Comanda Balcão Transmitida (Ver/Reenviar)' : 'Incluir Venda / Lançar no Caixa'}</span>
                </button>
                <button
                  type="button"
                  className="px-5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold text-sm transition-colors border border-slate-700/60 cursor-pointer flex items-center justify-center gap-2"
                  onClick={() => clearForm()}
                >
                  <RotateCcw size={15} />
                  <span>Novo Atendimento</span>
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* ============================================
          MODAL DE SELEÇÃO DE SERVIÇOS (DARK FINTECH)
      ============================================ */}
      {isModalAberto && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-100">
            <div className="p-4 bg-slate-850 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700/60">
                  <FileText size={18} />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white">Catálogo de Serviços DETRAN-RS</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalAberto(false)}
                className="text-slate-400 hover:text-white text-2xl font-light leading-none p-1 transition-colors cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-3 bg-slate-950/60 border-b border-slate-800 relative">
              <Search size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar serviço por nome..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm font-medium"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
            <div className="overflow-y-auto p-4 bg-slate-900/50 flex-1 space-y-2 custom-scrollbar">
              <div className="grid grid-cols-1 gap-2">
                {filteredServicos.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setIsModalAberto(false);
                      if (s === 'Primeiro Emplacamento') {
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
                          ...formData,
                          servico: s,
                          veiculo: {
                            ...formData.veiculo,
                            reservaPlaca: 'NÃO',
                            impressaoCrlv: 'NÃO',
                            emissaoCertidao: 'NÃO'
                          }
                        });
                      }
                    }}
                    className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      formData.servico === s
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-bold'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800 text-slate-200 text-sm'
                    }`}
                  >
                    {s}
                  </button>
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

      {/* =====================================================================
          MODAL: CATÁLOGO DE SERVIÇOS CRVA -> COMANDA DE FRENTE DE CAIXA
      ===================================================================== */}
      {isModalComandaAberto && (
        <ModalCatalogoServicosCRVA
          clienteNome={formData.proprietario.nome}
          clienteDocumento={formData.proprietario.cpfCnpj}
          clienteId={clienteId}
          veiculoId={veiculoId}
          veiculoPlaca={formData.veiculo.placa}
          servicoInicialNome={formData.servico}
          usuarioLogado={usuario || logado}
          onFechar={() => setIsModalComandaAberto(false)}
          onSucesso={(comandaId) => {
            setComandaEnviadaId(comandaId);
            setIsModalComandaAberto(false);
          }}
        />
      )}
    </div>
  );
}