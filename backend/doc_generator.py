# OCI DocGen
# Autor: Pedro Teixeira
# Data: 09 de Setembro de 2025
# Descrição: Módulo responsável por gerar documentos .docx detalhados com sumário clicável.

import os
import re
from datetime import datetime
from io import BytesIO
from typing import List, Optional, Tuple, Dict

import docx
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.shared import OxmlElement, qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.shared import Inches, Pt
from docx.text.paragraph import Paragraph

from schemas import InfrastructureData, InstanceData

# --- Funções Auxiliares para Geração de Sumário e Links Internos ---

def _define_toc_styles(document: Document):
    """
    Cria e configura os estilos 'TOC 1', 'TOC 2' e 'TOC 3' com a indentação correta.
    """
    styles = document.styles

    if 'TOC 1' not in styles:
        style = styles.add_style('TOC 1', WD_STYLE_TYPE.PARAGRAPH)
        style.base_style = styles['Normal']
        font = style.font; font.name = 'Calibri'; font.size = Pt(11)
        p_format = style.paragraph_format; p_format.left_indent = Inches(0); p_format.space_after = Pt(4)

    if 'TOC 2' not in styles:
        style = styles.add_style('TOC 2', WD_STYLE_TYPE.PARAGRAPH)
        style.base_style = styles['Normal']
        font = style.font; font.name = 'Calibri'; font.size = Pt(11)
        p_format = style.paragraph_format; p_format.left_indent = Inches(0.25); p_format.space_after = Pt(4)
        
    if 'TOC 3' not in styles:
        style = styles.add_style('TOC 3', WD_STYLE_TYPE.PARAGRAPH)
        style.base_style = styles['Normal']
        font = style.font; font.name = 'Calibri'; font.size = Pt(11)
        p_format = style.paragraph_format; p_format.left_indent = Inches(0.5); p_format.space_after = Pt(4)

def add_hyperlink(paragraph: Paragraph, text: str, url: str):
    """
    Adiciona um hyperlink EXTERNO funcional a um parágrafo.
    (Esta função permanece para referência futura, mas não é usada na lógica atual)
    """
    part = paragraph.part
    r_id = part.relate_to(url, RT.HYPERLINK, is_external=True)

    hyperlink = OxmlElement('w:hyperlink')
    hyperlink.set(qn('r:id'), r_id)

    new_run = OxmlElement('w:r')
    rPr = OxmlElement('w:rPr')

    r_style = OxmlElement('w:rStyle')
    r_style.set(qn('w:val'), 'Hyperlink')
    rPr.append(r_style)
    
    new_run.append(rPr)
    new_run.text = text
    hyperlink.append(new_run)
    paragraph._p.append(hyperlink)

def _add_bookmark(paragraph: Paragraph, bookmark_name: str):
    """Adiciona um marcador (bookmark) a um parágrafo para links internos."""
    run = paragraph.runs[0] if paragraph.runs else paragraph.add_run()
    bookmark_id = str(abs(hash(bookmark_name)) % (10**8))
    start_tag = OxmlElement('w:bookmarkStart')
    start_tag.set(qn('w:id'), bookmark_id); start_tag.set(qn('w:name'), bookmark_name)
    run._r.addprevious(start_tag)
    end_tag = OxmlElement('w:bookmarkEnd'); end_tag.set(qn('w:id'), bookmark_id)
    run._r.addnext(end_tag)

def _add_internal_hyperlink(paragraph: Paragraph, text: str, anchor_name: str):
    """Adiciona um hyperlink INTERNO (para um bookmark) a um parágrafo."""
    hyperlink = OxmlElement('w:hyperlink')
    hyperlink.set(qn('w:anchor'), anchor_name)
    sub_run = OxmlElement('w:r'); rPr = OxmlElement('w:rPr'); rStyle = OxmlElement('w:rStyle')
    rStyle.set(qn('w:val'), 'Hyperlink'); rPr.append(rStyle); sub_run.append(rPr)
    text_element = OxmlElement('w:t'); text_element.text = text; sub_run.append(text_element)
    hyperlink.append(sub_run)
    paragraph._p.append(hyperlink)

