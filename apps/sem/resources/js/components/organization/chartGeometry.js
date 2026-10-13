export const NODE_WIDTH = 212,
    UNIT_HEIGHT = 80,
    PERSON_HEIGHT = 60,
    MORE_HEIGHT = 44,
    COLUMN_GAP = 48,
    ROW_GAP = 20;

// A contour per depth packs only columns occupied by both sibling branches.
export function arrangeTree(root) {
    function arrange(item) {
        const children = item.children.map(arrange),
            contour = [];
        const offsets = children.map((child) => {
            let offset = 0;
            child.contour.forEach((range, depth) => {
                if (contour[depth])
                    offset = Math.max(
                        offset,
                        contour[depth].bottom + ROW_GAP - range.top,
                    );
            });
            child.contour.forEach((range, depth) => {
                const top = range.top + offset,
                    bottom = range.bottom + offset;
                contour[depth] = contour[depth]
                    ? {
                          top: Math.min(contour[depth].top, top),
                          bottom: Math.max(contour[depth].bottom, bottom),
                      }
                    : { top, bottom };
            });
            return offset;
        });
        const center = offsets.length ? (offsets[0] + offsets.at(-1)) / 2 : 0;
        return {
            item,
            children,
            offsets: offsets.map((y) => y - center),
            contour: [
                { top: -item.height / 2, bottom: item.height / 2 },
                ...contour.map((c) => ({
                    top: c.top - center,
                    bottom: c.bottom - center,
                })),
            ],
        };
    }
    const nodes = [],
        branches = [];
    function place(a, depth, center) {
        const { item } = a,
            node = {
                id: item.id,
                type: item.type,
                position: {
                    x: depth * (NODE_WIDTH + COLUMN_GAP),
                    y: center - item.height / 2,
                },
                width: NODE_WIDTH,
                height: item.height,
                data: item.data,
            };
        nodes.push(node);
        const children = a.children.map((c, i) =>
            place(c, depth + 1, center + a.offsets[i]),
        );
        if (children.length)
            branches.push({
                id: "branch:" + item.id,
                source: item.id,
                targets: children.map((c) => ({
                    id: c.id,
                    active: !!c.data.active,
                })),
            });
        return node;
    }
    place(arrange(root), 0, 0);
    const top = Math.min(...nodes.map((n) => n.position.y));
    nodes.forEach((n) => {
        n.position.y -= top;
    });
    return { nodes, branches, rootId: root.id };
}

export function branchGeometry(branch, nodes) {
    const lookup = new Map(nodes.map((n) => [n.id, n])),
        source = lookup.get(branch.source);
    if (!source) return null;
    const targets = branch.targets
        .map((t) => {
            const node = lookup.get(t.id);
            return node
                ? {
                      ...t,
                      x: node.position.x,
                      y: node.position.y + node.height / 2,
                      opacity: node.opacity ?? 1,
                  }
                : null;
        })
        .filter(Boolean);
    if (!targets.length) return null;
    const start = {
        x: source.position.x + NODE_WIDTH,
        y: source.position.y + source.height / 2,
    };
    return {
        ...branch,
        start,
        targets,
        trunkX: (start.x + Math.min(...targets.map((t) => t.x))) / 2,
    };
}

export function branchPaths(branch) {
    const { start, trunkX, targets } = branch,
        ys = [start.y, ...targets.map((t) => t.y)];
    return {
        trunk: `M ${start.x} ${start.y} H ${trunkX} M ${trunkX} ${Math.min(...ys)} V ${Math.max(...ys)}`,
        arms: targets.map((t) => ({
            ...t,
            path: `M ${trunkX} ${t.y} H ${t.x}`,
        })),
        active: targets
            .filter((t) => t.active)
            .map((t) => `M ${start.x} ${start.y} H ${trunkX} V ${t.y} H ${t.x}`)
            .join(" "),
    };
}

