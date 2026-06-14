package connection

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/shirou/gopsutil/v4/host"
	"monitor-agent/config"
	"monitor-agent/version"
)

type MessageType string

const (
	MsgAuth           MessageType = "auth"
	MsgAuthResult     MessageType = "auth_result"
	MsgHeartbeat      MessageType = "heartbeat"
	MsgHeartbeatAck   MessageType = "heartbeat_ack"
	MsgMetricsReport  MessageType = "metrics_report"
	MsgCommandRequest MessageType = "command_request"
	MsgCommandResult  MessageType = "command_result"
	MsgCommandStream  MessageType = "command_stream"
	MsgTerminalOpen   MessageType = "terminal_open"
	MsgTerminalData   MessageType = "terminal_data"
	MsgTerminalResize MessageType = "terminal_resize"
	MsgTerminalClose  MessageType = "terminal_close"
	MsgFileListReq    MessageType = "file_list_req"
	MsgFileListRes    MessageType = "file_list_res"
	MsgConfigRequest  MessageType = "config_request"
	MsgConfigUpdate   MessageType = "config_update"
	MsgCollectorReport MessageType = "collector_report"
	MsgError          MessageType = "error"
)

type WSMessage struct {
	ID        string      `json:"id"`
	Type      MessageType `json:"type"`
	Timestamp int64       `json:"timestamp"`
	Payload   interface{} `json:"payload"`
}

type AuthPayload struct {
	Token      string `json:"token"`
	Hostname   string `json:"hostname"`
	OS         string `json:"os"`
	Arch       string `json:"arch"`
	Version    string `json:"version"`
	OSPlatform string `json:"osPlatform"`
	OSVersion  string `json:"osVersion"`
}

type AuthResultPayload struct {
	Success  bool                `json:"success"`
	Reason   string              `json:"reason,omitempty"`
	ClientID string              `json:"clientId,omitempty"`
	Config   *config.ClientConfig `json:"config,omitempty"`
}

type MessageHandler func(msg *WSMessage)

type Client struct {
	cfg        *config.Config
	conn       *websocket.Conn
	mu         sync.Mutex
	connected  bool
	handlers   map[MessageType]MessageHandler
	queue      []WSMessage
	queueMu    sync.Mutex
	maxQueue   int
	stopChan   chan struct{}
	clientID   string
}

func NewClient(cfg *config.Config) *Client {
	return &Client{
		cfg:      cfg,
		handlers: make(map[MessageType]MessageHandler),
		queue:    make([]WSMessage, 0),
		maxQueue: 1000,
		stopChan: make(chan struct{}),
	}
}

func (c *Client) OnMessage(msgType MessageType, handler MessageHandler) {
	c.handlers[msgType] = handler
}

func (c *Client) Send(msg WSMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected || c.conn == nil {
		c.enqueue(msg)
		return fmt.Errorf("not connected")
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return c.conn.WriteMessage(websocket.TextMessage, data)
}

func (c *Client) Run() {
	for {
		select {
		case <-c.stopChan:
			return
		default:
			c.connect()
			c.readLoop()
			c.reconnectWait()
		}
	}
}

func (c *Client) Stop() {
	close(c.stopChan)
	c.mu.Lock()
	if c.conn != nil {
		c.conn.Close()
	}
	c.mu.Unlock()
}

func (c *Client) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

func (c *Client) connect() {
	log.Printf("Connecting to %s...", c.cfg.ServerURL)

	conn, _, err := websocket.DefaultDialer.Dial(c.cfg.ServerURL, nil)
	if err != nil {
		log.Printf("Connection failed: %v", err)
		return
	}

	c.mu.Lock()
	c.conn = conn
	c.connected = true
	c.mu.Unlock()

	c.authenticate()
}

func (c *Client) authenticate() {
	hostname, _ := os.Hostname()
	platform, osVer := osInfo()
	msg := WSMessage{
		ID:        generateID(),
		Type:      MsgAuth,
		Timestamp: time.Now().UnixMilli(),
		Payload: AuthPayload{
			Token:      c.cfg.Token,
			Hostname:   hostname,
			OS:         runtime.GOOS,
			Arch:       runtime.GOARCH,
			Version:    version.Version,
			OSPlatform: platform,
			OSVersion:  osVer,
		},
	}
	c.Send(msg)
}

// osInfo 返回操作系统发行版标识与版本号。
// Linux 上得到 ubuntu/centos/debian 等及 22.04 之类版本；其它平台尽力而为，
// 取不到时回退到 runtime.GOOS，不影响注册流程。
func osInfo() (platform, version string) {
	info, err := host.Info()
	if err != nil || info == nil {
		return runtime.GOOS, ""
	}
	platform = info.Platform
	if platform == "" {
		platform = runtime.GOOS
	}
	return platform, info.PlatformVersion
}

func (c *Client) readLoop() {
	if c.conn == nil {
		return
	}

	for {
		select {
		case <-c.stopChan:
			return
		default:
		}

		_, data, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("Read error: %v", err)
			c.mu.Lock()
			c.connected = false
			c.conn = nil
			c.mu.Unlock()
			return
		}

		var msg WSMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("Parse error: %v", err)
			continue
		}

		if msg.Type == MsgAuthResult {
			payload, _ := json.Marshal(msg.Payload)
			var result AuthResultPayload
			json.Unmarshal(payload, &result)
			if result.Success {
				log.Printf("Authenticated as %s", result.ClientID)
				c.clientID = result.ClientID
				if result.Config != nil {
					config.SetRuntime(result.Config)
					log.Printf("Config received: interval=%ds, netnodes=%d, docker=%v",
						result.Config.ReportInterval, len(result.Config.NetNodes), result.Config.Docker)
				}
				c.flushQueue()
			} else {
				log.Printf("Auth failed: %s", result.Reason)
				c.mu.Lock()
				c.conn.Close()
				c.connected = false
				c.conn = nil
				c.mu.Unlock()
				return
			}
			continue
		}

		if handler, ok := c.handlers[msg.Type]; ok {
			go handler(&msg)
		}
	}
}

func (c *Client) reconnectWait() {
	attempts := 0
	for {
		select {
		case <-c.stopChan:
			return
		default:
		}

		delay := math.Min(
			float64(1000)*math.Pow(2, float64(attempts)),
			60000,
		)
		jitter := delay * 0.3 * rand.Float64()
		wait := time.Duration(delay+jitter) * time.Millisecond

		log.Printf("Reconnecting in %v...", wait)
		time.Sleep(wait)
		attempts++
		return
	}
}

func (c *Client) enqueue(msg WSMessage) {
	c.queueMu.Lock()
	defer c.queueMu.Unlock()
	if len(c.queue) >= c.maxQueue {
		c.queue = c.queue[1:]
	}
	c.queue = append(c.queue, msg)
}

func (c *Client) flushQueue() {
	c.queueMu.Lock()
	queue := c.queue
	c.queue = make([]WSMessage, 0)
	c.queueMu.Unlock()

	for _, msg := range queue {
		c.Send(msg)
	}
}

func generateID() string {
	return fmt.Sprintf("%d-%d", time.Now().UnixNano(), rand.Intn(100000))
}
