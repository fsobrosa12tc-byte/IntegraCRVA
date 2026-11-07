import React, { useState, useEffect } from 'react';
import { Car, User, Building2, CheckCircle2, ArrowRight, X, Phone, Sparkles } from 'lucide-react';
import { cadastrarVistoriaPatio } from '../../services/vistoriaService';

interface DadosFormularioBalcao {
  clienteNome: string;
  clienteCpf: string;
  clienteTelefone: string;
  veiculoPlaca: string;
  veiculoChassi: string;
  veiculoModelo: string;
}

interface ModalDecisaoVistoriaBalcaoProps {
  aberto: boolean;
  dadosBalcao: DadosFormularioBalcao;
  onFechar: () => void;
  /** Chamado após responder [Não] ou concluir a criação do rascunho [Sim] para seguir ao lançamento PDV/requerimento */
  onProsseguirFluxoBalcao: (criouVistoria: boolean, resumoMensagem?: string) => void;
}

export default function ModalDecisaoVistoriaBalcao({
  aberto,
  dadosBalcao,
  onFechar,
  onProsseguirFluxoBalcao,
}: ModalDecisaoVistoriaBalcaoProps) {
  const [etapa, setEtapa] = useState<'pergunta_inicial' | 'escolha_tipo' | 'form_despachante'>('pergunta_inicial');
  const [salvando, setSalvando] = useState(false);

  // Campos rápidos para Despachante
  const [despachanteNome, setDespachanteNome] = useState('');
  const [despachanteTelefone, setDespachanteTelefone] = useState('');
  const [despachantePlaca, setDespachantePlaca] = useState('');
  const [despachanteModelo, setDespachanteModelo] = useState('');

  useEffect(() => {
    if (aberto) {
      setEtapa('pergunta_inicial');
      setSalvando(false);
      setDespachanteNome('');
      setDespachanteTelefone(dadosBalcao.clienteTelefone || '');
      setDespachantePlaca((dadosBalcao.veiculoPlaca || '').toUpperCase());
      setDespachanteModelo(dadosBalcao.veiculoModelo || '');
    }
  }, [aberto, dadosBalcao]);

  if (!aberto) return null;

  const handleSelecionarParticular = async () => {
    setSalvando(true);
    try {
      const nova = await cadastrarVistoriaPatio({
        tipo_atendimento: 'particular',
        cliente_nome: dadosBalcao.clienteNome,
        cliente_cpf: dadosBalcao.clienteCpf,
        cliente_telefone: dadosBalcao.clienteTelefone,
        placa: dadosBalcao.veiculoPlaca,
        veiculo_chassi: dadosBalcao.veiculoChassi,
        veiculo_modelo: dadosBalcao.veiculoModelo,
        status: 'aguardando_ficha',
      });
      onProsseguirFluxoBalcao(
        true,
        `Rascunho de vistoria PARTICULAR (${nova.placa}) enviado para a fila! Vincule a Ficha Digital após abrir no DETRAN.`
      );
    } catch (err: any) {
      alert(`Erro ao gerar rascunho de vistoria: ${err?.message || err}`);
      setSalvando(false);
    }
  };

  const handleConfirmarDespachante = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!despachanteNome.trim() || !despachanteTelefone.trim() || !despachantePlaca.trim()) {
      alert('Preencha o Nome do Despachante, Telefone/WhatsApp e Placa do Veículo.');
      return;
    }

    setSalvando(true);
    try {
      const nova = await cadastrarVistoriaPatio({
        tipo_atendimento: 'despachante',
        cliente_nome: despachanteNome.trim(),
        cliente_telefone: despachanteTelefone.trim(),
        placa: despachantePlaca.trim().toUpperCase(),
        veiculo_modelo: despachanteModelo.trim() || dadosBalcao.veiculoModelo,
        status: 'aguardando_ficha',
      });
      onProsseguirFluxoBalcao(
        true,
        `Rascunho de vistoria DESPACHANTE (${nova.placa}) enviado para a fila! Vincule a Ficha Digital após abrir no DETRAN.`
      );
    } catch (err: any) {
      alert(`Erro ao gerar rascunho de vistoria: ${err?.message || err}`);
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Car size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Haverá Vistoria para este Atendimento?
              </h3>
              <p className="text-xs text-slate-400">
                Triagem integrada Balcão CRVA ↔ Esteira de Pátio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo Dinâmico */}
        <div className="p-6 space-y-5">
          {etapa === 'pergunta_inicial' && (
            <>
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Requerente:</span>
                  <strong className="text-white">{dadosBalcao.clienteNome || 'Não informado'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Veículo / Placa:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {dadosBalcao.veiculoPlaca || 'SEM PLACA'} · {dadosBalcao.veiculoModelo || 'Modelo não informado'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onProsseguirFluxoBalcao(false)}
                  className="py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Não (Apenas Balcão)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEtapa('escolha_tipo')}
                  className="py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Sim, haverá Vistoria</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {etapa === 'escolha_tipo' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300 font-medium">
                Selecione a modalidade da vistoria para configurar o card na esteira do pátio:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Opção Particular */}
                <button
                  type="button"
                  disabled={salvando}
                  onClick={handleSelecionarParticular}
                  className="p-4 rounded-2xl bg-slate-950 hover:bg-sky-950/30 border border-sky-500/40 hover:border-sky-400 text-left transition-all cursor-pointer group space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-sky-500/20 text-sky-400 border border-sky-500/30">
                      PARTICULAR
                    </span>
                    <User size={18} className="text-sky-400 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-sm font-bold text-white">Cliente Particular</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Importa automaticamente Nome, CPF, WhatsApp, Placa, Chassi e Modelo preenchidos no formulário.
                  </p>
                </button>

                {/* Opção Despachante */}
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => setEtapa('form_despachante')}
                  className="p-4 rounded-2xl bg-slate-950 hover:bg-amber-950/30 border border-amber-500/40 hover:border-amber-400 text-left transition-all cursor-pointer group space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      DESPACHANTE
                    </span>
                    <Building2 size={18} className="text-amber-400 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-sm font-bold text-white">Via Despachante</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Informe rapidamente o Nome/Razão e WhatsApp do Despachante responsável pelo veículo.
                  </p>
                </button>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setEtapa('pergunta_inicial')}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer bg-transparent border-0"
                >
                  ← Voltar
                </button>
              </div>
            </div>
          )}

          {etapa === 'form_despachante' && (
            <form onSubmit={handleConfirmarDespachante} className="space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <Building2 size={15} />
                <span>Dados Rápidos do Despachante para a Vistoria</span>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Nome / Razão do Despachante *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Despachante Central Sul"
                  value={despachanteNome}
                  onChange={(e) => setDespachanteNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Telefone / WhatsApp do Despachante Responsável *
                </label>
                <div className="relative">
                  <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" />
                  <input
                    type="text"
                    required
                    placeholder="(54) 99999-8888"
                    value={despachanteTelefone}
                    onChange={(e) => setDespachanteTelefone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-8 pr-3.5 py-2 text-xs text-white font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Placa do Veículo *</label>
                  <input
                    type="text"
                    required
                    value={despachantePlaca}
                    onChange={(e) => setDespachantePlaca(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Marca / Modelo *</label>
                  <input
                    type="text"
                    required
                    value={despachanteModelo}
                    onChange={(e) => setDespachanteModelo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3">
                <button
                  type="button"
                  onClick={() => setEtapa('escolha_tipo')}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-950/50 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 size={15} />
                  <span>Confirmar e Prosseguir ao PDV</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

