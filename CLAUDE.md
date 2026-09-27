## Long tasks get a live dashboard

For any task with more than 5 steps, or that should take longer than 30 minutes:

1. Before starting, call the `dashboard-builder` subagent in the background with the task
   name, goal, planned steps, and any open questions. Keep working while it builds.
   - If it replies that it needs style preferences, ask me (dark/light, dense/airy,
     one accent color), then call it again with my answers.
2. After every step, update `.dashboard/state.js` yourself: step status, `updatedAt`,
   new deliverables, anything stuck. Take every timestamp from the real clock
   (`date -Iseconds`); never guess.
3. When you need a decision from me, add it to `questions` with the default you'll use,
   mention it in chat, and keep going with the default.
   - Exception: never default on anything destructive, hard to undo, or outward-facing
     (deleting data, force-pushing, publishing, spending money, messaging people).
     Mark it as waiting and work on something else until I answer.
4. Call `dashboard-builder` again only if the plan changes shape. Small updates go
   straight into `state.js`.
