// OCI Architecture Diagram — Horizontal Flow: Cloud(left) / On-Premises(right)
'use strict';

// Public API
window.renderOciDiagram = function (data, docType) {
  // Diagram is only rendered for full infrastructure documentation
  if (docType && docType !== 'full_infra' && docType !== 'resumo_infra') return '';
  // Expose compartment names so the PNG export can embed them in the filename
  window._ociDiagramCompartments = ((data || {}).compartments || []).map(c => c.name).filter(Boolean);
  try { return new OciDiagram(data || {}, docType || 'full_infra').render(); }
  catch (e) { console.warn('[OciDiagram]', e); return ''; }
};

window.initDiagramInteraction = function () {
  const wrap = document.querySelector('.arch-wrap');
  const svg  = wrap && wrap.querySelector('svg.arch-svg');
  const root = svg  && svg.querySelector('g.arch-root');
  if (!root) return;

  let s = 1, dx = 0, dy = 0, drag = false, mx = 0, my = 0;

  function apply() {
    root.setAttribute('transform', `translate(${dx},${dy}) scale(${s})`);
    const lbl = wrap.querySelector('.arch-zoom-pct');
    if (lbl) lbl.textContent = Math.round(s * 100) + '%';
  }

  function fitToContainer() {
    const canvas = wrap.querySelector('.arch-diagram-canvas');
    const bbox   = root.getBBox();
    if (!canvas || !bbox.width || !bbox.height) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const pad = 40;
    s = Math.min((cw - pad) / bbox.width, (ch - pad) / bbox.height, 1.2);
    dx = (cw - bbox.width * s) / 2 - bbox.x * s;
    dy = (ch - bbox.height * s) / 2 - bbox.y * s;
    apply();
  }

  window._archZoom = function (dir) {
    if (dir === 0) { fitToContainer(); }
    else s = Math.max(0.1, Math.min(4, s * (dir > 0 ? 1.2 : 1 / 1.2)));
    apply();
  };

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const cx = (e.clientX - rect.left - dx) / s;
    const cy = (e.clientY - rect.top  - dy) / s;
    s = Math.max(0.1, Math.min(4, s * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    dx = e.clientX - rect.left - cx * s;
    dy = e.clientY - rect.top  - cy * s;
    apply();
  }, { passive: false });

  svg.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    drag = true; mx = e.clientX - dx; my = e.clientY - dy;
    svg.style.cursor = 'grabbing';
  });
  svg.addEventListener('mousemove', e => {
    if (!drag) return;
    dx = e.clientX - mx; dy = e.clientY - my; apply();
  });
  const end = () => { drag = false; svg.style.cursor = 'grab'; };
  svg.addEventListener('mouseup', end);
  svg.addEventListener('mouseleave', end);
  svg.addEventListener('dblclick', () => window._archZoom(0));

  let lastTD = null;
  svg.addEventListener('touchstart', e => {
    if (e.touches.length === 1) { drag = true; mx = e.touches[0].clientX - dx; my = e.touches[0].clientY - dy; }
    else if (e.touches.length === 2)
      lastTD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }, { passive: true });
  svg.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && drag) { dx = e.touches[0].clientX - mx; dy = e.touches[0].clientY - my; apply(); }
    if (e.touches.length === 2 && lastTD) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      s = Math.max(0.1, Math.min(4, s * d / lastTD)); lastTD = d; apply();
    }
  }, { passive: false });
  svg.addEventListener('touchend', () => { drag = false; lastTD = null; });

  requestAnimationFrame(() => fitToContainer());
};


// PNG Export (4K resolution)
window.exportDiagramPng = async function () {
  const svg = document.querySelector('.arch-svg');
  if (!svg) return null;
  const root = svg.querySelector('.arch-root');
  if (!root) return null;

  const cs = getComputedStyle(document.documentElement);
  const varMap = {};
  for (const prop of cs) {
    if (prop.startsWith('--')) varMap[prop] = cs.getPropertyValue(prop).trim();
  }

  const clone = root.cloneNode(true);
  clone.setAttribute('transform', 'translate(0,0) scale(1)');

  const resolveVars = (str) => str.replace(/var\(([^)]+)\)/g, (_, v) => {
    const parts = v.split(',');
    const name = parts[0].trim();
    const fallback = parts.slice(1).join(',').trim();
    return varMap[name] || fallback || '';
  });

  clone.querySelectorAll('*').forEach(el => {
    const st = el.getAttribute('style');
    if (st && st.includes('var(')) el.setAttribute('style', resolveVars(st));
  });

  const origDefs = svg.querySelector('defs');
  let defsClone = null;
  if (origDefs) {
    defsClone = origDefs.cloneNode(true);
    defsClone.querySelectorAll('*').forEach(el => {
      const st = el.getAttribute('style');
      if (st && st.includes('var(')) el.setAttribute('style', resolveVars(st));
      ['fill', 'stroke'].forEach(attr => {
        const val = el.getAttribute(attr);
        if (val && val.includes('var(')) el.setAttribute(attr, resolveVars(val));
      });
    });
  }

  const bbox = root.getBBox();
  const pad = 32;
  const w = Math.ceil(bbox.width + pad * 2);
  const h = Math.ceil(bbox.height + pad * 2);

  const ns = 'http://www.w3.org/2000/svg';
  const newSvg = document.createElementNS(ns, 'svg');
  newSvg.setAttribute('xmlns', ns);
  newSvg.setAttribute('width', w);
  newSvg.setAttribute('height', h);
  newSvg.setAttribute('viewBox', `${bbox.x - pad} ${bbox.y - pad} ${w} ${h}`);
  newSvg.setAttribute('style', 'background:#0d1117');
  if (defsClone) newSvg.appendChild(defsClone);
  newSvg.appendChild(clone);

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(newSvg);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // 4K export: scale factor 4 for high-quality output
      const scale = 4;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => resolve(b), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
};

