/**
 * OCI DocGen
 * Autor: Pedro Teixeira
 * Data: 03 de Setembro de 2025
 * Descrição: Script principal do frontend para interatividade da página, comunicação com a API e manipulação do DOM.
 */
document.addEventListener('DOMContentLoaded', () => {

  // --- Configurações e Constantes ---
  const API_BASE_URL = 'http://127.0.0.1:8000';

  // --- Seletores de Elementos do DOM ---
  const regionContainer = document.getElementById('region-select-container');
  const docTypeContainer = document.getElementById('doctype-select-container');
  const instanceStep = document.getElementById('instance-step');
  const compartmentContainer = document.getElementById('compartment-select-container');
  const instanceContainer = document.getElementById('instance-select-container');
  const fetchBtn = document.getElementById('fetch-details-btn');
  const detailsContainer = document.getElementById('details-container');
  const summaryContainer = document.getElementById('fetched-data-summary');
  const generateBtn = document.getElementById('generate-doc-btn');
  const loadingOverlay = document.getElementById('loading-overlay');
  const architectureUpload = document.getElementById('architecture-upload');
  const antivirusUpload = document.getElementById('antivirus-upload');
  const architectureFileList = document.getElementById('architecture-file-list');
  const antivirusFileList = document.getElementById('antivirus-file-list');
  const architectureUploadGroup = document.getElementById('architecture-upload-group');
  const antivirusUploadGroup = document.getElementById('antivirus-upload-group');

  // --- Variáveis de Estado da Aplicação ---
  let selectedRegion = null;
  let selectedDocType = 'new_host';
  let selectedCompartmentId = null;
  let selectedCompartmentName = null;
  let selectedInstances = {};
  // Unifica o armazenamento de dados em um único objeto
  let allInfrastructureData = { instances: [], vcns: [], drgs: [], cpes: [], ipsec_connections: [] };
  let architectureImageFiles = [];
  let antivirusImageFiles = [];

  const toggleLoading = (show) => {
    loadingOverlay.classList.toggle('hidden', !show);
  };

  // --- Funções de UI ---

  function updateUiForDocType() {
    const isInfraDoc = selectedDocType === 'full_infra';
    instanceStep.classList.toggle('hidden', isInfraDoc);
    fetchBtn.querySelector('span').textContent = isInfraDoc ? 'Buscar Dados da Infraestrutura' : 'Buscar Dados da(s) Instância(s)';
    updateFetchButtonState();
  }

  function updateFetchButtonState() {
    const isInfraDoc = selectedDocType === 'full_infra';
    if (isInfraDoc) {
      fetchBtn.disabled = !selectedCompartmentId;
    } else {
      fetchBtn.disabled = Object.keys(selectedInstances).length === 0;
    }
  }

  function createCustomSelect(container, options, placeholder, onSelectCallback, isEnabled = true, isMultiSelect = false) {
    container.innerHTML = '';
    const selected = document.createElement('div');
    selected.classList.add('select-selected');
    if (isMultiSelect) {
      selected.innerHTML = `<div class="selected-items-container"><span class="placeholder">${placeholder}</span></div><span class="select-arrow">▼</span>`;
    } else {
      selected.innerHTML = `<div class="selected-item-display"><span class="placeholder">${placeholder}</span></div><span class="select-arrow">▼</span>`;
    }
    if (!isEnabled) {
      selected.classList.add('disabled');
    }
    container.appendChild(selected);
    const items = document.createElement('div');
    items.classList.add('select-items', 'select-hide');
    const needsSearchBox = [regionContainer, compartmentContainer, instanceContainer].includes(container);
    if (needsSearchBox) {
      const searchBox = document.createElement('input');
      searchBox.type = 'text';
      searchBox.placeholder = 'Buscar...';
      searchBox.className = 'select-search';
      searchBox.addEventListener('click', e => e.stopPropagation());
      searchBox.addEventListener('input', () => {
        const filter = searchBox.value.toUpperCase();
        items.querySelectorAll('.select-item, .select-item-parent').forEach(item => {
          const txtValue = item.textContent || item.innerText;
          item.style.display = txtValue.toUpperCase().indexOf(filter) > -1 ? "" : "none";
        });
      });
      items.appendChild(searchBox);
    }
    options.forEach(option => {
      const item = document.createElement('div');
      const optionValue = option.key || option.id;
      const optionName = option.name || option.display_name;
      item.setAttribute('data-value', optionValue);
      item.setAttribute('data-name', optionName);
      let iconSvg = '';
      if (isMultiSelect) {
        item.classList.add('select-item');
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" x2="6" y1="6" y2="6"></line><line x1="6" x2="6" y1="18" y2="18"></line></svg>`;
        const status = option.status || '';
        const statusClass = status.toLowerCase();
        item.innerHTML = `
          <input type="checkbox" value="${optionValue}" data-name="${optionName}" ${selectedInstances[optionValue] ? 'checked' : ''}>
          <span class="custom-checkbox"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
          <div class="instance-info">
             ${iconSvg}
             <span class="instance-status status-${statusClass}"></span>
             <span class="item-text">${optionName}</span>
             <span class="status-text">(${status})</span>
          </div>`;
      } else {
        item.classList.add('select-item-parent');
        if (container === regionContainer) {
          iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>`;
        } else if (container === docTypeContainer) {
          iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
        } else if (option.level !== undefined) {
          item.classList.remove('select-item-parent');
          item.classList.add(option.level > 0 ? 'select-item' : 'select-item-parent');
          if (option.level > 0) {
            item.style.paddingLeft = `${option.level * 25}px`;
            item.innerHTML = `<span class="item-tree-prefix"></span><span class="item-text">${optionName}</span>`;
          } else {
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`;
          }
        }
        if (iconSvg) {
          item.innerHTML = `${iconSvg}<span class="item-text">${optionName}</span>`;
        } else if (!item.innerHTML) {
          item.innerHTML = `<span class="item-text">${optionName}</span>`
        }
      }
      if (isMultiSelect) {
        const checkbox = item.querySelector('input[type="checkbox"]');
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.target.tagName !== 'INPUT') {
            checkbox.checked = !checkbox.checked;
          }
          onSelectCallback(checkbox.value, checkbox.dataset.name, checkbox.checked);
        });
      } else {
        item.addEventListener('click', () => {
          const selectedContent = selected.querySelector('.selected-item-display');
          selectedContent.innerHTML = item.innerHTML;
          selectedContent.classList.remove('placeholder');
          onSelectCallback(optionValue, optionName);
          closeAllSelects();
        });
      }
      items.appendChild(item);
    });
    container.appendChild(items);
    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selected.classList.contains('disabled')) return;
      const wasOpen = !items.classList.contains('select-hide');
      closeAllSelects(isMultiSelect ? container : null);
      if (!wasOpen) {
        items.classList.toggle('select-hide');
        selected.classList.toggle('select-arrow-active');
      }
    });
  }

  function updateMultiSelectDisplay() {
    const container = instanceContainer.querySelector('.selected-items-container');
    container.innerHTML = '';
    const selectedIds = Object.keys(selectedInstances);
    if (selectedIds.length === 0) {
      container.innerHTML = `<span class="placeholder">Selecione uma ou mais instâncias</span>`;
    } else {
      selectedIds.forEach(id => {
        const tag = document.createElement('span');
        tag.className = 'selected-item-tag';
        tag.textContent = selectedInstances[id];
        container.appendChild(tag);
      });
    }
  }

  function closeAllSelects(except = null) {
    document.querySelectorAll('.select-items').forEach(item => {
      if (item.parentElement !== except) {
        item.classList.add('select-hide');
      }
    });
    document.querySelectorAll('.select-selected').forEach(sel => {
      if (sel.parentElement !== except) {
        sel.classList.remove('select-arrow-active');
      }
    });
  }

  // --- Funções de Coleta de Dados (API) ---

  const fetchRegions = async () => {
    try {
      toggleLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/regions`);
      if (!response.ok) throw new Error('Erro ao buscar regiões');
      const regions = await response.json();
      createCustomSelect(regionContainer, regions, 'Selecione uma região', (selectedValue) => {
        if (selectedRegion !== selectedValue) {
          selectedRegion = selectedValue;
          resetAndFetchCompartments();
        }
      }, true);
    } catch (error) {
      console.error(error);
      alert("Falha ao buscar regiões: " + error.message);
    } finally {
      toggleLoading(false);
    }
  };

  const populateDocTypes = () => {
    const docTypes = [{
      id: 'new_host',
      name: 'Documentação de Novo Host'
    }, {
      id: 'full_infra',
      name: 'Documentação de Infraestrutura'
    }];
    createCustomSelect(docTypeContainer, docTypes, 'Selecione um tipo', (selectedValue) => {
      selectedDocType = selectedValue;
      updateUiForDocType();
    });
    const selectedDisplay = docTypeContainer.querySelector('.selected-item-display');
    selectedDisplay.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg><span class="item-text">Documentação de Novo Host</span>`;
    selectedDisplay.classList.remove('placeholder');
  };

  const fetchCompartments = async () => {
    if (!selectedRegion) return;
    try {
      toggleLoading(true);
      createCustomSelect(compartmentContainer, [], 'Carregando...', () => {}, true, false);
      const response = await fetch(`${API_BASE_URL}/api/${selectedRegion}/compartments`);
      if (!response.ok) throw new Error('Erro ao buscar compartimentos');
      const compartments = await response.json();
      createCustomSelect(compartmentContainer, compartments, 'Selecione um compartimento', (selectedValue, selectedName) => {
        selectedCompartmentId = selectedValue;
        selectedCompartmentName = selectedName;
        resetAndFetchInstances();
        updateFetchButtonState();
      }, true, false);
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      toggleLoading(false);
    }
  };

  const fetchInstances = async () => {
    if (!selectedRegion || !selectedCompartmentId) return;
    try {
      toggleLoading(true);
      createCustomSelect(instanceContainer, [], 'Carregando...', () => {}, true, true);
      const response = await fetch(`${API_BASE_URL}/api/${selectedRegion}/instances/${selectedCompartmentId}`);
      if (!response.ok) throw new Error('Erro ao buscar instâncias');
      const instances = await response.json();
      createCustomSelect(instanceContainer, instances, 'Selecione uma ou mais instâncias', (value, name, isChecked) => {
        if (isChecked) {
          selectedInstances[value] = name;
        } else {
          delete selectedInstances[value];
        }
        updateMultiSelectDisplay();
        updateFetchButtonState();
      }, true, true);
      updateMultiSelectDisplay();
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      toggleLoading(false);
    }
  };

  const fetchAllDetails = async () => {
    if (selectedDocType === 'full_infra') {
      await fetchAllInfrastructureDetails();
    } else {
      await fetchAllInstanceDetails();
    }
  };

  const fetchAllInfrastructureDetails = async () => {
    if (!selectedCompartmentId) return;
    toggleLoading(true);
    detailsContainer.classList.add('hidden');
    summaryContainer.innerHTML = `<p>Buscando dados completos da infraestrutura do compartimento <strong>${selectedCompartmentName}</strong>...</p>`;
    allInfrastructureData = { instances: [], vcns: [], drgs: [], cpes: [], ipsec_connections: [] };
    try {
      const data = await (await fetch(`${API_BASE_URL}/api/${selectedRegion}/infrastructure-details/${selectedCompartmentId}`, { method: 'POST' })).json();
      allInfrastructureData = data;
      const summaryHtml = generateInfrastructureSummary(data, selectedCompartmentName);
      summaryContainer.innerHTML = summaryHtml;
      detailsContainer.classList.remove('hidden');
    } catch (error) {
      console.error(error);
      summaryContainer.innerHTML = `<p class="error-message">${error.message}</p>`;
    } finally {
      toggleLoading(false);
    }
  };

  const fetchAllInstanceDetails = async () => {
    const instanceIds = Object.keys(selectedInstances);
    if (instanceIds.length === 0) return;
    toggleLoading(true);
    detailsContainer.classList.add('hidden');
    allInfrastructureData = { instances: [], vcns: [], drgs: [], cpes: [], ipsec_connections: [] };
    summaryContainer.innerHTML = '<p>Buscando dados...</p>';
    
    // Passa o nome do compartimento para a API
    const promises = instanceIds.map(id => {
      const encodedCompartmentName = encodeURIComponent(selectedCompartmentName);
      const fullUrl = `${API_BASE_URL}/api/${selectedRegion}/instance-details/${id}?compartment_name=${encodedCompartmentName}`;
      return fetch(fullUrl).then(res => res.ok ? res.json() : Promise.reject('Falha ao buscar instância'));
    });

    try {
      const results = await Promise.all(promises);
      allInfrastructureData.instances = results.map(data => data.instances[0]);
      
      let finalHtml = ``;
      allInfrastructureData.instances.forEach(instanceData => {
        finalHtml += generateInstanceSummaryCard(instanceData, false);
      });
      summaryContainer.innerHTML = finalHtml;
      detailsContainer.classList.remove('hidden');
    } catch (error) {
      alert(error);
      summaryContainer.innerHTML = `<p class="error-message">${error}</p>`;
    } finally {
      toggleLoading(false);
    }
  };

  const resetAndFetchCompartments = () => {
    selectedCompartmentId = null;
    selectedInstances = {};
    updateFetchButtonState();
    detailsContainer.classList.add('hidden');
    createCustomSelect(instanceContainer, [], 'Selecione um compartimento primeiro', () => {}, false, true);
    fetchCompartments();
  };

  const resetAndFetchInstances = () => {
    selectedInstances = {};
    updateMultiSelectDisplay();
    updateFetchButtonState();
    detailsContainer.classList.add('hidden');
    fetchInstances();
  };

  // --- Funções de Geração de Conteúdo e Documentos ---

  function generateInfrastructureSummary(data, compartmentName) {
    const { instances, vcns, drgs, cpes, ipsec_connections } = data;
    const instancesHtml = instances.length > 0 ? instances.map(instance => generateInstanceSummaryCard(instance, true)).join('') : '<p class="no-data-message">Nenhuma instância encontrada.</p>';
    const createTable = (headers, rows) => {
      if (rows.length === 0) return '<p class="no-data-message">Nenhum recurso encontrado.</p>';
      const headerHtml = headers.map(h => `<th>${h}</th>`).join('');
      const bodyHtml = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
      return `<div class="table-container"><table class="resource-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
    };
    const vcnsHtml = vcns.length > 0 ? vcns.map(vcn => {
      const subnetsTable = createTable(['Nome da Subnet', 'CIDR Block'], vcn.subnets.map(s => [s.display_name, s.cidr_block]));
      const slTable = createTable(['Nome', 'Nº de Regras'], vcn.security_lists.map(sl => [sl.name, `${sl.rules.length}`]));
      const rtTable = createTable(['Nome', 'Nº de Regras'], vcn.route_tables.map(rt => [rt.name, `${rt.rules.length}`]));
      const nsgTable = createTable(['Nome', 'Nº de Regras'], vcn.network_security_groups.map(nsg => [nsg.name, `${nsg.rules.length}`]));
      return `<div class="vcn-summary-card collapsible"><div class="vcn-card-header"><h4 class="vcn-card-header-title">${vcn.display_name}</h4><span class="vcn-card-header-cidr">${vcn.cidr_block}</span><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="vcn-card-body"><div class="vcn-details"><span><strong>CIDR Block:</strong> ${vcn.cidr_block}</span></div><h5 class="subheader">Subnets</h5>${subnetsTable}<h5 class="subheader">Security Lists</h5>${slTable}<h5 class="subheader">Route Tables</h5>${rtTable}<h5 class="subheader">Network Security Groups (NSGs)</h5>${nsgTable}</div></div>`;
    }).join('') : '<p class="no-data-message">Nenhuma VCN encontrada.</p>';
    const drgsHtml = createTable(['Nome do DRG', 'Anexos'], drgs.map(drg => [drg.display_name, drg.attachments.map(a => `${a.display_name} (${a.network_type})`).join('<br>') || 'Nenhum']));
    const cpesHtml = createTable(['Nome do CPE', 'Endereço IP', 'Fabricante'], cpes.map(cpe => [cpe.display_name, cpe.ip_address, cpe.vendor || 'N/A']));
    const ipsecHtml = ipsec_connections.length > 0 ? ipsec_connections.map(ipsec => {
        const cpeName = cpes.find(c => c.id === ipsec.cpe_id)?.display_name || 'Não encontrado';
        const drgName = drgs.find(d => d.id === ipsec.drg_id)?.display_name || 'Não encontrado';
        const tunnelsHtml = ipsec.tunnels.map(tunnel => {
            const p1Details = tunnel.phase_one_details;
            const p2Details = tunnel.phase_two_details;
            return `<div class="tunnel-details"><div class="tunnel-header"><strong>Túnel: ${tunnel.display_name}</strong><span class="status-badge status-${tunnel.status.toLowerCase()}">${tunnel.status}</span></div><ul class="tunnel-basic-info"><li><strong>IP Oracle:</strong> ${tunnel.vpn_oracle_ip}</li><li><strong>IP do CPE:</strong> ${tunnel.cpe_ip}</li><li><strong>Roteamento:</strong> ${tunnel.routing_type}</li><li><strong>IKE:</strong> ${tunnel.ike_version}</li></ul><div class="crypto-details-grid"><div><h6 class="tunnel-subheader">Criptografia Fase 1 (IKE)</h6><ul><li><strong>Autenticação:</strong> ${p1Details.authentication_algorithm}</li><li><strong>Criptografia:</strong> ${p1Details.encryption_algorithm}</li><li><strong>Grupo DH:</strong> ${p1Details.dh_group}</li><li><strong>Lifetime:</strong> ${p1Details.lifetime_in_seconds}s</li></ul></div><div><h6 class="tunnel-subheader">Criptografia Fase 2 (IPSec)</h6><ul><li><strong>Autenticação:</strong> ${p2Details.authentication_algorithm}</li><li><strong>Criptografia:</strong> ${p2Details.encryption_algorithm}</li><li><strong>Lifetime:</strong> ${p2Details.lifetime_in_seconds}s</li></ul></div></div></div>`}).join('<hr class="tunnel-divider">');
        return `<div class="ipsec-summary-card collapsible"><div class="ipsec-card-header"><h4 class="ipsec-card-header-title">${ipsec.display_name}</h4><span class="status-badge status-${ipsec.status.toLowerCase()}">${ipsec.status}</span><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="ipsec-card-body"><div class="ipsec-details"><span><strong>CPE Associado:</strong> ${cpeName}</span><span><strong>DRG Associado:</strong> ${drgName}</span></div><div class="ipsec-details"><span class="full-width"><strong>Redes Remotas (Rotas Estáticas):</strong> ${ipsec.static_routes.join(', ') || 'Nenhuma'}</span></div><h5 class="subheader">Túneis</h5>${tunnelsHtml || '<p class="no-data-message">Nenhum túnel encontrado.</p>'}</div></div>`;
    }).join('') : '<p class="no-data-message">Nenhuma conexão IPSec encontrada.</p>';
    return `<div><h3 class="infra-summary-main-title">Resumo da Infraestrutura: ${compartmentName}</h3><fieldset><legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" x2="6" y1="6" y2="6"></line><line x1="6" x2="6" y1="18" y2="18"></line></svg>Instâncias Computacionais</legend><div class="instances-container">${instancesHtml}</div></fieldset><hr class="fieldset-divider"><fieldset><legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>Virtual Cloud Networks (VCNs)</legend><div class="vcn-container">${vcnsHtml}</div></fieldset><hr class="fieldset-divider"><fieldset><legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M2 12h20M7 7l5 5-5 5M17 7l-5 5 5 5"></path></svg>Conectividade de Roteamento</legend><h4 class="subheader">Dynamic Routing Gateways (DRGs)</h4>${drgsHtml}</fieldset><hr class="fieldset-divider"><fieldset><legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>Conectividade VPN</legend><h4 class="subheader">Customer-Premises Equipment (CPEs)</h4>${cpesHtml}<h4 class="subheader">Conexões VPN IPSec</h4><div class="ipsec-container">${ipsecHtml}</div></fieldset></div>`;
  }

  function generateInstanceSummaryCard(data, isCollapsible = false) {
    const cardContent = `<fieldset><legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg>Dados da Instância</legend><div class="grid-container"><div class="info-group"><label>Shape</label><div class="info-value">${data.shape}</div></div><div class="info-group"><label>OCPUs</label><div class="info-value">${data.ocpus}</div></div><div class="info-group"><label>Memória (GB)</label><div class="info-value">${data.memory}</div></div><div class="info-group"><label>Boot Volume (GB)</label><div class="info-value">${data.boot_volume_gb}</div></div><div class="info-group full-width"><label>Sistema Operacional</label><div class="info-value">${data.os_name}</div></div><div class="info-group"><label>IP Privado</label><div class="info-value">${data.private_ip}</div></div><div class="info-group"><label>IP Público</label><div class="info-value">${data.public_ip || 'N/A'}</div></div><div class="info-group full-width"><label>Política de Backup (Boot Volume)</label><div class="info-value">${data.backup_policy_name}</div></div></div></fieldset><hr class="fieldset-divider"><fieldset><legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line></svg>Block Volumes Anexados</legend><div class="table-container">${data.block_volumes && data.block_volumes.length > 0 ? `<table class="bv-table"><thead><tr><th>Nome do Volume</th><th>Tamanho (GB)</th><th>Política de Backup</th></tr></thead><tbody>${data.block_volumes.map(vol => `<tr><td>${vol.display_name}</td><td>${vol.size_in_gbs}</td><td>${vol.backup_policy_name}</td></tr>`).join('')}</tbody></table>` : `<p class="no-data-message">Nenhum Block Volume adicional anexado.</p>`}</div></fieldset><hr class="fieldset-divider"><fieldset><legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M2 12h20M7 7l5 5-5 5M17 7l-5 5 5 5"></path></svg>Resumo de Conectividade de Rede</legend><div class="summary-grid"><div class="summary-group"><label>Security Lists</label><div class="summary-box">${data.security_lists && data.security_lists.length > 0 ? data.security_lists.map(sl => `<span class="summary-item">${sl.name}</span>`).join('') : `<span class="summary-item empty">Nenhuma</span>`}</div></div><div class="summary-group"><label>Network Security Groups (NSGs)</label><div class="summary-box">${data.network_security_groups && data.network_security_groups.length > 0 ? data.network_security_groups.map(nsg => `<span class="summary-item">${nsg.name}</span>`).join('') : `<span class="summary-item empty">Nenhum</span>`}</div></div><div class="summary-group full-width"><label>Route Table</label><div class="summary-box">${data.route_table && data.route_table.name ? `<span class="summary-item">${data.route_table.name}</span>` : `<span class="summary-item empty">Nenhuma</span>`}</div></div></div></fieldset>`;
    if (isCollapsible) {
      const isRunning = data.lifecycle_state === 'RUNNING';
      const statusText = isRunning ? 'Ligada' : 'Desligada';
      const statusClass = isRunning ? 'running' : 'stopped';
      return `<div class="instance-summary-card collapsible"><div class="instance-card-header"><h4 class="card-header-title">${data.host_name}</h4><div class="card-status-indicator"><span class="status-dot ${statusClass}"></span><span class="status-label ${statusClass}">${statusText}</span></div><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="instance-card-body">${cardContent}</div></div>`;
    } else {
      return `<div class="instance-summary-card"><h3 class="instance-summary-title">${data.host_name}</h3>${cardContent}</div>`;
    }
  }

  const generateDocument = async () => {
    // Função unificada
    if (!allInfrastructureData || allInfrastructureData.instances.length === 0) {
        alert("Busque os dados da infraestrutura ou da(s) instância(s) primeiro.");
        return;
    }
    try {
        toggleLoading(true);
        const formData = new FormData();
        // Monta o payload padronizado
        const payload = {
            doc_type: selectedDocType,
            infra_data: allInfrastructureData
        };
        formData.append('json_data', JSON.stringify(payload));
        architectureImageFiles.forEach(file => formData.append('architecture_files', file));
        antivirusImageFiles.forEach(file => formData.append('antivirus_files', file));
        
        const response = await fetch(`${API_BASE_URL}/api/generate-document`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData.detail || errorData));
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // Nome do arquivo dinâmico
        const compartmentName = allInfrastructureData.instances[0].compartment_name.replace('SERVERS-','');
        const docIdentifier = selectedDocType === 'full_infra' ? 'Infraestrutura' : 'NovoHost';
        const timestamp = new Date().toISOString().split('T')[0];
        const docName = `Doc_${docIdentifier}_${compartmentName}_${timestamp}.docx`;
        a.download = docName;

        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (error) {
        console.error(error);
        alert("Erro ao gerar documento: " + error.message);
    } finally {
        toggleLoading(false);
    }
  };

  // --- Funções de Manipulação de Arquivos ---

  function updateFileListUI(fileArray, fileListContainer) {
    fileListContainer.innerHTML = '';
    if (fileArray.length === 0) return;
    fileArray.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-list-item';
        fileItem.innerHTML = `<img src="${e.target.result}" alt="${file.name}" class="file-list-preview"><span class="file-list-name">${file.name}</span><button class="file-list-delete-btn" data-index="${index}" title="Remover arquivo"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`;
        fileListContainer.appendChild(fileItem);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleFileSelect(event, fileArray, fileListContainer) {
    const newFiles = event.target.files;
    if (!newFiles || newFiles.length === 0) return;
    Array.from(newFiles).forEach(file => fileArray.push(file));
    updateFileListUI(fileArray, fileListContainer);
    event.target.value = '';
  }

  async function handlePaste(event, fileArray, fileListContainer) {
    event.preventDefault();
    const items = event.clipboardData.items;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        const timestamp = new Date().getTime();
        const extension = blob.type.split('/')[1];
        const fileName = `colado_${timestamp}.${extension}`;
        const imageFile = new File([blob], fileName, {
          type: blob.type
        });
        fileArray.push(imageFile);
      }
    }
    updateFileListUI(fileArray, fileListContainer);
  }

  function handleFileDelete(event, fileArray, fileListContainer) {
    const deleteButton = event.target.closest('.file-list-delete-btn');
    if (!deleteButton) return;
    const indexToRemove = parseInt(deleteButton.dataset.index, 10);
    if (!isNaN(indexToRemove)) {
      fileArray.splice(indexToRemove, 1);
      updateFileListUI(fileArray, fileListContainer);
    }
  }

  // --- Inicialização ---

  const initializeApp = () => {
    fetchRegions();
    populateDocTypes();
    createCustomSelect(compartmentContainer, [], 'Selecione uma região primeiro', () => {}, false, false);
    createCustomSelect(instanceContainer, [], 'Selecione um compartimento primeiro', () => {}, false, true);
  };

  // --- Adição dos Event Listeners ---
  fetchBtn.addEventListener('click', fetchAllDetails);
  generateBtn.addEventListener('click', generateDocument);
  document.addEventListener('click', closeAllSelects);
  
  summaryContainer.addEventListener('click', (event) => {
      const header = event.target.closest('.instance-card-header, .vcn-card-header, .ipsec-card-header');
      if (header) {
          const card = header.closest('.collapsible');
          if (card) {
            card.classList.toggle('expanded');
          }
      }
  });

  architectureUpload.addEventListener('change', (e) => handleFileSelect(e, architectureImageFiles, architectureFileList));
  antivirusUpload.addEventListener('change', (e) => handleFileSelect(e, antivirusImageFiles, antivirusFileList));
  architectureUploadGroup.addEventListener('paste', (e) => handlePaste(e, architectureImageFiles, architectureFileList));
  antivirusUploadGroup.addEventListener('paste', (e) => handlePaste(e, antivirusImageFiles, antivirusFileList));
  architectureFileList.addEventListener('click', (e) => handleFileDelete(e, architectureImageFiles, architectureFileList));
  antivirusFileList.addEventListener('click', (e) => handleFileDelete(e, antivirusImageFiles, antivirusFileList));

  // --- Início da Aplicação ---
  initializeApp();
});