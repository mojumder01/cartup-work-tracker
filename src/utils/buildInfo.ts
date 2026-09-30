import { fmtDate } from './format';

export const BUILD = __BUILD_INFO__;

/** "v1.1.0 · build #5 · 617c5f0" */
export const buildLabel = () => [`v${BUILD.version}`, BUILD.run && `build #${BUILD.run}`, BUILD.commit].filter(Boolean).join(' · ');

export const builtAtLabel = () => fmtDate(Date.parse(BUILD.builtAt), true);
