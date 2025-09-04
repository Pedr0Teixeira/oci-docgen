# OCI DocGen
# Autor: Pedro Teixeira
# Data: 04 de Setembro de 2025 (Fase 3: Geração de Documento Final)
# Descrição: Módulo responsável por gerar documentos .docx detalhados.

import os
import re
from datetime import datetime
from io import BytesIO
from typing import List, Optional

import docx
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.shared import Inches, Pt

from schemas import InfrastructureData, InstanceData

# --- Funções Auxiliares para Geração de Seções ---

def add_hyperlink(paragraph, text, url):
    """Adiciona um hyperlink a um parágrafo."""
    part = paragraph.part
    r_id = part.relate_to(url, RT.HYPERLINK, is_external=True)
    hyperlink = docx.oxml.shared.OxmlElement('w:hyperlink')
    hyperlink.set(docx.oxml.shared.qn('r:id'), r_id)
    new_run = docx.oxml.shared.OxmlElement('w:r')
    rPr = docx.oxml.shared.OxmlElement('w:rPr')
    rStyle = docx.oxml.shared.OxmlElement('w:rStyle')
    rStyle.set(docx.oxml.shared.qn('w:val'), 'Hyperlink')
    rPr.append(rStyle)
    new_run.append(rPr)
    new_run.text = text
    hyperlink.append(new_run)
    paragraph._p.append(hyperlink)

def _add_instances_table(document, instances: List[InstanceData]):
    """Adiciona a tabela de resumo das instâncias ao documento."""
    if not instances: return
    document.add_paragraph("A tabela a seguir detalha as configurações das instâncias computacionais no escopo.")
    host_table = document.add_table(rows=1, cols=8, style='Table Grid')
    host_table.autofit = True
    headers = ['HOST', 'SHAPE', 'OCPU', 'MEMÓRIA (GB)', 'BOOT VOL (GB)', 'S.O.', 'IP PRIVADO', 'IP PÚBLICO']
    for i, header in enumerate(headers):
        cell = host_table.cell(0, i)
        cell.text = header
        cell.paragraphs[0].runs[0].font.bold = True
    for data in instances:
        row_cells = host_table.add_row().cells
        row_cells[0].text = data.host_name
        row_cells[1].text = data.shape
        row_cells[2].text = str(data.ocpus)
        row_cells[3].text = str(data.memory)
        row_cells[4].text = str(data.boot_volume_gb)
        row_cells[5].text = data.os_name
        row_cells[6].text = data.private_ip
        row_cells[7].text = data.public_ip or "N/A"
    document.add_paragraph()

