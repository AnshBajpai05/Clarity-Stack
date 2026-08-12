/**
 * DiagramCanvas.jsx
 *
 * Professional canvas engine with:
 *  - Mouse-wheel zoom (toward cursor)
 *  - Blank-drag pan
 *  - JointJS CommandManager (undo / redo)
 *  - Dark mode (paper background + grid color)
 *  - Snap-to-grid toggle
 *  - Fit-content + zoom-in/out via ref
 *  - Connect handles, Remove button, double-click label edit, keyboard delete
 */

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as joint from 'jointjs';
import dagre from 'dagre';
import graphlib from 'graphlib';
import 'jointjs/dist/joint.css';
import { SHAPE_MAP, DEFAULT_SIZES, CELL_NAMESPACE } from '../joint-logic/customShapes';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const getLabel = (cell) => {
    const attrs = cell.attrs;
    if (!attrs) return '';
    if (attrs.label && attrs.label.text != null) return attrs.label.text;
    if (attrs.body  && attrs.body.text  != null) return attrs.body.text;
    return '';
};

const isLinkType = (type) => type ? type.toLowerCase().includes('link') : false;

/* ── Dark / Light theme color maps ────────────────────────────────────── */
const THEME = {
    dark: {
        'uml.Actor':          { 'head/fill':'#1c2033','head/stroke':'#818cf8','torso/stroke':'#818cf8','arms/stroke':'#818cf8','leftLeg/stroke':'#818cf8','rightLeg/stroke':'#818cf8','label/fill':'#c7d2fe' },
        'uml.UseCase':        { 'body/fill':'#1e2040','body/stroke':'#818cf8','label/fill':'#c7d2fe' },
        'uml.SystemBoundary': { 'body/fill':'rgba(129,140,248,0.05)','body/stroke':'#818cf8','label/fill':'#818cf8' },
        'uml.StartNode':      { 'body/fill':'#34d399','body/stroke':'#34d399' },
        'uml.EndState':       { 'body/fill':'#11141f','body/stroke':'#34d399','inner/fill':'#34d399' },
        'uml.ActionState':    { 'body/fill':'rgba(52,211,153,0.1)','body/stroke':'#34d399','label/fill':'#6ee7b7' },
        'uml.DecisionNode':   { 'body/fill':'rgba(251,191,36,0.1)','body/stroke':'#fbbf24','label/fill':'#fde68a' },
        'dfd.Process':        { 'body/fill':'rgba(251,191,36,0.08)','body/stroke':'#fbbf24','label/fill':'#fde68a' },
        'dfd.DataStore':      { 'body/fill':'#1c2033','topLine/fill':'#fbbf24','bottomLine/fill':'#fbbf24','label/fill':'#fde68a' },
        'dfd.ExternalEntity': { 'body/fill':'#1c2033','body/stroke':'#fbbf24','label/fill':'#fde68a' },
        'standard.Rectangle': { 'body/fill':'#1e2040','body/stroke':'#818cf8','label/fill':'#c7d2fe' },
    },
    light: {
        'uml.Actor':          { 'head/fill':'white','head/stroke':'#1e293b','torso/stroke':'#1e293b','arms/stroke':'#1e293b','leftLeg/stroke':'#1e293b','rightLeg/stroke':'#1e293b','label/fill':'#1e293b' },
        'uml.UseCase':        { 'body/fill':'#e8f4fd','body/stroke':'#2563eb','label/fill':'#1e3a5f' },
        'uml.SystemBoundary': { 'body/fill':'rgba(219,234,254,0.12)','body/stroke':'#1d4ed8','label/fill':'#1d4ed8' },
        'uml.StartNode':      { 'body/fill':'#111827','body/stroke':'#111827' },
        'uml.EndState':       { 'body/fill':'white','body/stroke':'#111827','inner/fill':'#111827' },
        'uml.ActionState':    { 'body/fill':'#f0fdf4','body/stroke':'#16a34a','label/fill':'#14532d' },
        'uml.DecisionNode':   { 'body/fill':'#fffbeb','body/stroke':'#d97706','label/fill':'#92400e' },
        'dfd.Process':        { 'body/fill':'#fefce8','body/stroke':'#ca8a04','label/fill':'#713f12' },
        'dfd.DataStore':      { 'body/fill':'#f9fafb','topLine/fill':'#374151','bottomLine/fill':'#374151','label/fill':'#1f2937' },
        'dfd.ExternalEntity': { 'body/fill':'#f1f5f9','body/stroke':'#475569','label/fill':'#1e293b' },
        'standard.Rectangle': { 'body/fill':'#dbeafe','body/stroke':'#2563eb','label/fill':'#1e3a5f' },
    },
};

const applyTheme = function(cell, isDark) {
    var type = cell.get('type');
    var colors = isDark ? THEME.dark[type] : THEME.light[type];
    if (!colors) return;
    Object.keys(colors).forEach(function(path) { cell.attr(path, colors[path]); });
};

/* ── Shape factory ────────────────────────────────────────────────────────── */

const buildElement = (cell) => {
    const label   = getLabel(cell);
    const pos     = cell.position || { x: 80, y: 80 };
    const defSize = DEFAULT_SIZES[cell.type] || { width: 160, height: 60 };
    var size    = JSON.parse(JSON.stringify(cell.size || defSize));
    
    // Dynamically expand ovals and boxes if label is long
    var textLen = (label || '').length;
    if (textLen > 0) {
        var charW = 8.5;
        var pad = cell.type === 'uml.UseCase' ? 70 : 30;
        var estimatedWidth = Math.max(size.width, textLen * charW + pad);
        size.width = Math.round(estimatedWidth);
    }

    const base    = { id: cell.id, position: pos, size };

    const ShapeClass = SHAPE_MAP[cell.type];

    console.log(`[DiagramCanvas] buildElement type="${cell.type}" foundClass=${!!ShapeClass}`);

    if (!ShapeClass) {
        console.warn('[DiagramCanvas] Unknown type "' + cell.type + '" — using fallback');
        return new joint.shapes.standard.Rectangle({
            ...base,
            attrs: {
                body:  { fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2, rx: 8, ry: 8 },
                label: { text: label || cell.type, fill: '#1e3a5f', fontSize: 13, fontWeight: 'bold' },
            },
        });
    }

    try {
        const noLabel = cell.type === 'uml.StartNode' || cell.type === 'uml.EndState';
        return new ShapeClass({
            ...base,
            ...(noLabel ? {} : { attrs: { label: { text: label || cell.type.split('.')[1] } } }),
        });
    } catch (err) {
        console.warn('[DiagramCanvas] Error building "' + cell.type + '": ' + err.message);
        return new joint.shapes.standard.Rectangle({
            ...base,
            attrs: {
                body:  { fill: '#fee2e2', stroke: '#ef4444', strokeWidth: 2, rx: 4, ry: 4 },
                label: { text: label || cell.type, fill: '#7f1d1d', fontSize: 12 },
            },
        });
    }
};

/* ── Link factory ─────────────────────────────────────────────────────────── */

/* Every link-creation path funnels through here. Previously each path set — or
   forgot to set — its own router: the toolbox arrows inherited the paper's
   manhattan default, the import path picked a router per diagram domain, and
   drawConnection/addEdge used normal+smooth. So the "same" arrow bent
   differently depending on whether it was spawned from the toolbox or read
   back from a file.

   'normal' routes the path as exactly source → vertices → target and nothing
   else, so a segment the user drags STAYS where they put it. 'manhattan'
   re-solves the whole path on every endpoint move and forces 90° corners —
   that is why straight arrows elbowed themselves when repositioned. */
const applyLinkRouting = (link, curved) => {
    link.router('normal');
    link.connector(curved ? 'smooth' : 'normal');
    return link;
};

/* ── Tool builders ────────────────────────────────────────────────────────── */

