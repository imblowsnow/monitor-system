//go:build windows

package main

import (
	"log"

	"golang.org/x/sys/windows/svc"

	"monitor-agent/connection"
)

const serviceName = "MonitorAgent"

// agentService 实现 svc.Handler，桥接 SCM 控制信号与 Client 生命周期。
type agentService struct {
	client *connection.Client
}

// Execute 由 SCM 在服务进程内调用。必须尽快上报 Running，否则 SCM 判定启动超时
// （正是此前 Start-Service 报 CouldNotStartService 的原因）。
func (s *agentService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	const accepted = svc.AcceptStop | svc.AcceptShutdown

	changes <- svc.Status{State: svc.StartPending}

	// Client.Run 阻塞且内部自带重连循环，放到后台 goroutine，
	// 主循环留给 SCM 控制信号。
	go s.client.Run()

	changes <- svc.Status{State: svc.Running, Accepts: accepted}

	for c := range r {
		switch c.Cmd {
		case svc.Interrogate:
			changes <- c.CurrentStatus
		case svc.Stop, svc.Shutdown:
			changes <- svc.Status{State: svc.StopPending}
			s.client.Stop()
			changes <- svc.Status{State: svc.Stopped}
			return false, 0
		default:
			log.Printf("[service] unexpected control request: %d", c.Cmd)
		}
	}
	return false, 0
}

// runAgent 判断当前是否由 SCM 拉起：是则以服务模式运行（与 SCM 握手并上报状态），
// 否则退化为交互式运行（便于本地调试，直接在控制台跑）。
func runAgent(client *connection.Client) {
	isService, err := svc.IsWindowsService()
	if err != nil {
		log.Fatalf("Failed to determine service mode: %v", err)
	}

	if !isService {
		log.Println("Running in interactive mode")
		client.Run()
		return
	}

	if err := svc.Run(serviceName, &agentService{client: client}); err != nil {
		log.Fatalf("Service failed: %v", err)
	}
}