def _add_volume_and_backup_section(document, instances: List[InstanceData]):
    """
    Adiciona as seções de gerenciamento de volumes e políticas de backup.
    """
    if not instances: return

    all_block_volumes = [vol for data in instances for vol in data.block_volumes]
    if all_block_volumes:
        document.add_paragraph("Block Volumes Anexados", style='Heading 3')
        bv_table = document.add_table(rows=1, cols=3, style='Table Grid')
        headers = ['Host de Origem', 'Nome do Volume', 'Tamanho (GB)']
        for i, header in enumerate(headers):
            bv_table.cell(0, i).text = header; bv_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for data in instances:
            for vol in data.block_volumes:
                cells = bv_table.add_row().cells; cells[0].text = data.host_name; cells[1].text = vol.display_name; cells[2].text = str(int(vol.size_in_gbs))
        document.add_paragraph()

    document.add_paragraph("Políticas de Backup", style='Heading 3')
    document.add_paragraph("Backup de Boot Volume", style='Heading 4')
    boot_backup_policies = {data.backup_policy_name for data in instances}
    if len(boot_backup_policies) == 1:
        policy_name = boot_backup_policies.pop()
        document.add_paragraph(f"Todas as instâncias utilizam a política de backup: {policy_name}.")
    else:
        document.add_paragraph("As instâncias possuem diferentes políticas de backup associadas aos seus Boot Volumes:")
        for data in instances:
            p = document.add_paragraph(style='List Bullet'); p.add_run(f"Host {data.host_name}: ").bold = True; p.add_run(data.backup_policy_name)
    
    if all_block_volumes:
        document.add_paragraph("Backup de Block Volumes Anexados", style='Heading 4')
        bvs_with_backup = [(data.host_name, vol) for data in instances for vol in data.block_volumes if vol.backup_policy_name != "Nenhuma política associada"]
        if bvs_with_backup:
            bv_backup_table = document.add_table(rows=1, cols=3, style='Table Grid')
            headers = ['Host de Origem', 'Nome do Volume', 'Política de Backup Aplicada']
            for i, header in enumerate(headers):
                bv_backup_table.cell(0, i).text = header; bv_backup_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for host_name, vol in bvs_with_backup:
                cells = bv_backup_table.add_row().cells; cells[0].text = host_name; cells[1].text = vol.display_name; cells[2].text = vol.backup_policy_name
        else:
            document.add_paragraph("Nenhuma política de backup foi encontrada para Block Volumes adicionais.")
    
    uses_ccm_7d = any(inst.backup_policy_name == "CCM-7D" or any(bv.backup_policy_name == "CCM-7D" for bv in inst.block_volumes) for inst in instances)
    if uses_ccm_7d:
        document.add_paragraph()
        document.add_paragraph("Detalhes da Política de Backup CCM-7D", style='Heading 4')
        document.add_paragraph("O Backup da CCM-7D está configurado por meio de uma Backup Policy aplicada ao volume, garantindo a proteção contínua dos dados.")
        document.add_paragraph("A política atual define um agendamento diário do tipo Incremental, executado às 01:00 (horário regional). Esse tipo de backup copia apenas as alterações realizadas desde o último backup, otimizando tempo de execução e uso de espaço de armazenamento.")
        document.add_paragraph("Os backups gerados possuem retenção de 7 dias, permitindo a restauração de dados em pontos específicos dentro desse período.")
        document.add_paragraph("Essa política garante que, em caso de falhas, seja possível recuperar o volume rapidamente, minimizando impacto e perda de informações.")

    document.add_paragraph()

def _add_vcn_details_section(document, infra_data: InfrastructureData):
    """Adiciona as seções de VCN, Subnets, Listas de Segurança, etc."""
    if not infra_data.vcns:
        document.add_paragraph("Nenhuma Virtual Cloud Network foi encontrada neste compartimento.")
        return

    for vcn in infra_data.vcns:
        document.add_paragraph(f"VCN: {vcn.display_name}", style='Heading 3')
        document.add_paragraph(f"CIDR Block: {vcn.cidr_block}")

        document.add_paragraph("Subnets", style='Heading 4')
        if vcn.subnets:
            subnet_table = document.add_table(rows=1, cols=2, style='Table Grid'); headers = ['Nome da Subnet', 'CIDR Block']
            for i, h in enumerate(headers): subnet_table.cell(0, i).text = h; subnet_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for subnet in sorted(vcn.subnets, key=lambda s: s.display_name):
                cells = subnet_table.add_row().cells; cells[0].text = subnet.display_name; cells[1].text = subnet.cidr_block
        else: document.add_paragraph("Nenhuma subnet encontrada.")
        document.add_paragraph()

        document.add_paragraph("Security Lists", style='Heading 4')
        if vcn.security_lists:
            headers = ["Direção", "Protocolo", "Portas", "Origem/Destino", "Descrição"]
            for sl in sorted(vcn.security_lists, key=lambda s: s.name):
                document.add_paragraph(f"Regras da Security List: {sl.name}", style='Heading 5')
                table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
                for rule in sl.rules:
                    cells = table.add_row().cells; cells[0].text = rule.direction; cells[1].text = rule.protocol; cells[2].text = rule.ports or "Todas"; cells[3].text = rule.source_or_destination or "N/A"; cells[4].text = rule.description or ''
                document.add_paragraph()
        else: document.add_paragraph("Nenhuma Security List encontrada.")

        document.add_paragraph("Route Tables", style='Heading 4')
        if vcn.route_tables:
            headers = ["Destino", "Alvo (Target)", "Descrição"]
            for rt in sorted(vcn.route_tables, key=lambda r: r.name):
                document.add_paragraph(f"Regras da Route Table: {rt.name}", style='Heading 5')
                table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
                for rule in rt.rules:
                    cells = table.add_row().cells; cells[0].text = rule.destination; cells[1].text = rule.target; cells[2].text = rule.description or ''
                document.add_paragraph()
        else: document.add_paragraph("Nenhuma Route Table encontrada.")

        document.add_paragraph("Network Security Groups (NSGs)", style='Heading 4')
        if vcn.network_security_groups:
            headers = ["Direção", "Protocolo", "Portas", "Origem/Destino", "Descrição"]
            for nsg in sorted(vcn.network_security_groups, key=lambda n: n.name):
                document.add_paragraph(f"Regras do NSG: {nsg.name}", style='Heading 5')
                table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
                for rule in nsg.rules:
                    cells = table.add_row().cells; cells[0].text = rule.direction; cells[1].text = rule.protocol; cells[2].text = rule.ports or "Todas"; cells[3].text = rule.source_or_destination or "N/A"; cells[4].text = rule.description or ''
                document.add_paragraph()
        else: document.add_paragraph("Nenhum NSG encontrado.")
        
        document.add_paragraph("Local Peering Gateways (LPGs)", style='Heading 4')
        if vcn.lpgs:
            headers = ['Nome', 'Status do Peering', 'Route Table', 'CIDR Anunciado', 'Cross-Tenancy']
            table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
            for i, h in enumerate(headers):
                table.cell(0, i).text = h
                table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for lpg in vcn.lpgs:
                cells = table.add_row().cells
                cells[0].text = lpg.display_name
                cells[1].text = lpg.peering_status_details or lpg.peering_status
                cells[2].text = lpg.route_table_name
                cells[3].text = lpg.peer_advertised_cidr or "N/A"
                cells[4].text = "Sim" if lpg.is_cross_tenancy_peering else "Não"
        else:
            document.add_paragraph("Nenhum Local Peering Gateway encontrado nesta VCN.")
        document.add_paragraph()

