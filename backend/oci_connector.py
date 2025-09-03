# OCI DocGen
# Autor: Pedro Teixeira
# Data: 03 de Setembro de 2025
# Descrição: Módulo de conector que interage com o SDK da OCI para buscar dados da infraestrutura.

from typing import Any, Dict, List

import oci

# --- Mapeamento de Protocolos IANA ---
IANA_PROTOCOL_MAP = {
    "1": "ICMP",
    "6": "TCP",
    "17": "UDP",
    "58": "ICMPv6",
    "all": "Todos os Protocolos",
}

# --- Configuração Inicial do SDK da OCI ---
try:
    config = oci.config.from_file()
    tenancy_id = config["tenancy"]
except Exception as e:
    print(f"FATAL: Erro ao carregar a configuração da OCI a partir do arquivo: {e}")
    config = {}
    tenancy_id = None


# --- Funções Auxiliares (Helpers) ---

def get_client(client_class, region: str):
    """Cria uma instância de um cliente de serviço da OCI para uma região específica."""
    regional_config = config.copy()
    regional_config["region"] = region
    return client_class(regional_config)


def _safe_api_call(func, *args, **kwargs):
    """Encapsula uma chamada de API da OCI para tratar exceções comuns de forma robusta."""
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
    """Traduz um código de protocolo para seu nome comum usando IANA_PROTOCOL_MAP."""
    return IANA_PROTOCOL_MAP.get(str(protocol_code), str(protocol_code))


def _format_rule_ports(rule: Any) -> str:
    """Extrai e formata as portas de uma regra de segurança (TCP/UDP)."""
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
    """Busca o nome de exibição de uma entidade de rede (como Gateways) a partir de seu OCID."""
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
                return f"{type_name}: {display_attr}"
            return entity_id
        elif entity_type == "drgattachment":
            attachment = _safe_api_call(virtual_network_client.get_drg_attachment, entity_id)
            if attachment:
                drg = _safe_api_call(virtual_network_client.get_drg, attachment.drg_id)
                return f"DRG Attachment: {drg.display_name}" if drg else entity_id
    except (IndexError, AttributeError):
        pass
    return entity_id


def _get_source_dest_name(virtual_network_client, source_dest: str) -> str:
    """Traduz um OCID de um Network Security Group (NSG) para seu nome de exibição."""
    if not source_dest or not source_dest.startswith("ocid1.networksecuritygroup"):
        return source_dest
    nsg = _safe_api_call(virtual_network_client.get_network_security_group, source_dest)
    return nsg.display_name if nsg else source_dest


# --- Funções Públicas de Coleta de Dados ---

def list_regions() -> List[Dict[str, str]]:
    if not tenancy_id:
        raise ConnectionError("Tenancy ID não encontrado na configuração da OCI.")
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
    """
    # Busca instâncias com estado 'RUNNING' ou 'STOPPED'.
    """
    compute_client = get_client(oci.core.ComputeClient, region)
    if not compute_client:
        raise ConnectionError("Cliente de Computação OCI não pôde ser inicializado.")
    
    # Define os status que queremos buscar.
    valid_states = ["RUNNING", "STOPPED"]
    
    # Removemos o filtro da chamada de API para pegar mais estados e filtramos depois.
    all_instances = oci.pagination.list_call_get_all_results(
        compute_client.list_instances,
        compartment_id=compartment_id
    ).data
    
    # Filtra a lista para incluir apenas os estados desejados e retorna o status.
    filtered_instances = [
        {
            "id": i.id,
            "display_name": i.display_name,
            "status": i.lifecycle_state
        }
        for i in all_instances if i.lifecycle_state in valid_states
    ]
    return filtered_instances


