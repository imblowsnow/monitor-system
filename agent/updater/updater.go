// Package updater 负责 agent 收到 Server 下发的更新指令后执行自更新。
// 实际的下载、二进制替换与服务重启复用安装脚本（Linux/macOS 为 install.sh，
// Windows 为 install.ps1，均为覆盖安装）。
//
// 安装脚本每次更新都从仓库实时拉取最新版本再执行，避免本地落地的旧脚本
// 在脚本本身有更新时无法生效。
package updater

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

// 安装脚本来源仓库（与 server 端固定一致）。
const repo = "imblowsnow/monitor-system"

// 同一时刻只允许一个更新流程，避免重复下发导致并发替换二进制。
var mu sync.Mutex

// Apply 执行一次自更新：实时拉取最新安装脚本，再以 downloadURL 为参数调用。
// 平台相关的脚本 URL（scriptURL）与执行（runScript）分别在
// updater_unix.go / updater_windows.go 中实现。
func Apply(version string) error {
	mu.Lock()
	defer mu.Unlock()

	script, err := fetchScript()
	if err != nil {
		return err
	}

	log.Printf("[updater] 开始更新到 %s", version)
	// 临时脚本的清理由各平台 runScript 负责：unix 等脚本执行完后删除，
	// windows 脚本为分离进程不能在此删（powershell 仍在读），交由其自行处理。
	return runScript(script)
}

// fetchScript 从仓库下载最新安装脚本到临时文件，返回脚本路径。
func fetchScript() (string, error) {
	url := scriptURL()
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("下载安装脚本失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("下载安装脚本失败: HTTP %d", resp.StatusCode)
	}

	f, err := os.CreateTemp("", scriptPattern)
	if err != nil {
		return "", fmt.Errorf("创建临时脚本失败: %w", err)
	}
	path := f.Name()

	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		_ = os.Remove(path)
		return "", fmt.Errorf("写入临时脚本失败: %w", err)
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(path)
		return "", fmt.Errorf("保存临时脚本失败: %w", err)
	}
	_ = os.Chmod(path, 0o755)

	log.Printf("[updater] 已拉取最新安装脚本: %s", url)
	return path, nil
}
