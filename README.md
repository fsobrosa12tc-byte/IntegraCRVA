# 🚗 INTEGRA CRVA — Sistema de Gestão, Requerimentos Digitais e PDV Notarial DETRAN/RS

---

## 🇧🇷 Português (Brasil)

### 📌 Visão Geral do Projeto
O **INTEGRA CRVA** é uma solução corporativa full-stack de alta performance desenvolvida para Centros de Registro de Veículos Automotores (CRVA) e despachantes credenciados ao DETRAN/RS. A plataforma integra em um ecossistema único o atendimento receptivo ao cidadão, a confecção automatizada de requerimentos normativos, o controle de ponto de venda (PDV) com esteira em tempo real, a gestão de faturamento a prazo para parceiros e a auditoria fiscal com conciliação contábil e apuração de ISSQN (2,00%).

O sistema elimina retrabalho manual, mitiga falhas em emissões veiculares, protege a operação contra quedas de energia (Crash Recovery) e implementa garantia de autenticidade documental por meio de chaves criptográficas (SHA-256) apostas em cada página gerada.

---

### ⚙️ Funcionalidades e Engenharia Implementada

#### 1. Módulo de Requerimentos e Formulário Inteligente (`src/ModuloCRVA.tsx` / `src/pages/AtendimentoCRVA.tsx`)
- **Separação Granular de Endereço**: Coleta estruturada com campos individualizados para CEP, Logradouro, Número, Complemento, Bairro, Cidade e UF, com consulta automática via API dos Correios (ViaCEP) e concatenação dinâmica para consumo do backend.
- **Validação e Máscaras de Entrada**: Máscara em tempo real para telefone no formato estrito `(99)99999-9999` ou `(99)9999-9999`, além de validações com regex para CPF/CNPJ, Placa (Mercosul e padrão antigo) e Chassi (17 caracteres alfanuméricos sem I, O, Q).
- **Otimização de Campos**: Supressão de campos redundantes como RG no preenchimento de pessoa física para agilizar a operação, com fallback seguro para identificação digital.
- **Fluxo Guiado de Serviços**: Reposicionamento da seleção de "Serviço Solicitado" ao término do formulário cadastral, imediatamente antes do acionamento da geração documental.
- **Lançamento Faturado para Despachantes no Balcão**: Seção dedicada para emissão de ordens diretas em conta-corrente de despachantes credenciados mesmo com a frente de caixa temporariamente fechada, preservando a segregação estrita de funções (sem manuseio de dinheiro pelo atendente).

#### 2. Modais Interativos e Condicionais por Tipo de Serviço
- **Primeiro Emplacamento**:
  - Modal sequencial com efeito de desfoque (`backdrop-blur`) para indicação de Reserva de Placas.
  - Injeção automática da placa introduzida em caixa alta e negrito no texto declaratório do requerimento.
  - Seleção granular de opções acessórias: Impressão de CRLV-e e Emissão de Certidão.
  - Registro e formatação de Gravames/Restrições Financeiras (ex.: Alienação Fiduciária, Arrendamento Mercantil, Reserva de Domínio e agente credor).
- **2ª Via de CRV / ATPV-e ou Validação de CRV (POP 10)**:
  - Seleção entre Solicitação de 2ª via ou Validação com indicação do número do documento anterior.
  - Mapeamento da data de emissão do documento anterior pelo DETRAN/RS.
  - Mapeamento da justificativa legal da não apresentação (Não recebido, Inutilizado, Perdido/extraviado ou Furtado/roubado).
- **Baixa Definitiva de Veículo (POP 25 - Resolução CONTRAN Nº 967/22)**:
  - Seleção categorizada do motivo da baixa (Veículo irrecuperável, Definitivamente desmontado, Sinistrado com laudo de perda total, Vendido/leiloado como sucata, Exportação/Outro País).
  - Declaração de extravios de itens regulamentares (CRV em papel-moeda/veículo verde, Placas, Plaquetas, Lacre).

