/**
 * Local replacement for `tool()` from 'ai' (Vercel AI SDK).
 *
 * Returns the same shape so agent files only need an import change.
 * The orchestrator bridges these to Gauss ToolDef + tool executor.
 */

import { z } from 'zod';

export interface ToolConfig<TInput extends z.ZodType> {
  description: string;
  inputSchema: TInput;
  execute: (args: z.infer<TInput>) => Promise<string>;
}

export interface LocalTool<TInput extends z.ZodType = z.ZodType> {
  description: string;
  parameters: TInput;
  execute: (args: z.infer<TInput>) => Promise<string>;
}

export function tool<TInput extends z.ZodType>(config: ToolConfig<TInput>): LocalTool<TInput> {
  return {
    description: config.description,
    parameters: config.inputSchema,
    execute: config.execute,
  };
}

/**
 * Convert a map of LocalTool objects to Gauss ToolDef[] + a tool executor function.
 */
export function bridgeToolsToGauss(tools: Record<string, LocalTool>) {
  const defs = Object.entries(tools).map(([name, t]) => ({
    name,
    description: t.description,
    parameters: t.parameters,
  }));

  const executor = async (name: string, argsStr: string): Promise<string> => {
    const fn = tools[name]?.execute;
    if (!fn) return JSON.stringify({ error: `Unknown tool: ${name}` });
    const args = JSON.parse(argsStr);
    const result = await fn(args);
    return typeof result === 'string' ? result : JSON.stringify(result);
  };

  return { defs, executor };
}
