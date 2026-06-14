//go:build !windows

package updater

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"time"
)

// scriptPattern 临时脚本文件名模式。
const scriptPattern = "monitor-install-*.sh"

// scriptURL 返回仓库内最新 install.sh 的 raw 地址。
func scriptURL() string {
	return fmt.Sprintf("https://raw.githubusercontent.com/%s/main/scripts/install.sh", repo)
}

// runScript 复用 install.sh 覆盖安装：参数为 TOKEN、SERVER_URL、DOWNLOAD_URL。
// 更新场景下 TOKEN/SERVER_URL 传空，脚本会保留现有 config.json，仅替换二进制并重启服务。
// 脚本重启服务后本进程会被 systemd/launchd 终止并以新二进制拉起。
func runScript(script, downloadURL string) error {
	defer os.Remove(script) // 执行完即删临时脚本
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
