const stadiumMap = require("./data/stadium_map.json");
const crowdData = require("./data/crowd_data.json");

// --- Simple breadth-first search over the stadium graph ---
function findPath(fromId, toId, requireAccessible) {
  const adjacency = {};
  for (const node of stadiumMap.nodes) adjacency[node.id] = [];
  for (const edge of stadiumMap.edges) {
    if (requireAccessible && !edge.accessible) continue;
    adjacency[edge.from].push({ to: edge.to, walk_minutes: edge.walk_minutes });
    adjacency[edge.to].push({ to: edge.from, walk_minutes: edge.walk_minutes });
  }

  const visited = new Set([fromId]);
  const queue = [{ id: fromId, path: [fromId], minutes: 0 }];

  while (queue.length) {
    const current = queue.shift();
    if (current.id === toId) return current;
    for (const neighbor of adjacency[current.id] || []) {
      if (visited.has(neighbor.to)) continue;
      visited.add(neighbor.to);
      queue.push({
        id: neighbor.to,
        path: [...current.path, neighbor.to],
        minutes: current.minutes + neighbor.walk_minutes,
      });
    }
  }
  return null;
}

function nodeName(id) {
  const node = stadiumMap.nodes.find((n) => n.id === id);
  return node ? node.name : id;
}

function findNodeIdByName(query) {
  const q = query.toLowerCase();
  const match = stadiumMap.nodes.find(
    (n) => n.id === q || n.name.toLowerCase().includes(q) || n.type.toLowerCase() === q
  );
  return match ? match.id : null;
}

// --- Tool implementations, called by name from server.js ---

function getDirections({ from, to, accessible_only }) {
  const fromId = findNodeIdByName(from);
  const toId = findNodeIdByName(to);
  if (!fromId || !toId) {
    return { error: `Could not find a location matching "${!fromId ? from : to}" on the stadium map.` };
  }
  const result = findPath(fromId, toId, !!accessible_only);
  if (!result) {
    return { error: `No route found between ${nodeName(fromId)} and ${nodeName(toId)}${accessible_only ? " using accessible paths only" : ""}.` };
  }
  return {
    from: nodeName(fromId),
    to: nodeName(toId),
    steps: result.path.map(nodeName),
    estimated_walk_minutes: result.minutes,
    accessible_route: !!accessible_only,
  };
}

function getCrowdDensity({ zone }) {
  if (!zone) return { zones: crowdData.zones, last_updated: crowdData.last_updated };
  const zoneId = findNodeIdByName(zone) || zone.toLowerCase().replace(/\s+/g, "_");
  const match = crowdData.zones.find((z) => z.zone === zoneId);
  if (!match) {
    return { error: `No live density data for "${zone}". Available zones: ${crowdData.zones.map((z) => z.zone).join(", ")}` };
  }
  return match;
}

function listAmenities({ type }) {
  const nodes = type
    ? stadiumMap.nodes.filter((n) => n.type === type.toLowerCase())
    : stadiumMap.nodes;
  return nodes.map((n) => ({ id: n.id, name: n.name, type: n.type, accessible: n.accessible }));
}

// Tool schema definitions, in Gemini's functionDeclarations format
const toolDefinitions = [
  {
    name: "get_directions",
    description: "Get walking directions and estimated time between two points in the stadium (gates, concourses, restrooms, food courts, sections, transit hub, parking, first aid).",
    parameters: {
      type: "OBJECT",
      properties: {
        from: { type: "STRING", description: "Starting location name, e.g. 'Gate A' or 'North Concourse'" },
        to: { type: "STRING", description: "Destination location name, e.g. 'Section 101' or 'nearest restroom'" },
        accessible_only: { type: "BOOLEAN", description: "Whether the route must be wheelchair-accessible" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "get_crowd_density",
    description: "Get current live crowd density and trend for a specific stadium zone (gate or concourse), or for all zones if no zone is given.",
    parameters: {
      type: "OBJECT",
      properties: {
        zone: { type: "STRING", description: "Zone name, e.g. 'Gate B' or 'North Concourse'. Omit to get all zones." },
      },
    },
  },
  {
    name: "list_amenities",
    description: "List stadium amenities of a given type: restroom, food, first_aid, recycling, gate, transit, parking, seating.",
    parameters: {
      type: "OBJECT",
      properties: {
        type: { type: "STRING", description: "Amenity type to filter by. Omit to list everything." },
      },
    },
  },
];

const toolImplementations = {
  get_directions: getDirections,
  get_crowd_density: getCrowdDensity,
  list_amenities: listAmenities,
};

module.exports = { toolDefinitions, toolImplementations };
