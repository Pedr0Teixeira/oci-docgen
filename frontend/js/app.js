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
  let selectedDocType = null;
  let selectedCompartmentId = null;
  let selectedCompartmentName = null;
  let selectedInstances = {};
  let allInstancesData = [];
  let architectureImageFiles = [];
  let antivirusImageFiles = [];

  const toggleLoading = (show) => {
    loadingOverlay.classList.toggle('hidden', !show);
  };

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

        // Adiciona indicador de status (RUNNING/STOPPED) na lista de instâncias.
        const status = option.status || '';
        const statusClass = status.toLowerCase(); // ex: 'running', 'stopped'

        item.innerHTML = `
          <input type="checkbox" value="${optionValue}" data-name="${optionName}" ${selectedInstances[optionValue] ? 'checked' : ''}>
          <span class="custom-checkbox">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </span>
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
    }];
    createCustomSelect(docTypeContainer, docTypes, 'Selecione um tipo', (selectedValue) => {
      selectedDocType = selectedValue;
    });
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
        fetchBtn.disabled = Object.keys(selectedInstances).length === 0;
      }, true, true);
      updateMultiSelectDisplay();
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      toggleLoading(false);
    }
  };

  const fetchAllInstanceDetails = async () => {
    const instanceIds = Object.keys(selectedInstances);
    if (instanceIds.length === 0) return;
    toggleLoading(true);
    detailsContainer.classList.add('hidden');
    allInstancesData = [];
    summaryContainer.innerHTML = '<p>Buscando dados...</p>';
    const promises = instanceIds.map(id => {
      const fullUrl = `${API_BASE_URL}/api/${selectedRegion}/instance-details/${id}`;
      return fetch(fullUrl)
        .then(res => {
          if (res.ok) return res.json();
          return res.json().then(err => Promise.reject(`Falha ao buscar ${selectedInstances[id]}: ${err.detail || JSON.stringify(err)}`));
        })
        .then(data => {
          data.compartment_name = selectedCompartmentName;
          return data;
        });
    });
    try {
      allInstancesData = await Promise.all(promises);
      let finalHtml = ``;
      allInstancesData.forEach(data => {
        finalHtml += generateInstanceSummaryCard(data);
      });
      summaryContainer.innerHTML = finalHtml;
      detailsContainer.classList.remove('hidden');
    } catch (error) {
      alert(error);
      summaryContainer.innerHTML = `<p style="color: #ff5555;">${error}</p>`;
    } finally {
      toggleLoading(false);
    }
  };

  const resetAndFetchCompartments = () => {
    selectedCompartmentId = null;
    selectedInstances = {};
    fetchBtn.disabled = true;
    detailsContainer.classList.add('hidden');
    createCustomSelect(instanceContainer, [], 'Selecione um compartimento primeiro', () => {}, false, true);
    fetchCompartments();
  };

  const resetAndFetchInstances = () => {
    selectedInstances = {};
    updateMultiSelectDisplay();
    fetchBtn.disabled = true;
    detailsContainer.classList.add('hidden');
    fetchInstances();
  };

  function generateInstanceSummaryCard(data) {
    let blockVolumesHtml = data.block_volumes && data.block_volumes.length > 0 ?
      `<table class="bv-table">
          <thead><tr><th>Nome do Volume</th><th>Tamanho (GB)</th></tr></thead>
          <tbody>
            ${data.block_volumes.map(vol => `
                <tr>
                  <td>${vol.display_name}</td>
                  <td>${vol.size_in_gbs}</td>
                </tr>`).join('')}
          </tbody>
      </table>` :
      `<p class="no-data-message">Nenhum Block Volume adicional anexado.</p>`;

    const securityListsHtml = data.security_lists && data.security_lists.length > 0 ?
      data.security_lists.map(sl => `<span class="summary-item">${sl.name}</span>`).join('') :
      `<span class="summary-item empty">Nenhuma</span>`;

    const nsgsHtml = data.network_security_groups && data.network_security_groups.length > 0 ?
      data.network_security_groups.map(nsg => `<span class="summary-item">${nsg.name}</span>`).join('') :
      `<span class="summary-item empty">Nenhum</span>`;
    
    const routeTableHtml = data.route_table && data.route_table.name ?
      `<span class="summary-item">${data.route_table.name}</span>` :
      `<span class="summary-item empty">Nenhuma</span>`;

    return `
      <div class="instance-summary-card">
        <h3 class="instance-summary-title">${data.host_name}</h3>
        <fieldset>
          <legend>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg>
            Dados da Instância
          </legend>
          <div class="grid-container">
            <div class="info-group"><label>Shape</label><div class="info-value">${data.shape}</div></div>
            <div class="info-group"><label>OCPUs</label><div class="info-value">${data.ocpus}</div></div>
            <div class="info-group"><label>Memória (GB)</label><div class="info-value">${data.memory}</div></div>
            <div class="info-group"><label>Boot Volume (GB)</label><div class="info-value">${data.boot_volume_gb}</div></div>
            <div class="info-group full-width"><label>Sistema Operacional</label><div class="info-value">${data.os_name}</div></div>
            <div class="info-group"><label>IP Privado</label><div class="info-value">${data.private_ip}</div></div>
            <div class="info-group"><label>IP Público</label><div class="info-value">${data.public_ip || 'N/A'}</div></div>
            <div class="info-group full-width"><label>Política de Backup</label><div class="info-value">${data.backup_policy_name}</div></div>
          </div>
        </fieldset>
        <hr class="fieldset-divider">
        <fieldset>
          <legend>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line></svg>
            Block Volumes Anexados
          </legend>
          <div class="table-container">${blockVolumesHtml}</div>
        </fieldset>
        <hr class="fieldset-divider">
        <fieldset>
          <legend>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M2 12h20M7 7l5 5-5 5M17 7l-5 5 5 5"></path></svg>
            Resumo de Conectividade de Rede
          </legend>
          <div class="summary-grid">
            <div class="summary-group"><label>Security Lists</label><div class="summary-box">${securityListsHtml}</div></div>
            <div class="summary-group"><label>Network Security Groups (NSGs)</label><div class="summary-box">${nsgsHtml}</div></div>
            <div class="summary-group full-width"><label>Route Table</label><div class="summary-box">${routeTableHtml}</div></div>
          </div>
        </fieldset>
      </div>`;
  }

  const generateDocument = async () => {
    if (!allInstancesData || allInstancesData.length === 0) {
      alert("Busque os dados da(s) instância(s) primeiro.");
      return;
    }
    try {
      toggleLoading(true);
      const formData = new FormData();
      const payload = {
        instances_data: allInstancesData
      };
      formData.append('json_data', JSON.stringify(payload));
      architectureImageFiles.forEach(file => {
        formData.append('architecture_files', file);
      });
      antivirusImageFiles.forEach(file => {
        formData.append('antivirus_files', file);
      });
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
      const docName = `Doc_${allInstancesData[0].compartment_name.replace('SERVERS-','')}_multihost_${new Date().toISOString().split('T')[0]}.docx`;
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

  function updateFileListUI(fileArray, fileListContainer) {
    fileListContainer.innerHTML = '';
    if (fileArray.length === 0) return;
    fileArray.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-list-item';
        fileItem.innerHTML = `
          <img src="${e.target.result}" alt="${file.name}" class="file-list-preview">
          <span class="file-list-name">${file.name}</span>
          <button class="file-list-delete-btn" data-index="${index}" title="Remover arquivo">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>`;
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

  const initializeApp = () => {
    fetchRegions();
    populateDocTypes();
    createCustomSelect(compartmentContainer, [], 'Selecione uma região primeiro', () => {}, false, false);
    createCustomSelect(instanceContainer, [], 'Selecione um compartimento primeiro', () => {}, false, true);
  };

  // --- Adição dos Event Listeners ---
  fetchBtn.addEventListener('click', fetchAllInstanceDetails);
  generateBtn.addEventListener('click', generateDocument);
  document.addEventListener('click', closeAllSelects);
  architectureUpload.addEventListener('change', (e) => handleFileSelect(e, architectureImageFiles, architectureFileList));
  antivirusUpload.addEventListener('change', (e) => handleFileSelect(e, antivirusImageFiles, antivirusFileList));
  architectureUploadGroup.addEventListener('paste', (e) => handlePaste(e, architectureImageFiles, architectureFileList));
  antivirusUploadGroup.addEventListener('paste', (e) => handlePaste(e, antivirusImageFiles, antivirusFileList));
  architectureFileList.addEventListener('click', (e) => handleFileDelete(e, architectureImageFiles, architectureFileList));
  antivirusFileList.addEventListener('click', (e) => handleFileDelete(e, antivirusImageFiles, antivirusFileList));

  // --- Início da Aplicação ---
  initializeApp();
});

