# 🚗 INTEGRA CRVA — Sistema de Gestão e Requerimentos Digitais DETRAN/RS

---

## 🇧🇷 Português (Brasil)

### 📌 Visão Geral do Projeto
O **INTEGRA CRVA** é uma solução corporativa full-stack projetada para Centros de Registro de Veículos Automotores (CRVA) e despachantes, otimizando o fluxo de atendimento, coleta cadastral e emissão automatizada de documentos oficiais em estrita conformidade com as portarias e Procedimentos Operacionais Padrão (POP) do DETRAN/RS.

O sistema elimina retrabalho manual, mitiga falhas em emissões veiculares e implementa garantia de autenticidade documental por meio de chaves criptográficas (SHA-256) apostas em cada página gerada.

---

### ⚙️ Funcionalidades e Engenharia Implementada

#### 1. Módulo de Requerimentos e Formulário Inteligente (`src/ModuloCRVA.tsx`)
- **Separação Granular de Endereço**: Coleta estruturada com campos individualizados para CEP, Logradouro, Número, Complemento, Bairro, Cidade e UF, com consulta automática via API dos Correios (ViaCEP) e concatenação dinâmica para consumo do backend.
- **Validação e Máscaras de Entrada**: Máscara em tempo real para telefone no formato estrito `(99)99999-9999` ou `(99)9999-9999`, além de validações com regex para CPF/CNPJ, Placa (Mercosul e padrão antigo) e Chassi (17 caracteres alfanuméricos sem I, O, Q).
- **Otimização de Campos**: Supressão de campos redundantes como RG no preenchimento de pessoa física para agilizar a operação, com fallback seguro para identificação digital.
- **Fluxo Guiado de Serviços**: Reposicionamento da seleção de "Serviço Solicitado" ao término do formulário cadastral, imediatamente antes do acionamento da geração documental.

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

#### 3. Motor de PDF de Precisão (`api/gerar_pdf.ts` e `server.ts`)
- **Bloqueio de Quebra Automática**: Configuração de layout em tamanho A4 com coordenadas cartesianas absolutas para forçar o documento a caber estritamente em uma única página A4 por anexo.
- **Posicionamento Absoluto**: Cálculos via coordenadas cartesianas impedindo cortes de cabeçalhos e garantindo espaço visualmente adequado para a assinatura física ou eletrônica do requerente (conforme POP 47).
- **Autenticidade Criptográfica**: Cada emissão gera um hash SHA-256 fixado no rodapé inferior (Y = 785), validando a integridade dos dados transitados.
- **Emissão Integrada**: Geração do Requerimento Geral do DETRAN/RS (Página 1) em conjunto com os anexos técnicos normativos (Página 2), tais como POP 10 ou POP 25.

---

### 🚀 Tecnologias Utilizadas
- **Frontend**: React 19, TypeScript, Tailwind CSS, Motion (Framer Motion), Lucide Icons, Bootstrap 5.
- **Backend / API**: Node.js, Express, PDFKit, Crypto, TSX (com suporte a hot-reload via `watch`).
- **Base de Dados**: Supabase (PostgreSQL) com fallback resiliente para SQLite local (`better-sqlite3`).
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
**INTEGRA CRVA** es una solución corporativa full-stack diseñada para los Centros de Registro de Vehículos Automotores (CRVA) y gestores vehiculares, optimizando el flujo de atención al público, recopilación de datos y emisión automatizada de documentos oficiales en estricto cumplimiento con las normativas y Procedimientos Operativos Estándar (POP) del DETRAN/RS (Brasil).

El sistema elimina el trabajo manual duplicado, previene errores en las emisiones vehiculares e implementa una garantía de autenticidad documental mediante sellos criptográficos (SHA-256) incorporados en cada página emitida.

---

### ⚙️ Funcionalidades e Ingeniería Implementada

