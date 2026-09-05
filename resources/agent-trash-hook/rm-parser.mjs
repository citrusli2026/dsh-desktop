/**
 * Parse a shell command and decide how the agent-trash hook treats its file
 * deletions. Pure and dependency-free so both the hook process and the test
 * suite import the same behavior.
 *
 * Outcomes:
 *   { action: 'allow' }                       — no deletion detected
 *   { action: 'move', paths: [...] }          — confident parse: move into trash
 *   { action: 'block', reason }               — ambiguous or unsafe: block the
 *                                               tool call (hook exits 2) and
 *                                               show `reason` to the model
 * @module agent-trash-hook/rm-parser
 */
import { resolve as resolvePath } from 'node:path'

/** Path segments that are never worth keeping or intercepting. */
const EXEMPT_SEGMENTS = new Set(['node_modules', '.git'])

const DELETE_COMMANDS = new Set(['rm', 'rmdir', 'unlink'])
/** `git rm`, `npm rm`… — here `rm` is a subcommand, not the deletion binary. */
const MULTI_COMMANDS = new Set(['git', 'npm', 'pnpm', 'yarn', 'bun', 'docker', 'kubectl', 'brew', 'apt', 'apt-get', 'pip', 'pip3', 'cargo', 'go'])
const POWERSHELL_DELETE = /^(remove-item|ri|del|erase|rd)$/i

/**
 * Extract deletable targets from one shell command string.
 * @returns {{ action: 'allow' } | { action: 'move', paths: string[] } | { action: 'block', reason: string }}
 */
export function parseDeletionCommand(command, projectDir) {
  const tokens = tokenize(command)
  if (tokens.length === 0) return { action: 'allow' }
  const paths = []
  let index = 0
  let previous = ''
  while (index < tokens.length) {
    const token = tokens[index]
    const separator = token.type === 'separator'
    if (separator) { index += 1; previous = ''; continue }
    if (token.type !== 'word') { index += 1; continue }
    const word = token.value
    const isPosix = DELETE_COMMANDS.has(word) && !MULTI_COMMANDS.has(previous)
    const isPwsh = POWERSHELL_DELETE.test(word) && !MULTI_COMMANDS.has(previous)
    previous = word
    if (!isPosix && !isPwsh) { index += 1; continue }
    const parsed = parseDeleteInvocation(tokens, index, isPwsh)
    if (parsed.action === 'allow') { index = parsed.nextIndex; continue }
    if (parsed.blocked) return { action: 'block', reason: parsed.reason }
    paths.push(...parsed.paths)
    index = parsed.nextIndex
  }
  if (paths.length === 0) return { action: 'allow' }
  const exempt = paths.filter(path => isExempt(path))
  if (exempt.length > 0) {
    return { action: 'block', reason: `refusing to delete dependency or VCS paths (${exempt.join(', ')}); they are exempt from the desktop trash` }
  }
  const outside = projectDir === undefined ? [] : paths.filter(path => !isInside(path, projectDir) && !isInside(path, dshHomePath()))
  if (outside.length > 0) {
    return { action: 'block', reason: `refusing to delete outside the workspace (${outside.join(', ')}); move such files explicitly with mv if the task really needs it` }
  }
  return { action: 'move', paths }
}

/** The trash intercepts deletions under the agent's workspace and DSH_HOME. */
export function dshHomePath() {
  return process.env.DSH_HOME ?? ''
}

function isExempt(path) {
  return path.split(/[/\\]/).some(segment => EXEMPT_SEGMENTS.has(segment))
}

function isInside(path, root) {
  if (root === '') return true
  const normalizedPath = path.replaceAll('\\', '/')
  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/+$/, '')
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)
}

/** Split a command into words and separators, respecting quotes and escapes. */
export function tokenize(command) {
  const tokens = []
  let current = ''
  let quoted = false
  let hasContent = false
  let escaped = false
  const pushWord = () => {
    if (hasContent) tokens.push({ type: 'word', value: current })
    current = ''
    hasContent = false
  }
  for (const char of command) {
    if (escaped) { current += char; hasContent = true; escaped = false; continue }
    if (char === '\\' && !quoted) { escaped = true; continue }
    if (char === '"' || char === "'") {
      if (quoted === char) { quoted = false; continue }
      if (quoted) { current += char; continue }
      quoted = char
      hasContent = true
      continue
    }
    if (!quoted && /\s/.test(char)) { pushWord(); continue }
    if (!quoted && ';|&'.includes(char)) { pushWord(); tokens.push({ type: 'separator' }); continue }
    current += char
    hasContent = true
  }
  if (quoted) return [{ type: 'separator' }]
  pushWord()
  return tokens
}

/**
 * Consume one rm/rmdir/unlink/Remove-Item invocation starting at `start`.
 * The known-flag sets are deliberately tiny; anything else blocks (fail
 * closed) because an unparsable flag can hide extra targets or semantics
 * (-exec, -interactive prompts, -Filter globs…).
 */
function parseDeleteInvocation(tokens, start, isPwsh) {
  const paths = []
  let flagsDone = false
  let index = start + 1
  while (index < tokens.length && tokens[index].type === 'word') {
    const value = tokens[index].value
    if (value === '--') { flagsDone = true; index += 1; continue }
    if (!flagsDone && value.startsWith('-') && value.length > 1) {
      if (isPwsh) {
        if (!/^-(recurse|force|literalpath|confirm)$/i.test(value.replace(/^\w+:/, '-'))) {
          return { blocked: true, reason: `unrecognized Remove-Item option "${value}"` }
        }
      } else if (!/^-[rRvfd]+$/.test(value)) {
        return { blocked: true, reason: `unrecognized rm option "${value}"` }
      }
      index += 1
      continue
    }
    paths.push(value)
    index += 1
  }
  // No targets means no deletion can happen (an upstream usage error at
  // worst) — allowing is the honest outcome.
  if (paths.length === 0) return { action: 'allow', nextIndex: index }
  // Relative targets are the agent's cwd (= the session workspace), so
  // resolve before the boundary checks and hand back absolute paths.
  return { blocked: false, paths: paths.map(path => resolvePath(path)), nextIndex: index }
}
