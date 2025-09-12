# OCI DocGen
# Autor: Pedro Teixeira
# Data: 12 de Setembro de 2025
# Descrição: Módulo responsável por gerar documentos .docx detalhados com sumário clicável.

import os
import re
from datetime import datetime
from io import BytesIO
from typing import List, Optional, Tuple, Dict

import docx
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import nsdecls
from docx.oxml import parse_xml
from docx.oxml.shared import OxmlElement, qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.shared import Inches, Pt, RGBColor
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
    run = paragraph.runs[0] if paragraph.runs else paragraph.add_run()
    bookmark_id = str(abs(hash(bookmark_name)) % (10**8))
    start_tag = OxmlElement('w:bookmarkStart')
    start_tag.set(qn('w:id'), bookmark_id); start_tag.set(qn('w:name'), bookmark_name)
    run._r.addprevious(start_tag)
    end_tag = OxmlElement('w:bookmarkEnd'); end_tag.set(qn('w:id'), bookmark_id)
    run._r.addnext(end_tag)

def _add_internal_hyperlink(paragraph: Paragraph, text: str, anchor_name: str):
    hyperlink = OxmlElement('w:hyperlink')
    hyperlink.set(qn('w:anchor'), anchor_name)
    sub_run = OxmlElement('w:r'); rPr = OxmlElement('w:rPr'); rStyle = OxmlElement('w:rStyle')
    rStyle.set(qn('w:val'), 'Hyperlink'); rPr.append(rStyle); sub_run.append(rPr)
    text_element = OxmlElement('w:t'); text_element.text = text; sub_run.append(text_element)
    hyperlink.append(sub_run)
    paragraph._p.append(hyperlink)

def _add_and_bookmark_heading(document: Document, text: str, level: int, toc_list: list, counters: Dict[int, int]):
    if level not in counters: counters[level] = 0
    counters[level] += 1
    for deeper_level in range(level + 1, 5): 
        if deeper_level in counters: counters[deeper_level] = 0
    number_parts = [str(counters.get(i, 0)) for i in range(1, level + 1)]
    number_str = ".".join(number_parts)
    final_text = f"{number_str} {text}"
    heading = document.add_paragraph(final_text, style=f'Heading {level}')
    clean_text = re.sub(r'[^A-Za-z0-9_]', '', final_text.replace(' ', '_'))
    bookmark_name = f"_Toc_{clean_text}_{len(toc_list)}"
    _add_bookmark(heading, bookmark_name)
    toc_list.append((final_text, bookmark_name, level))
    return heading

# --- Funções Auxiliares de Estilo de Tabela ---

def _shade_cell(cell, color="4472C4"):
    shading_elm = parse_xml(r'<w:shd {} w:fill="{}"/>'.format(nsdecls('w'), color))
    cell._tc.get_or_add_tcPr().append(shading_elm)

def _style_table_headers(table, headers, shade_color="4472C4"):
    for i, header_text in enumerate(headers):
        cell = table.cell(0, i)
        cell.text = ''
        p = cell.paragraphs[0]
        run = p.add_run(header_text.upper())
        run.font.bold = True
        run.font.color.rgb = RGBColor.from_string('FFFFFF')
        _shade_cell(cell, shade_color)

def _create_titled_key_value_table(document, title, data_dict, col_widths=(Inches(2.0), Inches(4.5))):
    table = document.add_table(rows=len(data_dict) + 1, cols=2, style='Table Grid')
    table.autofit = False
    table.allow_autofit = False
    table.columns[0].width = col_widths[0]
    table.columns[1].width = col_widths[1]
    title_cell = table.cell(0, 0).merge(table.cell(0, 1))
    title_cell.text = ''
    p = title_cell.paragraphs[0]
    run = p.add_run(title.upper())
    run.font.bold = True
    run.font.color.rgb = RGBColor.from_string('FFFFFF')
    _shade_cell(title_cell)
    for i, (key, value) in enumerate(data_dict.items(), 1):
        key_cell = table.cell(i, 0)
        key_cell.text = key
        key_cell.paragraphs[0].runs[0].font.bold = True
        table.cell(i, 1).text = str(value) if value else "N/A"
    document.add_paragraph()


