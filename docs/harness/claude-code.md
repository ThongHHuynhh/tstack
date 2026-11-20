# tstack in Claude Code and Codex

tstack skills use Cursor names. In Claude Code or Codex, read this file once per session, then map each Cursor name in a skill with the tables below. `<tstack>` means the folder that holds `skills/` and `docs/`. If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects.

## Tools

| Cursor | Claude Code | Codex |
| --- | --- | --- |
| `Task` | `Agent` | `spawn_agent` with a `task_name` and `fork_turns: "none"`. Collect the result with `wait_agent`. |
| `AskQuestion` | `AskUserQuestion`. In `-p` mode it is absent, so ask in plain text. | `request_user_input` in Plan mode, else `request_user_input_async` when the session offers it, else ask in plain text. |
| Open a todolist, or copy steps into the todolist tool | Use `TodoWrite` if the session offers it. Otherwise keep the list in your reply and update it at each phase. | Keep the list in your reply and update it at each phase. |
| Run another tstack skill (`/name` or "the **name** skill") | `Read` `<tstack>/skills/<name>/SKILL.md` and follow it. The `Skill` tool refuses most tstack skills. When you tell the user to type it, write `/tstack:<name>`. | Read `<tstack>/skills/<name>/SKILL.md` and follow it. When you tell the user to type it, write `$tstack:<name>`. |
| `Grep`, `Glob` | `Bash` with `rg` when the session has no `Grep` or `Glob`. | `rg` in the shell. |

## Subagent fields

| Cursor | Claude Code | Codex |
| --- | --- | --- |
| `subagent_type: generalPurpose` | `subagent_type: "general-purpose"` | `spawn_agent`. Codex has no agent type field. |
| `t-agent`, `comment-sicko` | `tstack:t-agent`, `tstack:comment-sicko` | `spawn_agent` whose brief, after the `worker.md` line, says `Read <tstack>/agents/t-agent.md and follow it.` (or `comment-sicko.md`). Codex does not load tstack's agent files. |
| The `model:` line in `t-agent`'s file | It holds a Cursor slug. Pass `model` and `effort` on every `Agent` call that spawns `tstack:t-agent`, mapped with the Models table, so that slug never reaches the API. | Pass `model` and `reasoning_effort` mapped with the Models table. |
| `readonly: true` | `subagent_type: "Explore"`. It keeps `Bash`, so the brief also says "do not edit files", and you check `git status` afterward. | `spawn_agent` whose brief says "do not edit files". Codex has no per-agent read-only sandbox, so check `git status` afterward. |
| `readonly: false` | `general-purpose`. It keeps the session's MCP servers. | `spawn_agent`. It keeps the session's MCP servers. |
| `environment: "cloud"` | `isolation: "worktree"`. Name the branch or commit the worker checks out. | Create a git worktree first, then give the worker its path and the branch or commit to check out. |
| `environment: "local"` | Omit. | Omit. |
| `cloud_base_branch: <b>` | Tell the worker to check out `<b>` first. | Tell the worker to check out `<b>` first. |
| `run_in_background: true` | Omit. Subagents run in the background by default and notify you when they finish. | Omit. `spawn_agent` returns at once. Collect results with `wait_agent`. |
| `resume` | Spawn a new agent and paste the earlier result into its brief. | `followup_task` to the live agent, or a new `spawn_agent` with the earlier result in its brief. |
| `file_attachments` | List the paths in the brief. | List the paths in the brief. |

## Models

