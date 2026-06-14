package version

// Version 是 agent 的版本号。
// 默认值 "dev" 用于本地开发；正式构建时通过 ldflags 注入：
//
//	go build -ldflags "-X monitor-agent/version.Version=1.2.3"
//
// 由 Makefile 在编译时自动填充（取自 git tag 或 VERSION 变量）。
var Version = "dev"