# --- Funções de Geração de Seções ---

def _add_instances_table(document: Document, instances: List[InstanceData]):
    if not instances: return
    document.add_paragraph("A tabela a seguir detalha as configurações das instâncias computacionais no escopo.")
    headers = ['HOST', 'SHAPE', 'OCPU', 'MEMÓRIA (GB)', 'BOOT VOL (GB)', 'S.O.', 'IP PRIVADO', 'IP PÚBLICO']
    table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
    _style_table_headers(table, headers)
    for data in instances:
        cells = table.add_row().cells
        cells[0].text, cells[1].text, cells[2].text = data.host_name, data.shape, str(data.ocpus)
        cells[3].text, cells[4].text, cells[5].text = str(data.memory), str(data.boot_volume_gb), data.os_name
        cells[6].text, cells[7].text = data.private_ip, data.public_ip or "N/A"
    document.add_paragraph()

def _add_volume_and_backup_section(document: Document, infra_data: InfrastructureData, toc_list: list, counters: Dict[int, int]):
    instances = infra_data.instances
    if not instances: return
    volume_to_vg_map = {vol_id: vg.display_name for vg in getattr(infra_data, 'volume_groups', []) if hasattr(vg, 'member_ids') for vol_id in vg.member_ids}
    _add_and_bookmark_heading(document, "Gerenciamento de Volumes e Backup", 2, toc_list, counters)
    _add_and_bookmark_heading(document, "Volumes Anexados (Block Volumes)", 3, toc_list, counters)
    all_block_volumes = [vol for data in instances for vol in data.block_volumes]
    if all_block_volumes:
        document.add_paragraph("A tabela abaixo detalha os Block Volumes anexados às instâncias.")
        headers = ['Host de Origem', 'Nome do Volume', 'Tamanho (GB)', 'Política de Backup']
        table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
        _style_table_headers(table, headers)
        for data in instances:
            for vol in data.block_volumes:
                cells = table.add_row().cells
                cells[0].text, cells[1].text, cells[2].text = data.host_name, vol.display_name, str(int(vol.size_in_gbs))
                cells[3].text = f"Gerenciado por VG: {volume_to_vg_map.get(vol.id)}" if vol.id in volume_to_vg_map else vol.backup_policy_name
        document.add_paragraph()
    else:
        document.add_paragraph("Este recurso não está provisionado neste ambiente.")
    _add_and_bookmark_heading(document, "Políticas de Backup", 3, toc_list, counters)
    document.add_paragraph("A tabela a seguir consolida as políticas de backup para todos os volumes (Boot e Block) das instâncias.")
    headers = ['Host Associado', 'Nome do Volume', 'Política de Backup Aplicada']
    table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
    _style_table_headers(table, headers)
    for instance in instances:
        boot_cells = table.add_row().cells
        boot_cells[0].text, boot_cells[1].text = instance.host_name, "Boot Volume"
        boot_cells[2].text = f"Gerenciado por VG: {volume_to_vg_map.get(instance.boot_volume_id)}" if instance.boot_volume_id in volume_to_vg_map else instance.backup_policy_name
        for vol in instance.block_volumes:
            block_cells = table.add_row().cells
            block_cells[0].text, block_cells[1].text = instance.host_name, vol.display_name
            block_cells[2].text = f"Gerenciado por VG: {volume_to_vg_map.get(vol.id)}" if vol.id in volume_to_vg_map else vol.backup_policy_name
    document.add_paragraph()
    has_ccm_policy = any(i.backup_policy_name == "CCM-7D" or any(bv.backup_policy_name == "CCM-7D" for bv in i.block_volumes) for i in instances)
    if hasattr(infra_data, 'volume_groups') and infra_data.volume_groups:
        has_ccm_policy = has_ccm_policy or any(vg.validation.policy_name == "CCM-7D" for vg in infra_data.volume_groups)
    if has_ccm_policy:
        _add_and_bookmark_heading(document, "Detalhes da Política de Backup CCM-7D", 4, toc_list, counters)
        document.add_paragraph("O Backup CCM-7D está configurado por meio de uma Backup Policy, garantindo a proteção contínua dos dados.")
        document.add_paragraph("A política define um agendamento diário Incremental, executado à 01:00 (horário regional).")
        document.add_paragraph("Os backups gerados possuem retenção de 7 dias.")
        document.add_paragraph("Essa política garante que, em caso de falhas, seja possível recuperar o volume rapidamente.")
    document.add_paragraph()

