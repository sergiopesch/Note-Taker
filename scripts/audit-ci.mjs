import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const packageManager = packageJson.packageManager?.startsWith('pnpm@') ? 'pnpm' : 'npm'
const result = spawnSync(packageManager, ['audit', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})

if (result.error) {
  console.error(`Unable to run ${packageManager} audit:`, result.error.message)
  process.exit(1)
}

let report
try {
  report = JSON.parse(result.stdout)
} catch {
  console.error(result.stderr || result.stdout || 'Dependency audit returned invalid JSON.')
  process.exit(1)
}

if (report.error) {
  const message =
    report.error.summary ??
    report.error.message ??
    JSON.stringify(report.error)
  console.error(`Dependency audit failed: ${message}`)
  process.exit(1)
}

const severityRank = { low: 1, moderate: 2, high: 3, critical: 4 }
const findings = new Map()

const addFinding = ({ id, severity, title }) => {
  if (!id || (severityRank[severity] ?? 0) < severityRank.high) return
  findings.set(id, { id, severity, title })
}

if (report.vulnerabilities) {
  for (const vulnerability of Object.values(report.vulnerabilities)) {
    for (const advisory of vulnerability.via ?? []) {
      if (typeof advisory === 'string') continue
      const id = advisory.url?.split('/').pop()
      addFinding({
        id,
        severity: advisory.severity ?? vulnerability.severity,
        title: advisory.title ?? advisory.name,
      })
    }
  }
} else {
  for (const advisory of Object.values(report.advisories ?? {})) {
    addFinding({
      id: advisory.github_advisory_id,
      severity: advisory.severity,
      title: advisory.title,
    })
  }
}

const exceptions = packageJson.auditExceptions ?? {}
const today = new Date()
const accepted = []
const unexpected = []

for (const finding of findings.values()) {
  const exception = exceptions[finding.id]
  const expiresAt = exception?.expires
    ? new Date(`${exception.expires}T00:00:00Z`)
    : null

  if (!exception || !expiresAt || Number.isNaN(expiresAt.valueOf()) || expiresAt <= today) {
    unexpected.push({
      ...finding,
      reason: exception ? `exception expired on ${exception.expires}` : 'no approved exception',
    })
    continue
  }

  accepted.push({ ...finding, ...exception })
}

if (accepted.length > 0) {
  console.warn('Temporary dependency-audit exceptions:')
  for (const finding of accepted) {
    console.warn(`- ${finding.id} (expires ${finding.expires}): ${finding.reason}`)
  }
}

if (unexpected.length > 0) {
  console.error('Unexpected high or critical dependency advisories:')
  for (const finding of unexpected) {
    console.error(`- ${finding.id}: ${finding.title} (${finding.reason})`)
  }
  process.exit(1)
}

console.log('Dependency audit passed: no unexpected high or critical advisories.')
