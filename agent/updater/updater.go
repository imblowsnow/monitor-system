// Package updater 负责 agent 收到 Server 下发的更新指令后执行自更新。
// 实际的下载、二进制替换与服务重启复用安装脚本 install.sh（覆盖安装），
// 本包只做参数校验与脚本调用，并把脚本输出记录到日志。
package updater

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

// 同一时刻只允许一个更新流程，避免重复下发导致并发替换二进制。
var mu sync.Mutex

// Apply 执行一次自更新：定位 update 脚本并以 downloadUrl、version 为参数调用。
// Windows 暂不支持脚本自更新，直接返回错误（后续可扩展 update.ps1）。
func Apply(version, downloadURL, checksum string) error {
	if downloadURL == "" {
		return fmt.Errorf("downloadUrl 为空，忽略更新")
	}
	if runtime.GOOS == "windows" {
		return fmt.Errorf("windows 暂不支持脚本自更新")
	}

	mu.Lock()
	defer mu.Unlock()

	script, err := locateScript()
	if err != nil {
		return err
	}

	log.Printf("[updater] 开始更新到 %s: %s", version, downloadURL)

	// 复用 install.sh 覆盖安装：参数为 TOKEN、SERVER_URL、DOWNLOAD_URL。
	// 更新场景下 TOKEN/SERVER_URL 传空，脚本会保留现有 config.json，仅替换二进制并重启服务。
	// 脚本重启服务后本进程会被 systemd/launchd 终止并以新二进制拉起。
	cmd := exec.Command("sh", script, "", "", downloadURL)
	cmd.Stdout = log.Writer()
	cmd.Stderr = log.Writer()

	done := make(chan error, 1)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动更新脚本失败: %w", err)
	}
	go func() { done <- cmd.Wait() }()

	select {
	case err := <-done:
		if err != nil {
			return fmt.Errorf("更新脚本执行失败: %w", err)
		}
		log.Printf("[updater] 更新脚本执行完成，等待服务重启")
		return nil
	case <-time.After(5 * time.Minute):
		_ = cmd.Process.Kill()
		return fmt.Errorf("更新脚本超时")
	}
}

// locateScript 在二进制同目录查找 install.sh（覆盖安装脚本）。
func locateScript() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("无法定位可执行文件: %w", err)
	}
	dir := filepath.Dir(exe)
	candidates := []string{
		filepath.Join(dir, "install.sh"),
		filepath.Join(dir, "scripts", "install.sh"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c, nil
		}
	}
	return "", fmt.Errorf("未找到安装脚本 install.sh（已查找 %v）", candidates)
}
