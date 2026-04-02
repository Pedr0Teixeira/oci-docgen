# ==============================================================================
# OCI (Oracle Cloud Infrastructure) data collection module.
#     Responsible for authentication, client initialization, and collecting
#     all infrastructure data needed for documentation generation.
# ==============================================================================

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple

import oci
from oci.auth.signers import InstancePrincipalsSecurityTokenSigner
from oci.container_engine import ContainerEngineClient
from oci.waf import WafClient

from schemas import (
    BackendData,
    BackendSetData,
    BgpSessionInfo,
    BlockVolume,
    StandaloneVolumeData,
    CpeData,
    DrgAttachmentData,
    DrgData,
    HealthCheckerData,
    InfrastructureData,
    InstanceData,
    IpsecData,
    ListenerData,
    LoadBalancerData,
    LoadBalancerIpAddressData,
    HostnameData,
    LpgData,
    NetworkSecurityGroup,
    NodePoolData,
    OkeClusterData,
    PhaseOneDetails,
    PhaseTwoDetails,
    RouteRule,
    RouteTable,
    RpcData,
    SecurityList,
    SecurityRule,
    SubnetData,
    TunnelData,
    VcnData,
    VolumeGroupData,
    VolumeGroupValidation,
    WafAction,
    WafAccessControlRule,
    WafProtectionCapability,
    WafProtectionRule,
    WafRateLimitingRule,
    WafIntegrationData,
    WafNetworkInfrastructure,
    WafPolicyData,
    WafFirewallData,
    LoadBalancerCertificateData,
)

# ==============================================================================
# Constants and Resilience Configuration
# ==============================================================================

# IANA protocol code to human-readable name mapping.
IANA_PROTOCOL_MAP: Dict[str, str] = {
    "1":   "ICMP",
    "6":   "TCP",
    "17":  "UDP",
    "58":  "ICMPv6",
    "all": "Todos os Protocolos",
}

MAX_WORKERS_FOR_DETAILS = 15

# Retry strategy with exponential jitter to tolerate transient OCI API
#     failures (throttling, 5xx errors).
retry_strategy = oci.retry.RetryStrategyBuilder(
    max_attempts=8,
    max_wait_seconds=60,
    retry_on_service_error_codes=["429", "500", "502", "503", "504"],
    backoff_type=oci.retry.BACKOFF_EQUAL_JITTER_VALUE,
).get_retry_strategy()

# ==============================================================================
# IAM Error Detection
# ==============================================================================

# Maps each OCI resource family to the policy statement needed to collect it.
# Used by _iam_error_msg() to produce actionable error messages.
_IAM_POLICY_MAP = {
    "waf":          "allow dynamic-group '<seu-grupo>' to read waf-family in tenancy",
    "certificate":  "allow dynamic-group '<seu-grupo>' to read leaf-certificate-family in tenancy",
    "instance":     "allow dynamic-group '<seu-grupo>' to read instance-family in tenancy",
    "volume":       "allow dynamic-group '<seu-grupo>' to read volume-family in tenancy",
    "network":      "allow dynamic-group '<seu-grupo>' to read virtual-network-family in tenancy",
    "loadbalancer": "allow dynamic-group '<seu-grupo>' to read load-balancers in tenancy",
    "cluster":      "allow dynamic-group '<seu-grupo>' to read cluster-family in tenancy",
    "compartment":  "allow dynamic-group '<seu-grupo>' to read compartments in tenancy",
    # drg, cpe e ipsec usam VirtualNetworkClient e falham quando virtual-network-family está ausente
    "drg":          "allow dynamic-group '<seu-grupo>' to read virtual-network-family in tenancy",
    "cpe":          "allow dynamic-group '<seu-grupo>' to read virtual-network-family in tenancy",
    "ipsec":        "allow dynamic-group '<seu-grupo>' to read virtual-network-family in tenancy",
}

# Kept for backward compatibility with existing call sites.
_WAF_IAM_ERROR_MSG = (
    "Permissão IAM ausente para WAF. Adicione a seguinte policy à sua Dynamic Group:\n"
    + _IAM_POLICY_MAP["waf"]
)


_IAM_RESOURCE_LABEL = {
    "waf":          "WAF",
    "certificate":  "Certificados (leaf-certificate-family)",
    "instance":     "Instâncias (instance-family)",
    "volume":       "Volumes (volume-family)",
    "network":      "Rede Virtual (virtual-network-family)",
    "drg":          "Rede Virtual / DRG (virtual-network-family)",
    "cpe":          "Rede Virtual / CPE (virtual-network-family)",
    "ipsec":        "Rede Virtual / IPSec (virtual-network-family)",
    "loadbalancer": "Load Balancers",
    "cluster":      "OKE Clusters (cluster-family)",
    "compartment":  "Compartimentos",
}


def _iam_error_msg(resource_key: str) -> str:
    """Returns a human-readable IAM error message for the given resource family key."""
    policy = _IAM_POLICY_MAP.get(resource_key, "allow dynamic-group '<seu-grupo>' to read <resource-family> in tenancy")
    label  = _IAM_RESOURCE_LABEL.get(resource_key, resource_key.upper())
    return (
        f"Permissão IAM ausente para {label}. "
        f"Adicione a seguinte policy à sua Dynamic Group:\n{policy}"
    )


def _check_iam(e: oci.exceptions.ServiceError, resource_key: str) -> None:
    """
    Raises PermissionError with an actionable IAM message when e is a
    NotAuthorizedOrNotFound 404. Re-raises e unchanged for all other errors.
    """
    if e.status == 404 and e.code == "NotAuthorizedOrNotFound":
        raise PermissionError(_iam_error_msg(resource_key)) from e
    raise e

# ==============================================================================
# OCI Authentication and Client Initialization
# ==============================================================================

def get_auth_provider() -> Dict[str, Any]:
    """
    Determines the auth method from the OCI_AUTH_METHOD environment variable.
    Supports INSTANCE_PRINCIPAL (for workloads running inside OCI)
    and API_KEY (default, uses ~/.oci/config).
    """
    auth_method = os.environ.get("OCI_AUTH_METHOD", "API_KEY").upper()
    if auth_method == "INSTANCE_PRINCIPAL":
        try:
            signer = InstancePrincipalsSecurityTokenSigner()
            tenancy_id = signer.tenancy_id
            logging.info("Authentication configured to use Instance Principal.")
            return {"signer": signer, "tenancy_id": tenancy_id, "config": {}}
        except Exception as e:
            logging.fatal(f"Failed to initialize Instance Principal Signer: {e}")
            return {"signer": None, "tenancy_id": None, "config": None}
    else:
        try:
            config = oci.config.from_file()
            tenancy_id = config.get("tenancy")
            if not tenancy_id:
                raise ValueError("'tenancy' not found in OCI configuration file.")
            logging.info("Authentication configured to use API Key from ~/.oci/config file.")
            return {"config": config, "tenancy_id": tenancy_id, "signer": None}
        except Exception as e:
            logging.fatal(f"Error loading OCI configuration from file: {e}")
            return {"config": None, "tenancy_id": None, "signer": None}

# Default auth loaded at startup (used for list_regions / list_compartments when
# no profile is selected, and for Instance Principal tenancies).
_default_auth = get_auth_provider()

# Global identity client used for compartment helpers (default auth only).
identity_client_for_compartment = None
_default_tenancy_id = _default_auth["tenancy_id"]
if _default_tenancy_id:
    try:
        if _default_auth["signer"]:
            identity_client_for_compartment = oci.identity.IdentityClient(
                config={}, signer=_default_auth["signer"], retry_strategy=retry_strategy
            )
        else:
            identity_client_for_compartment = oci.identity.IdentityClient(
                _default_auth["config"], retry_strategy=retry_strategy
            )
    except Exception as e:
        logging.fatal(f"Could not initialize the global identity client: {e}")