def _add_volume_groups_section(document: Document, infra_data: InfrastructureData, toc_list: list, counters: Dict[int, int]):
    _add_and_bookmark_heading(document, "Volume Groups", 2, toc_list, counters)
    document.add_paragraph("Volume Groups são conjuntos de volumes (Boot e Block) que podem ser gerenciados como uma única unidade, especialmente para backups consistentes e replicação entre regiões.")
    for vg in sorted(infra_data.volume_groups, key=lambda v: v.display_name):
        _add_and_bookmark_heading(document, f"Volume Group: {vg.display_name}", 3, toc_list, counters)
        info_data = {"Nome": vg.display_name, "Estado": vg.lifecycle_state, "Availability Domain": vg.availability_domain, "Total de Membros": str(len(vg.members))}
        _create_titled_key_value_table(document, "Informações Gerais", info_data)
        if vg.members:
            headers = ["Membros do Grupo"]
            members_table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
            _style_table_headers(members_table, headers)
            for member_name in vg.members: members_table.add_row().cells[0].text = member_name
            document.add_paragraph()
        else:
            document.add_paragraph("Este recurso não está provisionado neste ambiente.")
        val = vg.validation
        validation_data = {"Política de Backup": val.policy_name, "Replicação Cross-Region": "Habilitada" if val.is_cross_region_replication_enabled else "Desabilitada", "Destino da Replicação": val.cross_region_target}
        _create_titled_key_value_table(document, "Validação de Proteção de Dados", validation_data)
        
