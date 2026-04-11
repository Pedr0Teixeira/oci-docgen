from typing import Any, List, Optional

from pydantic import BaseModel, Field


# --- Compartment Reference ---

class CompartmentRef(BaseModel):
    """Reference to an OCI compartment. Used for multi-compartment aggregation."""
    id: str
    name: str


# --- Network Rule Models ---

class SecurityRule(BaseModel):
    """Ingress/Egress security rule from a Security List or NSG."""
    direction: str
    protocol: str
    source_or_destination: Optional[str] = "N/A"
    ports: Optional[str] = ""
    description: Optional[str] = None


class RouteRule(BaseModel):
    """Routing rule from a Route Table."""
    destination: str
    target: str
    description: Optional[str] = None


# --- Compute and Storage Models ---

class BlockVolume(BaseModel):
    """Block volume attached to a compute instance."""
    id: str
    display_name: str
    size_in_gbs: float
    backup_policy_name: str


class StandaloneVolumeData(BaseModel):
    """
    A block volume that exists in the compartment but is NOT currently
    attached to any instance.
    """
    id: str
    display_name: str
    size_in_gbs: float
    lifecycle_state: str
    backup_policy_name: str
    availability_domain: Optional[str] = None
    compartment_name: Optional[str] = None


class VolumeGroupValidation(BaseModel):
    """Validation result for a Volume Group (backup policy and cross-region replication)."""
    has_backup_policy: bool
    policy_name: Optional[str] = "Nenhuma"
    is_cross_region_replication_enabled: bool
    cross_region_target: Optional[str] = "Desabilitada"


class VolumeGroupData(BaseModel):
    """Volume Group with member details and validation results."""
    id: str
    display_name: str
    availability_domain: str
    lifecycle_state: str
    members: List[str]
    member_ids: List[str]
    validation: VolumeGroupValidation
    compartment_name: Optional[str] = None


# --- Virtual Network (VCN) Models ---

class SecurityList(BaseModel):
    """Security List with its ingress/egress rules."""
    id: str
    name: str
    rules: List[SecurityRule]


class NetworkSecurityGroup(BaseModel):
    """Network Security Group (NSG) and its rules."""
    id: str
    name: str
    rules: List[SecurityRule]


class RouteTable(BaseModel):
    """Route Table and its routing rules."""
    id: str
    name: str
    rules: List[RouteRule]


class SubnetData(BaseModel):
    """Subnet within a VCN."""
    id: str
    display_name: str
    cidr_block: str
    route_table_id: Optional[str] = None
    security_list_ids: List[str] = []
    route_table_name: Optional[str] = None
    security_list_names: List[str] = []
    prohibit_public_ip_on_vnic: bool = False


class LpgData(BaseModel):
    """Local Peering Gateway (LPG) within a VCN."""
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
    peer_vcn_name: Optional[str] = None


class VcnData(BaseModel):
    """Virtual Cloud Network (VCN) with all nested networking resources."""
    id: str
    display_name: str
    cidr_block: str
    subnets: List[SubnetData]
    security_lists: List[SecurityList]
    route_tables: List[RouteTable]
    network_security_groups: List[NetworkSecurityGroup]
    lpgs: List[LpgData]
    compartment_id: Optional[str] = None
    compartment_name: Optional[str] = None


# --- Load Balancer Models ---

class BackendData(BaseModel):
    """Backend server within a Backend Set."""
    name: str
    ip_address: str
    port: int
    weight: int


class HealthCheckerData(BaseModel):
    """Health Checker configuration for a Backend Set."""
    protocol: str
    port: int
    url_path: Optional[str] = "/"


class BackendSetData(BaseModel):
    """Backend Set with its balancing policy and list of backends."""
    name: str
    policy: str
    health_checker: HealthCheckerData
    backends: List[BackendData]


class ListenerData(BaseModel):
    """Load Balancer Listener."""
    name: str
    protocol: str
    port: int
    default_backend_set_name: str
    hostname_names: List[str] = []
    # OCIDs of OCI Certificates Service certs bound to this listener (HTTPS).
    ssl_certificate_ids: List[str] = []


class HostnameData(BaseModel):
    """Virtual hostname configured on a Load Balancer."""
    name: str


class LoadBalancerIpAddressData(BaseModel):
    """IP address associated with a Load Balancer."""
    ip_address: str
    is_public: bool