def _add_load_balancers_section(document, infra_data: InfrastructureData):
    """Adiciona a nova seção de Load Balancers ao documento."""
    if not infra_data.load_balancers:
        return

    for lb in infra_data.load_balancers:
        document.add_paragraph(f"Load Balancer: {lb.display_name}", style='Heading 3')
        
        # Tabela de Informações Gerais
        info_table = document.add_table(rows=1, cols=2, style='Table Grid')
        info_table.cell(0, 0).text = "Atributo"
        info_table.cell(0, 0).paragraphs[0].runs[0].font.bold = True
        info_table.cell(0, 1).text = "Valor"
        info_table.cell(0, 1).paragraphs[0].runs[0].font.bold = True
        
        info_table.add_row().cells[0].text = "Nome"
        info_table.add_row().cells[0].text = "Shape"
        info_table.add_row().cells[0].text = "Estado"
        info_table.add_row().cells[0].text = "Endereços IP"
        info_table.cell(1, 1).text = lb.display_name
        info_table.cell(2, 1).text = lb.shape_name
        info_table.cell(3, 1).text = lb.lifecycle_state
        ips_str = "\n".join([f"{ip.ip_address} ({'Público' if ip.is_public else 'Privado'})" for ip in lb.ip_addresses])
        info_table.cell(4, 1).text = ips_str
        document.add_paragraph()

        # Tabela de Listeners
        document.add_paragraph("Listeners", style='Heading 4')
        if lb.listeners:
            headers = ['Nome', 'Protocolo', 'Porta', 'Backend Set Padrão']
            table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
            for i, h in enumerate(headers):
                table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for listener in lb.listeners:
                cells = table.add_row().cells
                cells[0].text = listener.name
                cells[1].text = listener.protocol
                cells[2].text = str(listener.port)
                cells[3].text = listener.default_backend_set_name
        else:
            document.add_paragraph("Nenhum Listener configurado.")
        document.add_paragraph()

        # Seção de Backend Sets
        document.add_paragraph("Backend Sets", style='Heading 4')
        if lb.backend_sets:
            for bs in lb.backend_sets:
                document.add_paragraph(f"Configuração do Backend Set: {bs.name}", style='Heading 5')
                p = document.add_paragraph()
                p.add_run("Política de Balanceamento: ").bold = True
                p.add_run(f"{bs.policy}\n")
                p.add_run("Health Checker: ").bold = True
                p.add_run(f"{bs.health_checker.protocol} na porta {bs.health_checker.port} (Path: {bs.health_checker.url_path})")
                
                if bs.backends:
                    document.add_paragraph("Backends:", style='List Bullet')
                    headers = ['Nome do Backend', 'IP', 'Porta', 'Peso']
                    table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                    for i, h in enumerate(headers):
                        table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
                    for backend in bs.backends:
                        cells = table.add_row().cells
                        cells[0].text = backend.name
                        cells[1].text = backend.ip_address
                        cells[2].text = str(backend.port)
                        cells[3].text = str(backend.weight)
                else:
                    document.add_paragraph("Nenhum backend configurado neste set.")
                document.add_paragraph()
        else:
            document.add_paragraph("Nenhum Backend Set configurado.")
        document.add_paragraph()

