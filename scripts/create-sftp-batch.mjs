import { readdirSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { posix } from "node:path";

const [
  ,
  ,
  sourceArgument,
  remoteArgument,
  outputArgument,
  templateSourceArgument,
  templateRemoteArgument,
] = process.argv;

if (!sourceArgument || !remoteArgument || !outputArgument) {
  console.error(
    "Uso: node scripts/create-sftp-batch.mjs <directory-locale> <directory-remota> <file-batch> [template-locale template-remoto]",
  );
  process.exit(1);
}

const sourceRoot = resolve(sourceArgument);
const remoteRoot = posix.normalize(remoteArgument);
const outputFile = resolve(outputArgument);
const templateSource = templateSourceArgument
  ? resolve(templateSourceArgument)
  : undefined;
const templateRemote = templateRemoteArgument
  ? posix.normalize(templateRemoteArgument)
  : undefined;

if (!statSync(sourceRoot).isDirectory()) {
  throw new Error(`La directory di deploy non esiste: ${sourceRoot}`);
}
if (!isAbsolute(remoteRoot) || remoteRoot === "/") {
  throw new Error("La directory remota deve essere un percorso assoluto e non può essere /.");
}
if (remoteRoot.includes("\n") || remoteRoot.includes("\r")) {
  throw new Error("La directory remota contiene caratteri non validi.");
}
if (Boolean(templateSource) !== Boolean(templateRemote)) {
  throw new Error("Il template richiede sia il percorso locale sia quello remoto.");
}
if (templateSource && !statSync(templateSource).isFile()) {
  throw new Error(`Il template di configurazione non esiste: ${templateSource}`);
}
if (
  templateRemote &&
  (!isAbsolute(templateRemote) ||
    templateRemote === "/" ||
    templateRemote.includes("\n") ||
    templateRemote.includes("\r"))
) {
  throw new Error("Il percorso remoto del template non è valido.");
}

function quote(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function walk(directory, directories = [], files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Link simbolico non supportato nel pacchetto: ${absolutePath}`);
    }
    if (entry.isDirectory()) {
      directories.push(absolutePath);
      walk(absolutePath, directories, files);
    } else if (entry.isFile()) {
      if (
        entry.name === ".env" ||
        entry.name.startsWith(".env.") ||
        /\.sqlite(?:-wal|-shm)?$/i.test(entry.name)
      ) {
        throw new Error(`File riservato escluso dal deploy: ${absolutePath}`);
      }
      files.push(absolutePath);
    }
  }
  return { directories, files };
}

function remotePath(localPath) {
  const path = relative(sourceRoot, localPath).split(sep).join("/");
  return path ? posix.join(remoteRoot, path) : remoteRoot;
}

const { directories, files } = walk(sourceRoot);
const remoteParts = remoteRoot.split("/").filter(Boolean);
const remoteParents = remoteParts.map(
  (_, index) => `/${remoteParts.slice(0, index + 1).join("/")}`,
);
if (templateRemote) {
  const templateDirectory = posix.dirname(templateRemote);
  const templateParts = templateDirectory.split("/").filter(Boolean);
  for (const directory of templateParts.map(
    (_, index) => `/${templateParts.slice(0, index + 1).join("/")}`,
  )) {
    if (!remoteParents.includes(directory)) remoteParents.push(directory);
  }
}

// I file di avvio sono caricati per ultimi, riducendo la finestra in cui un
// eventuale processo riavviato potrebbe vedere un pacchetto incompleto.
const lastFiles = new Set(["package.json", "server.js"]);
files.sort((left, right) => {
  const leftLast = lastFiles.has(relative(sourceRoot, left));
  const rightLast = lastFiles.has(relative(sourceRoot, right));
  if (leftLast !== rightLast) return leftLast ? 1 : -1;
  return left.localeCompare(right);
});

const commands = [
  ...remoteParents.map((directory) => `-mkdir ${quote(directory)}`),
  ...directories
    .sort((left, right) => left.length - right.length || left.localeCompare(right))
    .map((directory) => `-mkdir ${quote(remotePath(directory))}`),
  ...(templateSource && templateRemote
    ? [`put ${quote(templateSource)} ${quote(templateRemote)}`]
    : []),
  ...files.map((file) => `put ${quote(file)} ${quote(remotePath(file))}`),
  "bye",
  "",
];

writeFileSync(outputFile, commands.join("\n"), { mode: 0o600 });
console.log(
  `Batch SFTP creato: ${files.length} file applicativi${templateSource ? " e 1 template" : ""}, ${directories.length} directory verso ${remoteRoot}`,
);
