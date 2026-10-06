/** Konstanta skrip untuk <head> — berkas server-aman (tanpa 'use client'). */
const PREFS_KEY = 'mk-tampilan'

/** Dipasang di <head>: membaca preferensi sebelum CSS dirender. */
export const PREFS_BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var p=JSON.parse(localStorage.getItem('${PREFS_KEY}')||'{}');var a=p.accent;if(['merah','biru','hijau','ungu','oranye','grafit'].indexOf(a)<0)a='merah';d.dataset.accent=a;d.dataset.nav=p.nav==='dock'?'dock':'sidebar';d.dataset.dockAutohide=p.dockAutohide===true?'true':'false';}catch(e){d.dataset.accent='merah';d.dataset.nav='sidebar';}})();`
