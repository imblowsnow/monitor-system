//go:build !windows

package main

import "monitor-agent/connection"

// runAgent 非 Windows 平台直接交互式运行，阻塞在读循环。
// systemd / launchd 以前台进程方式托管，无需额外的服务握手。
func runAgent(client *connection.Client) {
	client.Run()
}
