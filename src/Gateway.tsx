import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, ShoppingCart, X } from 'lucide-react';

interface GatewayProps {
  onSelectModule: (module: 'crva') => void;
}

export default function Gateway({ onSelectModule }: GatewayProps) {
  const [showPdvModal, setShowPdvModal] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans text-slate-900 selection:bg-slate-300">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center mb-12"
      >
        <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-widest uppercase mb-3">
          MARKS SYSTEMS
        </h1>
        <div className="h-1 w-24 bg-blue-600 mx-auto rounded-full mb-4"></div>
        <p className="text-slate-500 font-medium tracking-wide text-sm md:text-base">
          PLATAFORMA UNIFICADA DE GESTÃO CORPORATIVA
        </p>
      </motion.div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 px-4">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
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

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          whileHover={{ scale: 1.03, translateY: -5 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowPdvModal(true)}
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

      <AnimatePresence>
        {showPdvModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setShowPdvModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={24} />
              </button>
              
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                  <ShoppingCart size={32} strokeWidth={2} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Integra PDV</h3>
                <p className="text-slate-600 font-medium mb-6">
                  Módulo Financeiro Externo. Conectando ao terminal de caixa... 
                  <br/>
                  <span className="text-sm text-emerald-600 font-bold">(Em implantação)</span>
                </p>
                <button 
                  onClick={() => setShowPdvModal(false)}
                  className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl transition-colors"
                >
                  Voltar ao menu anterior
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
