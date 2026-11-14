import React, { useState, useEffect } from 'react';
import {
  User,
  Car,
  FileText,
  Search,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  CreditCard,
  FileCheck,
  DollarSign,
  ArrowRight,
  Loader2,
  Info,
} from 'lucide-react';

interface BalcaoAtendimentoProps {
  usuario?: any;
  onLimpar?: () => void;
  onConcluirProcesso?: (dados: any) => Promise<void> | void;
}

export const SERVICOS_CRVA = [
  'Transferência de Propriedade',
  'Primeiro Emplacamento',
  'Vistoria de Identificação Veicular',
  '2ª Via do CRV / CRLV-e',
  'Alteração de Informações do Proprietário / Veículo',
  'Inclusão/Liberação de Gravame Financeiro',
  'Mudança para Placa Mercosul',
  'Comunicação de Venda',
  'Baixa Definitiva de Veículo',
  'Emissão de Certidão / Outros Serviços',
];

export const ESTIMATIVAS_GAD_E: Record<string, number> = {
  'Transferência de Propriedade': 198.42,
  'Primeiro Emplacamento': 275.60,
  'Vistoria de Identificação Veicular': 111.08,
  '2ª Via do CRV / CRLV-e': 89.90,
  'Alteração de Informações do Proprietário / Veículo': 96.50,
  'Inclusão/Liberação de Gravame Financeiro': 142.30,
  'Mudança para Placa Mercosul': 130.00,
  'Comunicação de Venda': 48.70,
  'Baixa Definitiva de Veículo': 118.20,
  'Emissão de Certidão / Outros Serviços': 65.00,
};

