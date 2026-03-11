package model

type NodeType string

const (
	NodeTypeAction   NodeType = "action"
	NodeTypeDecision NodeType = "decision"
	NodeTypeFork     NodeType = "fork"
	NodeTypeGate     NodeType = "gate"
	NodeTypeTerminal NodeType = "terminal"
	NodeTypeWorkflow NodeType = "workflow"
)

type WorkflowDefinition struct {
	ID            string
	TenantID      string
	Name          string
	Version       int
	IsTemplate    bool
	CreatedBy     string
	Entrypoint    string
	Nodes         []NodeDefinition
	Edges         []EdgeDefinition
	MaxIterations int
}

type NodeDefinition struct {
	ID              string
	Type            NodeType
	Handler         string
	Input           string
	WorkflowRef     string
	WorkflowVersion int
	WorkflowInput   string
	TimeoutMs       int
	TimeoutEdge     string
	Branches        []string
	JoinNode        string
}

type EdgeDefinition struct {
	From          string
	To            string
	When          string
	Priority      int
	MaxIterations int
}
