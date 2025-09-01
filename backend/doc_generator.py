# OCI DocGen
# Autor: Pedro Teixeira
# Data: 01 de Setembro de 2025
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
    """
    Cria um documento Word (.docx) com base nos detalhes das instâncias e imagens fornecidas.

    Args:
        all_instances_data: Uma lista de objetos InstanceData contendo os detalhes de cada host.
        architecture_image_bytes_list: Uma lista opcional de bytes de imagem para a seção de arquitetura.
        antivirus_image_bytes_list: Uma lista opcional de bytes de imagem para a seção de antivírus.

    Returns:
        O caminho do arquivo .docx gerado.
    """
    # --- 1. Configuração Inicial do Documento ---
    document = Document()
    style = document.styles['Normal']
    font = style.font
    font.name = 'Calibri'
    font.size = Pt(11)

    # Ordena os dados por nome de host para consistência no documento.
    all_instances_data.sort(key=lambda x: x.host_name)

    # Extrai o nome do cliente a partir do nome do compartimento.
    client_name = all_instances_data[0].compartment_name
    if client_name.upper().startswith("SERVERS-"):
        client_name = client_name[8:]

    document.add_heading('Documentação de Novo Host', level=0).alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph(f"Cliente: {client_name}")
    document.add_paragraph(f"Data de Geração: {datetime.now().strftime('%d/%m/%Y')}")

    # --- 2. Geração Dinâmica de Tópicos ---
    # A numeração dos tópicos é ajustada dinamicamente se seções opcionais (como arquitetura) existem.
    topic_number = 1

    # TÓPICO CONDICIONAL: Desenho da Arquitetura
    if architecture_image_bytes_list:
        document.add_heading(f'{topic_number}. Desenho da Arquitetura', level=2)
        for image_bytes in architecture_image_bytes_list:
            try:
                image_stream = BytesIO(image_bytes)
                document.add_picture(image_stream, width=Inches(6.0))
                document.add_paragraph()  # Adiciona um espaço após a imagem.
            except Exception as e:
                document.add_paragraph(f"Erro ao inserir uma imagem da arquitetura: {e}")
        topic_number += 1

    # TÓPICO: Apresentação do Ambiente
    document.add_heading(f'{topic_number}. Apresentação do Ambiente', level=2)
    document.add_paragraph(
        "A tabela a seguir detalha as configurações de cada uma das instâncias "
        "computacionais no escopo desta documentação."
    )
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

    # TÓPICO: Backup da Infraestrutura
    document.add_heading(f'{topic_number}. Backup da Infraestrutura', level=2)
    # Agrupa as políticas de backup para verificar se são todas iguais.
    backup_policies = {data.backup_policy_name for data in all_instances_data}
    if len(backup_policies) == 1:
        # Se todas as instâncias usam a mesma política, exibe um texto consolidado.
        policy_name = backup_policies.pop()
        backup_description = ""
        if policy_name == "CCM-7D":
            backup_description = (
                "O Backup da CCM-7D está configurado por meio de uma Backup Policy aplicada aos volumes "
                "de boot de todos os hosts, garantindo a proteção contínua dos dados.\n\n"
                "A política atual define um agendamento diário do tipo Incremental, executado às 01:00 "
                "(horário regional). Esse tipo de backup copia apenas as alterações realizadas desde o "
                "último backup, otimizando tempo de execução e uso de espaço de armazenamento.\n\n"
                "Os backups gerados possuem retenção de 7 dias, permitindo a restauração de dados em "
                "pontos específicos dentro desse período."
            )
        elif policy_name == "Nenhuma política associada":
            backup_description = "Nenhuma política de backup está atualmente associada aos volumes de boot dos hosts listados."
        else:
            backup_description = f"Todos os hosts estão associados à política de backup customizada: {policy_name}."
        document.add_paragraph(backup_description)
    else:
        # Se as políticas são diferentes, lista a política de cada host.
        document.add_paragraph("As instâncias possuem diferentes políticas de backup associadas:")
        for data in all_instances_data:
            document.add_paragraph(f"  •  Host {data.host_name}: {data.backup_policy_name}", style='List Bullet')
    topic_number += 1

    # TÓPICO: Block Volumes Anexados
    document.add_heading(f'{topic_number}. Block Volumes Anexados', level=2)
    all_block_volumes = []
    for data in all_instances_data:
        for vol in data.block_volumes:
            all_block_volumes.append((data.host_name, vol))

    if all_block_volumes:
        bv_table = document.add_table(rows=1, cols=3, style='Table Grid')
        bv_table.cell(0, 0).text = 'Host de Origem'
        bv_table.cell(0, 1).text = 'Nome do Volume'
        bv_table.cell(0, 2).text = 'Tamanho (GB)'
        for cell in bv_table.rows[0].cells:
            cell.paragraphs[0].runs[0].font.bold = True
        for host_name, vol in all_block_volumes:
            cells = bv_table.add_row().cells
            cells[0].text = host_name
            cells[1].text = vol.display_name
            cells[2].text = str(int(vol.size_in_gbs))
    else:
        document.add_paragraph("Nenhum Block Volume adicional foi encontrado anexado às instâncias.")
    topic_number += 1

    # TÓPICO: Conectividade de Rede
    document.add_heading(f'{topic_number}. Conectividade de Rede', level=2)
    # Agrupa os componentes de rede (SL, NSG, RT) por nome para evitar duplicação.
    sl_map, nsg_map, rt_map = {}, {}, {}
    for data in all_instances_data:
        for sl in data.security_lists:
            sl_map.setdefault(sl.name, {'rules': sl.rules, 'hosts': []})['hosts'].append(data.host_name)
        for nsg in data.network_security_groups:
            nsg_map.setdefault(nsg.name, {'rules': nsg.rules, 'hosts': []})['hosts'].append(data.host_name)
        if data.route_table:
            rt = data.route_table
            rt_map.setdefault(rt.name, {'rules': rt.rules, 'hosts': []})['hosts'].append(data.host_name)

    # Itera sobre os componentes de rede agrupados e cria as tabelas de regras.
    for name, info in sorted(sl_map.items()):
        document.add_paragraph(f"Security List: {name}", style='Heading 3')
        p = document.add_paragraph()
        p.add_run(f"Aplicada a: {', '.join(sorted(list(set(info['hosts']))))}").italic = True
        sl_table = document.add_table(rows=1, cols=4, style='Table Grid')
        for i, h in enumerate(["Direção", "Protocolo", "Origem/Destino", "Descrição"]):
            sl_table.cell(0, i).text = h
            sl_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for rule in info['rules']:
            cells = sl_table.add_row().cells
            cells[0].text = rule.direction
            cells[1].text = rule.protocol
            cells[2].text = rule.source_or_destination or "N/A"
            cells[3].text = rule.description or ''
            
    for name, info in sorted(nsg_map.items()):
        document.add_paragraph(f"NSG: {name}", style='Heading 3')
        p = document.add_paragraph()
        p.add_run(f"Aplicado a: {', '.join(sorted(list(set(info['hosts']))))}").italic = True
        nsg_table = document.add_table(rows=1, cols=4, style='Table Grid')
        for i, h in enumerate(["Direção", "Protocolo", "Origem/Destino", "Descrição"]):
            nsg_table.cell(0, i).text = h
            nsg_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for rule in info['rules']:
            cells = nsg_table.add_row().cells
            cells[0].text = rule.direction
            cells[1].text = rule.protocol
            cells[2].text = rule.source_or_destination or "N/A"
            cells[3].text = rule.description or ''

    for name, info in sorted(rt_map.items()):
        document.add_paragraph(f"Route Table: {name}", style='Heading 3')
        p = document.add_paragraph()
        p.add_run(f"Aplicada a: {', '.join(sorted(list(set(info['hosts']))))}").italic = True
        rt_table = document.add_table(rows=1, cols=3, style='Table Grid')
        for i, h in enumerate(["Destino", "Alvo", "Descrição"]):
            rt_table.cell(0, i).text = h
            rt_table.cell(0, i).paragraphs[0].runs[0].font.bold = True
        for rule in info['rules']:
            cells = rt_table.add_row().cells
            cells[0].text = rule.destination
            cells[1].text = rule.target
            cells[2].text = rule.description or ''
    topic_number += 1

    # TÓPICO CONDICIONAL: Configuração do Antivírus
    if antivirus_image_bytes_list:
        document.add_heading(f'{topic_number}. Configuração do Antivírus', level=2)
        for image_bytes in antivirus_image_bytes_list:
            try:
                image_stream = BytesIO(image_bytes)
                document.add_picture(image_stream, width=Inches(6.0))
                document.add_paragraph()
            except Exception as e:
                document.add_paragraph(f"Erro ao inserir uma imagem do antivírus: {e}")

    # --- 3. Salvando o Documento ---
    output_dir = "generated_docs"
    os.makedirs(output_dir, exist_ok=True)

    # Define um nome de arquivo dinâmico.
    host_identifier = "multihost" if len(all_instances_data) > 1 else all_instances_data[0].host_name.replace(' ', '_')
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_name = f"Doc_{client_name}_{host_identifier}_{timestamp}.docx"
    output_path = os.path.join(output_dir, file_name)

    document.save(output_path)
    return output_path