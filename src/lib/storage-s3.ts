import 'server-only'

import { createHash, createHmac } from 'node:crypto'

interface S3Config {
  endpoint: URL
  region: string
  bucket: string
  accessKey: string
  secretKey: string
  pathStyle: boolean
}

function configuration(): S3Config {
  const region = process.env.S3_REGION || 'us-east-1'
  const bucket = process.env.S3_BUCKET
  const accessKey = process.env.S3_ACCESS_KEY_ID
  const secretKey = process.env.S3_SECRET_ACCESS_KEY
  const pathStyle = process.env.S3_FORCE_PATH_STYLE ?? 'false'
  if (!bucket || !accessKey || !secretKey) {
    throw new Error('Penyimpanan S3 belum dikonfigurasi. Isi S3_BUCKET, S3_ACCESS_KEY_ID, dan S3_SECRET_ACCESS_KEY.')
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
      bucket.includes('..') || !/^[a-z0-9-]+$/.test(region) ||
      !['true', 'false'].includes(pathStyle) || /[\s/,]/.test(accessKey)) {
    throw new Error('Konfigurasi S3 tidak valid.')
  }
  // An endpoint is an origin, not an object URL or an endpoint with a prefix.
  const endpoint = new URL(process.env.S3_ENDPOINT || `https://s3.${region}.amazonaws.com`)
  if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username ||
      endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('S3_ENDPOINT harus berupa origin HTTP(S) tanpa kredensial, path, query, atau fragmen.')
  }
  if (pathStyle === 'false' && (endpoint.hostname.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(endpoint.hostname))) {
    throw new Error('Endpoint alamat IP memerlukan S3_FORCE_PATH_STYLE=true.')
  }
  return { endpoint, region, bucket, accessKey, secretKey, pathStyle: pathStyle === 'true' }
}

export function s3Configured(): boolean {
  try {
    configuration()
    return true
  } catch {
    return false
  }
}

// AWS URI encoding: space is %20, never +; punctuation is encoded too.
function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function objectUrl(config: S3Config, key: string): URL {
  // WHATWG URLs normalize dot segments. Reject them rather than sign another key.
  if (!key || key.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new Error('Kunci penyimpanan S3 tidak valid.')
  }
  const url = new URL(config.endpoint)
  if (!config.pathStyle) url.hostname = `${config.bucket}.${url.hostname}`
  url.pathname = `${config.pathStyle ? `/${config.bucket}` : ''}/${key.split('/').map(encode).join('/')}`
  return url
}

function hash(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function scope(config: S3Config, time: string): string {
  return `${time.slice(0, 8)}/${config.region}/s3/aws4_request`
}

function signature(config: S3Config, time: string, canonical: string): string {
  const dateKey = hmac(`AWS4${config.secretKey}`, time.slice(0, 8))
  const regionKey = hmac(dateKey, config.region)
  const serviceKey = hmac(regionKey, 's3')
  const signingKey = hmac(serviceKey, 'aws4_request')
  return hmac(signingKey, `AWS4-HMAC-SHA256\n${time}\n${scope(config, time)}\n${hash(canonical)}`).toString('hex')
}

function queryString(params: Record<string, string>): string {
  return Object.entries(params).map(([key, value]) => [encode(key), encode(value)])
    .sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('&')
}

/** Pure local signing; no request is made and no public ACL is granted. */
export function signedS3EvidenceUrl(key: string, ttl: number, download?: string): string {
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 604800) throw new Error('Masa berlaku URL S3 tidak valid.')
  const config = configuration()
  const url = objectUrl(config, key)
  const time = timestamp()
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKey}/${scope(config, time)}`,
    'X-Amz-Date': time,
    'X-Amz-Expires': String(ttl),
    'X-Amz-SignedHeaders': 'host',
  }
  if (download) {
    // Quoted ASCII fallback plus RFC 5987 UTF-8 name; strip header controls.
    const name = download.replace(/[\x00-\x1f\x7f]/g, '')
    const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_')
    params['response-content-disposition'] = `attachment; filename="${fallback}"; filename*=UTF-8''${encode(name)}`
  }
  const query = queryString(params)
  const canonical = `GET\n${url.pathname}\n${query}\nhost:${url.host}\n\nhost\nUNSIGNED-PAYLOAD`
  url.search = `${query}&X-Amz-Signature=${signature(config, time, canonical)}`
  return url.toString()
}

async function mutate(method: 'PUT' | 'DELETE', key: string, body?: ArrayBuffer | Buffer, contentType?: string): Promise<void> {
  const config = configuration()
  const url = objectUrl(config, key)
  // Copy buffered input so fetch and the hash consume exactly the same bytes.
  const bytes = body === undefined ? undefined : new Uint8Array(Buffer.isBuffer(body) ? body : new Uint8Array(body))
  const time = timestamp()
  const payloadHash = hash(bytes ?? new Uint8Array())
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': time,
  }
  if (method === 'PUT') {
    headers['content-type'] = contentType!.trim().replace(/\s+/g, ' ')
    headers['if-none-match'] = '*'
  }
  const names = Object.keys(headers).sort()
  const signedHeaders = names.join(';')
  const canonicalHeaders = names.map(name => `${name}:${headers[name]}\n`).join('')
  const canonical = `${method}\n${url.pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope(config, time)}, SignedHeaders=${signedHeaders}, Signature=${signature(config, time, canonical)}`
  const response = await fetch(url, {
    method,
    headers,
    body: bytes?.buffer,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  // Do not surface provider response bodies (which may contain internal details).
  if (!response.ok && !(method === 'DELETE' && response.status === 404)) {
    throw new Error(`Gagal ${method === 'PUT' ? 'mengunggah' : 'menghapus'} berkas S3 (HTTP ${response.status}).`)
  }
}

export async function uploadS3Evidence(key: string, body: ArrayBuffer | Buffer, contentType: string): Promise<void> {
  if (!contentType.trim() || /[\r\n\x00]/.test(contentType)) throw new Error('Jenis berkas S3 tidak valid.')
  await mutate('PUT', key, body, contentType)
}

export async function removeS3Evidence(key: string): Promise<void> {
  await mutate('DELETE', key)
}
