# ==============================================================================
# PT-BR: Módulo de schemas Pydantic da aplicação OCI DocGen.
#        Define os modelos de dados utilizados para validação, serialização
#        e transferência entre as camadas da aplicação (API ↔ Celery ↔ DocGen).
# EN: Pydantic schema module for the OCI DocGen application.
#     Defines data models used for validation, serialization, and transfer
#     between application layers (API ↔ Celery ↔ DocGen).
# ==============================================================================

from typing import Any, List, Optional

from pydantic import BaseModel, Field


# ==============================================================================
# PT-BR: Modelos de Regras de Rede
# EN: Network Rule Models
# ==============================================================================

class SecurityRule(BaseModel):
    """
    PT-BR: Regra de segurança (Ingress/Egress) de uma Security List ou NSG.
    EN: Security rule (Ingress/Egress) from a Security List or NSG.
    """
    direction: str
    protocol: str
    source_or_destination: Optional[str] = "N/A"
    ports: Optional[str] = ""
    description: Optional[str] = None


class RouteRule(BaseModel):
    """
    PT-BR: Regra de roteamento de uma Route Table.
    EN: Routing rule from a Route Table.
    """
    destination: str
    target: str
    description: Optional[str] = None


# ==============================================================================
# PT-BR: Modelos de Compute e Armazenamento
# EN: Compute and Storage Models
# ==============================================================================

class BlockVolume(BaseModel):
    """
    PT-BR: Volume de bloco anexado a uma instância.
    EN: Block volume attached to a compute instance.
    """
    id: str
    display_name: str
    size_in_gbs: float
    backup_policy_name: str


class VolumeGroupValidation(BaseModel):
    """
    PT-BR: Resultado da validação de um Volume Group (política de backup e replicação).
    EN: Validation result for a Volume Group (backup policy and replication).
    """
    has_backup_policy: bool
    policy_name: Optional[str] = "Nenhuma"
    is_cross_region_replication_enabled: bool
    cross_region_target: Optional[str] = "Desabilitada"


class VolumeGroupData(BaseModel):
    """
    PT-BR: Volume Group com detalhes de membros e resultado de validação.
    EN: Volume Group with member details and validation results.
    """
    id: str
    display_name: str
    availability_domain: str
    lifecycle_state: str
    members: List[str]
    member_ids: List[str]
    validation: VolumeGroupValidation


# ==============================================================================
# PT-BR: Modelos de Rede Virtual (VCN)
# EN: Virtual Network (VCN) Models
# ==============================================================================

class SecurityList(BaseModel):
    """
    PT-BR: Security List e suas regras de entrada/saída.
    EN: Security List and its ingress/egress rules.
    """
    id: str
    name: str
    rules: List[SecurityRule]


class NetworkSecurityGroup(BaseModel):
    """
    PT-BR: Network Security Group (NSG) e suas regras.
    EN: Network Security Group (NSG) and its rules.
    """
    id: str
    name: str
    rules: List[SecurityRule]


class RouteTable(BaseModel):
    """
    PT-BR: Route Table e suas regras de roteamento.
    EN: Route Table and its routing rules.
    """
    id: str
    name: str
    rules: List[RouteRule]


class SubnetData(BaseModel):
    """
    PT-BR: Subnet dentro de uma VCN.
    EN: Subnet within a VCN.
    """
    id: str
    display_name: str
    cidr_block: str


class LpgData(BaseModel):
    """
    PT-BR: Local Peering Gateway (LPG) dentro de uma VCN.
    EN: Local Peering Gateway (LPG) within a VCN.
    """
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


class VcnData(BaseModel):
    """
    PT-BR: Virtual Cloud Network (VCN) com todos os recursos de rede aninhados.
    EN: Virtual Cloud Network (VCN) with all nested networking resources.
    """
    id: str
    display_name: str
    cidr_block: str
    subnets: List[SubnetData]
    security_lists: List[SecurityList]
    route_tables: List[RouteTable]
    network_security_groups: List[NetworkSecurityGroup]
    lpgs: List[LpgData]


# ==============================================================================
# PT-BR: Modelos de Load Balancer
# EN: Load Balancer Models
# ==============================================================================

