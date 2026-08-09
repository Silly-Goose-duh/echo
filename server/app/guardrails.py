"""Hard safety pre-filter — runs BEFORE the therapist LLM call."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Short enough to speak aloud cleanly. India-first resources + global fallbacks.
CRISIS_MESSAGE = (
    "I hear you, and I'm really glad you said something. "
    "I'm not a crisis line, and you deserve real help right now. "
    "In India, please call Kiran at 1800-599-0019, or Tele-MANAS at 14416 — "
    "both free and 24/7. "
    "You can also try iCall at 9152987821, or Vandrevala at 9999666555. "
    "If you're outside India, call your local emergency number, 988 in the US, "
    "or find a local line at findahelpline.com. "
    "I'm still here with you."
)

DIAGNOSIS_MESSAGE = (
    "I can't give you a diagnosis — that needs a real clinician who knows you. "
    "I can sit with how this feels though. "
    "What's been the hardest part lately?"
)

MED_MESSAGE = (
    "I can't give medication advice — that's for a doctor. "
    "I can still talk about how you're feeling. "
    "What's going on under that question?"
)

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
        r"\b(can't go on|cannot go on)\b",
        r"\beveryone would be better off\b",
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
    kind: str  # crisis | diagnosis | med | ok
    message: str = ""


def check_message(text: str) -> GuardResult:
    t = (text or "").strip()
    if not t:
        return GuardResult(blocked=False, kind="ok")

    for pat in _CRISIS_PATTERNS:
        if pat.search(t):
            return GuardResult(blocked=True, kind="crisis", message=CRISIS_MESSAGE)

    for pat in _DIAGNOSIS_PATTERNS:
        if pat.search(t):
            return GuardResult(blocked=True, kind="diagnosis", message=DIAGNOSIS_MESSAGE)

    for pat in _MED_PATTERNS:
        if pat.search(t):
            return GuardResult(blocked=True, kind="med", message=MED_MESSAGE)

    return GuardResult(blocked=False, kind="ok")
