/**
 * customShapes.js
 *
 * FIX: joint.shapes.uml is a getter-only property in JointJS — we cannot do
 *      `joint.shapes.uml = ...` (throws "has only a getter").
 *
 * SOLUTION: Call define() for registration, capture the returned constructor,
 *           and export a SHAPE_MAP so DiagramCanvas can instantiate shapes
 *           directly from the map instead of from joint.shapes.uml.*.
 */

import * as joint from 'jointjs';

/* ═══════════════════════════════════════════════════════════════════════════
   USE CASE SHAPES
═══════════════════════════════════════════════════════════════════════════ */

/* uml.Actor — stick figure (circle + 5 lines) + text label below */
const UmlActor = joint.dia.Element.define(
    'uml.Actor',
    {
        size: { width: 60, height: 100 },
        attrs: {
            // body/hitArea for standard tool compatibility
            body: {
                refWidth: '100%', refHeight: '100%',
                fill: 'transparent', stroke: 'none',
                cursor: 'move',
                magnet: 'true',
            },
            head:     { cx: 30, cy: 13, r: 12, fill: 'white', stroke: '#1e293b', strokeWidth: 2 },
            torso:    { x1: 30, y1: 25, x2: 30, y2: 55, stroke: '#1e293b', strokeWidth: 2, strokeLinecap: 'round' },
            arms:     { x1: 5,  y1: 38, x2: 55, y2: 38, stroke: '#1e293b', strokeWidth: 2, strokeLinecap: 'round' },
            leftLeg:  { x1: 30, y1: 55, x2: 8,  y2: 80, stroke: '#1e293b', strokeWidth: 2, strokeLinecap: 'round' },
            rightLeg: { x1: 30, y1: 55, x2: 52, y2: 80, stroke: '#1e293b', strokeWidth: 2, strokeLinecap: 'round' },
            label: {
                text: 'Actor', refX: '50%', refY: '100%', dy: 14,
                textAnchor: 'middle', fill: '#1e293b', fontSize: 12, fontFamily: 'Inter, sans-serif',
                fontWeight: '600'
            },
        },
    },
    {
        markup: [
            { tagName: 'rect',   selector: 'body'     }, // Renamed hitArea to body
            { tagName: 'circle', selector: 'head'     },
            { tagName: 'line',   selector: 'torso'    },
            { tagName: 'line',   selector: 'arms'     },
            { tagName: 'line',   selector: 'leftLeg'  },
            { tagName: 'line',   selector: 'rightLeg' },
            { tagName: 'text',   selector: 'label'    },
        ],
    }
);

/* uml.UseCase — oval with label */
const UmlUseCase = joint.shapes.standard.Ellipse.define('uml.UseCase', {
    size: { width: 160, height: 60 },
    attrs: {
        body:  { fill: '#e8f4fd', stroke: '#2563eb', strokeWidth: 2, magnet: 'true' },
        label: {
            text: 'Use Case', fill: '#1e3a5f', fontSize: 13, fontWeight: 'bold',
            fontFamily: 'Inter, sans-serif', refX: '50%', refY: '50%',
            textAnchor: 'middle', textVerticalAnchor: 'middle',
        },
    },
});

/* uml.SystemBoundary — dashed rectangle, not a link source.
   Drag handles: the visible border is 2px and the body must stay click-through
   (shapes inside have to remain selectable), so grabbing the boundary itself was
   pixel-hunting. Two invisible handles fix that: `hit` — a 24px-wide transparent
   stroke along the border — and `titleBand` — a strip across the top behind the
   label. Both show a move cursor; the interior still passes clicks through. */
const UmlSystemBoundary = joint.shapes.standard.Rectangle.define('uml.SystemBoundary', {
    size: { width: 420, height: 320 },
    attrs: {
        body: {
            fill: 'rgba(219,234,254,0.12)', stroke: '#1d4ed8',
            strokeWidth: 2, strokeDasharray: '8 4', rx: 4, ry: 4,
            pointerEvents: 'stroke',
        },
        titleBand: {
            refWidth: '100%', height: 30,
            fill: 'rgba(0,0,0,0)', stroke: 'none',
            pointerEvents: 'all', cursor: 'move',
        },
        hit: {
            refWidth: '100%', refHeight: '100%',
            fill: 'none', stroke: 'rgba(0,0,0,0)', strokeWidth: 24,
            pointerEvents: 'stroke', cursor: 'move',
        },
        label: {
            text: 'System', fill: '#1d4ed8', fontSize: 14, fontWeight: 'bold',
            textVerticalAnchor: 'top', refY: 8, fontFamily: 'Inter, sans-serif',
            pointerEvents: 'none',
        },
    },
}, {
    markup: [
        { tagName: 'rect', selector: 'body' },
        { tagName: 'rect', selector: 'titleBand' },
        { tagName: 'rect', selector: 'hit' },
        { tagName: 'text', selector: 'label' },
    ],
});

