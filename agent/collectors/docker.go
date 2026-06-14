package collectors

import (
	"context"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	dockerclient "github.com/docker/docker/client"

	"monitor-agent/config"
)

func init() {
	Register(&dockerCollector{})
}

type dockerCollector struct{}

func (c *dockerCollector) Name() string { return "docker" }

// DockerInfo 是 docker 采集结果。Available=false 表示本机未安装 docker 或 socket 不可达。
type DockerInfo struct {
	Available  bool              `json:"available"`
	Version    string            `json:"version,omitempty"`
	APIVersion string            `json:"apiVersion,omitempty"`
	OS         string            `json:"os,omitempty"`
	Arch       string            `json:"arch,omitempty"`
	Containers []DockerContainer `json:"containers,omitempty"`
	Error      string            `json:"error,omitempty"`
}

type DockerContainer struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	// Image  string `json:"image"`
	// State  string `json:"state"`
	Status string `json:"status"`
}

func (c *dockerCollector) Collect(cfg *config.ClientConfig) (interface{}, error) {
	if cfg == nil || !cfg.Docker {
		return DockerInfo{Available: false}, nil
	}

	cli, err := dockerclient.NewClientWithOpts(dockerclient.FromEnv, dockerclient.WithAPIVersionNegotiation())
	if err != nil {
		return DockerInfo{Available: false, Error: err.Error()}, nil
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ver, err := cli.ServerVersion(ctx)
	if err != nil {
		return DockerInfo{Available: false, Error: err.Error()}, nil
	}

	info := DockerInfo{
		Available:  true,
		Version:    ver.Version,
		APIVersion: ver.APIVersion,
		OS:         ver.Os,
		Arch:       ver.Arch,
	}

	containers, err := cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		info.Error = err.Error()
		return info, nil
	}

	for _, ct := range containers {
		name := ""
		if len(ct.Names) > 0 {
			name = strings.TrimPrefix(ct.Names[0], "/")
		}
		info.Containers = append(info.Containers, DockerContainer{
			ID:     ct.ID[:min(12, len(ct.ID))],
			Name:   name,
			// Image:  ct.Image,
			// State:  ct.State,
			Status: ct.Status,
		})
	}

	return info, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