| Cursor | Claude Code | Codex |
| --- | --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | `model: "opus"` and `effort: "xhigh"`. `model` takes only `opus`, `sonnet`, `haiku`, `fable`. Drop `-fast`. | Claude models are not available. Omit `model` and set `reasoning_effort` to the slug's effort. |
| A `gemini-*` or other non-Claude slug | Omit `model` so the agent runs on the session model, and say so. | Omit `model` so the agent runs on the session model, and say so. |
| `auto` or `inherit-parent` | Omit `model`. | Omit `model`. |
| The `tstack-models.mdc` rule, `~/.cursor/rules/tstack-models.mdc` | `~/.claude/rules/tstack-models.md`. Claude Code loads it into every new session, so its role lines are already in context. If they are not, read the file. If the file or the role's line is missing, use the skill's default slug. | `~/.codex/tstack-models.md`. Codex does not load it, so read it before you pick a role's model. If the file or the role's line is missing, use the skill's default slug. |
| A role value `<model> <effort>`, such as `opus high` | `model: "opus"` and `effort: "high"`. | `model` and `reasoning_effort`, such as `model: "gpt-6.2-astra"` and `reasoning_effort: "xhigh"`. |

## setup-tstack

Claude Code loads every `.md` file in `~/.claude/rules/` into each new session, so `setup-tstack` writes its rule there. Follow its steps with these changes:

- Detect. The detected models are the `model` values that the `Agent` tool schema lists, each with an effort from its `effort` values. Write a real model as `<model> <effort>`, such as `opus xhigh`. The effort is the last token, so the budget step works as written.
- Defaults. Map each default slug with the rows above: `claude-opus-5-5-xhigh-fast` is `opus xhigh`, `claude-opus-5-5-high-fast` is `opus high`, `claude-fable-5-2-high` is `fable high`, and `gemini-4-neon-xhigh` is `inherit-parent`.
- Write. Write `~/.claude/rules/tstack-models.md` with no frontmatter, then the comment lines, the `# budget` line, and one line per role from step 5. Overwrite the whole file. Never put the role lines in `CLAUDE.md` or `AGENTS.md`.

In Codex, follow the same steps with these changes:

- Detect. The detected models are the models and reasoning efforts that the `spawn_agent` description lists. Write a real model as `<model> <effort>`, such as `gpt-6.2-astra xhigh`.
- Defaults. Every default slug is `inherit-parent`, because Codex runs no Claude or Gemini model.
- Write. Write `~/.codex/tstack-models.md` the same way as in Claude Code. Never put the role lines in `AGENTS.md`.

## Paths

| Cursor | Claude Code | Codex |
| --- | --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.claude/skills/`, `~/.claude/skills/` | `.agents/skills/`, `~/.agents/skills/` |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `~/.claude/plugins/`, `.claude-plugin/plugin.json` | `~/.codex/plugins/`, `plugin.json` at the plugin root |
| `.cursor/rules/*.mdc`, always-applied rules | `CLAUDE.md`, or `AGENTS.md` when no `CLAUDE.md` exists. Claude Code never reads `.mdc` files. The model rule is the exception. See Models. | `AGENTS.md`. Codex never reads `.mdc` files. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<tstack>/<path>` when that file exists. The plugin ships the skills, `docs/guide/`, and `README.md`. Read the local copy and never fetch it. Give the user the URL when they need a link. | Same as Claude Code. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `~/.claude/projects/<slug>/<session>.jsonl`. The slug is the workspace path with each `/` and `.` changed to `-`, so `/Users/you/proj` is `-Users-you-proj`. The newest `.jsonl` directly in that folder is the current session. Its `<session>/subagents/` folder holds subagent transcripts. Read only this workspace's folder. | `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`. Keep only files whose first line, a `session_meta` record, has this workspace's `cwd`. Read only those. |

## Cursor-only features

Claude Code and Codex have no Cursor Automations, Bugbot, Cursor cloud agents, or built-in PR tool. When a step needs one, put one line in your reply, `Skipped in <Claude Code or Codex>: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL or a key, leave a placeholder and name it in the line.

| Cursor | Claude Code and Codex |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command that the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | `environment: "cloud"` maps to a worktree, as in Subagent fields. Skip a step that needs the cloud agent itself, such as its dashboard status or its own machine. |
| A built-in PR tool | Use the forge command that the step gives, such as `gh pr create`. That is not a skip, so write no line. |
