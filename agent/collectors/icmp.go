package collectors

import (
	"fmt"
	"net"
	"os"
	"time"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
)

// probeICMP 发送一个 ICMP echo 并测往返延迟。
// Linux 上优先尝试非特权 UDP ICMP（需 net.ipv4.ping_group_range），失败再尝试原始套接字。
// Windows / 无权限环境会返回错误，由上层标记为不可用。
func probeICMP(target string) (time.Duration, error) {
	ipAddr, err := net.ResolveIPAddr("ip4", target)
	if err != nil {
		return 0, err
	}

	conn, err := icmp.ListenPacket("udp4", "0.0.0.0")
	network := "udp4"
	if err != nil {
		conn, err = icmp.ListenPacket("ip4:icmp", "0.0.0.0")
		network = "ip4:icmp"
		if err != nil {
			return 0, fmt.Errorf("icmp unsupported: %w", err)
		}
	}
	defer conn.Close()

	msg := icmp.Message{
		Type: ipv4.ICMPTypeEcho,
		Code: 0,
		Body: &icmp.Echo{
			ID:   os.Getpid() & 0xffff,
			Seq:  1,
			Data: []byte("monitor-agent"),
		},
	}
	wb, err := msg.Marshal(nil)
	if err != nil {
		return 0, err
	}

	var dst net.Addr = ipAddr
	if network == "udp4" {
		dst = &net.UDPAddr{IP: ipAddr.IP}
	}

	start := time.Now()
	if _, err := conn.WriteTo(wb, dst); err != nil {
		return 0, err
	}

	if err := conn.SetReadDeadline(time.Now().Add(probeTimeout)); err != nil {
		return 0, err
	}
	rb := make([]byte, 1500)
	n, _, err := conn.ReadFrom(rb)
	if err != nil {
		return 0, err
	}
	elapsed := time.Since(start)

	rm, err := icmp.ParseMessage(1, rb[:n]) // 1 = ICMPv4 protocol number
	if err != nil {
		return 0, err
	}
	if rm.Type != ipv4.ICMPTypeEchoReply {
		return 0, fmt.Errorf("unexpected icmp reply type: %v", rm.Type)
	}
	return elapsed, nil
}
