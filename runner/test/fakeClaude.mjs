// A stand-in for `claude` in tests. It prints a result in the shape of Claude
// Code's JSON output; its structured_output tells how it was started.
console.log(
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    structured_output: { args: process.argv.slice(2), env: process.env, cwd: process.cwd() },
    modelUsage: { 'claude-fake-1': { outputTokens: 10 } },
  }),
);
