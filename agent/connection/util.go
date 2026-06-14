package connection

import (
	"fmt"
	"math/rand"
	"time"
)

func GenerateID() string {
	return fmt.Sprintf("%d-%d", time.Now().UnixNano(), rand.Intn(100000))
}
