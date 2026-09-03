import models

# Previously the 10% (client_draft, brief, negotiation, scam_gray) went to Claude.
# As of 2026-08-14 the desk runs local Qwen 3.8 for all of it. Approval console still gates sends.
ESCALATE_TASKS = set()


def run(task, system, user, *, escalate=False, low_confidence=False,
        temperature=0.3, max_tokens=1400):
    """All tasks run on local Qwen 3.8. escalate/low_confidence are ignored."""
    return models.local_complete(system, user, temperature, max_tokens), "local"
