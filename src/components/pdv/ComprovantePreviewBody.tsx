import React from 'react';
import { Scissors } from 'lucide-react';
import { formatarMoeda } from '../../lib/pdvCaixa';
import { mascararDocumento } from '../../utils/documento';
import type { DadosCupomImpressao, PdvPrintFormat } from '../../lib/pdvPrint';

interface ComprovantePreviewBodyProps {
  dados: DadosCupomImpressao;
  format: PdvPrintFormat;
}

export default function ComprovantePreviewBody({
  dados,
  format,
}: ComprovantePreviewBodyProps) {
  const isThermal = format === 'thermal_80mm' || format === 'thermal_58mm';
  const is58 = format === 'thermal_58mm';

  const docTomador = dados.tomadorDocumento
    ? mascararDocumento(dados.tomadorDocumento)
    : 'Não informado';
  const docCliFinal = dados.clienteFinalDocumento
    ? mascararDocumento(dados.clienteFinalDocumento)
    : null;

  if (isThermal) {
    const renderThermalVia = (isVia1: boolean) => {
      const viaLabel = isVia1
        ? dados.labelVia1 || '1ª VIA • CLIENTE / TOMADOR'
        : dados.labelVia2 || '2ª VIA • CONTROLE INTERNO CRVA';
      const assinatura = isVia1
        ? dados.assinaturaVia1 || 'Assinatura / Rubrica do Tomador'
        : dados.assinaturaVia2 || 'Rubrica Operador de Caixa CRVA';

      return (
        <div className={is58 ? 'text-[10px] leading-snug space-y-2' : 'text-[11px] leading-snug space-y-2.5'}>
          {/* Topo */}
          <div className="text-center space-y-0.5">
            <div className={is58 ? 'font-bold text-[11px] tracking-tight' : 'font-bold text-xs tracking-tight'}>
              MARKS SYSTEMS • CRVA DETRAN/RS
            </div>
            <div className="font-bold">
              {dados.tituloDocumento || 'COMPROVANTE DE QUITAÇÃO FISCAL'}
            </div>
            <div className="pt-1">
              <span className="inline-block border border-black px-1.5 py-0.5 font-bold uppercase text-[9px]">
                {viaLabel}
              </span>
            </div>
            <div className="text-[10px] pt-0.5">Doc: {dados.numeroRecibo}</div>
            <div className="text-[10px]">Emissão: {dados.dataHora}</div>
          </div>

          <div className="border-t border-dashed border-slate-500" />

          {/* Tomador */}
          <div className="space-y-0.5">
            <div className="font-bold uppercase text-[9px] text-slate-600">
              {dados.tomadorLabel || 'TOMADOR / REQUERENTE'}
            </div>
            <div className="font-bold break-words">{dados.tomadorNome}</div>
            <div>CPF/CNPJ: {docTomador}</div>
            {dados.veiculoPlaca && (
              <div>
                Placa: <span className="font-bold">{dados.veiculoPlaca.toUpperCase()}</span>
              </div>
            )}
            {dados.faturaReferencia && (
              <div className="break-words">
                Ref. Recibo: <span className="font-bold">{dados.faturaReferencia}</span>
              </div>
            )}
          </div>

          {/* Cliente Final (Auditoria) */}
          {(dados.clienteFinalNome || docCliFinal || dados.clienteFinalPlaca) && (
            <>
              <div className="border-t border-dashed border-slate-500" />
              <div className="space-y-0.5">
                <div className="font-bold uppercase text-[9px] text-slate-600">
                  VÍNCULO DE AUDITORIA (CLIENTE FINAL)
                </div>
                {dados.clienteFinalNome && (
                  <div className="font-bold break-words">{dados.clienteFinalNome}</div>
                )}
                {docCliFinal && <div>CPF/CNPJ: {docCliFinal}</div>}
                {dados.clienteFinalPlaca && (
                  <div>Placa: <span className="font-bold">{dados.clienteFinalPlaca.toUpperCase()}</span></div>
                )}
              </div>
            </>
          )}

          <div className="border-t border-dashed border-slate-500" />

          {/* Itens */}
          <div className="space-y-1.5">
            <div className="font-bold uppercase text-[9px] text-slate-600">
              DISCRIMINAÇÃO DOS SERVIÇOS
            </div>
            {dados.itens.map((it, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="font-semibold break-words">
                  {it.codigo} • {it.descricao}
                </div>
                <div className="flex justify-between gap-2">
                  <span>
                    {it.quantidade}x {formatarMoeda(it.valorUnitario)}
                  </span>
                  <span className="font-bold whitespace-nowrap">{formatarMoeda(it.subtotal)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-slate-500" />

          {/* Totais */}
          <div className="space-y-0.5">
            <div className="flex justify-between gap-2">
              <span>Subtotal Serviços:</span>
              <span className="whitespace-nowrap">{formatarMoeda(dados.subtotal)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>(+) ISSQN (2,00%):</span>
              <span className="whitespace-nowrap">{formatarMoeda(dados.issqn)}</span>
            </div>
            <div
              className={`flex justify-between gap-2 border-t border-black pt-1 mt-1 font-bold ${
                is58 ? 'text-[11px]' : 'text-xs'
              }`}
            >
              <span>TOTAL PAGO:</span>
              <span className="whitespace-nowrap">{formatarMoeda(dados.valorTotal)}</span>
            </div>
            <div className="flex justify-between gap-2 pt-0.5">
              <span>Pagamento:</span>
              <span className="font-bold text-right">{dados.formaPagamento}</span>
            </div>

            {dados.valorRecebido && dados.valorRecebido > dados.valorTotal && (
              <>
                <div className="flex justify-between gap-2">
                  <span>Recebido:</span>
                  <span>{formatarMoeda(dados.valorRecebido)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Troco:</span>
                  <span>{formatarMoeda(dados.troco || 0)}</span>
                </div>
              </>
            )}

            {dados.saldoAnterior !== undefined && dados.saldoAnterior !== null && (
              <>
                <div className="flex justify-between gap-2">
                  <span>Saldo Anterior:</span>
                  <span>{formatarMoeda(dados.saldoAnterior)}</span>
                </div>
                <div className="flex justify-between gap-2 font-bold">
                  <span>Saldo Restante:</span>
                  <span>{formatarMoeda(dados.saldoRestante ?? 0)}</span>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-dashed border-slate-500" />

          {/* Auditoria & Assinatura */}
          <div className="text-[9.5px] space-y-0.5">
            <div>Operador: {dados.operadorNome}</div>
            {dados.atendenteNome && <div>Atendente: {dados.atendenteNome}</div>}
            {dados.itensQuitadosCount ? (
              <div>Ordens baixadas: {dados.itensQuitadosCount}</div>
            ) : null}
            <div className="break-all">Auth: {dados.hashAutenticidade}</div>
          </div>

          <div className="pt-5 text-center">
            <div className="border-t border-black mx-2 mb-1" />
            <div className="text-[9px]">{assinatura}</div>
          </div>
        </div>
      );
    };

    return (
      <div
        className={`${
          is58 ? 'w-[240px] p-3.5' : 'w-[320px] p-4'
        } bg-white text-black font-mono rounded-lg shadow-2xl border border-slate-300 shrink-0 h-fit`}
      >
        {renderThermalVia(true)}

        <div className="my-4 flex items-center gap-1.5 text-[9px] font-bold text-slate-600 select-none">
          <div className="flex-1 border-t border-dashed border-black" />
          <Scissors size={11} />
          <span>CORTE AQUI</span>
          <div className="flex-1 border-t border-dashed border-black" />
        </div>

        {renderThermalVia(false)}
      </div>
    );
  }

  // Formato Folha A4 (w-full max-w-2xl)
  const renderA4Via = (isVia1: boolean) => {
    const viaLabel = isVia1
      ? dados.labelVia1 || '1ª VIA — COMPROVANTE DO CLIENTE / TOMADOR'
      : dados.labelVia2 || '2ª VIA — CONTROLE INTERNO / CAIXA CRVA';
    const assinatura = isVia1
      ? dados.assinaturaVia1 || 'Assinatura / Rubrica do Tomador'
      : dados.assinaturaVia2 || 'Rubrica Operador de Caixa CRVA';

    return (
      <div className="bg-white text-slate-950 p-5 rounded-xl border border-slate-300 shadow-sm text-xs font-sans leading-relaxed">
        {/* Topo da Via */}
        <div className="flex items-start justify-between border-b border-slate-300 pb-3 mb-3 gap-3">
          <div>
            <div className="flex items-center gap-1.5 font-black text-slate-900 tracking-tight text-sm">
              <span>MARKS SYSTEMS</span>
              <span className="text-slate-400 font-normal">•</span>
              <span className="text-emerald-700">CRVA DETRAN/RS</span>
            </div>
            <div className="text-[11px] font-bold text-slate-700 mt-0.5">
              {dados.tituloDocumento || 'Comprovante de Quitação Fiscal'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              Emissão: {dados.dataHora} • Turno Caixa
            </div>
          </div>

          <div className="text-right shrink-0">
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                isVia1
                  ? 'bg-slate-100 text-slate-800 border-slate-400'
                  : 'bg-indigo-50 text-indigo-900 border-indigo-400'
              }`}
            >
              {viaLabel}
            </span>
            <div className="font-mono font-bold text-slate-900 text-xs mt-1">
              {dados.numeroRecibo}
            </div>
          </div>
        </div>

        {/* Dados do Tomador e Atendimento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-3 text-[11px]">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
              {dados.tomadorLabel || 'Tomador / Requerente'}
            </span>
            <strong className="text-slate-900 block truncate" title={dados.tomadorNome}>
              {dados.tomadorNome}
            </strong>
            <span className="text-slate-600 font-mono">CPF/CNPJ: {docTomador}</span>
            {dados.veiculoPlaca && (
              <span className="ml-2 inline-block font-mono font-bold text-slate-800 bg-slate-200 px-1.5 py-0.5 rounded text-[10px]">
                Placa: {dados.veiculoPlaca.toUpperCase()}
              </span>
            )}
          </div>

          <div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                Atendimento e Caixa
              </span>
              {dados.atendenteNome && (
                <div className="text-slate-700">
                  Atendente: <strong>{dados.atendenteNome}</strong>
                </div>
              )}
              <div className="text-slate-700">
                Operador Caixa: <strong>{dados.operadorNome}</strong>
              </div>
              {dados.faturaReferencia && (
                <div className="text-slate-700 truncate" title={dados.faturaReferencia}>
                  Ref. Recibo: <strong className="font-mono">{dados.faturaReferencia}</strong>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bloco Condicional: VÍNCULO DE AUDITORIA (CLIENTE FINAL) */}
        {(dados.clienteFinalNome || docCliFinal || dados.clienteFinalPlaca) && (
          <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 mb-3 text-[11px]">
            <span className="text-[9px] font-black uppercase tracking-wider text-sky-800 block mb-0.5">
              VÍNCULO DE AUDITORIA (CLIENTE FINAL)
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-800">
              {dados.clienteFinalNome && (
                <span>
                  Cliente Final Vinculado: <strong className="text-slate-950">{dados.clienteFinalNome}</strong>
                </span>
              )}
              {docCliFinal && (
                <span className="font-mono">
                  • CPF/CNPJ: <strong className="text-slate-950">{docCliFinal}</strong>
                </span>
              )}
              {dados.clienteFinalPlaca && (
                <span className="font-mono">
                  • Placa:{' '}
                  <strong className="bg-sky-100 text-sky-950 px-1.5 py-0.5 rounded text-[10px]">
                    {dados.clienteFinalPlaca.toUpperCase()}
                  </strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Tabela de Serviços */}
        <div className="mb-3">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-slate-300 text-slate-500 font-bold uppercase text-[9px]">
                <th className="py-1">Cód.</th>
                <th className="py-1">Descrição do Ato / Emolumento</th>
                <th className="py-1 text-center">Qtd</th>
                <th className="py-1 text-right">Unitário</th>
                <th className="py-1 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {dados.itens.map((it, idx) => (
                <tr key={idx} className="text-slate-800">
                  <td className="py-1 text-slate-500 text-[10px]">{it.codigo}</td>
                  <td className="py-1 font-sans text-slate-900">{it.descricao}</td>
                  <td className="py-1 text-center">{it.quantidade}</td>
                  <td className="py-1 text-right">{formatarMoeda(it.valorUnitario)}</td>
                  <td className="py-1 text-right font-bold">{formatarMoeda(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Resumo Financeiro */}
        <div className="border border-slate-300 bg-slate-50 p-2.5 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="text-[11px] space-y-0.5">
            <div>
              Forma de Pagamento:{' '}
              <strong className="text-slate-900 uppercase">{dados.formaPagamento}</strong>
            </div>
            {dados.valorRecebido && dados.valorRecebido > dados.valorTotal && (
              <div className="text-slate-600 font-mono text-[10px]">
                Recebido: {formatarMoeda(dados.valorRecebido)} | Troco:{' '}
                {formatarMoeda(dados.troco || 0)}
              </div>
            )}
            {dados.saldoAnterior !== undefined && dados.saldoAnterior !== null && (
              <div className="text-slate-600 font-mono text-[10px]">
                Saldo Anterior: {formatarMoeda(dados.saldoAnterior)} | Saldo Restante:{' '}
                <strong className="text-slate-900">{formatarMoeda(dados.saldoRestante ?? 0)}</strong>
              </div>
            )}
            <div className="text-slate-500 text-[10px] font-mono">
              Autenticação: {dados.hashAutenticidade}
            </div>
          </div>

          <div className="text-right w-full sm:w-auto font-mono shrink-0">
            <div className="text-[10px] text-slate-600">
              Subtotal: <span>{formatarMoeda(dados.subtotal)}</span> | ISSQN (2%):{' '}
              <span>+{formatarMoeda(dados.issqn)}</span>
            </div>
            <div className="text-sm font-black text-slate-950 mt-0.5">
              TOTAL PAGO:{' '}
              <span className="text-emerald-700 text-base">{formatarMoeda(dados.valorTotal)}</span>
            </div>
          </div>
        </div>

        {/* Assinatura */}
        <div className="mt-4 pt-3 border-t border-dashed border-slate-300 flex items-end justify-between text-[10px] text-slate-500 gap-3">
          <span>Autenticação digital Marks Systems • Documento fiscal PDV</span>
          <div className="text-center w-56 border-t border-slate-400 pt-1 shrink-0">
            <span className="font-bold text-slate-700 block">{assinatura}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl space-y-5 h-fit">
      {renderA4Via(true)}

      <div className="relative flex items-center justify-center select-none">
        <div className="w-full border-t-2 border-dashed border-slate-600" />
        <span className="absolute bg-slate-950 px-3 py-0.5 rounded-full text-[10px] font-mono text-slate-400 flex items-center gap-1.5 border border-slate-800">
          <Scissors size={12} />
          <span>Corte aqui • 2ª Via Arquivo Caixa</span>
        </span>
      </div>

      {renderA4Via(false)}
    </div>
  );
}