class LoadBalancerCertificateData(BaseModel):
    """Native certificate configured directly on a Load Balancer (legacy model)."""
    name: str
    valid_not_after: Optional[str] = "N/A"


class LoadBalancerData(BaseModel):
    """
    Aggregator for all Load Balancer data, including listeners,
    backend sets, IP addresses, and WAF integration.
    """
    id: Optional[str] = None           # Load Balancer OCID
    subnet_ids: List[str] = []
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
    compartment_id: Optional[str] = None
    compartment_name: Optional[str] = None


# --- External Connectivity Models (DRG / VPN IPSec) ---

class RpcData(BaseModel):
    """Remote Peering Connection (RPC) attached to a DRG."""
    id: str
    display_name: str
    lifecycle_state: str
    peering_status: str
    peering_status_details: Optional[str] = None
    peer_region_name: Optional[str] = None


class DrgAttachmentData(BaseModel):
    """DRG attachment to another resource (e.g., VCN, RPC)."""
    id: str
    display_name: str
    network_id: Optional[str] = None
    network_type: str
    route_table_id: Optional[str] = None
    route_table_name: Optional[str] = "N/A"


class DrgData(BaseModel):
    """Dynamic Routing Gateway with its attachments and RPCs."""
    id: str
    display_name: str
    attachments: List[DrgAttachmentData]
    rpcs: List[RpcData]
    compartment_id: Optional[str] = None
    compartment_name: Optional[str] = None


class CpeData(BaseModel):
    """Customer-Premises Equipment (on-premises CPE device)."""
    id: str
    display_name: str
    ip_address: str
    vendor: Optional[str] = "N/A"
    compartment_id: Optional[str] = None
    compartment_name: Optional[str] = None


class PhaseOneDetails(BaseModel):
    """Phase 1 (IKE) encryption details for an IPSec tunnel."""
    is_custom: bool
    authentication_algorithm: str
    encryption_algorithm: str
    dh_group: str
    lifetime_in_seconds: int


class PhaseTwoDetails(BaseModel):
    """Phase 2 (IPSec) encryption details for an IPSec tunnel."""
    is_custom: bool
    authentication_algorithm: Optional[str] = None
    encryption_algorithm: str
    lifetime_in_seconds: int


class BgpSessionInfo(BaseModel):
    """BGP session details for a VPN tunnel."""
    oracle_bgp_asn: Optional[str] = "N/A"
    customer_bgp_asn: Optional[str] = "N/A"
    oracle_interface_ip: Optional[str] = "N/A"
    customer_interface_ip: Optional[str] = "N/A"


class TunnelData(BaseModel):
    """IPSec connection tunnel with encryption details and validation results."""
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
    """IPSec connection with static routes and tunnels."""
    id: str
    display_name: str
    status: str
    cpe_id: str
    drg_id: str
    static_routes: List[str]
    tunnels: List[TunnelData]
    compartment_id: Optional[str] = None
    compartment_name: Optional[str] = None


# --- Kubernetes (OKE) Models ---

class NodePoolData(BaseModel):
    """Node Pool within an OKE cluster."""
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
    """OKE Cluster with Node Pools and networking information."""
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
    compartment_id: Optional[str] = None
    compartment_name: Optional[str] = None


# --- WAF Models ---

class WafAction(BaseModel):
    """Action configured in a WAF Policy."""
    name: str
    type: str
    code: Optional[int] = None


class WafAccessControlRule(BaseModel):
    """Access Control Rule in a WAF Policy."""
    name: str
    action_name: str
    condition: Optional[str] = None
    condition_language: Optional[str] = None


class WafProtectionCapability(BaseModel):
    """Capability activated within a Protection Rule."""
    key: str
    version: int
    action_name: Optional[str] = None


class WafProtectionRule(BaseModel):
    """Request protection rule in a WAF Policy."""
    name: str
    action_name: str
    condition: Optional[str] = None
    is_body_inspection_enabled: bool = False
    protection_capabilities: List[WafProtectionCapability] = []


class WafRateLimitingRule(BaseModel):
    """Rate Limiting rule in a WAF Policy."""
    name: str
    action_name: str
    condition: Optional[str] = None


class WafFirewallData(BaseModel):
    """Web App Firewall resource (firewall instance)."""
    id: str
    display_name: str
    backend_type: str
    load_balancer_id: Optional[str] = None


