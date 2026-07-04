import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   Shape catalogue grouped by diagram type.
   Each entry has: type (JointJS type string), label, icon (fn of darkMode).
═══════════════════════════════════════════════════════════════════════════ */
const SHAPE_GROUPS = [
    {
        id: 'usecase', label: 'Use Case',
        /* light */ color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe',
        /* dark  */ darkColor: '#818cf8', darkBg: 'transparent', darkBorder: '#3730a3',
        shapes: [
            {
                type: 'uml.Actor', label: 'Actor',
                icon: (dark) => (
                    <svg viewBox="0 0 40 60" fill="none" style={{ width: 28, height: 40 }}>
                        <circle cx="20" cy="9"  r="8"  stroke={dark ? '#818cf8' : '#1a1a2e'} strokeWidth="2" fill={dark ? '#1c2033' : 'white'} />
                        <line x1="20" y1="17" x2="20" y2="38" stroke={dark ? '#818cf8' : '#1a1a2e'} strokeWidth="2" strokeLinecap="round" />
                        <line x1="5"  y1="27" x2="35" y2="27" stroke={dark ? '#818cf8' : '#1a1a2e'} strokeWidth="2" strokeLinecap="round" />
                        <line x1="20" y1="38" x2="7"  y2="53" stroke={dark ? '#818cf8' : '#1a1a2e'} strokeWidth="2" strokeLinecap="round" />
                        <line x1="20" y1="38" x2="33" y2="53" stroke={dark ? '#818cf8' : '#1a1a2e'} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                ),
            },
            {
                type: 'uml.UseCase', label: 'Use Case',
                icon: (dark) => (
                    <svg viewBox="0 0 80 36" fill="none" style={{ width: 64, height: 28 }}>
                        <ellipse cx="40" cy="18" rx="38" ry="16" fill={dark ? '#1e2040' : '#e8f4fd'} stroke={dark ? '#818cf8' : '#2563eb'} strokeWidth="2" />
                        <text x="40" y="22" textAnchor="middle" fontSize="8" fill={dark ? '#c7d2fe' : '#1e3a5f'} fontFamily="sans-serif">Use Case</text>
                    </svg>
                ),
            },
            {
                type: 'uml.SystemBoundary', label: 'System Boundary',
                icon: (dark) => (
                    <svg viewBox="0 0 64 44" fill="none" style={{ width: 52, height: 36 }}>
                        <rect x="2" y="2" width="60" height="40" rx="3"
                            fill={dark ? 'rgba(129,140,248,0.08)' : 'rgba(219,234,254,0.25)'}
                            stroke={dark ? '#818cf8' : '#1d4ed8'}
                            strokeWidth="2" strokeDasharray="6 3" />
                        <text x="32" y="14" textAnchor="middle" fontSize="8" fill={dark ? '#818cf8' : '#1d4ed8'} fontFamily="sans-serif">System</text>
                    </svg>
                ),
            },
            {
                type: 'ucrel.Association', label: 'Association',
                icon: (dark) => (
                    <svg viewBox="0 0 80 20" fill="none" style={{ width: 60, height: 18 }}>
                        <line x1="4" y1="10" x2="76" y2="10" stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="2" />
                    </svg>
                ),
            },
            {
                type: 'ucrel.Include', label: '«include»',
                icon: (dark) => (
                    <svg viewBox="0 0 80 24" fill="none" style={{ width: 60, height: 20 }}>
                        <text x="36" y="8" textAnchor="middle" fontSize="8" fontStyle="italic" fill={dark ? '#8891b4' : '#6b7280'} fontFamily="sans-serif">«include»</text>
                        <line x1="4" y1="17" x2="64" y2="17" stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="2" strokeDasharray="5 3" />
                        <path d="M64,12 76,17 64,22" stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="2" fill="none" />
                    </svg>
                ),
            },
            {
                type: 'ucrel.Extend', label: '«extend»',
                icon: (dark) => (
                    <svg viewBox="0 0 80 24" fill="none" style={{ width: 60, height: 20 }}>
                        <text x="36" y="8" textAnchor="middle" fontSize="8" fontStyle="italic" fill={dark ? '#8891b4' : '#6b7280'} fontFamily="sans-serif">«extend»</text>
                        <line x1="4" y1="17" x2="64" y2="17" stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="2" strokeDasharray="5 3" />
                        <path d="M64,12 76,17 64,22" stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="2" fill="none" />
                    </svg>
                ),
            },
            {
                type: 'ucrel.Generalization', label: 'Generalization',
                icon: (dark) => (
                    <svg viewBox="0 0 80 20" fill="none" style={{ width: 60, height: 18 }}>
                        <line x1="4" y1="10" x2="62" y2="10" stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="2" />
                        <polygon points="62,4 78,10 62,16" fill={dark ? '#161925' : 'white'} stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="2" />
                    </svg>
                ),
            },
        ],
    },
    {
        id: 'activity', label: 'Activity',
        /* light */ color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0',
        /* dark  */ darkColor: '#34d399', darkBg: 'transparent', darkBorder: '#065f46',
        shapes: [
            {
                type: 'uml.StartNode', label: 'Start Node',
                icon: (dark) => (
                    <svg viewBox="0 0 30 30" fill="none" style={{ width: 26, height: 26 }}>
                        <circle cx="15" cy="15" r="13" fill={dark ? '#34d399' : '#111827'} />
                    </svg>
                ),
            },
            {
                type: 'uml.EndState', label: 'End State',
                icon: (dark) => (
                    <svg viewBox="0 0 36 36" fill="none" style={{ width: 30, height: 30 }}>
                        <circle cx="18" cy="18" r="16" fill={dark ? '#1c2033' : 'white'} stroke={dark ? '#34d399' : '#111827'} strokeWidth="2" />
                        <circle cx="18" cy="18" r="10" fill={dark ? '#34d399' : '#111827'} />
                    </svg>
                ),
            },
            {
                type: 'uml.ActionState', label: 'Action State',
                icon: (dark) => (
                    <svg viewBox="0 0 80 36" fill="none" style={{ width: 60, height: 28 }}>
                        <rect x="2" y="2" width="76" height="32" rx="14"
                            fill={dark ? 'rgba(52,211,153,0.1)' : '#f0fdf4'} stroke={dark ? '#34d399' : '#16a34a'} strokeWidth="2" />
                        <text x="40" y="22" textAnchor="middle" fontSize="8" fill={dark ? '#6ee7b7' : '#14532d'} fontFamily="sans-serif">Action</text>
                    </svg>
                ),
            },
            {
                type: 'uml.DecisionNode', label: 'Decision',
                icon: (dark) => (
                    <svg viewBox="0 0 60 40" fill="none" style={{ width: 48, height: 32 }}>
                        <polygon points="30,2 58,20 30,38 2,20"
                            fill={dark ? 'rgba(251,191,36,0.1)' : '#fffbeb'} stroke={dark ? '#fbbf24' : '#d97706'} strokeWidth="2" />
                        <text x="30" y="24" textAnchor="middle" fontSize="10" fill={dark ? '#fde68a' : '#92400e'} fontFamily="sans-serif">?</text>
                    </svg>
                ),
            },
            {
                type: 'uml.ForkBar', label: 'Fork / Join',
                icon: (dark) => (
                    <svg viewBox="0 0 80 30" fill="none" style={{ width: 60, height: 24 }}>
                        <line x1="40" y1="0" x2="40" y2="10" stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="1.5" />
                        <rect x="8" y="11" width="64" height="8" rx="2" fill={dark ? '#34d399' : '#111827'} />
                        <line x1="24" y1="19" x2="24" y2="30" stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="1.5" />
                        <line x1="56" y1="19" x2="56" y2="30" stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="1.5" />
                    </svg>
                ),
            },
            {
                type: 'uml.Constraint', label: 'Guard / Constraint',
                icon: (dark) => (
                    <svg viewBox="0 0 80 26" fill="none" style={{ width: 60, height: 22 }}>
                        <rect x="2" y="2" width="76" height="22" rx="11"
                            fill={dark ? 'rgba(52,211,153,0.08)' : '#eff6ff'} stroke={dark ? '#34d399' : '#2563eb'} strokeWidth="1.5" strokeDasharray="4 3" />
                        <text x="40" y="17" textAnchor="middle" fontSize="9" fontStyle="italic" fill={dark ? '#6ee7b7' : '#1e3a5f'} fontFamily="sans-serif">[guard]</text>
                    </svg>
                ),
            },
        ],
    },
    {
        id: 'dfd', label: 'DFD',
        /* light */ color: '#d97706', bg: '#fffbeb', border: '#fde68a',
        /* dark  */ darkColor: '#fbbf24', darkBg: 'transparent', darkBorder: '#92400e',
        shapes: [
            {
                type: 'dfd.Process', label: 'Process',
                icon: (dark) => (
                    <svg viewBox="0 0 80 50" fill="none" style={{ width: 60, height: 38 }}>
                        <ellipse cx="40" cy="25" rx="37" ry="22"
                            fill={dark ? 'rgba(251,191,36,0.1)' : '#fefce8'} stroke={dark ? '#fbbf24' : '#ca8a04'} strokeWidth="2" />
                        <text x="40" y="29" textAnchor="middle" fontSize="8" fill={dark ? '#fde68a' : '#713f12'} fontFamily="sans-serif">Process</text>
                    </svg>
                ),
            },
            {
                type: 'dfd.DataStore', label: 'Data Store',
                icon: (dark) => (
                    <svg viewBox="0 0 80 30" fill="none" style={{ width: 60, height: 24 }}>
                        <rect x="0" y="0" width="80" height="30" fill={dark ? '#1c2033' : '#f9fafb'} />
                        <line x1="2" y1="3"  x2="78" y2="3"  stroke={dark ? '#fbbf24' : '#374151'} strokeWidth="2.5" />
                        <line x1="2" y1="27" x2="78" y2="27" stroke={dark ? '#fbbf24' : '#374151'} strokeWidth="2.5" />
                        <text x="40" y="19" textAnchor="middle" fontSize="7" fill={dark ? '#fde68a' : '#1f2937'} fontFamily="sans-serif">Data Store</text>
                    </svg>
                ),
            },
            {
                type: 'dfd.ExternalEntity', label: 'External Entity',
                icon: (dark) => (
                    <svg viewBox="0 0 64 40" fill="none" style={{ width: 52, height: 32 }}>
                        <rect x="2" y="2" width="60" height="36" rx="2"
                            fill={dark ? '#1c2033' : '#f1f5f9'} stroke={dark ? '#fbbf24' : '#475569'} strokeWidth="2" />
                        <text x="32" y="23" textAnchor="middle" fontSize="7.5" fill={dark ? '#fde68a' : '#1e293b'} fontFamily="sans-serif">Entity</text>
                    </svg>
                ),
            },
            {
                type: 'dfd.Flow', label: 'Data Flow',
                icon: (dark) => (
                    <svg viewBox="0 0 80 24" fill="none" style={{ width: 60, height: 20 }}>
                        <text x="36" y="8" textAnchor="middle" fontSize="8" fontStyle="italic" fill={dark ? '#fbbf24' : '#ca8a04'} fontFamily="sans-serif">data</text>
                        <line x1="4" y1="17" x2="64" y2="17" stroke={dark ? '#fbbf24' : '#ca8a04'} strokeWidth="2" />
                        <polygon points="64,12 78,17 64,22" fill={dark ? '#fbbf24' : '#ca8a04'} />
                    </svg>
                ),
            },
        ],
    },
    {
        id: 'general', label: 'General',
        /* light */ color: '#4b5563', bg: '#f9fafb', border: '#e5e7eb',
        /* dark  */ darkColor: '#94a3b8', darkBg: 'transparent', darkBorder: '#2a2f45',
        shapes: [
            {
                type: 'standard.Rectangle', label: 'Rectangle',
                icon: (dark) => (
                    <svg viewBox="0 0 80 36" fill="none" style={{ width: 60, height: 28 }}>
                        <rect x="2" y="2" width="76" height="32" rx="6"
                            fill={dark ? '#1e2040' : '#dbeafe'} stroke={dark ? '#818cf8' : '#2563eb'} strokeWidth="2" />
                        <text x="40" y="22" textAnchor="middle" fontSize="8" fill={dark ? '#c7d2fe' : '#1e3a5f'} fontFamily="sans-serif">Rectangle</text>
                    </svg>
                ),
            },
            {
                type: 'standard.Link', label: 'Straight Arrow',
                icon: (dark) => (
                    <svg viewBox="0 0 80 20" fill="none" style={{ width: 60, height: 18 }}>
                        <line x1="4"  y1="10" x2="64" y2="10" stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="2" />
                        <polygon points="64,5 78,10 64,15" fill={dark ? '#8891b4' : '#6b7280'} />
                    </svg>
                ),
            },
            {
                type: 'curved.Link', label: 'Curved Arrow',
                icon: (dark) => (
                    <svg viewBox="0 0 80 20" fill="none" style={{ width: 60, height: 18 }}>
                        <path d="M4,15 C30,0 40,25 64,10" stroke={dark ? '#8891b4' : '#6b7280'} strokeWidth="2" fill="none" />
                        <polygon points="64,5 78,10 64,15" fill={dark ? '#8891b4' : '#6b7280'} />
                    </svg>
                ),
            },
            {
                type: 'uml.Note', label: 'Note',
                icon: (dark) => (
                    <svg viewBox="0 0 64 40" fill="none" style={{ width: 52, height: 32 }}>
                        <polygon points="2,2 52,2 62,12 62,38 2,38"
                            fill={dark ? 'rgba(251,191,36,0.08)' : '#fefce8'} stroke={dark ? '#fbbf24' : '#ca8a04'} strokeWidth="1.5" />
                        <polygon points="52,2 52,12 62,12" fill={dark ? 'rgba(251,191,36,0.25)' : '#fef08a'} stroke={dark ? '#fbbf24' : '#ca8a04'} strokeWidth="1.5" />
                        <text x="30" y="25" textAnchor="middle" fontSize="8" fill={dark ? '#fde68a' : '#713f12'} fontFamily="sans-serif">Note</text>
                    </svg>
                ),
            },
            {
                type: 'standard.TextBlock', label: 'Text',
                icon: (dark) => (
                    <svg viewBox="0 0 80 30" fill="none" style={{ width: 60, height: 24 }}>
                        <rect x="2" y="2" width="76" height="26" rx="4"
                            fill="transparent" stroke={dark ? '#8891b4' : '#94a3b8'} strokeWidth="1" strokeDasharray="4 3" />
                        <text x="40" y="20" textAnchor="middle" fontSize="9" fontStyle="italic" fill={dark ? '#8891b4' : '#64748b'} fontFamily="sans-serif">Text…</text>
                    </svg>
                ),
            },
        ],
    },
];

