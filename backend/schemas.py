# OCI DocGen
# Autor: Pedro Teixeira
# Data: 03 de Setembro de 2025
# Descrição: Define os modelos de dados (schemas) Pydantic para validação e serialização de dados na API.

from typing import List, Optional

from pydantic import BaseModel

# Estes modelos garantem que os dados trocados entre o frontend e o backend
# tenham uma estrutura consistente e tipos de dados corretos.


class BlockVolume(BaseModel):
    """Representa um Block Volume anexado a uma instância."""
    display_name: str
    size_in_gbs: float
    backup_policy_name: str


class SecurityRule(BaseModel):
    """Representa uma regra de segurança (Ingress/Egress) de uma Security List ou NSG."""
    direction: str
    protocol: str
    source_or_destination: Optional[str] = "N/A"
    ports: Optional[str] = ""
    description: Optional[str] = None


class RouteRule(BaseModel):
    """Representa uma regra de uma Route Table."""
    destination: str
    target: str
    description: Optional[str] = None


class SecurityList(BaseModel):
    """Representa uma Security List e suas regras associadas."""
    id: str
    name: str
    rules: List[SecurityRule]


class NetworkSecurityGroup(BaseModel):
    """Representa um Network Security Group (NSG) e suas regras."""
    id: str
    name: str
    rules: List[SecurityRule]


class RouteTable(BaseModel):
    """Representa uma Route Table e suas regras de roteamento."""
    id: str
    name: str
    rules: List[RouteRule]


class InstanceData(BaseModel):
    """
    Modelo principal que agrega todos os detalhes coletados de uma única instância da OCI.
    """
    host_name: str
    lifecycle_state: str
    shape: str
    ocpus: str
    memory: str
    os_name: str
    boot_volume_gb: str
    private_ip: str
    public_ip: Optional[str] = "N/A"
    backup_policy_name: str
    block_volumes: List[BlockVolume]
    security_lists: List[SecurityList]
    network_security_groups: List[NetworkSecurityGroup]
    route_table: Optional[RouteTable] = None
    compartment_name: str


# --- SCHEMAS PARA DOCUMENTAÇÃO DE INFRAESTRUTURA (DADOS COLETADOS) ---

class SubnetData(BaseModel):
    """Representa uma Subnet dentro de uma VCN."""
    id: str
    display_name: str
    cidr_block: str


class VcnData(BaseModel):
    """Representa uma Virtual Cloud Network (VCN) e seus recursos aninhados."""
    id: str
    display_name: str
    cidr_block: str
    subnets: List[SubnetData]
    security_lists: List[SecurityList]
    route_tables: List[RouteTable]
    network_security_groups: List[NetworkSecurityGroup]


class DrgAttachmentData(BaseModel):
    """Representa um anexo de um DRG a outro recurso (ex: VCN)."""
    id: str
    display_name: str
    network_id: str
    network_type: str


class DrgData(BaseModel):
    """Representa um Dynamic Routing Gateway e seus anexos."""
    id: str
    display_name: str
    attachments: List[DrgAttachmentData]


class CpeData(BaseModel):
    """Representa um Customer-Premises Equipment."""
    id: str
    display_name: str
    ip_address: str
    vendor: Optional[str] = "N/A"


class PhaseOneDetails(BaseModel):
    """Detalhes de criptografia da Fase 1 (IKE)."""
    is_custom: bool
    authentication_algorithm: str
    encryption_algorithm: str
    dh_group: str
    lifetime_in_seconds: int


class PhaseTwoDetails(BaseModel):
    """Detalhes de criptografia da Fase 2 (IPSec)."""
    is_custom: bool
    authentication_algorithm: Optional[str] = None
    encryption_algorithm: str
    lifetime_in_seconds: int


class TunnelData(BaseModel):
    """Representa um túnel de uma conexão IPSec com detalhes de criptografia."""
    id: str
    display_name: str
    status: str
    cpe_ip: Optional[str] = "N/A"
    vpn_oracle_ip: Optional[str] = "N/A"
    routing_type: str
    ike_version: str
    validation_status: str
    validation_details: Optional[str] = None
    phase_one_details: PhaseOneDetails
    phase_two_details: PhaseTwoDetails


class IpsecData(BaseModel):
    """Representa uma conexão IPSec, suas rotas estáticas e túneis."""
    id: str
    display_name: str
    status: str
    cpe_id: str
    drg_id: str
    static_routes: List[str]
    tunnels: List[TunnelData]


class InfrastructureData(BaseModel):
    """Modelo principal para agregar todos os dados de infraestrutura de um compartimento."""
    instances: List[InstanceData]
    vcns: List[VcnData]
    drgs: List[DrgData]
    cpes: List[CpeData]
    ipsec_connections: List[IpsecData]


# --- SCHEMAS PARA REQUISIÇÕES DA API ---

class GenerateDocRequest(BaseModel):
    """
    Modelo para o corpo da requisição de geração de qualquer tipo de documento.
    """
    doc_type: str
    infra_data: InfrastructureData