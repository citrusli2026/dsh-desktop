import { spawn } from 'node:child_process'

export const FEISHU_CLI_INSTALL_COMMAND = Object.freeze({
  command: 'npx',
  args: ['--yes', '@larksuite/cli@latest', 'install', '--lang', 'zh'],
})

function commandText() {
  return [FEISHU_CLI_INSTALL_COMMAND.command, ...FEISHU_CLI_INSTALL_COMMAND.args].join(' ')
}

function runSetup() {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'npx.cmd' : FEISHU_CLI_INSTALL_COMMAND.command
    const child = spawn(command, FEISHU_CLI_INSTALL_COMMAND.args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Feishu CLI setup stopped by ${signal}`))
        return
      }
      if (code !== 0) {
        reject(new Error(`Feishu CLI setup exited with code ${String(code)}`))
        return
      }
      resolve()
    })
  })
}

if (process.argv.includes('--dry-run')) {
  console.log(commandText())
} else {
  try {
    await runSetup()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