def _add_and_bookmark_heading(document: Document, text: str, level: int, toc_list: list, counters: Dict[int, int]):
    """
    Adiciona um título com numeração hierárquica, cria um bookmark e o adiciona à lista do sumário.
    """
    counters[level] += 1
    for deeper_level in range(level + 1, 5): 
        if deeper_level in counters:
            counters[deeper_level] = 0

    number_parts = []
    for i in range(2, level + 1):
        number_parts.append(str(counters.get(i, 0)))
    number_str = ".".join(number_parts)
    
    final_text = f"{number_str} {text}"
    
    heading_style = f'Heading {level}'
    heading = document.add_paragraph(final_text, style=heading_style)
    
    clean_text = re.sub(r'[^A-Za-z0-9_]', '', final_text.replace(' ', '_'))
    bookmark_name = f"_Toc_{clean_text}_{len(toc_list)}"
    _add_bookmark(heading, bookmark_name)
    toc_list.append((final_text, bookmark_name, level))
    return heading

# --- Funções de Geração de Seções ---

def _add_instances_table(document: Document, instances: List[InstanceData]):
    """Adiciona a tabela de resumo das instâncias ao documento."""
    if not instances: return
    document.add_paragraph("A tabela a seguir detalha as configurações das instâncias computacionais no escopo.")
    table = document.add_table(rows=1, cols=8, style='Table Grid'); table.autofit = True
    headers = ['HOST', 'SHAPE', 'OCPU', 'MEMÓRIA (GB)', 'BOOT VOL (GB)', 'S.O.', 'IP PRIVADO', 'IP PÚBLICO']
    for i, header in enumerate(headers):
        cell = table.cell(0, i); cell.text = header; cell.paragraphs[0].runs[0].font.bold = True
    for data in instances:
        cells = table.add_row().cells
        cells[0].text = data.host_name; cells[1].text = data.shape; cells[2].text = str(data.ocpus)
        cells[3].text = str(data.memory); cells[4].text = str(data.boot_volume_gb); cells[5].text = data.os_name
        cells[6].text = data.private_ip; cells[7].text = data.public_ip or "N/A"
    document.add_paragraph()

def _add_volume_and_backup_section(document: Document, instances: List[InstanceData], toc_list: list, counters: Dict[int, int]):
    """Adiciona as seções de gerenciamento de volumes e políticas de backup."""
    if not instances: return
    all_block_volumes = [vol for data in instances for vol in data.block_volumes]
    
    _add_and_bookmark_heading(document, "Gerenciamento de Volumes", 3, toc_list, counters)
    if all_block_volumes:
        document.add_paragraph("A tabela abaixo detalha os Block Volumes anexados às instâncias.")
        table = document.add_table(rows=1, cols=3, style='Table Grid')
        headers = ['Host de Origem', 'Nome do Volume', 'Tamanho (GB)']
        for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for data in instances:
            for vol in data.block_volumes:
                cells = table.add_row().cells; cells[0].text = data.host_name; cells[1].text = vol.display_name; cells[2].text = str(int(vol.size_in_gbs))
        document.add_paragraph()
    else:
        document.add_paragraph("Nenhum Block Volume adicional foi encontrado anexado às instâncias.")

    _add_and_bookmark_heading(document, "Políticas de Backup", 3, toc_list, counters)
    _add_and_bookmark_heading(document, "Backup de Boot Volume", 4, toc_list, counters)
    boot_backup_policies = {data.backup_policy_name for data in instances}
    if len(boot_backup_policies) == 1:
        document.add_paragraph(f"Todas as instâncias utilizam a política de backup: {boot_backup_policies.pop()}.")
    else:
        document.add_paragraph("As instâncias possuem diferentes políticas de backup:")
        for data in instances:
            p = document.add_paragraph(style='List Bullet'); p.add_run(f"Host {data.host_name}: ").bold = True; p.add_run(data.backup_policy_name)
    
    if all_block_volumes:
        _add_and_bookmark_heading(document, "Backup de Block Volumes Anexados", 4, toc_list, counters)
        bvs_with_backup = [(d.host_name, v) for d in instances for v in d.block_volumes if v.backup_policy_name != "Nenhuma política associada"]
        if bvs_with_backup:
            table = document.add_table(rows=1, cols=3, style='Table Grid')
            headers = ['Host de Origem', 'Nome do Volume', 'Política de Backup Aplicada']
            for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for host_name, vol in bvs_with_backup:
                cells = table.add_row().cells; cells[0].text = host_name; cells[1].text = vol.display_name; cells[2].text = vol.backup_policy_name
        else:
            document.add_paragraph("Nenhuma política de backup foi encontrada para Block Volumes adicionais.")
    
    if any(i.backup_policy_name == "CCM-7D" or any(bv.backup_policy_name == "CCM-7D" for bv in i.block_volumes) for i in instances):
        document.add_paragraph()
        _add_and_bookmark_heading(document, "Detalhes da Política de Backup CCM-7D", 4, toc_list, counters)
        document.add_paragraph("O Backup CCM-7D está configurado por meio de uma Backup Policy, garantindo a proteção contínua dos dados.")
        document.add_paragraph("A política define um agendamento diário Incremental, executado à 01:00 (horário regional).")
        document.add_paragraph("Os backups gerados possuem retenção de 7 dias.")
        document.add_paragraph("Essa política garante que, em caso de falhas, seja possível recuperar o volume rapidamente.")
    document.add_paragraph()