class BackendData(BaseModel):
    """
    PT-BR: Servidor backend dentro de um Backend Set.
    EN: Backend server within a Backend Set.
    """
    name: str
    ip_address: str
    port: int
    weight: int


class HealthCheckerData(BaseModel):
    """
    PT-BR: Configuração do Health Checker de um Backend Set.
    EN: Health Checker configuration for a Backend Set.
    """
    protocol: str
    port: int
    url_path: Optional[str] = "/"


class BackendSetData(BaseModel):
    """
    PT-BR: Backend Set com política de balanceamento e lista de backends.
    EN: Backend Set with balancing policy and list of backends.
    """
    name: str
    policy: str
    health_checker: HealthCheckerData
    backends: List[BackendData]


class ListenerData(BaseModel):
    """
    PT-BR: Listener de um Load Balancer.
    EN: Load Balancer Listener.
    """
    name: str
    protocol: str
    port: int
    default_backend_set_name: str
    hostname_names: List[str] = []
    # PT-BR: OCIDs dos certificados do OCI Certificates Service vinculados (HTTPS).
    # EN: OCIDs of OCI Certificates Service certs bound to this listener (HTTPS).
    ssl_certificate_ids: List[str] = []


class HostnameData(BaseModel):
    """
    PT-BR: Hostname virtual configurado em um Load Balancer.
    EN: Virtual hostname configured on a Load Balancer.
    """
    name: str


class LoadBalancerIpAddressData(BaseModel):
    """
    PT-BR: Endereço IP associado a um Load Balancer.
    EN: IP address associated with a Load Balancer.
    """
    ip_address: str
    is_public: bool


class LoadBalancerCertificateData(BaseModel):
    """
    PT-BR: Certificado nativo configurado diretamente em um Load Balancer (modelo legado).
    EN: Native certificate configured directly on a Load Balancer (legacy model).
    """
    name: str
    valid_not_after: Optional[str] = "N/A"


class LoadBalancerData(BaseModel):
    """
    PT-BR: Agregador de todos os dados de um Load Balancer, incluindo listeners,
           backend sets, endereços IP e integração WAF.
    EN: Aggregator for all Load Balancer data, including listeners,
        backend sets, IP addresses, and WAF integration.
    """
    display_name: str
    lifecycle_state: str
    shape_name: str
    ip_addresses: List[LoadBalancerIpAddressData]
    listeners: List[ListenerData]
    backend_sets: List[BackendSetData]
    hostnames: List[HostnameData]
    waf_firewall_id: Optional[str] = None
    waf_firewall_name: Optional[str] = None
    waf_policy_id: Optional[str] = None
    waf_policy_name: Optional[str] = None


# ==============================================================================
# PT-BR: Modelos de Conectividade Externa (DRG / VPN IPSec)
# EN: External Connectivity Models (DRG / VPN IPSec)
# ==============================================================================

class RpcData(BaseModel):
    """
    PT-BR: Remote Peering Connection (RPC) associada a um DRG.
    EN: Remote Peering Connection (RPC) attached to a DRG.
    """
    id: str
    display_name: str
    lifecycle_state: str
    peering_status: str
    peering_status_details: Optional[str] = None


class DrgAttachmentData(BaseModel):
    """
    PT-BR: Attachment de DRG a outro recurso (ex: VCN, RPC).
    EN: DRG attachment to another resource (e.g., VCN, RPC).
    """
    id: str
    display_name: str
    network_id: Optional[str] = None
    network_type: str
    route_table_id: Optional[str] = None
    route_table_name: Optional[str] = "N/A"


class DrgData(BaseModel):
    """
    PT-BR: Dynamic Routing Gateway com seus attachments e RPCs.
    EN: Dynamic Routing Gateway with its attachments and RPCs.
    """
    id: str
    display_name: str
    attachments: List[DrgAttachmentData]
    rpcs: List[RpcData]


class CpeData(BaseModel):
    """
    PT-BR: Customer-Premises Equipment (dispositivo CPE on-premises).
    EN: Customer-Premises Equipment (on-premises CPE device).
    """
    id: str
    display_name: str
    ip_address: str
    vendor: Optional[str] = "N/A"


