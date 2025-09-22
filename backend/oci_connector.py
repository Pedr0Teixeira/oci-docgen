# OCI DocGen
# Author: Pedro Teixeira
# Date: September 15, 2025
# Description: Connector module that interacts with the OCI SDK to retrieve infrastructure data.

import os
from typing import Any, Dict, List, Optional, Tuple

import oci
from oci.auth.signers import InstancePrincipalsSecurityTokenSigner

# --- SCHEMA IMPORTS ---
from schemas import (BackendData, BackendSetData, BlockVolume, CpeData,
                     DrgAttachmentData, DrgData, HealthCheckerData, HostnameData,
                     InfrastructureData, InstanceData, IpsecData, ListenerData,
                     LoadBalancerData, LoadBalancerIpAddressData, LpgData,
                     NetworkSecurityGroup, PhaseOneDetails, PhaseTwoDetails,
                     RouteRule, RouteTable, RpcData, SecurityList,
                     SecurityRule, SubnetData, TunnelData, VcnData,
                     VolumeGroupData, VolumeGroupValidation, BgpSessionInfo)

# --- IANA Protocol Mapping ---
IANA_PROTOCOL_MAP = {
    "1": "ICMP",
    "6": "TCP",
    "17": "UDP",
    "58": "ICMPv6",
    "all": "Todos os Protocolos",
}

# --- Dynamic OCI Authentication Setup ---

def get_auth_provider() -> Dict[str, Any]:
    """
    Determines the authentication provider (API Key or Instance Principal) 
    based on the OCI_AUTH_METHOD environment variable.
    """
    auth_method = os.environ.get("OCI_AUTH_METHOD", "API_KEY").upper()

    if auth_method == "INSTANCE_PRINCIPAL":
        try:
            signer = InstancePrincipalsSecurityTokenSigner()
            tenancy_id = signer.tenancy_id
            print("INFO: Autenticação configurada para usar Instance Principal.")
            return {"signer": signer, "tenancy_id": tenancy_id, "config": {}}
        except Exception as e:
            print(f"FATAL: Falha ao inicializar o Instance Principal Signer: {e}")
            print("FATAL: Verifique se o script está rodando em uma instância OCI com um Dynamic Group e policies corretas.")
            return {"signer": None, "tenancy_id": None, "config": None}
    else:  # Default to API_KEY
        try:
            config = oci.config.from_file()
            tenancy_id = config.get("tenancy")
            if not tenancy_id:
                raise ValueError("'tenancy' não encontrado no arquivo de configuração da OCI.")
            print("INFO: Autenticação configurada para usar API Key do arquivo ~/.oci/config.")
            return {"config": config, "tenancy_id": tenancy_id, "signer": None}
        except Exception as e:
            print(f"FATAL: Erro ao carregar a configuração da OCI a partir do arquivo: {e}")
            return {"config": None, "tenancy_id": None, "signer": None}

# Initialize authentication provider
auth_details = get_auth_provider()
config = auth_details["config"]
signer = auth_details["signer"]
tenancy_id = auth_details["tenancy_id"]

# --- Global Identity Client ---
identity_client_for_compartment = None
if tenancy_id:
    try:
        # Initializes the global client used to fetch compartment names
        if signer:
            identity_client_for_compartment = oci.identity.IdentityClient(config={}, signer=signer)
        else:
            identity_client_for_compartment = oci.identity.IdentityClient(config)
    except Exception as e:
        print(f"FATAL: Não foi possível inicializar o cliente de identidade global: {e}")

# --- Helper Functions ---

def get_client(client_class, region: str):
    """Creates an OCI service client instance for a specific region."""
    try:
        if signer:
            return client_class(config={"region": region}, signer=signer)
        else:
            regional_config = config.copy()
            regional_config["region"] = region
            return client_class(regional_config)
    except Exception as e:
        print(f"ERRO: Falha ao criar o cliente {client_class.__name__} para a região {region}: {e}")
        return None

def _safe_api_call(func, *args, **kwargs):
    """Encapsulates an OCI API call to robustly handle common exceptions."""
    try:
        response = func(*args, **kwargs)
        return response.data
    except oci.exceptions.ServiceError as e:
        if e.status != 404:
            print(f"AVISO: Chamada de API para '{func.__name__}' falhou: {e.status} - {e.message}")
        return None
    except Exception as e:
        print(f"ERRO INESPERADO na chamada de API '{func.__name__}': {e}")
        return None


