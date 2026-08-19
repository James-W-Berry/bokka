// Smoke test: run the real GitHub sync against a public repo from node.
// Usage: npx tsx test/sync-smoke.ts [owner/repo]
import { syncRepo, pointsFromLabels } from '../src/github.ts'

const checks: Array<[string[], number]> = [
  [['sp:3', 'bug'], 3],
  [['5 pts'], 5],
  [['size/8'], 8],
  [['Points: 13'], 13],
  [['bug', 'help wanted'], 2],
  [['2'], 2],
]
for (const [labels, want] of checks) {
  const got = pointsFromLabels(labels, 2)
  if (got !== want) throw new Error(`pointsFromLabels(${labels}) = ${got}, want ${want}`)
}
console.log('pointsFromLabels: all cases pass')

const repo = process.argv[2] ?? 'microsoft/vscode'
const result = await syncRepo({ repo }, 3, 14)
console.log(`\n${result.repo} — ${result.members.length} porters`)
console.log(`open: ${result.totalOpenPoints} pts, delivered (14d): ${result.totalDeliveredPoints} pts\n`)
for (const m of result.members.slice(0, 8)) {
  console.log(
    `  ${m.login.padEnd(22)} open ${String(m.openPoints).padStart(4)} pts / ${m.openIssues} issues · delivered ${m.deliveredPoints} pts`,
  )
}
