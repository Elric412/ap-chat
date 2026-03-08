/**
 * State Integrity Engine
 * 
 * Self-healing checks for store state corruption:
 * - Orphaned message nodes
 * - Broken parent-child links
 * - Missing root nodes
 * - Circular reference detection
 * - Duplicate node IDs
 * 
 * Runs periodically and on-demand after errors.
 */

import type { MessageNode } from '../types/messages';
import type { Conversation } from '../types/conversations';

export interface IntegrityReport {
  healthy: boolean;
  issues: IntegrityIssue[];
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
 * Returns report and optionally auto-repairs safe issues.
 */
export function checkMessageIntegrity(
  messageMap: Map<string, MessageNode>,
  conversations: Conversation[],
  autoRepair = true
): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  let repaired = 0;

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

    // Check children exist
    const validChildren: string[] = [];
    for (const childId of node.childIds) {
      if (!messageMap.has(childId)) {
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

    // Auto-repair: remove broken child references
    if (autoRepair && validChildren.length !== node.childIds.length) {
      node.childIds = validChildren;
      // Fix active child index if out of bounds
      if (node.activeChildIndex >= node.childIds.length) {
        node.activeChildIndex = Math.max(0, node.childIds.length - 1);
      }
    }

    // Check for duplicate children
    const childSet = new Set(node.childIds);
    if (childSet.size !== node.childIds.length) {
      issues.push({
        type: 'duplicate_child',
        severity: 'warning',
        nodeId,
        description: `Node ${nodeId.slice(0, 8)}… has duplicate children`,
        autoRepaired: autoRepair,
      });
      if (autoRepair) {
        node.childIds = [...childSet];
        repaired++;
      }
    }

    // Check activeChildIndex bounds
    if (node.childIds.length > 0 && node.activeChildIndex >= node.childIds.length) {
      issues.push({
        type: 'invalid_index',
        severity: 'warning',
        nodeId,
        description: `Node ${nodeId.slice(0, 8)}… activeChildIndex ${node.activeChildIndex} exceeds children count ${node.childIds.length}`,
        autoRepaired: autoRepair,
      });
      if (autoRepair) {
        node.activeChildIndex = node.childIds.length - 1;
        repaired++;
      }
    }
  }

  // 3. Detect orphaned nodes (not reachable from any root)
  const rootIds = new Set(conversations.map((c) => c.rootNodeId));
  const reachable = new Set<string>();

  function walk(nodeId: string, visited: Set<string>): void {
    if (visited.has(nodeId)) return; // Circular protection
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

  // 4. Circular reference detection (additional check)
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
    repaired,
    checkedAt: Date.now(),
  };
}

/**
 * Quick health check — fast path for periodic checks.
 * Only verifies root nodes and active branch integrity.
 */
export function quickHealthCheck(
  messageMap: Map<string, MessageNode>,
  rootNodeId: string
): boolean {
  const root = messageMap.get(rootNodeId);
  if (!root) return false;

  // Walk active branch to verify chain
  let current = root;
  const visited = new Set<string>();
  let depth = 0;
  const MAX_DEPTH = 10_000; // Safety cap

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
