package collectors

import (
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

type DiskInfo struct {
	Mount string  `json:"mount"`
	Total uint64  `json:"total"`
	Used  uint64  `json:"used"`
	Usage float64 `json:"usage"`
}

type NetworkInfo struct {
	RxBytes uint64 `json:"rxBytes"`
	TxBytes uint64 `json:"txBytes"`
	RxSpeed uint64 `json:"rxSpeed"`
	TxSpeed uint64 `json:"txSpeed"`
}

type ConnectionInfo struct {
	TCP int `json:"tcp"`
	UDP int `json:"udp"`
}

type Metrics struct {
	CPU struct {
		Usage float64 `json:"usage"`
		Cores int     `json:"cores"`
	} `json:"cpu"`
	Memory struct {
		Total uint64  `json:"total"`
		Used  uint64  `json:"used"`
		Usage float64 `json:"usage"`
	} `json:"memory"`
	Disk        []DiskInfo     `json:"disk"`
	Network     NetworkInfo    `json:"network"`
	Processes   int            `json:"processes"`
	Connections ConnectionInfo `json:"connections"`
	Uptime      uint64         `json:"uptime"`
}

var lastNetRx uint64
var lastNetTx uint64
var lastNetTime time.Time

// 进程数与连接数采集在 Linux 上代价很高（需遍历 /proc 下所有进程及 fd），
// 而这些指标变化缓慢，没必要每个上报周期都重算。这里做降频缓存。
var (
	cachedProcesses int
	cachedConns     ConnectionInfo
	lastHeavyTime   time.Time
)

const heavyInterval = 30 * time.Second

func init() {
	// 预热 CPU 采样器，使后续非阻塞调用能基于调用间隔返回有效值，
	// 避免每次采集都阻塞 1 秒。
	cpu.Percent(0, false)
}

// calcSpeed returns bytes/sec given the current and previous counter and the
// elapsed seconds. It guards against a zero/negative interval and against
// counter resets (e.g. interface restart) that would otherwise underflow uint64.
func calcSpeed(current, previous uint64, elapsedSec float64) uint64 {
	if elapsedSec <= 0 || current < previous {
		return 0
	}
	return uint64(float64(current-previous) / elapsedSec)
}

func Collect() (*Metrics, error) {
	m := &Metrics{}

	// 非阻塞采样：基于上次调用以来的累计 CPU 时间计算占用率，
	// 不再每次阻塞 1 秒。init() 已做过预热。
	cpuPercent, err := cpu.Percent(0, false)
	if err == nil && len(cpuPercent) > 0 {
		m.CPU.Usage = cpuPercent[0]
	}
	m.CPU.Cores = runtime.NumCPU()

	memInfo, err := mem.VirtualMemory()
	if err == nil {
		m.Memory.Total = memInfo.Total
		m.Memory.Used = memInfo.Used
		m.Memory.Usage = memInfo.UsedPercent
	}

	partitions, err := disk.Partitions(false)
	if err == nil {
		for _, p := range partitions {
			usage, err := disk.Usage(p.Mountpoint)
			if err == nil {
				m.Disk = append(m.Disk, DiskInfo{
					Mount: p.Mountpoint,
					Total: usage.Total,
					Used:  usage.Used,
					Usage: usage.UsedPercent,
				})
			}
		}
	}

	netIO, err := net.IOCounters(false)
	if err == nil && len(netIO) > 0 {
		now := time.Now()
		m.Network.RxBytes = netIO[0].BytesRecv
		m.Network.TxBytes = netIO[0].BytesSent

		if lastNetTime.IsZero() {
			m.Network.RxSpeed = 0
			m.Network.TxSpeed = 0
		} else {
			elapsed := now.Sub(lastNetTime).Seconds()
			m.Network.RxSpeed = calcSpeed(netIO[0].BytesRecv, lastNetRx, elapsed)
			m.Network.TxSpeed = calcSpeed(netIO[0].BytesSent, lastNetTx, elapsed)
		}
		lastNetRx = netIO[0].BytesRecv
		lastNetTx = netIO[0].BytesSent
		lastNetTime = now
	}

	// 进程数与连接数为重型采集，降频执行并复用上次结果。
	now := time.Now()
	if lastHeavyTime.IsZero() || now.Sub(lastHeavyTime) >= heavyInterval {
		if procs, err := process.Pids(); err == nil {
			cachedProcesses = len(procs)
		}
		if conns, err := net.Connections("tcp"); err == nil {
			cachedConns.TCP = len(conns)
		}
		if udpConns, err := net.Connections("udp"); err == nil {
			cachedConns.UDP = len(udpConns)
		}
		lastHeavyTime = now
	}
	m.Processes = cachedProcesses
	m.Connections = cachedConns

	uptime, err := host.Uptime()
	if err == nil {
		m.Uptime = uptime
	}

	return m, nil
}
