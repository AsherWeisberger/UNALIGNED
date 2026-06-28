import models

# Tasks that always go to Claude (the judgment-heavy 10%).
ESCALATE_TASKS = {"client_draft", "scam_gray", "negotiation", "brief"}


def run(task, system, user, *, escalate=False, low_confidence=False,
        temperature=0.3, max_tokens=1400):
    """Route to Claude for the 10%, local for everything else."""
    if escalate or low_confidence or task in ESCALATE_TASKS:
        return models.claude_complete(system, user, temperature, max_tokens), "claude"
    return models.local_complete(system, user, temperature, max_tokens), "local"
