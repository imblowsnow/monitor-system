import { SystemConfig } from '../db/models.js';

/**
 * IP 归属地解析。
 *
 * 查询接口地址与字段解析路径均来自系统配置（system_config 表），可在后台“设置”页修改。
 * - geo.api.url：查询 URL，用 {ip} 作为占位符，如 http://ip-api.com/json/{ip}?fields=countryCode,country&lang=zh-CN
 * - geo.field.country：国家码在返回 JSON 中的路径，点分隔，如 countryCode 或 data.country_code
 * - geo.field.countryName：国家名路径，如 country 或 data.country
 *
 * 默认走 ip-api.com 免费接口（45 次/分钟限速）。
 */

const DEFAULTS = {
  'geo.api.url': 'http://ip-api.com/json/{ip}?fields=status,countryCode,country&lang=zh-CN',
  'geo.field.country': 'countryCode',
  'geo.field.countryName': 'country',
};

export type GeoConfigKey = keyof typeof DEFAULTS;

/** 读取单个 geo 配置项，缺省回退到默认值。 */
async function getConf(key: GeoConfigKey): Promise<string> {
  const row = await SystemConfig.findByPk(key);
  const v = row?.value;
  return v != null && v !== '' ? v : DEFAULTS[key];
}

/** 按点路径从对象取值，如 "data.country_code"。取不到返回空串。 */
function pick(obj: unknown, path: string): string {
  let cur: any = obj;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return '';
    cur = cur[seg];
  }
  return cur == null ? '' : String(cur);
}

/** 判断是否为内网 / 本地 / 回环地址，这类 IP 无需也无法解析归属地。 */
function isPrivateIp(ip: string): boolean {
  const v = ip.replace(/^::ffff:/, '');
  if (v === '' || v === '::1' || v === '127.0.0.1' || v.startsWith('127.')) return true;
  if (v.startsWith('10.') || v.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true;
  return false;
}

export interface GeoResult {
  country: string;
  countryName: string;
}

/**
 * 解析 IP 归属国家。失败、超时或内网地址时返回空结果（不抛错，不阻断注册）。
 */
export async function resolveCountry(rawIp: string): Promise<GeoResult> {
  const empty: GeoResult = { country: '', countryName: '' };
  const ip = (rawIp || '').replace(/^::ffff:/, '').trim();
  if (!ip || isPrivateIp(ip)) return empty;

  const [urlTpl, countryPath, namePath] = await Promise.all([
    getConf('geo.api.url'),
    getConf('geo.field.country'),
    getConf('geo.field.countryName'),
  ]);

  const url = urlTpl.replace('{ip}', encodeURIComponent(ip));

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return empty;
    const data = await resp.json();
    return {
      country: pick(data, countryPath).toLowerCase(),
      countryName: pick(data, namePath),
    };
  } catch {
    return empty;
  }
}