/* ═══════════════════════════════════════════════════════════════════════════
   ACTIVITY SHAPES
═══════════════════════════════════════════════════════════════════════════ */

/* uml.StartNode — solid filled black circle */
const UmlStartNode = joint.dia.Element.define(
    'uml.StartNode',
    {
        size: { width: 30, height: 30 },
        attrs: {
            body:  { refCx: '50%', refCy: '50%', refR: '50%', fill: '#111827', stroke: '#111827', strokeWidth: 2, magnet: 'true' },
            label: { display: 'none' },
        },
    },
    { markup: [{ tagName: 'circle', selector: 'body' }] }
);

/**
 * uml.EndState — Outlined circle with inner dot
 */
const UmlEndState = joint.dia.Element.define(
    'uml.EndState',
    {
        size: { width: 36, height: 36 },
        attrs: {
            body:  { refCx: '50%', refCy: '50%', refR: '50%', fill: '#ffffff', stroke: '#111827', strokeWidth: 2, magnet: 'true' },
            inner: { refCx: '50%', refCy: '50%', refR: '25%', fill: '#111827', stroke: 'none' },
            label: { display: 'none' },
        },
    },
    {
        markup: [
            { tagName: 'circle', selector: 'body'  },
            { tagName: 'circle', selector: 'inner' },
        ],
    }
);

/* uml.ActionState — heavily rounded rectangle (pill shape) */
const UmlActionState = joint.shapes.standard.Rectangle.define('uml.ActionState', {
    size: { width: 160, height: 50 },
    attrs: {
        body:  { rx: 20, ry: 20, fill: '#f0fdf4', stroke: '#16a34a', strokeWidth: 2, magnet: 'true' },
        label: { text: 'Action', fill: '#14532d', fontSize: 13, fontWeight: '600', fontFamily: 'Inter, sans-serif' },
    },
});

/* uml.DecisionNode — diamond (Polygon) */
const UmlDecisionNode = joint.shapes.standard.Polygon.define('uml.DecisionNode', {
    size: { width: 100, height: 60 },
    attrs: {
        body: {
            refPoints: '50 0 100 30 50 60 0 30',
            fill: '#fffbeb', stroke: '#d97706', strokeWidth: 2, magnet: 'true',
        },
        label: { text: '?', fill: '#92400e', fontSize: 11, fontWeight: '600', fontFamily: 'Inter, sans-serif' },
    },
});

/* uml.ForkBar — fork/join synchronization bar (parallel flows split or merge) */
const UmlForkBar = joint.shapes.standard.Rectangle.define('uml.ForkBar', {
    size: { width: 140, height: 12 },
    attrs: {
        body:  { fill: '#111827', stroke: '#111827', strokeWidth: 1, rx: 3, ry: 3, magnet: 'true' },
        label: { display: 'none' },
    },
});

/* ═══════════════════════════════════════════════════════════════════════════
   DFD SHAPES
═══════════════════════════════════════════════════════════════════════════ */

/* dfd.Process — oval */
const DfdProcess = joint.shapes.standard.Ellipse.define('dfd.Process', {
    size: { width: 120, height: 80 },
    attrs: {
        body:  { fill: '#fefce8', stroke: '#ca8a04', strokeWidth: 2, magnet: 'true' },
        label: { text: 'Process', fill: '#713f12', fontSize: 12, fontWeight: '600', fontFamily: 'Inter, sans-serif' },
    },
});

