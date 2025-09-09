# OCI DocGen
# Autor: Pedro Teixeira
# Data: 09 de Setembro de 2025
# Descrição: Define os modelos de dados (schemas) Pydantic para validação e serialização de dados na API.

from typing import List, Optional

from pydantic import BaseModel, Field

# Estes modelos garantem que os dados trocados entre o frontend e o backend
# tenham uma estrutura consistente e tipos de dados corretos.

class BlockVolume(BaseModel):
    """Representa um Block Volume anexado a uma instância."""
    id: str
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
    boot_volume_id: Optional[str] = None
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

class LpgData(BaseModel):
    """Representa um Local Peering Gateway (LPG) dentro de uma VCN."""
    id: str
    display_name: str
    lifecycle_state: str
    peering_status: str
    peering_status_details: Optional[str] = None
    peer_id: Optional[str] = None
    route_table_id: Optional[str] = None
    peer_advertised_cidr: Optional[str] = None
    is_cross_tenancy_peering: bool
    route_table_name: Optional[str] = "N/A"

class RpcData(BaseModel):
    """Representa uma Remote Peering Connection (RPC) em um DRG."""
    id: str
    display_name: str
    lifecycle_state: str
    peering_status: str
    peering_status_details: Optional[str] = None

class DrgAttachmentData(BaseModel):
    """Representa um anexo de um DRG a outro recurso (ex: VCN, RPC)."""
    id: str
    display_name: str
    network_id: Optional[str] = None
    network_type: str
    route_table_id: Optional[str] = None
    route_table_name: Optional[str] = "N/A"

class VcnData(BaseModel):
    """Representa uma Virtual Cloud Network (VCN) e seus recursos aninhados."""
    id: str
    display_name: str
    cidr_block: str
    subnets: List[SubnetData]
    security_lists: List[SecurityList]
    route_tables: List[RouteTable]
    network_security_groups: List[NetworkSecurityGroup]
    lpgs: List[LpgData]

class DrgData(BaseModel):
    """Representa um Dynamic Routing Gateway e seus anexos."""
    id: str
    display_name: str
    attachments: List[DrgAttachmentData]
    rpcs: List[RpcData]


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

class BackendData(BaseModel):
    """Representa um servidor de backend dentro de um Backend Set."""
    name: str
    ip_address: str
    port: int
    weight: int

class HealthCheckerData(BaseModel):
    """Representa a configuração do Health Checker de um Backend Set."""
    protocol: str
    port: int
    url_path: Optional[str] = "/"

class BackendSetData(BaseModel):
    """Representa um Backend Set de um Load Balancer."""
    name: str
    policy: str
    health_checker: HealthCheckerData
    backends: List[BackendData]

class ListenerData(BaseModel):
    """Representa um Listener de um Load Balancer."""
    name: str
    protocol: str
    port: int
    default_backend_set_name: str
    hostname_names: List[str] = []

class HostnameData(BaseModel):
    """Representa um Virtual Hostname configurado em um Load Balancer."""
    name: str

class LoadBalancerIpAddressData(BaseModel):
    """Representa um endereço IP associado a um Load Balancer."""
    ip_address: str
    is_public: bool

class LoadBalancerData(BaseModel):
    """Modelo principal para agregar todos os dados de um Load Balancer."""
    display_name: str
    lifecycle_state: str
    shape_name: str
    ip_addresses: List[LoadBalancerIpAddressData]
    listeners: List[ListenerData]
    backend_sets: List[BackendSetData]
    hostnames: List[HostnameData]


# --- SCHEMAS PARA VOLUME GROUPS ---
class VolumeGroupValidation(BaseModel):
    """Resultados da validação de um Volume Group."""
    has_backup_policy: bool
    policy_name: Optional[str] = "Nenhuma"
    is_cross_region_replication_enabled: bool
    cross_region_target: Optional[str] = "Desabilitada"

class VolumeGroupData(BaseModel):
    """Representa um Volume Group e seus detalhes."""
    id: str
    display_name: str
    availability_domain: str
    lifecycle_state: str
    members: List[str]
    member_ids: List[str]
    validation: VolumeGroupValidation


class InfrastructureData(BaseModel):
    """Modelo principal para agregar todos os dados de infraestrutura de um compartimento."""
    instances: List[InstanceData]
    vcns: List[VcnData]
    drgs: List[DrgData]
    cpes: List[CpeData]
    ipsec_connections: List[IpsecData]
    load_balancers: List[LoadBalancerData]
    volume_groups: List[VolumeGroupData]


# --- SCHEMAS PARA REQUISIÇÕES DA API ---

class NewHostRequest(BaseModel):
    """Modelo para a requisição de detalhes de novos hosts."""
    instance_ids: List[str]
    compartment_id: str
    compartment_name: str


class GenerateDocRequest(BaseModel):
    """
    Modelo para o corpo da requisição de geração de qualquer tipo de documento.
    """
    doc_type: str
    infra_data: InfrastructureData
    responsible_name: str = Field(..., min_length=1)