def _translate_protocol(protocol_code: str) -> str:
    """Translates a protocol code to its common name using IANA_PROTOCOL_MAP."""
    return IANA_PROTOCOL_MAP.get(str(protocol_code), str(protocol_code))


def _format_rule_ports(rule: Any) -> str:
    """Extracts and formats the ports from a security rule (TCP/UDP)."""
    options = None
    if hasattr(rule, 'tcp_options') and rule.tcp_options:
        options = rule.tcp_options
    elif hasattr(rule, 'udp_options') and rule.udp_options:
        options = rule.udp_options

    if not options:
        return ""

    port_range = options.destination_port_range
    if not port_range:
        return ""
        
    if port_range.min == port_range.max:
        return str(port_range.min)
    return f"{port_range.min}-{port_range.max}"


def get_network_entity_name(virtual_network_client, entity_id: str) -> str:
    """Fetches the display name of a network entity (like Gateways) from its OCID."""
    if not entity_id:
        return "N/A"
    try:
        entity_type = entity_id.split('.')[1]
        entity_type_map = {
            "internetgateway": ("Internet Gateway", virtual_network_client.get_internet_gateway),
            "natgateway": ("NAT Gateway", virtual_network_client.get_nat_gateway),
            "servicegateway": ("Service Gateway", virtual_network_client.get_service_gateway),
            "localpeeringgateway": ("Local Peering Gateway", virtual_network_client.get_local_peering_gateway),
            "privateip": ("Private IP", virtual_network_client.get_private_ip),
            "drg": ("Dynamic Routing Gateway", virtual_network_client.get_drg),
        }
        if entity_type in entity_type_map:
            type_name, func = entity_type_map[entity_type]
            entity = _safe_api_call(func, entity_id)
            if entity:
                display_attr = getattr(entity, 'ip_address', getattr(entity, 'display_name', None))
                return f"{type_name}: {display_attr}" if display_attr else type_name
            return entity_id
        elif entity_type == "drgattachment":
            attachment = _safe_api_call(virtual_network_client.get_drg_attachment, entity_id)
            if attachment and attachment.drg_id:
                drg = _safe_api_call(virtual_network_client.get_drg, attachment.drg_id)
                return f"DRG Attachment: {drg.display_name if drg else ''}"
    except (IndexError, AttributeError):
        pass
    return entity_id


def _get_drg_route_table_name(virtual_network_client, drg_route_table_id: str) -> str:
    """Fetches the name of a DRG Route Table from its OCID."""
    if not drg_route_table_id:
        return "N/A"
    route_table = _safe_api_call(virtual_network_client.get_drg_route_table, drg_route_table_id)
    return route_table.display_name if route_table else drg_route_table_id


def _get_source_dest_name(virtual_network_client, source_dest: str) -> str:
    """Translates a Network Security Group (NSG) OCID to its display name."""
    if not source_dest or not source_dest.startswith("ocid1.networksecuritygroup"):
        return source_dest
    nsg = _safe_api_call(virtual_network_client.get_network_security_group, source_dest)
    return nsg.display_name if nsg else source_dest

def get_compartment_name(compartment_id: str) -> str:
    """Fetches a compartment name from its OCID."""
    if not identity_client_for_compartment:
        return "N/A"
    if compartment_id == tenancy_id:
        return "Raiz (Tenancy)"
    compartment = _safe_api_call(identity_client_for_compartment.get_compartment, compartment_id)
    return compartment.name if compartment else "N/A"

def _validate_ipsec_parameters(tunnel: oci.core.models.IPSecConnectionTunnel) -> Tuple[str, Optional[str]]:
    """Validates the parameters of an IPSec tunnel against Oracle's recommendations, handling special cases like GCM."""

    p1 = tunnel.phase_one_details
    p2 = tunnel.phase_two_details
    
    if not p1 or not p2:
        return "Indisponível", "Detalhes de IKE/IPSec não encontrados."

    docs_link = "https://docs.oracle.com/pt-br/iaas/Content/Network/Reference/supportedIPsecparams.htm"
    
    if not p1.is_custom_phase_one_config:
        return "Gerenciado pela Oracle (Padrão)", None
        
    recommended_p1 = {
        "encryption": "AES_256_CBC",
        "authentication": "SHA2_384",
        "dh_group": "GROUP20"
    }
    is_p1_ok = (
        p1.custom_encryption_algorithm == recommended_p1["encryption"] and
        p1.custom_authentication_algorithm == recommended_p1["authentication"] and
        p1.custom_dh_group == recommended_p1["dh_group"]
    )
    
    is_p2_ok = False
    p2_encryption = p2.custom_encryption_algorithm
    p2_authentication = p2.custom_authentication_algorithm

    if p2_encryption and "GCM" in p2_encryption:
        if p2_encryption == "AES_256_GCM" and p2_authentication is None:
            is_p2_ok = True
    elif p2_encryption and "CBC" in p2_encryption:
        if p2_encryption == "AES_256_CBC" and p2_authentication == "HMAC_SHA2_256_128":
            is_p2_ok = True
    
    if is_p1_ok and is_p2_ok:
        return "Conforme a recomendação Oracle", None
    else:
        return "Fora da recomendação Oracle", docs_link


