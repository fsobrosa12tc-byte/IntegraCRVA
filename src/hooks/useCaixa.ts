import React, { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '../lib/supabase';
import type { CaixaDiario, MovimentacaoCaixa } from '../types/pdv';
import {
  abrirCaixa as abrirCaixaApi,
  fecharCaixa as fecharCaixaApi,
  listarMovimentacoes,
  obterOperadorId,
  type ResultadoFechamento,
} from '../lib/pdvCaixa';

/**
 * Utilitário de formatação de data e hora sem dependências externas.
 * Compatível com a assinatura format(Date, 'dd/MM/yyyy HH:mm:ss').
 */
export function format(date: Date, pattern: string = 'dd/MM/yyyy HH:mm:ss'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = pad(date.getDate());
  const M = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const H = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());

  return pattern
    .replace('dd', d)
    .replace('MM', M)
    .replace('yyyy', String(y))
    .replace('HH', H)
    .replace('mm', m)
    .replace('ss', s);
}

export interface UseCaixaReturn {
  caixa: CaixaDiario | null;
  caixaId: string | null;
  operadorId: string | null;
  carregando: boolean;
  erroCaixa: string;
  caixaRecuperado: boolean;
  bannerRecuperadoVisivel: boolean;
  fecharBannerRecuperado: () => void;
  movs: MovimentacaoCaixa[];
  setMovs: React.Dispatch<React.SetStateAction<MovimentacaoCaixa[]>>;
  carregarEstado: () => Promise<void>;
  abrirCaixa: (valorAbertura: number) => Promise<CaixaDiario>;
  fecharCaixa: (valorInformado: number, operadorInfo?: { nome?: string; cpf?: string; email?: string }) => Promise<ResultadoFechamento>;
  setCaixa: React.Dispatch<React.SetStateAction<CaixaDiario | null>>;
  setOperadorId: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Hook de Inicialização do PDV com Mecanismo de Alta Tolerância a Falhas (Crash Recovery)
 *
 * Implementa:
 * 1. Checagem atômica de turno ativo no servidor (Supabase)
 * 2. Bypass imediato da tela de abertura caso já exista caixa aberto
 * 3. Banner informativo elegante de "Caixa Ativo Recuperado"
 * 4. Auditoria de reconexão pós-interrupção / desconexão (> 15 minutos)
 */
export function useCaixa(usuarioAutenticado: any): UseCaixaReturn {
  const [caixa, setCaixa] = useState<CaixaDiario | null>(null);
  const [operadorId, setOperadorId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erroCaixa, setErroCaixa] = useState<string>('');
  const [caixaRecuperado, setCaixaRecuperado] = useState<boolean>(false);
  const [bannerRecuperadoVisivel, setBannerRecuperadoVisivel] = useState<boolean>(false);
  const [movs, setMovs] = useState<MovimentacaoCaixa[]>([]);

  // Referência para evitar loop ou auditoria duplicada
  const auditouReconexaoRef = useRef<boolean>(false);
  const montadoRef = useRef<boolean>(false);

  const operadorNome =
    usuarioAutenticado?.nome ||
    usuarioAutenticado?.nome_completo ||
    'Operador';

  /**
   * Auditoria de Reconexão Pós-Interrupção (> 15 minutos de inatividade)
   */
  const auditarReconexaoSeNecessario = useCallback(
    async (caixaAtivo: CaixaDiario, opId: string) => {
      if (auditouReconexaoRef.current) return;
      auditouReconexaoRef.current = true;

      try {
        // Busca o horário da última movimentação de caixa registrada
        const { data: ultimasMovs } = await supabase
          .from('movimentacoes_caixa')
          .select('criado_em')
          .eq('caixa_id', caixaAtivo.id)
          .order('criado_em', { ascending: false })
          .limit(1);

        const ultimaAtividadeStr =
          ultimasMovs && ultimasMovs.length > 0
            ? ultimasMovs[0].criado_em
            : caixaAtivo.data_abertura;

        const ultimaAtividade = new Date(ultimaAtividadeStr);
        const agora = new Date();
        const diffMs = agora.getTime() - ultimaAtividade.getTime();
        const quinzeMinutosMs = 15 * 60 * 1000;

        if (diffMs > quinzeMinutosMs) {
          const logMensagem = `Retomada de sessão de caixa pós-desconexão/queda de energia - Operador ID: ${opId} às ${agora.toISOString()}`;
          console.warn(`[AUDITORIA PDV] ${logMensagem}`);

          // Tentativa transparente e opcional de persistência em 'logs_auditoria'
          try {
            await supabase.from('logs_auditoria').insert({
              operador_id: opId,
              operador_nome: operadorNome,
              tipo_evento: 'crash_recovery_reconexao',
              evento: 'RETOMADA_SESSAO_CRASH_RECOVERY',
              descricao: logMensagem,
              metadata: {
                caixa_id: caixaAtivo.id,
                data_abertura: caixaAtivo.data_abertura,
                ultima_atividade: ultimaAtividadeStr,
                minutos_inativo: Math.round(diffMs / 60000),
              },
              criado_em: agora.toISOString(),
            });
          } catch (e) {
            // Silencioso caso a tabela opcional 'logs_auditoria' não esteja criada
          }
        }
      } catch (err) {
        console.warn('Erro ao processar auditoria de reconexão:', err);
      }
    },
    [operadorNome]
  );

  /**
   * Checagem Atômica de Turno Ativo no Servidor (Supabase)
   */
  const carregarEstado = useCallback(async () => {
    setCarregando(true);
    setErroCaixa('');

    try {
      // 1. Identifica o ID oficial do operador autenticado
      const uid = await obterOperadorId(usuarioAutenticado);
      setOperadorId(uid);

      if (!uid) {
        setCaixa(null);
        setCaixaRecuperado(false);
        setBannerRecuperadoVisivel(false);
        setErroCaixa(
          'Sessão Supabase não encontrada. Caso deseje, encerre a sessão e faça login novamente.'
        );
        return;
      }

      // 2. Checagem Atômica de Turno Ativo no Servidor:
      const { data: caixaAtivo, error } = await supabase
        .from('caixas_diarios')
        .select('*')
        .eq('operador_id', uid)
        .eq('status', 'aberto')
        .order('data_abertura', { ascending: false })
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      // 3. Bypass Imediato da Tela de Abertura se caixaAtivo existir
      if (caixaAtivo) {
        setCaixa(caixaAtivo as CaixaDiario);
        setCaixaRecuperado(true);
        setBannerRecuperadoVisivel(true);

        // Lista movimentações do caixa recuperado
        const listaMovs = await listarMovimentacoes(caixaAtivo.id);
        setMovs(listaMovs);

        // Auditoria pós-desconexão se o tempo de inatividade for > 15 minutos
        await auditarReconexaoSeNecessario(caixaAtivo as CaixaDiario, uid);
      } else {
        setCaixa(null);
        setCaixaRecuperado(false);
        setBannerRecuperadoVisivel(false);
        setMovs([]);
      }
    } catch (err: any) {
      setCaixa(null);
      setCaixaRecuperado(false);
      setBannerRecuperadoVisivel(false);
      setErroCaixa(err?.message || 'Falha ao consultar o caixa no servidor.');
    } finally {
      setCarregando(false);
    }
  }, [usuarioAutenticado, auditarReconexaoSeNecessario]);

  useEffect(() => {
    if (!montadoRef.current) {
      montadoRef.current = true;
      carregarEstado();
    }
  }, [carregarEstado]);

  const fecharBannerRecuperado = useCallback(() => {
    setBannerRecuperadoVisivel(false);
  }, []);

  const abrirCaixa = useCallback(
    async (valorAbertura: number): Promise<CaixaDiario> => {
      if (!operadorId) {
        throw new Error('Operador não identificado.');
      }
      const novo = await abrirCaixaApi(operadorId, valorAbertura);
      setCaixa(novo);
      setCaixaRecuperado(false);
      setBannerRecuperadoVisivel(false);
      setMovs([]);
      setErroCaixa('');
      return novo;
    },
    [operadorId]
  );

  const fecharCaixa = useCallback(
    async (
      valorInformado: number,
      operadorInfo?: { nome?: string; cpf?: string; email?: string }
    ): Promise<ResultadoFechamento> => {
      if (!caixa) {
        throw new Error('Nenhum caixa aberto para fechar.');
      }
      const opInfo = {
        nome: operadorInfo?.nome || operadorNome,
        cpf: operadorInfo?.cpf || (usuarioAutenticado as any)?.cpf || (usuarioAutenticado as any)?.documento,
        email: operadorInfo?.email || usuarioAutenticado?.email
      };
      const res = await fecharCaixaApi(caixa, valorInformado, opInfo);
      setCaixa(null);
      setCaixaRecuperado(false);
      setBannerRecuperadoVisivel(false);
      setMovs([]);
      return res;
    },
    [caixa, operadorNome, usuarioAutenticado]
  );

  return {
    caixa,
    caixaId: caixa?.id ?? null,
    operadorId,
    carregando,
    erroCaixa,
    caixaRecuperado,
    bannerRecuperadoVisivel,
    fecharBannerRecuperado,
    movs,
    setMovs,
    carregarEstado,
    abrirCaixa,
    fecharCaixa,
    setCaixa,
    setOperadorId,
  };
}
