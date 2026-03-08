import type { MessageNode } from '../types/messages';

/**
 * Walk from a leaf node up to the root, returning the active branch
 * as an ordered array [root, ..., leaf].
 */
export function getActiveBranch(
  nodeMap: Map<string, MessageNode>,
  leafId: string
): MessageNode[] {
  const path: MessageNode[] = [];
  let current = nodeMap.get(leafId);

  while (current) {
    path.unshift(current);
    if (current.parentId === null) break;
    current = nodeMap.get(current.parentId);
  }

  return path;
}

/**
 * Walk from the root down the active path to find the active leaf.
 */
export function getActiveLeaf(
  nodeMap: Map<string, MessageNode>,
  rootId: string
): MessageNode | null {
  let current = nodeMap.get(rootId);
  if (!current) return null;

  while (current.childIds.length > 0) {
    const activeChildId = current.childIds[current.activeChildIndex] ?? current.childIds[0];
    const next = nodeMap.get(activeChildId);
    if (!next) break;
    current = next;
  }

  return current;
}

/**
 * Get sibling nodes (children of the same parent) for branch navigation.
 */
export function getSiblings(
  nodeMap: Map<string, MessageNode>,
  nodeId: string
): { siblings: MessageNode[]; currentIndex: number } {
  const node = nodeMap.get(nodeId);
  if (!node || node.parentId === null) {
    return { siblings: node ? [node] : [], currentIndex: 0 };
  }

  const parent = nodeMap.get(node.parentId);
  if (!parent) {
    return { siblings: [node], currentIndex: 0 };
  }

  const siblings = parent.childIds
    .map((id) => nodeMap.get(id))
    .filter((n): n is MessageNode => n !== undefined && !n._deleted);

  const currentIndex = siblings.findIndex((s) => s.id === nodeId);

  return { siblings, currentIndex: Math.max(0, currentIndex) };
}

/**
 * Switch the active child at a given parent to a different sibling index.
 * Returns the updated parent node.
 */
export function switchBranch(
  parent: MessageNode,
  newIndex: number
): MessageNode {
  const clampedIndex = Math.max(0, Math.min(newIndex, parent.childIds.length - 1));
  return {
    ...parent,
    activeChildIndex: clampedIndex,
    _clock: parent._clock + 1,
  };
}

/**
 * Build a Map<id, MessageNode> from an array.
 */
export function buildNodeMap(nodes: MessageNode[]): Map<string, MessageNode> {
  const map = new Map<string, MessageNode>();
  for (const node of nodes) {
    if (!node._deleted) {
      map.set(node.id, node);
    }
  }
  return map;
}
