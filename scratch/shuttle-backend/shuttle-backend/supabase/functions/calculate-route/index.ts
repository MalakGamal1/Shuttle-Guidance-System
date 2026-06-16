// @ts-nocheck
/// <reference lib="deno.ns" />

interface Node { id: string; x: number; y: number; }
interface Edge { from: string; to: string; cost: number; }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const heuristic = (a: Node, b: Node) => Math.hypot(a.x - b.x, a.y - b.y);

class MinHeap {
  private heap: { id: string; priority: number }[] = [];
  
  push(id: string, priority: number) { this.heap.push({ id, priority }); this._up(this.heap.length - 1); }
  pop(): string | null {
    if (!this.heap.length) return null;
    const top = this.heap[0].id;
    const end = this.heap.pop()!;
    if (this.heap.length) { this.heap[0] = end; this._down(0); }
    return top;
  }
  peek() { return this.heap[0]?.priority ?? Infinity; }
  size() { return this.heap.length; }

  private _up(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heap[p].priority <= this.heap[i].priority) break;
      [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
      i = p;
    }
  }

  private _down(i: number) {
    const n = this.heap.length;
    while (true) {
      let s = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this.heap[l].priority < this.heap[s].priority) s = l;
      if (r < n && this.heap[r].priority < this.heap[s].priority) s = r;
      if (s === i) break;
      [this.heap[i], this.heap[s]] = [this.heap[s], this.heap[i]];
      i = s;
    }
  }
}

function buildGraph(nodes: Node[], edges: Edge[]) {
  const graph: Record<string, { node: Node; nbs: {id:string, cost:number}[] }> = {};
  for (const n of nodes) graph[n.id] = { node: n, nbs: [] };
  for (const e of edges) {
    if (e.cost < 0) throw new Error(`Negative cost not allowed: ${e.from}→${e.to}`);
    if (graph[e.from] && graph[e.to]) {
      graph[e.from].nbs.push({ id: e.to, cost: e.cost });
      graph[e.to].nbs.push({ id: e.from, cost: e.cost });
    }
  }
  return graph;
}

function findPath(graph: any, start: Node, goal: Node) {
  if (start.id === goal.id) return { path: [start.id], cost: 0 };
  if (!graph[start.id] || !graph[goal.id]) return null;

  const openSet = new MinHeap();
  const cameFrom: Record<string, string> = {};
  const gScore: Record<string, number> = { [start.id]: 0 };
  const fScore: Record<string, number> = { [start.id]: heuristic(start, goal) };
  const closed = new Set<string>();

  openSet.push(start.id, fScore[start.id]);

  while (openSet.size() > 0) {
    const current = openSet.pop()!;
    if (closed.has(current)) continue;
    closed.add(current);

    if (current === goal.id) {
      const path: string[] = [];
      let curr: string | undefined = current;
      while (curr !== undefined) {
        path.unshift(curr);
        curr = cameFrom[curr];
      }
      return { path, cost: gScore[current] };
    }

    for (const neighbor of graph[current].nbs) {
      if (closed.has(neighbor.id)) continue;

      const tentativeG = gScore[current] + neighbor.cost;
      if (tentativeG < (gScore[neighbor.id] ?? Infinity)) {
        cameFrom[neighbor.id] = current;
        gScore[neighbor.id] = tentativeG;
        fScore[neighbor.id] = tentativeG + heuristic(graph[neighbor.id].node, goal);
        openSet.push(neighbor.id, fScore[neighbor.id]);
      }
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, message: "method not allowed" }, 405);

  try {
    const { start, goal, nodes, edges } = await req.json();

    if (!start?.id || !goal?.id || !Array.isArray(nodes) || nodes.length === 0) {
      return json({ success: false, message: "invalid input: start, goal, and nodes are required" }, 400);
    }

    const graph = buildGraph(nodes, edges || []);
    const result = findPath(graph, start, goal);

    if (!result) return json({ success: false, message: "no route found" });

    return json({ success: true, ...result });
  } catch (err: any) {
    console.error(err);
    return json({ success: false, message: err.message }, 500);
  }
});