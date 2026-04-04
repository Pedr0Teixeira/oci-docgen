// ===========================================================================
//  OCI Architecture Diagram — Horizontal Flow Layout
//  Cloud(left) / On-Premises(right), subnets stacked, gateways lateral
// ===========================================================================
'use strict';

/* ─── Public API ─────────────────────────────────────────────────────────── */
window.renderOciDiagram = function (data, docType) {
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


/* ─── PNG Export (4K resolution) ────────────────────────────────────────── */
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'oci-topology.png';
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


/* ─── Layout Constants ──────────────────────────────────────────────────── */
const K = {
  W: 2000, MARG: 32,
  VGAP: 28, HGAP: 20, COL_GAP: 24,
  // Node cards  (NH_NSG=140 used when NSG is present, but we use 134 as base with NSG badge)
  NW: 160, NH: 130, NR: 10,
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
  ARROW_GAP: 160,
  // Cloud / On-Premises horizontal split
  CLOUD_RATIO: 0.62, ZONE_SEP: 40, ZONE_HDR_H: 28,
  // Legend panel
  LEGEND_W: 190, LEGEND_PAD: 10, LEGEND_ITEM_H: 20, LEGEND_R: 8,
};

/* ─── Service Colors ────────────────────────────────────────────────────── */
const C = {
  instance: '#f89e2a', lb: '#a371f7', vcn: '#2f81f7', drg: '#58a6ff',
  oke: '#4cc9f0', waf: '#f85149', cert: '#d4a017', ipsec: '#d29922',
  cpe: '#848d97', vol: '#3fb950', vg: '#3fb950', subnet: '#388bfd',
  lpg: '#3fb950', nsg: '#e3b341', rt: '#58a6ff', sl: '#d29922',
  igw: '#3fb950', nat: '#f0883e', sgw: '#a371f7', rpc: '#4cc9f0',
  // Public/private subnet differentiation
  subnet_pub: '#3fb950', subnet_priv: '#388bfd',
  // Layout zones
  cloud_zone: '#2f81f7', onprem_zone: '#848d97',
};

/* ─── i18n helper ───────────────────────────────────────────────────────── */
function _lang() {
  return (typeof currentLanguage !== 'undefined' && currentLanguage === 'en') ? 'en' : 'pt';
}
function _i(pt, en) { return _lang() === 'en' ? en : pt; }

/* ─── SVG Icons (28×28 coord space) ─────────────────────────────────────── */
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
<circle cx="14" cy="14" r="3.8" fill="none" stroke="currentColor" stroke-width="1.8"/>
<line x1="5.5" y1="9" x2="10.8" y2="12.2" stroke="currentColor" stroke-width="1.8"/>
<line x1="22.5" y1="9" x2="17.2" y2="12.2" stroke="currentColor" stroke-width="1.8"/>
<line x1="5.5" y1="19" x2="10.8" y2="15.8" stroke="currentColor" stroke-width="1.8"/>
<line x1="22.5" y1="19" x2="17.2" y2="15.8" stroke="currentColor" stroke-width="1.8"/>`,
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
  igw: `<circle cx="14" cy="14" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/>
<line x1="14" y1="4" x2="14" y2="24" stroke="currentColor" stroke-width="1.5"/>
<line x1="4" y1="14" x2="24" y2="14" stroke="currentColor" stroke-width="1.5"/>
<line x1="7" y1="7" x2="21" y2="21" stroke="currentColor" stroke-width="1.3"/>
<line x1="21" y1="7" x2="7" y2="21" stroke="currentColor" stroke-width="1.3"/>`,
  nat: `<rect x="2" y="6" width="24" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M8 17 L8 11 L14 14 L14 11 L20 14 L14 17 L14 14 L8 17Z" fill="currentColor" opacity="0.8"/>`,
  sgw: `<path d="M14 2 L25 7 L25 16 C25 22 20.5 26 14 27.5 C7.5 26 3 22 3 16 L3 7 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
<circle cx="14" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M11 15 L13 17 L17 13" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
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
    return _i('Topologia de Rede', 'Network Topology');
  }

  _defs() {
    const arrows = [
      ['arch-arr-gray',  'var(--border-muted,#3d444d)'],
      ['arch-arr-blue',  '#58a6ff'], ['arch-arr-amber', '#d29922'],
      ['arch-arr-cyan',  '#4cc9f0'], ['arch-arr-red',   '#f85149'],
      ['arch-arr-purple','#a371f7'], ['arch-arr-green', '#3fb950'],
      ['arch-arr-orange','#f0883e'],
    ].map(([id, fill]) =>
      `<marker id="${id}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <path d="M0,0 L0,8 L8,4 Z" fill="${fill}" opacity="0.7"/>
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
      || ipsecs.length || cpes.length || storage.length || (D.kubernetes_clusters || []).length;
    if (!hasContent) return null;

    return { edge, vcns, floatingLbs, floatingInstances, ipsecs, cpes, storage };
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

    // Start Y below zone header labels
    let y = MARG + (hasOnPrem ? ZONE_HDR_H + 8 : 0);

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

    // 4) Floating instances
    if (topo.floatingInstances.length) {
      vcnEndY = this._layFloatingRow(topo.floatingInstances.map(i => this._descInst(i)),
        MARG, vcnEndY, vcnLayoutW, _i('COMPUTE (SEM SUBNET)', 'COMPUTE (NO SUBNET)'), C.instance);
      vcnEndY += VGAP;
    }

    // 5) Storage
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


  /* ── IPSec nodes — vertical column, right side of Cloud zone ─────────── */
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


  /* ── CPE nodes (On-Premises zone — right panel) ────────────────────────── */
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

    // Unmatched CPEs stacked below
    const matched = new Set(ipsecs.map(i => i.cpe_id).filter(Boolean));
    let uy = maxBottom > 0 ? maxBottom + VGAP : (K.MARG + K.ZONE_HDR_H + 8);
    cpes.filter(c => !matched.has(c.id)).forEach(cpe => {
      const cx = onpremX + Math.max(0, (onpremW - CW) / 2);
      this.els.push(this._cpeNode(cx, uy, cpe, CW));
      this._pos[cpe.id] = { cx: cx + CW/2, cy: uy + CH/2, x: cx, y: uy, w: CW, h: CH };
      uy += CH + VGAP;
    });

    return Math.max(maxBottom, uy);
  }


  /* ── Vertical separator: Cloud OCI | On-Premises ─────────────────────── */
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


  /* ── Tunnel line (horizontal, IPSec ↔ CPE) ───────────────────────────── */
  _tunnelLine(x1, y, x2, _y2, up, down) {
    const clr = down === 0 && up > 0 ? '#3fb950' : up === 0 && down > 0 ? '#f85149' : '#e3b341';
    const dash = down > 0 ? 'stroke-dasharray:8,4;' : '';
    const lbl = up > 0 && down > 0 ? `${up}\u2191 ${down}\u2193` : up > 0 ? `${up} UP` : `${down} DOWN`;
    const mx = (x1 + x2) / 2, bW = 68, bH = 20;
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" style="stroke:${clr};stroke-width:2;${dash}"/>
<rect x="${mx - bW/2}" y="${y - bH/2}" width="${bW}" height="${bH}" rx="5" style="fill:var(--bg-main);stroke:${clr};stroke-width:1.2;"/>
<text x="${mx}" y="${y + 4}" text-anchor="middle" style="font:700 ${K.FS}px/1 'Inter',sans-serif;fill:${clr};">${this._esc(lbl)}</text>`;
  }


  /* ── Edge Security Row ────────────────────────────────────────────────── */
  _layEdgeRow(items, x, y, w) {
    const nodes = items.map(item => item.type === 'waf' ? this._descWaf(item.data) : this._descCert(item.data));
    return this._layFloatingRow(nodes, x, y, w, _i('SEGURANÇA', 'SECURITY'), C.waf);
  }


  /* ── Floating row (generic) ───────────────────────────────────────────── */
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


  /* ── On-Premises column (vertical stack) ─────────────────────────────── */
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


  /* ── CPE column (On-Premises) ─────────────────────────────────────────── */
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


  /* ── Pre-measure VCN max width (without rendering) ────────────────────── */
  _measureVcnMaxWidth(vcnTopos) {
    const { VCN_PAD, SUB_PAD, SUB_MIN_W, NW, HGAP, GW_NW, ARROW_GAP } = K;
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
      const vcnW = Math.max(maxSubW + gwColW + VCN_PAD * 2, 400);
      return Math.max(maxW, vcnW);
    }, 200);
  }


  /* ── VCN Containers ───────────────────────────────────────────────────── */
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
            this._drgConns.push({ subnetId: s.subnet.id, drgId, destination: rule.destination });
          }
        });
      });
    });
    // Map each DRG id to the VCN DRG uid (for connection lookup after column render)
    this._drgVcnMap = {};
    measured.forEach(m => {
      if (m.hasDrg) this._drgVcnMap[m.vt.drg.id] = m.vt.drg.id;
    });

    // Render VCNs stacked vertically
    let vy = y;
    measured.forEach(m => {
      const w = Math.min(m.vcnW, totalW);
      const vx = x;
      const h = this._renderVcn(m, vx, vy, w);
      vy += h + K.VCN_GAP;
    });
    return vy - K.VCN_GAP;
  }


  /* ── Render a single VCN (horizontal flow layout) ────────────────────── */
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
        this._renderLpg(lpg, lx, lpgY);
      });
    }

    // --- Unplaced items ---
    if (m.vt.unplaced.length > 0) {
      const upY = y + h - VCN_PAD - NH - (m.lpgH > 0 ? LPG_H + 12 : 0);
      m.vt.unplaced.forEach((item, i) => {
        const nx = x + VCN_PAD + i * (NW + HGAP);
        const node = item.type === 'instance' ? this._descInst(item.data) : { id: 'u_' + i, kind: item.type, label: '?', sub: '' };
        this.els.push(this._nodeCard(nx, upY, node));
        this._pos[node.id] = { cx: nx+NW/2, cy: upY+NH/2, x: nx, y: upY, w: NW, h: NH };
      });
    }

    return h;
  }


  /* ── Render Subnet ────────────────────────────────────────────────────── */
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


  /* ── DRG badge ────────────────────────────────────────────────────────── */
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


  /* ── RPC badge ────────────────────────────────────────────────────────── */
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


  /* ── LPG badge ───────────────────────────────────────────────────────── */
  _renderLpg(lpg, x, y) {
    const { LPG_W: W, LPG_H: H, FT, FS } = K;
    const sc = lpg.peering_status === 'PEERED' ? C.lpg : '#e3b341';
    const peerVcn = lpg.peer_vcn_name ? `Peer: ${this._t(lpg.peer_vcn_name, 18)}` : '';
    const peerCidr = lpg.peer_advertised_cidr || '';
    const crossTenancy = lpg.is_cross_tenancy_peering ? ' (Cross-Tenancy)' : '';
    const line2 = [peerVcn, peerCidr].filter(Boolean).join(' \u00b7 ') + crossTenancy;
    const ocidShort = lpg.id ? '...' + lpg.id.slice(-8) : '';

    const lpgTip = `${_i('Gateway de Peering Local','Local Peering Gateway')}: ${lpg.display_name}${lpg.peer_vcn_name ? ' — Peer VCN: ' + lpg.peer_vcn_name : ''} (${lpg.peering_status || 'N/A'})`;
    this.els.push(`<g><title>${this._esc(lpgTip)}</title>
<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6" style="fill:var(--bg-card);stroke:${sc};stroke-width:1.2;cursor:default;"/>
<circle cx="${x+12}" cy="${y+14}" r="5" style="fill:${sc};"/>
<text x="${x+24}" y="${y+12}" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);text-transform:uppercase;">LPG</text>
<text x="${x+50}" y="${y+12}" style="font:600 ${FS}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(lpg.display_name,20))}</text>
<text x="${x+W-8}" y="${y+12}" text-anchor="end" style="font:400 ${FT-1}px/1 'Inter',sans-serif;fill:var(--text-muted);">${this._esc(lpg.peering_status||'')}</text>
<text x="${x+24}" y="${y+28}" style="font:400 ${FT}px/1 'Inter',sans-serif;fill:var(--text-secondary);">${this._esc(this._t(line2, 36))}</text>
<text x="${x+24}" y="${y+42}" style="font:400 ${FT-1}px/1 'Inter',monospace,sans-serif;fill:var(--text-muted);opacity:0.6;">${this._esc(ocidShort)}</text>
</g>`);
    this._pos['lpg_' + lpg.id] = { cx: x+W/2, cy: y+H/2, x, y, w: W, h: H };
  }


  /* ── CPE node ─────────────────────────────────────────────────────────── */
  _cpeNode(x, y, cpe, nodeW) {
    const W = nodeW || K.CW;
    const { CH: H, NR: R, FN, FS, FT, ICO_SIZE } = K;
    const clr = C.cpe;
    const cx = x + W / 2;
    const icoCy = y + 30;
    const cpeTip = `CPE On-Premises: ${cpe.display_name} — IP: ${cpe.ip_address || 'N/A'}${cpe.vendor && cpe.vendor !== 'N/A' ? ' — Vendor: ' + cpe.vendor : ''}`;
    return `<g>
  <title>${this._esc(cpeTip)}</title>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${R}" filter="url(#arch-shadow)" style="fill:var(--bg-card);stroke:${clr};stroke-width:1.4;cursor:default;"/>
  <circle cx="${cx}" cy="${icoCy}" r="${ICO_SIZE/2+4}" style="fill:${clr};fill-opacity:0.10;"/>
  <g transform="translate(${cx-ICO_SIZE/2},${icoCy-ICO_SIZE/2}) scale(${ICO_SIZE/28})" style="color:${clr};">${SVG_ICONS.cpe}</g>
  <text x="${cx}" y="${y+62}" text-anchor="middle" style="font:700 ${FN}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(cpe.display_name,22))}</text>
  <text x="${cx}" y="${y+76}" text-anchor="middle" style="font:400 ${FS}px/1 'Inter',sans-serif;fill:var(--text-secondary);">IP: ${this._esc(cpe.ip_address||'N/A')}</text>
  ${cpe.vendor && cpe.vendor !== 'N/A' ? `<text x="${cx}" y="${y+90}" text-anchor="middle" style="font:400 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);">${this._esc(cpe.vendor)}</text>` : ''}
  <text x="${cx}" y="${y+H-4}" text-anchor="middle" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);text-transform:uppercase;">CPE On-Premises</text>
