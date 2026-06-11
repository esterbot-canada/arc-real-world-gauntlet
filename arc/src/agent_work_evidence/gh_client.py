import json
import subprocess
from typing import Any

from agent_work_evidence.errors import GitHubCommandError


def run_gh(args: list[str]) -> str:
    completed = subprocess.run(
        ["gh", *args],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode != 0:
        raise GitHubCommandError(completed.stderr.strip() or "gh command failed")
    return completed.stdout


def parse_pr_view(repo: str, number: int, raw: str) -> dict[str, Any]:
    data = json.loads(raw)
    return {
        "repo": repo,
        "number": number,
        "title": data.get("title") or "",
        "body": data.get("body") or "",
        "branch": data.get("headRefName") or "",
        "head_sha": data.get("headRefOid") or "",
        "author": (data.get("author") or {}).get("login") or "",
    }


def fetch_pr_view(repo: str, number: int) -> dict[str, Any]:
    raw = run_gh([
        "pr",
        "view",
        str(number),
        "--repo",
        repo,
        "--json",
        "title,body,headRefName,headRefOid,author",
    ])
    return parse_pr_view(repo, number, raw)


def fetch_pr_files(repo: str, number: int) -> list[dict[str, Any]]:
    raw = run_gh([
        "pr",
        "view",
        str(number),
        "--repo",
        repo,
        "--json",
        "files",
    ])
    return json.loads(raw).get("files") or []


def fetch_pr_checks(repo: str, number: int) -> list[dict[str, Any]]:
    raw = run_gh([
        "pr",
        "view",
        str(number),
        "--repo",
        repo,
        "--json",
        "statusCheckRollup",
    ])
    return json.loads(raw).get("statusCheckRollup") or []


def _repo_parts(repo: str) -> tuple[str, str]:
    owner, name = repo.split("/", 1)
    return owner, name


def _api_url(repo: str, number: int, suffix: str) -> str:
    owner, name = _repo_parts(repo)
    return f"repos/{owner}/{name}/{suffix.format(number=number)}"


def _user_login(item: dict[str, Any]) -> str:
    return ((item.get("user") or {}).get("login") or "").strip()


def parse_pr_review_comments(raw: str) -> list[dict[str, Any]]:
    comments = json.loads(raw) or []
    return [
        {
            "source": "review_comment",
            "author": _user_login(item),
            "body": item.get("body") or "",
            "path": item.get("path") or "",
            "url": item.get("html_url") or "",
        }
        for item in comments
        if item.get("body")
    ]


def parse_issue_comments(raw: str) -> list[dict[str, Any]]:
    comments = json.loads(raw) or []
    return [
        {
            "source": "issue_comment",
            "author": _user_login(item),
            "body": item.get("body") or "",
            "path": "",
            "url": item.get("html_url") or "",
        }
        for item in comments
        if item.get("body")
    ]


def parse_pr_reviews(raw: str) -> list[dict[str, Any]]:
    reviews = json.loads(raw) or []
    return [
        {
            "source": "pull_request_review",
            "author": _user_login(item),
            "body": item.get("body") or "",
            "path": "",
            "url": item.get("html_url") or "",
            "state": item.get("state") or "",
        }
        for item in reviews
        if item.get("body")
    ]


def fetch_pr_review_comments(repo: str, number: int) -> list[dict[str, Any]]:
    raw = run_gh(["api", _api_url(repo, number, "pulls/{number}/comments")])
    return parse_pr_review_comments(raw)


def fetch_pr_issue_comments(repo: str, number: int) -> list[dict[str, Any]]:
    raw = run_gh(["api", _api_url(repo, number, "issues/{number}/comments")])
    return parse_issue_comments(raw)


def fetch_pr_reviews(repo: str, number: int) -> list[dict[str, Any]]:
    raw = run_gh(["api", _api_url(repo, number, "pulls/{number}/reviews")])
    return parse_pr_reviews(raw)


def fetch_pr_commits(repo: str, number: int) -> list[dict[str, Any]]:
    raw = run_gh([
        "pr",
        "view",
        str(number),
        "--repo",
        repo,
        "--json",
        "commits",
    ])
    return json.loads(raw).get("commits") or []


def fetch_pr_diff(repo: str, number: int) -> str:
    return run_gh(["pr", "diff", str(number), "--repo", repo, "--patch"])
