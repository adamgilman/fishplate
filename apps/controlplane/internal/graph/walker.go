package graph

import (
	"fmt"
	"sort"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/cel"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
)

type CommandType string

const (
	CmdExecuteAction   CommandType = "execute_action"
	CmdExecuteWorkflow CommandType = "execute_workflow"
	CmdFork            CommandType = "fork"
	CmdWaitForSignal   CommandType = "wait_for_signal"
	CmdComplete        CommandType = "complete"
	CmdFail            CommandType = "fail"
)

type WalkerCommand struct {
	Type            CommandType
	NodeID          string
	Handler         string
	Input           map[string]any
	WorkflowRef     string
	WorkflowVersion int
	Branches        []string
	JoinNode        string
	TimeoutMs       int
	Context         map[string]any // for CmdComplete
	Reason          string         // for CmdFail
}

type CommandResult struct {
	ContextUpdates map[string]any
	SignalReceived bool
	Error          string
}

type Walker struct {
	def        *model.WorkflowDefinition
	ctx        map[string]any
	cursor     string
	nodeMap    map[string]*model.NodeDefinition
	edgesByFrom map[string][]model.EdgeDefinition
	loopGuard  *LoopGuard
	cel        *cel.Evaluator
	pendingErr string
	lastNode   string // last node yielded by Next()
}

func NewWalker(def *model.WorkflowDefinition, params map[string]any) *Walker {
	ctx := make(map[string]any)
	for k, v := range params {
		ctx[k] = v
	}

	nodeMap := make(map[string]*model.NodeDefinition, len(def.Nodes))
	for i := range def.Nodes {
		nodeMap[def.Nodes[i].ID] = &def.Nodes[i]
	}

	edgesByFrom := make(map[string][]model.EdgeDefinition)
	for _, e := range def.Edges {
		edgesByFrom[e.From] = append(edgesByFrom[e.From], e)
	}

	maxIter := def.MaxIterations
	if maxIter <= 0 {
		maxIter = 100
	}

	return &Walker{
		def:         def,
		ctx:         ctx,
		cursor:      def.Entrypoint,
		nodeMap:     nodeMap,
		edgesByFrom: edgesByFrom,
		loopGuard:   NewLoopGuard(maxIter),
		cel:         cel.NewEvaluator(),
	}
}

func (w *Walker) Next() WalkerCommand {
	if w.pendingErr != "" {
		reason := w.pendingErr
		w.pendingErr = ""
		return WalkerCommand{Type: CmdFail, Reason: reason}
	}

	for i := 0; i < w.def.MaxIterations; i++ {
		node, ok := w.nodeMap[w.cursor]
		if !ok {
			return WalkerCommand{Type: CmdFail, Reason: fmt.Sprintf("node %q not found", w.cursor)}
		}

		edges := w.edgesByFrom[w.cursor]

		switch node.Type {
		case model.NodeTypeTerminal:
			if len(edges) == 0 {
				return WalkerCommand{Type: CmdComplete, Context: w.copyCtx()}
			}
			// Terminal with edges = entrypoint, follow edge
			next, err := w.followEdge(edges)
			if err != nil {
				return WalkerCommand{Type: CmdFail, Reason: err.Error()}
			}
			w.cursor = next
			continue

		case model.NodeTypeDecision:
			next, err := w.followEdge(edges)
			if err != nil {
				return WalkerCommand{Type: CmdFail, Reason: err.Error()}
			}
			w.cursor = next
			continue

		case model.NodeTypeAction:
			w.lastNode = node.ID
			cmd := WalkerCommand{
				Type:    CmdExecuteAction,
				NodeID:  node.ID,
				Handler: node.Handler,
			}
			if node.Input != "" {
				input, err := w.cel.EvaluateInput(node.Input, w.ctx, w.loopGuard.GetLoopMap())
				if err != nil {
					return WalkerCommand{Type: CmdFail, Reason: fmt.Sprintf("CEL input eval: %v", err)}
				}
				cmd.Input = input
			}
			if node.TimeoutMs > 0 {
				cmd.TimeoutMs = node.TimeoutMs
			}
			return cmd

		case model.NodeTypeWorkflow:
			w.lastNode = node.ID
			cmd := WalkerCommand{
				Type:            CmdExecuteWorkflow,
				NodeID:          node.ID,
				WorkflowRef:     node.WorkflowRef,
				WorkflowVersion: node.WorkflowVersion,
			}
			if node.WorkflowInput != "" {
				input, err := w.cel.EvaluateInput(node.WorkflowInput, w.ctx, w.loopGuard.GetLoopMap())
				if err != nil {
					return WalkerCommand{Type: CmdFail, Reason: fmt.Sprintf("CEL input eval: %v", err)}
				}
				cmd.Input = input
			}
			return cmd

		case model.NodeTypeFork:
			w.lastNode = node.ID
			return WalkerCommand{
				Type:     CmdFork,
				NodeID:   node.ID,
				Branches: node.Branches,
				JoinNode: node.JoinNode,
			}

		case model.NodeTypeGate:
			w.lastNode = node.ID
			cmd := WalkerCommand{
				Type:   CmdWaitForSignal,
				NodeID: node.ID,
			}
			if node.TimeoutMs > 0 {
				cmd.TimeoutMs = node.TimeoutMs
			}
			return cmd

		default:
			return WalkerCommand{Type: CmdFail, Reason: fmt.Sprintf("unknown node type %q", node.Type)}
		}
	}

	return WalkerCommand{Type: CmdFail, Reason: "max iterations exceeded"}
}

func (w *Walker) Resolve(result CommandResult) {
	if result.Error != "" {
		w.pendingErr = result.Error
		return
	}

	// Merge context updates
	for k, v := range result.ContextUpdates {
		w.ctx[k] = v
	}

	node, ok := w.nodeMap[w.lastNode]
	if !ok {
		w.pendingErr = fmt.Sprintf("resolve: node %q not found", w.lastNode)
		return
	}

	switch node.Type {
	case model.NodeTypeGate:
		if !result.SignalReceived {
			// Stay at gate, don't advance
			return
		}
		w.advanceCursor()
	case model.NodeTypeFork:
		if node.JoinNode != "" {
			w.cursor = node.JoinNode
		} else {
			w.advanceCursor()
		}
	default:
		w.advanceCursor()
	}
}

func (w *Walker) advanceCursor() {
	edges := w.edgesByFrom[w.lastNode]
	if len(edges) > 0 {
		w.cursor = edges[0].To
	}
}

func (w *Walker) followEdge(edges []model.EdgeDefinition) (string, error) {
	// Sort by priority
	sorted := make([]model.EdgeDefinition, len(edges))
	copy(sorted, edges)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Priority < sorted[j].Priority
	})

	loopMap := w.loopGuard.GetLoopMap()

	for _, edge := range sorted {
		if edge.When != "" {
			result, err := w.cel.EvaluateCondition(edge.When, w.ctx, loopMap)
			if err != nil {
				return "", fmt.Errorf("CEL condition eval on edge %s->%s: %v", edge.From, edge.To, err)
			}
			if !result {
				continue
			}
		}
		// Match found, check loop guard
		if !w.loopGuard.Check(edge.From, edge.To, edge.MaxIterations) {
			return "", fmt.Errorf("loop limit exceeded on edge %s->%s", edge.From, edge.To)
		}
		return edge.To, nil
	}

	return "", fmt.Errorf("no matching edge from %q", edges[0].From)
}

func (w *Walker) copyCtx() map[string]any {
	m := make(map[string]any, len(w.ctx))
	for k, v := range w.ctx {
		m[k] = v
	}
	return m
}