class PhaseOneDetails(BaseModel):
    """
    PT-BR: Detalhes de criptografia da Fase 1 (IKE) de um túnel IPSec.
    EN: Phase 1 (IKE) encryption details for an IPSec tunnel.
    """
    is_custom: bool
    authentication_algorithm: str
    encryption_algorithm: str
    dh_group: str
    lifetime_in_seconds: int


class PhaseTwoDetails(BaseModel):
    """
    PT-BR: Detalhes de criptografia da Fase 2 (IPSec) de um túnel.
    EN: Phase 2 (IPSec) encryption details for an IPSec tunnel.
    """
    is_custom: bool
    authentication_algorithm: Optional[str] = None
    encryption_algorithm: str
    lifetime_in_seconds: int


class BgpSessionInfo(BaseModel):
    """
    PT-BR: Informações de sessão BGP de um túnel VPN.
    EN: BGP session details for a VPN tunnel.
    """
    oracle_bgp_asn: Optional[str] = "N/A"
    customer_bgp_asn: Optional[str] = "N/A"
    oracle_interface_ip: Optional[str] = "N/A"
    customer_interface_ip: Optional[str] = "N/A"


class TunnelData(BaseModel):
    """
    PT-BR: Túnel de uma conexão IPSec com detalhes de criptografia e validação.
    EN: IPSec connection tunnel with encryption details and validation results.
    """
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
    bgp_session_info: Optional[BgpSessionInfo] = None


class IpsecData(BaseModel):
    """
    PT-BR: Conexão IPSec com rotas estáticas e túneis.
    EN: IPSec connection with static routes and tunnels.
    """
    id: str
    display_name: str
    status: str
    cpe_id: str
    drg_id: str
    static_routes: List[str]
    tunnels: List[TunnelData]


# ==============================================================================
# PT-BR: Modelos de Kubernetes (OKE)
# EN: Kubernetes (OKE) Models
# ==============================================================================

class NodePoolData(BaseModel):
    """
    PT-BR: Node Pool dentro de um cluster OKE.
    EN: Node Pool within an OKE cluster.
    """
    name: str
    kubernetes_version: str
    shape: str
    ocpus: int
    memory_in_gbs: int
    os_image: str
    node_count: int
    subnet_name: str
    boot_volume_size_in_gbs: int


class OkeClusterData(BaseModel):
    """
    PT-BR: Cluster OKE com Node Pools e informações de rede.
    EN: OKE Cluster with Node Pools and networking information.
    """
    id: str
    name: str
    kubernetes_version: str
    vcn_id: str
    vcn_name: str
    public_api_endpoint: Optional[str] = "N/A"
    private_api_endpoint: Optional[str] = "N/A"
    lb_subnet_name: str
    nodes_subnet_name: str
    node_pools: List[NodePoolData]


# ==============================================================================
# PT-BR: Modelos de WAF (Web Application Firewall)
# EN: WAF (Web Application Firewall) Models
# ==============================================================================

class WafAction(BaseModel):
    """
    PT-BR: Ação configurada em uma política WAF.
    EN: Action configured in a WAF Policy.
    """
    name: str
    type: str
    code: Optional[int] = None


class WafAccessControlRule(BaseModel):
    """
    PT-BR: Regra de Controle de Acesso em uma política WAF.
    EN: Access Control Rule in a WAF Policy.
    """
    name: str
    action_name: str
    condition: Optional[str] = None
    condition_language: Optional[str] = None


class WafProtectionCapability(BaseModel):
    """
    PT-BR: Capability ativada dentro de uma Protection Rule.
    EN: Capability activated within a Protection Rule.
    """
    key: str
    version: int
    action_name: Optional[str] = None


class WafProtectionRule(BaseModel):
    """
    PT-BR: Regra de proteção de requisições em uma política WAF.
    EN: Request protection rule in a WAF Policy.
    """
    name: str
    action_name: str
    condition: Optional[str] = None
    is_body_inspection_enabled: bool = False
    protection_capabilities: List[WafProtectionCapability] = []


class WafRateLimitingRule(BaseModel):
    """
    PT-BR: Regra de Rate Limiting em uma política WAF.
    EN: Rate Limiting rule in a WAF Policy.
    """
    name: str
    action_name: str
    condition: Optional[str] = None


