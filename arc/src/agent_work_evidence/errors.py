class EvidenceError(RuntimeError):
    """Base class for user-facing evidence CLI errors."""


class GitHubCommandError(EvidenceError):
    """Raised when gh returns an error."""
