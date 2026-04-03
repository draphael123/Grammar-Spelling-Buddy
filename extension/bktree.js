/**
 * Grammar & Spelling Buddy — BK-Tree Module
 *
 * Efficient approximate string matching using Burkhard-Keller trees.
 * Dramatically reduces spell-checking lookup time from O(n) to O(n^(d/D))
 * where d = max edit distance and D = average word length.
 */

/**
 * Optimized Levenshtein distance with early termination
 * @param {string} a - First string
 * @param {string} b - Second string
 * @param {number} maxDist - Maximum distance to compute (optimization)
 * @returns {number} Levenshtein distance, or Infinity if exceeds maxDist
 */
function levenshteinDistance(a, b, maxDist = Infinity) {
  const m = a.length;
  const n = b.length;

  // Early termination if length difference exceeds max distance
  if (Math.abs(m - n) > maxDist) return Infinity;

  // Optimization: use 1D arrays for space efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let minRowVal = i;

    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
      minRowVal = Math.min(minRowVal, curr[j]);
    }

    // Early termination: if minimum in row > maxDist, impossible to get <= maxDist
    if (minRowVal > maxDist) return Infinity;

    // Swap rows
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * BK-Tree Node
 * Each node contains a word and distances to its children
 */
class BKTreeNode {
  constructor(word) {
    this.word = word;
    this.children = new Map(); // distance -> BKTreeNode
  }
}

/**
 * Burkhard-Keller Tree for fast approximate string matching
 */
class BKTree {
  constructor(distanceFn = levenshteinDistance) {
    this.distanceFn = distanceFn;
    this.root = null;
  }

  /**
   * Add a word to the tree
   * @param {string} word - The word to add
   */
  add(word) {
    if (this.root === null) {
      this.root = new BKTreeNode(word);
      return;
    }

    let current = this.root;
    let dist = this.distanceFn(word, current.word);

    while (current.children.has(dist)) {
      current = current.children.get(dist);
      dist = this.distanceFn(word, current.word);
    }

    current.children.set(dist, new BKTreeNode(word));
  }

  /**
   * Search for words within maxDist edits of the query word
   * @param {string} word - The query word
   * @param {number} maxDist - Maximum edit distance
   * @returns {Array<{word: string, distance: number}>} Matching words with distances
   */
  search(word, maxDist = 2) {
    if (this.root === null) return [];

    const results = [];
    const queue = [
      { node: this.root, dist: this.distanceFn(word, this.root.word) }
    ];

    while (queue.length > 0) {
      const { node, dist } = queue.shift();

      // If this node is within maxDist, it's a match
      if (dist <= maxDist && dist > 0) {
        results.push({ word: node.word, distance: dist });
      }

      // Triangle inequality: only explore children where distance is plausible
      // If d(query, node) = dist, then children at distance k can be at distance
      // [dist - k, dist + k] from query (approximately)
      for (const [edgeDist, child] of node.children) {
        // Check triangle inequality: |dist - edgeDist| <= distance to child from query <= dist + edgeDist
        const lowerBound = Math.abs(dist - edgeDist);
        const upperBound = dist + edgeDist;

        // Only explore if it's possible the child can be within maxDist
        if (lowerBound <= maxDist) {
          const childDist = this.distanceFn(word, child.word);
          queue.push({ node: child, dist: childDist });
        }
      }
    }

    return results;
  }

  /**
   * Get size of tree (number of nodes)
   */
  size() {
    if (this.root === null) return 0;
    let count = 0;
    const stack = [this.root];
    const visited = new WeakSet();

    while (stack.length > 0) {
      const node = stack.pop();
      if (visited.has(node)) continue;
      visited.add(node);
      count++;

      for (const child of node.children.values()) {
        stack.push(child);
      }
    }

    return count;
  }
}

/**
 * Build a BK-tree from a Set of words
 * Returns a function that builds it asynchronously in chunks
 * @param {Set<string>} wordSet - Set of words to build tree from
 * @param {number} chunkSize - Number of words to process per chunk (default 5000)
 * @returns {Promise<BKTree>} Promise resolving to the completed BK-tree
 */
function buildBKTree(wordSet, chunkSize = 5000) {
  return new Promise((resolve) => {
    const tree = new BKTree();
    const words = Array.from(wordSet);
    let index = 0;

    function processChunk() {
      const endIndex = Math.min(index + chunkSize, words.length);

      for (let i = index; i < endIndex; i++) {
        tree.add(words[i]);
      }

      index = endIndex;

      if (index < words.length) {
        // Schedule next chunk asynchronously to avoid blocking the page
        setTimeout(processChunk, 0);
      } else {
        // Tree is complete
        resolve(tree);
      }
    }

    // Start processing
    processChunk();
  });
}
