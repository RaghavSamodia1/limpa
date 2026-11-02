# Workflow and traps
- Branch: `claude/upbeat-gates-mkbevl`, PRs squash-merged into `main` after Raghav says "merge it". Open PRs as **draft**, flip to ready, then merge.
- After a squash merge, restart the branch from main: `git fetch origin main && git checkout -B claude/upbeat-gates-mkbevl origin/main`. Force-push is denied, so push with `git merge -s ours origin/<branch>` first to make a fast-forward. **That makes the next push replace the PR content with your tree: make sure unmerged work is in your tree.**
- Commit trailers: Co-Authored-By and Claude-Session lines (see session reminder). PR bodies end with the generated-with line.
- No `gh` CLI: use GitHub MCP tools.
- Never `sleep` in Bash waiting; use `until` loops with run_in_background, and never pipe long test output through `tail` (buffers).
- `pkill -f name` kills your own shell if the command line contains the name. Use a script file.
- Screenshots: Playwright is preinstalled; scripts used `/…/scratchpad/shot.js` (modes mid, draw, big, watch, menu). Recreate if lost.
- Always bump `sw.js` CACHE and tell Raghav to reload once after a deploy.
- Run `node test/engine-smoke.js 20` and `node test/online-rooms.js` (about 3 min, run in background) before a PR.