# --- Public Data Collection Functions ---

def list_regions() -> List[Dict[str, str]]:
    if not tenancy_id:
        raise ConnectionError("Tenancy ID não encontrado na configuração da OCI.")
    if signer:
        identity_client = oci.identity.IdentityClient(config={}, signer=signer)
    else:
        identity_client = oci.identity.IdentityClient(config)
    regions = _safe_api_call(identity_client.list_region_subscriptions, tenancy_id)
    return [{"key": r.region_key, "name": r.region_name} for r in regions if r.status == "READY"] if regions else []


def list_compartments(region: str) -> List[Dict[str, Any]]:
    identity_client = get_client(oci.identity.IdentityClient, region)
    if not identity_client:
        raise ConnectionError("Cliente de Identidade OCI não pôde ser inicializado.")
    all_compartments = oci.pagination.list_call_get_all_results(identity_client.list_compartments, tenancy_id, compartment_id_in_subtree=True, lifecycle_state="ACTIVE").data
    compartments_dict = {c.id: c for c in all_compartments}
    children_map = {c.id: [] for c in all_compartments}
    children_map[tenancy_id] = []
    for comp in all_compartments:
        if comp.compartment_id in children_map:
            children_map[comp.compartment_id].append(comp.id)
    def build_tree(parent_id, level=0):
        tree = []
        sorted_children = sorted(children_map.get(parent_id, []), key=lambda cid: compartments_dict.get(cid).name)
        for child_id in sorted_children:
            child_comp = compartments_dict.get(child_id)
            if child_comp:
                tree.append({"id": child_comp.id, "name": child_comp.name, "level": level})
                tree.extend(build_tree(child_id, level + 1))
        return tree
    hierarchical_list = [{"id": tenancy_id, "name": "Raiz (Tenancy)", "level": 0}]
    hierarchical_list.extend(build_tree(tenancy_id, level=1))
    return hierarchical_list


def list_instances_in_compartment(region: str, compartment_id: str) -> List[Dict[str, str]]:
    """Fetches instances with 'RUNNING' or 'STOPPED' state."""
    compute_client = get_client(oci.core.ComputeClient, region)
    if not compute_client:
        raise ConnectionError("Cliente de Computação OCI não pôde ser inicializado.")
    
    valid_states = ["RUNNING", "STOPPED"]
    
    all_instances = oci.pagination.list_call_get_all_results(
        compute_client.list_instances,
        compartment_id=compartment_id
    ).data
    
    filtered_instances = [
        {
            "id": i.id,
            "display_name": i.display_name,
            "status": i.lifecycle_state
        }
        for i in all_instances if i.lifecycle_state in valid_states
    ]
    return filtered_instances

