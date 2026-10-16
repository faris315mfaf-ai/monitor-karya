import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * Ajakan pasang PWA (KONTRAK-FASE1-PWA.md C.5): deteksi iOS Safari di luar
 * layar utama, pemilihan mode, dan status tersimpan `mk:install-prompt`
 * (akses penyimpanan dibungkus try/catch).
 */

import {
  INSTALL_KEY, InstallPrompt, installMode, isIosDevice, isIosSafari, isStandalone, readInstallState, writeInstallState,
} from '@/components/mk/install-prompt'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.0 (iPhone15,2; iOS 18_5)',
  iphoneWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
}

describe('deteksi perangkat', () => {
  it('iPhone dan iPadOS (mengaku Macintosh + layar sentuh) dikenali sebagai iOS', () => {
    expect(isIosDevice(UA.iphoneSafari)).toBe(true)
    expect(isIosDevice(UA.ipadDesktop, 5)).toBe(true)
    expect(isIosDevice(UA.ipadDesktop, 0)).toBe(false) // Mac sungguhan
    expect(isIosDevice(UA.androidChrome, 5)).toBe(false)
  })

  it('hanya Safari asli yang mendapat petunjuk Tambah ke Layar Utama', () => {
    expect(isIosSafari(UA.iphoneSafari)).toBe(true)
    expect(isIosSafari(UA.ipadDesktop, 5)).toBe(true)
    expect(isIosSafari(UA.iphoneChrome)).toBe(false)
    expect(isIosSafari(UA.iphoneFirefox)).toBe(false)
    expect(isIosSafari(UA.iphoneInstagram)).toBe(false)
    expect(isIosSafari(UA.iphoneWebView)).toBe(false)
    expect(isIosSafari(UA.androidChrome)).toBe(false)
    expect(isIosSafari(UA.ipadDesktop, 0)).toBe(false)
  })

  it('standalone dari navigator.standalone (iOS) atau display-mode', () => {
    expect(isStandalone(true, false)).toBe(true)
    expect(isStandalone(undefined, true)).toBe(true)
    expect(isStandalone(false, false)).toBe(false)
    expect(isStandalone(undefined, false)).toBe(false)
  })
})

describe('installMode', () => {
  const base = { standalone: false, iosSafari: false, hasPrompt: false, stored: null }

  it('beforeinstallprompt tertangkap → prompt', () => {
    expect(installMode({ ...base, hasPrompt: true })).toBe('prompt')
  })

  it('Safari iOS di luar layar utama → ios', () => {
    expect(installMode({ ...base, iosSafari: true })).toBe('ios')
  })

  it('sudah terpasang/standalone → tidak tampil', () => {
    expect(installMode({ ...base, iosSafari: true, standalone: true })).toBeNull()
    expect(installMode({ ...base, hasPrompt: true, standalone: true })).toBeNull()
  })

  it('pernah ditutup atau terpasang → tidak tampil lagi', () => {
    expect(installMode({ ...base, hasPrompt: true, stored: 'dismissed' })).toBeNull()
    expect(installMode({ ...base, iosSafari: true, stored: 'installed' })).toBeNull()
  })

  it('peramban lain tanpa API pasang → tidak tampil', () => {
    expect(installMode(base)).toBeNull()
  })
})

describe('status tersimpan', () => {
  const memStore = () => {
    const m = new Map<string, string>()
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    }
  }
  const throwing = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }

  it('memakai kunci mk:install-prompt', () => {
    expect(INSTALL_KEY).toBe('mk:install-prompt')
    const s = memStore()
    expect(writeInstallState(s, 'dismissed')).toBe(true)
    expect(s.m.get('mk:install-prompt')).toBe('dismissed')
    expect(readInstallState(s)).toBe('dismissed')
    writeInstallState(s, 'installed')
    expect(readInstallState(s)).toBe('installed')
  })

  it('nilai asing atau kosong → null', () => {
    const s = memStore()
    expect(readInstallState(s)).toBeNull()
    s.m.set(INSTALL_KEY, 'ya')
    expect(readInstallState(s)).toBeNull()
  })

  it('penyimpanan melempar galat atau tidak ada → aman', () => {
    expect(readInstallState(throwing)).toBeNull()
    expect(writeInstallState(throwing, 'dismissed')).toBe(false)
    expect(readInstallState(null)).toBeNull()
    expect(writeInstallState(undefined, 'installed')).toBe(false)
  })
})

describe('InstallPrompt (render server)', () => {
  it('tidak merender apa pun di server (lingkungan belum diketahui)', () => {
    expect(renderToStaticMarkup(createElement(InstallPrompt))).toBe('')
  })
})
