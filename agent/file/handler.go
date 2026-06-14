package file

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
)

type FileEntry struct {
	Name        string `json:"name"`
	IsDir       bool   `json:"isDir"`
	Size        int64  `json:"size"`
	ModTime     string `json:"modTime"`
	Permissions string `json:"permissions"`
}

func ListDir(path string) ([]FileEntry, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	result := make([]FileEntry, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		result = append(result, FileEntry{
			Name:        e.Name(),
			IsDir:       e.IsDir(),
			Size:        info.Size(),
			ModTime:     info.ModTime().Format("2006-01-02 15:04:05"),
			Permissions: info.Mode().String(),
		})
	}
	return result, nil
}

func ReadFileChunk(path string, offset, size int64) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	buf := make([]byte, size)
	n, err := f.ReadAt(buf, offset)
	if err != nil && n == 0 {
		return nil, err
	}
	return buf[:n], nil
}

func WriteFileChunk(path string, data []byte, offset int64) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = f.WriteAt(data, offset)
	return err
}

func GetFileInfo(path string) (*FileEntry, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	return &FileEntry{
		Name:        filepath.Base(path),
		IsDir:       info.IsDir(),
		Size:        info.Size(),
		ModTime:     info.ModTime().Format("2006-01-02 15:04:05"),
		Permissions: info.Mode().String(),
	}, nil
}

func WalkDir(root string, maxDepth int) ([]FileEntry, error) {
	var result []FileEntry
	rootDepth := len(filepath.SplitList(root))

	filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		currentDepth := len(filepath.SplitList(path))
		if currentDepth-rootDepth > maxDepth {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		info, _ := d.Info()
		if info == nil {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		result = append(result, FileEntry{
			Name:        rel,
			IsDir:       d.IsDir(),
			Size:        info.Size(),
			ModTime:     info.ModTime().Format("2006-01-02 15:04:05"),
			Permissions: info.Mode().String(),
		})
		return nil
	})
	return result, nil
}

// helper for encoding result
func ToJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}