#### 1. Módulo de Solicitudes y Formulario Inteligente (`src/ModuloCRVA.tsx`)
- **Captura Granular de Direcciones**: Recopilación estructurada con campos individualizados para Código Postal (CEP), Calle, Número, Complemento, Barrio, Ciudad y Estado (UF), con consulta automática vía API y concatenación dinámica para el backend.
- **Validación y Máscaras en Tiempo Real**: Máscaras automáticas para teléfono `(99)99999-9999`, junto con validaciones regex para CPF/CNPJ, Matrícula/Placa y Número de Chasis (VIN de 17 caracteres).
- **Optimización de Campos**: Supresión de campos redundantes para agilizar la atención en ventanilla.
- **Flujo Guiado de Servicios**: Ubicación estratégica de la selección del trámite al final del formulario, inmediatamente antes de la generación del PDF.

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

#### 3. Motor de PDF de Alta Precisión (`api/gerar_pdf.ts` y `server.ts`)
- **Bloqueo contra Desbordamiento**: Dimensionamiento en hoja A4 con coordenadas cartesianas fijas (`autoPageBreak: false`) para garantizar exactamente una página por anexo técnico.
- **Espaciado Diseñado para Firmas**: Distribución vertical óptima que asegura espacio generoso para firmas manuscritas o electrónicas certificadas (POP 47).
- **Sello de Autenticidad Digital**: Cada requerimiento genera una huella criptográfica SHA-256 inmutable en el pie de página (Y = 785).
- **Emisión Integrada**: Generación conjunta del Requerimiento General del DETRAN/RS (Página 1) y los anexos normativos específicos (Página 2).

---

### 🚀 Tecnologías Utilizadas
- **Frontend**: React 19, TypeScript, Tailwind CSS, Motion, Lucide Icons, Bootstrap 5.
- **Backend / API**: Node.js, Express, PDFKit, Crypto, TSX.
- **Base de Datos**: Supabase (PostgreSQL) y SQLite local (`better-sqlite3`) como mecanismo de respaldo offline.
- **Control de Versiones**: Git y GitHub ([IntegraCRVA](https://github.com/fsobrosa12tc-byte/IntegraCRVA.git)).

---

## 🇺🇸 English

### 📌 Project Overview
**INTEGRA CRVA** is a high-performance full-stack enterprise platform developed for Motor Vehicle Registration Centers (CRVA) and automotive transit agents. It streamlines customer onboarding, data collection, and the automated generation of official statutory documents in compliance with DETRAN/RS (Rio Grande do Sul State Transit Authority, Brazil) standard operating procedures.

The system prevents manual paperwork redundancies, eliminates document layout errors, and ensures verifiable authenticity via SHA-256 cryptographic verification hashes embedded in each printed page.

---

### ⚙️ Key Features & Engineering Architecture

#### 1. Smart Registration & Form Engine (`src/ModuloCRVA.tsx`)
- **Granular Address Collection**: Structured input fields for Postal Code (CEP), Street, Number, Additional Details, District, City, and State (UF), featuring automatic postal lookup and backend dynamic concatenation.
- **Real-Time Input Masks & Validations**: Strict live masking for phone numbers (`(99)99999-9999`), alongside regex-driven checks for National Tax ID (CPF/CNPJ), License Plates, and 17-character VIN/Chassis numbers.
- **Streamlined Operator UX**: Elimination of non-essential input fields to accelerate counter service throughput.
- **Step-by-Step Service Workflow**: Service selection positioned at the conclusion of the onboarding form, ensuring validated state data before document rendering.

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

#### 3. Precision Single-Page PDF Engine (`api/gerar_pdf.ts` & `server.ts`)
- **Strict Single-Page Bounds**: Hardened layout coordinates and boundary rules ensuring annexes fit precisely onto a single A4 page without accidental page overflows.
- **Signature Layout Allowance**: Calculated coordinate positions providing dedicated signature sections compatible with both physical sign-offs and digital certificates (POP 47).
- **Cryptographic Tamper-Proofing**: Each generation produces a verified SHA-256 integrity hash rendered at the footer (Y = 785).
- **Integrated Multi-Page Issuance**: Seamless generation of the primary DETRAN/RS General Application (Page 1) coupled with specific statutory technical annexes (Page 2).

---

### 🚀 Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS, Motion, Lucide Icons, Bootstrap 5.
- **Backend / API**: Node.js, Express, PDFKit, Crypto, TSX with hot-reload watcher.
- **Database**: Supabase (PostgreSQL) with a resilient local SQLite (`better-sqlite3`) offline fallback.
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
