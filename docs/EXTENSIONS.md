# AURIX Skills, Plugins, Agents and MCP Specification

## 1. Purpose

AURIX needs one extension system that learns from Claude Code, Grok Build, OpenAI/Codex, Higgsfield and 21st.dev while remaining independent of any one provider.

Four extension types:
- **Skill:** reusable instructions and resources for a repeatable task.
- **Plugin:** installable package that may bundle skills, agents, commands, hooks, MCP servers and UI contributions.
- **Agent:** specialist configuration defining role, tools, provider preferences, limits and output contract.
- **MCP server/tool:** live external capability that reads data or performs an action.

A skill does not automatically grant tools. A plugin does not automatically become trusted. A discovered MCP server does not automatically become executable.

## 2. Skill format

Preferred portable format:

~~~text
skill-name/
  SKILL.md
  references/
  scripts/
  templates/
  assets/
~~~

Example:

~~~yaml
---
name: 3d-website-builder
description: Plan and implement interactive 3D websites using the current project's framework and design system.
user-invocable: true
metadata:
  version: "1.0.0"
  author: "AURIX"
---
~~~

The Markdown body contains task instructions, examples, workflows and limitations.

Required fields:
- unique name;
- clear description and trigger conditions.

Optional metadata:
- version;
- author;
- licence;
- compatibility;
- allowed-tools (informational until checked against AURIX policy);
- user-invocable;
- project path/glob restrictions;
- disable-model-invocation;
- required capabilities.

Progressive loading:
1. At session start, load skill names/descriptions and safe metadata only.
2. When selected, load SKILL.md.
3. Load reference documents only as required.
4. Execute scripts only through the tool broker and permission engine.
5. Report which skill materially influenced the task.

## 3. Plugin package structure

~~~text
plugin-name/
  plugin.json
  README.md
  LICENSE
  skills/
    skill-name/SKILL.md
  agents/
    researcher.md
  commands/
    command-name.md
  hooks/
    hooks.json
  mcp.json
  assets/
  references/
~~~

Illustrative manifest:

~~~json
{
  "schemaVersion": 1,
  "id": "aurix.3d-web-studio",
  "name": "3D Web Studio",
  "version": "1.0.0",
  "description": "Create and verify interactive 3D web experiences.",
  "license": "MIT",
  "components": {
    "skills": ["skills/3d-website-builder/SKILL.md"],
    "agents": ["agents/3d-engineer.md"],
    "commands": ["commands/create-scene.md"],
    "hooks": [],
    "mcpServers": []
  },
  "permissions": {
    "filesystem": ["project-read", "project-write"],
    "network": [],
    "shell": ["allowlisted-build-and-test"],
    "externalActions": []
  }
}
~~~

The implementation must define and validate a JSON Schema before loading packages.

## 4. Marketplace

Workflow:
1. Add a Git or local marketplace source.
2. Fetch a read-only catalogue.
3. Display author, description, version, licence, source and component list.
4. Inspect files and scripts.
5. Resolve dependencies and capability requirements.
6. Calculate hashes and pin exact refs.
7. Present requested permissions.
8. User approves installation.
9. Install into an isolated plugin directory.
10. Enable plugin components individually.
11. Monitor, disable, uninstall or roll back.

Do not install plugins merely because they appear in search results.

## 5. Agent specification

Illustrative agent:

~~~yaml
name: reviewer
description: Review changes for correctness, security and maintainability.
provider_preference:
  - local-coding-agent
mode: read-only
tools:
  allow:
    - workspace.read
    - workspace.search
    - git.diff
    - test.read_results
  deny:
    - workspace.write
    - shell.mutate
budget:
  max_turns: 12
  max_runtime_minutes: 10
output:
  format: review-findings
~~~

Agent permissions must be enforced by the host, not trusted because a prompt says so.

## 6. Hooks

Lifecycle event categories:
- session start/end;
- before/after user prompt;
- before/after tool call;
- tool failure;
- before/after file edit;
- subagent start/stop;
- before compaction;
- task completion/cancellation.

Hook types:
- local process;
- HTTP callback to an explicitly configured endpoint.

Safety:
- default-deny for untrusted project/plugin hooks;
- show hook source and requested permissions;
- short timeout and output limits;
- prevent recursive hook loops;
- redact secrets;
- record exit status;
- explicit deny/block event for pre-action gates;
- hooks cannot silently expand agent permissions.

## 7. MCP manager

Features:
- add local stdio or supported remote HTTP MCP servers;
- configure environment variables through protected secret references;
- connect/disconnect;
- list tools and schemas;
- test health;
- set per-tool approval policy;
- set timeouts and output-size caps;
- disable/remove servers;
- show server provenance and last activity.

The broker validates schema, project scope and approval rules before execution.

## 8. Compatibility adapters

AURIX should parse/import documented formats:
- Claude Code: CLAUDE.md, .claude/rules, skills, plugin manifests, .mcp.json and compatible hooks.
- Grok Build: AGENTS.md, .grok/skills, plugin marketplace manifests, MCP config and documented hooks.
- Agent Skills standard: SKILL.md folders.
- OpenAI/Codex: documented skills/capability directories and MCP configuration.
- Higgsfield: public skills repository and official CLI workflows.
- 21st.dev: public skill pack and MCP/CLI workflows.
- REA: official rea-agents setup and investigation skill.

Compatibility means parsing and translating supported declarations; it does not mean every vendor plugin can run safely unchanged.

## 9. Built-in AURIX skills

1. General research and source verification.
2. Codebase exploration.
3. Plan-and-build software task.
4. Debug and repair.
5. Test and review.
6. 3D website design/build.
7. UI design exploration and critique.
8. Image generation brief.
9. Cinematic video planning.
10. Faceless explainer production.
11. Brand kit creation.
12. Document creation and analysis.
13. Browser QA.
14. REA feature investigation.
15. Project handoff and summarisation.

## 10. Versioning and security

- Pin plugin versions and source commit SHAs.
- Preserve upstream licences and notices.
- Validate manifests and schemas.
- Scan scripts and dependencies.
- Store install receipts and content hashes.
- Re-review changed permissions on updates.
- Never auto-enable newly introduced hooks or MCP servers.
- Support uninstall and rollback.
- Maintain an audit trail.
