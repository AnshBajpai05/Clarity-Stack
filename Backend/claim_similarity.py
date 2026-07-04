"""Shared near-duplicate claim matcher (§18.1 — cockpit redundancy fix).

Problem observed in the Decision Cockpit: the 3-model ensemble phrases the SAME
decision three ways ("adopt a gradual improvement approach…", "continue with the
current workflow while making gradual improvements…", …). Plain Jaccard@0.5 over raw
tokens — what agreement.py and the KG builder used — scores paraphrases at ~0.15–0.35
because of inflection ("improvement"/"improvements"/"improving", "gradual"/"gradually")
and elaboration (a short restatement inside a longer one). Result: every paraphrase
became its own KG node and its own "contested lone claim", so the cockpit rendered the
same decision panel three times and reported 17/17 contested.

This module is the single seam for "are these two bullets the same claim?":
  * light deterministic suffix-stemming (no NLTK, no downloads, unit-testable);
  * similarity = max(Jaccard, containment overlap) — containment catches the
    short-restatement-inside-long-elaboration case Jaccard structurally punishes;
  * greedy in-order clustering, same shape as agreement.py's original.

Still purely lexical: a floor on semantic sameness, never an overclaim. Swapping in
embeddings later only has to replace `similarity()`.
"""
import re
from typing import Dict, List

# Two claims are "the same" at/above this similarity (kept at agreement.py's 0.5).
SIM_THRESHOLD = 0.5
# Containment overlap only counts when the smaller claim has at least this many stems —
# guards against short generic bullets ("improve the workflow") swallowing everything.
OVERLAP_MIN_TOKENS = 5

# Union of the stopword sets previously duplicated in agreement.py and
# knowledge_graph_builder.py — one canonical list.
STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with",
    "is", "are", "be", "as", "at", "by", "it", "this", "that", "will", "should",
    "must", "can", "may", "from", "into", "via", "using", "use", "used", "we",
    "our", "their", "its", "if", "then", "than", "so", "such", "not", "no",
}
_WORD = re.compile(r"[a-z0-9]+")

# Iteratively stripped suffixes (longest-first per pass). Deliberately small: enough to
# unify inflections seen in real ensemble output (improvements/improvement/improving,
# gradually/gradual, decided/decision, risks/risk) without a stemming library.
_SUFFIXES = ("ies", "ment", "ion", "ing", "ed", "ly", "es", "s")
_MIN_STEM = 3   # never strip a word below this many chars
_MAX_PASSES = 3


def stem(word: str) -> str:
    """Crude deterministic suffix-stripper. 'improvements'→'improv', 'gradually'→'gradual'."""
    w = word
    for _ in range(_MAX_PASSES):
        if w.endswith("ies") and len(w) - 2 >= _MIN_STEM:
            w = w[:-3] + "y"
            continue
        for suf in _SUFFIXES[1:]:
            if w.endswith(suf) and len(w) - len(suf) >= _MIN_STEM:
                w = w[: -len(suf)]
                break
        else:
            break
    # Normalize the trailing 'e' so improve/improving/improvement all land on 'improv'.
    if w.endswith("e") and len(w) - 1 >= _MIN_STEM:
        w = w[:-1]
    return w


def claim_tokens(text: str) -> set:
    """Stemmed content tokens: lowercased alphanumerics, stopwords/1-char dropped."""
    return {
        stem(t)
        for t in _WORD.findall((text or "").lower())
        if len(t) > 1 and t not in STOPWORDS
    }


def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    union = len(a | b)
    return len(a & b) / union if union else 0.0


def similarity(a: set, b: set) -> float:
    """max(Jaccard, guarded containment overlap) over stemmed token sets."""
    if not a or not b:
        return 0.0
    j = jaccard(a, b)
    smaller = min(len(a), len(b))
    if smaller >= OVERLAP_MIN_TOKENS:
        containment = len(a & b) / smaller
        return max(j, containment)
    return j


def same_claim(a: set, b: set) -> bool:
    return similarity(a, b) >= SIM_THRESHOLD


def single_link_clusters(token_sets: List[set]) -> List[List[int]]:
    """TRUE single-link clustering over all pairs (union-find), not one greedy pass.

    Greedy first-fit is order-sensitive: with phrasings A, B, C where sim(A,B) < t but
    sim(A,C) >= t and sim(B,C) >= t, processing order A,B,C leaves B stranded in its
    own cluster because nothing revisits it once C bridges A and B. Union-find merges
    transitively regardless of order. O(n^2) pairs — fine at IR scale (tens of claims).
    Empty token sets never match anything (each stays a singleton).
    """
    n = len(token_sets)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(n):
        if not token_sets[i]:
            continue
        for j in range(i + 1, n):
            if token_sets[j] and same_claim(token_sets[i], token_sets[j]):
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[rj] = ri

    groups: Dict[int, List[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    # Deterministic: clusters ordered by their first member's original position.
    return [groups[r] for r in sorted(groups, key=lambda r: groups[r][0])]


def cluster_texts(texts: List[str]) -> List[List[int]]:
    """Single-link clustering of bullets; returns clusters as index lists."""
    return single_link_clusters([claim_tokens(t) for t in texts])


def dedupe_texts(texts: List[str]) -> List[int]:
    """Indices of ONE representative per near-duplicate cluster, in original order.

    Representative = the SHORTEST member (usually the cleanest restatement — same
    convention as agreement.analyze_claims).
    """
    keep = []
    for idx in cluster_texts(texts):
        keep.append(min(idx, key=lambda i: len(texts[i])))
    return sorted(keep)


def dedupe_items(items: List[dict], key: str = "content") -> List[dict]:
    """Dedupe a list of dicts by near-duplicate `key` text, keeping first-seen order
    and the representative (shortest-text) member of each cluster."""
    texts = [str(it.get(key) or "") for it in items]
    return [items[i] for i in dedupe_texts(texts)]