def get_instance_details(region: str, instance_id: str, compartment_name: str = "N/A") -> InstanceData:
    """Fetches a comprehensive set of details for a single instance."""
    compute_client = get_client(oci.core.ComputeClient, region)
    virtual_network_client = get_client(oci.core.VirtualNetworkClient, region)
    block_storage_client = get_client(oci.core.BlockstorageClient, region)

    instance = _safe_api_call(compute_client.get_instance, instance_id)
    if not instance:
        raise Exception(f"Falha ao obter detalhes: A instância com OCID {instance_id} não foi encontrada ou pode ter sido terminada recentemente.")

    image = _safe_api_call(compute_client.get_image, instance.image_id)
    os_name = f"{image.operating_system} {image.operating_system_version}" if image else "N/A"

    private_ip, public_ip = "N/A", "N/A"
    security_lists, network_security_groups, route_table = [], [], None
    vnic_attachments = _safe_api_call(compute_client.list_vnic_attachments, instance.compartment_id, instance_id=instance_id)
    if vnic_attachments:
        vnic = _safe_api_call(virtual_network_client.get_vnic, vnic_attachments[0].vnic_id)
        if vnic:
            private_ip, public_ip = vnic.private_ip or "N/A", vnic.public_ip or "N/A"
            subnet = _safe_api_call(virtual_network_client.get_subnet, vnic.subnet_id)
            if subnet:
                for sl_id in subnet.security_list_ids:
                    sl = _safe_api_call(virtual_network_client.get_security_list, sl_id)
                    if sl:
                        rules = [SecurityRule(direction="INGRESS", protocol=_translate_protocol(r.protocol), source_or_destination=r.source, ports=_format_rule_ports(r), description=r.description) for r in sl.ingress_security_rules]
                        rules.extend([SecurityRule(direction="EGRESS", protocol=_translate_protocol(r.protocol), source_or_destination=r.destination, ports=_format_rule_ports(r), description=r.description) for r in sl.egress_security_rules])
                        security_lists.append(SecurityList(id=sl.id, name=sl.display_name, rules=rules))
                
                rt = _safe_api_call(virtual_network_client.get_route_table, subnet.route_table_id)
                if rt:
                    rt_rules = [RouteRule(destination=r.destination, target=get_network_entity_name(virtual_network_client, r.network_entity_id), description=r.description) for r in rt.route_rules]
                    route_table = RouteTable(id=rt.id, name=rt.display_name, rules=rt_rules)

            for nsg_id in vnic.nsg_ids:
                nsg = _safe_api_call(virtual_network_client.get_network_security_group, nsg_id)
                if nsg:
                    ingress_rules_sdk = _safe_api_call(virtual_network_client.list_network_security_group_security_rules, nsg_id, direction="INGRESS")
                    egress_rules_sdk = _safe_api_call(virtual_network_client.list_network_security_group_security_rules, nsg_id, direction="EGRESS")
                    
                    all_rules_sdk = []
                    if ingress_rules_sdk:
                        all_rules_sdk.extend(ingress_rules_sdk)
                    if egress_rules_sdk:
                        all_rules_sdk.extend(egress_rules_sdk)

                    nsg_rules = []
                    if all_rules_sdk:
                        for r in all_rules_sdk:
                            source_dest = r.source if r.direction == 'INGRESS' else r.destination
                            nsg_rules.append(SecurityRule(direction=r.direction, protocol=_translate_protocol(r.protocol), source_or_destination=_get_source_dest_name(virtual_network_client, source_dest), ports=_format_rule_ports(r), description=r.description))
                    network_security_groups.append(NetworkSecurityGroup(id=nsg.id, name=nsg.display_name, rules=nsg_rules))

    boot_volume_gb, backup_policy_name, boot_volume_id = "N/A", "Nenhuma política associada", None
    boot_vol_attachments = _safe_api_call(compute_client.list_boot_volume_attachments, instance.availability_domain, instance.compartment_id, instance_id=instance_id)
    if boot_vol_attachments:
        boot_volume_id = boot_vol_attachments[0].boot_volume_id
        boot_vol = _safe_api_call(block_storage_client.get_boot_volume, boot_volume_id)
        if boot_vol:
            boot_volume_gb = str(int(boot_vol.size_in_gbs))
            assignment = _safe_api_call(block_storage_client.get_volume_backup_policy_asset_assignment, boot_vol.id)
            if assignment:
                policy = _safe_api_call(block_storage_client.get_volume_backup_policy, assignment[0].policy_id)
                if policy: backup_policy_name = policy.display_name

    block_volumes = []
    attachments = _safe_api_call(compute_client.list_volume_attachments, instance.compartment_id, instance_id=instance_id)
    if attachments:
        for att in attachments:
            if att.lifecycle_state == 'ATTACHED' and att.attachment_type != 'iscsi':
                vol = _safe_api_call(block_storage_client.get_volume, att.volume_id)
                if vol:
                    vol_backup_policy_name = "Nenhuma política associada"
                    vol_assignment = _safe_api_call(block_storage_client.get_volume_backup_policy_asset_assignment, vol.id)
                    if vol_assignment:
                        vol_policy = _safe_api_call(block_storage_client.get_volume_backup_policy, vol_assignment[0].policy_id)
                        if vol_policy: vol_backup_policy_name = vol_policy.display_name
                    block_volumes.append(BlockVolume(id=vol.id, display_name=vol.display_name, size_in_gbs=vol.size_in_gbs, backup_policy_name=vol_backup_policy_name))

    return InstanceData(
        host_name=instance.display_name, shape=instance.shape, ocpus=str(int(instance.shape_config.ocpus)),
        memory=str(int(instance.shape_config.memory_in_gbs)), os_name=os_name, boot_volume_gb=boot_volume_gb,
        boot_volume_id=boot_volume_id,
        private_ip=private_ip, public_ip=public_ip, backup_policy_name=backup_policy_name,
        block_volumes=block_volumes, security_lists=security_lists, network_security_groups=network_security_groups,
        route_table=route_table, compartment_name=compartment_name, lifecycle_state=instance.lifecycle_state
    )

