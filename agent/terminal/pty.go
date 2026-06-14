package terminal

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"sync"

	"github.com/creack/pty"
)

type Session struct {
	ID   string
	Cmd  *exec.Cmd
	Pty  *os.File
	mu   sync.Mutex
	done chan struct{}
}

type Manager struct {
	sessions map[string]*Session
	mu       sync.RWMutex
	onData   func(sessionId string, data []byte)
	onClose  func(sessionId string)
}

func NewManager(onData func(string, []byte), onClose func(string)) *Manager {
	return &Manager{
		sessions: make(map[string]*Session),
		onData:   onData,
		onClose:  onClose,
	}
}

func (m *Manager) Open(sessionId string, cols, rows uint16) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.sessions[sessionId]; exists {
		return fmt.Errorf("session already exists: %s", sessionId)
	}

	var shell string
	if runtime.GOOS == "windows" {
		shell = "powershell.exe"
	} else {
		shell = os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/bash"
		}
	}

	cmd := exec.Command(shell)
	cmd.Env = os.Environ()

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: rows, Cols: cols})
	if err != nil {
		return fmt.Errorf("failed to start pty: %w", err)
	}

	session := &Session{
		ID:   sessionId,
		Cmd:  cmd,
		Pty:  ptmx,
		done: make(chan struct{}),
	}
	m.sessions[sessionId] = session

	go m.readLoop(session)

	return nil
}

func (m *Manager) Write(sessionId string, data []byte) error {
	m.mu.RLock()
	session, ok := m.sessions[sessionId]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("session not found: %s", sessionId)
	}

	session.mu.Lock()
	defer session.mu.Unlock()
	_, err := session.Pty.Write(data)
	return err
}

func (m *Manager) Resize(sessionId string, cols, rows uint16) error {
	m.mu.RLock()
	session, ok := m.sessions[sessionId]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("session not found: %s", sessionId)
	}

	return pty.Setsize(session.Pty, &pty.Winsize{Rows: rows, Cols: cols})
}

func (m *Manager) Close(sessionId string) {
	m.mu.Lock()
	session, ok := m.sessions[sessionId]
	if !ok {
		m.mu.Unlock()
		return
	}
	delete(m.sessions, sessionId)
	m.mu.Unlock()

	session.Pty.Close()
	session.Cmd.Process.Kill()
	session.Cmd.Wait()
	close(session.done)
}

func (m *Manager) CloseAll() {
	m.mu.Lock()
	ids := make([]string, 0, len(m.sessions))
	for id := range m.sessions {
		ids = append(ids, id)
	}
	m.mu.Unlock()

	for _, id := range ids {
		m.Close(id)
	}
}

func (m *Manager) readLoop(session *Session) {
	buf := make([]byte, 4096)
	for {
		n, err := session.Pty.Read(buf)
		if err != nil {
			if err != io.EOF {
				// session ended
			}
			break
		}
		if n > 0 && m.onData != nil {
			data := make([]byte, n)
			copy(data, buf[:n])
			m.onData(session.ID, data)
		}
	}
	if m.onClose != nil {
		m.onClose(session.ID)
	}
}