class WafFirewallData(BaseModel):
    """
    PT-BR: Recurso Web App Firewall (instância do firewall).
    EN: Web App Firewall resource (firewall instance).
    """
    id: str
    display_name: str
    backend_type: str
    load_balancer_id: Optional[str] = None


class WafIntegrationData(BaseModel):
    """
    PT-BR: Dados de integração entre o Firewall WAF e o Load Balancer.
    EN: Integration data between the WAF Firewall and the Load Balancer.
    """
    firewall: WafFirewallData
    load_balancer: Optional["LoadBalancerData"] = None


class WafNetworkInfrastructure(BaseModel):
    """
    PT-BR: Infraestrutura de rede subjacente ao WAF/LB (VCN e Subnet).
    EN: Underlying network infrastructure for the WAF/LB (VCN and Subnet).
    """
    vcn_name: str = "N/A"
    vcn_cidr: str = "N/A"
    subnet_name: str = "N/A"
    subnet_cidr: str = "N/A"


class WafPolicyData(BaseModel):
    """
    PT-BR: Agregador de todos os dados coletados de uma política WAF da OCI.
    EN: Aggregator for all collected data from a single OCI WAF Policy.
    """
    id: str
    display_name: str
    compartment_name: str
    lifecycle_state: str
    region: str
    time_created: str
    actions: List[WafAction] = []
    access_control_rules: List[WafAccessControlRule] = []
    protection_rules: List[WafProtectionRule] = []
    rate_limiting_rules: List[WafRateLimitingRule] = []
    integration: Optional[WafIntegrationData] = None
    network_infrastructure: Optional[WafNetworkInfrastructure] = None


# ==============================================================================
# PT-BR: Modelo Agregador Principal de Infraestrutura
# EN: Main Infrastructure Aggregator Model
# ==============================================================================

class InstanceData(BaseModel):
    """
    PT-BR: Agregador de todos os dados coletados de uma instância OCI.
    EN: Aggregator for all collected data from a single OCI instance.
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


class InfrastructureData(BaseModel):
    """
    PT-BR: Agregador principal de toda a infraestrutura coletada de um compartimento.
           É o objeto raiz retornado pelas tarefas Celery e consumido pelo doc_generator.
    EN: Main aggregator for all infrastructure data collected from a compartment.
        This is the root object returned by Celery tasks and consumed by doc_generator.
    """
    instances: List[InstanceData]
    vcns: List[VcnData]
    drgs: List[DrgData]
    cpes: List[CpeData]
    ipsec_connections: List[IpsecData]
    load_balancers: List[LoadBalancerData]
    volume_groups: List[VolumeGroupData]
    kubernetes_clusters: List[OkeClusterData] = []
    waf_policies: List[WafPolicyData] = []
    # PT-BR: Certificados armazenados como dicts para flexibilidade máxima,
    #        pois sua estrutura varia conforme o tipo de certificado OCI.
    # EN: Certificates stored as dicts for maximum flexibility, as their
    #     structure varies depending on the OCI certificate type.
    certificates: Optional[List[dict]] = []


# ==============================================================================
# PT-BR: Schemas de Requisição/Resposta da API
# EN: API Request / Response Schemas
# ==============================================================================

class NewHostRequest(BaseModel):
    """
    PT-BR: Corpo da requisição para coleta de dados de um novo host.
    EN: Request body for fetching new host data.
    """
    instance_ids: List[str]
    compartment_id: str
    compartment_name: str


class GenerateDocRequest(BaseModel):
    """
    PT-BR: Corpo da requisição para geração de documento .docx.
    EN: Request body for .docx document generation.
    """
    doc_type: str
    infra_data: InfrastructureData
    responsible_name: str = Field(..., min_length=1)
    lang: str = "pt"


class TaskCreationResponse(BaseModel):
    """
    PT-BR: Resposta retornada ao criar uma nova tarefa em background.
    EN: Response returned when a new background task is created.
    """
    task_id: str


class TaskStatusResponse(BaseModel):
    """
    PT-BR: Resposta do endpoint de verificação de status de tarefa.
    EN: Response from the task status check endpoint.
    """
    task_id: str
    status: str
    result: Optional[Any] = None