#### 3. Frente de Caixa Notarial (PDV) e Esteira Realtime (`src/pages/PDV.tsx`)
- **Fila de Comandas em Tempo Real**: Sincronização via WebSockets com escuta bidirecional no PostgreSQL, recebendo instantaneamente os lançamentos concluídos nos guichês de atendimento balcão.
- **Apuração Fiscal Automatizada**: Cálculo contábil discriminado com Subtotal dos Atos, incidência da alíquota municipal de ISSQN (2,00%) somada e valor final a pagar.
- **Segregação de Meios de Pagamento**: Liquidações individualizadas para Dinheiro em Espécie (com modal inteligente de cálculo de troco), PIX Instantâneo, Cartão de Débito, Cartão de Crédito e Faturamento Despachante/Prazo.
- **Esteira de Conta-Corrente de Despachantes (B2B)**: Agrupamento em cards visuais das faturas em aberto por parceiro credenciado, permitindo quitação seletiva ou total com detalhamento de recibos e abatimento em banco de dados.
- **Crash Recovery & Proteção de Turno**: Persistência de estado local que restaura o turno ativo e as operações em andamento caso ocorram quedas de energia elétrica ou fechamento acidental da janela do navegador.
- **Movimentações Auditadas (Livro-Caixa)**: Registro cronológico de suprimentos (troco inicial/reforço) e sangrias (retiradas para cofre) com justificativa obrigatória e rastreabilidade por operador.

#### 4. Fechamento de Turno e Ata Oficial Imutável (`src/components/AtaEncerramento.tsx`)
- **Conferência Cega de Gaveta**: Confronto cego entre o valor declarado fisicamente pelo operador e o saldo contábil apurado pelo sistema, emitindo os pareceres automáticos de Conferência Exata, Sobra de Caixa ou Quebra de Caixa.
- **Snapshot Criptográfico em Banco (JSONB)**: Congelamento permanente dos totalizadores fiscais e movimentações do turno, blindando a ata contra adulterações ou perda de dados em consultas retroativas.
- **Formatação A4 sem Poluição Visual**: Layout padronizado para impressão limpa em folha A4 com remoção de QR Codes desnecessários e campos formais para tripla assinatura física (Operador com CPF, Gerente de Unidade e Responsável Financeiro).

#### 5. Relatórios Analíticos & Reimpressão de Vendas (`src/pages/Relatorios.tsx`)
- **Auditoria de Vendas & 2ª Via**: Listagem completa de todos os lançamentos do dia ou período selecionado, com recurso de reimpressão imediata de comprovante fiscal com marca d'água de segunda via.
- **Consolidado do Catálogo de Atos CRVA**: Tabela discriminada por serviço prestado, contabilizando quantidade executada, total monetário arrecadado e representatividade percentual.
- **Gráfico Interativo em Pizza (Recharts)**: Distribuição visual dinâmica dos atos mais procurados na unidade, com filtros por data, turno e forma de pagamento.

#### 6. Motor de PDF de Precisão (`api/gerar_pdf.ts` e `server.ts`)
- **Bloqueio de Quebra Automática**: Configuração de layout em tamanho A4 com coordenadas cartesianas absolutas para forçar o documento a caber estritamente em uma única página A4 por anexo.
- **Posicionamento Absoluto**: Cálculos via coordenadas cartesianas impedindo cortes de cabeçalhos e garantindo espaço visualmente adequado para a assinatura física ou eletrônica do requerente (conforme POP 47).
- **Autenticidade Criptográfica**: Cada emissão gera um hash SHA-256 fixado no rodapé inferior (Y = 785), validando a integridade dos dados transitados.
- **Emissão Integrada**: Geração do Requerimento Geral do DETRAN/RS (Página 1) em conjunto com os anexos técnicos normativos (Página 2), tais como POP 10 ou POP 25.

---