def _add_vcn_details_section(document: Document, infra_data: InfrastructureData, toc_list: list, counters: Dict[int, int]):
    """Adiciona as seções de VCN, Subnets, Listas de Segurança, etc."""
    if not infra_data.vcns:
        document.add_paragraph("Nenhuma Virtual Cloud Network foi encontrada neste compartimento."); return
    for vcn in infra_data.vcns:
        _add_and_bookmark_heading(document, f"VCN: {vcn.display_name}", 3, toc_list, counters)
        document.add_paragraph(f"CIDR Block: {vcn.cidr_block}")
        
        _add_and_bookmark_heading(document, "Subnets", 4, toc_list, counters)
        if vcn.subnets:
            table = document.add_table(rows=1, cols=2, style='Table Grid')
            headers = ['Nome da Subnet', 'CIDR Block']
            for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for subnet in sorted(vcn.subnets, key=lambda s: s.display_name):
                cells = table.add_row().cells; cells[0].text = subnet.display_name; cells[1].text = subnet.cidr_block
        else: document.add_paragraph("Nenhuma subnet encontrada.")
        document.add_paragraph()

        _add_and_bookmark_heading(document, "Security Lists", 4, toc_list, counters)
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

        _add_and_bookmark_heading(document, "Route Tables", 4, toc_list, counters)
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

        _add_and_bookmark_heading(document, "Network Security Groups (NSGs)", 4, toc_list, counters)
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
        
        _add_and_bookmark_heading(document, "Local Peering Gateways (LPGs)", 4, toc_list, counters)
        if vcn.lpgs:
            headers = ['Nome', 'Status do Peering', 'Route Table', 'CIDR Anunciado', 'Cross-Tenancy']
            table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
            for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for lpg in vcn.lpgs:
                cells = table.add_row().cells; cells[0].text = lpg.display_name; cells[1].text = lpg.peering_status_details or lpg.peering_status; cells[2].text = lpg.route_table_name; cells[3].text = lpg.peer_advertised_cidr or "N/A"; cells[4].text = "Sim" if lpg.is_cross_tenancy_peering else "Não"
        else: document.add_paragraph("Nenhum Local Peering Gateway encontrado nesta VCN.")
        document.add_paragraph()