def _add_vcn_details_section(document: Document, infra_data: InfrastructureData, toc_list: list, counters: Dict[int, int]):
    sl_to_hosts, nsg_to_hosts, rt_to_hosts = {}, {}, {}
    for instance in infra_data.instances:
        for sl in instance.security_lists: sl_to_hosts.setdefault(sl.name, []).append(instance.host_name)
        for nsg in instance.network_security_groups: nsg_to_hosts.setdefault(nsg.name, []).append(instance.host_name)
        if instance.route_table: rt_to_hosts.setdefault(instance.route_table.name, []).append(instance.host_name)
    _add_and_bookmark_heading(document, "Topologia de Rede Virtual (VCN)", 2, toc_list, counters)
    if not infra_data.vcns:
        document.add_paragraph("Este recurso não está provisionado neste ambiente."); return
    for vcn in infra_data.vcns:
        _add_and_bookmark_heading(document, f"VCN: {vcn.display_name}", 3, toc_list, counters)
        _create_titled_key_value_table(document, "Detalhes da VCN", {"CIDR Block": vcn.cidr_block}, col_widths=(Inches(1.5), Inches(5.0)))
        _add_and_bookmark_heading(document, "Subnets", 4, toc_list, counters)
        if vcn.subnets:
            headers = ['Nome da Subnet', 'CIDR Block']
            table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
            _style_table_headers(table, headers)
            for subnet in sorted(vcn.subnets, key=lambda s: s.display_name):
                cells = table.add_row().cells; cells[0].text = subnet.display_name; cells[1].text = subnet.cidr_block
        else:
            document.add_paragraph("Este recurso não está provisionado neste ambiente.")
        document.add_paragraph()
        _add_and_bookmark_heading(document, "Security Lists", 4, toc_list, counters)
        if vcn.security_lists:
            for sl in sorted(vcn.security_lists, key=lambda s: s.name):
                p = document.add_paragraph(); p.add_run(f"Regras da Security List: {sl.name}").bold = True
                if sl.name in sl_to_hosts:
                    p_hosts = document.add_paragraph(); p_hosts.add_run("Hosts Associados: ").bold = True; p_hosts.add_run(", ".join(sorted(sl_to_hosts[sl.name])))
                headers = ["Direção", "Protocolo", "Portas", "Origem/Destino", "Descrição"]
                table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                _style_table_headers(table, headers)
                for rule in sl.rules:
                    cells = table.add_row().cells; cells[0].text = rule.direction; cells[1].text = rule.protocol; cells[2].text = rule.ports or "Todas"; cells[3].text = rule.source_or_destination or "N/A"; cells[4].text = rule.description or ''
                document.add_paragraph()
        else:
            document.add_paragraph("Este recurso não está provisionado neste ambiente.")
        _add_and_bookmark_heading(document, "Route Tables", 4, toc_list, counters)
        if vcn.route_tables:
            for rt in sorted(vcn.route_tables, key=lambda r: r.name):
                p = document.add_paragraph(); p.add_run(f"Regras da Route Table: {rt.name}").bold = True
                if rt.name in rt_to_hosts:
                    p_hosts = document.add_paragraph(); p_hosts.add_run("Hosts Associados: ").bold = True; p_hosts.add_run(", ".join(sorted(rt_to_hosts[rt.name])))
                headers = ["Destino", "Alvo (Target)", "Descrição"]
                table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                _style_table_headers(table, headers)
                for rule in rt.rules:
                    cells = table.add_row().cells; cells[0].text = rule.destination; cells[1].text = rule.target; cells[2].text = rule.description or ''
                document.add_paragraph()
        else:
            document.add_paragraph("Este recurso não está provisionado neste ambiente.")
        _add_and_bookmark_heading(document, "Network Security Groups (NSGs)", 4, toc_list, counters)
        if vcn.network_security_groups:
            for nsg in sorted(vcn.network_security_groups, key=lambda n: n.name):
                p = document.add_paragraph(); p.add_run(f"Regras do NSG: {nsg.name}").bold = True
                if nsg.name in nsg_to_hosts:
                    p_hosts = document.add_paragraph(); p_hosts.add_run("Hosts Associados: ").bold = True; p_hosts.add_run(", ".join(sorted(nsg_to_hosts[nsg.name])))
                headers = ["Direção", "Protocolo", "Portas", "Origem/Destino", "Descrição"]
                table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                _style_table_headers(table, headers)
                for rule in nsg.rules:
                    cells = table.add_row().cells; cells[0].text = rule.direction; cells[1].text = rule.protocol; cells[2].text = rule.ports or "Todas"; cells[3].text = rule.source_or_destination or "N/A"; cells[4].text = rule.description or ''
                document.add_paragraph()
        else:
            document.add_paragraph("Este recurso não está provisionado neste ambiente.")
        _add_and_bookmark_heading(document, "Local Peering Gateways (LPGs)", 4, toc_list, counters)
        if vcn.lpgs:
            headers = ['Nome', 'Status do Peering', 'Route Table', 'CIDR Anunciado', 'Cross-Tenancy']
            table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
            _style_table_headers(table, headers)
            for lpg in vcn.lpgs:
                cells = table.add_row().cells; cells[0].text = lpg.display_name; cells[1].text = lpg.peering_status_details or lpg.peering_status; cells[2].text = lpg.route_table_name; cells[3].text = lpg.peer_advertised_cidr or "N/A"; cells[4].text = "Sim" if lpg.is_cross_tenancy_peering else "Não"
        else:
            document.add_paragraph("Este recurso não está provisionado neste ambiente.")
        document.add_paragraph()

