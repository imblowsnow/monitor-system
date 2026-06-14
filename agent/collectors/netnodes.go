package collectors

import (
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"monitor-agent/config"
)

func init() {
	Register(&netnodesCollector{})
}

type netnodesCollector struct{}

func (c *netnodesCollector) Name() string { return "netnodes" }

// ProbeResult 是单个节点的探测结果。
type ProbeResult struct {
	Name      string  `json:"name"`
	ISP       string  `json:"isp,omitempty"`
	Probe     string  `json:"probe"`
	Target    string  `json:"target"`
	LatencyMs float64 `json:"latencyMs"`
	OK        bool    `json:"ok"`
	Error     string  `json:"error,omitempty"`
}

const probeTimeout = 5 * time.Second

func (c *netnodesCollector) Collect(cfg *config.ClientConfig) (interface{}, error) {
	if cfg == nil || len(cfg.NetNodes) == 0 {
		return []ProbeResult{}, nil
	}

	results := make([]ProbeResult, len(cfg.NetNodes))
	var wg sync.WaitGroup
	for i, node := range cfg.NetNodes {
		wg.Add(1)
		go func(idx int, n config.NetNode) {
			defer wg.Done()
			results[idx] = probe(n)
		}(i, node)
	}
	wg.Wait()
	return results, nil
}

func probe(n config.NetNode) ProbeResult {
	r := ProbeResult{Name: n.Name, ISP: n.ISP, Probe: n.Probe, Target: n.Target}
	var latency time.Duration
	var err error

	switch n.Probe {
	case "tcp":
		latency, err = probeTCP(n.Target)
	case "icmp":
		latency, err = probeICMP(n.Target)
	default: // http
		r.Probe = "http"
		latency, err = probeHTTP(n.Target)
	}

	if err != nil {
		r.OK = false
		r.Error = err.Error()
		return r
	}
	r.OK = true
	r.LatencyMs = float64(latency.Microseconds()) / 1000.0
	return r
}

func probeHTTP(target string) (time.Duration, error) {
	url := target
	if len(url) < 7 || (url[:7] != "http://" && (len(url) < 8 || url[:8] != "https://")) {
		url = "https://" + target
	}
	client := &http.Client{Timeout: probeTimeout}
	start := time.Now()
	resp, err := client.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	elapsed := time.Since(start)
	if resp.StatusCode >= 400 {
		return elapsed, fmt.Errorf("http status %d", resp.StatusCode)
	}
	return elapsed, nil
}

func probeTCP(target string) (time.Duration, error) {
	addr := target
	if _, _, err := net.SplitHostPort(target); err != nil {
		addr = net.JoinHostPort(target, "443")
	}
	start := time.Now()
	conn, err := net.DialTimeout("tcp", addr, probeTimeout)
	if err != nil {
		return 0, err
	}
	conn.Close()
	return time.Since(start), nil
}
