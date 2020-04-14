import tmp from "tmp"
import { spawnSync, execSync } from "child_process"
import chalk from "kleur"
import { Octokit } from "@octokit/rest"

interface Repo {
  owner: string
  repo: string
}

export async function updateRepo(_args: {
  repo: Repo
  branch: string
  targetBranch?: string
  title: string
  body: string
  commitMessage?: string
  assignees?: string[]
  labels?: string[]
  update: (dir: string) => void
}) {
  const args = {
    targetBranch: "master",
    commitMessage: _args.title,
    assignees: [],
    labels: [],
    ..._args,
  }
  log.task(`Updating ${args.repo.owner}/${args.repo.repo}`)

  const dirHandle = tmp.dirSync({ unsafeCleanup: true })
  const dir = dirHandle.name

  try {
    await _updateRepo({ ...args, dir })
    log.success(`${args.repo.owner}/${args.repo.repo} is up to date!`)
  } finally {
    dirHandle.removeCallback()
  }
}

async function _updateRepo({
  repo,
  branch,
  update,
  title,
  body,
  commitMessage,
  assignees,
  labels,
  dir,
}: {
  repo: Repo
  branch: string
  targetBranch: string
  title: string
  body: string
  commitMessage: string
  assignees: string[]
  labels: string[]
  update: (dir: string) => void
  dir: string
}) {
  log.step("Cloning repo")
  clone({ repo, dir })
  await forceCheckout({ branch, dir, repo })

  update(dir)

  log.step("Checking for changes")
  if (!hasChanges(dir)) {
    log.substep(`Repo remains unchanged so no further action required :)`)
    return
  }

  log.step("Pushing changes")
  push({ dir, branch, commitMessage })

  if (await pullRequestAlreadyExists({ repo, branch })) {
    log.step(
      `PR for branch ${branch} already exists so there's nothing left to do :)`,
    )
    return
  }

  log.step("Creating and merging pull request")
  await createAndMergePullRequest({
    repo,
    branch,
    title,
    assignees,
    labels,
    body,
  })
}

function clone({ repo, dir }: { repo: Repo; dir: string }) {
  exec(
    `git clone https://${process.env.GH_TOKEN}@github.com/${repo.owner}/${repo.repo} ${dir}`,
    process.cwd(),
  )
}

function push({
  dir,
  branch,
  commitMessage,
}: {
  dir: string
  branch: string
  commitMessage: string
}) {
  exec(`git add -A`, dir)
  const result = spawnSync("git", ["commit", "-m", commitMessage], { cwd: dir })
  if (result.status !== 0) {
    throw new Error(`Failed comitting: ${result.output.toString()}`)
  }
  exec(`git push origin ${branch} --force --no-verify`, dir)
}

function exec(command: string, cwd: string) {
  log.substep(command)
  const task = spawnSync(command, { shell: true, cwd })
  if (task.status != 0) {
    throw new ShellError(command, task.stderr.toString())
  }
  return task.stdout.toString()
}

class ShellError extends Error {
  constructor(public command: string, public output: string) {
    super(
      `Failed running command '${command}' \n\n${prefixLines(output, "  ")}`,
    )
    this.command = command
    this.output = output
  }
}

async function pullRequestAlreadyExists({
  branch,
  repo,
}: {
  branch: string
  repo: Repo
}) {
  const octokit = new Octokit({
    auth: process.env.GH_TOKEN,
  })
  const res = await octokit.pulls.list({
    ...repo,
    state: "open",
  })
  return res.data.some((pr) => pr.head.ref === branch)
}

async function createAndMergePullRequest({
  repo,
  branch,
  title,
  assignees,
  labels,
  body,
}: {
  repo: Repo
  branch: string
  title: string
  assignees: string[]
  labels: string[]
  body: string
}) {
  const octokit = new Octokit({
    auth: process.env.GH_TOKEN,
  })
  log.substep("Creating initial PR")
  const res = await octokit.pulls.create({
    ...repo,
    head: branch,
    base: "master",
    title: title,
    body,
  })
  if (assignees.length) {
    log.substep(`Adding assignees: [${assignees.join(", ")}]`)
    await octokit.issues.addAssignees({
      ...repo,
      issue_number: res.data.number,
      assignees,
    })
  }
  if (labels.length) {
    log.substep(`Adding labels: ${JSON.stringify(labels)}`)
    await octokit.issues.addLabels({
      ...repo,
      issue_number: res.data.number,
      labels,
    })
  }
}

/**
 * Puts prefix at the start of every line of text
 */
function prefixLines(text: string, prefix: string) {
  return prefix + text.split("\n").join(`\n${prefix}`)
}

const log = {
  /**
   * @param {string} str
   */
  task: (str: string) =>
    console.log(chalk.green("\n::"), chalk.bold(str), chalk.green("::\n")),
  /**
   * @param {string} str
   */
  step: (str: string) => console.log(chalk.cyan(`•`), str),
  /**
   * @param {string} str
   */
  substep: (str: string) => console.log(chalk.grey("  " + str)),
  /**
   * @param {string} str
   */
  success: (str: string) =>
    console.log("\n" + chalk.green(`✔`), chalk.bold(str)),
}

/**
 * Checks out the branch, creating it if it doesn't already exist
 */
async function forceCheckout({
  branch,
  dir,
  repo,
}: {
  branch: string
  dir: string
  repo: Repo
}) {
  try {
    exec(`git checkout ${branch}`, dir)

    // if there isn't a current PR then reset to latest master
    if (!(await pullRequestAlreadyExists({ branch, repo }))) {
      exec(`git reset master --hard`, dir)
    }
  } catch (_) {
    exec(`git checkout -b ${branch}`, dir)
  }
}

function hasChanges(dir: string) {
  return exec("git status --porcelain", dir) !== ""
}
