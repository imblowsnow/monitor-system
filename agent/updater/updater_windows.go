//go:build windows

package updater

import (
	"fmt"
	"log"
	"os/exec"
	"syscall"
)

// scriptPattern 临时脚本文件名模式。
const scriptPattern = "monitor-install-*.ps1"

// scriptURLs 返回 install.ps1 的候选下载地址，按优先级排列：
// 首选 GitHub raw，失败时回退到 jsDelivr CDN。
func scriptURLs() []string {
	return []string{
		fmt.Sprintf("https://raw.githubusercontent.com/%s/main/scripts/install.ps1", repo),
		fmt.Sprintf("https://cdn.jsdelivr.net/gh/%s@main/scripts/install.ps1", repo),
	}
}

// runScript 复用 install.ps1 覆盖安装：参数为 Token、ServerUrl、DownloadUrl。
// 更新场景下 Token/ServerUrl 传空，脚本保留现有 config.json，仅替换 exe 并重启服务。
//
// Windows 与 Unix 的关键差异：脚本会 Stop-Service，而本进程正是该服务，
// 一旦停止本进程立即被杀，脚本若是子进程也会随之终止。因此必须以分离的
// 独立进程启动 powershell（CREATE_NEW_PROCESS_GROUP + DETACHED_PROCESS），
// 让它在 agent 被杀后继续完成 exe 替换与服务重启，新进程由 SCM 拉起。
//
// 临时脚本不能在本进程删除（powershell 仍在读），由脚本末尾自行清理：
// 通过 -RemoveSelf 让脚本完成后删除自身。
func runScript(script string) error {
	cmd := exec.Command(
		"powershell", "-NoProfile", "-NonInteractive",
		"-ExecutionPolicy", "Bypass",
		"-File", script,
		"-Token", "", "-ServerUrl", "",
		"-RemoveSelf",
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP | 0x00000008, // DETACHED_PROCESS
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动更新脚本失败: %w", err)
	}
	// 不等待：脚本会停止并重启本服务，等待会被杀进程中断。
	// 由独立进程接管后续替换与重启。
	_ = cmd.Process.Release()
	log.Printf("[updater] 更新脚本已分离启动，服务将被重启以加载新二进制")
	return nil
}