window._archExportPng = async function () {
  const blob = await window.exportDiagramPng();
  if (!blob) return;
  // Build filename: oci-topology_<compartments>_HH-MM-DD-MM-YYYY.png
  const p2 = n => String(n).padStart(2, '0');
  const now = new Date();
  const ts = `${p2(now.getHours())}-${p2(now.getMinutes())}-${p2(now.getDate())}-${p2(now.getMonth() + 1)}-${now.getFullYear()}`;
  const comps = window._ociDiagramCompartments || [];
  const compStr = comps.length > 0
    ? comps.map(n => n.replace(/[^a-zA-Z0-9]/g, '_')).slice(0, 3).join('-')
    : 'OCI';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `oci-topology_${compStr}_${ts}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

window._archAddToDoc = async function () {
  const blob = await window.exportDiagramPng();
  if (!blob) return;
  const file = new File([blob], 'topology-diagram.png', { type: 'image/png' });
  const api = window._diagramApi;
  if (!api) { console.warn('[OciDiagram] Doc API not available'); return; }

  const lang = (typeof currentLanguage !== 'undefined' && currentLanguage === 'en') ? 'en' : 'pt';
  const sectionName = lang === 'en' ? 'Network Topology' : 'Topologia de Rede';
  const desc = lang === 'en'
    ? 'The diagram below illustrates the network topology of the OCI environment, including VCNs, subnets, gateways, routing, DRG peering, VPN connectivity, and on-premises integration.'
    : 'O diagrama abaixo ilustra a topologia de rede do ambiente OCI, incluindo VCNs, sub-redes, gateways, roteamento, peering via DRG, conectividade VPN e integração com o ambiente on-premises.';

  api.addImageSection(sectionName, 'start');
  const sections = api.getImageSections();
  const newSec = sections[0];
  newSec.text_above = desc;
  api.addFilesToSection(newSec.id, [file]);

  setTimeout(() => {
    const card = document.querySelector(`.img-section-card[data-sec-id="${newSec.id}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);
};


// Layout Constants
const K = {
  W: 2000, MARG: 32,
  VGAP: 28, HGAP: 20, COL_GAP: 24,
  // Node cards  (NH_NSG=140 used when NSG is present, but we use 134 as base with NSG badge)
  NW: 160, NH: 165, NR: 10,
  ICO_SIZE: 36,
  FT: 9, FN: 11, FS: 10,
  // Subnet containers
  SUB_PAD: 16, SUB_HDR: 36, SUB_R: 8, SUB_GAP: 16,
  SUB_MIN_W: 210,
  // Gateway nodes
  GW_NW: 130, GW_NH: 48, GW_GAP: 12,
  // RT/SL badge row
  META_BADGE_H: 16,
  // VCN containers
  VCN_PAD: 20, VCN_HDR: 48, VCN_R: 12, VCN_BDR: 1.8,
  VCN_GAP: 28,
  // DRG badge
  DRG_W: 130, DRG_H: 64,
  // RPC badge
  RPC_W: 140, RPC_H: 34,
  // LPG
  LPG_W: 240, LPG_H: 52,
  // Edge row
  EDGE_H: 100,
  // VPN / CPE
  CW: 160, CH: 110,
  // Zone labels
  ZONE_PX: 20, ZONE_PY: 16, ZONE_HDR: 36, ZONE_R: 12,
  SEP: 40,
  // Arrow gap between subnets and gateways (wide enough for CIDR labels)
  ARROW_GAP: 200,
  // Cloud / On-Premises horizontal split
  CLOUD_RATIO: 0.62, ZONE_SEP: 40, ZONE_HDR_H: 28,
  // Legend panel
  LEGEND_W: 190, LEGEND_PAD: 10, LEGEND_ITEM_H: 20, LEGEND_R: 8,
};

// Service Colors
const C = {
  instance: '#f89e2a', lb: '#a371f7', vcn: '#2f81f7', drg: '#58a6ff',
  oke: '#4cc9f0', waf: '#f85149', cert: '#d4a017', ipsec: '#d29922',
  cpe: '#848d97', vol: '#3fb950', vg: '#3fb950', subnet: '#388bfd',
  lpg: '#3fb950', nsg: '#e3b341', rt: '#58a6ff', sl: '#d29922',
  igw: '#3fb950', nat: '#f0883e', sgw: '#a371f7', rpc: '#4cc9f0',
  db: '#e06c00',
  // Public/private subnet differentiation
  subnet_pub: '#3fb950', subnet_priv: '#388bfd',
  // Layout zones
  cloud_zone: '#2f81f7', onprem_zone: '#848d97',
};

// Compartment group palette (used when multi-compartment mode is active)
const _COMP_PALETTE = ['#7c3aed','#0d9488','#d97706','#16a34a','#e11d48'];

// i18n helper
function _lang() {
  return (typeof currentLanguage !== 'undefined' && currentLanguage === 'en') ? 'en' : 'pt';
}
function _i(pt, en) { return _lang() === 'en' ? en : pt; }

// SVG Icons (28×28 coord space)
const SVG_ICONS = {
  instance: `<rect x="2" y="4" width="24" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<rect x="2" y="14" width="24" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<circle cx="5.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="5.5" cy="17.5" r="1.2" fill="currentColor"/>
<line x1="9" y1="7.5" x2="22" y2="7.5" stroke="currentColor" stroke-width="1.4"/>
<line x1="9" y1="17.5" x2="22" y2="17.5" stroke="currentColor" stroke-width="1.4"/>`,
  vcn: `<circle cx="14" cy="14" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
<circle cx="4" cy="7" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
<circle cx="24" cy="7" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
<circle cx="4" cy="21" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
<circle cx="24" cy="21" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
<line x1="6.1" y1="8.3" x2="11.3" y2="11.7" stroke="currentColor" stroke-width="1.8"/>
<line x1="21.9" y1="8.3" x2="16.7" y2="11.7" stroke="currentColor" stroke-width="1.8"/>
<line x1="6.1" y1="19.7" x2="11.3" y2="16.3" stroke="currentColor" stroke-width="1.8"/>
<line x1="21.9" y1="19.7" x2="16.7" y2="16.3" stroke="currentColor" stroke-width="1.8"/>`,
  subnet: `<rect x="2" y="2" width="24" height="24" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
<rect x="7" y="7" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
  lb: `<rect x="9" y="2" width="10" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<rect x="1" y="19" width="10" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<rect x="17" y="19" width="10" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<line x1="14" y1="9" x2="14" y2="14" stroke="currentColor" stroke-width="1.8"/>
<line x1="14" y1="14" x2="6" y2="19" stroke="currentColor" stroke-width="1.8"/>
<line x1="14" y1="14" x2="22" y2="19" stroke="currentColor" stroke-width="1.8"/>
<circle cx="14" cy="14" r="2" fill="currentColor"/>`,
  drg: `<path d="M14 2 L26 14 L14 26 L2 14 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
<circle cx="14" cy="14" r="3.5" fill="currentColor" opacity="0.7"/>
<line x1="7" y1="7" x2="11.2" y2="11.2" stroke="currentColor" stroke-width="1.5"/>
<line x1="21" y1="7" x2="16.8" y2="11.2" stroke="currentColor" stroke-width="1.5"/>
<line x1="7" y1="21" x2="11.2" y2="16.8" stroke="currentColor" stroke-width="1.5"/>
<line x1="21" y1="21" x2="16.8" y2="16.8" stroke="currentColor" stroke-width="1.5"/>`,
  oke: `<circle cx="14" cy="14" r="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/>
<circle cx="14" cy="3" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/>
<circle cx="23.6" cy="8.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/>
<circle cx="23.6" cy="19.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/>
<circle cx="14" cy="25" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/>
<circle cx="4.4" cy="19.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/>
<circle cx="4.4" cy="8.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/>
<line x1="14" y1="5.2" x2="14" y2="10.5" stroke="currentColor" stroke-width="1.7"/>
<line x1="22.2" y1="9.8" x2="17.2" y2="12.2" stroke="currentColor" stroke-width="1.7"/>
<line x1="22.2" y1="18.2" x2="17.2" y2="15.8" stroke="currentColor" stroke-width="1.7"/>
<line x1="14" y1="22.8" x2="14" y2="17.5" stroke="currentColor" stroke-width="1.7"/>
<line x1="5.8" y1="18.2" x2="10.8" y2="15.8" stroke="currentColor" stroke-width="1.7"/>
<line x1="5.8" y1="9.8" x2="10.8" y2="12.2" stroke="currentColor" stroke-width="1.7"/>`,
  waf: `<path d="M14 2 L25 6 L25 15.5 C25 22 20.5 26 14 27.5 C7.5 26 3 22 3 15.5 L3 6 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M9.5 14 L12.5 17 L18.5 11" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
  cert: `<rect x="3" y="2" width="22" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
<line x1="8" y1="9" x2="20" y2="9" stroke="currentColor" stroke-width="1.8"/>
<line x1="8" y1="14" x2="20" y2="14" stroke="currentColor" stroke-width="1.8"/>
<circle cx="14" cy="20" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
<line x1="14" y1="23" x2="14" y2="25" stroke="currentColor" stroke-width="1.8"/>`,
  ipsec: `<rect x="4" y="13" width="20" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M9 13 V9 A5 5 0 0 1 19 9 V13" fill="none" stroke="currentColor" stroke-width="1.8"/>
<circle cx="14" cy="19.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<line x1="14" y1="21.7" x2="14" y2="23.5" stroke="currentColor" stroke-width="1.8"/>`,
  cpe: `<path d="M2.5 26 L2.5 10.5 L14 2.5 L25.5 10.5 L25.5 26" fill="none" stroke="currentColor" stroke-width="1.8"/>
<rect x="10.5" y="17.5" width="7" height="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
<line x1="2.5" y1="26" x2="25.5" y2="26" stroke="currentColor" stroke-width="1.8"/>
<rect x="7.5" y="9.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/>
<rect x="15" y="9.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
  vol: `<ellipse cx="14" cy="8" rx="10" ry="3.8" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M4 8 V20" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M24 8 V20" fill="none" stroke="currentColor" stroke-width="1.8"/>
<ellipse cx="14" cy="20" rx="10" ry="3.8" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M4 14 Q4 17.8 14 17.8 Q24 17.8 24 14" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
  igw: `<circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" stroke-width="1.8"/>
<ellipse cx="14" cy="14" rx="5.5" ry="11" fill="none" stroke="currentColor" stroke-width="1.3"/>
<line x1="3" y1="14" x2="25" y2="14" stroke="currentColor" stroke-width="1.3"/>
<path d="M5.5 8.5 Q14 11 22.5 8.5" fill="none" stroke="currentColor" stroke-width="1"/>
<path d="M5.5 19.5 Q14 17 22.5 19.5" fill="none" stroke="currentColor" stroke-width="1"/>`,
  nat: `<circle cx="5" cy="8" r="2.8" fill="none" stroke="currentColor" stroke-width="1.6"/>
<circle cx="5" cy="14.5" r="2.8" fill="none" stroke="currentColor" stroke-width="1.6"/>
<circle cx="5" cy="21" r="2.8" fill="none" stroke="currentColor" stroke-width="1.6"/>
<line x1="7.8" y1="8" x2="14" y2="14.5" stroke="currentColor" stroke-width="1.4"/>
<line x1="7.8" y1="14.5" x2="14" y2="14.5" stroke="currentColor" stroke-width="1.4"/>
<line x1="7.8" y1="21" x2="14" y2="14.5" stroke="currentColor" stroke-width="1.4"/>
<rect x="14" y="10.5" width="9" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<line x1="23" y1="14.5" x2="26" y2="14.5" stroke="currentColor" stroke-width="1.6"/>
<polyline points="23.5,12.5 26,14.5 23.5,16.5" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  sgw: `<path d="M8.5 22 C6 22 3.5 20 3.5 17.5 C3.5 15 5.5 13.5 8 14 C8.5 11.5 10.5 9.5 13 9.5 C15.5 9.5 17.5 11 18 13.5 C20 13 24.5 14.5 24.5 17.5 C24.5 21 21 22 19 22 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M14 13 L17 14.7 L17 18.3 L14 20 L11 18.3 L11 14.7 Z" fill="none" stroke="currentColor" stroke-width="1.3"/>
<circle cx="14" cy="16.5" r="1.4" fill="currentColor"/>`,
  vg: `<ellipse cx="14" cy="6" rx="10" ry="3.8" fill="none" stroke="currentColor" stroke-width="1.7"/>
<path d="M4 6 V13" fill="none" stroke="currentColor" stroke-width="1.7"/>
<path d="M24 6 V13" fill="none" stroke="currentColor" stroke-width="1.7"/>
<ellipse cx="14" cy="13" rx="10" ry="3.8" fill="none" stroke="currentColor" stroke-width="1.7"/>
<path d="M4 13 V20" fill="none" stroke="currentColor" stroke-width="1.7"/>
<path d="M24 13 V20" fill="none" stroke="currentColor" stroke-width="1.7"/>
<ellipse cx="14" cy="20" rx="10" ry="3.8" fill="none" stroke="currentColor" stroke-width="1.7"/>`,
  db: `<ellipse cx="14" cy="7" rx="10" ry="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M4 7 V21" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M24 7 V21" fill="none" stroke="currentColor" stroke-width="1.8"/>
<ellipse cx="14" cy="21" rx="10" ry="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
  nsg: `<path d="M14 2 L25 6.5 L25 16 Q25 23 14 27 Q3 23 3 16 L3 6.5 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
<line x1="9" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="1.6"/>
<line x1="9" y1="16" x2="19" y2="16" stroke="currentColor" stroke-width="1.6"/>
<line x1="9" y1="20" x2="16" y2="20" stroke="currentColor" stroke-width="1.6"/>`,
};

const ICON_DIAGRAM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="1" y="1" width="5.5" height="5.5" rx="1"/><rect x="9.5" y="1" width="5.5" height="5.5" rx="1"/>
  <rect x="1" y="9.5" width="5.5" height="5.5" rx="1"/><rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1"/></svg>`;

const ICON_DOWNLOAD = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 2v9M4 8l4 4 4-4"/><path d="M2 13h12"/></svg>`;
const ICON_ADDDOC = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="1" width="12" height="14" rx="2"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="8" y2="11"/></svg>`;


/* ═══════════════════════════════════════════════════════════════════════════
   OciDiagram — Horizontal Flow Layout (Cloud ← → On-Premises)
   ═══════════════════════════════════════════════════════════════════════════ */
class OciDiagram {
  constructor(data, docType) {
    this.d    = data;
    this.dt   = docType;
    this.els  = [];
    this.bgs  = [];
    this.conn = [];
    this._pos = {};
    this._uid = 0;
  }

  render() {
    const topo = this._buildTopology();
    if (!topo) return '';
    const { totalW, totalH } = this._layoutTopology(topo);
    this._drawConnections(topo);
    this._renderLegend(K.W - K.MARG - K.LEGEND_W, K.MARG);
    const body = [...this.bgs, ...this.els, ...this.conn].join('\n');
    const svgH = Math.max(400, Math.ceil(totalH + 40));
    const svgW = Math.max(800, Math.ceil(totalW + 40));

    return `
<div class="arch-wrap arch-diagram-wrap">
  <div class="arch-diagram-header">
    <span class="arch-diagram-icon">${ICON_DIAGRAM}</span>
    <span class="arch-diagram-title">${this._diagramTitle()}</span>
    <span class="arch-diagram-badge">${this._esc(this._typeTag())}</span>
    <div class="arch-zoom-controls">
      <button class="arch-zoom-btn" onclick="window._archZoom(-1)" data-tip="${_i('Diminuir zoom','Zoom out')}">&minus;</button>
      <span class="arch-zoom-pct">100%</span>
      <button class="arch-zoom-btn" onclick="window._archZoom(1)" data-tip="${_i('Aumentar zoom','Zoom in')}">+</button>
      <button class="arch-zoom-btn arch-zoom-reset" onclick="window._archZoom(0)" data-tip="${_i('Ajustar ao tamanho da tela','Fit to screen')}">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="1" width="14" height="14" rx="2"/><polyline points="1 5 5 5 5 1"/><polyline points="15 11 11 11 11 15"/></svg>
      </button>
      <span style="width:1px;height:18px;background:var(--border);margin:0 4px;"></span>
      <button class="arch-zoom-btn arch-export-btn" onclick="window._archExportPng()" data-tip="${_i('Baixar como PNG','Download as PNG')}">${ICON_DOWNLOAD}</button>
      <button class="arch-zoom-btn arch-add-doc-btn" onclick="window._archAddToDoc()" data-tip="${_i('Adicionar ao documento','Add to document')}">${ICON_ADDDOC}</button>
    </div>
  </div>
  <div class="arch-diagram-canvas">
    <svg class="arch-svg" xmlns="http://www.w3.org/2000/svg" width="100%" height="${svgH}" style="display:block;overflow:visible">
      <defs>${this._defs()}</defs>
      <g class="arch-root" transform="translate(0,0) scale(1)">
        ${body}
      </g>
    </svg>
    <div class="arch-diagram-hint">${_i('Scroll para zoom · Arraste para mover · Duplo clique para ajustar','Scroll to zoom · Drag to pan · Double-click to fit')}</div>
  </div>
</div>`;
  }

  _diagramTitle() {
    const base = _i('Topologia de Rede', 'Network Topology');
    const comps = this.d.compartments || [];
    if (comps.length > 1) {
      const names = comps.map(c => c.name).filter(Boolean).join(', ');
      return `${base} — ${names}`;
    }
    return base;
  }

  _defs() {
    const arrows = [
      ['arch-arr-gray',  'var(--border-muted,#3d444d)'],
      ['arch-arr-blue',  '#58a6ff'], ['arch-arr-amber', '#d29922'],
      ['arch-arr-cyan',  '#4cc9f0'], ['arch-arr-red',   '#f85149'],
      ['arch-arr-purple','#a371f7'], ['arch-arr-green', '#3fb950'],
      ['arch-arr-orange','#f0883e'],
    ].map(([id, fill]) =>
      `<marker id="${id}" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
        <path d="M0,0 L0,8 L8,4 Z" fill="${fill}" opacity="0.8"/>
      </marker>`
    ).join('');
    const shadow = `<filter id="arch-shadow" x="-4%" y="-4%" width="108%" height="112%">
      <feDropShadow dx="0" dy="1" stdDeviation="2.5" flood-color="#000" flood-opacity="0.12"/>
    </filter>`;
    return arrows + shadow;
  }


  /* ══════════════════════════════════════════════════════════════════════════
     TOPOLOGY BUILDER
  ══════════════════════════════════════════════════════════════════════════ */
  _buildTopology() {
    const D = this.d;
    const has = a => a && a.length > 0;

    const edge = [];
    (D.waf_policies || []).filter(p => (p.lifecycle_state || '').toUpperCase() !== 'DELETED')
      .forEach(p => edge.push({ type: 'waf', data: p }));
    (D.certificates || []).filter(c => ['ACTIVE','PENDING_DELETION'].includes((c.lifecycle_state || '').toUpperCase()))
      .forEach(c => edge.push({ type: 'cert', data: c }));

    const vcns = (D.vcns || []).map(vcn => {
      const subMap = {};
      (vcn.subnets || []).forEach(sub => {
        subMap[sub.id] = { subnet: sub, instances: [], lbs: [], oke_pools: [] };
      });
      return { vcn, subMap, drg: null, unplaced: [], lpgs: vcn.lpgs || [] };
    });

    // Also check vcn_topology format
    (D.vcn_topology || []).forEach(vt => {
      const vcn = vt.vcn;
      if (!vcn) return;
      const subMap = {};
      (vt.subnets || []).forEach(sub => {
        subMap[sub.id] = {
          subnet: sub,
          instances: sub.instances || [],
          lbs: sub.load_balancers || [],
          oke_pools: [],
          databases: sub.databases || [],
        };
      });
      vcns.push({ vcn, subMap, drg: null, unplaced: [], lpgs: vcn.lpgs || [], rpcs: [] });
    });

    const subToVcn = {};
    const vcnIdMap = {};
    vcns.forEach((v, vi) => {
      vcnIdMap[v.vcn.id] = vi;
      Object.keys(v.subMap).forEach(sid => { subToVcn[sid] = vi; });
    });

    // Place instances
    const placedInstances = new Set();
    (D.instances || []).forEach(inst => {
      let placed = false;
      if (inst.subnet_id && subToVcn[inst.subnet_id] !== undefined) {
        const vi = subToVcn[inst.subnet_id];
        if (vcns[vi].subMap[inst.subnet_id]) {
          vcns[vi].subMap[inst.subnet_id].instances.push(inst);
          placed = true; placedInstances.add(inst.host_name);
        }
      }
      if (!placed && inst.private_ip) {
        for (const v of vcns) {
          for (const sid of Object.keys(v.subMap)) {
            if (v.subMap[sid].subnet.cidr_block && this._ipInCidr(inst.private_ip, v.subMap[sid].subnet.cidr_block)) {
              v.subMap[sid].instances.push(inst);
              placed = true; placedInstances.add(inst.host_name); break;
            }
          }
          if (placed) break;
        }
      }
      if (!placed && inst.vcn_id && vcnIdMap[inst.vcn_id] !== undefined) {
        vcns[vcnIdMap[inst.vcn_id]].unplaced.push({ type: 'instance', data: inst });
        placedInstances.add(inst.host_name);
      }
    });

    // Place LBs
    const placedLbs = new Set();
    (D.load_balancers || []).forEach(lb => {
      let placed = false;
      if (lb.subnet_ids && lb.subnet_ids.length > 0) {
        for (const sid of lb.subnet_ids) {
          if (subToVcn[sid] !== undefined && vcns[subToVcn[sid]].subMap[sid]) {
            vcns[subToVcn[sid]].subMap[sid].lbs.push(lb);
            placed = true; placedLbs.add(lb.id || lb.display_name); break;
          }
        }
      }
      if (!placed) {
        const backendIps = [];
        (lb.backend_sets || []).forEach(bs => {
          (bs.backends || []).forEach(b => { if (b.ip_address) backendIps.push(b.ip_address); });
        });
        for (const ip of backendIps) {
          for (const v of vcns) {
            for (const sid of Object.keys(v.subMap)) {
              if (v.subMap[sid].subnet.cidr_block && this._ipInCidr(ip, v.subMap[sid].subnet.cidr_block)) {
                v.subMap[sid].lbs.push(lb); placed = true;
                placedLbs.add(lb.id || lb.display_name); break;
              }
            }
            if (placed) break;
          }
          if (placed) break;
        }
      }
    });

    // Place DB Systems into subnets or VCNs
    const placedDbs = new Set();
    (D.db_systems || []).forEach(db => {
      let placed = false;
      // Try subnet_id first
      if (db.subnet_id && subToVcn[db.subnet_id] !== undefined) {
        const vi = subToVcn[db.subnet_id];
        if (vcns[vi].subMap[db.subnet_id]) {
          if (!vcns[vi].subMap[db.subnet_id].databases) vcns[vi].subMap[db.subnet_id].databases = [];
          vcns[vi].subMap[db.subnet_id].databases.push(db);
          placed = true; placedDbs.add(db.id);
        }
      }
      // Fall back to vcn_id → unplaced in that VCN
      if (!placed && db.vcn_id && vcnIdMap[db.vcn_id] !== undefined) {
        vcns[vcnIdMap[db.vcn_id]].unplaced.push({ type: 'db', data: db });
        placedDbs.add(db.id);
      }
    });
    const floatingDbs = (D.db_systems || []).filter(db => !placedDbs.has(db.id));

    // Attach DRGs from vcn_topology
    vcns.forEach(v => {
      const vt = (D.vcn_topology || []).find(t => t.vcn && t.vcn.id === v.vcn.id);
      if (vt && vt.drgs && vt.drgs.length > 0) v.drg = vt.drgs[0];
    });

    // Attach DRGs from flat drgs list
    (D.drgs || []).forEach(drg => {
      (drg.attachments || []).forEach(att => {
        if (att.network_type === 'VCN' && att.network_id && vcnIdMap[att.network_id] !== undefined)
          vcns[vcnIdMap[att.network_id]].drg = drg;
      });
    });

    const floatingLbs = (D.load_balancers || []).filter(lb => !placedLbs.has(lb.id || lb.display_name));
    const floatingInstances = (D.instances || []).filter(i => !placedInstances.has(i.host_name));
    const ipsecs = D.ipsec_connections || [];
    const cpes = D.cpes || [];
    const storage = [
      ...(D.volume_groups || []).map(v => ({ type: 'vg', data: v })),
      ...(D.standalone_volumes || []).slice(0, 8).map(v => ({ type: 'vol', data: v })),
    ];

    const hasContent = edge.length || vcns.length || floatingLbs.length || floatingInstances.length
      || floatingDbs.length || ipsecs.length || cpes.length || storage.length || (D.kubernetes_clusters || []).length;
    if (!hasContent) return null;

    return { edge, vcns, floatingLbs, floatingInstances, floatingDbs, ipsecs, cpes, storage };
  }

  _ipInCidr(ip, cidr) {
    try {
      const [net, bits] = cidr.split('/');
      const mask = ~(2 ** (32 - parseInt(bits)) - 1) >>> 0;
      const ipNum = ip.split('.').reduce((a, b) => ((a << 8) >>> 0) + parseInt(b), 0) >>> 0;
      const netNum = net.split('.').reduce((a, b) => ((a << 8) >>> 0) + parseInt(b), 0) >>> 0;
      return (ipNum & mask) === (netNum & mask);
    } catch (e) { return false; }
  }


  /* ══════════════════════════════════════════════════════════════════════════
     LAYOUT ENGINE
     Cloud zone (left): [VCNs sub-col] [IPSec sub-col]
     On-Premises (right): [CPEs — each aligned with its IPSec row]
  ══════════════════════════════════════════════════════════════════════════ */
  _layoutTopology(topo) {
    const { MARG, VGAP, W, ZONE_SEP, ZONE_HDR_H, NW, NH, HGAP } = K;
    const hasOnPrem = topo.cpes.length > 0 || topo.ipsecs.length > 0;
    const hasIpsec  = topo.ipsecs.length > 0;

    // Pre-measure actual VCN content width so IPSec column is placed right after it
    // (no dead zone from a fixed vcnColW that's much wider than actual content)
    const vcnMaxW = topo.vcns.length > 0 ? this._measureVcnMaxWidth(topo.vcns) : 300;
    const vcnLayoutW = vcnMaxW;  // VCNs laid out at their natural width

    // IPSec column: positioned right after VCN content (60px gap)
    const ipsecGap   = hasIpsec ? HGAP * 3 : 0;
    const ipsecColX  = MARG + vcnMaxW + ipsecGap;
    const ipsecRightX = hasIpsec ? ipsecColX + NW : MARG + vcnMaxW;

    // Separator: just after IPSec (or VCN) content
    const sepX    = ipsecRightX + HGAP * 2;
    const cloudW  = sepX - MARG;
    const onpremX = sepX + ZONE_SEP;
    const onpremW = Math.max(NW + HGAP * 2, W - onpremX - MARG);

    // Start Y below zone header labels.
    // When multi-compartment bounding boxes are visible, add extra top clearance so that
    // the "Cloud OCI / On-Premises" zone labels don't end up inside any compartment box.
    const multiComp = (this.d.compartments || []).length > 1;
    let y = MARG + (hasOnPrem ? ZONE_HDR_H + (multiComp ? 40 : 8) : (multiComp ? 28 : 0));

    // 1) Edge Security row
    if (topo.edge.length) {
      y = this._layEdgeRow(topo.edge, MARG, y, vcnLayoutW);
      y += VGAP;
    }

    // 2) Floating LBs
    if (topo.floatingLbs.length) {
      y = this._layFloatingRow(topo.floatingLbs.map(lb => this._descLb(lb)),
        MARG, y, vcnLayoutW, 'LOAD BALANCERS', C.lb);
      y += VGAP;
    }

    // 3) VCN containers
    let vcnEndY = y;
    if (topo.vcns.length) {
      vcnEndY = this._layVcnContainers(topo.vcns, MARG, y, vcnLayoutW);
      vcnEndY += VGAP;
    }

    // 4) Multi-compartment grouping (dashed bounding boxes around VCNs by compartment)
    if (this.d.compartments && this.d.compartments.length > 1) {
      this._layCompartmentGroups();
    }

    // 5) Floating instances
    if (topo.floatingInstances.length) {
      vcnEndY = this._layFloatingRow(topo.floatingInstances.map(i => this._descInst(i)),
        MARG, vcnEndY, vcnLayoutW, _i('COMPUTE (SEM SUBNET)', 'COMPUTE (NO SUBNET)'), C.instance);
      vcnEndY += VGAP;
    }

    // 6) Floating DB Systems (not placed in any subnet or VCN)
    if (topo.floatingDbs && topo.floatingDbs.length) {
      vcnEndY = this._layFloatingRow(topo.floatingDbs.map(db => this._descDb(db)),
        MARG, vcnEndY, vcnLayoutW, _i('DB SYSTEMS (SEM SUBNET)', 'DB SYSTEMS (NO SUBNET)'), C.db);
      vcnEndY += VGAP;
    }

    // 7) Storage
    if (topo.storage.length) {
      vcnEndY = this._layStorageRow(topo.storage, MARG, vcnEndY, vcnLayoutW);
      vcnEndY += VGAP;
    }

    // 6) IPSec nodes — right of VCN content, vertically aligned with VCN start
    let ipsecEndY = y;
    if (hasIpsec) {
      ipsecEndY = this._layIpsec(topo.ipsecs, ipsecColX, y);
    }

    // 7) CPEs aligned with their IPSec row in On-Premises zone
    let onpremMaxY = y;
    if (hasOnPrem) {
      onpremMaxY = this._layOnPremCpes(topo.ipsecs, topo.cpes, onpremX, onpremW);
    }

    const totalH = Math.max(vcnEndY, ipsecEndY, onpremMaxY) + MARG;
    const totalW = hasOnPrem ? onpremX + onpremW + MARG : MARG + vcnMaxW + MARG;

    // Vertical separator + zone backgrounds + labels
    if (hasOnPrem) {
      this.bgs.unshift(this._verticalSeparator(sepX, MARG, totalH, cloudW, onpremW));
    }

    return { totalW, totalH };
  }


  // IPSec nodes — vertical column, right side of Cloud zone
  _layIpsec(ipsecs, x, y) {
    const { NW, NH, VGAP } = K;
    ipsecs.forEach((ipsec, i) => {
      const ny = y + i * (NH + VGAP);
      const node = { id: ipsec.id, kind: 'ipsec', label: this._t(ipsec.display_name, 18), sub: this._ipsecSub(ipsec), status: null };
      this.els.push(this._nodeCard(x, ny, node));
      this._pos[ipsec.id] = { cx: x + NW/2, cy: ny + NH/2, x, y: ny, w: NW, h: NH };
    });
    return y + ipsecs.length * (NH + VGAP) - VGAP;
  }


  // CPE nodes (On-Premises zone — right panel)
  _layOnPremCpes(ipsecs, cpes, onpremX, onpremW) {
    const { CW, CH, VGAP } = K;
    const cpeMap = Object.fromEntries(cpes.map(c => [c.id, c]));
    let maxBottom = 0;

    // CPE aligned with its IPSec
    ipsecs.forEach(ipsec => {
      const cpe = cpeMap[ipsec.cpe_id];
      if (!cpe) return;
      const ip = this._pos[ipsec.id];
      if (!ip) return;
      const cy = ip.y + Math.max(0, (ip.h - CH) / 2);
      const cx = onpremX + Math.max(0, (onpremW - CW) / 2);
      this.els.push(this._cpeNode(cx, cy, cpe, CW));
      this._pos[cpe.id] = { cx: cx + CW/2, cy: cy + CH/2, x: cx, y: cy, w: CW, h: CH };
      maxBottom = Math.max(maxBottom, cy + CH);
      // Horizontal tunnel line: IPSec right edge → CPE left edge
      const tunnels = ipsec.tunnels || [];
      const up   = tunnels.filter(t => (t.status||'').toUpperCase() === 'UP').length;
      const down = tunnels.filter(t => (t.status||'').toUpperCase() !== 'UP').length;
      this.els.push(this._tunnelLine(ip.x + ip.w, ip.cy, cx, ip.cy, up, down));
    });

    // Unmatched CPEs (no IPSec connection referencing them) — rendered muted below matched ones
    const matched = new Set(ipsecs.map(i => i.cpe_id).filter(Boolean));
    let uy = maxBottom > 0 ? maxBottom + VGAP : (K.MARG + K.ZONE_HDR_H + 8);
    cpes.filter(c => !matched.has(c.id)).forEach(cpe => {
      const cx = onpremX + Math.max(0, (onpremW - CW) / 2);
      this.els.push(this._cpeNode(cx, uy, cpe, CW, true /* orphaned */));
      this._pos[cpe.id] = { cx: cx + CW/2, cy: uy + CH/2, x: cx, y: uy, w: CW, h: CH };
      uy += CH + VGAP;
    });

    return Math.max(maxBottom, uy);
  }


  // Vertical separator: Cloud OCI | On-Premises
  _verticalSeparator(sepX, y, h, cloudW, onpremW) {
    const { MARG, FN, ZONE_HDR_H } = K;
    const cloudLabelX = sepX - cloudW / 2;
    const onpremLabelX = sepX + onpremW / 2;
    const labelY = y + ZONE_HDR_H / 2 + 4;
    return `<g class="arch-zones">
  <rect x="${sepX - cloudW}" y="${y}" width="${cloudW}" height="${h}" style="fill:${C.cloud_zone};fill-opacity:0.018;"/>
  <rect x="${sepX}" y="${y}" width="${onpremW + MARG}" height="${h}" style="fill:${C.onprem_zone};fill-opacity:0.018;"/>
  <line x1="${sepX}" y1="${y}" x2="${sepX}" y2="${y + h}" style="stroke:var(--border-muted,#3d444d);stroke-width:1.5;stroke-dasharray:8,5;opacity:0.55;"/>
  <text x="${cloudLabelX}" y="${labelY}" text-anchor="middle" style="font:700 ${FN}px/1 'Inter',sans-serif;fill:${C.cloud_zone};letter-spacing:.10em;opacity:0.70;">&#9729; CLOUD OCI</text>
  <text x="${onpremLabelX}" y="${labelY}" text-anchor="middle" style="font:700 ${FN}px/1 'Inter',sans-serif;fill:${C.onprem_zone};letter-spacing:.10em;opacity:0.70;">&#127963; ON-PREMISES</text>
</g>`;
  }


  // Tunnel line (horizontal, IPSec ↔ CPE)
  _tunnelLine(x1, y, x2, _y2, up, down) {
    const clr = down === 0 && up > 0 ? '#3fb950' : up === 0 && down > 0 ? '#f85149' : '#e3b341';
    const dash = down > 0 ? 'stroke-dasharray:8,4;' : '';
    const lbl = up > 0 && down > 0 ? `${up}\u2191 ${down}\u2193` : up > 0 ? `${up} UP` : `${down} DOWN`;
    const mx = (x1 + x2) / 2, bW = 68, bH = 20;
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" style="stroke:${clr};stroke-width:2;${dash}"/>
<rect x="${mx - bW/2}" y="${y - bH/2}" width="${bW}" height="${bH}" rx="5" style="fill:var(--bg-main);stroke:${clr};stroke-width:1.2;"/>
<text x="${mx}" y="${y + 4}" text-anchor="middle" style="font:700 ${K.FS}px/1 'Inter',sans-serif;fill:${clr};">${this._esc(lbl)}</text>`;
  }


  // Edge Security Row
  _layEdgeRow(items, x, y, w) {
    const nodes = items.map(item => item.type === 'waf' ? this._descWaf(item.data) : this._descCert(item.data));
    return this._layFloatingRow(nodes, x, y, w, _i('SEGURANÇA', 'SECURITY'), C.waf);
  }


  // Floating row (generic)
  _layFloatingRow(nodes, x, y, w, label, color) {
    const { NW, NH, HGAP } = K;
    const pr = Math.max(1, Math.min(nodes.length, Math.floor((w + HGAP) / (NW + HGAP))));
    const rowW = pr * NW + (pr - 1) * HGAP;
    const startX = x + (w - rowW) / 2;
    const rows = Math.ceil(nodes.length / pr);
    const zoneH = K.ZONE_HDR + K.ZONE_PY + rows * (NH + 10) - 10 + K.ZONE_PY;
    this.bgs.push(this._zoneBg(x, y, w, zoneH, color, label));
    const contentY = y + K.ZONE_HDR + K.ZONE_PY;
    nodes.forEach((node, i) => {
      const nx = startX + (i % pr) * (NW + HGAP);
      const ny = contentY + Math.floor(i / pr) * (NH + 10);
      this.els.push(this._nodeCard(nx, ny, node));
      this._pos[node.id] = { cx: nx + NW/2, cy: ny + NH/2, x: nx, y: ny, w: NW, h: NH };
    });
    return y + zoneH;
  }


  // On-Premises column (vertical stack)
  _layOnPremColumn(nodes, x, y, w, label, color) {
    const { NW, NH, HGAP } = K;
    const nodeW = Math.min(NW, w - 40);
    const pr = Math.max(1, Math.min(nodes.length, Math.floor((w + HGAP) / (nodeW + HGAP))));
    const rowW = pr * nodeW + (pr - 1) * HGAP;
    const startX = x + (w - rowW) / 2;
    const rows = Math.ceil(nodes.length / pr);
    const zoneH = K.ZONE_HDR + K.ZONE_PY + rows * (NH + 10) - 10 + K.ZONE_PY;
    this.bgs.push(this._zoneBg(x, y, w, zoneH, color, label));
    const contentY = y + K.ZONE_HDR + K.ZONE_PY;
    nodes.forEach((node, i) => {
      const nx = startX + (i % pr) * (nodeW + HGAP);
      const ny = contentY + Math.floor(i / pr) * (NH + 10);
      this.els.push(this._nodeCard(nx, ny, node));
      this._pos[node.id] = { cx: nx + nodeW/2, cy: ny + NH/2, x: nx, y: ny, w: nodeW, h: NH };
    });
    return y + zoneH;
  }


  // CPE column (On-Premises)
  _layCpeColumn(cpes, x, y, w) {
    const { CW, CH, HGAP } = K;
    const nodeW = Math.min(CW, w - 20);
    const zoneH = K.ZONE_HDR + K.ZONE_PY + cpes.length * (CH + 10) - 10 + K.ZONE_PY;
    this.bgs.push(this._zoneBg(x, y, w, zoneH, C.cpe, 'CPE ON-PREMISES'));
    const contentY = y + K.ZONE_HDR + K.ZONE_PY;
    cpes.forEach((cpe, i) => {
      const cx = x + (w - nodeW) / 2;
      const cy = contentY + i * (CH + 10);
      this.els.push(this._cpeNode(cx, cy, cpe, nodeW));
      this._pos[cpe.id] = { cx: cx + nodeW/2, cy: cy + CH/2, x: cx, y: cy, w: nodeW, h: CH };
    });
    return y + zoneH;
  }


  // Pre-measure VCN max width (without rendering)
  _measureVcnMaxWidth(vcnTopos) {
    const { VCN_PAD, SUB_PAD, SUB_MIN_W, NW, HGAP, GW_NW, ARROW_GAP, LPG_W } = K;
    return vcnTopos.reduce((maxW, vt) => {
      const subnets = Object.values(vt.subMap);
      const gateways = this._extractVcnGateways(vt.vcn);
      const hasDrg = !!vt.drg;
      if (hasDrg) gateways.push({});   // DRG counts as one gateway node
      const maxSubW = subnets.reduce((m, s) => {
        const count = s.instances.length + s.lbs.length + s.oke_pools.length + (s.databases || []).length;
        const cols = Math.max(1, Math.min(count, 3));
        const innerW = cols * NW + (cols - 1) * HGAP;
        return Math.max(m, Math.max(SUB_MIN_W, innerW + SUB_PAD * 2));
      }, SUB_MIN_W);
      const gwColW = gateways.length > 0 ? GW_NW + ARROW_GAP : 0;
      // LPGs can extend beyond the subnet+gateway column width — ensure VCN is wide enough
      const lpgCount = Math.min(4, (vt.lpgs || vt.vcn.lpgs || []).length);
      const lpgTotalW = lpgCount > 0 ? VCN_PAD * 2 + lpgCount * LPG_W + (lpgCount - 1) * 12 : 0;
      const vcnW = Math.max(maxSubW + gwColW + VCN_PAD * 2, 400, lpgTotalW);
      return Math.max(maxW, vcnW);
    }, 200);
  }


  // VCN Containers
  _layVcnContainers(vcnTopos, x, y, totalW) {
    const { VCN_PAD, VCN_HDR, VCN_GAP, DRG_W, DRG_H, RPC_H, SUB_PAD, SUB_HDR, SUB_GAP,
            NW, NH, HGAP, SUB_MIN_W, META_BADGE_H, LPG_W, LPG_H, GW_NW, GW_NH, GW_GAP, ARROW_GAP } = K;

    const measured = vcnTopos.map(vt => {
      const subnets = Object.values(vt.subMap);

      // Extract gateways and connections
      const gateways = this._extractVcnGateways(vt.vcn);
      const gwConns = this._buildGwConnections(vt.vcn, subnets);
      const hasDrg = !!vt.drg;
      const rpcCount = hasDrg ? (vt.drg.rpcs || []).length : 0;
      // Add DRG as last item in gateway column (same column, below other gateways)
      if (hasDrg) {
        gateways.push({ key: vt.drg.id, type: 'DRG', displayName: vt.drg.display_name, color: C.drg, isDrg: true });
      }

      // Measure each subnet
      const subMeasured = subnets.map(s => {
        const count = s.instances.length + s.lbs.length + s.oke_pools.length + (s.databases || []).length;
        const cols = Math.max(1, Math.min(count, 3));
        const rows = Math.ceil(Math.max(1, count) / cols);
        const innerW = cols * NW + (cols - 1) * HGAP;
        const subW = Math.max(SUB_MIN_W, innerW + SUB_PAD * 2);

        const sn = s.subnet;
        const hasRt  = !!(sn.route_table_id || sn.route_table_name);
        // We display at most 1 SL badge in the diagram (primary/custom SL only)
        const slCount = Math.min(1, (sn.security_list_ids && sn.security_list_ids.length > 0)
          ? sn.security_list_ids.length
          : (sn.security_list_names || []).length);
        const hasMeta = hasRt || slCount > 0;
        // Estimate badge rows: RT + SLs laid out horizontally; wrap ~every 2 badges
        const badgeItemCount = (hasRt ? 1 : 0) + slCount;
        const badgeRows = hasMeta ? Math.ceil(badgeItemCount / 3) : 0;
        const metaH = badgeRows > 0 ? badgeRows * (META_BADGE_H + 2) + 8 : 0;
        const subH = SUB_HDR + metaH + SUB_PAD + rows * (NH + 10) - (count > 0 ? 10 : 0) + SUB_PAD;
        return { ...s, subW, subH, cols, count, metaH };
      });

      // v7: Subnets stacked vertically (one column)
      const maxSubW = subMeasured.reduce((m, s) => Math.max(m, s.subW), SUB_MIN_W);
      const subnetsH = subMeasured.reduce((h, s) => h + s.subH, 0) + Math.max(0, subMeasured.length - 1) * SUB_GAP;

      // Dynamic arrow gap: scale with max routes per gateway (collapsed >3 → count badge)
      const routesByGw = {};
      gwConns.forEach(c => { routesByGw[c.gwKey] = (routesByGw[c.gwKey] || 0) + 1; });
      if (hasDrg) {
        const dk = vt.drg.id;
        subnets.forEach(s => {
          (this._getGwRules(vt.vcn, s.subnet) || []).forEach(r => {
            if (this._gwShort(r.target) === 'DRG') routesByGw[dk] = (routesByGw[dk] || 0) + 1;
          });
        });
      }
      const maxR = Math.min(3, Math.max(1, ...Object.values(routesByGw)));
      // gap = CIDR label width (~110px) + stagger room (maxR routes × 22px) + per-gateway breathing room
      const dynGap = Math.max(150, 90 + maxR * 22 + gateways.length * 8);

      // Gateway column dimensions — DRG is last in the same column
      const gwColW = gateways.length > 0 ? GW_NW + dynGap : 0;
      // Height of each node: DRG uses DRG_H, others use GW_NH; RPCs add below DRG
      const gwStackH = gateways.reduce((total, gw, i) => {
        const nodeH = gw.isDrg ? DRG_H + rpcCount * (RPC_H + 6) : GW_NH;
        return total + nodeH + (i < gateways.length - 1 ? GW_GAP : 0);
      }, 0);

      // LPG row
      const lpgH = vt.lpgs.length > 0 ? LPG_H + 12 : 0;
      const unplacedH = vt.unplaced.length > 0 ? NH + 20 : 0;

      // Unassociated RTs, SLs and NSGs — exist in the VCN but are not linked to any subnet/instance
      const usedRtIds = new Set(Object.values(vt.subMap).map(s => s.subnet.route_table_id).filter(Boolean));
      const usedSlIds = new Set();
      Object.values(vt.subMap).forEach(s => (s.subnet.security_list_ids || []).forEach(id => usedSlIds.add(id)));
      const unusedRts = (vt.vcn.route_tables || []).filter(rt => !usedRtIds.has(rt.id));
      const unusedSls = (vt.vcn.security_lists || []).filter(sl => !usedSlIds.has(sl.id));
      // NSGs: collect names used by any instance in this VCN (subnets + unplaced)
      const usedNsgNames = new Set();
      Object.values(vt.subMap).forEach(s => s.instances.forEach(inst =>
        (inst.network_security_groups || []).forEach(n => { if (n.name) usedNsgNames.add(n.name); })
      ));
      (vt.unplaced || []).forEach(item => {
        if (item.type === 'instance')
          (item.data.network_security_groups || []).forEach(n => { if (n.name) usedNsgNames.add(n.name); });
      });
      const unusedNsgs = (vt.vcn.network_security_groups || []).filter(nsg => !usedNsgNames.has(nsg.name));
      const unusedCount = unusedRts.length + unusedSls.length + unusedNsgs.length;
      const unusedNetH = unusedCount > 0
        ? 10 + 16 + Math.ceil(unusedCount / 3) * (META_BADGE_H + 4) + 6 : 0;

      // VCN dimensions: [subnets] [arrow gap + gateways+DRG] (no separate DRG column)
      const vcnInnerW = maxSubW + gwColW;
      const vcnW = Math.max(vcnInnerW + VCN_PAD * 2, 400);
      const contentH = Math.max(subnetsH, gwStackH);
      const vcnH = VCN_HDR + VCN_PAD + contentH + unusedNetH + lpgH + unplacedH + VCN_PAD;

      return { vt, subMeasured, maxSubW, vcnW, vcnH, hasDrg,
        gwColW, dynGap, subnetsH, gateways, gwConns, gwStackH, lpgH, unplacedH,
        rpcCount, contentH, unusedRts, unusedSls, unusedNsgs, unusedNetH };
    });

    // Store gateway and DRG connections for _drawConnections()
    this._gwConns = measured.flatMap(m => m.gwConns || []);
    this._drgConns = [];
    measured.forEach(m => {
      if (!m.hasDrg) return;
      const drgId = m.vt.drg.id;
      Object.values(m.vt.subMap).forEach(s => {
        const rules = this._getGwRules(m.vt.vcn, s.subnet);
        rules.forEach(rule => {
          const type = this._gwShort(rule.target);
          if (type === 'DRG') {
            this._drgConns.push({ subnetId: s.subnet.id, drgId, destination: rule.destination, vcnId: m.vt.vcn.id });
          }
        });
      });
    });
    // Map each DRG id to the VCN DRG uid (for connection lookup after column render)
    this._drgVcnMap = {};
    measured.forEach(m => {
      if (m.hasDrg) this._drgVcnMap[m.vt.drg.id] = m.vt.drg.id;
    });

    // Render VCNs stacked vertically, inserting extra space at compartment boundaries
    // so that the colored compartment bounding boxes never overlap each other.
    let vy = y;
    let _prevComp = null;
    const _compBoundaryExtra = 54; // space for compartment box header + top padding of next box
    measured.forEach(m => {
      const thisComp = m.vt.vcn.compartment_name;
      if (_prevComp !== null && _prevComp !== thisComp && (this.d.compartments || []).length > 1) {
        vy += _compBoundaryExtra;
      }
      _prevComp = thisComp;
      const w = Math.min(m.vcnW, totalW);
      const vx = x;
      const h = this._renderVcn(m, vx, vy, w);
      vy += h + K.VCN_GAP;
    });
    return vy - K.VCN_GAP;
  }


  // Compartment group color from palette (cycles when idx exceeds palette length)
  _compartmentColor(idx) {
    return _COMP_PALETTE[idx % _COMP_PALETTE.length];
  }


  // Multi-compartment visual grouping: draws dashed bounding boxes around VCNs
  // grouped by compartment_name, with a label header for each group.
  _layCompartmentGroups() {
    const compartments = this.d.compartments || [];
    if (compartments.length <= 1) return;

    // Group VCN positions by compartment_name
    const vcns = this.d.vcns || [];
    const vcnTopo = this.d.vcn_topology || [];
    const allVcns = [
      ...vcns.map(v => ({ id: v.id, compartment_name: v.compartment_name, lpgs: v.lpgs || [] })),
      ...vcnTopo.map(vt => vt.vcn ? {
        id: vt.vcn.id,
        compartment_name: vt.vcn.compartment_name,
        lpgs: vt.lpgs || vt.vcn.lpgs || [],
      } : null).filter(Boolean),
    ];

    // Build map: compartment_name → list of position entries (VCNs + their LPGs)
    const compGroups = {};
    allVcns.forEach(v => {
      const cname = v.compartment_name || _i('Sem compartimento', 'No compartment');
      if (!compGroups[cname]) compGroups[cname] = [];
      const pos = this._pos[v.id];
      if (pos) compGroups[cname].push(pos);
      // Include LPG positions so the bounding box covers LPGs that may extend beyond VCN width
      (v.lpgs || []).forEach(lpg => {
        const lpos = this._pos['lpg_' + lpg.id];
        if (lpos) compGroups[cname].push(lpos);
      });
    });

    const pad = 8;
    const headerH = 22;
    const { FN, FT } = K;

    Object.keys(compGroups).forEach((cname, idx) => {
      const positions = compGroups[cname];
      if (positions.length === 0) return;

      // Compute bounding box around all VCNs in this compartment
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      positions.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + p.w);
        maxY = Math.max(maxY, p.y + p.h);
      });

      const bx = minX - pad;
      const by = minY - pad - headerH;
      const bw = (maxX - minX) + pad * 2;
      const bh = (maxY - minY) + pad * 2 + headerH;
      const color = this._compartmentColor(idx);

      // Dashed bounding box
      this.bgs.push(
        `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" ` +
        `style="fill:${color};fill-opacity:0.03;stroke:${color};stroke-width:1.6;stroke-dasharray:8,5;stroke-opacity:0.5;"/>`
      );

      // Compartment name label header
      this.bgs.push(
        `<text x="${bx + 12}" y="${by + headerH - 6}" ` +
        `style="font:700 ${FN}px/1 'Inter',sans-serif;fill:${color};letter-spacing:.06em;opacity:0.85;">` +
        `${this._esc(this._t(cname, 40))}</text>`
      );
    });
  }


  // Render a single VCN (horizontal flow layout)
  _renderVcn(m, x, y, w) {
    const { VCN_PAD, VCN_HDR, VCN_R, VCN_BDR, SUB_GAP, DRG_W, DRG_H, RPC_W, RPC_H,
            NW, NH, HGAP, FN, FS, FT, LPG_W, LPG_H, GW_NW, GW_NH, GW_GAP, ARROW_GAP,
            META_BADGE_H } = K;
    const vcn = m.vt.vcn;
    const h = m.vcnH;

    // VCN container background
    this.bgs.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${VCN_R}" filter="url(#arch-shadow)" style="fill:var(--bg-main);stroke:${C.vcn};stroke-width:${VCN_BDR};stroke-dasharray:8,4;"/>
<rect x="${x}" y="${y}" width="${w}" height="${VCN_HDR}" rx="${VCN_R}" style="fill:rgba(47,129,247,0.08);stroke:none;"/>
<rect x="${x}" y="${y+VCN_HDR-1}" width="${w}" height="1.5" style="fill:rgba(47,129,247,0.22);"/>
<circle cx="${x+VCN_PAD+14}" cy="${y+VCN_HDR/2}" r="16" style="fill:${C.vcn};fill-opacity:0.15;"/>
<g transform="translate(${x+VCN_PAD},${y+VCN_HDR/2-14}) scale(1)" style="color:${C.vcn};">${SVG_ICONS.vcn}</g>
<text x="${x+VCN_PAD+38}" y="${y+VCN_HDR/2-4}" style="font:700 ${FN+2}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(vcn.display_name,40))}</text>
<text x="${x+VCN_PAD+38}" y="${y+VCN_HDR/2+FS+2}" style="font:400 ${FS}px/1 'Inter',sans-serif;fill:var(--text-secondary);">CIDR: ${this._esc(vcn.cidr_block||'')}</text>`);

    this._pos[vcn.id] = { cx: x+w/2, cy: y+h/2, x, y, w, h };

    const contentY = y + VCN_HDR + VCN_PAD;

    // --- Left column: Subnets (stacked vertically) ---
    let subY = contentY;
    m.subMeasured.forEach(sub => {
      this._renderSubnet(sub, x + VCN_PAD, subY, m.maxSubW, sub.subH, vcn);
      subY += sub.subH + SUB_GAP;
    });

    // --- Middle column: Gateway nodes + DRG stacked vertically ---
    if (m.gateways.length > 0) {
      const gwX = x + VCN_PAD + m.maxSubW + m.dynGap;
      let gwY = contentY + Math.max(0, (m.contentH - m.gwStackH) / 2);
      m.gateways.forEach(gw => {
        if (gw.isDrg && m.vt.drg) {
          // Render DRG badge in gateway column
          this._renderDrgBadge(m.vt.drg, gwX, gwY);
          gwY += DRG_H + GW_GAP;
          // RPCs below DRG node
          (m.vt.drg.rpcs || []).forEach(rpc => {
            this._renderRpcBadge(rpc, gwX - 5, gwY);
            gwY += RPC_H + 6;
          });
        } else {
          this.els.push(this._gwNode(gwX, gwY, gw));
          this._pos[gw.key] = { cx: gwX + GW_NW/2, cy: gwY + GW_NH/2, x: gwX, y: gwY, w: GW_NW, h: GW_NH };
          gwY += GW_NH + GW_GAP;
        }
      });
    }

    // --- Unassociated RTs / SLs panel (below subnet+gateway content) ---
    if (m.unusedNetH > 0) {
      const panelY  = y + VCN_HDR + VCN_PAD + m.contentH + 6;
      const panelX  = x + VCN_PAD;
      const panelW  = w - VCN_PAD * 2;
      const sectionLabel = _i('RTs / SLs / NSGs sem associação', 'Unlinked RTs / SLs / NSGs');
      // Divider + label
      this.bgs.push(
        `<line x1="${panelX}" y1="${panelY}" x2="${panelX + panelW}" y2="${panelY}" ` +
        `style="stroke:var(--border-muted);stroke-width:0.8;stroke-opacity:0.35;stroke-dasharray:5,4;"/>` +
        `<text x="${panelX}" y="${panelY + 14}" ` +
        `style="font:600 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);opacity:0.6;letter-spacing:.05em;text-transform:uppercase;">` +
        `${this._esc(sectionLabel)}</text>`
      );
      let bx = panelX;
      let badgeY = panelY + 18;
      const items = [
        ...m.unusedRts.map(rt => ({ lbl: `RT: ${this._t(rt.name, 20)}`, color: C.rt })),
        ...m.unusedSls.map(sl => ({ lbl: `SL: ${this._t(sl.name, 20)}`, color: C.sl })),
        ...(m.unusedNsgs || []).map(nsg => ({ lbl: `NSG: ${this._t(nsg.name, 20)}`, color: C.nsg })),
      ];
      items.forEach(({ lbl, color }) => {
        const tw = Math.min(lbl.length * 5 + 12, panelW - 8);
        if (bx + tw > panelX + panelW - 4) { bx = panelX; badgeY += META_BADGE_H + 4; }
        this.els.push(
          `<rect x="${bx}" y="${badgeY}" width="${tw}" height="${META_BADGE_H}" rx="3" ` +
          `style="fill:${color};fill-opacity:0.06;stroke:${color};stroke-width:0.7;stroke-opacity:0.35;stroke-dasharray:3,2;"/>` +
          `<text x="${bx + tw/2}" y="${badgeY + 11}" text-anchor="middle" ` +
          `style="font:400 ${FT}px/1 'Inter',sans-serif;fill:${color};opacity:0.65;">${this._esc(lbl)}</text>`
        );
        bx += tw + 5;
      });
    }

    // --- LPGs (bottom of VCN) ---
    if (m.vt.lpgs.length > 0) {
      const lpgY = y + h - VCN_PAD - LPG_H;
      m.vt.lpgs.slice(0, 4).forEach((lpg, i) => {
        const lx = x + VCN_PAD + i * (LPG_W + 12);
        this._renderLpg(lpg, lx, lpgY, m.vt.vcn);
      });
    }

    // --- Unplaced items ---
    if (m.vt.unplaced.length > 0) {
      const upY = y + h - VCN_PAD - NH - (m.lpgH > 0 ? LPG_H + 12 : 0);
      m.vt.unplaced.forEach((item, i) => {
        const nx = x + VCN_PAD + i * (NW + HGAP);
        const node = item.type === 'instance' ? this._descInst(item.data)
          : item.type === 'db' ? this._descDb(item.data)
          : { id: 'u_' + i, kind: item.type, label: '?', sub: '' };
        this.els.push(this._nodeCard(nx, upY, node));
        this._pos[node.id] = { cx: nx+NW/2, cy: upY+NH/2, x: nx, y: upY, w: NW, h: NH };
      });
    }

    return h;
  }


  // Render Subnet
  _renderSubnet(sub, x, y, w, h, vcn) {
    const { SUB_PAD, SUB_HDR, SUB_R, NW, NH, HGAP, FN, FS, FT, META_BADGE_H } = K;
    const sn = sub.subnet;
    const subClr = sn.prohibit_public_ip_on_vnic ? C.subnet_priv : C.subnet_pub;

    // Container
    this.bgs.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${SUB_R}" style="fill:var(--bg-card);stroke:${subClr};stroke-width:1.2;stroke-opacity:0.5;"/>
<rect x="${x}" y="${y}" width="${w}" height="${SUB_HDR}" rx="${SUB_R}" style="fill:${subClr};fill-opacity:0.06;"/>
<rect x="${x}" y="${y+SUB_HDR-1}" width="${w}" height="1" style="fill:${subClr};fill-opacity:0.2;"/>
<rect x="${x}" y="${y}" width="4" height="${h}" rx="2" style="fill:${subClr};"/>
<text x="${x+16}" y="${y+SUB_HDR/2-2}" style="font:600 ${FN}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(sn.display_name||'Subnet',28))}</text>
<text x="${x+16}" y="${y+SUB_HDR/2+FS}" style="font:400 ${FS-1}px/1 'Inter',sans-serif;fill:var(--text-secondary);">${this._esc(sn.cidr_block||'')}${sn.access ? ' · ' + sn.access : ''}</text>`);

    this._pos['sub_' + sn.id] = { cx: x+w/2, cy: y+h/2, x, y, w, h };

    let badgeY = y + SUB_HDR + 4;

    // Build authoritative name maps from the VCN's own security_lists and route_tables
    const vcnSlMap = {};
    (vcn.security_lists || []).forEach(sl => { vcnSlMap[sl.id] = sl.name; });
    const vcnRtMap = {};
    (vcn.route_tables || []).forEach(rt => { vcnRtMap[rt.id] = rt.name; });

    // RT: resolve name from route_table_id (authoritative) or fall back to route_table_name
    const rtName = (sn.route_table_id && vcnRtMap[sn.route_table_id])
      || sn.route_table_name
      || null;

    // SLs: resolve ONLY the IDs in security_list_ids (authoritative association).
    // Prefer non-default SLs; show at most 1 in the diagram.
    let slNames = [];
    if (sn.security_list_ids && sn.security_list_ids.length > 0) {
      const all = sn.security_list_ids.map(id => vcnSlMap[id]).filter(Boolean);
      const custom = all.filter(n => !/^default security list/i.test(n));
      slNames = (custom.length > 0 ? custom : all).slice(0, 1);
    } else {
      const all = [...new Set(sn.security_list_names || [])];
      const custom = all.filter(n => !/^default security list/i.test(n));
      slNames = (custom.length > 0 ? custom : all).slice(0, 1);
    }

    const hasMeta = rtName || slNames.length > 0;
    if (hasMeta) {
      let bx = x + 8;
      if (rtName) {
        const lbl = `RT: ${this._t(rtName, 22)}`;
        const tw = Math.min(lbl.length * 5 + 12, w - 16);
        this.els.push(
          `<rect x="${bx}" y="${badgeY}" width="${tw}" height="14" rx="3" style="fill:${C.rt};fill-opacity:0.09;stroke:${C.rt};stroke-width:0.7;stroke-opacity:0.4;"/>` +
          `<text x="${bx+tw/2}" y="${badgeY+10}" text-anchor="middle" style="font:500 ${FT}px/1 'Inter',sans-serif;fill:${C.rt};opacity:0.85;">${this._esc(lbl)}</text>`
        );
        bx += tw + 5;
      }
      slNames.forEach(name => {
        const lbl = `SL: ${this._t(name, 18)}`;
        const tw = Math.min(lbl.length * 5 + 12, w - 16);
        if (bx + tw > x + w - 6) { bx = x + 8; badgeY += META_BADGE_H + 2; }
        this.els.push(
          `<rect x="${bx}" y="${badgeY}" width="${tw}" height="14" rx="3" style="fill:${C.sl};fill-opacity:0.09;stroke:${C.sl};stroke-width:0.7;stroke-opacity:0.4;"/>` +
          `<text x="${bx+tw/2}" y="${badgeY+10}" text-anchor="middle" style="font:500 ${FT}px/1 'Inter',sans-serif;fill:${C.sl};opacity:0.85;">${this._esc(lbl)}</text>`
        );
        bx += tw + 5;
      });
      badgeY += META_BADGE_H + 4;
    }

    // Resource cards
    const allItems = [
      ...sub.lbs.map(lb => this._descLb(lb)),
      ...sub.instances.map(i => this._descInst(i)),
      ...(sub.databases || []).map(db => this._descDb(db)),
      ...sub.oke_pools.map(op => ({
        id: op.cluster.id + '_' + op.pool.name, kind: 'oke',
        label: this._t(op.pool.name, 18),
        sub: `${op.pool.node_count} nodes`, status: null
      })),
    ];

    if (allItems.length === 0) {
      this.els.push(`<text x="${x+w/2}" y="${badgeY+20}" text-anchor="middle" style="font:italic 400 ${FS-1}px/1 'Inter',sans-serif;fill:var(--text-muted);opacity:0.5;">${_i('sem recursos','no resources')}</text>`);
      return;
    }

    const cols = Math.max(1, Math.min(allItems.length, sub.cols || 3));
    const rowW = cols * NW + (cols - 1) * HGAP;
    const startX = x + (w - rowW) / 2;
    const startY = badgeY + SUB_PAD - 2;

    allItems.forEach((node, i) => {
      const nx = startX + (i % cols) * (NW + HGAP);
      const ny = startY + Math.floor(i / cols) * (NH + 10);
      this.els.push(this._nodeCard(nx, ny, node));
      this._pos[node.id] = { cx: nx+NW/2, cy: ny+NH/2, x: nx, y: ny, w: NW, h: NH };
    });
  }


  // DRG badge
  _renderDrgBadge(drg, x, y) {
    const { DRG_W: W, DRG_H: H, FN, FT } = K;
    const cx = x + W/2;
    this.els.push(`<g>
  <title>${_i('Gateway de Roteamento Dinâmico','Dynamic Routing Gateway')}: ${this._esc(drg.display_name)}</title>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="8" filter="url(#arch-shadow)" style="fill:var(--bg-card);stroke:${C.drg};stroke-width:1.4;cursor:default;"/>
  <circle cx="${cx}" cy="${y+22}" r="14" style="fill:${C.drg};fill-opacity:0.12;"/>
  <g transform="translate(${cx-14},${y+8}) scale(1)" style="color:${C.drg};">${SVG_ICONS.drg}</g>
  <text x="${cx}" y="${y+H-12}" text-anchor="middle" style="font:700 ${FN}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(drg.display_name,16))}</text>
  <text x="${cx}" y="${y+H-2}" text-anchor="middle" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);text-transform:uppercase;">DRG</text>
</g>`);
    this._pos[drg.id] = { cx, cy: y+H/2, x, y, w: W, h: H };
  }


  // RPC badge
  _renderRpcBadge(rpc, x, y) {
    const { RPC_W: W, RPC_H: H, FT, FS } = K;
    const sc = rpc.peering_status === 'PEERED' ? C.rpc : '#e3b341';
    const region = rpc.peer_region_name ? ` \u00b7 ${rpc.peer_region_name}` : '';
    const rpcTip = `${_i('Conexão de Peering Remoto','Remote Peering Connection')}: ${rpc.display_name}${rpc.peer_region_name ? _i(' — Região: ',' — Region: ') + rpc.peer_region_name : ''} (${rpc.peering_status || 'N/A'})`;
    this.els.push(`<g><title>${this._esc(rpcTip)}</title>
<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="5" style="fill:var(--bg-card);stroke:${sc};stroke-width:1;cursor:default;"/>
<circle cx="${x+10}" cy="${y+H/2}" r="4" style="fill:${sc};"/>
<text x="${x+20}" y="${y+12}" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);text-transform:uppercase;">RPC</text>
<text x="${x+44}" y="${y+12}" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(rpc.display_name,12))}</text>
<text x="${x+20}" y="${y+26}" style="font:400 ${FT}px/1 'Inter',sans-serif;fill:var(--text-secondary);">${this._esc(rpc.peering_status||'')}${this._esc(region)}</text>
</g>`);
    this._pos['rpc_' + rpc.id] = { cx: x+W/2, cy: y+H/2, x, y, w: W, h: H };
  }


  // LPG badge — Console Tile style (header band + icon + body rows)
  // vcn: the VCN that owns this LPG (for compartment context)
  _renderLpg(lpg, x, y, vcn) {
    const { LPG_W: W, LPG_H: H, FT, FS } = K;
    const HDR_H = 20;
    const sc = lpg.peering_status === 'PEERED' ? C.lpg : '#e3b341';

    const GENERIC = /connected to a peer/i;
    const clean = s => (s && !GENERIC.test(s)) ? s : '';

    // Body line 1: peer context (type + identifier)
    let bodyL1 = '';
    if (lpg.is_cross_tenancy_peering) {
      // Cross-tenancy: show tenancy/compartment hint — CIDR shown in EXT. TENANCY card only
      const hint = clean(lpg.peer_compartment_name) || clean(lpg.peer_vcn_name) ||
                   (lpg.peer_id ? '\u2026' + lpg.peer_id.slice(-12) : '');
      bodyL1 = _i('Cross-Tenancy', 'Cross-Tenancy') + (hint ? ' \u00b7 ' + this._t(hint, 18) : '');
    } else {
      // Same-tenancy: peer VCN + compartment
      const pv = lpg.peer_vcn_name ? this._t(lpg.peer_vcn_name, 18) : '';
      const pc = lpg.peer_compartment_name ? this._t(lpg.peer_compartment_name, 12) : '';
      bodyL1 = [pv, pc].filter(Boolean).join(' / ') || clean(lpg.peering_status_details) || '';
    }

    // Body line 2:
    //   Cross-tenancy → route table only (CIDR lives in EXT. TENANCY card, avoid duplicate)
    //   Same-tenancy  → advertised CIDR (useful routing info) or route table
    const bodyL2 = lpg.is_cross_tenancy_peering
      ? (lpg.route_table_name && lpg.route_table_name !== 'N/A' ? this._t(lpg.route_table_name, 32) : '')
      : (lpg.peer_advertised_cidr || (lpg.route_table_name && lpg.route_table_name !== 'N/A'
          ? this._t(lpg.route_table_name, 32) : ''));

    // Peering icon: two distinct circles linked by a short bar (clean "link" metaphor)
    // cx-5 and cx+5 with r=3.5 → gap of 3px between circles, no overlap
    const icoLpg = (cx, cy) =>
      `<circle cx="${cx-5}" cy="${cy}" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/>` +
      `<circle cx="${cx+5}" cy="${cy}" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/>` +
      `<line x1="${cx-1.5}" y1="${cy}" x2="${cx+1.5}" y2="${cy}" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;

    const lpgTip = `LPG: ${lpg.display_name}${lpg.peer_vcn_name ? ' \u2014 VCN Peer: ' + lpg.peer_vcn_name : ''}${lpg.is_cross_tenancy_peering ? ' [Cross-Tenancy]' : ''} (${lpg.peering_status || 'N/A'})${lpg.peer_advertised_cidr ? ' \u2014 CIDR: ' + lpg.peer_advertised_cidr : ''}`;
    this.els.push(`<g><title>${this._esc(lpgTip)}</title>
<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6" filter="url(#arch-shadow)" style="fill:var(--bg-card);stroke:${sc};stroke-width:1.2;cursor:default;"/>
<rect x="${x}" y="${y}" width="${W}" height="${HDR_H}" rx="6" style="fill:${sc};fill-opacity:0.14;stroke:none;"/>
<rect x="${x}" y="${y+HDR_H-4}" width="${W}" height="4" style="fill:${sc};fill-opacity:0.14;stroke:none;"/>
<g style="color:${sc};">${icoLpg(x + 14, y + HDR_H / 2)}</g>
<text x="${x+30}" y="${y+14}" style="font:700 ${FT}px/1 'Inter',sans-serif;fill:${sc};letter-spacing:.06em;">LPG</text>
<text x="${x+52}" y="${y+14}" style="font:600 ${FS}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(lpg.display_name, 22))}</text>
<text x="${x+W-8}" y="${y+14}" text-anchor="end" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:${sc};opacity:0.85;">${this._esc(lpg.peering_status || '')}</text>
${bodyL1 ? `<text x="${x+10}" y="${y+33}" style="font:400 ${FT}px/1 'Inter',sans-serif;fill:var(--text-secondary);">${this._esc(this._t(bodyL1, 38))}</text>` : ''}
${bodyL2 ? `<text x="${x+10}" y="${y+47}" style="font:400 ${FT-1}px/1 'Inter',monospace,sans-serif;fill:var(--text-muted);opacity:0.65;">${this._esc(this._t(bodyL2, 36))}</text>` : ''}
</g>`);
    this._pos['lpg_' + lpg.id] = { cx: x+W/2, cy: y+H/2, x, y, w: W, h: H };
  }


  // CPE node
  // orphaned = true → CPE exists in OCI but has no associated IPSec connection
  _cpeNode(x, y, cpe, nodeW, orphaned = false) {
    const W = nodeW || K.CW;
    const { CH: H, NR: R, FN, FS, FT, ICO_SIZE } = K;
    // Orphaned CPEs: muted grey color + dashed border + reduced opacity
    const clr  = orphaned ? 'var(--text-muted)' : C.cpe;
    const clrS = orphaned ? '#6e7681' : C.cpe;   // concrete hex for stroke
    const opa  = orphaned ? 'opacity:0.55;' : '';
    const bdr  = orphaned ? `stroke:${clrS};stroke-width:1.2;stroke-dasharray:5,3;` : `stroke:${clrS};stroke-width:1.4;`;
    const cx = x + W / 2;
    const icoCy = y + 30;
    const noVpnBadge = orphaned
      ? `<rect x="${cx-22}" y="${y+H-18}" width="44" height="13" rx="3" style="fill:${clrS};fill-opacity:0.12;stroke:${clrS};stroke-width:0.8;stroke-opacity:0.5;"/>` +
        `<text x="${cx}" y="${y+H-8}" text-anchor="middle" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:${clrS};opacity:0.7;">${_i('SEM VPN', 'NO VPN')}</text>`
      : '';
    const cpeTip = `CPE On-Premises: ${cpe.display_name} — IP: ${cpe.ip_address || 'N/A'}${cpe.vendor && cpe.vendor !== 'N/A' ? ' — Vendor: ' + cpe.vendor : ''}${orphaned ? ' [Sem conexão IPSec]' : ''}`;
    return `<g style="${opa}">
  <title>${this._esc(cpeTip)}</title>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${R}" filter="url(#arch-shadow)" style="fill:var(--bg-card);${bdr}cursor:default;"/>
  <circle cx="${cx}" cy="${icoCy}" r="${ICO_SIZE/2+4}" style="fill:${clr};fill-opacity:${orphaned ? '0.06' : '0.10'};"/>
  <g transform="translate(${cx-ICO_SIZE/2},${icoCy-ICO_SIZE/2}) scale(${ICO_SIZE/28})" style="color:${clr};">${SVG_ICONS.cpe}</g>
  <text x="${cx}" y="${y+62}" text-anchor="middle" style="font:700 ${FN}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(cpe.display_name,22))}</text>
  <text x="${cx}" y="${y+76}" text-anchor="middle" style="font:400 ${FS}px/1 'Inter',sans-serif;fill:var(--text-secondary);">IP: ${this._esc(cpe.ip_address||'N/A')}</text>
  ${cpe.vendor && cpe.vendor !== 'N/A' ? `<text x="${cx}" y="${y+90}" text-anchor="middle" style="font:400 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);">${this._esc(cpe.vendor)}</text>` : ''}
  ${orphaned ? noVpnBadge : `<text x="${cx}" y="${y+H-4}" text-anchor="middle" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);text-transform:uppercase;">CPE ON-PREMISES</text>`}
</g>`;
  }


  // Storage Row — VGs get tree-style cards; standalone volumes get standard node cards
  _layStorageRow(items, x, y, w) {
    const { NW, NH, HGAP, ZONE_HDR, ZONE_PY } = K;
    const VG_W = 280, VG_MEMBER_H = 16, VG_MAX = 8;

    // Pre-measure each VG card height (depends on member count)
    const vgItems = items.filter(i => i.type === 'vg').map(item => {
      const v = item.data;
      const mems = v.members || [];
      const vis   = Math.min(mems.length, VG_MAX);
      const extra = mems.length > VG_MAX ? 1 : 0;
      const cardH = 32 + vis * VG_MEMBER_H + extra * VG_MEMBER_H + 28; // header + tree rows + badge row
      return { v, mems, vis, cardH };
    });
    const volItems = items.filter(i => i.type === 'vol');

    const count = vgItems.length + volItems.length;
    if (count === 0) return y;

    const rowH  = Math.max(NH, vgItems.length ? Math.max(...vgItems.map(vi => vi.cardH)) : 0);
    const zoneH = ZONE_HDR + ZONE_PY + rowH + ZONE_PY;
    this.bgs.push(this._zoneBg(x, y, w, zoneH, C.vol, _i('ARMAZENAMENTO', 'STORAGE')));
    const cY = y + ZONE_HDR + ZONE_PY;

    // Center all cards in the zone width
    const totalW = vgItems.length * (VG_W + HGAP) + volItems.length * (NW + HGAP) - HGAP;
    let cx = x + Math.max(HGAP, (w - totalW) / 2);

    vgItems.forEach(vi => {
      this._renderVgTreeCard(cx, cY, vi.v, VG_W, vi.cardH);
      cx += VG_W + HGAP;
    });
    volItems.forEach(item => {
      const v    = item.data;
      const node = { id: v.id, kind: 'vol', label: this._t(v.display_name, 18), sub: `${v.size_in_gbs || 0} GB`, status: v.lifecycle_state };
      this.els.push(this._nodeCard(cx, cY, node));
      this._pos[node.id] = { cx: cx + NW/2, cy: cY + NH/2, x: cx, y: cY, w: NW, h: NH };
      cx += NW + HGAP;
    });
    return y + zoneH;
  }


  /**
   * Tree-style Volume Group card.
   * Shows member volume names in a "tree" layout (├─ / └─) together with
   * backup policy and cross-region replication badges.
   */
  _renderVgTreeCard(x, y, vg, cardW, cardH) {
    const { FT, FN, FS } = K;
    const clr = C.vg;
    const val  = vg.validation || {};
    const mems = vg.members || [];
    const VG_MAX = 8, VG_MEMBER_H = 16;

    // Card frame + header strip
    this.els.push(
      `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="8" filter="url(#arch-shadow)" ` +
        `style="fill:var(--bg-card);stroke:${clr};stroke-width:1.4;"/>` +
      `<rect x="${x}" y="${y}" width="${cardW}" height="28" rx="8" ` +
        `style="fill:${clr};fill-opacity:0.09;"/>` +
      `<rect x="${x}" y="${y + 27}" width="${cardW}" height="1" ` +
        `style="fill:${clr};fill-opacity:0.22;"/>` +
      // Icon (scaled-down VG SVG icon)
      `<g transform="translate(${x + 6},${y + 4}) scale(0.56)" style="color:${clr};">${SVG_ICONS.vg}</g>` +
      // Header labels
      `<text x="${x + 23}" y="${y + 11}" ` +
        `style="font:700 ${FT}px/1 'Inter',sans-serif;fill:${clr};letter-spacing:.05em;">VOL. GROUP</text>` +
      `<text x="${x + 23}" y="${y + 23}" ` +
        `style="font:600 ${FS}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(vg.display_name, 32))}</text>`
    );

    // Parse member name: "Boot Volume (hostname)" → boot type; "Block Volume (name)" → block type
    const parseMem = raw => {
      const bm = raw.match(/^Boot Volume \((.+)\)$/i);
      if (bm) return { type: 'boot', name: bm[1], clr: '#d29922' };
      const blm = raw.match(/^Block Volume \((.+)\)$/i);
      if (blm) return { type: 'block', name: blm[1], clr: C.vg };
      return { type: 'block', name: raw, clr: C.vg };
    };

    // Member list rows: colored dot + name + type badge
    const PILL_H = VG_MEMBER_H - 2;
    const BADGE_W = 34, TEXT_MAX_W = cardW - 20 - BADGE_W - 10; // available for name text
    const maxCharsName = Math.max(12, Math.floor(TEXT_MAX_W / 5.2));
    let treeY = y + 34;
    const visible = mems.slice(0, VG_MAX);
    visible.forEach((raw, i) => {
      const { type, name, clr: mClr } = parseMem(raw);
      const isLast = i === visible.length - 1 && mems.length <= VG_MAX;
      const tc = isLast ? '\u2514' : '\u251c';
      const displayName = name.length > maxCharsName ? name.slice(0, maxCharsName - 1) + '\u2026' : name;
      const badgeLabel  = type === 'boot' ? 'BOOT' : 'BLOCK';
      const badgeX      = x + cardW - BADGE_W - 4;

      // Row background (alternating)
      if (i % 2 === 0) {
        this.els.push(
          `<rect x="${x + 4}" y="${treeY}" width="${cardW - 8}" height="${PILL_H}" rx="3"` +
            ` style="fill:${mClr};fill-opacity:0.07;"/>`
        );
      }
      // Tree connector
      this.els.push(
        `<text x="${x + 4}" y="${treeY + 11}"` +
          ` style="font:400 ${FT}px/1 'Courier New',monospace;fill:${clr};opacity:0.4;">${tc}\u2500</text>`
      );
      // Colored type dot
      this.els.push(
        `<circle cx="${x + 17}" cy="${treeY + 8}" r="3.5" style="fill:${mClr};opacity:0.85;"/>`
      );
      // Volume name
      this.els.push(
        `<text x="${x + 24}" y="${treeY + 11}"` +
          ` style="font:500 ${FT}px/1 'Inter',sans-serif;fill:var(--text-secondary);">${this._esc(displayName)}</text>`
      );
      // Type badge (right-aligned)
      this.els.push(
        `<rect x="${badgeX}" y="${treeY + 2}" width="${BADGE_W}" height="${PILL_H - 4}" rx="3"` +
          ` style="fill:${mClr};fill-opacity:0.12;stroke:${mClr};stroke-width:0.7;stroke-opacity:0.4;"/>` +
        `<text x="${badgeX + BADGE_W/2}" y="${treeY + 10}" text-anchor="middle"` +
          ` style="font:700 ${FT - 1}px/1 'Inter',sans-serif;fill:${mClr};opacity:0.9;">${badgeLabel}</text>`
      );
      treeY += VG_MEMBER_H;
    });
    if (mems.length > VG_MAX) {
      this.els.push(
        `<rect x="${x + 4}" y="${treeY}" width="${cardW - 8}" height="${PILL_H}" rx="3"` +
          ` style="fill:${clr};fill-opacity:0.04;"/>` +
        `<text x="${x + 14}" y="${treeY + 11}"` +
          ` style="font:500 ${FT}px/1 'Inter',sans-serif;fill:${clr};opacity:0.65;">` +
          `+${mems.length - VG_MAX} ${_i('volumes', 'volumes')}</text>`
      );
      treeY += VG_MEMBER_H;
    }

    // Backup policy + cross-region replication badges
    const badgeY = treeY + 6;
    let bx  = x + 6;
    const pName    = val.policy_name || '';
    const crossReg = !!val.is_cross_region_replication_enabled;
    const crTarget = val.cross_region_target || '';

    if (pName && pName !== 'Nenhuma' && pName !== 'None') {
      const lbl = `${_i('Backup', 'Backup')}: ${this._t(pName, 10)}`;
      const bw  = Math.min(lbl.length * 4.8 + 10, cardW / 2 - 4);
      this.els.push(
        `<rect x="${bx}" y="${badgeY}" width="${bw}" height="13" rx="3" ` +
          `style="fill:${clr};fill-opacity:0.12;stroke:${clr};stroke-width:0.7;stroke-opacity:0.4;"/>` +
        `<text x="${bx + bw/2}" y="${badgeY + 9}" text-anchor="middle" ` +
          `style="font:600 ${FT}px/1 'Inter',sans-serif;fill:${clr};opacity:0.9;">${this._esc(lbl)}</text>`
      );
      bx += bw + 5;
    } else {
      const lbl = _i('Sem Backup', 'No Backup');
      const bw  = lbl.length * 4.8 + 10;
      this.els.push(
        `<rect x="${bx}" y="${badgeY}" width="${bw}" height="13" rx="3" ` +
          `style="fill:#f85149;fill-opacity:0.10;stroke:#f85149;stroke-width:0.7;stroke-opacity:0.35;"/>` +
        `<text x="${bx + bw/2}" y="${badgeY + 9}" text-anchor="middle" ` +
          `style="font:600 ${FT}px/1 'Inter',sans-serif;fill:#f85149;opacity:0.8;">${this._esc(lbl)}</text>`
      );
      bx += bw + 5;
    }
    if (crossReg) {
      const lbl = crTarget && crTarget !== 'Desabilitada'
        ? `\u2197 ${crTarget}` : _i('Cross-Region', 'Cross-Region');
      const bw = Math.min(lbl.length * 4.8 + 10, cardW - (bx - x) - 6);
      this.els.push(
        `<rect x="${bx}" y="${badgeY}" width="${bw}" height="13" rx="3" ` +
          `style="fill:#a371f7;fill-opacity:0.12;stroke:#a371f7;stroke-width:0.7;stroke-opacity:0.4;"/>` +
        `<text x="${bx + bw/2}" y="${badgeY + 9}" text-anchor="middle" ` +
          `style="font:600 ${FT}px/1 'Inter',sans-serif;fill:#a371f7;opacity:0.9;">${this._esc(lbl)}</text>`
      );
    }

    // Lifecycle state dot
    const dot = this._stClr(vg.lifecycle_state);
    if (dot) this.els.push(`<circle cx="${x + cardW - 10}" cy="${y + 10}" r="4" style="fill:${dot};"/>`);

    this._pos[vg.id] = { cx: x + cardW/2, cy: y + cardH/2, x, y, w: cardW, h: cardH };
  }


  /* ══════════════════════════════════════════════════════════════════════════
     CONNECTIONS — Horizontal arrows from subnets to gateways/DRG
  ══════════════════════════════════════════════════════════════════════════ */
  _drawConnections(topo) {
    const D = this.d;

    // WAF → LB
    (D.waf_policies || []).forEach(policy => {
      const pp = this._pos[policy.id];
      if (!pp) return;
      (policy.integrations || []).forEach(integ => {
        if (integ.load_balancer) {
          const lp = this._pos[integ.load_balancer.id || integ.load_balancer.display_name];
          if (lp) this.conn.push(this._orthoV(pp.cx, pp.y+pp.h, lp.cx, lp.y, C.waf, 'arch-arr-red'));
        }
      });
    });

    // LB → backend instances
    (D.load_balancers || []).forEach(lb => {
      const lp = this._pos[lb.id || lb.display_name];
      if (!lp) return;
      const backendIps = new Set();
      (lb.backend_sets || []).forEach(bs => {
        (bs.backends || []).forEach(b => { if (b.ip_address) backendIps.add(b.ip_address); });
      });
      if (backendIps.size === 0) return;
      (D.instances || []).forEach(inst => {
        if (inst.private_ip && backendIps.has(inst.private_ip)) {
          const ip = this._pos[inst.host_name];
          if (ip) this.conn.push(this._orthoV(lp.cx, lp.y+lp.h, ip.cx, ip.y, C.lb, 'arch-arr-purple'));
        }
      });
    });

    // DRG → IPSecs: L-shaped arrows, spread midX lanes + line-jump arcs at crossings
    const ipsecsByDrg = {};
    (D.ipsec_connections || []).forEach(ipsec => {
      if (!ipsec.drg_id) return;
      const ip = this._pos[ipsec.id];
      const dp = this._pos[ipsec.drg_id];
      if (!ip || !dp) return;
      if (!ipsecsByDrg[ipsec.drg_id]) ipsecsByDrg[ipsec.drg_id] = { dp, items: [] };
      ipsecsByDrg[ipsec.drg_id].items.push({ ip, ipsec });
    });
    Object.values(ipsecsByDrg).forEach(({ dp, items }) => {
      if (!items.length) return;
      items.sort((a, b) => a.ip.cy - b.ip.cy);
      const n = items.length;
      const gap = items[0].ip.x - dp.x - dp.w;
      const SPREAD = 12, JR = 4;
      // Base midX starts at 30% into the gap; each path gets its own lane
      const baseMidX = Math.round(dp.x + dp.w + gap * 0.30);

      // Pre-compute per-item midX and departure Y
      const lanes = items.map(({ ip }, idx) => ({
        ip,
        departY: Math.round(dp.cy + (idx - (n - 1) / 2) * 9),
        midX: baseMidX + idx * SPREAD
      }));

      // Build helper: horizontal segment with upward jump arcs over crossing vertical lanes
      const hSeg = (x2, y, jumpXs) => {
        if (!jumpXs.length) return ` L${x2},${y}`;
        let s = '';
        jumpXs.forEach(jx => {
          s += ` L${jx - JR},${y} A${JR},${JR},0,0,0,${jx + JR},${y}`;
        });
        return s + ` L${x2},${y}`;
      };

      lanes.forEach((lane, idx) => {
        const { ip, departY, midX } = lane;

        // H1 crossings: does this H1 (drgRight→midX at departY) cross any other vertical?
        const h1J = [];
        lanes.forEach((other, j) => {
          if (j === idx) return;
          const vx = other.midX;
          if (vx <= dp.x + dp.w || vx >= midX) return;
          const vlo = Math.min(other.departY, other.ip.cy);
          const vhi = Math.max(other.departY, other.ip.cy);
          if (departY > vlo + 1 && departY < vhi - 1) h1J.push(vx);
        });
        h1J.sort((a, b) => a - b);

        // H2 crossings: does this H2 (midX→ipsecLeft at ip.cy) cross any other vertical?
        const h2J = [];
        lanes.forEach((other, j) => {
          if (j === idx) return;
          const vx = other.midX;
          if (vx <= midX || vx >= ip.x) return;
          const vlo = Math.min(other.departY, other.ip.cy);
          const vhi = Math.max(other.departY, other.ip.cy);
          if (ip.cy > vlo + 1 && ip.cy < vhi - 1) h2J.push(vx);
        });
        h2J.sort((a, b) => a - b);

        const d = `M${dp.x + dp.w},${departY}` +
                  hSeg(midX,  departY, h1J) +
                  ` L${midX},${ip.cy}` +
                  hSeg(ip.x,  ip.cy,   h2J);

        this.conn.push(
          `<path d="${d}" style="fill:none;stroke:${C.drg};stroke-width:1.8;stroke-opacity:0.65;stroke-dasharray:6,3;" marker-end="url(#arch-arr-blue)"/>`
        );
      });
    });
    // IPSec → CPE tunnel: drawn by _layOnPremCpes as horizontal line

    // OKE → VCN
    (D.kubernetes_clusters || []).forEach(cluster => {
      if (!cluster.vcn_id) return;
      const pools = cluster.node_pools || [];
      if (pools.length > 0) {
        const op = this._pos[cluster.id + '_' + pools[0].name];
        const vp = this._pos[cluster.vcn_id];
        if (op && vp) this.conn.push(this._orthoV(op.cx, op.y+op.h, vp.cx, vp.y, C.oke, 'arch-arr-cyan'));
      }
    });

    // Subnet → Gateway connections (horizontal arrows with CIDR labels)
    this._drawGwConnections();

    // Subnet → DRG connections (horizontal arrows with CIDR labels)
    this._drawDrgRouteConnections();

    // LPG peering: connect paired LPGs visually; draw cross-tenancy side cards
    this._drawLpgPeerConnections();
  }


  /**
   * Draw all subnet→gateway connections (IGW/NAT/SGW/DRG) as L-shaped arrows.
   *
   * Key features:
   *  1. Merges gwConns (→IGW/NAT/SGW) + drgConns (→DRG) into one unified pass.
   *  2. Staggered arrival Y at gateway (grouped by gateway, sorted by subnet Y).
   *  3. Staggered departure Y at subnet (grouped by subnet, sorted by gateway Y).
   *  4. Spread midX per connection within each VCN — each path bends at a
   *     unique X lane so vertical segments never overlap.
   *  5. Line-jump arc (small upward semicircle) wherever a horizontal segment
   *     of one path crosses the vertical segment of another path.
   *  6. Collapse per subnet+gateway PAIR when >THRESHOLD routes (avoids clutter).
   *  7. CIDR labels: prefer vertical placement on V-segment; fall back to H1.
   */
  _drawGwConnections() {
    // Merge subnet→gateway and subnet→DRG into one unified list
    const gwConns  = this._gwConns  || [];
    const drgConns = (this._drgConns || []).map(dc => ({
      subnetId: dc.subnetId, gwKey: dc.drgId, type: 'DRG', destination: dc.destination,
      vcnId: dc.vcnId,
    }));
    const allConns = [...gwConns, ...drgConns];
    if (!allConns.length) return;

    const resolved = allConns.map(gc => {
      const sp = this._pos['sub_' + gc.subnetId];
      const gp = this._pos[gc.gwKey];
      if (!sp || !gp) return null;
      const isDrg = gc.type === 'DRG';
      return { ...gc, sp, gp,
        color:  isDrg ? C.drg : this._gwColor(gc.type),
        marker: isDrg ? 'arch-arr-blue' : this._gwMarker(gc.type) };
    }).filter(Boolean);

    if (!resolved.length) return;

    // THRESHOLD: >= THRESHOLD routes from same subnet to same gateway → collapse to one arrow
    const THRESHOLD = 4, SDEP = 20, SARR = 18, JR = 4;

    // ── Assign routeIdx per connection within each (subnet × gateway) pair ──
    // Needed so multiple routes from the same subnet to the same gateway get unique Y positions.
    const byPairForIdx = {};
    resolved.forEach(c => {
      const pk = c.subnetId + '|' + c.gwKey;
      (byPairForIdx[pk] = byPairForIdx[pk] || []).push(c);
    });
    Object.values(byPairForIdx).forEach(arr => {
      arr.forEach((c, i) => { c.routeIdx = i; });
    });

    // getKey:    groups by (subnet × gateway) — used for collapse detection
    // getPosKey: unique per route — used for stagger position assignment
    const getKey    = c => c.subnetId + '|' + c.gwKey;
    const getPosKey = c => c.subnetId + '|' + c.gwKey + '|' + c.routeIdx;

    // Stagger Y at arrivals (by gateway, sort by subnet Y then routeIdx)
    const byGw = {};
    resolved.forEach(c => { (byGw[c.gwKey] = byGw[c.gwKey] || []).push(c); });
    Object.values(byGw).forEach(a => a.sort((a, b) =>
      a.sp.y !== b.sp.y ? a.sp.y - b.sp.y : (a.routeIdx || 0) - (b.routeIdx || 0)
    ));

    // Stagger Y at departures (by subnet, sort by gateway Y then routeIdx)
    const bySub = {};
    resolved.forEach(c => { (bySub[c.subnetId] = bySub[c.subnetId] || []).push(c); });
    Object.values(bySub).forEach(a => a.sort((a, b) =>
      a.gp.y !== b.gp.y ? a.gp.y - b.gp.y : (a.routeIdx || 0) - (b.routeIdx || 0)
    ));

    const arrYOf = {}, depYOf = {};
    Object.values(byGw).forEach(arr => {
      const n = arr.length;
      arr.forEach((c, i) => {
        const raw = c.gp.cy + (i - (n-1)/2) * SARR;
        arrYOf[getPosKey(c)] = Math.max(c.gp.y + 4, Math.min(c.gp.y + c.gp.h - 4, raw));
      });
    });
    Object.values(bySub).forEach(arr => {
      const n = arr.length;
      arr.forEach((c, i) => {
        const raw = c.sp.cy + (i - (n-1)/2) * SDEP;
        depYOf[getPosKey(c)] = Math.max(c.sp.y + 8, Math.min(c.sp.y + c.sp.h - 8, raw));
      });
    });

    const paths = resolved.map(c => ({
      ...c, depY: depYOf[getPosKey(c)], arrY: arrYOf[getPosKey(c)]
    }));

    // Group connections by VCN for lane assignment
    const byVcn = {};
    paths.forEach(p => {
      const k = p.vcnId || p.sp.x;
      (byVcn[k] = byVcn[k] || []).push(p);
    });

    Object.values(byVcn).forEach(group => {
      const subRightMax = Math.max(...group.map(p => p.sp.x + p.sp.w));
      const gwLeft = group[0].gp.x;
      const gap = gwLeft - subRightMax;
      const gwKeys = [...new Set(group.map(p => p.gwKey))];
      gwKeys.sort((a, b) =>
        (group.find(p => p.gwKey === a)?.gp.y ?? 0) -
        (group.find(p => p.gwKey === b)?.gp.y ?? 0)
      );
      const N = gwKeys.length;
      const laneX = {};
      gwKeys.forEach((k, i) => {
        const frac = (i + 1) / (N + 1);
        laneX[k] = Math.round(subRightMax + gap * Math.max(0.12, Math.min(0.85, frac)));
      });
      group.forEach(p => { p.midX = laneX[p.gwKey]; p.subRightMax = subRightMax; });
    });

    // Line-jump helper: build horizontal segment with upward-arc jumps
    const hSeg = (x2, y, jumps) => {
      if (!jumps.length) return ` L${x2},${y}`;
      let s = '';
      jumps.forEach(jx => { s += ` L${jx-JR},${y} A${JR},${JR},0,0,0,${jx+JR},${y}`; });
      return s + ` L${x2},${y}`;
    };

    // ── Two-pass rendering: collect all paths first, then all labels ─────────
    // This ensures CIDR labels always render on top of arrow lines.
    const allPathSvgs  = [];
    const allLabelSvgs = [];

    // ── Collapse per SUBNET+GATEWAY PAIR (>THRESHOLD routes) ──────────────
    const byPair = {};
    paths.forEach(p => {
      const pk = getKey(p);
      (byPair[pk] = byPair[pk] || []).push(p);
    });
    const collapsedPairs = new Set(
      Object.keys(byPair).filter(pk => byPair[pk].length >= THRESHOLD)
    );

    Object.entries(byPair).forEach(([pk, arr]) => {
      if (!collapsedPairs.has(pk)) return;
      const rep = arr[0];
      const { gp, color, marker, midX, subRightMax } = rep;
      const avgDepY = Math.round(arr.reduce((s, c) => s + c.depY, 0) / arr.length);
      const endX = gp.x - 2;
      const d = `M${subRightMax},${avgDepY} L${midX},${avgDepY} L${midX},${gp.cy} L${endX},${gp.cy}`;
      const lbl = `${arr.length} ${_i('rotas', 'routes')}`;
      const tw = lbl.length * 5.5 + 14;
      const lx = Math.round((subRightMax + midX) / 2);
      allPathSvgs.push(
        `<path d="${d}" style="fill:none;stroke:${color};stroke-width:1.8;stroke-opacity:0.75;" marker-end="url(#${marker})"/>`
      );
      allLabelSvgs.push(
        `<rect x="${lx - tw/2}" y="${avgDepY - 8}" width="${tw}" height="14" rx="3" style="fill:var(--bg-main);stroke:${color};stroke-width:1;stroke-opacity:0.7;"/>` +
        `<text x="${lx}" y="${avgDepY + 3}" text-anchor="middle" style="font:700 ${K.FT}px/1 'Inter',sans-serif;fill:${color};opacity:0.9;">${this._esc(lbl)}</text>`
      );
    });

    // ── Individual arrows ─────────────────────────────────────────────────
    const indiv = paths.filter(p => !collapsedPairs.has(getKey(p)));
    // Sort: specific CIDRs first (non-default), default route (0.0.0.0/0) last.
    // This ensures that when we pick ONE label per gateway, the most informative CIDR wins.
    indiv.sort((a, b) => {
      const aD = a.destination === '0.0.0.0/0' || a.destination === '::/0';
      const bD = b.destination === '0.0.0.0/0' || b.destination === '::/0';
      return aD !== bD ? (aD ? 1 : -1) : 0;
    });
    // gwLabeled: evita processar o mesmo arrow duas vezes (subnet × gateway × dest)
    // h2Labeled: evita duplicar label no segmento H2 compartilhado (gateway × dest)
    const gwLabeled = new Set();
    const h2Labeled = new Set();

    indiv.forEach(pA => {
      // Line-jump crossing detection (same VCN only)
      const h1J = [], h2J = [];
      indiv.forEach(pB => {
        if (pB === pA || pB.sp.x !== pA.sp.x) return;
        const vx = pB.midX, vlo = Math.min(pB.depY, pB.arrY), vhi = Math.max(pB.depY, pB.arrY);
        if (vx > pA.subRightMax && vx < pA.midX && pA.depY > vlo+1 && pA.depY < vhi-1)
          h1J.push(vx);
        if (vx > pA.midX && vx < pA.gp.x && pA.arrY > vlo+1 && pA.arrY < vhi-1)
          h2J.push(vx);
      });
      h1J.sort((a,b)=>a-b); h2J.sort((a,b)=>a-b);

      const gwEndX = pA.gp.x - 2;
      const d = `M${pA.sp.x + pA.sp.w},${pA.depY}` +
                hSeg(pA.midX, pA.depY, h1J) +
                ` L${pA.midX},${pA.arrY}` +
                hSeg(gwEndX, pA.arrY, h2J);
      allPathSvgs.push(
        `<path d="${d}" style="fill:none;stroke:${pA.color};stroke-width:1.8;stroke-opacity:0.75;" marker-end="url(#${pA.marker})"/>`
      );

      // CIDR label — toda seta recebe label, sem sobreposição de backgrounds.
      //   Regra H2: apenas UM label por (gwKey × destino) no segmento H2.
      //             Segmento compartilhado por múltiplas setas → deduplica neste segmento.
      //   Regra H1: label própria por (subnetId × gwKey × destino).
      //             Segmento exclusivo (depY único por subnet) → nunca sobrepõe.
      //   Prioridade: H2 (se livre) → H1 → H2 truncado (se livre) → H1 truncado → H1 forçado.
      {
        const rawDest  = pA.destination || '';
        const arrowKey = pA.subnetId + '|' + pA.gwKey + '|' + rawDest; // unique per arrow
        const h2Key    = pA.gwKey + '|' + rawDest;                      // shared per gateway×dest

        if (gwLabeled.has(arrowKey)) return; // mesmo arrow duplicado (não deve ocorrer)
        gwLabeled.add(arrowKey);

        const displayText = rawDest ? this._shortenDest(rawDest) : '—';
        const fullTw  = displayText.length * 5.5 + 14;
        // H2: entre midX e a borda esquerda do gateway
        const h2Start  = pA.midX + 12;
        const h2End    = gwEndX - 4;
        const h2Len    = h2End - h2Start;
        // H1: entre a borda direita do subnet e o midX (depY único por subnet → sem overlap)
        const subRight = pA.sp.x + pA.sp.w;
        const h1Start  = subRight + 6;
        const h1End    = pA.midX - 8;
        const h1Len    = h1End - h1Start;

        const mkH2 = (tw, txt) => {
          const lx = Math.max(h2Start, Math.round((h2Start + h2End) / 2) - tw / 2);
          return `<rect x="${lx}" y="${pA.arrY - 7}" width="${tw}" height="13" rx="3"` +
            ` style="fill:var(--bg-main);stroke:${pA.color};stroke-width:0.8;stroke-opacity:0.55;"/>` +
            `<text x="${lx + tw/2}" y="${pA.arrY + 3}" text-anchor="middle"` +
            ` style="font:600 ${K.FT}px/1 'Inter',sans-serif;fill:${pA.color};opacity:0.9;">${this._esc(txt)}</text>`;
        };
        const mkH1 = (tw, txt) => {
          const lx = Math.min(h1End - tw, Math.max(h1Start, Math.round((h1Start + h1End) / 2) - tw / 2));
          return `<rect x="${lx}" y="${pA.depY - 7}" width="${tw}" height="13" rx="3"` +
            ` style="fill:var(--bg-main);stroke:${pA.color};stroke-width:0.8;stroke-opacity:0.55;"/>` +
            `<text x="${lx + tw/2}" y="${pA.depY + 3}" text-anchor="middle"` +
            ` style="font:600 ${K.FT}px/1 'Inter',sans-serif;fill:${pA.color};opacity:0.9;">${this._esc(txt)}</text>`;
        };
        const mkTrunc = (src, maxLen) => {
          const n = Math.max(4, Math.floor((maxLen - 14) / 5.5));
          return n >= src.length ? src : src.slice(0, n - 1) + '\u2026';
        };

        const h2Free = !h2Labeled.has(h2Key); // H2 ainda não tem label para este dest neste gateway

        if (h2Free && fullTw <= h2Len) {
          allLabelSvgs.push(mkH2(fullTw, displayText));
          h2Labeled.add(h2Key);
        } else if (h1Len >= fullTw) {
          allLabelSvgs.push(mkH1(fullTw, displayText));
        } else if (h2Free && h2Len >= 28) {
          const t = mkTrunc(displayText, h2Len);
          allLabelSvgs.push(mkH2(t.length * 5.5 + 14, t));
          h2Labeled.add(h2Key);
        } else if (h1Len >= 28) {
          const t = mkTrunc(displayText, h1Len);
          allLabelSvgs.push(mkH1(t.length * 5.5 + 14, t));
        } else {
          // Último recurso: força em H1 (depY único → não sobrepõe outros)
          const avail = Math.max(h1Len, 28);
          const t = mkTrunc(displayText, avail);
          allLabelSvgs.push(mkH1(t.length * 5.5 + 14, t));
        }
      }
    });

    // Push paths first, then labels — labels always render on top of arrow lines
    allPathSvgs.forEach(s => this.conn.push(s));
    allLabelSvgs.forEach(s => this.conn.push(s));
  }

  /** DRG route connections are merged into _drawGwConnections. */
  _drawDrgRouteConnections() {}


  /**
   * LPG peer connections:
   *  • PEERED + internal  → dashed green line connecting both LPG badges with a mid-label
   *    showing the peer VCN name / compartment.
   *  • Cross-tenancy      → amber dashed arrow from LPG to a "CROSS-TENANCY" info card
   *    positioned to the right of the LPG row.
   */
  _drawLpgPeerConnections() {
    // Gather every LPG visible in the topology (from vcn_topology and flat vcns)
    const allLpgs = [];
    const collectFrom = (vcn, lpgArr) => {
      (lpgArr || []).forEach(lpg => allLpgs.push({
        ...lpg,
        vcnName: vcn.display_name || '',
        vcnComp: vcn.compartment_name || '',
        vcnId:   vcn.id,
      }));
    };
    (this.d.vcn_topology || []).forEach(vt => {
      if (vt.vcn) collectFrom(vt.vcn, vt.lpgs || vt.vcn.lpgs || []);
    });
    (this.d.vcns || []).forEach(vcn => {
      if (!allLpgs.find(l => l.vcnId === vcn.id)) collectFrom(vcn, vcn.lpgs || []);
    });

    const drawn = new Set();
    allLpgs.forEach(lpg => {
      const pos = this._pos['lpg_' + lpg.id];
      if (!pos) return;

      // ── Cross-tenancy: info card to the right of the LPG ─────────────────
      if (lpg.is_cross_tenancy_peering) {
        const col       = C.ipsec;
        const ARROW_GAP = 32;
        const cW = 195, cH = 64, HDR_H = 20;
        const cX = pos.x + pos.w + ARROW_GAP;
        const cY = pos.cy - cH / 2;

        // Filter out generic OCI boilerplate
        const GENERIC = /connected to a peer/i;
        const clean = s => (s && !GENERIC.test(s)) ? s : '';

        const cleanVcn  = clean(lpg.peer_vcn_name);
        const cleanComp = clean(lpg.peer_compartment_name);
        const cleanDet  = clean(lpg.peering_status_details);

        // Body line 1: best available identifier of the remote end
        // Priority: peer VCN name → peer compartment → peer_id suffix → "Ext. Tenancy"
        const body1 = cleanVcn || cleanComp
          || (lpg.peer_id ? '\u2026' + lpg.peer_id.slice(-20) : '')
          || cleanDet
          || _i('Tenancy Externa', 'External Tenancy');

        // Body line 2: CIDR advertised by peer (key routing info) or compartment (if VCN shown above)
        let body2 = '';
        if (lpg.peer_advertised_cidr) {
          body2 = lpg.peer_advertised_cidr;
        } else if (cleanVcn && cleanComp) {
          body2 = this._t(cleanComp, 28);
        }
        // (no peer_id in body2 — already shown in body1 when needed)

        // External tenancy icon: simple "share/external" arrow in a box (clean, recognizable)
        const icoExt = (cx, cy) =>
          `<rect x="${cx-5}" y="${cy-4}" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/>` +
          `<line x1="${cx-2}" y1="${cy+1}" x2="${cx+5}" y2="${cy-6}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>` +
          `<polyline points="${cx+2},${cy-6} ${cx+5},${cy-6} ${cx+5},${cy-3}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;

        const arrowX1 = pos.x + pos.w + 2;
        const arrowX2 = cX - 2;
        const arrowY  = pos.cy;
        this.conn.push(
          `<path d="M${arrowX1},${arrowY} L${arrowX2},${arrowY}" ` +
            `style="fill:none;stroke:${col};stroke-width:1.5;stroke-dasharray:5,3;" ` +
            `marker-end="url(#arch-arr-amber)"/>` +
          // Card frame
          `<rect x="${cX}" y="${cY}" width="${cW}" height="${cH}" rx="7" filter="url(#arch-shadow)" ` +
            `style="fill:var(--bg-card);stroke:${col};stroke-width:1.5;"/>` +
          // Header band
          `<rect x="${cX}" y="${cY}" width="${cW}" height="${HDR_H}" rx="7" ` +
            `style="fill:${col};fill-opacity:0.15;stroke:none;"/>` +
          `<rect x="${cX}" y="${cY+HDR_H-4}" width="${cW}" height="4" ` +
            `style="fill:${col};fill-opacity:0.15;stroke:none;"/>` +
          // Header icon
          `<g style="color:${col};">${icoExt(cX + 13, cY + HDR_H / 2)}</g>` +
          // Header title
          `<text x="${cX + 26}" y="${cY + 14}" ` +
            `style="font:700 ${K.FT}px/1 'Inter',sans-serif;fill:${col};letter-spacing:.05em;">` +
            `${_i('EXT. TENANCY', 'EXT. TENANCY')}</text>` +
          // Status badge right-aligned
          `<text x="${cX + cW - 8}" y="${cY + 14}" text-anchor="end" ` +
            `style="font:600 ${K.FT}px/1 'Inter',sans-serif;fill:${col};opacity:0.8;">` +
            `${this._esc(lpg.peering_status || 'PEERED')}</text>` +
          // Body line 1
          `<text x="${cX + 10}" y="${cY + 37}" ` +
            `style="font:500 ${K.FT}px/1 'Inter',sans-serif;fill:var(--text-primary);">` +
            `${this._esc(this._t(body1, 28))}</text>` +
          // Body line 2
          (body2
            ? `<text x="${cX + 10}" y="${cY + 52}" ` +
              `style="font:400 ${K.FT - 1}px/1 'Inter',monospace,sans-serif;fill:var(--text-muted);opacity:0.75;">` +
              `${this._esc(this._t(body2, 30))}</text>`
            : '')
        );
        return;
      }

      // ── Internal peering: connect to peer LPG if it is also rendered ──────
      if (lpg.peering_status !== 'PEERED') return;
      const peerLpg = allLpgs.find(l =>
        l.id !== lpg.id &&
        ((lpg.peer_id && l.id === lpg.peer_id) ||
         (lpg.peer_vcn_name && l.vcnName === lpg.peer_vcn_name))
      );
      if (!peerLpg) return;
      const key = [lpg.id, peerLpg.id].sort().join('|');
      if (drawn.has(key)) return;
      drawn.add(key);

      const pPos = this._pos['lpg_' + peerLpg.id];
      if (!pPos) return;

      // L-shaped dashed green line between the two LPG badges
      const x1 = pos.cx,  y1 = pos.y + pos.h;
      const x2 = pPos.cx, y2 = pPos.y;
      const midY = Math.round((y1 + y2) / 2);
      const lbl = this._t(
        (peerLpg.vcnComp ? peerLpg.vcnComp + ' \u203a ' : '') + peerLpg.vcnName, 26
      );
      const lw = Math.min(lbl.length * 5 + 14, 150);
      this.conn.push(
        `<path d="M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}" ` +
          `style="fill:none;stroke:${C.lpg};stroke-width:1.6;stroke-dasharray:6,3;stroke-opacity:0.8;" ` +
          `marker-end="url(#arch-arr-green)"/>` +
        `<rect x="${(x1 + x2)/2 - lw/2}" y="${midY - 8}" width="${lw}" height="15" rx="3" ` +
          `style="fill:var(--bg-main);stroke:${C.lpg};stroke-width:0.8;stroke-opacity:0.5;"/>` +
        `<text x="${(x1 + x2)/2}" y="${midY + 4}" text-anchor="middle" ` +
          `style="font:600 ${K.FT}px/1 'Inter',sans-serif;fill:${C.lpg};opacity:0.9;">` +
          `${this._esc(lbl)}</text>`
      );
    });
  }


  /* ══════════════════════════════════════════════════════════════════════════
     SVG RENDERERS
  ══════════════════════════════════════════════════════════════════════════ */

  // ── Instance card ─────────────────────────────────────────────────────────
  // Console-tile style: colored header, shape pill, CPU+RAM chips side-by-side,
  // OS ghost chip (>_ icon), IP rows with custom icons, NSG shield pills.
  _instCard(x, y, item) {
    const { NW: W, NH: H, NR: R, FT, FN } = K;
    const clr      = C.instance;
    const dot      = this._stClr(item.status);
    const uid      = `cl${this._uid++}`;
    const hasPub   = !!item.pubIp;
    const hasSub2  = !!item.sub2;
    const hasSub3  = !!item.sub3;
    const hasNsg   = !!(item.nsgNames && item.nsgNames.length > 0);
    const nsgCount = hasNsg ? item.nsgNames.length : 0;
    const PAD = 7;
    const CW  = W - PAD * 2;   // 146px usable width
    const HDR_H = 34;

    // ── Vertical layout ────────────────────────────────────────────────────
    let cy = y + HDR_H + 4;

    // 1) Shape pill (full width)
    const pillY = cy, pillH = 16;
    cy += pillH + 4;                               // → y+58

    // 2) Spec chips — CPU left, RAM right (only if sub2)
    const chip2Y = hasSub2 ? cy : 0;
    const chip2H = 20;
    const chipGap = 4;
    const cpuW = Math.round(CW * 0.44);            // ~64px
    const ramW = CW - cpuW - chipGap;              // ~78px
    if (hasSub2) cy += chip2H + 4;                // → y+82

    // 3) OS ghost chip (only if sub3)
    const osY = hasSub3 ? cy : 0;
    const osH = 17;
    if (hasSub3) cy += osH + 4;                   // → y+103

    // 4) IP separator + rows
    const sep1Y = cy + 2;
    cy = sep1Y + 8;                                // → y+110
    const privY = item.privIp ? cy : 0;
    if (item.privIp) cy += 13;
    const pubY = hasPub ? cy : 0;
    if (hasPub) cy += 13;

    // 5) NSG section
    const sep2Y = hasNsg ? cy + 2 : 0;
    const nsgY0 = hasNsg ? sep2Y + 6 : 0;
    const NSG_H = 14, NSG_GAP = 3;
    const maxNsg = hasNsg ? Math.max(1, Math.floor((y + H - nsgY0 - 4) / (NSG_H + NSG_GAP))) : 0;

    // ── Micro-icon helpers ─────────────────────────────────────────────────
    // IC chip: 12×12 centered at (cx,cy)
    const icoChip = (cx, icy) =>
      `<rect x="${cx-4}" y="${icy-4}" width="8" height="8" rx="0.8" style="fill:none;stroke:${clr};stroke-width:1.1;"/>` +
      `<line x1="${cx-4}" y1="${icy}" x2="${cx+4}" y2="${icy}" style="stroke:${clr};stroke-width:0.5;opacity:0.4;"/>` +
      `<line x1="${cx}" y1="${icy-4}" x2="${cx}" y2="${icy+4}" style="stroke:${clr};stroke-width:0.5;opacity:0.4;"/>` +
      `<line x1="${cx-2}" y1="${icy-6}" x2="${cx-2}" y2="${icy-4}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx+2}" y1="${icy-6}" x2="${cx+2}" y2="${icy-4}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx-2}" y1="${icy+4}" x2="${cx-2}" y2="${icy+6}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx+2}" y1="${icy+4}" x2="${cx+2}" y2="${icy+6}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx-6}" y1="${icy-2}" x2="${cx-4}" y2="${icy-2}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx-6}" y1="${icy+2}" x2="${cx-4}" y2="${icy+2}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx+4}" y1="${icy-2}" x2="${cx+6}" y2="${icy-2}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx+4}" y1="${icy+2}" x2="${cx+6}" y2="${icy+2}" style="stroke:${clr};stroke-width:0.9;"/>`;

    // RAM module: 13×8 centered at (cx,cy)
    const icoRam = (cx, icy) =>
      `<rect x="${cx-6}" y="${icy-3}" width="12" height="5.5" rx="0.7" style="fill:none;stroke:${clr};stroke-width:1;"/>` +
      `<line x1="${cx-2}" y1="${icy-3}" x2="${cx-2}" y2="${icy+2.5}" style="stroke:${clr};stroke-width:0.5;opacity:0.45;"/>` +
      `<line x1="${cx+2}" y1="${icy-3}" x2="${cx+2}" y2="${icy+2.5}" style="stroke:${clr};stroke-width:0.5;opacity:0.45;"/>` +
      `<rect x="${cx-5}" y="${icy+2.5}" width="2" height="1.5" rx="0.3" style="fill:${clr};opacity:0.55;"/>` +
      `<rect x="${cx+3}" y="${icy+2.5}" width="2" height="1.5" rx="0.3" style="fill:${clr};opacity:0.55;"/>`;

    // Globe: circle + equator + meridian arc, centered at (cx,cy) r=4.5
    const icoGlobe = (cx, icy) =>
      `<circle cx="${cx}" cy="${icy}" r="4.5" style="fill:none;stroke:${C.igw};stroke-width:1;"/>` +
      `<ellipse cx="${cx}" cy="${icy}" rx="2.2" ry="4.5" style="fill:none;stroke:${C.igw};stroke-width:0.55;"/>` +
      `<line x1="${cx-4.5}" y1="${icy}" x2="${cx+4.5}" y2="${icy}" style="stroke:${C.igw};stroke-width:0.55;"/>`;

    // ── Split sub2 into CPU / RAM parts ────────────────────────────────────
    const sub2Parts = (item.sub2 || '').split('·').map(s => s.trim());
    const cpuLabel  = sub2Parts[0] || '';
    const ramLabel  = sub2Parts[1] || '';

    // ── NSG pills ──────────────────────────────────────────────────────────
    const shield = (sx, sy) =>
      `<path d="M${sx+3},${sy} L${sx+7},${sy+1.5} L${sx+7},${sy+5} Q${sx+7},${sy+9} ${sx+3},${sy+10} Q${sx-1},${sy+9} ${sx-1},${sy+5} L${sx-1},${sy+1.5} Z" style="fill:${C.nsg};fill-opacity:0.75;"/>`;
    let nsgSvg = '';
    if (hasNsg && nsgY0 > 0) {
      const bx = x + PAD, bw = CW;
      for (let i = 0; i < Math.min(maxNsg, nsgCount); i++) {
        const name = (i === maxNsg - 1 && nsgCount > maxNsg)
          ? `+${nsgCount - i} NSGs`
          : this._t(item.nsgNames[i], 21);
        const by = nsgY0 + i * (NSG_H + NSG_GAP);
        nsgSvg +=
          `<rect x="${bx}" y="${by}" width="${bw}" height="${NSG_H}" rx="3.5"
            style="fill:${C.nsg};fill-opacity:0.08;stroke:${C.nsg};stroke-width:0.7;stroke-opacity:0.45;"/>` +
          shield(bx + 4, by + 2) +
          `<text x="${bx+17}" y="${by+10}" style="font:500 8px/1 'Inter',sans-serif;fill:${C.nsg};opacity:0.9;">${this._esc(name)}</text>`;
      }
    }

    const chipMY = chip2Y + chip2H / 2;  // vertical midpoint of spec chips

    const tooltip = `Compute: ${item.label}` +
      (item.sub   ? ` | ${item.sub}`   : '') +
      (item.sub2  ? ` | ${item.sub2}`  : '') +
      (item.sub3  ? ` | OS: ${item.sub3}` : '') +
      (item.privIp? ` | ${item.privIp}` : '') +
      (item.pubIp ? ` | pub:${item.pubIp}` : '') +
      (item.status? ` (${item.status})` : '') +
      (hasNsg     ? ` | NSG: ${item.nsgNames.join(', ')}` : '');

    return `<g>
  <title>${this._esc(tooltip)}</title>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${R}" filter="url(#arch-shadow)"
    style="fill:var(--bg-card);stroke:${clr};stroke-width:1.4;stroke-opacity:0.3;cursor:default;"/>
  <rect x="${x}" y="${y+R}" width="4" height="${H-R*2}" style="fill:${clr};opacity:0.8;"/>
  <rect x="${x+4}" y="${y}" width="${W-4}" height="${HDR_H}" rx="0" style="fill:${clr};fill-opacity:0.13;stroke:none;"/>
  <rect x="${x}" y="${y}" width="${W}" height="${HDR_H}" rx="${R}" style="fill:${clr};fill-opacity:0.05;stroke:none;"/>
  <rect x="${x}" y="${y+HDR_H}" width="${W}" height="1" style="fill:${clr};fill-opacity:0.3;"/>
  <g transform="translate(${x+8},${y+(HDR_H-22)/2+2}) scale(${22/28})" style="color:${clr};">${SVG_ICONS.instance}</g>
  ${dot ? `<circle cx="${x+W-11}" cy="${y+11}" r="5" style="fill:${dot};stroke:var(--bg-card);stroke-width:1.2;"/>` : ''}
  <defs><clipPath id="${uid}"><rect x="${x+4}" y="${y}" width="${W-5}" height="${H}"/></clipPath></defs>
  <g clip-path="url(#${uid})">
    <text x="${x+36}" y="${y+13}" dominant-baseline="middle"
      style="font:700 ${FN}px/1 'Inter',system-ui,sans-serif;fill:var(--text-primary);">${this._esc(this._t(item.label, 16))}</text>
    <text x="${x+36}" y="${y+HDR_H-7}"
      style="font:700 8px/1 'Inter',sans-serif;fill:${clr};opacity:0.8;letter-spacing:.07em;">COMPUTE</text>
    <!-- Shape pill -->
    ${item.sub ? `
    <rect x="${x+PAD}" y="${pillY}" width="${CW}" height="${pillH}" rx="${pillH/2}"
      style="fill:${clr};fill-opacity:0.10;stroke:${clr};stroke-width:0.8;stroke-opacity:0.40;"/>
    <text x="${x+PAD+CW/2}" y="${pillY+pillH-4}" text-anchor="middle"
      style="font:600 8.5px/1 'Inter',monospace,sans-serif;fill:${clr};">${this._esc(this._t(item.sub, 22))}</text>` : ''}
    <!-- CPU chip (left) -->
    ${hasSub2 && chip2Y ? `
    <rect x="${x+PAD}" y="${chip2Y}" width="${cpuW}" height="${chip2H}" rx="4"
      style="fill:${clr};fill-opacity:0.10;stroke:${clr};stroke-width:0.7;stroke-opacity:0.38;"/>
    ${icoChip(x + PAD + 8, chipMY + 3)}
    <text x="${x+PAD+18}" y="${chip2Y+chip2H-4}"
      style="font:600 8px/1 'Inter',sans-serif;fill:${clr};">${this._esc(cpuLabel)}</text>
    <!-- RAM chip (right) -->
    <rect x="${x+PAD+cpuW+chipGap}" y="${chip2Y}" width="${ramW}" height="${chip2H}" rx="4"
      style="fill:${clr};fill-opacity:0.07;stroke:${clr};stroke-width:0.7;stroke-opacity:0.28;"/>
    ${icoRam(x + PAD + cpuW + chipGap + 8, chipMY + 3)}
    <text x="${x+PAD+cpuW+chipGap+18}" y="${chip2Y+chip2H-4}"
      style="font:600 8px/1 'Inter',sans-serif;fill:${clr};">${this._esc(ramLabel)}</text>` : ''}
    <!-- OS ghost chip — prompt prefix + nome completo do SO -->
    ${hasSub3 && osY ? `
    <rect x="${x+PAD}" y="${osY}" width="${CW}" height="${osH}" rx="4"
      style="fill:${clr};fill-opacity:0.09;stroke:${clr};stroke-width:0.8;stroke-opacity:0.35;"/>
    <text x="${x+PAD+6}" y="${osY+osH-4}"
      style="font:800 9px/1 'Courier New',monospace;fill:${clr};opacity:0.95;">&gt;_</text>
    <text x="${x+PAD+22}" y="${osY+osH-4}"
      style="font:500 8.5px/1 'Inter',sans-serif;fill:var(--text-primary);opacity:0.92;">${this._esc(this._t(item.sub3, 24))}</text>` : ''}
    <!-- IP separator -->
    <line x1="${x+PAD}" y1="${sep1Y}" x2="${x+W-PAD}" y2="${sep1Y}"
      style="stroke:var(--border-muted,#3d444d);stroke-width:0.6;stroke-opacity:0.4;stroke-dasharray:4,3;"/>
    <!-- Private IP: filled dot -->
    ${item.privIp && privY ? `
    <circle cx="${x+PAD+5}" cy="${privY-4}" r="4" style="fill:${C.subnet_priv};opacity:0.85;"/>
    <circle cx="${x+PAD+5}" cy="${privY-4}" r="1.5" style="fill:white;opacity:0.9;"/>
    <text x="${x+PAD+14}" y="${privY}"
      style="font:500 9px/1 'Inter',system-ui,sans-serif;fill:var(--text-secondary);">${this._esc(item.privIp)}</text>` : ''}
    <!-- Public IP: globe icon -->
    ${hasPub && pubY ? `
    ${icoGlobe(x + PAD + 5, pubY - 4)}
    <text x="${x+PAD+14}" y="${pubY}"
      style="font:500 9px/1 'Inter',system-ui,sans-serif;fill:var(--text-secondary);">${this._esc(item.pubIp)}</text>` : ''}
    <!-- NSG separator -->
    ${hasNsg && sep2Y ? `
    <line x1="${x+PAD}" y1="${sep2Y}" x2="${x+W-PAD}" y2="${sep2Y}"
      style="stroke:${C.nsg};stroke-width:0.6;stroke-opacity:0.35;stroke-dasharray:3,3;"/>` : ''}
    ${nsgSvg}
  </g>
</g>`;
  }


  // ── DB System card ────────────────────────────────────────────────────────
  // Console-tile style matching instance card: colored header, shape+edition pill,
  // CPU+Storage chips side-by-side, AD/FD ghost chip (building icon),
  // DB schema names as small cylinder pills, footer label.
  _dbCard(x, y, item) {
    const { NW: W, NH: H, NR: R, FT, FN } = K;
    const clr    = C.db;
    const dot    = this._stClr(item.status);
    const uid    = `dc${this._uid++}`;
    const hasSub2 = !!item.sub2;
    const hasSub3 = !!item.sub3;
    const hasSub4 = !!item.sub4;
    const hasSub5 = !!item.sub5;
    const PAD  = 7;
    const CW   = W - PAD * 2;
    const HDR_H = 34;

    // ── Vertical layout ────────────────────────────────────────────────────
    let cy = y + HDR_H + 4;                        // y+38

    // 1) Shape+Edition pill (full width)
    const pillY = cy, pillH = 16;
    cy += pillH + 4;                               // → y+58

    // 2) Spec chips — OCPUs left, Storage right
    const chip2Y  = hasSub2 ? cy : 0;
    const chip2H  = 20;
    const chipGap = 4;
    const cpuW    = Math.round(CW * 0.44);
    const storW   = CW - cpuW - chipGap;
    if (hasSub2) cy += chip2H + 4;                // → y+82

    // 3) AD/FD/version — individual chips in a row
    const adRowY = hasSub3 ? cy : 0;
    const adRowH = 14;
    if (hasSub3) cy += adRowH + 4;                // → y+100

    // 4) License/workload ghost chip (sub5)
    const sub5Y = hasSub5 ? cy : 0;
    const sub5H = 14;
    if (hasSub5) cy += sub5H + 3;                 // → y+117

    // 5) DB names separator + pills
    const sep1Y   = cy + 3;                        // y+120
    const dbPillY = hasSub4 ? sep1Y + 7 : 0;      // y+127
    const dbPillH = 14;
    if (hasSub4) cy = dbPillY + dbPillH + 4;       // → y+145
    else         cy = sep1Y + 4;

    // 6) Footer — anchored relative to content (no Math.min)
    const footerSepY = cy + 5;                     // y+150
    const footerY    = footerSepY + 11;             // y+161

    // ── Micro-icon helpers ─────────────────────────────────────────────────
    // IC chip (same as instance card)
    const icoChip = (cx, icy) =>
      `<rect x="${cx-4}" y="${icy-4}" width="8" height="8" rx="0.8" style="fill:none;stroke:${clr};stroke-width:1.1;"/>` +
      `<line x1="${cx-4}" y1="${icy}" x2="${cx+4}" y2="${icy}" style="stroke:${clr};stroke-width:0.5;opacity:0.4;"/>` +
      `<line x1="${cx}" y1="${icy-4}" x2="${cx}" y2="${icy+4}" style="stroke:${clr};stroke-width:0.5;opacity:0.4;"/>` +
      `<line x1="${cx-2}" y1="${icy-6}" x2="${cx-2}" y2="${icy-4}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx+2}" y1="${icy-6}" x2="${cx+2}" y2="${icy-4}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx-2}" y1="${icy+4}" x2="${cx-2}" y2="${icy+6}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx+2}" y1="${icy+4}" x2="${cx+2}" y2="${icy+6}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx-6}" y1="${icy-2}" x2="${cx-4}" y2="${icy-2}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx-6}" y1="${icy+2}" x2="${cx-4}" y2="${icy+2}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx+4}" y1="${icy-2}" x2="${cx+6}" y2="${icy-2}" style="stroke:${clr};stroke-width:0.9;"/>` +
      `<line x1="${cx+4}" y1="${icy+2}" x2="${cx+6}" y2="${icy+2}" style="stroke:${clr};stroke-width:0.9;"/>`;

    // Mini cylinder for storage chip (cx,cy center)
    const icoCyl = (cx, icy) =>
      `<ellipse cx="${cx}" cy="${icy-3.5}" rx="5" ry="2" style="fill:none;stroke:${clr};stroke-width:0.9;"/>` +
      `<rect x="${cx-5}" y="${icy-3.5}" width="10" height="6.5" style="fill:none;stroke:${clr};stroke-width:0.8;"/>` +
      `<ellipse cx="${cx}" cy="${icy+3}" rx="5" ry="2" style="fill:none;stroke:${clr};stroke-width:0.9;"/>`;

    // Building/datacenter icon for AD row (bx = left edge, by = top edge, h=10)
    const icoDC = (bx, by) =>
      `<rect x="${bx}" y="${by}" width="10" height="9" rx="0.5" style="fill:none;stroke:${clr};stroke-width:1;"/>` +
      `<line x1="${bx}" y1="${by+4}" x2="${bx+10}" y2="${by+4}" style="stroke:${clr};stroke-width:0.5;opacity:0.45;"/>` +
      `<rect x="${bx+1.5}" y="${by+1}" width="2.5" height="2" rx="0.3" style="fill:${clr};opacity:0.4;"/>` +
      `<rect x="${bx+6}" y="${by+1}" width="2.5" height="2" rx="0.3" style="fill:${clr};opacity:0.4;"/>` +
      `<rect x="${bx+1.5}" y="${by+5}" width="2.5" height="2" rx="0.3" style="fill:${clr};opacity:0.4;"/>` +
      `<rect x="${bx+6}" y="${by+5}" width="2.5" height="2" rx="0.3" style="fill:${clr};opacity:0.4;"/>`;

    // Mini cylinder for DB name pills (inline, 8×8)
    const icoDbPill = (bx, by) =>
      `<ellipse cx="${bx+4}" cy="${by+2}" rx="3.5" ry="1.5" style="fill:none;stroke:${clr};stroke-width:0.8;opacity:0.7;"/>` +
      `<rect x="${bx+0.5}" y="${by+2}" width="7" height="4.5" style="fill:none;stroke:${clr};stroke-width:0.7;opacity:0.6;"/>` +
      `<ellipse cx="${bx+4}" cy="${by+6.5}" rx="3.5" ry="1.5" style="fill:none;stroke:${clr};stroke-width:0.8;opacity:0.7;"/>`;

    // ── Split sub2 (OCPUs · Storage) ───────────────────────────────────────
    const sub2Parts = (item.sub2 || '').split('·').map(s => s.trim());
    const cpuLabel  = sub2Parts[0] || '';
    const storLabel = sub2Parts[1] || '';

    // ── DB name pills ──────────────────────────────────────────────────────
    let dbNamesSvg = '';
    if (hasSub4 && dbPillY) {
      const names   = (item.sub4 || '').split('·').map(s => s.trim()).filter(Boolean);
      let bx = x + PAD;
      names.forEach((n, i) => {
        if (i >= 3) return;
        const lbl = this._t(n, 12);
        const pw  = Math.min(lbl.length * 5.2 + 20, 72);
        if (bx + pw > x + W - PAD) return;
        dbNamesSvg +=
          `<rect x="${bx}" y="${dbPillY}" width="${pw}" height="${dbPillH}" rx="3.5"
            style="fill:${clr};fill-opacity:0.07;stroke:${clr};stroke-width:0.6;stroke-opacity:0.22;"/>` +
          icoDbPill(bx + 2, dbPillY + 3) +
          `<text x="${bx+14}" y="${dbPillY+dbPillH-3}"
            style="font:500 7.5px/1 'Inter',monospace,sans-serif;fill:${clr};opacity:0.8;">${this._esc(lbl)}</text>`;
        bx += pw + 4;
      });
    }

    const chipMY = chip2Y ? chip2Y + chip2H / 2 + 3 : 0; // +3 alinha visualmente ícone com texto 8px

    // ── AD/FD/version individual chips ────────────────────────────────────
    const adChipItems = hasSub3
      ? (item.sub3 || '').split('·').map(s => s.trim()).filter(Boolean)
      : [];
    // Chip style per index: more opaque for AD, subtler for version
    const adChipFill   = [0.10, 0.07, 0.05, 0.05];
    const adChipStroke = [0.35, 0.25, 0.18, 0.18];
    let adChipsSvg = '';
    if (hasSub3 && adRowY) {
      let acX = x + PAD;
      adChipItems.forEach((chip, i) => {
        const pw = Math.max(chip.length * 5.8 + 12, 28);
        if (acX + pw > x + W - PAD + 2) return;
        adChipsSvg +=
          `<rect x="${acX}" y="${adRowY}" width="${pw}" height="${adRowH}" rx="3"
            style="fill:${clr};fill-opacity:${adChipFill[i]||0.05};stroke:${clr};stroke-width:0.7;stroke-opacity:${adChipStroke[i]||0.18};"/>` +
          `<text x="${acX+pw/2}" y="${adRowY+adRowH-3}" text-anchor="middle"
            style="font:600 7.5px/1 'Inter',monospace,sans-serif;fill:${clr};opacity:${i===0?0.9:i===1?0.8:0.7};">${this._esc(chip)}</text>`;
        acX += pw + 3;
      });
    }

    const tooltip = `DB System: ${item.label}` +
      (item.sub  ? ` | ${item.sub}`  : '') +
      (item.sub2 ? ` | ${item.sub2}` : '') +
      (item.sub3 ? ` | ${item.sub3}` : '') +
      (item.sub4 ? ` | DB: ${item.sub4}` : '') +
      (item.sub5 ? ` | ${item.sub5}` : '') +
      (item.status ? ` (${item.status})` : '');

    return `<g>
  <title>${this._esc(tooltip)}</title>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${R}" filter="url(#arch-shadow)"
    style="fill:var(--bg-card);stroke:${clr};stroke-width:1.4;stroke-opacity:0.3;cursor:default;"/>
  <rect x="${x}" y="${y+R}" width="4" height="${H-R*2}" style="fill:${clr};opacity:0.8;"/>
  <rect x="${x+4}" y="${y}" width="${W-4}" height="${HDR_H}" rx="0" style="fill:${clr};fill-opacity:0.13;stroke:none;"/>
  <rect x="${x}" y="${y}" width="${W}" height="${HDR_H}" rx="${R}" style="fill:${clr};fill-opacity:0.05;stroke:none;"/>
  <rect x="${x}" y="${y+HDR_H}" width="${W}" height="1" style="fill:${clr};fill-opacity:0.3;"/>
  <g transform="translate(${x+8},${y+(HDR_H-22)/2+2}) scale(${22/28})" style="color:${clr};">${SVG_ICONS.db}</g>
  ${dot ? `<circle cx="${x+W-11}" cy="${y+11}" r="5" style="fill:${dot};stroke:var(--bg-card);stroke-width:1.2;"/>` : ''}
  <defs><clipPath id="${uid}"><rect x="${x+4}" y="${y}" width="${W-5}" height="${H}"/></clipPath></defs>
  <g clip-path="url(#${uid})">
    <text x="${x+36}" y="${y+13}" dominant-baseline="middle"
      style="font:700 ${FN}px/1 'Inter',system-ui,sans-serif;fill:var(--text-primary);">${this._esc(this._t(item.label, 16))}</text>
    <text x="${x+36}" y="${y+HDR_H-7}"
      style="font:700 8px/1 'Inter',sans-serif;fill:${clr};opacity:0.8;letter-spacing:.07em;">DB SYSTEM</text>
    <!-- Shape · Edition pill -->
    ${item.sub ? `
    <rect x="${x+PAD}" y="${pillY}" width="${CW}" height="${pillH}" rx="${pillH/2}"
      style="fill:${clr};fill-opacity:0.10;stroke:${clr};stroke-width:0.8;stroke-opacity:0.40;"/>
    <text x="${x+PAD+CW/2}" y="${pillY+pillH-4}" text-anchor="middle"
      style="font:600 8.5px/1 'Inter',monospace,sans-serif;fill:${clr};">${this._esc(this._t(item.sub, 22))}</text>` : ''}
    <!-- OCPU chip (left) -->
    ${hasSub2 && chip2Y ? `
    <rect x="${x+PAD}" y="${chip2Y}" width="${cpuW}" height="${chip2H}" rx="4"
      style="fill:${clr};fill-opacity:0.10;stroke:${clr};stroke-width:0.7;stroke-opacity:0.38;"/>
    ${icoChip(x + PAD + 8, chipMY)}
    <text x="${x+PAD+18}" y="${chip2Y+chip2H-4}"
      style="font:600 8px/1 'Inter',sans-serif;fill:${clr};">${this._esc(cpuLabel)}</text>
    <!-- Storage chip (right) -->
    <rect x="${x+PAD+cpuW+chipGap}" y="${chip2Y}" width="${storW}" height="${chip2H}" rx="4"
      style="fill:${clr};fill-opacity:0.07;stroke:${clr};stroke-width:0.7;stroke-opacity:0.28;"/>
    ${icoCyl(x + PAD + cpuW + chipGap + 8, chipMY)}
    <text x="${x+PAD+cpuW+chipGap+18}" y="${chip2Y+chip2H-4}"
      style="font:600 8px/1 'Inter',sans-serif;fill:${clr};">${this._esc(storLabel)}</text>` : ''}
    <!-- AD · FD · version — chips individuais -->
    ${adChipsSvg}
    <!-- Licença · Workload ghost chip -->
    ${hasSub5 && sub5Y ? `
    <rect x="${x+PAD}" y="${sub5Y}" width="${CW}" height="${sub5H}" rx="4"
      style="fill:${clr};fill-opacity:0.08;stroke:${clr};stroke-width:0.7;stroke-opacity:0.30;"/>
    <rect x="${x+PAD}" y="${sub5Y}" width="6" height="${sub5H}" rx="4"
      style="fill:${clr};fill-opacity:0.20;stroke:none;"/>
    <rect x="${x+PAD+4}" y="${sub5Y}" width="2" height="${sub5H}"
      style="fill:${clr};fill-opacity:0.08;stroke:none;"/>
    <text x="${x+PAD+11}" y="${sub5Y+sub5H-3}"
      style="font:500 8px/1 'Inter',sans-serif;fill:var(--text-primary);opacity:0.90;">${this._esc(item.sub5)}</text>` : ''}
    <!-- DB names separator + pills -->
    ${hasSub4 ? `
    <line x1="${x+PAD}" y1="${sep1Y}" x2="${x+W-PAD}" y2="${sep1Y}"
      style="stroke:${clr};stroke-width:0.5;stroke-opacity:0.22;stroke-dasharray:4,3;"/>` : ''}
    ${dbNamesSvg}
    <!-- Footer -->
    <line x1="${x+PAD}" y1="${footerSepY}" x2="${x+W-PAD}" y2="${footerSepY}"
      style="stroke:${clr};stroke-width:0.4;stroke-opacity:0.18;stroke-dasharray:4,3;"/>
    <text x="${x+W/2}" y="${footerY}" text-anchor="middle"
      style="font:600 8px/1 'Inter',sans-serif;fill:var(--text-muted);opacity:0.55;letter-spacing:.06em;">${_i('BANCO DE DADOS', 'DATABASE')}</text>
  </g>
</g>`;
  }


  // Icon-centered node card
  _nodeCard(x, y, item) {
    if (item.kind === 'instance') return this._instCard(x, y, item);
    if (item.kind === 'db')       return this._dbCard(x, y, item);

    const { NW: W, NH: H, NR: R, ICO_SIZE, FT, FN, FS } = K;
    const clr = C[item.kind] || '#58a6ff';
    const dot = this._stClr(item.status);
    const uid = `cl${this._uid++}`;
    const cx = x + W / 2;

    // Vertical layout — adapts when sub2 / NSG badge present
    const hasNsg  = item.nsgNames && item.nsgNames.length > 0;
    const hasSub2 = !!item.sub2;

    // Compress icon area slightly when content needs more room
    const icoCy   = y + 26;
    const labelY  = icoCy + ICO_SIZE / 2 + 12;   // ~64 without compression
    const subY    = labelY + 13;
    const sub2Y   = hasSub2 ? subY + 12 : subY;
    const kindY   = sub2Y + (hasSub2 ? 13 : 11);

    // NSG pill badge — sits below kind label, 2px gap
    let nsgBadge = '';
    if (hasNsg) {
      const nsgText = item.nsgNames.length <= 2
        ? item.nsgNames.map(n => this._t(n, 14)).join(', ')
        : `${item.nsgNames.length} NSGs`;
      const lbl   = `NSG: ${nsgText}`;
      const tw    = Math.min(lbl.length * 4.8 + 10, W - 16);
      const bx    = x + (W - tw) / 2;
      const by    = kindY + 4;
      nsgBadge    = `<rect x="${bx}" y="${by}" width="${tw}" height="12" rx="3" style="fill:${C.nsg};fill-opacity:0.12;stroke:${C.nsg};stroke-width:0.7;stroke-opacity:0.5;"/>
<text x="${cx}" y="${by+9}" text-anchor="middle" style="font:600 ${FT-1}px/1 'Inter',sans-serif;fill:${C.nsg};opacity:0.9;">${this._esc(this._t(lbl, 26))}</text>`;
    }

    const tooltip = `${this._kindLbl(item.kind)}: ${item.label}${item.sub ? ' — ' + item.sub : ''}${item.status ? ' (' + item.status + ')' : ''}${hasNsg ? ' | NSG: ' + item.nsgNames.join(', ') : ''}`;
    return `<g>
  <title>${this._esc(tooltip)}</title>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${R}" filter="url(#arch-shadow)" style="fill:var(--bg-card);stroke:var(--border);stroke-width:1;cursor:default;"/>
  <circle cx="${cx}" cy="${icoCy}" r="${ICO_SIZE/2+4}" style="fill:${clr};fill-opacity:0.12;stroke:${clr};stroke-width:1;stroke-opacity:0.2;"/>
  <g transform="translate(${cx-ICO_SIZE/2},${icoCy-ICO_SIZE/2}) scale(${ICO_SIZE/28})" style="color:${clr};">${SVG_ICONS[item.kind]||SVG_ICONS.subnet}</g>
  <defs><clipPath id="${uid}"><rect x="${x+4}" y="${y}" width="${W-8}" height="${H}"/></clipPath></defs>
  <g clip-path="url(#${uid})">
    <text x="${cx}" y="${labelY}" text-anchor="middle" style="font:700 ${FN}px/1 'Inter',system-ui,sans-serif;fill:var(--text-primary);">${this._esc(item.label)}</text>
    <text x="${cx}" y="${subY}" text-anchor="middle" style="font:400 ${FS}px/1 'Inter',system-ui,sans-serif;fill:var(--text-secondary);">${this._esc(item.sub||'')}</text>
    ${hasSub2 ? `<text x="${cx}" y="${sub2Y}" text-anchor="middle" style="font:400 ${FS-1}px/1 'Inter',system-ui,sans-serif;fill:var(--text-muted);">${this._esc(item.sub2)}</text>` : ''}
    <text x="${cx}" y="${kindY}" text-anchor="middle" style="font:600 ${FT}px/1 'Inter',system-ui,sans-serif;fill:var(--text-muted);letter-spacing:.04em;text-transform:uppercase;">${this._esc(this._kindLbl(item.kind))}</text>
    ${nsgBadge}
  </g>
  ${dot ? `<circle cx="${x+W-12}" cy="${y+12}" r="4.5" style="fill:${dot};"/>` : ''}
</g>`;
  }


  // Zone background
  _zoneBg(x, y, w, h, color, label) {
    const { ZONE_R, ZONE_HDR } = K;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${ZONE_R}" style="fill:${color};fill-opacity:0.04;stroke:${color};stroke-width:1;stroke-opacity:0.25;"/>
<rect x="${x}" y="${y}" width="${w}" height="${ZONE_HDR}" rx="${ZONE_R}" style="fill:${color};fill-opacity:0.10;stroke:none;"/>
<rect x="${x}" y="${y+ZONE_HDR-1}" width="${w}" height="1.5" style="fill:${color};fill-opacity:0.25;"/>
<text x="${x+16}" y="${y+ZONE_HDR/2+5}" style="font:700 12px/1 'Inter',system-ui,sans-serif;fill:${color};letter-spacing:.10em;opacity:0.85;">${this._esc(label)}</text>`;
  }

  _orthoV(x1, y1, x2, y2, color, markerId) {
    const midY = (y1 + y2) / 2;
    return `<path d="M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}" style="fill:none;stroke:${color};stroke-width:1.6;stroke-opacity:0.45;" marker-end="url(#${markerId})"/>`;
  }

  _lineH(x1, y1, x2, y2, color, markerId) {
    return `<path d="M${x1},${y1} L${x2},${y2}" style="fill:none;stroke:${color};stroke-width:1.6;stroke-opacity:0.45;stroke-dasharray:6,3;" marker-end="url(#${markerId})"/>`;
  }


  // Gateway Node
  _gwNode(x, y, gw) {
    const { GW_NW: W, GW_NH: H, FN, FT, FS } = K;
    const clr = gw.color;
    const icoSize = 22;
    const icoX = x + 10;
    const icoY = y + H / 2 - icoSize / 2;
    const icon = SVG_ICONS[gw.type.toLowerCase()] || SVG_ICONS.subnet;
    const gwLabel = this._kindLbl(gw.type.toLowerCase());
    const tooltip = `${gwLabel}: ${gw.displayName}`;
    return `<g>
  <title>${this._esc(tooltip)}</title>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="8" filter="url(#arch-shadow)" style="fill:var(--bg-card);stroke:${clr};stroke-width:1.4;cursor:default;"/>
  <rect x="${x}" y="${y}" width="4" height="${H}" rx="2" style="fill:${clr};"/>
  <g transform="translate(${icoX},${icoY}) scale(${icoSize/28})" style="color:${clr};">${icon}</g>
  <text x="${x+38}" y="${y+18}" style="font:700 ${FN}px/1 'Inter',sans-serif;fill:${clr};">${this._esc(gw.type)}</text>
  <text x="${x+38}" y="${y+34}" style="font:400 ${FS-1}px/1 'Inter',sans-serif;fill:var(--text-secondary);">${this._esc(this._t(gw.displayName, 14))}</text>
</g>`;
  }


  // Legend panel (top-right corner)
  _renderLegend(x, y) {
    const { LEGEND_W, LEGEND_PAD, LEGEND_R, FT, FN } = K;
    const ITEM_H   = 20;
    const SEC_H    = 17; // section header row height
    const ICON_SZ  = 14;
    const ICON_SC  = ICON_SZ / 28;
    const STRIPE_W = 3;
    const label    = _i('LEGENDA', 'LEGEND');

    const groups = [
      {
        title: _i('Rede', 'Network'),
        items: [
          { color: C.subnet_pub,  label: _i('Sub-rede Pública',  'Public Subnet'),  icon: 'subnet'   },
          { color: C.subnet_priv, label: _i('Sub-rede Privada', 'Private Subnet'),  icon: 'subnet'   },
        ]
      },
      {
        title: _i('Recursos', 'Resources'),
        items: [
          { color: C.instance, label: 'Compute',       icon: 'instance' },
          { color: C.lb,       label: 'Load Balancer', icon: 'lb'       },
          { color: C.oke,      label: 'OKE',           icon: 'oke'      },
          { color: C.waf,      label: 'WAF',           icon: 'waf'      },
          { color: C.db,       label: 'DB System',     icon: 'db'       },
          { color: C.vol,      label: 'Block Volume',  icon: 'vol'      },
          { color: C.nsg,      label: 'NSG',           icon: 'nsg'      },
        ]
      },
      {
        title: _i('Gateways', 'Gateways'),
        items: [
          { color: C.igw, label: _i('Internet GW', 'Internet GW'), icon: 'igw' },
          { color: C.nat, label: _i('NAT GW', 'NAT GW'),           icon: 'nat' },
          { color: C.sgw, label: _i('Service GW', 'Service GW'),   icon: 'sgw' },
          { color: C.drg, label: 'DRG',                            icon: 'drg' },
          { color: C.lpg, label: 'LPG',                            icon: 'nsg' },
        ]
      },
      {
        title: _i('Edge / VPN', 'Edge / VPN'),
        items: [
          { color: C.ipsec, label: 'IPSec VPN', icon: 'ipsec' },
          { color: C.cpe,   label: 'CPE',        icon: 'cpe'   },
        ]
      },
    ];

    // Compute total height
    let totalRows = 0;
    groups.forEach(g => { totalRows += g.items.length; });
    const h = LEGEND_PAD * 2 + FN + 10     // title row
            + groups.length * (SEC_H + 2)  // section headers + gaps
            + totalRows * ITEM_H
            + (groups.length - 1) * 4;     // divider gaps

    // Background card
    this.els.push(
      `<rect x="${x}" y="${y}" width="${LEGEND_W}" height="${h}" rx="${LEGEND_R}" filter="url(#arch-shadow)"
         style="fill:var(--bg-card);stroke:var(--border);stroke-width:1;opacity:0.94;"/>` +
      `<text x="${x + LEGEND_PAD}" y="${y + LEGEND_PAD + FN}"
         style="font:700 ${FN}px/1 'Inter',sans-serif;fill:var(--text-muted);letter-spacing:.10em;">${this._esc(label)}</text>` +
      `<line x1="${x + LEGEND_PAD}" y1="${y + LEGEND_PAD + FN + 4}" x2="${x + LEGEND_W - LEGEND_PAD}" y2="${y + LEGEND_PAD + FN + 4}"
         style="stroke:var(--border);stroke-width:0.8;stroke-opacity:0.7;"/>`
    );

    let iy = y + LEGEND_PAD + FN + 10;

    groups.forEach((group, gi) => {
      // Section label
      this.els.push(
        `<text x="${x + LEGEND_PAD}" y="${iy + FT + 1}"
           style="font:700 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);opacity:0.55;letter-spacing:.07em;text-transform:uppercase;">${this._esc(group.title)}</text>`
      );
      iy += SEC_H;

      group.items.forEach(item => {
        const cy      = iy + ITEM_H / 2;
        const ix      = x + LEGEND_PAD;
        const iconY   = cy - ICON_SZ / 2;
        this.els.push(
          `<rect x="${ix}" y="${iy + 2}" width="${STRIPE_W}" height="${ITEM_H - 4}" rx="1.5" style="fill:${item.color};opacity:0.85;"/>` +
          `<g transform="translate(${ix + STRIPE_W + 4},${iconY}) scale(${ICON_SC})" style="color:${item.color};">${SVG_ICONS[item.icon]}</g>` +
          `<text x="${ix + STRIPE_W + 4 + ICON_SZ + 5}" y="${cy + 4}"
             style="font:400 ${FT}px/1 'Inter',sans-serif;fill:var(--text-secondary);">${this._esc(item.label)}</text>`
        );
        iy += ITEM_H;
      });

      if (gi < groups.length - 1) {
        iy += 3;
        this.els.push(
          `<line x1="${x + LEGEND_PAD}" y1="${iy}" x2="${x + LEGEND_W - LEGEND_PAD}" y2="${iy}"
             style="stroke:var(--border);stroke-width:0.7;stroke-opacity:0.4;stroke-dasharray:4,3;"/>`
        );
        iy += 5;
      }
    });
  }


  /* ══════════════════════════════════════════════════════════════════════════
     NODE DESCRIPTORS
  ══════════════════════════════════════════════════════════════════════════ */
  _descInst(i) {
    let priv = i.private_ip || '';
    let pub = (i.public_ip && i.public_ip !== 'N/A') ? i.public_ip : '';
    // Support vnic_attachments format as well
    if (!priv && i.vnic_attachments && i.vnic_attachments.length > 0) {
      const vnic = i.vnic_attachments[0];
      priv = vnic.private_ip || '';
      if (!pub && vnic.public_ip && vnic.public_ip !== 'N/A') pub = vnic.public_ip;
    }
    const hostName = i.host_name || i.display_name || 'instance';
    const nsgNames = (i.network_security_groups || []).map(n => n.name).filter(Boolean);
    const shape = this._shapeShort(i.shape);
    // CPU + Memory badge
    const ocpus = i.ocpus && String(i.ocpus) !== 'N/A' ? String(i.ocpus) : '';
    const mem   = i.memory && String(i.memory) !== 'N/A' ? String(i.memory) : '';
    const sub2  = [ocpus ? ocpus + ' vCPUs' : '', mem ? mem + ' GB RAM' : ''].filter(Boolean).join(' · ') || undefined;
    // OS
    const osRaw = i.os_name || '';
    const sub3  = osRaw && osRaw !== 'N/A' ? this._t(osRaw, 22) : undefined;
    return {
      id: hostName, kind: 'instance',
      label: this._t(hostName, 18),
      sub: shape,
      sub2,
      sub3,
      privIp: priv || undefined,
      pubIp: pub || undefined,
      status: i.lifecycle_state || i.state,
      nsgNames: nsgNames.length > 0 ? nsgNames : undefined,
    };
  }

  _descLb(lb) {
    const ip = (lb.ip_addresses || []).filter(a => a && a.ip_address).map(a => a.ip_address)[0] || '';
    return {
      id: lb.id || lb.display_name, kind: 'lb',
      label: this._t(lb.display_name, 18),
      sub: ip || `${lb.listeners?.length || 0} listeners`,
      status: lb.lifecycle_state
    };
  }

  _descDb(db) {
    // Shape badge (e.g. "VM.Standard2.2")
    const shape = this._shapeShort(db.shape);
    // Edition badge (e.g. "ENTERPRISE_EDITION" → "Enterprise")
    const edition = db.database_edition
      ? db.database_edition.replace(/_EDITION$/i, '').replace(/_/g, ' ')
          .replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      : '';
    // CPU + storage summary
    const cpuInfo  = db.cpu_core_count ? `${db.cpu_core_count} OCPUs` : '';
    const storInfo = db.data_storage_size_in_gbs ? `${db.data_storage_size_in_gbs} GB` : '';
    const sub  = [shape, edition].filter(Boolean).join(' · ');
    const sub2 = [cpuInfo, storInfo].filter(Boolean).join(' · ')
      || this._dbNames(db).slice(0, 2).join(', ')
      || '';
    // Availability Domain — shorten e.g. "vbDN:BR-SAOPAULO-1-AD-1" → "AD-1"
    const adRaw = db.availability_domain || '';
    const adShort = adRaw ? (adRaw.match(/AD-\d+$/i)?.[0] || adRaw.split(':').pop()?.split('-').slice(-2).join('-') || adRaw) : '';
    // Fault Domains
    const fds = (db.fault_domains || []).filter(Boolean);
    const fdShort = fds.length ? fds.map(f => f.replace(/^FAULT.DOMAIN.?/i, 'FD-')).join(', ') : '';
    // DB version (short)
    const ver = db.version && db.version !== 'N/A' ? db.version.split('.').slice(0,2).join('.') : '';
    // Node count
    const nodeCount = db.node_count > 1 ? `${db.node_count} nós` : '';
    const sub3 = [adShort, fdShort, ver ? `v${ver}` : '', nodeCount].filter(Boolean).join(' · ') || undefined;
    const dbNamesList = this._dbNames(db).slice(0, 3);
    const sub4 = dbNamesList.length ? dbNamesList.join(' · ') : undefined;
    // License model
    const licRaw = db.license_model || '';
    const licLabel = licRaw === 'LICENSE_INCLUDED'   ? _i('Lic. Inclusa', 'License Incl.')
                   : licRaw === 'BRING_YOUR_OWN_LICENSE' ? 'BYOL'
                   : '';
    // DB workload from first database
    let wkl = '';
    outerWkl: for (const home of (db.db_homes || [])) {
      for (const d of (home.databases || [])) {
        if (d.db_workload && d.db_workload !== 'N/A') { wkl = d.db_workload; break outerWkl; }
      }
    }
    // Node count label (for RAC)
    const nodeLabel = db.node_count > 1 ? `${db.node_count} nodes` : '';
    // Hostname (short)
    const hostLabel = db.hostname && db.hostname !== 'N/A' ? db.hostname.split('.')[0] : '';
    const sub5Parts = [licLabel, wkl, nodeLabel].filter(Boolean);
    const sub5 = sub5Parts.length ? sub5Parts.join(' · ') : undefined;
    // sub6: hostname if useful
    const sub6 = hostLabel || undefined;
    return {
      id: db.id || db.display_name, kind: 'db',
      label: this._t(db.display_name, 18),
      sub: sub || (db.db_workload || ''),
      sub2: sub2 || undefined,
      sub3,
      sub4,
      sub5,
      sub6,
      status: db.lifecycle_state
    };
  }

  _dbNames(db) {
    const names = [];
    (db.db_homes || []).forEach(home => {
      (home.databases || []).forEach(d => { if (d.db_name) names.push(d.db_name); });
    });
    return names;
  }

  _descWaf(p) {
    const r = (p.access_control_rules?.length||0)+(p.protection_rules?.length||0)+(p.rate_limiting_rules?.length||0);
    const ruleLabel = _i('regra', 'rule');
    return { id: p.id, kind: 'waf', label: this._t(p.display_name, 18), sub: `${r} ${ruleLabel}${r!==1?'s':''}`, status: p.lifecycle_state };
  }

  _descCert(c) {
    const sans = c.subject_alternative_names || [];
    const firstSan = (sans[0] && typeof sans[0] === 'object') ? (sans[0].value||sans[0].name||'') : (sans[0]||'');
    const domain = firstSan || (c.subject && typeof c.subject === 'object' ? c.subject.common_name : '') || '';
    const name = c.name || (c.display_name && typeof c.display_name === 'string' ? c.display_name : '') || _i('Certificado', 'Certificate');
    return { id: c.id, kind: 'cert', label: this._t(name, 18), sub: this._t(domain, 24), status: c.lifecycle_state };
  }


  // Gateway helpers
  _getGwRules(vcn, subnet) {
    if (!subnet.route_table_id || !vcn.route_tables) return [];
    const rt = vcn.route_tables.find(t => t.id === subnet.route_table_id);
    if (!rt) return [];
    return (rt.rules || []).filter(r => r.target && this._isGwTarget(r.target));
  }

  _isGwTarget(target) {
    return /Internet Gateway|NAT Gateway|Service Gateway|Dynamic Routing|DRG|Local Peering/i.test(target);
  }

  _gwShort(t) {
    if (!t) return '?';
    if (/Internet Gateway/i.test(t)) return 'IGW';
    if (/NAT Gateway/i.test(t)) return 'NAT';
    if (/Service Gateway/i.test(t)) return 'SGW';
    if (/Dynamic Routing|DRG/i.test(t)) return 'DRG';
    if (/Local Peering/i.test(t)) return 'LPG';
    return this._t(t, 6);
  }

  _gwColor(gw) {
    return { IGW: C.igw, NAT: C.nat, SGW: C.sgw, DRG: C.drg, LPG: C.lpg }[gw] || '#58a6ff';
  }

  _gwMarker(gw) {
    return { IGW: 'arch-arr-green', NAT: 'arch-arr-orange', SGW: 'arch-arr-purple' }[gw] || 'arch-arr-blue';
  }

  _extractVcnGateways(vcn) {
    const seen = new Map();
    const order = { IGW: 0, NAT: 1, SGW: 2 };
    (vcn.route_tables || []).forEach(rt => {
      (rt.rules || []).forEach(rule => {
        if (!rule.target || !this._isGwTarget(rule.target)) return;
        const type = this._gwShort(rule.target);
        if (type === 'DRG' || type === 'LPG') return;
        if (seen.has(rule.target)) return;
        const nameMatch = rule.target.match(/^(.+?)\s*\(.*\)$/);
        const displayName = nameMatch ? nameMatch[1].trim() : rule.target;
        seen.set(rule.target, {
          key: 'gw_' + (vcn.id || '').slice(-8) + '_' + rule.target.replace(/[^a-zA-Z0-9]/g, '_'),
          type, displayName,
          color: this._gwColor(type),
          fullTarget: rule.target,
          sortOrder: order[type] ?? 9,
        });
      });
    });
    return Array.from(seen.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  _buildGwConnections(vcn, subnets) {
    const conns = [];
    subnets.forEach(s => {
      const rules = this._getGwRules(vcn, s.subnet);
      rules.forEach(rule => {
        const type = this._gwShort(rule.target);
        if (type === 'DRG' || type === 'LPG') return;
        conns.push({
          subnetId: s.subnet.id,
          gwKey: 'gw_' + (vcn.id || '').slice(-8) + '_' + rule.target.replace(/[^a-zA-Z0-9]/g, '_'),
          destination: rule.destination,
          type,
          vcnId: vcn.id,
        });
      });
    });
    return conns;
  }


  // Helpers
  _typeTag() {
    return {
      full_infra: _i('Infraestrutura Completa', 'Full Infrastructure'),
      resumo_infra: _i('Resumo da Infraestrutura', 'Infrastructure Summary'),
      new_host: 'New Host',
      kubernetes: 'Kubernetes / OKE',
      waf_report: _i('Relatório WAF', 'WAF Report'),
    }[this.dt] || this.dt;
  }

  _kindLbl(k) {
    const labels = {
      instance: 'Compute', lb: 'Load Balancer', drg: 'DRG', oke: 'OKE',
      waf: 'WAF', cert: _i('Certificado', 'Certificate'),
      ipsec: 'IPSec VPN', cpe: 'CPE', vg: 'Vol. Group', vol: 'Block Vol.',
      igw: _i('Internet GW', 'Internet GW'),
      nat: _i('NAT GW', 'NAT GW'),
      sgw: _i('Service GW', 'Service GW'),
      db: _i('Banco de Dados', 'Database'),
    };
    return labels[k] || k;
  }

  _ipsecSub(ipsec) {
    const tunnels = ipsec.tunnels || [];
    const up = tunnels.filter(t => (t.status || '').toUpperCase() === 'UP').length;
    const down = tunnels.filter(t => (t.status || '').toUpperCase() !== 'UP').length;
    const parts = [];
    if (up > 0) parts.push(`${up} UP`);
    if (down > 0) parts.push(`${down} DOWN`);
    return parts.join(' / ') || _i('Sem túneis', 'No tunnels');
  }

  _stClr(s) {
    if (!s) return null;
    switch ((s+'').toUpperCase()) {
      case 'RUNNING': case 'ACTIVE': case 'AVAILABLE': case 'UP':    return '#3fb950';
      case 'STOPPED': case 'FAILED': case 'TERMINATED': case 'DOWN': return '#f85149';
      case 'PROVISIONING': case 'CREATING': case 'STARTING':         return '#58a6ff';
      case 'STOPPING': case 'TERMINATING':                           return '#f0883e';
      case 'PENDING_DELETION':                                       return '#e3b341';
      default: return null;
    }
  }
  _shapeShort(s) { if (!s) return ''; const p = s.split('.'); return p.length >= 3 ? p.slice(-2).join('.') : s; }

  // Shorten OCI service CIDR names for display on arrows.
  // IP CIDRs (like "10.x.x.x/y", "0.0.0.0/0") are returned unchanged.
  // OCI service gateway CIDRs (like "all-iad-services-in-oracle-services-network") get
  // a human-readable form. The full original text is preserved in tooltips.
  _shortenDest(dest) {
    if (!dest) return '';
    // IP CIDR patterns — keep as-is
    if (/^\d{1,3}\.\d{1,3}\./.test(dest) || dest === '0.0.0.0/0' || dest === '::/0') return dest;
    // OCI service CIDR names
    if (/^all-.+-services-in-oracle-services-network$/i.test(dest)) return _i('Todos Serv. OCI', 'All OCI Services');
    if (/^oci-.+-objectstorage$/i.test(dest)) return _i('Obj. Storage', 'Obj. Storage');
    if (/^all-.+-services$/i.test(dest)) return _i('Todos os Serviços', 'All Services');
    // Generic: strip region token and make it readable
    // e.g. "oci-iad-somethinglong" → keep as is if short enough, else abbreviate
    if (dest.length > 24) return dest.slice(0, 22) + '\u2026';
    return dest;
  }

  _t(s, n) { s = s ? String(s) : ''; return s.length > n ? s.slice(0,n-1)+'\u2026' : s; }
  _esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
}