def _add_load_balancers_section(document: Document, infra_data: InfrastructureData, toc_list: list, counters: Dict[int, int]):
    """Adiciona a seção de Load Balancers ao documento."""
    if not infra_data.load_balancers: return
    for lb in infra_data.load_balancers:
        _add_and_bookmark_heading(document, f"Load Balancer: {lb.display_name}", 3, toc_list, counters)
        table = document.add_table(rows=5, cols=2, style='Table Grid')
        table.cell(0, 0).text = "Atributo"; table.cell(0, 0).paragraphs[0].runs[0].font.bold = True
        table.cell(0, 1).text = "Valor"; table.cell(0, 1).paragraphs[0].runs[0].font.bold = True
        table.cell(1, 0).text = "Nome"; table.cell(1, 1).text = lb.display_name
        table.cell(2, 0).text = "Shape"; table.cell(2, 1).text = lb.shape_name
        table.cell(3, 0).text = "Estado"; table.cell(3, 1).text = lb.lifecycle_state
        table.cell(4, 0).text = "Endereços IP"; table.cell(4, 1).text = "\n".join([f"{ip.ip_address} ({'Público' if ip.is_public else 'Privado'})" for ip in lb.ip_addresses])
        document.add_paragraph()
        
        _add_and_bookmark_heading(document, "Listeners", 4, toc_list, counters)
        if lb.listeners:
            headers = ['Nome', 'Protocolo', 'Porta', 'Backend Set Padrão']; table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
            for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for listener in lb.listeners: cells = table.add_row().cells; cells[0].text = listener.name; cells[1].text = listener.protocol; cells[2].text = str(listener.port); cells[3].text = listener.default_backend_set_name
        else: document.add_paragraph("Nenhum Listener configurado.")
        document.add_paragraph()
        
        _add_and_bookmark_heading(document, "Backend Sets", 4, toc_list, counters)
        if lb.backend_sets:
            for bs in lb.backend_sets:
                document.add_paragraph(f"Configuração do Backend Set: {bs.name}", style='Heading 5'); p = document.add_paragraph()
                p.add_run("Política de Balanceamento: ").bold = True; p.add_run(f"{bs.policy}\n"); p.add_run("Health Checker: ").bold = True; p.add_run(f"{bs.health_checker.protocol} na porta {bs.health_checker.port} (Path: {bs.health_checker.url_path})")
                if bs.backends:
                    document.add_paragraph("Backends:", style='List Bullet'); headers = ['Nome do Backend', 'IP', 'Porta', 'Peso']; table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                    for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
                    for backend in bs.backends: cells = table.add_row().cells; cells[0].text = backend.name; cells[1].text = backend.ip_address; cells[2].text = str(backend.port); cells[3].text = str(backend.weight)
                else: document.add_paragraph("Nenhum backend configurado neste set.")
                document.add_paragraph()
        else: document.add_paragraph("Nenhum Backend Set configurado.")
        document.add_paragraph()

