# OCI DocGen
# Autor: Pedro Teixeira
# Data: 01 de Setembro de 2025
# Descrição: Define os modelos de dados (schemas) Pydantic para validação e serialização de dados na API.

from typing import List, Optional

from pydantic import BaseModel

# Estes modelos garantem que os dados trocados entre o frontend e o backend
# tenham uma estrutura consistente e tipos de dados corretos.


class BlockVolume(BaseModel):
    """Representa um Block Volume anexado a uma instância."""
    display_name: str
    size_in_gbs: float


class SecurityRule(BaseModel):
    """Representa uma regra de segurança (Ingress/Egress) de uma Security List ou NSG."""
    direction: str
    protocol: str
    source_or_destination: Optional[str] = "N/A"
    description: Optional[str] = None


class RouteRule(BaseModel):
    """Representa uma regra de uma Route Table."""
    destination: str
    target: str
    description: Optional[str] = None


class SecurityList(BaseModel):
    """Representa uma Security List e suas regras associadas."""
    name: str
    rules: List[SecurityRule]


class NetworkSecurityGroup(BaseModel):
    """Representa um Network Security Group (NSG) e suas regras."""
    name: str
    rules: List[SecurityRule]


class RouteTable(BaseModel):
    """Representa uma Route Table e suas regras de roteamento."""
    name: str
    rules: List[RouteRule]


class InstanceData(BaseModel):
    """
    Modelo principal que agrega todos os detalhes coletados de uma única instância da OCI.
    Esta é a estrutura de dados principal usada em toda a aplicação.
    """
    host_name: str
    shape: str
    ocpus: str
    memory: str
    os_name: str
    boot_volume_gb: str
    private_ip: str
    public_ip: Optional[str] = "N/A"  # Public IP pode não existir
    backup_policy_name: str
    block_volumes: List[BlockVolume]
    security_lists: List[SecurityList]
    network_security_groups: List[NetworkSecurityGroup]
    route_table: Optional[RouteTable] = None
    compartment_name: str  # Adicionado para saber o contexto do cliente.


class MultiDocRequest(BaseModel):
    """
    Modelo para o corpo da requisição de geração de documento,
    permitindo que os dados de múltiplas instâncias sejam enviados de uma só vez.
    """
    instances_data: List[InstanceData]