const ResizeTool = joint.elementTools.Control.extend({
    getPosition: function(view) {
        var model = view.model;
        var size = model.get('size') || { width: 100, height: 100 };
        return { x: size.width, y: size.height };
    },
    setPosition: function(view, coordinates) {
        var model = view.model;
        var minWidth = 30;
        var minHeight = 20;
        var newWidth = Math.max(minWidth, Math.round(coordinates.x / 10) * 10);
        var newHeight = Math.max(minHeight, Math.round(coordinates.y / 10) * 10);
        model.resize(newWidth, newHeight, { ui: true });
    }
});

const makeElementTools = (elementView) => {
    const type      = elementView.model.get('type');
    const isBound   = type === 'uml.SystemBoundary';
    const isSmall   = type === 'uml.StartNode' || type === 'uml.EndState';

    const tools = [
        new joint.elementTools.Boundary({
            padding: 5, useModelGeometry: true, rotate: true,
            attributes: {
                stroke: '#3b82f6', 'stroke-width': 1.5,
                fill: 'rgba(59,130,246,0.04)', 'stroke-dasharray': '5,4',
            },
        }),
        new joint.elementTools.Remove({ x: '100%', y: '0%', offset: { x: 6, y: -6 }, rotate: true }),
        new ResizeTool({
            handleAttributes: {
                'r': 6,
                'fill': '#2563eb',
                'stroke': '#ffffff',
                'stroke-width': 1.5,
                'cursor': 'nwse-resize'
            }
        }),
    ];

    if (!isBound && joint.elementTools.Connect) {
        if (isSmall) {
            tools.push(new joint.elementTools.Connect({ x: '100%', y: '50%', offset: { x: 14, y: 0 }, rotate: false }));
        } else {
            var pts = [
                { x: '50%',  y: '0%',   offset: { x: 0,   y: -16 } },
                { x: '100%', y: '50%',  offset: { x: 16,  y: 0   } },
                { x: '50%',  y: '100%', offset: { x: 0,   y: 16  } },
                { x: '0%',   y: '50%',  offset: { x: -16, y: 0   } },
            ];
            for (var i = 0; i < pts.length; i++) {
                tools.push(new joint.elementTools.Connect({ x: pts[i].x, y: pts[i].y, offset: pts[i].offset, rotate: false }));
            }
        }
    }

    return new joint.dia.ToolsView({ name: 'hover-tools', tools: tools });
};

const makeLinkTools = () =>
    new joint.dia.ToolsView({
        name: 'link-tools',
        tools: [
            // Segments is what makes a link bendable: it puts a discrete handle at
            // each segment midpoint, and dragging one inserts a vertex there. It is
            // used INSTEAD of Vertices' own vertexAdding because that option lays an
            // invisible full-path hit band over the line which swallows every click,
            // so link:pointerdown never fires and the edge Properties panel can never
            // open. Discrete handles bend the line without stealing the whole path.
            new joint.linkTools.Segments({
                snapRadius: 0,              // free placement, no grid snapping
                redundancyRemoval: false,   // keep collinear vertices the user placed
                segmentLengthThreshold: 40, // hide handles on segments too short to grab
            }),
            // vertexAdding:false — see above. Existing vertices stay draggable, and
            // double-clicking one removes it.
            new joint.linkTools.Vertices({ snapRadius: 0, vertexAdding: false }),
            new joint.linkTools.SourceArrowhead(),
            new joint.linkTools.TargetArrowhead(),
            // 25% — at 50% the ✕ sat exactly on the label midpoint, so "select the
            // edge" clicks deleted it instead.
            new joint.linkTools.Remove({ distance: '25%' }),
        ],
    });