</g>`;
  }


  /* ── Storage Row ──────────────────────────────────────────────────────── */
  _layStorageRow(items, x, y, w) {
    const nodes = items.map(item => {
      if (item.type === 'vg') {
        const v = item.data;
        return { id: v.id, kind: 'vg', label: this._t(v.display_name, 18), sub: `${v.members?.length||0} volumes`, status: v.lifecycle_state };
      }
      const v = item.data;
      return { id: v.id, kind: 'vol', label: this._t(v.display_name, 18), sub: `${v.size_in_gbs||0} GB`, status: v.lifecycle_state };
    });
    return this._layFloatingRow(nodes, x, y, w, _i('ARMAZENAMENTO', 'STORAGE'), C.vol);
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
   */
  _drawGwConnections() {
    // Merge subnet→gateway and subnet→DRG into one unified list
    const gwConns  = this._gwConns  || [];
    const drgConns = (this._drgConns || []).map(dc => ({
      subnetId: dc.subnetId, gwKey: dc.drgId, type: 'DRG', destination: dc.destination
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

    const THRESHOLD = 3, SDEP = 22, SARR = 22, JR = 4, LBL_GAP = 10;

    // Stagger Y at arrivals (by gateway, sort by subnet Y top→bottom)
    const byGw = {};
    resolved.forEach(c => { (byGw[c.gwKey] = byGw[c.gwKey] || []).push(c); });
    Object.values(byGw).forEach(a => a.sort((a, b) => a.sp.y - b.sp.y));

    // Stagger Y at departures (by subnet, sort by gateway Y top→bottom)
    const bySub = {};
    resolved.forEach(c => { (bySub[c.subnetId] = bySub[c.subnetId] || []).push(c); });
    Object.values(bySub).forEach(a => a.sort((a, b) => a.gp.y - b.gp.y));

    const getKey = c => c.subnetId + '|' + c.gwKey;
    const arrYOf = {}, depYOf = {};
    Object.values(byGw).forEach(arr => {
      const n = arr.length;
      arr.forEach((c, i) => { arrYOf[getKey(c)] = c.gp.cy + (i - (n-1)/2) * SARR; });
    });
    Object.values(bySub).forEach(arr => {
      const n = arr.length;
      arr.forEach((c, i) => { depYOf[getKey(c)] = c.sp.cy + (i - (n-1)/2) * SDEP; });
    });

    const paths = resolved.map(c => ({
      ...c, depY: depYOf[getKey(c)], arrY: arrYOf[getKey(c)]
    }));

    // One fixed lane per GATEWAY TYPE per VCN (group by sp.x = same VCN start X)
    const byVcn = {};
    paths.forEach(p => { (byVcn[p.sp.x] = byVcn[p.sp.x] || []).push(p); });

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

    // Collapsed gateways → one summary arrow + count badge
    const collapsedGws = new Set(
      Object.entries(byGw).filter(([,a]) => a.length > THRESHOLD).map(([k]) => k)
    );
    Object.entries(byGw).forEach(([gwKey, arr]) => {
      if (!collapsedGws.has(gwKey)) return;
      const rep  = arr[0];
      const avgY = Math.round(arr.reduce((s, c) => s + c.sp.cy, 0) / arr.length);
      const { gp, color, marker, midX, subRightMax } = rep;
      const d    = `M${subRightMax},${avgY} L${midX},${avgY} L${midX},${gp.cy} L${gp.x},${gp.cy}`;
      const lbl  = `${arr.length} ${_i('rotas', 'routes')}`;
      const tw   = lbl.length * 5.5 + 14;
      const lx   = subRightMax + LBL_GAP + tw / 2;
      this.conn.push(
        `<path d="${d}" style="fill:none;stroke:${color};stroke-width:1.8;stroke-opacity:0.72;" marker-end="url(#${marker})"/>` +
        `<rect x="${lx-tw/2}" y="${avgY-8}" width="${tw}" height="14" rx="3" style="fill:var(--bg-main);stroke:${color};stroke-width:1;stroke-opacity:0.7;"/>` +
        `<text x="${lx}" y="${avgY+3}" text-anchor="middle" style="font:700 ${K.FT}px/1 'Inter',sans-serif;fill:${color};opacity:0.9;">${this._esc(lbl)}</text>`
      );
    });

    // Individual arrows — CIDR label on H1 departure side at depY
    const indiv = paths.filter(p => !collapsedGws.has(p.gwKey));
    indiv.forEach(pA => {
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
      const d = `M${pA.sp.x+pA.sp.w},${pA.depY}` +
                hSeg(pA.midX, pA.depY, h1J) +
                ` L${pA.midX},${pA.arrY}` +
                hSeg(pA.gp.x, pA.arrY, h2J);
      this.conn.push(
        `<path d="${d}" style="fill:none;stroke:${pA.color};stroke-width:1.8;stroke-opacity:0.72;" marker-end="url(#${pA.marker})"/>`
      );
      if (pA.destination) {
        const tw = Math.min(pA.destination.length * 5.5 + 12, 110);
        const lx = Math.round(pA.sp.x + pA.sp.w + LBL_GAP + tw / 2);
        this.conn.push(
          `<rect x="${lx-tw/2}" y="${pA.depY-8}" width="${tw}" height="14" rx="3" style="fill:var(--bg-main);stroke:${pA.color};stroke-width:0.8;stroke-opacity:0.6;"/>` +
          `<text x="${lx}" y="${pA.depY+3}" text-anchor="middle" style="font:600 ${K.FT}px/1 'Inter',sans-serif;fill:${pA.color};opacity:0.9;">${this._esc(pA.destination)}</text>`
        );
      }
    });
  }

  /** DRG route connections are merged into _drawGwConnections. */
  _drawDrgRouteConnections() {}


  /* ══════════════════════════════════════════════════════════════════════════
     SVG RENDERERS
  ══════════════════════════════════════════════════════════════════════════ */

  /* ── Instance card — redesigned layout with separate IP rows and NSG badge ─ */
  _instCard(x, y, item) {
    const { NW: W, NH: H, NR: R, ICO_SIZE, FT, FN, FS } = K;
    const clr = C.instance;
    const dot = this._stClr(item.status);
    const uid = `cl${this._uid++}`;
    const cx  = x + W / 2;

    const hasNsg = item.nsgNames && item.nsgNames.length > 0;
    const hasPub = !!item.pubIp;

    // Adaptive vertical layout
    const icoCy  = y + 24;
    const sepY   = icoCy + ICO_SIZE / 2 + 4;   // thin divider below icon
    const nameY  = sepY + 11;
    const shapeY = nameY + 12;
    const privY  = shapeY + 12;
    const pubY   = hasPub ? privY + 11 : privY;
    const kindY  = (hasPub ? pubY : privY) + 13;

    // NSG pill badge with shield icon
    let nsgBadge = '';
    if (hasNsg) {
      const nsgText = item.nsgNames.length <= 2
        ? item.nsgNames.map(n => this._t(n, 12)).join(', ')
        : `${item.nsgNames.length} NSGs`;
      const lbl = `NSG: ${nsgText}`;
      const tw  = Math.min(lbl.length * 4.8 + 12, W - 12);
      const bx  = x + (W - tw) / 2;
      const by  = kindY + 5;
      // Small shield icon (8×10px) at left of badge
      const sx  = bx + 4;
      const sy  = by + 2;
      nsgBadge =
        `<rect x="${bx}" y="${by}" width="${tw}" height="14" rx="3" style="fill:${C.nsg};fill-opacity:0.15;stroke:${C.nsg};stroke-width:0.9;stroke-opacity:0.85;"/>` +
        `<path d="M${sx+4},${sy} L${sx+8},${sy+2} L${sx+8},${sy+5.5} Q${sx+8},${sy+9} ${sx+4},${sy+10} Q${sx},${sy+9} ${sx},${sy+5.5} L${sx},${sy+2} Z" style="fill:${C.nsg};fill-opacity:0.8;"/>` +
        `<text x="${bx+tw/2+4}" y="${by+10}" text-anchor="middle" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:${C.nsg};">${this._esc(this._t(lbl, 28))}</text>`;
    }

    const tooltip = `Compute: ${item.label}${item.sub ? ' — ' + item.sub : ''}${item.status ? ' (' + item.status + ')' : ''}${item.privIp ? ' | Private: ' + item.privIp : ''}${item.pubIp ? ' | Public: ' + item.pubIp : ''}${hasNsg ? ' | NSG: ' + item.nsgNames.join(', ') : ''}`;

    return `<g>
  <title>${this._esc(tooltip)}</title>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${R}" filter="url(#arch-shadow)" style="fill:var(--bg-card);stroke:var(--border);stroke-width:1;cursor:default;"/>
  <circle cx="${cx}" cy="${icoCy}" r="${ICO_SIZE/2+4}" style="fill:${clr};fill-opacity:0.12;stroke:${clr};stroke-width:1;stroke-opacity:0.2;"/>
  <g transform="translate(${cx-ICO_SIZE/2},${icoCy-ICO_SIZE/2}) scale(${ICO_SIZE/28})" style="color:${clr};">${SVG_ICONS.instance}</g>
  <line x1="${x+8}" y1="${sepY}" x2="${x+W-8}" y2="${sepY}" style="stroke:var(--border);stroke-width:0.6;stroke-opacity:0.35;"/>
  <defs><clipPath id="${uid}"><rect x="${x+4}" y="${y}" width="${W-8}" height="${H}"/></clipPath></defs>
  <g clip-path="url(#${uid})">
    <text x="${cx}" y="${nameY}" text-anchor="middle" style="font:700 ${FN}px/1 'Inter',system-ui,sans-serif;fill:var(--text-primary);">${this._esc(item.label)}</text>
    <text x="${cx}" y="${shapeY}" text-anchor="middle" style="font:400 ${FS-1}px/1 'Inter',system-ui,sans-serif;fill:var(--text-secondary);">${this._esc(item.sub||'')}</text>
    ${item.privIp ? `<circle cx="${x+9}" cy="${privY-3}" r="3" style="fill:${C.subnet_priv};fill-opacity:0.9;"/><text x="${x+16}" y="${privY}" style="font:400 ${FT+1}px/1 'Inter',system-ui,sans-serif;fill:var(--text-muted);">${this._esc(item.privIp)}</text>` : ''}
    ${hasPub ? `<circle cx="${x+9}" cy="${pubY-3}" r="3" style="fill:${C.igw};fill-opacity:0.9;"/><text x="${x+16}" y="${pubY}" style="font:400 ${FT+1}px/1 'Inter',system-ui,sans-serif;fill:var(--text-muted);">${this._esc(item.pubIp)}</text>` : ''}
    <text x="${cx}" y="${kindY}" text-anchor="middle" style="font:600 ${FT}px/1 'Inter',system-ui,sans-serif;fill:var(--text-muted);letter-spacing:.04em;text-transform:uppercase;">COMPUTE</text>
    ${nsgBadge}
  </g>
  ${dot ? `<circle cx="${x+W-12}" cy="${y+12}" r="4.5" style="fill:${dot};"/>` : ''}
</g>`;
  }


  /* ── Icon-centered node card ──────────────────────────────────────────── */
  _nodeCard(x, y, item) {
    if (item.kind === 'instance') return this._instCard(x, y, item);

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


  /* ── Zone background ──────────────────────────────────────────────────── */
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


  /* ── Gateway Node ─────────────────────────────────────────────────────── */
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


  /* ── Legend panel (top-right corner) ─────────────────────────────────── */
  _renderLegend(x, y) {
    const { LEGEND_W, LEGEND_PAD, LEGEND_ITEM_H, LEGEND_R, FT, FN } = K;
    const label = _i('LEGENDA', 'LEGEND');
    const items = [
      { color: C.subnet_pub,  label: _i('Sub-rede Pública', 'Public Subnet'),  icon: 'subnet'   },
      { color: C.subnet_priv, label: _i('Sub-rede Privada', 'Private Subnet'), icon: 'subnet'   },
      { color: C.instance,    label: 'Compute',                                icon: 'instance' },
      { color: C.lb,          label: 'Load Balancer',                          icon: 'lb'       },
      { color: C.drg,         label: 'DRG',                                    icon: 'drg'      },
      { color: C.igw,         label: _i('Internet GW', 'Internet GW'),         icon: 'igw'      },
      { color: C.nat,         label: _i('NAT GW', 'NAT GW'),                   icon: 'nat'      },
      { color: C.sgw,         label: _i('Service GW', 'Service GW'),           icon: 'sgw'      },
      { color: C.oke,         label: 'OKE',                                    icon: 'oke'      },
      { color: C.waf,         label: 'WAF',                                    icon: 'waf'      },
      { color: C.ipsec,       label: 'IPSec VPN',                              icon: 'ipsec'    },
      { color: C.cpe,         label: 'CPE',                                    icon: 'cpe'      },
      { color: C.vol,         label: 'Block Volume',                           icon: 'vol'      },
      { color: C.nsg,         label: 'NSG',                                    icon: 'nsg'      },
    ];
    const ICON_BOX = 14;
    const ICON_SCALE = ICON_BOX / 28;
    const h = LEGEND_PAD * 2 + FN + 8 + items.length * LEGEND_ITEM_H;
    this.els.push(
      `<rect x="${x}" y="${y}" width="${LEGEND_W}" height="${h}" rx="${LEGEND_R}" filter="url(#arch-shadow)"
         style="fill:var(--bg-card);stroke:var(--border);stroke-width:1;opacity:0.92;"/>
       <text x="${x + LEGEND_PAD}" y="${y + LEGEND_PAD + FN}"
         style="font:700 ${FN}px/1 'Inter',sans-serif;fill:var(--text-muted);letter-spacing:.08em;">${this._esc(label)}</text>`
    );
    let iy = y + LEGEND_PAD + FN + 8;
    items.forEach(item => {
      const cy = iy + LEGEND_ITEM_H / 2;
      const ix = x + LEGEND_PAD;
      const iy_icon = cy - ICON_BOX / 2;
      this.els.push(
        `<g transform="translate(${ix},${iy_icon}) scale(${ICON_SCALE})" style="color:${item.color};">${SVG_ICONS[item.icon]}</g>`
      );
      this.els.push(`<text x="${x + LEGEND_PAD + ICON_BOX + 6}" y="${cy + 4}"
         style="font:400 ${FT}px/1 'Inter',sans-serif;fill:var(--text-secondary);">${this._esc(item.label)}</text>`);
      iy += LEGEND_ITEM_H;
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
    return {
      id: hostName, kind: 'instance',
      label: this._t(hostName, 18),
      sub: shape,
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
    const sub = db.db_workload ? `${db.db_workload}${db.cpu_core_count ? ' · ' + db.cpu_core_count + ' OCPUs' : ''}` : (db.db_name || '');
    return {
      id: db.id || db.display_name, kind: 'db',
      label: this._t(db.display_name, 18),
      sub,
      status: db.lifecycle_state
    };
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


  /* ── Gateway helpers ──────────────────────────────────────────────────── */
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
          key: 'gw_' + rule.target.replace(/[^a-zA-Z0-9]/g, '_'),
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
          gwKey: 'gw_' + rule.target.replace(/[^a-zA-Z0-9]/g, '_'),
          destination: rule.destination,
          type,
        });
      });
    });
    return conns;
  }


  /* ── Helpers ─────────────────────────────────────────────────────────── */
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
  _t(s, n) { s = s ? String(s) : ''; return s.length > n ? s.slice(0,n-1)+'\u2026' : s; }
  _esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
}
