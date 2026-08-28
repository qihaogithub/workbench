export interface NavigationRoutePoint {
  x: number;
  y: number;
}

export interface NavigationRouteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type NavigationSide = "left" | "right" | "top" | "bottom";

const EPSILON = 0.001;

function isPointInsideRect(
  point: NavigationRoutePoint,
  rect: NavigationRouteRect,
) {
  return (
    point.x > rect.x + EPSILON &&
    point.x < rect.x + rect.width - EPSILON &&
    point.y > rect.y + EPSILON &&
    point.y < rect.y + rect.height - EPSILON
  );
}

function isSegmentClear(
  from: NavigationRoutePoint,
  to: NavigationRoutePoint,
  obstacles: NavigationRouteRect[],
) {
  if (Math.abs(from.x - to.x) > EPSILON && Math.abs(from.y - to.y) > EPSILON) {
    return false;
  }
  return obstacles.every((rect) => {
    if (Math.abs(from.y - to.y) < EPSILON) {
      if (
        from.y <= rect.y + EPSILON ||
        from.y >= rect.y + rect.height - EPSILON
      )
        return true;
      const left = Math.min(from.x, to.x);
      const right = Math.max(from.x, to.x);
      return right <= rect.x + EPSILON || left >= rect.x + rect.width - EPSILON;
    }
    if (from.x <= rect.x + EPSILON || from.x >= rect.x + rect.width - EPSILON)
      return true;
    const top = Math.min(from.y, to.y);
    const bottom = Math.max(from.y, to.y);
    return bottom <= rect.y + EPSILON || top >= rect.y + rect.height - EPSILON;
  });
}

function dedupe(values: number[]) {
  return [
    ...new Set(values.map((value) => Math.round(value * 1000) / 1000)),
  ].sort((a, b) => a - b);
}

function simplifyRoute(points: NavigationRoutePoint[]) {
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1];
    const next = points[index + 1];
    return !(
      (Math.abs(previous.x - point.x) < EPSILON &&
        Math.abs(point.x - next.x) < EPSILON) ||
      (Math.abs(previous.y - point.y) < EPSILON &&
        Math.abs(point.y - next.y) < EPSILON)
    );
  });
}

function isRouteClear(
  points: NavigationRoutePoint[],
  obstacles: NavigationRouteRect[],
) {
  return points.every(
    (point, index) =>
      index === 0 || isSegmentClear(points[index - 1], point, obstacles),
  );
}

function fallbackOrthogonalRoute(
  source: NavigationRoutePoint,
  target: NavigationRoutePoint,
) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const middleX = (source.x + target.x) / 2;
    if (Math.abs(dy) > EPSILON) {
      return [
        source,
        { x: middleX, y: source.y },
        { x: middleX, y: target.y },
        target,
      ];
    }
    const railY = source.y - 48;
    return [
      source,
      { x: middleX, y: source.y },
      { x: middleX, y: railY },
      { x: target.x, y: railY },
      target,
    ];
  }
  const middleY = (source.y + target.y) / 2;
  if (Math.abs(dx) > EPSILON) {
    return [
      source,
      { x: source.x, y: middleY },
      { x: target.x, y: middleY },
      target,
    ];
  }
  const railX = source.x - 48;
  return [
    source,
    { x: source.x, y: middleY },
    { x: railX, y: middleY },
    { x: railX, y: target.y },
    target,
  ];
}