/* ═══════════════════════════════════════════════════════════════════════════
   DiagramCanvas component
═══════════════════════════════════════════════════════════════════════════ */
const DiagramCanvas = forwardRef(function DiagramCanvas({ data, darkMode, snapGrid, onZoomChange, onSelectionChange, onPositionUpdate, onHoverNode, onCellAdded, onCellRemoved }, ref) {
    const wrapperRef  = useRef(null);
    const paperRef    = useRef(null);
    const graphRef    = useRef(null);
    const cmdMgrRef   = useRef(null);
    const selectedRef = useRef(null);
    const panningRef  = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const panTransRef = useRef({ tx: 0, ty: 0 });
    const positionStore = useRef({}); // Track placed nodes for instructions

    /* ── 1. Mount: create Paper + Graph ──────────────────────────────────── */
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const mountEl = document.createElement('div');
        mountEl.style.width  = '100%';
        mountEl.style.height = '100%';
        wrapper.appendChild(mountEl);

        const W = wrapper.offsetWidth  || 900;
        const H = wrapper.offsetHeight || 600;

        const graph = new joint.dia.Graph({}, { cellNamespace: CELL_NAMESPACE });

        /* ── Snapshot-based undo / redo history ─────────────────────────── */
        var history     = [];      // array of JSON snapshots
        var historyIdx  = -1;      // pointer into history
        var ignoreChange = false;  // prevent recursive saves during restore

        var saveSnapshot = function() {
            if (ignoreChange) return;
            // Discard any "future" states beyond current pointer
            history.splice(historyIdx + 1);
            history.push(graph.toJSON());
            if (history.length > 60) { history.shift(); } // cap at 60 states
            historyIdx = history.length - 1;
        };

        // Save initial empty state
        history.push(graph.toJSON());
        historyIdx = 0;

        const paper = new joint.dia.Paper({
            el:                mountEl,
            model:             graph,
            width:             W,
            height:            H,
            gridSize:          20,
            drawGrid:          { name: 'dot', args: { color: '#c5c9d6', radius: 1.5 } },
            background:        { color: '#f9fafb' },
            interactive:       true,
            cellViewNamespace: CELL_NAMESPACE,
            // Flexible by default. manhattan re-routes on every move and cannot be
            // hand-shaped, so it is no longer the fallback any link silently inherits.
            defaultRouter:     { name: 'normal' },
            defaultConnector:  { name: 'normal' },
            defaultLink: function() {
                return applyLinkRouting(new joint.shapes.standard.Link({
                    attrs: { line: { stroke: '#6366f1', strokeWidth: 2, targetMarker: { type: 'arrow', size: 10 } } },
                }), false);
            },
            defaultConnectionPoint: { name: 'boundary' },
            snapLinks:              { radius: 100 },
            linkPinning:            true,
            validateMagnet: function(_cv, magnet) {
                // Allow links to start from any element (body, hitArea, etc.)
                var tag = magnet.tagName.toLowerCase();
                return tag !== 'text';
            },
            validateConnection: function(vS, _mS, vT) {
                return !!vT && vS !== vT;
            },
        });

        /* ── Hover Highlights & Details ────────────────────────────────── */
        paper.on('cell:mouseenter', function(cellView) {
            var cell = cellView.model;
            if (cell.isLink()) return;
            
            // Apply Glow
            joint.highlighters.mask.add(cellView, 'body', 'node-glow', {
                padding: 3,
                attrs: {
                    'stroke': '#6366f1',
                    'stroke-width': 3,
                    'stroke-opacity': 0.6
                }
            });

            if (onHoverNode) {
                var desc = cell.get('fullDescription') || cell.attr('label/text') || '';
                onHoverNode(cell.id, desc);
            }
        });

        paper.on('cell:mouseleave', function(cellView) {
            joint.highlighters.mask.remove(cellView, 'node-glow');
            if (onHoverNode) onHoverNode(null, null);
        });


        /* ── Mouse-wheel zoom toward cursor ─────────────────────────────── */
        var onWheel = function(evt) {
            evt.preventDefault();
            var delta       = evt.deltaY > 0 ? -1 : 1;
            var currentScale = paper.scale().sx;
            var factor      = delta > 0 ? 1.12 : (1 / 1.12);
            var newScale    = Math.max(0.05, Math.min(5, currentScale * factor));

            // Convert mouse position to paper coords
            var t    = paper.translate();
            var rect = mountEl.getBoundingClientRect();
            var mx   = evt.clientX - rect.left;
            var my   = evt.clientY - rect.top;
            var px   = (mx - t.tx) / currentScale;
            var py   = (my - t.ty) / currentScale;

            // Translate so the point under the mouse stays fixed
            var newTx = mx - px * newScale;
            var newTy = my - py * newScale;

            paper.translate(newTx, newTy);
            paper.scale(newScale);

            if (onZoomChange) onZoomChange(Math.round(newScale * 100));
        };
        mountEl.addEventListener('wheel', onWheel, { passive: false });

        /* ── Pan: drag on blank canvas ──────────────────────────────────── */
        paper.on('blank:pointerdown', function(evt) {
            panningRef.current = true;
            var origEvt = evt.originalEvent || evt;
            panStartRef.current = { x: origEvt.clientX, y: origEvt.clientY };
            panTransRef.current = paper.translate();
            mountEl.style.cursor = 'grabbing';
        });

        /* Track history after element/link moves or attribute changes */
        graph.on('change:position change:size change:attrs add remove', function() {
            saveSnapshot();
        });

        var onMouseMove = function(evt) {
            if (!panningRef.current) return;
            var dx = evt.clientX - panStartRef.current.x;
            var dy = evt.clientY - panStartRef.current.y;
            paper.translate(panTransRef.current.tx + dx, panTransRef.current.ty + dy);
        };

        var onMouseUp = function() {
            if (panningRef.current) {
                panningRef.current = false;
                mountEl.style.cursor = '';
            }
        };

        wrapper.addEventListener('mousemove', onMouseMove);
        wrapper.addEventListener('mouseup',   onMouseUp);
        wrapper.addEventListener('mouseleave', onMouseUp);

        /* ── Hybrid Tools (Hover + Selection Lock) ───────────────────────── */
        paper.on('element:mouseenter', function(elementView) {
            elementView.addTools(makeElementTools(elementView));
        });
        paper.on('element:mouseleave', function(elementView) {
            // Only remove if NOT the currently selected element
            if (selectedRef.current !== elementView.model) {
                elementView.removeTools();
            }
        });

        paper.on('link:mouseenter', function(linkView) {
            linkView.addTools(makeLinkTools());
        });
        paper.on('link:mouseleave', function(linkView) {
            if (selectedRef.current !== linkView.model) {
                linkView.removeTools();
            }
        });

        paper.on('blank:pointerdown', function() {
            graph.getCells().forEach(cell => {
                const view = paper.findViewByModel(cell);
                if (view) view.removeTools();
            });
            selectedRef.current = null;
            if (onSelectionChange) onSelectionChange(null);
        });

        paper.on('cell:pointerdown', function(cellView) {
            selectedRef.current = cellView.model;
            // Ensure tools are visible for the selected cell
            if (cellView.model.isLink()) {
                cellView.addTools(makeLinkTools());
            } else {
                cellView.addTools(makeElementTools(cellView));
            }
        });

        graph.on('remove', function(cell) {
            // Drop the cell from the position store, or the next position
            // broadcast resurrects the deleted id in Dashboard's placedNodeIds
            // (which is rebuilt from the store's keys) and the sidebar card
            // never becomes available to place again.
            delete positionStore.current[cell.id];
            if (onPositionUpdate) onPositionUpdate({ ...positionStore.current });
            if (onCellRemoved) onCellRemoved(cell.id);
        });

        graph.on('add', function(cell) {
            if (onCellAdded) onCellAdded(cell.id, cell.isLink() ? 'link' : 'element');
        });

        /* ── Selection tracking ─────────────────────────────────────────── */
        paper.on('element:pointerdown', function(cv) {
            selectedRef.current = cv.model;
            if (onSelectionChange) {
                var sz = cv.model.get('size');
                var ps = cv.model.get('position');
                var lbl = cv.model.attr('label/text') || cv.model.get('type').split('.')[1] || '';
                onSelectionChange({ id: cv.model.id, type: cv.model.get('type'), width: sz.width, height: sz.height, x: ps.x, y: ps.y, label: lbl });
            }
        });

        /* Keep the Properties panel live: selection info was only emitted on
           pointerdown, so programmatic moves/resizes (Auto-Align, drag, resize
           tool) left the panel showing stale x/y/width/height. */
        graph.on('change:position change:size', function(cell) {
            if (cell !== selectedRef.current || !onSelectionChange) return;
            if (cell.isLink && cell.isLink()) return;
            var sz = cell.get('size');
            var ps = cell.get('position');
            var lbl = cell.attr('label/text') || cell.get('type').split('.')[1] || '';
            onSelectionChange({ id: cell.id, type: cell.get('type'), width: sz.width, height: sz.height, x: ps.x, y: ps.y, label: lbl });
        });

        /* Real-time position tracking for HITL sidebars */
        const reportPositions = () => {
            if (!onPositionUpdate) return;
            const posMap = {};
            graph.getElements().forEach(el => {
                posMap[el.id] = el.position();
            });
            onPositionUpdate(posMap);
        };

        paper.on('element:pointermove', reportPositions);
        paper.on('element:pointerup', reportPositions);
        paper.on('link:pointerdown', function(lv) {
            selectedRef.current = lv.model;
            if (onSelectionChange) {
                var lbls = lv.model.labels() || [];
                var lbl = '';
                if (lbls[0] && lbls[0].attrs && lbls[0].attrs.text) lbl = lbls[0].attrs.text.text || '';
                onSelectionChange({ kind: 'link', id: lv.model.id, label: lbl });
            }
        });
        paper.on('blank:pointerdown', function() {
            selectedRef.current = null;
            if (onSelectionChange) onSelectionChange(null);
        });

        /* ── Double-click: edit label ────────────────────────────────────── */
        paper.on('cell:pointerdblclick', function(cv) {
            var model = cv.model;
            if (model.isLink()) {
                var lbl0 = model.label(0);
                var cur  = lbl0 && lbl0.attrs && lbl0.attrs.text ? (lbl0.attrs.text.text || '') : '';
                var next = window.prompt('Edit link label:', cur);
                if (next !== null) {
                    model.labels([{ position: 0.5, attrs: { text: { text: next, fontSize: 11 } } }]);
                }
                return;
            }
            if (model.attr('label/text') === undefined) return;
            var curLabel  = model.attr('label/text') || '';
            var nextLabel = window.prompt('Edit label:', curLabel);
            if (nextLabel !== null) model.attr('label/text', nextLabel);
        });

        /* ── Keyboard: Delete / Backspace ────────────────────────────────── */
        var onKeyDown = function(e) {
            var tag = document.activeElement ? document.activeElement.tagName : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current) {
                e.preventDefault();
                selectedRef.current.remove();
                selectedRef.current = null;
            }
            /* Ctrl+Z / Ctrl+Y shortcuts */
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (historyIdx > 0) {
                    historyIdx--;
                    ignoreChange = true;
                    graph.fromJSON(history[historyIdx]);
                    ignoreChange = false;
                }
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                if (historyIdx < history.length - 1) {
                    historyIdx++;
                    ignoreChange = true;
                    graph.fromJSON(history[historyIdx]);
                    ignoreChange = false;
                }
            }
        };
        document.addEventListener('keydown', onKeyDown);

        /* ── Responsive resize ──────────────────────────────────────────── */
        var resizeObs = new ResizeObserver(function(entries) {
            var entry = entries[0];
            if (!entry) return;
            var cr = entry.contentRect;
            paper.setDimensions(cr.width, cr.height);
        });
        resizeObs.observe(wrapper);

        graphRef.current  = graph;
        paperRef.current  = paper;
        cmdMgrRef.current = {
            undo: function() {
                if (historyIdx <= 0) return;
                historyIdx--;
                ignoreChange = true;
                graph.fromJSON(history[historyIdx]);
                ignoreChange = false;
            },
            redo: function() {
                if (historyIdx >= history.length - 1) return;
                historyIdx++;
                ignoreChange = true;
                graph.fromJSON(history[historyIdx]);
                ignoreChange = false;
            },
            clear: function() {
                // Reset history to just the current state
                history = [graph.toJSON()];
                historyIdx = 0;
            },
        };

        return function() {
            resizeObs.disconnect();
            paper.remove();
            document.removeEventListener('keydown', onKeyDown);
            mountEl.removeEventListener('wheel', onWheel);
            wrapper.removeEventListener('mousemove',  onMouseMove);
            wrapper.removeEventListener('mouseup',    onMouseUp);
            wrapper.removeEventListener('mouseleave', onMouseUp);
            if (wrapper.contains(mountEl)) wrapper.removeChild(mountEl);
            graphRef.current  = null;
            paperRef.current  = null;
            cmdMgrRef.current = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── 2. Dark mode updates (paper + all shapes + links) ────────────────── */
    useEffect(() => {
        var paper = paperRef.current;
        var graph = graphRef.current;
        if (!paper || !graph) return;
        paper.drawBackground({ color: darkMode ? '#0d0f17' : '#f9fafb' });
        paper.drawGrid({ name: 'dot', args: { color: darkMode ? '#2a2f45' : '#c5c9d6', radius: 1.5 } });
        graph.getElements().forEach(function(el) { applyTheme(el, darkMode); });
        graph.getLinks().forEach(function(lk) {
            lk.attr('line/stroke', darkMode ? '#555e7f' : '#6b7280');
        });
    }, [darkMode]);

    /* ── 3. Snap-to-grid toggle ──────────────────────────────────────────── */
    useEffect(() => {
        var paper = paperRef.current;
        if (!paper) return;
        paper.options.gridSize = snapGrid ? 10 : 1;
    }, [snapGrid]);

    /* ── 4. Render AI data ───────────────────────────────────────────────── */
    useEffect(() => {
        var graph = graphRef.current;
        var paper = paperRef.current;
        var cmd   = cmdMgrRef.current;
        if (!graph) return;

        graph.clear();
        selectedRef.current = null;

        if (!data || !Array.isArray(data.cells) || data.cells.length === 0) return;

        var shapes = data.cells.filter(function(c) { return !isLinkType(c.type); });
        var links  = data.cells.filter(function(c) { return  isLinkType(c.type); });

        var sorted = shapes.filter(function(c) { return c.type === 'uml.SystemBoundary'; })
                           .concat(shapes.filter(function(c) { return c.type !== 'uml.SystemBoundary'; }));

        // Deterministic client-side auto-layout engine
        var hasActor = sorted.some(function(s) { return s.type === 'uml.Actor'; });
        var hasDFD   = sorted.some(function(s) { return s.type.startsWith('dfd.'); });

        if (hasActor) {
            var actors    = sorted.filter(function(s) { return s.type === 'uml.Actor'; });
            var usecases  = sorted.filter(function(s) { return s.type === 'uml.UseCase'; });
            var boundary  = sorted.find(function(s) { return s.type === 'uml.SystemBoundary'; });

            // Find usecases that are targets of include/extend links
            var includeExtTargets = [];
            links.forEach(function(l) {
                var src = l.source.id;
                var tgt = l.target.id;
                var srcIsUc = usecases.some(function(u) { return u.id === src; });
                var tgtIsUc = usecases.some(function(u) { return u.id === tgt; });
                if (srcIsUc && tgtIsUc) {
                    if (!includeExtTargets.includes(tgt)) {
                        includeExtTargets.push(tgt);
                    }
                }
            });

            var ucY = 80;
            usecases.forEach(function(uc) {
                // Assign each Use Case its own distinct row
                if (includeExtTargets.includes(uc.id)) {
                    // Slide target use cases to the right in their assigned row
                    uc.position = { x: 540, y: ucY };
                } else {
                    // Position standard use cases in the primary column
                    uc.position = { x: 260, y: ucY };
                }
                ucY += 120; // Advance to the next row sequentially
            });

            // Stack actors vertically on the left periphery
            var actY = 100;
            actors.forEach(function(actor) {
                actor.position = { x: 50, y: actY };
                actY += 240;
            });

            // Fit boundary dimensions to horizontal/vertical contents
            if (boundary) {
                var maxX = 400;
                usecases.forEach(function(u) {
                    if (u.position && u.position.x + 200 > maxX) maxX = u.position.x + 200;
                });
                boundary.position = { x: 180, y: 40 };
                boundary.size = { 
                    width: Math.max(460, maxX - 160), 
                    height: Math.max(400, ucY + 40) 
                };
            }


        } else if (hasDFD) {
            var entities  = sorted.filter(function(s) { return s.type === 'dfd.ExternalEntity'; });
            var processes = sorted.filter(function(s) { return s.type === 'dfd.Process'; });
            var stores    = sorted.filter(function(s) { return s.type === 'dfd.DataStore'; });

            // Sort processes sequentially by label 
            processes.sort(function(a, b) {
                var lA = a.attrs && a.attrs.label ? a.attrs.label.text : '';
                var lB = b.attrs && b.attrs.label ? b.attrs.label.text : '';
                return lA.localeCompare(lB);
            });

            var procY = 80;
            var unassignedStores = JSON.parse(JSON.stringify(stores));
            
            processes.forEach(function(proc) {
                proc.position = { x: 300, y: procY };
                
                // Place adjacent stores
                var currentStoreX = 560;
                links.forEach(function(l) {
                    if (l.source.id === proc.id || l.target.id === proc.id) {
                        var storeId = l.source.id === proc.id ? l.target.id : l.source.id;
                        var storeIndex = unassignedStores.findIndex(function(s) { return s.id === storeId; });
                        if (storeIndex > -1) {
                            var store = unassignedStores[storeIndex];
                            store.position = { x: currentStoreX, y: procY + 15 };
                            unassignedStores.splice(storeIndex, 1);
                            currentStoreX += 220;
                        }
                    }
                });
                procY += 160;
            });

            // Place remaining stores
            var storeY = procY + 40;
            unassignedStores.forEach(function(s) {
                s.position = { x: 300, y: storeY };
                storeY += 100;
            });

            // Place entities on left column
            var entY = 80;
            entities.forEach(function(e) {
                e.position = { x: 40, y: entY };
                entY += 200;
            });
        }

        var shapeTypeMap = {};
        var processedShapes = sorted.map(function(c) {
            var newCell = JSON.parse(JSON.stringify(c));
            shapeTypeMap[newCell.id] = newCell.type;
            return buildElement(newCell);
        });

        var builtLinks = links.map(function(l) {
            var linkLabel = l.attrs && l.attrs.label ? l.attrs.label.text : null;
            var jointLink = new joint.shapes.standard.Link({
                id:     l.id,
                source: l.source,
                target: l.target,
                // Carry the bends across a save/reload — without this every vertex the
                // user dragged is dropped and the arrow snaps back to a bare line.
                vertices: l.vertices || [],
                attrs:  { line: { stroke: '#6b7280', strokeWidth: 1.5, targetMarker: { type: 'arrow', size: 8 } } },
                labels: linkLabel
                    ? [{ position: 0.5, attrs: { text: { text: linkLabel, fontSize: 11 } } }]
                    : [],
            });

            // Previously this branched per diagram domain (manhattan for use-case,
            // activity and DFD edges; normal elsewhere), which is why an arrow read
            // back from a file behaved differently from the identical arrow dropped
            // from the toolbox — and why those edges could not be hand-shaped at all.
            // All links now route the same way, and the user bends them by hand.
            return applyLinkRouting(jointLink, (l.connector && l.connector.name) === 'smooth');
        });

        graph.addCells(processedShapes.concat(builtLinks));

        // Send all system boundaries to the backmost layer
        graph.getElements().forEach(function(el) {
            if (el.get('type') === 'uml.SystemBoundary') {
                el.toBack();
            }
        });

        /* Clear undo history so "Undo" doesn't wipe the AI-generated diagram */
        if (cmd) cmd.clear();

        console.log('[CANVAS] rendered', sorted.length, 'shapes +', links.length, 'links');

        requestAnimationFrame(function() {
            if (paper) {
                var w = wrapperRef.current ? wrapperRef.current.offsetWidth : 900;
                var h = wrapperRef.current ? wrapperRef.current.offsetHeight : 600;
                var pad = Math.min(w, h) * 0.08;
                paper.scaleContentToFit({ padding: Math.max(40, pad), maxScale: 1.4, minScale: 0.1 });
                var s = paper.scale().sx;
                if (onZoomChange) onZoomChange(Math.round(s * 100));
            }
        });
    }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── 5. Expose imperative API to Dashboard ───────────────────────────── */

    // Broadcast position changes to Dashboard
    React.useEffect(function() {
        var graph = graphRef.current;
        if (!graph) return;
        var handler = function(cell) {
            if (cell.isLink && cell.isLink()) return;
            var pos = cell.position();
            var size = cell.size();
            positionStore.current[cell.id] = {
                x: pos.x, y: pos.y,
                cx: pos.x + size.width / 2,
                cy: pos.y + size.height / 2,
                w: size.width, h: size.height
            };
            if (onPositionUpdate) onPositionUpdate({ ...positionStore.current });
        };
        graph.on('change:position', handler);
        return function() { graph.off('change:position', handler); };
    }); // runs every render so ref stays fresh

    useImperativeHandle(ref, function() {
        return {

            addShape: function(type) {
                var graph = graphRef.current;
                var paper = paperRef.current;
                if (!graph) return;
                var id = type.replace('.', '-') + '-' + Date.now();
                /* Centre new shape in current viewport */
                var cx = 200, cy = 200;
                if (paper && wrapperRef.current) {
                    var t = paper.translate(), sc = paper.scale().sx;
                    cx = (wrapperRef.current.offsetWidth / 2 - t.tx) / sc;
                    cy = (wrapperRef.current.offsetHeight / 2 - t.ty) / sc;
                }
                /* UML use-case relationship types — spawned floating in the viewport
                   center; the user drags the endpoints onto shapes to connect. */
                var UC_REL = {
                    'ucrel.Association':    { dash: '0',   marker: 'none',   label: null },
                    'ucrel.Include':        { dash: '6 4', marker: 'open',   label: '«include»' },
                    'ucrel.Extend':         { dash: '6 4', marker: 'open',   label: '«extend»' },
                    'ucrel.Generalization': { dash: '0',   marker: 'hollow', label: null },
                    'dfd.Flow':             { dash: '0',   marker: 'arrow',  label: 'data' },
                };
                if (UC_REL[type]) {
                    var rel = UC_REL[type];
                    // Small jitter so consecutive clicks don't stack links exactly
                    // on top of each other in the viewport center.
                    cx += (Math.random() - 0.5) * 120;
                    cy += (Math.random() - 0.5) * 120;
                    var lineColor = darkMode ? '#94a3b8' : '#6b7280';
                    var marker =
                        rel.marker === 'none'   ? { type: 'none' } :
                        rel.marker === 'arrow'  ? { type: 'arrow', size: 10 } :
                        rel.marker === 'hollow' // generalization: hollow triangle
                            ? { type: 'path', d: 'M 16 -8 0 0 16 8 Z', fill: darkMode ? '#0d0f17' : '#ffffff', stroke: lineColor, 'stroke-width': 1.5 }
                            : { type: 'path', d: 'M 12 -6 0 0 12 6', fill: 'none', stroke: lineColor, 'stroke-width': 1.5 };
                    graph.addCell(applyLinkRouting(new joint.shapes.standard.Link({
                        id,
                        source: { x: cx - 90, y: cy },
                        target: { x: cx + 90, y: cy },
                        attrs: { line: { stroke: lineColor, strokeWidth: 1.5, strokeDasharray: rel.dash, targetMarker: marker } },
                        labels: rel.label ? [{
                            position: 0.5,
                            attrs: {
                                text: { text: rel.label, fontSize: 10, fill: lineColor, fontStyle: 'italic' },
                                rect: { fill: darkMode ? '#0d0f17' : '#ffffff', stroke: 'none' },
                            },
                        }] : [],
                    }), false));
                    return;
                }
                if (type === 'standard.Link') {
                    graph.addCell(applyLinkRouting(new joint.shapes.standard.Link({
                        id,
                        source: { x: cx - 80, y: cy },
                        target: { x: cx + 80, y: cy },
                        attrs:  { line: { stroke: darkMode ? '#94a3b8' : '#6b7280', strokeWidth: 1.5, targetMarker: { type: 'arrow', size: 8 } } },
                    }), false));
                    return;
                }
                if (type === 'curved.Link') {
                    // Seeded with one vertex so it spawns as a visible arc rather than
                    // a line that only curves once the user finds a handle. Both the
                    // vertex and the segment handles are draggable from the start.
                    graph.addCell(applyLinkRouting(new joint.shapes.standard.Link({
                        id,
                        source: { x: cx - 80, y: cy },
                        target: { x: cx + 80, y: cy },
                        vertices: [{ x: cx, y: cy - 55 }],
                        attrs:  { line: { stroke: darkMode ? '#94a3b8' : '#6b7280', strokeWidth: 1.5, targetMarker: { type: 'arrow', size: 8 } } },
                    }), true));
                    return;
                }
                var defSize = DEFAULT_SIZES[type] || { width: 160, height: 60 };
                // Jitter like the link presets, so repeated clicks don't stack shapes.
                cx += (Math.random() - 0.5) * 120;
                cy += (Math.random() - 0.5) * 120;
                var pos = { x: cx - defSize.width / 2, y: cy - defSize.height / 2 };
                var defLabel = type.split('.')[1] || type;
                var el = buildElement({ id, type, position: pos, attrs: { label: { text: defLabel } } });
                applyTheme(el, darkMode);
                graph.addCell(el);
                if (type === 'uml.SystemBoundary') {
                    el.toBack();
                }
            },
            undo: function() {
                if (cmdMgrRef.current) cmdMgrRef.current.undo();
            },
            redo: function() {
                if (cmdMgrRef.current) cmdMgrRef.current.redo();
            },
            getGraphJSON: function() {
                var graph = graphRef.current;
                return graph ? graph.toJSON() : null;
            },
            loadGraph: function(jsonObj) {
                var graph = graphRef.current;
                if (!graph) return;
                graph.fromJSON(jsonObj);
            },
            /**
             * spawnNode — Place an AI-extracted node onto the canvas.
             * Uses node.jointType (from UML_STANDARD_MAP cross-check) for the shape.
             * Falls back to uml.UseCase if jointType is missing.
             */
            spawnNode: function(node, x, y) {
                var graph = graphRef.current;
                if (!graph) return;
                // Don't re-add if already on canvas
                if (graph.getCell(node.id)) return;
                var type     = node.jointType || 'uml.UseCase';
                var label    = node.label || 'Entity';
                var defSize  = DEFAULT_SIZES[type] || { width: 160, height: 60 };
                // Expand width for long labels
                var charW    = 8.5;
                var textLen  = label.length;
                var estWidth = Math.max(defSize.width, textLen * charW + 60);
                var el = buildElement({
                    id:       node.id,
                    type:     type,
                    position: { x: x || 100, y: y || 100 },
                    size:     { width: Math.round(estWidth), height: defSize.height },
                    attrs:    { label: { text: label } },
                });
                applyTheme(el, darkMode);
                graph.addCell(el);
                if (type === 'uml.SystemBoundary') el.toBack();
                console.log('[Canvas] spawnNode', node.id, type, 'at', x, y);
            },
            /**
             * drawConnection — Draw a bendable link between two nodes by their IDs.
             * Returns true on success, false if either node is not yet on canvas.
             */
            drawConnection: function(fromId, toId, label, edgeId) {
                var graph = graphRef.current;
                if (!graph) return false;
                var src = graph.getCell(fromId);
                var tgt = graph.getCell(toId);
                if (!src || !tgt) {
                    console.warn('[Canvas] drawConnection — node not on canvas:', fromId, '->', toId);
                    return false;
                }
                // Avoid duplicate edges
                if (edgeId && graph.getCell(edgeId)) return true;
                var link = new joint.shapes.standard.Link({
                    id:     edgeId || ('link-' + fromId + '-' + toId),
                    source: { id: fromId },
                    target: { id: toId },
                    attrs:  { line: { stroke: darkMode ? '#60a5fa' : '#2563eb', strokeWidth: 1.5, targetMarker: { type: 'arrow', size: 8 } } },
                    labels: label ? [{ position: 0.5, attrs: { text: { text: label, fontSize: 10, fill: darkMode ? '#94a3b8' : '#475569' } } }] : [],
                });
                applyLinkRouting(link, true);
                graph.addCell(link);
                console.log('[Canvas] drawConnection', fromId, '->', toId, label);
                return true;
            },
            resizeShape: function(cellId, w, h) {
                var graph = graphRef.current;
                if (!graph) return;
                var cell = graph.getCell(cellId);
                if (cell && !cell.isLink()) cell.resize(Math.max(20, w), Math.max(20, h));
            },
            fitContent: function() {
                var p = paperRef.current;
                if (!p) return;
                var wrapper = wrapperRef.current;
                var pad = wrapper ? Math.min(wrapper.offsetWidth, wrapper.offsetHeight) * 0.08 : 60;
                p.scaleContentToFit({ padding: Math.max(40, pad), maxScale: 2, minScale: 0.1 });
                var s = p.scale().sx;
                if (onZoomChange) onZoomChange(Math.round(s * 100));
            },
            zoomIn: function() {
                var p = paperRef.current;
                if (!p) return;
                var newScale = Math.min(p.scale().sx * 1.2, 5);
                p.scale(newScale);
                if (onZoomChange) onZoomChange(Math.round(newScale * 100));
            },
            zoomOut: function() {
                var p = paperRef.current;
                if (!p) return;
                var newScale = Math.max(p.scale().sx / 1.2, 0.05);
                p.scale(newScale);
                if (onZoomChange) onZoomChange(Math.round(newScale * 100));
            },
            resetZoom: function() {
                var p = paperRef.current;
                if (!p) return;
                p.scale(1);
                p.translate(0, 0);
                if (onZoomChange) onZoomChange(100);
            },
            exportPNG: function(filename) {
                var name = filename || 'diagram';
                var p = paperRef.current;
                if (!p) return;
                p.hideTools();
                var svg = p.svg;
                // getContentArea() = LOCAL (unscaled) coords — correct for a viewBox.
                // getContentBBox() is in client coords, so any zoom != 100% produced a
                // wrong/huge viewBox and the export silently never fired (img.onload
                // never ran and there was no onerror).
                var bbox = p.getContentArea();
                var PAD = 40;
                var cloned = svg.cloneNode(true);
                cloned.setAttribute('width', bbox.width + PAD * 2);
                cloned.setAttribute('height', bbox.height + PAD * 2);
                cloned.setAttribute('viewBox', (bbox.x - PAD) + ' ' + (bbox.y - PAD) + ' ' + (bbox.width + PAD * 2) + ' ' + (bbox.height + PAD * 2));
                var serializer = new XMLSerializer();
                var svgStr = serializer.serializeToString(cloned);
                var canvas = document.createElement('canvas');
                // 2x for crispness, but cap the longest side so a sprawling diagram
                // can't allocate an impossible canvas (which fails silently).
                var scale = Math.min(2, 8000 / Math.max(bbox.width + PAD * 2, bbox.height + PAD * 2, 1));
                canvas.width  = Math.max(1, Math.round((bbox.width + PAD * 2) * scale));
                canvas.height = Math.max(1, Math.round((bbox.height + PAD * 2) * scale));
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = darkMode ? '#0f172a' : '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                var img = new Image();
                var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                img.onload = function() {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(url);
                    var link = document.createElement('a');
                    link.download = name + '.png';
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                };
                img.onerror = function() {
                    URL.revokeObjectURL(url);
                    console.error('[exportPNG] SVG rasterization failed — falling back to SVG download');
                    var link = document.createElement('a');
                    link.download = name + '.svg';
                    link.href = URL.createObjectURL(blob);
                    link.click();
                    URL.revokeObjectURL(link.href);
                };
                img.src = url;
                p.showTools();
            },
            exportSVG: function(filename) {
                var name = filename || 'diagram';
                var p = paperRef.current;
                if (!p) return;
                p.hideTools();
                var svg = p.svg;
                var bbox = p.getContentArea();   // local coords (see exportPNG note)
                var PAD = 40;
                var cloned = svg.cloneNode(true);
                cloned.setAttribute('width', bbox.width + PAD * 2);
                cloned.setAttribute('height', bbox.height + PAD * 2);
                cloned.setAttribute('viewBox', (bbox.x - PAD) + ' ' + (bbox.y - PAD) + ' ' + (bbox.width + PAD * 2) + ' ' + (bbox.height + PAD * 2));
                // Add white/dark background rect
                var bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                bgRect.setAttribute('width', '100%');
                bgRect.setAttribute('height', '100%');
                bgRect.setAttribute('fill', darkMode ? '#0f172a' : '#ffffff');
                cloned.insertBefore(bgRect, cloned.firstChild);
                var serializer = new XMLSerializer();
                var svgStr = serializer.serializeToString(cloned);
                var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
                var link = document.createElement('a');
                link.download = name + '.svg';
                link.href = URL.createObjectURL(blob);
                link.click();
                URL.revokeObjectURL(link.href);
                p.showTools();
            },
            exportJSON: function(filename) {
                var name = filename || 'diagram';
                var g = graphRef.current;
                if (!g) return;
                var json = JSON.stringify(g.toJSON(), null, 2);
                var blob = new Blob([json], { type: 'application/json' });
                var link = document.createElement('a');
                link.download = name + '.json';
                link.href = URL.createObjectURL(blob);
                link.click();
                URL.revokeObjectURL(link.href);
            },
            renameShape: function(cellId, newLabel) {
                var graph = graphRef.current;
                if (!graph) return;
                var cell = graph.getCell(cellId);
                if (cell && !cell.isLink()) {
                    cell.attr('label/text', newLabel);
                }
            },
            moveShape: function(cellId, x, y) {
                var graph = graphRef.current;
                if (!graph) return;
                var cell = graph.getCell(cellId);
                if (cell && !cell.isLink()) {
                    cell.position(x, y);
                }
            },
            deleteSelected: function() {
                if (selectedRef.current) {
                    selectedRef.current.remove();
                    selectedRef.current = null;
                    if (onSelectionChange) onSelectionChange(null);
                }
            },
            clearAll: function() {
                var g = graphRef.current;
                if (!g) return;
                g.clear();
                selectedRef.current = null;
                positionStore.current = {};
                if (onSelectionChange) onSelectionChange(null);
                if (onPositionUpdate) onPositionUpdate({});
            },

            /* ── Human-in-the-Loop: draw a smart connection ── */
            drawConnection: function(fromId, toId, label, edgeId) {
                var graph = graphRef.current;
                if (!graph) return false;
                var fromCell = graph.getCell(fromId);
                var toCell   = graph.getCell(toId);
                if (!fromCell || !toCell) return false;
                
                var existing = graph.getLinks().find(function(l) {
                    return (l.get('source').id === fromId && l.get('target').id === toId) ||
                           (l.id === edgeId);
                });
                if (existing) return true;

                var isDependency = label && label.includes('<<');
                var link = new joint.shapes.standard.Link({
                    id: edgeId || ('e-' + fromId + '-' + toId),
                    source: { id: fromId },
                    target: { id: toId },
                    router: { name: 'normal' },
                    connector: { name: 'smooth' },
                    // (routing kept inline here — matches applyLinkRouting(link, true))
                    attrs: {
                        line: {
                            stroke: '#6366f1',
                            strokeWidth: 2,
                            strokeDasharray: isDependency ? '5 5' : '0',
                            targetMarker: { type: 'arrow', size: 10 }
                        }
                    },
                    labels: label ? [{
                        attrs: {
                            text: { text: label, fontSize: 10, fill: '#6366f1', fontWeight: '700' },
                            rect: { fill: 'white', stroke: '#6366f1', rx: 5, ry: 5, refWidth: '120%', refHeight: '120%', refX: '-10%', refY: '-10%' }
                        },
                        position: 0.5
                    }] : []
                });
                graph.addCell(link);
                return true;
            },

            /* Auto-align: PROPER layered layout (dagre via joint.layout.DirectedGraph).
             * The old implementation flowed nodes left-to-right in rows, ignoring the
             * edges entirely — flows stayed tangled and link labels piled on top of
             * nodes. Dagre ranks nodes along the edge direction, spreads siblings, and
             * routes link vertices, which is what "Auto-Align" promises.
             * SystemBoundary containers are excluded from ranking (they are overlays,
             * not flow nodes) and re-fitted around their content afterwards. */
            autoLayout: function() {
                var graph = graphRef.current;
                if (!graph) return;
                var all = graph.getElements();
                if (all.length === 0) return;

                var boundaries = all.filter(function(el) { return el.get('type') === 'uml.SystemBoundary'; });
                var flowEls = all.filter(function(el) { return el.get('type') !== 'uml.SystemBoundary'; });
                if (flowEls.length === 0) return;

                // A single boundary always adopts the WHOLE flow: Auto-Align promises
                // "boundary around all of it", and re-fitting around only the nodes
                // that happened to sit inside pre-layout left the rest of the diagram
                // hanging outside. Actors stay out per UML (the system boundary
                // encloses the system's behavior; actors stand outside it).
                // With multiple boundaries (nested subsystem boxes) each keeps the
                // members it geometrically contained, falling back to the whole flow
                // when it was empty.
                var wholeFlow = flowEls.filter(function(el) { return el.get('type') !== 'uml.Actor'; });
                var boundaryMembers = boundaries.map(function(b) {
                    if (boundaries.length === 1) return { el: b, members: wholeFlow };
                    var bb = b.getBBox();
                    var contained = flowEls.filter(function(el) { return bb.containsRect(el.getBBox()); });
                    return {
                        el: b,
                        members: contained.length > 0 ? contained : wholeFlow,
                    };
                });

                var flowIds = {};
                flowEls.forEach(function(el) { flowIds[el.id] = true; });
                var flowLinks = graph.getLinks().filter(function(l) {
                    var s = l.get('source') || {}, t = l.get('target') || {};
                    return flowIds[s.id] && flowIds[t.id];
                });

                joint.layout.DirectedGraph.layout(flowEls.concat(flowLinks), {
                    dagre: dagre,
                    graphlib: graphlib,
                    rankDir: 'TB',       // flows read top-to-bottom (start → end)
                    ranker: 'network-simplex',
                    rankSep: 90,
                    nodeSep: 70,
                    edgeSep: 40,
                    marginX: 80,
                    marginY: 80,
                    setVertices: true,   // dagre routes the links around nodes
                    setLabels: true,     // and spaces the link labels along them
                });

                // Re-fit each boundary around the members it contained before.
                boundaryMembers.forEach(function(bm) {
                    if (bm.members.length === 0) return;
                    var bb = null;
                    bm.members.forEach(function(el) {
                        var r = el.getBBox();
                        bb = bb ? bb.union(r) : r;
                    });
                    var PAD = 40, TITLE = 30;
                    bm.el.position(bb.x - PAD, bb.y - PAD - TITLE);
                    bm.el.resize(bb.width + PAD * 2, bb.height + PAD * 2 + TITLE);
                    bm.el.toBack();
                });

                // Sync the position store + bring the result into view.
                all.forEach(function(el) {
                    var pos = el.position(), size = el.size();
                    positionStore.current[el.id] = { x: pos.x, y: pos.y, w: size.width, h: size.height };
                });
                if (onPositionUpdate) onPositionUpdate({ ...positionStore.current });

                var p = paperRef.current;
                var wrapper = wrapperRef.current;
                if (p && wrapper) {
                    var pad = Math.min(wrapper.offsetWidth, wrapper.offsetHeight) * 0.06;
                    p.scaleContentToFit({ padding: Math.max(40, pad), maxScale: 1.4, minScale: 0.1 });
                    if (onZoomChange) onZoomChange(Math.round(p.scale().sx * 100));
                }
            },


            /* ── Human-in-the-Loop: spawn a node chip from the panel ── */
            spawnNode: function(nodeData, x, y, w, h) {
                var graph = graphRef.current;
                var paper = paperRef.current;
                if (!graph) return;
                if (graph.getCell(nodeData.id)) return;
                
                var jointType = nodeData.jointType || 'uml.UseCase';
                // Resolve category → type as ultimate fallback
                if (jointType === 'uml.UseCase' && nodeData.category === 'actor') jointType = 'uml.Actor';

                // Place near center of current viewport if no coords given
                var targetX = x, targetY = y;
                if (targetX === undefined || targetX === null) {
                    if (paper) {
                        var t  = paper.translate();
                        var sc = paper.scale().sx;
                        var pw = paper.el.offsetWidth  || 800;
                        var ph = paper.el.offsetHeight || 600;
                        targetX = ((pw  / 2) - t.tx) / sc - 80;
                        targetY = ((ph  / 2) - t.ty) / sc - 50;
                    } else {
                        targetX = 120; targetY = 120;
                    }
                }

                var defaultSize = DEFAULT_SIZES[jointType] || { width: 160, height: 60 };
                var cellDef = {
                    id: nodeData.id,
                    type: jointType,
                    position: { x: Math.max(10, targetX), y: Math.max(10, targetY) },
                    // Use w/h overrides if provided (e.g. for auto-sized SystemBoundary)
                    size: { width: w || defaultSize.width, height: h || defaultSize.height },
                    attrs: { label: { text: nodeData.label } }
                };
                var el = buildElement(cellDef);
                el.set('fullDescription', nodeData.fullDescription);
                applyTheme(el, darkMode);

                graph.addCell(el);

                // Send system boundaries to back so they don't cover use cases
                if (jointType === 'uml.SystemBoundary') {
                    el.toBack();
                }

                var pos = el.position();
                var sz = el.size();
                positionStore.current[el.id] = { x: pos.x, y: pos.y, w: sz.width, h: sz.height };
                if (onPositionUpdate) onPositionUpdate({ ...positionStore.current });
            },


            getPlacedIds: function() {
                return new Set(Object.keys(positionStore.current));
            },

            /* ── Edge editing ─────────────────────────────────────────────── */
            updateLinkLabel: function(id, text) {
                var g = graphRef.current; if (!g) return;
                var link = g.getCell(id);
                if (!link || !link.isLink()) return;
                if (text) {
                    link.labels([{
                        position: 0.5,
                        attrs: {
                            text: { text: text, fontSize: 10, fill: darkMode ? '#c7d2fe' : '#6366f1', fontWeight: '700' },
                            rect: { fill: darkMode ? '#0d0f17' : '#ffffff', stroke: 'none' },
                        },
                    }]);
                } else {
                    link.labels([]);
                }
            },

            /* Change a link's relationship style. Returns the stereotype label it
               applied ('«include»' / '«extend»'), or null when the style has none. */
            setLinkStyle: function(id, styleKey) {
                var g = graphRef.current; if (!g) return null;
                var link = g.getCell(id);
                if (!link || !link.isLink()) return null;
                var lineColor = darkMode ? '#94a3b8' : '#6b7280';
                var openArrow   = { type: 'path', d: 'M 12 -6 0 0 12 6', fill: 'none', stroke: lineColor, 'stroke-width': 1.5 };
                var hollowTri   = { type: 'path', d: 'M 16 -8 0 0 16 8 Z', fill: darkMode ? '#0d0f17' : '#ffffff', stroke: lineColor, 'stroke-width': 1.5 };
                var STYLES = {
                    arrow:          { dash: '0',   marker: { type: 'arrow', size: 10 }, stereo: null },
                    association:    { dash: '0',   marker: { type: 'none' },            stereo: null },
                    include:        { dash: '6 4', marker: openArrow,                   stereo: '«include»' },
                    extend:         { dash: '6 4', marker: openArrow,                   stereo: '«extend»' },
                    generalization: { dash: '0',   marker: hollowTri,                   stereo: null },
                };
                var s = STYLES[styleKey];
                if (!s) return null;
                link.attr('line/stroke', lineColor);
                link.attr('line/strokeDasharray', s.dash);
                link.attr('line/targetMarker', s.marker);
                // Stereotype styles own the label; switching away from one clears it
                // only if the label still IS a stereotype (user text is preserved).
                var lbls = link.labels() || [];
                var cur = (lbls[0] && lbls[0].attrs && lbls[0].attrs.text && lbls[0].attrs.text.text) || '';
                if (s.stereo) {
                    this.updateLinkLabel(id, s.stereo);
                    return s.stereo;
                }
                if (/^«.+»$/.test(cur)) {
                    this.updateLinkLabel(id, '');
                    return '';
                }
                return null;
            },

            reverseLink: function(id) {
                var g = graphRef.current; if (!g) return;
                var link = g.getCell(id);
                if (!link || !link.isLink()) return;
                var src = link.get('source'), tgt = link.get('target');
                link.set({ source: tgt, target: src });
            },

            /* ── UML lint: cheap structural checks over the current graph ──── */
            getLintReport: function() {
                var g = graphRef.current; if (!g) return [];
                var els = g.getElements();
                var links = g.getLinks();
                if (els.length === 0) return ['Canvas is empty — place some nodes first.'];
                var issues = [];
                var nameOf = function(el) { return el.attr('label/text') || (el.get('type') || '').split('.')[1] || 'shape'; };
                var typeOf = function(el) { return el.get('type'); };
                var boundaries = els.filter(function(e) { return typeOf(e) === 'uml.SystemBoundary'; });

                var deg = {};
                links.forEach(function(l) {
                    var s = (l.get('source') || {}).id, t = (l.get('target') || {}).id;
                    if (s) deg[s] = (deg[s] || 0) + 1;
                    if (t) deg[t] = (deg[t] || 0) + 1;
                });

                els.forEach(function(el) {
                    if (typeOf(el) === 'uml.SystemBoundary') return;
                    if (!deg[el.id]) issues.push('⚠ "' + nameOf(el) + '" is not connected to anything.');
                });

                els.filter(function(e) { return typeOf(e) === 'uml.Actor'; }).forEach(function(a) {
                    boundaries.forEach(function(b) {
                        if (b.getBBox().containsRect(a.getBBox())) {
                            issues.push('⚠ Actor "' + nameOf(a) + '" is inside the system boundary — actors belong outside.');
                        }
                    });
                });

                var actorIds = {};
                els.forEach(function(e) { if (typeOf(e) === 'uml.Actor') actorIds[e.id] = true; });
                if (Object.keys(actorIds).length > 0) {
                    els.filter(function(e) { return typeOf(e) === 'uml.UseCase'; }).forEach(function(uc) {
                        var touches = links.some(function(l) {
                            var s = (l.get('source') || {}).id, t = (l.get('target') || {}).id;
                            return (s === uc.id && actorIds[t]) || (t === uc.id && actorIds[s]);
                        });
                        if (!touches) issues.push('ℹ Use case "' + nameOf(uc) + '" has no actor association.');
                    });
                }

                els.filter(function(e) { return typeOf(e) === 'uml.DecisionNode'; }).forEach(function(d) {
                    var out = links.filter(function(l) { return (l.get('source') || {}).id === d.id; }).length;
                    if (out < 2) issues.push('⚠ Decision "' + nameOf(d) + '" has ' + out + ' outgoing branch(es) — a decision needs at least 2.');
                });

                var hasActivity = els.some(function(e) { return /uml\.(ActionState|StartNode|EndState|DecisionNode)/.test(typeOf(e)); });
                if (hasActivity) {
                    if (!els.some(function(e) { return typeOf(e) === 'uml.StartNode'; })) issues.push('⚠ Activity flow has no Start node.');
                    if (!els.some(function(e) { return typeOf(e) === 'uml.EndState'; }))  issues.push('⚠ Activity flow has no End state.');
                }

                return issues.length ? issues : ['✅ No issues found — diagram looks clean.'];
            },
        };
    });


    return (
        <div
            ref={wrapperRef}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
                e.preventDefault();
                var raw = e.dataTransfer.getData('application/intellispec-node');
                if (!raw) return;
                try {
                    var nodeData = JSON.parse(raw);
                    var paper = paperRef.current;
                    var wrapper = wrapperRef.current;
                    var x = 100, y = 100;
                    if (paper && wrapper) {
                        var rect = wrapper.getBoundingClientRect();
                        var t = paper.translate();
                        var sc = paper.scale().sx;
                        x = (e.clientX - rect.left - t.tx) / sc - 80;
                        y = (e.clientY - rect.top  - t.ty) / sc - 40;
                    }
                    
                    var graph = graphRef.current;
                    if (graph && !graph.getCell(nodeData.id)) {
                        var jointType = nodeData.jointType || 'uml.UseCase';
                        // Fallback: resolve from category
                        if (nodeData.category === 'actor') jointType = 'uml.Actor';
                        var safeX = isNaN(x) ? 120 : Math.max(10, x);
                        var safeY = isNaN(y) ? 120 : Math.max(10, y);
                        var cellDef = {
                            id: nodeData.id,
                            type: jointType,
                            position: { x: safeX, y: safeY },
                            size: DEFAULT_SIZES[jointType] || { width: 160, height: 60 },
                            attrs: { label: { text: nodeData.label } }
                        };
                        var el = buildElement(cellDef);
                        applyTheme(el, darkMode);
                        graph.addCell(el);

                        var pos = el.position();
                        var sz  = el.size();
                        positionStore.current[el.id] = { x: pos.x, y: pos.y, w: sz.width, h: sz.height };
                        if (onPositionUpdate) onPositionUpdate({ ...positionStore.current });
                    }
                } catch(err) { console.warn('Drop parse error:', err); }
            }}
            style={{
                position:   'absolute',
                inset:      0,
                overflow:   'hidden',
                background: darkMode ? '#0f172a' : '#f3f4f6',
                cursor:     'default',
            }}
        />
    );
});

export default DiagramCanvas;