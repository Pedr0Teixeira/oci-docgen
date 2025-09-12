/**
 * OCI DocGen
 * Autor: Pedro Teixeira
 * Data: 12 de Setembro de 2025 
 * Descrição: Script principal do frontend para interatividade da página, comunicação com a API e manipulação do DOM.
 */
document.addEventListener('DOMContentLoaded', () => {

  // --- Configurações e Constantes ---
  const API_BASE_URL = 'http://127.0.0.1:8000';

  // --- Seletores de Elementos do DOM ---
  const mainAppContainer = document.getElementById('main-app-container');
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
  const toastContainer = document.getElementById('toast-container');
  const progressText = document.getElementById('progress-text');
  const progressBar = document.getElementById('progress-bar');
  const progressSpinner = loadingOverlay.querySelector('.spinner');
  const successScreen = document.getElementById('success-screen');
  const newDocBtn = document.getElementById('new-doc-btn');
  const responsibleNameInput = document.getElementById('responsible-name-input');


  // --- Variáveis de Estado da Aplicação ---
  let selectedRegion = null;
  let selectedDocType = null;
  let selectedCompartmentId = null;
  let selectedCompartmentName = null;
  let selectedInstances = {};
  let allInfrastructureData = { instances: [], vcns: [], drgs: [], cpes: [], ipsec_connections: [], load_balancers: [], volume_groups: [] };
  let architectureImageFiles = [];
  let antivirusImageFiles = [];
  
  // --- Funções de UI ---

  function showToast(message, type = 'success') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' 
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toast-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toast-icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="8" y2="12"></line><line x1="12" x2="12.01" y1="16" y2="16"></line></svg>`;

    toast.innerHTML = `${icon}<span>${message}</span>`;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }
  
  const showProgress = (isSimulated = false) => {
    loadingOverlay.classList.remove('hidden');
    progressSpinner.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = 'Iniciando...';
    
    if (isSimulated) {
        progressSpinner.style.display = 'none';
    }
  };

  const updateProgress = (percentage, text) => {
    if (percentage > 0) progressSpinner.style.display = 'none';
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = text;
  };

  const hideProgress = () => {
    loadingOverlay.classList.add('hidden');
  };
  
  const toggleLoading = (show) => {
      if (show) {
          progressSpinner.style.display = 'block';
          progressText.textContent = 'Carregando...';
          progressBar.style.width = '0%';
          loadingOverlay.classList.remove('hidden');
      } else {
          loadingOverlay.classList.add('hidden');
      }
  };
  
  const showSuccessScreen = () => {
    mainAppContainer.classList.add('hidden');
    successScreen.classList.remove('hidden');
    const icon = successScreen.querySelector('.success-icon');
    const newIcon = icon.cloneNode(true);
    icon.parentNode.replaceChild(newIcon, icon);
  }

  const resetApp = () => {
    successScreen.classList.add('hidden');
    mainAppContainer.classList.remove('hidden');
    
    selectedRegion = null;
    selectedDocType = null;
    selectedCompartmentId = null;
    selectedCompartmentName = null;
    selectedInstances = {};
    allInfrastructureData = { instances: [], vcns: [], drgs: [], cpes: [], ipsec_connections: [], load_balancers: [], volume_groups: [] };
    architectureImageFiles = [];
    antivirusImageFiles = [];

    detailsContainer.classList.add('hidden');
    summaryContainer.innerHTML = '';
    architectureFileList.innerHTML = '';
    antivirusFileList.innerHTML = '';
    responsibleNameInput.value = '';
    
    initializeApp();
  }

  function updateUiForDocType() {
    const isInfraDoc = selectedDocType === 'full_infra';
    const isNewHost = selectedDocType === 'new_host';
    instanceStep.classList.toggle('hidden', !isNewHost);
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

      const itemsListContainer = document.createElement('div');
      itemsListContainer.className = 'select-items-list';

      if (needsSearchBox) {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'select-search-container';
        const searchBox = document.createElement('input');
        searchBox.type = 'text';
        searchBox.placeholder = 'Buscar...';
        searchBox.className = 'select-search';
        searchBox.addEventListener('click', e => e.stopPropagation());
        searchBox.addEventListener('input', () => {
          const filter = searchBox.value.toUpperCase();
          const allListItems = Array.from(itemsListContainer.querySelectorAll('.select-item, .select-item-parent'));
          
          if (!filter) {
              allListItems.forEach(item => item.style.display = "");
              return;
          }

          let itemsToShow = new Set();
          
          allListItems.forEach(item => {
            const txtValue = item.textContent || item.innerText;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
              itemsToShow.add(item);
            }
          });

          itemsToShow.forEach(item => {
            let currentLevel = parseInt(item.dataset.level, 10);
            if (isNaN(currentLevel) || currentLevel === 0) return;
            let currentIndex = allListItems.indexOf(item);
            for (let i = currentIndex - 1; i >= 0; i--) {
              const potentialParent = allListItems[i];
              const parentLevel = parseInt(potentialParent.dataset.level, 10);
              if (parentLevel < currentLevel) {
                itemsToShow.add(potentialParent);
                currentLevel = parentLevel; 
                if (currentLevel === 0) break;
              }
            }
          });

          allListItems.forEach(item => {
            item.style.display = itemsToShow.has(item) ? "" : "none";
          });
        });
        searchContainer.appendChild(searchBox);
        items.appendChild(searchContainer);
      }
      
      options.forEach(option => {
        const item = document.createElement('div');
        const optionValue = option.key || option.id;
        const optionName = option.name || option.display_name;
        item.setAttribute('data-value', optionValue);
        item.setAttribute('data-name', optionName);
        
        let iconSvg = '';
        if (option.level !== undefined) {
          item.dataset.level = option.level;
        }

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
        itemsListContainer.appendChild(item);
      });

      items.appendChild(itemsListContainer);
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
      showToast("Falha ao buscar regiões: " + error.message, 'error');
    } finally {
      toggleLoading(false);
    }
  };

  const populateDocTypes = () => {
    const docTypes = [{ id: 'new_host', name: 'Documentação de Novo Host' }, { id: 'full_infra', name: 'Documentação de Infraestrutura' }];
    createCustomSelect(docTypeContainer, docTypes, 'Selecione um tipo', (selectedValue) => {
      selectedDocType = selectedValue;
      updateUiForDocType();
    });
  };

  const fetchCompartments = async () => {
    if (!selectedRegion) return;
    try {
      toggleLoading(true);
      createCustomSelect(compartmentContainer, [], 'Carregando...', () => {}, false, false);
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
      showToast(error.message, 'error');
    } finally {
      toggleLoading(false);
    }
  };

  const fetchInstances = async () => {
    if (!selectedRegion || !selectedCompartmentId) return;
    try {
      toggleLoading(true);
      createCustomSelect(instanceContainer, [], 'Carregando...', () => {}, false, true);
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
      showToast(error.message, 'error');
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
    showProgress(true);
    detailsContainer.classList.add('hidden');
    allInfrastructureData = { instances: [], vcns: [], drgs: [], cpes: [], ipsec_connections: [], load_balancers: [], volume_groups: [] };
    
    const steps = [
        { pct: 15, msg: 'Analisando Redes (VCNs)...' },
        { pct: 30, msg: 'Coletando Listas de Segurança...' },
        { pct: 45, msg: 'Verificando Tabelas de Roteamento...' },
        { pct: 60, msg: 'Mapeando Conectividade (DRGs & VPNs)...' },
        { pct: 75, msg: 'Inspecionando Load Balancers...' },
        { pct: 90, msg: 'Coletando detalhes das instâncias...' }
    ];
    let currentStep = 0;
    const simulatedProgressInterval = setInterval(() => {
        if (currentStep < steps.length) {
            const step = steps[currentStep];
            updateProgress(step.pct, step.msg);
            currentStep++;
        }
    }, 800);

    try {
      const response = await fetch(`${API_BASE_URL}/api/${selectedRegion}/infrastructure-details/${selectedCompartmentId}`, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Falha na API: ${errorData.detail || response.statusText}`);
      }
      const data = await response.json();
      allInfrastructureData = data;
      const summaryHtml = generateInfrastructureSummary(data);
      summaryContainer.innerHTML = summaryHtml;
      detailsContainer.classList.remove('hidden');
      updateProgress(100, 'Dados coletados com sucesso!');
    } catch (error) {
      console.error(error);
      summaryContainer.innerHTML = `<p class="error-message">${error.message}</p>`;
      showToast(error.message, 'error');
    } finally {
      clearInterval(simulatedProgressInterval);
      setTimeout(hideProgress, 500);
    }
  };

  const fetchAllInstanceDetails = async () => {
    const instanceIds = Object.keys(selectedInstances);
    const total = instanceIds.length;
    if (total === 0) return;
    
    let progressInterval = null;
    let simulatedProgress = 0;
    let instancesProcessed = 0;
    
    showProgress(false);
    updateProgress(0, `Coletando 0 de ${total} instâncias...`);
    detailsContainer.classList.add('hidden');
    allInfrastructureData = { instances: [], vcns: [], drgs: [], cpes: [], ipsec_connections: [], load_balancers: [], volume_groups: [] };

    progressInterval = setInterval(() => {
        if (simulatedProgress < 90) {
            simulatedProgress += 2;
            instancesProcessed = Math.min(total, Math.floor((simulatedProgress / 90) * total));
            updateProgress(simulatedProgress, `Coletando ${instancesProcessed} de ${total} instâncias...`);
        }
    }, 150);

    const payload = {
        instance_ids: instanceIds,
        compartment_id: selectedCompartmentId,
        compartment_name: selectedCompartmentName
    };

    try {
        const response = await fetch(`${API_BASE_URL}/api/${selectedRegion}/new-host-details`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Falha na API: ${errorData.detail || response.statusText}`);
        }
        
        updateProgress(95, 'Processando dados recebidos...');
        const data = await response.json();
        allInfrastructureData = data;
        
        const summaryHtml = generateInfrastructureSummary(data, true);
        summaryContainer.innerHTML = summaryHtml;
        detailsContainer.classList.remove('hidden');
        updateProgress(100, 'Dados coletados com sucesso!');

    } catch (error) {
        clearInterval(progressInterval);
        console.error(error);
        summaryContainer.innerHTML = `<p class="error-message">${error.message}</p>`;
        showToast(error.message, 'error');
    } finally {
        setTimeout(hideProgress, 500);
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

  function generateInfrastructureSummary(data, isNewHostFlow = false) {
    const { instances, vcns, drgs, cpes, ipsec_connections, load_balancers, volume_groups } = data;
    
    const createTable = (headers, rows) => {
      if (!rows || rows.length === 0) return '<p class="no-data-message">Nenhum recurso encontrado.</p>';
      const headerHtml = headers.map(h => `<th>${h}</th>`).join('');
      const bodyHtml = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
      return `<div class="table-container"><table class="resource-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
    };

    const instancesHtml = instances?.length > 0 ? instances.map(instance => generateInstanceSummaryCard(instance, true)).join('') : '<p class="no-data-message">Nenhuma instância encontrada.</p>';
    
    const volumeGroupsHtml = volume_groups?.length > 0 ? volume_groups.map(vg => {
        const validation = vg.validation;
        const statusClass = vg.lifecycle_state ? vg.lifecycle_state.toLowerCase().replace('_', '-') : 'unknown';

        const backupHtml = validation.has_backup_policy
            ? `<span class="validation-ok"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> ${validation.policy_name}</span>`
            : `<span class="validation-fail"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> Nenhuma</span>`;
        
        const crossRegionHtml = validation.is_cross_region_replication_enabled
            ? `<span class="validation-ok"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Habilitada</span>`
            : `<span class="validation-fail"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> Desabilitada</span>`;

        const membersListHtml = vg.members && vg.members.length > 0
            ? `<ul class="member-list">${vg.members.map(m => `<li>${m}</li>`).join('')}</ul>`
            : `<p class="no-data-message">Nenhum membro encontrado.</p>`;

        const cardContent = `
            <div class="content-block">
                <h5 class="subheader">Membros do Grupo</h5>
                ${membersListHtml}
            </div>
            <div class="content-block">
                <h5 class="subheader">Validação de Proteção de Dados</h5>
                <div class="validation-grid">
                    <div class="validation-item">
                        <label>Política de Backup</label>
                        <div class="validation-value">${backupHtml}</div>
                    </div>
                    <div class="validation-item">
                        <label>Replicação Cross-Region</label>
                        <div class="validation-value">${crossRegionHtml}</div>
                    </div>
                    <div class="validation-item">
                        <label>Destino da Replicação</label>
                        <div class="validation-value">${validation.cross_region_target}</div>
                    </div>
                </div>
            </div>`;
        return `<div class="instance-summary-card collapsible"><div class="instance-card-header"><h4 class="card-header-title">${vg.display_name}</h4><div class="card-status-indicator"><span class="vcn-card-header-cidr">${vg.availability_domain}</span><span class="status-badge status-${statusClass}">${vg.lifecycle_state}</span></div><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="instance-card-body">${cardContent}</div></div>`;
    }).join('') : (isNewHostFlow ? '' : '<p class="no-data-message">Nenhum Volume Group encontrado.</p>');

    const vcnsHtml = vcns?.length > 0 ? vcns.map(vcn => {
        const subnetsTable = createTable(['Nome da Subnet', 'CIDR Block'], vcn.subnets?.map(s => [s.display_name, s.cidr_block]));
        const slTable = createTable(['Nome', 'Nº de Regras'], vcn.security_lists?.map(sl => [sl.name, `${sl.rules.length}`]));
        const rtTable = createTable(['Nome', 'Nº de Regras'], vcn.route_tables?.map(rt => [rt.name, `${rt.rules.length}`]));
        const nsgTable = createTable(['Nome', 'Nº de Regras'], vcn.network_security_groups?.map(nsg => [nsg.name, `${nsg.rules.length}`]));
        const lpgTable = createTable(
          ['Nome', 'Status do Peering', 'Route Table', 'CIDR Anunciado', 'Cross-Tenancy'], 
          vcn.lpgs?.map(lpg => {
              const statusClass = lpg.peering_status?.toLowerCase() || 'unknown';
              const statusText = lpg.peering_status_details || lpg.peering_status;
              return [
                  `<span class="text-highlight">${lpg.display_name}</span>`, 
                  `<span class="status-badge status-${statusClass}">${statusText}</span>`,
                  lpg.route_table_name,
                  lpg.peer_advertised_cidr || 'N/A',
                  lpg.is_cross_tenancy_peering ? 'Sim' : 'Não'
              ];
          })
        );
  
        return `<div class="vcn-summary-card collapsible"><div class="vcn-card-header"><h4 class="card-header-title">${vcn.display_name}</h4><div class="card-status-indicator"><span class="vcn-card-header-cidr">${vcn.cidr_block}</span></div><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="vcn-card-body"><h5 class="subheader">Subnets</h5>${subnetsTable}<h5 class="subheader">Security Lists</h5>${slTable}<h5 class="subheader">Route Tables</h5>${rtTable}<h5 class="subheader">Network Security Groups (NSGs)</h5>${nsgTable}<h5 class="subheader">Local Peering Gateways (LPGs)</h5>${lpgTable}</div></div>`;
      }).join('') : '';
  
      const loadBalancersHtml = load_balancers?.length > 0 ? load_balancers.map(lb => {
          const statusClass = lb.lifecycle_state ? lb.lifecycle_state.toLowerCase().replace('_', '-') : 'unknown';
          const cardContent = `
              <fieldset>
                  <legend>Informações Gerais</legend>
                  <div class="grid-container">
                      <div class="info-group full-width">
                          <label>Endereços IP</label>
                          <div class="info-value">
                              <ul class="clean-list">
                                  ${lb.ip_addresses?.map(ip => `<li>${ip.ip_address} (${ip.is_public ? 'Público' : 'Privado'})</li>`).join('') || '<li>N/A</li>'}
                              </ul>
                          </div>
                      </div>
                      <div class="info-group full-width">
                          <label>Hostnames Virtuais</label>
                          ${createTable([], lb.hostnames?.map(h => [`<span class="text-highlight">${h.name}</span>`]))}
                      </div>
                  </div>
              </fieldset>
              <hr class="fieldset-divider">
              <div class="content-block">
                  <h5 class="subheader">Listeners</h5>
                  ${createTable(['Nome', 'Protocolo', 'Porta', 'Backend Set Padrão'], lb.listeners?.map(l => [`<span class="text-highlight">${l.name}</span>`, l.protocol, l.port, l.default_backend_set_name]))}
              </div>
              <div class="content-block">
                  <h5 class="subheader">Backend Sets</h5>
                  ${(lb.backend_sets && lb.backend_sets.length > 0) ? lb.backend_sets.map(bs => `<div class="backend-set-details"><h6 class="tunnel-subheader">Backend Set: <span class="text-highlight">${bs.name}</span> (Política: ${bs.policy})</h6><ul class="tunnel-basic-info"><li><strong>Health Check:</strong> ${bs.health_checker.protocol}:${bs.health_checker.port}</li><li><strong>URL Path:</strong> ${bs.health_checker.url_path || 'N/A'}</li></ul>${createTable(['Nome', 'IP', 'Porta', 'Peso'], bs.backends?.map(b => [`<span class="text-highlight">${b.name}</span>`, b.ip_address, b.port, b.weight]))}</div>`).join('') : '<p class="no-data-message">Nenhum Backend Set encontrado.</p>'}
              </div>
          `;
          return `<div class="instance-summary-card collapsible"><div class="instance-card-header"><h4 class="card-header-title">${lb.display_name}</h4><div class="card-status-indicator"><span class="vcn-card-header-cidr">${lb.shape_name}</span><span class="status-badge status-${statusClass}">${lb.lifecycle_state}</span></div><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="instance-card-body">${cardContent}</div></div>`;
      }).join('') : '';
  
      const drgsHtml = drgs?.length > 0 ? drgs.map(drg => {
          const attachmentsTable = createTable(
              ['Nome do Anexo', 'Tipo', 'DRG Route Table'], 
              drg.attachments?.map(a => [`<span class="text-highlight">${a.display_name}</span>`, a.network_type, a.route_table_name])
          );
          const rpcsTable = createTable(
              ['Nome', 'Status', 'Status do Peering'], 
              drg.rpcs?.map(rpc => {
                  const statusClass = rpc.peering_status?.toLowerCase() || 'unknown';
                  
                  let statusText = rpc.peering_status_details || rpc.peering_status;
                  if (rpc.peering_status === 'NEW') {
                      statusText = 'New (not peered)';
                  } else if (rpc.peering_status === 'PEERED') {
                      statusText = 'Peered';
                  }
                  
                  return [`<span class="text-highlight">${rpc.display_name}</span>`, rpc.lifecycle_state, `<span class="status-badge status-${statusClass}">${statusText}</span>`];
              })
          );
  
          return `
          <div class="instance-summary-card collapsible">
              <div class="instance-card-header">
                  <h4 class="card-header-title">${drg.display_name}</h4>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
              <div class="instance-card-body">
                  <h5 class="subheader">Anexos do DRG</h5>
                  ${attachmentsTable}
                  <h5 class="subheader">Remote Peering Connections (RPCs)</h5>
                  ${rpcsTable}
              </div>
          </div>`;
      }).join('') : '';
      
      const cpesHtml = createTable(['Nome do CPE', 'Endereço IP', 'Fabricante'], cpes?.map(cpe => [`<span class="text-highlight">${cpe.display_name}</span>`, cpe.ip_address, cpe.vendor || 'N/A']));
      
      const ipsecHtml = ipsec_connections?.length > 0 ? ipsec_connections.map(ipsec => {
          const cpeName = cpes.find(c => c.id === ipsec.cpe_id)?.display_name || 'Não encontrado';
          const drgName = drgs.find(d => d.id === ipsec.drg_id)?.display_name || 'Não encontrado';
          
          const tunnelsHtml = ipsec.tunnels.map(tunnel => {
              const p1 = tunnel.phase_one_details;
              const p2 = tunnel.phase_two_details;
              
              let bgpDetailsHtml = '';
              if (tunnel.routing_type === 'BGP' && tunnel.bgp_session_info) {
                  const bgp = tunnel.bgp_session_info;
                  bgpDetailsHtml = `
                      <div class="crypto-details-grid">
                          <div>
                              <h6 class="tunnel-subheader">Sessão BGP</h6>
                              <ul>
                                  <li><strong>ASN Oracle:</strong> ${bgp.oracle_bgp_asn || 'N/A'}</li>
                                  <li><strong>ASN Cliente:</strong> ${bgp.customer_bgp_asn || 'N/A'}</li>
                              </ul>
                          </div>
                          <div>
                              <h6 class="tunnel-subheader">IPs do Peering</h6>
                              <ul>
                                  <li><strong>Interface Oracle:</strong> ${bgp.oracle_interface_ip || 'N/A'}</li>
                                  <li><strong>Interface Cliente:</strong> ${bgp.customer_interface_ip || 'N/A'}</li>
                              </ul>
                          </div>
                      </div>
                      <hr class="tunnel-divider">
                  `;
              }

              return `<div class="tunnel-details">
                        <div class="tunnel-header">
                            <strong>Túnel: <span class="text-highlight">${tunnel.display_name}</span></strong>
                            <span class="status-badge status-${tunnel.status.toLowerCase()}">${tunnel.status}</span>
                        </div>
                        <ul class="tunnel-basic-info">
                            <li><strong>IP Oracle:</strong> ${tunnel.vpn_oracle_ip || 'N/A'}</li>
                            <li><strong>IP do CPE:</strong> ${tunnel.cpe_ip || 'N/A'}</li>
                            <li><strong>Roteamento:</strong> ${tunnel.routing_type}</li>
                            <li><strong>IKE:</strong> ${tunnel.ike_version}</li>
                        </ul>
                        ${bgpDetailsHtml}
                        <div class="crypto-details-grid">
                            <div>
                                <h6 class="tunnel-subheader">Fase 1 (IKE)</h6>
                                <ul>
                                    <li><strong>Autenticação:</strong> ${p1.authentication_algorithm}</li>
                                    <li><strong>Criptografia:</strong> ${p1.encryption_algorithm}</li>
                                    <li><strong>Grupo DH:</strong> ${p1.dh_group}</li>
                                    <li><strong>Lifetime:</strong> ${p1.lifetime_in_seconds}s</li>
                                </ul>
                            </div>
                            <div>
                                <h6 class="tunnel-subheader">Fase 2 (IPSec)</h6>
                                <ul>
                                    <li><strong>Autenticação:</strong> ${p2.authentication_algorithm || 'N/A'}</li>
                                    <li><strong>Criptografia:</strong> ${p2.encryption_algorithm}</li>
                                    <li><strong>Lifetime:</strong> ${p2.lifetime_in_seconds}s</li>
                                </ul>
                            </div>
                        </div>
                    </div>`
          }).join('<hr class="tunnel-divider">');
          
          const hasBgpTunnel = ipsec.tunnels.some(t => t.routing_type === 'BGP');
          const routingDisplay = hasBgpTunnel
              ? `<span class="full-width"><strong>Roteamento:</strong> BGP</span>`
              : `<span class="full-width"><strong>Rotas Estáticas:</strong> ${(ipsec.static_routes && ipsec.static_routes.length > 0) ? ipsec.static_routes.join(', ') : 'Nenhuma'}</span>`;

          return `<div class="ipsec-summary-card collapsible">
                    <div class="ipsec-card-header">
                        <h4 class="card-header-title">${ipsec.display_name}</h4>
                        <div class="card-status-indicator">
                            <span class="status-badge status-${ipsec.status.toLowerCase()}">${ipsec.status}</span>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div class="ipsec-card-body">
                        <div class="ipsec-details">
                            <span><strong>CPE Associado:</strong> ${cpeName}</span>
                            <span><strong>DRG Associado:</strong> ${drgName}</span>
                        </div>
                        <div class="ipsec-details">${routingDisplay}</div>
                        <h5 class="subheader">Túneis</h5>
                        ${tunnelsHtml || '<p class="no-data-message">Nenhum túnel encontrado.</p>'}
                    </div>
                </div>`;
      }).join('') : '';

    const fullInfraHtml = !isNewHostFlow ? `
        <hr class="fieldset-divider">
        <fieldset>
            <legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>Virtual Cloud Networks (VCNs)</legend>
            <div class="vcn-container">${vcnsHtml || '<p class="no-data-message">Nenhuma VCN encontrada.</p>'}</div>
        </fieldset>
        <hr class="fieldset-divider">
        <fieldset>
            <legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M12 21a9 9 0 0 0 9-9 9 9 0 0 0-9-9 9 9 0 0 0-9 9 9 9 0 0 0 9 9Z"></path><path d="M8 12a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1Z"></path><path d="M15 12a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1Z"></path><path d="M12 2v2"></path><path d="M12 8v2"></path></svg>Load Balancers (LBaaS)</legend>
            <div class="lb-container">${loadBalancersHtml || '<p class="no-data-message">Nenhum Load Balancer encontrado.</p>'}</div>
        </fieldset>
        <hr class="fieldset-divider">
        <fieldset>
            <legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M2 12h20M7 7l5 5-5 5M17 7l-5 5 5 5"></path></svg>Conectividade de Roteamento</legend>
            <div class="drg-container">${drgsHtml || '<p class="no-data-message">Nenhum DRG encontrado.</p>'}</div>
        </fieldset>
        <hr class="fieldset-divider">
        <fieldset>
            <legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>Conectividade VPN</legend>
            <h4 class="subheader">Customer-Premises Equipment (CPEs)</h4>${cpesHtml}
            <h4 class="subheader">Conexões VPN IPSec</h4>
            <div class="ipsec-container">${ipsecHtml || '<p class="no-data-message">Nenhuma conexão IPSec encontrada.</p>'}</div>
        </fieldset>
    ` : '';
    
    const title = isNewHostFlow ? `Resumo do(s) Novo(s) Host(s): ${selectedCompartmentName}` : `Resumo da Infraestrutura: ${selectedCompartmentName}`;

    return `<div>
              <h3 class="infra-summary-main-title">${title}</h3>
              <fieldset>
                <legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" x2="6" y1="6" y2="6"></line><line x1="6" x2="6" y1="18" y2="18"></line></svg>Instâncias Computacionais</legend>
                <div class="instances-container">${instancesHtml}</div>
              </fieldset>
              
              ${volumeGroupsHtml ? `
              <hr class="fieldset-divider">
              <fieldset>
                <legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line><path d="M5 22v-5"></path><path d="M19 22v-5"></path></svg>Volume Groups Associados</legend>
                <div class="vg-container">${volumeGroupsHtml}</div>
              </fieldset>
              ` : ''}

              ${fullInfraHtml}
            </div>`;
  }

  function generateInstanceSummaryCard(data, isCollapsible = false) {
    const cardContent = `<fieldset><legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg>Dados da Instância</legend><div class="grid-container"><div class="info-group"><label>Shape</label><div class="info-value">${data.shape}</div></div><div class="info-group"><label>OCPUs</label><div class="info-value">${data.ocpus}</div></div><div class="info-group"><label>Memória (GB)</label><div class="info-value">${data.memory}</div></div><div class="info-group"><label>Boot Volume (GB)</label><div class="info-value">${data.boot_volume_gb}</div></div><div class="info-group full-width"><label>Sistema Operacional</label><div class="info-value">${data.os_name}</div></div><div class="info-group"><label>IP Privado</label><div class="info-value">${data.private_ip}</div></div><div class="info-group"><label>IP Público</label><div class="info-value">${data.public_ip || 'N/A'}</div></div><div class="info-group full-width"><label>Política de Backup (Boot Volume)</label><div class="info-value">${data.backup_policy_name}</div></div></div></fieldset><hr class="fieldset-divider"><fieldset><legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line></svg>Block Volumes Anexados</legend><div class="table-container">${data.block_volumes && data.block_volumes.length > 0 ? `<table class="bv-table"><thead><tr><th>Nome do Volume</th><th>Tamanho (GB)</th><th>Política de Backup</th></tr></thead><tbody>${data.block_volumes.map(vol => `<tr><td>${vol.display_name}</td><td>${vol.size_in_gbs}</td><td>${vol.backup_policy_name}</td></tr>`).join('')}</tbody></table>` : `<p class="no-data-message">Nenhum Block Volume adicional anexado.</p>`}</div></fieldset><hr class="fieldset-divider"><fieldset><legend><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M2 12h20M7 7l5 5-5 5M17 7l-5 5 5 5"></path></svg>Resumo de Conectividade de Rede</legend><div class="summary-grid"><div class="summary-group"><label>Security Lists</label><div class="summary-box">${data.security_lists && data.security_lists.length > 0 ? data.security_lists.map(sl => `<span class="summary-item">${sl.name}</span>`).join('') : `<span class="summary-item empty">Nenhuma</span>`}</div></div><div class="summary-group"><label>Network Security Groups (NSGs)</label><div class="summary-box">${data.network_security_groups && data.network_security_groups.length > 0 ? data.network_security_groups.map(nsg => `<span class="summary-item">${nsg.name}</span>`).join('') : `<span class="summary-item empty">Nenhuma</span>`}</div></div><div class="summary-group full-width"><label>Route Table</label><div class="summary-box">${data.route_table && data.route_table.name ? `<span class="summary-item">${data.route_table.name}</span>` : `<span class="summary-item empty">Nenhuma</span>`}</div></div></div></fieldset>`;
    if (isCollapsible) {
      const isRunning = data.lifecycle_state === 'RUNNING';
      const statusText = isRunning ? 'Ligada' : 'Desligada';
      const statusClass = isRunning ? 'running' : 'stopped';
      return `<div class="instance-summary-card collapsible"><div class="instance-card-header"><h4 class="card-header-title">${data.host_name}</h4><div class="card-status-indicator"><span class="status-dot ${statusClass}"></span><span class="status-label ${statusClass}">${statusText}</span></div><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="instance-card-body">${cardContent}</div></div>`;
    } else {
      return `<div class="instance-summary-card"><h3 class="instance-summary-title">${data.host_name}</h3>${cardContent}</div>`;
    }
  }

  const generateDocument = (event) => {
    const responsibleName = responsibleNameInput.value.trim();
    if (!responsibleName) {
        showToast("Por favor, preencha o nome do responsável.", 'error');
        responsibleNameInput.focus();
        return;
    }
    
    if (!allInfrastructureData || allInfrastructureData.instances.length === 0) {
        showToast("Busque os dados antes de gerar o documento.", 'error');
        return;
    }
    
    let xhr;
    try {
        toggleLoading(true);
        const formData = new FormData();
        const payload = { 
            doc_type: selectedDocType, 
            infra_data: allInfrastructureData,
            responsible_name: responsibleName
        };
        formData.append('json_data', JSON.stringify(payload));
        architectureImageFiles.forEach(file => formData.append('architecture_files', file));
        antivirusImageFiles.forEach(file => formData.append('antivirus_files', file));
        
        xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE_URL}/api/generate-document`, true);
        xhr.responseType = 'blob';

        xhr.onloadend = function() {
            toggleLoading(false);
        };
        
        xhr.onload = function() {
            if (this.status === 200) {
                const blob = this.response;
                if (blob.size === 0) {
                    showToast("Erro: O servidor retornou uma resposta vazia.", 'error');
                    return;
                }

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;

                const compartmentName = allInfrastructureData.instances[0].compartment_name.replace('SERVERS-','').replace(/[^a-zA-Z0-9_-]/g, '');
                const docIdentifier = selectedDocType === 'full_infra' ? 'Infraestrutura' : 'NovoHost';
                const now = new Date();
                const timestamp = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0') + '_' + now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + now.getSeconds().toString().padStart(2, '0');
                const docName = `Doc_${docIdentifier}_${compartmentName}_${timestamp}.docx`;
                a.download = docName;
                
                document.body.appendChild(a);
                a.click();
                
                window.URL.revokeObjectURL(url);
                a.remove();
                
                showSuccessScreen();
            } else {
                showToast(`Erro do servidor: ${this.status} - ${this.statusText}`, 'error');
            }
        };

        xhr.onerror = function() {
            showToast("Ocorreu um erro de rede que impediu o download.", 'error');
        };

        xhr.send(formData);

    } catch (error) {
        showToast("Erro crítico no download: " + error.toString(), 'error');
        toggleLoading(false);
    }
  };

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
        const imageFile = new File([blob], fileName, { type: blob.type });
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

  const initializeApp = () => {
    fetchRegions();
    populateDocTypes();
    createCustomSelect(compartmentContainer, [], 'Selecione uma região primeiro', () => {}, false, false);
    createCustomSelect(instanceContainer, [], 'Selecione um compartimento primeiro', () => {}, false, true);
    instanceStep.classList.add('hidden');
  };

  fetchBtn.addEventListener('click', fetchAllDetails);
  generateBtn.addEventListener('click', generateDocument); 
  newDocBtn.addEventListener('click', resetApp);
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

  initializeApp();
});