function pointOnSide(rect: NavigationRouteRect, side: NavigationSide) {
  switch (side) {
    case "left":
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case "right":
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    case "top":
      return { x: rect.x + rect.width / 2, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  }
}

function moveOutside(
  point: NavigationRoutePoint,
  side: NavigationSide,
  gap: number,
) {
  switch (side) {
    case "left":
      return { ...point, x: point.x - gap };
    case "right":
      return { ...point, x: point.x + gap };
    case "top":
      return { ...point, y: point.y - gap };
    case "bottom":
      return { ...point, y: point.y + gap };
  }
}

/**
 * Creates a connector with locked entry and exit normals. The first and final
 * segments therefore always leave/enter the selected page side perpendicularly.
 */
export function buildNavigationConnectorRoute(input: {
  sourceRect: NavigationRouteRect;
  targetRect: NavigationRouteRect;
  sourceAnchor: NavigationRoutePoint;
  obstacles: NavigationRouteRect[];
  lead?: number;
}): NavigationRoutePoint[] {
  const targetCenter = {
    x: input.targetRect.x + input.targetRect.width / 2,
    y: input.targetRect.y + input.targetRect.height / 2,
  };
  const dx = targetCenter.x - input.sourceAnchor.x;
  const dy = targetCenter.y - input.sourceAnchor.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sourceSide: NavigationSide = horizontal
    ? dx >= 0
      ? "right"
      : "left"
    : dy >= 0
      ? "bottom"
      : "top";
  const targetSide: NavigationSide = horizontal
    ? dx >= 0
      ? "left"
      : "right"
    : dy >= 0
      ? "top"
      : "bottom";
  const sourcePoint = pointOnSide(input.sourceRect, sourceSide);
  const targetPoint = pointOnSide(input.targetRect, targetSide);
  const lead = input.lead ?? 28;
  const sourceLead = moveOutside(sourcePoint, sourceSide, lead);
  const targetLead = moveOutside(targetPoint, targetSide, lead);
  const middle = findNavigationRoute({
    source: sourceLead,
    target: targetLead,
    obstacles: input.obstacles,
  });
  return [sourcePoint, ...middle, targetPoint];
}

/**
 * Finds a stable Manhattan route through a sparse visibility grid. Obstacle
 * edges are valid route lanes; their interior is not. The route is derived at
 * render time so it never becomes stale after canvas layout changes.
 */
export function findNavigationRoute(input: {
  source: NavigationRoutePoint;
  target: NavigationRoutePoint;
  obstacles: NavigationRouteRect[];
  /** Keep the visual connector orthogonal even when endpoints happen to align. */
  forceOrthogonalBends?: boolean;
}): NavigationRoutePoint[] {
  const { source, target } = input;
  let obstacles = input.obstacles.filter(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      !isPointInsideRect(source, rect) &&
      !isPointInsideRect(target, rect),
  );
  const direct = isSegmentClear(source, target, obstacles);
  if (direct && !input.forceOrthogonalBends) return [source, target];
  if (direct && input.forceOrthogonalBends) {
    // A virtual, non-rendered blocker prevents aligned endpoints from
    // degenerating into a straight line. This preserves the connector rhythm
    // of horizontal exit → rounded turn → horizontal entry shown in the UI.
    const bendOffset = 48;
    obstacles = [
      ...obstacles,
      Math.abs(source.y - target.y) < EPSILON
        ? {
            x: (source.x + target.x) / 2 - 1,
            y: source.y - bendOffset,
            width: 2,
            height: bendOffset * 2,
          }
        : {
            x: source.x - bendOffset,
            y: (source.y + target.y) / 2 - 1,
            width: bendOffset * 2,
            height: 2,
          },
    ];
  }

  // For a relationship whose pages are laid out side by side, keep both end
  // segments horizontal. This produces the familiar connector shape instead
  // of allowing the shortest-path tie breaker to run down a page edge first.
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dy) > EPSILON) {
    const middleX = (source.x + target.x) / 2;
    const preferred = [
      source,
      { x: middleX, y: source.y },
      { x: middleX, y: target.y },
      target,
    ];
    if (isRouteClear(preferred, obstacles)) return preferred;
  }

  const xs = dedupe([
    source.x,
    target.x,
    ...obstacles.flatMap((rect) => [rect.x, rect.x + rect.width]),
  ]);
  const ys = dedupe([
    source.y,
    target.y,
    ...obstacles.flatMap((rect) => [rect.y, rect.y + rect.height]),
  ]);
  const points: NavigationRoutePoint[] = [];
  const pointIndex = new Map<string, number>();
  const addPoint = (point: NavigationRoutePoint) => {
    const key = `${point.x}:${point.y}`;
    if (
      pointIndex.has(key) ||
      obstacles.some((rect) => isPointInsideRect(point, rect))
    )
      return;
    pointIndex.set(key, points.length);
    points.push(point);
  };
  for (const x of xs) for (const y of ys) addPoint({ x, y });
  const sourceIndex = pointIndex.get(`${source.x}:${source.y}`);
  const targetIndex = pointIndex.get(`${target.x}:${target.y}`);
  if (sourceIndex === undefined || targetIndex === undefined)
    return fallbackOrthogonalRoute(source, target);

  const neighbors: Array<Array<{ index: number; distance: number }>> =
    points.map(() => []);
  const rows = new Map<number, Array<{ index: number; value: number }>>();
  const columns = new Map<number, Array<{ index: number; value: number }>>();
  points.forEach((point, index) => {
    rows.set(point.y, [
      ...(rows.get(point.y) ?? []),
      { index, value: point.x },
    ]);
    columns.set(point.x, [
      ...(columns.get(point.x) ?? []),
      { index, value: point.y },
    ]);
  });
  for (const axis of [rows, columns]) {
    for (const entries of axis.values()) {
      entries.sort((a, b) => a.value - b.value);
      for (let index = 1; index < entries.length; index += 1) {
        const left = points[entries[index - 1].index];
        const right = points[entries[index].index];
        if (!isSegmentClear(left, right, obstacles)) continue;
        const distance =
          Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
        neighbors[entries[index - 1].index].push({
          index: entries[index].index,
          distance,
        });
        neighbors[entries[index].index].push({
          index: entries[index - 1].index,
          distance,
        });
      }
    }
  }

  const distances = points.map(() => Number.POSITIVE_INFINITY);
  const previous = points.map(() => -1);
  const queue: Array<{ index: number; distance: number }> = [
    { index: sourceIndex, distance: 0 },
  ];
  distances[sourceIndex] = 0;
  while (queue.length > 0) {
    queue.sort(
      (left, right) =>
        left.distance - right.distance || left.index - right.index,
    );
    const current = queue.shift();
    if (!current || current.distance !== distances[current.index]) continue;
    if (current.index === targetIndex) break;
    for (const neighbor of neighbors[current.index]) {
      const distance = current.distance + neighbor.distance;
      if (distance >= distances[neighbor.index]) continue;
      distances[neighbor.index] = distance;
      previous[neighbor.index] = current.index;
      queue.push({ index: neighbor.index, distance });
    }
  }
  if (!Number.isFinite(distances[targetIndex]))
    return fallbackOrthogonalRoute(source, target);
  const route: NavigationRoutePoint[] = [];
  for (let cursor = targetIndex; cursor >= 0; cursor = previous[cursor]) {
    route.push(points[cursor]);
    if (cursor === sourceIndex) break;
  }
  return simplifyRoute(route.reverse());
}

/** Converts an orthogonal route to a rounded-corner SVG path. */
export function toRoundedNavigationPath(
  points: NavigationRoutePoint[],
  radius = 18,
) {
  if (points.length < 2) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const next = points[index + 1];
    const beforeLength =
      Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
    const afterLength = Math.abs(next.x - point.x) + Math.abs(next.y - point.y);
    const cornerRadius = Math.min(radius, beforeLength / 2, afterLength / 2);
    const before = {
      x:
        point.x +
        (previous.x > point.x
          ? cornerRadius
          : previous.x < point.x
            ? -cornerRadius
            : 0),
      y:
        point.y +
        (previous.y > point.y
          ? cornerRadius
          : previous.y < point.y
            ? -cornerRadius
            : 0),
    };
    const after = {
      x:
        point.x +
        (next.x > point.x
          ? cornerRadius
          : next.x < point.x
            ? -cornerRadius
            : 0),
      y:
        point.y +
        (next.y > point.y
          ? cornerRadius
          : next.y < point.y
            ? -cornerRadius
            : 0),
    };
    path += ` L ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}