def _add_connectivity_section(document: Document, infra_data: InfrastructureData, toc_list: list, counters: Dict[int, int]):
    """Adiciona as seções de conectividade (DRG, CPE, VPN)."""
    _add_and_bookmark_heading(document, "Dynamic Routing Gateways (DRGs)", 3, toc_list, counters)
    if not infra_data.drgs: document.add_paragraph("Nenhum DRG encontrado.")
    else:
        for drg in infra_data.drgs:
            _add_and_bookmark_heading(document, f"DRG: {drg.display_name}", 4, toc_list, counters)
            document.add_paragraph("Anexos", style='Heading 5')
            if drg.attachments:
                headers = ['Nome do Anexo', 'Tipo', 'DRG Route Table']; table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
                for attachment in drg.attachments: cells = table.add_row().cells; cells[0].text = attachment.display_name; cells[1].text = attachment.network_type; cells[2].text = attachment.route_table_name or "N/A"
            else: document.add_paragraph("Nenhum anexo encontrado para este DRG.")
            document.add_paragraph()
            document.add_paragraph("Remote Peering Connections (RPCs)", style='Heading 5')
            if drg.rpcs:
                headers = ['Nome', 'Status', 'Status do Peering']; table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
                for rpc in drg.rpcs:
                    status_text = rpc.peering_status_details or rpc.peering_status
                    if rpc.peering_status == 'NEW': status_text = 'New (not peered)'
                    cells = table.add_row().cells; cells[0].text = rpc.display_name; cells[1].text = rpc.lifecycle_state; cells[2].text = status_text
            else: document.add_paragraph("Nenhuma Remote Peering Connection encontrada para este DRG.")
            document.add_paragraph()

    _add_and_bookmark_heading(document, "Customer-Premises Equipment (CPEs)", 3, toc_list, counters)
    if not infra_data.cpes: document.add_paragraph("Nenhum CPE encontrado.")
    else:
        table = document.add_table(rows=1, cols=3, style='Table Grid'); headers = ['Nome do CPE', 'Endereço IP', 'Fabricante']
        for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for cpe in infra_data.cpes: cells = table.add_row().cells; cells[0].text = cpe.display_name; cells[1].text = cpe.ip_address; cells[2].text = cpe.vendor or "N/A"
    document.add_paragraph()

    _add_and_bookmark_heading(document, "Conexões VPN IPSec", 3, toc_list, counters)
    if not infra_data.ipsec_connections: document.add_paragraph("Nenhuma Conexão VPN IPSec encontrada.")
    else:
        cpe_map = {cpe.id: cpe.display_name for cpe in infra_data.cpes}; drg_map = {drg.id: drg.display_name for drg in infra_data.drgs}
        _add_and_bookmark_heading(document, "Sumário de Conexões VPN", 4, toc_list, counters)
        table = document.add_table(rows=1, cols=6, style='Table Grid'); headers = ['Nome da Conexão', 'Status', 'CPE Associado', 'DRG Associado', 'Rotas Estáticas', 'Túneis Configurados']
        for i, h in enumerate(headers): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for ipsec in infra_data.ipsec_connections:
            cells = table.add_row().cells; cells[0].text = ipsec.display_name; cells[1].text = ipsec.status; cells[2].text = cpe_map.get(ipsec.cpe_id, ipsec.cpe_id); cells[3].text = drg_map.get(ipsec.drg_id, ipsec.drg_id); cells[4].text = ', '.join(ipsec.static_routes) or 'Nenhuma'; cells[5].text = str(len(ipsec.tunnels))
        document.add_paragraph()

        _add_and_bookmark_heading(document, "Detalhes das Conexões VPN", 4, toc_list, counters)
        for ipsec in infra_data.ipsec_connections:
            document.add_paragraph(f"Configuração da Conexão: {ipsec.display_name}", style='Heading 5')
            if not ipsec.tunnels: document.add_paragraph("Nenhum túnel encontrado para esta conexão."); continue
            for tunnel in ipsec.tunnels:
                p = document.add_paragraph(); p.add_run(f"Túnel: {tunnel.display_name} ").bold = True; p.add_run(f"(Status: {tunnel.status})")
                info_table = document.add_table(rows=4, cols=2, style='Table Grid'); info_table.cell(0, 0).text = "IP Oracle"; info_table.cell(0, 1).text = tunnel.vpn_oracle_ip or "N/A"; info_table.cell(1, 0).text = "IP do CPE"; info_table.cell(1, 1).text = tunnel.cpe_ip or "N/A"; info_table.cell(2, 0).text = "Roteamento"; info_table.cell(2, 1).text = tunnel.routing_type; info_table.cell(3, 0).text = "Versão IKE"; info_table.cell(3, 1).text = tunnel.ike_version; document.add_paragraph()
                p1 = tunnel.phase_one_details; p1_table = document.add_table(rows=4, cols=2, style='Table Grid'); p1_table.cell(0, 0).text = "Fase 1 - Autenticação"; p1_table.cell(0, 1).text = p1.authentication_algorithm; p1_table.cell(1, 0).text = "Fase 1 - Criptografia"; p1_table.cell(1, 1).text = p1.encryption_algorithm; p1_table.cell(2, 0).text = "Fase 1 - Grupo DH"; p1_table.cell(2, 1).text = p1.dh_group; p1_table.cell(3, 0).text = "Fase 1 - Lifetime (s)"; p1_table.cell(3, 1).text = str(p1.lifetime_in_seconds); document.add_paragraph()
                p2 = tunnel.phase_two_details; p2_table = document.add_table(rows=3, cols=2, style='Table Grid'); p2_table.cell(0, 0).text = "Fase 2 - Autenticação"; p2_table.cell(0, 1).text = p2.authentication_algorithm or "N/A"; p2_table.cell(1, 0).text = "Fase 2 - Criptografia"; p2_table.cell(1, 1).text = p2.encryption_algorithm; p2_table.cell(2, 0).text = "Fase 2 - Lifetime (s)"; p2_table.cell(2, 1).text = str(p2.lifetime_in_seconds)
                
                if tunnel.validation_status == 'Fora da recomendação Oracle' and tunnel.validation_details:
                    # Adiciona a nota de configuração
                    p = document.add_paragraph()
                    p.add_run("Nota de Configuração: ").bold = True
                    p.add_run("Os parâmetros de criptografia customizados para este túnel divergem das recomendações padrão da Oracle. Consulte a documentação oficial no endereço abaixo:")
                    
                    # Adiciona o link por extenso em um novo parágrafo para facilitar a seleção
                    url_p = document.add_paragraph(tunnel.validation_details)
                    url_p.style = 'Intense Quote' # Aplica um estilo para destacar o link
                
                document.add_paragraph()

