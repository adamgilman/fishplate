package graph

import "fmt"

type LoopGuard struct {
	globalLimit int
	counts      map[string]int64
}

func NewLoopGuard(globalLimit int) *LoopGuard {
	return &LoopGuard{globalLimit: globalLimit, counts: make(map[string]int64)}
}

// Check increments count for from->to, returns true if within limit. edgeLimit 0 = use global.
func (lg *LoopGuard) Check(from, to string, edgeLimit int) bool {
	key := fmt.Sprintf("%s->%s", from, to)
	lg.counts[key]++
	limit := lg.globalLimit
	if edgeLimit > 0 {
		limit = edgeLimit
	}
	return lg.counts[key] <= int64(limit)
}

func (lg *LoopGuard) GetLoopMap() map[string]int64 {
	m := make(map[string]int64, len(lg.counts))
	for k, v := range lg.counts {
		m[k] = v
	}
	return m
}