def _get_volume_groups(block_storage_client: oci.core.BlockstorageClient, compartment_id: str, all_volumes_map: Dict[str, str]) -> List[VolumeGroupData]:
    """Collects and validates all Volume Groups in a compartment."""
    volume_groups_data = []
    
    all_vgs_sdk = oci.pagination.list_call_get_all_results(
        block_storage_client.list_volume_groups,
        compartment_id=compartment_id
    ).data

    for vg_summary in all_vgs_sdk:
        vg = _safe_api_call(block_storage_client.get_volume_group, vg_summary.id)
        if not vg:
            continue

        policy_name = "Nenhuma"
        has_backup_policy = False
        assignment = _safe_api_call(block_storage_client.get_volume_backup_policy_asset_assignment, vg.id)
        if assignment:
            policy = _safe_api_call(block_storage_client.get_volume_backup_policy, assignment[0].policy_id)
            if policy:
                policy_name = policy.display_name
                has_backup_policy = True

        cross_region_target = "Desabilitada"
        is_cross_region_replication_enabled = False
        replicas = getattr(vg, 'volume_group_replicas', [])
        if replicas and len(replicas) > 0:
            is_cross_region_replication_enabled = True
            replica_region_key = replicas[0].availability_domain.rsplit('-', 1)[0]
            cross_region_target = replica_region_key.replace("AD", "").strip()

        member_names = [all_volumes_map.get(vol_id, vol_id) for vol_id in vg.volume_ids]

        validation_data = VolumeGroupValidation(
            has_backup_policy=has_backup_policy,
            policy_name=policy_name,
            is_cross_region_replication_enabled=is_cross_region_replication_enabled,
            cross_region_target=cross_region_target
        )

        volume_groups_data.append(VolumeGroupData(
            id=vg.id,
            display_name=vg.display_name,
            availability_domain=vg.availability_domain,
            lifecycle_state=vg.lifecycle_state,
            members=sorted(member_names),
            member_ids=vg.volume_ids,
            validation=validation_data
        ))
        
    return volume_groups_data


# --- MAIN INFRASTRUCTURE DATA COLLECTION FUNCTION ---

