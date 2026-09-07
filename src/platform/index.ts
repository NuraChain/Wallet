export type { Platform, PlatformExporter, PlatformStorage } from './type';

// The alias decides which target's implementation this resolves to. Importing the module rather
// than the file is what keeps one build from pulling in the other's dependencies.
// oxlint-disable-next-line import/no-unresolved
export { platform } from '#platform-impl';
