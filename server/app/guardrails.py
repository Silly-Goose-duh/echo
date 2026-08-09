"""Hard safety pre-filter — runs BEFORE the persona LLM call.

System prompts are requests, not constraints. Crisis hits here first and
return a fixed stabilization message with India crisis resources.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# India-first crisis resources (hardcoded, always available).
CRISIS_RESOURCES = (
    "If you're in immediate danger, contact local emergency services now.\n\n"
    "India support (right now):\n"
    "• Tele-MANAS: 14416 — government, 24/7, free, many languages\n"
    "• iCall (TISS): 9152987821 — 10am–8pm, Mon–Sat\n"
    "• Vandrevala Foundation: 9999666555 — 24/7 phone / text / chat\n\n"
    "If you're outside India: US 988 · UK Samaritans 116 123 · "
    "or your local emergency number.\n\n"
    "I'm still here with you. You don't have to go through this alone — "
    "and a real person on one of those lines can help more than I can right now."
)

CRISIS_OPENER = (
    "I hear that you're in a lot of pain, and I take what you just shared seriously.\n\n"
    "I'm not a crisis service or a substitute for emergency help. "
    "Please reach out to people who can support you in real time:\n\n"
)

# Strong patterns — self-harm, suicide, harm to others, acute crisis.
_CRISIS_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.I)
    for p in (
        r"\b(kill myself|killing myself|end my life|end it all)\b",
        r"\b(suicide|suicidal)\b",
        r"\b(want to die|wanna die|wish i (was|were) dead)\b",
        r"\b(self[-\s]?harm|cut myself|cutting myself|hurt myself)\b",
        r"\b(hang myself|overdose|od on purpose)\b",
        r"\b(i('m| am) going to (kill|hurt) (myself|him|her|them|someone))\b",
        r"\b(plan to (kill|hurt) (myself|someone))\b",
        r"\bi don't want to (be )?alive\b",
        r"\bno reason to live\b",
    )
]

_DIAGNOSIS_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.I)
    for p in (
        r"\b(diagnose me|what('s| is) wrong with me|do i have (depression|bipolar|adhd|ptsd|anxiety disorder))\b",
        r"\b(am i (depressed|bipolar|schizophrenic))\b",
    )
]

_MED_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.I)
    for p in (
        r"\b(should i take|what dose|dosage|prescribe|medication for|ssri|xanax|prozac)\b",
        r"\b(drug interaction|which pill)\b",
    )
]


@dataclass
class GuardResult:
    blocked: bool
    kind: str  # "crisis" | "diagnosis" | "med" | "ok"
    message: str = ""


def check_message(text: str) -> GuardResult:
    """Return a forced response when guardrails fire; else kind=ok."""
    t = (text or "").strip()
    if not t:
        return GuardResult(blocked=False, kind="ok")

    for pat in _CRISIS_PATTERNS:
        if pat.search(t):
            return GuardResult(
                blocked=True,
                kind="crisis",
                message=CRISIS_OPENER + CRISIS_RESOURCES,
            )

    for pat in _DIAGNOSIS_PATTERNS:
        if pat.search(t):
            return GuardResult(
                blocked=True,
                kind="diagnosis",
                message=(
                    "I can't diagnose you — I'm not a clinician, and a label from me "
                    "wouldn't be trustworthy or safe.\n\n"
                    "What I *can* do is sit with what you're living through in plain "
                    "language, and help you think about meaning, choice, and what "
                    "matters to you. A licensed professional is the right person for "
                    "assessment or treatment.\n\n"
                    "Want to tell me what's been heaviest lately — without needing a name for it?"
                ),
            )

    for pat in _MED_PATTERNS:
        if pat.search(t):
            return GuardResult(
                blocked=True,
                kind="med",
                message=(
                    "I can't give medication advice, dosages, or drug guidance — "
                    "that needs a doctor or psychiatrist who knows your history.\n\n"
                    "I can still talk with you about how you're feeling, what this "
                    "season of life means to you, and how you're carrying it. "
                    "What's going on under the question about meds?"
                ),
            )

    return GuardResult(blocked=False, kind="ok")