def get_infrastructure_details(region: str, compartment_id: str) -> InfrastructureData:
    """Orchestrates the collection of infrastructure data from a compartment."""
    compute_client = get_client(oci.core.ComputeClient, region)
    virtual_network_client = get_client(oci.core.VirtualNetworkClient, region)
    load_balancer_client = get_client(oci.load_balancer.LoadBalancerClient, region)
    block_storage_client = get_client(oci.core.BlockstorageClient, region)
    
    compartment_name = get_compartment_name(compartment_id)
    oracle_managed_str = "Gerenciado pela Oracle (Padrão)"

    # 1. Collect full details for all instances
    all_instances_sdk = oci.pagination.list_call_get_all_results(compute_client.list_instances, compartment_id=compartment_id).data
    instances = [get_instance_details(region, i.id, compartment_name) for i in all_instances_sdk]

    # 1.5 Map volumes and collect volume groups
    all_volumes_map = {}
    for instance in instances:
        if instance.boot_volume_id:
            all_volumes_map[instance.boot_volume_id] = f"Boot Volume ({instance.host_name})"
        for bv in instance.block_volumes:
            all_volumes_map[bv.id] = f"Block Volume ({bv.display_name})"
    
    volume_groups = _get_volume_groups(block_storage_client, compartment_id, all_volumes_map)

    # 2. Collect DRGs, their Attachments, and RPCs
    all_drgs_sdk = oci.pagination.list_call_get_all_results(virtual_network_client.list_drgs, compartment_id=compartment_id).data
    drgs = []
    for drg_sdk in all_drgs_sdk:
        attachments_sdk = oci.pagination.list_call_get_all_results(
            virtual_network_client.list_drg_attachments, 
            drg_id=drg_sdk.id,
            compartment_id=compartment_id
        ).data
        attachments = []
        for a in attachments_sdk:
            network_id = a.network_details.id if a.network_details else None
            route_table_name = _get_drg_route_table_name(virtual_network_client, a.drg_route_table_id)
            attachments.append(DrgAttachmentData(
                id=a.id, 
                display_name=a.display_name, 
                network_id=network_id, 
                network_type=a.network_details.type if a.network_details else 'N/A',
                route_table_id=a.drg_route_table_id,
                route_table_name=route_table_name
            ))
        
        rpcs_sdk = oci.pagination.list_call_get_all_results(
            virtual_network_client.list_remote_peering_connections,
            compartment_id=compartment_id,
            drg_id=drg_sdk.id
        ).data
        rpcs = [RpcData(
            id=r.id, 
            display_name=r.display_name, 
            lifecycle_state=r.lifecycle_state, 
            peering_status=r.peering_status
        ) for r in rpcs_sdk]

        drgs.append(DrgData(id=drg_sdk.id, display_name=drg_sdk.display_name, attachments=attachments, rpcs=rpcs))

    # 3. Collect CPEs
    all_cpes_sdk = oci.pagination.list_call_get_all_results(virtual_network_client.list_cpes, compartment_id=compartment_id).data
    cpes = []
    for cpe in all_cpes_sdk:
        vendor = "N/A"
        if cpe.cpe_device_shape_id:
            shape = _safe_api_call(virtual_network_client.get_cpe_device_shape, cpe.cpe_device_shape_id)
            if shape and hasattr(shape, 'cpe_device_info') and shape.cpe_device_info:
                vendor = shape.cpe_device_info.vendor or "N/A"
        cpes.append(CpeData(id=cpe.id, display_name=cpe.display_name, ip_address=cpe.ip_address, vendor=vendor))

    # 4. Collect IPSec Connections
    all_ipsec_sdk = oci.pagination.list_call_get_all_results(virtual_network_client.list_ip_sec_connections, compartment_id=compartment_id).data
    ipsec_connections = []
    for ipsec in all_ipsec_sdk:
        tunnels_sdk = _safe_api_call(virtual_network_client.list_ip_sec_connection_tunnels, ipsec.id)
        tunnels = []
        if tunnels_sdk:
            for tunnel in tunnels_sdk:
                validation_status, validation_details = _validate_ipsec_parameters(tunnel)
                
                bgp_info = None
                if tunnel.routing == "BGP" and tunnel.bgp_session_info:
                    bgp_sdk = tunnel.bgp_session_info
                    bgp_info = BgpSessionInfo(
                        oracle_bgp_asn=str(bgp_sdk.oracle_bgp_asn) if bgp_sdk.oracle_bgp_asn else "N/A",
                        customer_bgp_asn=str(bgp_sdk.customer_bgp_asn) if bgp_sdk.customer_bgp_asn else "N/A",
                        oracle_interface_ip=bgp_sdk.oracle_interface_ip or "N/A",
                        customer_interface_ip=bgp_sdk.customer_interface_ip or "N/A"
                    )

                p1_details = tunnel.phase_one_details
                is_p1_custom = bool(p1_details.is_custom_phase_one_config) if p1_details else False
                phase_one = PhaseOneDetails(
                    is_custom=is_p1_custom,
                    authentication_algorithm=p1_details.custom_authentication_algorithm if is_p1_custom and p1_details else oracle_managed_str,
                    encryption_algorithm=p1_details.custom_encryption_algorithm if is_p1_custom and p1_details else oracle_managed_str,
                    dh_group=p1_details.custom_dh_group if is_p1_custom and p1_details else oracle_managed_str,
                    lifetime_in_seconds=p1_details.lifetime if p1_details else 0
                )
                
                p2_details = tunnel.phase_two_details
                is_p2_custom = bool(p2_details.is_custom_phase_two_config) if p2_details else False
                phase_two = PhaseTwoDetails(
                    is_custom=is_p2_custom,
                    authentication_algorithm=(p2_details.custom_authentication_algorithm if is_p2_custom and p2_details else oracle_managed_str) or "N/A",
                    encryption_algorithm=(p2_details.custom_encryption_algorithm if is_p2_custom and p2_details else oracle_managed_str) or "N/A",
                    lifetime_in_seconds=p2_details.lifetime if p2_details else 0
                )

                tunnels.append(TunnelData(
                    id=tunnel.id, display_name=tunnel.display_name, status=tunnel.status or "N/A",
                    cpe_ip=tunnel.cpe_ip, vpn_oracle_ip=tunnel.vpn_ip, routing_type=tunnel.routing, 
                    ike_version=tunnel.ike_version, validation_status=validation_status, validation_details=validation_details,
                    phase_one_details=phase_one, phase_two_details=phase_two,
                    bgp_session_info=bgp_info
                ))
        
        connection_routing_type = "STATIC"
        if tunnels_sdk:
            connection_routing_type = tunnels_sdk[0].routing
        
        ipsec_connections.append(IpsecData(
            id=ipsec.id, display_name=ipsec.display_name, status=ipsec.lifecycle_state,
            cpe_id=ipsec.cpe_id, drg_id=ipsec.drg_id, tunnels=tunnels, 
            static_routes=ipsec.static_routes if connection_routing_type == "STATIC" else []
        ))

    # 5. Collect VCNs and their child resources
    all_vcns_sdk = oci.pagination.list_call_get_all_results(virtual_network_client.list_vcns, compartment_id=compartment_id, lifecycle_state="AVAILABLE").data
    vcns = []
    for vcn_sdk in all_vcns_sdk:
        subnets_sdk = oci.pagination.list_call_get_all_results(virtual_network_client.list_subnets, compartment_id=compartment_id, vcn_id=vcn_sdk.id, lifecycle_state="AVAILABLE").data
        subnets = [SubnetData(id=s.id, display_name=s.display_name, cidr_block=s.cidr_block) for s in subnets_sdk]

        sls_sdk = oci.pagination.list_call_get_all_results(virtual_network_client.list_security_lists, compartment_id=compartment_id, vcn_id=vcn_sdk.id, lifecycle_state="AVAILABLE").data
        security_lists = []
        for sl_sdk in sls_sdk:
            rules = [SecurityRule(direction="INGRESS", protocol=_translate_protocol(r.protocol), source_or_destination=r.source, ports=_format_rule_ports(r), description=r.description) for r in sl_sdk.ingress_security_rules]
            rules.extend([SecurityRule(direction="EGRESS", protocol=_translate_protocol(r.protocol), source_or_destination=r.destination, ports=_format_rule_ports(r), description=r.description) for r in sl_sdk.egress_security_rules])
            security_lists.append(SecurityList(id=sl_sdk.id, name=sl_sdk.display_name, rules=rules))

        rts_sdk = oci.pagination.list_call_get_all_results(virtual_network_client.list_route_tables, compartment_id=compartment_id, vcn_id=vcn_sdk.id, lifecycle_state="AVAILABLE").data
        route_tables = [RouteTable(id=rt.id, name=rt.display_name, rules=[RouteRule(destination=r.destination, target=get_network_entity_name(virtual_network_client, r.network_entity_id), description=r.description) for r in rt.route_rules]) for rt in rts_sdk]
        route_table_map = {rt.id: rt.name for rt in route_tables}
        
        # --- Fetch NSGs specific to this VCN ---
        vcn_specific_nsgs = []
        nsgs_sdk_for_vcn = oci.pagination.list_call_get_all_results(
            virtual_network_client.list_network_security_groups,
            compartment_id=compartment_id,
            vcn_id=vcn_sdk.id
        ).data

        for nsg_sdk in nsgs_sdk_for_vcn:
            ingress_rules_sdk = _safe_api_call(virtual_network_client.list_network_security_group_security_rules, nsg_sdk.id, direction="INGRESS")
            egress_rules_sdk = _safe_api_call(virtual_network_client.list_network_security_group_security_rules, nsg_sdk.id, direction="EGRESS")

            all_rules_sdk = []
            if ingress_rules_sdk: all_rules_sdk.extend(ingress_rules_sdk)
            if egress_rules_sdk: all_rules_sdk.extend(egress_rules_sdk)
            
            rules = []
            if all_rules_sdk:
                for r in all_rules_sdk:
                    source_dest = r.source if r.direction == 'INGRESS' else r.destination
                    rules.append(SecurityRule(direction=r.direction, protocol=_translate_protocol(r.protocol), source_or_destination=_get_source_dest_name(virtual_network_client, source_dest), ports=_format_rule_ports(r), description=r.description))
            vcn_specific_nsgs.append(NetworkSecurityGroup(id=nsg_sdk.id, name=nsg_sdk.display_name, rules=rules))
        
        lpgs_sdk = oci.pagination.list_call_get_all_results(
            virtual_network_client.list_local_peering_gateways,
            compartment_id=compartment_id,
            vcn_id=vcn_sdk.id
        ).data
        lpgs = [LpgData(
            id=l.id,
            display_name=l.display_name,
            lifecycle_state=l.lifecycle_state,
            peering_status=l.peering_status,
            peering_status_details=l.peering_status_details,
            peer_id=l.peer_id,
            route_table_id=l.route_table_id,
            peer_advertised_cidr=l.peer_advertised_cidr,
            is_cross_tenancy_peering=l.is_cross_tenancy_peering,
            route_table_name=route_table_map.get(l.route_table_id, "N/A")
        ) for l in lpgs_sdk]

        vcns.append(VcnData(
            id=vcn_sdk.id, display_name=vcn_sdk.display_name, cidr_block=vcn_sdk.cidr_block, 
            subnets=subnets, security_lists=security_lists, route_tables=route_tables,
            network_security_groups=vcn_specific_nsgs, # Using the specific VCN list
            lpgs=lpgs
        ))

    # 6. Collect Load Balancers and their components
    all_lbs_summary_sdk = oci.pagination.list_call_get_all_results(load_balancer_client.list_load_balancers, compartment_id=compartment_id).data
    load_balancers = []
    for lb_summary in all_lbs_summary_sdk:
        lb_details = _safe_api_call(load_balancer_client.get_load_balancer, lb_summary.id)
        if not lb_details:
            continue

        ip_addresses = [LoadBalancerIpAddressData(ip_address=ip.ip_address, is_public=ip.is_public) for ip in lb_details.ip_addresses]
        hostnames = [HostnameData(name=h.name) for h in lb_details.hostnames.values()]

        listeners = []
        for listener_sdk in lb_details.listeners.values():
            listeners.append(ListenerData(
                name=listener_sdk.name,
                protocol=listener_sdk.protocol,
                port=listener_sdk.port,
                default_backend_set_name=listener_sdk.default_backend_set_name,
                hostname_names=list(listener_sdk.hostname_names.keys()) if listener_sdk.hostname_names else []
            ))
        
        backend_sets = []
        for bs_sdk in lb_details.backend_sets.values():
            hc_sdk = bs_sdk.health_checker
            health_checker = HealthCheckerData(
                protocol=hc_sdk.protocol,
                port=hc_sdk.port,
                url_path=hc_sdk.url_path
            )
            
            backends = []
            for backend_sdk in bs_sdk.backends:
                backends.append(BackendData(
                    name=backend_sdk.name,
                    ip_address=backend_sdk.ip_address,
                    port=backend_sdk.port,
                    weight=backend_sdk.weight
                ))
            
            backend_sets.append(BackendSetData(
                name=bs_sdk.name,
                policy=bs_sdk.policy,
                health_checker=health_checker,
                backends=backends
            ))
        
        load_balancers.append(LoadBalancerData(
            display_name=lb_details.display_name,
            lifecycle_state=lb_details.lifecycle_state,
            shape_name=lb_details.shape_name,
            ip_addresses=ip_addresses,
            listeners=listeners,
            backend_sets=backend_sets,
            hostnames=hostnames
        ))
            
    return InfrastructureData(
        instances=instances,
        vcns=vcns,
        drgs=drgs,
        cpes=cpes,
        ipsec_connections=ipsec_connections,
        load_balancers=load_balancers,
        volume_groups=volume_groups
    )

