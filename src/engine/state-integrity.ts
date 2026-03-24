/**
 * State Integrity Engine
 * 
 * Self-healing checks for store state corruption.
 * 
 * Per coding-standards skill (CRITICAL immutability rule):
 * Auto-repair returns NEW objects; original nodes are NEVER mutated.
 * The caller is responsible for applying returned patches to the store.
 */

import type { MessageNode } from '../types/messages';
import type { Conversation } from '../types/conversations';

export interface IntegrityReport {
  healthy: boolean;
  issues: IntegrityIssue[];
  /** Map of nodeId → patched node (only nodes that were repaired) */
  patches: Map<string, Partial<Pick<MessageNode, 'childIds' | 'activeChildIndex'>>>;
  repaired: number;
  checkedAt: number;
}

export interface IntegrityIssue {
  type: 'orphan' | 'broken_link' | 'missing_root' | 'circular_ref' | 'duplicate_child' | 'invalid_index';
  severity: 'warning' | 'error';
  nodeId: string;
  description: string;
  autoRepaired: boolean;
}

/**
 * Run full integrity check on a message map.
 * 
 * IMPORTANT: This function is PURE — it never mutates the input messageMap.
 * Repairs are returned as a `patches` map that the caller applies via immer.
 */
export function checkMessageIntegrity(
  messageMap: Map<string, MessageNode>,
  conversations: Conversation[],
  autoRepair = true
): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  let repaired = 0;
  const patches = new Map<string, Partial<Pick<MessageNode, 'childIds' | 'activeChildIndex'>>>();

  // 1. Check all root nodes exist
  for (const conv of conversations) {
    if (!messageMap.has(conv.rootNodeId)) {
      issues.push({
        type: 'missing_root',
        severity: 'error',
        nodeId: conv.rootNodeId,
        description: `Root node ${conv.rootNodeId.slice(0, 8)}… missing for conversation "${conv.title}"`,
        autoRepaired: false,
      });
    }
  }

  // 2. Check parent-child link consistency
  for (const [nodeId, node] of messageMap) {
    // Check parent exists
    if (node.parentId && !messageMap.has(node.parentId)) {
      issues.push({
        type: 'broken_link',
        severity: 'error',
        nodeId,
        description: `Node ${nodeId.slice(0, 8)}… references missing parent ${node.parentId.slice(0, 8)}…`,
        autoRepaired: false,
      });
    }

    // Check children exist — collect valid children without mutating
    const validChildren: string[] = [];
    let hasBrokenChild = false;

    for (const childId of node.childIds) {
      if (!messageMap.has(childId)) {
        hasBrokenChild = true;
        issues.push({
          type: 'broken_link',
          severity: 'warning',
          nodeId,
          description: `Node ${nodeId.slice(0, 8)}… references missing child ${childId.slice(0, 8)}…`,
          autoRepaired: autoRepair,
        });
        if (autoRepair) repaired++;
      } else {
        validChildren.push(childId);
      }
    }

    // Check for duplicate children
    const childSet = new Set(validChildren);
    const hasDuplicates = childSet.size !== validChildren.length;
    if (hasDuplicates) {
      issues.push({
        type: 'duplicate_child',
        severity: 'warning',
        nodeId,
        description: `Node ${nodeId.slice(0, 8)}… has duplicate children`,
        autoRepaired: autoRepair,
      });
      if (autoRepair) repaired++;
    }

    // Compute repaired children list (deduplicated, only valid)
    const repairedChildren = hasDuplicates ? [...childSet] : validChildren;

    // Check activeChildIndex bounds
    let repairedIndex = node.activeChildIndex;
    if (repairedChildren.length > 0 && repairedIndex >= repairedChildren.length) {
      issues.push({
        type: 'invalid_index',
        severity: 'warning',
        nodeId,
        description: `Node ${nodeId.slice(0, 8)}… activeChildIndex ${repairedIndex} exceeds children count ${repairedChildren.length}`,
        autoRepaired: autoRepair,
      });
      if (autoRepair) {
        repairedIndex = repairedChildren.length - 1;
        repaired++;
      }
    }

    // Build patch if anything changed (immutable: never touch original)
    if (autoRepair && (hasBrokenChild || hasDuplicates || repairedIndex !== node.activeChildIndex)) {
      patches.set(nodeId, {
        childIds: repairedChildren,
        activeChildIndex: repairedIndex,
      });
    }
  }

  // 3. Detect orphaned nodes (not reachable from any root)
  const rootIds = new Set(conversations.map((c) => c.rootNodeId));
  const reachable = new Set<string>();

  function walk(nodeId: string, visited: Set<string>): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    reachable.add(nodeId);
    const node = messageMap.get(nodeId);
    if (!node) return;
    for (const childId of node.childIds) {
      walk(childId, visited);
    }
  }

  for (const rootId of rootIds) {
    walk(rootId, new Set());
  }

  for (const [nodeId] of messageMap) {
    if (!reachable.has(nodeId)) {
      issues.push({
        type: 'orphan',
        severity: 'warning',
        nodeId,
        description: `Node ${nodeId.slice(0, 8)}… is orphaned (unreachable from any root)`,
        autoRepaired: false,
      });
    }
  }

  // 4. Circular reference detection
  for (const rootId of rootIds) {
    const visited = new Set<string>();
    const stack = new Set<string>();

    function detectCycle(nodeId: string): boolean {
      if (stack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      stack.add(nodeId);
      const node = messageMap.get(nodeId);
      if (node) {
        for (const childId of node.childIds) {
          if (detectCycle(childId)) {
            issues.push({
              type: 'circular_ref',
              severity: 'error',
              nodeId,
              description: `Circular reference detected: ${nodeId.slice(0, 8)}… → ${childId.slice(0, 8)}…`,
              autoRepaired: false,
            });
          }
        }
      }
      stack.delete(nodeId);
      return false;
    }

    detectCycle(rootId);
  }

  return {
    healthy: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
    patches,
    repaired,
    checkedAt: Date.now(),
  };
}

/**
 * Quick health check — fast path for periodic checks.
 * Only verifies root nodes and active branch integrity.
 * Pure function — no side effects.
 */
export function quickHealthCheck(
  messageMap: Map<string, MessageNode>,
  rootNodeId: string
): boolean {
  const root = messageMap.get(rootNodeId);
  if (!root) return false;

  let current = root;
  const visited = new Set<string>();
  let depth = 0;
  const MAX_DEPTH = 10_000;

  while (current.childIds.length > 0 && depth < MAX_DEPTH) {
    if (visited.has(current.id)) return false; // Circular
    visited.add(current.id);

    const nextId = current.childIds[current.activeChildIndex];
    if (!nextId) return false;

    const next = messageMap.get(nextId);
    if (!next) return false;

    current = next;
    depth++;
  }

  return depth < MAX_DEPTH;
}
