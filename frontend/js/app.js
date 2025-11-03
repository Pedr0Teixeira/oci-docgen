document.addEventListener('DOMContentLoaded', () => {

  // --- Settings and Constants ---
  const API_BASE_URL = 'http://127.0.0.1:8000'; // Uncomment for local development
  //const API_BASE_URL = ''; // Uncomment for production

  // --- DOM Element Selectors ---
  const mainAppContainer = document.getElementById('main-app-container');
  const regionContainer = document.getElementById('region-select-container');
  const docTypeContainer = document.getElementById('doctype-select-container');
  const compartmentContainer = document.getElementById('compartment-select-container');
  const instanceStep = document.getElementById('instance-step');
  const instanceContainer = document.getElementById('instance-select-container');
  const fetchBtn = document.getElementById('fetch-details-btn');
  const detailsContainer = document.getElementById('details-container');
  const summaryContainer = document.getElementById('fetched-data-summary');
  const generateBtn = document.getElementById('generate-doc-btn');
  const loadingOverlay = document.getElementById('loading-overlay');
  const progressTimer = document.getElementById('progress-timer');
  const progressBarContainer = document.querySelector('.progress-bar-container');
  const responsibleNameInput = document.getElementById('responsible-name-input');
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
  const languageSelector = document.getElementById('language-selector');

  // --- SVG Icon Definitions ---
  const ICONS = {
    INSTANCES: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" x2="6" y1="6" y2="6"></line><line x1="6" x2="6" y1="18" y2="18"></line></svg>`,
    INSTANCE_DATA: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg>`,
    BLOCK_VOLUMES: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line></svg>`,
    CONNECTIVITY: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M2 12h20M7 7l5 5-5 5M17 7l-5 5 5 5"></path></svg>`,
    VOLUME_GROUPS: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line><path d="M5 22v-5"></path><path d="M19 22v-5"></path></svg>`,
    VCNS: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>`,
    OKE: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="2" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="22"></line><line x1="22" y1="12" x2="19" y2="12"></line><line x1="5" y1="12" x2="2" y2="12"></line><line x1="19.07" y1="4.93" x2="16.24" y2="7.76"></line><line x1="7.76" y1="16.24" x2="4.93" y2="19.07"></line><line x1="19.07" y1="19.07" x2="16.24" y2="16.24"></line><line x1="7.76" y1="7.76" x2="4.93" y2="4.93"></line></svg>`,
    LB: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M12 21a9 9 0 0 0 9-9 9 9 0 0 0-9-9 9 9 0 0 0-9 9 9 9 0 0 0 9 9Z"></path><path d="M8 12a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1Z"></path><path d="M15 12a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1Z"></path><path d="M12 2v2"></path><path d="M12 8v2"></path></svg>`,
    ROUTING: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M2 12h20M7 7l5 5-5 5M17 7l-5 5 5 5"></path></svg>`,
    VPN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  };

  // --- Application State ---
  let selectedRegion = null;
  let selectedDocType = null;
  let selectedCompartmentId = null;
  let selectedCompartmentName = null;
  let selectedInstances = {};
  let allInfrastructureData = {};
  let architectureImageFiles = [];
  let antivirusImageFiles = [];
  let collectionStartTime = 0;
  let progressTimerInterval = null;
  let pollingIntervalId = null;
  let currentLanguage = 'pt';
  let translations = {};
  let allRegionsData = [];
  let allCompartmentsData = [];
  let allInstancesData = [];

  // --- Internationalization (i18n) Functions ---

  const loadTranslations = async (lang) => {
    try {
      const response = await fetch(`locales/${lang}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load ${lang}.json`);
      }
      translations = await response.json();
    } catch (error) {
      console.error(error);
      if (lang !== 'pt') {
        await loadTranslations('pt');
      }
    }
  };

  const t = (key, context = {}) => {
    let text = translations[key] || key;
    for (const k in context) {
      text = text.replace(new RegExp(`{${k}}`, 'g'), context[k]);
    }
    return text;
  };

  const applyStaticTranslations = () => {
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      element.textContent = t(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      element.setAttribute('placeholder', t(key));
    });

    updateUiForDocType();
  };

  const setLanguage = async (lang) => {
    currentLanguage = lang;
    localStorage.setItem('oci-docgen-lang', lang);
    languageSelector.value = lang;

    await loadTranslations(lang);

    applyStaticTranslations();

    createCustomSelect(
      regionContainer,
      allRegionsData,
      t('step1_placeholder'),
      (selectedValue) => {
        if (selectedRegion !== selectedValue) {
          selectedRegion = selectedValue;
          resetAndFetchCompartments();
        }
      },
      true
    );
    if (selectedRegion) {
      const regionName = allRegionsData.find(r => r.key === selectedRegion)?.name;
      if (regionName) {
        const selectedContent = regionContainer.querySelector('.selected-item-display');
        selectedContent.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg><span class="item-text">${regionName}</span>`;
        selectedContent.classList.remove('placeholder');
      }
    }

    populateDocTypes();
    if (selectedDocType) {
        const docTypeKey = `doc_type_${selectedDocType.replace('_', '-')}`;
        const docTypeName = t(docTypeKey);
        const selectedContent = docTypeContainer.querySelector('.selected-item-display');
        selectedContent.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg><span class="item-text">${docTypeName}</span>`;
        selectedContent.classList.remove('placeholder');
    }

    const compPlaceholder = selectedRegion ? t('step3_placeholder') : t('instance_select_compartment_first');
    createCustomSelect(
      compartmentContainer,
      allCompartmentsData,
      compPlaceholder,
      (selectedValue, selectedName) => {
        selectedCompartmentId = selectedValue;
        selectedCompartmentName = selectedName;
        resetAndFetchInstances();
        updateFetchButtonState();
      },
      allCompartmentsData.length > 0,
      false
    );

    if (selectedCompartmentId && selectedCompartmentName) {
        const selectedContent = compartmentContainer.querySelector('.selected-item-display');
        const level = allCompartmentsData.find(c => c.id === selectedCompartmentId)?.level || 0;
        let iconHtml = level > 0 ? `<span class="item-tree-prefix"></span>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`;
        selectedContent.innerHTML = `${iconHtml}<span class="item-text">${selectedCompartmentName}</span>`;
        selectedContent.classList.remove('placeholder');
    }

    const instPlaceholder = (selectedDocType === 'new_host' && selectedCompartmentId) ? t('step4_placeholder') : t('instance_select_compartment_first');
    createCustomSelect(
      instanceContainer,
      allInstancesData,
      instPlaceholder,
      (value, name, isChecked) => {
        if (isChecked) {
          selectedInstances[value] = name;
        } else {
          delete selectedInstances[value];
        }
        updateMultiSelectDisplay();
        updateFetchButtonState();
      },
      allInstancesData.length > 0 && selectedDocType === 'new_host',
      true
    );

    if (Object.keys(selectedInstances).length > 0) {
      updateMultiSelectDisplay();
    }

    if (Object.keys(allInfrastructureData).length > 0) {
      summaryContainer.innerHTML = generateInfrastructureSummary(allInfrastructureData);
    }
  };

  // --- UI Functions ---

  /**
   * Displays a toast notification on the screen.
   * @param {string} message The message to display.
   * @param {'success'|'error'} type The type of toast to show.
   */
  function showToast(message, type = 'success') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ?
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toast-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>` :
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toast-icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="8" y2="12"></line><line x1="12" x2="12.01" y1="16" y2="16"></line></svg>`;

    toast.innerHTML = `${icon}<span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  /**
   * Shows the detailed progress indicator for the main data collection.
   */
  const showProgress = () => {
    loadingOverlay.classList.remove('hidden');

    progressSpinner.style.display = 'none';
    progressTimer.style.display = 'block';
    progressText.style.display = 'block';
    progressBarContainer.style.display = 'block';

    progressBar.style.width = '0%';
    progressText.textContent = t('progress.initializing_clients');
    progressTimer.textContent = '00:00';
  };

  /**
   * Updates the progress bar and text.
   * @param {number} percentage The new percentage for the progress bar.
   * @param {string} text The text to display below the progress bar.
   */
  const updateProgress = (percentage, text) => {
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = text;
  };

  /**
   * Hides the progress indicator overlay.
   */
  const hideProgress = () => {
    clearInterval(progressTimerInterval);
    clearInterval(pollingIntervalId);
    loadingOverlay.classList.add('hidden');
  };

  /**
   * Shows or hides a simple, generic loading spinner.
   * @param {boolean} show - True to show, false to hide.
   */
  const toggleLoading = (show) => {
    if (show) {
      progressSpinner.style.display = 'block';
      progressText.style.display = 'block';
      progressText.textContent = t('progress_loading');

      progressTimer.style.display = 'none';
      progressBarContainer.style.display = 'none';
      loadingOverlay.classList.remove('hidden');
    } else {
      loadingOverlay.classList.add('hidden');
    }
  };

  /**
   * Displays the success screen after an operation is complete.
   */
  const showSuccessScreen = () => {
    mainAppContainer.classList.add('hidden');
    successScreen.classList.remove('hidden');
    const icon = successScreen.querySelector('.success-icon');
    const newIcon = icon.cloneNode(true);
    icon.parentNode.replaceChild(newIcon, icon);
  };

  /**
   * Resets the entire application state to its initial view.
   */
  const resetApp = () => {
    successScreen.classList.add('hidden');
    mainAppContainer.classList.remove('hidden');

    selectedRegion = null;
    selectedDocType = null;
    selectedCompartmentId = null;
    selectedCompartmentName = null;
    selectedInstances = {};
    allInfrastructureData = {};
    architectureImageFiles = [];
    antivirusImageFiles = [];

    detailsContainer.classList.add('hidden');
    summaryContainer.innerHTML = '';
    architectureFileList.innerHTML = '';
    antivirusFileList.innerHTML = '';
    responsibleNameInput.value = '';

    initializeApp();
  };

  /**
   * Updates the UI elements based on the selected documentation type.
   */
  function updateUiForDocType() {
    const isNewHost = selectedDocType === 'new_host';
    const isKubernetes = selectedDocType === 'kubernetes';
    instanceStep.classList.toggle('hidden', !isNewHost);

    let i18nKey = 'fetch_btn_full';
    if (isNewHost) {
      i18nKey = 'fetch_btn_new';
    } else if (isKubernetes) {
      i18nKey = 'fetch_btn_k8s';
    }

    const fetchBtnSpan = fetchBtn.querySelector('span');
    if (fetchBtnSpan) {
      fetchBtnSpan.setAttribute('data-i18n', i18nKey);
      fetchBtnSpan.textContent = t(i18nKey);
    }

    updateFetchButtonState();
  }

  /**
   * Enables or disables the main 'Fetch' button based on required selections.
   */
  function updateFetchButtonState() {
    const isNewHost = selectedDocType === 'new_host';
    if (isNewHost) {
      fetchBtn.disabled = Object.keys(selectedInstances).length === 0;
    } else {
      fetchBtn.disabled = !selectedCompartmentId;
    }
  }

  /**
   * Creates a custom, searchable select dropdown component.
   * @param {HTMLElement} container - The container element to build the select in.
   * @param {Array<object>} options - The array of options to populate the select.
   * @param {string} placeholder - The placeholder text.
   * @param {Function} onSelectCallback - The callback to execute when an option is selected.
   * @param {boolean} isEnabled - Whether the select is enabled.
   * @param {boolean} isMultiSelect - Whether multiple options can be selected.
   */
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
      searchBox.placeholder = t('search_placeholder');
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
          if ((item.textContent || item.innerText).toUpperCase().indexOf(filter) > -1) {
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
        allListItems.forEach(item => item.style.display = itemsToShow.has(item) ? "" : "none");
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
          item.style.paddingLeft = `${option.level * 25}px`;
          item.innerHTML = option.level > 0 ? `<span class="item-tree-prefix"></span><span class="item-text">${optionName}</span>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg><span class="item-text">${optionName}</span>`;
        }
        if (iconSvg && !item.innerHTML) {
          item.innerHTML = `${iconSvg}<span class="item-text">${optionName}</span>`;
        } else if (!item.innerHTML) {
          item.innerHTML = `<span class="item-text">${optionName}</span>`;
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

  /**
   * Updates the display of the multi-select component to show selected items as tags.
   */
  function updateMultiSelectDisplay() {
    const container = instanceContainer.querySelector('.selected-items-container');
    container.innerHTML = '';
    const selectedIds = Object.keys(selectedInstances);
    if (selectedIds.length === 0) {
      container.innerHTML = `<span class="placeholder">${t('step4_placeholder')}</span>`;
    } else {
      selectedIds.forEach(id => {
        const tag = document.createElement('span');
        tag.className = 'selected-item-tag';
        tag.textContent = selectedInstances[id];
        container.appendChild(tag);
      });
    }
  }

  /**
   * Closes all custom select dropdowns.
   * @param {HTMLElement | null} except - An optional element to exclude from closing.
   */
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

  // --- API Call Functions ---

  /**
   * Fetches the list of available OCI regions and populates the selector.
   */
  const fetchRegions = async () => {
    try {
      toggleLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/regions`);
      if (!response.ok) {
        throw new Error('Erro ao buscar regiões');
      }
      const regions = await response.json();
      allRegionsData = regions;
      createCustomSelect(
        regionContainer,
        allRegionsData,
        t('step1_placeholder'),
        (selectedValue) => {
          if (selectedRegion !== selectedValue) {
            selectedRegion = selectedValue;
            resetAndFetchCompartments();
          }
        },
        true
      );
    } catch (error) {
      showToast("Falha ao buscar regiões: " + error.message, 'error');
    } finally {
      toggleLoading(false);
    }
  };

  /**
   * Populates the documentation type selector with predefined options.
   */
  const populateDocTypes = () => {
    const docTypes = [{
      id: 'new_host',
      name: t('doc_type_new')
    }, {
      id: 'full_infra',
      name: t('doc_type_full')
    }, {
      id: 'kubernetes',
      name: t('doc_type_k8s')
    }, ];
    createCustomSelect(
      docTypeContainer,
      docTypes,
      t('step2_placeholder'),
      (selectedValue) => {
        selectedDocType = selectedValue;
        updateUiForDocType();
      }
    );
  };

  /**
   * Fetches the list of compartments for the selected region.
   */
  const fetchCompartments = async () => {
    if (!selectedRegion) return;
    try {
      toggleLoading(true);
      createCustomSelect(compartmentContainer, [], t('progress_loading'), () => {}, false, false);
      const response = await fetch(`${API_BASE_URL}/api/${selectedRegion}/compartments`);
      if (!response.ok) {
        throw new Error('Erro ao buscar compartimentos');
      }
      const compartments = await response.json();
      allCompartmentsData = compartments;
      createCustomSelect(
        compartmentContainer,
        allCompartmentsData,
        t('step3_placeholder'),
        (selectedValue, selectedName) => {
          selectedCompartmentId = selectedValue;
          selectedCompartmentName = selectedName;
          resetAndFetchInstances();
          updateFetchButtonState();
        },
        true,
        false
      );
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      toggleLoading(false);
    }
  };

  /**
   * Fetches the list of instances for the selected compartment.
   */
  const fetchInstances = async () => {
    if (!selectedRegion || !selectedCompartmentId) return;
    try {
      toggleLoading(true);
      createCustomSelect(instanceContainer, [], t('progress_loading'), () => {}, false, true);
      const response = await fetch(`${API_BASE_URL}/api/${selectedRegion}/instances/${selectedCompartmentId}`);
      if (!response.ok) {
        throw new Error('Erro ao buscar instâncias');
      }
      const instances = await response.json();
      allInstancesData = instances;
      createCustomSelect(
        instanceContainer,
        allInstancesData,
        t('step4_placeholder'),
        (value, name, isChecked) => {
          if (isChecked) {
            selectedInstances[value] = name;
          } else {
            delete selectedInstances[value];
          }
          updateMultiSelectDisplay();
          updateFetchButtonState();
        },
        true,
        true
      );
      updateMultiSelectDisplay();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      toggleLoading(false);
    }
  };

  /**
   * Resets compartment and instance selections when the region changes.
   */
  const resetAndFetchCompartments = () => {
    selectedCompartmentId = null;
    selectedInstances = {};
    updateFetchButtonState();
    detailsContainer.classList.add('hidden');
    createCustomSelect(instanceContainer, [], t('instance_select_compartment_first'), () => {}, false, true);
    fetchCompartments();
  };

  /**
   * Resets instance selections when the compartment changes.
   */
  const resetAndFetchInstances = () => {
    selectedInstances = {};
    updateMultiSelectDisplay();
    updateFetchButtonState();
    detailsContainer.classList.add('hidden');
    if (selectedDocType === 'new_host') {
      fetchInstances();
    } else {
      createCustomSelect(instanceContainer, [], t('instance_select_compartment_first'), () => {}, false, true);
    }
  };

  // --- Asynchronous Flow & Data Collection ---

  /**
   * Formats milliseconds into a MM:SS string.
   * @param {number} ms - Milliseconds to format.
   * @returns {string} The formatted time string.
   */
  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  /**
   * Starts the data collection task and begins polling for results.
   */
  const fetchAllDetails = async () => {
    clearInterval(pollingIntervalId);
    detailsContainer.classList.add('hidden');

    const taskType = selectedDocType === 'new_host' ? 'new_host' : 'full_infra';

    const payload = {
      type: taskType,
      doc_type: selectedDocType,
      region: selectedRegion,
    };

    if (taskType === 'new_host') {
      payload.details = {
        instance_ids: Object.keys(selectedInstances),
        compartment_id: selectedCompartmentId,
        compartment_name: selectedCompartmentName,
      };
    } else {
      payload.compartment_id = selectedCompartmentId;
    }

    showProgress();
    collectionStartTime = Date.now();

    progressTimerInterval = setInterval(() => {
      progressTimer.textContent = formatTime(Date.now() - collectionStartTime);
    }, 1000);

    try {
      const response = await fetch(`${API_BASE_URL}/api/start-collection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': currentLanguage
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Falha ao iniciar a tarefa de coleta.');
      }

      const {
        task_id
      } = await response.json();
      checkTaskStatus(task_id);

    } catch (error) {
      showToast(error.message, 'error');
      hideProgress();
    }
  };

  /**
   * Polls the backend for the status of the collection task.
   * @param {string} taskId The ID of the task to check.
   */
  const checkTaskStatus = (taskId) => {
    pollingIntervalId = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/collection-status/${taskId}`);
        if (!response.ok) {
          clearInterval(pollingIntervalId);
          showToast(t('toast.network_error'), 'error');
          hideProgress();
          return;
        }

        const data = await response.json();

        if (data.status === 'PROGRESS') {
          const progressInfo = data.result;
          if (progressInfo && typeof progressInfo === 'object') {
            const percentage = progressInfo.total > 0 ? (progressInfo.current / progressInfo.total) * 100 : 5;
            let progressMessage = progressInfo.step_key ? t(progressInfo.step_key, progressInfo.context) : (progressInfo.step || t('progress_loading'));
            updateProgress(percentage, progressMessage);
          }
        } else if (data.status === 'SUCCESS') {
          clearInterval(pollingIntervalId);
          const totalTime = Date.now() - collectionStartTime;
          progressTimer.textContent = formatTime(totalTime);

          const totalSeconds = Math.floor(totalTime / 1000);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          
          let durationString = "";
          if (minutes > 0) {
            durationString = t('toast.duration_minutes_and_seconds', { minutes: minutes, seconds: seconds });
          } else {
            durationString = t('toast.duration_seconds_only', { seconds: seconds });
          }
          showToast(t('toast.summary_generated_in', { duration: durationString }));

          updateProgress(100, t('progress.success'));
          allInfrastructureData = data.result;
          summaryContainer.innerHTML = generateInfrastructureSummary(allInfrastructureData);
          detailsContainer.classList.remove('hidden');
          setTimeout(hideProgress, 1200);

        } else if (data.status === 'FAILURE') {
          clearInterval(pollingIntervalId);
          showToast(t('toast.server_error'), 'error');
          hideProgress();
        }
      } catch (error) {
        if (progressBar.style.width !== '100%') {
          clearInterval(pollingIntervalId);
          showToast(t('toast.network_error'), 'error');
          hideProgress();
        } else {
          clearInterval(pollingIntervalId);
        }
      }
    }, 2000);
  };

  // --- Content and Document Generation Functions ---

  /**
   * Generates the HTML summary of the fetched infrastructure data.
   * @param {object} data The infrastructure data from the API.
   * @returns {string} The generated HTML string.
   */
  function generateInfrastructureSummary(data) {
    const isNewHostFlow = selectedDocType === 'new_host';
    const isKubernetesFlow = selectedDocType === 'kubernetes';

    const {
      instances,
      vcns,
      drgs,
      cpes,
      ipsec_connections,
      load_balancers,
      volume_groups,
      kubernetes_clusters,
    } = data;

    const createTable = (headers, rows) => {
      if (!rows || rows.length === 0) {
        return `<p class="no-data-message">${t('summary.no_resource_found')}</p>`;
      }
      const headerHtml = headers.map(h => `<th>${h}</th>`).join('');
      const bodyHtml = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
      return `<div class="table-container"><table class="resource-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
    };

    const instancesHtml = instances?.length > 0 ?
      instances.map(instance => generateInstanceSummaryCard(instance, true)).join('') :
      `<p class="no-data-message">${t('summary.no_instances_found')}</p>`;

    const volumeGroupsHtml = volume_groups?.length > 0 ?
      volume_groups.map(vg => {
        const { validation, lifecycle_state, display_name, availability_domain, members } = vg;
        const statusClass = lifecycle_state ? lifecycle_state.toLowerCase().replace('_', '-') : 'unknown';
        
        const backupHtml = validation.has_backup_policy ?
          `<span class="validation-ok"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> ${validation.policy_name}</span>` :
          `<span class="validation-fail"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> ${t('summary.none')}</span>`;
        
        const crossRegionHtml = validation.is_cross_region_replication_enabled ?
          `<span class="validation-ok"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> ${t('summary.enabled')}</span>` :
          `<span class="validation-fail"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> ${t('summary.disabled')}</span>`;
        
        const membersListHtml = members && members.length > 0 ?
          `<ul class="member-list">${members.map(m => `<li>${m}</li>`).join('')}</ul>` :
          `<p class="no-data-message">${t('summary.no_members_found')}</p>`;
        
        const cardContent = `
          <div class="content-block">
            <h5 class="subheader">${t('summary.vg.members')}</h5>
            ${membersListHtml}
          </div>
          <div class="content-block">
            <h5 class="subheader">${t('summary.vg.protection_validation')}</h5>
            <div class="validation-grid">
              <div class="validation-item">
                <label>${t('summary.vg.backup_policy')}</label>
                <div class="validation-value">${backupHtml}</div>
              </div>
              <div class="validation-item">
                <label>${t('summary.vg.cross_region_replication')}</label>
                <div class="validation-value">${crossRegionHtml}</div>
              </div>
              <div class="validation-item">
                <label>${t('summary.vg.replication_target')}</label>
                <div class="validation-value">${validation.cross_region_target}</div>
              </div>
            </div>
          </div>`;
        
        return `<div class="instance-summary-card collapsible"><div class="instance-card-header"><h4 class="card-header-title">${display_name}</h4><div class="card-status-indicator"><span class="vcn-card-header-cidr">${availability_domain}</span><span class="status-badge status-${statusClass}">${lifecycle_state}</span></div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="instance-card-body">${cardContent}</div></div>`;
      }).join('') :
      (isNewHostFlow ? '' : `<p class="no-data-message">${t('summary.no_vgs_found')}</p>`);

    let relevantVcns = vcns;
    if (isKubernetesFlow && kubernetes_clusters?.length > 0) {
      const clusterVcnIds = new Set(kubernetes_clusters.map(c => c.vcn_id));
      relevantVcns = vcns.filter(v => clusterVcnIds.has(v.id));
    }

    const vcnsHtml = relevantVcns?.length > 0 ?
      relevantVcns.map(vcn => {
        const subnetsTable = createTable([t('summary.vcn.subnet_name'), 'CIDR Block'], vcn.subnets?.map(s => [s.display_name, s.cidr_block]));
        const slTable = createTable([t('summary.name'), t('summary.rules_count')], vcn.security_lists?.map(sl => [sl.name, `${sl.rules.length}`]));
        const rtTable = createTable([t('summary.name'), t('summary.rules_count')], vcn.route_tables?.map(rt => [rt.name, `${rt.rules.length}`]));
        const nsgTable = createTable([t('summary.name'), t('summary.rules_count')], vcn.network_security_groups?.map(nsg => [nsg.name, `${nsg.rules.length}`]));
        const lpgTable = createTable(
          [t('summary.name'), t('summary.vcn.peering_status'), 'Route Table', t('summary.vcn.advertised_cidr'), 'Cross-Tenancy'],
          vcn.lpgs?.map(lpg => {
            const statusClass = lpg.peering_status?.toLowerCase() || 'unknown';
            const statusText = lpg.peering_status_details || lpg.peering_status;
            return [
              `<span class="text-highlight">${lpg.display_name}</span>`,
              `<span class="status-badge status-${statusClass}">${statusText}</span>`,
              lpg.route_table_name, lpg.peer_advertised_cidr || 'N/A',
              lpg.is_cross_tenancy_peering ? t('summary.yes') : t('summary.no')
            ];
          })
        );
        return `<div class="vcn-summary-card collapsible"><div class="vcn-card-header"><h4 class="card-header-title">${vcn.display_name}</h4><div class="card-status-indicator"><span class="vcn-card-header-cidr">${vcn.cidr_block}</span></div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="vcn-card-body"><h5 class="subheader">Subnets</h5>${subnetsTable}<h5 class="subheader">Security Lists</h5>${slTable}<h5 class="subheader">Route Tables</h5>${rtTable}<h5 class="subheader">Network Security Groups (NSGs)</h5>${nsgTable}<h5 class="subheader">Local Peering Gateways (LPGs)</h5>${lpgTable}</div></div>`;
      }).join('') :
      '';

    const loadBalancersHtml = load_balancers?.length > 0 ?
      load_balancers.map(lb => {
        const statusClass = lb.lifecycle_state ? lb.lifecycle_state.toLowerCase().replace('_', '-') : 'unknown';
        const cardContent = `
          <fieldset><legend>${ICONS.LB}${t('summary.lb.general_info')}</legend>
            <div class="grid-container">
              <div class="info-group full-width">
                <label>${t('summary.lb.ip_addresses')}</label>
                <div class="info-value">
                  <ul class="clean-list">${lb.ip_addresses?.map(ip => `<li>${ip.ip_address} (${ip.is_public ? t('summary.public') : t('summary.private')})</li>`).join('') || '<li>N/A</li>'}</ul>
                </div>
              </div>
              <div class="info-group full-width">
                <label>${t('summary.lb.virtual_hostnames')}</label>
                ${createTable([], lb.hostnames?.map(h => [`<span class="text-highlight">${h.name}</span>`]))}
              </div>
            </div>
          </fieldset>
          <hr class="fieldset-divider">
          <div class="content-block">
            <h5 class="subheader">Listeners</h5>
            ${createTable([t('summary.name'), t('summary.protocol'), t('summary.port'), t('summary.lb.default_backend_set')], lb.listeners?.map(l => [`<span class="text-highlight">${l.name}</span>`, l.protocol, l.port, l.default_backend_set_name]))}
          </div>
          <div class="content-block">
            <h5 class="subheader">Backend Sets</h5>
            ${(lb.backend_sets && lb.backend_sets.length > 0) ? lb.backend_sets.map(bs => `<div class="backend-set-details"><h6 class="tunnel-subheader">Backend Set: <span class="text-highlight">${bs.name}</span> (${t('summary.lb.policy')}: ${bs.policy})</h6><ul class="tunnel-basic-info"><li><strong>Health Check:</strong> ${bs.health_checker.protocol}:${bs.health_checker.port}</li><li><strong>URL Path:</strong> ${bs.health_checker.url_path || 'N/A'}</li></ul>${createTable([t('summary.name'), 'IP', t('summary.port'), t('summary.weight')], bs.backends?.map(b => [`<span class="text-highlight">${b.name}</span>`, b.ip_address, b.port, b.weight]))}</div>`).join('') : `<p class="no-data-message">${t('summary.no_backend_sets_found')}</p>`}
          </div>`;
        return `<div class="instance-summary-card collapsible"><div class="instance-card-header"><h4 class="card-header-title">${lb.display_name}</h4><div class="card-status-indicator"><span class="vcn-card-header-cidr">${lb.shape_name}</span><span class="status-badge status-${statusClass}">${lb.lifecycle_state}</span></div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="instance-card-body">${cardContent}</div></div>`;
      }).join('') :
      '';

    const drgsHtml = drgs?.length > 0 ?
      drgs.map(drg => {
        const attachmentsTable = createTable([t('summary.drg.attachment_name'), t('summary.type'), 'DRG Route Table'], drg.attachments?.map(a => [`<span class="text-highlight">${a.display_name}</span>`, a.network_type, a.route_table_name]));
        const rpcsTable = createTable([t('summary.name'), t('summary.status'), t('summary.vcn.peering_status')],
          drg.rpcs?.map(rpc => {
            const statusClass = rpc.peering_status?.toLowerCase() || 'unknown';
            let statusText = rpc.peering_status_details || rpc.peering_status;
            if (rpc.peering_status === 'NEW') statusText = 'New (not peered)';
            else if (rpc.peering_status === 'PEERED') statusText = 'Peered';
            return [`<span class="text-highlight">${rpc.display_name}</span>`, rpc.lifecycle_state, `<span class="status-badge status-${statusClass}">${statusText}</span>`];
          })
        );
        return `<div class="instance-summary-card collapsible"><div class="instance-card-header"><h4 class="card-header-title">${drg.display_name}</h4><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="instance-card-body"><h5 class="subheader">${t('summary.drg.attachments')}</h5>${attachmentsTable}<h5 class="subheader">${t('summary.drg.rpcs')}</h5>${rpcsTable}</div></div>`;
      }).join('') :
      '';

    const cpesHtml = createTable(
      [t('summary.vpn.cpe_name'), t('summary.lb.ip_addresses'), t('summary.vpn.vendor')],
      cpes?.map(cpe => [`<span class="text-highlight">${cpe.display_name}</span>`, cpe.ip_address, cpe.vendor || 'N/A'])
    );

    const ipsecHtml = ipsec_connections?.length > 0 ?
      ipsec_connections.map(ipsec => {
        const cpeName = cpes.find(c => c.id === ipsec.cpe_id)?.display_name || t('summary.none');
        const drgName = drgs.find(d => d.id === ipsec.drg_id)?.display_name || t('summary.none');
        const tunnelsHtml = ipsec.tunnels.map(tunnel => {
          const p1 = tunnel.phase_one_details;
          const p2 = tunnel.phase_two_details;
          let bgpDetailsHtml = '';
          if (tunnel.routing_type === 'BGP' && tunnel.bgp_session_info) {
            const bgp = tunnel.bgp_session_info;
            bgpDetailsHtml = `
              <div class="crypto-details-grid">
                <div>
                  <h6 class="tunnel-subheader">${t('summary.vpn.bgp_session')}</h6>
                  <ul><li><strong>${t('summary.vpn.oracle_asn')}:</strong> ${bgp.oracle_bgp_asn || 'N/A'}</li><li><strong>${t('summary.vpn.customer_asn')}:</strong> ${bgp.customer_bgp_asn || 'N/A'}</li></ul>
                </div>
                <div>
                  <h6 class="tunnel-subheader">${t('summary.vpn.peering_ips')}</h6>
                  <ul><li><strong>${t('summary.vpn.oracle_interface')}:</strong> ${bgp.oracle_interface_ip || 'N/A'}</li><li><strong>${t('summary.vpn.customer_interface')}:</strong> ${bgp.customer_interface_ip || 'N/A'}</li></ul>
                </div>
              </div><hr class="tunnel-divider">`;
          }
          return `
            <div class="tunnel-details">
              <div class="tunnel-header">
                <strong>${t('summary.vpn.tunnel')}: <span class="text-highlight">${tunnel.display_name}</span></strong>
                <span class="status-badge status-${tunnel.status.toLowerCase()}">${tunnel.status}</span>
              </div>
              <ul class="tunnel-basic-info">
                <li><strong>${t('summary.vpn.oracle_ip')}:</strong> ${tunnel.vpn_oracle_ip || 'N/A'}</li><li><strong>${t('summary.vpn.cpe_ip')}:</strong> ${tunnel.cpe_ip || 'N/A'}</li>
                <li><strong>${t('summary.routing')}:</strong> ${tunnel.routing_type}</li><li><strong>IKE:</strong> ${tunnel.ike_version}</li>
              </ul>
              ${bgpDetailsHtml}
              <div class="crypto-details-grid">
                <div>
                  <h6 class="tunnel-subheader">${t('summary.vpn.phase1')}</h6>
                  <ul>
                    <li><strong>${t('summary.vpn.auth')}:</strong> ${p1.authentication_algorithm}</li><li><strong>${t('summary.vpn.encryption')}:</strong> ${p1.encryption_algorithm}</li>
                    <li><strong>DH Group:</strong> ${p1.dh_group}</li><li><strong>${t('summary.lifetime')}:</strong> ${p1.lifetime_in_seconds}s</li>
                  </ul>
                </div>
                <div>
                  <h6 class="tunnel-subheader">${t('summary.vpn.phase2')}</h6>
                  <ul>
                    <li><strong>${t('summary.vpn.auth')}:</strong> ${p2.authentication_algorithm || 'N/A'}</li><li><strong>${t('summary.vpn.encryption')}:</strong> ${p2.encryption_algorithm}</li>
                    <li><strong>${t('summary.lifetime')}:</strong> ${p2.lifetime_in_seconds}s</li>
                  </ul>
                </div>
              </div>
            </div>`;
        }).join('<hr class="tunnel-divider">');
        const hasBgpTunnel = ipsec.tunnels.some(t => t.routing_type === 'BGP');
        const routingDisplay = hasBgpTunnel ?
          `<span class="full-width"><strong>${t('summary.routing')}:</strong> BGP</span>` :
          `<span class="full-width"><strong>${t('summary.vpn.static_routes')}:</strong> ${(ipsec.static_routes && ipsec.static_routes.length > 0) ? ipsec.static_routes.join(', ') : t('summary.none')}</span>`;
        return `<div class="ipsec-summary-card collapsible"><div class="ipsec-card-header"><h4 class="card-header-title">${ipsec.display_name}</h4><div class="card-status-indicator"><span class="status-badge status-${ipsec.status.toLowerCase()}">${ipsec.status}</span></div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="ipsec-card-body"><div class="ipsec-details"><span><strong>${t('summary.vpn.associated_cpe')}:</strong> ${cpeName}</span><span><strong>${t('summary.vpn.associated_drg')}:</strong> ${drgName}</span></div><div class="ipsec-details">${routingDisplay}</div><h5 class="subheader">${t('summary.vpn.tunnels')}</h5>${tunnelsHtml || `<p class="no-data-message">${t('summary.no_tunnels_found')}</p>`}</div></div>`;
      }).join('') :
      '';

    const okeClustersHtml = kubernetes_clusters?.length > 0 ?
      kubernetes_clusters.map(cluster => {
        const nodePoolsHtml = cluster.node_pools?.map(np => `
          <div class="instance-summary-card collapsible node-pool-card">
            <div class="instance-card-header">
                <h4 class="card-header-title">${np.name}</h4>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div class="instance-card-body">
              <fieldset>
                <legend>${t('summary.oke.hw_config')}</legend>
                <div class="grid-container">
                  <div class="info-group full-width"><label>Shape</label><div class="info-value">${np.shape}</div></div>
                  <div class="info-group"><label>OCPUs</label><div class="info-value">${np.ocpus}</div></div>
                  <div class="info-group"><label>${t('summary.instance.memory')}</label><div class="info-value">${np.memory_in_gbs}</div></div>
                  <div class="info-group"><label>${t('summary.disk')}</label><div class="info-value">${np.boot_volume_size_in_gbs}</div></div>
                  <div class="info-group"><label>${t('summary.oke.nodes')}</label><div class="info-value">${np.node_count}</div></div>
                  <div class="info-group full-width"><label>Subnet</label><div class="info-value">${np.subnet_name}</div></div>
                </div>
              </fieldset>
            </div>
          </div>`).join('') || `<p class="no-data-message">${t('summary.no_node_pools_found')}</p>`;
        return `
          <div class="instance-summary-card collapsible">
            <div class="oke-card-header">
              <h4 class="card-header-title">${cluster.name}</h4>
              <div class="card-status-indicator"><span class="oke-version-badge">${cluster.kubernetes_version}</span></div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div class="instance-card-body">
              <h5 class="subheader">${t('summary.oke.cluster_connectivity')}</h5>
              <div class="connectivity-grid">
                <div class="connectivity-item full-span"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg><div class="text-content"><label>${t('summary.oke.associated_vcn')}</label><span class="value">${cluster.vcn_name}</span></div></div>
                <div class="connectivity-item"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 0 0 9-9 9 9 0 0 0-9-9 9 9 0 0 0-9 9 9 9 0 0 0 9 9Z"></path><path d="M8 12a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1Z"></path><path d="M15 12a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1Z"></path><path d="M12 2v2"></path><path d="M12 8v2"></path></svg><div class="text-content"><label>Subnet (Load Balancer)</label><span class="value">${cluster.lb_subnet_name}</span></div></div>
                <div class="connectivity-item"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" x2="6" y1="6" y2="6"></line><line x1="6" x2="6" y1="18" y2="18"></line></svg><div class="text-content"><label>Subnet (Worker Nodes)</label><span class="value">${cluster.nodes_subnet_name}</span></div></div>
                <div class="connectivity-item full-span"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg><div class="text-content"><label>${t('summary.oke.public_endpoint')}</label><span class="value code">${cluster.public_api_endpoint || 'N/A'}</span></div></div>
                <div class="connectivity-item full-span"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg><div class="text-content"><label>${t('summary.oke.private_endpoint')}</label><span class="value code">${cluster.private_api_endpoint || 'N/A'}</span></div></div>
              </div>
              <h5 class="subheader">Node Pools</h5><div class="node-pool-container">${nodePoolsHtml}</div>
            </div>
          </div>`;
      }).join('') :
      `<p class="no-data-message">${t('summary.no_oke_found')}</p>`;

    let titleKey = 'summary.title.full_infra';
    if (isNewHostFlow) {
      titleKey = 'summary.title.new_host';
    } else if (isKubernetesFlow) {
      titleKey = 'summary.title.k8s';
    }
    let title = t(titleKey, { name: selectedCompartmentName });
    
    let mainContentHtml = '';

    if (isNewHostFlow) {
      mainContentHtml = `
        <fieldset><legend>${ICONS.INSTANCES}${t('summary.compute_instances')}</legend><div class="instances-container">${instancesHtml}</div></fieldset>
        ${volumeGroupsHtml ? `<hr class="fieldset-divider"><fieldset><legend>${ICONS.VOLUME_GROUPS}${t('summary.associated_vgs')}</legend><div class="vg-container">${volumeGroupsHtml}</div></fieldset>`: ''}`;
    } else if (isKubernetesFlow) {
      mainContentHtml = `
        <fieldset><legend>${ICONS.OKE}${t('summary.oke_clusters')}</legend><div class="oke-container">${okeClustersHtml}</div></fieldset>
        <hr class="fieldset-divider">
        <fieldset><legend>${ICONS.VCNS}${t('summary.vcns')}</legend><div class="vcn-container">${vcnsHtml || `<p class="no-data-message">${t('summary.no_vcns_associated')}</p>`}</div></fieldset>`;
    } else { // Full Infra
      mainContentHtml = `
        <fieldset><legend>${ICONS.INSTANCES}${t('summary.compute_instances')}</legend><div class="instances-container">${instancesHtml}</div></fieldset>
        ${volumeGroupsHtml ? `<hr class="fieldset-divider"><fieldset><legend>${ICONS.VOLUME_GROUPS}${t('summary.vgs')}</legend><div class="vg-container">${volumeGroupsHtml}</div></fieldset>`: ''}
        <hr class="fieldset-divider"><fieldset><legend>${ICONS.VCNS}${t('summary.vcns')}</legend><div class="vcn-container">${vcnsHtml || `<p class="no-data-message">${t('summary.no_vcns_found')}</p>`}</div></fieldset>
        <hr class="fieldset-divider"><fieldset><legend>${ICONS.OKE}${t('summary.oke_clusters')}</legend><div class="oke-container">${okeClustersHtml}</div></fieldset>
        <hr class="fieldset-divider"><fieldset><legend>${ICONS.LB}${t('summary.lbs')}</legend><div class="lb-container">${loadBalancersHtml || `<p class="no-data-message">${t('summary.no_lbs_found')}</p>`}</div></fieldset>
        <hr class="fieldset-divider"><fieldset><legend>${ICONS.ROUTING}${t('summary.routing_connectivity')}</legend><div class="drg-container">${drgsHtml || `<p class="no-data-message">${t('summary.no_drgs_found')}</p>`}</div></fieldset>
        <hr class="fieldset-divider"><fieldset><legend>${ICONS.VPN}${t('summary.vpn_connectivity')}</legend><h4 class="subheader">${t('summary.vpn.cpes')}</h4>${cpesHtml}<h4 class="subheader">${t('summary.vpn.ipsec_connections')}</h4><div class="ipsec-container">${ipsecHtml || `<p class="no-data-message">${t('summary.no_ipsec_found')}</p>`}</div></fieldset>`;
    }

    return `<div><h3 class="infra-summary-main-title">${title}</h3>${mainContentHtml}</div>`;
  }

  /**
   * Generates a single, collapsible HTML card for an instance summary.
   * @param {object} data - The data for a single instance.
   * @param {boolean} isCollapsible - If the card should be collapsible.
   * @returns {string} The generated HTML string.
   */
  function generateInstanceSummaryCard(data, isCollapsible = false) {
    const cardContent = `
      <fieldset><legend>${ICONS.INSTANCE_DATA}${t('summary.instance.data')}</legend>
        <div class="grid-container">
          <div class="info-group"><label>Shape</label><div class="info-value">${data.shape}</div></div>
          <div class="info-group"><label>OCPUs</label><div class="info-value">${data.ocpus}</div></div>
          <div class="info-group"><label>${t('summary.instance.memory')}</label><div class="info-value">${data.memory}</div></div>
          <div class="info-group"><label>${t('summary.instance.boot_volume')}</label><div class="info-value">${data.boot_volume_gb}</div></div>
          <div class="info-group full-width"><label>${t('summary.instance.os')}</label><div class="info-value">${data.os_name}</div></div>
          <div class="info-group"><label>${t('summary.instance.private_ip')}</label><div class="info-value">${data.private_ip}</div></div>
          <div class="info-group"><label>${t('summary.instance.public_ip')}</label><div class="info-value">${data.public_ip || 'N/A'}</div></div>
          <div class="info-group full-width"><label>${t('summary.instance.backup_policy')}</label><div class="info-value">${data.backup_policy_name}</div></div>
        </div>
      </fieldset>
      <hr class="fieldset-divider">
      <fieldset><legend>${ICONS.BLOCK_VOLUMES}${t('summary.instance.attached_volumes')}</legend>
        <div class="table-container">
          ${data.block_volumes && data.block_volumes.length > 0 ? 
            `<table class="bv-table"><thead><tr><th>${t('summary.instance.volume_name')}</th><th>${t('summary.instance.size')}</th><th>${t('summary.instance.backup_policy')}</th></tr></thead><tbody>${data.block_volumes.map(vol => `<tr><td>${vol.display_name}</td><td>${vol.size_in_gbs}</td><td>${vol.backup_policy_name}</td></tr>`).join('')}</tbody></table>` : 
            `<p class="no-data-message">${t('summary.no_block_volumes_found')}</p>`
          }
        </div>
      </fieldset>
      <hr class="fieldset-divider">
      <fieldset><legend>${ICONS.CONNECTIVITY}${t('summary.instance.network_summary')}</legend>
        <div class="summary-grid">
          <div class="summary-group">
            <label>Security Lists</label>
            <div class="summary-box">${data.security_lists && data.security_lists.length > 0 ? data.security_lists.map(sl => `<span class="summary-item">${sl.name}</span>`).join('') : `<span class="summary-item empty">${t('summary.none')}</span>`}</div>
          </div>
          <div class="summary-group">
            <label>Network Security Groups (NSGs)</label>
            <div class="summary-box">${data.network_security_groups && data.network_security_groups.length > 0 ? data.network_security_groups.map(nsg => `<span class="summary-item">${nsg.name}</span>`).join('') : `<span class="summary-item empty">${t('summary.none')}</span>`}</div>
          </div>
          <div class="summary-group full-width">
            <label>Route Table</label>
            <div class="summary-box">${data.route_table && data.route_table.name ? `<span class="summary-item">${data.route_table.name}</span>` : `<span class="summary-item empty">${t('summary.none')}</span>`}</div>
          </div>
        </div>
      </fieldset>`;

    if (isCollapsible) {
      const isRunning = data.lifecycle_state === 'RUNNING';
      const statusText = isRunning ? t('summary.instance.running') : t('summary.instance.stopped');
      const statusClass = isRunning ? 'running' : 'stopped';
      return `
        <div class="instance-summary-card collapsible">
          <div class="instance-card-header">
            <h4 class="card-header-title">${data.host_name}</h4>
            <div class="card-status-indicator">
              <span class="status-dot ${statusClass}"></span>
              <span class="status-label ${statusClass}">${statusText}</span>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
          <div class="instance-card-body">${cardContent}</div>
        </div>`;
    } else {
      return `
        <div class="instance-summary-card">
          <h3 class="instance-summary-title">${data.host_name}</h3>
          ${cardContent}
        </div>`;
    }
  }

  /**
   * Triggers the document generation process by sending data to the backend.
   */
  const generateDocument = () => {
    const responsibleName = responsibleNameInput.value.trim();
    if (!responsibleName) {
      showToast(t('toast.responsible_required'), 'error');
      responsibleNameInput.focus();
      return;
    }

    const hasData = allInfrastructureData &&
      (allInfrastructureData.instances?.length ||
        allInfrastructureData.kubernetes_clusters?.length ||
        allInfrastructureData.vcns?.length);

    if (!hasData) {
      showToast(t('toast.fetch_data_first'), 'error');
      return;
    }

    try {
      toggleLoading(true);
      const formData = new FormData();
      const payload = {
        doc_type: selectedDocType,
        infra_data: allInfrastructureData,
        responsible_name: responsibleName,
        lang: currentLanguage
      };

      formData.append('json_data', JSON.stringify(payload));
      architectureImageFiles.forEach(file => formData.append('architecture_files', file));
      antivirusImageFiles.forEach(file => formData.append('antivirus_files', file));

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/api/generate-document`, true);
      xhr.responseType = 'blob';
      xhr.onloadend = () => toggleLoading(false);
      xhr.onerror = () => showToast(t('toast.network_error'), 'error');

      xhr.onload = function() {
        if (this.status === 200) {
          const blob = this.response;
          if (blob.size === 0) {
            showToast(t('toast.empty_response'), 'error');
            return;
          }
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `DocGen_${Date.now()}.docx`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          a.remove();
          showSuccessScreen();
        } else {
          const reader = new FileReader();
          reader.onload = function() {
            try {
              const error = JSON.parse(this.result);
              showToast(`${t('toast.server_error')}: ${error.detail || this.statusText}`, 'error');
            } catch (e) {
              showToast(`${t('toast.server_error')}: ${this.status} - ${this.statusText}`, 'error');
            }
          }
          reader.readAsText(this.response);
        }
      };
      xhr.send(formData);
    } catch (error) {
      showToast(`${t('toast.critical_error')}: ` + error.toString(), 'error');
      toggleLoading(false);
    }
  };

  /**
   * Updates the UI to show a preview of the selected files for upload.
   * @param {Array<File>} fileArray - The array of files to display.
   * @param {HTMLElement} fileListContainer - The DOM element to render the list into.
   */
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>`;
        fileListContainer.appendChild(fileItem);
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Handles the file selection event from an input element.
   * @param {Event} event - The file input change event.
   * @param {Array<File>} fileArray - The state array to add files to.
   * @param {HTMLElement} fileListContainer - The UI container to update.
   */
  function handleFileSelect(event, fileArray, fileListContainer) {
    const newFiles = event.target.files;
    if (!newFiles || newFiles.length === 0) return;
    Array.from(newFiles).forEach(file => fileArray.push(file));
    updateFileListUI(fileArray, fileListContainer);
    event.target.value = '';
  }

  /**
   * Handles the paste event to allow pasting images from the clipboard.
   * @param {ClipboardEvent} event - The paste event.
   * @param {Array<File>} fileArray - The state array to add files to.
   * @param {HTMLElement} fileListContainer - The UI container to update.
   */
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

  /**
   * Handles the click event to delete a file from the list.
   * @param {Event} event - The click event.
   * @param {Array<File>} fileArray - The state array to remove the file from.
   * @param {HTMLElement} fileListContainer - The UI container to update.
   */
  function handleFileDelete(event, fileArray, fileListContainer) {
    const deleteButton = event.target.closest('.file-list-delete-btn');
    if (!deleteButton) return;

    const indexToRemove = parseInt(deleteButton.dataset.index, 10);
    if (!isNaN(indexToRemove)) {
      fileArray.splice(indexToRemove, 1);
      updateFileListUI(fileArray, fileListContainer);
    }
  }

  /**
   * Initializes the application by fetching initial data and setting up UI components.
   */
  const initializeApp = async () => {
    const savedLang = localStorage.getItem('oci-docgen-lang') || 'pt';
    await setLanguage(savedLang);
    fetchRegions();
  };

  // --- Event Listeners ---
  fetchBtn.addEventListener('click', fetchAllDetails);
  generateBtn.addEventListener('click', generateDocument);
  newDocBtn.addEventListener('click', resetApp);
  document.addEventListener('click', closeAllSelects);
  summaryContainer.addEventListener('click', (event) => {
    const header = event.target.closest('.instance-card-header, .vcn-card-header, .ipsec-card-header, .oke-card-header');
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
  languageSelector.addEventListener('change', (e) => setLanguage(e.target.value));

  // --- Initial Load ---
  initializeApp();
});