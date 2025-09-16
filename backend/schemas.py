# OCI DocGen
# Author: Pedro Teixeira
# Date: September 12, 2025
# Description: Defines Pydantic data models (schemas) for data validation and serialization in the API.

from typing import List, Optional

from pydantic import BaseModel, Field

# These models ensure that data exchanged between the frontend and backend
# has a consistent structure and correct data types.

class BlockVolume(BaseModel):
    """Represents a Block Volume attached to an instance."""
    id: str
    display_name: str
    size_in_gbs: float
    backup_policy_name: str


class SecurityRule(BaseModel):
    """Represents a security rule (Ingress/Egress) of a Security List or NSG."""
    direction: str
    protocol: str
    source_or_destination: Optional[str] = "N/A"
    ports: Optional[str] = ""
    description: Optional[str] = None


class RouteRule(BaseModel):
    """Represents a rule of a Route Table."""
    destination: str
    target: str
    description: Optional[str] = None


class SecurityList(BaseModel):
    """Represents a Security List and its associated rules."""
    id: str
    name: str
    rules: List[SecurityRule]


class NetworkSecurityGroup(BaseModel):
    """Represents a Network Security Group (NSG) and its rules."""
    id: str
    name: str
    rules: List[SecurityRule]


class RouteTable(BaseModel):
    """Represents a Route Table and its routing rules."""
    id: str
    name: str
    rules: List[RouteRule]


class InstanceData(BaseModel):
    """
    Main model that aggregates all collected details from a single OCI instance.
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


# --- SCHEMAS FOR INFRASTRUCTURE DOCUMENTATION (COLLECTED DATA) ---

class SubnetData(BaseModel):
    """Represents a Subnet within a VCN."""
    id: str
    display_name: str
    cidr_block: str

class LpgData(BaseModel):
    """Represents a Local Peering Gateway (LPG) within a VCN."""
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
    """Represents a Remote Peering Connection (RPC) in a DRG."""
    id: str
    display_name: str
    lifecycle_state: str
    peering_status: str
    peering_status_details: Optional[str] = None

class DrgAttachmentData(BaseModel):
    """Represents a DRG attachment to another resource (e.g., VCN, RPC)."""
    id: str
    display_name: str
    network_id: Optional[str] = None
    network_type: str
    route_table_id: Optional[str] = None
    route_table_name: Optional[str] = "N/A"

class VcnData(BaseModel):
    """Represents a Virtual Cloud Network (VCN) and its nested resources."""
    id: str
    display_name: str
    cidr_block: str
    subnets: List[SubnetData]
    security_lists: List[SecurityList]
    route_tables: List[RouteTable]
    network_security_groups: List[NetworkSecurityGroup]
    lpgs: List[LpgData]

class DrgData(BaseModel):
    """Represents a Dynamic Routing Gateway and its attachments."""
    id: str
    display_name: str
    attachments: List[DrgAttachmentData]
    rpcs: List[RpcData]


class CpeData(BaseModel):
    """Represents a Customer-Premises Equipment."""
    id: str
    display_name: str
    ip_address: str
    vendor: Optional[str] = "N/A"


class PhaseOneDetails(BaseModel):
    """Represents the encryption details of Phase 1 (IKE)."""
    is_custom: bool
    authentication_algorithm: str
    encryption_algorithm: str
    dh_group: str
    lifetime_in_seconds: int


class PhaseTwoDetails(BaseModel):
    """Represents the encryption details of Phase 2 (IPSec)."""
    is_custom: bool
    authentication_algorithm: Optional[str] = None
    encryption_algorithm: str
    lifetime_in_seconds: int


class BgpSessionInfo(BaseModel):
    """Represents the details of a BGP session in a VPN tunnel."""
    oracle_bgp_asn: Optional[str] = "N/A"
    customer_bgp_asn: Optional[str] = "N/A"
    oracle_interface_ip: Optional[str] = "N/A"
    customer_interface_ip: Optional[str] = "N/A"


class TunnelData(BaseModel):
    """Represents a tunnel of an IPSec connection with encryption details."""
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
    """Represents an IPSec connection, its static routes, and tunnels."""
    id: str
    display_name: str
    status: str
    cpe_id: str
    drg_id: str
    static_routes: List[str]
    tunnels: List[TunnelData]

class BackendData(BaseModel):
    """Represents a backend server within a Backend Set."""
    name: str
    ip_address: str
    port: int
    weight: int

class HealthCheckerData(BaseModel):
    """Represents the configuration of the Health Checker for a Backend Set."""
    protocol: str
    port: int
    url_path: Optional[str] = "/"

class BackendSetData(BaseModel):
    """Represents a Backend Set of a Load Balancer."""
    name: str
    policy: str
    health_checker: HealthCheckerData
    backends: List[BackendData]

class ListenerData(BaseModel):
    """Represents a Listener of a Load Balancer."""
    name: str
    protocol: str
    port: int
    default_backend_set_name: str
    hostname_names: List[str] = []

class HostnameData(BaseModel):
    """Represents a Virtual Hostname configured on a Load Balancer."""
    name: str

class LoadBalancerIpAddressData(BaseModel):
    """Represents an IP address associated with a Load Balancer."""
    ip_address: str
    is_public: bool

class LoadBalancerData(BaseModel):
    """Main model to aggregate all data from a Load Balancer."""
    display_name: str
    lifecycle_state: str
    shape_name: str
    ip_addresses: List[LoadBalancerIpAddressData]
    listeners: List[ListenerData]
    backend_sets: List[BackendSetData]
    hostnames: List[HostnameData]


# --- SCHEMAS FOR VOLUME GROUPS ---
class VolumeGroupValidation(BaseModel):
    """Represents the results of a Volume Group validation."""
    has_backup_policy: bool
    policy_name: Optional[str] = "Nenhuma"
    is_cross_region_replication_enabled: bool
    cross_region_target: Optional[str] = "Desabilitada"

class VolumeGroupData(BaseModel):
    """Represents a Volume Group and its details."""
    id: str
    display_name: str
    availability_domain: str
    lifecycle_state: str
    members: List[str]
    member_ids: List[str]
    validation: VolumeGroupValidation


class InfrastructureData(BaseModel):
    """Main model to aggregate all infrastructure data from a compartment."""
    instances: List[InstanceData]
    vcns: List[VcnData]
    drgs: List[DrgData]
    cpes: List[CpeData]
    ipsec_connections: List[IpsecData]
    load_balancers: List[LoadBalancerData]
    volume_groups: List[VolumeGroupData]


# --- SCHEMAS FOR API REQUESTS ---

class NewHostRequest(BaseModel):
    """Model for the request of new host details."""
    instance_ids: List[str]
    compartment_id: str
    compartment_name: str


class GenerateDocRequest(BaseModel):
    """
    Model for the request body of document generation.
    """
    doc_type: str
    infra_data: InfrastructureData
    responsible_name: str = Field(..., min_length=1)
