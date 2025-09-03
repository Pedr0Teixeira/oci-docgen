# OCI DocGen
# Autor: Pedro Teixeira
# Data: 03 de Setembro de 2025
# Descrição: Módulo responsável por gerar o documento .docx com base nos dados da infraestrutura coletados.

import os
from datetime import datetime
from io import BytesIO
from typing import List, Optional

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

from schemas import InstanceData


def generate_documentation(
    all_instances_data: List[InstanceData],
    architecture_image_bytes_list: Optional[List[bytes]] = None,
    antivirus_image_bytes_list: Optional[List[bytes]] = None
) -> str:
    """Cria um documento Word (.docx) com base nos detalhes das instâncias e imagens fornecidas."""
    
    # --- 1. Configuração Inicial do Documento ---
    document = Document()
    style = document.styles['Normal']
    font = style.font
    font.name = 'Calibri'
    font.size = Pt(11)

    all_instances_data.sort(key=lambda x: x.host_name)

    client_name = all_instances_data[0].compartment_name
    if client_name.upper().startswith("SERVERS-"):
        client_name = client_name[8:]

    document.add_heading('Documentação de Novo Host', level=0).alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph(f"Cliente: {client_name}")
    document.add_paragraph(f"Data de Geração: {datetime.now().strftime('%d/%m/%Y')}")

    topic_number = 1

    if architecture_image_bytes_list:
        document.add_heading(f'{topic_number}. Desenho da Arquitetura', level=2)
        for image_bytes in architecture_image_bytes_list:
            try:
                image_stream = BytesIO(image_bytes)
                document.add_picture(image_stream, width=Inches(6.0))
                document.add_paragraph()
            except Exception as e:
                document.add_paragraph(f"Erro ao inserir uma imagem da arquitetura: {e}")
        topic_number += 1

    document.add_heading(f'{topic_number}. Apresentação do Ambiente', level=2)
    document.add_paragraph("A tabela a seguir detalha as configurações de cada uma das instâncias computacionais no escopo desta documentação.")
    host_table = document.add_table(rows=1, cols=8, style='Table Grid')
    headers = ['HOST', 'SHAPE', 'OCPU', 'MEMÓRIA (GB)', 'BOOT VOL (GB)', 'S.O.', 'IP PRIVADO', 'IP PÚBLICO']
    for i, header in enumerate(headers):
        cell = host_table.cell(0, i)
        cell.text = header
        cell.paragraphs[0].runs[0].font.bold = True
    for data in all_instances_data:
        row_cells = host_table.add_row().cells
        row_cells[0].text = data.host_name
        row_cells[1].text = data.shape
        row_cells[2].text = str(data.ocpus)
        row_cells[3].text = str(data.memory)
        row_cells[4].text = str(data.boot_volume_gb)
        row_cells[5].text = data.os_name
        row_cells[6].text = data.private_ip
        row_cells[7].text = data.public_ip or "N/A"
    topic_number += 1

    # --- Seção de Backup reestruturada ---
    document.add_heading(f'{topic_number}. Backup da Infraestrutura', level=2)
    
    def get_policy_description(policy_name: str) -> str:
        if policy_name == "CCM-7D":
            return (
                "O Backup da CCM-7D está configurado por meio de uma Backup Policy aplicada ao "
                "volume, garantindo a proteção contínua dos dados.\n\n"
                "A política atual define um agendamento diário do tipo Incremental, executado às 01:00 "
                "(horário regional). Esse tipo de backup copia apenas as alterações realizadas desde o "
                "último backup, otimizando tempo de execução e uso de espaço de armazenamento.\n\n"
                "Os backups gerados possuem retenção de 7 dias, permitindo a restauração de dados em "
                "pontos específicos dentro desse período.\n\n"
                "Essa política garante que, em caso de falhas, seja possível recuperar o volume "
                "rapidamente, minimizando impacto e perda de informações."
            )
        elif policy_name == "Nenhuma política associada":
            return "O volume não possui uma política de backup automatizada associada."
        else:
            return f"O volume está protegido pela política de backup customizada: '{policy_name}'."

    # Subtópico para Boot Volumes
    document.add_paragraph("Backup de Boot Volume", style='Heading 3')
    boot_backup_policies = {data.backup_policy_name for data in all_instances_data}
    if len(boot_backup_policies) == 1:
        policy_name = boot_backup_policies.pop()
        document.add_paragraph(get_policy_description(policy_name))
    else:
        document.add_paragraph("As instâncias possuem diferentes políticas de backup associadas aos seus Boot Volumes:")
        # Lógica para usar a descrição detalhada para cada item da lista ---
        for data in all_instances_data:
            # Pega a descrição completa da política do host atual.
            description = get_policy_description(data.backup_policy_name)
            
            # Cria um novo parágrafo com o estilo de lista (que adiciona o "•").
            p = document.add_paragraph(style='List Bullet')
            
            # Adiciona o nome do host em negrito.
            p.add_run(f"Host {data.host_name}: ").bold = True
            
            # Adiciona a descrição correspondente.
            p.add_run(description)
            
    # Subtópico para Block Volumes
    document.add_paragraph("Backup de Block Volumes Anexados", style='Heading 3')
    bvs_with_backup = []
    for data in all_instances_data:
        for vol in data.block_volumes:
            if vol.backup_policy_name != "Nenhuma política associada":
                bvs_with_backup.append((data.host_name, vol))

    if bvs_with_backup:
        document.add_paragraph("A tabela a seguir detalha as políticas de backup aplicadas aos Block Volumes adicionais.")
        bv_backup_table = document.add_table(rows=1, cols=3, style='Table Grid')
        headers = ['Host de Origem', 'Nome do Volume', 'Política de Backup Aplicada']
        for i, header in enumerate(headers):
            cell = bv_backup_table.cell(0, i)
            cell.text = header
            cell.paragraphs[0].runs[0].font.bold = True
        
        for host_name, vol in bvs_with_backup:
            cells = bv_backup_table.add_row().cells
            cells[0].text = host_name
            cells[1].text = vol.display_name
            cells[2].text = vol.backup_policy_name
    else:
        document.add_paragraph("Nenhuma política de backup foi encontrada associada aos Block Volumes adicionais anexados às instâncias.")
    topic_number += 1
    # --- Fim da Seção de Backup ---

    document.add_heading(f'{topic_number}. Block Volumes Anexados', level=2)
    all_block_volumes = [vol for data in all_instances_data for vol in data.block_volumes]
    if all_block_volumes:
        bv_table = document.add_table(rows=1, cols=3, style='Table Grid')
        headers = ['Host de Origem', 'Nome do Volume', 'Tamanho (GB)']
        for i, header in enumerate(headers):
            bv_table.cell(0, i).text = header
            bv_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for data in all_instances_data:
            for vol in data.block_volumes:
                cells = bv_table.add_row().cells
                cells[0].text = data.host_name
                cells[1].text = vol.display_name
                cells[2].text = str(int(vol.size_in_gbs))
    else:
        document.add_paragraph("Nenhum Block Volume adicional foi encontrado anexado às instâncias.")
    topic_number += 1

    document.add_heading(f'{topic_number}. Conectividade de Rede', level=2)
    sl_map, nsg_map, rt_map = {}, {}, {}
    for data in all_instances_data:
        for sl in data.security_lists:
            sl_map.setdefault(sl.name, {'rules': sl.rules, 'hosts': []})['hosts'].append(data.host_name)
        for nsg in data.network_security_groups:
            nsg_map.setdefault(nsg.name, {'rules': nsg.rules, 'hosts': []})['hosts'].append(data.host_name)
        if data.route_table:
            rt_map.setdefault(data.route_table.name, {'rules': data.route_table.rules, 'hosts': []})['hosts'].append(data.host_name)

    headers_net = ["Direção", "Protocolo", "Portas", "Origem/Destino", "Descrição"]
    for name, info in sorted(sl_map.items()):
        document.add_paragraph(f"Security List: {name}", style='Heading 3')
        p = document.add_paragraph()
        p.add_run(f"Aplicada a: {', '.join(sorted(list(set(info['hosts']))))}").italic = True
        sl_table = document.add_table(rows=1, cols=len(headers_net), style='Table Grid')
        for i, h in enumerate(headers_net):
            sl_table.cell(0, i).text = h
            sl_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for rule in info['rules']:
            cells = sl_table.add_row().cells
            cells[0].text = rule.direction
            cells[1].text = rule.protocol
            cells[2].text = rule.ports or "N/A"
            cells[3].text = rule.source_or_destination or "N/A"
            cells[4].text = rule.description or ''
            
    for name, info in sorted(nsg_map.items()):
        document.add_paragraph(f"NSG: {name}", style='Heading 3')
        p = document.add_paragraph()
        p.add_run(f"Aplicado a: {', '.join(sorted(list(set(info['hosts']))))}").italic = True
        nsg_table = document.add_table(rows=1, cols=len(headers_net), style='Table Grid')
        for i, h in enumerate(headers_net):
            nsg_table.cell(0, i).text = h
            nsg_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for rule in info['rules']:
            cells = nsg_table.add_row().cells
            cells[0].text = rule.direction
            cells[1].text = rule.protocol
            cells[2].text = rule.ports or "N/A"
            cells[3].text = rule.source_or_destination or "N/A"
            cells[4].text = rule.description or ''

    for name, info in sorted(rt_map.items()):
        document.add_paragraph(f"Route Table: {name}", style='Heading 3')
        p = document.add_paragraph()
        p.add_run(f"Aplicada a: {', '.join(sorted(list(set(info['hosts']))))}").italic = True
        rt_table = document.add_table(rows=1, cols=3, style='Table Grid')
        headers_rt = ["Destino", "Alvo", "Descrição"]
        for i, h in enumerate(headers_rt):
            rt_table.cell(0, i).text = h
            rt_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for rule in info['rules']:
            cells = rt_table.add_row().cells
            cells[0].text = rule.destination
            cells[1].text = rule.target
            cells[2].text = rule.description or ''
    topic_number += 1
    
    if antivirus_image_bytes_list:
        document.add_heading(f'{topic_number}. Configuração do Antivírus', level=2)
        for image_bytes in antivirus_image_bytes_list:
            try:
                image_stream = BytesIO(image_bytes)
                document.add_picture(image_stream, width=Inches(6.0))
                document.add_paragraph()
            except Exception as e:
                document.add_paragraph(f"Erro ao inserir uma imagem do antivírus: {e}")

    output_dir = "generated_docs"
    os.makedirs(output_dir, exist_ok=True)
    host_identifier = "multihost" if len(all_instances_data) > 1 else all_instances_data[0].host_name.replace(' ', '_')
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_name = f"Doc_{client_name}_{host_identifier}_{timestamp}.docx"
    output_path = os.path.join(output_dir, file_name)
    document.save(output_path)
    return output_path