def _add_load_balancers_section(document: Document, infra_data: InfrastructureData, toc_list: list, counters: Dict[int, int]):
    if not hasattr(infra_data, 'load_balancers') or not infra_data.load_balancers: return
    _add_and_bookmark_heading(document, "Load Balancers (LBaaS)", 2, toc_list, counters)
    for lb in infra_data.load_balancers:
        _add_and_bookmark_heading(document, f"Load Balancer: {lb.display_name}", 3, toc_list, counters)
        ip_list = "\n".join([f"{ip.ip_address} ({'Público' if ip.is_public else 'Privado'})" for ip in lb.ip_addresses])
        lb_info = {"Nome": lb.display_name, "Shape": lb.shape_name, "Estado": lb.lifecycle_state, "Endereços IP": ip_list}
        _create_titled_key_value_table(document, "Informações Gerais do Load Balancer", lb_info)
        _add_and_bookmark_heading(document, "Listeners", 4, toc_list, counters)
        if lb.listeners:
            headers = ['Nome', 'Protocolo', 'Porta', 'Backend Set Padrão']
            table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
            _style_table_headers(table, headers)
            for listener in lb.listeners: 
                cells = table.add_row().cells; cells[0].text = listener.name; cells[1].text = listener.protocol; cells[2].text = str(listener.port); cells[3].text = listener.default_backend_set_name
        else:
            document.add_paragraph("Este recurso não está provisionado neste ambiente.")
        document.add_paragraph()
        _add_and_bookmark_heading(document, "Backend Sets", 4, toc_list, counters)
        if lb.backend_sets:
            for bs in lb.backend_sets:
                bs_info = { "Política de Balanceamento": bs.policy, "Health Checker": f"{bs.health_checker.protocol}:{bs.health_checker.port} (Path: {bs.health_checker.url_path})" }
                _create_titled_key_value_table(document, f"Configuração do Backend Set: {bs.name}", bs_info)
                if bs.backends:
                    headers = ['Nome do Backend', 'IP', 'Porta', 'Peso']
                    table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                    _style_table_headers(table, headers)
                    for backend in bs.backends: 
                        cells = table.add_row().cells; cells[0].text = backend.name; cells[1].text = backend.ip_address; cells[2].text = str(backend.port); cells[3].text = str(backend.weight)
                    document.add_paragraph()
                else:
                    document.add_paragraph("Este recurso não está provisionado neste ambiente.")
        else:
            document.add_paragraph("Este recurso não está provisionado neste ambiente.")
        document.add_paragraph()

