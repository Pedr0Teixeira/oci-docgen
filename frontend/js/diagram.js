// ===========================================================================
//  OCI Architecture Diagram  ·  v6  ·  Network Topology Style
//  Nested containers: Instances inside Subnets inside VCNs
//  Icon-centered cards, orthogonal connections, CIDR fallback
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

/* ─── Layout Constants ──────────────────────────────────────────────────── */
const K = {
  W: 1800, MARG: 32,
  VGAP: 28, HGAP: 20, COL_GAP: 24,
  // Node cards (icon-centered)
  NW: 160, NH: 110, NR: 10,
  ICO_SIZE: 36,
  FT: 9, FN: 11, FS: 10,
  // Subnet containers
  SUB_PAD: 16, SUB_HDR: 36, SUB_R: 8, SUB_GAP: 20,
  SUB_MIN_W: 200,
  // VCN containers
  VCN_PAD: 20, VCN_HDR: 48, VCN_R: 12, VCN_BDR: 1.8,
  VCN_GAP: 28,
  // DRG badge
  DRG_W: 120, DRG_H: 60,
  // Edge row
  EDGE_H: 100,
  // VPN
  CW: 200, CH: 100,
  // Zone labels
  ZONE_PX: 20, ZONE_PY: 16, ZONE_HDR: 36, ZONE_R: 12,
  SEP: 40,
};

/* ─── Service Colors ────────────────────────────────────────────────────── */
const C = {
  instance: '#f89e2a', lb: '#a371f7', vcn: '#2f81f7', drg: '#58a6ff',
  oke: '#4cc9f0', waf: '#f85149', cert: '#d4a017', ipsec: '#d29922',
  cpe: '#848d97', vol: '#3fb950', vg: '#3fb950', subnet: '#388bfd',
  lpg: '#3fb950', nsg: '#e3b341',
};

