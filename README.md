# OCI DocGen: Automação de Documentação para Oracle Cloud

<p align="center">
  <strong>Gere documentação técnica completa da sua infraestrutura OCI em minutos, não em dias.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Oracle%20Cloud-Automation-red?style=for-the-badge&logo=oracle" alt="OCI Automation">
  <img src="https://img.shields.io/badge/Python-3.10%2B-blue?style=for-the-badge&logo=python" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-Web%20Backend-green?style=for-the-badge&logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/JavaScript-ES6-yellow?style=for-the-badge&logo=javascript" alt="JavaScript">
</p>

OCI DocGen é uma ferramenta full-stack projetada para automatizar a
criação de documentação de infraestrutura na Oracle Cloud Infrastructure
(OCI). Com uma interface web intuitiva, a ferramenta realiza uma
varredura completa em um compartimento, coleta dados detalhados sobre os
recursos provisionados e gera um documento **.docx** profissional e
padronizado.

## ✨ Principais Funcionalidades

-   **Descoberta Automática:** Mapeia e lista hierarquicamente as
    regiões e compartimentos da sua tenancy.
-   **Dois Modos de Documentação:** Gere um documento focado em novas
    instâncias ou um relatório completo de toda a infraestrutura de um
    compartimento.
-   **Coleta de Dados Abrangente:** Extrai informações detalhadas de
    múltiplos serviços da OCI.
-   **Interface Web Interativa:** Um frontend limpo e reativo que guia o
    usuário passo a passo no processo de seleção.
-   **Anexos Manuais:** Permite o upload de evidências visuais, como
    diagramas de arquitetura e prints de configuração.
-   **Saída Profissional:** Gera um arquivo **.docx** bem formatado,
    pronto para ser entregue a clientes ou auditorias internas.

## ☁️ Recursos OCI Cobertos

### Compute

-   Instâncias (Shape, OCPUs, Memória, S.O., IPs)
-   Boot Volumes (Tamanho, Política de Backup)
-   Block Volumes (Tamanho, Política de Backup)

### Networking (VCN)

-   Virtual Cloud Networks (VCNs)
-   Subnets
-   Security Lists (todas as regras)
-   Route Tables (todas as regras)
-   Network Security Groups (NSGs) (todas as regras)
-   Load Balancers (LBaaS)
    -   IPs, Shape, Listeners
    -   Backend Sets, Backends e Health Checkers
-   Local Peering Gateways (LPGs)

### Conectividade

-   Dynamic Routing Gateways (DRGs)
-   Anexos de DRG (VCN, RPC, etc.)
-   Remote Peering Connections (RPCs)
-   Customer-Premises Equipment (CPEs)
-   IPSec Connections (detalhes de túneis e criptografia)

## 🔄 Diagrama de Funcionamento

``` mermaid
graph TD
    subgraph Usuario & Frontend
        A[Acessa a Interface Web] --> B[Seleciona Região]
        B --> C[Seleciona Compartimento]
        C --> D[Seleciona Instâncias - Para Novo Host]
        D --> E[Clica em Buscar Dados - para Novo Host]
        C --> F[Clica em Buscar Dados - para Infraestrutura Completa]
        E --> G[Visualiza Resumo de Instância]
        F --> H[Visualiza Resumo da Infraestrutura - Instâncias, VCNs, LBs, DRGs, etc.]
        G --> I{Anexa Imagens?}
        H --> I
        I -- Sim --> J[Faz Upload de Arquivos]
        I -- Não --> K
        J --> K[Gerar Documento]
    end

    subgraph Backend API
        L[GET /api/regions]
        M[GET /api/region/compartments]
        N[GET /api/region/instances/compartment_id]
        O[GET /api/region/instance-details/instance_id]
        P[POST /api/region/infrastructure-details/compartment_id]
        Q[POST /api/generate-document]
    end

    subgraph OCI Connector
        R[oci_connector.py]
        S[OCI SDK]
    end
    
    subgraph Doc Generator
        T[doc_generator.py - Cria .docx]
    end

    subgraph Documento Final
        U[Download .docx]
    end

    A -->|"1. Requisição Inicial"| L
    L -->|"2. Lista de Regiões"| B

    B -->|"3. Requisição de Compartimentos"| M
    M -->|"4. Lista de Compartimentos"| C

    C -->|"5. Requisição de Instâncias - Novo Host"| N
    N -->|"6. Lista de Instâncias"| D

    D -->|"7. Requisição de Detalhes - Instância Única"| O
    O -->|"8. Retorna Detalhes Consolidados"| G

    C -->|"7'. Requisição de Detalhes - Infra Completa"| P
    P -->|"8'. Retorna Detalhes Consolidados"| H

    G & H --> I
    I -->|"9. Envia JSON + Arquivos"| Q
    Q --> T
    T -->|"10. Retorna Arquivo"| U
    U -->|"11. Usuário baixa documento"| V(Fim)

    L & M & N & O & P --> R
    R -->|"Chama API da OCI"| S
    S -->|"Retorna dados brutos"| R
    R -->|"Processa e mapeia dados"| L & M & N & O & P

    Q --> T
    T --> Q
```

## 🛠️ Tecnologias Utilizadas

### Backend

-   **Python 3.10+**
-   **FastAPI**: Criação da API RESTful.
-   **OCI Python SDK**: Interação com a API da Oracle Cloud.
-   **Pydantic**: Validação e serialização de dados.
-   **python-docx**: Geração e manipulação de arquivos .docx.
-   **Uvicorn**: Servidor ASGI para rodar a aplicação.

### Frontend

-   **HTML5**
-   **CSS3**
-   **Vanilla JavaScript (ES6)**

## 📂 Estrutura do Projeto
```
    .
    ├── backend/
    │   ├── doc_generator.py     # Lógica para criar o documento .docx
    │   ├── generated_docs/      # Diretório onde os documentos são salvos
    │   ├── main.py              # API FastAPI (endpoints)
    │   ├── oci_connector.py     # Conexão e busca de dados da OCI
    │   ├── requirements.txt     # Dependências Python
    │   └── schemas.py           # Modelos Pydantic
    └── frontend/
        ├── css/
        │   └── style.css        # Estilos
        ├── js/
        │   └── app.js           # Lógica do frontend
        └── index.html           # Interface principal
```

## 🚀 Instalação e Execução

### Pré-requisitos

-   Python 3.8+
-   Configuração do **OCI CLI** com `~/.oci/config` válido.

### 1. Backend

``` bash
cd backend
python3 -m venv venv
source venv/bin/activate   # macOS/Linux
source venv/bin/activate   # macOS/Linux
.\venv\Scripts\activate    # Windows (PowerShell)
venv\Scripts\activate      # Windows (CMD)
pip install -r requirements.txt
uvicorn main:app --reload
```

A API estará disponível em: `http://127.0.0.1:8000`

### 2. Frontend

``` bash
cd frontend
python3 -m http.server 5500
```

A interface estará em: `http://127.0.0.1:5500`

## 📖 Instruções de Uso

1.  Selecione a **Região**.
2.  Escolha o **Tipo de Documentação**: Novo Host ou Infraestrutura.
3.  Selecione o **Compartimento**.
4.  Escolha as **Instâncias** (se aplicável).
5.  Clique em **Buscar Dados**.
6.  (Opcional) Anexe imagens/arquivos.
7.  Clique em **Gerar Documento (.docx)**.

------------------------------------------------------------------------

### ✍️ Criado por Pedro Teixeira