### 🚀 Tecnologias Utilizadas
- **Frontend**: React 19, TypeScript, Tailwind CSS, Recharts, Motion (Framer Motion), Lucide Icons, Bootstrap 5.
- **Backend / API**: Node.js, Express, PDFKit, Crypto, TSX (com suporte a hot-reload via `watch`).
- **Base de Dados & Realtime**: Supabase (PostgreSQL) com Row Level Security (RLS), Replica Identity Full, publicação WebSocket ativa e fallback resiliente para SQLite local (`better-sqlite3`).
- **Repositório**: Git e GitHub ([IntegraCRVA](https://github.com/fsobrosa12tc-byte/IntegraCRVA.git)).

---

### 🛠️ Instalação e Execução Local

```bash
# 1. Clonar o repositório
git clone https://github.com/fsobrosa12tc-byte/IntegraCRVA.git
cd IntegraCRVA-main

# 2. Instalar dependências
npm install

# 3. Executar o ambiente de desenvolvimento (Frontend + Backend)
npm run dev
```

O frontend estará acessível em `http://localhost:5173` e a API em `http://localhost:3000`.

---

## 🇪🇸 Español

### 📌 Visión General del Proyecto
**INTEGRA CRVA** es una solución corporativa full-stack de alto rendimiento diseñada para los Centros de Registro de Vehículos Automotores (CRVA) y gestores vehiculares autorizados por el DETRAN/RS (Brasil). La plataforma integra en un único entorno la atención al público en ventanilla, la confección automatizada de solicitudes normativas, el punto de venta (PDV) con sincronización en tiempo real, la gestión de cuenta corriente a plazo para despachantes asociados y la auditoría fiscal con conciliación contable y liquidación del impuesto municipal ISSQN (2,00%).

El sistema elimina el trabajo manual duplicado, mitiga errores en trámites vehiculares, protege la operativa frente a interrupciones eléctricas (Crash Recovery) e implementa una garantía de autenticidad documental mediante sellos criptográficos (SHA-256) incorporados en cada página emitida.

---

### ⚙️ Funcionalidades e Ingeniería Implementada

#### 1. Módulo de Solicitudes y Formulario Inteligente (`src/ModuloCRVA.tsx` / `src/pages/AtendimentoCRVA.tsx`)
- **Captura Granular de Direcciones**: Recopilación estructurada con campos individualizados para Código Postal (CEP), Calle, Número, Complemento, Barrio, Ciudad y Estado (UF), con consulta automática vía API y concatenación dinámica para el backend.
- **Validación y Máscaras en Tiempo Real**: Máscaras automáticas para teléfono `(99)99999-9999`, junto con validaciones regex para CPF/CNPJ, Matrícula/Placa y Número de Chasis (VIN de 17 caracteres).
- **Optimización de Campos**: Supresión de campos redundantes para agilizar la atención en ventanilla.
- **Flujo Guiado de Servicios**: Ubicación estratégica de la selección del trámite al final del formulario, inmediatamente antes de la generación del PDF.
- **Facturación a Plazo para Despachantes en Ventanilla**: Sección especializada que permite asentar trámites directamente en la cuenta corriente del gestor vehicular incluso con la caja registradora cerrada, respetando la estricta segregación de funciones (sin gestión de cobro en efectivo por el asistente de atención).

#### 2. Modales Interactivos y Condicionales por Tipo de Trámite
- **Primer Empadronamiento / Matriculación**:
  - Modal interactivo con efecto de desenfoque (`backdrop-blur`) para indicar Reserva de Placas.
  - Inyección automática del número de placa en mayúsculas y negrita en el texto declaratorio.
  - Selección de opciones complementarias: Impresión de CRLV-e y Emisión de Certificado oficial.
  - Registro de gravámenes y restricciones financieras (Leasing, Reserva de Dominio, Gravamen Fiduciario).
- **Duplicado de CRV / ATPV-e o Validación de CRV (POP 10)**:
  - Selección entre Duplicado (2ª Vía) o Validación con registro del número de documento.
  - Justificación legal obligatoria por falta de presentación del documento anterior (No recibido, Inutilizado, Extraviado o Hurtado/robado).
- **Baja Definitiva de Vehículo (POP 25 - Resolución CONTRAN Nº 967/22)**:
  - Selección categorizada del motivo de baja (Irrecuperable, Desmontado, Siniestrado pérdida total, Chatarra/Subasta, Exportación internacional).
  - Declaración jurada de extravíos de elementos reglamentarios (CRV físico, Placas, Plaquetas identificadoras, Precinto).

#### 3. Punto de Venta Notarial (PDV) y Sincronización Realtime (`src/pages/PDV.tsx`)
- **Bandeja de Comandas en Tiempo Real**: Recepción inmediata de requerimientos de ventanilla vía suscripción a eventos PostgreSQL Realtime.
- **Liquidación Tributaria Automatizada**: Discriminación de subtotal de tasas, aplicación del 2,00% de ISSQN municipal sumado y cálculo del total a pagar.
- **Múltiples Medios de Cobro**: Pagos segregados en Efectivo (con modal de cálculo exacto de cambio), PIX, Tarjetas de Débito, Crédito y Facturación a Plazo.
- **Cuenta Corriente de Gestores (B2B)**: Agrupación visual en tarjetas de facturas pendientes por despachante, permitiendo cancelaciones parciales o totales con emisión de recibos.
- **Recuperación ante Caídas (Crash Recovery)**: Protección de sesión que restablece el turno y los valores ante cortes de energía o cierres involuntarios del navegador.
- **Control de Movimientos de Caja**: Registro auditable de aportes de cambio (suprimentos) y retiros hacia caja fuerte (sangrías) con justificación obligatoria.

#### 4. Cierre de Turno y Acta Oficial Inmutable (`src/components/AtaEncerramento.tsx`)
- **Arqueo Ciego de Valores**: Comparación del monto físico declarado por el cajero contra el saldo contable, emitiendo dictamen de Arqueo Exacto, Sobrante o Faltante de caja.
- **Instantánea Inmutable (Snapshot JSONB)**: Almacenamiento blindado en base de datos de todos los totales del turno, garantizando que el acta nunca se altere.
- **Formato A4 Homologado**: Salida optimizada para impresión en papel estándar A4 sin elementos superfluos, incluyendo triple casillero de firmas (Cajero con documento de identidad, Gerente y Auditor Financiero).

#### 5. Reportes Analíticos y Reimpresión de Comprobantes (`src/pages/Relatorios.tsx`)
- **Libro de Ventas y Duplicados**: Listado de transacciones con opción de reimprimir copias oficiales de comprobantes fiscales extraviados.
- **Desglose de Servicios Notariales**: Estadísticas acumuladas por trámite oficial, detallando cantidad ejecutada, recaudación total y peso porcentual.
- **Gráfico Circular Dinámico (Recharts)**: Visualización interactiva de la distribución de servicios por rango temporal y modalidad de pago.

#### 6. Motor de PDF de Alta Precisión (`api/gerar_pdf.ts` y `server.ts`)
- **Bloqueo contra Desbordamiento**: Dimensionamiento en hoja A4 con coordenadas cartesianas fijas (`autoPageBreak: false`) para garantizar exactamente una página por anexo técnico.
- **Espaciado Diseñado para Firmas**: Distribución vertical óptima que asegura espacio generoso para firmas manuscritas o electrónicas certificadas (POP 47).
- **Sello de Autenticidad Digital**: Cada requerimiento genera una huella criptográfica SHA-256 inmutable en el pie de página (Y = 785).
- **Emisión Integrada**: Generación conjunta del Requerimiento General del DETRAN/RS (Página 1) y los anexos normativos específicos (Página 2).

---

### 🚀 Tecnologías Utilizadas
- **Frontend**: React 19, TypeScript, Tailwind CSS, Recharts, Motion, Lucide Icons, Bootstrap 5.
- **Backend / API**: Node.js, Express, PDFKit, Crypto, TSX.
- **Base de Datos & Realtime**: Supabase (PostgreSQL) con RLS, Replica Identity Full, canales WebSocket y respaldo SQLite local (`better-sqlite3`).
- **Control de Versiones**: Git y GitHub ([IntegraCRVA](https://github.com/fsobrosa12tc-byte/IntegraCRVA.git)).

---

## 🇺🇸 English

### 📌 Project Overview
**INTEGRA CRVA** is a high-performance full-stack enterprise platform developed for Motor Vehicle Registration Centers (CRVA) and certified transit dispatchers accredited by DETRAN/RS (Brazil). The platform harmonizes customer intake at the reception desk, statutory document rendering, Point of Sale (POS) operations with real-time queues, corporate invoicing for agency accounts, and full financial auditing with municipal tax (ISSQN 2.00%) calculations.

The system eliminates manual paperwork redundancies, eliminates document layout errors, safeguards counter desks with Crash Recovery state protection, and ensures verifiable authenticity via SHA-256 cryptographic verification hashes embedded into every printed page.

---

### ⚙️ Key Features & Engineering Architecture

#### 1. Smart Registration & Form Engine (`src/ModuloCRVA.tsx` / `src/pages/AtendimentoCRVA.tsx`)
- **Granular Address Collection**: Structured input fields for Postal Code (CEP), Street, Number, Additional Details, District, City, and State (UF), featuring automatic postal lookup and backend dynamic concatenation.
- **Real-Time Input Masks & Validations**: Strict live masking for phone numbers (`(99)99999-9999`), alongside regex-driven checks for National Tax ID (CPF/CNPJ), License Plates, and 17-character VIN/Chassis numbers.
- **Streamlined Operator UX**: Elimination of non-essential input fields to accelerate counter service throughput.
- **Step-by-Step Service Workflow**: Service selection positioned at the conclusion of the onboarding form, ensuring validated state data before document rendering.
- **Agency Credit Onboarding at Counter**: Dedicated billing action enabling clerks to book services directly against pre-approved partner accounts even if cashier terminals are closed, maintaining strict separation of duties (no cash handling by front-desk agents).

#### 2. Service-Specific Contextual Modals
- **First Vehicle Registration (Initial Plating)**:
  - Sequence modal with `backdrop-blur` for custom License Plate Reservation declarations.
  - Automatic uppercase bold injection of reserved license plates into statutory declarations.
  - Granular selection of collateral documents: CRLV-e printouts and Official Registration Certificates.
  - Recording and rendering of financial liens (Fiduciary Alienation, Chattel Mortgages, Leasing).
- **Vehicle Registration Certificate (CRV / ATPV-e) Replacement & Validation (POP 10)**:
  - Radio options to select between Document Replacement (2nd Copy) or Transfer Validation.
  - Regulatory grounds mapping for missing prior documents (Not received, Damaged, Lost, or Stolen).
- **Permanent Vehicle Scrapping / Deregistration (POP 25 - CONTRAN Resolution 967/22)**:
  - Categorized deregistration causes (Unrecoverable, Disassembled, Total Loss Insurance, Scrap/Auctioned, Export/Foreign Transfer).
  - Explicit loss declarations for regulatory hardware items (Physical Green CRV, Plates, Chassis tags, Seal).

#### 3. POS Cashier Desk & Real-Time Sync (`src/pages/PDV.tsx`)
- **Real-Time Order Inflow**: Bidirectional PostgreSQL WebSocket integration instantly routing completed counter forms directly to active cashier terminals.
- **Tax Calculation Engine**: Automated fee segregation detailing service subtotal, municipal ISSQN (2.00%) taxation, and total payable amount.
- **Payment Method Segregation**: Separate channels for Cash (featuring an automated change calculator), instant PIX, Debit Cards, Credit Cards, and Partner Credit/Invoicing.
- **Agency Account Receivable Workflow**: Dedicated card-based ledger displaying outstanding balances per partner, enabling selective or total debt settlement with detailed receipt history.
- **Crash Recovery & Session Continuity**: Client-side resilient state persistence preventing transaction loss during brownouts, power cuts, or accidental browser terminations.
- **Audited Cash Drawer Journal**: Immutable audit trail tracking cash floats (suprimentos) and vault deposits (sangrias) with compulsory justification reasons.

#### 4. Shift Reconciliation & Immutable Statutory Minute (`src/components/AtaEncerramento.tsx`)
- **Blind Cash Balancing**: Blind drawer declaration requiring operators to enter counted banknotes, automatically evaluated as Balanced, Drawer Overage, or Drawer Shortage.
- **Immutable JSONB Snapshot**: Permanent snapshot of all shift transactions and totals frozen in the database, preventing historical tampering or zeroed records.
- **Clean A4 Print Template**: Standardized document output formatted for A4 sheet printing without visual clutter or unneeded QR codes, complete with triple formal signature blocks (Cashier with Tax ID, Unit Manager, and Financial Auditor).

#### 5. Analytical Reports & Transaction Duplicates (`src/pages/Relatorios.tsx`)
- **Sales Ledger & Re-Issuance**: Complete shift-by-shift transaction history with instant re-printing capabilities for lost sales slips branded with secondary audit watermarks.
- **Service Catalog Ledger**: Tabular consolidation by statutory service code, displaying overall volumes, monetary revenue, and revenue share percentages.
- **Interactive Pie Chart (Recharts)**: Dynamic graphic distribution highlighting top in-demand vehicular services filtered by date range and payment method.

#### 6. Precision Single-Page PDF Engine (`api/gerar_pdf.ts` & `server.ts`)
- **Strict Single-Page Bounds**: Hardened layout coordinates and boundary rules ensuring annexes fit precisely onto a single A4 page without accidental page overflows.
- **Signature Layout Allowance**: Calculated coordinate positions providing dedicated signature sections compatible with both physical sign-offs and digital certificates (POP 47).
- **Cryptographic Tamper-Proofing**: Each generation produces a verified SHA-256 integrity hash rendered at the footer (Y = 785).
- **Integrated Multi-Page Issuance**: Seamless generation of the primary DETRAN/RS General Application (Page 1) coupled with specific statutory technical annexes (Page 2).

---

### 🚀 Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS, Recharts, Motion, Lucide Icons, Bootstrap 5.
- **Backend / API**: Node.js, Express, PDFKit, Crypto, TSX with hot-reload watcher.
- **Database & Realtime**: Supabase (PostgreSQL) featuring Row Level Security (RLS), Replica Identity Full, WebSocket channels, and local SQLite (`better-sqlite3`) offline fallback.
- **Source Control**: Git & GitHub ([IntegraCRVA](https://github.com/fsobrosa12tc-byte/IntegraCRVA.git)).

---

### 💻 Local Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/fsobrosa12tc-byte/IntegraCRVA.git
cd IntegraCRVA-main

# 2. Install dependencies
npm install

# 3. Launch the development environment (Frontend + Backend)
npm run dev
```

Access the web interface at `http://localhost:5173` and the API service at `http://localhost:3000`.