// Cards and connectors consume this same interruptible animation frame.
export function interpolateChart(from, to, progress) {
    const t = Math.max(0, Math.min(1, progress));
    if (t === 1) return to;
    const old = new Map(from.nodes.map((n) => [n.id, n])),
        next = new Map(to.nodes.map((n) => [n.id, n]));
    const parents = new Map();
    for (const b of [...from.branches, ...to.branches])
        for (const target of b.targets) parents.set(target.id, b.source);
    function folded(node, lookup) {
        const p =
            lookup.get(parents.get(node.id)) ||
            next.get(parents.get(node.id)) ||
            old.get(parents.get(node.id));
        return {
            ...node,
            opacity: 0,
            position: p
                ? {
                      x: p.position.x + NODE_WIDTH + 12,
                      y: p.position.y + (p.height - node.height) / 2,
                  }
                : node.position,
        };
    }
    const mix = (a, b) => a + (b - a) * t;
    const nodes = [...new Set([...old.keys(), ...next.keys()])].map((id) => {
        const a = old.get(id),
            b = next.get(id),
            start = a || folded(b, old),
            end = b || folded(a, next);
        return {
            ...end,
            leaving: !b,
            opacity: mix(start.opacity ?? 1, end.opacity ?? 1),
            position: {
                x: mix(start.position.x, end.position.x),
                y: mix(start.position.y, end.position.y),
            },
        };
    });
    const oldBranches = new Map(from.branches.map((b) => [b.id, b])),
        nextBranches = new Map(to.branches.map((b) => [b.id, b]));
    const branches = [
        ...new Set([...oldBranches.keys(), ...nextBranches.keys()]),
    ].map((id) => {
        const a = oldBranches.get(id),
            b = nextBranches.get(id);
        return {
            ...(b || a),
            opacity: mix(a?.opacity ?? (a ? 1 : 0), b ? 1 : 0),
            targets: [
                ...new Map(
                    [...(a?.targets || []), ...(b?.targets || [])].map((p) => [
                        p.id,
                        p,
                    ]),
                ).values(),
            ],
        };
    });
    return { ...to, nodes, branches };
}

export function revealNode(node, frame, view) {
    const left = node.position.x * view.zoom + view.x,
        right = left + NODE_WIDTH * view.zoom,
        top = node.position.y * view.zoom + view.y,
        bottom = top + node.height * view.zoom;
    return {
        ...view,
        x:
            view.x +
            (right > frame.width - 28
                ? frame.width - 28 - right
                : left < 28
                  ? 28 - left
                  : 0),
        y:
            view.y +
            (bottom > frame.height - 64
                ? frame.height - 64 - bottom
                : top < 28
                  ? 28 - top
                  : 0),
    };
}
export function frameChart(nodes, frame, focusId, minimumZoom = 0.25, branches = []) {
    if (!nodes.length) return { x: 28, y: 28, zoom: 1 };
    let composition = nodes;
    const focus = nodes.find((n) => n.id === focusId);
    const fullWidth = Math.max(...nodes.map(n => n.position.x + NODE_WIDTH)) - Math.min(...nodes.map(n => n.position.x));
    // At readable size, frame the selected unit with its parent and children.
    // All ancestors remain on the canvas and in the breadcrumb, reachable by pan.
    if (minimumZoom === 1 && focus && fullWidth > frame.width - 56) {
        const parent = branches.find(b => b.targets.some(t => t.id === focusId));
        const children = branches.find(b => b.source === focusId);
        const ids = new Set([focusId, parent?.source, ...(children?.targets.map(t => t.id) || [])]);
        composition = nodes.filter(n => ids.has(n.id));
        const localWidth = Math.max(...composition.map(n => n.position.x + NODE_WIDTH)) - Math.min(...composition.map(n => n.position.x));
        if (localWidth > frame.width - 56) composition = composition.filter(n => n.id !== parent?.source);
    }
    // Retain the vertical extent of every node in the visible columns, including
    // siblings of the selected unit, so framing does not cut through their cards.
    const columns = new Set(composition.map(n => n.position.x));
    const visible = nodes.filter(n => columns.has(n.position.x));
    const x = Math.min(...composition.map((n) => n.position.x)),
        y = Math.min(...visible.map((n) => n.position.y));
    const w = Math.max(...composition.map((n) => n.position.x + NODE_WIDTH)) - x,
        h = Math.max(...visible.map((n) => n.position.y + n.height)) - y;
    const width = Math.max(1, frame.width - 56),
        height = Math.max(1, frame.height - 92);
    const zoom = Math.min(
        1,
        Math.max(minimumZoom, Math.min(width / w, height / h)),
    );
    const view = {
        x: (composition === nodes ? (frame.width - w * zoom) / 2 : 28) - x * zoom,
        y: 28 + (height - h * zoom) * 0.42 - y * zoom,
        zoom,
    };
    return minimumZoom > 0.25 && focus ? revealNode(focus, frame, view) : view;
}
