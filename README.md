# OCI DocGen: Oracle Cloud Documentation Automation

<p align="center">
  <strong>Generate complete technical documentation of your OCI infrastructure in minutes, not days.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Oracle%20Cloud-Automation-red?style=for-the-badge&logo=oracle" alt="OCI Automation">
  <img src="https://img.shields.io/badge/Python-3.10%2B-blue?style=for-the-badge&logo=python" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-Web%20Backend-green?style=for-the-badge&logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/JavaScript-ES6-yellow?style=for-the-badge&logo=javascript" alt="JavaScript">
</p>

OCI DocGen is a full-stack tool designed to automate the creation of infrastructure documentation on Oracle Cloud Infrastructure (OCI).  
With an intuitive web interface, the tool performs a complete scan in a compartment, collects detailed data about provisioned resources, and generates a standardized, professional `.docx` document.

## Key Features

- **Automatic Discovery**: Maps and hierarchically lists the tenancy’s regions and compartments.  
- **Three Documentation Modes**: Option to generate a document focused on New Hosts, a full report of a compartment’s infrastructure, or specific Kubernetes (OKE) documentation.  
- **Comprehensive Data Collection**: Extracts detailed information from multiple OCI services.  
- **Interactive Web Interface**: Clean and responsive frontend that guides the user step by step in the selection process.  
- **Manual Attachments**: Supports uploading architecture diagrams and visual evidence (e.g., antivirus screenshots).  
- **Professional Output**: Generates a formatted `.docx` file, ready to deliver to clients or internal audits.  

## OCI Resources Covered

### Compute
- Instances: Shape, OCPUs, Memory, Operating System, IPs, State.

### Storage
- Boot Volumes and Block Volumes: Size, Backup Policies.  
- Volume Groups: Members, Backup Policy Validation, Cross-Region Replication.  

### Networking
- Virtual Cloud Networks (VCNs).  
- Subnets.  
- Security Lists and Route Tables (all rules and descriptions).  
- Network Security Groups (NSGs) (rules and associations).  
- Load Balancers (Shape, IPs, Listeners, Backend Sets, Health Checkers).  
- Local Peering Gateways (LPGs).  

### Connectivity
- Dynamic Routing Gateways (DRGs) (attachments and RPCs).  
- Customer-Premises Equipment (CPEs).  
- IPSec Connections (tunnels, encryption phases, status, routing).  

### Containers & Orchestration
- Oracle Kubernetes Engine (OKE): Cluster details, version, associated VCN, API endpoints (Public/Private).  
- Node Pools: Shape, node count, OS image, resources, subnets.  

## Workflow Diagram

```mermaid
graph TD
    %% ===============================
    %% FRONTEND
    %% ===============================
    subgraph "Frontend (Interface Web)"
        A[1. Acessar Interface] --> B{2. Selecionar Região}
        B --> C{3. Selecionar Tipo de Documento}
        C -- "Infraestrutura ou Kubernetes" --> D{4. Selecionar Compartimento}
        C -- "Novo Host" --> E{4. Selecionar Compartimento}
        E --> F{5. Selecionar Instâncias}
        D --> G[6. Buscar Dados de Infra/OKE]
        F --> H["6. Buscar Dados de Novo(s) Hosts"]
        G --> I[7. Visualizar Resumo Completo]
        H --> I
        I --> J{8. Anexar Imagens?}
        J -- "Sim" --> K[Upload de Arquivos]
        J -- "Não" --> L
        K --> L[9. Gerar Documento]
    end

    %% ===============================
    %% BACKEND API
    %% ===============================
    subgraph "Backend API (FastAPI)"
        API_Regions["GET /api/regions"]
        API_Compartments["GET /api/{region}/compartments"]
        API_Instances["GET /api/{region}/instances/{id}"]
        API_InfraDetails["POST /api/{region}/infrastructure-details/{id}"]
        API_NewHost["POST /api/{region}/new-host-details"]
        API_Generate["POST /api/generate-document"]
    end

    %% ===============================
    %% LÓGICA INTERNA
    %% ===============================
    subgraph "Lógica Interna (Backend)"
        Connector["oci_connector.py<br/>(Coleta dados via OCI SDK)"]
        Generator["doc_generator.py<br/>(Cria .docx com python-docx)"]
    end

    %% ===============================
    %% RESULTADO
    %% ===============================
    subgraph "Resultado Final"
        Download[10. Download do arquivo .docx]
    end

    %% ===============================
    %% CONEXÕES
    %% ===============================
    %% Frontend -> Backend
    B --> API_Regions
    D --> API_Compartments
    E --> API_Compartments
    F --> API_Instances
    G --> API_InfraDetails
    H --> API_NewHost
    L --> API_Generate

    %% Backend interno
    API_Regions & API_Compartments & API_Instances & API_InfraDetails & API_NewHost --> Connector
    API_Generate --> Generator

    %% Saída final
    Generator --> Download
```

## Technologies Used

### Backend
- Python 3.10+  
- FastAPI (RESTful API)  
- OCI Python SDK  
- Pydantic (data validation)  
- python-docx (document generation)  
- Uvicorn / Gunicorn (ASGI/WSGI servers)  

### Frontend
- HTML5, CSS3, Vanilla JavaScript (ES6)  

## Project Structure
```
    .
    ├── backend/
    │   ├── doc_generator.py     # Logic for .docx document generation
    │   ├── generated_docs/      # Directory where documents are saved
    │   ├── main.py              # FastAPI API (endpoints)
    │   ├── oci_connector.py     # OCI integration logic
    │   ├── requirements.txt     # Dependencies
    │   └── schemas.py           # Pydantic models
    └── frontend/
        ├── css/
        │   └── style.css
        ├── js/
        │   └── app.js
        └── index.html
```

## Usage

### Local Development

#### Prerequisites
- Python 3.10+  
- Access to an OCI tenancy with read permissions.

#### OCI Authentication Setup
- **API Key (Default):** Configure `~/.oci/config`.  
- **Instance Principal:**  
  ```bash
  export OCI_AUTH_METHOD=INSTANCE_PRINCIPAL
  ```

#### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # macOS/Linux
venv\Scripts\activate    # Windows (CMD)
.\venv\Scripts\Activate # Windows (PowerShell)
pip install -r requirements.txt
uvicorn main:app --reload
```
API available at: `http://127.0.0.1:8000`

#### Frontend
```bash
cd frontend
python3 -m http.server 5500
```
Interface available at: `http://127.0.0.1:5500`

### Production Deployment (VM)

Deployment instructions for Ubuntu VM on OCI, using **Nginx** as reverse proxy and **Gunicorn** for backend.

(Setup, service, and configuration steps follow best practices as described in the original text.)

## Author
Developed by Pedro Teixeira