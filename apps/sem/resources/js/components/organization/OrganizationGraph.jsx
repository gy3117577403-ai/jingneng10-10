import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import ReactFlow from "reactflow";
import { animate, useReducedMotion } from "motion/react";
import {
    branchGeometry,
    branchPaths,
    frameChart,
    interpolateChart,
    NODE_WIDTH,
    revealNode,
} from "./chartGeometry";

function SharedBranch({ data }) {
    const b = data.branch,
        paths = branchPaths(b);
    return (
        <g
            className="org-shared-branch"
            opacity={b.opacity ?? 1}
            data-source={b.source}
        >
            <path d={paths.trunk} className="org-branch-line" />
            {paths.arms.map((t) => (
                <path
                    key={t.id}
                    d={t.path}
                    opacity={t.opacity}
                    data-target={t.id}
                    className="org-branch-line"
                />
            ))}
            {paths.active && (
                <path d={paths.active} className="org-branch-line active" />
            )}
        </g>
    );
}
const edgeTypes = { shared: SharedBranch };

export default function OrganizationGraph({
    graph,
    nodeTypes,
    flow,
    onZoom,
    focusId,
    profileOpen,
}) {
    const reduced = useReducedMotion(),
        container = useRef(null),
        latest = useRef(graph),
        target = useRef(graph),
        previousRoot = useRef(graph.rootId),
        focus = useRef(focusId);
    const [frame, setFrame] = useState(graph);
    useEffect(() => {
        target.current = graph;
        focus.current = focusId;
    }, [graph, focusId]);
    useEffect(() => {
        const from = latest.current,
            scopeChanged = previousRoot.current !== graph.rootId;
        previousRoot.current = graph.rootId;
        const same =
            from.nodes.length === graph.nodes.length &&
            graph.nodes.every((n, i) => {
                const p = from.nodes[i];
                return (
                    p.id === n.id &&
                    p.position.x === n.position.x &&
                    p.position.y === n.position.y &&
                    (p.opacity ?? 1) === 1
                );
            });
        if (reduced || scopeChanged || same) {
            latest.current = graph;
            setFrame(graph);
            return;
        }
        const animation = animate(0, 1, {
            duration: 0.32,
            ease: [0.22, 1, 0.36, 1],
            onUpdate: (t) => {
                const next = interpolateChart(from, graph, t);
                latest.current = next;
                setFrame(next);
            },
        });
        return () => animation.stop();
    }, [graph, reduced]);
    const canvasFrame = useCallback(() => {
        const element = container.current;
        if (!element) return null;
        const rect = element.getBoundingClientRect(),
            panel = document.querySelector(".org-profile");
        const panelWidth = panel?.getBoundingClientRect().width || 0;
        // Docked layouts reserve margin in CSS. Narrow layouts retain a real
        // overlay; its final width, not its moving entrance, defines the inset.
        const docked = element.closest('.org-canvas-wrap') &&
            parseFloat(getComputedStyle(element.closest('.org-canvas-wrap')).marginRight) >= panelWidth;
        const overlay = panel && !docked ? panelWidth + 16 : 0;
        return {
            width: Math.max(0, rect.width - overlay),
            height: rect.height,
        };
    }, []);
    const fit = useCallback(
        (minimum = 0.25) => {
            const area = canvasFrame();
            if (!area || area.width < 240 || !flow.current?.setViewport) return;
            flow.current.setViewport(
                frameChart(target.current.nodes, area, focus.current, minimum, target.current.branches),
                // Start in a readable composition. Only an explicit fit action
                // animates the viewport; expansion animates the graph itself.
                { duration: reduced || minimum > 0.25 ? 0 : 280 },
            );
        },
        [canvasFrame, flow, reduced],
    );
    useEffect(() => {
        const timer = requestAnimationFrame(() => fit(1));
        return () => cancelAnimationFrame(timer);
    }, [graph.rootId, fit]);
    useEffect(() => {
        let scheduled = 0;
        const reveal = () => {
            cancelAnimationFrame(scheduled);
            scheduled = requestAnimationFrame(() => {
                const area = canvasFrame(),
                    instance = flow.current,
                    node = target.current.nodes.find(
                        (n) => n.id === focus.current,
                    );
                if (
                    !area ||
                    area.width < 240 ||
                    !instance?.getViewport ||
                    !node
                )
                    return;
                const current = instance.getViewport(),
                    next = revealNode(node, area, current);
                if (current.x !== next.x || current.y !== next.y)
                    instance.setViewport(next, { duration: reduced ? 0 : 220 });
            });
        };
        reveal();
        const observer = new ResizeObserver(reveal);
        if (container.current) observer.observe(container.current);
        return () => {
            cancelAnimationFrame(scheduled);
            observer.disconnect();
        };
    }, [focusId, profileOpen, canvasFrame, flow, reduced]);
    const nodes = useMemo(
        () =>
            frame.nodes.map((n) => ({
                ...n,
                draggable: false,
                focusable: false,
                className: "nopan",
                style: {
                    width: NODE_WIDTH,
                    height: n.height,
                    pointerEvents: n.leaving ? "none" : "all",
                    opacity: n.opacity ?? 1,
                },
                width: NODE_WIDTH,
                height: n.height,
            })),
        [frame],
    );
    const edges = useMemo(
        () =>
            frame.branches
                .map((b) => {
                    const branch = branchGeometry(b, frame.nodes);
                    return branch
                        ? {
                              id: b.id,
                              source: b.source,
                              target: branch.targets[0].id,
                              type: "shared",
                              focusable: false,
                              selectable: false,
                              data: { branch },
                          }
                        : null;
                })
                .filter(Boolean),
        [frame],
    );
    return (
        <div className="org-graph" ref={container} aria-label="组织架构画布">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onInit={(instance) => {
                    flow.current = instance;
                    instance.fitOrganization = () => fit();
                    instance.readOrganization = () => fit(1);
                    requestAnimationFrame(() => fit(1));
                }}
                onMove={(_, v) => onZoom(v.zoom)}
                minZoom={0.25}
                maxZoom={1.5}
                nodesDraggable={false}
                nodesConnectable={false}
                edgesFocusable={false}
                elementsSelectable={false}
                zoomOnDoubleClick={false}
                panOnScroll
                proOptions={{ hideAttribution: true }}
            />
        </div>
    );
}