# --- Função Principal de Geração ---

def generate_documentation(
    doc_type: str, infra_data: InfrastructureData,
    architecture_image_bytes_list: Optional[List[bytes]] = None,
    antivirus_image_bytes_list: Optional[List[bytes]] = None
) -> str:
    document = Document()
    _define_toc_styles(document)
    
    style = document.styles['Normal']; font = style.font; font.name = 'Calibri'; font.size = Pt(11)
    
    instances = sorted(infra_data.instances, key=lambda x: x.host_name)
    if not instances:
        raise ValueError("Não é possível gerar o documento sem dados de instância para identificar o cliente.")
    
    client_name = instances[0].compartment_name.replace("SERVERS-", "")
    safe_client_name = re.sub(r'[\\/*?:"<>|]', "", client_name)
    doc_title = "Documentação de Infraestrutura" if doc_type == 'full_infra' else "Documentação de Novo Host"

    headings_for_toc: List[Tuple[str, str, int]] = []
    numbering_counters: Dict[int, int] = {2: 0, 3: 0, 4: 0}
    
    # Gerar o corpo do documento para popular a lista do sumário
    body_doc = Document()

    if architecture_image_bytes_list:
        _add_and_bookmark_heading(body_doc, "Desenho da Arquitetura", 2, headings_for_toc, numbering_counters)
        for image_bytes in architecture_image_bytes_list:
            try: body_doc.add_picture(BytesIO(image_bytes), width=Inches(6.0)); body_doc.add_paragraph()
            except Exception as e: body_doc.add_paragraph(f"Erro ao inserir imagem: {e}")

    _add_and_bookmark_heading(body_doc, "Instâncias Computacionais", 2, headings_for_toc, numbering_counters)
    _add_instances_table(body_doc, instances)

    _add_and_bookmark_heading(body_doc, "Gerenciamento de Volumes e Backup", 2, headings_for_toc, numbering_counters)
    _add_volume_and_backup_section(body_doc, instances, headings_for_toc, numbering_counters)
    
    if doc_type == 'full_infra':
        _add_and_bookmark_heading(body_doc, "Topologia de Rede Virtual (VCN)", 2, headings_for_toc, numbering_counters)
        _add_vcn_details_section(body_doc, infra_data, headings_for_toc, numbering_counters)
        if infra_data.load_balancers:
            _add_and_bookmark_heading(body_doc, "Load Balancers (LBaaS)", 2, headings_for_toc, numbering_counters)
            _add_load_balancers_section(body_doc, infra_data, headings_for_toc, numbering_counters)
        _add_and_bookmark_heading(body_doc, "Conectividade Externa e Roteamento", 2, headings_for_toc, numbering_counters)
        _add_connectivity_section(body_doc, infra_data, headings_for_toc, numbering_counters)
    
    if doc_type == 'new_host':
        _add_and_bookmark_heading(body_doc, "Conectividade de Rede da(s) Instância(s)", 2, headings_for_toc, numbering_counters)
        sl_map, nsg_map, rt_map = {}, {}, {}
        for data in instances:
            for sl in data.security_lists: sl_map.setdefault(sl.name, {'rules': sl.rules})
            for nsg in data.network_security_groups: nsg_map.setdefault(nsg.name, {'rules': nsg.rules})
            if data.route_table: rt_map.setdefault(data.route_table.name, {'rules': data.route_table.rules})
        
        headers_sl_nsg = ["Direção", "Protocolo", "Portas", "Origem/Destino", "Descrição"]
        _add_and_bookmark_heading(body_doc, "Security Lists", 3, headings_for_toc, numbering_counters)
        for name, info in sorted(sl_map.items()):
            p = body_doc.add_paragraph(); p.add_run(f"Regras da Security List: {name}").bold = True
            table = body_doc.add_table(rows=1, cols=len(headers_sl_nsg), style='Table Grid')
            for i, h in enumerate(headers_sl_nsg): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for rule in info['rules']:
                cells=table.add_row().cells; cells[0].text=rule.direction; cells[1].text=rule.protocol; cells[2].text=rule.ports or "Todas"; cells[3].text=rule.source_or_destination or "N/A"; cells[4].text=rule.description or ''
            body_doc.add_paragraph()

        _add_and_bookmark_heading(body_doc, "Network Security Groups", 3, headings_for_toc, numbering_counters)
        for name, info in sorted(nsg_map.items()):
            p = body_doc.add_paragraph(); p.add_run(f"Regras do NSG: {name}").bold = True
            table = body_doc.add_table(rows=1, cols=len(headers_sl_nsg), style='Table Grid')
            for i, h in enumerate(headers_sl_nsg): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for rule in info['rules']:
                cells=table.add_row().cells; cells[0].text=rule.direction; cells[1].text=rule.protocol; cells[2].text=rule.ports or "Todas"; cells[3].text=rule.source_or_destination or "N/A"; cells[4].text=rule.description or ''
            body_doc.add_paragraph()

        _add_and_bookmark_heading(body_doc, "Route Tables", 3, headings_for_toc, numbering_counters)
        for name, info in sorted(rt_map.items()):
            p = body_doc.add_paragraph(); p.add_run(f"Regras da Route Table: {name}").bold = True
            table = body_doc.add_table(rows=1, cols=3, style='Table Grid')
            headers_rt = ["Destino", "Alvo", "Descrição"]
            for i, h in enumerate(headers_rt): table.cell(0, i).text = h; table.cell(0, i).paragraphs[0].runs[0].font.bold = True
            for rule in info['rules']:
                cells=table.add_row().cells; cells[0].text=rule.destination; cells[1].text=rule.target; cells[2].text=rule.description or ''
            body_doc.add_paragraph()
        
    if antivirus_image_bytes_list:
        _add_and_bookmark_heading(body_doc, "Configuração do Antivírus", 2, headings_for_toc, numbering_counters)
        for image_bytes in antivirus_image_bytes_list:
            try: body_doc.add_picture(BytesIO(image_bytes), width=Inches(6.0)); body_doc.add_paragraph()
            except Exception as e: body_doc.add_paragraph(f"Erro ao inserir imagem: {e}")

    # Montar o documento final na ordem correta
    
    # 2.1 Página de Título
    title_p = document.add_paragraph(doc_title, style='Title')
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph(f"Cliente: {client_name}\nData de Geração: {datetime.now().strftime('%d/%m/%Y')}")
    document.add_page_break()

    # 2.2 Sumário
    document.add_paragraph("Sumário", style='Heading 1')
    for text, bookmark, level in headings_for_toc:
        toc_level = level - 1
        if toc_level > 0:
            style = f'TOC {toc_level}'
            p = document.add_paragraph(style=style)
            _add_internal_hyperlink(p, text, bookmark)
    document.add_page_break()

    # 2.3 Corpo do Documento (copiando do documento temporário)
    for element in body_doc.element.body:
        document.element.body.append(element)

    # Salvar o documento
    output_dir = "generated_docs"
    os.makedirs(output_dir, exist_ok=True)
    doc_identifier = "Infraestrutura" if doc_type == 'full_infra' else "NovoHost"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_name = f"Doc_{doc_identifier}_{safe_client_name}_{timestamp}.docx"
    output_path = os.path.join(output_dir, file_name)
    
    document.save(output_path)
    return output_path