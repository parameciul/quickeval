import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// A page's first render in a file loads its modules: with the whole suite
// running at once it can take about a second, the default wait of findBy and
// waitFor. Three seconds keeps those waits from failing under load.
configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
});
