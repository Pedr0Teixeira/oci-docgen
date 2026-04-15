document.addEventListener('DOMContentLoaded', () => {

  // --- Settings and Constants ---
  //const API_BASE_URL = 'http://127.0.0.1:8000'; // Local dev (sem Docker)
  const API_BASE_URL = ''; // Docker / produção (nginx proxy)

  // --- DOM Element Selectors ---
  const mainAppContainer = document.getElementById('app-shell');
  const profileContainer = document.getElementById('profile-select-container');
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
  const imageSectionsList = document.getElementById('image-sections-list');
  const addImageSectionBtn = document.getElementById('add-image-section-btn');
  const docPreviewBtn = document.getElementById('doc-preview-btn');
  const previewOverlay = document.getElementById('preview-overlay');
  const previewModalBody = document.getElementById('preview-modal-body');
  const previewModalClose = document.getElementById('preview-modal-close');
  const lightboxOverlay = document.getElementById('lightbox-overlay');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.getElementById('lightbox-close');
  const toastContainer = document.getElementById('toast-container');
  const progressText = document.getElementById('progress-text');
  const progressBar = document.getElementById('progress-bar');
  const progressPct = document.getElementById('progress-pct');
  const progressSpinner = loadingOverlay.querySelector('.spinner');
  const progressCloudIcon = document.getElementById('progress-cloud-icon');
  const progressCheckIcon = document.getElementById('progress-check-icon');
  const progressPipeline      = document.getElementById('progress-pipeline');
  const progressCompSection   = document.getElementById('progress-comp-section');
  const progressCompList      = document.getElementById('progress-comp-list');
  const pipelineCompLabel     = document.getElementById('pipeline-comp-label');
  const pageLoaderBar         = document.getElementById('page-loader-bar');
  const successScreen = document.getElementById('success-screen');
  const newDocBtn = document.getElementById('new-doc-btn');
  const languageSelector = document.getElementById('language-selector'); // may be null (replaced by flags)

  // Auth + navigation elements
  const appShell           = document.getElementById('app-shell');
  const sidebarHistory     = document.getElementById('sidebar-history');
  const authModal          = document.getElementById('auth-modal');
  const authModalCloseBtn  = document.getElementById('auth-modal-close-btn');
  const authTabs           = document.querySelectorAll('.auth-tab');
  const authFormLogin      = document.getElementById('auth-form-login');
  const authFormRegister   = document.getElementById('auth-form-register');
  const loginUsernameInput = document.getElementById('login-username');
  const loginPasswordInput = document.getElementById('login-password');
  const loginSubmitBtn     = document.getElementById('login-submit-btn');
  const loginError         = document.getElementById('login-error');
  const registerUsernameInput = document.getElementById('register-username');
  const registerPasswordInput = document.getElementById('register-password');
  const registerSubmitBtn  = document.getElementById('register-submit-btn');
  const registerError      = document.getElementById('register-error');
  const sidebarGuest       = document.getElementById('sidebar-guest');
  const sidebarUser        = document.getElementById('sidebar-user');
  const sidebarLoginBtn    = document.getElementById('sidebar-login-btn');
  const sidebarLogoutBtn   = document.getElementById('sidebar-logout-btn');
  const includeStandaloneChk = document.getElementById('include-standalone-volumes');
  const sidebarProfileBtn  = document.getElementById('sidebar-profile-btn');
  const sidebarUserName    = document.getElementById('sidebar-user-name');
  const sidebarUserAvatar  = document.getElementById('sidebar-user-avatar');
  const navGenerator       = document.getElementById('nav-generator');
  const navMetrics         = document.getElementById('nav-metrics');
  const navAdmin           = document.getElementById('nav-admin');
  const viewGenerator      = document.getElementById('view-generator');
  const viewMetrics        = document.getElementById('view-metrics');
  const viewAdmin          = document.getElementById('view-admin');
  const metricsTitle       = document.getElementById('metrics-title');
  const metricsGuestNotice = document.getElementById('metrics-guest-notice');
  const metricsLoginCta    = document.getElementById('metrics-login-cta');

  // --- Progress Pipeline Stage Definitions ---
  const PIPELINE_STAGES_ALL = [
    { id: 'init',         labelKey: 'pipe.init',         stepKeys: ['progress.initializing_clients'] },
    { id: 'compute',      labelKey: 'pipe.compute',      stepKeys: ['progress.listing_instances','progress.starting_new_host','progress.analyzing_vm','progress.analyzing_host_count'] },
    { id: 'networking',   labelKey: 'pipe.networking',   stepKeys: ['progress.analyzing_vcns','progress.analyzing_cluster_network','progress.mapping_waf_network'] },
    { id: 'storage',      labelKey: 'pipe.storage',      stepKeys: ['progress.mapping_storage'] },
    { id: 'security',     labelKey: 'pipe.security',     stepKeys: ['progress.checking_network_connectivity','progress.collecting_certificates','progress.collecting_waf_infra','progress.listing_waf','progress.analyzing_waf_attachments'] },
    { id: 'lbs',          labelKey: 'pipe.lbs',          stepKeys: ['progress.inspecting_lbs'] },
    { id: 'connectivity', labelKey: 'pipe.connectivity', stepKeys: ['progress.collecting_connectivity','progress.collecting_vpn'] },
    { id: 'oke',          labelKey: 'pipe.oke',          stepKeys: ['progress.checking_oke','progress.listing_oke','progress.analyzing_worker'] },
    { id: 'database',     labelKey: 'pipe.database',     stepKeys: ['progress.listing_db_systems','progress.collecting_db_network'] },
    { id: 'finish',       labelKey: 'pipe.finish',       stepKeys: ['progress.finishing','progress.merging_compartments','progress.assembling_report','progress.success'] },
  ];
  const PIPELINE_BY_TYPE = {
    full_infra: ['init','compute','networking','storage','security','lbs','connectivity','oke','database','finish'],
    new_host:   ['init','compute','networking','finish'],
    kubernetes: ['init','networking','oke','finish'],
    waf_report: ['init','security','networking','finish'],
    database:   ['init','networking','database','finish'],
  };
  // Build reverse lookup: stepKey → stageId
  const STEP_TO_STAGE = {};
  PIPELINE_STAGES_ALL.forEach(s => s.stepKeys.forEach(k => { STEP_TO_STAGE[k] = s.id; }));

  // SVG icons per pipeline stage (16×16 viewBox, currentColor)
  const PIPELINE_STAGE_ICONS = {
    init:         `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z"/><path d="M8 4.5V8l2 1.5"/></svg>`,
    compute:      `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M5 12.5v1.5M11 12.5v1.5M3.5 14h9M5.5 7h.5M10 7h.5"/><line x1="1.5" y1="7" x2="14.5" y2="7"/></svg>`,
    networking:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2.5-2 9.5 0 12M8 2c2 2.5 2 9.5 0 12"/></svg>`,
    storage:      `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="8" cy="5" rx="5.5" ry="2"/><path d="M2.5 5v6c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V5"/><path d="M2.5 8.5c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"/></svg>`,
    security:     `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5L2 4.5v4c0 3 2.5 5.5 6 6 3.5-0.5 6-3 6-6v-4L8 1.5z"/></svg>`,
    lbs:          `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="5.5" width="13" height="5" rx="1.5"/><path d="M8 5.5v-3M5 3h6M5 10.5v2.5M11 10.5v2.5M3 13h4M9 13h4"/></svg>`,
    connectivity: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8h13M10.5 4.5l3 3.5-3 3.5M5.5 4.5L2.5 8l3 3.5"/></svg>`,
    oke:          `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="8,1.5 14,5 14,11 8,14.5 2,11 2,5"/><circle cx="8" cy="8" r="2"/></svg>`,
    database:     `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="8" cy="4.5" rx="5.5" ry="2"/><path d="M2.5 4.5v7c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-7"/><path d="M2.5 8.5c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"/></svg>`,
    finish:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><polyline points="5,8.5 7,10.5 11,6"/></svg>`,
  };

  let _pipelineStageIds       = [];  // current doc type's stage order
  let _pipelineActiveIdx      = 0;   // index of currently active stage
  let _lastKnownCompIdx       = -1;  // last compartment index seen, to detect transitions

  // --- Inline SVG Icon Definitions ---
  const ICONS = {
    WAF:          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`,
    INSTANCES:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`,
    INSTANCE_DATA:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
    BLOCK_VOLUMES:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>`,
    VOLUME_GROUPS:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    VCNS:         `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect x="2" y="9" width="4" height="4" rx="1"/><rect x="18" y="9" width="4" height="4" rx="1"/><rect x="10" y="2" width="4" height="4" rx="1"/><rect x="10" y="18" width="4" height="4" rx="1"/><line x1="6" y1="11" x2="10" y2="11"/><line x1="14" y1="11" x2="18" y2="11"/><line x1="12" y1="6" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="18"/></svg>`,
    OKE:          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="7.05" y2="7.05"/><line x1="16.95" y1="16.95" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="7.05" y2="16.95"/><line x1="16.95" y1="7.05" x2="19.78" y2="4.22"/></svg>`,
    LB:           `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><line x1="7" y1="6" x2="10" y2="6"/><line x1="14" y1="6" x2="17" y2="6"/><line x1="5" y1="8" x2="12" y2="16"/><line x1="19" y1="8" x2="12" y2="16"/></svg>`,
    CONNECTIVITY: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>`,
    ROUTING:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
    VPN:          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>`,
    BOOT_VOLUME:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect x="2" y="2" width="20" height="8" rx="2" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`,
    STORAGE:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>`,
    CERTIFICATES: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><circle cx="12" cy="8" r="6"/><path d="m9 8 2 2 4-4"/><path d="M6.5 14.5 5 20l7-2 7 2-1.5-5.5"/></svg>`,
  };


  // --- Helper to normalize lifecycle state display labels ---
  function getStateLabel(state) {
    const s = (state || '').toUpperCase();
    if (s === 'TERMINATED') return t('state.terminated');
    if (s === 'RUNNING')    return t('state.running');
    if (s === 'STOPPED')    return t('state.stopped');
    return state;
  }

  function getStateCssClass(state) {
    const s = (state || '').toUpperCase();
    if (s === 'TERMINATED') return 'terminated';
    return s.toLowerCase().replace(/_/g, '-');
  }

  // --- Global Application State ---
  let selectedRegion = null;
  let selectedDocType = null;
  let selectedCompartmentId = null;
  let selectedCompartmentName = null;
  let selectedCompartments = {};
  const COMP_PALETTE = ['#7c3aed','#0d9488','#d97706','#16a34a','#e11d48'];
  const getSelectedCompartmentId = () => Object.keys(selectedCompartments)[0] || null;
  const getSelectedCompartmentName = () => Object.values(selectedCompartments).join(', ') || null;
  let selectedInstances = {};
  let allInfrastructureData = {};
  // imageSections: [{id, name, position, files:[File]}]
  let imageSections = [];
  let sectionIdCounter = 0;
  // letterhead state: {enabled, headerFile, footerFile, coverFile}
  let letterhead = { enabled: false, headerFile: null, footerFile: null, coverFile: null };
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

    document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
      const key = element.getAttribute('data-i18n-aria-label');
      element.setAttribute('aria-label', t(key));
    });

    updateUiForDocType();

    // Re-render dynamically built admin tables so column headers update on language change
    const profilesTableWrap = document.getElementById('admin-profiles-table-wrap');
    if (profilesTableWrap && profilesTableWrap.querySelector('table')) {
      loadAdminProfiles();
    }
  };

  const setLanguage = async (lang) => {
    currentLanguage = lang;
    window.currentLanguage = lang; // expose to diagram.js (global scope)
    localStorage.setItem('oci-docgen-lang', lang);
    // Update flag buttons
    document.querySelectorAll('.lang-flag-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    // Legacy selector (may be null)
    if (languageSelector) languageSelector.value = lang;

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
        const docTypeNameMap = {
          full_infra: t('doc_type_full'),
          new_host:   t('doc_type_new'),
          kubernetes: t('doc_type_k8s'),
          waf_report: t('doc_type_waf'),
          database:   t('doc_type_database'),
        };
        const docTypeName = docTypeNameMap[selectedDocType] || selectedDocType;
        const selectedContent = docTypeContainer.querySelector('.selected-item-display');
        selectedContent.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg><span class="item-text">${docTypeName}</span>`;
        selectedContent.classList.remove('placeholder');
    }

    const compPlaceholder = selectedRegion ? t('step3_placeholder') : t('instance_select_compartment_first');
    const isMultiComp = selectedDocType === 'full_infra';
    createCustomSelect(
      compartmentContainer,
      allCompartmentsData,
      compPlaceholder,
      (selectedValue, selectedName, isChecked) => {
        if (isMultiComp) {
          if (isChecked) {
            selectedCompartments[selectedValue] = selectedName;
          } else {
            delete selectedCompartments[selectedValue];
          }
          updateCompartmentMultiSelectDisplay();
        } else {
          selectedCompartments = {};
          selectedCompartments[selectedValue] = selectedName;
        }
        selectedCompartmentId = getSelectedCompartmentId();
        selectedCompartmentName = getSelectedCompartmentName();
        resetAndFetchInstances();
        updateFetchButtonState();
      },
      allCompartmentsData.length > 0,
      isMultiComp,
      isMultiComp ? selectedCompartments : null
    );

    if (isMultiComp) {
      updateCompartmentMultiSelectDisplay();
    } else if (selectedCompartmentId && selectedCompartmentName) {
        const selectedContent = compartmentContainer.querySelector('.selected-item-display');
        const level = allCompartmentsData.find(c => c.id === selectedCompartmentId)?.level || 0;
        const folderIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon" style="color:var(--accent)"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`;
        const prefixHtml = level > 0 ? `<span class="item-tree-prefix"></span>` : '';
        selectedContent.innerHTML = `${prefixHtml}${folderIconSvg}<span class="item-text">${selectedCompartmentName}</span>`;
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
      if (typeof initDiagramInteraction === 'function') initDiagramInteraction();
    }

    // Rebuild image section cards so button labels update (Início/Final, etc.)
    if (imageSections.length > 0) {
      renderImageSections();
    }

    // Re-render any currently visible dynamic panels so column headers/labels update
    const adminVisible = viewAdmin && !viewAdmin.classList.contains('hidden');
    if (adminVisible) {
      // Re-render whichever admin tab is active
      const activeTab = document.querySelector('.admin-tab.active')?.dataset?.tab;
      if (activeTab === 'users')              loadAdminUsers();
      else if (activeTab === 'groups')        loadAdminGroups();
      else if (activeTab === 'profiles')      loadAdminProfiles();
      else if (activeTab === 'notifications') loadAdminAnnouncements();
      else if (activeTab === 'feedback')      loadAdminFeedback?.();
    }
    const metricsVisible = viewMetrics && !viewMetrics.classList.contains('hidden');
    if (metricsVisible) loadMetrics?.();
  };

  // --- User Interface Functions ---

  // SVG icons per toast/notification type
  const _TOAST_ICONS = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
    error:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><polyline points="11 12 12 12 12 16"/></svg>`,
  };

  /**
   * Copies the native `title` attribute to `data-tooltip` on every icon button
   * inside `root` (defaults to document). This lets our CSS tooltip replace
   * the slow browser default while keeping the semantic title for accessibility.
   */
  function applyTooltips(root = document) {
    root.querySelectorAll(
      '.admin-btn-icon[title], .admin-icon-btn[title], .topbar-icon-btn[title], ' +
      '.notif-bell-btn[title], .ann-panel-close-btn[title], .notif-panel-close-btn[title], ' +
      '.profile-validate-btn[title], button.admin-btn-danger[title]'
    ).forEach(el => {
      const tip = el.getAttribute('title');
      if (tip) {
        el.setAttribute('data-tooltip', tip);
        el.removeAttribute('title'); // prevent double tooltip
      }
      // Topbar buttons sit at the very top of the viewport — open tooltip downward
      // so it is never clipped by the top edge of the screen.
      if (el.closest('#app-topbar') && !el.hasAttribute('data-tooltip-pos')) {
        el.setAttribute('data-tooltip-pos', 'bottom');
      }
    });
  }

  // Maps OCI_ERR: keys from the backend to frontend i18n translation keys
  const _OCI_ERR_MAP = {
    'OCI_ERR:tenancy_id_not_found':        'oci_err.tenancy_id_not_found',
    'OCI_ERR:identity_client_init_failed': 'oci_err.identity_client_init_failed',
    'OCI_ERR:compute_client_init_failed':  'oci_err.compute_client_init_failed',
    'OCI_ERR:invalid_private_key':         'oci_err.invalid_private_key',
    'OCI_ERR:invalid_passphrase':          'oci_err.invalid_passphrase',
    'OCI_ERR:invalid_key_format':          'oci_err.invalid_key_format',
    'OCI_ERR:auth_failed':                 'oci_err.auth_failed',
    'OCI_ERR:not_found':                   'oci_err.not_found',
    'OCI_ERR:unauthorized':                'oci_err.unauthorized',
    'OCI_ERR:forbidden':                   'oci_err.forbidden',
  };

  /** Translates an OCI_ERR: key to the current language, or returns the raw string. */
  function translateOciError(msg) {
    if (!msg) return msg;
    const key = _OCI_ERR_MAP[msg.trim()];
    if (key) return t(key) || msg;
    // Also scan for English substrings coming through untagged
    if (msg.includes('not a private key') || msg.includes('passphrase is incorrect'))
      return t('oci_err.invalid_private_key') || msg;
    if (msg.includes('Tenancy ID not found'))
      return t('oci_err.tenancy_id_not_found') || msg;
    return msg;
  }

  // --- Notification Center ---
  let _notifications = [];   // { id, type, title, message, time, unread }
  let _notifUnread   = 0;

  function _notifFormatTime(date) {
    const now  = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60)   return t('notif.just_now') || 'Agora';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' +
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function _renderNotifList() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (_notifications.length === 0) {
      list.innerHTML = `<div class="notif-empty">${t('notif.empty') || 'Nenhuma notificação'}</div>`;
      return;
    }
    list.innerHTML = _notifications.map(n => `
      <div class="notif-item ${n.type}${n.unread ? ' unread' : ''}" data-id="${n.id}">
        <div class="notif-item-icon">${_TOAST_ICONS[n.type] || _TOAST_ICONS.info}</div>
        <div class="notif-item-body">
          <div class="notif-item-title">${n.title || ''}</div>
          ${n.message ? `<div class="notif-item-msg">${n.message}</div>` : ''}
          <div class="notif-item-time">${_notifFormatTime(n.time)}</div>
        </div>
      </div>`).join('');
  }

  function _updateBadge() {
    const badge = document.getElementById('notif-badge');
    const bellBtn = document.getElementById('notif-bell-btn');
    if (!badge) return;
    if (_notifUnread > 0) {
      badge.textContent = _notifUnread > 99 ? '99+' : _notifUnread;
      badge.classList.remove('hidden');
      if (bellBtn) bellBtn.classList.add('has-unread');
    } else {
      badge.classList.add('hidden');
      if (bellBtn) bellBtn.classList.remove('has-unread');
    }
  }

  function _addNotification(type, title, message) {
    const entry = {
      id:      Date.now() + Math.random(),
      type,
      title,
      message,
      time:    new Date(),
      unread:  true,
    };
    // Pinned items go to top; others prepend (newest first)
    _notifications.unshift(entry);
    // Keep max 50 items
    if (_notifications.length > 50) _notifications.length = 50;
    _notifUnread++;
    _updateBadge();
    // If panel is open, re-render
    const panel = document.getElementById('notif-panel');
    if (panel && !panel.classList.contains('hidden')) _renderNotifList();
  }

  // Bell button toggle
  document.getElementById('notif-bell-btn')?.addEventListener('click', () => {
    const panel    = document.getElementById('notif-panel');
    const backdrop = document.getElementById('notif-panel-backdrop');
    if (!panel) return;
    const isHidden = panel.classList.contains('hidden');
    // Close ann panel if open
    document.getElementById('ann-panel')?.classList.add('hidden');
    document.getElementById('ann-panel-backdrop')?.classList.add('hidden');
    panel.classList.toggle('hidden', !isHidden);
    backdrop?.classList.toggle('hidden', !isHidden);
    if (isHidden) {
      _notifications.forEach(n => { n.unread = false; });
      _notifUnread = 0;
      _updateBadge();
      _renderNotifList();
    }
  });

  document.getElementById('notif-panel-close')?.addEventListener('click', () => {
    document.getElementById('notif-panel')?.classList.add('hidden');
    document.getElementById('notif-panel-backdrop')?.classList.add('hidden');
  });

  document.getElementById('notif-panel-backdrop')?.addEventListener('click', () => {
    document.getElementById('notif-panel')?.classList.add('hidden');
    document.getElementById('notif-panel-backdrop')?.classList.add('hidden');
  });

  document.getElementById('notif-clear-btn')?.addEventListener('click', () => {
    _notifications = [];
    _notifUnread = 0;
    _updateBadge();
    _renderNotifList();
  });

  window.addSystemAnnouncement = function(title, message) {
    _addNotification('warning', title, message);
  };

  /**
   * Shows a toast notification in the top-right corner AND records it in the
   * notification center.
   * @param {string}  message   - Main text (or subtitle when title is provided).
   * @param {string}  type      - 'success' | 'error' | 'warning' | 'info'
   * @param {string}  [title]   - Optional bold heading above the message.
   * @param {number}  [duration]- Auto-dismiss in ms. Defaults: success=5000, error/warning=8000.
   */
  function showToast(message, type = 'success', title = '', duration = -1) {
    // Translate OCI backend error codes before display
    message = translateOciError(message);
    title   = title ? translateOciError(title) : title;

    // Default duration depends on severity
    if (duration === -1) {
      duration = (type === 'error' || type === 'warning') ? 8000 : 5000;
    }

    // Record in notification center
    _addNotification(type, title || message, title ? message : '', false);

    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon   = _TOAST_ICONS[type] || _TOAST_ICONS.info;
    const titleHtml = title ? `<div class="toast-title">${title}</div>` : '';
    const msgHtml   = message ? `<div class="toast-msg">${message}</div>` : '';
    const bodyHtml  = title
      ? `<div class="toast-body">${titleHtml}${msgHtml}</div>`
      : `<div class="toast-body"><div class="toast-title">${message}</div></div>`;

    const closeBtn = `<button class="toast-close" aria-label="Fechar">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;

    toast.innerHTML = `<div class="toast-icon-wrap">${icon}</div>${bodyHtml}${closeBtn}`;
    toastContainer.appendChild(toast);

    const dismiss = () => {
      toast.style.animation = 'toastSlideOut 0.28s ease forwards';
      setTimeout(() => toast.remove(), 290);
    };

    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    if (duration > 0) setTimeout(dismiss, duration);
  }

  // Expose showToast globally so diagram.js can add notifications
  window.showToast = showToast;

  const showProgress = () => {
    loadingOverlay.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressBar.style.background = '';
    progressText.textContent = t('progress.initializing_clients');
    progressTimer.textContent = '00:00';
    if (progressPct) { progressPct.textContent = '0%'; progressPct.style.color = ''; }
    // Reset spinner/icons
    if (progressCloudIcon) { progressCloudIcon.classList.remove('progress-icon-fade-out'); }
    if (progressCheckIcon) { progressCheckIcon.classList.add('progress-check-hidden'); progressCheckIcon.classList.remove('progress-icon-check-in'); }
    if (progressSpinner)   { progressSpinner.style.borderTopColor = ''; progressSpinner.style.animation = ''; }
    // Build pipeline for current doc type
    _lastKnownCompIdx = -1;
    if (pipelineCompLabel) pipelineCompLabel.innerHTML = '';
    _buildProgressPipeline();
    // Init compartment section
    if (progressCompSection) progressCompSection.classList.add('hidden');
    if (progressCompList) {
      progressCompList.innerHTML = '';
      const compNames = Object.values(selectedCompartments);
      if (compNames.length > 1) {
        progressCompSection && progressCompSection.classList.remove('hidden');
        compNames.forEach(name => progressCompList.appendChild(_makeCompRow('pending', name)));
      }
    }
  };

  function _buildProgressPipeline() {
    if (!progressPipeline) return;
    progressPipeline.innerHTML = '';
    _pipelineStageIds = (PIPELINE_BY_TYPE[selectedDocType] || PIPELINE_BY_TYPE['full_infra']).slice();
    _pipelineActiveIdx = 0;
    _pipelineStageIds.forEach((stageId, i) => {
      const def = PIPELINE_STAGES_ALL.find(s => s.id === stageId);
      if (!def) return;
      if (i > 0) {
        const arr = document.createElement('span');
        arr.className = 'pipe-arrow';
        arr.textContent = '→';
        progressPipeline.appendChild(arr);
      }
      const iconHtml = PIPELINE_STAGE_ICONS[stageId] || '';
      const stage = document.createElement('div');
      stage.className = 'pipe-stage ' + (i === 0 ? 'active' : 'pending');
      stage.dataset.stageId = stageId;
      stage.dataset.iconHtml = iconHtml;
      // First stage starts active with spinner ring; others show icon dimmed
      const innerHtml = i === 0
        ? `${iconHtml}<div class="pipe-stage-spinner"></div>`
        : iconHtml;
      stage.innerHTML = `<div class="pipe-stage-icon">${innerHtml}</div><div class="pipe-stage-label">${t(def.labelKey) || stageId}</div>`;
      progressPipeline.appendChild(stage);
    });
  }

  function _setPipelineActiveIdx(idx) {
    if (!progressPipeline) return;
    _pipelineActiveIdx = Math.max(0, Math.min(idx, _pipelineStageIds.length - 1));
    const stages = progressPipeline.querySelectorAll('.pipe-stage');
    const arrows = progressPipeline.querySelectorAll('.pipe-arrow');
    stages.forEach((el, i) => {
      const iconEl = el.querySelector('.pipe-stage-icon');
      const iconHtml = el.dataset.iconHtml || '';
      if (i < _pipelineActiveIdx) {
        el.className = 'pipe-stage done';
        iconEl.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,8.5 6.5,12 13,5"/></svg>`;
      } else if (i === _pipelineActiveIdx) {
        el.className = 'pipe-stage active';
        iconEl.innerHTML = `${iconHtml}<div class="pipe-stage-spinner"></div>`;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } else {
        el.className = 'pipe-stage pending';
        iconEl.innerHTML = iconHtml;
      }
    });
    arrows.forEach((el, i) => { el.className = 'pipe-arrow' + (i < _pipelineActiveIdx ? ' done' : ''); });
  }

  function _advancePipelineByStepKey(stepKey, compIdx) {
    // When a new compartment starts, reset the pipeline back to stage 0
    if (compIdx !== undefined && compIdx !== _lastKnownCompIdx && compIdx >= 0) {
      _lastKnownCompIdx = compIdx;
      _pipelineActiveIdx = 0;
      _setPipelineActiveIdx(0);
    }
    const stageId = STEP_TO_STAGE[stepKey];
    if (!stageId) return;
    const idx = _pipelineStageIds.indexOf(stageId);
    if (idx >= 0 && idx > _pipelineActiveIdx) _setPipelineActiveIdx(idx);
  }

  function _updatePipelineCompLabel(compIdx, allDone) {
    if (!pipelineCompLabel) return;
    const n = progressCompList ? progressCompList.children.length : 0;
    if (n <= 1) { pipelineCompLabel.innerHTML = ''; return; }
    if (allDone) {
      pipelineCompLabel.innerHTML = `${t('pipe.all_done') || 'Todos os compartimentos concluídos'}`;
      return;
    }
    const names = Object.values(selectedCompartments);
    const name = names[compIdx] || '';
    pipelineCompLabel.innerHTML = `${t('pipe.comp_analyzing') || 'Analisando'}: <span>${name}</span> &nbsp;(${compIdx + 1}/${n})`;
  }

  function _makeCompRow(state, name) {
    const row = document.createElement('div');
    row.className = 'comp-row ' + state;
    const iconHtml = state === 'done'
      ? `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3,8.5 6.5,12 13,5"/></svg>`
      : state === 'active' ? '<div class="comp-row-spinner"></div>' : '';
    const badgeHtml = state === 'active' ? `<span class="comp-row-badge">${t('progress.compartment_active') || 'atual'}</span>` : '';
    row.innerHTML = `<span class="comp-row-icon">${iconHtml}</span><span class="comp-row-name">${name}</span>${badgeHtml}`;
    return row;
  }

  // Update comp rows in-place without replacing DOM nodes (avoids NodeList stale-ref bugs)
  function _updateCompRows(currentIdx, allDone) {
    if (!progressCompList) return;
    const rows = Array.from(progressCompList.querySelectorAll('.comp-row'));
    rows.forEach((row, i) => {
      const newState = allDone || i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending';
      if (row.classList.contains(newState)) return; // already correct
      row.className = 'comp-row ' + newState;
      // Update icon
      const iconEl = row.querySelector('.comp-row-icon');
      if (iconEl) {
        if (newState === 'done') {
          iconEl.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3,8.5 6.5,12 13,5"/></svg>`;
        } else if (newState === 'active') {
          iconEl.innerHTML = '<div class="comp-row-spinner"></div>';
        } else {
          iconEl.innerHTML = '';
        }
      }
      // Badge: add for active, remove otherwise
      let badge = row.querySelector('.comp-row-badge');
      if (newState === 'active') {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'comp-row-badge';
          badge.textContent = t('progress.compartment_active') || 'atual';
          row.appendChild(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    });
    // Scroll active into view
    const activeRow = progressCompList.querySelector('.comp-row.active');
    if (activeRow) activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const updateProgress = (percentage, text) => {
    const pct = Math.round(percentage);
    progressBar.style.width = `${pct}%`;
    progressText.textContent = text;
    if (progressPct) progressPct.textContent = `${pct}%`;
    if (percentage >= 100) {
      // Cloud → checkmark transition
      progressSpinner.style.borderTopColor = '#3fb950';
      progressSpinner.style.animation = 'spin 0.4s linear 2, progressFadeRing 0.5s ease 0.8s forwards';
      progressCloudIcon && progressCloudIcon.classList.add('progress-icon-fade-out');
      if (progressPct) progressPct.style.color = '#3fb950';
      setTimeout(() => {
        progressCheckIcon && progressCheckIcon.classList.remove('progress-check-hidden');
        progressCheckIcon && progressCheckIcon.classList.add('progress-icon-check-in');
        progressBar.style.background = 'linear-gradient(90deg, #2ea043, #3fb950)';
      }, 600);
    }
  };

  const hideProgress = () => {
    clearInterval(progressTimerInterval);
    clearInterval(pollingIntervalId);
    loadingOverlay.classList.add('hidden');
  };

  const toggleLoading = (show) => {
    if (!pageLoaderBar) return;
    if (show) {
      pageLoaderBar.classList.remove('hidden', 'done');
    } else {
      pageLoaderBar.classList.add('done');
      setTimeout(() => pageLoaderBar.classList.add('hidden'), 320);
    }
  };

  const showSuccessScreen = () => {
    // Keep mainAppContainer visible — success overlay is position:fixed and
    // sits above it. Hiding the container causes a completely black screen.
    successScreen.classList.remove('hidden');
    const icon = successScreen.querySelector('.success-icon');
    const newIcon = icon.cloneNode(true);
    icon.parentNode.replaceChild(newIcon, icon);
  };

  const resetApp = () => {
    successScreen.classList.add('hidden');
    // mainAppContainer was never hidden — nothing to restore here

    selectedRegion = null;
    selectedDocType = null;
    selectedCompartmentId = null;
    selectedCompartmentName = null;
    selectedCompartments = {};
    selectedInstances = {};
    allInfrastructureData = {};
    imageSections = [];
    sectionIdCounter = 0;
    letterhead = { enabled: false, headerFile: null, footerFile: null, coverFile: null };
    const _lhTog = document.getElementById('letterhead-toggle');
    if (_lhTog) _lhTog.checked = false;
    const _lhPnl = document.getElementById('letterhead-panel');
    if (_lhPnl) _lhPnl.classList.add('hidden');
    ['header', 'footer', 'cover'].forEach(_resetLetterheadSlot);

    detailsContainer.classList.add('hidden');
    summaryContainer.innerHTML = '';
    imageSectionsList.innerHTML = '';
    responsibleNameInput.value = '';

    initializeApp();
  };

  function updateUiForDocType() {
    const isNewHost = selectedDocType === 'new_host';
    const storageOptRow = document.getElementById('storage-options-row');
    if (storageOptRow) storageOptRow.classList.toggle('hidden', selectedDocType !== 'full_infra');
    const isKubernetes = selectedDocType === 'kubernetes';
    const isWaf = selectedDocType === 'waf_report';
    const isDatabase = selectedDocType === 'database';
    instanceStep.classList.toggle('hidden', !isNewHost);

    let i18nKey = 'fetch_btn_full';
    if (isNewHost) {
      i18nKey = 'fetch_btn_new';
    } else if (isKubernetes) {
      i18nKey = 'fetch_btn_k8s';
    } else if (isWaf) {
      i18nKey = 'fetch_btn_waf';
    } else if (isDatabase) {
      i18nKey = 'fetch_btn_database';
    }

    const fetchBtnSpan = fetchBtn.querySelector('span');
    if (fetchBtnSpan) {
      fetchBtnSpan.setAttribute('data-i18n', i18nKey);
      fetchBtnSpan.textContent = t(i18nKey);
    }

    // Clear compartment selection and rebuild with correct multi-select mode
    selectedCompartments = {};
    selectedCompartmentId = null;
    selectedCompartmentName = null;
    if (allCompartmentsData.length > 0) {
      const isMultiComp = selectedDocType === 'full_infra';
      createCustomSelect(
        compartmentContainer,
        allCompartmentsData,
        t('step3_placeholder'),
        (selectedValue, selectedName, isChecked) => {
          if (isMultiComp) {
            if (isChecked) {
              selectedCompartments[selectedValue] = selectedName;
            } else {
              delete selectedCompartments[selectedValue];
            }
            updateCompartmentMultiSelectDisplay();
          } else {
            selectedCompartments = {};
            selectedCompartments[selectedValue] = selectedName;
          }
          selectedCompartmentId = getSelectedCompartmentId();
          selectedCompartmentName = getSelectedCompartmentName();
          resetAndFetchInstances();
          updateFetchButtonState();
        },
        true,
        isMultiComp,
        isMultiComp ? selectedCompartments : null
      );
      if (isMultiComp) {
        updateCompartmentMultiSelectDisplay();
      }
    }


    updateFetchButtonState();
  }

  function updateFetchButtonState() {
    const isNewHost = selectedDocType === 'new_host';
    if (isNewHost) {
      fetchBtn.disabled = Object.keys(selectedInstances).length === 0;
    } else {
      fetchBtn.disabled = Object.keys(selectedCompartments).length === 0;
    }
  }

  function createCustomSelect(container, options, placeholder, onSelectCallback, isEnabled = true, isMultiSelect = false, checkedStateObj = null) {
    container.innerHTML = '';
    const selected = document.createElement('div');
    selected.classList.add('select-selected');
    if (isMultiSelect) {
      selected.innerHTML = `<div class="selected-items-container"><span class="placeholder">${placeholder}</span></div><span class="select-arrow">▼</span>`;
      selected.style.minHeight = 'auto';
      selected.style.flexWrap = 'wrap';
      selected.style.gap = '4px';
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

      // Compartment selector: show selection-mode note at top of panel
      if (container === compartmentContainer && selectedDocType) {
        const isMulti = selectedDocType === 'full_infra';
        const note = document.createElement('div');
        note.className = 'select-panel-note ' + (isMulti ? 'note-multi' : 'note-single');
        const icon = isMulti
          ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
          : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        note.innerHTML = `${icon}<span>${isMulti ? t('step3_hint_multi') : t('step3_hint_single')}</span>`;
        items.appendChild(note);
      }
    }

    // Choose which state object the multi-select uses for "checked" lookups.
    // Defaults to selectedInstances for backwards compatibility (instance picker).
    const stateObj = checkedStateObj || selectedInstances;

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
        const isChecked = !!stateObj[optionValue];
        if (isChecked) {
          item.classList.add('checked');
        }
        // Compartment hierarchical multi-select (option.level present)
        if (option.level !== undefined) {
          item.style.paddingLeft = `${12 + option.level * 22}px`;
          const treePrefix = option.level > 0 ? `<span class="item-tree-prefix"></span>` : '';
          const folderIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`;
          item.innerHTML = `
            <input type="checkbox" value="${optionValue}" data-name="${optionName}" ${isChecked ? 'checked' : ''}>
            <span class="custom-checkbox${isChecked ? ' checked' : ''}"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
            <div class="comp-item-info">
               ${treePrefix}${folderIcon}
               <span class="item-text">${optionName}</span>
            </div>`;
        } else {
          // Multi-select instance items
          const status = option.status || '';
          const statusClass = getStateCssClass(status);
          const statusLabel = getStateLabel(status);
          const isTerminated = statusClass === 'terminated';
          iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" x2="6" y1="6" y2="6"></line><line x1="6" x2="6" y1="18" y2="18"></line></svg>`;
          if (isTerminated) {
            item.classList.add('select-item-locked');
          }
          item.innerHTML = `
            <input type="checkbox" value="${optionValue}" data-name="${optionName}" ${isChecked ? 'checked' : ''} ${isTerminated ? 'disabled' : ''}>
            <span class="custom-checkbox${isChecked ? ' checked' : ''}${isTerminated ? ' disabled' : ''}"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
            <div class="instance-info">
               ${iconSvg}
               <span class="item-text">${optionName}</span>
               <span class="status-badge status-${statusClass}">${statusLabel}</span>
            </div>`;
          // Prevent selection of TERMINATED
          if (isTerminated) {
            item.addEventListener('click', e => e.stopPropagation(), true);
          }
        }
      } else {
        item.classList.add('select-item-parent');
        if (container === profileContainer) {
          if (option._isAction) {
            // "Create profile" action item — styled distinctly
            item.classList.remove('select-item-parent');
            item.classList.add('select-item', 'select-item-action');
            item.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon" style="stroke:var(--accent)"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span class="item-text" style="color:var(--accent)">${optionName}</span>`;
          } else {
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;
          }
        } else if (container === regionContainer) {
          iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>`;
        } else if (container === docTypeContainer) {
          iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
        } else if (option.level !== undefined) {
          // Single-select compartment: same folder-icon style as multi-select
          item.classList.remove('select-item-parent');
          item.classList.add(option.level > 0 ? 'select-item' : 'select-item-parent');
          item.style.paddingLeft = `${12 + option.level * 22}px`;
          const treePrefix = option.level > 0 ? `<span class="item-tree-prefix"></span>` : '';
          const folderIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`;
          item.innerHTML = `<div class="comp-item-info">${treePrefix}${folderIcon}<span class="item-text">${optionName}</span></div>`;
        }
        const lockSvg = option.lockSvg || null;
        const isLocked = option.locked || false;
        if (isLocked) {
          item.classList.add('select-item-locked');
          item.innerHTML = `${lockSvg || ''}<span class="item-text">${optionName}</span><span class="select-lock-badge">${t('perm.locked_badge') || '🔒'}</span>`;
        } else if (iconSvg && !item.innerHTML) {
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
          item.classList.toggle('checked', checkbox.checked);
          const customCb = item.querySelector('.custom-checkbox');
          if (customCb) customCb.classList.toggle('checked', checkbox.checked);
          onSelectCallback(checkbox.value, checkbox.dataset.name, checkbox.checked);
        });
      } else {
        item.addEventListener('click', () => {
          if (option.locked) {
            onSelectCallback(optionValue, optionName, false, option);
            return;
          }
          // Action items (e.g. "+ Novo Profile") must NOT set display — they only trigger callback
          if (option._isAction) {
            onSelectCallback(optionValue, optionName, false, option);
            closeAllSelects();
            return;
          }
          const selectedContent = selected.querySelector('.selected-item-display');
          // For compartment items, build a clean display (avoid copying .comp-item-info wrapper)
          if (option.level !== undefined) {
            const folderIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon" style="color:var(--accent)"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`;
            const prefix = option.level > 0 ? `<span class="item-tree-prefix"></span>` : '';
            selectedContent.innerHTML = `${prefix}${folderIcon}<span class="item-text">${optionName}</span>`;
          } else {
            selectedContent.innerHTML = item.innerHTML;
          }
          selectedContent.classList.remove('placeholder');
          onSelectCallback(optionValue, optionName, false, option);
          closeAllSelects();
        });
      }
      itemsListContainer.appendChild(item);
    });

    items.appendChild(itemsListContainer);
    container.appendChild(items);

    // Dynamic sizing + auto-flip + escape-clipping:
    //   - Chip area is capped via CSS (max-height:148px) so the trigger height
    //     is bounded and this math stays stable no matter how many chips exist.
    //   - Open downward by default. If space below is insufficient AND there
    //     is more room above, flip the dropdown to open upward instead.
    //   - Use `position: fixed` with viewport coordinates computed from the
    //     trigger's bounding rect. This escapes any ancestor `overflow:hidden`
    //     or `transform` that would otherwise clip a flipped-upward dropdown.
    //     The scroll/resize listeners below re-run this on page movement so
    //     the dropdown stays glued to the trigger.
    const adjustDropdownHeight = () => {
      const r = selected.getBoundingClientRect();
      const margin = 24; // breathing room to the viewport edge
      const gap = 6;     // gap between trigger and dropdown
      const spaceBelow = Math.max(0, window.innerHeight - r.bottom - margin);
      const spaceAbove = Math.max(0, r.top - margin);
      const MAX = 600;
      const MIN_BELOW = 320; // below this we consider flipping upward
      const openUp = spaceBelow < MIN_BELOW && spaceAbove > spaceBelow;

      items.style.position = 'fixed';
      items.style.left  = r.left  + 'px';
      items.style.width = r.width + 'px';
      if (openUp) {
        items.style.top    = 'auto';
        items.style.bottom = (window.innerHeight - r.top + gap) + 'px';
        items.style.maxHeight = Math.min(MAX, spaceAbove) + 'px';
      } else {
        items.style.top    = (r.bottom + gap) + 'px';
        items.style.bottom = 'auto';
        items.style.maxHeight = Math.min(MAX, spaceBelow) + 'px';
      }
    };

    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selected.classList.contains('disabled')) return;
      const wasOpen = !items.classList.contains('select-hide');
      closeAllSelects(isMultiSelect ? container : null);
      if (!wasOpen) {
        items.classList.remove('select-hide');
        selected.classList.add('select-arrow-active');
        adjustDropdownHeight();
        // Recompute on trigger resize (defensive — chip area is capped, but
        // page reflows or search focus can still change the trigger height).
        const obs = new ResizeObserver(adjustDropdownHeight);
        obs.observe(selected);
        items._resizeObs = obs;
        // Recompute on window resize / scroll so the dropdown always fits.
        items._onReflow = adjustDropdownHeight;
        window.addEventListener('resize', items._onReflow);
        window.addEventListener('scroll', items._onReflow, true);
      }
    });
  }

  /**
   * Updates the display of the multi-select component to show selected items as tags.
   */
  function updateMultiSelectDisplay() {
    const container = instanceContainer.querySelector('.selected-items-container');
    if (!container) return;
    container.innerHTML = '';
    const selectedIds = Object.keys(selectedInstances);
    if (selectedIds.length === 0) {
      container.innerHTML = `<span class="placeholder">${t('step4_placeholder')}</span>`;
    } else {
      selectedIds.forEach(id => {
        const tag = document.createElement('span');
        tag.className = 'selected-item-tag';
        const dot = document.createElement('span');
        dot.className = 'selected-item-tag-dot';
        tag.appendChild(dot);
        tag.appendChild(document.createTextNode(selectedInstances[id]));
        container.appendChild(tag);
      });
    }
  }

  /**
   * Updates the display of the compartment multi-select to show selected items as
   * coloured chips. Each chip uses a colour from COMP_PALETTE so the user can
   * cross-reference compartment colours in the diagram.
   */
  function updateCompartmentMultiSelectDisplay() {
    const container = compartmentContainer.querySelector('.selected-items-container');
    if (!container) return;
    container.innerHTML = '';
    const selectedIds = Object.keys(selectedCompartments);
    if (selectedIds.length === 0) {
      const placeholderKey = selectedRegion ? 'step3_placeholder' : 'instance_select_compartment_first';
      container.innerHTML = `<span class="placeholder">${t(placeholderKey)}</span>`;
      return;
    }
    selectedIds.forEach((id, idx) => {
      const name = selectedCompartments[id];
      const color = COMP_PALETTE[idx % COMP_PALETTE.length];
      const chip = document.createElement('span');
      chip.className = 'comp-chip';
      chip.style.setProperty('--comp-color', color);
      chip.innerHTML = `
        <span class="comp-chip-dot"></span>
        <span class="comp-chip-text">${name}</span>
        <button type="button" class="comp-chip-x" aria-label="remove" data-id="${id}">×</button>
      `;
      const removeBtn = chip.querySelector('.comp-chip-x');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        delete selectedCompartments[id];
        selectedCompartmentId = getSelectedCompartmentId();
        selectedCompartmentName = getSelectedCompartmentName();
        // Sync the visible checkbox in the dropdown
        const cbItem = compartmentContainer.querySelector(`.select-item[data-value="${id}"]`);
        if (cbItem) {
          const cb = cbItem.querySelector('input[type="checkbox"]');
          if (cb) cb.checked = false;
          cbItem.classList.remove('checked');
          const ccb = cbItem.querySelector('.custom-checkbox');
          if (ccb) ccb.classList.remove('checked');
        }
        updateCompartmentMultiSelectDisplay();
        resetAndFetchInstances();
        updateFetchButtonState();
      });
      container.appendChild(chip);
    });
  }

  /**
   * Closes all custom select dropdowns.
   * @param {HTMLElement | null} except - An optional element to exclude from closing.
   */
  function closeAllSelects(except = null) {
    document.querySelectorAll('.select-items').forEach(item => {
      if (item.parentElement !== except) {
        item.classList.add('select-hide');
        if (item._resizeObs) { item._resizeObs.disconnect(); item._resizeObs = null; }
        if (item._onReflow) {
          window.removeEventListener('resize', item._onReflow);
          window.removeEventListener('scroll', item._onReflow, true);
          item._onReflow = null;
        }
        // Reset all inline positioning so the next open starts from CSS.
        item.style.maxHeight = '';
        item.style.position  = '';
        item.style.top       = '';
        item.style.bottom    = '';
        item.style.left      = '';
        item.style.width     = '';
      }
    });
    document.querySelectorAll('.select-selected').forEach(sel => {
      if (sel.parentElement !== except) {
        sel.classList.remove('select-arrow-active');
      }
    });
  }

  // --- Backend API Call Functions ---

  /**
   * Enables or disables all wizard steps downstream of the profile selector
   * (region, doc-type, compartment) and the fetch button.
   * Called whenever the selected profile changes or the page loads.
   * @param {boolean} enabled
   */
  function setDownstreamStepsState(enabled) {
    const containers = [regionContainer, docTypeContainer, compartmentContainer];
    containers.forEach(c => {
      if (!c) return;
      const sel = c.querySelector('.select-selected, .custom-select-selected');
      if (!sel) return;
      if (enabled) {
        sel.classList.remove('disabled');
      } else {
        sel.classList.add('disabled');
        const disp = sel.querySelector('.selected-item-display');
        const placeholders = {
          [regionContainer]:      t('step1_placeholder'),
          [docTypeContainer]:     t('step2_placeholder'),
          [compartmentContainer]: t('step3_placeholder'),
        };
        if (disp) disp.innerHTML = `<span class="placeholder-text">${placeholders[c] || '—'}</span>`;
        const dd = c.querySelector('.custom-select-dropdown, .select-items');
        if (dd) { dd.classList.remove('open'); dd.classList.add('select-hide'); }
      }
    });
    // Also lock the fetch button when no valid profile
    if (!enabled) {
      if (fetchBtn) fetchBtn.disabled = true;
    }
  }

  const fetchRegions = async () => {
    if (!selectedProfileId) return;
    try {
      toggleLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/regions?profile_id=${selectedProfileId}`, { headers: getAuthHeaders() });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error(d.detail || 'Erro ao buscar regiões');
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
    const ALL_DOC_TYPES = [
      { id: 'new_host',   name: t('doc_type_new') },
      { id: 'full_infra', name: t('doc_type_full') },
      { id: 'kubernetes', name: t('doc_type_k8s') },
      { id: 'waf_report', name: t('doc_type_waf') },
      { id: 'database',   name: t('doc_type_database') },
    ];

    // Determine which types are allowed for the current user
    const allowed = currentUserPermissions?.allowed || ['new_host'];
    const isAnon  = !currentUser;

    // Build enriched list — locked items are selectable to show a message
    const docTypes = ALL_DOC_TYPES.map(dt => ({
      ...dt,
      locked: !allowed.includes(dt.id),
      // Icon used by createCustomSelect
      lockSvg: !allowed.includes(dt.id)
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="item-icon lock-icon"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
        : null,
    }));

    createCustomSelect(
      docTypeContainer,
      docTypes,
      t('step2_placeholder'),
      (selectedValue, _name, _checked, item) => {
        if (item?.locked) {
          // Show locked message instead of proceeding
          const msg = isAnon ? t('perm.anon_msg') : t('perm.locked_msg');
          showToast(msg, 'error');
          // Reset the select display to placeholder
          const sel = docTypeContainer.querySelector('.selected-item-display');
          if (sel) { sel.innerHTML = `<span class="placeholder">${t('step2_placeholder')}</span>`; sel.classList.add('placeholder'); }
          selectedDocType = null;
          updateUiForDocType();
          return;
        }
        selectedDocType = selectedValue;
        updateUiForDocType();
      },
      true,
      false,
      { showLocked: true }
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
      const response = await fetch(`${API_BASE_URL}/api/${selectedRegion}/compartments?profile_id=${selectedProfileId}`, { headers: getAuthHeaders() });
      if (!response.ok) {
        throw new Error('Erro ao buscar compartimentos');
      }
      const compartments = await response.json();
      allCompartmentsData = compartments;
      const isMultiComp = selectedDocType === 'full_infra';
      createCustomSelect(
        compartmentContainer,
        allCompartmentsData,
        t('step3_placeholder'),
        (selectedValue, selectedName, isChecked) => {
          if (isMultiComp) {
            if (isChecked) {
              selectedCompartments[selectedValue] = selectedName;
            } else {
              delete selectedCompartments[selectedValue];
            }
            updateCompartmentMultiSelectDisplay();
          } else {
            selectedCompartments = {};
            selectedCompartments[selectedValue] = selectedName;
          }
          selectedCompartmentId = getSelectedCompartmentId();
          selectedCompartmentName = getSelectedCompartmentName();
          resetAndFetchInstances();
          updateFetchButtonState();
        },
        true,
        isMultiComp,
        isMultiComp ? selectedCompartments : null
      );
      if (isMultiComp) {
        updateCompartmentMultiSelectDisplay();
      }
  
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
      const response = await fetch(`${API_BASE_URL}/api/${selectedRegion}/instances/${selectedCompartmentId}?profile_id=${selectedProfileId || ''}`, { headers: getAuthHeaders() });
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
    selectedCompartmentName = null;
    selectedCompartments = {};
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

  // --- Asynchronous Flow and Data Collection ---

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

    let taskType = 'full_infra';
    if (selectedDocType === 'new_host') taskType = 'new_host';
    else if (selectedDocType === 'waf_report') taskType = 'waf_report';
    else if (selectedDocType === 'database') taskType = 'database';

    const payload = {
      type: taskType,
      doc_type: selectedDocType,
      region: selectedRegion,
      profile_id: selectedProfileId || null,
    };

    if (taskType === 'new_host') {
      payload.details = {
        instance_ids: Object.keys(selectedInstances),
        compartment_id: selectedCompartmentId,
        compartment_name: selectedCompartmentName,
      };
    } else if (taskType === 'waf_report') {
      payload.compartment_id = selectedCompartmentId;
      payload.compartment_name = selectedCompartmentName;
    } else if (taskType === 'database') {
      payload.type = 'database';
      payload.compartment_id = getSelectedCompartmentId();
      payload.compartment_name = getSelectedCompartmentName();
    } else {
      // full_infra (and kubernetes)
      payload.compartment_id = selectedCompartmentId;
      payload.compartments = Object.entries(selectedCompartments).map(([id, name]) => ({compartment_id: id, compartment_name: name}));
      // Only include standalone (unattached) volumes if the user opted in
      payload.include_standalone = includeStandaloneChk ? includeStandaloneChk.checked : true;
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
          'Accept-Language': currentLanguage,
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        // If the profile was deactivated after the page loaded, refresh the
        // profile selector so the UI immediately reflects the current state.
        if (response.status === 403 || response.status === 404) {
          sessionStorage.removeItem('selectedProfileId');
          selectedProfileId = null;
          await loadProfileSelector();
        }
        // Session expired or not authenticated — redirect to login.
        if (response.status === 401) {
          showToast(t('error.auth_required') || 'Autenticação necessária. Faça login novamente.', 'error');
          setTimeout(() => { currentUser = null; updateAuthUI(); showView('generator'); }, 1500);
        }
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

            // Determine active compartment index (used for both comp-list and pipeline reset)
            let activeCompIdx = undefined;
            if (progressCompList && progressCompList.children.length > 1) {
              const n = progressCompList.children.length;
              if (progressInfo.step_key === 'progress.collecting_compartment' && progressInfo.context) {
                activeCompIdx = (progressInfo.context.current || 1) - 1;
              } else if (progressInfo.step_key === 'progress.merging_compartments') {
                activeCompIdx = n; // signals all-done
              } else {
                // Infer from percentage: backend spreads 0–90% evenly across compartments
                activeCompIdx = Math.min(Math.floor(percentage / 90 * n), n - 1);
              }
              _updateCompRows(activeCompIdx, activeCompIdx >= n);
              _updatePipelineCompLabel(activeCompIdx, activeCompIdx >= n);
            }

            // Advance pipeline stage (resets to stage 0 when compartment transitions)
            if (progressInfo.step_key) _advancePipelineByStepKey(progressInfo.step_key, activeCompIdx);
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
          // Mark all pipeline stages done + clear comp label
          _setPipelineActiveIdx(_pipelineStageIds.length - 1);
          _updateCompRows(0, true);
          _updatePipelineCompLabel(0, true);
          allInfrastructureData = data.result;
          // Wrapped so rendering errors never block hideProgress
          try {
            summaryContainer.innerHTML = generateInfrastructureSummary(allInfrastructureData);
            if (typeof initDiagramInteraction === 'function') initDiagramInteraction();
            detailsContainer.classList.remove('hidden');
            addToHistory(selectedDocType || 'doc', selectedCompartmentName, selectedRegion);
          } catch (renderErr) {
            console.error('Summary render error:', renderErr);
            showToast('Erro ao renderizar o resumo: ' + renderErr.message, 'error');
          }
          setTimeout(hideProgress, 1200);  // always runs

        } else if (data.status === 'FAILURE') {
          clearInterval(pollingIntervalId);
          const failResult = data.result;
          if (failResult && failResult.error_type === 'IAM_PERMISSION') {
            const lines   = (failResult.error || '').split('\n');
            const intro   = lines[0] || t('toast.server_error');
            const command = lines.slice(1).join('\n').trim();
            const msgHtml = command
              ? `${intro}<br><code style="display:block;margin-top:8px;padding:6px 8px;background:rgba(0,0,0,0.25);border-radius:4px;font-size:0.82em;word-break:break-all;white-space:pre-wrap;">${command}</code>`
              : intro;
            showToast(msgHtml, 'error', t('toast.server_error'), 0);
          } else {
            showToast(t('toast.server_error'), 'error');
          }
          hideProgress();
        }
      } catch (error) {
        clearInterval(pollingIntervalId);
        if (progressBar.style.width === '100%') {
          // Collection succeeded but something failed after — dismiss overlay cleanly
          setTimeout(hideProgress, 800);
        } else {
          showToast(t('toast.network_error'), 'error');
          hideProgress();
        }
      }
    }, 2000);
  };

  // --- Infrastructure Summary and Document Generation ---

  /**
   * Generates the HTML summary of the fetched infrastructure data.
   * @param {object} data The infrastructure data from the API.
   * @returns {string} The generated HTML string.
   */
  // --- WAF Policy HTML Builder ---
  // Extracted to avoid nested backtick issues inside template literals.
  function buildWafInfraSectionHtml(policies, createTable) {
    let html = '';
    policies.forEach(function(policy) {
      const statusClass    = getStateCssClass(policy.lifecycle_state);
      const statusLabel    = getStateLabel(policy.lifecycle_state);
      const isDeleted      = (policy.lifecycle_state || '').toUpperCase() === 'DELETED';
      let wafCardContent   = '';

      if (!isDeleted) {
        // Use `integrations` (all firewalls bound to this policy) with fallback to the legacy singular `integration`.
        const integrations = (policy.integrations && policy.integrations.length > 0)
          ? policy.integrations
          : (policy.integration ? [policy.integration] : []);

        const fwRows = integrations.map(function(intg) {
          const fw = intg.firewall;
          const lb = intg.load_balancer;
          const ips = lb ? (lb.ip_addresses || []).map(function(ip) { return ip.ip_address; }).join(', ') || 'N/A' : 'N/A';
          return [
            '<span class="text-highlight">' + (fw ? fw.display_name : 'N/A') + '</span>',
            fw ? (fw.backend_type || 'N/A') : 'N/A',
            lb ? ('<span class="text-highlight">' + lb.display_name + '</span> <small>(' + ips + ')</small>') : 'N/A',
            '<span class="status-badge status-active">ACTIVE</span>'
          ];
        });

        var fwHtml = fwRows.length > 0
          ? '<h5 class="waf-sub-title">Firewall</h5>' + createTable([t('waf.table.firewall_name'), 'Backend', 'Load Balancer', t('waf.table.attach_state')], fwRows)
          : '';

        const aclCount   = (policy.access_control_rules  || []).length;
        const rlCount    = (policy.rate_limiting_rules    || []).length;
        const protCount  = (policy.protection_rules       || []).length;

        wafCardContent = fwHtml +
          '<p class="waf-rules-summary">' +
            'ACL: ' + aclCount + ' regras &nbsp;|&nbsp; ' +
            'Rate Limit: ' + rlCount + ' regras &nbsp;|&nbsp; ' +
            'Prote\u00e7\u00e3o: ' + protCount + ' regras' +
          '</p>';
      }

      html +=
        '<div class="instance-summary-card collapsible">' +
          '<div class="instance-card-header">' +
            '<h4 class="card-header-title">' + policy.display_name + '</h4>' +
            '<div class="card-status-indicator">' +
              '<span class="status-badge status-' + statusClass + '">' + statusLabel + '</span>' +
            '</div>' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
          '</div>' +
          '<div class="instance-card-body">' + wafCardContent + '</div>' +
        '</div>';
    });
    return html || '<p class="no-data-message">' + t('summary.no_waf_found') + '</p>';
  }

  // ── DB System rich card renderer (DBaaS Web Summary) ─────────────────────────
  function renderDbSystemCard(db, opts) {
    opts = opts || {};
    const compBadgeFn = opts.compBadge || function() { return ''; };
    const statusClass = getStateCssClass(db.lifecycle_state);

    const _val = (v) => (v === null || v === undefined || v === '') ? '—' : v;
    const _bool = (v) => v ? (t('summary.yes') || 'Sim') : (t('summary.no') || 'Não');
    const _date = (v) => {
      if (!v) return '—';
      try {
        const d = new Date(v);
        if (isNaN(d.getTime())) return v;
        return d.toLocaleString(currentLanguage === 'pt' ? 'pt-BR' : 'en-US');
      } catch (e) { return v; }
    };

    const editionAbbr = (() => {
      const e = (db.database_edition || '').toUpperCase();
      if (e.includes('EXTREME')) return 'EE-XP';
      if (e.includes('HIGH_PERFORMANCE')) return 'EE-HP';
      if (e.includes('ENTERPRISE')) return 'EE';
      if (e.includes('STANDARD')) return 'SE2';
      return db.database_edition || '';
    })();
    const licenseAbbr = (() => {
      const l = (db.license_model || '').toUpperCase();
      if (l === 'BRING_YOUR_OWN_LICENSE') return 'BYOL';
      if (l === 'LICENSE_INCLUDED') return 'License Included';
      return _val(db.license_model);
    })();

    const DB_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>`;
    const COMPUTE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`;
    const NETWORK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><rect x="2" y="9" width="4" height="4" rx="1"/><rect x="18" y="9" width="4" height="4" rx="1"/><rect x="10" y="2" width="4" height="4" rx="1"/><rect x="10" y="18" width="4" height="4" rx="1"/><line x1="6" y1="11" x2="10" y2="11"/><line x1="14" y1="11" x2="18" y2="11"/><line x1="12" y1="6" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="18"/></svg>`;
    const HA_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    const NODE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg>`;
    const EXPAND_ARROW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

    // ── 1. General info ──
    const generalFieldset = `
      <fieldset>
        <legend>${DB_ICON}${t('summary.db.general_info') || 'Informações Gerais'}</legend>
        <div class="grid-container">
          <div class="info-group">
            <label>${t('summary.db.edition') || 'Edition'}</label>
            <div class="info-value">${editionAbbr ? `<span class="db-edition-badge">${editionAbbr}</span> ` : ''}<span style="color:var(--text-secondary);font-size:11px">${_val(db.database_edition)}</span></div>
          </div>
          <div class="info-group">
            <label>${t('summary.db.license') || 'License'}</label>
            <div class="info-value"><span class="db-license-badge">${licenseAbbr}</span></div>
          </div>
          <div class="info-group"><label>${t('summary.db.version') || 'Version'}</label><div class="info-value">${_val(db.version)}</div></div>
          <div class="info-group"><label>${t('summary.db.os_version') || 'OS Version'}</label><div class="info-value">${_val(db.os_version)}</div></div>
          <div class="info-group"><label>${t('summary.db.time_zone') || 'Time Zone'}</label><div class="info-value">${_val(db.time_zone)}</div></div>
          <div class="info-group"><label>${t('summary.db.created') || 'Created'}</label><div class="info-value">${_date(db.time_created)}</div></div>
          ${db.cluster_name ? `<div class="info-group full-width"><label>${t('summary.db.cluster_name') || 'Cluster Name'}</label><div class="info-value text-highlight">${db.cluster_name}</div></div>` : ''}
        </div>
      </fieldset>`;

    // ── 2. Compute & Storage ──
    const computeFieldset = `
      <fieldset>
        <legend>${COMPUTE_ICON}${t('summary.db.compute_storage') || 'Compute & Storage'}</legend>
        <div class="db-metrics-row">
          <div class="db-metric-chip">
            <span class="db-metric-value">${_val(db.cpu_core_count)}</span>
            <span class="db-metric-label">vCPUs</span>
          </div>
          <div class="db-metric-chip">
            <span class="db-metric-value">${_val(db.memory_size_in_gbs)}</span>
            <span class="db-metric-label">GB RAM</span>
          </div>
          <div class="db-metric-chip">
            <span class="db-metric-value">${_val(db.data_storage_size_in_gbs)}</span>
            <span class="db-metric-label">GB Data</span>
          </div>
          ${(db.node_count || 0) > 1 ? `<div class="db-metric-chip"><span class="db-metric-value">${db.node_count}</span><span class="db-metric-label">Nodes</span></div>` : ''}
        </div>
        <div class="grid-container">
          <div class="info-group"><label>${t('summary.db.shape') || 'Shape'}</label><div class="info-value">${_val(db.shape)}</div></div>
          <div class="info-group"><label>${t('summary.db.reco_storage_gb') || 'Reco Storage (GB)'}</label><div class="info-value">${_val(db.reco_storage_size_in_gb)}</div></div>
          <div class="info-group"><label>${t('summary.db.data_storage_pct') || 'Data %'}</label><div class="info-value">${_val(db.data_storage_percentage)}${db.data_storage_percentage ? '%' : ''}</div></div>
          <div class="info-group"><label>${t('summary.db.disk_redundancy') || 'Disk Redundancy'}</label><div class="info-value">${_val(db.disk_redundancy)}</div></div>
          <div class="info-group"><label>${t('summary.db.storage_perf') || 'Storage Perf'}</label><div class="info-value">${_val(db.storage_volume_performance_mode)}</div></div>
          <div class="info-group"><label>${t('summary.db.storage_management') || 'Storage Mgmt'}</label><div class="info-value">${_val(db.storage_management)}</div></div>
        </div>
      </fieldset>`;

    // ── 3. Network ──
    const networkFieldset = `
      <fieldset>
        <legend>${NETWORK_ICON}${t('summary.db.network') || 'Rede'}</legend>
        <div class="grid-container">
          <div class="info-group"><label>${t('summary.db.hostname') || 'Hostname'}</label><div class="info-value text-highlight">${_val(db.hostname)}</div></div>
          <div class="info-group"><label>${t('summary.db.domain') || 'Domain'}</label><div class="info-value">${_val(db.domain)}</div></div>
          <div class="info-group"><label>${t('summary.db.listener_port') || 'Listener Port'}</label><div class="info-value">${_val(db.listener_port)}</div></div>
          <div class="info-group"><label>${t('summary.db.scan_dns') || 'SCAN DNS'}</label><div class="info-value"><span class="code-text">${_val(db.scan_dns_name)}</span></div></div>
          <div class="info-group"><label>VCN</label><div class="info-value">${_val(db.vcn_name)}</div></div>
          <div class="info-group"><label>Subnet</label><div class="info-value">${_val(db.subnet_name)}</div></div>
          ${db.backup_subnet_name ? `<div class="info-group"><label>${t('summary.db.backup_subnet') || 'Backup Subnet'}</label><div class="info-value">${db.backup_subnet_name}</div></div>` : ''}
          ${(db.scan_ip_ids || []).length > 0 ? `<div class="info-group"><label>${t('summary.db.scan_ips') || 'SCAN IPs'}</label><div class="info-value">${db.scan_ip_ids.length}</div></div>` : ''}
          ${(db.nsg_ids || []).length > 0 ? `<div class="info-group"><label>NSGs</label><div class="info-value">${db.nsg_ids.length}</div></div>` : ''}
        </div>
      </fieldset>`;

    // ── 4. High Availability ──
    const fdHtml = (db.fault_domains || []).length > 0
      ? db.fault_domains.map(f => `<span class="comp-badge" style="--badge-bg:rgba(13,148,136,0.18);--badge-border:rgba(13,148,136,0.5);--badge-dot:#0d9488">${f}</span>`).join(' ')
      : '—';
    const haFieldset = `
      <fieldset>
        <legend>${HA_ICON}${t('summary.db.high_availability') || 'Alta Disponibilidade'}</legend>
        <div class="grid-container">
          <div class="info-group full-width"><label>${t('summary.db.availability_domain') || 'Availability Domain'}</label><div class="info-value">${_val(db.availability_domain)}</div></div>
          <div class="info-group full-width"><label>${t('summary.db.fault_domains') || 'Fault Domains'}</label><div class="info-value">${fdHtml}</div></div>
          <div class="info-group"><label>${t('summary.db.ssh_keys') || 'SSH Public Keys'}</label><div class="info-value">${_val(db.ssh_public_keys_count)}</div></div>
        </div>
      </fieldset>`;

    // ── 5. DB Nodes ──
    const nodesRows = (db.db_nodes || []).map(n => [
      `<span class="text-highlight">${_val(n.hostname)}</span>`,
      `<span class="status-badge status-${getStateCssClass(n.lifecycle_state)}">${getStateLabel(n.lifecycle_state)}</span>`,
      _val(n.private_ip),
      _val(n.fault_domain),
      n.software_storage_size_in_gb ? n.software_storage_size_in_gb + ' GB' : '—',
    ]);
    const nodesContent = nodesRows.length > 0
      ? `<div class="table-container"><table class="resource-table">
          <thead><tr>
            <th>${t('summary.db.hostname') || 'Hostname'}</th>
            <th>${t('summary.status') || 'Status'}</th>
            <th>${t('summary.db.private_ip') || 'Private IP'}</th>
            <th>${t('summary.db.fault_domain') || 'Fault Domain'}</th>
            <th>${t('summary.db.sw_storage') || 'Software Storage'}</th>
          </tr></thead>
          <tbody>${nodesRows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('')}</tbody>
        </table></div>`
      : `<p class="no-data-message">${t('summary.no_resource_found') || 'Nenhum encontrado.'}</p>`;
    const nodesFieldset = `
      <fieldset>
        <legend>${NODE_ICON}${t('summary.db.db_nodes') || 'DB Nodes'}</legend>
        ${nodesContent}
      </fieldset>`;

    // ── 6. DB Homes as nested collapsible cards ──
    const homesSection = (() => {
      const homes = db.db_homes || [];
      if (homes.length === 0) return '';

      const homeCards = homes.map(home => {
        const databaseCards = (home.databases || []).map(database => {
          // Connection strings
          let connHtml = '';
          if (database.connection_strings) {
            const cs = database.connection_strings;
            const allCS = cs.all_connection_strings || {};
            const csRows = [];
            if (cs.cdb_default) csRows.push(['CDB Default', cs.cdb_default]);
            if (cs.cdb_ip_default) csRows.push(['CDB IP Default', cs.cdb_ip_default]);
            Object.keys(allCS).forEach(k => csRows.push([k, allCS[k]]));
            if (csRows.length > 0) {
              connHtml = `
                <fieldset>
                  <legend>${t('summary.db.connection_strings') || 'Connection Strings'}</legend>
                  <div class="table-container"><table class="resource-table">
                    <thead><tr><th>${t('summary.name') || 'Nome'}</th><th>${t('summary.db.connection') || 'Connection'}</th></tr></thead>
                    <tbody>${csRows.map(r => `<tr><td><strong>${r[0]}</strong></td><td><span class="code-text">${r[1]}</span></td></tr>`).join('')}</tbody>
                  </table></div>
                </fieldset>`;
            }
          }

          // Backup config — always render, even when null (so user knows it's not configured)
          const bcHtml = (() => {
            const bc = database.backup_config;

            // Human-friendly destination type labels
            const destTypeLabel = (type) => {
              const map = {
                'OBJECT_STORE':       'Object Storage',
                'LOCAL':              'Local (ASM)',
                'NFS':                'NFS',
                'RECOVERY_APPLIANCE': 'Recovery Appliance (ZDLRA)',
                'DBRS':               'Database Backup Service (DBRS)',
              };
              return map[(type || '').toUpperCase()] || (type || '—');
            };

            if (!bc || (!bc.auto_backup_enabled && (!bc.backup_destination || bc.backup_destination === 'N/A') && (bc.backup_destination_details || []).length === 0)) {
              return `
                <fieldset>
                  <legend>${t('summary.db.backup_config') || 'Backup Configuration'}</legend>
                  <p class="no-data-message" style="color:var(--s-stopped)">✗ ${t('summary.db.backup_not_configured') || 'Backup não configurado'}</p>
                </fieldset>`;
            }

            const autoBackupOk = bc.auto_backup_enabled;

            // Destination details
            const destDetails = bc.backup_destination_details || [];
            let destHtml = '';
            let inferredNote = '';
            if (destDetails.length > 0) {
              // Check if inferred from backup history (no explicit backup_config in API)
              const isInferred = destDetails.some(d => d.inferred_from_history);
              if (isInferred) {
                inferredNote = `<div class="info-group full-width" style="grid-column:1/-1"><div class="info-value" style="font-size:11px;color:var(--text-muted);font-style:italic">${currentLanguage === 'pt' ? '* Configuração inferida do histórico de backups (API não retornou db_backup_config)' : '* Configuration inferred from backup history (API did not return db_backup_config)'}</div></div>`;
              }
              destHtml = destDetails.map((d, i) => {
                const typeLabel = destTypeLabel(d.type);
                const rows = [`<div class="info-group"><label>${t('summary.db.backup_destination') || 'Destino'}${destDetails.length > 1 ? ' ' + (i + 1) : ''}</label><div class="info-value"><strong style="color:var(--accent)">${typeLabel}</strong></div></div>`];
                if (d.id && d.type !== 'OBJECT_STORE') rows.push(`<div class="info-group"><label>Destination ID</label><div class="info-value"><span class="code-text" title="${d.id}">${d.id.split('.').pop().slice(0, 24)}…</span></div></div>`);
                if (d.vpc_user)       rows.push(`<div class="info-group"><label>VPC User</label><div class="info-value">${d.vpc_user}</div></div>`);
                if (d.internet_proxy) rows.push(`<div class="info-group"><label>Internet Proxy</label><div class="info-value">${d.internet_proxy}</div></div>`);
                if (d.dbrs_policy_id) rows.push(`<div class="info-group"><label>DBRS Policy</label><div class="info-value"><span class="code-text">${d.dbrs_policy_id}</span></div></div>`);
                return rows.join('');
              }).join('');
            } else if (bc.backup_destination && bc.backup_destination !== 'N/A') {
              destHtml = `<div class="info-group"><label>${t('summary.db.backup_destination') || 'Destino'}</label><div class="info-value"><strong style="color:var(--accent)">${destTypeLabel(bc.backup_destination)}</strong></div></div>`;
            }

            // Last backup info from the database object itself (most direct evidence)
            const lastBkTs   = database.last_backup_timestamp;
            const lastBkDur  = database.last_backup_duration_in_seconds;
            const lastBkFail = database.last_failed_backup_timestamp;
            const lastBkHtml = lastBkTs
              ? `<div class="info-group"><label>${t('summary.db.last_backup') || 'Último Backup'}</label><div class="info-value" style="color:var(--s-running)">✓ ${_date(lastBkTs)}${lastBkDur ? ` <span style="color:var(--text-secondary);font-size:11px">(${Math.ceil(lastBkDur / 60)} min)</span>` : ''}</div></div>`
              : '';
            const lastFailHtml = lastBkFail
              ? `<div class="info-group"><label>${t('summary.db.last_failed_backup') || 'Último Falhou'}</label><div class="info-value" style="color:var(--s-stopped)">✗ ${_date(lastBkFail)}</div></div>`
              : '';

            return `
              <fieldset>
                <legend>${t('summary.db.backup_config') || 'Backup Configuration'}</legend>
                <div class="grid-container">
                  <div class="info-group">
                    <label>${t('summary.db.auto_backup') || 'Auto Backup'}</label>
                    <div class="info-value">
                      ${autoBackupOk
                        ? `<span class="validation-ok" style="font-size:12px">✓ ${t('summary.enabled') || 'Ativado'}</span>`
                        : `<span class="validation-fail" style="font-size:12px">✗ ${t('summary.disabled') || 'Desativado'}</span>`}
                    </div>
                  </div>
                  ${destHtml}
                  ${lastBkHtml}
                  ${lastFailHtml}
                  ${inferredNote}
                  ${bc.recovery_window_in_days ? `<div class="info-group"><label>${t('summary.db.recovery_window') || 'Recovery Window'}</label><div class="info-value">${bc.recovery_window_in_days} ${t('summary.days') || 'dias'}</div></div>` : ''}
                  ${bc.auto_backup_window ? `<div class="info-group"><label>${t('summary.db.backup_window') || 'Backup Window'}</label><div class="info-value">${bc.auto_backup_window}</div></div>` : ''}
                  ${bc.auto_full_backup_window ? `<div class="info-group"><label>${t('summary.db.full_backup_window') || 'Full Backup Window'}</label><div class="info-value">${bc.auto_full_backup_window}</div></div>` : ''}
                  ${bc.backup_deletion_policy ? `<div class="info-group"><label>${t('summary.db.deletion_policy') || 'Deletion Policy'}</label><div class="info-value">${bc.backup_deletion_policy}</div></div>` : ''}
                </div>
              </fieldset>`;
          })();

          // RMAN backups
          const bkDestLabel = (type) => {
            const map = { OBJECT_STORE: 'Object Storage', LOCAL: 'Local', NFS: 'NFS', RECOVERY_APPLIANCE: 'ZDLRA', DBRS: 'DBRS' };
            return map[(type || '').toUpperCase()] || (type || '—');
          };
          const allBackups = database.backups || [];
          const backupsRows = allBackups.map(bk => {
            const stClass = (bk.lifecycle_state || '').toUpperCase();
            const stBadge = `<span class="status-badge status-${getStateCssClass(bk.lifecycle_state)}">${getStateLabel(bk.lifecycle_state)}</span>`;
            const nameCell = stClass === 'FAILED' && bk.lifecycle_details
              ? `<span title="${bk.lifecycle_details}">${_val(bk.display_name)} <span style="color:var(--s-stopped);font-size:10px">⚠ detalhes</span></span>`
              : _val(bk.display_name);
            return [
              nameCell,
              stBadge,
              _val(bk.type),
              bk.backup_destination_type ? `<span class="svol-type-tag boot" style="font-size:10px">${bkDestLabel(bk.backup_destination_type)}</span>` : '—',
              _date(bk.time_started),
              _date(bk.time_ended),
              bk.database_size_in_gbs ? bk.database_size_in_gbs.toFixed(2) + ' GB' : '—',
            ];
          });
          const backupsHtml = `
            <fieldset>
              <legend>${t('summary.db.backups_history') || 'Histórico de Backups'}${backupsRows.length > 0 ? ` (${backupsRows.length})` : ''}</legend>
              ${backupsRows.length > 0
                ? `<div class="table-container"><table class="resource-table">
                    <thead><tr>
                      <th>${t('summary.name') || 'Nome'}</th>
                      <th>${t('summary.status') || 'Status'}</th>
                      <th>${t('summary.db.backup_type') || 'Tipo'}</th>
                      <th>${t('summary.db.backup_destination') || 'Destino'}</th>
                      <th>${t('summary.db.start') || 'Início'}</th>
                      <th>${t('summary.db.end') || 'Fim'}</th>
                      <th>${t('summary.db.size') || 'Tamanho'}</th>
                    </tr></thead>
                    <tbody>${backupsRows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('')}</tbody>
                  </table></div>`
                : `<p class="no-data-message">${t('summary.db.no_backups') || 'Nenhum backup registrado.'}</p>`}
            </fieldset>`;

          // Data Guard
          const dgRows = (database.data_guard_associations || []).map(dg => [
            _val(dg.role), _val(dg.peer_role), _val(dg.protection_mode),
            _val(dg.transport_type), _val(dg.apply_lag),
            `<span class="status-badge status-${getStateCssClass(dg.lifecycle_state)}">${getStateLabel(dg.lifecycle_state)}</span>`,
          ]);
          const dgHtml = dgRows.length > 0
            ? `<fieldset>
                <legend>${t('summary.db.data_guard') || 'Data Guard'}</legend>
                <div class="table-container"><table class="resource-table">
                  <thead><tr>
                    <th>${t('summary.db.role') || 'Role'}</th><th>${t('summary.db.peer_role') || 'Peer Role'}</th>
                    <th>${t('summary.db.protection_mode') || 'Protection Mode'}</th><th>${t('summary.db.transport') || 'Transport'}</th>
                    <th>${t('summary.db.apply_lag') || 'Apply Lag'}</th><th>${t('summary.status') || 'Status'}</th>
                  </tr></thead>
                  <tbody>${dgRows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('')}</tbody>
                </table></div>
              </fieldset>`
            : '';

          // DB identity
          const dbIdFieldset = `
            <fieldset>
              <legend>${t('summary.db.database') || 'Database'}</legend>
              <div class="grid-container">
                <div class="info-group full-width"><label>db_unique_name</label><div class="info-value text-highlight">${_val(database.db_unique_name)}</div></div>
                <div class="info-group"><label>${t('summary.db.is_cdb') || 'Is CDB'}</label><div class="info-value">${database.is_cdb !== null && database.is_cdb !== undefined ? _bool(database.is_cdb) : '—'}</div></div>
                <div class="info-group"><label>${t('summary.db.workload') || 'Workload'}</label><div class="info-value">${_val(database.db_workload)}</div></div>
                <div class="info-group"><label>${t('summary.db.character_set') || 'Character Set'}</label><div class="info-value">${_val(database.character_set)}</div></div>
                <div class="info-group"><label>${t('summary.db.ncharacter_set') || 'N Character Set'}</label><div class="info-value">${_val(database.ncharacter_set)}</div></div>
                <div class="info-group"><label>${t('summary.db.sid_prefix') || 'SID Prefix'}</label><div class="info-value">${_val(database.sid_prefix)}</div></div>
                ${database.kms_key_id ? `<div class="info-group"><label>${t('summary.db.kms_key') || 'KMS Key'}</label><div class="info-value"><span class="code-text">${database.kms_key_id.split('.').pop().slice(0, 18)}…</span></div></div>` : ''}
              </div>
            </fieldset>`;

          return `
            <div class="instance-summary-card collapsible db-database-card">
              <div class="instance-card-header">
                <h4 class="card-header-title">${database.db_name}</h4>
                <div class="card-status-indicator">
                  ${database.db_workload ? `<span class="vcn-card-header-cidr">${database.db_workload}</span>` : ''}
                  ${database.lifecycle_state ? `<span class="status-badge status-${getStateCssClass(database.lifecycle_state)}">${getStateLabel(database.lifecycle_state)}</span>` : ''}
                </div>
                ${EXPAND_ARROW}
              </div>
              <div class="instance-card-body">
                ${dbIdFieldset}
                ${connHtml}
                ${bcHtml}
                ${backupsHtml}
                ${dgHtml}
              </div>
            </div>`;
        }).join('') || `<p class="no-data-message">${t('summary.db.no_databases') || 'Nenhum database neste DB Home.'}</p>`;

        return `
          <div class="instance-summary-card collapsible db-home-card">
            <div class="instance-card-header">
              <h4 class="card-header-title">${home.display_name}</h4>
              <div class="card-status-indicator">
                ${home.db_version ? `<span class="vcn-card-header-cidr">${home.db_version}</span>` : ''}
                <span class="status-badge status-${getStateCssClass(home.lifecycle_state)}">${getStateLabel(home.lifecycle_state)}</span>
              </div>
              ${EXPAND_ARROW}
            </div>
            <div class="instance-card-body">
              ${home.db_home_location ? `<p style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px"><strong>Location:</strong> <span class="code-text">${home.db_home_location}</span></p>` : ''}
              ${databaseCards}
            </div>
          </div>`;
      }).join('');

      return `
        <h5 class="subheader" style="margin-top:14px">DB Homes (${homes.length})</h5>
        <div class="db-home-container">${homeCards}</div>`;
    })();

    const cardContent = `
      ${generalFieldset}
      <hr class="fieldset-divider">
      ${computeFieldset}
      <hr class="fieldset-divider">
      ${networkFieldset}
      <hr class="fieldset-divider">
      ${haFieldset}
      <hr class="fieldset-divider">
      ${nodesFieldset}
      ${homesSection}
    `;

    return `
      <div class="instance-summary-card collapsible">
        <div class="instance-card-header">
          <h4 class="card-header-title">${db.display_name}${compBadgeFn(db.compartment_name || '')}</h4>
          <div class="card-status-indicator">
            ${editionAbbr ? `<span class="db-edition-badge">${editionAbbr}</span>` : ''}
            ${db.cpu_core_count ? `<span class="db-metric-pill">${db.cpu_core_count} vCPUs</span>` : ''}
            ${db.memory_size_in_gbs ? `<span class="db-metric-pill">${db.memory_size_in_gbs} GB</span>` : ''}
            <span class="status-badge status-${statusClass}">${getStateLabel(db.lifecycle_state)}</span>
          </div>
          ${EXPAND_ARROW}
        </div>
        <div class="instance-card-body">${cardContent}</div>
      </div>`;
  }

  function generateInfrastructureSummary(data) {
    const isNewHostFlow = selectedDocType === 'new_host';
    const isKubernetesFlow = selectedDocType === 'kubernetes';
    const isWafFlow = selectedDocType === 'waf_report';
    const isDatabaseFlow = selectedDocType === 'database';

    const {
        instances,
        vcns,
        drgs,
        cpes,
        ipsec_connections,
        load_balancers,
        volume_groups,
        kubernetes_clusters,
        waf_policies,
        certificates,
        db_systems,
      } = data;

    // ── Compartment badge helper (shown when multi-compartment data) ──
    function compBadge(compName) {
      if (!compName) return '';
      if (!allInfrastructureData.compartments || allInfrastructureData.compartments.length <= 1) return '';
      const idx = (allInfrastructureData.compartments || []).findIndex(c => c.name === compName);
      const color = COMP_PALETTE[Math.max(0, idx) % COMP_PALETTE.length];
      const style =
        `--badge-bg:color-mix(in srgb, ${color} 18%, transparent);` +
        `--badge-border:color-mix(in srgb, ${color} 55%, transparent);` +
        `--badge-dot:${color};`;
      return `<span class="comp-badge" style="${style}">${compName}</span>`;
    }

      if (isWafFlow && waf_policies?.length > 0) {
        // Filter out DELETED policies before any processing
        const activePolicies = waf_policies.filter(p =>
            p.lifecycle_state?.toUpperCase() !== 'DELETED'
        );
        activePolicies.forEach(policy => {
            const integrations = (policy.integrations && policy.integrations.length > 0)
                ? policy.integrations
                : (policy.integration ? [policy.integration] : []);
            integrations.forEach(intg => {
                const lb = intg.load_balancer;
                if (lb && !load_balancers.some(existing => existing.display_name === lb.display_name)) {
                    load_balancers.push(lb);
                }
            });
        });
        // Replace in-place so downstream rendering uses filtered list
        waf_policies.length = 0;
        activePolicies.forEach(p => waf_policies.push(p));
      }

      const createTable = (headers, rows) => {
      if (!rows || rows.length === 0) {
        return `<p class="no-data-message">${t('summary.no_resource_found')}</p>`;
      }
      const headerHtml = headers.map(h => `<th>${h}</th>`).join('');
      const bodyHtml = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
      return `<div class="table-container"><table class="resource-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
    };

    const instancesHtml = instances?.length > 0 ?
      instances.map(instance => generateInstanceSummaryCard(instance, true, { compBadge })).join('') :
      `<p class="no-data-message">${t('summary.no_instances_found')}</p>`;

    const volumeGroupsHtml = volume_groups?.length > 0 ?
      volume_groups.map(vg => {
        const { validation, lifecycle_state, display_name, availability_domain, members } = vg;
        const statusClass = getStateCssClass(lifecycle_state);

        // ── inline SVG icons ──
        const svgCheck =`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        const svgX     = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
        const svgDisk  = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>`;
        const svgShield= `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="legend-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

        // ── member volume chips ──
        const memberChipsHtml = members && members.length > 0
          ? `<div class="vg-member-chips">${members.map(m => `
              <div class="vg-member-chip">
                <span class="vg-member-chip-icon">${svgDisk}</span>
                <span class="vg-member-chip-name" title="${m}">${m}</span>
              </div>`).join('')}</div>`
          : `<p class="no-data-message">${t('summary.no_members_found')}</p>`;

        // ── protection status ──
        const backupStatusCls   = validation.has_backup_policy ? 'vg-protection--ok' : 'vg-protection--fail';
        const replicStatusCls   = validation.is_cross_region_replication_enabled ? 'vg-protection--ok' : 'vg-protection--fail';
        const backupIconHtml    = validation.has_backup_policy ? svgCheck : svgX;
        const replicIconHtml    = validation.is_cross_region_replication_enabled ? svgCheck : svgX;
        const backupLabel       = validation.has_backup_policy ? validation.policy_name : t('summary.none');
        const replicLabel       = validation.is_cross_region_replication_enabled ? t('summary.enabled') : t('summary.disabled');

        const cardContent = `
          <fieldset>
            <legend>${svgDisk}${t('summary.vg.members')} <span class="vg-member-count">(${members?.length || 0})</span></legend>
            ${memberChipsHtml}
          </fieldset>
          <hr class="fieldset-divider">
          <fieldset>
            <legend>${svgShield}${t('summary.vg.protection_validation')}</legend>
            <div class="vg-protection-grid">
              <div class="vg-protection-item ${backupStatusCls}">
                <div class="vg-protection-icon">${backupIconHtml}</div>
                <div class="vg-protection-info">
                  <span class="vg-protection-label">${t('summary.vg.backup_policy')}</span>
                  <span class="vg-protection-value">${backupLabel}</span>
                </div>
              </div>
              <div class="vg-protection-item ${replicStatusCls}">
                <div class="vg-protection-icon">${replicIconHtml}</div>
                <div class="vg-protection-info">
                  <span class="vg-protection-label">${t('summary.vg.cross_region_replication')}</span>
                  <span class="vg-protection-value">${replicLabel}</span>
                </div>
              </div>
              ${validation.is_cross_region_replication_enabled && validation.cross_region_target && validation.cross_region_target !== 'Desabilitada' ? `
              <div class="vg-protection-item vg-protection--info" style="grid-column:1/-1">
                <div class="vg-protection-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg></div>
                <div class="vg-protection-info">
                  <span class="vg-protection-label">${t('summary.vg.replication_target')}</span>
                  <span class="vg-protection-value">${validation.cross_region_target}</span>
                </div>
              </div>` : ''}
            </div>
          </fieldset>`;

        return `<div class="instance-summary-card collapsible"><div class="instance-card-header"><h4 class="card-header-title">${display_name}${compBadge(vg.compartment_name || '')}</h4><div class="card-status-indicator"><span class="vcn-card-header-cidr">${availability_domain}</span><span class="status-badge status-${statusClass}">${getStateLabel(lifecycle_state)}</span></div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="instance-card-body">${cardContent}</div></div>`;
      }).join('') :
      (isNewHostFlow ? '' : `<p class="no-data-message">${t('summary.no_vgs_found')}</p>`);

    let relevantVcns = vcns;
    if (isKubernetesFlow && kubernetes_clusters?.length > 0) {
      const clusterVcnIds = new Set(kubernetes_clusters.map(c => c.vcn_id));
      relevantVcns = vcns.filter(v => clusterVcnIds.has(v.id));
    } else if (isWafFlow && waf_policies?.length > 0) {
      const wafVcnNames = new Set(
          waf_policies
          .map(p => p.network_infrastructure?.vcn_name)
          .filter(n => n && n !== 'N/A')
      );
      relevantVcns = vcns.filter(v => wafVcnNames.has(v.display_name));
    }

    const vcnsHtml = relevantVcns?.length > 0 ?
      relevantVcns.map(vcn => {
        const subnetsTable = createTable([t('summary.vcn.subnet_name'), 'CIDR Block'], vcn.subnets?.map(s => [s.display_name, s.cidr_block]));
        const slTable = createTable([t('summary.name'), t('summary.rules_count')], vcn.security_lists?.map(sl => [sl.name, `${sl.rules.length}`]));
        const rtTable = createTable([t('summary.name'), t('summary.rules_count')], vcn.route_tables?.map(rt => [rt.name, `${rt.rules.length}`]));
        const nsgTable = createTable([t('summary.name'), t('summary.rules_count')], vcn.network_security_groups?.map(nsg => [nsg.name, `${nsg.rules.length}`]));
        // LPG cards — same pattern as storage svol-card
        const lpgHtml = vcn.lpgs?.length > 0
          ? `<div class="svol-grid">${vcn.lpgs.map(lpg => {
              const statusRaw   = (lpg.peering_status || 'UNKNOWN').toUpperCase();
              const statusText  = lpg.peering_status_details || lpg.peering_status || '—';
              let accentClass   = 'svol-card--warn';
              if (statusRaw === 'PEERED')       accentClass = 'svol-card--ok';
              else if (statusRaw === 'REVOKED' ||
                       statusRaw === 'ABANDONED') accentClass = 'svol-card--unattached';
              return `<div class="svol-card ${accentClass}">
                <div class="svol-card-header">
                  <div class="svol-card-title-row">
                    <span class="svol-card-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>
                    <span class="svol-card-name" title="${lpg.display_name}">${lpg.display_name}</span>
                  </div>
                  <div class="svol-card-badges">
                    <span class="svol-type-tag ${statusRaw === 'PEERED' ? 'boot' : 'block'}">${statusText}</span>
                  </div>
                </div>
                <div class="svol-card-body">
                  <div class="svol-row">
                    <span class="svol-row-label">Route Table</span>
                    <span class="svol-row-val">${lpg.route_table_name || '—'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.vcn.advertised_cidr')}</span>
                    <span class="svol-row-val" style="font-family:monospace">${lpg.peer_advertised_cidr || 'N/A'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">Cross-Tenancy</span>
                    <span class="svol-row-val">${lpg.is_cross_tenancy_peering ? t('summary.yes') : t('summary.no')}</span>
                  </div>
                </div>
              </div>`;
            }).join('')}</div>`
          : `<p class="no-data-message">${t('summary.no_resource_found')}</p>`;
        return `<div class="vcn-summary-card collapsible"><div class="vcn-card-header"><h4 class="card-header-title">${vcn.display_name}${compBadge(vcn.compartment_name || '')}</h4><div class="card-status-indicator"><span class="vcn-card-header-cidr">${vcn.cidr_block}</span></div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="vcn-card-body"><h5 class="subheader">Subnets</h5>${subnetsTable}<h5 class="subheader">Security Lists</h5>${slTable}<h5 class="subheader">Route Tables</h5>${rtTable}<h5 class="subheader">Network Security Groups (NSGs)</h5>${nsgTable}<h5 class="subheader">Local Peering Gateways (LPGs)</h5>${lpgHtml}</div></div>`;
      }).join('') :
      '';

    const loadBalancersHtml = load_balancers?.length > 0 ?
      load_balancers.map(lb => {
        const statusClass = getStateCssClass(lb.lifecycle_state);
        const cardContent = `
          <fieldset><legend>${ICONS.LB}${t('summary.lb.general_info')}</legend>
            <div class="grid-container">
              <div class="info-group full-width">
                <label>${t('summary.lb.ip_addresses')}</label>
                <div class="info-value">
                  <ul class="clean-list">${lb.ip_addresses?.filter(ip => ip && ip.ip_address).map(ip => `<li>${ip.ip_address} (${ip.is_public ? t('summary.public') : t('summary.private')})</li>`).join('') || '<li>N/A</li>'}</ul>
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
            ${(() => {
              const hasSSL = lb.listeners?.some(l => l.protocol === 'HTTPS' && (l.ssl_certificate_ids || []).length > 0);
              const headers = [t('summary.name'), t('summary.protocol'), t('summary.port'), t('summary.lb.default_backend_set'), ...(hasSSL ? [t('lb.header.tls_cert')] : [])];
              const rows = lb.listeners?.map(l => {
                const certNames = (l.ssl_certificate_ids || []).map(ocid => {
                  const match = (certificates || []).find(c => c.id === ocid);
                  return match ? `<span class="text-highlight">${match.name}</span>` : `<span style="font-size:0.75em;opacity:0.6">${ocid.slice(-12)}</span>`;
                });
                return [
                  `<span class="text-highlight">${l.name}</span>`,
                  l.protocol,
                  l.port,
                  l.default_backend_set_name,
                  ...(hasSSL ? [certNames.length > 0 ? certNames.join(', ') : '—'] : [])
                ];
              });
              return createTable(headers, rows);
            })()}
          </div>

          <div class="content-block">
            <h5 class="subheader">Backend Sets</h5>
            ${(lb.backend_sets && lb.backend_sets.length > 0) ? lb.backend_sets.map(bs => `<div class="backend-set-details"><h6 class="tunnel-subheader">Backend Set: <span class="text-highlight">${bs.name}</span> (${t('summary.lb.policy')}: ${bs.policy})</h6><ul class="tunnel-basic-info"><li><strong>Health Check:</strong> ${bs.health_checker.protocol}:${bs.health_checker.port}</li><li><strong>URL Path:</strong> ${bs.health_checker.url_path || 'N/A'}</li></ul>${createTable([t('summary.name'), 'IP', t('summary.port'), t('summary.weight')], bs.backends?.map(b => [`<span class="text-highlight">${b.name}</span>`, b.ip_address, b.port, b.weight]))}</div>`).join('') : `<p class="no-data-message">${t('summary.no_backend_sets_found')}</p>`}
          </div>`;

        return `<div class="instance-summary-card collapsible"><div class="instance-card-header"><h4 class="card-header-title">${lb.display_name}${compBadge(lb.compartment_name || '')}</h4><div class="card-status-indicator"><span class="vcn-card-header-cidr">${lb.shape_name}</span><span class="status-badge status-${statusClass}">${getStateLabel(lb.lifecycle_state)}</span></div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="instance-card-body">${cardContent}</div></div>`;
      }).join('') :
      '';

    const drgsHtml = drgs?.length > 0 ?
      drgs.map(drg => {
        // Attachment cards — resolve VCN name from vcns list via network_id
        const attachCardsHtml = drg.attachments?.length > 0
          ? `<div class="svol-grid">${drg.attachments.map(a => {
              const typeUpper   = (a.network_type || '').toUpperCase();
              const accentMap   = { VCN: 'svol-card--ok', IPSEC_TUNNEL: 'svol-card--ok', VIRTUAL_CIRCUIT: 'svol-card--ok' };
              const accent      = accentMap[typeUpper] || 'svol-card--warn';
              // Resolve human-readable network name for VCN attachments
              const vcnMatch    = typeUpper === 'VCN' ? vcns?.find(v => v.id === a.network_id) : null;
              const networkName = vcnMatch ? vcnMatch.display_name : (a.network_id ? a.network_id.split('.').pop().slice(0,18) : '—');
              return `<div class="svol-card ${accent}">
                <div class="svol-card-header">
                  <div class="svol-card-title-row">
                    <span class="svol-card-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg></span>
                    <span class="svol-card-name" title="${a.display_name}">${a.display_name}</span>
                  </div>
                  <div class="svol-card-badges">
                    <span class="svol-type-tag boot">${a.network_type}</span>
                  </div>
                </div>
                <div class="svol-card-body">
                  ${typeUpper === 'VCN' ? `<div class="svol-row">
                    <span class="svol-row-label">VCN</span>
                    <span class="svol-row-val" style="color:var(--accent);font-weight:600">${networkName}</span>
                  </div>` : ''}
                  <div class="svol-row svol-row--full">
                    <span class="svol-row-label">DRG Route Table</span>
                    <span class="svol-row-val" style="font-size:11px">${a.route_table_name || '—'}</span>
                  </div>
                </div>
              </div>`;
            }).join('')}</div>`
          : `<p class="no-data-message">${t('summary.no_resource_found')}</p>`;

        // RPC cards
        const rpcCardsHtml = drg.rpcs?.length > 0
          ? `<div class="svol-grid">${drg.rpcs.map(rpc => {
              const peerStatusRaw = (rpc.peering_status || 'UNKNOWN').toUpperCase();
              let peerText = rpc.peering_status_details || rpc.peering_status;
              if (peerStatusRaw === 'NEW')    peerText = 'New (not peered)';
              if (peerStatusRaw === 'PEERED') peerText = 'Peered';
              const accent = peerStatusRaw === 'PEERED' ? 'svol-card--ok' : 'svol-card--unattached';
              return `<div class="svol-card ${accent}">
                <div class="svol-card-header">
                  <div class="svol-card-title-row">
                    <span class="svol-card-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>
                    <span class="svol-card-name" title="${rpc.display_name}">${rpc.display_name}</span>
                  </div>
                  <div class="svol-card-badges">
                    <span class="svol-type-tag ${peerStatusRaw === 'PEERED' ? 'boot' : 'block'}">${peerText}</span>
                  </div>
                </div>
                <div class="svol-card-body">
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.status')}</span>
                    <span class="svol-row-val">${rpc.lifecycle_state || '—'}</span>
                  </div>
                </div>
              </div>`;
            }).join('')}</div>`
          : `<p class="no-data-message">${t('summary.no_resource_found')}</p>`;

        return `<div class="instance-summary-card collapsible"><div class="instance-card-header"><h4 class="card-header-title">${drg.display_name}${compBadge(drg.compartment_name || '')}</h4><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div class="instance-card-body"><h5 class="subheader">${t('summary.drg.attachments')}</h5>${attachCardsHtml}<h5 class="subheader">${t('summary.drg.rpcs')}</h5>${rpcCardsHtml}</div></div>`;
      }).join('') :
      '';

    // CPE cards — design system pattern
    const cpesHtml = cpes?.length > 0
      ? `<div class="svol-grid">${cpes.map(cpe => `
          <div class="svol-card svol-card--ok">
            <div class="svol-card-header">
              <div class="svol-card-title-row">
                <span class="svol-card-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
                <span class="svol-card-name" title="${cpe.display_name}">${cpe.display_name}</span>
              </div>
              <div class="svol-card-badges">${compBadge(cpe.compartment_name || '')}</div>
            </div>
            <div class="svol-card-body">
              <div class="svol-row">
                <span class="svol-row-label">IP</span>
                <span class="svol-row-val" style="font-family:monospace;color:var(--accent)">${cpe.ip_address}</span>
              </div>
              <div class="svol-row">
                <span class="svol-row-label">${t('summary.vpn.vendor')}</span>
                <span class="svol-row-val">${cpe.vendor || 'N/A'}</span>
              </div>
            </div>
          </div>`).join('')}</div>`
      : `<p class="no-data-message">${t('summary.no_resource_found')}</p>`;

    const ipsecHtml = ipsec_connections?.length > 0 ?
      ipsec_connections.map(ipsec => {
        const cpeName  = cpes.find(c => c.id === ipsec.cpe_id)?.display_name  || t('summary.none');
        const drgName  = drgs.find(d => d.id === ipsec.drg_id)?.display_name  || t('summary.none');
        const connStatusRaw = (ipsec.status || 'UNKNOWN').toUpperCase();
        const connAccent    = connStatusRaw === 'UP'            ? 'svol-card--ok'
                            : connStatusRaw === 'DOWN'          ? 'svol-card--unattached'
                            : 'svol-card--warn';   // PROVISIONING etc.

        const hasBgpTunnel = ipsec.tunnels.some(tn => tn.routing_type === 'BGP');
        const staticRoutes = (ipsec.static_routes?.length > 0)
          ? ipsec.static_routes.join(', ')
          : t('summary.none');

        // ── tunnel cards ──────────────────────────────────────────────────────
        const tunnelCardsHtml = ipsec.tunnels?.length > 0
          ? `<div class="vpn-tunnels-grid">${ipsec.tunnels.map(tunnel => {
              const p1 = tunnel.phase_one_details || {};
              const p2 = tunnel.phase_two_details || {};
              const tStatusRaw  = (tunnel.status || 'UNKNOWN').toUpperCase();
              const tAccent     = tStatusRaw === 'UP'   ? 'svol-card--ok'
                                : tStatusRaw === 'DOWN' ? 'svol-card--unattached'
                                : 'svol-card--warn';
              const tStatusBadgeCls = tStatusRaw === 'UP'   ? 'boot'
                                    : tStatusRaw === 'DOWN' ? 'block'
                                    : '';

              // BGP section
              let bgpRows = '';
              if (tunnel.routing_type === 'BGP' && tunnel.bgp_session_info) {
                const bgp = tunnel.bgp_session_info;
                bgpRows = `
                  <div class="svol-row vpn-row-divider">
                    <span class="svol-row-label" style="font-weight:700;color:var(--accent);letter-spacing:.05em">BGP</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.vpn.oracle_asn')}</span>
                    <span class="svol-row-val" style="font-family:monospace">${bgp.oracle_bgp_asn || 'N/A'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.vpn.customer_asn')}</span>
                    <span class="svol-row-val" style="font-family:monospace">${bgp.customer_bgp_asn || 'N/A'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.vpn.oracle_interface')}</span>
                    <span class="svol-row-val" style="font-family:monospace">${bgp.oracle_interface_ip || 'N/A'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.vpn.customer_interface')}</span>
                    <span class="svol-row-val" style="font-family:monospace">${bgp.customer_interface_ip || 'N/A'}</span>
                  </div>`;
              }

              return `<div class="svol-card ${tAccent}">
                <div class="svol-card-header">
                  <div class="svol-card-title-row">
                    <span class="svol-card-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
                    <span class="svol-card-name" title="${tunnel.display_name}" style="font-size:11.5px">${tunnel.display_name}</span>
                  </div>
                  <div class="svol-card-badges">
                    <span class="svol-type-tag ${tStatusBadgeCls}">${tunnel.status}</span>
                  </div>
                </div>
                <div class="svol-card-body">
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.vpn.oracle_ip')}</span>
                    <span class="svol-row-val" style="font-family:monospace">${tunnel.vpn_oracle_ip || 'N/A'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.vpn.cpe_ip')}</span>
                    <span class="svol-row-val" style="font-family:monospace">${tunnel.cpe_ip || 'N/A'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.routing')}</span>
                    <span class="svol-row-val">${tunnel.routing_type}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">IKE</span>
                    <span class="svol-row-val">${tunnel.ike_version}</span>
                  </div>
                  ${bgpRows}
                  <div class="svol-row vpn-row-divider">
                    <span class="svol-row-label" style="font-weight:700;color:var(--text-muted);letter-spacing:.05em;font-size:10px">FASE 1 (IKE)</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.vpn.auth')}</span>
                    <span class="svol-row-val" style="font-size:11px">${p1.authentication_algorithm || 'N/A'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.vpn.encryption')}</span>
                    <span class="svol-row-val" style="font-size:11px">${p1.encryption_algorithm || 'N/A'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">DH Group</span>
                    <span class="svol-row-val" style="font-size:11px">${p1.dh_group || 'N/A'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.lifetime')}</span>
                    <span class="svol-row-val">${p1.lifetime_in_seconds != null ? p1.lifetime_in_seconds + 's' : 'N/A'}</span>
                  </div>
                  <div class="svol-row vpn-row-divider">
                    <span class="svol-row-label" style="font-weight:700;color:var(--text-muted);letter-spacing:.05em;font-size:10px">FASE 2 (IPSEC)</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.vpn.auth')}</span>
                    <span class="svol-row-val" style="font-size:11px">${p2.authentication_algorithm || 'N/A'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.vpn.encryption')}</span>
                    <span class="svol-row-val" style="font-size:11px">${p2.encryption_algorithm || 'N/A'}</span>
                  </div>
                  <div class="svol-row">
                    <span class="svol-row-label">${t('summary.lifetime')}</span>
                    <span class="svol-row-val">${p2.lifetime_in_seconds != null ? p2.lifetime_in_seconds + 's' : 'N/A'}</span>
                  </div>
                </div>
              </div>`;
            }).join('')}</div>`
          : `<p class="no-data-message">${t('summary.no_tunnels_found')}</p>`;

        // ── ipsec connection card (collapsible) ───────────────────────────────
        return `<div class="ipsec-summary-card collapsible">
          <div class="ipsec-card-header">
            <h4 class="card-header-title">${ipsec.display_name}${compBadge(ipsec.compartment_name || '')}</h4>
            <div class="card-status-indicator">
              <span class="status-badge status-${connStatusRaw.toLowerCase()}">${ipsec.status}</span>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
          <div class="ipsec-card-body">
            <!-- Connection meta row -->
            <div class="vpn-conn-meta">
              <div class="vpn-conn-meta-item">
                <span class="svol-row-label">${t('summary.vpn.associated_cpe')}</span>
                <span class="vpn-meta-val">${cpeName}</span>
              </div>
              <div class="vpn-conn-meta-item">
                <span class="svol-row-label">${t('summary.vpn.associated_drg')}</span>
                <span class="vpn-meta-val">${drgName}</span>
              </div>
              <div class="vpn-conn-meta-item">
                <span class="svol-row-label">${hasBgpTunnel ? t('summary.routing') : t('summary.vpn.static_routes')}</span>
                <span class="vpn-meta-val" style="font-family:monospace">${hasBgpTunnel ? 'BGP' : staticRoutes}</span>
              </div>
            </div>
            <h5 class="subheader">${t('summary.vpn.tunnels')}</h5>
            ${tunnelCardsHtml}
          </div>
        </div>`;
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
              <h4 class="card-header-title">${cluster.name}${compBadge(cluster.compartment_name || '')}</h4>
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

    let wafHtml = '';

    if (waf_policies && waf_policies.length > 0) {
      waf_policies.forEach(policy => {
        const isDeleted = policy.lifecycle_state?.toUpperCase() === 'DELETED';
        const statusClass = getStateCssClass(policy.lifecycle_state);
        const fw = policy.integration?.firewall;
        const lb = policy.integration?.load_balancer;

        let wafCardContent = '';

        if (isDeleted) {
            wafCardContent = `<p class="no-data-message">${t('doc.messages.resource_deleted_info') || 'Recurso deletado.'}</p>`;
        } else {
            // Use `integrations` (all firewalls bound to this policy) with fallback to the legacy singular `integration`.
            const integrations = (policy.integrations && policy.integrations.length > 0)
                ? policy.integrations
                : (policy.integration ? [policy.integration] : []);

            const firewallRows = integrations.map(intg => {
                const fw = intg.firewall;
                const lb = intg.load_balancer;
                return [
                    `<span class="text-highlight">${fw ? fw.display_name : 'N/A'}</span>`,
                    `<span class="status-badge status-${fw?.lifecycle_state?.toLowerCase() || 'active'}">${fw?.lifecycle_state || 'ACTIVE'}</span>`,
                    'Load Balancer',
                    lb ? lb.display_name : 'N/A'
                ];
            });

            const firewallTable = firewallRows.length > 0
                ? createTable([t('waf.table.firewall_name'), t('waf.table.attach_state'), t('waf.table.enforce_point'), t('waf.table.enforce_name')], firewallRows)
                : `<p class="no-data-message">Nenhum Web Application Firewall associado.</p>`;

            wafCardContent = `
                <div class="content-block">
                    <h5 class="subheader">${t('waf.label.attach_title')}</h5>
                    ${firewallTable}
                </div>
                <div class="grid-container">
                    <div class="info-group"><label>${t('waf.label.protection')}</label><div class="info-value">${policy.protection_rules?.length || 0}</div></div>
                    <div class="info-group"><label>${t('waf.label.access_ctrl')}</label><div class="info-value">${policy.access_control_rules?.length || 0}</div></div>
                    <div class="info-group"><label>${t('waf.label.rate_limit')}</label><div class="info-value">${policy.rate_limiting_rules?.length > 0 ? t('summary.yes') : t('summary.no')}</div></div>
                </div>`;
        }

        wafHtml += `
            <div class="instance-summary-card collapsible${isDeleted ? ' deleted-resource' : ''}">
                <div class="instance-card-header">
                    <h4 class="card-header-title">${policy.display_name}</h4>
                    <div class="card-status-indicator"><span class="status-badge status-${statusClass}">${getStateLabel(policy.lifecycle_state)}</span></div>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="instance-card-body">${wafCardContent}</div>
            </div>`;
      });
    }

    if (!wafHtml) wafHtml = `<p class="no-data-message">${t('summary.no_waf_found')}</p>`;

    let titleKey = 'summary.title.full_infra';
    if (isNewHostFlow) {
      titleKey = 'summary.title.new_host';
    } else if (isKubernetesFlow) {
      titleKey = 'summary.title.k8s';
    } else if (isWafFlow) {
      titleKey = 'summary.title.waf';
    } else if (isDatabaseFlow) {
      titleKey = 'summary.title.database';
    }
    let title = t(titleKey, { name: selectedCompartmentName });
    
    // ── Certificate Cards: full visual redesign ────────────────────────────
    const renderCertificates = (certs) => {
      if (!certs || certs.length === 0) {
        return `<p class="no-data-message">Nenhum certificado encontrado no compartimento.</p>`;
      }

      return certs.map(cert => {
        const state = (cert.lifecycle_state || '').toUpperCase();
        const isActive  = state === 'ACTIVE';
        const isPending = state === 'PENDING_DELETION';
        const isDeleted = state === 'DELETED';

        // ── Validity period from nested current_version_summary ──────────
        const cv = cert.current_version_summary || {};
        const validFrom  = cv.valid_not_before || 'N/A';
        const validUntil = cv.valid_not_after  || cert.valid_not_after || 'N/A';
        const todayMs    = Date.now();
        let daysUntilExpiry = null;
        if (validUntil && validUntil !== 'N/A') {
          daysUntilExpiry = Math.ceil((new Date(validUntil) - todayMs) / 86_400_000);
        }

        // ── Status chip ──────────────────────────────────────────────────
        let statusChip = '';
        if (isActive) {
          if (daysUntilExpiry !== null && daysUntilExpiry <= 30) {
            statusChip = `<span class="cert-status-chip cert-expiring">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              ${t('cert.status.expiring', {days: daysUntilExpiry})}
            </span>`;
          } else {
            statusChip = `<span class="cert-status-chip cert-active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              ${t('cert.status.active')}
            </span>`;
          }
        } else if (isPending) {
          statusChip = `<span class="cert-status-chip cert-pending">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${t('cert.status.pending')}
          </span>`;
        } else if (isDeleted) {
          statusChip = `<span class="cert-status-chip cert-deleted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            ${t('cert.status.deleted')}
          </span>`;
        }

        // ── Expiry bar ───────────────────────────────────────────────────
        let expiryBarHtml = '';
        if (validFrom !== 'N/A' && validUntil !== 'N/A') {
          const totalMs  = new Date(validUntil) - new Date(validFrom);
          const usedMs   = todayMs - new Date(validFrom);
          const pct      = Math.min(100, Math.max(0, (usedMs / totalMs) * 100));
          const barColor = pct >= 90 ? '#ef4444' : pct >= 75 ? '#f97316' : '#22c55e';
          expiryBarHtml = `
            <div class="cert-expiry-bar-wrap">
              <div class="cert-expiry-bar-track">
                <div class="cert-expiry-bar-fill" style="width:${pct.toFixed(1)}%;background:${barColor};"></div>
              </div>
              <span class="cert-expiry-bar-label">${validFrom} → ${validUntil}${daysUntilExpiry !== null ? ` (${daysUntilExpiry > 0 ? t('cert.expiry.remaining', {days: daysUntilExpiry}) : t('cert.status.expired')})` : ''}</span>
            </div>`;
        }

        // ── Subject ──────────────────────────────────────────────────────
        const subject = cert.subject || cert.subject_info || {};
        const cn   = subject.common_name            || 'N/A';
        const org  = subject.organization           || 'N/A';
        const loc  = subject.locality_name          || subject.locality || 'N/A';
        const st   = subject.state_or_province_name || subject.state    || 'N/A';
        const ctry = subject.country                || 'N/A';

        // Subtitle under cert name: Common Name → first SAN → expiry date → ''
        const rawSansForSubtitle = cert.subject_alternative_names || [];
        const firstSan = Array.isArray(rawSansForSubtitle) && rawSansForSubtitle.length > 0
          ? (rawSansForSubtitle[0].value || rawSansForSubtitle[0])
          : null;
        const subtitleText = (cn !== 'N/A') ? cn
          : firstSan ? firstSan
          : (validUntil !== 'N/A') ? `Expira: ${validUntil}`
          : '';

        // ── SANs ─────────────────────────────────────────────────────────
        let sansHtml = '';
        const rawSans = cert.subject_alternative_names;
        if (Array.isArray(rawSans) && rawSans.length > 0) {
          sansHtml = rawSans.map(s => {
            const type = s.san_type || s.type || 'DNS';
            const val  = s.value    || String(s);
            const typeColor = type === 'IP' ? '#f97316' : '#a5b4fc';
            return `<span class="cert-san-tag"><span class="cert-san-type" style="color:${typeColor}">${type}</span>${val}</span>`;
          }).join('');
        } else if (typeof rawSans === 'string' && rawSans && rawSans !== 'N/A') {
          sansHtml = rawSans.split(',').map(s =>
            `<span class="cert-san-tag"><span class="cert-san-type">DNS</span>${s.trim()}</span>`
          ).join('');
        }

        // ── Version details ──────────────────────────────────────────────
        const cvStages = Array.isArray(cv.stages) ? cv.stages : (cv.stages ? [cv.stages] : []);
        const stagePills = cvStages.map(s => `<span class="cert-stage-pill">${s}</span>`).join('');
        const serialNum = cv.serial_number   || 'N/A';
        const versionNo = cv.version_number  != null ? cv.version_number : 'N/A';

        // ── Associations ─────────────────────────────────────────────────
        const assocs = cert.associations || [];
        let assocsHtml = '';
        if (assocs.length > 0) {
          assocsHtml = assocs.map(a => {
            const aName    = a.display_name || a.name || 'N/A';
            const aType    = a.resource_type || 'N/A';
            const aState   = a.lifecycle_state || a.state || 'N/A';
            const aResId   = a.associated_resource_id || a.resource_id || 'N/A';
            const aCreated = a.time_created || a.time || 'N/A';
            const aStatusClass = aState.toLowerCase().replace(/_/g,'-');
            return `
              <div class="cert-assoc-card">
                <div class="cert-assoc-header">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cert-assoc-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  <span class="cert-assoc-name">${aName}</span>
                  <span class="status-badge status-${aStatusClass}">${aState}</span>
                </div>
                <div class="cert-assoc-meta">
                  <span class="cert-assoc-type-badge">${aType}</span>
                  <span class="cert-assoc-date">${t('cert.label.created_short')} ${aCreated}</span>
                </div>
                <div class="cert-assoc-id"><span class="code-text">${aResId}</span></div>
              </div>`;
          }).join('');
        } else {
          assocsHtml = `<p class="no-data-message" style="margin:0;padding:8px 0;">${t('cert.label.no_assocs')}</p>`;
        }

        // ── Card border color based on state ─────────────────────────────
        const cardBorderColor = isActive
          ? (daysUntilExpiry !== null && daysUntilExpiry <= 30 ? '#f97316' : '#22c55e')
          : isPending ? '#f59e0b'
          : '#6b7280';

        return `
          <div class="cert-card collapsible" style="border-left-color:${cardBorderColor};">
            <!-- Card Header -->
            <div class="cert-card-header instance-card-header">
              <div class="cert-card-title-area">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cert-card-icon" style="color:${cardBorderColor}"><circle cx="12" cy="8" r="6"/><path d="m9 8 2 2 4-4"/><path d="M6.5 14.5 5 20l7-2 7 2-1.5-5.5"/></svg>
                <div>
                  <h4 class="card-header-title">${cert.name}</h4>
                  <span class="cert-cn-subtitle">${subtitleText}</span>
                </div>
              </div>
              <div class="cert-card-badges">
                ${statusChip}
                <span class="cert-type-badge">${cert.config_type || 'IMPORTED'}</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="expand-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>

            <!-- Card Body -->
            <div class="cert-card-body instance-card-body">

              ${expiryBarHtml}

              <!-- Two-column identity grid -->
              <div class="cert-grid">
                <div class="cert-section">
                  <h5 class="cert-section-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
                    ${t('cert.label.identity')}
                  </h5>
                  <div class="cert-kv-list">
                    <div class="cert-kv-row"><span class="cert-kv-label">Common Name</span><span class="cert-kv-value text-highlight">${cn}</span></div>
                    <div class="cert-kv-row"><span class="cert-kv-label">${t('cert.label.org')}</span><span class="cert-kv-value">${org}</span></div>
                    <div class="cert-kv-row"><span class="cert-kv-label">${t('cert.label.locality')}</span><span class="cert-kv-value">${loc}</span></div>
                    <div class="cert-kv-row"><span class="cert-kv-label">${t('cert.label.state')}</span><span class="cert-kv-value">${st}</span></div>
                    <div class="cert-kv-row"><span class="cert-kv-label">${t('cert.label.country')}</span><span class="cert-kv-value">${ctry}</span></div>
                  </div>
                </div>

                <div class="cert-section">
                  <h5 class="cert-section-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    ${t('cert.label.technical')}
                  </h5>
                  <div class="cert-kv-list">
                    <div class="cert-kv-row"><span class="cert-kv-label">${t('cert.label.key_algo')}</span><span class="cert-kv-value">${cert.key_algorithm || 'N/A'}</span></div>
                    <div class="cert-kv-row"><span class="cert-kv-label">${t('cert.label.sign_algo')}</span><span class="cert-kv-value">${cert.signature_algorithm || 'N/A'}</span></div>
                    <div class="cert-kv-row"><span class="cert-kv-label">${t('cert.label.version')}</span><span class="cert-kv-value">${versionNo}</span></div>
                    <div class="cert-kv-row"><span class="cert-kv-label">Stages</span><span class="cert-kv-value">${stagePills || 'N/A'}</span></div>
                    <div class="cert-kv-row"><span class="cert-kv-label">${t('cert.label.created')}</span><span class="cert-kv-value">${cert.time_created || 'N/A'}</span></div>
                    ${isPending ? `<div class="cert-kv-row cert-deletion-row"><span class="cert-kv-label">${t('cert.label.deletion')}</span><span class="cert-kv-value" style="color:#f59e0b;font-weight:600;">${cert.time_of_deletion || 'N/A'}</span></div>` : ''}
                  </div>
                </div>
              </div>

              <!-- Serial number full-width -->
              <div class="cert-section cert-section-full">
                <h5 class="cert-section-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                  ${t('cert.label.identifiers')}
                </h5>
                <div class="cert-kv-list">
                  <div class="cert-kv-row"><span class="cert-kv-label">${t('cert.label.serial')}</span><span class="cert-kv-value"><span class="code-text">${serialNum}</span></span></div>
                  <div class="cert-kv-row"><span class="cert-kv-label">OCID</span><span class="cert-kv-value"><span class="code-text">${cert.id}</span></span></div>
                </div>
              </div>

              <!-- SANs -->
              <div class="cert-section cert-section-full">
                <h5 class="cert-section-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                  ${t('cert.label.sans')}
                </h5>
                <div class="cert-sans-wrap">
                  ${sansHtml || `<span style="color:var(--text-secondary);font-size:13px">${t('cert.label.no_sans')}</span>`}
                </div>
              </div>

              <!-- Associations -->
              <div class="cert-section cert-section-full">
                <h5 class="cert-section-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  ${t('cert.label.associations')} (${assocs.length})
                </h5>
                <div class="cert-assoc-list">${assocsHtml}</div>
              </div>

            </div>
          </div>`;
      }).join('');
    };

    const certificatesMainCard = renderCertificates(certificates);
    let mainContentHtml = '';

    if (isNewHostFlow) {
      mainContentHtml = `
        <fieldset><legend>${ICONS.INSTANCES}${t('summary.compute_instances')}</legend><div class="instances-container">${instancesHtml || `<p class="no-data-message">${t('summary.no_instances_found')}</p>`}</div></fieldset>
        <hr class="fieldset-divider">
        <fieldset><legend>${ICONS.BLOCK_VOLUMES}${t('summary.associated_vgs')}</legend><div class="vg-container">${volumeGroupsHtml || `<p class="no-data-message">${t('summary.no_vgs_found')}</p>`}</div></fieldset>`;
    } else if (isKubernetesFlow) {
      mainContentHtml = `
        <fieldset><legend>${ICONS.OKE}${t('summary.oke_clusters')}</legend><div class="oke-container">${okeClustersHtml}</div></fieldset>
        <hr class="fieldset-divider">
        <fieldset><legend>${ICONS.VCNS}${t('summary.vcns')}</legend><div class="vcn-container">${vcnsHtml || `<p class="no-data-message">${t('summary.no_vcns_associated')}</p>`}</div></fieldset>`;
    } else if (isWafFlow) {
      mainContentHtml = `
        <fieldset><legend>${ICONS.WAF}${t('summary.waf_policies')}</legend><div class="instances-container">${wafHtml}</div></fieldset>
        <hr class="fieldset-divider">
        <fieldset><legend>${ICONS.LB}${t('summary.lbs')}</legend><div class="instances-container">${loadBalancersHtml || `<p class="no-data-message">${t('doc.messages.no_lb_association')}</p>`}</div></fieldset>
        <hr class="fieldset-divider">
        <fieldset><legend>${ICONS.CERTIFICATES}${t('summary.section.certificates') || 'Certificados TLS/SSL'}</legend><div class="instances-container">${certificatesMainCard}</div></fieldset>
        <hr class="fieldset-divider">
        <fieldset><legend>${ICONS.VCNS}${t('summary.vcns')}</legend><div class="vcn-container">${vcnsHtml || `<p class="no-data-message">${t('doc.messages.no_network_found')}</p>`}</div></fieldset>
      `;
    } else if (isDatabaseFlow) {
      // Database Systems summary cards (rich)
      const dbSystemsHtml = db_systems && db_systems.length > 0
        ? db_systems.map(db => renderDbSystemCard(db, { compBadge: compBadge })).join('')
        : `<p class="no-data-message">${t('summary.no_db_systems_found') || 'No DB Systems found.'}</p>`;

      mainContentHtml = `
        <fieldset><legend>${ICONS.BLOCK_VOLUMES}${t('summary.db_systems') || 'DB Systems'}</legend><div class="instances-container">${dbSystemsHtml}</div></fieldset>`;
    } else { // Full Infra
      const activeWafPolicies = (waf_policies || []).filter(p =>
          p.lifecycle_state?.toUpperCase() !== 'DELETED'
      );
      const hasWaf  = activeWafPolicies.length > 0;
      const hasCerts = (certificates || []).filter(c =>
          ['ACTIVE','PENDING_DELETION'].includes((c.lifecycle_state || '').toUpperCase())
      ).length > 0;

      // Reuses `wafHtml` computed above — same UI as the WAF Report view (firewall table, rules grid).
      const wafInfraSection  = hasWaf  ? '<hr class="fieldset-divider"><fieldset><legend>' + ICONS.WAF + t('summary.waf_policies') + '</legend><div class="instances-container">' + wafHtml + '</div></fieldset>' : '';
      const certInfraSection = hasCerts ? '<hr class="fieldset-divider"><fieldset><legend>' + ICONS.CERTIFICATES + (t('summary.section.certificates') || 'Certificados TLS/SSL') + '</legend><div class="instances-container">' + renderCertificates(certificates) + '</div></fieldset>' : '';

      // DB Systems section for full infra (if present) — rich card
      const dbInfraHtml = db_systems && db_systems.length > 0
        ? db_systems.map(db => renderDbSystemCard(db, { compBadge: compBadge })).join('')
        : '';
      const dbInfraSection = dbInfraHtml ? '<hr class="fieldset-divider"><fieldset><legend>' + ICONS.BLOCK_VOLUMES + (t('summary.db_systems') || 'DB Systems') + '</legend><div class="instances-container">' + dbInfraHtml + '</div></fieldset>' : '';

      // Build dedicated storage section HTML
      const storageSectionHtml = generateStorageSectionHtml(data, compBadge);

      mainContentHtml = `
        <fieldset><legend>${ICONS.INSTANCES}${t('summary.compute_instances')}</legend><div class="instances-container">${instancesHtml}</div></fieldset>
        <hr class="fieldset-divider"><fieldset><legend>${ICONS.STORAGE}${t('summary.storage') || 'Armazenamento (Volumes)'}</legend>${storageSectionHtml}</fieldset>
        ${volumeGroupsHtml ? `<hr class="fieldset-divider"><fieldset><legend>${ICONS.VOLUME_GROUPS}${t('summary.vgs')}</legend><div class="vg-container">${volumeGroupsHtml}</div></fieldset>`: ''}
        <hr class="fieldset-divider"><fieldset><legend>${ICONS.VCNS}${t('summary.vcns')}</legend><div class="vcn-container">${vcnsHtml || `<p class="no-data-message">${t('summary.no_vcns_found')}</p>`}</div></fieldset>
        <hr class="fieldset-divider"><fieldset><legend>${ICONS.OKE}${t('summary.oke_clusters')}</legend><div class="oke-container">${okeClustersHtml}</div></fieldset>
        <hr class="fieldset-divider"><fieldset><legend>${ICONS.LB}${t('summary.lbs')}</legend><div class="lb-container">${loadBalancersHtml || `<p class="no-data-message">${t('summary.no_lbs_found')}</p>`}</div></fieldset>
        ${wafInfraSection}
        ${certInfraSection}
        ${dbInfraSection}
        <hr class="fieldset-divider"><fieldset><legend>${ICONS.ROUTING}${t('summary.routing_connectivity')}</legend><div class="drg-container">${drgsHtml || `<p class="no-data-message">${t('summary.no_drgs_found')}</p>`}</div></fieldset>
        <hr class="fieldset-divider"><fieldset><legend>${ICONS.VPN}${t('summary.vpn_connectivity')}</legend><h4 class="subheader">${t('summary.vpn.cpes')}</h4>${cpesHtml}<h4 class="subheader">${t('summary.vpn.ipsec_connections')}</h4><div class="ipsec-container">${ipsecHtml || `<p class="no-data-message">${t('summary.no_ipsec_found')}</p>`}</div></fieldset>`;
    }

    const diagramHtml = (typeof renderOciDiagram === 'function') ? renderOciDiagram(data, selectedDocType) : '';
    return `<div>${diagramHtml}<h3 class="infra-summary-main-title">${title}</h3>${mainContentHtml}</div>`;
  }

  // --- Storage Section — unified Boot + Block Volume panel with in-use indicator ---
  function generateStorageSectionHtml(data, compBadge = () => '') {
    const instances        = data.instances || [];
    const standaloneVols   = data.standalone_volumes || [];

    // ── helpers ──────────────────────────────────────────────────────────────
    function backupPill(policyName) {
      const none = !policyName ||
        policyName === 'Nenhuma política associada' ||
        policyName === 'No backup policy assigned' ||
        policyName === 'Nenhuma';
      return `<span class="svol-backup-pill ${none ? 'none' : 'active'}">${none ? (t('instance.no_backup_policy') || 'Sem backup') : policyName}</span>`;
    }

    function inUseBadge(attached) {
      return attached
        ? `<span class="svol-usage-badge in-use"><span class="svol-usage-dot"></span>${t('storage.in_use') || 'Em uso'}</span>`
        : `<span class="svol-usage-badge unattached"><span class="svol-usage-dot"></span>${t('storage.unattached') || 'Sem vínculo'}</span>`;
    }

    function stateBadge(state) {
      const s = (state || '').toUpperCase();
      const label = getStateLabel(state);
      const cls   = getStateCssClass(state);
      return `<span class="storage-vol-state-badge state-${cls}">${label}</span>`;
    }

    function volCard(opts) {
      // opts: { name, sizeGb, backupPolicy, state, vmName, isBootVol, attached, compartmentBadge }
      const { name, sizeGb, backupPolicy, state, vmName, isBootVol, attached, compartmentBadge = '' } = opts;
      const noPolicy = !backupPolicy ||
        backupPolicy === 'Nenhuma política associada' ||
        backupPolicy === 'No backup policy assigned' ||
        backupPolicy === 'Nenhuma';
      const stateUpper = (state || '').toUpperCase();

      // Card border colour: green = in-use + backup, amber = in-use + no backup, red = unattached, dim = terminated
      let cardAccent = '';
      if (stateUpper === 'TERMINATED') cardAccent = 'svol-card--terminated';
      else if (!attached)              cardAccent = 'svol-card--unattached';
      else if (!noPolicy)              cardAccent = 'svol-card--ok';
      else                             cardAccent = 'svol-card--warn';

      const typeLabel = isBootVol
        ? `<span class="svol-type-tag boot">${t('storage.type_boot') || 'Boot Volume'}</span>`
        : `<span class="svol-type-tag block">${t('storage.type_block') || 'Block Volume'}</span>`;

      const vmRow = vmName
        ? `<div class="svol-row">
             <span class="svol-row-label">${t('summary.storage.vm') || 'VM'}</span>
             <span class="svol-row-val svol-vm-link">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
               ${vmName}
             </span>
           </div>`
        : '';

      return `
        <div class="svol-card ${cardAccent}">
          <div class="svol-card-header">
            <div class="svol-card-title-row">
              <span class="svol-card-icon">${isBootVol ? ICONS.BOOT_VOLUME : ICONS.BLOCK_VOLUMES}</span>
              <span class="svol-card-name" title="${name}">${name}</span>
            </div>
            <div class="svol-card-badges">
              ${typeLabel}
              ${inUseBadge(attached)}
              ${compartmentBadge}
            </div>
          </div>
          <div class="svol-card-body">
            <div class="svol-row">
              <span class="svol-row-label">${t('summary.storage.size') || 'Tamanho'}</span>
              <span class="svol-row-val">${sizeGb} GB</span>
            </div>
            <div class="svol-row">
              <span class="svol-row-label">${t('summary.storage.state') || 'Estado'}</span>
              <span class="svol-row-val">${stateBadge(state || 'AVAILABLE')}</span>
            </div>
            ${vmRow}
            <div class="svol-row svol-row--full">
              <span class="svol-row-label">Backup</span>
              <span class="svol-row-val">${backupPill(backupPolicy)}</span>
            </div>
          </div>
        </div>`;
    }

    // ── build card lists ──────────────────────────────────────────────────────
    const bootCards = instances.map(inst =>
      volCard({
        name:             `${inst.host_name} — Boot`,
        sizeGb:           inst.boot_volume_gb,
        backupPolicy:     inst.backup_policy_name,
        state:            inst.lifecycle_state,
        vmName:           inst.host_name,
        isBootVol:        true,
        attached:         true,
        compartmentBadge: compBadge(inst.compartment_name || ''),
      })
    );

    const blockAttachedCards = instances.flatMap(inst =>
      (inst.block_volumes || []).map(vol =>
        volCard({
          name:             vol.display_name,
          sizeGb:           vol.size_in_gbs,
          backupPolicy:     vol.backup_policy_name,
          state:            inst.lifecycle_state,
          vmName:           inst.host_name,
          isBootVol:        false,
          attached:         true,
          compartmentBadge: compBadge(inst.compartment_name || ''),
        })
      )
    );

    const standaloneCards = standaloneVols.map(vol =>
      volCard({
        name:             vol.display_name,
        sizeGb:           vol.size_in_gbs,
        backupPolicy:     vol.backup_policy_name,
        state:            vol.lifecycle_state,
        vmName:           null,
        isBootVol:        false,
        attached:         false,
        compartmentBadge: compBadge(vol.compartment_name || ''),
      })
    );

    const allCards = [...bootCards, ...blockAttachedCards, ...standaloneCards];

    if (!allCards.length) {
      return `<p class="no-data-message">${t('summary.storage.no_boot_volumes') || 'Nenhum volume encontrado.'}</p>`;
    }

    // Stats bar
    const totalCount     = allCards.length;
    const inUseCount     = bootCards.length + blockAttachedCards.length;
    const unattachedCount= standaloneCards.length;
    const totalGb        = [
      ...instances.map(i => parseFloat(i.boot_volume_gb) || 0),
      ...instances.flatMap(i => (i.block_volumes||[]).map(v => parseFloat(v.size_in_gbs)||0)),
      ...standaloneVols.map(v => parseFloat(v.size_in_gbs)||0),
    ].reduce((a,b) => a+b, 0);

    const statsBar = `
      <div class="svol-stats-bar">
        <span class="svol-stat"><strong>${totalCount}</strong> ${t('storage.total_volumes') || 'volumes'}</span>
        <span class="svol-stat-divider">·</span>
        <span class="svol-stat svol-stat--inuse"><strong>${inUseCount}</strong> ${t('storage.in_use') || 'em uso'}</span>
        ${unattachedCount ? `<span class="svol-stat-divider">·</span>
        <span class="svol-stat svol-stat--unattached"><strong>${unattachedCount}</strong> ${t('storage.unattached') || 'sem vínculo'}</span>` : ''}
        <span class="svol-stat-divider">·</span>
        <span class="svol-stat"><strong>${totalGb.toFixed(0)} GB</strong> total</span>
      </div>`;

    return `${statsBar}<div class="svol-grid">${allCards.join('')}</div>`;
  }


  function generateInstanceSummaryCard(data, isCollapsible = false, opts) {
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
          <div class="info-group full-width"><label>${t('summary.instance.backup_policy')}</label><div class="info-value">${data.backup_policy_name === 'Nenhuma política associada' ? t('instance.no_backup_policy') : data.backup_policy_name}</div></div>
        </div>
      </fieldset>
      <hr class="fieldset-divider">
      <fieldset><legend>${ICONS.BLOCK_VOLUMES}${t('summary.instance.attached_volumes')}</legend>
        <div class="table-container">
          ${data.block_volumes && data.block_volumes.length > 0 ?
            `<div class="bv-cards-grid">${data.block_volumes.map(vol => {
              const hasBackup = vol.backup_policy_name && vol.backup_policy_name !== 'Nenhuma política associada' && vol.backup_policy_name !== 'No backup policy assigned';
              return `
              <div class="bv-card">
                <div class="bv-card-header">
                  <span class="bv-card-icon">${ICONS.BLOCK_VOLUMES}</span>
                  <span class="bv-card-name">${vol.display_name}</span>
                </div>
                <div class="bv-card-rows">
                  <div class="bv-card-row">
                    <span class="bv-card-row-label">${t('summary.instance.size')}</span>
                    <span class="bv-card-row-val">${vol.size_in_gbs} GB</span>
                  </div>
                  <div class="bv-card-row">
                    <span class="bv-card-row-label">Backup</span>
                    <span class="bv-card-row-val">
                      <span class="bv-card-badge ${hasBackup ? 'backup-active' : 'backup-none'}">${hasBackup ? vol.backup_policy_name : t('instance.no_backup_policy')}</span>
                    </span>
                  </div>
                </div>
              </div>`;
            }).join('')}</div>` :
            `<p class="no-data-message">${t('summary.no_block_volumes_found')}</p>`
          }
        </div>
      </fieldset>
      <hr class="fieldset-divider">
      <fieldset><legend>${ICONS.CONNECTIVITY}${t('summary.instance.network_summary')}</legend>
        <div class="net-summary-grid">
          <div class="net-summary-card">
            <div class="net-summary-card-header">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="net-summary-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
              <span class="net-summary-label">Security Lists</span>
              <span class="net-summary-count">${data.security_lists?.length || 0}</span>
            </div>
            <div class="net-summary-chips">
              ${data.security_lists?.length > 0
                ? data.security_lists.map(sl => `<span class="net-chip net-chip-blue"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${sl.name} <em>${sl.rules?.length ?? '?'} regras</em></span>`).join('')
                : `<span class="net-chip net-chip-empty">${t('summary.none')}</span>`}
            </div>
          </div>
          <div class="net-summary-card">
            <div class="net-summary-card-header">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="net-summary-icon"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1"/></svg>
              <span class="net-summary-label">NSGs</span>
              <span class="net-summary-count">${data.network_security_groups?.length || 0}</span>
            </div>
            <div class="net-summary-chips">
              ${data.network_security_groups?.length > 0
                ? data.network_security_groups.map(nsg => `<span class="net-chip net-chip-purple"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${nsg.name} <em>${nsg.rules?.length ?? '?'} regras</em></span>`).join('')
                : `<span class="net-chip net-chip-empty">${t('summary.none')}</span>`}
            </div>
          </div>
          <div class="net-summary-card">
            <div class="net-summary-card-header">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="net-summary-icon"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
              <span class="net-summary-label">Route Table</span>
              <span class="net-summary-count">${data.route_table ? 1 : 0}</span>
            </div>
            <div class="net-summary-chips">
              ${data.route_table?.name
                ? `<span class="net-chip net-chip-teal"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${data.route_table.name} <em>${data.route_table.rules?.length ?? '?'} rotas</em></span>`
                : `<span class="net-chip net-chip-empty">${t('summary.none')}</span>`}
            </div>
          </div>
        </div>
      </fieldset>`;

    const _compBadgeFn = (opts && opts.compBadge) || function() { return ''; };
    if (isCollapsible) {
      const rawState = (data.lifecycle_state || '').toUpperCase();
      const statusClass = rawState === 'RUNNING' ? 'running'
                        : rawState === 'TERMINATED' ? 'terminated'
                        : 'stopped';
      return `
        <div class="instance-summary-card collapsible">
          <div class="instance-card-header">
            <h4 class="card-header-title">${data.host_name}${_compBadgeFn(data.compartment_name || '')}</h4>
            <div class="card-status-indicator">
              <span class="status-dot ${statusClass}"></span>
              <span class="status-label ${statusClass}">${rawState === 'TERMINATED' ? (currentLanguage === 'pt' ? 'Excluído' : 'Terminated') : data.lifecycle_state}</span>
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
        allInfrastructureData.vcns?.length ||
        allInfrastructureData.waf_policies?.length);

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
        lang: currentLanguage,
        compartment_name: selectedCompartmentName || 'N/A',
        region: selectedRegion || 'N/A',
      };

      // Attach image section metadata to payload
      payload.image_sections = imageSections.map(sec => ({
        name: sec.name,
        position: sec.position,
        file_count: sec.files.length,
        text_above: sec.text_above || '',
        text_below: sec.text_below || '',
      }));
      // Letterhead metadata (files appended after section_images: header, footer, cover)
      payload.letterhead = {
        enabled:                letterhead.enabled,
        header_file_count:      (letterhead.enabled && letterhead.headerFile) ? 1 : 0,
        footer_file_count:      (letterhead.enabled && letterhead.footerFile) ? 1 : 0,
        cover_image_file_count: letterhead.coverFile ? 1 : 0,
      };
      formData.append('json_data', JSON.stringify(payload));
      // Flat file list — server slices by file_count per section, then letterhead
      imageSections.forEach(sec =>
        sec.files.forEach(file => formData.append('section_images', file))
      );
      if (letterhead.enabled && letterhead.headerFile) formData.append('section_images', letterhead.headerFile);
      if (letterhead.enabled && letterhead.footerFile) formData.append('section_images', letterhead.footerFile);
      if (letterhead.coverFile) formData.append('section_images', letterhead.coverFile);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/api/generate-document`, true);
      xhr.responseType = 'blob';
      // Attach session token so backend logs generation to the right user (optional)
      const _authHdr = getAuthHeaders();
      if (_authHdr.Authorization) xhr.setRequestHeader('Authorization', _authHdr.Authorization);
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
          const typeSlug = (selectedDocType || 'doc').replace('_', '-').toUpperCase();
          const compSlug = (selectedCompartmentName || 'OCI').replace(/[^a-zA-Z0-9\-_]/g, '_').toUpperCase();
          const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0,14);
          a.download = `DocGen_${compSlug}_${typeSlug}_${ts}.docx`;
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


  // --- Image Section Manager ---

  function renderImageSections() {
    imageSectionsList.innerHTML = '';
    imageSections.forEach((sec, idx) => {
      const card = buildSectionCard(sec, idx);
      imageSectionsList.appendChild(card);
    });
    updateOrderBadges();
  }

  function updateOrderBadges() {
    imageSectionsList.querySelectorAll('.img-section-order-badge').forEach((b, i) => {
      b.textContent = i + 1;
    });
  }

  function addImageSection(name, position) {
    const id = ++sectionIdCounter;
    imageSections.push({
      id,
      name: name || t('attachments_section_default_name'),
      position: position || 'end',
      files: [],
      text_above: '',
      text_below: '',
    });
    renderImageSections();
    // Focus the name input of the new card
    const cards = imageSectionsList.querySelectorAll('.img-section-card');
    const last = cards[cards.length - 1];
    if (last) last.querySelector('.img-section-name-input')?.focus();
  }

  function buildSectionCard(sec, idx) {
    const card = document.createElement('div');
    card.className = 'img-section-card';
    card.dataset.secId = sec.id;

    // ── Drag handle + name input + position toggle + remove ──
    const header = document.createElement('div');
    header.className = 'img-section-header';

    const handle = document.createElement('div');
    handle.className = 'img-section-drag-handle';
    handle.title = t('attachments_drag_hint');
    handle.draggable = false; // drag is on the card, not here
    handle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>`;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'img-section-name-input';
    nameInput.placeholder = t('attachments_section_name_placeholder');
    nameInput.value = sec.name;
    nameInput.addEventListener('input', () => {
      const s = imageSections.find(x => x.id === sec.id);
      if (s) s.name = nameInput.value;
    });

    const posToggle = document.createElement('div');
    posToggle.className = 'img-section-position';
    ['start', 'end'].forEach(pos => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = pos === 'start' ? t('attachments_position_start') : t('attachments_position_end');
      btn.dataset.pos = pos;
      if (sec.position === pos) btn.classList.add('active');
      btn.addEventListener('click', () => {
        const s = imageSections.find(x => x.id === sec.id);
        if (s) s.position = pos;
        posToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.pos === pos));
      });
      posToggle.appendChild(btn);
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'img-section-remove-btn';
    removeBtn.title = t('attachments_remove_section');
    removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    removeBtn.addEventListener('click', () => {
      imageSections = imageSections.filter(x => x.id !== sec.id);
      renderImageSections();
    });

    header.append(handle, nameInput, posToggle, removeBtn);

    // ── Order badge (shows position in list) ──
    const badge = document.createElement('div');
    badge.className = 'img-section-order-badge';
    badge.textContent = idx + 1;

    // ── Drop / paste zone ──
    const zone = document.createElement('div');
    zone.className = 'img-section-dropzone';
    zone.tabIndex = 0;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp';
    fileInput.multiple = true;

    const zoneIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    zoneIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    zoneIcon.setAttribute('viewBox', '0 0 24 24');
    zoneIcon.setAttribute('fill', 'none');
    zoneIcon.setAttribute('stroke', 'currentColor');
    zoneIcon.setAttribute('stroke-width', '2');
    zoneIcon.setAttribute('stroke-linecap', 'round');
    zoneIcon.setAttribute('stroke-linejoin', 'round');
    zoneIcon.innerHTML = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line>';

    const zoneLabel = document.createElement('span');
    zoneLabel.textContent = t('attachments_drop_hint_drag') || 'Arraste imagens aqui ou:';

    // Action buttons row
    const zoneActions = document.createElement('div');
    zoneActions.className = 'dropzone-actions';

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'dropzone-action-btn';
    selectBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg> ${t('attachments_select_file') || 'Selecionar Arquivo'}`;
    selectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    const pasteBtn = document.createElement('button');
    pasteBtn.type = 'button';
    pasteBtn.className = 'dropzone-action-btn';
    pasteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg> ${t('attachments_paste_clipboard') || 'Colar (Ctrl+V)'}`;
    pasteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      zone.focus();
      pasteBtn.classList.add('paste-ready');
      const origHtml = pasteBtn.innerHTML;
      pasteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ${t('attachments_paste_ready') || 'Pronto — pressione Ctrl+V'}`;
      setTimeout(() => {
        pasteBtn.classList.remove('paste-ready');
        pasteBtn.innerHTML = origHtml;
      }, 4000);
    });

    zoneActions.append(selectBtn, pasteBtn);

    const zoneHint = document.createElement('small');
    zoneHint.textContent = t('upload.hint');

    zone.append(fileInput, zoneIcon, zoneLabel, zoneActions, zoneHint);

    // File picker change
    fileInput.addEventListener('change', () => {
      addFilesToSection(sec.id, Array.from(fileInput.files));
      fileInput.value = '';
    });

    // Paste — only images, show error otherwise
    zone.addEventListener('paste', (e) => {
      e.preventDefault();
      const items = Array.from(e.clipboardData?.items || []);
      const imgItems = items.filter(i => i.kind === 'file' && i.type.startsWith('image/'));
      if (items.some(i => i.kind === 'file') && imgItems.length === 0) {
        showToast(t('toast.paste_not_image'), 'error');
        return;
      }
      const files = imgItems.map(i => {
        const blob = i.getAsFile();
        return new File([blob], `colado_${Date.now()}.${blob.type.split('/')[1]}`, { type: blob.type });
      });
      addFilesToSection(sec.id, files);
    });

    // Drag-and-drop files INTO zone
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover-file'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover-file'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover-file');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (e.dataTransfer.files.length && !files.length) {
        showToast(t('toast.paste_not_image'), 'error');
        return;
      }
      addFilesToSection(sec.id, files);
    });

    // ── Text above/below fields ──
    const textsEl = document.createElement('div');
    textsEl.className = 'img-section-texts';

    const buildTextRow = (labelKey, stateKey) => {
      const row = document.createElement('div');
      row.className = 'img-section-text-row';
      const lbl = document.createElement('span');
      lbl.className = 'img-section-text-label';
      lbl.textContent = t(labelKey);
      const ta = document.createElement('textarea');
      ta.className = 'img-section-textarea';
      ta.placeholder = t('attachments_text_placeholder');
      ta.value = sec[stateKey] || '';
      ta.rows = 2;
      ta.addEventListener('input', () => {
        const s = imageSections.find(x => x.id === sec.id);
        if (s) s[stateKey] = ta.value;
      });
      // Prevent drag-to-reorder while typing in textarea
      ta.addEventListener('mousedown', e => e.stopPropagation());
      row.append(lbl, ta);
      return row;
    };
    textsEl.append(
      buildTextRow('attachments_text_above_label', 'text_above'),
      buildTextRow('attachments_text_below_label', 'text_below'),
    );

    // ── Thumbnail grid ──
    const thumbsEl = document.createElement('div');
    thumbsEl.className = 'img-section-thumbs';
    sec.files.forEach((file, fi) => {
      thumbsEl.appendChild(buildThumb(file, fi, sec.id));
    });

    // ── Drag-to-reorder card ──
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(sec.id));
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (e) => {
      // Only react to card-drag events (not file-drops handled by zone)
      if (e.dataTransfer.types.includes('text/plain')) {
        e.preventDefault();
        card.classList.add('drag-over');
      }
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
      if (!e.dataTransfer.types.includes('text/plain')) return;
      e.preventDefault();
      card.classList.remove('drag-over');
      const draggedId = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (draggedId === sec.id) return;
      const fromIdx = imageSections.findIndex(x => x.id === draggedId);
      const toIdx   = imageSections.findIndex(x => x.id === sec.id);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = imageSections.splice(fromIdx, 1);
      imageSections.splice(toIdx, 0, moved);
      renderImageSections();
    });

    card.append(badge, header, textsEl, zone);
    if (sec.files.length) card.appendChild(thumbsEl);
    return card;
  }

  function buildThumb(file, fi, secId) {
    const wrap = document.createElement('div');
    wrap.className = 'img-thumb-wrap';
    const img = document.createElement('img');
    const reader = new FileReader();
    reader.onload = e => {
      img.src = e.target.result;
      img.dataset.fullSrc = e.target.result;
    };
    reader.readAsDataURL(file);
    img.alt = file.name;
    img.title = t('attachments_click_to_preview');
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      openLightbox(img.dataset.fullSrc, file.name);
    });
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'img-thumb-remove';
    rm.title = t('attachments_remove_image');
    rm.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      const s = imageSections.find(x => x.id === secId);
      if (s) { s.files.splice(fi, 1); renderImageSections(); }
    });
    wrap.append(img, rm);
    return wrap;
  }

  function addFilesToSection(secId, files) {
    if (!files.length) return;
    const sec = imageSections.find(x => x.id === secId);
    if (!sec) return;
    files.forEach(f => sec.files.push(f));
    renderImageSections();
  }



  // Expose image section API for diagram integration
  window._diagramApi = {
    addImageSection,
    addFilesToSection,
    getImageSections: () => imageSections,
  };

  // --- Letterhead Manager — header, footer and cover image slots ---

  function initLetterheadManager() {
    const toggle = document.getElementById('letterhead-toggle');
    const panel  = document.getElementById('letterhead-panel');
    if (!toggle || !panel) return;

    toggle.addEventListener('change', () => {
      letterhead.enabled = toggle.checked;
      panel.classList.toggle('hidden', !toggle.checked);
    });

    ['header', 'footer', 'cover'].forEach(slot => {
      const zone      = document.getElementById(`letterhead-${slot}-zone`);
      const fileInput = document.getElementById(`letterhead-${slot}-input`);
      const selectBtn = document.getElementById(`letterhead-${slot}-select-btn`);
      const pasteBtn  = document.getElementById(`letterhead-${slot}-paste-btn`);
      const removeBtn = document.getElementById(`letterhead-${slot}-remove`);
      if (!zone) return;

      selectBtn?.addEventListener('click', e => { e.stopPropagation(); fileInput?.click(); });
      fileInput?.addEventListener('change', () => {
        const f = fileInput.files[0]; if (f) _setLetterheadFile(slot, f); fileInput.value = '';
      });

      pasteBtn?.addEventListener('click', e => {
        e.stopPropagation(); zone.focus();
        const origHtml = pasteBtn.innerHTML;
        pasteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ${t('letterhead.paste_ready') || 'Pronto — Ctrl+V'}`;
        setTimeout(() => { pasteBtn.innerHTML = origHtml; }, 4000);
      });

      zone.addEventListener('paste', e => {
        e.preventDefault();
        const items = Array.from(e.clipboardData?.items || []);
        const imgItem = items.find(i => i.kind === 'file' && i.type.startsWith('image/'));
        if (items.some(i => i.kind === 'file') && !imgItem) { showToast(t('toast.paste_not_image'), 'error'); return; }
        if (!imgItem) return;
        const blob = imgItem.getAsFile();
        _setLetterheadFile(slot, new File([blob], `${slot}_${Date.now()}.${blob.type.split('/')[1]}`, { type: blob.type }));
      });

      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover-file'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover-file'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('dragover-file');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (e.dataTransfer.files.length && !files.length) { showToast(t('toast.paste_not_image'), 'error'); return; }
        if (files[0]) _setLetterheadFile(slot, files[0]);
      });

      removeBtn?.addEventListener('click', () => _resetLetterheadSlot(slot));
    });
  }

  function _setLetterheadFile(slot, file) {
    if (slot === 'header') letterhead.headerFile = file;
    else if (slot === 'footer') letterhead.footerFile = file;
    else letterhead.coverFile = file;
    const zone = document.getElementById(`letterhead-${slot}-zone`);
    const preview = document.getElementById(`letterhead-${slot}-preview`);
    const img = document.getElementById(`letterhead-${slot}-img`);
    if (!zone || !preview || !img) return;
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; zone.style.display = 'none'; preview.style.display = 'flex'; };
    reader.readAsDataURL(file);
  }

  function _resetLetterheadSlot(slot) {
    if (slot === 'header') letterhead.headerFile = null;
    else if (slot === 'footer') letterhead.footerFile = null;
    else letterhead.coverFile = null;
    const zone = document.getElementById(`letterhead-${slot}-zone`);
    const preview = document.getElementById(`letterhead-${slot}-preview`);
    const img = document.getElementById(`letterhead-${slot}-img`);
    if (zone) zone.style.display = '';
    if (preview) preview.style.display = 'none';
    if (img) img.src = '';
  }

  // --- Lightbox ---

  function openLightbox(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || '';
    lightboxOverlay.classList.add('visible');
    document.addEventListener('keydown', closeLightboxOnEsc);
  }

  function closeLightbox() {
    lightboxOverlay.classList.remove('visible');
    document.removeEventListener('keydown', closeLightboxOnEsc);
  }

  function closeLightboxOnEsc(e) {
    if (e.key === 'Escape') closeLightbox();
  }

  // --- Document Preview ---

  function openDocPreview() {
    previewModalBody.innerHTML = '';

    const docTypeLabels = {
      full_infra:  t('doc_type_full'),
      new_host:    t('doc_type_new'),
      kubernetes:  t('doc_type_k8s'),
      waf_report:  t('doc_type_waf'),
    };
    const docTitle = docTypeLabels[selectedDocType] || selectedDocType;
    const clientName = selectedCompartmentName || 'N/A';
    const today = new Date().toLocaleDateString('pt-BR');

    const startSections = imageSections.filter(s => s.position === 'start');
    const endSections   = imageSections.filter(s => s.position === 'end');

    // ── Page 1: Cover ──────────────────────────────────────────────────────
    const coverPage = buildPreviewPage('Capa', 1);
    coverPage.innerHTML += `
      <div class="preview-doc-title">${docTitle}</div>
      <div class="preview-doc-meta">${t('doc.common.client') || 'Cliente'}: ${clientName}</div>
      <div class="preview-doc-meta">${t('doc.common.generation_date') || 'Data'}: ${today}</div>
    `;
    previewModalBody.appendChild(coverPage);

    // ── Page 2: TOC ─────────────────────────────────────────────────────────
    const tocPage = buildPreviewPage('Sumário', 2);
    const tocDiv = document.createElement('div');
    const tocTitle = document.createElement('div');
    tocTitle.className = 'preview-toc-title';
    tocTitle.textContent = t('preview_toc') || 'Sumário';
    tocDiv.appendChild(tocTitle);

    const allSections = buildPreviewSectionList(startSections, endSections);
    let pageNum = 3;
    allSections.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'preview-toc-entry level-' + entry.level;
      const dots = document.createElement('span');
      dots.className = 'preview-toc-dots';
      const pg = document.createElement('span');
      pg.className = 'preview-toc-page';
      pg.textContent = pageNum;
      if (entry.level === 1) pageNum++;
      row.innerHTML = entry.name;
      row.append(dots, pg);
      tocDiv.appendChild(row);
    });
    tocPage.appendChild(tocDiv);
    previewModalBody.appendChild(tocPage);

    // ── Content pages ────────────────────────────────────────────────────────
    let contentPageNum = 3;

    // Start image sections
    startSections.forEach(sec => {
      previewModalBody.appendChild(buildImageSectionPage(sec, contentPageNum++));
    });

    // Infra content
    previewModalBody.appendChild(buildInfraPage(contentPageNum));
    contentPageNum++;

    // End image sections
    endSections.forEach(sec => {
      previewModalBody.appendChild(buildImageSectionPage(sec, contentPageNum++));
    });

    // Responsible
    const respPage = buildPreviewPage(t('preview_responsible') || 'Responsável', contentPageNum);
    const respSection = document.createElement('div');
    respSection.className = 'preview-section';
    const respH = document.createElement('div');
    respH.className = 'preview-section-heading';
    respH.innerHTML = `${t('preview_responsible') || 'Responsável'}<span class="preview-badge responsible">${t('attachments_position_end') || 'Final'}</span>`;
    respSection.appendChild(respH);
    const responsibleName = document.getElementById('responsible-name-input')?.value?.trim();
    if (responsibleName) {
      const rLine = document.createElement('div');
      rLine.className = 'preview-subsection';
      rLine.textContent = responsibleName;
      respSection.appendChild(rLine);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'preview-text-line medium';
      respSection.appendChild(placeholder);
    }
    respPage.appendChild(respSection);
    previewModalBody.appendChild(respPage);

    previewOverlay.classList.add('visible');
    document.addEventListener('keydown', closePreviewOnEsc);
  }

  function closeDocPreview() {
    previewOverlay.classList.remove('visible');
    document.removeEventListener('keydown', closePreviewOnEsc);
  }

  function closePreviewOnEsc(e) {
    if (e.key === 'Escape') closeDocPreview();
  }


  function buildPreviewPage(label, num, lhHeaderSrc, lhFooterSrc) {
    const page = document.createElement('div');
    page.className = 'preview-page';
    if (lhHeaderSrc) {
      const hImg = document.createElement('img');
      hImg.src = lhHeaderSrc; hImg.className = 'preview-page-letterhead-header';
      hImg.alt = t('letterhead.preview_header') || 'Cabeçalho';
      page.appendChild(hImg);
    }
    const pg = document.createElement('span');
    pg.className = 'preview-page-label';
    pg.textContent = `${t('preview_page') || 'Pág.'} ${num}`;
    page.appendChild(pg);
    page._lhFooterSrc = lhFooterSrc || null;
    page._pageNum = num;
    return page;
  }

  function _sealPreviewPage(page) {
    const src = page._lhFooterSrc;
    if (!src && !letterhead.enabled) return;
    const wrap = document.createElement('div');
    wrap.className = 'preview-page-letterhead-footer-wrap';
    if (src) {
      const img = document.createElement('img');
      img.src = src; img.alt = t('letterhead.preview_footer') || 'Rodapé';
      wrap.appendChild(img);
    }
    const badge = document.createElement('span');
    badge.className = 'preview-page-num-badge';
    badge.textContent = (t('letterhead.preview_page_num') || 'Pág. N').replace('N', String(page._pageNum));
    wrap.appendChild(badge);
    page.appendChild(wrap);
  }

  function openDocPreview() {
    previewModalBody.innerHTML = '';
    const docTypeLabels = { full_infra: t('doc_type_full'), new_host: t('doc_type_new'), kubernetes: t('doc_type_k8s'), waf_report: t('doc_type_waf') };
    const docTitle = docTypeLabels[selectedDocType] || selectedDocType;
    const clientName = selectedCompartmentName || 'N/A';
    const today = new Date().toLocaleDateString('pt-BR');
    const startSections = imageSections.filter(s => s.position === 'start');
    const endSections   = imageSections.filter(s => s.position === 'end');

    const lhOn       = letterhead.enabled;
    const lhHdrSrc   = lhOn && letterhead.headerFile ? document.getElementById('letterhead-header-img')?.src || null : null;
    const lhFtrSrc   = lhOn && letterhead.footerFile ? document.getElementById('letterhead-footer-img')?.src || null : null;
    const lhCoverSrc = letterhead.coverFile ? document.getElementById('letterhead-cover-img')?.src || null : null;
    const showFtr    = lhOn && (lhFtrSrc || lhHdrSrc);
    const mk = (label, num) => buildPreviewPage(label, num, lhHdrSrc, showFtr ? lhFtrSrc : null);

    // Cover
    const coverPage = mk('Capa', 1);
    if (lhCoverSrc) {
      const ci = document.createElement('img');
      ci.src = lhCoverSrc; ci.style.cssText = 'width:100%;max-height:160px;object-fit:contain;display:block;margin:0 auto 10px;';
      coverPage.appendChild(ci);
    }
    ['preview-doc-title', 'preview-doc-meta', 'preview-doc-meta'].forEach((cls, i) => {
      const d = document.createElement('div'); d.className = cls;
      d.textContent = [docTitle, `${t('doc.common.client')||'Cliente'}: ${clientName}`, `${t('doc.common.generation_date')||'Data'}: ${today}`][i];
      coverPage.appendChild(d);
    });
    _sealPreviewPage(coverPage); previewModalBody.appendChild(coverPage);

    // TOC
    const tocPage = mk('Sumário', 2);
    const tocDiv = document.createElement('div');
    const tocTitle = document.createElement('div'); tocTitle.className = 'preview-toc-title';
    tocTitle.textContent = t('preview_toc') || 'Sumário'; tocDiv.appendChild(tocTitle);
    const allSections = buildPreviewSectionList(startSections, endSections);
    let pageNum = 3;
    allSections.forEach(entry => {
      const row = document.createElement('div'); row.className = 'preview-toc-entry level-' + entry.level;
      const dots = document.createElement('span'); dots.className = 'preview-toc-dots';
      const pg = document.createElement('span'); pg.className = 'preview-toc-page'; pg.textContent = pageNum;
      if (entry.level === 1) pageNum++;
      row.innerHTML = entry.name; row.append(dots, pg); tocDiv.appendChild(row);
    });
    tocPage.appendChild(tocDiv); _sealPreviewPage(tocPage); previewModalBody.appendChild(tocPage);

    // Content
    let cp = 3;
    startSections.forEach(sec => { previewModalBody.appendChild(buildImageSectionPage(sec, cp++, lhHdrSrc, showFtr ? lhFtrSrc : null)); });
    previewModalBody.appendChild(buildInfraPage(cp++, lhHdrSrc, showFtr ? lhFtrSrc : null));
    endSections.forEach(sec => { previewModalBody.appendChild(buildImageSectionPage(sec, cp++, lhHdrSrc, showFtr ? lhFtrSrc : null)); });

    // Responsible
    const respPage = mk(t('preview_responsible')||'Responsável', cp);
    const rs = document.createElement('div'); rs.className = 'preview-section';
    const rh = document.createElement('div'); rh.className = 'preview-section-heading';
    rh.innerHTML = `${t('preview_responsible')||'Responsável'}<span class="preview-badge responsible">${t('attachments_position_end')||'Final'}</span>`;
    rs.appendChild(rh);
    const rn = document.getElementById('responsible-name-input')?.value?.trim();
    if (rn) { const rl = document.createElement('div'); rl.className = 'preview-subsection'; rl.textContent = rn; rs.appendChild(rl); }
    else { const ph = document.createElement('div'); ph.className = 'preview-text-line medium'; rs.appendChild(ph); }
    respPage.appendChild(rs); _sealPreviewPage(respPage); previewModalBody.appendChild(respPage);

    previewOverlay.classList.add('visible');
    document.addEventListener('keydown', closePreviewOnEsc);
  }

  function closeDocPreview() {
    previewOverlay.classList.remove('visible');
    document.removeEventListener('keydown', closePreviewOnEsc);
  }

  function closePreviewOnEsc(e) { if (e.key === 'Escape') closeDocPreview(); }

  function buildPreviewSectionList(startSecs, endSecs) {
    const entries = [];
    const push = (name, level) => entries.push({ name, level });

    startSecs.forEach(s => push(s.name, 1));

    // Infer infra section names from collected data — desired order
    const data = allInfrastructureData;
    if (data.instances?.length)           push(t('preview_section_compute')  || 'Instâncias Compute', 1);
    if (data.instances?.length || data.standalone_volumes?.length)
                                          push(t('preview_section_storage')  || 'Armazenamento (Volumes)', 1);
    if (data.volume_groups?.length)       push(t('preview_section_vg')       || 'Volume Groups', 1);
    if (data.vcns?.length)                push(t('preview_section_vcn')      || 'Redes Virtuais (VCN)', 1);
    if (data.load_balancers?.length)      push(t('preview_section_lb')       || 'Load Balancers', 1);
    if (data.certificates?.length)        push(t('doc.headers.certificates') || 'Certificados', 1);
    if (data.waf_policies?.length)        push(t('preview_section_waf')      || 'WAF', 1);
    if (data.drgs?.length)                push(t('preview_section_drg')      || 'Conectividade de Roteamento (DRG)', 1);
    if (data.cpes?.length || data.ipsec_connections?.length)
                                          push(t('preview_section_vpn')      || 'Conectividade VPN', 1);
    if (data.kubernetes_clusters?.length) push(t('preview_section_oke')      || 'Kubernetes (OKE)', 1);

    endSecs.forEach(s => push(s.name, 1));
    push(t('preview_responsible') || 'Responsável', 1);
    return entries;
  }

  function buildInfraPage(pageNum, lhHdrSrc, lhFtrSrc) {
    const page = buildPreviewPage(t('preview_infra') || 'Infraestrutura', pageNum, lhHdrSrc, lhFtrSrc);
    const data = allInfrastructureData;

    const sections = [];
    if (data.instances?.length)
      sections.push({ label: t('preview_section_compute') || 'Instâncias Compute', badge: 'infra', count: data.instances.length, unit: t('summary.compute_instances') || 'instância(s)' });
    const volCount = (data.instances?.reduce((a, i) => a + 1 + (i.block_volumes?.length || 0), 0) || 0)
                   + (data.standalone_volumes?.length || 0);
    if (volCount > 0)
      sections.push({ label: t('preview_section_storage') || 'Armazenamento (Volumes)', badge: 'infra', count: volCount, unit: 'vol(s)' });
    if (data.volume_groups?.length)
      sections.push({ label: t('preview_section_vg') || 'Volume Groups', badge: 'infra', count: data.volume_groups.length, unit: 'grupo(s)' });
    if (data.vcns?.length)
      sections.push({ label: t('preview_section_vcn') || 'Redes Virtuais (VCN)', badge: 'infra', count: data.vcns.length, unit: 'VCN' });
    if (data.load_balancers?.length)
      sections.push({ label: t('preview_section_lb') || 'Load Balancers', badge: 'infra', count: data.load_balancers.length, unit: 'LB' });
    if (data.certificates?.length)
      sections.push({ label: t('doc.headers.certificates') || 'Certificados', badge: 'infra', count: data.certificates.length, unit: 'cert(s)' });
    if (data.waf_policies?.length)
      sections.push({ label: t('preview_section_waf') || 'WAF', badge: 'infra', count: data.waf_policies.length, unit: 'política(s)' });
    if (data.drgs?.length)
      sections.push({ label: t('preview_section_drg') || 'Conectividade de Roteamento (DRG)', badge: 'routing', count: data.drgs.length, unit: 'DRG(s)' });
    if (data.cpes?.length || data.ipsec_connections?.length) {
      const ipsecCount = data.ipsec_connections?.length || 0;
      const tunnelCount = data.ipsec_connections?.reduce((acc, c) => acc + (c.tunnels?.length || 0), 0) || 0;
      sections.push({ label: t('preview_section_vpn') || 'Conectividade VPN', badge: 'vpn',
        count: ipsecCount, unit: `IPSec · ${tunnelCount} túnel(s)` });
    }
    if (data.kubernetes_clusters?.length)
      sections.push({ label: t('preview_section_oke') || 'Kubernetes (OKE)', badge: 'infra', count: data.kubernetes_clusters.length, unit: 'cluster(s)' });

    if (!sections.length) {
      const empty = document.createElement('div');
      empty.className = 'preview-subsection';
      empty.textContent = t('preview_no_data') || 'Nenhum dado de infraestrutura coletado.';
      page.appendChild(empty);
      _sealPreviewPage(page);
      return page;
    }

    sections.forEach(s => {
      const sec = document.createElement('div');
      sec.className = 'preview-section';
      const h = document.createElement('div');
      h.className = 'preview-section-heading';
      h.innerHTML = `${s.label}<span class="preview-badge ${s.badge}">${s.count} ${s.unit}</span>`;
      sec.appendChild(h);
      for (let i = 0; i < Math.min(s.count, 3); i++) {
        const line = document.createElement('div');
        line.className = 'preview-text-line ' + ['full','medium','short'][i % 3];
        sec.appendChild(line);
      }
      page.appendChild(sec);
    });

    _sealPreviewPage(page);
    return page;
  }

  function buildImageSectionPage(sec, pageNum, lhHdrSrc, lhFtrSrc) {
    const page = buildPreviewPage(sec.name, pageNum, lhHdrSrc, lhFtrSrc);
    const secDiv = document.createElement('div');
    secDiv.className = 'preview-section';

    const h = document.createElement('div');
    h.className = 'preview-section-heading';
    const badgeClass = sec.position === 'start' ? 'start' : 'end';
    const badgeLabel = sec.position === 'start' ? t('attachments_position_start') : t('attachments_position_end');
    const _nameSpan = document.createElement('span');
    _nameSpan.textContent = sec.name;
    const _badgeEl = document.createElement('span');
    _badgeEl.className = `preview-badge ${badgeClass}`;
    _badgeEl.textContent = badgeLabel;
    h.append(_nameSpan, _badgeEl);
    secDiv.appendChild(h);

    if ((sec.text_above || '').trim()) {
      const ta = document.createElement('div');
      ta.className = 'preview-text-block';
      ta.textContent = sec.text_above.trim();
      secDiv.appendChild(ta);
    }

    const count = sec.files.length;
    if (count === 0) {
      const ph = document.createElement('div');
      ph.className = 'preview-image-placeholder';
      ph.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> ${t('preview_no_images') || 'Nenhuma imagem adicionada'}`;
      secDiv.appendChild(ph);
    } else {
      for (let i = 0; i < count; i++) {
        const file = sec.files[i];
        const ph = document.createElement('div');
        ph.className = 'preview-image-placeholder';
        ph.style.height = '80px';
        ph.style.position = 'relative';
        ph.style.overflow = 'hidden';
        ph.style.padding = '0';

        // Show real thumbnail in preview
        const thumbImg = document.createElement('img');
        thumbImg.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
        const fr = new FileReader();
        fr.onload = e => { thumbImg.src = e.target.result; };
        fr.readAsDataURL(file);
        ph.appendChild(thumbImg);
        secDiv.appendChild(ph);
      }
    }

    if ((sec.text_below || '').trim()) {
      const tb = document.createElement('div');
      tb.className = 'preview-text-block';
      tb.textContent = sec.text_below.trim();
      secDiv.appendChild(tb);
    }

    page.appendChild(secDiv);
    _sealPreviewPage(page);
    return page;
  }


  // --- Auth System (login optional — app always accessible without login) ---
  const SESSION_KEY = 'oci-docgen-session';   // { token, username, user_id }
  const HISTORY_KEY = 'oci-docgen-history';

  let currentUser = null;
  let currentUserPermissions = null;
  let availableProfiles = [];
  let selectedProfileId = null;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getAuthHeaders() {
    const session = _loadSession();
    if (!session) return {};
    return { 'Authorization': `Bearer ${session.token}` };
  }

  function _loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch(e) { return null; }
  }

  function _saveSession(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    currentUser = data;
  }

  function _clearSession() {
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
  }

  // ── Auth modal open / close ──────────────────────────────────────────────────

  function openAuthModal(tab = 'login') {
    if (!authModal) return;
    authModal.classList.remove('hidden');
    switchAuthTab(tab);
    setTimeout(() => loginUsernameInput && loginUsernameInput.focus(), 80);
  }

  function closeAuthModal() {
    if (!authModal) return;
    authModal.classList.add('hidden');
    clearAuthErrors();
  }

  function clearAuthErrors() {
    if (loginError)    { loginError.classList.add('hidden');    loginError.textContent = ''; }
    if (registerError) { registerError.classList.add('hidden'); registerError.textContent = ''; }
  }

  function switchAuthTab(tab) {
    authTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    authFormLogin.classList.toggle('hidden', tab !== 'login');
    authFormRegister.classList.toggle('hidden', tab !== 'register');
  }

  // ── Sidebar state ────────────────────────────────────────────────────────────

  function updateSidebarAuthState() {
    const isAdmin = currentUser && currentUser.is_admin;
    if (currentUser) {
      sidebarGuest && sidebarGuest.classList.add('hidden');
      sidebarUser  && sidebarUser.classList.remove('hidden');
      if (sidebarUserName)   sidebarUserName.textContent   = currentUser.username;
      if (sidebarUserAvatar) sidebarUserAvatar.textContent = currentUser.username[0].toUpperCase();
      // Show admin badge on username
      if (sidebarUserName) {
        sidebarUserName.innerHTML = isAdmin
          ? `${currentUser.username} <span class="admin-badge">Admin</span>`
          : currentUser.username;
      }
    } else {
      sidebarGuest && sidebarGuest.classList.remove('hidden');
      sidebarUser  && sidebarUser.classList.add('hidden');
    }
    // Metrics and Admin nav: only visible to admins
    navMetrics && navMetrics.classList.toggle('hidden', !isAdmin);
    navAdmin   && navAdmin.classList.toggle('hidden', !isAdmin);
    // If non-admin is somehow on a restricted view, redirect to generator
    if (!isAdmin) {
      const onRestricted = viewMetrics && !viewMetrics.classList.contains('hidden');
      const onAdmin      = viewAdmin   && !viewAdmin.classList.contains('hidden');
      if (onRestricted || onAdmin) showView('generator');
    }
  }

  async function fetchAndApplyPermissions() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/my-permissions`, { headers: getAuthHeaders() });
      if (res.ok) {
        currentUserPermissions = await res.json();
      } else {
        currentUserPermissions = { allowed: ['new_host'], is_admin: false, is_anonymous: true };
      }
    } catch(e) {
      currentUserPermissions = { allowed: ['new_host'], is_admin: false, is_anonymous: true };
    }
    populateDocTypes();
    await loadProfileSelector();
  }

  async function loadProfileSelector() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/profiles`, { headers: getAuthHeaders() });
      if (!res.ok) { availableProfiles = []; }
      else availableProfiles = await res.json();
    } catch(e) { availableProfiles = []; }

    const step = document.getElementById('profile-step');
    const container = profileContainer;
    const generatorContent = document.getElementById('generator-steps-content');
    const noProfileBlock  = document.getElementById('no-profile-block');
    if (!step || !container) return;

    // ── No profiles at all ──────────────────────────────────────────────────────
    if (availableProfiles.length === 0) {
      selectedProfileId = null;
      step.style.display = 'none';
      if (generatorContent) generatorContent.style.display = 'none';
      if (noProfileBlock) {
        noProfileBlock.classList.remove('hidden');
        const isAdmin = currentUser?.is_admin;
        const msgEl = document.getElementById('no-profile-msg-text');
        const actionsEl = document.getElementById('no-profile-actions');
        if (msgEl) msgEl.textContent = isAdmin
          ? t('no_profile.admin_msg')
          : t('no_profile.user_msg');
        if (actionsEl) {
          if (isAdmin) {
            actionsEl.innerHTML = `<button class="button-primary" id="goto-create-profile" style="margin-top:4px">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              ${t('no_profile.create_btn')}
            </button>`;
            document.getElementById('goto-create-profile')?.addEventListener('click', () => {
              showView('admin');
              setTimeout(() => {
                document.querySelector('[data-tab-name="profiles"]')?.click();
                document.getElementById('admin-create-profile-btn')?.click();
              }, 150);
            });
          } else {
            actionsEl.innerHTML = `<p style="font-size:12px;color:var(--text-muted);margin:0">${t('no_profile.contact_admin')}</p>`;
          }
        }
      }
      return;
    }

    // ── Has profiles ─────────────────────────────────────────────────────────────
    if (noProfileBlock) noProfileBlock.classList.add('hidden');
    if (generatorContent) generatorContent.style.display = '';

    const savedId = parseInt(sessionStorage.getItem('selectedProfileId'), 10);
    const match = availableProfiles.find(p => p.id === savedId);
    selectedProfileId = match ? savedId : availableProfiles[0].id;

    const tenancyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="item-icon"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;

    // Always show the profile step — consistent with other wizard steps
    step.style.display = '';

    // Separate active from inactive so inactive ones appear at the bottom as locked items
    const activeProfiles   = availableProfiles.filter(p => p.is_active);
    const inactiveProfiles = availableProfiles.filter(p => !p.is_active);

    // Auto-select only among active profiles
    const savedId2 = parseInt(sessionStorage.getItem('selectedProfileId'), 10);
    const activeMatch = activeProfiles.find(p => p.id === savedId2);
    selectedProfileId = activeMatch ? savedId2 : (activeProfiles[0]?.id ?? null);

    const profileOptions = [
      ...activeProfiles.map(p => ({
        key: p.id, id: p.id,
        name: p.name, display_name: p.name,
      })),
      ...inactiveProfiles.map(p => ({
        key: p.id, id: p.id,
        name: p.name,
        display_name: `${p.name} — Inativo`,
        locked: true,
      })),
    ];

    // Add "create profile" action for admins at bottom of list
    if (currentUser?.is_admin) {
      profileOptions.push({ key: '__create__', id: '__create__', name: t('action_new_profile') || 'Novo Tenancy Profile', display_name: t('action_new_profile') || 'Novo Tenancy Profile', _isAction: true });
    }

    createCustomSelect(container, profileOptions, 'Selecione um profile…', (val) => {
      if (val === '__create__') {
        showView('admin');
        setTimeout(() => {
          document.querySelector('[data-tab-name="profiles"]')?.click();
          document.getElementById('admin-create-profile-btn')?.click();
        }, 150);
        return;
      }
      selectedProfileId = parseInt(val, 10) || null;
      sessionStorage.setItem('selectedProfileId', selectedProfileId);
      allRegionsData = [];
      selectedRegion = null;
      selectedDocType = null;
      selectedCompartmentId = null;
      selectedCompartmentName = null;
      selectedCompartments = {};

      // Check if the selected profile is active before enabling downstream steps
      const _chosenProfile = availableProfiles.find(p => p.id === selectedProfileId);
      const _profileIsActive = _chosenProfile && _chosenProfile.is_active;

      // Disable downstream steps immediately while we reset, then re-enable if active
      setDownstreamStepsState(false);

      if (!_profileIsActive) {
        // Profile is inactive — keep steps locked, clear state, do not fetch
        selectedProfileId = null;
        sessionStorage.removeItem('selectedProfileId');
        showToast('Tenancy Profile desativado. Selecione um profile ativo para continuar.', 'error');
        return;
      }

      // Profile is active — re-enable steps and fetch regions
      setDownstreamStepsState(true);
      fetchRegions();
    }, true, false);

    // Pre-select saved/first profile in display
    const firstProfile = availableProfiles.find(p => p.id === selectedProfileId);
    if (firstProfile) {
      const selectedDisplay = container.querySelector('.selected-item-display');
      if (selectedDisplay) {
        selectedDisplay.innerHTML = `${tenancyIconSvg}<span class="item-text">${firstProfile.name}</span>`;
      }
    }

    // Enable/disable downstream steps based on whether a valid active profile
    // is pre-selected on page load (selectedProfileId is null when all profiles
    // are inactive or none matched the saved session value).
    if (selectedProfileId) {
      setDownstreamStepsState(true);
      await fetchRegions();
    } else {
      setDownstreamStepsState(false);
    }
  }

  function updateProfileBadge() {
    const badge = document.getElementById('active-profile-badge');
    if (!badge) return;
    const p = availableProfiles.find(x => x.id === selectedProfileId);
    const step = document.getElementById('profile-step');
    // Only show badge when the step selector is hidden (single profile — no choice needed)
    const stepHidden = !step || step.style.display === 'none';
    if (p && stepHidden) {
      badge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg><span>${p.name}</span>`;
      badge.title = `Tenancy: ${p.tenancy_ocid || 'N/A'} · Região: ${p.region || 'N/A'}`;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // ── API calls ────────────────────────────────────────────────────────────────

  async function apiLogin(username, password) {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Erro ao fazer login.');
    return data;
  }

  async function apiRegister(username, password) {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Erro ao criar conta.');
    return data;
  }

  async function apiLogout() {
    const session = _loadSession();
    if (!session) return;
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.token}` },
      });
    } catch(e) { /* silent */ }
    // Hide megaphone on logout
    const annBtn = document.getElementById('ann-topbar-btn');
    if (annBtn) annBtn.classList.add('hidden');
    _activeAnns = [];
  }

  // ── Login submit ─────────────────────────────────────────────────────────────

  if (loginSubmitBtn) {
    loginSubmitBtn.addEventListener('click', async () => {
      const username = loginUsernameInput.value.trim();
      const password = loginPasswordInput.value;
      if (!username || !password) {
        loginError.textContent = t('auth.error.fill_fields');
        loginError.classList.remove('hidden');
        return;
      }
      loginSubmitBtn.disabled = true;
      loginSubmitBtn.textContent = t('auth.login.btn_loading');
      try {
        const data = await apiLogin(username, password);
        _saveSession(data);
        loginPasswordInput.value = '';
        closeAuthModal();
        updateSidebarAuthState();
        fetchAndApplyPermissions();
        renderSidebarHistory();
        showToast((t('toast.welcome') || 'Bem-vindo, {name}!').replace('{name}', data.username), 'success');
        // Load active announcements now that the user is authenticated
        _showAnnBtn();
        fetchActiveAnnouncements();
        // Force password change for first admin login
        if (data.force_password_change) {
          setTimeout(() => showForcePwModal(), 400);
        }
        // Refresh metrics if admin and that view is open
        if (data.is_admin && viewMetrics && !viewMetrics.classList.contains('hidden')) loadMetrics();
      } catch(err) {
        loginError.textContent = err.message;
        loginError.classList.remove('hidden');
      } finally {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="button-icon"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg> Entrar`;
      }
    });
    loginPasswordInput && loginPasswordInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') loginSubmitBtn.click();
    });
  }

  // ── Register submit ───────────────────────────────────────────────────────────

  if (registerSubmitBtn) {
    registerSubmitBtn.addEventListener('click', async () => {
      const username    = registerUsernameInput.value.trim();
      const password    = registerPasswordInput.value;
      const confirmPw   = document.getElementById('register-confirm-password')?.value || '';
      const firstName   = document.getElementById('register-first-name')?.value.trim() || '';
      const lastName    = document.getElementById('register-last-name')?.value.trim() || '';
      const email       = document.getElementById('register-email')?.value.trim() || '';

      if (!username || !password) {
        registerError.textContent = t('auth.error.fill_fields');
        registerError.classList.remove('hidden');
        return;
      }
      if (password !== confirmPw) {
        registerError.textContent = t('toast.passwords_mismatch') || 'As senhas não coincidem.';
        registerError.classList.remove('hidden');
        return;
      }
      registerSubmitBtn.disabled = true;
      registerSubmitBtn.textContent = t('auth.register.btn_loading');
      try {
        const data = await apiRegister(username, password);
        // Save optional profile fields if provided
        if (firstName || lastName || email) {
          try {
            await fetch(`${API_BASE_URL}/api/users/profile`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${data.token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ first_name: firstName, last_name: lastName, email }),
            });
          } catch (_) { /* non-critical */ }
        }
        _saveSession(data);
        registerPasswordInput.value = '';
        document.getElementById('register-confirm-password') && (document.getElementById('register-confirm-password').value = '');
        document.getElementById('register-first-name') && (document.getElementById('register-first-name').value = '');
        document.getElementById('register-last-name') && (document.getElementById('register-last-name').value = '');
        document.getElementById('register-email') && (document.getElementById('register-email').value = '');
        closeAuthModal();
        updateSidebarAuthState();
        fetchAndApplyPermissions();
        showToast((t('toast.account_created') || 'Conta criada! Bem-vindo, {name}!').replace('{name}', data.username), 'success');
      } catch(err) {
        registerError.textContent = err.message;
        registerError.classList.remove('hidden');
      } finally {
        registerSubmitBtn.disabled = false;
        registerSubmitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="button-icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg> Criar conta`;
      }
    });
    registerPasswordInput && registerPasswordInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') registerSubmitBtn.click();
    });
  }

  // ── Logout ───────────────────────────────────────────────────────────────────

  if (sidebarLogoutBtn) {
    sidebarLogoutBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await apiLogout();
      _clearSession();
      currentUserPermissions = null;
      updateSidebarAuthState();
      fetchAndApplyPermissions();
      renderSidebarHistory();
      showToast(t('toast.session_ended'), 'info');
      if (!viewMetrics.classList.contains('hidden')) loadMetrics();
    });
  }

  // ── Modal triggers ────────────────────────────────────────────────────────────

  if (sidebarLoginBtn)   sidebarLoginBtn.addEventListener('click', () => openAuthModal('login'));
  if (authModalCloseBtn) authModalCloseBtn.addEventListener('click', closeAuthModal);
  if (authModal) {
    authModal.querySelector('.auth-modal-backdrop')
      .addEventListener('click', closeAuthModal);
  }
  if (authTabs) {
    authTabs.forEach(tab => tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab)));
  }
  if (metricsLoginCta) {
    metricsLoginCta.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });
  }

  // ── Navigation (Generator ↔ Metrics) ─────────────────────────────────────────

  function showView(name) {
    const isAdmin = currentUser && currentUser.is_admin;
    // Guard restricted views
    if ((name === 'metrics' || name === 'admin') && !isAdmin) {
      name = 'generator';
    }
    viewGenerator.classList.toggle('hidden', name !== 'generator');
    viewMetrics  && viewMetrics.classList.toggle('hidden',   name !== 'metrics');
    viewAdmin    && viewAdmin.classList.toggle('hidden',     name !== 'admin');
    navGenerator && navGenerator.classList.toggle('active', name === 'generator');
    navMetrics   && navMetrics.classList.toggle('active',   name === 'metrics');
    navAdmin     && navAdmin.classList.toggle('active',     name === 'admin');
    if (name === 'metrics') loadMetrics();
    if (name === 'admin')   loadAdminUsers();
  }

  if (navGenerator) navGenerator.addEventListener('click', e => { e.preventDefault(); showView('generator'); });
  if (navMetrics)   navMetrics.addEventListener('click',   e => { e.preventDefault(); showView('metrics'); });
  if (navAdmin)     navAdmin.addEventListener('click',     e => { e.preventDefault(); showView('admin'); });

  // ── Metrics panel ─────────────────────────────────────────────────────────────

  const DOC_TYPE_LABELS = {
    full_infra:  { pt: 'Infra Completa', en: 'Full Infra' },
    new_host:    { pt: 'Novo Host',      en: 'New Host' },
    kubernetes:  { pt: 'Kubernetes',     en: 'Kubernetes' },
    waf_report:  { pt: 'Relatório WAF',  en: 'WAF Report' },
    database:    { pt: 'Database',       en: 'Database' },
  };

  function docTypeLabel(raw) {
    const map = DOC_TYPE_LABELS[raw];
    if (!map) return raw;
    return map[currentLanguage] || map.pt;
  }

  async function loadMetrics() {
    // Show skeleton
    document.getElementById('kpi-total').textContent  = '…';
    document.getElementById('kpi-month').textContent  = '…';
    document.getElementById('kpi-top-type').textContent = '…';
    document.getElementById('metrics-by-type').innerHTML  = '<div class="metrics-skeleton" style="height:60px"></div>';
    document.getElementById('metrics-recent').innerHTML   = '<div class="metrics-skeleton" style="height:120px"></div>';

    try {
      const res = await fetch(`${API_BASE_URL}/api/metrics`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Falha ao carregar métricas.');
      const data = await res.json();
      renderMetrics(data);
    } catch(e) {
      document.getElementById('kpi-total').textContent = '—';
      document.getElementById('kpi-month').textContent = '—';
      document.getElementById('kpi-top-type').textContent = '—';
      document.getElementById('metrics-by-type').innerHTML  = `<p class="no-data-message">${e.message}</p>`;
      document.getElementById('metrics-recent').innerHTML   = '';
    }
  }

  function renderMetrics(data) {
    // KPIs
    document.getElementById('kpi-total').textContent = data.total;
    document.getElementById('kpi-month').textContent = data.this_month;
    document.getElementById('kpi-top-type').textContent =
      data.by_type.length ? docTypeLabel(data.by_type[0].type) : '—';

    // Avg/day over the last 30 days (sum all type keys across those rows / 30)
    const last30 = (data.time_series || []).slice(-30);
    const sum30  = last30.reduce((acc, d) =>
      acc + ALL_TYPE_KEYS.reduce((s, k) => s + (d[k] || 0), 0), 0);
    const avgDay = last30.length ? (sum30 / last30.length).toFixed(1) : '0';
    const avgEl  = document.getElementById('kpi-avg-day');
    if (avgEl) avgEl.textContent = avgDay;

    if (metricsTitle) metricsTitle.textContent = t('metrics_global_title') || 'Métricas Globais';
    metricsGuestNotice && metricsGuestNotice.classList.add('hidden');

    // By-type bars — color-coded per type + show % of total alongside count
    const maxCount  = data.by_type.length ? data.by_type[0].count : 1;
    const totalDocs = data.by_type.reduce((s, i) => s + i.count, 0) || 1;
    const byTypeEl  = document.getElementById('metrics-by-type');
    if (!data.by_type.length) {
      byTypeEl.innerHTML = '<p class="no-data-message">Nenhum dado disponível.</p>';
    } else {
      byTypeEl.innerHTML = data.by_type.map(item => {
        const barPct   = Math.round((item.count / maxCount) * 100);
        const sharePct = Math.round((item.count / totalDocs) * 100);
        const color    = SERIES_CONFIG[item.type]?.color || 'var(--accent)';
        return `
          <div class="metrics-type-row">
            <div class="metrics-type-top">
              <span class="metrics-type-name">${docTypeLabel(item.type)}</span>
              <span class="metrics-type-count">
                ${item.count}
                <span class="metrics-type-share">${sharePct}%</span>
              </span>
            </div>
            <div class="metrics-type-bar-track">
              <div class="metrics-type-bar-fill" style="width:${barPct}%;background:${color}"></div>
            </div>
          </div>`;
      }).join('');
    }

    // Recent list — dot colored by doc type
    const recentEl = document.getElementById('metrics-recent');
    if (!data.recent.length) {
      recentEl.innerHTML = '<p class="no-data-message" style="padding:16px 20px">Nenhuma geração registrada.</p>';
    } else {
      recentEl.innerHTML = data.recent.map(item => {
        const d = new Date(item.generated_at);
        const dateStr = isNaN(d) ? item.generated_at : d.toLocaleDateString(
          currentLanguage === 'pt' ? 'pt-BR' : 'en-US',
          { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
        );
        const who      = item.username ? `<span style="opacity:.6">· ${item.username}</span>` : '';
        const dotColor = SERIES_CONFIG[item.doc_type]?.color || '#2f81f7';
        return `
          <div class="metrics-recent-row">
            <div class="metrics-recent-dot" style="background:${dotColor};box-shadow:0 0 0 3px ${dotColor}22"></div>
            <div class="metrics-recent-body">
              <div class="metrics-recent-name">${item.compartment}</div>
              <div class="metrics-recent-meta">${dateStr} · ${item.region} ${who}</div>
            </div>
            <span class="metrics-recent-badge" style="border-color:${dotColor}33;color:${dotColor}">${docTypeLabel(item.doc_type)}</span>
          </div>`;
      }).join('');
    }

    // Time-series chart
    _metricsRawData = data;
    renderChart(data.time_series || [], _chartPeriod, _chartTypeFilter);

    // Per-user breakdown
    const perUserSection = document.getElementById('metrics-per-user-section');
    const perUserEl      = document.getElementById('metrics-per-user');
    if (data.per_user && data.per_user.length) {
      perUserSection && perUserSection.classList.remove('hidden');
      const maxU = data.per_user[0].count;
      perUserEl.innerHTML = data.per_user.map(u => {
        const pct = Math.round((u.count / maxU) * 100);
        const uid = u.user_id || 0;
        return `
          <div class="metrics-type-row">
            <div class="metrics-type-top">
              <span class="metrics-type-name">${u.username}</span>
              <span class="metrics-type-count">${u.count}
                <button class="metrics-user-expand-btn" data-uid="${uid}" data-uname="${u.username}" title="Ver logs">▼ Logs</button>
              </span>
            </div>
            <div class="metrics-type-bar-track">
              <div class="metrics-type-bar-fill" style="width:${pct}%;background:var(--accent-green,#3fb950)"></div>
            </div>
            <div class="metrics-user-logs" id="user-logs-${uid}">
              <table class="metrics-log-table">
                <thead><tr><th>Tipo</th><th>Compartimento</th><th>Região</th><th>Data</th></tr></thead>
                <tbody id="user-logs-body-${uid}"></tbody>
              </table>
            </div>
          </div>`;
      }).join('');

      // Bind expand buttons
      perUserEl.querySelectorAll('.metrics-user-expand-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const uid = btn.dataset.uid;
          const logsContainer = document.getElementById(`user-logs-${uid}`);
          const logsBody = document.getElementById(`user-logs-body-${uid}`);
          if (!logsContainer) return;
          const isOpen = logsContainer.classList.toggle('open');
          btn.textContent = isOpen ? '▲ Logs' : '▼ Logs';
          if (isOpen && logsBody) await loadUserLogs(uid, logsBody);
        });
      });
    } else {
      perUserSection && perUserSection.classList.add('hidden');
    }

    // Generations table — init once; subsequent loads just refresh data
    if (!document.getElementById('gen-table-section')?._genInited) {
      const s = document.getElementById('gen-table-section');
      if (s) s._genInited = true;
      _initGenTable();
    } else {
      loadGenTable(1);
    }
  }

  // ── Spline chart state ────────────────────────────────────────────────────────
  let _metricsRawData   = null;
  let _chartPeriod      = 30;
  let _chartTypeFilter  = 'all';
  let _chartRenderType  = 'spline'; // 'spline' | 'bar' | 'pie'

  const SERIES_CONFIG = {
    all:        { label: () => t('metrics_filter_all') || 'Total',          color: '#2f81f7' },
    new_host:   { label: () => t('metrics_filter_new_host') || 'Novo Host',  color: '#3fb950' },
    full_infra: { label: () => t('metrics_filter_full_infra') || 'Infra Completa', color: '#f0883e' },
    kubernetes: { label: () => 'Kubernetes',                                color: '#bc8cff' },
    waf_report: { label: () => 'WAF Report',                                color: '#58a6ff' },
    database:   { label: () => 'Database',                                  color: '#26c6da' },
  };

  // Ordered list of all per-type series keys (excludes the synthetic 'all' key).
  const ALL_TYPE_KEYS = ['new_host', 'full_infra', 'kubernetes', 'waf_report', 'database'];

  function getSeriesLabel(key) {
    const cfg = SERIES_CONFIG[key];
    return cfg ? (typeof cfg.label === 'function' ? cfg.label() : cfg.label) : key;
  }

  function renderChart(allSeries, periodDays, typeFilter) {
    if (_chartRenderType === 'bar') renderBarChart(allSeries, periodDays, typeFilter);
    else if (_chartRenderType === 'pie') renderPieChart(allSeries, periodDays, typeFilter);
    else renderSplineChart(allSeries, periodDays, typeFilter);
  }

  function renderSplineChart(allSeries, periodDays, typeFilter) {
    const wrap = document.getElementById('metrics-timeseries-chart');
    const legendEl = document.getElementById('metrics-chart-legend');
    if (!wrap) return;

    // Slice to period
    let series = allSeries.slice(-periodDays);
    if (!series.length) { wrap.innerHTML = '<p class="no-data-message">Sem dados para o período</p>'; return; }

    // Pad sparse data: if fewer than 7 points, fill in missing days with zeros
    // so the chart renders lines instead of orphaned dots
    if (series.length < 7) {
      const daySet = new Set(series.map(d => d.day));
      const last = new Date(series[series.length - 1].day);
      const first = new Date(series[0].day);
      // Expand to at least 7 days of context centered on available data
      const filled = [];
      const startDate = new Date(first);
      startDate.setDate(startDate.getDate() - Math.max(0, Math.floor((7 - series.length) / 2)));
      for (let i = 0; i < Math.max(7, series.length + 2); i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        const existing = series.find(s => s.day === key);
        const blank = ALL_TYPE_KEYS.reduce((o, k) => { o[k] = 0; return o; }, { day: key });
        filled.push(existing || blank);
      }
      series = filled;
    }

    const W   = Math.max(wrap.clientWidth || 600, 400);
    const H   = 180;
    const pad = { top: 18, right: 20, bottom: 32, left: 36 };
    const cW  = W - pad.left - pad.right;
    const cH  = H - pad.top - pad.bottom;
    const n   = series.length;

    // Decide which series to draw — when 'all' show all types for comparison
    const activeSeries = typeFilter === 'all' ? ALL_TYPE_KEYS : [typeFilter];

    // Compute max value across active series
    const maxVal = Math.max(
      ...series.flatMap(d => activeSeries.map(k => d[k] || 0)),
      1
    );

    // X positions
    const xPos = (i) => pad.left + (i / Math.max(n - 1, 1)) * cW;
    const yPos = (v) => pad.top + cH - (v / maxVal) * cH;

    // Build smooth spline path using cubic bezier
    function buildSplinePath(values) {
      if (values.length < 2) return '';
      const pts = values.map((v, i) => [xPos(i), yPos(v)]);
      let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        const cpX = (x0 + x1) / 2;
        d += ` C ${cpX.toFixed(1)} ${y0.toFixed(1)}, ${cpX.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
      }
      return d;
    }

    function buildAreaPath(values) {
      const spline = buildSplinePath(values);
      if (!spline) return '';
      const lastX = xPos(values.length - 1).toFixed(1);
      const baseY = (pad.top + cH).toFixed(1);
      const firstX = xPos(0).toFixed(1);
      return `${spline} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
    }

    // Grid lines
    const gridCount = 4;
    const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
      const v = Math.round((maxVal / gridCount) * (gridCount - i));
      const y = yPos(v === maxVal ? maxVal : v);
      return `
        <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${pad.left + cW}" y2="${y.toFixed(1)}"
              stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3"/>
        <text x="${(pad.left - 5).toFixed(0)}" y="${(y + 4).toFixed(0)}"
              text-anchor="end" fill="var(--text-secondary)" font-size="9" font-family="monospace">${v}</text>`;
    });

    // X-axis labels
    const labelStep = Math.max(1, Math.floor(n / 8));
    const xLabels = series
      .map((d, i) => i % labelStep === 0 || i === n - 1
        ? `<text x="${xPos(i).toFixed(1)}" y="${(H - 6).toFixed(0)}" text-anchor="middle"
                fill="var(--text-secondary)" font-size="9">${d.day.slice(5)}</text>`
        : '')
      .filter(Boolean);

    // Dot highlights (last point)
    const dots = activeSeries.map(key => {
      const cfg = SERIES_CONFIG[key] || SERIES_CONFIG.all;
      const lastVal = series[n - 1]?.[key] || 0;
      return `<circle cx="${xPos(n - 1).toFixed(1)}" cy="${yPos(lastVal).toFixed(1)}" r="4"
                fill="${cfg.color}" stroke="var(--bg-card)" stroke-width="2"/>`;
    });

    // Build SVG paths
    const paths = activeSeries.map(key => {
      const cfg    = SERIES_CONFIG[key] || SERIES_CONFIG.all;
      const values = series.map(d => d[key] || 0);
      const areaPath   = buildAreaPath(values);
      const splinePath = buildSplinePath(values);
      return `
        <defs>
          <linearGradient id="grad-${key}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${cfg.color}" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="${cfg.color}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#grad-${key})" />
        <path d="${splinePath}" fill="none" stroke="${cfg.color}" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/>`;
    });

    // Tooltip overlay rects (invisible, for hover)
    const tooltipRects = series.map((d, i) => {
      const x    = xPos(i);
      const vals = activeSeries.map(k => `${getSeriesLabel(k)}: ${d[k] || 0}`).join(' | ');
      return `<rect x="${(x - cW / n / 2).toFixed(1)}" y="${pad.top}" width="${(cW / n).toFixed(1)}" height="${cH}"
                fill="transparent" data-day="${d.day}" data-vals="${vals}">
                <title>${d.day}: ${vals}</title>
              </rect>`;
    });

    wrap.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible">
      ${gridLines.join('')}
      ${paths.join('')}
      ${dots.join('')}
      ${xLabels.join('')}
      ${tooltipRects.join('')}
    </svg>`;

    // Legend
    if (legendEl) {
      legendEl.innerHTML = activeSeries.map(key => {
        const cfg = SERIES_CONFIG[key] || SERIES_CONFIG.all;
        const total = series.reduce((s, d) => s + (d[key] || 0), 0);
        return `<span class="chart-legend-item">
          <span class="chart-legend-dot" style="background:${cfg.color}"></span>
          ${getSeriesLabel(key)} <strong>${total}</strong>
        </span>`;
      }).join('');
    }
  }

  function bindChartFilters() {
    document.querySelectorAll('.metrics-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.metrics-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _chartPeriod = parseInt(btn.dataset.period);
        if (_metricsRawData) renderChart(_metricsRawData.time_series, _chartPeriod, _chartTypeFilter);
      });
    });
    document.querySelectorAll('.metrics-type-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.metrics-type-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _chartTypeFilter = btn.dataset.type;
        if (_metricsRawData) renderChart(_metricsRawData.time_series, _chartPeriod, _chartTypeFilter);
      });
    });
    document.querySelectorAll('.metrics-chart-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.metrics-chart-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _chartRenderType = btn.dataset.chartType;
        if (_metricsRawData) renderChart(_metricsRawData.time_series, _chartPeriod, _chartTypeFilter);
      });
    });
  }

  function renderBarChart(allSeries, periodDays, typeFilter) {
    const wrap = document.getElementById('metrics-timeseries-chart');
    const legendEl = document.getElementById('metrics-chart-legend');
    if (!wrap) return;
    const series = allSeries.slice(-periodDays);
    if (!series.length) { wrap.innerHTML = '<p class="no-data-message">Sem dados</p>'; return; }

    const activeSeries = typeFilter === 'all' ? ALL_TYPE_KEYS : [typeFilter];

    const W = Math.max(wrap.clientWidth || 600, 400);
    const H = 220;
    const pad = { top: 20, right: 20, bottom: 30, left: 36 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;
    const n = series.length;
    const barGroupW = cW / n;
    const barW = Math.max(2, (barGroupW - 2) / activeSeries.length);

    const maxVal = Math.max(...series.flatMap(d => activeSeries.map(k => d[k] || 0)), 1);
    const yPos = v => pad.top + cH - (v / maxVal) * cH;

    const bars = series.map((d, i) => {
      const groupX = pad.left + i * barGroupW;
      return activeSeries.map((key, si) => {
        const cfg = SERIES_CONFIG[key];
        const v = d[key] || 0;
        const x = groupX + si * barW + 1;
        const barH = Math.max(0, (v / maxVal) * cH);
        const y = pad.top + cH - barH;
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}"
          fill="${cfg.color}" rx="2" opacity="0.85">
          <title>${d.day}: ${getSeriesLabel(key)} = ${v}</title>
        </rect>`;
      }).join('');
    }).join('');

    const labelStep = Math.max(1, Math.floor(n / 8));
    const xLabels = series.map((d, i) => i % labelStep === 0 || i === n - 1
      ? `<text x="${(pad.left + i * barGroupW + barGroupW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="var(--text-secondary)" font-size="9">${d.day.slice(5)}</text>` : ''
    ).filter(Boolean);

    const gridCount = 4;
    const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
      const v = Math.round((maxVal / gridCount) * (gridCount - i));
      const y = yPos(v);
      return `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${pad.left + cW}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3"/>
        <text x="${(pad.left - 5).toFixed(0)}" y="${(y + 4).toFixed(0)}" text-anchor="end" fill="var(--text-secondary)" font-size="9" font-family="monospace">${v}</text>`;
    });

    wrap.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible">
      ${gridLines.join('')}${bars}${xLabels.join('')}
    </svg>`;

    if (legendEl) {
      legendEl.innerHTML = activeSeries.map(key => {
        const cfg = SERIES_CONFIG[key];
        const total = series.reduce((s, d) => s + (d[key] || 0), 0);
        return `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${cfg.color}"></span>${getSeriesLabel(key)} <strong>${total}</strong></span>`;
      }).join('');
    }
  }

  function renderPieChart(allSeries, periodDays, typeFilter) {
    const wrap = document.getElementById('metrics-timeseries-chart');
    const legendEl = document.getElementById('metrics-chart-legend');
    if (!wrap) return;
    const series = allSeries.slice(-periodDays);

    const keys = typeFilter === 'all' ? ALL_TYPE_KEYS : [typeFilter];

    const totals = keys.map(k => ({ key: k, val: series.reduce((s, d) => s + (d[k] || 0), 0) }));
    const grand = totals.reduce((s, t) => s + t.val, 0);

    if (!grand) { wrap.innerHTML = '<p class="no-data-message" style="padding:40px 20px;text-align:center">Sem dados</p>'; return; }

    const W = 340, H = 220, cx = 110, cy = 110, r = 90, ir = 52;
    const legendX = 220; // start of legend text, 20px gap after the donut edge (cx+r=200)
    let startAngle = -Math.PI / 2;

    // Helper: arc path that handles the degenerate 100%-slice case
    function makeArcPath(cx, cy, r, ir, sa, ea) {
      const span = ea - sa;
      // Full circle — SVG can't render a single arc from point to itself; split into two 180° arcs
      if (Math.abs(span - 2 * Math.PI) < 1e-6) {
        const mid = sa + Math.PI;
        const p1 = makeArcPath(cx, cy, r, ir, sa, mid);
        const p2 = makeArcPath(cx, cy, r, ir, mid, ea - 1e-6); // tiny gap avoids collapse
        return p1 + ' ' + p2;
      }
      const x1 = cx + r * Math.cos(sa);  const y1 = cy + r * Math.sin(sa);
      const x2 = cx + r * Math.cos(ea);  const y2 = cy + r * Math.sin(ea);
      const ix1 = cx + ir * Math.cos(sa); const iy1 = cy + ir * Math.sin(sa);
      const ix2 = cx + ir * Math.cos(ea); const iy2 = cy + ir * Math.sin(ea);
      const lg = span > Math.PI ? 1 : 0;
      return `M ${ix1.toFixed(2)} ${iy1.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${lg} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${ix2.toFixed(2)} ${iy2.toFixed(2)} A ${ir} ${ir} 0 ${lg} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} Z`;
    }

    const slices = totals.map(({ key, val }) => {
      if (!val) { return ''; }
      const pct = val / grand;
      const endAngle = startAngle + pct * 2 * Math.PI;
      const d = makeArcPath(cx, cy, r, ir, startAngle, endAngle);
      const cfg = SERIES_CONFIG[key];
      const slice = `<path d="${d}" fill="${cfg.color}" opacity="0.85"><title>${getSeriesLabel(key)}: ${val} (${(pct*100).toFixed(1)}%)</title></path>`;
      startAngle = endAngle;
      return slice;
    });

    const legendItems = totals.map(({ key, val }) => {
      const cfg = SERIES_CONFIG[key];
      return `<text x="${legendX}" y="${cy - 40 + totals.indexOf(totals.find(t=>t.key===key)) * 22}" fill="${cfg.color}" font-size="11" font-family="Inter, sans-serif">● ${getSeriesLabel(key)}: ${val}</text>`;
    });

    wrap.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible">
      ${slices.join('')}
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="var(--text-primary)" font-size="18" font-weight="700">${grand}</text>
      <text x="${cx}" y="${cy + 20}" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Total</text>
      ${legendItems.join('')}
    </svg>`;

    if (legendEl) legendEl.innerHTML = '';
  }

  bindChartFilters();

  // ══════════════════════════════════════════════════════════════════════════════
  // ALL-GENERATIONS TABLE
  // ══════════════════════════════════════════════════════════════════════════════

  // Complete OCI region code → { city, abbr } mapping.
  // "label" format shown in the UI: "São Paulo - GRU"
  const OCI_REGIONS = {
    // Brazil
    'sa-saopaulo-1':    { city: 'São Paulo',     abbr: 'GRU' },
    'sa-vinhedo-1':     { city: 'Vinhedo',        abbr: 'VCP' },
    // North America
    'us-ashburn-1':     { city: 'Ashburn',        abbr: 'IAD' },
    'us-phoenix-1':     { city: 'Phoenix',        abbr: 'PHX' },
    'us-chicago-1':     { city: 'Chicago',        abbr: 'ORD' },
    'us-sanjose-1':     { city: 'San Jose',       abbr: 'SJC' },
    'ca-toronto-1':     { city: 'Toronto',        abbr: 'YYZ' },
    'ca-montreal-1':    { city: 'Montreal',       abbr: 'YUL' },
    'mx-queretaro-1':   { city: 'Queretaro',      abbr: 'QRO' },
    'mx-monterrey-1':   { city: 'Monterrey',      abbr: 'MTY' },
    // Europe
    'eu-frankfurt-1':   { city: 'Frankfurt',      abbr: 'FRA' },
    'eu-amsterdam-1':   { city: 'Amsterdam',      abbr: 'AMS' },
    'eu-london-1':      { city: 'London',         abbr: 'LHR' },
    'uk-london-1':      { city: 'London',         abbr: 'LHR' },
    'eu-milan-1':       { city: 'Milan',          abbr: 'LIN' },
    'eu-stockholm-1':   { city: 'Stockholm',      abbr: 'ARN' },
    'eu-paris-1':       { city: 'Paris',          abbr: 'CDG' },
    'eu-madrid-1':      { city: 'Madrid',         abbr: 'MAD' },
    'eu-jovanovac-1':   { city: 'Jovanovac',      abbr: 'BEG' },
    'eu-marseille-1':   { city: 'Marseille',      abbr: 'MRS' },
    // Middle East & Africa
    'me-dubai-1':       { city: 'Dubai',          abbr: 'DXB' },
    'me-jeddah-1':      { city: 'Jeddah',         abbr: 'JED' },
    'me-abudhabi-1':    { city: 'Abu Dhabi',      abbr: 'AUH' },
    'il-jerusalem-1':   { city: 'Jerusalem',      abbr: 'MTZ' },
    'af-johannesburg-1':{ city: 'Johannesburg',   abbr: 'JNB' },
    // Asia Pacific
    'ap-tokyo-1':       { city: 'Tokyo',          abbr: 'NRT' },
    'ap-osaka-1':       { city: 'Osaka',          abbr: 'KIX' },
    'ap-sydney-1':      { city: 'Sydney',         abbr: 'SYD' },
    'ap-melbourne-1':   { city: 'Melbourne',      abbr: 'MEL' },
    'ap-mumbai-1':      { city: 'Mumbai',         abbr: 'BOM' },
    'ap-hyderabad-1':   { city: 'Hyderabad',      abbr: 'HYD' },
    'ap-singapore-1':   { city: 'Singapore',      abbr: 'SIN' },
    'ap-seoul-1':       { city: 'Seoul',          abbr: 'ICN' },
    'ap-chuncheon-1':   { city: 'Chuncheon',      abbr: 'YNY' },
  };

  /** Human-readable label for an OCI region code. Returns e.g. "São Paulo - GRU". */
  function regionLabel(code) {
    if (!code) return '—';
    const r = OCI_REGIONS[code];
    return r ? `${r.city} - ${r.abbr}` : code;
  }

  /** Short abbreviation only (for the table cell). */
  function regionAbbr(code) {
    if (!code) return '—';
    return OCI_REGIONS[code]?.abbr ?? code;
  }

  let _genPage      = 1;
  let _genFilters   = { search: '', doc_type: '', region: '', date_from: '', date_to: '' };
  let _genDebounce  = null;
  let _genLoading   = false;

  async function loadGenTable(page = 1) {
    if (_genLoading) return;
    _genLoading = true;
    _genPage = page;

    const tbody = document.getElementById('gen-table-body');
    const countEl = document.getElementById('gen-table-count');
    if (!tbody) { _genLoading = false; return; }

    // Skeleton while loading
    tbody.innerHTML = `<tr><td colspan="6" class="gen-table-empty">
      <div class="metrics-skeleton" style="height:60px;margin:8px 0"></div></td></tr>`;

    const params = new URLSearchParams({ page, per_page: 25 });
    if (_genFilters.search)    params.set('search',    _genFilters.search);
    if (_genFilters.doc_type)  params.set('doc_type',  _genFilters.doc_type);
    if (_genFilters.region)    params.set('region',    _genFilters.region);
    if (_genFilters.date_from) params.set('date_from', _genFilters.date_from);
    if (_genFilters.date_to)   params.set('date_to',   _genFilters.date_to);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/generations?${params}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Falha ao carregar gerações.');
      const data = await res.json();
      _renderGenTable(data);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="gen-table-empty gen-table-error">${e.message}</td></tr>`;
      if (countEl) countEl.textContent = '';
    } finally {
      _genLoading = false;
    }
  }

  function _renderGenTable(data) {
    const tbody   = document.getElementById('gen-table-body');
    const countEl = document.getElementById('gen-table-count');
    const pageInfo  = document.getElementById('gen-page-info');
    const prevBtn   = document.getElementById('gen-page-prev');
    const nextBtn   = document.getElementById('gen-page-next');
    if (!tbody) return;

    // Count label — "1–25 de 42" / "1–25 of 42"
    const from = data.total ? (data.page - 1) * data.per_page + 1 : 0;
    const to   = Math.min(data.page * data.per_page, data.total);
    if (countEl) countEl.textContent = data.total
      ? `${from}–${to} ${t('gen_count_of')} ${data.total}`
      : t('gen_no_results');

    // Pagination controls
    if (pageInfo) pageInfo.textContent = (t('gen_page_info') || 'Página {page} de {pages}')
      .replace('{page}', data.page).replace('{pages}', data.pages);
    if (prevBtn) prevBtn.disabled = data.page <= 1;
    if (nextBtn) nextBtn.disabled = data.page >= data.pages;

    // Empty state
    if (!data.items.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="gen-table-empty">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="28" height="28" style="opacity:.35">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span>${t('gen_empty_message')}</span>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = data.items.map(item => {
      const d        = new Date(item.generated_at);
      const dateStr  = isNaN(d) ? item.generated_at : d.toLocaleDateString(
        currentLanguage === 'pt' ? 'pt-BR' : 'en-US',
        { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      );
      const color    = SERIES_CONFIG[item.doc_type]?.color || '#2f81f7';
      const typeLabel = docTypeLabel(item.doc_type);
      const regionShort = regionAbbr(item.region);

      return `<tr class="gen-table-row">
        <td class="gen-col-id">${item.id}</td>
        <td class="gen-col-type">
          <span class="gen-type-badge" style="border-color:${color}33;color:${color};background:${color}12">
            ${typeLabel}
          </span>
        </td>
        <td class="gen-col-comp" title="${item.compartment || ''}">${item.compartment || '—'}</td>
        <td class="gen-col-region" title="${item.region || ''}">${regionShort}</td>
        <td class="gen-col-date">${dateStr}</td>
        <td class="gen-col-user">
          <span class="gen-user-chip">${item.username || 'anonimo'}</span>
        </td>
      </tr>`;
    }).join('');
  }

  async function _loadRegionSelect() {
    const sel = document.getElementById('gen-filter-region');
    if (!sel) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/generations/regions`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const codes = await res.json(); // ["sa-saopaulo-1", ...]

      // Update placeholder option text with current language, then add region options
      if (sel.options[0]) sel.options[0].textContent = t('gen_filter_all_regions');
      while (sel.options.length > 1) sel.remove(1);

      codes.forEach(code => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = regionLabel(code); // "São Paulo - GRU"
        sel.appendChild(opt);
      });
    } catch (_) { /* silent — select stays as placeholder */ }
  }

  function _initGenTable() {
    const section = document.getElementById('gen-table-section');
    if (!section) return;

    // Show section (admin-only — called from renderMetrics which is already admin-gated)
    section.classList.remove('hidden');

    // Populate the region select with distinct regions from the database
    _loadRegionSelect();

    // Filter event bindings (debounced for date inputs)
    const bindInput = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        clearTimeout(_genDebounce);
        _genFilters[key] = el.value.trim();
        _genDebounce = setTimeout(() => loadGenTable(1), 380);
      });
    };

    bindInput('gen-filter-search',    'search');
    bindInput('gen-filter-date-from', 'date_from');
    bindInput('gen-filter-date-to',   'date_to');

    // Region select — fires immediately (no debounce needed for a select)
    const regionEl = document.getElementById('gen-filter-region');
    if (regionEl) regionEl.addEventListener('change', () => {
      _genFilters.region = regionEl.value;
      loadGenTable(1);
    });

    const typeEl = document.getElementById('gen-filter-type');
    if (typeEl) typeEl.addEventListener('change', () => {
      _genFilters.doc_type = typeEl.value;
      loadGenTable(1);
    });

    document.getElementById('gen-filter-clear')?.addEventListener('click', () => {
      _genFilters = { search: '', doc_type: '', region: '', date_from: '', date_to: '' };
      ['gen-filter-search','gen-filter-date-from','gen-filter-date-to']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      const tEl = document.getElementById('gen-filter-type');
      if (tEl) tEl.value = '';
      const rEl = document.getElementById('gen-filter-region');
      if (rEl) rEl.value = '';
      loadGenTable(1);
    });

    document.getElementById('gen-page-prev')?.addEventListener('click', () => {
      if (_genPage > 1) loadGenTable(_genPage - 1);
    });
    document.getElementById('gen-page-next')?.addEventListener('click', () => {
      loadGenTable(_genPage + 1);
    });

    // Initial load
    loadGenTable(1);
  }

  // ── Sidebar brand click ───────────────────────────────────────────────────────
  const sidebarBrandLink = document.getElementById('sidebar-brand-link');
  if (sidebarBrandLink) sidebarBrandLink.addEventListener('click', () => showView('generator'));

  // ── History login CTA ─────────────────────────────────────────────────────────
  document.getElementById('history-login-cta')?.addEventListener('click', e => {
    e.preventDefault(); openAuthModal('login');
  });

  // ── Sidebar user row → profile modal ─────────────────────────────────────────
  sidebarProfileBtn?.addEventListener('click', openUserProfileModal);

  // ── Force password change modal ───────────────────────────────────────────────

  function showForcePwModal() {
    const modal = document.getElementById('force-pw-modal');
    if (modal) modal.classList.remove('hidden');
    // Clear fields
    ['force-pw-new', 'force-pw-confirm'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const errEl = document.getElementById('force-pw-error');
    if (errEl) errEl.style.display = 'none';
    _resetPwRules();
    document.getElementById('force-pw-new')?.focus();
  }

  function _checkPwRule(id, pass) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('rule-ok', pass);
  }

  function _resetPwRules() {
    ['rule-length','rule-upper','rule-lower','rule-number','rule-special']
      .forEach(id => document.getElementById(id)?.classList.remove('rule-ok'));
  }

  function _validatePwFrontend(pw) {
    _checkPwRule('rule-length',  pw.length >= 8);
    _checkPwRule('rule-upper',   /[A-Z]/.test(pw));
    _checkPwRule('rule-lower',   /[a-z]/.test(pw));
    _checkPwRule('rule-number',  /\d/.test(pw));
    _checkPwRule('rule-special', /[^A-Za-z0-9]/.test(pw));
    return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw)
        && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
  }

  document.getElementById('force-pw-new')?.addEventListener('input', e => {
    _validatePwFrontend(e.target.value);
  });

  document.getElementById('force-pw-submit-btn')?.addEventListener('click', async () => {
    const newPw  = (document.getElementById('force-pw-new')?.value || '');
    const conf   = (document.getElementById('force-pw-confirm')?.value || '');
    const errEl  = document.getElementById('force-pw-error');
    if (errEl) errEl.style.display = 'none';

    if (!_validatePwFrontend(newPw)) {
      if (errEl) { errEl.textContent = 'A senha não atende aos requisitos de complexidade.'; errEl.style.display = 'block'; }
      return;
    }
    if (newPw !== conf) {
      if (errEl) { errEl.textContent = 'As senhas não coincidem.'; errEl.style.display = 'block'; }
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPw, current_password: '', force: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao alterar senha.');
      document.getElementById('force-pw-modal')?.classList.add('hidden');
      showToast('Senha alterada com sucesso!', 'success');
    } catch(e) {
      if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
    }
  });

  // ── Profile Modal ─────────────────────────────────────────────────────────────

  async function openUserProfileModal() {
    if (!currentUser) { openAuthModal('login'); return; }
    const modal = document.getElementById('user-profile-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    // Load profile
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/profile`, { headers: getAuthHeaders() });
      const data = await res.json();
      document.getElementById('profile-username').value    = data.username || currentUser.username;
      document.getElementById('profile-first-name').value = data.first_name || '';
      document.getElementById('profile-last-name').value  = data.last_name  || '';
      document.getElementById('profile-email').value      = data.email      || '';
      document.getElementById('profile-phone').value      = data.phone      || '';
      document.getElementById('profile-notes').value      = data.notes      || '';
    } catch(e) { /* silent */ }
  }

  function closeUserProfileModal() {
    document.getElementById('user-profile-modal')?.classList.add('hidden');
    // Clear pw fields
    ['profile-current-pw','profile-new-pw','profile-confirm-pw'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  }

  document.getElementById('user-profile-modal-close')?.addEventListener('click', closeUserProfileModal);
  document.getElementById('user-profile-cancel-btn')?.addEventListener('click', closeUserProfileModal);
  document.getElementById('user-profile-modal-backdrop')?.addEventListener('click', closeUserProfileModal);

  document.getElementById('user-profile-save-btn')?.addEventListener('click', async () => {
    try {
      // Save profile info
      await fetch(`${API_BASE_URL}/api/users/profile`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: document.getElementById('profile-first-name')?.value || '',
          last_name:  document.getElementById('profile-last-name')?.value  || '',
          email:      document.getElementById('profile-email')?.value      || '',
          phone:      document.getElementById('profile-phone')?.value      || '',
          notes:      document.getElementById('profile-notes')?.value      || '',
        }),
      });
      // Optional password change
      const curPw  = document.getElementById('profile-current-pw')?.value || '';
      const newPw  = document.getElementById('profile-new-pw')?.value     || '';
      const confPw = document.getElementById('profile-confirm-pw')?.value || '';
      if (newPw) {
        if (newPw !== confPw) { showToast('As senhas não coincidem.', 'error'); return; }
        const pwRes = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password: curPw, new_password: newPw, force: false }),
        });
        const pwData = await pwRes.json();
        if (!pwRes.ok) { showToast(pwData.detail || 'Erro ao alterar senha.', 'error'); return; }
      }
      showToast('Perfil salvo!', 'success');
      closeUserProfileModal();
      // Update display name if first_name set
      const fn = document.getElementById('profile-first-name')?.value;
      if (fn && sidebarUserName) {
        const isAdmin = currentUser?.is_admin;
        sidebarUserName.innerHTML = isAdmin
          ? `${fn} <span class="admin-badge">Admin</span>`
          : fn;
      }
    } catch(e) {
      showToast('Erro ao salvar perfil.', 'error');
    }
  });

  // ── Feedback Modal ────────────────────────────────────────────────────────────

  let _feedbackCategory = 'sugestao';

  document.getElementById('feedback-fab')?.addEventListener('click', () => {
    document.getElementById('feedback-modal')?.classList.remove('hidden');
  });

  document.getElementById('feedback-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('feedback-modal')?.classList.add('hidden');
  });

  document.getElementById('feedback-modal-backdrop')?.addEventListener('click', () => {
    document.getElementById('feedback-modal')?.classList.add('hidden');
  });

  document.querySelectorAll('.feedback-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.feedback-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _feedbackCategory = btn.dataset.cat;
    });
  });

  const feedbackText = document.getElementById('feedback-text');
  const feedbackCount = document.getElementById('feedback-char-count');
  if (feedbackText && feedbackCount) {
    feedbackText.addEventListener('input', () => {
      feedbackCount.textContent = feedbackText.value.length;
    });
  }

  document.getElementById('feedback-submit-btn')?.addEventListener('click', async () => {
    const msg = feedbackText?.value?.trim() || '';
    if (msg.length < 3) { showToast('Por favor, escreva uma mensagem.', 'error'); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: _feedbackCategory, message: msg }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      document.getElementById('feedback-modal')?.classList.add('hidden');
      if (feedbackText) feedbackText.value = '';
      if (feedbackCount) feedbackCount.textContent = '0';
      showToast('Feedback enviado! Obrigado.', 'success');
    } catch(e) { showToast(e.message || 'Erro ao enviar feedback.', 'error'); }
  });

  // ── Admin Feedback panel ──────────────────────────────────────────────────────

  async function loadAdminFeedback() {
    const wrap = document.getElementById('admin-feedback-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<p class="no-data-message">${t('loading') || 'Loading…'}</p>`;
    try {
      const res = await fetch(`${API_BASE_URL}/api/feedback`, { headers: getAuthHeaders() });
      const items = await res.json();
      if (!items.length) { wrap.innerHTML = `<p class="no-data-message">${t('admin.no_feedback')}</p>`; return; }
      const catEmoji = { sugestao: '💡', bug: '🐛', melhoria: '✨', outro: '📝' };
      const statusColor = { open: '#f0883e', reviewed: '#3fb950', closed: '#6b7280' };
      wrap.innerHTML = `<table class="admin-table">
        <thead><tr><th>${t('admin.col.category')}</th><th>${t('admin.col.message')}</th><th>${t('admin.col.user')}</th><th>${t('admin.col.date')}</th><th>${t('admin.col.status')}</th><th>${t('admin.col.actions')}</th></tr></thead>
        <tbody>
          ${items.map(fb => `<tr>
            <td><span style="font-size:16px">${catEmoji[fb.category] || '📝'}</span> ${fb.category}</td>
            <td style="max-width:300px;white-space:pre-wrap">${fb.message}</td>
            <td class="admin-cell-muted">${fb.username}</td>
            <td class="admin-cell-muted">${new Date(fb.created_at).toLocaleDateString('pt-BR')}</td>
            <td><span style="color:${statusColor[fb.status] || '#aaa'};font-weight:600">${fb.status}</span></td>
            <td>
              <select class="fb-status-select" data-fbid="${fb.id}" style="font-size:11px;padding:3px 6px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-primary)">
                <option value="open" ${fb.status==='open'?'selected':''}>${t('admin.feedback.open')}</option>
                <option value="reviewed" ${fb.status==='reviewed'?'selected':''}>${t('admin.feedback.reviewed')}</option>
                <option value="closed" ${fb.status==='closed'?'selected':''}>${t('admin.feedback.closed')}</option>
              </select>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
      wrap.querySelectorAll('.fb-status-select').forEach(sel => {
        sel.addEventListener('change', async () => {
          await fetch(`${API_BASE_URL}/api/feedback/${sel.dataset.fbid}`, {
            method: 'PATCH',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: sel.value }),
          });
          showToast(t('admin.feedback.status_updated'), 'success');
        });
      });
    } catch(e) { wrap.innerHTML = `<p class="no-data-message">${e.message}</p>`; }
  }

  // ── Per-user expandable logs in metrics ───────────────────────────────────────

  async function loadUserLogs(userId, containerEl) {
    containerEl.innerHTML = `<tr><td colspan="4" style="padding:8px 12px;color:var(--text-muted)">${t('logs.loading')}</td></tr>`;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/logs`, { headers: getAuthHeaders() });
      const logs = await res.json();
      if (!logs.length) {
        containerEl.innerHTML = `<tr><td colspan="4" style="padding:8px 12px;color:var(--text-muted)">${t('logs.no_records')}</td></tr>`;
        return;
      }
      containerEl.innerHTML = logs.map(l => {
        const d = new Date(l.generated_at);
        const ds = isNaN(d) ? l.generated_at : d.toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        return `<tr>
          <td>${docTypeLabel(l.doc_type)}</td>
          <td>${l.compartment}</td>
          <td>${l.region}</td>
          <td>${ds}</td>
        </tr>`;
      }).join('');
    } catch(e) {
      containerEl.innerHTML = `<tr><td colspan="4" style="padding:8px 12px;color:var(--danger)">${e.message}</td></tr>`;
    }
  }

  // ── Document History (localStorage, sidebar) ──────────────────────────────────

  const _historyKey = () => currentUser ? `${HISTORY_KEY}_${currentUser.user_id}` : null;

  const addToHistory = (type, compartment, region) => {
    if (!currentUser) return; // only save for logged-in users
    const key = _historyKey();
    let history = [];
    try { history = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
    history.unshift({
      type: docTypeLabel(type),
      compartment: compartment || 'N/A',
      region: region || 'N/A',
      date: new Date().toLocaleDateString(currentLanguage === 'pt' ? 'pt-BR' : 'en-US'),
    });
    history = history.slice(0, 6);
    localStorage.setItem(key, JSON.stringify(history));
    renderSidebarHistory();
  };

  const renderSidebarHistory = () => {
    const historyEl = document.getElementById('sidebar-history');
    const guestEl   = document.getElementById('sidebar-history-guest');
    if (!historyEl) return;

    if (!currentUser) {
      // Show login notice, hide history
      if (guestEl) guestEl.classList.remove('hidden');
      historyEl.classList.add('hidden');
      return;
    }

    // Logged in — hide guest notice, show history
    if (guestEl) guestEl.classList.add('hidden');
    historyEl.classList.remove('hidden');

    const key = _historyKey();
    let history = [];
    try { history = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
    if (!history.length) {
      historyEl.innerHTML = '<p class="sidebar-empty">Nenhum documento gerado ainda.</p>';
      return;
    }
    historyEl.innerHTML = history.map(item => `
      <div class="sidebar-history-item">
        <div class="sidebar-history-dot"></div>
        <div class="sidebar-history-text">
          <div class="sidebar-history-name">${item.compartment}</div>
          <div class="sidebar-history-date">${item.date} · ${item.type}</div>
        </div>
      </div>`).join('');
  };

  // --- Admin Panel ---

  const DOC_TYPES_ALL = ['new_host', 'full_infra', 'kubernetes', 'waf_report', 'database'];

  async function loadAdminUsers() {
    const wrap = document.getElementById('admin-users-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<p class="no-data-message">${t('loading') || 'Loading…'}</p>`;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Falha ao carregar usuários.');
      const users = await res.json();
      renderAdminUsersTable(users);
    } catch(e) {
      wrap.innerHTML = `<p class="no-data-message">${e.message}</p>`;
    }
  }

  // ── Tenancy Profiles admin panel ─────────────────────────────────────────────

  let _editingProfileId = null;

  async function loadAdminProfiles() {
    const wrap = document.getElementById('admin-profiles-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<p class="no-data-message">${t('loading') || 'Loading…'}</p>`;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/profiles`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Erro ao carregar profiles.');
      const profiles = await res.json();
      if (!profiles.length) {
        wrap.innerHTML = `<p class="no-data-message">${t('admin.no_profiles')}</p>`;
        return;
      }
      const visConfig = {
        admin_only: { label: t('vis.admin_only'), cls: 'net-chip-purple', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
        all_users:  { label: t('vis.all_users'), cls: 'net-chip-teal',   icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
        by_group:   { label: t('vis.by_group'),  cls: 'net-chip-blue',   icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
        by_user:    { label: t('vis.by_user'),   cls: '',                 icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' },
      };
      wrap.innerHTML = `<table class="admin-table">
        <thead><tr>
          <th>${t('th.name')}</th><th>${t('th.method')}</th><th>${t('th.region')}</th><th>${t('th.tenancy') || 'Tenancy'}</th><th>${t('th.visibility')}</th><th>${t('th.public')}</th><th>${t('th.active')}</th><th></th>
        </tr></thead>
        <tbody>
        ${profiles.map(p => {
          const vc = visConfig[p.visibility] || visConfig.by_group;
          return `<tr>
            <td><strong>${p.name}</strong></td>
            <td><span class="net-chip net-chip-blue">${p.auth_method === 'INSTANCE_PRINCIPAL' ? 'Instance Principal' : 'API Key'}</span></td>
            <td class="admin-cell-muted">${p.region || '—'}</td>
            <td class="admin-cell-muted">${p.tenancy_name || '—'}</td>
            <td><span class="net-chip ${vc.cls}">${vc.icon}${vc.label}</span></td>
            <td>${p.is_public ? `<span class="net-chip net-chip-teal">${t('label.yes')}</span>` : `<span class="net-chip net-chip-empty">${t('label.no')}</span>`}</td>
            <td>${p.is_active ? `<span class="net-chip net-chip-teal">${t('label.active')}</span>` : `<span class="net-chip net-chip-empty">${t('label.inactive')}</span>`}</td>
            <td>
              <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
                <button class="admin-btn-icon admin-edit-profile" data-pid="${p.id}" title="${t('action.edit_profile')}">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="admin-btn-icon admin-toggle-profile" data-pid="${p.id}" data-active="${p.is_active ? '1' : '0'}" title="${p.is_active ? t('action.deactivate_profile') : t('action.activate_profile')}">
                  ${p.is_active
                    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
                    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
                  }
                </button>
                <button class="admin-btn-danger admin-delete-profile" data-pid="${p.id}" title="${t('action.delete_profile')}">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>`;

      applyTooltips(wrap);
      wrap.querySelectorAll('.admin-edit-profile').forEach(btn => {
        btn.addEventListener('click', () => openProfileModal(parseInt(btn.dataset.pid)));
      });
      wrap.querySelectorAll('.admin-toggle-profile').forEach(btn => {
        btn.addEventListener('click', async () => {
          const pid = parseInt(btn.dataset.pid);
          const active = btn.dataset.active === '1';
          await fetch(`${API_BASE_URL}/api/admin/profiles/${pid}`, {
            method: 'PATCH', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: !active }),
          });
          loadAdminProfiles();
        });
      });
      wrap.querySelectorAll('.admin-delete-profile').forEach(btn => {
        btn.addEventListener('click', async () => {
          const pid = parseInt(btn.dataset.pid);
          if (!confirm(t('confirm.delete_profile'))) return;
          await fetch(`${API_BASE_URL}/api/admin/profiles/${pid}`, { method: 'DELETE', headers: getAuthHeaders() });
          showToast(t('toast.profile_deleted'), 'success');
          loadAdminProfiles();
        });
      });
    } catch(e) {
      wrap.innerHTML = `<p class="no-data-message">${e.message}</p>`;
    }
  }

  function openProfileModal(profileId = null) {
    _editingProfileId = profileId;
    const modal = document.getElementById('profile-modal');
    const title = document.getElementById('profile-modal-title');
    if (!modal) return;

    // Reset form
    ['name','region','tenancy','user','fingerprint'].forEach(f => {
      const el = document.getElementById(`profile-field-${f}`);
      if (el) el.value = '';
    });
    const tenancyNameEl = document.getElementById('profile-field-tenancy-name');
    if (tenancyNameEl) tenancyNameEl.value = '';
    const keyEl = document.getElementById('profile-field-key');
    if (keyEl) keyEl.value = '';
    const pubEl = document.getElementById('profile-field-public');
    if (pubEl) pubEl.checked = false;
    const authEl = document.getElementById('profile-field-auth-method');
    if (authEl) { authEl.value = 'API_KEY'; toggleApiKeyFields('API_KEY'); }
    // Reset visibility — no pre-selection for new profiles
    _setVisibility(null);
    // Reset user assignments panel
    const uaWrap = document.getElementById('profile-user-assignments-wrap');
    if (uaWrap) uaWrap.innerHTML = '';

    if (profileId) {
      title.textContent = t('tenancy_modal.edit');
      // Store profile id for PEM preview button
      window._pemEditingProfileId = profileId;
      // Show edit PEM panel (key exists, not shown for security)
      window._pemShowMode?.('edit');
      fetch(`${API_BASE_URL}/api/admin/profiles`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(profiles => {
          const p = profiles.find(x => x.id === profileId);
          if (!p) return;
          document.getElementById('profile-field-name').value        = p.name || '';
          if (tenancyNameEl) tenancyNameEl.value = p.tenancy_name || '';
          document.getElementById('profile-field-region').value      = p.region || '';
          document.getElementById('profile-field-tenancy').value     = p.tenancy_ocid || '';
          document.getElementById('profile-field-user').value        = p.user_ocid || '';
          document.getElementById('profile-field-fingerprint').value = p.fingerprint || '';
          document.getElementById('profile-field-public').checked    = !!p.is_public;
          document.getElementById('profile-field-auth-method').value = p.auth_method || 'API_KEY';
          toggleApiKeyFields(p.auth_method || 'API_KEY');
          _setVisibility(p.visibility || 'by_group');
          // Toggle user assignments panel visibility
          const uaSection = document.getElementById('profile-user-assignments-section');
          const gaSection = document.getElementById('profile-group-assignments-section');
          if (uaSection) uaSection.style.display = p.visibility === 'by_user'  ? '' : 'none';
          if (gaSection) gaSection.style.display = p.visibility === 'by_group' ? '' : 'none';
          // Load assigned users
          if (p.visibility === 'by_user')  loadProfileUserAssignments(profileId);
          if (p.visibility === 'by_group') loadProfileGroupAssignments(profileId);
        });
    } else {
      title.textContent = t('tenancy_modal.new');
      window._pemEditingProfileId = null;
      const uaSection = document.getElementById('profile-user-assignments-section');
      const gaSection = document.getElementById('profile-group-assignments-section');
      if (uaSection) uaSection.style.display = 'none';
      if (gaSection) gaSection.style.display = 'none';
      // Show PEM mode chooser for new profiles
      window._pemShowMode?.('choose');
    }
    modal.classList.remove('hidden');
  }

  function toggleApiKeyFields(method) {
    const fields = document.getElementById('profile-apikey-fields');
    if (fields) fields.style.display = method === 'INSTANCE_PRINCIPAL' ? 'none' : 'flex';
  }

  const profileAuthMethodEl = document.getElementById('profile-field-auth-method');
  if (profileAuthMethodEl) {
    profileAuthMethodEl.addEventListener('change', e => toggleApiKeyFields(e.target.value));
  }

  // Visibility radio card helpers
  function _getVisibility() {
    const checked = document.querySelector('input[name="profile-visibility"]:checked');
    return checked ? checked.value : null;
  }
  function _setVisibility(val) {
    const radios = document.querySelectorAll('input[name="profile-visibility"]');
    radios.forEach(r => {
      r.checked = val ? r.value === val : false;
      r.closest('.profile-vis-card')?.classList.toggle('profile-vis-card--active', val ? r.value === val : false);
    });
    _toggleAnonCheckbox(val);
  }
  function _toggleAnonCheckbox(val) {
    // Anonymous access only makes sense for "all_users" — hide for other tiers
    const anonRow = document.getElementById('profile-anon-row');
    if (anonRow) anonRow.style.display = val === 'all_users' ? '' : 'none';
  }

  // Show/hide user/group assignment sections when visibility radio changes
  document.getElementById('profile-vis-grid')?.addEventListener('change', e => {
    if (e.target.name === 'profile-visibility') {
      const val = e.target.value;
      const uaSection = document.getElementById('profile-user-assignments-section');
      const gaSection = document.getElementById('profile-group-assignments-section');
      if (uaSection) uaSection.style.display = val === 'by_user'  ? '' : 'none';
      if (gaSection) gaSection.style.display = val === 'by_group' ? '' : 'none';
      // Always load — functions handle null profileId (new profile) gracefully
      if (val === 'by_user')  loadProfileUserAssignments(_editingProfileId);
      if (val === 'by_group') loadProfileGroupAssignments(_editingProfileId);
      _setVisibility(val);
    }
  });

  async function loadProfileUserAssignments(profileId) {
    const wrap = document.getElementById('profile-user-assignments-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<span style="color:var(--text-muted);font-size:12px">${t('loading') || 'Carregando…'}</span>`;
    try {
      const [usersRes, assignedRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/users`, { headers: getAuthHeaders() }),
        profileId
          ? fetch(`${API_BASE_URL}/api/admin/profiles/${profileId}/users`, { headers: getAuthHeaders() })
          : Promise.resolve({ ok: true, json: async () => [] }),
      ]);
      const allUsers    = usersRes.ok    ? await usersRes.json()    : [];
      const assignedRaw = assignedRes.ok ? await assignedRes.json() : [];
      const assignedIds = new Set(assignedRaw.map(u => u.id));
      wrap.innerHTML = allUsers.map(u => `
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:3px 0">
          <input type="checkbox" data-uid="${u.id}" ${assignedIds.has(u.id) ? 'checked' : ''}>
          ${u.username}${u.is_admin ? ' <span class="admin-badge" style="font-size:9px">Admin</span>' : ''}
        </label>`).join('') || `<span style="color:var(--text-muted);font-size:12px">${t('label.no_users') || 'Nenhum usuário cadastrado.'}</span>`;
    } catch(e) {
      wrap.innerHTML = `<span style="color:var(--danger);font-size:12px">${e.message}</span>`;
    }
  }

  async function loadProfileGroupAssignments(profileId) {
    const wrap = document.getElementById('profile-group-assignments-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<span style="color:var(--text-muted);font-size:12px">${t('loading') || 'Carregando…'}</span>`;
    try {
      const [groupsRes, assignedRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/groups`, { headers: getAuthHeaders() }),
        profileId
          ? fetch(`${API_BASE_URL}/api/admin/profiles/${profileId}/groups`, { headers: getAuthHeaders() })
          : Promise.resolve({ ok: true, json: async () => [] }),
      ]);
      const allGroups   = groupsRes.ok   ? await groupsRes.json()   : [];
      const assignedRaw = assignedRes.ok ? await assignedRes.json() : [];
      const assignedIds = new Set(assignedRaw.map(g => g.id));
      wrap.innerHTML = allGroups.map(g => `
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:3px 0">
          <input type="checkbox" data-gid="${g.id}" ${assignedIds.has(g.id) ? 'checked' : ''}>
          ${g.name}
        </label>`).join('') || `<span style="color:var(--text-muted);font-size:12px">${t('label.no_groups') || 'Nenhum grupo cadastrado.'}</span>`;
    } catch(e) {
      wrap.innerHTML = `<span style="color:var(--danger);font-size:12px">${e.message}</span>`;
    }
  }

  function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.classList.add('hidden');
    _editingProfileId = null;
  }

  document.getElementById('profile-modal-close')  ?.addEventListener('click', closeProfileModal);
  document.getElementById('profile-modal-cancel') ?.addEventListener('click', closeProfileModal);
  document.getElementById('profile-modal-backdrop')?.addEventListener('click', closeProfileModal);

  // Copy-to-clipboard for OCID/fingerprint fields
  document.getElementById('profile-modal')?.addEventListener('click', async e => {
    const copyBtn = e.target.closest('.profile-input-copy');
    if (!copyBtn) return;
    const targetId = copyBtn.dataset.target;
    if (targetId) {
      const el = document.getElementById(targetId);
      const val = el?.value?.trim();
      if (val) {
        try {
          await navigator.clipboard.writeText(val);
          const orig = copyBtn.innerHTML;
          copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
          copyBtn.style.color = 'var(--accent)';
          setTimeout(() => { copyBtn.innerHTML = orig; copyBtn.style.color = ''; }, 1500);
        } catch {}
      }
    }
  });

  // PEM paste handled by initPemUI() below

  // PEM file picker handled by initPemUI() below — old duplicate removed

  document.getElementById('admin-create-profile-btn')?.addEventListener('click', () => openProfileModal(null));

  // ── Validate connection helper (calls backend before save) ─────────────────
  async function _validateProfileConnection(body) {
    const validateBtn = document.getElementById('profile-modal-validate');
    const saveBtn     = document.getElementById('profile-modal-save');
    if (validateBtn) { validateBtn.disabled = true; validateBtn.textContent = t('toast.profile_validating'); }
    if (saveBtn)     saveBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/profiles/validate`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.ok) {
        showToast(
          t('toast.profile_validate_ok').replace('{count}', d.region_count),
          'success',
          t('toast.profile_validate_ok_title')
        );
        return true;
      } else {
        showToast(
          d.detail || t('toast.profile_validate_error'),
          'error',
          t('toast.profile_validate_error_title'),
          0  // no auto-dismiss on errors so user can read
        );
        return false;
      }
    } catch (e) {
      showToast(e.message || t('toast.network_error'), 'error', t('toast.profile_validate_error_title'), 0);
      return false;
    } finally {
      if (validateBtn) { validateBtn.disabled = false; validateBtn.textContent = t('action.test_connection'); }
      if (saveBtn)     saveBtn.disabled = false;
    }
  }

  // ── Validate button ───────────────────────────────────────────────────────
  document.getElementById('profile-modal-validate')?.addEventListener('click', async () => {
    const authMethod  = document.getElementById('profile-field-auth-method')?.value;
    const region      = document.getElementById('profile-field-region')?.value.trim();
    const tenancyOcid = document.getElementById('profile-field-tenancy')?.value.trim();
    const userOcid    = document.getElementById('profile-field-user')?.value.trim();
    const fingerprint = document.getElementById('profile-field-fingerprint')?.value.trim();
    // Use _pemGetKey() to read from whichever panel is active (text, file, or hidden)
    const privateKey  = window._pemGetKey ? window._pemGetKey() : (document.getElementById('profile-field-key')?.value.trim() || '');

    if (authMethod === 'API_KEY' && (!tenancyOcid || !userOcid || !fingerprint)) {
      showToast(t('toast.profile_validate_missing_fields'), 'warning');
      return;
    }
    // In edit mode the key may already be saved in DB — no inline key required
    if (authMethod === 'API_KEY' && !privateKey && !_editingProfileId) {
      showToast(t('toast.profile_validate_missing_pem'), 'warning');
      return;
    }
    const body = { auth_method: authMethod, region, tenancy_ocid: tenancyOcid,
                   user_ocid: userOcid, fingerprint };
    if (privateKey) body.private_key_pem = privateKey;
    // Pass profile_id so the backend can load the saved key when no inline key provided
    if (_editingProfileId && !privateKey) body.profile_id = _editingProfileId;
    await _validateProfileConnection(body);
  });

  // ── Save button ───────────────────────────────────────────────────────────
  document.getElementById('profile-modal-save')?.addEventListener('click', async () => {
    const name        = document.getElementById('profile-field-name')?.value.trim();
    const authMethod  = document.getElementById('profile-field-auth-method')?.value;
    const region      = document.getElementById('profile-field-region')?.value.trim();
    const tenancyOcid = document.getElementById('profile-field-tenancy')?.value.trim();
    const userOcid    = document.getElementById('profile-field-user')?.value.trim();
    const fingerprint = document.getElementById('profile-field-fingerprint')?.value.trim();
    // Use _pemGetKey() — reads from whichever PEM panel is currently active
    const privateKey  = window._pemGetKey ? window._pemGetKey() : (document.getElementById('profile-field-key')?.value.trim() || '');
    const isPublic    = document.getElementById('profile-field-public')?.checked;
    const tenancyName = document.getElementById('profile-field-tenancy-name')?.value.trim() || '';
    const visibility  = _getVisibility();

    if (!name) { showToast(t('validation.name_required'), 'error'); return; }

    const body = { name, auth_method: authMethod, region, is_public: isPublic, visibility,
                   tenancy_name: tenancyName,
                   tenancy_ocid: tenancyOcid, user_ocid: userOcid, fingerprint };
    if (privateKey) body.private_key_pem = privateKey;

    // Auto-validate before saving when API Key credentials are present
    if (authMethod === 'API_KEY' && tenancyOcid && userOcid && fingerprint &&
        (privateKey || _editingProfileId)) {
      const validateBody = { auth_method: authMethod, region, tenancy_ocid: tenancyOcid,
                             user_ocid: userOcid, fingerprint };
      if (privateKey) validateBody.private_key_pem = privateKey;
      // Pass profile_id when editing so backend uses saved key if no inline key
      if (_editingProfileId && !privateKey) validateBody.profile_id = _editingProfileId;
      const valid = await _validateProfileConnection(validateBody);
      if (!valid) {
        // Show warning but allow user to force-save
        showToast(t('toast.profile_validate_save_anyway'), 'warning');
        // Re-enable save for the user to decide
        return;
      }
    }

    const saveBtn = document.getElementById('profile-modal-save');
    if (saveBtn) saveBtn.disabled = true;
    try {
      let res, savedId;
      if (_editingProfileId) {
        res = await fetch(`${API_BASE_URL}/api/admin/profiles/${_editingProfileId}`, {
          method: 'PATCH', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        savedId = _editingProfileId;
      } else {
        res = await fetch(`${API_BASE_URL}/api/admin/profiles`, {
          method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) { const d = await res.json(); savedId = d.id; }
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.detail || t('toast.server_error'), 'error', t('toast.profile_save_error_title'), 0);
        return;
      }
      // Save user assignments if visibility = by_user
      if (visibility === 'by_user' && savedId) {
        const checkboxes = document.querySelectorAll('#profile-user-assignments-wrap input[type=checkbox]');
        const userIds = [...checkboxes].filter(c => c.checked).map(c => parseInt(c.dataset.uid));
        await fetch(`${API_BASE_URL}/api/admin/profiles/${savedId}/users`, {
          method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_ids: userIds }),
        });
      }
      // Save group assignments if visibility = by_group
      if (visibility === 'by_group' && savedId) {
        const checkboxes = document.querySelectorAll('#profile-group-assignments-wrap input[type=checkbox]');
        const groupIds = [...checkboxes].filter(c => c.checked).map(c => parseInt(c.dataset.gid));
        await fetch(`${API_BASE_URL}/api/admin/profiles/${savedId}/groups`, {
          method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ group_ids: groupIds }),
        });
      }
      showToast(_editingProfileId ? t('toast.profile_updated') : t('toast.profile_created'), 'success');
      closeProfileModal();
      loadAdminProfiles();
      // Reload the generator selector so newly created profiles appear immediately
      loadProfileSelector();
    } catch(e) {
      showToast(e.message || t('toast.network_error'), 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  async function loadAdminGroups() {
    const wrap = document.getElementById('admin-groups-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<p class="no-data-message">${t('loading') || 'Loading…'}</p>`;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/groups`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Falha ao carregar grupos.');
      const groups = await res.json();
      renderAdminGroupsTable(groups);
    } catch(e) {
      wrap.innerHTML = `<p class="no-data-message">${e.message}</p>`;
    }
  }

  // State for group management modal
  let _allGroupsCache = [];
  let _currentGroupModalUid = null;

  async function openGroupModal(uid, username) {
    _currentGroupModalUid = uid;
    const modal = document.getElementById('group-modal');
    const title = document.getElementById('group-modal-title');
    const body  = document.getElementById('group-modal-body');
    if (!modal) return;
    if (title) title.textContent = `Grupos — ${username}`;
    body.innerHTML = '<p class="no-data-message">Carregando…</p>';
    modal.classList.remove('hidden');

    try {
      // Load all groups and user list (to know user's current groups)
      const [gRes, uRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/groups`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/api/admin/users`,  { headers: getAuthHeaders() }),
      ]);
      const allGroups  = await gRes.json();
      const allUsers   = await uRes.json();
      _allGroupsCache  = allGroups;

      const user = allUsers.find(u => u.id === uid);
      const userGroupNames = (user?.groups || '').split(',').map(s => s.trim()).filter(Boolean);

      if (!allGroups.length) {
        body.innerHTML = '<p class="no-data-message">Nenhum grupo criado ainda. Crie grupos na aba Grupos.</p>';
        return;
      }

      body.innerHTML = `
        <p class="group-modal-hint">Marque os grupos nos quais este usuário deve participar.</p>
        <div class="group-modal-list">
          ${allGroups.map(g => {
            const isMember = userGroupNames.includes(g.name);
            const typesList = g.allowed_doc_types
              ? g.allowed_doc_types.split(',').map(t => `<span class="net-chip net-chip-blue" style="font-size:10px;padding:2px 6px">${docTypeLabel(t.trim())}</span>`).join('')
              : '<span style="color:var(--text-muted);font-size:11px">Sem restrições</span>';
            return `
              <label class="group-modal-item ${isMember ? 'group-modal-item-active' : ''}">
                <div class="group-modal-item-left">
                  <input type="checkbox" class="group-member-cb" data-gid="${g.id}" data-gname="${g.name}" ${isMember ? 'checked' : ''}>
                  <span class="group-modal-check-track"><span class="group-modal-check-thumb"></span></span>
                  <div class="group-modal-item-info">
                    <span class="group-modal-item-name">${g.name}</span>
                    <span class="group-modal-item-meta">${g.member_count || 0} membro(s)</span>
                  </div>
                </div>
                <div class="group-modal-item-types">${typesList}</div>
              </label>`;
          }).join('')}
        </div>
        <div class="group-modal-footer">
          <button class="button-primary" id="group-modal-save-btn">Salvar alterações</button>
        </div>`;

      // Save handler
      document.getElementById('group-modal-save-btn')?.addEventListener('click', async () => {
        const cbs = body.querySelectorAll('.group-member-cb');
        const toAdd    = [];
        const toRemove = [];
        cbs.forEach(cb => {
          const gid = parseInt(cb.dataset.gid);
          const wasIn = userGroupNames.includes(cb.dataset.gname);
          if (cb.checked && !wasIn) toAdd.push(gid);
          if (!cb.checked && wasIn) toRemove.push(gid);
        });
        try {
          await Promise.all([
            ...toAdd.map(gid => fetch(`${API_BASE_URL}/api/admin/groups/${gid}/users/${uid}`, { method: 'POST', headers: getAuthHeaders() })),
            ...toRemove.map(gid => fetch(`${API_BASE_URL}/api/admin/groups/${gid}/users/${uid}`, { method: 'DELETE', headers: getAuthHeaders() })),
          ]);
          showToast('Grupos atualizados.', 'success');
          modal.classList.add('hidden');
          loadAdminUsers();
        } catch(e) {
          showToast('Erro ao salvar grupos.', 'error');
        }
      });

      // Toggle active class on label when checkbox changes
      body.querySelectorAll('.group-member-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          cb.closest('.group-modal-item')?.classList.toggle('group-modal-item-active', cb.checked);
        });
      });

    } catch(e) {
      body.innerHTML = `<p class="no-data-message">${e.message}</p>`;
    }
  }

  // Close group modal
  document.getElementById('group-modal-close')?.addEventListener('click', () => {
    document.getElementById('group-modal')?.classList.add('hidden');
  });
  document.getElementById('group-modal-backdrop')?.addEventListener('click', () => {
    document.getElementById('group-modal')?.classList.add('hidden');
  });

  function renderAdminUsersTable(users) {
    const wrap = document.getElementById('admin-users-table-wrap');
    const searchVal = (document.getElementById('admin-user-search')?.value || '').toLowerCase();
    const filtered = searchVal ? users.filter(u => u.username.toLowerCase().includes(searchVal)) : users;

    if (!filtered.length) {
      wrap.innerHTML = `<p class="no-data-message">${t('admin.no_users')}</p>`;
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead><tr>
          <th>${t('admin.col.user')}</th>
          <th>${t('admin.col.role')}</th>
          <th>${t('admin.col.groups')}</th>
          <th>${t('admin.col.generations')}</th>
          <th>${t('admin.col.created_at')}</th>
          <th>${t('admin.col.actions')}</th>
        </tr></thead>
        <tbody>
          ${filtered.map(u => {
            const isAdmin  = u.is_admin === 1;
            const created  = new Date(u.created_at).toLocaleDateString('pt-BR');
            const groupNames = u.groups ? u.groups.split(',').map(g => g.trim()).filter(Boolean) : [];
            const groupChips = groupNames.length
              ? groupNames.map(g => `<span class="admin-group-chip">${g}</span>`).join('')
              : '<span class="admin-cell-muted">—</span>';
            return `<tr>
              <td>
                <div class="admin-user-cell">
                  <span class="admin-user-avatar">${u.username[0].toUpperCase()}</span>
                  <div class="admin-user-info">
                    <span class="admin-username">${u.username}</span>
                    ${isAdmin ? '<span class="admin-badge">Admin</span>' : ''}
                  </div>
                </div>
              </td>
              <td>
                <label class="admin-toggle-label" title="${u.username === 'admin' ? 'Permissões permanentes — não podem ser alteradas' : (isAdmin ? t('admin.role.revoke') : t('admin.role.promote'))}" style="${u.username === 'admin' ? 'opacity:0.4;cursor:not-allowed;pointer-events:none' : ''}">
                  <input type="checkbox" class="admin-role-toggle" data-uid="${u.id}" ${isAdmin ? 'checked' : ''} ${u.username === 'admin' ? 'disabled' : ''}>
                  <span class="admin-toggle-track"><span class="admin-toggle-thumb"></span></span>
                  <span class="admin-toggle-text">${isAdmin ? t('admin.role.admin') : t('admin.role.user')}</span>
                </label>
              </td>
              <td>
                <div class="admin-groups-cell">
                  ${groupChips}
                  <button class="admin-btn-icon admin-manage-groups" data-uid="${u.id}" data-uname="${u.username}" title="${t('action.manage_groups')}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                </div>
              </td>
              <td class="admin-cell-count">${u.doc_count || 0}</td>
              <td class="admin-cell-muted">${new Date(u.created_at).toLocaleDateString(currentLanguage === 'pt' ? 'pt-BR' : 'en-US')}</td>
              <td>
                <div style="display:flex;gap:6px;align-items:center">
                <button class="admin-btn-icon admin-edit-user" data-uid="${u.id}" data-uname="${u.username}" title="${t('action.edit_user') || 'Editar usuário'}">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                ${u.username === 'admin'
                  ? `<button class="admin-btn-icon admin-delete-user" data-uid="${u.id}" disabled title="Usuário admin não pode ser removido" style="opacity:0.3;cursor:not-allowed;pointer-events:none">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>`
                  : `<button class="admin-btn-danger admin-delete-user" data-uid="${u.id}" title="${t('action.delete_user')}">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>`
                }
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    applyTooltips(wrap);
    // Bind edit user buttons
    wrap.querySelectorAll('.admin-edit-user').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid  = parseInt(btn.dataset.uid);
        const udat = users.find(u => u.id === uid);
        openAdminUserModal(uid, udat);
      });
    });

    // Bind role toggles
    wrap.querySelectorAll('.admin-role-toggle').forEach(cb => {
      cb.addEventListener('change', async () => {
        const uid = parseInt(cb.dataset.uid);
        try {
          const r = await fetch(`${API_BASE_URL}/api/admin/users/${uid}/role`, {
            method: 'PATCH',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_admin: cb.checked }),
          });
          if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
          showToast(cb.checked ? t('admin.toast.promoted') : t('admin.toast.revoked'), 'success');
          loadAdminUsers();
        } catch(e) {
          showToast(e.message, 'error');
          cb.checked = !cb.checked;
        }
      });
    });

    // Bind group management buttons
    wrap.querySelectorAll('.admin-manage-groups').forEach(btn => {
      btn.addEventListener('click', () => openGroupModal(parseInt(btn.dataset.uid), btn.dataset.uname));
    });

    // Bind delete buttons
    wrap.querySelectorAll('.admin-delete-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = parseInt(btn.dataset.uid);
        if (!confirm(t('admin.confirm.delete_user'))) return;
        try {
          const r = await fetch(`${API_BASE_URL}/api/admin/users/${uid}`, { method: 'DELETE', headers: getAuthHeaders() });
          if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
          showToast(t('admin.toast.deleted_user'), 'success');
          loadAdminUsers();
        } catch(e) { showToast(e.message, 'error'); }
      });
    });
  }

  function renderAdminGroupsTable(groups) {
    const wrap = document.getElementById('admin-groups-table-wrap');
    if (!groups.length) {
      wrap.innerHTML = `<p class="no-data-message">${t('admin.no_groups')}</p>`;
      return;
    }
    wrap.innerHTML = `
      <table class="admin-table">
        <thead><tr>
          <th>${t('admin.col.name')}</th>
          <th>${t('admin.col.members')}</th>
          <th>${t('admin.col.doc_types')}</th>
          <th>${t('admin.col.actions')}</th>
        </tr></thead>
        <tbody>
          ${groups.map(g => {
            const types = g.allowed_doc_types ? g.allowed_doc_types.split(',').map(t => t.trim()) : [];
            const typeChecks = DOC_TYPES_ALL.map(dt => {
              const active = types.includes(dt);
              return `<label class="admin-perm-toggle ${active ? 'active' : ''}" title="${docTypeLabel(dt)}">
                <input type="checkbox" class="admin-perm-cb" data-gid="${g.id}" data-type="${dt}" ${active ? 'checked' : ''}>
                <span class="admin-perm-track"><span class="admin-perm-thumb"></span></span>
                <span class="admin-perm-label-text">${docTypeLabel(dt)}</span>
              </label>`;
            }).join('');
            return `<tr>
              <td><strong>${g.name}</strong></td>
              <td class="admin-cell-count">${g.member_count || 0}</td>
              <td><div class="admin-perm-row">${typeChecks}</div></td>
              <td>
                <button class="admin-btn-danger admin-delete-group" data-gid="${g.id}" title="${t('action.delete_group')}">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    applyTooltips(wrap);
    // Bind permission checkboxes
    wrap.querySelectorAll('.admin-perm-cb').forEach(cb => {
      cb.addEventListener('change', async () => {
        const label = cb.closest('.admin-perm-toggle');
        if (label) label.classList.toggle('active', cb.checked);
        const gid = parseInt(cb.dataset.gid);
        const allCbs = wrap.querySelectorAll(`.admin-perm-cb[data-gid="${gid}"]`);
        const doc_types = Array.from(allCbs).filter(c => c.checked).map(c => c.dataset.type);
        try {
          const res = await fetch(`${API_BASE_URL}/api/admin/groups/${gid}/permissions`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ doc_types }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${res.status}`);
          }
          showToast(t('admin.toast.permissions_saved'), 'success');
        } catch(e) {
          showToast(e.message || t('admin.toast.permissions_error'), 'error');
          // Revert toggle on failure
          if (label) label.classList.toggle('active', !cb.checked);
          cb.checked = !cb.checked;
        }
      });
    });

    // Bind delete group buttons
    wrap.querySelectorAll('.admin-delete-group').forEach(btn => {
      btn.addEventListener('click', async () => {
        const gid = parseInt(btn.dataset.gid);
        if (!confirm(t('admin.confirm.delete_group'))) return;
        try {
          const r = await fetch(`${API_BASE_URL}/api/admin/groups/${gid}`, {
            method: 'DELETE', headers: getAuthHeaders(),
          });
          if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
          showToast(t('admin.toast.deleted_group'), 'success');
          loadAdminGroups();
        } catch(e) { showToast(e.message, 'error'); }
      });
    });
  }

  // --- Admin Announcements Management ---

  // SVG icons for announcement type badges (no emoji)
  const _ANN_ICONS = {
    info:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><polyline points="11 12 12 12 12 16"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    error:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  };
  let _editingAnnId = null;

  async function loadAdminAnnouncements() {
    const wrap = document.getElementById('admin-announcements-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<p class="no-data-message">${t('loading') || 'Carregando…'}</p>`;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/announcements`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Erro ao carregar avisos.');
      const anns = await res.json();
      if (!anns.length) {
        wrap.innerHTML = `<p class="no-data-message">${t('ann.none') || 'Nenhum aviso criado ainda.'}</p>`;
        return;
      }
      wrap.innerHTML = `<table class="admin-table">
        <thead><tr>
          <th>${t('ann.type') || 'Tipo'}</th>
          <th>${t('ann.title') || 'Título'}</th>
          <th>${t('ann.message') || 'Mensagem'}</th>
          <th>${t('ann.expires_at') || 'Expira em'}</th>
          <th>${t('ann.status') || 'Status'}</th>
          <th style="text-align:right">${t('table.actions') || 'Ações'}</th>
        </tr></thead>
        <tbody>${anns.map(a => {
          const annIcon = _ANN_ICONS[a.type] || _ANN_ICONS.info;
          const expiry = a.expires_at
            ? new Date(a.expires_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
            : (t('ann.no_expiry') || '—');
          const now = new Date();
          const expired = a.expires_at && new Date(a.expires_at) < now;
          // Status chip label with leading SVG dot indicator
          const _iconDot = (col) => `<svg width="7" height="7" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="${col}"/></svg>`;
          const statusLabel = !a.is_active
            ? `${_iconDot('#94a3b8')} ${t('ann.inactive') || 'Inativo'}`
            : expired
            ? `${_iconDot('#f59e0b')} ${t('ann.expired')  || 'Expirado'}`
            : `${_iconDot('#22c55e')} ${t('ann.active')   || 'Ativo'}`;
          const statusCls   = !a.is_active ? 's-inactive' : expired ? 's-expired' : 's-active';
          return `<tr class="ann-row-${statusCls}">
            <td><span class="ann-type-badge ${a.type}">${annIcon} ${t('ann.type.' + a.type) || a.type}</span></td>
            <td style="font-weight:600">${a.title}</td>
            <td style="color:var(--text-muted);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.message || '—'}</td>
            <td style="font-size:12px;color:var(--text-muted)">${expiry}</td>
            <td><span class="admin-status-chip ${statusCls}">${statusLabel}</span></td>
            <td style="text-align:right;white-space:nowrap">
              <button class="admin-icon-btn" data-action="toggle-ann" data-id="${a.id}" data-active="${a.is_active}" title="${a.is_active ? (t('action.deactivate') || 'Desativar') : (t('action.activate') || 'Ativar')}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M10 15l5-3-5-3v6z"/></svg>
              </button>
              <button class="admin-icon-btn" data-action="edit-ann" data-id="${a.id}" title="${t('action.edit') || 'Editar'}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="admin-icon-btn admin-icon-btn--danger" data-action="delete-ann" data-id="${a.id}" title="${t('action.delete') || 'Excluir'}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
      applyTooltips(wrap);
    } catch(e) {
      wrap.innerHTML = `<p class="no-data-message">${e.message}</p>`;
    }
  }

  // Announcement table action delegation
  document.getElementById('admin-announcements-wrap')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id     = parseInt(btn.dataset.id);
    const action = btn.dataset.action;
    if (action === 'delete-ann') {
      if (!confirm(t('confirm.delete_announcement') || 'Excluir este aviso?')) return;
      const res = await fetch(`${API_BASE_URL}/api/admin/announcements/${id}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      });
      if (res.ok) {
        showToast(t('ann.toast.deleted') || 'Aviso excluído.', 'success');
        loadAdminAnnouncements();
        await fetchActiveAnnouncements();
      }
      else        { showToast(t('toast.server_error'), 'error'); }
    } else if (action === 'toggle-ann') {
      const isActive = btn.dataset.active === '1' || btn.dataset.active === 'true';
      const res = await fetch(`${API_BASE_URL}/api/admin/announcements/${id}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive ? 0 : 1 }),
      });
      if (res.ok) {
        showToast(isActive ? (t('ann.toast.deactivated') || 'Aviso desativado.') : (t('ann.toast.activated') || 'Aviso ativado.'), 'info');
        loadAdminAnnouncements();
        await fetchActiveAnnouncements();
      }
    } else if (action === 'edit-ann') {
      openAnnouncementModal(id);
    }
  });

  // Open/close announcement modal
  function openAnnouncementModal(annId = null) {
    _editingAnnId = annId;
    const modal = document.getElementById('announcement-modal');
    const titleEl = document.getElementById('announcement-modal-title');
    if (titleEl) titleEl.textContent = annId ? (t('ann.modal.edit') || 'Editar Aviso') : (t('action.new_announcement') || 'Novo Aviso');
    // Reset form
    document.getElementById('ann-field-title').value   = '';
    document.getElementById('ann-field-message').value = '';
    document.getElementById('ann-field-expires').value = '';
    document.querySelectorAll('[name="ann-type"]').forEach(r => r.checked = r.value === 'info');
    // If editing, load data
    if (annId) {
      fetch(`${API_BASE_URL}/api/admin/announcements`, { headers: getAuthHeaders() })
        .then(r => r.json()).then(anns => {
          const a = anns.find(x => x.id === annId);
          if (!a) return;
          document.getElementById('ann-field-title').value   = a.title;
          document.getElementById('ann-field-message').value = a.message || '';
          const expEl = document.getElementById('ann-field-expires');
          if (a.expires_at) expEl.value = a.expires_at.slice(0,16); // datetime-local format
          document.querySelectorAll('[name="ann-type"]').forEach(r => r.checked = r.value === a.type);
        });
    }
    modal?.classList.remove('hidden');
  }

  function closeAnnouncementModal() {
    document.getElementById('announcement-modal')?.classList.add('hidden');
    _editingAnnId = null;
  }

  document.getElementById('admin-create-announcement-btn')?.addEventListener('click', () => openAnnouncementModal(null));
  document.getElementById('announcement-modal-close')?.addEventListener('click',  closeAnnouncementModal);
  document.getElementById('announcement-modal-cancel')?.addEventListener('click', closeAnnouncementModal);
  document.getElementById('announcement-modal-backdrop')?.addEventListener('click', closeAnnouncementModal);

  document.getElementById('announcement-modal-save')?.addEventListener('click', async () => {
    const title   = document.getElementById('ann-field-title')?.value.trim();
    const message = document.getElementById('ann-field-message')?.value.trim();
    const type    = document.querySelector('[name="ann-type"]:checked')?.value || 'info';
    const expiresRaw = document.getElementById('ann-field-expires')?.value;
    // Convert datetime-local to ISO string if set
    const expires_at = expiresRaw ? new Date(expiresRaw).toISOString() : null;
    if (!title) { showToast(t('validation.name_required'), 'error'); return; }
    const body = { title, message, type, expires_at };
    const url    = _editingAnnId
      ? `${API_BASE_URL}/api/admin/announcements/${_editingAnnId}`
      : `${API_BASE_URL}/api/admin/announcements`;
    const method = _editingAnnId ? 'PATCH' : 'POST';
    try {
      const res = await fetch(url, {
        method, headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(d.detail || t('toast.server_error'), 'error'); return; }
      showToast(_editingAnnId ? (t('ann.toast.updated') || 'Aviso atualizado.') : (t('ann.toast.created') || 'Aviso criado.'), 'success');
      closeAnnouncementModal();
      loadAdminAnnouncements();
      // Re-fetch active announcements so admin sees them in their own bell
      await fetchActiveAnnouncements();
    } catch(e) {
      showToast(e.message, 'error');
    }
  });

  // ── Announcements Panel (separate from notification bell) ─────────────────

  let _activeAnns = []; // Active announcements from the backend

  const _ANN_TYPE_LABELS = { info: 'Informativo', warning: 'Manutenção', error: 'Urgente', success: 'Novidade' };

  function _renderAnnPanel() {
    const list = document.getElementById('ann-panel-list');
    if (!list) return;
    if (!_activeAnns.length) {
      list.innerHTML = `<div class="ann-panel-empty">${t('ann.panel.empty') || 'Nenhum aviso ativo'}</div>`;
      return;
    }
    list.innerHTML = _activeAnns.map(a => {
      const icon = _ANN_ICONS[a.type] || _ANN_ICONS.info;
      const typeLabel = t('ann.type.' + a.type) || _ANN_TYPE_LABELS[a.type] || a.type;
      const expiryStr = a.expires_at
        ? `<span class="ann-pi-expiry">Expira em ${new Date(a.expires_at).toLocaleDateString([], {day:'2-digit',month:'2-digit',year:'2-digit'})}</span>`
        : '';
      return `<div class="ann-panel-item ann-pi-${a.type}">
        <div class="ann-pi-icon">${icon}</div>
        <div class="ann-pi-body">
          <div class="ann-pi-title">${a.title}</div>
          ${a.message ? `<div class="ann-pi-msg">${a.message}</div>` : ''}
          <div class="ann-pi-meta">
            <span class="ann-pi-type-badge">${typeLabel}</span>
            ${expiryStr}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function _updateAnnBadge() {
    const btn   = document.getElementById('ann-topbar-btn');
    const badge = document.getElementById('ann-topbar-badge');
    if (!btn || !badge) return;
    const count = _activeAnns.length;
    // Show the megaphone whenever there are active announcements; hide when none
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
      btn.classList.remove('hidden');
      btn.classList.add('has-ann');
    } else {
      badge.classList.add('hidden');
      btn.classList.add('hidden');
      btn.classList.remove('has-ann');
    }
  }

  /**
   * Called after login and on init (when a session exists) to show the megaphone.
   * Reveals the button immediately, then populates once the fetch completes.
   */
  function _showAnnBtn() {
    const btn = document.getElementById('ann-topbar-btn');
    if (btn) btn.classList.remove('hidden');
  }

  async function fetchActiveAnnouncements() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/announcements`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      _activeAnns = await res.json();
      _updateAnnBadge();
      // Re-render if ann panel is open
      const panel = document.getElementById('ann-panel');
      if (panel && !panel.classList.contains('hidden')) _renderAnnPanel();
    } catch(_) {}
  }

  // Ann panel — open/close
  document.getElementById('ann-topbar-btn')?.addEventListener('click', () => {
    const panel    = document.getElementById('ann-panel');
    const backdrop = document.getElementById('ann-panel-backdrop');
    if (!panel) return;
    const isHidden = panel.classList.contains('hidden');
    // Close notif panel if open
    document.getElementById('notif-panel')?.classList.add('hidden');
    document.getElementById('notif-panel-backdrop')?.classList.add('hidden');
    panel.classList.toggle('hidden', !isHidden);
    backdrop?.classList.toggle('hidden', !isHidden);
    if (isHidden) _renderAnnPanel();
  });
  document.getElementById('ann-panel-close')?.addEventListener('click', () => {
    document.getElementById('ann-panel')?.classList.add('hidden');
    document.getElementById('ann-panel-backdrop')?.classList.add('hidden');
  });
  document.getElementById('ann-panel-backdrop')?.addEventListener('click', () => {
    document.getElementById('ann-panel')?.classList.add('hidden');
    document.getElementById('ann-panel-backdrop')?.classList.add('hidden');
  });

  // --- Admin tab switching ---
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      document.getElementById('admin-panel-users')         && document.getElementById('admin-panel-users').classList.toggle('hidden',         name !== 'users');
      document.getElementById('admin-panel-groups')        && document.getElementById('admin-panel-groups').classList.toggle('hidden',        name !== 'groups');
      document.getElementById('admin-panel-profiles')      && document.getElementById('admin-panel-profiles').classList.toggle('hidden',      name !== 'profiles');
      document.getElementById('admin-panel-notifications') && document.getElementById('admin-panel-notifications').classList.toggle('hidden', name !== 'notifications');
      document.getElementById('admin-panel-feedback')      && document.getElementById('admin-panel-feedback').classList.toggle('hidden',      name !== 'feedback');
      if (name === 'groups')        loadAdminGroups();
      if (name === 'profiles')      loadAdminProfiles();
      if (name === 'notifications') loadAdminAnnouncements();
      if (name === 'feedback')      loadAdminFeedback();
    });
  });

  const adminRefreshBtn = document.getElementById('admin-refresh-users');
  if (adminRefreshBtn) adminRefreshBtn.addEventListener('click', loadAdminUsers);

  const adminUserSearch = document.getElementById('admin-user-search');
  if (adminUserSearch) {
    adminUserSearch.addEventListener('input', async () => {
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, { headers: getAuthHeaders() });
      if (res.ok) renderAdminUsersTable(await res.json());
    });
  }

  const adminCreateGroupBtn = document.getElementById('admin-create-group-btn');
  if (adminCreateGroupBtn) {
    adminCreateGroupBtn.addEventListener('click', async () => {
      const input = document.getElementById('admin-new-group-name');
      const name  = (input?.value || '').trim();
      if (!name) return;
      try {
        const r = await fetch(`${API_BASE_URL}/api/admin/groups`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!r.ok) {
          const d = await r.json();
          showToast(d.detail || 'Erro ao criar grupo.', 'error');
          loadAdminGroups();
          return;
        }
        if (input) input.value = '';
        showToast(`Grupo "${name}" criado.`, 'success');
        loadAdminGroups();
      } catch(e) { showToast(e.message, 'error'); }
    });
  }

  // --- App Initialization ---
  const initializeApp = async () => {
    const savedLang = localStorage.getItem('oci-docgen-lang') || 'pt';
    const savedTheme = localStorage.getItem('oci-docgen-theme') || 'dark';

    // 1. Restore session first so currentUser is set before permission check
    const session = _loadSession();
    if (session) {
      try {
        const meRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${session.token}` }
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          currentUser = { ...session, is_admin: meData.is_admin };
          _saveSession(currentUser);
        } else {
          _clearSession();
        }
      } catch(e) {
        currentUser = session;
      }
    }

    // 2. Load language first so t() is ready before any UI rendering
    await setLanguage(savedLang);

    // Re-apply theme AFTER translations are loaded so the label renders correctly
    applyTheme(savedTheme);

    // 3. Fetch permissions (now translations are loaded, t() will work in loadProfileSelector)
    await fetchAndApplyPermissions();

    // 4. Load active announcements — show button immediately if logged in
    if (_loadSession()) _showAnnBtn();
    await fetchActiveAnnouncements();
    // Apply custom tooltips to static elements in the topbar
    applyTooltips(document.getElementById('app-topbar') || document);

    updateSidebarAuthState();
    renderSidebarHistory();
  };


  // Theme toggle
  const applyTheme = (theme) => {
    const iconDark  = document.getElementById('theme-icon-dark');
    const iconLight = document.getElementById('theme-icon-light');
    const themeBtnLabel = document.getElementById('theme-btn-label');
    if (theme === 'light') {
      document.body.classList.add('light-mode');
      if (iconDark)  iconDark.style.display  = 'none';
      if (iconLight) iconLight.style.display = '';
      if (themeBtnLabel) themeBtnLabel.textContent = t('theme_dark') || 'Modo Escuro';
    } else {
      document.body.classList.remove('light-mode');
      if (iconDark)  iconDark.style.display  = '';
      if (iconLight) iconLight.style.display = 'none';
      if (themeBtnLabel) themeBtnLabel.textContent = t('theme_light') || 'Modo Claro';
    }
  };

  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isLight = document.body.classList.contains('light-mode');
      const next = isLight ? 'dark' : 'light';
      localStorage.setItem('oci-docgen-theme', next);
      applyTheme(next);
    });
  }

  // --- Event Listener Registrations ---
  fetchBtn.addEventListener('click', fetchAllDetails);
  generateBtn.addEventListener('click', generateDocument);
  newDocBtn.addEventListener('click', resetApp);
  document.addEventListener('click', closeAllSelects);
  summaryContainer.addEventListener('click', (event) => {
    const header = event.target.closest('.instance-card-header, .vcn-card-header, .ipsec-card-header, .oke-card-header, .cert-card-header');
    if (header) {
      const card = header.closest('.collapsible');
      if (card) {
        card.classList.toggle('expanded');
      }
    }
  });
  addImageSectionBtn.addEventListener('click', () => addImageSection());
  docPreviewBtn.addEventListener('click', openDocPreview);
  initLetterheadManager();
  previewModalClose.addEventListener('click', closeDocPreview);
  previewOverlay.addEventListener('click', (e) => { if (e.target === previewOverlay) closeDocPreview(); });
  lightboxClose.addEventListener('click', closeLightbox);
  lightboxOverlay.addEventListener('click', (e) => { if (e.target === lightboxOverlay) closeLightbox(); });
  if (languageSelector) languageSelector.addEventListener('change', (e) => setLanguage(e.target.value));
  // Flag language buttons
  document.querySelectorAll('.lang-flag-btn').forEach(btn => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });

  // --- PEM Key UI — create vs edit state machine ---
  (function initPemUI() {
    const choosePnl  = document.getElementById('pem-choose-panel');
    const filePnl    = document.getElementById('pem-file-panel');
    const textPnl    = document.getElementById('pem-text-panel');
    const editPnl    = document.getElementById('pem-edit-panel');
    const hiddenKey  = document.getElementById('profile-field-key');
    const textInput  = document.getElementById('pem-text-input');
    const fileInput  = document.getElementById('profile-pem-file-input');

    function showPanel(name) {
      [choosePnl, filePnl, textPnl, editPnl].forEach(p => { if(p) p.style.display = 'none'; });
      const map = { choose: choosePnl, file: filePnl, text: textPnl, edit: editPnl };
      if (map[name]) map[name].style.display = '';
    }

    // Expose so openProfileModal can call it
    window._pemShowMode = showPanel;
    window._pemGetKey = () => {
      if (textInput && textPnl && textPnl.style.display !== 'none') return textInput.value.trim();
      if (hiddenKey) return hiddenKey.value.trim();
      return '';
    };
    window._pemReset = () => {
      if (hiddenKey) hiddenKey.value = '';
      if (textInput) textInput.value = '';
      if (fileInput) fileInput.value = '';
      showPanel('choose');
    };

    // File button → trigger file picker
    document.getElementById('pem-btn-file')?.addEventListener('click', () => fileInput?.click());

    // Text button → show text panel
    document.getElementById('pem-btn-text')?.addEventListener('click', () => showPanel('text'));

    // Back button in text panel
    document.getElementById('pem-text-back')?.addEventListener('click', () => {
      if (textInput) textInput.value = '';
      if (hiddenKey) hiddenKey.value = '';
      showPanel('choose');
    });

    // File selected
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        if (hiddenKey) hiddenKey.value = e.target.result.trim();
        const nameEl = document.getElementById('pem-file-name-label');
        const metaEl = document.getElementById('pem-file-meta-label');
        if (nameEl) nameEl.textContent = file.name;
        if (metaEl) metaEl.textContent = `${(file.size / 1024).toFixed(1)} KB — carregada`;
        showToast(t('pem_loaded') || 'Chave PEM carregada.', 'success');
        showPanel('file');
      };
      reader.readAsText(file);
      fileInput.value = '';
    });

    // Clear file
    document.getElementById('pem-file-clear')?.addEventListener('click', () => {
      if (hiddenKey) hiddenKey.value = '';
      showPanel('choose');
    });

    // Clipboard paste in text panel
    document.getElementById('profile-pem-paste-btn')?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (textInput) { textInput.value = text; textInput.focus(); }
      } catch { showToast(t('clipboard_error') || 'Não foi possível acessar a área de transferência.', 'error'); }
    });

    // Edit mode → delete button (replaces key, goes to choose)
    document.getElementById('pem-edit-delete')?.addEventListener('click', () => {
      if (hiddenKey) hiddenKey.value = '__DELETE__'; // sentinel to clear on backend
      showPanel('choose');
      showToast('Chave removida. Salve para confirmar.', 'success');
    });

    // Edit mode → preview button (fetch and show key in modal)
    document.getElementById('pem-edit-preview')?.addEventListener('click', async () => {
      const modal  = document.getElementById('pem-preview-modal');
      const area   = document.getElementById('pem-preview-content');
      if (!modal || !area) return;
      // Try to fetch the key from current editing profile
      if (window._pemEditingProfileId) {
        area.value = 'Carregando…';
        modal.style.display = 'flex';
        try {
          const r = await fetch(`${API_BASE_URL}/api/admin/profiles/${window._pemEditingProfileId}/key`, { headers: getAuthHeaders() });
          if (r.ok) {
            const d = await r.json();
            area.value = d.private_key_pem || '— Chave não disponível —';
          } else {
            area.value = '— Não foi possível carregar a chave —';
          }
        } catch { area.value = '— Erro ao carregar —'; }
      } else {
        area.value = '— Nenhuma chave carregada —';
        modal.style.display = 'flex';
      }
    });

    // PEM preview modal close buttons
    const _closePemPreview = () => {
      const m = document.getElementById('pem-preview-modal');
      if (m) m.style.display = 'none';
    };
    document.getElementById('pem-preview-close')?.addEventListener('click', _closePemPreview);
    document.getElementById('pem-preview-close-btn')?.addEventListener('click', _closePemPreview);
    document.getElementById('pem-preview-backdrop')?.addEventListener('click', _closePemPreview);
    document.getElementById('pem-preview-copy')?.addEventListener('click', async () => {
      const area = document.getElementById('pem-preview-content');
      if (!area?.value) return;
      try {
        await navigator.clipboard.writeText(area.value);
        const btn = document.getElementById('pem-preview-copy');
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = '✓ Copiado';
          btn.style.color = 'var(--s-running)';
          btn.style.borderColor = 'var(--s-running)';
          setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; btn.style.borderColor = ''; }, 1500);
        }
      } catch { showToast('Não foi possível copiar.', 'error'); }
    });
  })();

  // openProfileModal updated directly — no override needed

  // Patch save button to include tenancy_name and new PEM key source
  document.getElementById('profile-modal-save')?.addEventListener('click', function patchedSave() {}, { capture: true });
  // Override via new listener that fires first; existing one still fires but we prevent bad key reads
  // We just patch _pemGetKey into the save handler by monkey-patching getElementById for profile-field-key
  const _origSaveListener = document.getElementById('profile-modal-save')?._patchedSave;

  // Simpler: listen on the save button at capture phase, update hidden field before save runs
  document.getElementById('profile-modal-save')?.addEventListener('click', () => {
    // sync text panel into hidden field
    const textPnl  = document.getElementById('pem-text-panel');
    const textInput = document.getElementById('pem-text-input');
    const hiddenKey = document.getElementById('profile-field-key');
    if (textPnl && textPnl.style.display !== 'none' && textInput && hiddenKey) {
      hiddenKey.value = textInput.value.trim();
    }
    // include tenancy_name in body — handled by patching the PATCH/POST payload
    // (We'll store it on the modal element for the original handler to read)
    const tnVal = document.getElementById('profile-field-tenancy-name')?.value.trim() || '';
    document.getElementById('profile-modal')?.setAttribute('data-tenancy-name', tnVal);
  }, true /* capture */);

  // --- Validation helper — highlight missing required step selectors ---
  function highlightMissingField(containerId, labelText) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.classList.add('field-error');
    let hint = el.querySelector('.field-error-label');
    if (!hint) {
      hint = document.createElement('span');
      hint.className = 'field-error-label';
      el.appendChild(hint);
    }
    hint.textContent = labelText ? `${labelText} é obrigatório` : 'Campo obrigatório';
    setTimeout(() => {
      el.classList.remove('field-error');
      if (hint.parentNode) hint.remove();
    }, 3500);
  }

  function clearFieldError(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.classList.remove('field-error');
    el.querySelector('.field-error-label')?.remove();
  }

  // Wrap fetchAllDetails to add validation with visual highlights
  const _origFetchAllDetails = fetchAllDetails;
  window.fetchAllDetailsWrapped = async function() {
    let hasError = false;

    // Guard: profile must be selected and active before allowing collection
    if (!selectedProfileId) {
      highlightMissingField('profile-step', 'Tenancy Profile');
      hasError = true;
    } else {
      const chosenProfile = availableProfiles.find(p => p.id === selectedProfileId);
      if (chosenProfile && !chosenProfile.is_active) {
        highlightMissingField('profile-step', 'Tenancy Profile');
        showToast('Tenancy Profile desativado. Selecione um profile ativo para continuar.', 'error');
        return;
      }
    }

    if (!selectedRegion) {
      highlightMissingField('region-step', t('step1_label') || 'Região');
      hasError = true;
    }
    if (!selectedDocType) {
      highlightMissingField('doc-type-step', t('step2_label') || 'Tipo de Documentação');
      hasError = true;
    }
    if (Object.keys(selectedCompartments).length === 0) {
      highlightMissingField('compartment-step', t('step3_label') || 'Compartimento');
      hasError = true;
    }
    if (hasError) {
      const missing = [];
      if (!selectedProfileId) missing.push('Tenancy Profile');
      if (!selectedRegion) missing.push(t('step1_label') || 'Região');
      if (!selectedDocType) missing.push(t('step2_label') || 'Tipo');
      if (Object.keys(selectedCompartments).length === 0) missing.push(t('step3_label') || 'Compartimento');
      showToast(`${t('toast.required_fields') || 'Campos obrigatórios'}: ${missing.join(', ')}`, 'error');
      return;
    }
    return _origFetchAllDetails();
  };

  // Re-bind fetch button to wrapped version
  fetchBtn?.removeEventListener('click', fetchAllDetails);
  fetchBtn?.addEventListener('click', window.fetchAllDetailsWrapped);

  // Clear errors when fields are selected
  ['region-step','doc-type-step','compartment-step'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => clearFieldError(id), true);
  });

  // --- Admin User Modal — create & edit ---
  let _editingUserId = null;

  function openAdminUserModal(userId = null, userData = null) {
    _editingUserId = userId;
    const modal = document.getElementById('admin-user-modal');
    const title = document.getElementById('admin-user-modal-title');
    if (!modal) return;

    // Reset
    ['aum-first-name','aum-last-name','aum-username','aum-email','aum-phone','aum-notes','aum-password','aum-confirm-pw','aum-current-pw'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const currentPwRow = document.getElementById('aum-current-pw-row');
    const userNameField = document.getElementById('aum-username');
    const pwLabel = document.getElementById('aum-pw-label');

    if (userId && userData) {
      // Edit mode
      if (title) title.textContent = t('admin.modal.edit_user') || 'Editar Usuário';
      if (userNameField) { userNameField.value = userData.username || ''; userNameField.readOnly = true; userNameField.style.opacity = '0.6'; }
      // load profile info
      fetch(`${API_BASE_URL}/api/admin/users/${userId}/profile`, { headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : {})
        .then(p => {
          document.getElementById('aum-first-name').value = p.first_name || '';
          document.getElementById('aum-last-name').value  = p.last_name  || '';
          document.getElementById('aum-email').value      = p.email      || '';
          document.getElementById('aum-phone').value      = p.phone      || '';
          document.getElementById('aum-notes').value      = p.notes      || '';
        }).catch(() => {});
      if (currentPwRow) currentPwRow.style.display = 'none';
      if (pwLabel) pwLabel.innerHTML = (t('profile_new_password') || 'Nova senha') + ' <small style="color:var(--text-muted);font-weight:400">(opcional)</small>';
    } else {
      // Create mode
      if (title) title.textContent = t('admin.modal.create_user') || 'Novo Usuário';
      if (userNameField) { userNameField.readOnly = false; userNameField.style.opacity = ''; }
      if (currentPwRow) currentPwRow.style.display = 'none';
      if (pwLabel) pwLabel.innerHTML = (t('profile_new_password') || 'Nova senha') + ' <span style="color:var(--s-stopped)">*</span>';
    }

    modal.classList.remove('hidden');
  }

  function closeAdminUserModal() {
    document.getElementById('admin-user-modal')?.classList.add('hidden');
    _editingUserId = null;
  }

  document.getElementById('admin-user-modal-close')?.addEventListener('click', closeAdminUserModal);
  document.getElementById('admin-user-modal-cancel')?.addEventListener('click', closeAdminUserModal);
  document.getElementById('admin-user-modal-backdrop')?.addEventListener('click', closeAdminUserModal);

  document.getElementById('admin-create-user-btn')?.addEventListener('click', () => openAdminUserModal(null, null));

  document.getElementById('admin-user-modal-save')?.addEventListener('click', async () => {
    const username  = document.getElementById('aum-username')?.value.trim();
    const password  = document.getElementById('aum-password')?.value || '';
    const confirmPw = document.getElementById('aum-confirm-pw')?.value || '';
    const firstName = document.getElementById('aum-first-name')?.value.trim() || '';
    const lastName  = document.getElementById('aum-last-name')?.value.trim()  || '';
    const email     = document.getElementById('aum-email')?.value.trim()      || '';
    const phone     = document.getElementById('aum-phone')?.value.trim()      || '';
    const notes     = document.getElementById('aum-notes')?.value.trim()      || '';

    if (!_editingUserId && !username) {
      showToast(t('auth.error.fill_fields') || 'Preencha usuário e senha.', 'error'); return;
    }
    if (!_editingUserId && !password) {
      showToast(t('toast.password_required') || 'Senha é obrigatória.', 'error'); return;
    }
    if (password && password !== confirmPw) {
      showToast(t('toast.passwords_mismatch') || 'As senhas não coincidem.', 'error'); return;
    }

    try {
      if (_editingUserId) {
        // Edit: update profile info
        await fetch(`${API_BASE_URL}/api/admin/users/${_editingUserId}/profile`, {
          method: 'PUT',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ first_name: firstName, last_name: lastName, email, phone, notes }),
        });
        // Optionally reset password
        if (password) {
          const r = await fetch(`${API_BASE_URL}/api/admin/users/${_editingUserId}/password`, {
            method: 'PATCH',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          });
          if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
        }
        showToast(t('admin.toast.user_updated') || 'Usuário atualizado.', 'success');
      } else {
        // Create: register
        const regRes = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        if (!regRes.ok) { const d = await regRes.json(); throw new Error(d.detail); }
        const created = await regRes.json();
        // Save profile info
        if (firstName || lastName || email || phone || notes) {
          await fetch(`${API_BASE_URL}/api/users/profile`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${created.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name: firstName, last_name: lastName, email, phone, notes }),
          });
        }
        showToast(t('toast.account_created')?.replace('{name}', username) || `Usuário ${username} criado.`, 'success');
      }
      closeAdminUserModal();
      loadAdminUsers();
    } catch(e) {
      showToast(e.message, 'error');
    }
  });

  // --- Application Initialization ---
  initializeApp();
});