def _auth_from_profile(profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Builds an auth dict from a tenancy profile row (with decrypted private_key_pem).
    Falls back to the default auth if profile is None.
    """
    if not profile:
        return _default_auth
    if profile.get("auth_method", "").upper() == "INSTANCE_PRINCIPAL":
        return get_auth_provider()  # always re-fetches instance principal signer
    try:
        import tempfile, os as _os
        key_pem = profile.get("private_key_pem") or ""
        # Write private key to a temp file (OCI SDK requires a file path)
        tf = tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False)
        tf.write(key_pem)
        tf.flush()
        tf.close()
        config = {
            "user":        profile.get("user_ocid", ""),
            "fingerprint": profile.get("fingerprint", ""),
            "tenancy":     profile.get("tenancy_ocid", ""),
            "region":      profile.get("region", ""),
            "key_file":    tf.name,
        }
        oci.config.validate_config(config)
        return {"config": config, "signer": None, "tenancy_id": config["tenancy"], "_tmp_key": tf.name}
    except Exception as e:
        logging.error(f"Failed to build auth from profile '{profile.get('name')}': {e}")
        return {"config": None, "signer": None, "tenancy_id": None}


def get_client(client_class, region: str, profile: Optional[Dict[str, Any]] = None):
    """
    OCI client factory. Accepts an optional profile dict (with decrypted key).
    Falls back to default auth when profile is None.
    """
    auth = _auth_from_profile(profile)
    client_kwargs = {"retry_strategy": retry_strategy}
    try:
        if auth.get("signer"):
            return client_class(config={"region": region}, signer=auth["signer"], **client_kwargs)
        cfg = auth["config"].copy()
        cfg["region"] = region
        return client_class(cfg, **client_kwargs)
    except Exception as e:
        logging.error(f"Failed to create client {client_class.__name__} for region {region}: {e}")
        return None

# ==============================================================================
# General-Purpose Helper Functions
# ==============================================================================

def _safe_api_call(func, *args, **kwargs):
    """Wrapper for OCI API calls. Suppresses 404 errors and logs all others."""
    try:
        return func(*args, **kwargs).data
    except oci.exceptions.ServiceError as e:
        if e.status != 404:
            logging.warning(f"API call to '{func.__name__}' failed: {e.status} - {e.message}")
        return None
    except Exception as e:
        logging.error(f"Unexpected error in API call '{func.__name__}': {e}")
        return None

def _translate_protocol(protocol_code: str) -> str:
    """Converts an IANA numeric protocol code to a human-readable name."""
    return IANA_PROTOCOL_MAP.get(str(protocol_code), str(protocol_code))

def _format_rule_ports(rule: Any) -> str:
    """Extracts the port range from an OCI security rule as a string (e.g. "80-443"). Returns "" if unspecified."""
    options = None
    if hasattr(rule, "tcp_options") and rule.tcp_options:
        options = rule.tcp_options
    elif hasattr(rule, "udp_options") and rule.udp_options:
        options = rule.udp_options
    if not options or not options.destination_port_range:
        return ""
    port_range = options.destination_port_range
    if port_range.min == port_range.max:
        return str(port_range.min)
    return f"{port_range.min}-{port_range.max}"

def get_network_entity_name(virtual_network_client, entity_id: str) -> str:
    """Resolves the display name of a network resource (IGW, NAT, SGW, LPG, DRG, Private IP) from its OCID."""
    if not entity_id:
        return "N/A"
    try:
        entity_type = entity_id.split(".")[1]
        entity_type_map = {
            "internetgateway":    ("Internet Gateway",      virtual_network_client.get_internet_gateway),
            "natgateway":         ("NAT Gateway",           virtual_network_client.get_nat_gateway),
            "servicegateway":     ("Service Gateway",       virtual_network_client.get_service_gateway),
            "localpeeringgateway":("Local Peering Gateway", virtual_network_client.get_local_peering_gateway),
            "privateip":          ("Private IP",            virtual_network_client.get_private_ip),
            "drg":                ("Dynamic Routing Gateway", virtual_network_client.get_drg),
        }
        if entity_type in entity_type_map:
            type_name, func = entity_type_map[entity_type]
            entity = _safe_api_call(func, entity_id)
            if entity:
                display_attr = getattr(entity, "ip_address", getattr(entity, "display_name", None))
                return f"{type_name}: {display_attr}" if display_attr else type_name
            return entity_id
        if entity_type == "drgattachment":
            attachment = _safe_api_call(virtual_network_client.get_drg_attachment, entity_id)
            if attachment and attachment.drg_id:
                drg = _safe_api_call(virtual_network_client.get_drg, attachment.drg_id)
                return f"DRG Attachment: {drg.display_name if drg else ''}"
    except (IndexError, AttributeError):
        pass
    return entity_id

def _get_drg_route_table_name(virtual_network_client, drg_route_table_id: str) -> str:
    """Resolves the display name of a DRG Route Table from its OCID."""
    if not drg_route_table_id:
        return "N/A"
    route_table = _safe_api_call(virtual_network_client.get_drg_route_table, drg_route_table_id)
    return route_table.display_name if route_table else drg_route_table_id

def _get_source_dest_name(virtual_network_client, source_dest: str) -> str:
    """Resolves an NSG display name from its OCID. Returns the original value if it is not an NSG OCID."""
    if not source_dest or not source_dest.startswith("ocid1.networksecuritygroup"):
        return source_dest
    nsg = _safe_api_call(virtual_network_client.get_network_security_group, source_dest)
    return nsg.display_name if nsg else source_dest

def get_compartment_name(compartment_id: str) -> str:
    """Returns the display name of a compartment by its OCID."""
    if not identity_client_for_compartment:
        return "N/A"
    if compartment_id == _default_tenancy_id:
        return "Raiz (Tenancy)"
    compartment = _safe_api_call(identity_client_for_compartment.get_compartment, compartment_id)
    return compartment.name if compartment else "N/A"

def _validate_ipsec_parameters(
    tunnel: oci.core.models.IPSecConnectionTunnel,
) -> Tuple[str, Optional[str]]:
    """
    Validates IPSec tunnel encryption parameters against Oracle's official
    recommendations. Returns a (status, docs_link_or_None) tuple.
    """
    p1, p2 = tunnel.phase_one_details, tunnel.phase_two_details
    if not p1 or not p2:
        return "Indisponível", "Detalhes de IKE/IPSec não encontrados."
    docs_link = "https://docs.oracle.com/pt-br/iaas/Content/Network/Reference/supportedIPsecparams.htm"
    if not p1.is_custom_phase_one_config:
        return "Gerenciado pela Oracle (Padrão)", None
    recommended_p1 = {"encryption": "AES_256_CBC", "authentication": "SHA2_384", "dh_group": "GROUP20"}
    is_p1_ok = (
        p1.custom_encryption_algorithm   == recommended_p1["encryption"]
        and p1.custom_authentication_algorithm == recommended_p1["authentication"]
        and p1.custom_dh_group           == recommended_p1["dh_group"]
    )
    is_p2_ok = False
    p2_encryption, p2_authentication = p2.custom_encryption_algorithm, p2.custom_authentication_algorithm
    if p2_encryption and "GCM" in p2_encryption:
        is_p2_ok = p2_encryption == "AES_256_GCM" and p2_authentication is None
    elif p2_encryption and "CBC" in p2_encryption:
        is_p2_ok = p2_encryption == "AES_256_CBC" and p2_authentication == "HMAC_SHA2_256_128"
    if is_p1_ok and is_p2_ok:
        return "Conforme a recomendação Oracle", None
    return "Fora da recomendação Oracle", docs_link

# ==============================================================================
# Public API Functions — Resource Listing
# ==============================================================================
def list_regions(profile: Optional[Dict[str, Any]] = None) -> List[Dict[str, str]]:
    """Returns all subscribed and active OCI regions for the given profile's tenancy."""
    auth = _auth_from_profile(profile)
    tenancy_id = auth.get("tenancy_id")
    if not tenancy_id:
        raise ConnectionError("OCI_ERR:tenancy_id_not_found")
    if auth.get("signer"):
        identity_client = oci.identity.IdentityClient(
            config={}, signer=auth["signer"], retry_strategy=retry_strategy
        )
    else:
        identity_client = oci.identity.IdentityClient(
            auth["config"], retry_strategy=retry_strategy
        )
    regions = _safe_api_call(identity_client.list_region_subscriptions, tenancy_id)
    if not regions:
        return []
    return [{"key": r.region_key, "name": r.region_name} for r in regions if r.status == "READY"]

def list_compartments(region: str, profile: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Returns all active compartments in the tenancy as a flattened hierarchical list."""
    auth = _auth_from_profile(profile)
    tenancy_id = auth.get("tenancy_id")
    if not tenancy_id:
        raise ConnectionError("OCI_ERR:tenancy_id_not_found")
    identity_client = get_client(oci.identity.IdentityClient, region, profile)
    if not identity_client:
        raise ConnectionError("OCI_ERR:identity_client_init_failed")
    all_compartments = oci.pagination.list_call_get_all_results(
        identity_client.list_compartments,
        tenancy_id,
        compartment_id_in_subtree=True,
        lifecycle_state="ACTIVE",
        retry_strategy=retry_strategy,
    ).data
    compartments_dict = {c.id: c for c in all_compartments}
    children_map = {c.id: [] for c in all_compartments}
    children_map[tenancy_id] = []
    for comp in all_compartments:
        if comp.compartment_id in children_map:
            children_map[comp.compartment_id].append(comp.id)

    def build_tree(parent_id, level=0):
        tree = []
        sorted_children = sorted(
            children_map.get(parent_id, []),
            key=lambda cid: compartments_dict.get(cid).name,
        )
        for child_id in sorted_children:
            child_comp = compartments_dict.get(child_id)
            if child_comp:
                tree.append({"id": child_comp.id, "name": child_comp.name, "level": level})
                tree.extend(build_tree(child_id, level + 1))
        return tree

    hierarchical_list = [{"id": tenancy_id, "name": "Raiz (Tenancy)", "level": 0}]
    hierarchical_list.extend(build_tree(tenancy_id, level=1))
    return hierarchical_list

def list_instances_in_compartment(region: str, compartment_id: str, profile: Optional[Dict[str, Any]] = None) -> List[Dict[str, str]]:
    """Returns RUNNING and STOPPED compute instances from the specified compartment."""
    compute_client = get_client(oci.core.ComputeClient, region, profile)
    if not compute_client:
        raise ConnectionError("OCI_ERR:compute_client_init_failed")
    all_instances = oci.pagination.list_call_get_all_results(
        compute_client.list_instances,
        compartment_id=compartment_id,
        retry_strategy=retry_strategy,
    ).data
    return [
        {"id": i.id, "display_name": i.display_name, "status": i.lifecycle_state}
        for i in all_instances
        if i.lifecycle_state in ["RUNNING", "STOPPED"]
    ]

# ==============================================================================
# Detailed Instance and Storage Data Collection
# ==============================================================================
def get_instance_details(region: str, instance_id: str, compartment_name: str = "N/A", profile: Optional[Dict[str, Any]] = None) -> InstanceData:
    compute_client = get_client(oci.core.ComputeClient, region, profile)
    virtual_network_client = get_client(oci.core.VirtualNetworkClient, region, profile)
    block_storage_client = get_client(oci.core.BlockstorageClient, region, profile)

    instance = _safe_api_call(compute_client.get_instance, instance_id)
    if not instance:
        raise Exception(f"Failed to get details: Instance with OCID {instance_id} was not found.")

    image = _safe_api_call(compute_client.get_image, instance.image_id)
    os_name = f"{image.operating_system} {image.operating_system_version}" if image else "N/A"

    private_ip, public_ip = "N/A", "N/A"
    subnet_id, subnet_name, vcn_id = None, None, None
    security_lists, network_security_groups, route_table = [], [], None
    vnic_attachments = _safe_api_call(
        compute_client.list_vnic_attachments, instance.compartment_id, instance_id=instance_id
    )
    if vnic_attachments:
        vnic = _safe_api_call(virtual_network_client.get_vnic, vnic_attachments[0].vnic_id)
        if vnic:
            private_ip = vnic.private_ip or "N/A"
            public_ip = vnic.public_ip or "N/A"
            subnet = _safe_api_call(virtual_network_client.get_subnet, vnic.subnet_id)
            if subnet:
                subnet_id = subnet.id
                subnet_name = subnet.display_name
                vcn_id = getattr(subnet, 'vcn_id', None)
                for sl_id in subnet.security_list_ids:
                    sl = _safe_api_call(virtual_network_client.get_security_list, sl_id)
                    if sl:
                        ingress_rules = [
                            SecurityRule(
                                direction="INGRESS",
                                protocol=_translate_protocol(r.protocol),
                                source_or_destination=r.source,
                                ports=_format_rule_ports(r),
                                description=r.description,
                            )
                            for r in sl.ingress_security_rules
                        ]
                        egress_rules = [
                            SecurityRule(
                                direction="EGRESS",
                                protocol=_translate_protocol(r.protocol),
                                source_or_destination=r.destination,
                                ports=_format_rule_ports(r),
                                description=r.description,
                            )
                            for r in sl.egress_security_rules
                        ]
                        security_lists.append(
                            SecurityList(id=sl.id, name=sl.display_name, rules=ingress_rules + egress_rules)
                        )
                rt = _safe_api_call(virtual_network_client.get_route_table, subnet.route_table_id)
                if rt:
                    rt_rules = [
                        RouteRule(
                            destination=r.destination,
                            target=get_network_entity_name(virtual_network_client, r.network_entity_id),
                            description=r.description,
                        )
                        for r in rt.route_rules
                    ]
                    route_table = RouteTable(id=rt.id, name=rt.display_name, rules=rt_rules)

            for nsg_id in vnic.nsg_ids:
                nsg = _safe_api_call(virtual_network_client.get_network_security_group, nsg_id)
                if nsg:
                    ingress_rules_sdk = _safe_api_call(
                        virtual_network_client.list_network_security_group_security_rules, nsg_id, direction="INGRESS"
                    )
                    egress_rules_sdk = _safe_api_call(
                        virtual_network_client.list_network_security_group_security_rules, nsg_id, direction="EGRESS"
                    )
                    all_rules_sdk = (ingress_rules_sdk or []) + (egress_rules_sdk or [])
                    nsg_rules = [
                        SecurityRule(
                            direction=r.direction,
                            protocol=_translate_protocol(r.protocol),
                            source_or_destination=_get_source_dest_name(
                                virtual_network_client,
                                r.source if r.direction == "INGRESS" else r.destination,
                            ),
                            ports=_format_rule_ports(r),
                            description=r.description,
                        )
                        for r in all_rules_sdk
                    ]
                    network_security_groups.append(
                        NetworkSecurityGroup(id=nsg.id, name=nsg.display_name, rules=nsg_rules)
                    )

    boot_volume_gb, backup_policy_name, boot_volume_id = "N/A", "Nenhuma política associada", None
    boot_vol_attachments = _safe_api_call(
        compute_client.list_boot_volume_attachments,
        instance.availability_domain,
        instance.compartment_id,
        instance_id=instance_id,
    )
    if boot_vol_attachments:
        boot_volume_id = boot_vol_attachments[0].boot_volume_id
        boot_vol = _safe_api_call(block_storage_client.get_boot_volume, boot_volume_id)
        if boot_vol:
            boot_volume_gb = str(int(boot_vol.size_in_gbs))
            assignment = _safe_api_call(
                block_storage_client.get_volume_backup_policy_asset_assignment, boot_vol.id
            )
            if assignment:
                policy = _safe_api_call(
                    block_storage_client.get_volume_backup_policy, assignment[0].policy_id
                )
                if policy:
                    backup_policy_name = policy.display_name

    block_volumes = []
    attachments = _safe_api_call(
        compute_client.list_volume_attachments, instance.compartment_id, instance_id=instance_id
    )
    if attachments:
        for att in [a for a in attachments if a.lifecycle_state == "ATTACHED" and a.attachment_type != "iscsi"]:
            vol = _safe_api_call(block_storage_client.get_volume, att.volume_id)
            if vol:
                vol_backup_policy_name = "Nenhuma política associada"
                vol_assignment = _safe_api_call(
                    block_storage_client.get_volume_backup_policy_asset_assignment, vol.id
                )
                if vol_assignment:
                    vol_policy = _safe_api_call(
                        block_storage_client.get_volume_backup_policy, vol_assignment[0].policy_id
                    )
                    if vol_policy:
                        vol_backup_policy_name = vol_policy.display_name
                block_volumes.append(
                    BlockVolume(
                        id=vol.id,
                        display_name=vol.display_name,
                        size_in_gbs=vol.size_in_gbs,
                        backup_policy_name=vol_backup_policy_name,
                    )
                )

    return InstanceData(
        host_name=instance.display_name,
        shape=instance.shape,
        ocpus=str(int(instance.shape_config.ocpus)),
        memory=str(int(instance.shape_config.memory_in_gbs)),
        os_name=os_name,
        boot_volume_gb=boot_volume_gb,
        boot_volume_id=boot_volume_id,
        private_ip=private_ip,
        public_ip=public_ip,
        backup_policy_name=backup_policy_name,
        block_volumes=block_volumes,
        security_lists=security_lists,
        network_security_groups=network_security_groups,
        route_table=route_table,
        compartment_name=compartment_name,
        lifecycle_state=instance.lifecycle_state,
        subnet_id=subnet_id,
        subnet_name=subnet_name,
        vcn_id=vcn_id,
    )

def _get_standalone_block_volumes(
    block_storage_client,
    compartment_id: str,
    attached_volume_ids: set,
) -> list:
    """
    Returns block volumes in the compartment NOT attached to any instance.
    Uses the set of volume IDs already collected from instances for exclusion.
    """
    results = []
    try:
        all_vols_sdk = oci.pagination.list_call_get_all_results(
            block_storage_client.list_volumes,
            compartment_id=compartment_id,
            retry_strategy=retry_strategy,
        ).data
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "volume")
        for vol in all_vols_sdk:
            if vol.id in attached_volume_ids:
                continue
            policy_name = "Nenhuma política associada"
            try:
                assignments = oci.pagination.list_call_get_all_results(
                    block_storage_client.get_volume_backup_policy_asset_assignment,
                    asset_id=vol.id,
                    retry_strategy=retry_strategy,
                ).data
                if assignments:
                    policy = _safe_api_call(
                        block_storage_client.get_volume_backup_policy,
                        assignments[0].policy_id,
                    )
                    if policy:
                        policy_name = policy.display_name
            except Exception:
                pass
            results.append(
                StandaloneVolumeData(
                    id=vol.id,
                    display_name=vol.display_name,
                    size_in_gbs=float(vol.size_in_gbs),
                    lifecycle_state=vol.lifecycle_state,
                    backup_policy_name=policy_name,
                    availability_domain=vol.availability_domain,
                )
            )
    except Exception as exc:
        logging.warning(f"Could not list standalone block volumes: {exc}")
    return results


def _get_volume_groups(
    block_storage_client: oci.core.BlockstorageClient,
    compartment_id: str,
    all_volumes_map: Dict[str, str],
) -> List[VolumeGroupData]:
    """Collects Volume Groups from the compartment, including backup policy and cross-region replication data."""
    volume_groups_data = []
    try:
        all_vgs_sdk = oci.pagination.list_call_get_all_results(
            block_storage_client.list_volume_groups,
            compartment_id=compartment_id,
            retry_strategy=retry_strategy,
        ).data
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "volume")
    for vg_summary in all_vgs_sdk:
        vg = _safe_api_call(block_storage_client.get_volume_group, vg_summary.id)
        if not vg:
            continue
        policy_name, has_backup_policy = "Nenhuma", False
        assignment = _safe_api_call(
            block_storage_client.get_volume_backup_policy_asset_assignment, vg.id
        )
        if assignment:
            policy = _safe_api_call(
                block_storage_client.get_volume_backup_policy, assignment[0].policy_id
            )
            if policy:
                policy_name, has_backup_policy = policy.display_name, True
        cross_region_target, is_cross_region_replication_enabled = "Desabilitada", False
        if getattr(vg, "volume_group_replicas", []):
            is_cross_region_replication_enabled = True
            replica_region_key = vg.volume_group_replicas[0].availability_domain.rsplit("-", 1)[0]
            cross_region_target = replica_region_key.replace("AD", "").strip()
        member_names = [all_volumes_map.get(vol_id, vol_id) for vol_id in vg.volume_ids]
        volume_groups_data.append(
            VolumeGroupData(
                id=vg.id,
                display_name=vg.display_name,
                availability_domain=vg.availability_domain,
                lifecycle_state=vg.lifecycle_state,
                members=sorted(member_names),
                member_ids=vg.volume_ids,
                validation=VolumeGroupValidation(
                    has_backup_policy=has_backup_policy,
                    policy_name=policy_name,
                    is_cross_region_replication_enabled=is_cross_region_replication_enabled,
                    cross_region_target=cross_region_target,
                ),
            )
        )
    return volume_groups_data

def _get_oke_clusters(
    ce_client: oci.container_engine.ContainerEngineClient,
    compute_client: oci.core.ComputeClient,
    compartment_id: str,
    vcn_map: Dict[str, Any],
) -> List[OkeClusterData]:
    """Collects active OKE clusters with their Node Pools and associated network information."""
    oke_clusters_data = []
    try:
        all_clusters_summary_sdk = oci.pagination.list_call_get_all_results(
            ce_client.list_clusters, compartment_id=compartment_id, retry_strategy=retry_strategy
        ).data
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "cluster")
    for cluster_summary in [c for c in all_clusters_summary_sdk if c.lifecycle_state == "ACTIVE"]:
        vcn_info = vcn_map.get(cluster_summary.vcn_id, {"name": "N/A", "subnets": {}})
        node_pools_data = []
        all_node_pools_sdk = oci.pagination.list_call_get_all_results(
            ce_client.list_node_pools,
            cluster_id=cluster_summary.id,
            compartment_id=compartment_id,
            retry_strategy=retry_strategy,
        ).data
        for np in all_node_pools_sdk:
            ocpus = np.node_shape_config.ocpus if np.node_shape_config else 0
            memory = np.node_shape_config.memory_in_gbs if np.node_shape_config else 0
            subnet_name = vcn_info["subnets"].get((np.subnet_ids or [None])[0], "N/A")
            node_pool_size = np.node_config_details.size if np.node_config_details else 0
            boot_vol_size = 0
            if np.node_source_details and np.node_source_details.boot_volume_size_in_gbs is not None:
                boot_vol_size = int(np.node_source_details.boot_volume_size_in_gbs)
            elif np.node_image_id:
                try:
                    image = _safe_api_call(compute_client.get_image, np.node_image_id)
                    boot_vol_size = int(image.boot_volume_size_in_gbs) if image and image.boot_volume_size_in_gbs else 47
                except Exception:
                    boot_vol_size = 47
            else:
                boot_vol_size = 47
            node_pools_data.append(
                NodePoolData(
                    name=np.name,
                    kubernetes_version=np.kubernetes_version,
                    shape=np.node_shape,
                    ocpus=int(ocpus),
                    memory_in_gbs=int(memory),
                    os_image=np.node_image_name,
                    node_count=node_pool_size,
                    subnet_name=subnet_name,
                    boot_volume_size_in_gbs=boot_vol_size,
                )
            )
        lb_subnet_name = next(
            (name for name in vcn_info["subnets"].values() if "lb" in name.lower() or "loadbalancer" in name.lower()),
            "Não encontrada",
        )
        public_endpoint, private_endpoint = "N/A", "N/A"
        if cluster_summary.endpoints:
            public_endpoint = cluster_summary.endpoints.public_endpoint or "N/A"
            private_endpoint = cluster_summary.endpoints.private_endpoint or "N/A"
            if public_endpoint == "N/A" and private_endpoint == "N/A":
                public_endpoint = cluster_summary.endpoints.kubernetes or "N/A"
        nodes_subnet = node_pools_data[0].subnet_name if node_pools_data else "N/A"
        oke_clusters_data.append(
            OkeClusterData(
                id=cluster_summary.id,
                name=cluster_summary.name,
                kubernetes_version=cluster_summary.kubernetes_version,
                vcn_id=cluster_summary.vcn_id,
                vcn_name=vcn_info["name"],
                public_api_endpoint=public_endpoint,
                private_api_endpoint=private_endpoint,
                lb_subnet_name=lb_subnet_name,
                nodes_subnet_name=nodes_subnet,
                node_pools=node_pools_data,
            )
        )
    return oke_clusters_data

# ==============================================================================
# OCI Certificates Service Data Collection
# ==============================================================================

def _infer_resource_type_from_ocid(ocid: str) -> str:
    """Infers a human-readable resource label from an OCI OCID."""
    if not ocid:
        return "Unknown"
    ocid_lower = ocid.lower()
    if "networkloadbalancer" in ocid_lower:
        return "Network Load Balancer"
    if "loadbalancer" in ocid_lower:
        return "Load Balancer"
    if "apigateway" in ocid_lower:
        return "API Gateway"
    if "waaspolicy" in ocid_lower:
        return "WAAS Policy"
    if "waf" in ocid_lower:
        return "WAF"
    if "instance" in ocid_lower:
        return "Compute Instance"
    if "cluster" in ocid_lower:
        return "OKE Cluster"
    return "Unknown"

def _get_compartment_certificates(certs_mgmt_client, compartment_id: str) -> list:
    """
    Collects OCI Certificates Service certificates and their associations.
    Only ACTIVE and PENDING_DELETION states are kept; others are discarded silently.
    """

    def _ga(obj, attr, default=None):
        return getattr(obj, attr, default) or default

    def _date(raw, default="N/A"):
        if not raw:
            return default
        s = str(raw)
        for sep in ("T", " "):
            if sep in s:
                return s.split(sep)[0]
        return s[:10] if len(s) >= 10 else s

    def _subject_from_obj(subj_obj):
        if subj_obj is None:
            return {"common_name": "N/A", "organization": "N/A",
                    "locality_name": "N/A", "state_or_province_name": "N/A", "country": "N/A"}
        if isinstance(subj_obj, dict):
            def _dk(d, *keys):
                for k in keys:
                    v = d.get(k)
                    if v: return v
                return "N/A"
            return {
                "common_name":            _dk(subj_obj, "common_name",            "common-name"),
                "organization":           _dk(subj_obj, "organization"),
                "locality_name":          _dk(subj_obj, "locality_name",          "locality-name"),
                "state_or_province_name": _dk(subj_obj, "state_or_province_name", "state-or-province-name"),
                "country":                _dk(subj_obj, "country"),
            }
        return {
            "common_name":            getattr(subj_obj, "common_name",            None) or "N/A",
            "organization":           getattr(subj_obj, "organization",           None) or "N/A",
            "locality_name":          getattr(subj_obj, "locality_name",          None) or "N/A",
            "state_or_province_name": getattr(subj_obj, "state_or_province_name", None) or "N/A",
            "country":                getattr(subj_obj, "country",                None) or "N/A",
        }

    def _cvs_from_obj(cvs_obj):
        if cvs_obj is None:
            return {}
        if isinstance(cvs_obj, dict):
            def _dk(d, *keys):
                for k in keys:
                    v = d.get(k)
                    if v is not None: return v
                return None
            val_d = _dk(cvs_obj, "validity") or {}
            if isinstance(val_d, dict):
                nb = _dk(val_d, "time_of_validity_not_before", "time-of-validity-not-before")
                na = _dk(val_d, "time_of_validity_not_after",  "time-of-validity-not-after")
            else:
                nb = getattr(val_d, "time_of_validity_not_before", None)
                na = getattr(val_d, "time_of_validity_not_after",  None)
            stages_raw = _dk(cvs_obj, "stages") or []
            sans_raw   = _dk(cvs_obj, "subject_alternative_names", "subject-alternative-names") or []
            return {
                "stages":           [str(s) for s in stages_raw] if isinstance(stages_raw, list) else [],
                "version_number":   _dk(cvs_obj, "version_number",  "version-number"),
                "serial_number":    _dk(cvs_obj, "serial_number",   "serial-number") or "N/A",
                "valid_not_before": _date(nb),
                "valid_not_after":  _date(na),
                "time_created":     _date(_dk(cvs_obj, "time_created", "time-created")),
                "_sans_raw":        sans_raw,
            }
        val_obj = getattr(cvs_obj, "validity", None)
        nb = getattr(val_obj, "time_of_validity_not_before", None) if val_obj else None
        na = getattr(val_obj, "time_of_validity_not_after",  None) if val_obj else None
        stages_raw = getattr(cvs_obj, "stages", []) or []
        sans_raw   = getattr(cvs_obj, "subject_alternative_names", []) or []
        return {
            "stages":           [str(s) for s in stages_raw],
            "version_number":   getattr(cvs_obj, "version_number",  None),
            "serial_number":    getattr(cvs_obj, "serial_number",   None) or "N/A",
            "valid_not_before": _date(nb),
            "valid_not_after":  _date(na),
            "time_created":     _date(getattr(cvs_obj, "time_created", None)),
            "_sans_raw":        sans_raw,
        }

    def _sans_from_raw(sans_raw) -> list:
        result = []
        for s in (sans_raw or []):
            if isinstance(s, dict):
                result.append({
                    "san_type": s.get("san_type") or s.get("type") or "DNS",
                    "value":    s.get("value") or "",
                })
            else:
                result.append({
                    "san_type": getattr(s, "san_type", getattr(s, "type", "DNS")),
                    "value":    getattr(s, "value", str(s)),
                })
        return result

    def _build_assoc(assoc_obj) -> dict:
        if isinstance(assoc_obj, dict):
            def _dk(d, *keys):
                for k in keys:
                    v = d.get(k)
                    if v: return v
                return "N/A"
            res_id = _dk(assoc_obj, "associated_resource_id", "associated-resource-id")
        else:
            res_id = getattr(assoc_obj, "associated_resource_id", None) or "N/A"
        return {
            "display_name":           (getattr(assoc_obj, "name", None) if not isinstance(assoc_obj, dict)
                                       else assoc_obj.get("name")) or "N/A",
            "resource_type":          _infer_resource_type_from_ocid(res_id),
            "lifecycle_state":        (getattr(assoc_obj, "lifecycle_state", None) if not isinstance(assoc_obj, dict)
                                       else assoc_obj.get("lifecycle_state") or assoc_obj.get("lifecycle-state")) or "N/A",
            "associated_resource_id": res_id,
            "time_created":           _date(getattr(assoc_obj, "time_created", None) if not isinstance(assoc_obj, dict)
                                            else assoc_obj.get("time_created") or assoc_obj.get("time-created")),
        }

    def _cert_id_from(assoc_obj) -> str:
        if isinstance(assoc_obj, dict):
            return (assoc_obj.get("certificates_resource_id")
                    or assoc_obj.get("certificates-resource-id") or "")
        return getattr(assoc_obj, "certificates_resource_id", None) or ""

    logging.info("Starting certificate collection. compartment_id=%s", compartment_id)

    certs_data: list = []
    try:
        certs_sdk = oci.pagination.list_call_get_all_results(
            certs_mgmt_client.list_certificates,
            compartment_id=compartment_id,
            retry_strategy=retry_strategy,
        ).data
        logging.info("Found %d certificate(s) in compartment.", len(certs_sdk))
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "certificate")

    assoc_map: Dict[str, list] = {}
    try:
        assocs_sdk = oci.pagination.list_call_get_all_results(
            certs_mgmt_client.list_associations,
            compartment_id=compartment_id,
            retry_strategy=retry_strategy,
        ).data
        for a in assocs_sdk:
            cid = _cert_id_from(a)
            if cid:
                assoc_map.setdefault(cid, []).append(_build_assoc(a))
        logging.info("Fetched %d certificate association(s) for compartment.", len(assocs_sdk))
    except Exception as e:
        logging.warning("Compartment-wide association fetch failed: %s", e)

    for cert_obj in certs_sdk:
        try:
            cert_id = getattr(cert_obj, "id", None) or ""
            name    = getattr(cert_obj, "name", None) or "N/A"
            state   = (getattr(cert_obj, "lifecycle_state", None) or "").upper()

            if state not in ("ACTIVE", "PENDING_DELETION"):
                continue
            if not cert_id:
                logging.warning("Skipping certificate with no OCID: name=%s", name)
                continue

            cert_detail_obj = None
            try:
                cert_detail_obj = certs_mgmt_client.get_certificate(
                    certificate_id=cert_id,
                    retry_strategy=retry_strategy,
                ).data
            except Exception as e:
                logging.warning("Failed to get certificate detail for %s: %s", name, e)

            if cert_id not in assoc_map:
                try:
                    per = oci.pagination.list_call_get_all_results(
                        certs_mgmt_client.list_associations,
                        compartment_id=compartment_id,
                        certificates_resource_id=cert_id,
                        retry_strategy=retry_strategy,
                    ).data
                    if per:
                        assoc_map[cert_id] = [_build_assoc(a) for a in per]
                except Exception as e:
                    logging.warning("Per-cert association fallback failed for %s: %s", name, e)

            subj_obj = getattr(cert_obj, "subject", None)
            subj = _subject_from_obj(subj_obj)
            if subj["common_name"] == "N/A" and cert_detail_obj:
                subj = _subject_from_obj(getattr(cert_detail_obj, "subject", None))

            cvs_obj = (
                getattr(cert_obj,         "current_version_summary", None)
                or (getattr(cert_detail_obj, "current_version",         None) if cert_detail_obj else None)
                or getattr(cert_obj,         "current_version",         None)
            )
            cvs = _cvs_from_obj(cvs_obj)
            sans = _sans_from_raw(cvs.pop("_sans_raw", []))

            tod_raw = (getattr(cert_obj, "time_of_deletion", None)
                       or (getattr(cert_detail_obj, "time_of_deletion", None) if cert_detail_obj else None))
            time_of_deletion = _date(tod_raw) if tod_raw else "—"

            cert_entry = {
                "id":              cert_id,
                "name":            name,
                "lifecycle_state": state,
                "config_type":     getattr(cert_obj, "config_type", None) or "IMPORTED",
                "key_algorithm":   getattr(cert_obj, "key_algorithm", None) or "N/A",
                "signature_algorithm": getattr(cert_obj, "signature_algorithm", None) or "N/A",
                "time_created":    _date(getattr(cert_obj, "time_created", None)),
                "time_of_deletion": time_of_deletion,
                "subject":         subj,
                "subject_alternative_names": sans,
                "current_version_summary": {
                    "stages":           cvs.get("stages", []),
                    "version_number":   cvs.get("version_number"),
                    "serial_number":    cvs.get("serial_number", "N/A"),
                    "valid_not_before": cvs.get("valid_not_before", "N/A"),
                    "valid_not_after":  cvs.get("valid_not_after",  "N/A"),
                    "time_created":     cvs.get("time_created",     "N/A"),
                },
                "associations": assoc_map.get(cert_id, []),
            }
            certs_data.append(cert_entry)

        except Exception as cert_ex:
            logging.error(
                "Exception processing certificate %s: %s",
                getattr(cert_obj, "name", "?"),
                cert_ex,
                exc_info=True,
            )

    logging.info("Certificate collection complete. Returning %d certificate(s).", len(certs_data))
    return certs_data

# ==============================================================================
# WAF Data Collection Helpers
# ==============================================================================

def _get_waf_firewall_attachments(waf_client: WafClient, compartment_id: str) -> Dict[str, Dict[str, str]]:
    """
    Returns a dict mapping load_balancer_id → WAF attachment metadata.

    Raises PermissionError when the IAM policy for WAF is missing so that callers
    can decide whether to abort the task or continue without WAF data.
    """
    try:
        firewalls_sdk = oci.pagination.list_call_get_all_results(
            waf_client.list_web_app_firewalls,
            compartment_id=compartment_id,
            retry_strategy=retry_strategy,
        ).data
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "waf")

    attachments = {}
    for fw in firewalls_sdk:
        if fw.lifecycle_state != "DELETED" and fw.backend_type == "LOAD_BALANCER":
            policy_name = fw.display_name
            policy = _safe_api_call(waf_client.get_web_app_firewall_policy, fw.web_app_firewall_policy_id)
            if policy:
                policy_name = policy.display_name
            attachments[fw.load_balancer_id] = {
                "firewall_id": fw.id, "firewall_name": fw.display_name,
                "policy_id": fw.web_app_firewall_policy_id, "policy_name": policy_name,
            }
    return attachments


def _get_waf_policies(
    waf_client: WafClient, compartment_id: str, region: str, compartment_name: str
) -> List[WafPolicyData]:
    """
    Returns all active WAF policies in the compartment.

    Raises PermissionError when the IAM policy for WAF (waas-family) is missing.
    All other ServiceErrors are re-raised as-is.
    """
    try:
        policies_sdk = oci.pagination.list_call_get_all_results(
            waf_client.list_web_app_firewall_policies,
            compartment_id=compartment_id,
            lifecycle_state="ACTIVE",
            retry_strategy=retry_strategy,
        ).data
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "waf")

    policies_data = []
    for p_summary in policies_sdk:
        if getattr(p_summary, "lifecycle_state", "").upper() not in ("ACTIVE", "CREATING", "UPDATING"):
            continue
        p_details = _safe_api_call(waf_client.get_web_app_firewall_policy, p_summary.id)
        if not p_details:
            continue
        actions = [WafAction(name=a.name, type=a.type, code=getattr(a, "code", None)) for a in (p_details.actions or [])]
        ac_rules = [
            WafAccessControlRule(name=r.name, action_name=r.action_name, condition=r.condition, condition_language=r.condition_language)
            for r in (p_details.request_access_control.rules if p_details.request_access_control and p_details.request_access_control.rules else [])
        ]
        prot_rules = []
        for r in (p_details.request_protection.rules if p_details.request_protection and p_details.request_protection.rules else []):
            caps = [WafProtectionCapability(key=c.key, version=c.version, action_name=c.action_name) for c in (r.protection_capabilities or [])]
            prot_rules.append(WafProtectionRule(
                name=r.name, action_name=r.action_name, condition=r.condition,
                is_body_inspection_enabled=r.is_body_inspection_enabled or False,
                protection_capabilities=caps,
            ))
        rl_rules = [
            WafRateLimitingRule(name=r.name, action_name=r.action_name, condition=r.condition)
            for r in (p_details.request_rate_limiting.rules if p_details.request_rate_limiting and p_details.request_rate_limiting.rules else [])
        ]
        time_created = p_details.time_created.strftime("%Y-%m-%d %H:%M:%S") if p_details.time_created else "N/A"
        policies_data.append(
            WafPolicyData(
                id=p_details.id, display_name=p_details.display_name,
                compartment_name=compartment_name, lifecycle_state=p_details.lifecycle_state,
                region=region, time_created=time_created,
                actions=actions, access_control_rules=ac_rules,
                protection_rules=prot_rules, rate_limiting_rules=rl_rules,
            )
        )
    return policies_data

# ==============================================================================
# Main Orchestrator Functions — Entry points for Celery tasks
# ==============================================================================
def get_infrastructure_details(
    task, region: str, compartment_id: str, doc_type: str,
    include_standalone: bool = True,
    profile: Optional[Dict[str, Any]] = None,
) -> InfrastructureData:
    """
    Main orchestrator for full infrastructure data collection.
    WAF collection is treated as optional: a missing IAM policy is logged as a
    warning and WAF data is returned empty so the rest of the report is unaffected.
    """
    is_k8s_flow = doc_type == "kubernetes"

    task.update_state(
        state="PROGRESS",
        meta={"current": 0, "total": 100, "step_key": "progress.initializing_clients", "context": {}},
    )

    compute_client = get_client(oci.core.ComputeClient, region, profile)
    virtual_network_client = get_client(oci.core.VirtualNetworkClient, region, profile)
    load_balancer_client = get_client(oci.load_balancer.LoadBalancerClient, region, profile)
    block_storage_client = get_client(oci.core.BlockstorageClient, region, profile)
    ce_client = get_client(ContainerEngineClient, region, profile)
    waf_client = get_client(WafClient, region, profile)

    oracle_managed_str = "Gerenciado pela Oracle (Padrão)"
    instances = []

    # WAF firewall attachments are optional — a PermissionError means missing IAM,
    # which is logged as a warning so the rest of the collection continues normally.
    waf_attachments = {}
    if waf_client:
        try:
            waf_attachments = _get_waf_firewall_attachments(waf_client, compartment_id)
        except PermissionError as e:
            logging.warning("WAF firewall attachments skipped — %s", e)
        except Exception as e:
            logging.warning("WAF firewall attachments skipped (unexpected error): %s", e)

    step_key = "progress.listing_oke" if is_k8s_flow else "progress.listing_instances"
    task.update_state(
        state="PROGRESS",
        meta={"current": 5, "total": 100, "step_key": step_key, "context": {}},
    )

    try:
        all_instances_sdk = oci.pagination.list_call_get_all_results(
            compute_client.list_instances, compartment_id=compartment_id, retry_strategy=retry_strategy
        ).data
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "instance")
    total_instances = len(all_instances_sdk)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS_FOR_DETAILS) as executor:
        future_to_instance = {
            executor.submit(get_instance_details, region, i.id, get_compartment_name(i.compartment_id), profile): i
            for i in all_instances_sdk
        }
        completed_count = 0
        for future in as_completed(future_to_instance):
            completed_count += 1
            instance_summary = future_to_instance[future]
            progress_percent = 5 + int((completed_count / total_instances) * 50) if total_instances > 0 else 55
            step_key = "progress.analyzing_worker" if is_k8s_flow else "progress.analyzing_vm"
            task.update_state(
                state="PROGRESS",
                meta={"current": progress_percent, "total": 100, "step_key": step_key, "context": {"name": instance_summary.display_name}},
            )
            try:
                instances.append(future.result())
            except Exception as exc:
                logging.error(f"Error fetching details for instance {instance_summary.display_name}: {exc}")

    step_key = "progress.analyzing_cluster_network" if is_k8s_flow else "progress.mapping_storage"
    task.update_state(state="PROGRESS", meta={"current": 55, "total": 100, "step_key": step_key, "context": {}})

    all_volumes_map = {i.boot_volume_id: f"Boot Volume ({i.host_name})" for i in instances if i.boot_volume_id}
    all_volumes_map.update({bv.id: f"Block Volume ({bv.display_name})" for i in instances for bv in i.block_volumes})
    volume_groups = _get_volume_groups(block_storage_client, compartment_id, all_volumes_map)

    attached_ids = {bv.id for i in instances for bv in i.block_volumes}
    standalone_volumes = _get_standalone_block_volumes(block_storage_client, compartment_id, attached_ids) if include_standalone else []

    step_key = "progress.checking_network_connectivity" if is_k8s_flow else "progress.collecting_connectivity"
    task.update_state(state="PROGRESS", meta={"current": 60, "total": 100, "step_key": step_key, "context": {}})

    try:
        all_drgs_sdk = oci.pagination.list_call_get_all_results(
            virtual_network_client.list_drgs, compartment_id=compartment_id, retry_strategy=retry_strategy
        ).data
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "drg")
    drgs = []
    for drg_sdk in all_drgs_sdk:
        attachments_sdk = oci.pagination.list_call_get_all_results(
            virtual_network_client.list_drg_attachments,
            drg_id=drg_sdk.id, compartment_id=compartment_id, retry_strategy=retry_strategy,
        ).data
        attachments = [
            DrgAttachmentData(
                id=a.id, display_name=a.display_name,
                network_id=a.network_details.id if a.network_details else None,
                network_type=a.network_details.type if a.network_details else "N/A",
                route_table_id=a.drg_route_table_id,
                route_table_name=_get_drg_route_table_name(virtual_network_client, a.drg_route_table_id),
            )
            for a in attachments_sdk
        ]
        rpcs_sdk = oci.pagination.list_call_get_all_results(
            virtual_network_client.list_remote_peering_connections,
            compartment_id=compartment_id, drg_id=drg_sdk.id, retry_strategy=retry_strategy,
        ).data
        rpcs = [
            RpcData(id=r.id, display_name=r.display_name, lifecycle_state=r.lifecycle_state, peering_status=r.peering_status)
            for r in rpcs_sdk
        ]
        drgs.append(DrgData(id=drg_sdk.id, display_name=drg_sdk.display_name, attachments=attachments, rpcs=rpcs))

    step_key = "progress.finishing" if is_k8s_flow else "progress.collecting_vpn"
    task.update_state(state="PROGRESS", meta={"current": 65, "total": 100, "step_key": step_key, "context": {}})

    try:
        all_cpes_sdk = oci.pagination.list_call_get_all_results(
            virtual_network_client.list_cpes, compartment_id=compartment_id, retry_strategy=retry_strategy
        ).data
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "cpe")
    cpes = []
    for cpe in all_cpes_sdk:
        vendor = "N/A"
        if cpe.cpe_device_shape_id:
            shape = _safe_api_call(virtual_network_client.get_cpe_device_shape, cpe.cpe_device_shape_id)
            if shape and hasattr(shape, "cpe_device_info") and shape.cpe_device_info:
                vendor = shape.cpe_device_info.vendor or "N/A"
        cpes.append(CpeData(id=cpe.id, display_name=cpe.display_name, ip_address=cpe.ip_address, vendor=vendor))

    try:
        all_ipsec_sdk = oci.pagination.list_call_get_all_results(
            virtual_network_client.list_ip_sec_connections, compartment_id=compartment_id, retry_strategy=retry_strategy
        ).data
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "ipsec")
    ipsec_connections = []
    for ipsec in all_ipsec_sdk:
        tunnels_sdk = _safe_api_call(virtual_network_client.list_ip_sec_connection_tunnels, ipsec.id)
        tunnels = []
        if tunnels_sdk:
            for tunnel in tunnels_sdk:
                validation_status, validation_details = _validate_ipsec_parameters(tunnel)
                bgp_info = None
                p1, p2 = tunnel.phase_one_details, tunnel.phase_two_details
                if tunnel.routing == "BGP" and tunnel.bgp_session_info:
                    bgp_sdk = tunnel.bgp_session_info
                    bgp_info = BgpSessionInfo(
                        oracle_bgp_asn=str(bgp_sdk.oracle_bgp_asn) if bgp_sdk.oracle_bgp_asn else "N/A",
                        customer_bgp_asn=str(bgp_sdk.customer_bgp_asn) if bgp_sdk.customer_bgp_asn else "N/A",
                        oracle_interface_ip=bgp_sdk.oracle_interface_ip or "N/A",
                        customer_interface_ip=bgp_sdk.customer_interface_ip or "N/A",
                    )
                is_p1_custom = bool(p1.is_custom_phase_one_config) if p1 else False
                is_p2_custom = bool(p2.is_custom_phase_two_config) if p2 else False
                phase_one = PhaseOneDetails(
                    is_custom=is_p1_custom,
                    authentication_algorithm=p1.custom_authentication_algorithm if is_p1_custom and p1 else oracle_managed_str,
                    encryption_algorithm=p1.custom_encryption_algorithm if is_p1_custom and p1 else oracle_managed_str,
                    dh_group=p1.custom_dh_group if is_p1_custom and p1 else oracle_managed_str,
                    lifetime_in_seconds=p1.lifetime if p1 else 0,
                )
                phase_two = PhaseTwoDetails(
                    is_custom=is_p2_custom,
                    authentication_algorithm=(p2.custom_authentication_algorithm or "N/A") if is_p2_custom and p2 else oracle_managed_str,
                    encryption_algorithm=(p2.custom_encryption_algorithm or "N/A") if is_p2_custom and p2 else oracle_managed_str,
                    lifetime_in_seconds=p2.lifetime if p2 else 0,
                )
                tunnels.append(
                    TunnelData(
                        id=tunnel.id, display_name=tunnel.display_name,
                        status=tunnel.status or "N/A", cpe_ip=tunnel.cpe_ip,
                        vpn_oracle_ip=tunnel.vpn_ip, routing_type=tunnel.routing,
                        ike_version=tunnel.ike_version, validation_status=validation_status,
                        validation_details=validation_details,
                        phase_one_details=phase_one, phase_two_details=phase_two,
                        bgp_session_info=bgp_info,
                    )
                )
        connection_routing_type = tunnels_sdk[0].routing if tunnels_sdk else "STATIC"
        static_routes = ipsec.static_routes if connection_routing_type == "STATIC" else []
        ipsec_connections.append(
            IpsecData(
                id=ipsec.id, display_name=ipsec.display_name, status=ipsec.lifecycle_state,
                cpe_id=ipsec.cpe_id, drg_id=ipsec.drg_id,
                tunnels=tunnels, static_routes=static_routes,
            )
        )

    task.update_state(
        state="PROGRESS",
        meta={"current": 75, "total": 100, "step_key": "progress.analyzing_vcns", "context": {}},
    )

    try:
        all_vcns_sdk = oci.pagination.list_call_get_all_results(
            virtual_network_client.list_vcns,
            compartment_id=compartment_id, lifecycle_state="AVAILABLE", retry_strategy=retry_strategy,
        ).data
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "network")
    vcns = []
    for vcn_sdk in all_vcns_sdk:
        subnets = [
            SubnetData(id=s.id, display_name=s.display_name, cidr_block=s.cidr_block)
            for s in oci.pagination.list_call_get_all_results(
                virtual_network_client.list_subnets,
                compartment_id=compartment_id, vcn_id=vcn_sdk.id,
                lifecycle_state="AVAILABLE", retry_strategy=retry_strategy,
            ).data
        ]
        security_lists = []
        for sl in oci.pagination.list_call_get_all_results(
            virtual_network_client.list_security_lists,
            compartment_id=compartment_id, vcn_id=vcn_sdk.id,
            lifecycle_state="AVAILABLE", retry_strategy=retry_strategy,
        ).data:
            rules = [
                SecurityRule(direction="INGRESS", protocol=_translate_protocol(r.protocol),
                             source_or_destination=r.source, ports=_format_rule_ports(r), description=r.description)
                for r in sl.ingress_security_rules
            ] + [
                SecurityRule(direction="EGRESS", protocol=_translate_protocol(r.protocol),
                             source_or_destination=r.destination, ports=_format_rule_ports(r), description=r.description)
                for r in sl.egress_security_rules
            ]
            security_lists.append(SecurityList(id=sl.id, name=sl.display_name, rules=rules))

        route_tables = []
        for rt in oci.pagination.list_call_get_all_results(
            virtual_network_client.list_route_tables,
            compartment_id=compartment_id, vcn_id=vcn_sdk.id,
            lifecycle_state="AVAILABLE", retry_strategy=retry_strategy,
        ).data:
            route_tables.append(RouteTable(
                id=rt.id, name=rt.display_name,
                rules=[
                    RouteRule(
                        destination=r.destination,
                        target=get_network_entity_name(virtual_network_client, r.network_entity_id),
                        description=r.description,
                    )
                    for r in rt.route_rules
                ],
            ))

        route_table_map = {rt.id: rt.name for rt in route_tables}
        vcn_specific_nsgs = []
        for nsg_sdk in oci.pagination.list_call_get_all_results(
            virtual_network_client.list_network_security_groups,
            compartment_id=compartment_id, vcn_id=vcn_sdk.id, retry_strategy=retry_strategy,
        ).data:
            ingress_rules_sdk = _safe_api_call(
                virtual_network_client.list_network_security_group_security_rules, nsg_sdk.id, direction="INGRESS"
            )
            egress_rules_sdk = _safe_api_call(
                virtual_network_client.list_network_security_group_security_rules, nsg_sdk.id, direction="EGRESS"
            )
            rules = [
                SecurityRule(
                    direction=r.direction, protocol=_translate_protocol(r.protocol),
                    source_or_destination=_get_source_dest_name(
                        virtual_network_client, r.source if r.direction == "INGRESS" else r.destination
                    ),
                    ports=_format_rule_ports(r), description=r.description,
                )
                for r in ((ingress_rules_sdk or []) + (egress_rules_sdk or []))
            ]
            vcn_specific_nsgs.append(NetworkSecurityGroup(id=nsg_sdk.id, name=nsg_sdk.display_name, rules=rules))

        lpgs = [
            LpgData(
                id=l.id, display_name=l.display_name, lifecycle_state=l.lifecycle_state,
                peering_status=l.peering_status, peering_status_details=l.peering_status_details,
                peer_id=l.peer_id, route_table_id=l.route_table_id,
                peer_advertised_cidr=l.peer_advertised_cidr,
                is_cross_tenancy_peering=l.is_cross_tenancy_peering,
                route_table_name=route_table_map.get(l.route_table_id, "N/A"),
            )
            for l in oci.pagination.list_call_get_all_results(
                virtual_network_client.list_local_peering_gateways,
                compartment_id=compartment_id, vcn_id=vcn_sdk.id, retry_strategy=retry_strategy,
            ).data
        ]
        vcns.append(
            VcnData(
                id=vcn_sdk.id, display_name=vcn_sdk.display_name, cidr_block=vcn_sdk.cidr_block,
                subnets=subnets, security_lists=security_lists, route_tables=route_tables,
                network_security_groups=vcn_specific_nsgs, lpgs=lpgs,
            )
        )

    task.update_state(
        state="PROGRESS",
        meta={"current": 85, "total": 100, "step_key": "progress.checking_oke", "context": {}},
    )

    vcn_map_for_oke = {
        vcn.id: {"name": vcn.display_name, "subnets": {s.id: s.display_name for s in vcn.subnets}}
        for vcn in vcns
    }
    kubernetes_clusters = _get_oke_clusters(ce_client, compute_client, compartment_id, vcn_map_for_oke)

    task.update_state(
        state="PROGRESS",
        meta={"current": 90, "total": 100, "step_key": "progress.inspecting_lbs", "context": {}},
    )

    try:
        all_lbs_summary_sdk = oci.pagination.list_call_get_all_results(
            load_balancer_client.list_load_balancers, compartment_id=compartment_id, retry_strategy=retry_strategy
        ).data
    except oci.exceptions.ServiceError as e:
        _check_iam(e, "loadbalancer")
    load_balancers = []
    for lb_summary in all_lbs_summary_sdk:
        lb_details = _safe_api_call(load_balancer_client.get_load_balancer, lb_summary.id)
        if not lb_details:
            continue
        ip_addresses = [LoadBalancerIpAddressData(ip_address=ip.ip_address, is_public=ip.is_public) for ip in lb_details.ip_addresses]
        hostnames = [HostnameData(name=h.name) for h in lb_details.hostnames.values()]
        listeners = [
            ListenerData(
                name=l.name,
                protocol=(
                    "HTTPS"
                    if getattr(l, "ssl_configuration", None) is not None
                    else l.protocol
                ),
                port=l.port,
                default_backend_set_name=l.default_backend_set_name,
                hostname_names=l.hostname_names if l.hostname_names else [],
                ssl_certificate_ids=(
                    list(getattr(l.ssl_configuration, "certificate_ids", None) or [])
                    if getattr(l, "ssl_configuration", None) is not None else []
                ),
            )
            for l in lb_details.listeners.values()
        ]
        backend_sets = []
        for bs_sdk in lb_details.backend_sets.values():
            hc_sdk = bs_sdk.health_checker
            backend_sets.append(
                BackendSetData(
                    name=bs_sdk.name, policy=bs_sdk.policy,
                    health_checker=HealthCheckerData(protocol=hc_sdk.protocol, port=hc_sdk.port, url_path=hc_sdk.url_path),
                    backends=[BackendData(name=b.name, ip_address=b.ip_address, port=b.port, weight=b.weight) for b in bs_sdk.backends],
                )
            )
        certificates = []
        if getattr(lb_details, "certificates", None):
            for cert_name, cert_obj in lb_details.certificates.items():
                not_after = "N/A"
                if hasattr(cert_obj, "public_certificate") and cert_obj.public_certificate and hasattr(cert_obj.public_certificate, "not_valid_after"):
                    not_after = str(cert_obj.public_certificate.not_valid_after)
                certificates.append(LoadBalancerCertificateData(name=cert_name, valid_not_after=not_after))

        load_balancers.append(
            LoadBalancerData(
                id=lb_details.id,
                subnet_ids=list(lb_details.subnet_ids or []),
                display_name=lb_details.display_name,
                lifecycle_state=lb_details.lifecycle_state,
                shape_name=lb_details.shape_name,
                ip_addresses=ip_addresses,
                listeners=listeners,
                backend_sets=backend_sets,
                hostnames=hostnames,
                certificates=certificates,
                waf_firewall_id=waf_attachments.get(lb_details.id, {}).get("firewall_id"),
                waf_firewall_name=waf_attachments.get(lb_details.id, {}).get("firewall_name"),
                waf_policy_id=waf_attachments.get(lb_details.id, {}).get("policy_id"),
                waf_policy_name=waf_attachments.get(lb_details.id, {}).get("policy_name"),
            )
        )

    task.update_state(
        state="PROGRESS",
        meta={"current": 94, "total": 100, "step_key": "progress.collecting_waf_infra", "context": {}},
    )

    # WAF policies collection is optional in the full infrastructure flow.
    # A PermissionError (missing IAM policy) is logged as a warning and WAF is
    # returned empty — the rest of the report is not affected.
    waf_policies = []
    if waf_client:
        try:
            waf_policies = _get_waf_policies(waf_client, compartment_id, region, compartment_name="")

            firewalls_sdk = oci.pagination.list_call_get_all_results(
                waf_client.list_web_app_firewalls,
                compartment_id=compartment_id,
                retry_strategy=retry_strategy,
            ).data
            active_firewalls = [fw for fw in firewalls_sdk if fw.lifecycle_state != "DELETED"]

            lb_by_policy_id: dict = {}
            for lb in load_balancers:
                if lb.waf_policy_id:
                    lb_by_policy_id.setdefault(lb.waf_policy_id, []).append(lb)

            for policy in waf_policies:
                policy_firewalls = [f for f in active_firewalls if f.web_app_firewall_policy_id == policy.id]
                policy_integrations = []

                for fw in policy_firewalls:
                    fw_data = WafFirewallData(
                        id=fw.id,
                        display_name=fw.display_name,
                        backend_type=fw.backend_type,
                        load_balancer_id=getattr(fw, "load_balancer_id", None),
                    )

                    fw_lb_id = getattr(fw, "load_balancer_id", None)
                    lb_data = None
                    if fw_lb_id:
                        for candidate in lb_by_policy_id.get(policy.id, []):
                            if getattr(candidate, "id", None) == fw_lb_id:
                                lb_data = candidate
                                break
                        if lb_data is None:
                            try:
                                lb_sdk = _safe_api_call(load_balancer_client.get_load_balancer, fw_lb_id)
                                if lb_sdk:
                                    lb_data = LoadBalancerData(
                                        id=fw_lb_id,
                                        subnet_ids=list(lb_sdk.subnet_ids or []),
                                        display_name=lb_sdk.display_name,
                                        lifecycle_state=lb_sdk.lifecycle_state,
                                        shape_name=lb_sdk.shape_name,
                                        ip_addresses=[
                                            LoadBalancerIpAddressData(
                                                ip_address=ip.ip_address, is_public=ip.is_public
                                            )
                                            for ip in lb_sdk.ip_addresses
                                        ],
                                        listeners=[], backend_sets=[], hostnames=[],
                                    )
                            except Exception:
                                pass

                    integration = WafIntegrationData(firewall=fw_data, load_balancer=lb_data)
                    policy_integrations.append(integration)

                if policy_integrations:
                    policy.integration = policy_integrations[0]
                policy.integrations = policy_integrations

        except PermissionError:
            raise
        except Exception as e:
            logging.warning("WAF collection skipped (unexpected error): %s", e)

    task.update_state(
        state="PROGRESS",
        meta={"current": 97, "total": 100, "step_key": "progress.collecting_certificates", "context": {}},
    )
    all_certificates = []
    try:
        certs_mgmt_client = get_client(oci.certificates_management.CertificatesManagementClient, region, profile)
        all_certificates = _get_compartment_certificates(certs_mgmt_client, compartment_id)
    except PermissionError:
        raise
    except Exception as e:
        logging.warning("Certificates collection skipped (unexpected error): %s", e)

    task.update_state(
        state="PROGRESS",
        meta={"current": 99, "total": 100, "step_key": "progress.assembling_report", "context": {}},
    )

    return InfrastructureData(
        instances=instances,
        vcns=vcns,
        drgs=drgs,
        cpes=cpes,
        ipsec_connections=ipsec_connections,
        load_balancers=load_balancers,
        volume_groups=volume_groups,
        kubernetes_clusters=kubernetes_clusters,
        waf_policies=waf_policies,
        certificates=all_certificates,
        standalone_volumes=standalone_volumes,
    )

def get_new_host_details(
    task, region: str, compartment_id: str, compartment_name: str,
    instance_ids: List[str], doc_type: str,
    profile: Optional[Dict[str, Any]] = None,
) -> InfrastructureData:
    """Data collection orchestrator for the New Host flow. Collects only the specified instances and their network resources."""
    instances = []
    total_instances = len(instance_ids)
    task.update_state(
        state="PROGRESS",
        meta={"current": 0, "total": total_instances, "step_key": "progress.starting_new_host", "context": {}},
    )

    with ThreadPoolExecutor(max_workers=MAX_WORKERS_FOR_DETAILS) as executor:
        future_to_id = {
            executor.submit(get_instance_details, region, i_id, compartment_name, profile): i_id
            for i_id in instance_ids
        }
        completed_count = 0
        for future in as_completed(future_to_id):
            completed_count += 1
            instance_id = future_to_id[future]
            task.update_state(
                state="PROGRESS",
                meta={
                    "current": completed_count, "total": total_instances,
                    "step_key": "progress.analyzing_host_count",
                    "context": {"current": completed_count, "total": total_instances},
                },
            )
            try:
                instances.append(future.result())
            except Exception as exc:
                logging.error(f"Error fetching details for instance ID {instance_id}: {exc}")

    block_storage_client = get_client(oci.core.BlockstorageClient, region, profile)
    all_volumes_map = {i.boot_volume_id: f"Boot Volume ({i.host_name})" for i in instances if i.boot_volume_id}
    all_volumes_map.update({bv.id: f"Block Volume ({bv.display_name})" for i in instances for bv in i.block_volumes})
    selected_volume_ids = set(all_volumes_map.keys())
    all_vgs = _get_volume_groups(block_storage_client, compartment_id, all_volumes_map)
    relevant_vgs = [vg for vg in all_vgs if any(vol_id in selected_volume_ids for vol_id in vg.member_ids)]

    return InfrastructureData(
        instances=instances, volume_groups=relevant_vgs,
        vcns=[], drgs=[], cpes=[], ipsec_connections=[], load_balancers=[], kubernetes_clusters=[],
    )


def _get_vcn_details(virtual_network_client, compartment_id: str) -> list:
    """Collects VCNs and all nested resources (subnets, security lists, route tables, NSGs, LPGs). Resolves gateway names in route rules."""
    vcns_data = []
    try:
        vcns_sdk = oci.pagination.list_call_get_all_results(
            virtual_network_client.list_vcns,
            compartment_id=compartment_id,
            retry_strategy=retry_strategy,
        ).data

        def get_port_range(rule):
            if rule.protocol == "6" and hasattr(rule, "tcp_options") and rule.tcp_options and rule.tcp_options.destination_port_range:
                p = rule.tcp_options.destination_port_range
                return str(p.min) if p.min == p.max else f"{p.min}-{p.max}"
            elif rule.protocol == "17" and hasattr(rule, "udp_options") and rule.udp_options and rule.udp_options.destination_port_range:
                p = rule.udp_options.destination_port_range
                return str(p.min) if p.min == p.max else f"{p.min}-{p.max}"
            elif rule.protocol == "1":
                return "ICMP"
            return "All"

        protocol_map = {"6": "TCP", "17": "UDP", "1": "ICMP", "all": "All"}

        for vcn in vcns_sdk:
            entity_map = {}
            try:
                for igw in oci.pagination.list_call_get_all_results(virtual_network_client.list_internet_gateways, compartment_id, vcn_id=vcn.id).data:
                    entity_map[igw.id] = f"{igw.display_name} (Internet Gateway)"
                for nat in oci.pagination.list_call_get_all_results(virtual_network_client.list_nat_gateways, compartment_id, vcn_id=vcn.id).data:
                    entity_map[nat.id] = f"{nat.display_name} (NAT Gateway)"
                for sgw in oci.pagination.list_call_get_all_results(virtual_network_client.list_service_gateways, compartment_id, vcn_id=vcn.id).data:
                    entity_map[sgw.id] = f"{sgw.display_name} (Service Gateway)"
                for lpg in oci.pagination.list_call_get_all_results(virtual_network_client.list_local_peering_gateways, compartment_id, vcn_id=vcn.id).data:
                    entity_map[lpg.id] = f"{lpg.display_name} (Local Peering Gateway)"
            except Exception as e:
                logging.warning(f"Could not map gateway names for VCN {vcn.id}: {e}")

            subnets = [
                {"id": s.id, "name": s.display_name, "display_name": s.display_name,
                 "cidr_block": s.cidr_block, "security_list_ids": s.security_list_ids,
                 "route_table_id": s.route_table_id}
                for s in oci.pagination.list_call_get_all_results(
                    virtual_network_client.list_subnets, compartment_id=compartment_id,
                    vcn_id=vcn.id, retry_strategy=retry_strategy,
                ).data
            ]

            security_lists = []
            for sl in oci.pagination.list_call_get_all_results(
                virtual_network_client.list_security_lists, compartment_id=compartment_id,
                vcn_id=vcn.id, retry_strategy=retry_strategy,
            ).data:
                rules = []
                for r in (sl.ingress_security_rules or []):
                    rules.append({"direction": "Ingress", "is_stateless": r.is_stateless or False,
                                  "protocol": protocol_map.get(r.protocol, r.protocol),
                                  "source": r.source, "destination": "N/A",
                                  "port_range": get_port_range(r), "description": r.description or "N/A"})
                for r in (sl.egress_security_rules or []):
                    rules.append({"direction": "Egress", "is_stateless": r.is_stateless or False,
                                  "protocol": protocol_map.get(r.protocol, r.protocol),
                                  "source": "N/A", "destination": r.destination,
                                  "port_range": get_port_range(r), "description": r.description or "N/A"})
                security_lists.append({"id": sl.id, "name": sl.display_name, "display_name": sl.display_name, "rules": rules})

            route_tables = []
            for rt in oci.pagination.list_call_get_all_results(
                virtual_network_client.list_route_tables, compartment_id=compartment_id,
                vcn_id=vcn.id, retry_strategy=retry_strategy,
            ).data:
                rules = [
                    {"target": entity_map.get(r.network_entity_id or "", r.network_entity_id or "N/A"),
                     "destination": r.destination or "N/A", "description": r.description or "N/A"}
                    for r in (rt.route_rules or [])
                ]
                route_tables.append({"id": rt.id, "name": rt.display_name, "display_name": rt.display_name, "rules": rules})

            vcns_data.append({
                "id": vcn.id, "name": vcn.display_name, "display_name": vcn.display_name,
                "cidr_block": vcn.cidr_block, "subnets": subnets,
                "security_lists": security_lists, "route_tables": route_tables,
                "network_security_groups": [], "lpgs": [],
            })

    except Exception as e:
        logging.error(f"Error collecting VCN details: {e}")

    return vcns_data

def get_waf_report_details(
    task, region: str, compartment_id: str, compartment_name: str,
    profile: Optional[Dict[str, Any]] = None,
) -> InfrastructureData:
    """
    Data collection orchestrator for the WAF report.

    Unlike the full infrastructure flow, WAF is the ONLY purpose of this task.
    A PermissionError (missing IAM policy) is therefore re-raised so that Celery
    marks the task as FAILURE and the frontend can display the exact IAM instruction
    to the user instead of silently returning an empty report.
    """
    task.update_state(
        state="PROGRESS",
        meta={"current": 0, "total": 100, "step_key": "progress.initializing_clients", "context": {}},
    )

    waf_client = get_client(WafClient, region, profile)
    load_balancer_client = get_client(oci.load_balancer.LoadBalancerClient, region, profile)
    virtual_network_client = get_client(oci.core.VirtualNetworkClient, region, profile)

    task.update_state(
        state="PROGRESS",
        meta={"current": 20, "total": 100, "step_key": "progress.listing_waf", "context": {}},
    )

    # PermissionError propagates intentionally here — the frontend will display the
    # exact IAM policy instruction stored in the exception message.
    waf_policies = _get_waf_policies(waf_client, compartment_id, region, compartment_name)

    task.update_state(
        state="PROGRESS",
        meta={"current": 50, "total": 100, "step_key": "progress.analyzing_waf_attachments", "context": {}},
    )

    firewalls_sdk = oci.pagination.list_call_get_all_results(
        waf_client.list_web_app_firewalls, compartment_id=compartment_id, retry_strategy=retry_strategy
    ).data
    active_firewalls = [fw for fw in firewalls_sdk if fw.lifecycle_state != "DELETED"]

    all_lbs_sdk = oci.pagination.list_call_get_all_results(
        load_balancer_client.list_load_balancers, compartment_id=compartment_id, retry_strategy=retry_strategy
    ).data

    task.update_state(
        state="PROGRESS",
        meta={"current": 75, "total": 100, "step_key": "progress.mapping_waf_network", "context": {}},
    )

    load_balancers: List[LoadBalancerData] = []

    for policy in waf_policies:
        policy_firewalls = [f for f in active_firewalls if f.web_app_firewall_policy_id == policy.id]
        policy_integrations = []

        for fw in policy_firewalls:
            firewall_data = WafFirewallData(
                id=fw.id, display_name=fw.display_name,
                backend_type=fw.backend_type, load_balancer_id=fw.load_balancer_id,
            )
            lb_data = None

            if fw.backend_type == "LOAD_BALANCER" and fw.load_balancer_id:
                lb_info = next((lb for lb in all_lbs_sdk if lb.id == fw.load_balancer_id), None)
                if lb_info:
                    lb_details = _safe_api_call(load_balancer_client.get_load_balancer, lb_info.id)
                    if lb_details:
                        ip_addresses = [LoadBalancerIpAddressData(ip_address=ip.ip_address, is_public=ip.is_public) for ip in lb_details.ip_addresses]
                        hostnames = [HostnameData(name=h.name) for h in lb_details.hostnames.values()]
                        listeners = [
                            ListenerData(
                                name=l.name,
                                protocol=(
                                    "HTTPS"
                                    if getattr(l, "ssl_configuration", None) is not None
                                    else l.protocol
                                ),
                                port=l.port,
                                default_backend_set_name=l.default_backend_set_name,
                                hostname_names=l.hostname_names if l.hostname_names else [],
                                ssl_certificate_ids=(
                                    list(getattr(l.ssl_configuration, "certificate_ids", None) or [])
                                    if getattr(l, "ssl_configuration", None) is not None else []
                                ),
                            )
                            for l in lb_details.listeners.values()
                        ]
                        backend_sets = []
                        for bs_sdk in lb_details.backend_sets.values():
                            hc_sdk = bs_sdk.health_checker
                            backend_sets.append(BackendSetData(
                                name=bs_sdk.name, policy=bs_sdk.policy,
                                health_checker=HealthCheckerData(protocol=hc_sdk.protocol, port=hc_sdk.port, url_path=hc_sdk.url_path),
                                backends=[BackendData(name=b.name, ip_address=b.ip_address, port=b.port, weight=b.weight) for b in bs_sdk.backends],
                            ))
                        lb_certs = []
                        if getattr(lb_details, "certificates", None):
                            for cert_name, cert_obj in lb_details.certificates.items():
                                not_after = "N/A"
                                if hasattr(cert_obj, "public_certificate") and cert_obj.public_certificate and hasattr(cert_obj.public_certificate, "not_valid_after"):
                                    not_after = str(cert_obj.public_certificate.not_valid_after)
                                lb_certs.append(LoadBalancerCertificateData(name=cert_name, valid_not_after=not_after))

                        lb_data = LoadBalancerData(
                            id=lb_details.id,
                            subnet_ids=list(lb_details.subnet_ids or []),
                            display_name=lb_details.display_name,
                            lifecycle_state=lb_details.lifecycle_state,
                            shape_name=lb_details.shape_name,
                            ip_addresses=ip_addresses, listeners=listeners,
                            backend_sets=backend_sets, hostnames=hostnames,
                            certificates=lb_certs,
                            waf_firewall_id=fw.id, waf_firewall_name=fw.display_name,
                            waf_policy_id=policy.id, waf_policy_name=policy.display_name,
                        )

                        if lb_details.subnet_ids and not policy.network_infrastructure:
                            subnet = _safe_api_call(virtual_network_client.get_subnet, lb_details.subnet_ids[0])
                            if subnet:
                                vcn = _safe_api_call(virtual_network_client.get_vcn, subnet.vcn_id)
                                policy.network_infrastructure = WafNetworkInfrastructure(
                                    vcn_name=vcn.display_name if vcn else "N/A",
                                    vcn_cidr=vcn.cidr_block if vcn else "N/A",
                                    subnet_name=subnet.display_name,
                                    subnet_cidr=subnet.cidr_block,
                                )

                        if not any(existing.display_name == lb_data.display_name for existing in load_balancers):
                            load_balancers.append(lb_data)

            integration = WafIntegrationData(
                firewall=firewall_data.dict(),
                load_balancer=lb_data.dict() if lb_data else None,
            )
            policy_integrations.append(integration)

        if policy_integrations:
            policy.integration = policy_integrations[0]
        policy.integrations = policy_integrations

    task.update_state(
        state="PROGRESS",
        meta={"current": 99, "total": 100, "step_key": "progress.assembling_report", "context": {}},
    )

    all_vcns = _get_vcn_details(virtual_network_client, compartment_id)

    # PermissionError propagates intentionally — WAF report certificates are
    # a primary deliverable; missing IAM is reported to the frontend.
    certs_mgmt_client = get_client(oci.certificates_management.CertificatesManagementClient, region, profile)
    all_certificates = _get_compartment_certificates(certs_mgmt_client, compartment_id)

    return InfrastructureData(
        instances=[],
        vcns=all_vcns,
        drgs=[],
        cpes=[],
        ipsec_connections=[],
        load_balancers=load_balancers,
        volume_groups=[],
        kubernetes_clusters=[],
        waf_policies=waf_policies,
        certificates=all_certificates,
    )