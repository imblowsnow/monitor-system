package executor

import (
	"runtime"
	"strings"
	"testing"
)

func TestIsAllowedAlwaysTrue(t *testing.T) {
	// 白名单已移除，所有命令一律放行。
	if !IsAllowed("rm -rf /", nil) {
		t.Errorf("IsAllowed should always return true now")
	}
	if !IsAllowed("anything", []string{"only-this"}) {
		t.Errorf("IsAllowed should ignore whitelist and always return true")
	}
}

func TestRunCommandSuccess(t *testing.T) {
	var command, want string
	if runtime.GOOS == "windows" {
		command = "echo hello"
		want = "hello"
	} else {
		command = "echo hello"
		want = "hello"
	}

	res := RunCommand(command, 5000)
	if res.ExitCode != 0 {
		t.Errorf("ExitCode = %d, want 0 (stderr: %q)", res.ExitCode, res.Stderr)
	}
	if !strings.Contains(res.Stdout, want) {
		t.Errorf("Stdout = %q, want it to contain %q", res.Stdout, want)
	}
	if res.Duration < 0 {
		t.Errorf("Duration = %d, want >= 0", res.Duration)
	}
}

func TestRunCommandNonZeroExit(t *testing.T) {
	var command string
	if runtime.GOOS == "windows" {
		command = "exit 3"
	} else {
		command = "exit 3"
	}

	res := RunCommand(command, 5000)
	if res.ExitCode != 3 {
		t.Errorf("ExitCode = %d, want 3", res.ExitCode)
	}
}

func TestRunCommandTimeout(t *testing.T) {
	var command string
	if runtime.GOOS == "windows" {
		// ping 本机几次以消耗 >1s
		command = "ping -n 5 127.0.0.1"
	} else {
		command = "sleep 2"
	}

	res := RunCommand(command, 200)
	if res.ExitCode == 0 {
		t.Errorf("ExitCode = 0, want non-zero for timed-out command")
	}
}

func TestRunCommandCapturesStderr(t *testing.T) {
	var command string
	if runtime.GOOS == "windows" {
		command = "echo oops 1>&2"
	} else {
		command = "echo oops 1>&2"
	}

	res := RunCommand(command, 5000)
	if !strings.Contains(res.Stderr, "oops") {
		t.Errorf("Stderr = %q, want it to contain %q", res.Stderr, "oops")
	}
}
