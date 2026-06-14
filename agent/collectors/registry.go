package collectors

import "monitor-agent/config"

// Collector 是可插拔采集器接口。新增采集器 = 新建一个文件实现该接口 + init() 注册，
// 采集循环零改动。
type Collector interface {
	Name() string
	Collect(cfg *config.ClientConfig) (interface{}, error)
}

var registry = map[string]Collector{}

// Register 注册一个采集器，通常在采集器文件的 init() 中调用。
func Register(c Collector) {
	registry[c.Name()] = c
}

// All 返回所有已注册采集器。
func All() map[string]Collector {
	return registry
}
