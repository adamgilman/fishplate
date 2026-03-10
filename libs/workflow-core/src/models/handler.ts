export interface ActionHandler {
  execute(input: Record<string, any>): Promise<ActionResult>;
}

export interface ActionResult {
  contextUpdates: Record<string, any>;
}
