## Git commits

Every commit you create must include a `Co-Authored-By` trailer identifying the agent that produced it. This makes AI-assisted changes auditable and ensures correct attribution in code review tools.

Format:
- Write the commit subject and body normally.
- Leave one blank line after the body.
- Add a `Co-Authored-By` trailer on its own line, using the identity of the agent doing the work:

      Co-Authored-By: <Agent Name> <agent-email@example.com>

Use the identity that corresponds to you:
- Claude Code / Claude → `Claude <noreply@anthropic.com>`
- OpenAI Codex / ChatGPT → `Codex <noreply@openai.com>`
- Cursor → `Cursor Agent <noreply@cursor.sh>`
- GitHub Copilot → `Copilot <noreply@github.com>`
- Any other agent → `<Product Name> <noreply@<vendor-domain>>`

If you are operating on behalf of a specific human (pair-programming, executing a developer's task), keep that human as the commit author and add yourself via `Co-Authored-By`. Do not replace the human author.