/* dfd.DataStore — open-ended rectangle (two horizontal lines) */
const DfdDataStore = joint.dia.Element.define(
    'dfd.DataStore',
    {
        size: { width: 160, height: 50 },
        attrs: {
            body:       { refWidth: '100%', refHeight: '100%', fill: '#f9fafb', stroke: 'none' },
            topLine:    { x: 0, y: 0, refWidth: '100%', height: 3, fill: '#374151' },
            bottomLine: { x: 0, refY: '100%', refY2: -3, refWidth: '100%', height: 3, fill: '#374151' },
            hitArea:    { refWidth: '100%', refHeight: '100%', fill: 'transparent', stroke: 'none', magnet: 'true' },
            label: {
                text: 'Data Store', refX: '50%', refY: '50%',
                textAnchor: 'middle', textVerticalAnchor: 'middle',
                fill: '#1f2937', fontSize: 12, fontWeight: '600', fontFamily: 'Inter, sans-serif',
            },
        },
    },
    {
        markup: [
            { tagName: 'rect', selector: 'body'       },
            { tagName: 'rect', selector: 'topLine'    },
            { tagName: 'rect', selector: 'bottomLine' },
            { tagName: 'rect', selector: 'hitArea'    },
            { tagName: 'text', selector: 'label'      },
        ],
    }
);

/* dfd.ExternalEntity — plain box */
const DfdExternalEntity = joint.shapes.standard.Rectangle.define('dfd.ExternalEntity', {
    size: { width: 120, height: 60 },
    attrs: {
        body:  { fill: '#f1f5f9', stroke: '#475569', strokeWidth: 2, rx: 2, ry: 2, magnet: 'true' },
        label: { text: 'External Entity', fill: '#1e293b', fontSize: 12, fontWeight: '600', fontFamily: 'Inter, sans-serif' },
    },
});

/* ═══════════════════════════════════════════════════════════════════════════
   PHASE 3 — ANNOTATION & MATH CONSTRAINT SHAPES
   These shapes render math guard conditions and figure references
   extracted from the _clean.md via the Phase 2 Prompt Engine.
═══════════════════════════════════════════════════════════════════════════ */

/**
 * uml.Note — "Dog-eared" note shape (sticky note appearance)
 * Used to annotate math guard conditions extracted from the SRS.
 * e.g. "Guard: attendance < 75%"
 */
const UmlNote = joint.dia.Element.define(
    'uml.Note',
    {
        size: { width: 180, height: 70 },
        attrs: {
            body: {
                refPoints: '0 0 170 0 180 10 180 70 0 70',
                fill: '#fefce8', stroke: '#ca8a04', strokeWidth: 1.5, magnet: 'passive',
            },
            dogear: {
                // Fixed 10px corner fold pinned to the top-right. (refPoints here
                // normalized the tiny triangle to its OWN bbox and stretched it to
                // the full element size — a giant fold across the whole note.)
                points: '0,0 0,10 10,10',
                refX: '100%', refX2: -10,
                fill: '#fef08a', stroke: '#ca8a04', strokeWidth: 1.5,
            },
            label: {
                refX: '50%', refY: '50%',
                textAnchor: 'middle', textVerticalAnchor: 'middle',
                fontSize: 11, fill: '#713f12',
                fontFamily: 'Inter, sans-serif',
                text: 'Note',
            },
        },
    },
    {
        markup: [
            { tagName: 'polygon', selector: 'body'   },
            { tagName: 'polygon', selector: 'dogear' },
            { tagName: 'text',    selector: 'label'  },
        ],
    }
);

/**
 * uml.Constraint — Rounded constraint label for guard conditions on transitions.
 * Lighter weight than a Note; appears inline near decision points.
 * e.g. "[response_time < 5s]"
 */
const UmlConstraint = joint.shapes.standard.Rectangle.define('uml.Constraint', {
    size: { width: 180, height: 36 },
    attrs: {
        body:  {
            rx: 18, ry: 18,
            fill: '#eff6ff', stroke: '#2563eb', strokeWidth: 1.5,
            strokeDasharray: '5 3', magnet: 'passive',
        },
        label: {
            text: '[constraint]', fill: '#1e3a5f', fontSize: 11,
            fontStyle: 'italic', fontFamily: 'Inter, sans-serif',
        },
    },
});

/**
 * standard.TextBlock — Plain flat annotation for Figure references.
 * e.g. "[See Figure 3.1]"
 * Rendered as a dashed-border transparent rectangle with italicized text.
 */
