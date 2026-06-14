// agent 构建脚本：统一注入版本号到 Go 二进制，跨平台可用。
//
// 版本号来源优先级：
//   1. 环境变量 AGENT_VERSION
//   2. git describe --tags（取最近 tag）
//   3. 根 package.json 的 version 字段
//
// 用法：node scripts/build-agent.mjs <windows|linux|macos|all>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agentDir = join(root, "agent");

function resolveVersion() {
  if (process.env.AGENT_VERSION) return process.env.AGENT_VERSION;
  try {
    return execFileSync("git", ["describe", "--tags", "--always", "--dirty"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    // 非 git 环境或无 tag，回退到 package.json
  }
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return pkg.version || "dev";
}

const targets = {
  windows: [
    { GOOS: "windows", GOARCH: "amd64", out: "bin/monitor-agent.exe" },
  ],
  linux: [
    { GOOS: "linux", GOARCH: "amd64", out: "bin/monitor-agent-linux-amd64" },
    { GOOS: "linux", GOARCH: "arm64", out: "bin/monitor-agent-linux-arm64" },
  ],
  macos: [
    { GOOS: "darwin", GOARCH: "amd64", out: "bin/monitor-agent-darwin-amd64" },
    { GOOS: "darwin", GOARCH: "arm64", out: "bin/monitor-agent-darwin-arm64" },
  ],
};

const which = process.argv[2] || "all";
const selected = which === "all" ? Object.keys(targets) : [which];

const version = resolveVersion();
const ldflags = `-s -w -X monitor-agent/version.Version=${version}`;

for (const name of selected) {
  const builds = targets[name];
  if (!builds) {
    console.error(`Unknown target: ${name} (expected windows|linux|macos|all)`);
    process.exit(1);
  }
  for (const t of builds) {
    console.log(`Building ${t.GOOS}/${t.GOARCH} agent v${version}...`);
    execFileSync(
      "go",
      ["build", "-ldflags", ldflags, "-o", t.out, "."],
      {
        cwd: agentDir,
        stdio: "inherit",
        env: { ...process.env, CGO_ENABLED: "0", GOOS: t.GOOS, GOARCH: t.GOARCH },
      },
    );
  }
}
