import {
    arrangeTree,
    UNIT_HEIGHT,
    PERSON_HEIGHT,
    MORE_HEIGHT,
} from "./chartGeometry";
export const byId = (rows, id) => rows.find((x) => Number(x.id) === Number(id));
export function ancestors(units, id) {
    const result = [],
        seen = new Set();
    let row = byId(units, id);
    while (row && !seen.has(row.id)) {
        seen.add(row.id);
        result.unshift(row);
        row = byId(units, row.parent_id);
    }
    return result;
}
export const within = (units, id, root) =>
    !root || ancestors(units, id).some((x) => Number(x.id) === Number(root));
export const assignment = (p) =>
    p.assignments.find((a) => a.primary) || p.assignments[0];
export const positionName = (p, positions) =>
    p?.title || byId(positions, p?.position_id)?.name || "岗位待补充";
export const unitPath = (units, id) =>
    ancestors(units, id)
        .map((x) => x.name)
        .join(" / ");
export function chartLayout(
    units,
    people,
    selected,
    expanded,
    showPeople,
    compact = false,
) {
    const path = ancestors(units, selected),
        root =
            path[
                Math.max(0, path.length - (compact === 2 ? 1 : compact ? 2 : 3))
            ] ||
            units.find((u) => !u.parent_id) ||
            units[0];
    if (!root) return { nodes: [], branches: [], edges: [], rootId: null };
    const pathIds = new Set(path.map((x) => x.id));
    function branch(u, depth, seen = new Set()) {
        const visited = new Set([...seen, u.id]);
        const children = units
            .filter(
                (x) =>
                    Number(x.parent_id) === Number(u.id) && !visited.has(x.id),
            )
            .sort((a, b) => a.sort - b.sort || a.id - b.id);
        const open =
            !expanded.has(-u.id) &&
            (expanded.has(u.id) || pathIds.has(u.id) || depth === 0);
        const allMembers = people.filter((p) =>
            p.assignments.some((a) => Number(a.unit_id) === Number(u.id)),
        );
        const descendants = open
            ? children.map((x) => branch(x, depth + 1, visited))
            : [];
        if (showPeople && open) {
            descendants.push(
                ...allMembers
                    .slice(0, 6)
                    .map((p) => ({
                        id: "p" + p.id + "u" + u.id,
                        type: "person",
                        height: PERSON_HEIGHT,
                        data: { person: p, unit: u },
                        children: [],
                    })),
            );
            if (allMembers.length > 6)
                descendants.push({
                    id: "more" + u.id,
                    type: "more",
                    height: MORE_HEIGHT,
                    data: { unit: u, count: allMembers.length },
                    children: [],
                });
        }
        return {
            id: "u" + u.id,
            type: "unit",
            height: UNIT_HEIGHT,
            data: {
                unit: u,
                hasChildren:
                    children.length > 0 ||
                    (showPeople && allMembers.length > 0),
                open,
                selected: Number(u.id) === Number(selected),
                active: pathIds.has(u.id),
            },
            children: descendants,
        };
    }
    const graph = arrangeTree(branch(root, 0));
    return {
        ...graph,
        edges: graph.branches.map((b) => ({
            id: b.id,
            source: b.source,
            target: b.targets[0].id,
            type: "shared",
        })),
    };
}
