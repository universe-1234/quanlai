// Carry explicit isolation settings into scheduled processes; normal installs use no overrides.
export const runtimeOptions = ['QUANLAI_DATA_DIR', 'QUANLAI_TASK_NAME', 'QUANLAI_SKILL_ROOT', 'QUANLAI_PYTHON'];
for (const key of runtimeOptions) {
  const prefix = `--${key.toLowerCase().replaceAll('_', '-')}=`;
  const argument = process.argv.find(arg => arg.startsWith(prefix));
  if (argument) process.env[key] = argument.slice(prefix.length);
}
export function runtimeArguments() {
  return runtimeOptions.filter(key => process.env[key]).map(key => `"--${key.toLowerCase().replaceAll('_', '-')}=${process.env[key]}"`).join(' ');
}