export default function BalcaoAtendimento({
  usuario,
  onLimpar,
  onConcluirProcesso,
}: BalcaoAtendimentoProps) {
  // Protocolo sequencial do atendimento
  const [protocolo, setProtocolo] = useState('CRVA-2026-0042');

  // Tipo de Requerente (PF ou PJ)
  const [tipoPessoa, setTipoPessoa] = useState<'PF' | 'PJ'>('PF');

  // Dados Cadastrais do Proprietário / Requerente
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [nomeRazao, setNomeRazao] = useState('');
  const [rg, setRg] = useState('');
  const [orgaoEmissor, setOrgaoEmissor] = useState('SSP/RS');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [municipio, setMunicipio] = useState('Porto Alegre');
  const [uf, setUf] = useState('RS');
  const [isProprioAdquirente, setIsProprioAdquirente] = useState(true);
  const [apresentouProcuracao, setApresentouProcuracao] = useState(false);

  // Dados do Veículo
  const [placa, setPlaca] = useState('');
  const [renavam, setRenavam] = useState('');
  const [chassi, setChassi] = useState('');
  const [marcaModelo, setMarcaModelo] = useState('');
  const [anoFab, setAnoFab] = useState('2022');
  const [anoModelo, setAnoModelo] = useState('2023');
  const [cor, setCor] = useState('');
  const [categoria, setCategoria] = useState('Particular');
  const [municipioEmplacamento, setMunicipioEmplacamento] = useState('Porto Alegre');

  // Serviço & Restrições
  const [servicoSelecionado, setServicoSelecionado] = useState(SERVICOS_CRVA[0]);
  const [tipoRestricao, setTipoRestricao] = useState<'SEM' | 'ALIENACAO' | 'ARRENDAMENTO' | 'RESERVA'>('SEM');
  const [agenteFinanceiro, setAgenteFinanceiro] = useState('');

  // Canal de Atendimento
  const [canalAtendimento, setCanalAtendimento] = useState<'PARTICULAR' | 'DESPACHANTE'>('PARTICULAR');
  const [numeroGrt, setNumeroGrt] = useState('');
  const [registroCrdd, setRegistroCrdd] = useState('');
  const [faturamentoContaCorrente, setFaturamentoContaCorrente] = useState(true);

  // Feedbacks e Estados de Ação
  const [buscandoDados, setBuscandoDados] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Valor estimado do GAD-E
  const valorEstimadoGade = ESTIMATIVAS_GAD_E[servicoSelecionado] || 150.0;

  // Consulta automática de CEP
  const handleBuscarCep = async (cepValor: string) => {
    const limpo = cepValor.replace(/\D/g, '');
    if (limpo.length !== 8) return;

    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setLogradouro(data.logradouro || '');
        setBairro(data.bairro || '');
        setMunicipio(data.localidade || 'Porto Alegre');
        setUf(data.uf || 'RS');
      }
    } catch (e) {
      console.warn('Falha na consulta do CEP:', e);
    } finally {
      setBuscandoCep(false);
    }
  };

  // Simulação de busca rápida de veículo por placa/renavam
  const handlePuxarDadosVeiculo = () => {
    if (!placa && !renavam) {
      alert('Informe a Placa ou o RENAVAM para buscar os dados.');
      return;
    }

    setBuscandoDados(true);
    setTimeout(() => {
      setChassi('9BRBL3821NP098172');
      setMarcaModelo('TOYOTA COROLLA XEI 2.0 FLEX');
      setAnoFab('2022');
      setAnoModelo('2023');
      setCor('Prata');
      setCategoria('Particular');
      setMunicipioEmplacamento('Porto Alegre');
      setBuscandoDados(false);
    }, 700);
  };

  const handleLimparFormulario = () => {
    if (window.confirm('Deseja limpar todos os campos do atendimento atual?')) {
      setCpfCnpj('');
      setNomeRazao('');
      setRg('');
      setTelefone('');
      setEmail('');
      setCep('');
      setLogradouro('');
      setNumero('');
      setComplemento('');
      setBairro('');
      setPlaca('');
      setRenavam('');
      setChassi('');
      setMarcaModelo('');
      setCor('');
      setTipoRestricao('SEM');
      setAgenteFinanceiro('');
      setCanalAtendimento('PARTICULAR');
      setNumeroGrt('');
      setRegistroCrdd('');
      setMensagemSucesso(null);
      if (onLimpar) onLimpar();
    }
  };

  const handleSubmitProcesso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpfCnpj || !nomeRazao) {
      alert('Informe o CPF/CNPJ e o Nome/Razão Social do requerente.');
      return;
    }
    if (!placa && !chassi) {
      alert('Informe ao menos a Placa ou o Chassi do veículo.');
      return;
    }

    setSalvando(true);
    try {
      const payload = {
        protocolo,
        tipoPessoa,
        proprietario: {
          cpfCnpj,
          nomeRazao,
          rg: `${rg} ${orgaoEmissor}`.trim(),
          telefone,
          email,
          endereco: `${logradouro}, ${numero} ${complemento} - ${bairro}, ${municipio}/${uf} - CEP: ${cep}`,
          isProprioAdquirente,
          apresentouProcuracao,
        },
        veiculo: {
          placa: placa.toUpperCase(),
          renavam,
          chassi: chassi.toUpperCase(),
          marcaModelo,
          anoFab,
          anoModelo,
          cor,
          categoria,
          municipioEmplacamento,
        },
        servico: servicoSelecionado,
        restricaoFinanceira: {
          tipo: tipoRestricao,
          agente: tipoRestricao !== 'SEM' ? agenteFinanceiro : null,
        },
        canal: {
          tipo: canalAtendimento,
          grt: canalAtendimento === 'DESPACHANTE' ? numeroGrt : null,
          crdd: canalAtendimento === 'DESPACHANTE' ? registroCrdd : null,
          faturamentoContaCorrente: canalAtendimento === 'DESPACHANTE' ? faturamentoContaCorrente : false,
        },
        valorEstimadoGade,
        operador: usuario?.nome || 'Antonio Sobrosa • Atendente Balcão',
      };

      if (onConcluirProcesso) {
        await onConcluirProcesso(payload);
      }

      setMensagemSucesso(`Requerimento ${protocolo} gerado com sucesso! Processo encaminhado.`);
      setProtocolo(`CRVA-2026-00${Math.floor(Math.random() * 900 + 100)}`);
    } finally {
      setSalvando(false);
    }
  };

  const nomeOperador =
    usuario?.nome ||
    usuario?.nome_completo ||
    (usuario?.email ? usuario.email.split('@')[0] : 'Antonio Sobrosa');

  const cargoOperador = usuario?.perfil || usuario?.funcao || 'Atendente Balcão';

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 p-4 sm:p-6 font-sans select-none">
      {/* ==================================================================== */}
      {/* 1. HEADER OPERACIONAL CORPORATIVO                                    */}
      {/* ==================================================================== */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 mb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold shadow-sm">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Atendimento de Balcão
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                CRVA Detran/RS
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-400">Protocolo Ativo:</span>
              <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                {protocolo}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Identificação do Operador */}
          <div className="text-right hidden md:block">
            <span className="text-xs font-semibold text-slate-200 block">
              {nomeOperador}
            </span>
            <span className="text-[11px] text-slate-400 block">{cargoOperador}</span>
          </div>

          <button
            type="button"
            onClick={handleLimparFormulario}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            title="Limpar todos os campos do formulário"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpar Formulário</span>
          </button>
        </div>
      </header>

      {/* Banner de Confirmação */}
      {mensagemSucesso && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{mensagemSucesso}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensagemSucesso(null)}
            className="text-emerald-400 hover:text-white text-xs font-bold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. ARQUITETURA EM GRID RESPONSIVO (7 COLUNAS + 5 COLUNAS)            */}
      {/* ==================================================================== */}
      <form onSubmit={handleSubmitProcesso} className="w-full max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ================================================================ */}
          {/* COLUNA ESQUERDA: DADOS CADASTRAIS (lg:col-span-7)                 */}
          {/* ================================================================ */}
          <div className="lg:col-span-7 space-y-6">
            {/* BLOCO 1: Identificação do Proprietário / Requerente */}
            <section className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white tracking-tight">
                      1. Identificação do Proprietário / Requerente
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Dados civis e endereço do titular do processo veicular
                    </p>
                  </div>
                </div>

                {/* Switch PF | PJ */}
                <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setTipoPessoa('PF')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      tipoPessoa === 'PF'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Pessoa Física
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoPessoa('PJ')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      tipoPessoa === 'PJ'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Pessoa Jurídica
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Linha 1: Documento + Nome / Razão Social */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      {tipoPessoa === 'PF' ? 'CPF do Requerente *' : 'CNPJ da Empresa *'}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={cpfCnpj}
                        onChange={(e) => setCpfCnpj(e.target.value)}
                        placeholder={tipoPessoa === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                        required
                        className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-8">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      {tipoPessoa === 'PF' ? 'Nome Completo *' : 'Razão Social *'}
                    </label>
                    <input
                      type="text"
                      value={nomeRazao}
                      onChange={(e) => setNomeRazao(e.target.value.toUpperCase())}
                      placeholder={tipoPessoa === 'PF' ? 'Ex.: MARIA DA SILVA' : 'Ex.: TRANSPORTES SILVA LTDA'}
                      required
                      className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>
                </div>

                {/* Linha 2: RG/Órgão, Telefone e E-mail */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      RG / Órgão Emissor
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <input
                        type="text"
                        value={rg}
                        onChange={(e) => setRg(e.target.value)}
                        placeholder="Nº RG"
                        className="col-span-2 bg-slate-950/70 border border-slate-700/80 rounded-xl px-2.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500"
                      />
                      <input
                        type="text"
                        value={orgaoEmissor}
                        onChange={(e) => setOrgaoEmissor(e.target.value.toUpperCase())}
                        placeholder="SSP/RS"
                        className="bg-slate-950/70 border border-slate-700/80 rounded-xl px-1.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 uppercase text-center"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Telefone Celular (WhatsApp)
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        value={telefone}
                        onChange={(e) => setTelefone(e.target.value)}
                        placeholder="(51) 90000-0000"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      E-mail Institucional
                    </label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="cliente@exemplo.com.br"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Linha 3: Endereço & CEP */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      CEP
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={cep}
                        onChange={(e) => {
                          setCep(e.target.value);
                          if (e.target.value.replace(/\D/g, '').length === 8) {
                            handleBuscarCep(e.target.value);
                          }
                        }}
                        placeholder="90000-000"
                        maxLength={9}
                        className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:border-emerald-500"
                      />
                      {buscandoCep && (
                        <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-6">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Endereço / Logradouro
                    </label>
                    <input
                      type="text"
                      value={logradouro}
                      onChange={(e) => setLogradouro(e.target.value)}
                      placeholder="Ex.: Rua dos Andradas"
                      className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Número / Complemento
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={numero}
                        onChange={(e) => setNumero(e.target.value)}
                        placeholder="Nº"
                        className="bg-slate-950/70 border border-slate-700/80 rounded-xl px-2 py-2 text-sm text-slate-100 focus:border-emerald-500 text-center"
                      />
                      <input
                        type="text"
                        value={complemento}
                        onChange={(e) => setComplemento(e.target.value)}
                        placeholder="Apto"
                        className="bg-slate-950/70 border border-slate-700/80 rounded-xl px-2 py-2 text-sm text-slate-100 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Bairro, Município e UF */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Bairro
                    </label>
                    <input
                      type="text"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                      placeholder="Centro Histórico"
                      className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-emerald-500"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Município
                    </label>
                    <input
                      type="text"
                      value={municipio}
                      onChange={(e) => setMunicipio(e.target.value)}
                      placeholder="Porto Alegre"
                      className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-emerald-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      UF
                    </label>
                    <input
                      type="text"
                      value={uf}
                      onChange={(e) => setUf(e.target.value.toUpperCase())}
                      maxLength={2}
                      className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-2 py-2 text-sm text-slate-100 text-center uppercase focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Checkboxes de Representação */}
                <div className="pt-2 flex flex-wrap items-center gap-6 text-xs text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isProprioAdquirente}
                      onChange={(e) => setIsProprioAdquirente(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Requerente é o próprio adquirente / proprietário</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={apresentouProcuracao}
                      onChange={(e) => setApresentouProcuracao(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Apresentou Procuração Pública / Particular</span>
                  </label>
                </div>
              </div>
            </section>

            {/* BLOCO 2: Dados do Veículo */}
            <section className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    <Car className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white tracking-tight">
                      2. Dados do Veículo
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Identificação do bem, placa, chassi e características
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePuxarDadosVeiculo}
                  disabled={buscandoDados}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {buscandoDados ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>Puxar Dados da Base</span>
                </button>
              </div>

              <div className="space-y-4">
                {/* Linha 1: Placa + RENAVAM + Chassi */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Placa do Veículo
                    </label>
                    <input
                      type="text"
                      value={placa}
                      onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                      placeholder="ABC1D23"
                      maxLength={8}
                      className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-sky-300 font-mono font-bold uppercase focus:border-sky-500"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Código RENAVAM
                    </label>
                    <input
                      type="text"
                      value={renavam}
                      onChange={(e) => setRenavam(e.target.value)}
                      placeholder="00000000000"
                      maxLength={11}
                      className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:border-sky-500"
                    />
                  </div>

                  <div className="sm:col-span-5">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Número do Chassi
                    </label>
                    <input
                      type="text"
                      value={chassi}
                      onChange={(e) => setChassi(e.target.value.toUpperCase())}
                      placeholder="9BR..."
                      maxLength={17}
                      className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono uppercase focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Linha 2: Marca/Modelo, Ano Fab/Mod, Cor, Categoria e Município */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Marca / Modelo
                    </label>
                    <input
                      type="text"
                      value={marcaModelo}
                      onChange={(e) => setMarcaModelo(e.target.value.toUpperCase())}
                      placeholder="Ex.: VW GOL 1.6 MSI"
                      className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-sky-500 uppercase"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Ano Fab/Mod
                    </label>
                    <div className="grid grid-cols-2 gap-1 text-center">
                      <input
                        type="text"
                        value={anoFab}
                        onChange={(e) => setAnoFab(e.target.value)}
                        placeholder="22"
                        maxLength={4}
                        className="bg-slate-950/70 border border-slate-700/80 rounded-xl px-1.5 py-2 text-xs text-slate-100 text-center font-mono focus:border-sky-500"
                      />
                      <input
                        type="text"
                        value={anoModelo}
                        onChange={(e) => setAnoModelo(e.target.value)}
                        placeholder="23"
                        maxLength={4}
                        className="bg-slate-950/70 border border-slate-700/80 rounded-xl px-1.5 py-2 text-xs text-slate-100 text-center font-mono focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Cor Predominante
                    </label>
                    <input
                      type="text"
                      value={cor}
                      onChange={(e) => setCor(e.target.value)}
                      placeholder="Prata"
                      className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-sky-500"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 block">
                      Município Emplacamento
                    </label>
                    <input
                      type="text"
                      value={municipioEmplacamento}
                      onChange={(e) => setMunicipioEmplacamento(e.target.value)}
                      placeholder="Porto Alegre"
                      className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-sky-500"
                    />
                    {/* Divisória e Inclusão / Alteração de Restrição Financeira (Gravame) */}
                    <div className="border-t border-slate-800/80 pt-4 mt-5">
                      <div className="flex items-center gap-2 mb-3">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                            Inclusão / Alteração de Restrição Financeira (Gravame)
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            Informe se haverá gravame financeiro incidente sobre o veículo no DETRAN/RS
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
                        {[
                          ['SEM', 'Nenhum'],
                          ['ALIENACAO', 'Alienação Fiduciária'],
                          ['ARRENDAMENTO', 'Arrendamento'],
                          ['RESERVA', 'Reserva de Domínio'],
                        ].map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setTipoRestricao(val as any)}
                            className={`p-2.5 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer ${
                              tipoRestricao === val
                                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 shadow-sm'
                                : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {tipoRestricao !== 'SEM' && (
                        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 animate-fadeIn">
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                            Nome / CNPJ do Agente Financeiro *
                          </label>
                          <input
                            type="text"
                            value={agenteFinanceiro}
                            onChange={(e) => setAgenteFinanceiro(e.target.value.toUpperCase())}
                            placeholder="Ex: BANCO SANTANDER S.A. - 90.400.888/0001-42"
                            required={tipoRestricao !== 'SEM'}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ================================================================ */}
          {/* COLUNA DIREITA: SERVIÇO REGISTRAL • CATÁLOGO OFICIAL DETRAN-RS (lg:col-span-5) */}
          {/* ================================================================ */}
          <div className="lg:col-span-5 space-y-6 sticky top-20">
            {/* CARD UNIFICADO: SERVIÇO REGISTRAL */}
            <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-3 pb-4 mb-4 border-b border-slate-800/80">
                <div className="p-2 rounded-xl bg-slate-800 border border-slate-700/60 text-emerald-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">Serviço Registral</h2>
                  <p className="text-xs text-slate-400">Catálogo oficial DETRAN-RS</p>
                </div>
              </div>

              {/* Área de Seleção de Serviços */}
              <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl shadow-inner">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Serviço no Protocolo:
                  </span>
                  {servicoSelecionado && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Selecionado
                    </span>
                  )}
                </div>

                <div className="mb-3">
                  <select
                    value={servicoSelecionado}
                    onChange={(e) => setServicoSelecionado(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-medium focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">Selecione um serviço do catálogo...</option>
                    {SERVICOS_CRVA.map((srv) => (
                      <option key={srv} value={srv}>
                        {srv} (R$ {ESTIMATIVAS_GAD_E[srv]?.toFixed(2).replace('.', ',') || '0,00'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Resumo Financeiro Integrado (Box Interno) */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 my-4 space-y-2">
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                  <span>Emolumentos GAD-E:</span>
                  <span className="text-slate-200 font-semibold">
                    R$ {valorEstimadoGade > 0 ? (valorEstimadoGade * 0.65).toFixed(2).replace('.', ',') : '0,00'}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                  <span>Taxa de Serviço Balcão:</span>
                  <span className="text-slate-200 font-semibold">
                    R$ {valorEstimadoGade > 0 ? (valorEstimadoGade * 0.35).toFixed(2).replace('.', ',') : '0,00'}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-xs uppercase tracking-wider font-bold text-slate-300">Total Estimado:</span>
                  <span className="text-emerald-400 font-bold text-base font-mono">
                    R$ {valorEstimadoGade.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              {/* Alerta de Validação Contextual */}
              {!servicoSelecionado && (
                <div className="mb-4 bg-red-950/30 border border-red-900/40 text-red-300 text-xs p-3 rounded-xl flex items-center gap-2 animate-fadeIn">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>Selecione ao menos um serviço do catálogo para habilitar a abertura do processo.</span>
                </div>
              )}

              {/* Bloco de Ações Finais (Rodapé do Card) */}
              <button
                type="submit"
                disabled={!servicoSelecionado || salvando}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-white rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 text-sm disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando Requerimento...</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    <span>Gerar Requerimento / Abrir Processo</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 mt-2.5 cursor-pointer"
              >
                <span>Imprimir Declarações Avulsas</span>
              </button>

              <button
                type="button"
                onClick={handleLimparFormulario}
                className="text-xs text-slate-400 hover:text-slate-200 mt-3 block mx-auto transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpar Campos (F2)</span>
              </button>
            </section>
          </div>
        </div>
      </form>
    </div>
  );
}