class WafIntegrationData(BaseModel):
    """Integration data between a WAF Firewall and its bound Load Balancer."""
    firewall: WafFirewallData
    load_balancer: Optional["LoadBalancerData"] = None


class WafNetworkInfrastructure(BaseModel):
    """Underlying network infrastructure (VCN and Subnet) for the WAF/LB."""
    vcn_name: str = "N/A"
    vcn_cidr: str = "N/A"
    subnet_name: str = "N/A"
    subnet_cidr: str = "N/A"


class WafPolicyData(BaseModel):
    """Aggregator for all collected data from a single OCI WAF Policy."""
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
    # Kept for backward compatibility — holds the first firewall integration (WAF report flow).
    integration: Optional[WafIntegrationData] = None
    # Full list of all firewall integrations bound to this policy.
    integrations: List[WafIntegrationData] = []
    network_infrastructure: Optional[WafNetworkInfrastructure] = None


# --- Database (DBaaS) Models ---

class DbBackupConfigData(BaseModel):
    """Automatic backup configuration for a Database (RMAN settings)."""
    auto_backup_enabled: bool = False
    auto_backup_window: Optional[str] = None
    auto_full_backup_window: Optional[str] = None
    auto_full_backup_day: Optional[str] = None
    recovery_window_in_days: Optional[int] = None
    backup_destination: Optional[str] = "N/A"
    backup_destination_details: List[Any] = []  # full list of destination objects
    backup_deletion_policy: Optional[str] = None
    run_immediate_full_backup: Optional[bool] = None


class DbBackupData(BaseModel):
    """A single RMAN backup taken for a Database."""
    id: str
    display_name: Optional[str] = "N/A"
    type: Optional[str] = "N/A"           # FULL, INCREMENTAL, VIRTUAL_FULL ...
    lifecycle_state: Optional[str] = "N/A"
    lifecycle_details: Optional[str] = None
    backup_destination_type: Optional[str] = None  # OBJECT_STORE, NFS, RECOVERY_APPLIANCE, LOCAL
    time_started: Optional[str] = None
    time_ended: Optional[str] = None
    database_size_in_gbs: Optional[float] = None
    shape: Optional[str] = None
    database_edition: Optional[str] = None


class DbNodeData(BaseModel):
    """DB Node (compute node) within a DB System."""
    id: str
    hostname: Optional[str] = "N/A"
    lifecycle_state: str
    private_ip: Optional[str] = "N/A"
    fault_domain: Optional[str] = "N/A"
    vnic_id: Optional[str] = None
    software_storage_size_in_gb: Optional[int] = None
    time_created: Optional[str] = None


class DataGuardAssociationData(BaseModel):
    """Data Guard association linking a Database to its peer."""
    id: str
    role: Optional[str] = None                       # PRIMARY, STANDBY, ...
    peer_role: Optional[str] = None
    peer_database_id: Optional[str] = None
    peer_db_system_id: Optional[str] = None
    protection_mode: Optional[str] = None            # MAXIMUM_PERFORMANCE ...
    transport_type: Optional[str] = None             # ASYNC, SYNC ...
    apply_lag: Optional[str] = None
    apply_rate: Optional[str] = None
    lifecycle_state: Optional[str] = None


class DatabaseData(BaseModel):
    """Database (CDB/PDB) within a DB Home."""
    id: str
    db_name: str
    db_unique_name: str
    pdb_name: Optional[str] = None
    sid_prefix: Optional[str] = None
    is_cdb: Optional[bool] = None
    lifecycle_state: str
    character_set: Optional[str] = "N/A"
    ncharacter_set: Optional[str] = "N/A"
    db_workload: Optional[str] = "N/A"
    connection_strings: Optional[dict] = None
    backup_config: Optional[DbBackupConfigData] = None
    kms_key_id: Optional[str] = None
    vault_id: Optional[str] = None
    last_backup_timestamp: Optional[str] = None
    last_backup_duration_in_seconds: Optional[int] = None
    last_failed_backup_timestamp: Optional[str] = None
    time_created: Optional[str] = None
    backups: List[DbBackupData] = []
    data_guard_associations: List[DataGuardAssociationData] = []


class DbHomeData(BaseModel):
    """DB Home within a DB System (Oracle Home location)."""
    id: str
    display_name: str
    db_version: str
    lifecycle_state: str
    db_home_location: Optional[str] = None
    time_created: Optional[str] = None
    databases: List[DatabaseData] = []