/* ═══════════════════════════════════════════════════════════════════════════
   Toolbox Component
═══════════════════════════════════════════════════════════════════════════ */
const Toolbox = ({ onAddShape, darkMode }) => {
    const [openGroups, setOpenGroups] = useState(
        Object.fromEntries(SHAPE_GROUPS.map(g => [g.id, true]))
    );

    const toggle = (id) =>
        setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));

    const dm = darkMode;

    return (
        <aside style={{
            width: '184px', minWidth: '184px',
            background: dm ? '#161925' : '#ffffff',
            borderRight: dm ? '1px solid #2a2f45' : '1px solid #e5e7eb',
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
            boxShadow: dm ? '2px 0 16px rgba(0,0,0,0.5)' : '2px 0 8px rgba(0,0,0,0.08)',
            transition: 'background 0.2s, border-color 0.2s',
        }}>

            {/* Header */}
            <div style={{
                padding: '12px 12px 10px',
                borderBottom: dm ? '1px solid #2a2f45' : '1px solid #f3f4f6',
                background: dm
                    ? 'linear-gradient(160deg, #1c2033 0%, #161925 100%)'
                    : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            }}>
                <p style={{
                    margin: 0, fontSize: '9px', letterSpacing: '0.12em',
                    textTransform: 'uppercase', fontWeight: '800',
                    color: dm ? '#555e7f' : '#94a3b8',
                    fontFamily: 'Inter, sans-serif',
                }}>
                    🧰 Toolbox
                </p>
                <p style={{
                    margin: '3px 0 0', fontSize: '10px',
                    color: dm ? '#2a2f45' : '#cbd5e1',
                    fontFamily: 'Inter, sans-serif',
                }}>
                    Click to add shape
                </p>
            </div>

            {/* Shape groups */}
            {SHAPE_GROUPS.map(function(group) {
                var gc  = dm ? group.darkColor  : group.color;
                var gbg = dm ? group.darkBg     : group.bg;
                var gbd = dm ? group.darkBorder : group.border;
                return (
                <div key={group.id}>
                    {/* Group header / toggle */}
                    <button
                        onClick={() => toggle(group.id)}
                        style={{
                            width: '100%', display: 'flex',
                            alignItems: 'center', justifyContent: 'space-between',
                            padding: '7px 12px',
                            background: dm ? '#1c2033' : gbg,
                            border: 'none',
                            borderBottom: `1px solid ${dm ? '#2a2f45' : gbd}`,
                            borderTop: `1px solid ${dm ? '#2a2f45' : gbd}`,
                            cursor: 'pointer',
                            color: gc,
                            fontSize: '10px', fontWeight: '800',
                            letterSpacing: '0.07em',
                            fontFamily: 'Inter, sans-serif',
                        }}
                    >
                        <span>{group.label.toUpperCase()}</span>
                        {openGroups[group.id]
                            ? <ChevronDown size={11} />
                            : <ChevronRight size={11} />
                        }
                    </button>

                    {/* Shape buttons */}
                    {openGroups[group.id] && (
                        <div style={{
                            padding: '6px 8px',
                            display: 'flex', flexDirection: 'column', gap: '2px',
                            background: dm ? '#0d0f17' : 'transparent',
                            borderBottom: `1px solid ${dm ? '#2a2f45' : gbd}`,
                        }}>
                            {group.shapes.map(shape => (
                                <button
                                    key={shape.type}
                                    id={'toolbox-' + shape.type.replace('.', '-')}
                                    title={'Add ' + shape.label + ' to canvas'}
                                    onClick={() => onAddShape(shape.type)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '6px 8px', borderRadius: '8px',
                                        border: '1px solid transparent',
                                        background: 'transparent',
                                        cursor: 'pointer', textAlign: 'left',
                                        transition: 'all 0.15s ease', width: '100%',
                                    }}
                                    onMouseEnter={function(e) {
                                        e.currentTarget.style.background  = dm ? '#1c2033' : gbg;
                                        e.currentTarget.style.borderColor = gbd;
                                        e.currentTarget.style.transform   = 'translateX(2px)';
                                    }}
                                    onMouseLeave={function(e) {
                                        e.currentTarget.style.background  = 'transparent';
                                        e.currentTarget.style.borderColor = 'transparent';
                                        e.currentTarget.style.transform   = 'translateX(0)';
                                    }}
                                    onMouseDown={function(e) {
                                        e.currentTarget.style.transform = 'scale(0.96)';
                                    }}
                                    onMouseUp={function(e) {
                                        e.currentTarget.style.transform = 'translateX(2px)';
                                    }}
                                >
                                    {/* Icon */}
                                    <div style={{
                                        flexShrink: 0, width: '44px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {shape.icon(dm)}
                                    </div>
                                    {/* Label */}
                                    <span style={{
                                        fontSize: '11px',
                                        color: dm ? '#8891b4' : '#374151',
                                        lineHeight: 1.3, fontFamily: 'Inter, sans-serif',
                                    }}>
                                        {shape.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ); })}
        </aside>
    );
};

export default Toolbox;
