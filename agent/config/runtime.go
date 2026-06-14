package config

import "sync/atomic"

// NetNode 是一个网络探测目标，对应服务端节点表里 enabled 的行。
type NetNode struct {
	Name   string `json:"name"`
	Target string `json:"target"`
	Probe  string `json:"probe"` // http | tcp | icmp
	ISP    string `json:"isp,omitempty"`
}

// ClientConfig 是服务端下发的统一客户端配置。
type ClientConfig struct {
	ReportInterval int       `json:"reportInterval"`
	NetNodes       []NetNode `json:"netnodes"`
	Docker         bool      `json:"docker"`
}

// runtime 用 atomic.Value 持有当前下发配置，支持热替换。
var runtime atomic.Value

// SetRuntime 写入新的下发配置（认证下发 / config_update 热更新）。
func SetRuntime(c *ClientConfig) {
	if c == nil {
		return
	}
	runtime.Store(c)
}

// GetRuntime 返回当前下发配置；尚未下发时返回 nil。
func GetRuntime() *ClientConfig {
	v := runtime.Load()
	if v == nil {
		return nil
	}
	return v.(*ClientConfig)
}