def get_instance_details(region: str, instance_id: str) -> Dict[str, Any]:
    """Coleta um conjunto abrangente de detalhes para uma única instância."""
    compute_client = get_client(oci.core.ComputeClient, region)
    virtual_network_client = get_client(oci.core.VirtualNetworkClient, region)
    block_storage_client = get_client(oci.core.BlockstorageClient, region)
    if not all([compute_client, virtual_network_client, block_storage_client]):
        raise ConnectionError("Um ou mais clientes OCI não puderam ser inicializados.")
    instance = _safe_api_call(compute_client.get_instance, instance_id)
    if not instance:
        raise oci.exceptions.ServiceError(status=404, message=f"Instância {instance_id} não encontrada.")
    details = {"host_name": instance.display_name, "shape": instance.shape, "ocpus": str(int(instance.shape_config.ocpus)), "memory": str(int(instance.shape_config.memory_in_gbs)), "os_name": "N/A", "boot_volume_gb": "N/A", "private_ip": "N/A", "public_ip": "N/A", "backup_policy_name": "N/A", "block_volumes": [], "security_lists": [], "network_security_groups": [], "route_table": None}
    image = _safe_api_call(compute_client.get_image, instance.image_id)
    if image:
        details["os_name"] = f"{image.operating_system} {image.operating_system_version}"
    vnic_attachments = _safe_api_call(compute_client.list_vnic_attachments, instance.compartment_id, instance_id=instance_id)
    if vnic_attachments:
        vnic = _safe_api_call(virtual_network_client.get_vnic, vnic_attachments[0].vnic_id)
        if vnic:
            details["private_ip"] = vnic.private_ip or "N/A"
            details["public_ip"] = vnic.public_ip or "N/A"
            subnet = _safe_api_call(virtual_network_client.get_subnet, vnic.subnet_id)
            if subnet:
                for sl_id in subnet.security_list_ids:
                    sl = _safe_api_call(virtual_network_client.get_security_list, sl_id)
                    if sl:
                        rules = []
                        for r in sl.ingress_security_rules:
                            rules.append({"direction": "INGRESS", "protocol": _translate_protocol(r.protocol), "source_or_destination": r.source, "ports": _format_rule_ports(r), "description": r.description})
                        for r in sl.egress_security_rules:
                            rules.append({"direction": "EGRESS", "protocol": _translate_protocol(r.protocol), "source_or_destination": r.destination, "ports": _format_rule_ports(r), "description": r.description})
                        details["security_lists"].append({"name": sl.display_name, "rules": rules})
                rt = _safe_api_call(virtual_network_client.get_route_table, subnet.route_table_id)
                if rt:
                    rt_rules = [{"destination": r.destination, "target": get_network_entity_name(virtual_network_client, r.network_entity_id), "description": r.description} for r in rt.route_rules]
                    details["route_table"] = {"name": rt.display_name, "rules": rt_rules}
            for nsg_id in vnic.nsg_ids:
                nsg = _safe_api_call(virtual_network_client.get_network_security_group, nsg_id)
                if nsg:
                    rules = _safe_api_call(virtual_network_client.list_network_security_group_security_rules, nsg_id)
                    nsg_rules = []
                    if rules:
                        for r in rules:
                            source_dest = r.source if r.direction == 'INGRESS' else r.destination
                            nsg_rules.append({"direction": r.direction, "protocol": _translate_protocol(r.protocol), "source_or_destination": _get_source_dest_name(virtual_network_client, source_dest), "ports": _format_rule_ports(r), "description": r.description})
                    details["network_security_groups"].append({"name": nsg.display_name, "rules": nsg_rules})
    boot_vol_attachments = _safe_api_call(compute_client.list_boot_volume_attachments, instance.availability_domain, instance.compartment_id, instance_id=instance_id)
    if boot_vol_attachments:
        boot_vol = _safe_api_call(block_storage_client.get_boot_volume, boot_vol_attachments[0].boot_volume_id)
        if boot_vol:
            details["boot_volume_gb"] = str(int(boot_vol.size_in_gbs))
            assignment = _safe_api_call(block_storage_client.get_volume_backup_policy_asset_assignment, boot_vol.id)
            if assignment:
                policy = _safe_api_call(block_storage_client.get_volume_backup_policy, assignment[0].policy_id)
                details["backup_policy_name"] = policy.display_name if policy else "Política não encontrada"
            else:
                details["backup_policy_name"] = "Nenhuma política associada"
    attachments = _safe_api_call(compute_client.list_volume_attachments, instance.compartment_id, instance_id=instance_id)
    if attachments:
        for att in attachments:
            if att.lifecycle_state == 'ATTACHED' and att.attachment_type != 'iscsi':
                vol = _safe_api_call(block_storage_client.get_volume, att.volume_id)
                if vol:
                    details["block_volumes"].append({"display_name": vol.display_name, "size_in_gbs": vol.size_in_gbs})
    return details