# --- FUNCTION FOR "NEW HOST" FLOW ---
def get_new_host_details(region: str, compartment_id: str, compartment_name: str, instance_ids: List[str]) -> InfrastructureData:
    """Orchestrates the collection of data for a specific set of instances (New Host)."""
    block_storage_client = get_client(oci.core.BlockstorageClient, region)

    # 1. Collect details for the selected instances
    instances = [get_instance_details(region, i_id, compartment_name) for i_id in instance_ids]

    # 2. Build the volume map only for the selected instances
    all_volumes_map = {}
    selected_volume_ids = set()
    for instance in instances:
        if instance.boot_volume_id:
            all_volumes_map[instance.boot_volume_id] = f"Boot Volume ({instance.host_name})"
            selected_volume_ids.add(instance.boot_volume_id)
        for bv in instance.block_volumes:
            all_volumes_map[bv.id] = f"Block Volume ({bv.display_name})"
            selected_volume_ids.add(bv.id)

    # 3. Get all Volume Groups and filter the relevant ones
    all_vgs = _get_volume_groups(block_storage_client, compartment_id, all_volumes_map)
    
    relevant_vgs = [
        vg for vg in all_vgs
        if any(vol_id in selected_volume_ids for vol_id in vg.member_ids)
    ]

    # 4. Return a partial InfrastructureData object
    return InfrastructureData(
        instances=instances,
        vcns=[],
        drgs=[],
        cpes=[],
        ipsec_connections=[],
        load_balancers=[],
        volume_groups=relevant_vgs
    )