const TextBlockAnnotation = joint.shapes.standard.Rectangle.define('standard.TextBlock', {
    size: { width: 200, height: 40 },
    attrs: {
        body:  {
            fill: 'transparent', stroke: '#94a3b8',
            strokeWidth: 1, strokeDasharray: '4 3', rx: 4, ry: 4,
        },
        label: {
            text: '[See Figure X]', fill: '#64748b', fontSize: 11,
            fontStyle: 'italic', fontFamily: 'Inter, sans-serif',
        },
    },
});


/* ═══════════════════════════════════════════════════════════════════════════
   SHAPE_MAP  —  used by DiagramCanvas to instantiate shapes by type string.
   This is the single source of truth; avoids all joint.shapes.uml.* access.
═══════════════════════════════════════════════════════════════════════════ */
export const SHAPE_MAP = {
    'uml.Actor':          UmlActor,
    'uml.UseCase':        UmlUseCase,
    'uml.SystemBoundary': UmlSystemBoundary,
    'uml.StartNode':      UmlStartNode,
    'uml.EndState':       UmlEndState,
    'uml.ActionState':    UmlActionState,
    'uml.DecisionNode':   UmlDecisionNode,
    'uml.ForkBar':        UmlForkBar,
    'dfd.Process':        DfdProcess,
    'dfd.DataStore':      DfdDataStore,
    'dfd.ExternalEntity': DfdExternalEntity,
    // Phase 3 — Annotation & Math shapes
    'uml.Note':           UmlNote,
    'uml.Constraint':     UmlConstraint,
    'standard.TextBlock': TextBlockAnnotation,
};

/* Default sizes per type, used when AI doesn't specify size */
export const DEFAULT_SIZES = {
    'uml.Actor':          { width: 60,  height: 100 },
    'uml.UseCase':        { width: 160, height: 60  },
    'uml.SystemBoundary': { width: 420, height: 320 },
    'uml.StartNode':      { width: 30,  height: 30  },
    'uml.EndState':       { width: 36,  height: 36  },
    'uml.ActionState':    { width: 160, height: 50  },
    'uml.DecisionNode':   { width: 100, height: 60  },
    'uml.ForkBar':        { width: 140, height: 12  },
    'dfd.Process':        { width: 120, height: 80  },
    'dfd.DataStore':      { width: 160, height: 50  },
    'dfd.ExternalEntity': { width: 120, height: 60  },
    'standard.Rectangle': { width: 160, height: 60  },
    // Phase 3
    'uml.Note':           { width: 180, height: 70  },
    'uml.Constraint':     { width: 180, height: 36  },
    'standard.TextBlock': { width: 200, height: 40  },
};

/*
 * CELL_NAMESPACE — passed as `cellViewNamespace` to joint.dia.Paper and as
 * `cellNamespace` to joint.dia.Graph.
 *
 * JointJS resolves a cell of type "uml.Actor" by looking up:
 *   namespace['uml']['Actor']        ← model constructor
 *   namespace['uml']['ActorView']    ← view constructor (optional; falls back to ElementView)
 *
 * Because joint.shapes.uml is a getter-only property we can't write to it,
 * so we build a plain namespace object that shadows it, copying in the
 * standard shapes AND injecting our custom constructors under their namespaces.
 */
export const CELL_NAMESPACE = (() => {
    // Start with a copy of joint.shapes (standard, basic, etc.)
    const ns = Object.assign({}, joint.shapes);

    // Inject our uml shapes into the uml sub-namespace
    ns.uml = Object.assign({}, ns.uml || {}, {
        Actor:          UmlActor,
        UseCase:        UmlUseCase,
        SystemBoundary: UmlSystemBoundary,
        StartNode:      UmlStartNode,
        EndState:       UmlEndState,
        ActionState:    UmlActionState,
        DecisionNode:   UmlDecisionNode,
        ForkBar:        UmlForkBar,
        Note:           UmlNote,
        Constraint:     UmlConstraint,
    });

    // Inject dfd shapes
    ns.dfd = Object.assign({}, ns.dfd || {}, {
        Process:        DfdProcess,
        DataStore:      DfdDataStore,
        ExternalEntity: DfdExternalEntity,
    });

    return ns;
})();

/* Backwards-compat: App.jsx calls initShapes() in useEffect */
export const initShapes = () => { /* no-op — shapes registered at import time */ };
