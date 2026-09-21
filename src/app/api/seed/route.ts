import { NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export const dynamic = 'force-dynamic'

// POST /api/seed — runs the seed script (idempotent: creates FreeLLMAPI
// default provider + Yellow Top sample project if they don't already exist).
// Called automatically by the app on first launch.
export async function POST() {
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'seed.ts')
    const { stdout, stderr } = await execFileAsync('bun', ['run', scriptPath], {
      timeout: 30000,
      cwd: process.cwd(),
    })
    return NextResponse.json({
      ok: true,
      stdout: stdout.split('\n').filter((l) => l.startsWith('[seed]')).join('\n'),
      stderr: stderr.split('\n').filter((l) => l.startsWith('[seed]')).join('\n'),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
