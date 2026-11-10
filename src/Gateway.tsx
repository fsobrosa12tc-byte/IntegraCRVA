import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  ShoppingCart,
  ShieldCheck,
  ScrollText,
  ArrowLeft,
  X,
  Car,
  MessageSquare,
  LogOut,
  User,
  ExternalLink,
  ChevronRight,
  Shield,
  Radio,
} from 'lucide-react';
import GerenciadorUsuariosModal from './components/GerenciadorUsuariosModal';
import ModalConexaoWhatsApp from './components/crva/ModalConexaoWhatsApp';
import { useEvolutionWhatsApp } from './hooks/useEvolutionWhatsApp';

export interface GatewayProps {
  onSelectModule: (module: 'crva' | 'pdv' | 'vistorias' | 'crm') => void;
  usuario?: any;
  onLogout?: () => void;
}

export default function Gateway({ onSelectModule, usuario, onLogout }: GatewayProps) {
  const [modalGestaoAberto, setModalGestaoAberto] = useState(false);
  const [isGatewayOpen, setIsGatewayOpen] = useState(false);
  const [isDeclaracoesModalOpen, setIsDeclaracoesModalOpen] = useState(false);

  // Lê dados de usuário armazenados localmente caso não venha via props
  const operador = usuario || (() => {
    try {
      const stor =
        sessionStorage.getItem('integra_usuario') ||
        sessionStorage.getItem('user') ||
        localStorage.getItem('integra_usuario') ||
        localStorage.getItem('user');
      return stor ? JSON.parse(stor) : null;
    } catch {
      return null;
    }
  })();

  // Monitoramento do WhatsApp Gateway
  const { isOnline } = useEvolutionWhatsApp({
    pollIntervalMs: 25000,
    autoPolling: true,
  });

  // Fechamento de modal via ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDeclaracoesModalOpen(false);
      }
    };
    if (isDeclaracoesModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeclaracoesModalOpen]);

  // Lista dos 6 módulos corporativos da plataforma
  const modulos = [
    {
      id: 'crva',
      titulo: 'Integra CRVA',
      descricao: 'Atendimento de Balcão e Geração de Requerimentos Digitais de Veículos.',
      icone: FileText,
      corIcone: 'text-sky-400',
      bordaIcone: 'group-hover:border-sky-500/40',
      bgIcone: 'bg-sky-500/10',
      status: 'ATIVO',
      tipoStatus: 'ativo',
      botaoTexto: 'Acessar Módulo',
      acao: () => onSelectModule('crva'),
    },
    {
      id: 'pdv',
      titulo: 'Integra PDV',
      descricao: 'Frente de Caixa, Vendas e Gestão Financeira de Emolumentos.',
      icone: ShoppingCart,
      corIcone: 'text-emerald-400',
      bordaIcone: 'group-hover:border-emerald-500/40',
      bgIcone: 'bg-emerald-500/10',
      status: 'ATIVO',
      tipoStatus: 'ativo',
      botaoTexto: 'Acessar Caixa',
      acao: () => onSelectModule('pdv'),
    },
    {
      id: 'declaracoes',
      titulo: 'Declarações',
      descricao: 'Emissão de Declarações Oficiais e Documentos Cartoriais.',
      icone: ScrollText,
      corIcone: 'text-amber-400',
      bordaIcone: 'group-hover:border-amber-500/40',
      bgIcone: 'bg-amber-500/10',
      status: 'EM BREVE',
      tipoStatus: 'em_breve',
      botaoTexto: 'Ver Detalhes',
      acao: () => setIsDeclaracoesModalOpen(true),
    },
    {
      id: 'vistorias',
      titulo: 'Esteira de Vistorias',
      descricao: 'Controle de boxes, chamada de pista e integração via Gateway.',
      icone: Car,
      corIcone: 'text-emerald-400',
      bordaIcone: 'group-hover:border-emerald-500/40',
      bgIcone: 'bg-emerald-500/10',
      status: 'ATIVO',
      tipoStatus: 'ativo',
      botaoTexto: 'Acessar Pátio',
      acao: () => onSelectModule('vistorias'),
    },
    {
      id: 'gestao',
      titulo: 'Gestão de Acessos',
      descricao: 'Perfis de Atendente, IVD, Coordenador e Auditoria.',
      icone: ShieldCheck,
      corIcone: 'text-indigo-400',
      bordaIcone: 'group-hover:border-indigo-500/40',
      bgIcone: 'bg-indigo-500/10',
      status: 'ATIVO',
      tipoStatus: 'ativo',
      botaoTexto: 'Gerenciar Equipe',
      acao: () => setModalGestaoAberto(true),
    },
    {
      id: 'crm',
      titulo: 'CRM-Integra',
      descricao: 'Triagem IA WhatsApp, fila particular e despachante credenciado.',
      icone: MessageSquare,
      corIcone: 'text-sky-400',
      bordaIcone: 'group-hover:border-sky-500/40',
      bgIcone: 'bg-sky-500/10',
      status: 'ATIVO',
      tipoStatus: 'ativo',
      botaoTexto: 'Abrir CRM',
      acao: () => onSelectModule('crm'),
    },
  ];

  return (
    <div className="min-h-screen w-full bg-[#0B0F19] text-slate-100 flex flex-col font-sans select-none relative overflow-x-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(17,24,39,0.9),rgba(11,15,25,1))]">
      {/* ==================================================================== */}
      {/* 1. HEADER GLOBAL CORPORATIVO                                         */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-30 h-16 shrink-0 border-b border-slate-800/60 bg-slate-950/70 backdrop-blur-md px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Lado Esquerdo: Logo Oficial Marks Systems & Título */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo_marks_systems.png"
              alt="Logo Marks Systems"
              className="h-10 w-10 object-contain rounded-lg shrink-0 shadow-md drop-shadow"
            />
            <span className="font-bold text-slate-100 text-lg tracking-tight uppercase">
              Marks Systems
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-800/80">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Sistema Unificado • CRVA Detran/RS
            </span>
          </div>
        </div>

        {/* Lado Direito: Utilitários (WhatsApp, Área Restrita e Perfil) */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Status WhatsApp Gateway */}
          <button
            type="button"
            onClick={() => setIsGatewayOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs transition-colors cursor-pointer"
            title="Abrir WhatsApp Gateway (Evolution API v2)"
          >
            <span className="relative flex h-2 w-2">
              {isOnline && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
            </span>
            <span className="text-slate-400 text-[11px] hidden md:inline">Gateway:</span>
            <span
              className={`text-[11px] font-semibold ${
                isOnline ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {isOnline ? 'Operacional' : 'Offline'}
            </span>
          </button>

          {/* Botão de Segurança: Gestão de Usuários */}
          <button
            type="button"
            onClick={() => setModalGestaoAberto(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            title="Gerenciar usuários e permissões"
          >
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline text-[11px]">Gestão de Acessos</span>
          </button>

          {/* Operador / Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800/80">
            <div className="hidden lg:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[140px]">
                {operador?.nome || operador?.email?.split('@')[0] || 'Operador CRVA'}
              </span>
              <span className="text-[10px] text-slate-400">
                {operador?.perfil || 'Atendente Balcão'}
              </span>
            </div>

            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <User className="w-4 h-4" />
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-900 transition-colors cursor-pointer"
                title="Sair do sistema"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* 2. ÁREA CENTRAL: DASHBOARD / GRID EXECUTIVO (3x2)                    */}
      {/* ==================================================================== */}
      <main className="flex-1 flex flex-col justify-center max-w-7xl w-full mx-auto px-6 py-10 lg:py-14">
        {/* Banner de Boas-vindas Minimalista */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
            <Radio className="w-3.5 h-3.5" />
            <span>Portal Operacional Integrado</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Selecione o módulo de trabalho
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Ambiente seguro para registro veicular, emissão de certidões, vistorias em pista e
            atendimento multicanal Detran/RS.
          </p>
        </div>

        {/* Grid Responsivo 3x2 (2 linhas de 3 cards amplos) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modulos.map((mod, index) => {
            const Icone = mod.icone;
            const ehAtivo = mod.tipoStatus === 'ativo';

            return (
              <motion.div
                key={mod.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06 }}
                whileHover={{ y: -3 }}
                onClick={mod.acao}
                className="group relative rounded-2xl bg-slate-900/70 hover:bg-slate-900/90 backdrop-blur-md border border-slate-800/80 hover:border-emerald-500/40 p-6 flex flex-col justify-between shadow-lg hover:shadow-2xl hover:shadow-emerald-950/20 transition-all duration-300 cursor-pointer overflow-hidden min-h-[220px]"
              >
                {/* Linha Superior: Ícone + Badge de Status */}
                <div>
                  <div className="flex items-center justify-between w-full mb-4">
                    <div
                      className={`p-3 rounded-xl border border-slate-700/50 ${mod.bgIcone} ${mod.bordaIcone} transition-colors`}
                    >
                      <Icone className={`w-5 h-5 ${mod.corIcone}`} />
                    </div>

                    {ehAtivo ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 text-[10px] font-bold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {mod.status}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-950/50 text-amber-300 border border-amber-800/40 text-[10px] font-bold uppercase tracking-wider">
                        {mod.status}
                      </span>
                    )}
                  </div>

                  {/* Título & Descrição Clara */}
                  <h2 className="text-xl font-semibold text-slate-100 group-hover:text-white transition-colors tracking-tight mb-2">
                    {mod.titulo}
                  </h2>
                  <p className="text-sm text-slate-400 leading-relaxed font-normal line-clamp-2">
                    {mod.descricao}
                  </p>
                </div>

                {/* Rodapé do Card: Botão Contextual */}
                <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span
                    className={`font-semibold transition-colors flex items-center gap-1.5 ${
                      ehAtivo
                        ? 'text-slate-300 group-hover:text-emerald-400'
                        : 'text-amber-400/90'
                    }`}
                  >
                    {mod.botaoTexto}
                  </span>
                  <span className="text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* ==================================================================== */}
      {/* 3. RODAPÉ INSTITUCIONAL (FOOTER)                                     */}
      {/* ==================================================================== */}
      <footer className="h-14 shrink-0 border-t border-slate-800/60 bg-slate-950/50 backdrop-blur-md px-6 flex items-center justify-center text-center">
        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} Marks Systems. Plataforma Corporativa Segura • Credenciados
          Detran/RS. Em conformidade com a LGPD.
        </p>
      </footer>

      {/* ==================================================================== */}
      {/* MODAL: MÓDULO EM CONSTRUÇÃO (DECLARAÇÕES)                           */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {isDeclaracoesModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsDeclaracoesModalOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setIsDeclaracoesModalOpen(false)}
                className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Fechar aviso (ESC)"
              >
                <X size={18} />
              </button>

              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl">
                <span>🚧</span>
              </div>

              <h3 className="text-xl font-bold tracking-tight text-white mb-2">
                Módulo em Construção
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                A infraestrutura de emissão de Declarações Oficiais e Documentos Cartoriais está
                sendo finalizada para homologação junto à tabela de emolumentos.
              </p>

              <button
                type="button"
                onClick={() => setIsDeclaracoesModalOpen(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold py-3 px-5 rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer text-xs"
              >
                <ArrowLeft size={16} />
                <span>Voltar ao Hub</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Gestão de Usuários e Acessos */}
      <GerenciadorUsuariosModal
        aberto={modalGestaoAberto}
        onFechar={() => setModalGestaoAberto(false)}
      />

      {/* Modal de Conexão WhatsApp Gateway */}
      <ModalConexaoWhatsApp
        aberto={isGatewayOpen}
        onFechar={() => setIsGatewayOpen(false)}
      />
    </div>
  );
}
