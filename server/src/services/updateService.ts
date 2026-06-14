/** 固定的 agent 二进制来源仓库（不走后台配置）。 */
const REPO = 'imblowsnow/monitor-system';
const CACHE_TTL = 60 * 1000; // GitHub 匿名限流 60/h，缓存 10 分钟兜底。

export interface ReleaseInfo {
  /** Release 版本号（tag_name，如 v1.2.3）。 */
  version: string;
  /** 平台 key（如 linux-amd64 / windows-amd64）→ 二进制下载地址。 */
  assets: Record<string, string>;
}

interface CacheEntry {
  fetchedAt: number;
  data: ReleaseInfo | null;
}

let cache: CacheEntry | null = null;

/**
 * 从 release 资产名解析平台 key。命名规则见 .github/workflows/release.yml：
 * monitor-agent-{os}-{arch}[.exe]，如 monitor-agent-linux-amd64、monitor-agent-windows-amd64.exe。
 */
function parsePlatformKey(assetName: string): string | null {
  const m = assetName.match(/^monitor-agent-([a-z0-9]+)-([a-z0-9]+)(\.exe)?$/i);
  if (!m) return null;
  return `${m[1].toLowerCase()}-${m[2].toLowerCase()}`;
}

/** 拉取 GitHub 最新 Release（带缓存）。失败或无 release 返回 null。 */
export async function fetchLatestRelease(force = false): Promise<ReleaseInfo | null> {
  const now = Date.now();
  if (!force && cache && now - cache.fetchedAt < CACHE_TTL) {
    return cache.data;
  }

  let data: ReleaseInfo | null = null;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'monitor-system' },
    });
    if (res.ok) {
      const json = (await res.json()) as {
        tag_name?: string;
        assets?: Array<{ name: string; browser_download_url: string }>;
      };
      if (json.tag_name) {
        const assets: Record<string, string> = {};
        for (const a of json.assets || []) {
          const key = parsePlatformKey(a.name);
          if (key) assets[key] = a.browser_download_url;
        }
        data = { version: json.tag_name, assets };
      }
    }
  } catch {
    data = null;
  }

  cache = { fetchedAt: now, data };
  return data;
}

/** 把 Go 的 GOOS/GOARCH 组合成 release 资产的平台 key。 */
export function platformKey(os: string, arch: string): string {
  return `${(os || '').toLowerCase()}-${(arch || '').toLowerCase()}`;
}

/**
 * 语义化比较：current 是否落后于 latest（即有更新可下发）。
 * current 为空 / 'dev' 时视为需更新；解析失败时退化为字符串不等比较。
 */
export function hasUpdate(current: string | null | undefined, latest: string): boolean {
  if (!current || current === 'dev') return true;
  const cmp = compareSemver(current, latest);
  return cmp !== null ? cmp < 0 : current !== latest;
}

/** 比较两个版本号（去掉前导 v）。返回 -1/0/1；无法解析为数字段时返回 null。 */
function compareSemver(a: string, b: string): number | null {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10));
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i];
    const y = pb[i];
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    if ((x || 0) !== (y || 0)) return (x || 0) < (y || 0) ? -1 : 1;
  }
  return 0;
}
