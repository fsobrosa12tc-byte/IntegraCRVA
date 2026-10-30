import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, ShoppingCart, ShieldCheck, ScrollText, ArrowLeft, X } from 'lucide-react';
import GerenciadorUsuariosModal from './components/GerenciadorUsuariosModal';

interface GatewayProps {
  onSelectModule: (module: 'crva' | 'pdv') => void;
}

export default function Gateway({ onSelectModule }: GatewayProps) {
  const [modalGestaoAberto, setModalGestaoAberto] = useState(false);
  const [isDeclaracoesModalOpen, setIsDeclaracoesModalOpen] = useState(false);

  // Fecha o modal ao pressionar a tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDeclaracoesModalOpen(false);
      }
    };

    if (isDeclaracoesModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDeclaracoesModalOpen]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans selection:bg-emerald-500/30 selection:text-white relative overflow-hidden bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.06),rgba(255,255,255,0))]">
      {/* Botão no Topo Direito: Área Restrita / Gerenciar Usuários */}
      <div className="absolute top-6 right-6 z-20">
        <button
          type="button"
          onClick={() => setModalGestaoAberto(true)}
          className="px-4 py-2.5 bg-slate-900/80 hover:bg-slate-850 text-slate-300 hover:text-white rounded-2xl shadow-xl hover:shadow-2xl border border-slate-800/90 hover:border-slate-700 transition-all font-semibold text-xs flex items-center gap-2 cursor-pointer backdrop-blur-md group"
        >
          <ShieldCheck size={16} className="text-indigo-400 group-hover:scale-110 transition-transform" />
          <span>Área Restrita / Gerenciar Usuários</span>
        </button>
      </div>

      {/* Header Centralizado */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center mb-12 mt-6 sm:mt-0 z-10"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 backdrop-blur-sm">
          <span>Sistema Unificado</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-emerald-400">Online</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-widest uppercase mb-3 drop-shadow-sm">
          MARKS SYSTEMS
        </h1>
        <div className="h-1 w-24 bg-gradient-to-r from-emerald-500 to-sky-500 mx-auto rounded-full mb-4"></div>
        <p className="text-slate-400 font-medium tracking-wide text-sm md:text-base max-w-xl mx-auto">
          PLATAFORMA UNIFICADA DE GESTÃO CORPORATIVA & SERVIÇOS CRVA
        </p>
      </motion.div>

      {/* Grid com os 4 Cards de Módulos (Dark SaaS Corporativo) */}
      <div className="w-full max-w-6xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-4 z-10">

        {/* Card 1: Integra CRVA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => onSelectModule('crva')}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md p-6 shadow-xl hover:border-slate-700 hover:shadow-2xl transition-all group cursor-pointer flex flex-col justify-between relative overflow-hidden min-h-[290px]"
        >
          <div className="flex items-center justify-between w-full mb-5">
            <div className="bg-slate-800/80 border border-slate-700/60 p-3 rounded-2xl group-hover:border-sky-500/40 transition-colors">
              <FileText size={24} className="text-sky-400 group-hover:scale-110 transition-transform" />
            </div>
            <span className="bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider">
              ATIVO
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100 group-hover:text-white mb-2 transition-colors">
              Integra CRVA
            </h2>
            <p className="text-slate-400 text-xs leading-relaxed font-normal">
              Atendimento de Balcão e Geração de Requerimentos Digitais
            </p>
          </div>
          <div className="pt-4 mt-4 border-t border-slate-800/80">
            <div className="rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-100 py-2.5 px-4 font-medium transition-all flex items-center justify-between text-xs group-hover:text-sky-300">
              <span>Acessar Módulo</span>
              <span className="text-base font-bold group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </div>
        </motion.div>

        {/* Card 2: Integra PDV */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => onSelectModule('pdv')}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md p-6 shadow-xl hover:border-slate-700 hover:shadow-2xl transition-all group cursor-pointer flex flex-col justify-between relative overflow-hidden min-h-[290px]"
        >
          <div className="flex items-center justify-between w-full mb-5">
            <div className="bg-slate-800/80 border border-slate-700/60 p-3 rounded-2xl group-hover:border-emerald-500/40 transition-colors">
              <ShoppingCart size={24} className="text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider">
              ATIVO
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100 group-hover:text-white mb-2 transition-colors">
              Integra PDV
            </h2>
            <p className="text-slate-400 text-xs leading-relaxed font-normal">
              Frente de Caixa, Vendas e Gestão Financeira
            </p>
          </div>
          <div className="pt-4 mt-4 border-t border-slate-800/80">
            <div className="rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-100 py-2.5 px-4 font-medium transition-all flex items-center justify-between text-xs group-hover:text-emerald-300">
              <span>Acessar Módulo</span>
              <span className="text-base font-bold group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </div>
        </motion.div>

        {/* Card 3: Módulo Declarações (EM BREVE - Abre o Modal) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setIsDeclaracoesModalOpen(true)}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md p-6 shadow-xl hover:border-slate-700 hover:shadow-2xl transition-all group cursor-pointer flex flex-col justify-between relative overflow-hidden min-h-[290px]"
        >
          <div className="flex items-center justify-between w-full mb-5">
            <div className="bg-slate-800/80 border border-slate-700/60 p-3 rounded-2xl group-hover:border-amber-500/40 transition-colors">
              <ScrollText size={24} className="text-amber-400 group-hover:scale-110 transition-transform" />
            </div>
            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider">
              EM BREVE
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100 group-hover:text-white mb-2 transition-colors">
              Declarações
            </h2>
            <p className="text-slate-400 text-xs leading-relaxed font-normal">
              Emissão de certidões, declarações notariais e termos oficiais com assinatura digital.
            </p>
          </div>
          <div className="pt-4 mt-4 border-t border-slate-800/80">
            <div className="rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-100 py-2.5 px-4 font-medium transition-all flex items-center justify-between text-xs group-hover:text-amber-300">
              <span>Consultar Disponibilidade</span>
              <span className="text-base font-bold group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </div>
        </motion.div>

        {/* Card 4: Gestão de Acessos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setModalGestaoAberto(true)}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md p-6 shadow-xl hover:border-slate-700 hover:shadow-2xl transition-all group cursor-pointer flex flex-col justify-between relative overflow-hidden min-h-[290px]"
        >
          <div className="flex items-center justify-between w-full mb-5">
            <div className="bg-slate-800/80 border border-slate-700/60 p-3 rounded-2xl group-hover:border-indigo-500/40 transition-colors">
              <ShieldCheck size={24} className="text-indigo-400 group-hover:scale-110 transition-transform" />
            </div>
            <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider">
              GESTÃO
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100 group-hover:text-white mb-2 transition-colors">
              Gestão de Acessos
            </h2>
            <p className="text-slate-400 text-xs leading-relaxed font-normal">
              Controle de Usuários, Permissões e Equipe
            </p>
          </div>
          <div className="pt-4 mt-4 border-t border-slate-800/80">
            <div className="rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-100 py-2.5 px-4 font-medium transition-all flex items-center justify-between text-xs group-hover:text-indigo-300">
              <span>Gerenciar Equipe</span>
              <span className="text-base font-bold group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </div>
        </motion.div>

      </div>

      {/* Footer com Direitos Reservados */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-14 text-center text-xs text-slate-500 font-medium z-10 space-y-1"
      >
        <p>© {new Date().getFullYear()} Marks Systems. Todos os direitos reservados.</p>
        <p className="text-slate-600">Acesso seguro e restrito para colaboradores autorizados.</p>
      </motion.div>

      {/* =========================================================================
       *  MODAL FLUTUANTE "EM CONSTRUÇÃO!" (Pop-up Dark SaaS Elegante)
       * ========================================================================= */}
      <AnimatePresence>
        {isDeclaracoesModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsDeclaracoesModalOpen(false);
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center transform transition-all duration-300 scale-100 overflow-hidden bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(56,189,248,0.1),rgba(255,255,255,0))]"
            >
              {/* Botão de Fechar no Topo Direito */}
              <button
                type="button"
                onClick={() => setIsDeclaracoesModalOpen(false)}
                className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-full transition-colors cursor-pointer border-0 bg-transparent"
                title="Fechar aviso (ESC)"
              >
                <X size={18} />
              </button>

              {/* Ícone / Emoji Animado */}
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-4xl shadow-inner">
                <span className="inline-block animate-bounce select-none">🚧</span>
              </div>

              {/* Título */}
              <h3 className="text-2xl font-bold tracking-tight text-slate-100 mb-2">
                Módulo em Construção!
              </h3>

              {/* Mensagem Explicativa */}
              <p className="text-sm text-slate-400 leading-relaxed mb-8">
                Estamos finalizando a estrutura do módulo de Declarações para garantir segurança jurídica e integração total ao banco de dados. Em breve estará disponível para sua unidade.
              </p>

              {/* Botão de Ação */}
              <button
                type="button"
                onClick={() => setIsDeclaracoesModalOpen(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold py-3.5 px-6 rounded-xl border border-slate-700/80 shadow-lg transition-all flex items-center justify-center gap-2 hover:border-slate-600 cursor-pointer"
              >
                <ArrowLeft size={16} />
                <span>Voltar ao Gateway Inicial</span>
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
    </div>
  );
}