class DbSystemData(BaseModel):
    """Aggregator for all collected data from a single OCI DB System (DBaaS)."""
    id: str
    display_name: str
    lifecycle_state: str
    shape: str
    cpu_core_count: int
    memory_size_in_gbs: Optional[int] = None
    data_storage_size_in_gbs: Optional[int] = None
    reco_storage_size_in_gb: Optional[int] = None
    data_storage_percentage: Optional[int] = None
    storage_volume_performance_mode: Optional[str] = None
    storage_management: Optional[str] = None
    disk_redundancy: Optional[str] = None
    node_count: int
    database_edition: str
    license_model: Optional[str] = "N/A"
    version: Optional[str] = "N/A"
    os_version: Optional[str] = None
    hostname: Optional[str] = "N/A"
    domain: Optional[str] = None
    cluster_name: Optional[str] = None
    availability_domain: str
    fault_domains: List[str] = []
    listener_port: Optional[int] = None
    scan_dns_name: Optional[str] = None
    scan_ip_ids: List[str] = []
    vip_ids: List[str] = []
    time_zone: Optional[str] = None
    time_created: Optional[str] = None
    nsg_ids: List[str] = []
    ssh_public_keys_count: Optional[int] = None
    vcn_id: Optional[str] = None
    vcn_name: Optional[str] = "N/A"
    subnet_id: Optional[str] = None
    subnet_name: Optional[str] = "N/A"
    backup_subnet_id: Optional[str] = None
    backup_subnet_name: Optional[str] = None
    db_nodes: List[DbNodeData] = []
    db_homes: List[DbHomeData] = []
    compartment_id: Optional[str] = None
    compartment_name: Optional[str] = None


# --- Infrastructure Aggregator ---

class InstanceData(BaseModel):
    """Aggregator for all collected data from a single OCI compute instance."""
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
    compartment_id: Optional[str] = None
    subnet_id: Optional[str] = None
    subnet_name: Optional[str] = None
    vcn_id: Optional[str] = None


class InfrastructureData(BaseModel):
    """
    Root aggregator for all infrastructure data collected from one or more compartments.
    Returned by Celery tasks and consumed by doc_generator.
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
    db_systems: List[DbSystemData] = []
    # Stored as dicts (not Pydantic models) because certificate structure varies by
    # OCI certificate type (IMPORTED, MANAGED_INTERNALLY, ISSUED_BY_INTERNAL_CA).
    certificates: Optional[List[dict]] = []
    standalone_volumes: List[StandaloneVolumeData] = []
    # Multi-compartment aggregation: list of compartments included in this dataset.
    # Empty or single-element list means single-compartment mode.
    compartments: List[CompartmentRef] = []


# --- API Schemas ---

class NewHostRequest(BaseModel):
    """Request body for new host data collection."""
    instance_ids: List[str]
    compartment_id: str
    compartment_name: str


class ImageSectionMeta(BaseModel):
    """Metadata for a user-defined image section (name, position, file count, captions)."""
    name: str = Field(..., min_length=1)
    position: str = Field("end", pattern="^(start|end)$")
    file_count: int = Field(0, ge=0)
    text_above: str = ""
    text_below: str = ""


class LetterheadMeta(BaseModel):
    """Metadata for header/footer images and optional cover image.

    File bytes are appended after image_section files in this order:
    header (0-1), footer (0-1), cover (0-1).
    """
    enabled: bool = False
    header_file_count: int = Field(0, ge=0, le=1)
    footer_file_count: int = Field(0, ge=0, le=1)
    cover_image_file_count: int = Field(0, ge=0, le=1)


class GenerateDocRequest(BaseModel):
    """Request body for .docx document generation."""
    doc_type: str
    infra_data: InfrastructureData
    responsible_name: str = Field(..., min_length=1)
    lang: str = "pt"
    image_sections: List[ImageSectionMeta] = []
    # Letterhead: optional header/footer on every page + cover image.
    letterhead: Optional[LetterheadMeta] = None
    # Context metadata used for metrics logging.
    compartment_name: Optional[str] = "N/A"
    region: Optional[str] = "N/A"


class TaskCreationResponse(BaseModel):
    """Response returned when a new background task is created."""
    task_id: str


class TaskStatusResponse(BaseModel):
    """Response from the task status check endpoint."""
    task_id: str
    status: str
    result: Optional[Any] = None