def _add_connectivity_section(document, infra_data: InfrastructureData):
    """Adiciona as seções de conectividade DRG, CPE e a tabela sumarizada de VPN."""
    document.add_paragraph("Dynamic Routing Gateways (DRGs)", style='Heading 3')
    if infra_data.drgs:
        for drg in infra_data.drgs:
            document.add_paragraph(f"DRG: {drg.display_name}", style='Heading 4')
            
            document.add_paragraph("Anexos", style='Heading 5')
            if drg.attachments:
                headers = ['Nome do Anexo', 'Tipo', 'DRG Route Table']
                table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                for i, h in enumerate(headers):
                    table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
                for attachment in drg.attachments:
                    cells = table.add_row().cells
                    cells[0].text = attachment.display_name
                    cells[1].text = attachment.network_type
                    cells[2].text = attachment.route_table_name or "N/A"
            else:
                document.add_paragraph("Nenhum anexo encontrado para este DRG.")
            document.add_paragraph()

            document.add_paragraph("Remote Peering Connections (RPCs)", style='Heading 5')
            if drg.rpcs:
                headers = ['Nome', 'Status', 'Status do Peering']
                table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                for i, h in enumerate(headers):
                    table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
                for rpc in drg.rpcs:
                    status_text = rpc.peering_status_details or rpc.peering_status
                    if rpc.peering_status == 'NEW':
                        status_text = 'New (not peered)'
                    
                    cells = table.add_row().cells
                    cells[0].text = rpc.display_name
                    cells[1].text = rpc.lifecycle_state
                    cells[2].text = status_text
            else:
                document.add_paragraph("Nenhuma Remote Peering Connection encontrada para este DRG.")
            document.add_paragraph()
    else:
        document.add_paragraph("Nenhum DRG encontrado.")
    document.add_paragraph()

    document.add_paragraph("Customer-Premises Equipment (CPEs)", style='Heading 3')
    if infra_data.cpes:
        cpe_table = document.add_table(rows=1, cols=3, style='Table Grid')
        headers = ['Nome do CPE', 'Endereço IP', 'Fabricante']
        for i, header_text in enumerate(headers):
            cpe_table.cell(0, i).text = header_text; cpe_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for cpe in infra_data.cpes:
            cells = cpe_table.add_row().cells; cells[0].text = cpe.display_name; cells[1].text = cpe.ip_address; cells[2].text = cpe.vendor or "N/A"
    else:
        document.add_paragraph("Nenhum CPE encontrado.")
    document.add_paragraph()

    document.add_paragraph("Conexões VPN IPSec", style='Heading 3')
    if infra_data.ipsec_connections:
        cpe_map = {cpe.id: cpe.display_name for cpe in infra_data.cpes}; drg_map = {drg.id: drg.display_name for drg in infra_data.drgs}
        
        document.add_paragraph("Sumário de Conexões VPN", style='Heading 4')
        vpn_summary_table = document.add_table(rows=1, cols=6, style='Table Grid')
        headers = ['Nome da Conexão', 'Status', 'CPE Associado', 'DRG Associado', 'Rotas Estáticas', 'Túneis Configurados']
        for i, h in enumerate(headers): vpn_summary_table.cell(0, i).text = h; vpn_summary_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for ipsec in infra_data.ipsec_connections:
            cells = vpn_summary_table.add_row().cells
            cells[0].text = ipsec.display_name; cells[1].text = ipsec.status; cells[2].text = cpe_map.get(ipsec.cpe_id, ipsec.cpe_id)
            cells[3].text = drg_map.get(ipsec.drg_id, ipsec.drg_id); cells[4].text = ', '.join(ipsec.static_routes) or 'Nenhuma'; cells[5].text = str(len(ipsec.tunnels))
        document.add_paragraph()

        document.add_paragraph("Detalhes das Conexões VPN", style='Heading 4')
        for ipsec in infra_data.ipsec_connections:
            document.add_paragraph(f"Configuração da Conexão: {ipsec.display_name}", style='Heading 5')
            
            document.add_paragraph("Túneis", style='Heading 5')
            if not ipsec.tunnels:
                document.add_paragraph("Nenhum túnel encontrado para esta conexão.")
                continue

            for tunnel in ipsec.tunnels:
                p = document.add_paragraph(); p.add_run(f"Túnel: {tunnel.display_name} ").bold = True; p.add_run(f"(Status: {tunnel.status})")
                
                info_table = document.add_table(rows=4, cols=2, style='Table Grid')
                info_table.cell(0, 0).text = "IP Oracle"; info_table.cell(0, 1).text = tunnel.vpn_oracle_ip or "N/A"; info_table.cell(1, 0).text = "IP do CPE"; info_table.cell(1, 1).text = tunnel.cpe_ip or "N/A"
                info_table.cell(2, 0).text = "Roteamento"; info_table.cell(2, 1).text = tunnel.routing_type; info_table.cell(3, 0).text = "Versão IKE"; info_table.cell(3, 1).text = tunnel.ike_version
                document.add_paragraph()

                p1_table = document.add_table(rows=4, cols=2, style='Table Grid'); p1 = tunnel.phase_one_details
                p1_table.cell(0, 0).text = "Fase 1 - Autenticação"; p1_table.cell(0, 1).text = p1.authentication_algorithm
                p1_table.cell(1, 0).text = "Fase 1 - Criptografia"; p1_table.cell(1, 1).text = p1.encryption_algorithm
                p1_table.cell(2, 0).text = "Fase 1 - Grupo DH"; p1_table.cell(2, 1).text = p1.dh_group
                p1_table.cell(3, 0).text = "Fase 1 - Lifetime (s)"; p1_table.cell(3, 1).text = str(p1.lifetime_in_seconds)
                document.add_paragraph()

                p2_table = document.add_table(rows=3, cols=2, style='Table Grid'); p2 = tunnel.phase_two_details
                p2_table.cell(0, 0).text = "Fase 2 - Autenticação"; p2_table.cell(0, 1).text = p2.authentication_algorithm or "N/A"
                p2_table.cell(1, 0).text = "Fase 2 - Criptografia"; p2_table.cell(1, 1).text = p2.encryption_algorithm
                p2_table.cell(2, 0).text = "Fase 2 - Lifetime (s)"; p2_table.cell(2, 1).text = str(p2.lifetime_in_seconds)
                
                if tunnel.validation_status == 'Fora da recomendação Oracle' and tunnel.validation_details:
                    p = document.add_paragraph(); p.add_run("Nota de Configuração: ").bold = True
                    p.add_run("Os parâmetros de criptografia customizados para este túnel divergem das recomendações padrão da Oracle para máxima compatibilidade e segurança. ")
                    link_p = document.add_paragraph(); add_hyperlink(link_p, "Para referência, consulte a documentação oficial.", tunnel.validation_details)
                document.add_paragraph()
    else: document.add_paragraph("Nenhuma Conexão VPN IPSec encontrada.")

