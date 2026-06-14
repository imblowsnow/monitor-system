package collectors

import "testing"

func TestCalcSpeed(t *testing.T) {
	cases := []struct {
		name     string
		current  uint64
		previous uint64
		elapsed  float64
		want     uint64
	}{
		{"正常增量", 2000, 1000, 1, 1000},
		{"半秒速率翻倍", 1500, 1000, 0.5, 1000},
		{"两秒速率减半", 3000, 1000, 2, 1000},
		{"无变化", 1000, 1000, 1, 0},
		{"间隔为零时返回0", 2000, 1000, 0, 0},
		{"间隔为负时返回0", 2000, 1000, -1, 0},
		{"计数器重置时返回0", 500, 1000, 1, 0},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := calcSpeed(c.current, c.previous, c.elapsed); got != c.want {
				t.Errorf("calcSpeed(%d, %d, %v) = %d, want %d", c.current, c.previous, c.elapsed, got, c.want)
			}
		})
	}
}

// TestCollect 是一个冒烟测试：它走真实的采集路径，针对本机执行，
// 并断言结果在内部是自洽的。由于具体数值依赖运行机器，这里不断言精确值。
func TestCollect(t *testing.T) {
	m, err := Collect()
	if err != nil {
		t.Fatalf("Collect() returned error: %v", err)
	}
	if m == nil {
		t.Fatal("Collect() returned nil metrics")
	}
	if m.CPU.Cores <= 0 {
		t.Errorf("CPU.Cores = %d, want > 0", m.CPU.Cores)
	}
	if m.CPU.Usage < 0 || m.CPU.Usage > 100 {
		t.Errorf("CPU.Usage = %f, want within [0,100]", m.CPU.Usage)
	}
	if m.Memory.Total == 0 {
		t.Error("Memory.Total = 0, want > 0")
	}
	if m.Memory.Used > m.Memory.Total {
		t.Errorf("Memory.Used (%d) > Memory.Total (%d)", m.Memory.Used, m.Memory.Total)
	}
}
