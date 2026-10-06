/* @ds-bundle: {"format":4,"namespace":"MonitorKarya","components":[{"name":"Icon"},{"name":"LogoMark"},{"name":"Button"},{"name":"IconButton"},{"name":"SegmentedControl"},{"name":"Chip"},{"name":"SearchField"},{"name":"AccentPicker"},{"name":"StatusBadge"},{"name":"Avatar"},{"name":"ProgressBar"},{"name":"ProgressRing"},{"name":"ActivityRings"},{"name":"StatTile"},{"name":"Sparkline"},{"name":"BarChart"},{"name":"AreaChart"},{"name":"DonutChart"},{"name":"Heatmap"},{"name":"Timeline"},{"name":"FlowDiagram"},{"name":"DivisionBar"},{"name":"AttentionItem"},{"name":"ProjectRow"},{"name":"ApprovalItem"},{"name":"ActivityItem"},{"name":"Card"},{"name":"Sheet"},{"name":"NavItem"},{"name":"TabBar"}]} */
(function () {
  var R = window.React;
  var h = R.createElement;

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) out.push(arguments[i]);
    return out.join(' ');
  }
  function omit(o, keys) {
    var r = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && keys.indexOf(k) < 0) r[k] = o[k];
    return r;
  }
  function useCtl(value, initial, onChange) {
    var st = R.useState(initial);
    var ctl = value !== undefined;
    return [ctl ? value : st[0], function (v) { if (!ctl) st[1](v); if (onChange) onChange(v); }];
  }
  var uidCount = 0;
  function useUid() {
    var ref = R.useRef(null);
    if (ref.current === null) { uidCount += 1; ref.current = 'mkg' + uidCount; }
    return ref.current;
  }
  function fmtID(v) { return typeof v === 'number' ? v.toLocaleString('id-ID') : v; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* Nada warna: [awal gradien, isian, teks] */
  var TONES = {
    accent: ['var(--accent-cerah)', 'var(--accent-fill)', 'var(--accent)'],
    on: ['var(--hijau-cerah)', 'var(--sukses)', 'var(--sukses)'],
    done: ['var(--hijau-cerah)', 'var(--sukses)', 'var(--sukses)'],
    risk: ['var(--oranye-cerah)', 'var(--waspada)', 'var(--waspada)'],
    late: ['var(--merah-cerah)', 'var(--bahaya)', 'var(--bahaya)'],
    info: ['var(--biru-cerah)', 'var(--info)', 'var(--info)'],
    neutral: ['var(--chart-idle)', 'var(--chart-idle)', 'var(--ink-2)'],
    merah: ['var(--merah-cerah)', 'var(--merah-fill)', 'var(--merah)'],
    biru: ['var(--biru-cerah)', 'var(--biru-fill)', 'var(--biru)'],
    hijau: ['var(--hijau-cerah)', 'var(--hijau-fill)', 'var(--hijau)'],
    ungu: ['var(--ungu-cerah)', 'var(--ungu-fill)', 'var(--ungu)'],
    oranye: ['var(--oranye-cerah)', 'var(--oranye-fill)', 'var(--oranye)'],
    grafit: ['var(--grafit-cerah)', 'var(--grafit-fill)', 'var(--grafit)'],
    'data-1': ['var(--biru-cerah)', 'var(--data-1)', 'var(--data-1)'],
    'data-2': ['var(--hijau-cerah)', 'var(--data-2)', 'var(--data-2)'],
    'data-3': ['var(--data-3)', 'var(--data-3)', 'var(--data-3)'],
    'data-4': ['var(--ungu-cerah)', 'var(--data-4)', 'var(--data-4)'],
    'data-5': ['var(--oranye-cerah)', 'var(--data-5)', 'var(--data-5)'],
    'data-6': ['var(--data-6)', 'var(--data-6)', 'var(--data-6)'],
    putih: ['rgba(255,255,255,0.75)', '#FFFFFF', '#FFFFFF']
  };
  function tone(t) { return TONES[t] || TONES.accent; }
  function gradStops(t, a1, a2) {
    var c = tone(t);
    return [
      h('stop', { key: 'a', offset: '0%', style: { stopColor: c[0], stopOpacity: a1 === undefined ? 1 : a1 } }),
      h('stop', { key: 'b', offset: '100%', style: { stopColor: c[1], stopOpacity: a2 === undefined ? 1 : a2 } })
    ];
  }
  function smoothPath(pts) {
    if (!pts.length) return '';
    var d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, t = 0.16;
      d += ' C' + (p1[0] + (p2[0] - p0[0]) * t) + ' ' + (p1[1] + (p2[1] - p0[1]) * t) + ' ' + (p2[0] - (p3[0] - p1[0]) * t) + ' ' + (p2[1] - (p3[1] - p1[1]) * t) + ' ' + p2[0] + ' ' + p2[1];
    }
    return d;
  }

  /* ---------- Ikon ---------- */
  var ICONS = {
    ringkasan: [['rect', { x: 3, y: 3, width: 7, height: 7, rx: 2 }], ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 2 }], ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 2 }], ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 2 }]],
    proyek: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    tim: [['circle', { cx: 9, cy: 8, r: 3.5 }], 'M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5', 'M16 4.5a3.5 3.5 0 0 1 0 7', 'M18 14.8c1.9.7 3.1 2.5 3.5 5.2'],
    persetujuan: [['circle', { cx: 12, cy: 12, r: 9 }], 'm8 12.5 2.8 2.8L16 10'],
    aktivitas: ['M3 12h4l3-8 4 16 3-8h4'],
    kehadiran: [['circle', { cx: 12, cy: 12, r: 9 }], 'M12 7v5l3 2'],
    waktu: [['circle', { cx: 12, cy: 12, r: 9 }], 'M12 7v5l3 2'],
    kalender: [['rect', { x: 3, y: 5, width: 18, height: 16, rx: 3 }], 'M3 10h18M8 3v4M16 3v4'],
    laporan: ['M5 20V11', 'M12 20V5', 'M19 20v-6'],
    cari: [['circle', { cx: 11, cy: 11, r: 7 }], 'm20 20-3.5-3.5'],
    notifikasi: ['M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z', 'M10 20a2 2 0 0 0 4 0'],
    gelap: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
    terang: [['circle', { cx: 12, cy: 12, r: 4 }], 'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
    kanan: ['m9 6 6 6-6 6'],
    kiri: ['m15 6-6 6 6 6'],
    bawah: ['m6 9 6 6 6-6'],
    tutup: ['M6 6l12 12M18 6 6 18'],
    peringatan: ['M12 4 2.5 20h19z', 'M12 10v4', 'M12 17v.01'],
    selesai: ['m5 12.5 4.5 4.5L19 7'],
    info: [['circle', { cx: 12, cy: 12, r: 9 }], 'M12 11v5', 'M12 8v.01'],
    titik: [['circle', { cx: 12, cy: 12, r: 9 }]],
    tambah: ['M12 5v14M5 12h14'],
    naik: ['M4 16l6-6 4 4 6-6', 'M14 8h6v6'],
    turun: ['M4 8l6 6 4-4 6 6', 'M14 16h6v-6'],
    unduh: ['M12 4v11', 'm7 10 5 5 5-5', 'M5 20h14'],
    unggah: ['M12 20V9', 'm7 14 5-5 5 5', 'M5 4h14'],
    catatan: ['M4 5h16v11H9l-5 4z'],
    pengaturan: ['M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1', ['circle', { cx: 15, cy: 6, r: 2 }], ['circle', { cx: 9, cy: 12, r: 2 }], ['circle', { cx: 17, cy: 18, r: 2 }]],
    lainnya: [['circle', { cx: 5, cy: 12, r: 1.2 }], ['circle', { cx: 12, cy: 12, r: 1.2 }], ['circle', { cx: 19, cy: 12, r: 1.2 }]],
    dokumen: ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 13h6M10 17h6'],
    target: [['circle', { cx: 12, cy: 12, r: 9 }], ['circle', { cx: 12, cy: 12, r: 5 }], ['circle', { cx: 12, cy: 12, r: 1 }]],
    pengguna: [['circle', { cx: 12, cy: 8, r: 4 }], 'M4 21c1-4 4.3-6 8-6s7 2 8 6'],
    kunci: [['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }], 'M8 11V8a4 4 0 0 1 8 0v3'],
    gedung: ['M4 21V5l8-2v18', 'M12 8h8v13', 'M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2', 'M3 21h18'],
    kirim: ['M21 3 10 14', 'm21 3-7 18-4-7-7-4z'],
    alur: [['circle', { cx: 6, cy: 6, r: 2.5 }], ['circle', { cx: 18, cy: 18, r: 2.5 }], 'M8.5 6H14a4 4 0 0 1 4 4v5.5']
  };

  function Icon(p) {
    var size = p.size || 20;
    var parts = ICONS[p.name] || ICONS.titik;
    return h('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      strokeWidth: p.strokeWidth || 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
      role: p.label ? 'img' : undefined, 'aria-label': p.label, 'aria-hidden': p.label ? undefined : true,
      className: cx('mk-icon', p.className), style: p.style
    }, parts.map(function (d, i) {
      return typeof d === 'string' ? h('path', { key: i, d: d }) : h(d[0], Object.assign({ key: i }, d[1]));
    }));
  }
  Icon.names = Object.keys(ICONS);

  function LogoMark(p) {
    var size = p.size || 32;
    return h('span', { className: cx('mk-logo', p.className), style: { width: size, height: size, borderRadius: Math.round(size * 0.28) }, role: p.label ? 'img' : undefined, 'aria-label': p.label, 'aria-hidden': p.label ? undefined : true },
      h('span', { className: 'mk-logo__top' }), h('span', { className: 'mk-logo__bottom' }));
  }

  var STATUS = {
    on: { label: 'Sesuai jadwal', icon: 'selesai' },
    risk: { label: 'Perlu perhatian', icon: 'peringatan' },
    late: { label: 'Terlambat', icon: 'waktu' },
    done: { label: 'Selesai', icon: 'selesai' },
    info: { label: 'Informasi', icon: 'info' },
    neutral: { label: 'Belum mulai', icon: 'titik' }
  };

  /* ---------- Aksi ---------- */
  function Button(p) {
    var variant = p.variant || 'secondary';
    var size = p.size || 'md';
    var iconSize = size === 'sm' ? 16 : 18;
    var rest = omit(p, ['variant', 'size', 'icon', 'iconAfter', 'full', 'className', 'children']);
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('mk-btn', 'mk-btn--' + variant, 'mk-btn--' + size, p.full && 'mk-btn--full', p.className)
    }),
      p.icon ? h(Icon, { name: p.icon, size: iconSize, strokeWidth: 2 }) : null,
      h('span', null, p.children),
      p.iconAfter ? h(Icon, { name: p.iconAfter, size: iconSize, strokeWidth: 2 }) : null);
  }

  function IconButton(p) {
    var rest = omit(p, ['icon', 'label', 'variant', 'badge', 'className']);
    return h('button', Object.assign({ type: 'button', 'aria-label': p.label, title: p.label }, rest, {
      className: cx('mk-iconbtn', 'mk-iconbtn--' + (p.variant || 'plain'), p.className)
    }),
      h(Icon, { name: p.icon, size: 20 }),
      p.badge === true ? h('span', { className: 'mk-iconbtn__dot', 'aria-hidden': true }) :
        (p.badge ? h('span', { className: 'mk-iconbtn__count', 'aria-hidden': true }, p.badge) : null));
  }

  /* ---------- Kontrol ---------- */
  function SegmentedControl(p) {
    var opts = p.options || [];
    var s = useCtl(p.value, p.defaultValue !== undefined ? p.defaultValue : (opts[0] && opts[0].value), p.onChange);
    return h('div', { role: 'group', 'aria-label': p.label || 'Pilihan', className: cx('mk-seg', p.size === 'sm' && 'mk-seg--sm', p.full && 'mk-seg--full', p.className) },
      opts.map(function (o) {
        var on = o.value === s[0];
        return h('button', { key: o.value, type: 'button', 'aria-pressed': on, className: cx('mk-seg__btn', on && 'is-on'), onClick: function () { s[1](o.value); } }, o.label);
      }));
  }

  function Chip(p) {
    var rest = omit(p, ['selected', 'count', 'className', 'children', 'status']);
    return h('button', Object.assign({ type: 'button', 'aria-pressed': !!p.selected }, rest, {
      className: cx('mk-chip', p.selected && 'is-on', p.className)
    }),
      p.status ? h('span', { className: cx('mk-dot', 'mk-bg--' + p.status), 'aria-hidden': true }) : null,
      h('span', null, p.children),
      p.count !== undefined ? h('span', { className: 'mk-chip__count' }, p.count) : null);
  }

  function SearchField(p) {
    var id = p.id || 'mk-cari';
    return h('div', { className: cx('mk-search', p.className) },
      h(Icon, { name: 'cari', size: 18 }),
      h('label', { htmlFor: id, className: 'mk-sr' }, p.label || 'Cari'),
      h('input', {
        id: id, type: 'search', placeholder: p.placeholder || 'Cari proyek, orang, laporan',
        value: p.value, defaultValue: p.value === undefined ? p.defaultValue : undefined,
        onChange: p.onChange ? function (e) { p.onChange(e.target.value); } : undefined
      }),
      p.shortcut ? h('kbd', { className: 'mk-search__kbd' }, p.shortcut) : null);
  }

  var ACCENTS = [['merah', 'Merah'], ['biru', 'Biru'], ['hijau', 'Hijau'], ['ungu', 'Ungu'], ['oranye', 'Oranye'], ['grafit', 'Grafit']];
  function AccentPicker(p) {
    var s = useCtl(p.value, p.defaultValue || 'merah', p.onChange);
    return h('div', { role: 'group', 'aria-label': p.label || 'Warna aksen', className: cx('mk-accents', p.className) },
      ACCENTS.map(function (a) {
        var on = a[0] === s[0];
        return h('button', {
          key: a[0], type: 'button', 'aria-pressed': on, 'aria-label': 'Aksen ' + a[1], title: a[1],
          className: cx('mk-swatch', 'mk-swatch--' + a[0], on && 'is-on'), onClick: function () { s[1](a[0]); }
        });
      }));
  }
  AccentPicker.accents = ACCENTS.map(function (a) { return a[0]; });

  /* ---------- Status & identitas ---------- */
  function StatusBadge(p) {
    var st = STATUS[p.status] ? p.status : 'on';
    var m = STATUS[st];
    var sm = p.size === 'sm';
    return h('span', { className: cx('mk-badge', 'mk-badge--' + st, sm && 'mk-badge--sm', p.className) },
      h(Icon, { name: m.icon, size: sm ? 13 : 14, strokeWidth: 2.4 }),
      h('span', null, p.children || m.label));
  }

  function Avatar(p) {
    var size = p.size || 32;
    return h('span', {
      className: cx('mk-avatar', 'mk-tone--' + (p.tone || 'accent'), p.className),
      style: { width: size, height: size, fontSize: Math.round(size * 0.38) },
      role: p.name ? 'img' : undefined, 'aria-label': p.name, title: p.name
    }, h('span', { 'aria-hidden': p.name ? true : undefined }, p.initials));
  }

  function ProgressBar(p) {
    var v = clamp(Math.round(p.value || 0), 0, 100);
    return h('div', { className: cx('mk-progress', p.size === 'lg' && 'mk-progress--lg', p.className) },
      h('div', { className: 'mk-progress__track', role: 'progressbar', 'aria-valuenow': v, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': p.label || 'Progres' },
        h('div', { className: cx('mk-progress__fill', 'mk-bg--' + (p.status || 'accent')), style: { width: v + '%' } })),
      p.showValue === false ? null : h('span', { className: 'mk-progress__value' }, v + '%'));
  }

  function ProgressRing(p) {
    var size = p.size || 160;
    var sw = p.stroke || Math.max(6, Math.round(size / 11));
    var r = (size - sw) / 2;
    var c = 2 * Math.PI * r;
    var v = clamp(p.value || 0, 0, 100);
    var half = size / 2;
    var uid = useUid();
    var t = p.status || 'accent';
    return h('div', { className: cx('mk-ring', p.className), style: { width: size, height: size }, role: 'img', 'aria-label': p.ariaLabel || (v + '% ' + (p.sublabel || '')) },
      h('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': true },
        h('defs', null, h('linearGradient', { id: uid, x1: 0, y1: 0, x2: 1, y2: 1 }, gradStops(t))),
        h('circle', { cx: half, cy: half, r: r, fill: 'none', strokeWidth: sw, style: { stroke: tone(t)[1], opacity: 0.16 } }),
        h('circle', {
          className: 'mk-ring__fill', cx: half, cy: half, r: r, fill: 'none', stroke: 'url(#' + uid + ')',
          strokeWidth: sw, strokeLinecap: 'round', strokeDasharray: (c * v / 100) + ' ' + c, transform: 'rotate(-90 ' + half + ' ' + half + ')'
        })),
      h('div', { className: 'mk-ring__center', 'aria-hidden': true },
        h('span', { className: 'mk-ring__value', style: { fontSize: Math.round(size * 0.24) } }, p.label !== undefined ? p.label : v + '%'),
        p.sublabel ? h('span', { className: 'mk-ring__sub' }, p.sublabel) : null));
  }

  function ActivityRings(p) {
    var rings = p.rings || [];
    var size = p.size || 180;
    var th = p.thickness || Math.round(size / 9.5);
    var gap = p.gap !== undefined ? p.gap : Math.max(2, Math.round(th * 0.18));
    var half = size / 2;
    var uid = useUid();
    return h('div', { className: cx('mk-rings', p.layout === 'stack' && 'mk-rings--stack', p.className) },
      h('div', { className: 'mk-rings__art', style: { width: size, height: size }, role: 'img', 'aria-label': rings.map(function (rg) { return rg.label + ' ' + (rg.display || rg.value + '%'); }).join(', ') },
        h('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': true },
          h('defs', null, rings.map(function (rg, i) { return h('linearGradient', { key: i, id: uid + 'r' + i, x1: 0, y1: 0, x2: 1, y2: 1 }, gradStops(rg.tone)); })),
          rings.map(function (rg, i) {
            var r = half - th / 2 - i * (th + gap);
            if (r <= th / 2) return null;
            var c = 2 * Math.PI * r;
            var v = clamp(rg.value || 0, 0, 100);
            return h('g', { key: i },
              h('circle', { cx: half, cy: half, r: r, fill: 'none', strokeWidth: th, style: { stroke: tone(rg.tone)[1], opacity: 0.18 } }),
              h('circle', { className: 'mk-rings__fill', cx: half, cy: half, r: r, fill: 'none', strokeWidth: th, strokeLinecap: 'round', stroke: 'url(#' + uid + 'r' + i + ')', strokeDasharray: (c * v / 100) + ' ' + c, transform: 'rotate(-90 ' + half + ' ' + half + ')' }));
          })),
        p.center ? h('div', { className: 'mk-rings__center', 'aria-hidden': true }, p.center) : null),
      p.showLegend === false ? null : h('div', { className: 'mk-rings__legend' },
        rings.map(function (rg, i) {
          var c = tone(rg.tone);
          return h('div', { key: i, className: 'mk-rings__item' },
            h('span', { className: 'mk-rings__swatch', style: { background: 'linear-gradient(135deg, ' + c[0] + ', ' + c[1] + ')' } }),
            h('span', { className: 'mk-rings__text' },
              h('span', { className: 'mk-rings__label' }, rg.label),
              h('span', { className: 'mk-rings__val', style: { color: c[2] } }, rg.display || (rg.value + '%')),
              rg.sub ? h('span', { className: 'mk-rings__sub' }, rg.sub) : null));
        })));
  }

  /* ---------- Data ---------- */
  function Sparkline(p) {
    var data = p.data || [];
    var H = p.height || 36, W = 200;
    var uid = useUid();
    var t = p.tone || 'accent';
    var max = Math.max.apply(null, data.concat([1])), min = Math.min.apply(null, data.concat([max]));
    var range = (max - min) || 1;
    var pts = data.map(function (v, i) { return [data.length < 2 ? W / 2 : i * W / (data.length - 1), 4 + (H - 8) * (1 - (v - min) / range)]; });
    var line = smoothPath(pts);
    var last = pts[pts.length - 1] || [W, H / 2];
    return h('div', { className: cx('mk-spark', p.className), style: { height: H }, role: 'img', 'aria-label': p.label || ('Tren ' + data.join(', ')) },
      h('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', width: '100%', height: H, 'aria-hidden': true },
        h('defs', null,
          h('linearGradient', { id: uid + 'f', x1: 0, y1: 0, x2: 0, y2: 1 }, h('stop', { offset: '0%', style: { stopColor: tone(t)[1], stopOpacity: 0.28 } }), h('stop', { offset: '100%', style: { stopColor: tone(t)[1], stopOpacity: 0 } })),
          h('linearGradient', { id: uid + 'l', x1: 0, y1: 0, x2: 1, y2: 0 }, gradStops(t))),
        p.area === false ? null : h('path', { d: line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z', fill: 'url(#' + uid + 'f)' }),
        h('path', { d: line, fill: 'none', stroke: 'url(#' + uid + 'l)', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' })),
      h('span', { className: 'mk-spark__dot', style: { top: last[1], background: tone(t)[1] } }));
  }

  function StatTile(p) {
    var trend = p.trend || 'flat';
    var grad = p.variant === 'gradient';
    var t = p.tone || (trend === 'up' ? 'on' : trend === 'down' ? 'late' : 'neutral');
    return h('div', { className: cx('mk-stat', grad && 'mk-stat--gradient', p.variant === 'surface' && 'mk-stat--surface', p.className) },
      h('div', { className: 'mk-stat__label' }, p.label),
      h('div', { className: 'mk-stat__value' }, fmtID(p.value)),
      p.delta ? h('div', { className: cx('mk-stat__delta', !grad && 'mk-text--' + t) },
        trend !== 'flat' ? h(Icon, { name: trend === 'up' ? 'naik' : 'turun', size: 14, strokeWidth: 2.2 }) : null,
        h('span', null, p.delta)) : null,
      p.spark ? h('div', { className: 'mk-stat__spark' }, h(Sparkline, { data: p.spark, height: 34, tone: grad ? 'putih' : (p.sparkTone || 'accent'), label: p.label + ': tren' })) : null);
  }

  function BarChart(p) {
    var data = p.data || [];
    var s = useCtl(p.selectedIndex, p.defaultSelectedIndex !== undefined ? p.defaultSelectedIndex : data.length - 1, p.onSelect);
    var max = 0;
    data.forEach(function (d) { if (d.value > max) max = d.value; });
    var H = p.height || 200;
    var fmt = p.formatValue || fmtID;
    return h('div', { className: cx('mk-bars', p.className) },
      h('div', { className: 'mk-bars__plot', style: { height: H } },
        data.map(function (d, i) {
          var on = i === s[0];
          var bh = max ? Math.max(6, Math.round(d.value / max * (H - 28))) : 6;
          return h('button', {
            key: i, type: 'button', className: cx('mk-bars__col', on && 'is-on'), 'aria-pressed': on,
            'aria-label': d.label + ': ' + fmt(d.value) + (p.unit ? ' ' + p.unit : ''), onClick: function () { s[1](i); }
          },
            h('span', { className: 'mk-bars__val' }, fmt(d.value)),
            h('span', { className: 'mk-bars__bar', style: { height: bh } }));
        })),
      h('div', { className: 'mk-bars__axis', 'aria-hidden': true },
        data.map(function (d, i) { return h('span', { key: i, className: cx('mk-bars__label', i === s[0] && 'is-on') }, d.label); })));
  }

  function AreaChart(p) {
    var data = p.data || [];
    var n = data.length;
    var H = p.height || 220, W = 1000, padT = 34, padB = 6;
    var uid = useUid();
    var s = useCtl(p.selectedIndex, p.defaultSelectedIndex !== undefined ? p.defaultSelectedIndex : n - 1, p.onSelect);
    var t = p.tone || 'accent';
    var fmt = p.formatValue || fmtID;
    var vals = data.map(function (d) { return d.value; });
    var max = Math.max.apply(null, vals.concat([1]));
    var min = p.zero === false ? Math.min.apply(null, vals.concat([max])) * 0.9 : 0;
    var x = function (i) { return n <= 1 ? W / 2 : i * W / (n - 1); };
    var y = function (v) { return padT + (H - padT - padB) * (1 - (v - min) / ((max - min) || 1)); };
    var pts = data.map(function (d, i) { return [x(i), y(d.value)]; });
    var cmp = p.compare ? p.compare.map(function (v, i) { return [x(i), y(v)]; }) : null;
    var line = smoothPath(pts);
    var sel = clamp(s[0] === null || s[0] === undefined ? n - 1 : s[0], 0, Math.max(0, n - 1));
    var sp = pts[sel] || [W / 2, H / 2];
    var left = n <= 1 ? 50 : sel / (n - 1) * 100;
    return h('div', { className: cx('mk-area', p.className) },
      h('div', { className: 'mk-area__plot', style: { height: H } },
        h('svg', { className: 'mk-area__svg', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', width: '100%', height: H, 'aria-hidden': true },
          h('defs', null,
            h('linearGradient', { id: uid + 'f', x1: 0, y1: 0, x2: 0, y2: 1 }, h('stop', { offset: '0%', style: { stopColor: tone(t)[1], stopOpacity: 0.3 } }), h('stop', { offset: '100%', style: { stopColor: tone(t)[1], stopOpacity: 0 } })),
            h('linearGradient', { id: uid + 'l', x1: 0, y1: 0, x2: 1, y2: 0 }, gradStops(t))),
          [0.25, 0.5, 0.75].map(function (f) { var yy = padT + (H - padT - padB) * f; return h('line', { key: f, x1: 0, x2: W, y1: yy, y2: yy, className: 'mk-area__grid', vectorEffect: 'non-scaling-stroke' }); }),
          cmp ? h('path', { d: smoothPath(cmp), fill: 'none', className: 'mk-area__cmp', strokeWidth: 2, strokeDasharray: '6 6', vectorEffect: 'non-scaling-stroke' }) : null,
          h('path', { d: line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z', fill: 'url(#' + uid + 'f)' }),
          h('path', { d: line, fill: 'none', stroke: 'url(#' + uid + 'l)', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' })),
        h('span', { className: 'mk-area__rule', style: { left: left + '%', top: sp[1] } }),
        h('span', { className: 'mk-area__dot', style: { left: left + '%', top: sp[1], background: tone(t)[1] } }),
        n ? h('span', { className: 'mk-area__tip', style: { left: 'clamp(44px, ' + left + '%, calc(100% - 44px))', top: Math.max(0, sp[1] - 46) } }, fmt(data[sel].value) + (p.unit ? ' ' + p.unit : '')) : null,
        h('div', { className: 'mk-area__hits' },
          data.map(function (d, i) {
            return h('button', { key: i, type: 'button', className: 'mk-area__hit', 'aria-pressed': i === sel, 'aria-label': d.label + ': ' + fmt(d.value) + (p.unit ? ' ' + p.unit : ''), onClick: function () { s[1](i); } });
          }))),
      h('div', { className: 'mk-area__axis', 'aria-hidden': true },
        data.map(function (d, i) { return h('span', { key: i, className: cx('mk-area__label', i === sel && 'is-on') }, d.label); })),
      p.compare && p.compareLabel ? h('div', { className: 'mk-area__legend' },
        h('span', null, h('i', { style: { background: tone(t)[1] } }), p.seriesLabel || 'Periode ini'),
        h('span', null, h('i', { className: 'is-dash' }), p.compareLabel)) : null);
  }

  function DonutChart(p) {
    var segs = p.data || [];
    var size = p.size || 180, th = p.thickness || Math.round(size / 8);
    var r = (size - th) / 2, c = 2 * Math.PI * r, half = size / 2;
    var total = segs.reduce(function (a, sg) { return a + sg.value; }, 0) || 1;
    var gap = segs.length > 1 ? (p.gap !== undefined ? p.gap : 4) : 0;
    var s = useCtl(p.selectedIndex, null, p.onSelect);
    var uid = useUid();
    var fmt = p.formatValue || fmtID;
    var off = 0;
    var cur = s[0] !== null && s[0] !== undefined ? segs[s[0]] : null;
    return h('div', { className: cx('mk-donut', p.layout === 'stack' && 'mk-donut--stack', p.className) },
      h('div', { className: 'mk-donut__art', style: { width: size, height: size }, role: 'img', 'aria-label': (p.label || 'Komposisi') + ': ' + segs.map(function (sg) { return sg.label + ' ' + fmt(sg.value); }).join(', ') },
        h('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': true },
          h('defs', null, segs.map(function (sg, i) { return h('linearGradient', { key: i, id: uid + 'd' + i, x1: 0, y1: 0, x2: 1, y2: 1 }, gradStops(sg.tone)); })),
          segs.map(function (sg, i) {
            var len = c * sg.value / total;
            var vis = Math.max(0.5, len - gap);
            var el = h('circle', {
              key: i, cx: half, cy: half, r: r, fill: 'none', strokeWidth: s[0] === i ? th + 6 : th, stroke: 'url(#' + uid + 'd' + i + ')',
              strokeDasharray: vis + ' ' + (c - vis), strokeDashoffset: -off, transform: 'rotate(-90 ' + half + ' ' + half + ')',
              className: cx('mk-donut__seg', s[0] !== null && s[0] !== undefined && s[0] !== i && 'is-dim'), onClick: function () { s[1](s[0] === i ? null : i); }
            });
            off += len;
            return el;
          })),
        h('div', { className: 'mk-donut__center', 'aria-hidden': true },
          h('span', { className: 'mk-donut__value', style: { fontSize: Math.round(size * 0.2) } }, cur ? fmt(cur.value) : (p.centerLabel !== undefined ? p.centerLabel : fmt(total))),
          h('span', { className: 'mk-donut__sub' }, cur ? cur.label : (p.centerSub || 'total')))),
      p.showLegend === false ? null : h('div', { className: 'mk-donut__legend' },
        segs.map(function (sg, i) {
          var tc = tone(sg.tone);
          return h('button', { key: i, type: 'button', 'aria-pressed': s[0] === i, className: cx('mk-donut__item', s[0] === i && 'is-on'), onClick: function () { s[1](s[0] === i ? null : i); } },
            h('span', { className: 'mk-donut__swatch', style: { background: 'linear-gradient(135deg, ' + tc[0] + ', ' + tc[1] + ')' } }),
            h('span', { className: 'mk-donut__label' }, sg.label),
            h('span', { className: 'mk-donut__num' }, fmt(sg.value)),
            h('span', { className: 'mk-donut__pct' }, Math.round(sg.value / total * 100) + '%'));
        })));
  }

  function Heatmap(p) {
    var rows = p.data || [];
    var cols = rows[0] ? rows[0].length : 0;
    var max = p.max || 4;
    var cell = p.cell || 18;
    var t = tone(p.tone || 'accent');
    var rl = p.rowLabels || [];
    var cl = p.colLabels || [];
    var fmt = p.formatCell || function (v) { return v; };
    return h('div', { className: cx('mk-heat', p.className) },
      h('div', { className: 'mk-heat__grid', role: 'img', 'aria-label': p.label || 'Peta panas', style: { gridTemplateColumns: 'auto repeat(' + cols + ', ' + cell + 'px)', gridAutoRows: cell + 'px' } },
        h('span', null),
        Array.apply(null, { length: cols }).map(function (_, j) { return h('span', { key: 'c' + j, className: 'mk-heat__col' }, cl[j] || ''); }),
        rows.map(function (row, i) {
          return [h('span', { key: 'l' + i, className: 'mk-heat__row' }, rl[i] || '')].concat(row.map(function (v, j) {
            var pct = v === null || v === undefined ? -1 : Math.round(clamp(v / max, 0, 1) * 100);
            return h('span', {
              key: i + '-' + j, className: cx('mk-heat__cell', pct < 0 && 'is-empty'), title: (rl[i] || '') + ' ' + (cl[j] || '') + ': ' + (pct < 0 ? 'libur' : fmt(v)),
              style: pct < 0 ? null : { background: pct === 0 ? 'var(--fill-1)' : 'color-mix(in srgb, ' + t[1] + ' ' + (18 + Math.round(pct * 0.82)) + '%, var(--fill-1))' }
            });
          }));
        })),
      p.showLegend === false ? null : h('div', { className: 'mk-heat__legend', 'aria-hidden': true },
        h('span', null, p.lowLabel || 'Sedikit'),
        [0, 25, 50, 75, 100].map(function (k) { return h('i', { key: k, style: { background: k === 0 ? 'var(--fill-1)' : 'color-mix(in srgb, ' + t[1] + ' ' + (18 + Math.round(k * 0.82)) + '%, var(--fill-1))' } }); }),
        h('span', null, p.highLabel || 'Banyak')));
  }

  function Timeline(p) {
    var rows = p.rows || [];
    var span = p.span || 30;
    var ticks = p.ticks || [];
    var s = useCtl(p.selectedId, null, p.onSelect);
    var pct = function (v) { return clamp(v / span * 100, 0, 100); };
    return h('div', { className: cx('mk-tl', p.className) },
      h('div', { className: 'mk-tl__head' },
        h('span', { className: 'mk-tl__corner' }, p.title || ''),
        h('div', { className: 'mk-tl__scale' },
          ticks.map(function (tk, i) { return h('span', { key: i, className: 'mk-tl__tick', style: { left: pct(tk.at) + '%' } }, tk.label); }),
          p.today !== undefined ? h('span', { className: 'mk-tl__todaylabel', style: { left: pct(p.today) + '%' } }, p.todayLabel || 'Hari ini') : null)),
      h('div', { className: 'mk-tl__body' },
        rows.map(function (rw) {
          var st = rw.status || 'on';
          var tc = tone(st);
          var on = s[0] === rw.id;
          return h('button', { key: rw.id || rw.label, type: 'button', className: cx('mk-tl__row', on && 'is-on'), 'aria-pressed': on, 'aria-label': rw.label + ', ' + (rw.range || '') + ', progres ' + (rw.progress || 0) + '%, ' + (STATUS[st] ? STATUS[st].label : ''), onClick: function () { s[1](on ? null : rw.id); } },
            h('span', { className: 'mk-tl__label' }, h('span', { className: 'mk-tl__name' }, rw.label), rw.sub ? h('span', { className: 'mk-tl__sub' }, rw.sub) : null),
            h('span', { className: 'mk-tl__track' },
              ticks.map(function (tk, i) { return h('i', { key: i, className: 'mk-tl__grid', style: { left: pct(tk.at) + '%' } }); }),
              h('span', { className: cx('mk-tl__bar', 'mk-soft--' + st), style: { left: pct(rw.start) + '%', width: Math.max(2, pct(rw.end) - pct(rw.start)) + '%' } },
                h('span', { className: 'mk-tl__fill', style: { width: clamp(rw.progress || 0, 0, 100) + '%', background: 'linear-gradient(90deg, ' + tc[0] + ', ' + tc[1] + ')' } }),
                h('span', { className: 'mk-tl__pct' }, (rw.progress || 0) + '%')),
              rw.milestone !== undefined ? h('span', { className: 'mk-tl__ms', style: { left: pct(rw.milestone) + '%', background: tc[1] } }) : null));
        }),
        p.today !== undefined ? h('span', { className: 'mk-tl__today', style: { left: 'calc(var(--tl-label) + (100% - var(--tl-label)) * ' + (pct(p.today) / 100) + ')' } }) : null));
  }

  var FLOW = {
    done: { icon: 'selesai', label: 'Selesai' },
    current: { icon: 'waktu', label: 'Sedang berjalan' },
    todo: { icon: 'titik', label: 'Berikutnya' },
    blocked: { icon: 'peringatan', label: 'Tertahan' }
  };
  function FlowDiagram(p) {
    var steps = p.steps || [];
    var vertical = p.orientation === 'vertical';
    return h('ol', { className: cx('mk-flow', vertical && 'mk-flow--v', p.className), 'aria-label': p.label || 'Alur' },
      steps.map(function (st, i) {
        var k = FLOW[st.status] ? st.status : 'todo';
        var next = steps[i + 1];
        return h('li', { key: i, className: cx('mk-flow__step', 'is-' + k) },
          h('span', { className: 'mk-flow__node' }, h(Icon, { name: st.icon || FLOW[k].icon, size: 20, strokeWidth: 2.1 })),
          next ? h('span', { className: cx('mk-flow__line', k === 'done' && 'is-done'), 'aria-hidden': true }) : null,
          h('span', { className: 'mk-flow__text' },
            h('span', { className: 'mk-flow__title' }, st.title),
            st.sub ? h('span', { className: 'mk-flow__sub' }, st.sub) : null,
            h('span', { className: 'mk-flow__state' }, st.meta || FLOW[k].label)));
      }));
  }

  function DivisionBar(p) {
    var v = clamp(p.value || 0, 0, 100);
    var t = p.tone || 'data-1';
    var tc = tone(t);
    return h('div', { className: cx('mk-divbar', p.className) },
      h('div', { className: 'mk-divbar__top' },
        h('span', { className: 'mk-divbar__name' }, h('span', { className: cx('mk-dot', 'mk-tone--' + t), 'aria-hidden': true }), p.name),
        h('span', { className: 'mk-divbar__val' }, v + '%')),
      h('div', { className: 'mk-divbar__track', role: 'img', 'aria-label': p.name + ' ' + v + '%' + (p.target ? ', target ' + p.target + '%' : '') },
        h('div', { className: 'mk-divbar__fill', style: { width: v + '%', background: 'linear-gradient(90deg, ' + tc[0] + ', ' + tc[1] + ')' } }),
        p.target ? h('span', { className: 'mk-divbar__target', style: { left: p.target + '%' } }) : null),
      p.meta ? h('div', { className: 'mk-divbar__meta' }, p.meta) : null);
  }

  /* ---------- Daftar ---------- */
  function AttentionItem(p) {
    var st = STATUS[p.status] ? p.status : 'risk';
    var m = STATUS[st];
    return h('button', { type: 'button', className: cx('mk-attn', p.className), onClick: p.onClick },
      h('span', { className: cx('mk-attn__icon', 'mk-soft--' + st), 'aria-hidden': true }, h(Icon, { name: m.icon, size: 18, strokeWidth: 2.2 })),
      h('span', { className: 'mk-attn__body' },
        h('span', { className: 'mk-attn__title' }, p.title),
        p.reason ? h('span', { className: 'mk-attn__reason' }, p.reason) : null,
        h('span', { className: cx('mk-attn__meta', 'mk-text--' + st) }, m.label + (p.meta ? ' · ' + p.meta : ''))),
      h(Icon, { name: 'kanan', size: 18, className: 'mk-attn__chev' }));
  }

  function ProjectRow(p) {
    var st = STATUS[p.status] ? p.status : 'on';
    return h('button', {
      type: 'button', className: cx('mk-prow', p.compact && 'mk-prow--compact', p.selected && 'is-on', p.className),
      onClick: p.onClick, 'aria-label': 'Buka detail ' + p.name
    },
      h('span', { className: 'mk-prow__name' },
        h('span', { className: 'mk-prow__title' }, p.name),
        h('span', { className: 'mk-prow__div' }, h('span', { className: cx('mk-dot', 'mk-tone--' + (p.divisionTone || 'data-1')) }), p.division,
          p.compact ? h('span', null, ' · ' + p.due) : null)),
      h('span', { className: 'mk-prow__pic' },
        h(Avatar, { initials: p.initials, tone: p.divisionTone, size: 28 }),
        h('span', { className: 'mk-prow__picname' }, p.pic)),
      h('span', { className: 'mk-prow__prog' }, h(ProgressBar, { value: p.progress, status: st, label: 'Progres ' + p.name })),
      h('span', { className: cx('mk-prow__due', st === 'late' && 'mk-text--late') }, p.due),
      h('span', { className: 'mk-prow__status' }, h(StatusBadge, { status: st, size: 'sm' })));
  }

  function ApprovalItem(p) {
    var s = useCtl(p.state, 'pending', p.onStateChange);
    var done = s[0] !== 'pending';
    var who = p.requester || p.from || '';
    return h('div', { className: cx('mk-appr', done && 'is-done', p.className) },
      h(Avatar, { initials: p.initials, tone: p.tone, size: 36, name: who }),
      h('div', { className: 'mk-appr__body' },
        h('div', { className: 'mk-appr__title' }, p.title),
        h('div', { className: 'mk-appr__meta' }, who + ' · ' + p.time + (p.amount ? ' · ' + p.amount : ''))),
      done
        ? h(StatusBadge, { status: s[0] === 'approved' ? 'done' : 'late', size: 'sm' }, s[0] === 'approved' ? (p.approvedLabel || 'Disetujui') : (p.rejectedLabel || 'Ditolak'))
        : h('div', { className: 'mk-appr__actions' },
          h(Button, { size: p.size || 'sm', variant: 'secondary', onClick: function () { s[1]('rejected'); if (p.onReject) p.onReject(); } }, p.rejectLabel || 'Tolak'),
          h(Button, { size: p.size || 'sm', variant: 'primary', onClick: function () { s[1]('approved'); if (p.onApprove) p.onApprove(); } }, p.approveLabel || 'Setujui')));
  }

  function ActivityItem(p) {
    return h('div', { className: cx('mk-act', p.last && 'is-last', p.className) },
      h('div', { className: 'mk-act__rail' }, h(Avatar, { initials: p.initials, tone: p.tone, size: 32 })),
      h('div', { className: 'mk-act__body' },
        h('div', { className: 'mk-act__text' }, h('strong', null, p.who), ' ', p.action),
        h('div', { className: 'mk-act__time' }, p.time)));
  }

  /* ---------- Wadah ---------- */
  function Card(p) {
    var hasHead = p.title || p.action;
    var v = p.variant || 'default';
    return h('section', { className: cx('mk-card', 'mk-card--' + v, p.className), id: p.id, 'aria-label': p.title || p.ariaLabel },
      hasHead ? h('header', { className: 'mk-card__head' },
        h('div', { className: 'mk-card__titles' },
          p.title ? h('h3', { className: 'mk-card__title' }, p.title) : null,
          p.subtitle ? h('p', { className: 'mk-card__sub' }, p.subtitle) : null),
        p.action || null) : null,
      p.children);
  }

  function Sheet(p) {
    return h('div', {
      className: cx('mk-sheet', 'mk-sheet--' + (p.variant || 'side'), p.className),
      role: 'dialog', 'aria-modal': p.modal ? true : undefined, 'aria-label': p.title
    },
      p.variant === 'bottom' ? h('span', { className: 'mk-sheet__grabber', 'aria-hidden': true }) : null,
      h('header', { className: 'mk-sheet__head' },
        h('div', { className: 'mk-sheet__titles' },
          p.eyebrow ? h('div', { className: 'mk-sheet__eyebrow' }, p.eyebrow) : null,
          h('h2', { className: 'mk-sheet__title' }, p.title),
          p.subtitle ? h('p', { className: 'mk-sheet__sub' }, p.subtitle) : null),
        p.onClose ? h(IconButton, { icon: 'tutup', label: 'Tutup', variant: 'filled', onClick: p.onClose }) : null),
      h('div', { className: 'mk-sheet__body' }, p.children),
      p.footer ? h('footer', { className: 'mk-sheet__foot' }, p.footer) : null);
  }

  /* ---------- Navigasi ---------- */
  function NavItem(p) {
    return h('a', { href: p.href || '#', className: cx('mk-nav', p.active && 'is-on', p.className), 'aria-current': p.active ? 'page' : undefined, onClick: p.onClick },
      h(Icon, { name: p.icon, size: 20, strokeWidth: p.active ? 2.1 : 1.8 }),
      h('span', { className: 'mk-nav__label' }, p.label),
      p.count !== undefined && p.count !== null && p.count !== '' ? h('span', { className: cx('mk-nav__count', p.countTone === 'accent' && 'is-accent') }, p.count) : null);
  }

  function TabBar(p) {
    var items = p.items || [];
    var s = useCtl(p.value, items[0] && items[0].value, p.onChange);
    return h('nav', { className: cx('mk-tabbar', p.floating && 'mk-tabbar--floating', p.className), 'aria-label': p.label || 'Navigasi utama' },
      items.map(function (it) {
        var on = it.value === s[0];
        return h('button', { key: it.value, type: 'button', className: cx('mk-tab', on && 'is-on'), 'aria-current': on ? 'page' : undefined, onClick: function () { s[1](it.value); } },
          h('span', { className: 'mk-tab__icon' },
            h(Icon, { name: it.icon, size: p.floating ? 18 : 24, strokeWidth: on ? 2.1 : 1.8 }),
            it.badge ? h('span', { className: 'mk-tab__badge' }, it.badge) : null),
          h('span', { className: 'mk-tab__label' }, it.label));
      }));
  }

  var api = {
    Icon: Icon, LogoMark: LogoMark, Button: Button, IconButton: IconButton, SegmentedControl: SegmentedControl, Chip: Chip,
    SearchField: SearchField, AccentPicker: AccentPicker, StatusBadge: StatusBadge, Avatar: Avatar,
    ProgressBar: ProgressBar, ProgressRing: ProgressRing, ActivityRings: ActivityRings, StatTile: StatTile, Sparkline: Sparkline,
    BarChart: BarChart, AreaChart: AreaChart, DonutChart: DonutChart, Heatmap: Heatmap, Timeline: Timeline, FlowDiagram: FlowDiagram,
    DivisionBar: DivisionBar, AttentionItem: AttentionItem, ProjectRow: ProjectRow, ApprovalItem: ApprovalItem,
    ActivityItem: ActivityItem, Card: Card, Sheet: Sheet, NavItem: NavItem, TabBar: TabBar
  };
  window.MonitorKarya = Object.assign(window.MonitorKarya || {}, api);
})();