# --- Função Principal de Geração ---

def generate_documentation(
    doc_type: str, infra_data: InfrastructureData,
    architecture_image_bytes_list: Optional[List[bytes]] = None,
    antivirus_image_bytes_list: Optional[List[bytes]] = None
) -> str:
    document = Document(); style = document.styles['Normal']; font = style.font; font.name = 'Calibri'; font.size = Pt(11)
    instances = sorted(infra_data.instances, key=lambda x: x.host_name)
    if not instances: raise ValueError("Não é possível gerar o documento sem dados de instância para identificar o cliente.")
    
    client_name = instances[0].compartment_name.replace("SERVERS-", "")
    safe_client_name = re.sub(r'[\\/*?:"<>|]', "", client_name)

    doc_title = "Documentação de Infraestrutura" if doc_type == 'full_infra' else "Documentação de Novo Host"
    document.add_heading(doc_title, level=0).alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph(f"Cliente: {client_name}\nData de Geração: {datetime.now().strftime('%d/%m/%Y')}")
    document.add_page_break()

    topic_number = 1

    if architecture_image_bytes_list:
        document.add_heading(f'{topic_number}. Desenho da Arquitetura', level=2); topic_number += 1
        for image_bytes in architecture_image_bytes_list:
            try: document.add_picture(BytesIO(image_bytes), width=Inches(6.0)); document.add_paragraph()
            except Exception as e: document.add_paragraph(f"Erro ao inserir imagem: {e}")

    document.add_heading(f'{topic_number}. Instâncias Computacionais', level=2); topic_number += 1
    _add_instances_table(document, instances)

    document.add_heading(f'{topic_number}. Gerenciamento de Volumes e Backup', level=2); topic_number += 1
    _add_volume_and_backup_section(document, instances)

    if doc_type == 'full_infra':
        document.add_heading(f'{topic_number}. Topologia de Rede Virtual (VCN)', level=2); topic_number += 1
        _add_vcn_details_section(document, infra_data)
        document.add_heading(f'{topic_number}. Conectividade Externa e Roteamento', level=2); topic_number += 1
        _add_connectivity_section(document, infra_data)
    
    if doc_type == 'new_host':
        document.add_heading(f'{topic_number}. Conectividade de Rede da(s) Instância(s)', level=2); topic_number += 1
        sl_map, nsg_map, rt_map = {}, {}, {}
        for data in instances:
            for sl in data.security_lists: sl_map.setdefault(sl.name, {'rules': sl.rules, 'hosts': []})['hosts'].append(data.host_name)
            for nsg in data.network_security_groups: nsg_map.setdefault(nsg.name, {'rules': nsg.rules, 'hosts': []})['hosts'].append(data.host_name)
            if data.route_table: rt_map.setdefault(data.route_table.name, {'rules': data.route_table.rules, 'hosts': []})['hosts'].append(data.host_name)
        
        headers = ["Direção", "Protocolo", "Portas", "Origem/Destino", "Descrição"]
        document.add_paragraph("Security Lists", style='Heading 3')
        for name, info in sorted(sl_map.items()):
            p = document.add_paragraph(); p.add_run(f"Regras da Security List: {name}").bold = True
            table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
            for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for rule in info['rules']:
                cells=table.add_row().cells; cells[0].text=rule.direction; cells[1].text=rule.protocol; cells[2].text=rule.ports or "Todas"; cells[3].text=rule.source_or_destination or "N/A"; cells[4].text=rule.description or ''
            document.add_paragraph()

        document.add_paragraph("Network Security Groups", style='Heading 3')
        for name, info in sorted(nsg_map.items()):
            p = document.add_paragraph(); p.add_run(f"Regras do NSG: {name}").bold = True
            table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
            for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for rule in info['rules']:
                cells=table.add_row().cells; cells[0].text=rule.direction; cells[1].text=rule.protocol; cells[2].text=rule.ports or "Todas"; cells[3].text=rule.source_or_destination or "N/A"; cells[4].text=rule.description or ''
            document.add_paragraph()

        document.add_paragraph("Route Tables", style='Heading 3')
        for name, info in sorted(rt_map.items()):
            p = document.add_paragraph(); p.add_run(f"Regras da Route Table: {name}").bold = True
            table = document.add_table(rows=1, cols=3, style='Table Grid')
            headers_rt = ["Destino", "Alvo", "Descrição"]
            for i, h in enumerate(headers_rt): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for rule in info['rules']:
                cells=table.add_row().cells; cells[0].text=rule.destination; cells[1].text=rule.target; cells[2].text=rule.description or ''
            document.add_paragraph()

    if antivirus_image_bytes_list:
        document.add_heading(f'{topic_number}. Configuração do Antivírus', level=2); topic_number += 1
        for image_bytes in antivirus_image_bytes_list:
            try: document.add_picture(BytesIO(image_bytes), width=Inches(6.0)); document.add_paragraph()
            except Exception as e: document.add_paragraph(f"Erro ao inserir imagem: {e}")

    output_dir = "generated_docs"; os.makedirs(output_dir, exist_ok=True)
    doc_identifier = "Infraestrutura" if doc_type == 'full_infra' else "NovoHost"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_name = f"Doc_{doc_identifier}_{safe_client_name}_{timestamp}.docx"
    output_path = os.path.join(output_dir, file_name)
    document.save(output_path)
    return output_path