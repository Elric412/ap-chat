import type { Skill } from '../skills';
import type { TaskId, Result } from './ids';
import type { SwarmError } from './errors';

export interface RouteRequest {
  taskId: TaskId;
  instruction: string;
  suggestedSkillId: string | null;
  availableSkills: Skill[];
}

export interface RouteCandidate {
  skillId: string;
  role: string;
  score: number;
  reasons: string[];
}

export interface RouteDecision {
  taskId: TaskId;
  chosenSkillId: string | null;
  chosenRole: string;
  candidates: RouteCandidate[];
  strategy: 'heuristic' | 'llm' | 'hybrid';
  reasoning: string;
}

export interface ISkillRouter {
  routeHeuristic(req: RouteRequest): RouteDecision;
  routeLLM(req: RouteRequest, signal: AbortSignal): Promise<Result<RouteDecision, SwarmError>>;
  route(req: RouteRequest, signal: AbortSignal): Promise<Result<RouteDecision, SwarmError>>;
}