def _add_connectivity_section(document: Document, infra_data: InfrastructureData, toc_list: list, counters: Dict[int, int]):
    _add_and_bookmark_heading(document, "Conectividade Externa e Roteamento", 2, toc_list, counters)
    _add_and_bookmark_heading(document, "Dynamic Routing Gateways (DRGs)", 3, toc_list, counters)
    if not infra_data.drgs:
        document.add_paragraph("Este recurso não está provisionado neste ambiente.")
    else:
        for drg in infra_data.drgs:
            _add_and_bookmark_heading(document, f"DRG: {drg.display_name}", 4, toc_list, counters)
            if drg.attachments:
                headers = ['Nome do Anexo', 'Tipo', 'DRG Route Table']
                table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                _style_table_headers(table, headers)
                for attachment in drg.attachments: 
                    cells = table.add_row().cells; cells[0].text = attachment.display_name; cells[1].text = attachment.network_type; cells[2].text = attachment.route_table_name or "N/A"
                document.add_paragraph()
            else:
                document.add_paragraph("Este recurso não está provisionado neste ambiente.")
            if drg.rpcs:
                headers = ['Nome da Conexão Remota', 'Status', 'Status do Peering']
                table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
                _style_table_headers(table, headers)
                for rpc in drg.rpcs:
                    status_text = rpc.peering_status_details or rpc.peering_status
                    if rpc.peering_status == 'NEW': status_text = 'New (not peered)'
                    cells = table.add_row().cells; cells[0].text = rpc.display_name; cells[1].text = rpc.lifecycle_state; cells[2].text = status_text
                document.add_paragraph()
            else:
                document.add_paragraph("Este recurso não está provisionado neste ambiente.")
    _add_and_bookmark_heading(document, "Customer-Premises Equipment (CPEs)", 3, toc_list, counters)
    if not infra_data.cpes:
        document.add_paragraph("Este recurso não está provisionado neste ambiente.")
    else:
        headers = ['Nome do CPE', 'Endereço IP', 'Fabricante']
        table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
        _style_table_headers(table, headers)
        for cpe in infra_data.cpes: 
            cells = table.add_row().cells; cells[0].text = cpe.display_name; cells[1].text = cpe.ip_address; cells[2].text = cpe.vendor or "N/A"
    document.add_paragraph()
    _add_and_bookmark_heading(document, "Conexões VPN IPSec", 3, toc_list, counters)
    if not infra_data.ipsec_connections:
        document.add_paragraph("Este recurso não está provisionado neste ambiente.")
    else:
        cpe_map = {cpe.id: cpe.display_name for cpe in infra_data.cpes}; drg_map = {drg.id: drg.display_name for drg in infra_data.drgs}
        _add_and_bookmark_heading(document, "Sumário de Conexões VPN", 4, toc_list, counters)
        headers = ['Nome da Conexão', 'Status', 'CPE Associado', 'DRG Associado', 'Roteamento', 'Túneis']
        table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
        _style_table_headers(table, headers)
        for ipsec in infra_data.ipsec_connections:
            routing_type = "BGP" if any(t.routing_type == "BGP" for t in ipsec.tunnels) else "STATIC"
            routing_display = f"STATIC ({len(ipsec.static_routes)} rotas)" if routing_type == "STATIC" else "BGP"
            cells = table.add_row().cells
            cells[0].text = ipsec.display_name
            cells[1].text = ipsec.status
            cells[2].text = cpe_map.get(ipsec.cpe_id, ipsec.cpe_id)
            cells[3].text = drg_map.get(ipsec.drg_id, ipsec.drg_id)
            cells[4].text = routing_display
            cells[5].text = str(len(ipsec.tunnels))
        document.add_paragraph()
        _add_and_bookmark_heading(document, "Detalhes das Conexões VPN", 4, toc_list, counters)
        for ipsec in infra_data.ipsec_connections:
            document.add_paragraph(f"Configuração da Conexão: {ipsec.display_name}", style='Heading 5')
            if not ipsec.tunnels:
                document.add_paragraph("Nenhum túnel encontrado para esta conexão."); continue
            for tunnel in ipsec.tunnels:
                p = document.add_paragraph(); p.add_run(f"Túnel: {tunnel.display_name} ").bold = True; p.add_run(f"(Status: {tunnel.status})")
                tunnel_info = { "IP Oracle": tunnel.vpn_oracle_ip or "N/A", "IP do CPE": tunnel.cpe_ip or "N/A", "Roteamento": tunnel.routing_type, "Versão IKE": tunnel.ike_version }
                _create_titled_key_value_table(document, "Informações do Túnel", tunnel_info)

                if tunnel.routing_type == "BGP" and tunnel.bgp_session_info:
                    bgp = tunnel.bgp_session_info
                    bgp_info_data = {
                        "ASN Oracle": bgp.oracle_bgp_asn,
                        "ASN do Cliente": bgp.customer_bgp_asn,
                        "IP do Túnel (Oracle)": bgp.oracle_interface_ip,
                        "IP do Túnel (Cliente)": bgp.customer_interface_ip
                    }
                    _create_titled_key_value_table(document, "Detalhes da Sessão BGP", bgp_info_data)
                
                p1 = tunnel.phase_one_details
                p1_info = { "Autenticação": p1.authentication_algorithm, "Criptografia": p1.encryption_algorithm, "Grupo DH": p1.dh_group, "Lifetime (s)": str(p1.lifetime_in_seconds) }
                _create_titled_key_value_table(document, "Fase 1 (IKE)", p1_info)
                
                p2 = tunnel.phase_two_details
                p2_info = { "Autenticação": p2.authentication_algorithm or "N/A", "Criptografia": p2.encryption_algorithm, "Lifetime (s)": str(p2.lifetime_in_seconds) }
                _create_titled_key_value_table(document, "Fase 2 (IPSec)", p2_info)
                
                if tunnel.validation_status == 'Fora da recomendação Oracle' and tunnel.validation_details:
                    p = document.add_paragraph(); p.add_run("Nota de Configuração: ").bold = True
                    p.add_run("Os parâmetros de criptografia customizados para este túnel divergem das recomendações padrão da Oracle.")
                    url_p = document.add_paragraph(tunnel.validation_details); url_p.style = 'Intense Quote'
                document.add_paragraph()

def _add_responsible_section(document: Document, toc_list: list, counters: Dict[int, int], responsible_name: str):
    _add_and_bookmark_heading(document, "RESPONSÁVEL", 1, toc_list, counters)
    document.add_paragraph("Responsável pelo preenchimento da documentação:")
    headers = ["RESPONSÁVEL", "DATA"]
    table = document.add_table(rows=1, cols=len(headers), style='Table Grid')
    _style_table_headers(table, headers)
    cells = table.add_row().cells
    cells[0].text = responsible_name
    cells[1].text = datetime.now().strftime('%d/%m/%Y')
    document.add_paragraph()

