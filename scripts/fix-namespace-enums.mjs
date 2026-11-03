// Post-build pass over the emitted declarations: gives the version namespaces
// their enum values back. The runtime carries `v28_0_0.Aclmode`, but for
// `export * as vNN` rollup-plugin-dts (6.5.1 too) declares a local alias per
// member, `type index$7_Aclmode = Aclmode;`, and exports it as a type only, so
// `v28_0_0.Aclmode.Passthrough` does not compile.
//
// The repair adds `declare const index$7_Aclmode: typeof Aclmode;` beside each
// alias whose target is a `declare const`, and drops `type` from that name in
// the namespace's export list. Nothing else changes. `check-dist.mjs` compiles
// a read of every runtime enum, so a change in the bundler's output fails CI.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const files = readdirSync('dist', { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.d\.c?ts$/.test(file))
  .map((file) => `dist/${file}`);

/**
 * @param {string} source
 * @returns {{ source: string, fixed: number }}
 */
function fixNamespaceEnums(source) {
  const consts = new Set(
    [...source.matchAll(/^declare const ([\w$]+):/gm)].map((match) => match[1])
  );
  if (consts.size === 0) {
    return { source, fixed: 0 };
  }

  const values = new Set(consts);
  let fixed = 0;
  let out = source.replace(
    /^type ([\w$]+) = ([\w$]+);$/gm,
    (line, alias, target) => {
      // Skipped when already repaired, so a second run changes nothing.
      if (!consts.has(target) || consts.has(alias)) {
        return line;
      }
      values.add(alias);
      fixed += 1;
      return `declare const ${alias}: typeof ${target};\n${line}`;
    }
  );

  // The export list of each `declare namespace` block. rollup-plugin-dts writes
  // either `export type { a as A, … }` (every member a type) or
  // `export { type a as A, B$1 as B, … }`. Both are rewritten into the second
  // form, with `type` on every member that is not a value.
  out = out.replace(
    /^(declare namespace [\w$]+ \{\n {2})export (type )?\{ ([^}]*) \};$/gm,
    (_block, head, allTypes, list) => {
      const members = list.split(', ').map((member) => {
        const bare = member.replace(/^type /, '');
        const local = bare.split(' as ')[0];
        const wasType = Boolean(allTypes) || member.startsWith('type ');
        return values.has(local) ? bare : wasType ? `type ${bare}` : bare;
      });
      return `${head}export { ${members.join(', ')} };`;
    }
  );

  return { source: out, fixed };
}

let total = 0;
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const { source, fixed } = fixNamespaceEnums(before);
  if (source !== before) {
    writeFileSync(file, source);
  }
  total += fixed;
}
console.log(`✓ restored ${total} enum value(s) in the version namespaces' declarations`);