/* ─── SVG Icons (28×28 coord space) ─────────────────────────────────────── */
const SVG_ICONS = {
  instance: `<rect x="2" y="4" width="24" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<rect x="2" y="14" width="24" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
<circle cx="5.5" cy="7.5" r="1.2" fill="currentColor"/>
<circle cx="5.5" cy="17.5" r="1.2" fill="currentColor"/>
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

  vg: `<ellipse cx="14" cy="6" rx="10" ry="3.8" fill="none" stroke="currentColor" stroke-width="1.7"/>
<path d="M4 6 V13" fill="none" stroke="currentColor" stroke-width="1.7"/>
<path d="M24 6 V13" fill="none" stroke="currentColor" stroke-width="1.7"/>
<ellipse cx="14" cy="13" rx="10" ry="3.8" fill="none" stroke="currentColor" stroke-width="1.7"/>
<path d="M4 13 V20" fill="none" stroke="currentColor" stroke-width="1.7"/>
<path d="M24 13 V20" fill="none" stroke="currentColor" stroke-width="1.7"/>
<ellipse cx="14" cy="20" rx="10" ry="3.8" fill="none" stroke="currentColor" stroke-width="1.7"/>`,
};

/* ─── Header icon ───────────────────────────────────────────────────────── */
const ICON_DIAGRAM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="1" y="1" width="5.5" height="5.5" rx="1"/><rect x="9.5" y="1" width="5.5" height="5.5" rx="1"/>
  <rect x="1" y="9.5" width="5.5" height="5.5" rx="1"/><rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1"/></svg>`;


/* ═══════════════════════════════════════════════════════════════════════════
   OciDiagram — Network Topology Style
   ═══════════════════════════════════════════════════════════════════════════ */
class OciDiagram {
  constructor(data, docType) {
    this.d    = data;
    this.dt   = docType;
    this.els  = [];   // SVG element strings (top layer)
    this.bgs  = [];   // Background containers (bottom layer)
    this.conn = [];   // Connection lines (middle layer)
    this._pos = {};   // Position registry for connections: id → {cx,cy,x,y,w,h}
    this._uid = 0;
  }

  /* ── Entry ────────────────────────────────────────────────────────────── */
  render() {
    const topo = this._buildTopology();
    if (!topo) return '';
    const totalH = this._layoutTopology(topo);
    this._drawConnections(topo);
    const body = [...this.conn, ...this.bgs, ...this.els].join('\n');
    const svgH = Math.max(400, Math.ceil(totalH + 40));

    return `
<div class="arch-wrap arch-diagram-wrap">
  <div class="arch-diagram-header">
    <span class="arch-diagram-icon">${ICON_DIAGRAM}</span>
    <span class="arch-diagram-title">${this._diagramTitle()}</span>
    <span class="arch-diagram-badge">${this._esc(this._typeTag())}</span>
    <div class="arch-zoom-controls">
      <button class="arch-zoom-btn" onclick="window._archZoom(-1)" title="Zoom out">&minus;</button>
      <span class="arch-zoom-pct">100%</span>
      <button class="arch-zoom-btn" onclick="window._archZoom(1)" title="Zoom in">+</button>
      <button class="arch-zoom-btn arch-zoom-reset" onclick="window._archZoom(0)" title="Ajustar">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="1" width="14" height="14" rx="2"/><polyline points="1 5 5 5 5 1"/><polyline points="15 11 11 11 11 15"/></svg>
      </button>
    </div>
  </div>
  <div class="arch-diagram-canvas">
    <svg class="arch-svg" xmlns="http://www.w3.org/2000/svg" width="100%" height="${svgH}" style="display:block;overflow:visible">
      <defs>${this._defs()}</defs>
      <g class="arch-root" transform="translate(0,0) scale(1)">
        ${body}
      </g>
    </svg>
    <div class="arch-diagram-hint">Scroll para zoom &middot; Arraste para mover &middot; Duplo clique para ajustar</div>
  </div>
</div>`;
  }

  _diagramTitle() {
    const lang = (typeof currentLanguage !== 'undefined' && currentLanguage === 'en') ? 'en' : 'pt';
    return lang === 'en' ? 'Network Topology' : 'Topologia de Rede';
  }

  /* ── SVG defs ─────────────────────────────────────────────────────────── */
  _defs() {
    const arrows = [
      ['arch-arr-gray',  'var(--border-muted,#3d444d)'],
      ['arch-arr-blue',  '#58a6ff'],
      ['arch-arr-amber', '#d29922'],
      ['arch-arr-cyan',  '#4cc9f0'],
      ['arch-arr-red',   '#f85149'],
      ['arch-arr-purple','#a371f7'],
      ['arch-arr-green', '#3fb950'],
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
     TOPOLOGY BUILDER — resolves resource → subnet → VCN placement
  ══════════════════════════════════════════════════════════════════════════ */
  _buildTopology() {
    const D = this.d;
    const has = a => a && a.length > 0;

    // Edge security (WAF + Certs)
    const edge = [];
    (D.waf_policies || []).filter(p => (p.lifecycle_state || '').toUpperCase() !== 'DELETED')
      .forEach(p => edge.push({ type: 'waf', data: p }));
    (D.certificates || []).filter(c => ['ACTIVE','PENDING_DELETION'].includes((c.lifecycle_state || '').toUpperCase()))
      .forEach(c => edge.push({ type: 'cert', data: c }));

    // Build VCN topology with subnet placement
    const vcns = (D.vcns || []).map(vcn => {
      const subMap = {};
      (vcn.subnets || []).forEach(sub => {
        subMap[sub.id] = { subnet: sub, instances: [], lbs: [], oke_pools: [] };
      });
      return { vcn, subMap, drg: null, unplaced: [], lpgs: vcn.lpgs || [] };
    });

    // Build subnet ID → VCN index and subnet ID map for quick lookup
    const subToVcn = {};
    const vcnIdMap = {};
    vcns.forEach((v, vi) => {
      vcnIdMap[v.vcn.id] = vi;
      Object.keys(v.subMap).forEach(sid => { subToVcn[sid] = vi; });
    });

    // Place instances into subnets
    const placedInstances = new Set();
    (D.instances || []).forEach(inst => {
      let placed = false;
      // Method 1: Direct subnet_id
      if (inst.subnet_id && subToVcn[inst.subnet_id] !== undefined) {
        const vi = subToVcn[inst.subnet_id];
        if (vcns[vi].subMap[inst.subnet_id]) {
          vcns[vi].subMap[inst.subnet_id].instances.push(inst);
          placed = true;
          placedInstances.add(inst.host_name);
        }
      }
      // Method 2: CIDR fallback
      if (!placed && inst.private_ip) {
        for (const v of vcns) {
          for (const sid of Object.keys(v.subMap)) {
            const sub = v.subMap[sid].subnet;
            if (sub.cidr_block && this._ipInCidr(inst.private_ip, sub.cidr_block)) {
              v.subMap[sid].instances.push(inst);
              placed = true;
              placedInstances.add(inst.host_name);
              break;
            }
          }
          if (placed) break;
        }
      }
      // Method 3: vcn_id — place in VCN's unplaced list
      if (!placed && inst.vcn_id && vcnIdMap[inst.vcn_id] !== undefined) {
        vcns[vcnIdMap[inst.vcn_id]].unplaced.push({ type: 'instance', data: inst });
        placedInstances.add(inst.host_name);
      }
    });

    // Place LBs into subnets
    const placedLbs = new Set();
    (D.load_balancers || []).forEach(lb => {
      let placed = false;
      if (lb.subnet_ids && lb.subnet_ids.length > 0) {
        for (const sid of lb.subnet_ids) {
          if (subToVcn[sid] !== undefined) {
            const vi = subToVcn[sid];
            if (vcns[vi].subMap[sid]) {
              vcns[vi].subMap[sid].lbs.push(lb);
              placed = true;
              placedLbs.add(lb.id || lb.display_name);
              break;
            }
          }
        }
      }
      // Fallback: match backend IPs against subnet CIDRs
      if (!placed) {
        const backendIps = [];
        (lb.backend_sets || []).forEach(bs => {
          (bs.backends || []).forEach(b => { if (b.ip_address) backendIps.push(b.ip_address); });
        });
        for (const ip of backendIps) {
          for (const v of vcns) {
            for (const sid of Object.keys(v.subMap)) {
              const sub = v.subMap[sid].subnet;
              if (sub.cidr_block && this._ipInCidr(ip, sub.cidr_block)) {
                v.subMap[sid].lbs.push(lb);
                placed = true;
                placedLbs.add(lb.id || lb.display_name);
                break;
              }
            }
            if (placed) break;
          }
          if (placed) break;
        }
      }
    });

    // Place OKE node pools into subnets (by subnet name matching)
    (D.kubernetes_clusters || []).forEach(cluster => {
      (cluster.node_pools || []).forEach(pool => {
        let placed = false;
        for (const v of vcns) {
          for (const sid of Object.keys(v.subMap)) {
            if (v.subMap[sid].subnet.display_name === pool.subnet_name) {
              v.subMap[sid].oke_pools.push({ cluster, pool });
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      });
    });

    // Attach DRGs to VCNs
    (D.drgs || []).forEach(drg => {
      (drg.attachments || []).forEach(att => {
        if (att.network_type === 'VCN' && att.network_id && vcnIdMap[att.network_id] !== undefined) {
          vcns[vcnIdMap[att.network_id]].drg = drg;
        }
      });
    });

    // Unplaced LBs (not inside any subnet)
    const floatingLbs = (D.load_balancers || []).filter(lb => !placedLbs.has(lb.id || lb.display_name));

    // On-Premises
    const onprem = { ipsecs: D.ipsec_connections || [], cpes: D.cpes || [] };

    // Storage
    const storage = [
      ...(D.volume_groups || []).map(v => ({ type: 'vg', data: v })),
      ...(D.standalone_volumes || []).slice(0, 8).map(v => ({ type: 'vol', data: v })),
    ];

    // Unplaced instances
    const floatingInstances = (D.instances || []).filter(i => !placedInstances.has(i.host_name));

    // Check if we have any content at all
    const hasContent = edge.length || vcns.length || floatingLbs.length || floatingInstances.length
      || onprem.ipsecs.length || onprem.cpes.length || storage.length
      || (D.kubernetes_clusters || []).length;
    if (!hasContent) return null;

    return { edge, vcns, floatingLbs, floatingInstances, onprem, storage };
  }

  /* ── CIDR matching fallback ───────────────────────────────────────────── */
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
     LAYOUT ENGINE — Nested container measurement + positioning
  ══════════════════════════════════════════════════════════════════════════ */
  _layoutTopology(topo) {
    const { MARG, VGAP, W } = K;
    const contentW = W - MARG * 2;
    let y = MARG;

    // 1) Edge Security row (WAF + Certs)
    if (topo.edge.length) {
      y = this._layEdgeRow(topo.edge, MARG, y, contentW);
      y += VGAP;
    }

    // 2) Floating LBs (not inside any subnet)
    if (topo.floatingLbs.length) {
      y = this._layFloatingRow(topo.floatingLbs.map(lb => ({
        id: lb.id || lb.display_name, kind: 'lb',
        label: this._t(lb.display_name, 20),
        sub: (lb.ip_addresses || []).filter(a => a && a.ip_address).map(a => a.ip_address)[0] || '',
        status: lb.lifecycle_state
      })), MARG, y, contentW, 'LOAD BALANCERS', C.lb);
      y += VGAP;
    }

    // 3) VCN containers (the main topology area)
    if (topo.vcns.length) {
      y = this._layVcnContainers(topo.vcns, MARG, y, contentW);
      y += VGAP;
    }

    // 4) Floating instances (couldn't be placed in any subnet)
    if (topo.floatingInstances.length) {
      y = this._layFloatingRow(topo.floatingInstances.map(i => this._descInst(i)),
        MARG, y, contentW, 'COMPUTE (SEM SUBNET)', C.instance);
      y += VGAP;
    }

    // 5) On-Premises separator + VPN
    if (topo.onprem.ipsecs.length || topo.onprem.cpes.length) {
      this.bgs.push(this._separator(y, MARG, contentW));
      y += K.SEP + VGAP / 2;
      y = this._layVpn(topo.onprem.ipsecs, topo.onprem.cpes, MARG, y, contentW);
      y += VGAP;
    }

    // 6) Storage row
    if (topo.storage.length) {
      y = this._layStorageRow(topo.storage, MARG, y, contentW);
      y += VGAP;
    }

    return y;
  }


  /* ── Edge Security Row ────────────────────────────────────────────────── */
  _layEdgeRow(items, x, y, w) {
    const { NW, NH, HGAP } = K;
    const nodes = items.map(item => {
      if (item.type === 'waf') return this._descWaf(item.data);
      return this._descCert(item.data);
    });
    const pr = Math.max(1, Math.min(nodes.length, Math.floor((w + HGAP) / (NW + HGAP))));
    const rowW = pr * NW + (pr - 1) * HGAP;
    const startX = x + (w - rowW) / 2;
    const rows = Math.ceil(nodes.length / pr);

    // Zone background
    const zoneH = K.ZONE_HDR + K.ZONE_PY + rows * (NH + 10) - 10 + K.ZONE_PY;
    this.bgs.push(this._zoneBg(x, y, w, zoneH, C.waf, 'SEGURANÇA'));

    const contentY = y + K.ZONE_HDR + K.ZONE_PY;
    nodes.forEach((node, i) => {
      const nx = startX + (i % pr) * (NW + HGAP);
      const ny = contentY + Math.floor(i / pr) * (NH + 10);
      this.els.push(this._nodeCard(nx, ny, node));
      this._pos[node.id] = { cx: nx + NW/2, cy: ny + NH/2, x: nx, y: ny, w: NW, h: NH };
    });
    return y + zoneH;
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


  /* ── VCN Containers ───────────────────────────────────────────────────── */
  _layVcnContainers(vcnTopos, x, y, totalW) {
    const { VCN_PAD, VCN_HDR, VCN_R, VCN_BDR, VCN_GAP, DRG_W, DRG_H, SUB_PAD, SUB_HDR, SUB_GAP, SUB_R, NW, NH, HGAP, SUB_MIN_W } = K;

    // Measure each VCN
    const measured = vcnTopos.map(vt => {
      const subnets = Object.values(vt.subMap);
      // Measure each subnet
      const subMeasured = subnets.map(s => {
        const count = s.instances.length + s.lbs.length + s.oke_pools.length;
        const cols = Math.max(1, Math.min(count, 3));
        const rows = Math.ceil(Math.max(1, count) / cols);
        const innerW = cols * NW + (cols - 1) * HGAP;
        const subW = Math.max(SUB_MIN_W, innerW + SUB_PAD * 2);
        const subH = SUB_HDR + SUB_PAD + rows * (NH + 10) - (count > 0 ? 10 : 0) + SUB_PAD;
        return { ...s, subW, subH, cols, count };
      }).filter(s => s.count > 0 || true); // keep empty subnets too

      // Arrange subnets in a grid inside VCN
      const subCols = Math.max(1, Math.min(subMeasured.length, totalW > 1200 ? 3 : 2));
      const subRows = Math.ceil(Math.max(1, subMeasured.length) / subCols);

      // Calculate column widths (use the max width in each column)
      const colWidths = [];
      for (let c = 0; c < subCols; c++) {
        let maxW = SUB_MIN_W;
        for (let r = 0; r < subRows; r++) {
          const idx = r * subCols + c;
          if (idx < subMeasured.length) maxW = Math.max(maxW, subMeasured[idx].subW);
        }
        colWidths.push(maxW);
      }

      // Calculate row heights
      const rowHeights = [];
      for (let r = 0; r < subRows; r++) {
        let maxH = 0;
        for (let c = 0; c < subCols; c++) {
          const idx = r * subCols + c;
          if (idx < subMeasured.length) maxH = Math.max(maxH, subMeasured[idx].subH);
        }
        rowHeights.push(maxH);
      }

      const subnetsW = colWidths.reduce((a, b) => a + b, 0) + (subCols - 1) * SUB_GAP;
      const subnetsH = rowHeights.reduce((a, b) => a + b, 0) + (subRows - 1) * SUB_GAP;

      // LPGs row
      const lpgH = vt.lpgs.length > 0 ? 44 : 0;

      // Unplaced resources inside VCN
      const unplacedH = vt.unplaced.length > 0 ? NH + 20 : 0;

      // DRG occupies right side
      const hasDrg = !!vt.drg;
      const drgSpace = hasDrg ? DRG_W + VCN_PAD : 0;

      const vcnInnerW = Math.max(subnetsW + drgSpace, 400);
      const vcnW = vcnInnerW + VCN_PAD * 2;
      const vcnH = VCN_HDR + VCN_PAD + subnetsH + lpgH + unplacedH + VCN_PAD;

      return {
        vt, subMeasured, subCols, subRows, colWidths, rowHeights,
        vcnW, vcnH, hasDrg, drgSpace, subnetsW, lpgH, unplacedH
      };
    });

    // Position VCNs — stack vertically if > 2, else side by side
    const vcnCount = measured.length;
    let maxY = y;

    if (vcnCount <= 2) {
      const totalVcnW = measured.reduce((s, m) => s + m.vcnW, 0) + (vcnCount - 1) * VCN_GAP;
      const fitW = Math.min(totalVcnW, totalW);
      const scale = totalVcnW > totalW ? totalW / totalVcnW : 1;
      let vx = x + (totalW - fitW) / 2;

      measured.forEach(m => {
        const w = m.vcnW * scale;
        const h = this._renderVcn(m, vx, y, w);
        maxY = Math.max(maxY, y + h);
        vx += w + VCN_GAP;
      });
    } else {
      // Stack vertically
      let vy = y;
      measured.forEach(m => {
        const w = Math.min(m.vcnW, totalW);
        const vx = x + (totalW - w) / 2;
        const h = this._renderVcn(m, vx, vy, w);
        vy += h + VCN_GAP;
      });
      maxY = vy - VCN_GAP;
    }

    return maxY;
  }

  /* ── Render a single VCN container ────────────────────────────────────── */
  _renderVcn(m, x, y, w) {
    const { VCN_PAD, VCN_HDR, VCN_R, VCN_BDR, SUB_PAD, SUB_HDR, SUB_GAP, SUB_R, NW, NH, HGAP, DRG_W, DRG_H, ICO_SIZE, FN, FS, FT } = K;
    const vcn = m.vt.vcn;
    const h = m.vcnH;
    const parts = [];

    // VCN container background
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${VCN_R}" filter="url(#arch-shadow)" style="fill:var(--bg-main);stroke:${C.vcn};stroke-width:${VCN_BDR};stroke-dasharray:8,4;"/>`);

    // VCN header bar
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${VCN_HDR}" rx="${VCN_R}" style="fill:rgba(47,129,247,0.08);stroke:none;"/>
<rect x="${x}" y="${y+VCN_HDR-1}" width="${w}" height="1.5" style="fill:rgba(47,129,247,0.22);"/>`);

    // VCN icon + name
    const icoX = x + VCN_PAD;
    const icoY = y + VCN_HDR / 2;
    parts.push(`<circle cx="${icoX + 14}" cy="${icoY}" r="16" style="fill:${C.vcn};fill-opacity:0.15;"/>
<g transform="translate(${icoX},${icoY - 14}) scale(1)" style="color:${C.vcn};">${SVG_ICONS.vcn}</g>`);
    const tx = icoX + 38;
    parts.push(`<text x="${tx}" y="${y + VCN_HDR/2 - 4}" style="font:700 ${FN + 2}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(vcn.display_name, 40))}</text>`);
    parts.push(`<text x="${tx}" y="${y + VCN_HDR/2 + FS + 2}" style="font:400 ${FS}px/1 'Inter',sans-serif;fill:var(--text-secondary);">CIDR: ${this._esc(vcn.cidr_block || '')}</text>`);

    this.bgs.push(parts.join('\n'));
    this._pos[vcn.id] = { cx: x + w/2, cy: y + h/2, x, y, w, h };

    // Render subnets inside VCN
    let sy = y + VCN_HDR + VCN_PAD;
    const subStartX = x + VCN_PAD;

    m.subMeasured.forEach((sub, idx) => {
      const col = idx % m.subCols;
      const row = Math.floor(idx / m.subCols);

      // Compute x offset by summing previous column widths
      let sx = subStartX;
      for (let c = 0; c < col; c++) sx += m.colWidths[c] + SUB_GAP;

      // Compute y offset by summing previous row heights
      let subY = y + VCN_HDR + VCN_PAD;
      for (let r = 0; r < row; r++) subY += m.rowHeights[r] + SUB_GAP;

      const subW = m.colWidths[col];
      const subH = m.rowHeights[row];

      this._renderSubnet(sub, sx, subY, subW, subH);
    });

    // DRG badge at right edge
    if (m.hasDrg) {
      const drg = m.vt.drg;
      const drgX = x + w - DRG_W - VCN_PAD;
      const drgY = y + VCN_HDR + VCN_PAD;
      this._renderDrgBadge(drg, drgX, drgY);
    }

    // LPGs
    if (m.vt.lpgs.length > 0) {
      const lpgY = y + h - VCN_PAD - 32;
      m.vt.lpgs.slice(0, 4).forEach((lpg, i) => {
        const lx = x + VCN_PAD + i * 200;
        const sc = lpg.peering_status === 'PEERED' ? C.lpg : '#e3b341';
        this.els.push(`<rect x="${lx}" y="${lpgY}" width="188" height="32" rx="6" style="fill:var(--bg-card);stroke:${sc};stroke-width:1.2;"/>
<circle cx="${lx+12}" cy="${lpgY+16}" r="5" style="fill:${sc};"/>
<text x="${lx+24}" y="${lpgY+12}" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);text-transform:uppercase;">LPG</text>
<text x="${lx+50}" y="${lpgY+12}" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(lpg.display_name, 14))}</text>
<text x="${lx+24}" y="${lpgY+26}" style="font:400 ${FT}px/1 'Inter',sans-serif;fill:var(--text-secondary);">${this._esc(lpg.peering_status || '')}</text>`);
        this._pos['lpg_' + lpg.id] = { cx: lx + 94, cy: lpgY + 16, x: lx, y: lpgY, w: 188, h: 32 };
      });
    }

    // Unplaced resources
    if (m.vt.unplaced.length > 0) {
      const upY = y + h - VCN_PAD - NH - (m.lpgH > 0 ? 44 : 0);
      const upX = x + VCN_PAD;
      m.vt.unplaced.forEach((item, i) => {
        const nx = upX + i * (NW + HGAP);
        const node = item.type === 'instance' ? this._descInst(item.data) : { id: 'u_' + i, kind: item.type, label: '?', sub: '' };
        this.els.push(this._nodeCard(nx, upY, node));
        this._pos[node.id] = { cx: nx + NW/2, cy: upY + NH/2, x: nx, y: upY, w: NW, h: NH };
      });
    }

    return h;
  }


  /* ── Render a single Subnet container ─────────────────────────────────── */
  _renderSubnet(sub, x, y, w, h) {
    const { SUB_PAD, SUB_HDR, SUB_R, NW, NH, HGAP, FN, FS, FT } = K;
    const sn = sub.subnet;
    const parts = [];

    // Subnet container
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${SUB_R}" style="fill:var(--bg-card);stroke:${C.subnet};stroke-width:1.2;stroke-opacity:0.5;"/>`);

    // Subnet header stripe
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${SUB_HDR}" rx="${SUB_R}" style="fill:${C.subnet};fill-opacity:0.06;"/>
<rect x="${x}" y="${y+SUB_HDR-1}" width="${w}" height="1" style="fill:${C.subnet};fill-opacity:0.2;"/>`);

    // Left accent bar
    parts.push(`<rect x="${x}" y="${y}" width="4" height="${h}" rx="2" style="fill:${C.subnet};"/>`);

    // Subnet name + CIDR
    parts.push(`<text x="${x + 16}" y="${y + SUB_HDR/2 - 2}" style="font:600 ${FN}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(sn.display_name || 'Subnet', 28))}</text>`);
    parts.push(`<text x="${x + 16}" y="${y + SUB_HDR/2 + FS}" style="font:400 ${FS - 1}px/1 'Inter',sans-serif;fill:var(--text-secondary);">${this._esc(sn.cidr_block || '')}</text>`);

    this.bgs.push(parts.join('\n'));

    // Register subnet position
    this._pos['sub_' + sn.id] = { cx: x + w/2, cy: y + h/2, x, y, w, h };

    // Place resource cards inside subnet
    const allItems = [
      ...sub.lbs.map(lb => ({
        id: lb.id || lb.display_name, kind: 'lb',
        label: this._t(lb.display_name, 18),
        sub: (lb.ip_addresses || []).filter(a => a && a.ip_address).map(a => a.ip_address)[0] || '',
        status: lb.lifecycle_state
      })),
      ...sub.instances.map(i => this._descInst(i)),
      ...sub.oke_pools.map(op => ({
        id: op.cluster.id + '_' + op.pool.name, kind: 'oke',
        label: this._t(op.pool.name, 18),
        sub: `${op.pool.node_count} nodes · ${op.pool.shape}`,
        status: null
      })),
    ];

    if (allItems.length === 0) {
      // Empty subnet placeholder
      this.els.push(`<text x="${x + w/2}" y="${y + SUB_HDR + 20}" text-anchor="middle" style="font:italic 400 ${FS - 1}px/1 'Inter',sans-serif;fill:var(--text-muted);opacity:0.5;">sem recursos</text>`);
      return;
    }

    const cols = Math.max(1, Math.min(allItems.length, sub.cols || 3));
    const rowW = cols * NW + (cols - 1) * HGAP;
    const startX = x + (w - rowW) / 2;
    const startY = y + SUB_HDR + SUB_PAD;

    allItems.forEach((node, i) => {
      const nx = startX + (i % cols) * (NW + HGAP);
      const ny = startY + Math.floor(i / cols) * (NH + 10);
      this.els.push(this._nodeCard(nx, ny, node));
      this._pos[node.id] = { cx: nx + NW/2, cy: ny + NH/2, x: nx, y: ny, w: NW, h: NH };
    });
  }


  /* ── DRG badge ────────────────────────────────────────────────────────── */
  _renderDrgBadge(drg, x, y) {
    const { DRG_W: W, DRG_H: H, FN, FS, FT } = K;
    const cx = x + W/2, cy = y + H/2;
    this.els.push(`<g>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="8" filter="url(#arch-shadow)" style="fill:var(--bg-card);stroke:${C.drg};stroke-width:1.4;"/>
  <circle cx="${cx}" cy="${y + 22}" r="14" style="fill:${C.drg};fill-opacity:0.12;"/>
  <g transform="translate(${cx - 14},${y + 8}) scale(1)" style="color:${C.drg};">${SVG_ICONS.drg}</g>
  <text x="${cx}" y="${y + H - 10}" text-anchor="middle" style="font:700 ${FN}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(drg.display_name, 14))}</text>
</g>`);
    this._pos[drg.id] = { cx, cy, x, y, w: W, h: H };
  }


  /* ── VPN / On-Premises ────────────────────────────────────────────────── */
  _layVpn(ipsecs, cpes, x, y, w) {
    const { NW, NH, CW, CH, HGAP } = K;
    const CONN_GAP = 60;
    const cpeMap = Object.fromEntries(cpes.map(c => [c.id, c]));
    const pairs = ipsecs.map(ipsec => ({ ipsec, cpe: cpeMap[ipsec.cpe_id] || null }));
    const unmatched = cpes.filter(c => !ipsecs.some(i => i.cpe_id === c.id));
    const pairW = NW + CONN_GAP + CW;
    const pairGap = HGAP * 2;
    const nTotal = pairs.length + unmatched.length;
    const totalPW = nTotal > 0 ? nTotal * pairW + Math.max(0, nTotal - 1) * pairGap : 0;
    let px = x + Math.max(0, (w - totalPW) / 2);
    let maxY = y;

    pairs.forEach(({ ipsec, cpe }) => {
      const iy = y + (CH - NH) / 2;
      this.els.push(this._ipsecNode(px, iy, ipsec));
      this._pos[ipsec.id] = { cx: px + NW/2, cy: iy + NH/2, x: px, y: iy, w: NW, h: NH };
      if (cpe) {
        const cx2 = px + NW + CONN_GAP;
        this.els.push(this._cpeNode(cx2, y, cpe));
        this._pos[cpe.id] = { cx: cx2 + CW/2, cy: y + CH/2, x: cx2, y, w: CW, h: CH };
        const tunnels = ipsec.tunnels || [];
        const up = tunnels.filter(t => (t.status || '').toUpperCase() === 'UP').length;
        const down = tunnels.filter(t => (t.status || '').toUpperCase() !== 'UP').length;
        this.els.push(this._tunnelLine(px + NW, iy + NH/2, cx2, iy + NH/2, up, down));
      }
      maxY = Math.max(maxY, y + CH);
      px += pairW + pairGap;
    });

    unmatched.forEach(cpe => {
      this.els.push(this._cpeNode(px, y, cpe));
      this._pos[cpe.id] = { cx: px + CW/2, cy: y + CH/2, x: px, y, w: CW, h: CH };
      maxY = Math.max(maxY, y + CH);
      px += CW + pairGap;
    });

    return maxY;
  }


  /* ── Storage Row ──────────────────────────────────────────────────────── */
  _layStorageRow(items, x, y, w) {
    const nodes = items.map(item => {
      if (item.type === 'vg') {
        const v = item.data;
        return { id: v.id, kind: 'vg', label: this._t(v.display_name, 18), sub: `${v.members?.length || 0} volumes`, status: v.lifecycle_state };
      }
      const v = item.data;
      return { id: v.id, kind: 'vol', label: this._t(v.display_name, 18), sub: `${v.size_in_gbs || 0} GB`, status: v.lifecycle_state };
    });
    return this._layFloatingRow(nodes, x, y, w, 'ARMAZENAMENTO', C.vol);
  }


  /* ══════════════════════════════════════════════════════════════════════════
     CONNECTIONS — Orthogonal lines between related resources
  ══════════════════════════════════════════════════════════════════════════ */
  _drawConnections(topo) {
    const D = this.d;

    // WAF → LB (via waf_firewall_id on LB or policy integrations)
    (D.waf_policies || []).forEach(policy => {
      const pp = this._pos[policy.id];
      if (!pp) return;
      (policy.integrations || []).forEach(integ => {
        if (integ.load_balancer) {
          const lp = this._pos[integ.load_balancer.id || integ.load_balancer.display_name];
          if (lp) this.conn.push(this._orthoV(pp.cx, pp.y + pp.h, lp.cx, lp.y, C.waf, 'arch-arr-red'));
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

      // Find instances matching backend IPs
      (D.instances || []).forEach(inst => {
        if (inst.private_ip && backendIps.has(inst.private_ip)) {
          const ip = this._pos[inst.host_name];
          if (ip) this.conn.push(this._orthoV(lp.cx, lp.y + lp.h, ip.cx, ip.y, C.lb, 'arch-arr-purple'));
        }
      });
    });

    // DRG → VCN border
    (D.drgs || []).forEach(drg => {
      const dp = this._pos[drg.id];
      if (!dp) return;
      (drg.attachments || []).forEach(att => {
        if (att.network_type === 'VCN' && att.network_id) {
          const vp = this._pos[att.network_id];
          if (vp) {
            // DRG is inside VCN — draw line to VCN right edge
            this.conn.push(this._lineH(dp.x + dp.w, dp.cy, vp.x + vp.w, dp.cy, C.drg, 'arch-arr-blue'));
          }
        }
      });
    });

    // IPSec → DRG
    (D.ipsec_connections || []).forEach(ipsec => {
      if (!ipsec.drg_id) return;
      const ip = this._pos[ipsec.id];
      const dp = this._pos[ipsec.drg_id];
      if (ip && dp) this.conn.push(this._orthoV(ip.cx, ip.y, dp.cx, dp.y + dp.h, C.ipsec, 'arch-arr-amber'));
    });

    // OKE → VCN
    (D.kubernetes_clusters || []).forEach(cluster => {
      if (!cluster.vcn_id) return;
      const op = this._pos[cluster.id + '_' + (cluster.node_pools || [])[0]?.name];
      const vp = this._pos[cluster.vcn_id];
      if (op && vp) this.conn.push(this._orthoV(op.cx, op.y + op.h, vp.cx, vp.y, C.oke, 'arch-arr-cyan'));
    });
  }


  /* ══════════════════════════════════════════════════════════════════════════
     SVG ELEMENT RENDERERS
  ══════════════════════════════════════════════════════════════════════════ */

  /* ── Icon-centered node card ──────────────────────────────────────────── */
  _nodeCard(x, y, item) {
    const { NW: W, NH: H, NR: R, ICO_SIZE, FT, FN, FS } = K;
    const clr = C[item.kind] || '#58a6ff';
    const dot = this._stClr(item.status);
    const uid = `cl${this._uid++}`;
    const cx = x + W / 2;

    // Icon circle position (centered, near top)
    const icoCy = y + 30;

    return `<g>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${R}" filter="url(#arch-shadow)" style="fill:var(--bg-card);stroke:var(--border);stroke-width:1;"/>
  <circle cx="${cx}" cy="${icoCy}" r="${ICO_SIZE / 2 + 4}" style="fill:${clr};fill-opacity:0.12;stroke:${clr};stroke-width:1;stroke-opacity:0.2;"/>
  <g transform="translate(${cx - ICO_SIZE/2},${icoCy - ICO_SIZE/2}) scale(${ICO_SIZE/28})" style="color:${clr};">${SVG_ICONS[item.kind] || SVG_ICONS.subnet}</g>
  <defs><clipPath id="${uid}"><rect x="${x + 4}" y="${y}" width="${W - 8}" height="${H}"/></clipPath></defs>
  <g clip-path="url(#${uid})">
    <text x="${cx}" y="${y + 62}" text-anchor="middle" style="font:700 ${FN}px/1 'Inter',system-ui,sans-serif;fill:var(--text-primary);">${this._esc(item.label)}</text>
    <text x="${cx}" y="${y + 76}" text-anchor="middle" style="font:400 ${FS}px/1 'Inter',system-ui,sans-serif;fill:var(--text-secondary);">${this._esc(item.sub || '')}</text>
  </g>
  ${dot ? `<circle cx="${x + W - 12}" cy="${y + 12}" r="4.5" style="fill:${dot};"/>` : ''}
  <text x="${cx}" y="${y + 92}" text-anchor="middle" style="font:600 ${FT}px/1 'Inter',system-ui,sans-serif;fill:var(--text-muted);letter-spacing:.04em;text-transform:uppercase;">${this._esc(this._kindLbl(item.kind))}</text>
</g>`;
  }


  /* ── IPSec node ───────────────────────────────────────────────────────── */
  _ipsecNode(x, y, ipsec) {
    const { NW: W, NH: H, NR: R, FT, FN, ICO_SIZE, FS } = K;
    const clr = C.ipsec;
    const cx = x + W / 2;
    const icoCy = y + 30;
    const tunnels = ipsec.tunnels || [];
    const up = tunnels.filter(t => (t.status || '').toUpperCase() === 'UP').length;
    const down = tunnels.filter(t => (t.status || '').toUpperCase() !== 'UP').length;

    const badges = [];
    if (up > 0) badges.push(`<rect x="${cx - 32}" y="${y + 82}" width="28" height="16" rx="4" style="fill:rgba(63,185,80,.15);stroke:#3fb950;stroke-width:1;"/>
<text x="${cx - 18}" y="${y + 93}" text-anchor="middle" style="font:700 ${FT}px/1 'Inter',sans-serif;fill:#3fb950;">${up}\u2191</text>`);
    if (down > 0) badges.push(`<rect x="${cx + 4}" y="${y + 82}" width="28" height="16" rx="4" style="fill:rgba(248,81,73,.15);stroke:#f85149;stroke-width:1;"/>
<text x="${cx + 18}" y="${y + 93}" text-anchor="middle" style="font:700 ${FT}px/1 'Inter',sans-serif;fill:#f85149;">${down}\u2193</text>`);

    return `<g>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${R}" filter="url(#arch-shadow)" style="fill:var(--bg-card);stroke:${clr};stroke-width:1.4;stroke-dasharray:5,3;"/>
  <circle cx="${cx}" cy="${icoCy}" r="${ICO_SIZE/2 + 4}" style="fill:${clr};fill-opacity:0.12;"/>
  <g transform="translate(${cx - ICO_SIZE/2},${icoCy - ICO_SIZE/2}) scale(${ICO_SIZE/28})" style="color:${clr};">${SVG_ICONS.ipsec}</g>
  <text x="${cx}" y="${y + 62}" text-anchor="middle" style="font:700 ${FN}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(ipsec.display_name, 18))}</text>
  <text x="${cx}" y="${y + 76}" text-anchor="middle" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);text-transform:uppercase;">IPSec VPN</text>
  ${badges.join('\n')}
</g>`;
  }


  /* ── CPE node ─────────────────────────────────────────────────────────── */
  _cpeNode(x, y, cpe) {
    const { CW: W, CH: H, NR: R, FT, FN, FS, ICO_SIZE } = K;
    const clr = C.cpe;
    const cx = x + W / 2;
    const icoCy = y + 30;

    return `<g>
  <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${R}" filter="url(#arch-shadow)" style="fill:var(--bg-card);stroke:${clr};stroke-width:1.4;"/>
  <circle cx="${cx}" cy="${icoCy}" r="${ICO_SIZE/2 + 4}" style="fill:${clr};fill-opacity:0.10;"/>
  <g transform="translate(${cx - ICO_SIZE/2},${icoCy - ICO_SIZE/2}) scale(${ICO_SIZE/28})" style="color:${clr};">${SVG_ICONS.cpe}</g>
  <text x="${cx}" y="${y + 62}" text-anchor="middle" style="font:700 ${FN}px/1 'Inter',sans-serif;fill:var(--text-primary);">${this._esc(this._t(cpe.display_name, 22))}</text>
  <text x="${cx}" y="${y + 76}" text-anchor="middle" style="font:400 ${FS}px/1 'Inter',sans-serif;fill:var(--text-secondary);">IP: ${this._esc(cpe.ip_address || 'N/A')}</text>
  <text x="${cx}" y="${y + 90}" text-anchor="middle" style="font:600 ${FT}px/1 'Inter',sans-serif;fill:var(--text-muted);text-transform:uppercase;">CPE On-Premises</text>
</g>`;
  }


  /* ── Tunnel line ──────────────────────────────────────────────────────── */
  _tunnelLine(x1, y, x2, _y2, up, down) {
    const clr = down === 0 && up > 0 ? '#3fb950' : up === 0 && down > 0 ? '#f85149' : '#e3b341';
    const dash = down > 0 ? 'stroke-dasharray:8,4;' : '';
    const lbl = up > 0 && down > 0 ? `${up}\u2191 ${down}\u2193` : up > 0 ? `${up} UP` : `${down} DOWN`;
    const mx = (x1 + x2) / 2, bW = 68, bH = 22;
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" style="stroke:${clr};stroke-width:2;${dash}"/>
<rect x="${mx - bW/2}" y="${y - bH/2}" width="${bW}" height="${bH}" rx="6" style="fill:var(--bg-card);stroke:${clr};stroke-width:1.2;"/>
<text x="${mx}" y="${y + 4}" text-anchor="middle" style="font:700 ${K.FS}px/1 'Inter',sans-serif;fill:${clr};">${this._esc(lbl)}</text>`;
  }


  /* ── Zone background ──────────────────────────────────────────────────── */
  _zoneBg(x, y, w, h, color, label) {
    const { ZONE_R, ZONE_HDR } = K;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${ZONE_R}" style="fill:${color};fill-opacity:0.04;stroke:${color};stroke-width:1;stroke-opacity:0.25;"/>
<rect x="${x}" y="${y}" width="${w}" height="${ZONE_HDR}" rx="${ZONE_R}" style="fill:${color};fill-opacity:0.10;stroke:none;"/>
<rect x="${x}" y="${y + ZONE_HDR - 1}" width="${w}" height="1.5" style="fill:${color};fill-opacity:0.25;"/>
<text x="${x + 16}" y="${y + ZONE_HDR/2 + 5}" style="font:700 12px/1 'Inter',system-ui,sans-serif;fill:${color};letter-spacing:.10em;opacity:0.85;">${this._esc(label)}</text>`;
  }


  /* ── Separator ────────────────────────────────────────────────────────── */
  _separator(y, x, w) {
    const cx = x + w / 2;
    return `<line x1="${x + 8}" y1="${y}" x2="${x + w - 8}" y2="${y}" style="stroke:var(--border-muted,#3d444d);stroke-width:1.2;stroke-dasharray:6,4;opacity:0.5;"/>
<rect x="${cx - 80}" y="${y - 12}" width="160" height="24" rx="8" style="fill:var(--bg-main);stroke:var(--border);stroke-width:1;"/>
<text x="${cx}" y="${y + 4}" text-anchor="middle" style="font:600 11px/1 'Inter',sans-serif;fill:var(--text-muted);">\u2500\u2500 On-Premises \u2500\u2500</text>`;
  }


  /* ── Connection helpers ───────────────────────────────────────────────── */
  _orthoV(x1, y1, x2, y2, color, markerId) {
    const midY = (y1 + y2) / 2;
    return `<path d="M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}" style="fill:none;stroke:${color};stroke-width:1.6;stroke-opacity:0.45;" marker-end="url(#${markerId})"/>`;
  }

  _lineH(x1, y1, x2, y2, color, markerId) {
    return `<path d="M${x1},${y1} L${x2},${y2}" style="fill:none;stroke:${color};stroke-width:1.6;stroke-opacity:0.45;stroke-dasharray:6,3;" marker-end="url(#${markerId})"/>`;
  }


  /* ══════════════════════════════════════════════════════════════════════════
     NODE DESCRIPTORS — convert data objects to card descriptors
  ══════════════════════════════════════════════════════════════════════════ */
  _descInst(i) {
    const ip = (i.public_ip && i.public_ip !== 'N/A') ? i.public_ip : (i.private_ip || '');
    return { id: i.host_name, kind: 'instance', label: this._t(i.host_name, 18), sub: this._shapeShort(i.shape) + ' · ' + ip, status: i.lifecycle_state };
  }
  _descWaf(p) {
    const r = (p.access_control_rules?.length || 0) + (p.protection_rules?.length || 0) + (p.rate_limiting_rules?.length || 0);
    return { id: p.id, kind: 'waf', label: this._t(p.display_name, 18), sub: `${r} regra${r !== 1 ? 's' : ''}`, status: p.lifecycle_state };
  }
  _descCert(c) {
    const sans = c.subject_alternative_names || [];
    const firstSan = (sans[0] && typeof sans[0] === 'object') ? (sans[0].value || sans[0].name || '') : (sans[0] || '');
    const domain = firstSan || (c.subject && typeof c.subject === 'object' ? c.subject.common_name : '') || '';
    const name = c.name || (c.display_name && typeof c.display_name === 'string' ? c.display_name : '') || 'Certificate';
    return { id: c.id, kind: 'cert', label: this._t(name, 18), sub: this._t(domain, 24), status: c.lifecycle_state };
  }


  /* ── Helpers ─────────────────────────────────────────────────────────── */
  _typeTag() {
    return { full_infra: 'Full Infrastructure', new_host: 'New Host', kubernetes: 'Kubernetes / OKE', waf_report: 'WAF Report' }[this.dt] || this.dt;
  }
  _kindLbl(k) {
    return { instance: 'Compute', lb: 'Load Balancer', drg: 'DRG', oke: 'OKE', waf: 'WAF', cert: 'Certificado', ipsec: 'IPSec', cpe: 'CPE', vg: 'Vol. Group', vol: 'Block Vol.' }[k] || k;
  }
  _stClr(s) {
    if (!s) return null;
    switch ((s + '').toUpperCase()) {
      case 'RUNNING': case 'ACTIVE': case 'AVAILABLE': case 'UP':    return '#3fb950';
      case 'STOPPED': case 'FAILED': case 'TERMINATED': case 'DOWN': return '#f85149';
      case 'PROVISIONING': case 'CREATING': case 'STARTING':         return '#58a6ff';
      case 'STOPPING': case 'TERMINATING':                           return '#f0883e';
      case 'PENDING_DELETION':                                       return '#e3b341';
      default: return null;
    }
  }
  _shapeShort(s) { if (!s) return ''; const p = s.split('.'); return p.length >= 3 ? p.slice(-2).join('.') : s; }
  _t(s, n) { s = s ? String(s) : ''; return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }
  _esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }
}