# --- Função Principal de Geração ---

def generate_documentation(
    doc_type: str, 
    infra_data: InfrastructureData,
    responsible_name: str,
    architecture_image_bytes_list: Optional[List[bytes]] = None,
    antivirus_image_bytes_list: Optional[List[bytes]] = None
) -> str:
    
    document = Document()
    style = document.styles['Normal']; font = style.font; font.name = 'Calibri'; font.size = Pt(11)
    _define_toc_styles(document)

    if not infra_data.instances:
        raise ValueError("Não é possível gerar o documento sem dados de instância para identificar o cliente.")

    client_name = infra_data.instances[0].compartment_name.replace("SERVERS-", "")
    safe_client_name = re.sub(r'[\\/*?:"<>|]', "", client_name)
    doc_title_text = "Documentação de Infraestrutura" if doc_type == 'full_infra' else "Documentação de Novo Host"

    headings_for_toc: List[Tuple[str, str, int]] = []
    numbering_counters: Dict[int, int] = {i: 0 for i in range(1, 5)}
    
    # 1. Adicionar página de título
    title_p = document.add_paragraph(doc_title_text, style='Title')
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph(f"Cliente: {client_name}\nData de Geração: {datetime.now().strftime('%d/%m/%Y')}")
    document.add_page_break()

    # 2. Adicionar placeholder do sumário e uma quebra de página
    toc_placeholder = document.add_paragraph("Sumário", style='Heading 1')
    document.add_page_break()

    # 3. Construir o corpo do documento e popular a lista de cabeçalhos
    
    # Seção de Arquitetura (CONDICIONAL)
    if architecture_image_bytes_list:
        _add_and_bookmark_heading(document, "Arquitetura e Escopo", 1, headings_for_toc, numbering_counters)
        _add_and_bookmark_heading(document, "Desenho da Arquitetura", 2, headings_for_toc, numbering_counters)
        for image_bytes in architecture_image_bytes_list:
            try:
                document.add_picture(BytesIO(image_bytes), width=Inches(6.0))
                document.add_paragraph()
            except Exception as e:
                document.add_paragraph(f"Erro ao inserir imagem de arquitetura: {e}")

    _add_and_bookmark_heading(document, "Configuração de Infraestrutura", 1, headings_for_toc, numbering_counters)
    _add_and_bookmark_heading(document, "Instâncias Computacionais", 2, headings_for_toc, numbering_counters)
    _add_instances_table(document, infra_data.instances)

    _add_volume_and_backup_section(document, infra_data, headings_for_toc, numbering_counters)
    
    if hasattr(infra_data, 'volume_groups') and infra_data.volume_groups:
        _add_volume_groups_section(document, infra_data, headings_for_toc, numbering_counters)

    if doc_type == 'full_infra':
        _add_vcn_details_section(document, infra_data, headings_for_toc, numbering_counters)
        if hasattr(infra_data, 'load_balancers') and infra_data.load_balancers:
            _add_load_balancers_section(document, infra_data, headings_for_toc, numbering_counters)
        _add_connectivity_section(document, infra_data, headings_for_toc, numbering_counters)
    
    if doc_type == 'new_host':
        _add_and_bookmark_heading(document, "Conectividade de Rede da(s) Instância(s)", 2, headings_for_toc, numbering_counters)
        sl_map, nsg_map, rt_map = {}, {}, {}
        for data in infra_data.instances:
            for sl in data.security_lists:
                entry = sl_map.setdefault(sl.name, {'rules': sl.rules, 'hosts': []})
                if data.host_name not in entry['hosts']: entry['hosts'].append(data.host_name)
            for nsg in data.network_security_groups:
                entry = nsg_map.setdefault(nsg.name, {'rules': nsg.rules, 'hosts': []})
                if data.host_name not in entry['hosts']: entry['hosts'].append(data.host_name)
            if data.route_table:
                entry = rt_map.setdefault(data.route_table.name, {'rules': data.route_table.rules, 'hosts': []})
                if data.host_name not in entry['hosts']: entry['hosts'].append(data.host_name)
        
        _add_and_bookmark_heading(document, "Security Lists", 3, headings_for_toc, numbering_counters)
        for name, info in sorted(sl_map.items()):
            p = document.add_paragraph(); p.add_run(f"Regras da Security List: {name}").bold = True
            p_hosts = document.add_paragraph(); p_hosts.add_run("Hosts Associados: ").bold = True; p_hosts.add_run(", ".join(sorted(info['hosts'])))
            headers = ["Direção", "Protocolo", "Portas", "Origem/Destino", "Descrição"]
            table = document.add_table(rows=1, cols=len(headers), style='Table Grid'); _style_table_headers(table, headers)
            for rule in info['rules']:
                cells = table.add_row().cells; cells[0].text=rule.direction; cells[1].text=rule.protocol; cells[2].text=rule.ports or "Todas"; cells[3].text=rule.source_or_destination or "N/A"; cells[4].text=rule.description or ''
            document.add_paragraph()

        _add_and_bookmark_heading(document, "Network Security Groups", 3, headings_for_toc, numbering_counters)
        for name, info in sorted(nsg_map.items()):
            p = document.add_paragraph(); p.add_run(f"Regras do NSG: {name}").bold = True
            p_hosts = document.add_paragraph(); p_hosts.add_run("Hosts Associados: ").bold = True; p_hosts.add_run(", ".join(sorted(info['hosts'])))
            table = document.add_table(rows=1, cols=len(headers), style='Table Grid'); _style_table_headers(table, headers)
            for rule in info['rules']:
                cells = table.add_row().cells; cells[0].text=rule.direction; cells[1].text=rule.protocol; cells[2].text=rule.ports or "Todas"; cells[3].text=rule.source_or_destination or "N/A"; cells[4].text=rule.description or ''
            document.add_paragraph()

        _add_and_bookmark_heading(document, "Route Tables", 3, headings_for_toc, numbering_counters)
        for name, info in sorted(rt_map.items()):
            p = document.add_paragraph(); p.add_run(f"Regras da Route Table: {name}").bold = True
            p_hosts = document.add_paragraph(); p_hosts.add_run("Hosts Associados: ").bold = True; p_hosts.add_run(", ".join(sorted(info['hosts'])))
            headers = ["Destino", "Alvo", "Descrição"]
            table = document.add_table(rows=1, cols=len(headers), style='Table Grid'); _style_table_headers(table, headers)
            for rule in info['rules']:
                cells=table.add_row().cells; cells[0].text=rule.destination; cells[1].text=rule.target; cells[2].text=rule.description or ''
            document.add_paragraph()
    
    # Seção de Configurações Adicionais (CONDICIONAL)
    if antivirus_image_bytes_list:
        _add_and_bookmark_heading(document, "Configurações Adicionais", 1, headings_for_toc, numbering_counters)
        _add_and_bookmark_heading(document, "Configuração do Antivírus", 2, headings_for_toc, numbering_counters)
        for image_bytes in antivirus_image_bytes_list:
            try:
                document.add_picture(BytesIO(image_bytes), width=Inches(6.0))
                document.add_paragraph()
            except Exception as e:
                document.add_paragraph(f"Erro ao inserir imagem de antivírus: {e}")

    _add_responsible_section(document, headings_for_toc, numbering_counters, responsible_name)

    # 4. Preencher o sumário no placeholder
    for text, bookmark, level in reversed(headings_for_toc):
        style_name = f'TOC {level}' if f'TOC {level}' in document.styles else 'TOC 1'
        p = document.add_paragraph(style=style_name)
        _add_internal_hyperlink(p, text, bookmark)
        toc_placeholder._p.addnext(p._p)

    # 5. Salvar o documento
    output_dir = "generated_docs"
    os.makedirs(output_dir, exist_ok=True)
    doc_identifier = "Infraestrutura" if doc_type == 'full_infra' else "NovoHost"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_name = f"Doc_{doc_identifier}_{safe_client_name}_{timestamp}.docx"
    output_path = os.path.join(output_dir, file_name)
    
    document.save(output_path)
    return output_path
