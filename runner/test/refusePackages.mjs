// Loaded with `node --import` in tests: any package that a module loads is an
// error, so a test proves that a robot step runs before `npm ci`. Packages
// named in QE_ALLOWED_PACKAGES (comma-separated) are allowed.
import { registerHooks } from 'node:module';

const allowed = new Set((process.env.QE_ALLOWED_PACKAGES ?? '').split(',').filter(Boolean));

registerHooks({
  resolve(specifier, context, nextResolve) {
    const local = specifier.startsWith('node:') || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:');
    if (!local && !allowed.has(specifier.split('/')[0])) {
      throw new Error(`refused package: ${specifier}`);
    }
    return nextResolve(specifier, context);
  },
});
