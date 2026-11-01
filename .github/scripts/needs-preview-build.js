// Which changed paths oblige a PR to carry an installable build of its own head.
//
// Lives in its own file, rather than inline in the workflow, so the list can be
// exercised against a real PR's file list without queueing a workflow run:
//
//   node -e "console.log(require('./.github/scripts/needs-preview-build.js')
//            .filesRequiringBuild(['app/project/[id].tsx','README.md']))"
//
// Rule of thumb for adding a path here: can a person SEE this change, or does
// it change what the installed binary is? Dependency bumps are not on the list
// — a devDependency cannot reach a screen, and making every bump cost a 15 min
// EAS build is how a gate gets routed around. A native dependency change still
// needs a build; that call stays with the author.
const NEEDS_BUILD = [
  /^app\//,
  /^components\//,
  /^assets\//,
  /^global\.css$/,
  /^tailwind\.config\.js$/,
  /^app\.json$/,
  /^app\.config\.ts$/,
  /^babel\.config\.js$/,
  /^metro\.config\.js$/,
  /^eas\.json$/,
];

/**
 * @param {string[]} filenames paths as GitHub reports them, repo-relative
 * @returns {string[]} the subset that requires a build of the head
 */
function filesRequiringBuild(filenames) {
  return filenames.filter((name) => NEEDS_BUILD.some((re) => re.test(name)));
}

module.exports = { NEEDS_BUILD, filesRequiringBuild };
