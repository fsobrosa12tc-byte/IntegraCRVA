import React, { useState } from 'react';
import { motion } from 'motion/react';
import { FileText, ShoppingCart, ShieldCheck, Users } from 'lucide-react';
import GerenciadorUsuariosModal from './components/GerenciadorUsuariosModal';

interface GatewayProps {
  onSelectModule: (module: 'crva' | 'pdv') => void;
}

export default function Gateway({ onSelectModule }: GatewayProps) {
  const [modalGestaoAberto, setModalGestaoAberto] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans text-slate-900 selection:bg-slate-300 relative">
      {/* Botão no Topo Direito: Área Restrita / Gerenciar Usuários */}
      <div className="absolute top-6 right-6 z-20">
        <button
          type="button"
          onClick={() => setModalGestaoAberto(true)}
          className="px-4 py-2.5 bg-white/90 hover:bg-white text-slate-700 hover:text-indigo-600 rounded-2xl shadow-sm hover:shadow border border-slate-200 transition-all font-semibold text-xs flex items-center gap-2 cursor-pointer backdrop-blur-sm"
        >
          <ShieldCheck size={16} className="text-indigo-600" />
          <span>Área Restrita / Gerenciar Usuários</span>
        </button>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center mb-12 mt-6 sm:mt-0"
      >
        <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-widest uppercase mb-3">
          MARKS SYSTEMS
        </h1>
        <div className="h-1 w-24 bg-blue-600 mx-auto rounded-full mb-4"></div>
        <p className="text-slate-500 font-medium tracking-wide text-sm md:text-base">
          PLATAFORMA UNIFICADA DE GESTÃO CORPORATIVA
        </p>
      </motion.div>

      {/* Grid com os 3 Cards: CRVA, PDV e Gestão de Acessos */}
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
        {/* Card 1: Integra CRVA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          whileHover={{ scale: 1.03, translateY: -5 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelectModule('crva')}
          className="group cursor-pointer bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-200 hover:border-blue-400 hover:shadow-blue-200 transition-all duration-300 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[300px]"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
          <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300 z-10">
            <FileText size={40} strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3 z-10">Integra CRVA</h2>
          <p className="text-slate-500 font-medium text-sm z-10">
            Atendimento de Balcão e Geração de Requerimentos Digitais
          </p>
        </motion.div>

        {/* Card 2: Integra PDV */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          whileHover={{ scale: 1.03, translateY: -5 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelectModule('pdv')}
          className="group cursor-pointer bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-200 hover:border-emerald-400 hover:shadow-emerald-200 transition-all duration-300 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[300px]"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300 z-10">
            <ShoppingCart size={40} strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3 z-10">Integra PDV</h2>
          <p className="text-slate-500 font-medium text-sm z-10">
            Frente de Caixa, Vendas e Gestão Financeira
          </p>
        </motion.div>

        {/* Card 3: Gestão de Acessos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          whileHover={{ scale: 1.03, translateY: -5 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setModalGestaoAberto(true)}
          className="group cursor-pointer bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-200 hover:border-indigo-400 hover:shadow-indigo-200 transition-all duration-300 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[300px]"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
          <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300 z-10">
            <ShieldCheck size={40} strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3 z-10">Gestão de Acessos</h2>
          <p className="text-slate-500 font-medium text-sm z-10">
            Controle de Usuários, Permissões e Equipe
          </p>
        </motion.div>
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-16 text-center text-xs text-slate-400 font-medium"
      >
        <p>© {new Date().getFullYear()} Marks Systems. Todos os direitos reservados.</p>
        <p>Acesso restrito para colaboradores autorizados.</p>
      </motion.div>

      {/* Modal de Gestão de Usuários e Acessos com Backdrop Blur */}
      <GerenciadorUsuariosModal
        aberto={modalGestaoAberto}
        onFechar={() => setModalGestaoAberto(false)}
      />
    </div>
  );
}
