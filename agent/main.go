package main

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"time"

	"monitor-agent/collectors"
	"monitor-agent/config"
	"monitor-agent/connection"
	"monitor-agent/executor"
	"monitor-agent/terminal"
	"monitor-agent/updater"
)

func main() {
	// 运行入口按平台分派：Windows 下若由 SCM 拉起则以服务模式运行（与 SCM 握手、
	// 上报状态），否则交互式运行；非 Windows 直接交互式运行。
	runAgent(newAgent())
}

// newAgent 完成全部消息处理器注册与后台采集/心跳 goroutine 的启动，
// 返回已就绪但尚未进入读循环的 Client。调用方决定如何运行（阻塞或服务化）。
func newAgent() *connection.Client {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	client := connection.NewClient(cfg)

	ptyManager := terminal.NewManager(
		func(sessionId string, data []byte) {
			client.Send(connection.WSMessage{
				ID:        generateID(),
				Type:      connection.MsgTerminalData,
				Timestamp: time.Now().UnixMilli(),
				Payload: map[string]interface{}{
					"sessionId": sessionId,
					"data":      base64.StdEncoding.EncodeToString(data),
				},
			})
		},
		func(sessionId string) {
			client.Send(connection.WSMessage{
				ID:        generateID(),
				Type:      connection.MsgTerminalClose,
				Timestamp: time.Now().UnixMilli(),
				Payload: map[string]interface{}{
					"sessionId": sessionId,
					"reason":    "process_exited",
				},
			})
		},
	)

	client.OnMessage(connection.MsgHeartbeatAck, func(msg *connection.WSMessage) {})

	client.OnMessage(connection.MsgAgentUpdate, func(msg *connection.WSMessage) {
		payload, _ := json.Marshal(msg.Payload)
		var req struct {
			Version     string `json:"version"`
		}
		if err := json.Unmarshal(payload, &req); err != nil {
			log.Printf("Invalid agent_update payload: %v", err)
			return
		}
		log.Printf("Received update request: version=%s", req.Version)
		if err := updater.Apply(req.Version); err != nil {
			log.Printf("Update failed: %v", err)
		}
	})

	client.OnMessage(connection.MsgConfigUpdate, func(msg *connection.WSMessage) {
		payload, _ := json.Marshal(msg.Payload)
		var req struct {
			Config *config.ClientConfig `json:"config"`
		}
		if err := json.Unmarshal(payload, &req); err != nil || req.Config == nil {
			return
		}
		config.SetRuntime(req.Config)
		log.Printf("Config updated: interval=%ds, netnodes=%d, docker=%v",
			req.Config.ReportInterval, len(req.Config.NetNodes), req.Config.Docker)
	})

	client.OnMessage(connection.MsgCommandRequest, func(msg *connection.WSMessage) {
		payload, _ := json.Marshal(msg.Payload)
		var req struct {
			Command string `json:"command"`
			Timeout int    `json:"timeout"`
		}
		json.Unmarshal(payload, &req)

		timeout := req.Timeout
		if timeout <= 0 {
			timeout = 30000
		}

		result := executor.RunCommand(req.Command, timeout)
		client.Send(connection.WSMessage{
			ID:        msg.ID,
			Type:      connection.MsgCommandResult,
			Timestamp: time.Now().UnixMilli(),
			Payload: map[string]interface{}{
				"exitCode": result.ExitCode,
				"stdout":   result.Stdout,
				"stderr":   result.Stderr,
				"duration": result.Duration,
				"command":  req.Command,
			},
		})
	})

	client.OnMessage(connection.MsgTerminalOpen, func(msg *connection.WSMessage) {
		payload, _ := json.Marshal(msg.Payload)
		var req struct {
			SessionID string `json:"sessionId"`
			Cols      uint16 `json:"cols"`
			Rows      uint16 `json:"rows"`
		}
		json.Unmarshal(payload, &req)

		err := ptyManager.Open(req.SessionID, req.Cols, req.Rows)
		if err != nil {
			log.Printf("Failed to open terminal: %v", err)
		}
	})

	client.OnMessage(connection.MsgTerminalData, func(msg *connection.WSMessage) {
		payload, _ := json.Marshal(msg.Payload)
		var req struct {
			SessionID string `json:"sessionId"`
			Data      string `json:"data"`
		}
		json.Unmarshal(payload, &req)

		data, err := base64.StdEncoding.DecodeString(req.Data)
		if err != nil {
			data = []byte(req.Data)
		}
		ptyManager.Write(req.SessionID, data)
	})

	client.OnMessage(connection.MsgTerminalResize, func(msg *connection.WSMessage) {
		payload, _ := json.Marshal(msg.Payload)
		var req struct {
			SessionID string `json:"sessionId"`
			Cols      uint16 `json:"cols"`
			Rows      uint16 `json:"rows"`
		}
		json.Unmarshal(payload, &req)

		ptyManager.Resize(req.SessionID, req.Cols, req.Rows)
	})

	client.OnMessage(connection.MsgTerminalClose, func(msg *connection.WSMessage) {
		payload, _ := json.Marshal(msg.Payload)
		var req struct {
			SessionID string `json:"sessionId"`
		}
		json.Unmarshal(payload, &req)

		ptyManager.Close(req.SessionID)
	})

	// 心跳独立于指标上报：固定 10s 一跳，与采集/上报的 interval 解耦，
	// 避免上报间隔较大时心跳被拖慢，导致服务端误判离线。
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if !client.IsConnected() {
				continue
			}
			client.Send(connection.WSMessage{
				ID:        generateID(),
				Type:      connection.MsgHeartbeat,
				Timestamp: time.Now().UnixMilli(),
				Payload: map[string]interface{}{
					"uptime": 0,
				},
			})
		}
	}()

	go func() {
		tick := 0
		for {
			interval := 30
			if rc := config.GetRuntime(); rc != nil && rc.ReportInterval > 0 {
				interval = rc.ReportInterval
			}
			time.Sleep(time.Duration(interval) * time.Second)

			if !client.IsConnected() {
				continue
			}

			metrics, err := collectors.Collect()
			if err != nil {
				log.Printf("Collection error: %v", err)
			} else {
				// 将系统指标摊平成 map，再把各扩展采集器结果以采集器名为 key 直接平铺到顶层一起上报。
				raw, _ := json.Marshal(metrics)
				payload := map[string]interface{}{}
				json.Unmarshal(raw, &payload)

				rc := config.GetRuntime()
				for name, c := range collectors.All() {
					data, err := c.Collect(rc)
					if err != nil {
						log.Printf("Collector %s error: %v", name, err)
						continue
					}
					payload[name] = data
				}

				client.Send(connection.WSMessage{
					ID:        generateID(),
					Type:      connection.MsgMetricsReport,
					Timestamp: time.Now().UnixMilli(),
					Payload:   payload,
				})
			}

			// 每 12 个周期主动拉取一次配置，作为热推送的兜底。
			tick++
			if tick%12 == 0 {
				client.Send(connection.WSMessage{
					ID:        generateID(),
					Type:      connection.MsgConfigRequest,
					Timestamp: time.Now().UnixMilli(),
					Payload:   map[string]interface{}{},
				})
			}
		}
	}()

	log.Println("Agent ready")
	return client
}

func generateID() string {
	return connection.GenerateID()
}
