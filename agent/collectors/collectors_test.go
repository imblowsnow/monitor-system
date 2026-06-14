package collectors

import (
	"testing"

	"monitor-agent/config"
)

// netnodes 采集器在无节点 / nil 配置时应返回空结果而非报错。
func TestNetnodesEmpty(t *testing.T) {
	c := &netnodesCollector{}

	got, err := c.Collect(nil)
	if err != nil {
		t.Fatalf("Collect(nil) error: %v", err)
	}
	if res, ok := got.([]ProbeResult); !ok || len(res) != 0 {
		t.Errorf("Collect(nil) = %v, want empty []ProbeResult", got)
	}

	got, err = c.Collect(&config.ClientConfig{NetNodes: nil})
	if err != nil {
		t.Fatalf("Collect(empty) error: %v", err)
	}
	if res, ok := got.([]ProbeResult); !ok || len(res) != 0 {
		t.Errorf("Collect(empty) = %v, want empty []ProbeResult", got)
	}
}

// probe 会把未知 probe 类型归一化为 http。
func TestProbeDefaultsToHTTP(t *testing.T) {
	r := probe(config.NetNode{Name: "x", Target: "127.0.0.1:1", Probe: "weird"})
	if r.Probe != "http" {
		t.Errorf("unknown probe normalized to %q, want http", r.Probe)
	}
}

// docker 采集器在 Docker 开关关闭时应返回 Available:false 且不报错。
func TestDockerDisabled(t *testing.T) {
	c := &dockerCollector{}
	got, err := c.Collect(&config.ClientConfig{Docker: false})
	if err != nil {
		t.Fatalf("Collect(docker off) error: %v", err)
	}
	info, ok := got.(DockerInfo)
	if !ok {
		t.Fatalf("Collect returned %T, want DockerInfo", got)
	}
	if info.Available {
		t.Error("docker disabled but Available=true")
	}
}

// netnodes 与 docker 采集器应已注册到全局注册表。
func TestCollectorsRegistered(t *testing.T) {
	all := All()
	for _, name := range []string{"netnodes", "docker"} {
		if _, ok := all[name]; !ok {
			t.Errorf("collector %q not registered", name)
		}
	}
}
